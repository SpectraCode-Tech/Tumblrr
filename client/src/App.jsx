import { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api, API, tok, enablePush, pushSupported, translateText } from './api.js';
import { lockStore } from './lock.js';
import { Icon, Logo, Pride, OnceBadge, NewChat } from './icons.jsx'; import { Avatar } from './avatar.jsx'; import { toast, confirmDialog, promptDialog, Empty } from './ui.jsx';
import Chat from './Chat.jsx'; import Landing from './Landing.jsx'; import SettingsPanel from './Settings.jsx'; import StatusTab from './Status.jsx';

const GENDERS = ['woman', 'man', 'nonbinary'];
const Flag = () => <Pride />;

const hm = d => (d ? new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');
const when = d => (!d ? '' : new Date(d).toDateString() === new Date().toDateString() ? hm(d) : new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short' }));
const fmt = t => (isFinite(t) ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}` : '');
const KIND = { audio: 'Voice message', video: 'Video', image: 'Photo' };

function Selfie({ onCapture }) {
  const v = useRef(), [on, setOn] = useState(false), [done, setDone] = useState(false);
  const start = async () => { const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } }); v.current.srcObject = s; setOn(true); };
  const snap = () => {
    const c = document.createElement('canvas'); c.width = v.current.videoWidth; c.height = v.current.videoHeight;
    c.getContext('2d').drawImage(v.current, 0, 0); v.current.srcObject.getTracks().forEach(t => t.stop());
    c.toBlob(b => { onCapture(b); setDone(true); setOn(false); }, 'image/jpeg', 0.85);
  };
  return <div className="selfie"><video ref={v} autoPlay playsInline muted hidden={!on} />
    {done ? <p className="ok">Selfie captured. It is stored privately and not shown on your profile.</p>
      : on ? <button type="button" onClick={snap}>Take selfie</button>
      : <button type="button" onClick={start}>Open camera for your signup selfie</button>}</div>;
}

function Auth({ onAuth, startReg, onBack }) {
  const [reg, setReg] = useState(!!startReg), [f, setF] = useState({ seeking: [], ageMin: 18, ageMax: 30, isLgbtq: false, gender: 'woman' }), [selfie, setSelfie] = useState(), [err, setErr] = useState('');
  const set = (k, v) => setF(o => ({ ...o, [k]: v }));
  const toggle = g => set('seeking', f.seeking.includes(g) ? f.seeking.filter(x => x !== g) : [...f.seeking, g]);
  const submit = async e => {
    e.preventDefault(); setErr('');
    try {
      if (!reg) return onAuth((await api('/api/login', { method: 'POST', body: f })).token);
      if (!selfie) throw new Error('Take your signup selfie first');
      if (!f.seeking.length) throw new Error('Choose who you want to meet');
      const fd = new FormData(); Object.entries({ ...f, seeking: JSON.stringify(f.seeking) }).forEach(([k, v]) => fd.append(k, v)); fd.append('selfie', selfie, 'selfie.jpg');
      onAuth((await api('/api/register', { method: 'POST', body: fd })).token);
    } catch (x) { setErr(x.message); }
  };
  return <form className="auth" onSubmit={submit}>
    <button type="button" className="link back-link" onClick={onBack}><Icon n="back" s={18} /> Back</button><Logo size={40} /><p className="sub">Meet people your age, on your terms.</p>
    {reg && <input placeholder="Display name" required onChange={e => set('name', e.target.value)} />}
    <input type="email" placeholder="Email" required onChange={e => set('email', e.target.value)} />
    <input type="password" placeholder="Password (8+ characters)" minLength={8} required onChange={e => set('password', e.target.value)} />
    {reg && <>
      <label>Date of birth<input type="date" required onChange={e => set('birthdate', e.target.value)} /></label>
      <label>I am<select value={f.gender} onChange={e => set('gender', e.target.value)}>{GENDERS.map(g => <option key={g}>{g}</option>)}</select></label>
      <fieldset><legend>I want to meet</legend>{GENDERS.map(g => <label key={g} className="chk"><input type="checkbox" onChange={() => toggle(g)} />{g}</label>)}</fieldset>
      <div className="row"><label>Youngest<input type="number" min="13" max="99" value={f.ageMin} onChange={e => set('ageMin', e.target.value)} /></label>
        <label>Oldest<input type="number" min="13" max="99" value={f.ageMax} onChange={e => set('ageMax', e.target.value)} /></label></div>
      <p className="hint">Under 18? You will only match people under 18 within 2 years of your age.</p>
      <label className="chk"><input type="checkbox" onChange={e => set('isLgbtq', e.target.checked)} />Allow a rainbow flag, shown only to people I choose to share my info with</label>
      <input placeholder="Your country (hidden until you both agree)" required onChange={e => set('country', e.target.value)} />
      <Selfie onCapture={setSelfie} /></>}
    {err && <p className="err" role="alert">{err}</p>}
    <button className="primary">{reg ? 'Create account' : 'Log in'}</button>
    <button type="button" className="link" onClick={() => setReg(!reg)}>{reg ? 'I already have an account' : 'Create an account'}</button>
  </form>;
}



function Admin() {
  const [d, setD] = useState({ reports: [], pending: [] }), [imgs, setImgs] = useState({});
  const load = () => api('/api/admin/overview').then(x => { setD(x); x.pending.forEach(p => fetch(API + '/api/admin/selfie/' + p.id, { headers: { Authorization: 'Bearer ' + tok.get() } }).then(r => r.blob()).then(b => setImgs(o => ({ ...o, [p.id]: URL.createObjectURL(b) })))); });
  useEffect(() => { load(); }, []);
  const act = async (id, what) => { await api(`/api/admin/users/${id}/${what}`, { method: 'POST' }); load(); };
  return <div className="admin"><h3>Selfie checks</h3>
    {d.pending.map(p => <div key={p.id} className="card">{imgs[p.id] && <img src={imgs[p.id]} alt="Signup selfie" />}<p>{p.name} says they are {p.age}. Does the selfie fit?</p>
      <div className="row"><button onClick={() => act(p.id, 'verify')}>Approve</button><button onClick={() => act(p.id, 'ban')}>Ban</button></div></div>)}
    {!d.pending.length && <p className="empty">No selfies to review.</p>}
    <h3>Reports</h3>{d.reports.map(r => <div key={r.id} className="card"><p><b>{r.name}</b> (user {r.reported}): {r.reason || 'No reason given'}</p><button onClick={() => act(r.reported, 'ban')}>Ban user</button></div>)}
    {!d.reports.length && <p className="empty">No reports.</p>}</div>;
}

function Verify({ me, onDone, onLogout }) {
  const step = me.email_verified ? 'phone' : 'email';
  const [phone, setPhone] = useState(''), [code, setCode] = useState(''), [sent, setSent] = useState(step === 'email'), [msg, setMsg] = useState('');
  const run = async fn => { setMsg(''); try { await fn(); } catch (x) { setMsg(x.message); } };
  const send = () => run(async () => { await api(`/api/verify/${step}/send`, { method: 'POST', body: { phone } }); setSent(true); setMsg('Code sent.'); });
  const check = e => { e.preventDefault(); run(async () => { await api(`/api/verify/${step}/check`, { method: 'POST', body: { code, phone } }); setCode(''); setSent(false); onDone(); }); };
  return <form className="auth" onSubmit={check}>
    <h1>{step === 'email' ? 'Check your email' : 'Verify your phone'}</h1>
    <p className="sub">{step === 'email' ? 'Enter the 6-digit code we emailed you, or request a new one.' : 'Enter your number with country code. We will text you a 6-digit code.'}</p>
    {step === 'phone' && <input type="tel" placeholder="+2348012345678" value={phone} onChange={e => setPhone(e.target.value)} />}
    {sent && <input inputMode="numeric" maxLength={6} placeholder="6-digit code" value={code} onChange={e => setCode(e.target.value)} required />}
    {msg && <p className={msg === 'Code sent.' ? 'ok' : 'err'} role="alert">{msg}</p>}
    {sent && <button className="primary">Verify</button>}
    <button type="button" onClick={send}>{sent ? 'Send a new code' : 'Send code'}</button>
    <button type="button" className="link" onClick={onLogout}>Log out</button>
  </form>;
}

function Unlock({ onUnlock, onLogout }) {
  const [pin, setPin] = useState(''), [err, setErr] = useState('');
  const go = async e => { e.preventDefault(); if (await lockStore.check(pin)) onUnlock(); else { setErr('Wrong PIN'); setPin(''); } };
  return <form className="auth" onSubmit={go}><h1>Locked</h1>
    <input type="password" inputMode="numeric" autoFocus placeholder="PIN" value={pin} onChange={e => setPin(e.target.value)} />
    {err && <p className="err" role="alert">{err}</p>}
    <button className="primary">Unlock</button><button type="button" className="link" onClick={onLogout}>Log out</button></form>;
}

export default function App() {
  const [authed, setAuthed] = useState(!!tok.get()), [me, setMe] = useState(), [tab, setTab] = useState('chats'), [people, setPeople] = useState([]), [chats, setChats] = useState([]), [active, setActive] = useState(), [socket, setSocket] = useState();
  const [pushOn, setPushOn] = useState(pushSupported && Notification.permission === 'granted');
  const [locked, setLocked] = useState(lockStore.has()), [settings, setSettings] = useState(false), [q, setQ] = useState(''), [screen, setScreen] = useState('landing'), [filter, setFilter] = useState('all'), [sheet, setSheet] = useState(null), [menu, setMenu] = useState(false), [showArchived, setShowArchived] = useState(false), [ready, setReady] = useState(false), lp = useRef(false);
  useEffect(() => { // lock again after a minute in the background
    let away = 0; const f = () => { if (document.hidden) away = Date.now(); else if (away && lockStore.has() && Date.now() - away > 60000) setLocked(true); };
    document.addEventListener('visibilitychange', f); return () => document.removeEventListener('visibilitychange', f);
  }, []);
  const login = t => { tok.set(t); setAuthed(true); };
  const logout = async () => {
    try { const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
      if (sub) { await api('/api/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }); await sub.unsubscribe(); setPushOn(false); } } catch {}
    tok.clear(); lockStore.clear(); socket?.disconnect(); setAuthed(false); setMe(); };
  const refresh = () => { api('/api/chats').then(c => { setChats(c); setReady(true); }); api('/api/discover').then(setPeople); };
  useEffect(() => {
    if (!authed) return;
    api('/api/me').then(setMe).catch(logout); refresh();
    const s = io(API, { auth: { token: tok.get() } }); setSocket(s); s.on('message', refresh); return () => s.disconnect();
  }, [authed]);
  if (authed && locked) return <Unlock onUnlock={() => setLocked(false)} onLogout={logout} />;
  if (!authed) return screen === 'landing' ? <Landing onStart={setScreen} /> : <Auth onAuth={login} startReg={screen === 'register'} onBack={() => setScreen('landing')} />;
  if (!me || !socket) return <div className="splash"><Logo size={60} text={false} /><div className="spinner" /></div>;
  if (!me.email_verified || (me.needsPhone && !me.phone_verified)) return <Verify me={me} onDone={() => api('/api/me').then(setMe)} onLogout={logout} />;
  const open = async p => { try { const c = await api(`/api/chats/${p.id}`, { method: 'POST' }); setActive({ id: c.id, other_id: p.id, name: p.name }); setTab('chats'); refresh(); } catch (x) { toast(x.message); } };
  const incoming = chats.filter(c => c.status === 'pending' && c.initiator !== me.id), mine = chats.filter(c => !(c.status === 'pending' && c.initiator !== me.id));
  const live = mine.filter(c => !c.archived), archived = mine.filter(c => c.archived);
  const unreadTotal = live.reduce((n, c) => n + (c.unread || 0), 0);
  const has = n => n.toLowerCase().includes(q.toLowerCase());
  const pool = showArchived ? archived : filter === 'requests' ? incoming : filter === 'unread' ? live.filter(c => c.unread > 0) : live;
  const items = pool.filter(c => has(c.name)), found = people.filter(p => has(p.name));
  const go = k => { setTab(k); setQ(''); setShowArchived(false); setMenu(false); if (k === 'find') refresh(); };
  const titles = { chats: 'Tumblrr', status: 'Updates', find: 'Discover', settings: 'You' };
  const NAV = [['chats', 'chat', 'Chats', unreadTotal], ['status', 'status', 'Updates', 0], ['find', 'people', 'Discover', 0]];
  const turnOnPush = () => enablePush().then(() => setPushOn(true)).catch(e => toast(e.message));
  const setPrefs = async (c, patch) => { setSheet(null); try { await api(`/api/chats/${c.id}/prefs`, { method: 'PUT', body: patch }); refresh(); } catch (x) { toast(x.message); } };
  const press = c => { let t; const stop = () => clearTimeout(t); return { onPointerDown: () => { lp.current = false; t = setTimeout(() => { lp.current = true; setSheet(c); }, 500); }, onPointerUp: stop, onPointerLeave: stop, onPointerCancel: stop, onContextMenu: e => { e.preventDefault(); lp.current = true; setSheet(c); } }; };
  const preview = c => { const seen = c.last_read && !c.other_hides && !me.hide_receipts; return <p>{c.last_sender === me.id && c.last && <span className={'ptk' + (seen ? ' read' : '')}><Icon n={seen ? 'checks' : 'check'} s={18} weight="bold" /></span>}<span className="tx">{c.status === 'pending' && c.initiator !== me.id ? 'Wants to chat' : c.last || 'Say hello'}</span></p>; };
  return <div className={'shell' + (active ? ' has-chat' : '')}>
    <nav className="rail" aria-label="Main">
      {NAV.map(([k, ic, label, n]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => go(k)} title={label}><span className="pillbg"><Icon n={ic} s={24} weight={tab === k ? (k === 'status' ? 'bold' : 'fill') : 'regular'} />{n > 0 && <b className="bdg">{n}</b>}</span><span className="lbl">{label}</span></button>)}
      <span className="grow" />
      <button className={'mebtn' + (tab === 'settings' ? ' on' : '')} onClick={() => go('settings')} title="You"><span className="pillbg"><Avatar name={me.name} id={me.id} av={me.av} size={26} /></span><span className="lbl">You</span></button>
    </nav>
    <aside className="side">
      <header className="top"><h1>{titles[tab]}</h1>
        {tab === 'chats' && <button className="ico big" title="Photo status" onClick={() => go('status')}><Icon n="camera" s={26} /></button>}
        <div className="menuwrap"><button className="ico big" onClick={() => setMenu(!menu)} aria-label="Menu"><Icon n="more" s={26} /></button>
          {menu && <><div className="scrim" onClick={() => setMenu(false)} /><div className="menu">
            <button onClick={() => go('settings')}><Icon n="sliders" s={20} /> Settings</button>
            {pushSupported && !pushOn && <button onClick={() => { setMenu(false); turnOnPush(); }}><Icon n="bell" s={20} /> Turn on notifications</button>}
            <button onClick={() => { setMenu(false); logout(); }}><Icon n="logout" s={20} /> Log out</button></div></>}</div></header>
      {(tab === 'chats' || tab === 'find') && !showArchived && <div className="search"><Icon n="search" s={22} /><input placeholder="Search" value={q} onChange={e => setQ(e.target.value)} /></div>}
      {tab === 'chats' && !showArchived && <div className="chips">
        <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>All</button>
        <button className={filter === 'unread' ? 'on' : ''} onClick={() => setFilter('unread')}>Unread{live.some(c => c.unread) && <small>{live.filter(c => c.unread).length}</small>}</button>
        <button className={filter === 'requests' ? 'on' : ''} onClick={() => setFilter('requests')}>Requests{incoming.length > 0 && <small>{incoming.length}</small>}</button></div>}
      {tab === 'chats' && showArchived && <div className="subbar"><button className="ico" onClick={() => setShowArchived(false)} aria-label="Back"><Icon n="back" /></button><b>Archived</b></div>}
      {tab === 'settings' ? <div className="scroll settings"><SettingsPanel me={me} reload={() => api('/api/me').then(setMe)} onLogout={logout} pushOn={pushOn} onPush={turnOnPush} pushSupported={pushSupported} adminView={<Admin />} /></div>
        : tab === 'status' ? <div className="scroll"><StatusTab me={me} /></div>
        : <ul className="list">
          {!ready && tab !== 'find' && Array.from({ length: 6 }, (_, i) => <li className="skel" key={i}><i className="sk-av" /><div><i className="sk-line" style={{ width: '45%' }} /><i className="sk-line" style={{ width: '80%' }} /></div></li>)}
          {tab === 'chats' && !showArchived && filter === 'all' && !q && archived.length > 0 && <li className="arch" onClick={() => setShowArchived(true)}><Icon n="archive" s={24} /><b>Archived</b><small>{archived.length}</small></li>}
          {tab === 'chats'
            ? (items.length ? items.map(c => <li key={c.id} className={active?.id === c.id ? 'sel' : ''} {...press(c)} onClick={() => { if (lp.current) { lp.current = false; return; } setActive({ ...c }); }}>
                <Avatar name={c.name} id={c.other_id} av={c.av} size={56} />
                <div className="meta2"><div className="l1"><b>{c.name} {c.flag && <Pride />}</b><small className={c.unread ? 'new' : ''}>{when(c.last_at)}</small></div>
                  <div className="l2">{preview(c)}{c.unread > 0 ? <span className="badge">{c.unread}</span> : c.pinned ? <span className="pin"><Icon n="pin" s={18} weight="fill" /></span> : null}</div></div></li>)
              : ready ? <Empty icon={filter === 'requests' ? 'inbox' : 'chat'} title={filter === 'requests' ? 'No requests' : filter === 'unread' ? 'No unread chats' : 'No chats yet'} sub={filter === 'requests' ? 'When someone wants to chat, it will show up here.' : filter === 'unread' ? 'You are all caught up.' : 'Tap the button below to find someone to talk to.'} /> : null)
            : (found.length ? found.map(p => <li key={p.id} onClick={() => open(p)}><Avatar name={p.name} id={p.id} av={p.av} size={56} />
                <div className="meta2"><div className="l1"><b>{p.name}, {p.age}</b></div><div className="l2"><p><span className="tx">{p.gender} · tap to say hi</span></p></div></div></li>)
              : <Empty icon="people" title="No matches yet" sub="No one fits your age and gender preferences right now. Check back soon." />)}</ul>}
      {tab === 'chats' && !showArchived && <button className="fab" onClick={() => go('find')} aria-label="New chat"><NewChat /></button>}
    </aside>
    <section className="main">{active
      ? <Chat key={active.id} chat={active} me={me} socket={socket} onSeen={refresh} onBack={() => { setActive(); refresh(); }} />
      : <div className="blank"><Logo size={64} text={false} /><h2>Tumblrr</h2><p>Select a chat, or find someone in Discover.</p><small>Messages and media are screened for safety.</small></div>}</section>
    {sheet && <div className="modal sheetwrap" onClick={() => setSheet(null)}><div className="sheet" onClick={e => e.stopPropagation()}><b>{sheet.name}</b>
      <button onClick={() => setPrefs(sheet, { pinned: !sheet.pinned })}><Icon n="pin" /> {sheet.pinned ? 'Unpin chat' : 'Pin chat'}</button>
      <button onClick={() => setPrefs(sheet, { archived: !sheet.archived })}><Icon n="archive" /> {sheet.archived ? 'Unarchive chat' : 'Archive chat'}</button></div></div>}
  </div>;
}
