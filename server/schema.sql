create table if not exists users(
  id serial primary key, email text unique not null, password_hash text not null, name text not null,
  birthdate date not null, gender text not null, seeking text[] not null, is_lgbtq boolean default false,
  country text, age_min int not null, age_max int not null, selfie_path text not null, created_at timestamptz default now());
create table if not exists chats(id serial primary key, user_a int references users(id), user_b int references users(id), unique(user_a,user_b));
create table if not exists consents(chat_id int references chats(id), user_id int references users(id),
  share_info boolean default false, allow_sexual boolean default false, primary key(chat_id,user_id));
create table if not exists messages(id serial primary key, chat_id int references chats(id), sender int references users(id), body text not null, created_at timestamptz default now());
create table if not exists blocks(blocker int references users(id), blocked int references users(id), primary key(blocker,blocked));
create table if not exists reports(id serial primary key, reporter int references users(id), reported int references users(id), reason text, created_at timestamptz default now());
alter table users alter column selfie_path drop not null;
alter table users add column if not exists verified boolean default false;
alter table users add column if not exists banned boolean default false;
alter table users add column if not exists is_admin boolean default false;
create table if not exists push_subs(id serial primary key, user_id int references users(id) on delete cascade, endpoint text unique not null, p256dh text not null, auth text not null);
alter table users add column if not exists email_verified boolean default false;
alter table users add column if not exists phone text;
alter table users add column if not exists phone_verified boolean default false;
create unique index if not exists users_phone_verified on users(phone) where phone_verified;
create table if not exists verifications(user_id int references users(id) on delete cascade, kind text, code_hash text not null, expires_at timestamptz not null, attempts int default 0, primary key(user_id,kind));
create table if not exists media(id text primary key, chat_id int references chats(id), sender int references users(id), kind text not null, mime text not null, path text,
  mode text not null default 'none', ttl_seconds int, viewed_at timestamptz, deleted boolean default false, created_at timestamptz default now());
alter table messages add column if not exists media_id text references media(id);
alter table chats add column if not exists status text default 'accepted';
alter table chats add column if not exists initiator int;
alter table chats add column if not exists created_at timestamptz default now();
alter table messages add column if not exists read_at timestamptz;
alter table users add column if not exists hide_online boolean default false;
alter table users add column if not exists hide_receipts boolean default false;
alter table users add column if not exists discreet_push boolean default true;
alter table messages add column if not exists edited_at timestamptz;
alter table messages add column if not exists deleted_at timestamptz;
create table if not exists message_edits(id serial primary key, message_id int references messages(id), old_body text not null, edited_at timestamptz default now());
alter table users add column if not exists about text;
alter table users add column if not exists avatar_path text;
alter table users add column if not exists avatar_mime text;
alter table users add column if not exists avatar_v int;
alter table users add column if not exists photo_public boolean default false;
create table if not exists statuses(id serial primary key, user_id int references users(id), kind text not null, body text, bg text, mime text, path text, created_at timestamptz default now(), expires_at timestamptz default now() + interval '24 hours');
create table if not exists status_views(status_id int references statuses(id) on delete cascade, viewer int references users(id), primary key(status_id, viewer));
create table if not exists chat_prefs(chat_id int references chats(id) on delete cascade, user_id int references users(id), pinned boolean default false, archived boolean default false, primary key(chat_id, user_id));
alter table messages add column if not exists reply_to int references messages(id);
