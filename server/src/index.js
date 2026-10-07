import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "http";
import fs from "fs";
import path from "path";
import { Server } from "socket.io";
import pg from "pg";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import webpush from "web-push";
import { sexualCheck, mediaCheck } from "./moderation.js";
import { mountSocial } from "./social.js";
import { createClient } from "redis";
import { createAdapter } from "@socket.io/redis-adapter";
import {
  clampPrefs,
  E164,
  cleanPhone,
  moderationDecision,
  ephemeralAllowed,
  requestDecision,
  mediaUnlocked,
  canEdit,
  canDelete,
} from "./rules.js";
import crypto from "crypto";
import { sendEmail } from "./mail.js";
import { startPhone, checkPhone } from "./sms.js";

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const SECRET = process.env.JWT_SECRET || "dev-secret";
const q = (s, p) => db.query(s, p).then((r) => r.rows);
fs.mkdirSync("private-uploads", { recursive: true }); // never served statically
const upload = multer({ dest: "private-uploads/", limits: { fileSize: 3e6 } });
const app = express();
app.use(cors({ origin: process.env.CLIENT_URL || true }));
app.use(express.json());
// Express 4 does not catch errors from async handlers; without this a single failed query would crash the whole server.
for (const m of ["get", "post", "put", "delete"]) {
  const orig = app[m].bind(app);
  app[m] = (path, ...h) =>
    h.length
      ? orig(
          path,
          ...h.map((fn) =>
            fn.constructor.name === "AsyncFunction"
              ? (req, res, next) => fn(req, res, next).catch(next)
              : fn,
          ),
        )
      : orig(path);
}
process.on("unhandledRejection", (e) =>
  console.error("Unhandled rejection:", e),
);

const PUSH = !!process.env.VAPID_PUBLIC_KEY;
if (PUSH)
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@example.com",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
const online = new Map(); // userId -> open socket count
async function notify(uid, payload) {
  if (!PUSH || (await isOnline(uid))) return;
  const [pref] = await q("select discreet_push from users where id=$1", [uid]); // discreet by default: no names on the lock screen
  if (pref?.discreet_push !== false)
    payload = { title: "New activity", body: "Open the app to see it" }; // only push when the person is not connected
  for (const x of await q("select * from push_subs where user_id=$1", [uid]))
    webpush
      .sendNotification(
        { endpoint: x.endpoint, keys: { p256dh: x.p256dh, auth: x.auth } },
        JSON.stringify(payload),
      )
      .catch((e) => {
        if ([404, 410].includes(e.statusCode))
          q("delete from push_subs where id=$1", [x.id]);
      });
}
const REQUIRE_VERIFICATION = process.env.REQUIRE_VERIFICATION === "true",
  REQUIRE_PHONE = process.env.REQUIRE_PHONE === "true";
const NEW_CHATS_PER_DAY = +process.env.NEW_CHATS_PER_DAY || 10;
const redis = process.env.REDIS_URL
  ? createClient({ url: process.env.REDIS_URL })
  : null; // set REDIS_URL when running several servers
if (redis) {
  redis.on("error", (e) => console.error("redis", e.message));
  await redis.connect();
}
const hits = new Map();
setInterval(() => hits.clear(), 3600e3).unref();
const limit = (max, ms) => async (req, res, next) => {
  const k = "rl:" + req.ip + req.path;
  let n;
  try {
    if (redis) {
      n = await redis.incr(k);
      if (n === 1) await redis.pExpire(k, ms);
    } else {
      const now = Date.now(),
        h = (hits.get(k) || []).filter((t) => now - t < ms);
      h.push(now);
      hits.set(k, h);
      n = h.length;
    }
  } catch (e) {
    console.error("rate limit", e.message);
    return next();
  }
  n > max
    ? res
        .status(429)
        .json({ error: "Too many attempts. Try again in a few minutes." })
    : next();
};
async function setOnline(uid, d) {
  if (!redis) return online.set(uid, Math.max(0, (online.get(uid) || 0) + d));
  const k = "online:" + uid,
    n = await redis.incrBy(k, d);
  n <= 0 ? await redis.del(k) : await redis.expire(k, 86400);
}
const isOnline = async (uid) =>
  redis ? +(await redis.get("online:" + uid)) > 0 : (online.get(uid) || 0) > 0;
const ageOf = (d) => Math.floor((Date.now() - new Date(d)) / 31557600000);
const sign = (uid) => jwt.sign({ uid }, SECRET, { expiresIn: "30d" });
const uidFrom = (t) => {
  try {
    return jwt.verify(t, SECRET).uid;
  } catch {
    return null;
  }
};
const auth = async (req, res, next) => {
  req.uid = uidFrom((req.headers.authorization || "").slice(7));
  const [u] = req.uid
    ? await q("select banned,is_admin from users where id=$1", [req.uid])
    : [];
  if (!u || u.banned)
    return res.status(401).json({ error: "Please log in again" });
  req.admin = u.is_admin;
  next();
};
const adminOnly = (req, res, next) =>
  req.admin ? next() : res.sendStatus(403);

app.post(
  "/api/register",
  limit(10, 15 * 60e3),
  upload.single("selfie"),
  async (req, res) => {
    const b = req.body,
      age = ageOf(b.birthdate);
    if (!req.file)
      return res.status(400).json({ error: "A live selfie is required" });
    if (!(age >= 13))
      return res.status(400).json({ error: "You must be at least 13" });
    // TODO(age-check): run age estimation + liveness on req.file.path (Yoti/Persona/Rekognition) and reject mismatches.
    const [mn, mx] = clampPrefs(age, b.ageMin, b.ageMax);
    try {
      const [u] = await q(
        `insert into users(email,password_hash,name,birthdate,gender,seeking,is_lgbtq,country,age_min,age_max,selfie_path)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
        [
          b.email.toLowerCase(),
          await bcrypt.hash(b.password, 10),
          b.name,
          b.birthdate,
          b.gender,
          JSON.parse(b.seeking || "[]"),
          b.isLgbtq === "true",
          b.country,
          mn,
          mx,
          req.file.path,
        ],
      );
      sendEmailCode(u.id).catch(console.error);
      res.json({ token: sign(u.id) });
    } catch {
      res.status(400).json({ error: "That email is already registered" });
    }
  },
);

app.post("/api/login", limit(10, 15 * 60e3), async (req, res) => {
  const [u] = await q("select id,password_hash from users where email=$1", [
    (req.body.email || "").toLowerCase(),
  ]);
  if (
    !u ||
    u.banned ||
    !(await bcrypt.compare(req.body.password || "", u.password_hash))
  )
    return res.status(400).json({ error: "Wrong email or password" });
  res.json({ token: sign(u.id) });
});

app.get("/api/me", auth, async (req, res) =>
  res.json({
    needsPhone: REQUIRE_PHONE,
    ...(
      await q(
        `select id,name,gender,is_lgbtq,is_admin,email_verified,phone_verified,hide_online,hide_receipts,discreet_push,about,avatar_v av,photo_public,age_min,age_max,date_part('year',age(birthdate))::int age from users where id=$1`,
        [req.uid],
      )
    )[0],
  }),
);

// Two-way match: my age in your range AND yours in mine, gender both ways, same minor/adult group, no blocks.
const MATCH = `select u.id,u.name,u.gender,case when u.photo_public and date_part('year',age(u.birthdate))>=18 then u.avatar_v end av,date_part('year',age(u.birthdate))::int age from users u, users m
  where m.id=$1 and u.id<>m.id and not u.banned and m.email_verified and u.email_verified and (not $4::boolean or (m.phone_verified and u.phone_verified)) and (u.verified or not $3::boolean) and ($2::int is null or u.id=$2)
  and date_part('year',age(u.birthdate)) between m.age_min and m.age_max
  and date_part('year',age(m.birthdate)) between u.age_min and u.age_max
  and u.gender = any(m.seeking) and m.gender = any(u.seeking)
  and (date_part('year',age(u.birthdate))>=18) = (date_part('year',age(m.birthdate))>=18)
  and not exists(select 1 from blocks b where (b.blocker=m.id and b.blocked=u.id) or (b.blocker=u.id and b.blocked=m.id)) limit 50`;
app.get("/api/discover", auth, async (req, res) =>
  res.json(
    await q(MATCH, [req.uid, null, REQUIRE_VERIFICATION, REQUIRE_PHONE]),
  ),
);

app.post("/api/chats/:otherId", auth, async (req, res) => {
  const other = +req.params.otherId;
  if (
    !(await q(MATCH, [req.uid, other, REQUIRE_VERIFICATION, REQUIRE_PHONE]))
      .length
  )
    return res.status(403).json({ error: "Not available" });
  const [a, b] = [Math.min(req.uid, other), Math.max(req.uid, other)];
  let [c] = await q(
    "select id,status,initiator from chats where user_a=$1 and user_b=$2",
    [a, b],
  );
  if (!c) {
    const [{ n }] = await q(
      `select count(*)::int n from chats where initiator=$1 and created_at > now() - interval '1 day'`,
      [req.uid],
    );
    if (n >= NEW_CHATS_PER_DAY)
      return res
        .status(429)
        .json({
          error:
            "The daily limit for new chats has been reached. Try again tomorrow.",
        });
    [c] = await q(
      `insert into chats(user_a,user_b,initiator,status) values($1,$2,$3,'pending') returning id,status,initiator`,
      [a, b, req.uid],
    );
    await q("insert into consents(chat_id,user_id) values($1,$2),($1,$3)", [
      c.id,
      a,
      b,
    ]);
  }
  if (c.status === "declined")
    return res.status(403).json({ error: "Not available" });
  res.json(c);
});

const chatFor = async (id, uid) =>
  (
    await q("select * from chats where id=$1 and (user_a=$2 or user_b=$2)", [
      id,
      uid,
    ])
  )[0];
const otherOf = (c, uid) => (c.user_a === uid ? c.user_b : c.user_a);

app.post("/api/chats/:id/accept", auth, async (req, res) => {
  const c = await chatFor(req.params.id, req.uid);
  if (!c || c.initiator === req.uid) return res.sendStatus(404);
  await q(
    `update chats set status='accepted' where id=$1 and status='pending'`,
    [c.id],
  );
  res.json({ ok: true });
});
app.post("/api/chats/:id/decline", auth, async (req, res) => {
  const c = await chatFor(req.params.id, req.uid);
  if (!c || c.initiator === req.uid) return res.sendStatus(404);
  await q(`update chats set status='declined' where id=$1`, [c.id]);
  res.json({ ok: true });
});
// Read receipts and online status are reciprocal: hide yours and you do not see theirs.
const hidesReceipts = async (c) =>
  (
    await q("select bool_or(hide_receipts) h from users where id in ($1,$2)", [
      c.user_a,
      c.user_b,
    ])
  )[0].h;
app.put("/api/me/settings", auth, async (req, res) => {
  const cols = {
    hideOnline: "hide_online",
    hideReceipts: "hide_receipts",
    discreetPush: "discreet_push",
    showFlag: "is_lgbtq",
    photoPublic: "photo_public",
  };
  for (const [k, col] of Object.entries(cols))
    if (typeof req.body[k] === "boolean")
      await q(`update users set ${col}=$1 where id=$2`, [req.body[k], req.uid]);
  res.json({ ok: true });
});
app.put("/api/chats/:id/prefs", auth, async (req, res) => {
  const c = await chatFor(req.params.id, req.uid);
  if (!c) return res.sendStatus(404);
  const pin = typeof req.body.pinned === "boolean" ? req.body.pinned : null,
    arc = typeof req.body.archived === "boolean" ? req.body.archived : null;
  await q(
    `insert into chat_prefs(chat_id,user_id,pinned,archived) values($1,$2,coalesce($3::boolean,false),coalesce($4::boolean,false))
    on conflict(chat_id,user_id) do update set pinned=coalesce($3::boolean,chat_prefs.pinned), archived=coalesce($4::boolean,chat_prefs.archived)`,
    [c.id, req.uid, pin, arc],
  );
  res.json({ ok: true });
});
app.get("/api/chats", auth, async (req, res) =>
  res.json(
    await q(
      `select c.id, c.status, c.initiator, u.id other_id, u.name, case when c.status='accepted' then u.avatar_v end av,
   (u.is_lgbtq and (select count(*)=2 and bool_and(share_info) from consents where chat_id=c.id)) flag,
   (select case when m.deleted_at is not null then 'This message was deleted' when m.media_id is null then m.body when d.kind='audio' then 'Voice message' when d.kind='video' then 'Video' else 'Photo' end
     from messages m left join media d on d.id=m.media_id where m.chat_id=c.id order by m.id desc limit 1) last,
   (select max(created_at) from messages where chat_id=c.id) last_at,
   (select count(*)::int from messages where chat_id=c.id and sender<>$1 and read_at is null and deleted_at is null) unread,
   coalesce(p.pinned,false) pinned, coalesce(p.archived,false) archived, u.hide_receipts other_hides,
   (select sender from messages where chat_id=c.id order by id desc limit 1) last_sender,
   (select read_at is not null from messages where chat_id=c.id order by id desc limit 1) last_read
   from chats c join users u on u.id = case when c.user_a=$1 then c.user_b else c.user_a end
   left join chat_prefs p on p.chat_id=c.id and p.user_id=$1
   where (c.user_a=$1 or c.user_b=$1) and c.status<>'declined' order by coalesce(p.pinned,false) desc, (select max(id) from messages where chat_id=c.id) desc nulls last, c.id desc`,
      [req.uid],
    ),
  ),
);

app.get("/api/chats/:id/messages", auth, async (req, res) => {
  const c = await chatFor(req.params.id, req.uid);
  if (!c) return res.sendStatus(404);
  const h = await hidesReceipts(c);
  res.json(
    await withReplies(
      (
        await q(
          "select m.id,m.reply_to,m.sender,m.body,m.created_at,m.media_id,m.read_at,m.edited_at,m.deleted_at,d.kind,d.mode,d.ttl_seconds,d.deleted from messages m left join media d on d.id=m.media_id where m.chat_id=$1 order by m.id limit 300",
          [req.params.id],
        )
      ).map(({ read_at, edited_at, deleted_at, ...r }) =>
        deleted_at
          ? {
              id: r.id,
              sender: r.sender,
              created_at: r.created_at,
              body: "",
              removed: true,
            }
          : { ...r, read: !h && !!read_at, edited: !!edited_at },
      ),
    ),
  );
});

app.get("/api/chats/:id/info", auth, async (req, res) => {
  const c = await chatFor(req.params.id, req.uid);
  if (!c) return res.sendStatus(404);
  const rows = await q(
    "select user_id,share_info,allow_sexual from consents where chat_id=$1",
    [c.id],
  );
  const mine = rows.find((r) => r.user_id === req.uid),
    theirs = rows.find((r) => r.user_id !== req.uid);
  const bothShare = mine.share_info && theirs.share_info,
    bothSexual = mine.allow_sexual && theirs.allow_sexual;
  const [o] = await q(
      "select country,is_lgbtq,hide_online from users where id=$1",
      [otherOf(c, req.uid)],
    ),
    [mu] = await q("select hide_online from users where id=$1", [req.uid]);
  const [blk] = await q(
    "select blocker from blocks where (blocker=$1 and blocked=$2) or (blocker=$2 and blocked=$1) limit 1",
    [req.uid, otherOf(c, req.uid)],
  );
  res.json({
    blocked: blk ? (blk.blocker === req.uid ? "me" : "them") : null,
    mine,
    theirsShares: theirs.share_info,
    theirsSexual: theirs.allow_sexual,
    country: bothShare ? o.country : null,
    flag: bothShare && o.is_lgbtq,
    status: c.status,
    initiator: c.initiator,
    online:
      !o.hide_online &&
      !mu.hide_online &&
      (await isOnline(otherOf(c, req.uid))),
    sexualOn: bothSexual,
  });
});

app.put("/api/chats/:id/consent", auth, async (req, res) => {
  const c = await chatFor(req.params.id, req.uid);
  if (!c) return res.sendStatus(404);
  const { shareInfo, allowSexual } = req.body;
  if (allowSexual) {
    const ages = await q(
      `select date_part('year',age(birthdate))::int a from users where id in ($1,$2)`,
      [c.user_a, c.user_b],
    );
    if (ages.some((x) => x.a < 18))
      return res.status(400).json({ error: "Both people must be 18+" });
  }
  await q(
    "update consents set share_info=$3, allow_sexual=$4 where chat_id=$1 and user_id=$2",
    [c.id, req.uid, !!shareInfo, !!allowSexual],
  );
  res.json({ ok: true });
});

app.post("/api/block/:id", auth, async (req, res) => {
  await q("insert into blocks values($1,$2) on conflict do nothing", [
    req.uid,
    +req.params.id,
  ]);
  res.json({ ok: true });
});
app.post("/api/report/:id", auth, async (req, res) => {
  await q("insert into reports(reporter,reported,reason) values($1,$2,$3)", [
    req.uid,
    +req.params.id,
    req.body.reason || "",
  ]);
  res.json({ ok: true });
});

const hash = (c) =>
  crypto
    .createHash("sha256")
    .update(c + SECRET)
    .digest("hex");
async function sendEmailCode(uid) {
  const [u] = await q("select email from users where id=$1", [uid]),
    code = String(crypto.randomInt(100000, 1000000));
  await q(
    `insert into verifications(user_id,kind,code_hash,expires_at) values($1,'email',$2,now()+interval '10 minutes')
    on conflict(user_id,kind) do update set code_hash=$2, expires_at=now()+interval '10 minutes', attempts=0`,
    [uid, hash(code)],
  );
  await sendEmail(
    u.email,
    "Your Tumblrr verification code",
    `<p>Your code is <b>${code}</b>. It expires in 10 minutes.</p>`,
  );
}
app.post(
  "/api/verify/email/send",
  auth,
  limit(3, 10 * 60e3),
  async (req, res) => {
    try {
      await sendEmailCode(req.uid);
      res.json({ ok: true });
    } catch (e) {
      console.error(e.message);
      res
        .status(502)
        .json({ error: "Could not send the email. Try again soon." });
    }
  },
);
app.post(
  "/api/verify/email/check",
  auth,
  limit(10, 10 * 60e3),
  async (req, res) => {
    const [v] = await q(
      `select code_hash from verifications where user_id=$1 and kind='email' and expires_at>now() and attempts<5`,
      [req.uid],
    );
    if (!v)
      return res
        .status(400)
        .json({ error: "That code expired. Request a new one." });
    if (v.code_hash !== hash(String(req.body.code || "").trim())) {
      await q(
        `update verifications set attempts=attempts+1 where user_id=$1 and kind='email'`,
        [req.uid],
      );
      return res.status(400).json({ error: "Wrong code" });
    }
    await q("update users set email_verified=true where id=$1", [req.uid]);
    await q(`delete from verifications where user_id=$1 and kind='email'`, [
      req.uid,
    ]);
    res.json({ ok: true });
  },
);
app.post(
  "/api/verify/phone/send",
  auth,
  limit(3, 10 * 60e3),
  async (req, res) => {
    const phone = cleanPhone(req.body.phone);
    if (!E164.test(phone))
      return res
        .status(400)
        .json({
          error: "Enter your number with country code, like +2348012345678",
        });
    if (
      (
        await q(
          "select 1 from users where phone=$1 and phone_verified and id<>$2",
          [phone, req.uid],
        )
      ).length
    )
      return res.status(400).json({ error: "That number is already in use" });
    try {
      await startPhone(phone);
      res.json({ ok: true });
    } catch (e) {
      console.error(e.message);
      res
        .status(502)
        .json({
          error: "Could not send the code. Check the number and try again.",
        });
    }
  },
);
app.post(
  "/api/verify/phone/check",
  auth,
  limit(10, 10 * 60e3),
  async (req, res) => {
    const phone = cleanPhone(req.body.phone);
    try {
      if (
        !E164.test(phone) ||
        !(await checkPhone(phone, String(req.body.code || "").trim()))
      )
        return res.status(400).json({ error: "Wrong code" });
      await q("update users set phone=$2, phone_verified=true where id=$1", [
        req.uid,
        phone,
      ]);
      res.json({ ok: true });
    } catch (e) {
      console.error(e.message);
      res.status(400).json({ error: "Could not verify that number" });
    }
  },
);

app.get("/api/push/key", auth, (req, res) =>
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null }),
);
app.post("/api/push/subscribe", auth, async (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth)
    return res.status(400).json({ error: "Invalid subscription" });
  await q(
    "insert into push_subs(user_id,endpoint,p256dh,auth) values($1,$2,$3,$4) on conflict(endpoint) do update set user_id=$1,p256dh=$3,auth=$4",
    [req.uid, endpoint, keys.p256dh, keys.auth],
  );
  res.json({ ok: true });
});
app.post("/api/push/unsubscribe", auth, async (req, res) => {
  await q("delete from push_subs where endpoint=$1 and user_id=$2", [
    req.body.endpoint,
    req.uid,
  ]);
  res.json({ ok: true });
});

app.get("/api/admin/overview", auth, adminOnly, async (req, res) =>
  res.json({
    reports: await q(
      "select r.id,r.reported,u.name,r.reason from reports r join users u on u.id=r.reported order by r.id desc limit 50",
    ),
    pending: await q(
      `select id,name,date_part('year',age(birthdate))::int age from users where not verified and not banned and selfie_path is not null order by id limit 50`,
    ),
  }),
);
app.get("/api/admin/selfie/:id", auth, adminOnly, async (req, res) => {
  const [u] = await q("select selfie_path from users where id=$1", [
    +req.params.id,
  ]);
  u?.selfie_path
    ? res.type("jpeg").sendFile(path.resolve(u.selfie_path))
    : res.sendStatus(404);
});
app.post("/api/admin/users/:id/verify", auth, adminOnly, async (req, res) => {
  const [u] = await q(
    "update users set verified=true where id=$1 returning selfie_path",
    [+req.params.id],
  );
  if (u?.selfie_path && process.env.KEEP_SELFIES !== "true") {
    fs.rmSync(u.selfie_path, { force: true });
    await q("update users set selfie_path=null where id=$1", [+req.params.id]);
  }
  res.json({ ok: true });
});
app.post("/api/admin/users/:id/ban", auth, adminOnly, async (req, res) => {
  await q("update users set banned=true where id=$1", [+req.params.id]);
  res.json({ ok: true });
});

async function mutualSexual(chat) {
  const [r] = await q(
    "select count(*)::int n, bool_and(allow_sexual) ok from consents where chat_id=$1",
    [chat.id],
  );
  return r.n === 2 && !!r.ok;
}
// Returns an error string if the text must be blocked, otherwise null.
async function blockReason(chat, text) {
  const v = await sexualCheck(text);
  return v.sexual || v.minors
    ? moderationDecision(v, await mutualSexual(chat))
    : null;
}
const isBlocked = async (a, b) =>
  (
    await q(
      "select 1 from blocks where (blocker=$1 and blocked=$2) or (blocker=$2 and blocked=$1)",
      [a, b],
    )
  ).length > 0;

// Media: images and videos are always screened. View-once and self-destruct only when both people allow sexual content.
fs.mkdirSync("private-uploads/media", { recursive: true });
const mediaUpload = multer({
  dest: "private-uploads/media/",
  limits: { fileSize: 15e6 },
  fileFilter: (r, f, cb) =>
    cb(
      null,
      /^(image\/(jpeg|png|webp|gif)|video\/(mp4|webm|quicktime)|audio\/(webm|ogg|mp4|mpeg|wav|x-m4a))$/.test(
        f.mimetype.split(";")[0],
      ),
    ),
});
app.post(
  "/api/chats/:id/media",
  auth,
  limit(30, 10 * 60e3),
  mediaUpload.single("file"),
  async (req, res) => {
    const f = req.file,
      drop = () => f && fs.rmSync(f.path, { force: true });
    if (f) f.mimetype = f.mimetype.split(";")[0]; // voice notes arrive as audio/webm;codecs=opus
    const c = await chatFor(req.params.id, req.uid);
    if (!c || !f) {
      drop();
      return res
        .status(400)
        .json({ error: "Choose an image or video (up to 15 MB)" });
    }
    if (await isBlocked(req.uid, otherOf(c, req.uid))) {
      drop();
      return res.status(403).json({ error: "Chat unavailable" });
    }
    if (!mediaUnlocked(c.status)) {
      drop();
      return res
        .status(400)
        .json({ error: "Photos and videos unlock once the chat is accepted" });
    }
    const mode = ["none", "once", "timed"].includes(req.body.mode)
        ? req.body.mode
        : "none",
      mutual = await mutualSexual(c);
    if (!ephemeralAllowed(mode, mutual)) {
      drop();
      return res
        .status(400)
        .json({
          error:
            "View-once and self-destruct need both people to allow sexual content",
        });
    }
    let verdict;
    try {
      verdict = await mediaCheck(f.path, f.mimetype);
    } catch (e) {
      console.error(e.message);
      drop();
      return res
        .status(503)
        .json({
          error: "This file could not be checked right now, so it was not sent",
        });
    }
    const why = moderationDecision(verdict, mutual);
    if (why) {
      drop();
      return res.status(400).json({ error: why });
    }
    const id = crypto.randomUUID(),
      kind = f.mimetype.split("/")[0],
      ttl =
        mode === "timed"
          ? Math.min(Math.max(+req.body.ttl || 10, 5), 60)
          : null;
    await q(
      "insert into media(id,chat_id,sender,kind,mime,path,mode,ttl_seconds) values($1,$2,$3,$4,$5,$6,$7,$8)",
      [id, c.id, req.uid, kind, f.mimetype, f.path, mode, ttl],
    );
    const [m] = await q(
      `insert into messages(chat_id,sender,body,media_id,reply_to) values($1,$2,'',$3,$4) returning id,sender,body,created_at,media_id,reply_to`,
      [c.id, req.uid, id, await validReply(c.id, req.body.replyTo)],
    );
    const msg = {
      chatId: c.id,
      ...m,
      kind,
      mode,
      ttl_seconds: ttl,
      deleted: false,
      reply: await replyOf(m.reply_to),
    };
    io.to("chat" + c.id).emit("message", msg);
    res.json({ ok: true });
    const [me] = await q("select name from users where id=$1", [req.uid]);
    notify(otherOf(c, req.uid), {
      title: me.name,
      body: "Sent you a message",
      chatId: c.id,
    });
  },
);
const dropMedia = async (d) => {
  fs.rmSync(d.path, { force: true });
  await q("update media set deleted=true, path=null where id=$1", [d.id]);
};
app.get("/api/media/:id", auth, async (req, res) => {
  const [d] = await q("select * from media where id=$1", [req.params.id]);
  const c = d && (await chatFor(d.chat_id, req.uid)),
    gone = () => res.status(410).json({ error: "This media is gone" });
  if (!c || (await isBlocked(req.uid, otherOf(c, req.uid))))
    return res.sendStatus(404);
  if (d.mode !== "none" && d.sender === req.uid)
    return res
      .status(403)
      .json({ error: "Only the other person can open this" });
  if (d.deleted || !d.path) return gone();
  if (d.mode === "once") {
    if (
      !(
        await q(
          "update media set viewed_at=now() where id=$1 and viewed_at is null returning id",
          [d.id],
        )
      ).length
    )
      return gone();
  } else if (d.mode === "timed") {
    if (
      d.viewed_at &&
      Date.now() > +new Date(d.viewed_at) + d.ttl_seconds * 1000
    ) {
      await dropMedia(d);
      return gone();
    }
    await q(
      "update media set viewed_at=coalesce(viewed_at,now()) where id=$1",
      [d.id],
    );
  }
  const buf = fs.readFileSync(d.path);
  res
    .set({
      "Content-Type": d.mime,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    })
    .send(buf);
  if (d.mode === "once") await dropMedia(d);
});
setInterval(async () => {
  // delete expired self-destruct media
  try {
    for (const d of await q(
      `select * from media where mode='timed' and not deleted and viewed_at is not null and viewed_at + make_interval(secs => ttl_seconds) < now()`,
    ))
      await dropMedia(d);
  } catch (e) {
    console.error(e.message);
  }
}, 30e3).unref();
// Replies: a short, safe preview of the message being answered (never the content of deleted or view-once media).
const shapeReply = (r) =>
  r.removed
    ? { id: r.id, sender: r.sender, removed: true }
    : {
        id: r.id,
        sender: r.sender,
        body: r.kind ? "" : String(r.body).slice(0, 120),
        kind: r.kind || null,
      };
const REPLY_SQL =
  "select m.id,m.sender,m.body,m.deleted_at is not null removed,d.kind from messages m left join media d on d.id=m.media_id";
const replyOf = async (id) => {
  if (!id) return null;
  const [r] = await q(REPLY_SQL + " where m.id=$1", [id]);
  return r ? shapeReply(r) : null;
};
const validReply = async (chatId, id) => {
  id = +id;
  if (!id) return null;
  const [r] = await q("select id from messages where id=$1 and chat_id=$2", [
    id,
    chatId,
  ]);
  return r ? r.id : null;
};
async function withReplies(rows) {
  const ids = [...new Set(rows.map((r) => r.reply_to).filter(Boolean))];
  if (!ids.length) return rows;
  const map = new Map(
    (await q(REPLY_SQL + " where m.id = any($1::int[])", [ids])).map((r) => [
      r.id,
      shapeReply(r),
    ]),
  );
  return rows.map((r) =>
    r.reply_to ? { ...r, reply: map.get(r.reply_to) || null } : r,
  );
}
// Edit (15 min) and delete-for-everyone (48 h). Edits are re-moderated and old versions kept for abuse reports.
async function ownMessage(req) {
  const [m] = await q(
    "select * from messages where id=$1 and deleted_at is null",
    [+req.params.id],
  );
  const c = m && (await chatFor(m.chat_id, req.uid));
  return c && m.sender === req.uid && c.status !== "declined" ? { m, c } : null;
}
app.put("/api/messages/:id", auth, limit(30, 10 * 60e3), async (req, res) => {
  const o = await ownMessage(req);
  if (!o || o.m.media_id) return res.sendStatus(404);
  if (!canEdit(o.m.created_at))
    return res
      .status(400)
      .json({ error: "Messages can only be edited for 15 minutes" });
  const text = String(req.body.text || "")
    .trim()
    .slice(0, 2000);
  if (!text) return res.status(400).json({ error: "The message is empty" });
  const why = await blockReason(o.c, text);
  if (why) return res.status(400).json({ error: why });
  await q("insert into message_edits(message_id,old_body) values($1,$2)", [
    o.m.id,
    o.m.body,
  ]);
  await q("update messages set body=$2, edited_at=now() where id=$1", [
    o.m.id,
    text,
  ]);
  io.to("chat" + o.c.id).emit("edited", {
    chatId: o.c.id,
    id: o.m.id,
    body: text,
  });
  res.json({ ok: true });
});
app.delete("/api/messages/:id", auth, async (req, res) => {
  const o = await ownMessage(req);
  if (!o) return res.sendStatus(404);
  if (!canDelete(o.m.created_at))
    return res
      .status(400)
      .json({
        error: "Messages can only be deleted for everyone within 48 hours",
      });
  await q("update messages set deleted_at=now() where id=$1", [o.m.id]);
  if (o.m.media_id) {
    const [d] = await q("select * from media where id=$1", [o.m.media_id]);
    if (d?.path) await dropMedia(d);
  }
  io.to("chat" + o.c.id).emit("deleted", { chatId: o.c.id, id: o.m.id });
  res.json({ ok: true });
});
// Deleted text stays on the server for 30 days so abuse reports can still be reviewed, then it is erased.
setInterval(
  () =>
    q(
      `update messages set body='' where deleted_at < now() - interval '30 days' and body<>''`,
    ).catch(console.error),
  6 * 3600e3,
).unref();
const matched = async (a, b) =>
  (await q(MATCH, [a, b, REQUIRE_VERIFICATION, REQUIRE_PHONE])).length > 0;

const __dirname = path.resolve();
const distPath = path.join(__dirname, "dist");

// 1. Serve static compiled assets from Vite
app.use(express.static(distPath));

// 2. Catch all other routing requests and pass them to index.html
app.get("*", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});


mountSocial({ app, auth, q, limit, matched });
app.use((err, req, res, next) => {
  console.error(err);
  next(err);
});
app.use((err, req, res, next) =>
  res
    .status(err.code === "LIMIT_FILE_SIZE" ? 413 : 500)
    .json({
      error:
        err.code === "LIMIT_FILE_SIZE"
          ? "That file is too large (15 MB max)"
          : "Something went wrong",
    }),
);

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CLIENT_URL || true },
});
if (redis) {
  const sub = redis.duplicate();
  await sub.connect();
  io.adapter(createAdapter(redis, sub));
}
io.use((s, next) => {
  s.uid = uidFrom(s.handshake.auth.token);
  s.uid ? next() : next(new Error("auth"));
});
io.on("connection", (s) => {
  let sent = [];
  setOnline(s.uid, 1);
  s.on("disconnect", () => setOnline(s.uid, -1));
  s.on("typing", (id) => {
    if (s.rooms.has("chat" + id))
      s.to("chat" + id).emit("typing", { chatId: id });
  });
  s.on("read", async (id) => {
    const c = await chatFor(id, s.uid);
    if (!c) return;
    const n = (
      await q(
        "update messages set read_at=now() where chat_id=$1 and sender<>$2 and read_at is null returning id",
        [c.id, s.uid],
      )
    ).length;
    if (n && !(await hidesReceipts(c)))
      io.to("chat" + c.id).emit("read", { chatId: c.id, by: s.uid });
  });
  s.on("join", async (id) => {
    if (await chatFor(id, s.uid)) s.join("chat" + id);
  });
  s.on("message", async ({ chatId, text, replyTo }, ack) => {
    const now = Date.now();
    sent = sent.filter((t) => now - t < 10000);
    if (sent.length >= 20) return ack?.({ error: "Slow down a little" });
    sent.push(now);
    const c = await chatFor(chatId, s.uid);
    text = (text || "").trim().slice(0, 2000);
    if (!c || !text) return;
    const blocked = await q(
      "select 1 from blocks where (blocker=$1 and blocked=$2) or (blocker=$2 and blocked=$1)",
      [s.uid, otherOf(c, s.uid)],
    );
    if (blocked.length) return ack?.({ error: "Chat unavailable" });
    const why = await blockReason(c, text);
    if (why) return ack?.({ error: why });
    const sentN =
      c.status === "pending"
        ? (
            await q(
              "select count(*)::int n from messages where chat_id=$1 and sender=$2",
              [c.id, s.uid],
            )
          )[0].n
        : 0;
    const rejected = requestDecision(c.status, c.initiator, s.uid, sentN);
    if (rejected) return ack?.({ error: rejected });
    if (c.status === "pending" && c.initiator !== s.uid)
      await q(`update chats set status='accepted' where id=$1`, [c.id]); // replying accepts
    const rt = await validReply(c.id, replyTo);
    const [m] = await q(
      "insert into messages(chat_id,sender,body,reply_to) values($1,$2,$3,$4) returning id,sender,body,created_at,reply_to",
      [c.id, s.uid, text, rt],
    );
    io.to("chat" + c.id).emit("message", {
      chatId: c.id,
      ...m,
      reply: await replyOf(m.reply_to),
    });
    ack?.({ ok: true });
    const [me] = await q("select name from users where id=$1", [s.uid]);
    notify(otherOf(c, s.uid), {
      title: me.name,
      body: "Sent you a message",
      chatId: c.id,
    }); // no message text on the lock screen
  });
});

server.listen(process.env.PORT || 4000, () =>
  console.log("API on", process.env.PORT || 4000),
);

