# Tumblrr

A privacy-first chat app for friendships and dating. People are matched only when **each person's age falls inside the other's preferred range**, personal details stay hidden until **both** people agree to share them, and adult content is locked unless **both** people are 18+ and opt in.

It is a React progressive web app (installable, works on phones and desktop) with a Node.js and PostgreSQL backend.

> **Status: early prototype.** It runs end to end, but it has not been security-audited, load-tested or legally reviewed. Read [Limitations](#limitations) and [Before you launch](#before-you-launch) before putting real users on it. "Tumblrr" is a placeholder name.

---

## Contents

- [Features](#features)
- [How matching and safety work](#how-matching-and-safety-work)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Scripts](#scripts)
- [Admin and moderation tools](#admin-and-moderation-tools)
- [Testing](#testing)
- [Deployment notes](#deployment-notes)
- [Limitations](#limitations)
- [Before you launch](#before-you-launch)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## Features

**Matching and discovery**
- Two-way age matching: you only see people whose range includes your age, and whose age is in your range.
- Gender and "who I want to meet" preferences, matched in both directions.
- Discover list, plus message requests so strangers cannot flood you.

**Chat**
- Real-time messaging (Socket.IO) with typing indicators, read receipts and online status. Read receipts and online status are reciprocal and can be hidden.
- Replies (swipe or menu), edit (15 minutes), delete for everyone (48 hours), copy, and on-device translation where the browser supports it.
- Right-click, long-press or hover menu on every message.
- Photos, videos and voice notes, with a preview screen before sending.
- **View once** and **self-destruct** media, available only when both people allow sexual content for each other.
- Pin and archive chats; unread badges; search; filter chips (All, Unread, Requests).
- Block, unblock and report.

**Profile and status**
- Profile photo, name and "about". Photos are shown only to people in an accepted chat (adults can opt in to show theirs in Discover).
- 24-hour status updates (text or photo) visible only to people in your accepted chats, with view counts.
- Optional rainbow flag, hidden by default and shown only to people you chose to share your info with.
- Country and other details are revealed only when **both** people allow it.

**Privacy and account**
- App lock with a PIN, discreet notifications (no names or message text on the lock screen), and web push.
- Delete my account (erases profile, photo, selfie and messages; abuse reports are kept).
- Email verification (Resend) and optional phone verification (Twilio Verify).
- Dark mode that follows the system setting.

---

## How matching and safety work

Two people can chat only if all of these are true:

```
my age   is between their age_min and age_max
their age is between my age_min and my age_max
their gender is in my "seeking" list, and mine is in theirs
we are in the same group: both under 18, or both 18+
neither of us has blocked the other
(optional) both accounts are verified
```

| Rule | What the server does |
|------|----------------------|
| Minimum age | 13. |
| Under 18 | Can only match other under-18s within 2 years of their own age, never above 17. Preferences are clamped server-side. |
| Adults | Matched only with adults (18+). Teens and adults are never matched. |
| Sexual content | Allowed only if both people are 18+ **and** both switched it on. Anything flagged as sexual involving minors is always blocked. |
| View once / self-destruct | Only when both people have allowed sexual content. The sender cannot reopen it and the file is deleted after viewing. |
| New chats | Start as a request. The starter can send 3 text messages until the other person accepts; photos and videos unlock after acceptance. A daily cap limits new chats. |
| Photos, videos, voice | Screened before they are sent. If screening fails or is unavailable the file is **not** sent (fail closed). |
| Signup selfie | Captured live in the app (camera only, no gallery), stored privately and reviewed by an admin. Deleted after approval unless you set `KEEP_SELFIES=true`. |

The rules that do not need a database live in `server/src/rules.js` and are unit tested.

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Client | React 18, Vite, `vite-plugin-pwa` (service worker, install, push), Socket.IO client |
| UI | Hand-written CSS design system, Phosphor icons, Inter and Manrope fonts (bundled) |
| Server | Node.js 18+ (ESM), Express 4, Socket.IO |
| Database | PostgreSQL |
| Optional | Redis (shared rate limits, presence and Socket.IO across several servers) |
| Services | Resend (email), Twilio Verify (SMS), OpenAI moderation and transcription (content safety), Web Push (VAPID) |
| Tools | `ffmpeg` on the server (video frame and soundtrack checks) |

---

## Project structure

```
Tumblrr/
├── client/                  React PWA
│   ├── public/              Icons
│   └── src/
│       ├── App.jsx          Shell, navigation, chat list, sign-in, verification
│       ├── Chat.jsx         Conversation, replies, menus, media, voice notes
│       ├── Settings.jsx     Profile, privacy, notifications, security, blocked, account
│       ├── Status.jsx       24-hour status updates and viewer
│       ├── Landing.jsx      Public landing page
│       ├── ui.jsx           Toasts, dialogs, empty states
│       ├── icons.jsx        Icon wrapper, logo, flag
│       ├── avatar.jsx       Authenticated profile photos
│       ├── api.js           API helper, push, on-device translation
│       ├── lock.js          PIN app lock
│       ├── sw.js            Service worker (precache and push)
│       └── styles.css       Design system
├── server/
│   ├── schema.sql           Database schema (safe to re-run)
│   ├── src/
│   │   ├── index.js         API routes and Socket.IO
│   │   ├── social.js        Profile photo, blocks, status, account deletion
│   │   ├── rules.js         Pure, unit-tested rules
│   │   ├── moderation.js    Text, image, video and voice screening
│   │   ├── mail.js, sms.js  Email and SMS providers
│   │   └── init.js, makeadmin.js, vapid.js
│   └── test/rules.test.js
├── docs/PRIVACY-TEMPLATE.md Starting outline only, not legal advice
└── docker-compose.yml       Optional Postgres and Redis
```

---

## Getting started

### Requirements

- Node.js 18 or newer
- PostgreSQL 14 or newer (a local install or Docker)
- Optional: Redis, `ffmpeg`

### 1. Clone and install

```bash
git clone https://github.com/YOUR-USERNAME/Tumblrr.git
cd Tumblrr
cd server && npm install && cd ../client && npm install && cd ..
```

### 2. Create the database

**Using an existing PostgreSQL install** (no Docker needed). In `psql` as a superuser:

```sql
CREATE USER Tumblrr WITH PASSWORD 'Tumblrr';
CREATE DATABASE Tumblrr OWNER Tumblrr;
```

**Or with Docker:** `docker compose up -d` starts Postgres (and Redis) with the same credentials.

### 3. Configure the server

```bash
cd server
cp .env.example .env        # on Windows PowerShell: copy .env.example .env
```

Set at least `DATABASE_URL` and a long random `JWT_SECRET`. Everything else is optional for local development (see [Configuration](#configuration)).

### 4. Create the tables and start

```bash
npm run db:init             # prints "Database ready" (safe to run again after updates)
npm run dev                 # API on http://localhost:4000
```

In a second terminal:

```bash
cd client
npm run dev                 # app on http://localhost:5173
```

### 5. Try it

1. Open http://localhost:5173 and create an account (allow camera access for the signup selfie).
2. **Email code:** with no email key set, the 6-digit code is printed in the **server terminal** as `[dev email] ...`.
3. Make a second account in another browser or a private window. For two people to see each other, each age must be inside the other's range and each gender in the other's "seeking" list.
4. Discover, send a request, accept it from the other account, then chat.

In development with no Twilio keys, the phone code is always `000000`.

---

## Configuration

### Server (`server/.env`)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string, for example `postgres://Tumblrr:Tumblrr@localhost:5432/Tumblrr`. Passwords with special characters must be URL-encoded. |
| `JWT_SECRET` | Long random string used to sign login tokens. **Required in production.** |
| `CLIENT_URL` | Allowed browser origin for CORS, for example `http://localhost:5173`. |
| `PORT` | API port (default 4000). |
| `OPENAI_API_KEY` | Real moderation for text, images, video frames and voice transcripts. **Without it, media is not moderated (development only) and text uses a weak keyword list.** |
| `RESEND_API_KEY`, `MAIL_FROM` | Email delivery. Without a key, codes print to the server console. To email real users you must verify a sending domain in Resend. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SID` | Phone verification. Without them, the dev code is `000000` (refused when `NODE_ENV=production`). |
| `REQUIRE_PHONE` | `true` to require a verified phone before matching. |
| `REQUIRE_VERIFICATION` | `true` so only admin-approved users appear in Discover. |
| `KEEP_SELFIES` | `true` to keep selfie files after approval (default: delete). |
| `NEW_CHATS_PER_DAY` | New chats one person can start per day (default 10). |
| `REDIS_URL` | Set when running more than one server. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web push. Generate keys with `npm run vapid`. |

### Client (build time)

| Variable | Purpose |
|----------|---------|
| `VITE_API_URL` | API address if it is not `http://localhost:4000`. |
| `VITE_APP_NAME` | Neutral installed app name (also change the page title and icons). |

---

## Scripts

**server**

| Command | Does |
|---------|------|
| `npm run dev` | Start the API with auto-reload |
| `npm start` | Start the API |
| `npm run db:init` | Create or update tables from `schema.sql` |
| `npm run make-admin -- you@email.com` | Grant admin to a registered user |
| `npm run vapid` | Generate web push keys |
| `npm test` | Run unit tests |

**client**

| Command | Does |
|---------|------|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build |

---

## Admin and moderation tools

1. Register an account, then run `npm run make-admin -- you@email.com`.
2. In the app, open **You → Admin** to review signup selfies (approve or ban) and handle reports.
3. Approving a selfie marks the user verified and deletes the file (unless `KEEP_SELFIES=true`).

Moderation details:
- Text, images, video frames, video soundtracks and voice-note transcripts are checked with OpenAI's moderation endpoint (voice via `whisper-1` transcription).
- Content flagged as sexual is blocked unless both people are 18+ and both opted in. Sexual content involving minors is always blocked.
- Profile photos, "about" text and statuses are seen by several people, so **sexual content is never allowed there**.
- Edits keep previous versions and deleted text is retained for 30 days so abuse reports can still be reviewed.

---

## Testing

```bash
cd server && npm test
```

Unit tests cover the age-range rules, phone format, message request limits, media unlock rules, moderation decisions and edit/delete windows. There are **no automated tests yet** for the API, database or client; contributions are welcome.

---

## Deployment notes

- Serve the client and API over **HTTPS**. Camera, microphone, push notifications and installing the PWA all require it (localhost is exempt).
- Set a strong `JWT_SECRET`, `NODE_ENV=production`, `CLIENT_URL` and `OPENAI_API_KEY`. Install `ffmpeg` on the server for video checks.
- Run PostgreSQL with backups. Run `npm run db:init` after every update (it only adds what is missing).
- Several servers: set `REDIS_URL`, and move uploads off local disk (`server/private-uploads/`) to shared, private object storage.
- Never commit `.env` or `server/private-uploads/`. Both are in `.gitignore`.
- Uploaded files are private: they are served only through authenticated, access-checked endpoints.

---

## Limitations

- **Screenshots and screen recording cannot be blocked in a web app.** View-once and self-destruct media use deterrents only (hide on window switch, no save or download, watermark with the viewer's name, and an honest on-screen notice). Real blocking needs a native wrapper, for example Capacitor with a privacy-screen plugin.
- Without `OPENAI_API_KEY`, moderation is a short keyword list and media is not checked.
- Age is self-declared. The live selfie plus admin review is the age check; there is no automated age estimation.
- Music and non-speech audio are not checked. Moderation accuracy is lower for some languages and Nigerian Pidgin, so keep human review for reports.
- Messages are protected in transit and at rest on the server but are **not end-to-end encrypted** (the server must read them to moderate).
- On-device translation depends on the browser (recent Chrome).
- Uploads are stored on local disk and rate limiting is in memory unless `REDIS_URL` is set.
- The app lock PIN is a local deterrent only and cannot protect against someone who controls the device.

---

## Before you launch

This app handles sensitive data (faces, ages, sexual orientation, private messages) and involves minors. Treat these as required, not optional:

- [ ] Get **legal review** for your markets: child safety and age rules, data protection (GDPR, Nigeria's NDPA, Illinois BIPA for face images, and others), and app store dating-app policies. Nigeria's NDPA may require registering with the NDPC.
- [ ] Complete and publish a real privacy policy and terms. `docs/PRIVACY-TEMPLATE.md` is only an outline.
- [ ] Decide whether under-18 users are in scope at all, and how parental consent works where required.
- [ ] Set up human moderators, an abuse-report process and a way to report illegal content to the relevant authorities.
- [ ] Do a security review and penetration test; add rate limiting and monitoring at the edge.
- [ ] The rainbow flag and country fields can put users at risk in places where being LGBTQ is criminalized. They are off by default and consent-gated; keep it that way and consider region-specific defaults.

---

## Roadmap

- Native wrapper (Capacitor) for real screenshot and screen-recording blocking
- Server-side translation fallback for browsers without the Translator API
- Automated age estimation on the signup selfie
- Message reactions and passkey or biometric unlock
- API and end-to-end test suites
- S3-compatible storage for uploads

---

## Contributing

Issues and pull requests are welcome. Please keep changes small and focused, add or update unit tests when you touch `server/src/rules.js`, and do not weaken the safety rules (age separation, consent gating, fail-closed moderation) without discussion.

---

## License

No license has been chosen yet. Add one (for example MIT) before making the repository public.
