import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { api, API, tok, translateText } from './api.js';
import { Icon, OnceBadge, Pride } from './icons.jsx';
import { Avatar } from './avatar.jsx';
import { toast, confirmDialog, promptDialog } from './ui.jsx';
import { toJpeg } from './img.js';

const hm = d => (d ? new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');
const fmt = t => (isFinite(t) ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}` : '');
const KIND = { audio: 'Voice message', video: 'Video', image: 'Photo' };
const snippet = m => (m.removed ? 'This message was deleted' : m.media_id || m.kind ? KIND[m.kind] || 'Photo' : m.body);
const day = d => new Date(d).toDateString();
const dayLabel = d => { const x = new Date(d), diff = Math.round((new Date(new Date().toDateString()) - new Date(x.toDateString())) / 864e5); return diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : x.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' }); };
const coarse = () => window.matchMedia('(pointer: coarse)').matches;

function Voice({ url, seed }) {
  const a = useRef(), [p, setP] = useState(0), [on, setOn] = useState(false), [dur, setDur] = useState(0);
  const bars = useMemo(() => Array.from({ length: 28 }, (_, i) => 6 + ((seed * 31 + i * 17) % 18)), [seed]);
  return <div className="voice">
    <audio ref={a} src={url} onLoadedMetadata={e => setDur(e.target.duration)} onTimeUpdate={e => setP(isFinite(e.target.duration) ? e.target.currentTime / e.target.duration : 0)} onEnded={() => { setOn(false); setP(0); }} />
    <button type="button" aria-label={on ? 'Pause' : 'Play'} onClick={() => { on ? a.current.pause() : a.current.play(); setOn(!on); }}><Icon n={on ? 'pause' : 'play'} s={18} weight="fill" /></button>
    <div className="wave">{bars.map((h, i) => <i key={i} style={{ height: h }} className={i / bars.length < p ? 'done' : ''} />)}</div>
    <small>{fmt(p && isFinite(dur) ? p * dur : dur)}</small></div>;
}

// Viewer for view-once and self-destruct media. A web page CANNOT block screenshots or screen recording; these are deterrents only.
function Secure({ who, note, onClose, children }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let t; const hide = () => { clearTimeout(t); setHidden(true); }, show = () => setHidden(document.hidden), vis = () => setHidden(document.hidden);
    const key = e => { if (e.key === 'PrintScreen' || (e.metaKey && e.shiftKey) || (e.ctrlKey && ['p', 's'].includes((e.key || '').toLowerCase()))) { hide(); navigator.clipboard?.writeText(' ').catch(() => {}); t = setTimeout(() => setHidden(false), 2000); } };
    window.addEventListener('blur', hide); window.addEventListener('focus', show); document.addEventListener('visibilitychange', vis); window.addEventListener('keydown', key); window.addEventListener('keyup', key);
    return () => { clearTimeout(t); window.removeEventListener('blur', hide); window.removeEventListener('focus', show); document.removeEventListener('visibilitychange', vis); window.removeEventListener('keydown', key); window.removeEventListener('keyup', key); };
  }, []);
  return <div className="viewer secure" onClick={onClose || undefined} onContextMenu={e => e.preventDefault()} onDragStart={e => e.preventDefault()}>
    <div className="vbox" onClick={e => e.stopPropagation()}>
      {hidden ? <p className="hid">Hidden while you switch windows</p>
        : <>{children}<div className="wm" aria-hidden="true">{Array.from({ length: 12 }, (_, i) => <span key={i}>{who}</span>)}</div></>}
      <p>{note}</p><small className="warn">Screenshots and screen recording cannot be fully blocked in a web browser.</small>
      {onClose && <button onClick={onClose}>Close</button>}</div></div>;
}

function Media({ m, mine, who }) {
  const [url, setUrl] = useState(), [state, setState] = useState(m.deleted ? 'gone' : 'idle'), [err, setErr] = useState('');
  const ephemeral = m.mode !== 'none', label = KIND[m.kind] || 'Photo';
  const close = () => { setUrl(); setState('gone'); };
  const load = async () => {
    setErr('');
    try {
      const r = await fetch(API + '/api/media/' + m.media_id, { headers: { Authorization: 'Bearer ' + tok.get() } });
      if (r.status === 410) return setState('gone');
      if (!r.ok) throw new Error('Could not open this');
      setUrl(URL.createObjectURL(await r.blob())); setState('open');
      if (m.mode === 'timed') setTimeout(close, m.ttl_seconds * 1000);
    } catch (x) { setErr(x.message); }
  };
  useEffect(() => { if (!ephemeral && !m.deleted) load(); }, []);
  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);
  const view = m.kind === 'video' ? <video src={url} controls controlsList="nodownload noremoteplayback" disablePictureInPicture playsInline />
    : m.kind === 'audio' ? <Voice url={url} seed={m.id} /> : <img src={url} alt="Shared" draggable={false} />;
  if (state === 'gone') return <span className="gone">{ephemeral ? 'Opened' : 'Media unavailable'}</span>;
  if (ephemeral && mine) return <span className="vo"><OnceBadge timed={m.mode === 'timed'} /> {label}</span>;
  if (ephemeral) return <>
    {state === 'open' && <Secure who={who} note={m.mode === 'once' ? 'View once' : `Disappears in ${m.ttl_seconds}s`} onClose={m.mode === 'once' ? close : null}>{view}</Secure>}
    <button className="vo" onClick={load}><OnceBadge timed={m.mode === 'timed'} /> {label}</button>{err && <small className="err"> {err}</small>}</>;
  return state === 'open' ? view : <span className="gone">{err || 'Loading…'}</span>;
}

// Choose what to do with a photo, video or voice note before it is sent (view once and self-destruct appear only when both people allow sexual content).
function Preview({ file, canTimed, onSend, onCancel }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]), [mode, setMode] = useState('none');
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const kind = file.type.startsWith('video') ? 'video' : file.type.startsWith('audio') ? 'audio' : 'image';
  return <div className="preview"><header><button className="ico light" onClick={onCancel} aria-label="Cancel"><Icon n="close" /></button></header>
    <div className="pstage">{kind === 'video' ? <video src={url} controls playsInline /> : kind === 'audio' ? <audio src={url} controls /> : <img src={url} alt="Preview" />}</div>
    {canTimed && mode !== 'none' && <p className="phint">Screenshots and screen recording cannot be fully blocked in a web browser.</p>}
    <footer>{canTimed ? <div className="pmode"><button className={mode === 'once' ? 'on' : ''} onClick={() => setMode(mode === 'once' ? 'none' : 'once')}><OnceBadge /> View once</button>
      <button className={mode === 'timed' ? 'on' : ''} onClick={() => setMode(mode === 'timed' ? 'none' : 'timed')}><OnceBadge timed /> 10 s</button></div> : <span className="pmode" />}
      <button className="send" onClick={() => onSend(mode)} aria-label="Send"><Icon n="send" weight="fill" /></button></footer></div>;
}

export default function Chat({ chat, me, socket, onBack, onSeen }) {
  const [msgs, setMsgs] = useState([]), [text, setText] = useState(''), [info, setInfo] = useState(), [open, setOpen] = useState(false), [err, setErr] = useState('');
  const [rec, setRec] = useState(null), [secs, setSecs] = useState(0), [typing, setTyping] = useState(false), [tr, setTr] = useState({});
  const [replyTo, setReplyTo] = useState(null), [ctx, setCtx] = useState(null), [pending, setPending] = useState(null), [flash, setFlash] = useState(null);
  const end = useRef(), tt = useRef(), lastT = useRef(0), cancelRef = useRef(false), timer = useRef(), lpT = useRef(), sw = useRef(null), inputRef = useRef(), latest = useRef({});
  latest.current = { info, replyTo, postFile: (...a) => postFile(...a), setPending };

  const loadInfo = () => api(`/api/chats/${chat.id}/info`).then(setInfo);
  useEffect(() => {
    api(`/api/chats/${chat.id}/messages`).then(setMsgs); loadInfo(); socket.emit('join', chat.id); socket.emit('read', chat.id); setTimeout(onSeen, 600);
    const h = m => { if (m.chatId !== chat.id) return; setMsgs(o => [...o, m]); loadInfo(); socket.emit('read', chat.id); setTimeout(onSeen, 600); };
    const r = d => d.chatId === chat.id && d.by !== me.id && setMsgs(o => o.map(x => (x.sender === me.id ? { ...x, read: true } : x)));
    const ty = d => { if (d.chatId !== chat.id) return; setTyping(true); clearTimeout(tt.current); tt.current = setTimeout(() => setTyping(false), 3000); };
    const del = d => d.chatId === chat.id && setMsgs(o => o.map(x => (x.id === d.id ? { ...x, removed: true } : x)));
    const ed = d => d.chatId === chat.id && setMsgs(o => o.map(x => (x.id === d.id ? { ...x, body: d.body, edited: true } : x)));
    const handlers = { message: h, read: r, typing: ty, deleted: del, edited: ed };
    Object.entries(handlers).forEach(([ev, fn]) => socket.on(ev, fn)); const t = setInterval(loadInfo, 30000);
    return () => { Object.entries(handlers).forEach(([ev, fn]) => socket.off(ev, fn)); clearInterval(t); };
  }, [chat.id]);
  useEffect(() => { end.current?.scrollIntoView(); }, [msgs.length]);
  useEffect(() => { const k = e => { if (e.key === 'Escape') { setCtx(null); setReplyTo(null); } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);

  const reply = m => { setReplyTo(m); setTimeout(() => inputRef.current?.focus(), 0); };
  const jump = id => { document.getElementById('m' + id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); setFlash(id); setTimeout(() => setFlash(null), 1300); };
  const send = e => { e.preventDefault(); if (!text.trim()) return; socket.emit('message', { chatId: chat.id, text, replyTo: replyTo?.id }, r => setErr(r?.error || '')); setText(''); setReplyTo(null); };
  const typed = () => { if (Date.now() - lastT.current > 2000) { lastT.current = Date.now(); socket.emit('typing', chat.id); } };
  const postFile = async (file, mode = 'none') => {
    setErr(''); setPending(null); const { info: inf, replyTo: rt } = latest.current;
    try {
      let f = file; if (f.type.startsWith('image/') && f.type !== 'image/gif') f = new File([await toJpeg(f, { max: 1600 })], 'photo.jpg', { type: 'image/jpeg' });
      const fd = new FormData(); fd.append('mode', inf?.sexualOn ? mode : 'none'); fd.append('ttl', 10); fd.append('replyTo', rt?.id || ''); fd.append('file', f, f.name || 'voice');
      await api(`/api/chats/${chat.id}/media`, { method: 'POST', body: fd }); setReplyTo(null);
    } catch (x) { setErr(x.message); }
  };
  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }), mr = new MediaRecorder(stream), parts = []; cancelRef.current = false;
      mr.ondataavailable = e => parts.push(e.data);
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop()); clearInterval(timer.current); setRec(null);
        if (cancelRef.current || !parts.length) return;
        const f = new File(parts, 'voice', { type: mr.mimeType }), L = latest.current;
        L.info?.sexualOn ? L.setPending(f) : L.postFile(f);
      };
      mr.start(); setRec(mr); setSecs(0);
      timer.current = setInterval(() => setSecs(x => { if (x >= 59 && mr.state === 'recording') mr.stop(); return x + 1; }), 1000);
    } catch { setErr('The microphone is blocked or unavailable'); }
  };
  const stopRec = sendIt => { cancelRef.current = !sendIt; rec?.stop(); };
  const consent = async patch => { setErr(''); try { await api(`/api/chats/${chat.id}/consent`, { method: 'PUT', body: { shareInfo: info.mine.share_info, allowSexual: info.mine.allow_sexual, ...patch } }); loadInfo(); } catch (x) { setErr(x.message); } };
  const editMsg = async m => { const t = await promptDialog('Edit message', m.body); if (t && t.trim() && t !== m.body) try { await api(`/api/messages/${m.id}`, { method: 'PUT', body: { text: t } }); } catch (x) { setErr(x.message); } };
  const delMsg = async m => { if (await confirmDialog('Delete this message for everyone?', 'Delete')) try { await api(`/api/messages/${m.id}`, { method: 'DELETE' }); } catch (x) { setErr(x.message); } };
  const translateMsg = async m => { setTr(o => ({ ...o, [m.id]: '…' })); let out; try { out = await translateText(m.body); } catch { out = 'Translation is not available in this browser or language'; } setTr(o => ({ ...o, [m.id]: out })); };
  const answer = async w => { await api(`/api/chats/${chat.id}/${w}`, { method: 'POST' }); w === 'decline' ? onBack() : loadInfo(); };

  // right-click / long-press menu, and swipe right to reply
  const openMenu = (m, x, y, touch) => setCtx({ m, x, y, touch });
  const gestures = m => ({
    onContextMenu: e => { e.preventDefault(); if (!m.removed) openMenu(m, e.clientX, e.clientY, coarse()); },
    onTouchStart: e => { const t = e.touches[0]; sw.current = { x: t.clientX, y: t.clientY, dx: 0 }; clearTimeout(lpT.current); lpT.current = setTimeout(() => { if (!m.removed && sw.current) { sw.current = null; openMenu(m, 0, 0, true); } }, 500); },
    onTouchMove: e => { const s = sw.current; if (!s) return; const t = e.touches[0], dx = t.clientX - s.x, dy = Math.abs(t.clientY - s.y); if (dx > 8 || dy > 8) clearTimeout(lpT.current); if (dx > 8 && dy < 24 && !m.removed) { s.dx = Math.min(dx, 70); e.currentTarget.style.transform = `translateX(${s.dx}px)`; } },
    onTouchEnd: e => { clearTimeout(lpT.current); const s = sw.current; e.currentTarget.style.transform = ''; if (s && s.dx >= 60 && !m.removed) reply(m); sw.current = null; },
  });
  const menuItems = m => { const mineM = m.sender === me.id; return [
    ['reply', 'Reply', () => reply(m)],
    ...(!m.media_id && m.body ? [['copy', 'Copy', () => navigator.clipboard.writeText(m.body).then(() => toast('Copied'), () => toast('Could not copy'))]] : []),
    ...(!mineM && !m.media_id ? [['translate', 'Translate', () => translateMsg(m)]] : []),
    ...(mineM && !m.media_id && Date.now() - new Date(m.created_at) < 15 * 60e3 ? [['pencil', 'Edit', () => editMsg(m)]] : []),
    ...(mineM ? [['trash', 'Delete for everyone', () => delMsg(m)]] : []),
  ]; };

  return <div className="chat">
    <header className="bar"><button className="ico back" onClick={onBack} aria-label="Back"><Icon n="back" /></button><Avatar name={chat.name} id={chat.other_id} av={chat.av} />
      <div className="who"><b>{chat.name} {info?.flag && <Pride />}</b><small>{typing ? 'typing…' : [info?.online && 'online', info?.country].filter(Boolean).join(' · ')}</small></div>
      <button className="ico" onClick={() => setOpen(!open)} aria-label="Chat options"><Icon n="more" /></button></header>
    {info?.blocked === 'me' && <div className="banner"><b>You blocked {chat.name}.</b><button onClick={async () => { await api(`/api/block/${chat.other_id}`, { method: 'DELETE' }); toast('Unblocked'); loadInfo(); }}>Unblock</button></div>}
    {info?.blocked === 'them' && <p className="banner">You can't send messages in this chat.</p>}
    {info?.status === 'pending' && (info.initiator === me.id
      ? <p className="banner">Waiting for {chat.name} to accept. You can send up to 3 messages until they do, and photos and videos unlock after.</p>
      : <div className="banner"><b>{chat.name} wants to chat.</b><div className="row"><button className="primary" onClick={() => answer('accept')}>Accept</button><button onClick={() => answer('decline')}>Decline</button></div></div>)}
    {open && info && !info.blocked && <div className="panel">
      <label className="chk"><input type="checkbox" checked={info.mine.share_info} onChange={e => consent({ shareInfo: e.target.checked })} />Show my country to {chat.name} <i>({info.theirsShares ? 'they agreed' : 'waiting for them'})</i></label>
      <label className="chk"><input type="checkbox" checked={info.mine.allow_sexual} onChange={e => consent({ allowSexual: e.target.checked })} />Allow sexual content, 18+ only <i>({info.theirsSexual ? 'they agreed' : 'waiting for them'})</i></label>
      <div className="row"><button onClick={async () => { await api(`/api/block/${chat.other_id}`, { method: 'POST' }); toast('Blocked. You can unblock in Settings.'); onBack(); }}>Block</button>
        <button onClick={async () => { const reason = await promptDialog('What happened?'); if (reason === null) return; await api(`/api/report/${chat.other_id}`, { method: 'POST', body: { reason } }); toast('Report sent. Thank you.'); }}>Report</button></div></div>}
    <div className="msgs">{msgs.map((m, i) => { const mineM = m.sender === me.id, newDay = i === 0 || day(msgs[i - 1].created_at) !== day(m.created_at), tail = newDay || msgs[i - 1].sender !== m.sender;
      return <Fragment key={m.id}>{newDay && <div className="dsep"><span>{dayLabel(m.created_at)}</span></div>}<div id={'m' + m.id} className={'line ' + (mineM ? 'out' : 'in') + (flash === m.id ? ' flash' : '')}>
        <div className={'bubble ' + (mineM ? 'me' : 'them') + (tail ? ' tail' : '')} {...gestures(m)}>
          {!m.removed && <button className="chev" aria-label="Message options" onClick={e => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); openMenu(m, r.left - 150, r.bottom, coarse()); }}><Icon n="down" s={16} /></button>}
          {m.reply && !m.removed && <div className="quote" onClick={e => { e.stopPropagation(); jump(m.reply.id); }}><b>{m.reply.sender === me.id ? 'You' : chat.name}</b><span>{snippet(m.reply)}</span></div>}
          {m.removed ? <i className="del"><Icon n="ban" s={14} /> This message was deleted</i> : m.media_id ? <Media m={m} mine={mineM} who={me.name} /> : m.body}
          <span className="meta">{m.edited && !m.removed ? 'edited ' : ''}{hm(m.created_at)}{mineM && !m.removed && <span className={'tk' + (m.read ? ' read' : '')}><Icon n={m.read ? 'checks' : 'check'} s={16} weight="bold" /></span>}</span>
          {tr[m.id] && <small className="tr">{tr[m.id]}</small>}
        </div></div></Fragment>; })}<div ref={end} /></div>
    {err && <p className="err" role="alert">{err}</p>}
    {!info?.blocked && replyTo && <div className="replybar"><div className="q"><b>{replyTo.sender === me.id ? 'You' : chat.name}</b><span>{snippet(replyTo)}</span></div><button className="ico" onClick={() => setReplyTo(null)} aria-label="Cancel reply"><Icon n="close" /></button></div>}
    {info?.blocked ? null : rec
      ? <div className="composer recbar"><button className="ico" onClick={() => stopRec(false)} aria-label="Cancel recording"><Icon n="trash" /></button><span className="reddot" /><span className="timer">{fmt(secs)}</span><span className="slide">Recording…</span>
          <button className="send" onClick={() => stopRec(true)} aria-label="Send voice note"><Icon n="send" weight="fill" /></button></div>
      : <form className="composer" onSubmit={send}><div className="field">
          <label className={'attach' + (info?.status === 'accepted' ? '' : ' off')} title={info?.status === 'accepted' ? 'Attach photo or video' : 'Unlocks once the chat is accepted'} aria-label="Attach photo or video"><Icon n="clip" />
            <input disabled={info?.status !== 'accepted'} type="file" accept="image/*,video/*" hidden onChange={e => { const f = e.target.files[0]; e.target.value = ''; if (f) setPending(f); }} /></label>
          <input ref={inputRef} value={text} onChange={e => { setText(e.target.value); typed(); }} placeholder="Type a message" /></div>
          {text.trim() ? <button className="send" aria-label="Send"><Icon n="send" weight="fill" /></button>
            : <button type="button" className="send" onClick={startRec} disabled={info?.status !== 'accepted'} title={info?.status === 'accepted' ? 'Record voice note' : 'Unlocks once the chat is accepted'} aria-label="Record voice note"><Icon n="mic" weight="fill" /></button>}
        </form>}
    {pending && <Preview file={pending} canTimed={!!info?.sexualOn} onCancel={() => setPending(null)} onSend={mode => postFile(pending, mode)} />}
    {ctx && (() => { const items = menuItems(ctx.m), run = fn => () => { setCtx(null); fn(); };
      return ctx.touch
        ? <div className="modal sheetwrap" onClick={() => setCtx(null)}><div className="sheet" onClick={e => e.stopPropagation()}>{items.map(([ic, label, fn]) => <button key={label} onClick={run(fn)}><Icon n={ic} /> {label}</button>)}</div></div>
        : <><div className="scrim top" onClick={() => setCtx(null)} onContextMenu={e => { e.preventDefault(); setCtx(null); }} />
            <div className="ctx" style={{ left: Math.max(8, Math.min(ctx.x, window.innerWidth - 230)), top: Math.max(8, Math.min(ctx.y, window.innerHeight - items.length * 46 - 16)) }}>{items.map(([ic, label, fn]) => <button key={label} onClick={run(fn)}><Icon n={ic} s={20} /> {label}</button>)}</div></>; })()}
  </div>;
}
