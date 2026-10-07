// Profile photo and about, blocked list, 24-hour status updates, and account deletion.
import fs from 'fs'; import path from 'path'; import multer from 'multer';
import { sexualCheck, mediaCheck } from './moderation.js';

export function mountSocial({ app, auth, q, limit, matched }) {
  fs.mkdirSync('private-uploads/img', { recursive: true });
  const upload = multer({ dest: 'private-uploads/img/', limits: { fileSize: 4e6 }, fileFilter: (r, f, cb) => cb(null, /^image[/](jpeg|png|webp)$/.test(f.mimetype)) });
  const drop = f => f && fs.rmSync(f.path, { force: true });
  const NO_SEXUAL = 'That cannot be used here. Profiles and statuses are seen by several people, so sexual content is not allowed.';
  const cleanText = async (t, max) => { t = String(t || '').trim().slice(0, max); const v = t ? await sexualCheck(t) : {}; return v.sexual || v.minors ? [null, NO_SEXUAL] : [t, null]; };
  const badImage = async f => { try { const v = await mediaCheck(f.path, f.mimetype); return v.sexual || v.minors ? NO_SEXUAL : null; } catch (e) { console.error(e.message); return 'The image could not be checked right now. Try again soon.'; } };
  const blockedPair = async (a, b) => (await q('select 1 from blocks where (blocker=$1 and blocked=$2) or (blocker=$2 and blocked=$1)', [a, b])).length > 0;

  // ---- profile
  app.put('/api/me/profile', auth, async (req, res) => {
    const [name, w1] = await cleanText(req.body.name, 30), [about, w2] = await cleanText(req.body.about, 140);
    if (w1 || w2) return res.status(400).json({ error: w1 || w2 });
    if (!name || name.length < 2) return res.status(400).json({ error: 'Your name needs at least 2 characters' });
    await q('update users set name=$2, about=$3 where id=$1', [req.uid, name, about || null]); res.json({ ok: true });
  });
  app.post('/api/me/avatar', auth, limit(10, 3600e3), upload.single('file'), async (req, res) => {
    const f = req.file; if (!f) return res.status(400).json({ error: 'Choose a JPEG, PNG or WebP image (4 MB max)' });
    const why = await badImage(f); if (why) { drop(f); return res.status(400).json({ error: why }); }
    const [old] = await q('select avatar_path from users where id=$1', [req.uid]); if (old?.avatar_path) fs.rmSync(old.avatar_path, { force: true });
    const [u] = await q('update users set avatar_path=$2, avatar_mime=$3, avatar_v=coalesce(avatar_v,0)+1 where id=$1 returning avatar_v', [req.uid, f.path, f.mimetype]);
    res.json({ av: u.avatar_v });
  });
  app.delete('/api/me/avatar', auth, async (req, res) => {
    const [u] = await q('select avatar_path from users where id=$1', [req.uid]); if (u?.avatar_path) fs.rmSync(u.avatar_path, { force: true });
    await q('update users set avatar_path=null, avatar_v=null where id=$1', [req.uid]); res.json({ ok: true });
  });
  // Photos are seen by: yourself, people in an accepted chat with you, and (adults who opt in) people they match with.
  app.get('/api/users/:id/avatar', auth, async (req, res) => {
    const id = +req.params.id, [u] = await q(`select avatar_path,avatar_mime,photo_public,date_part('year',age(birthdate))>=18 adult from users where id=$1 and not banned`, [id]);
    if (!u?.avatar_path) return res.sendStatus(404);
    let ok = id === req.uid;
    if (!ok && (await blockedPair(req.uid, id))) return res.sendStatus(404);
    if (!ok) ok = (await q(`select 1 from chats where status='accepted' and ((user_a=$1 and user_b=$2) or (user_a=$2 and user_b=$1))`, [req.uid, id])).length > 0;
    if (!ok && u.photo_public && u.adult) ok = await matched(req.uid, id);
    if (!ok) return res.sendStatus(404);
    res.set({ 'Content-Type': u.avatar_mime, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' }).sendFile(path.resolve(u.avatar_path));
  });

  // ---- blocked contacts
  app.get('/api/blocks', auth, async (req, res) => res.json(await q('select u.id,u.name,null::int av from blocks b join users u on u.id=b.blocked where b.blocker=$1 order by u.name', [req.uid])));
  app.delete('/api/block/:id', auth, async (req, res) => { await q('delete from blocks where blocker=$1 and blocked=$2', [req.uid, +req.params.id]); res.json({ ok: true }); });

  // ---- status updates (24 hours, shown only to people in accepted chats)
  const BG = ['#4b2fd0', '#0f766e', '#be123c', '#b45309', '#1d4ed8', '#6d28d9', '#334155'];
  const audience = `(s.user_id=$1 or exists(select 1 from chats c where c.status='accepted' and ((c.user_a=$1 and c.user_b=s.user_id) or (c.user_b=$1 and c.user_a=s.user_id))))
    and not exists(select 1 from blocks b where (b.blocker=$1 and b.blocked=s.user_id) or (b.blocker=s.user_id and b.blocked=$1))`;
  app.get('/api/status', auth, async (req, res) => res.json(await q(
    `select s.id,s.user_id,u.name,u.avatar_v av,s.kind,s.body,s.bg,s.created_at,
       exists(select 1 from status_views v where v.status_id=s.id and v.viewer=$1) seen, (select count(*)::int from status_views v where v.status_id=s.id) views
     from statuses s join users u on u.id=s.user_id where s.expires_at>now() and ${audience} order by s.created_at`, [req.uid])));
  app.post('/api/status', auth, limit(20, 3600e3), async (req, res) => {
    const [text, why] = await cleanText(req.body.text, 300); if (why) return res.status(400).json({ error: why });
    if (!text) return res.status(400).json({ error: 'Write something first' });
    await q(`insert into statuses(user_id,kind,body,bg) values($1,'text',$2,$3)`, [req.uid, text, BG.includes(req.body.bg) ? req.body.bg : BG[0]]); res.json({ ok: true });
  });
  app.post('/api/status/image', auth, limit(20, 3600e3), upload.single('file'), async (req, res) => {
    const f = req.file; if (!f) return res.status(400).json({ error: 'Choose a JPEG, PNG or WebP image' });
    const [cap, w0] = await cleanText(req.body.caption, 200), why = w0 || (await badImage(f));
    if (why) { drop(f); return res.status(400).json({ error: why }); }
    await q(`insert into statuses(user_id,kind,body,mime,path) values($1,'image',$2,$3,$4)`, [req.uid, cap || null, f.mimetype, f.path]); res.json({ ok: true });
  });
  app.get('/api/status/:id/media', auth, async (req, res) => {
    const [s] = await q(`select s.mime,s.path from statuses s where s.id=$2 and s.kind='image' and s.expires_at>now() and ${audience}`, [req.uid, +req.params.id]);
    if (!s?.path) return res.sendStatus(404);
    res.set({ 'Content-Type': s.mime, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' }).sendFile(path.resolve(s.path));
  });
  app.post('/api/status/:id/view', auth, async (req, res) => {
    const [s] = await q(`select s.id from statuses s where s.id=$2 and s.expires_at>now() and ${audience}`, [req.uid, +req.params.id]);
    if (s && s.id) await q('insert into status_views values($1,$2) on conflict do nothing', [s.id, req.uid]); res.json({ ok: true });
  });
  app.delete('/api/status/:id', auth, async (req, res) => {
    const [s] = await q('select path from statuses where id=$1 and user_id=$2', [+req.params.id, req.uid]); if (!s) return res.sendStatus(404);
    if (s.path) fs.rmSync(s.path, { force: true }); await q('delete from statuses where id=$1', [+req.params.id]); res.json({ ok: true });
  });
  setInterval(async () => {
    try { for (const s of await q('select id,path from statuses where expires_at<now()')) { if (s.path) fs.rmSync(s.path, { force: true }); await q('delete from statuses where id=$1', [s.id]); } } catch (e) { console.error(e.message); }
  }, 600e3).unref();

  // ---- delete my account: personal data and files are erased; reports about abuse are kept
  app.delete('/api/me', auth, async (req, res) => {
    const uid = req.uid;
    const files = await q(`select avatar_path p from users where id=$1 union all select selfie_path from users where id=$1 union all select path from media where sender=$1 and path is not null union all select path from statuses where user_id=$1 and path is not null`, [uid]);
    files.forEach(f => f.p && fs.rmSync(f.p, { force: true }));
    await q('update media set deleted=true, path=null where sender=$1', [uid]);
    await q(`update messages set body='', deleted_at=coalesce(deleted_at, now()) where sender=$1`, [uid]);
    await q('delete from statuses where user_id=$1', [uid]); await q('delete from push_subs where user_id=$1', [uid]);
    await q(`update users set email='deleted-'||id||'@deleted.invalid', password_hash='', name='Deleted user', about=null, phone=null, phone_verified=false, avatar_path=null, avatar_v=null, selfie_path=null, country=null, banned=true where id=$1`, [uid]);
    res.json({ ok: true });
  });
}
