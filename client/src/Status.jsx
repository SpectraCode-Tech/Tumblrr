import { useEffect, useMemo, useRef, useState } from 'react';
import { api, API, tok } from './api.js'; import { Icon } from './icons.jsx'; import { Avatar } from './avatar.jsx'; import { toast, confirmDialog, Empty } from './ui.jsx'; import { toJpeg } from './img.js';
const BG = ['#4b2fd0', '#0f766e', '#be123c', '#b45309', '#1d4ed8', '#6d28d9', '#334155'];
const hm = d => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function Composer({ onClose, onPosted }) {
  const [text, setText] = useState(''), [bg, setBg] = useState(BG[0]), [busy, setBusy] = useState(false);
  const ta = useRef();
  useEffect(() => { const t = ta.current; if (t) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; } }, [text]);
  const post = async () => { setBusy(true); try { await api('/api/status', { method: 'POST', body: { text, bg } }); onPosted(); } catch (x) { toast(x.message); setBusy(false); } };
  return <div className="compose" style={{ background: bg }}>
    <header><button className="ico light" onClick={onClose} aria-label="Close"><Icon n="close" /></button><span className="grow" />
      {BG.map(c => <button key={c} className={'dot' + (c === bg ? ' on' : '')} style={{ background: c }} onClick={() => setBg(c)} aria-label="Background colour" />)}</header>
    <textarea ref={ta} rows={1} autoFocus maxLength={300} placeholder="Type a status" value={text} onChange={e => setText(e.target.value)} />
    <button className="send fab" disabled={!text.trim() || busy} onClick={post} aria-label="Post status"><Icon n="send" weight="fill" /></button></div>;
}

function Viewer({ groups, start, me, onClose, onChange }) {
  const [g, setG] = useState(start), [i, setI] = useState(0), [url, setUrl] = useState();
  const grp = groups[g], it = grp?.items[i], mineS = grp?.user_id === me.id;
  const next = () => { if (i + 1 < grp.items.length) setI(i + 1); else if (g + 1 < groups.length) { setG(g + 1); setI(0); } else onClose(); };
  const prev = () => { if (i > 0) setI(i - 1); else if (g > 0) { setG(g - 1); setI(0); } };
  useEffect(() => {
    if (!it) return;
    setUrl(); let off = false;
    if (!mineS) api(`/api/status/${it.id}/view`, { method: 'POST' }).then(onChange).catch(() => {});
    if (it.kind === 'image') fetch(`${API}/api/status/${it.id}/media`, { headers: { Authorization: 'Bearer ' + tok.get() } }).then(r => r.blob()).then(b => { if (!off) setUrl(URL.createObjectURL(b)); }).catch(() => {});
    const t = setTimeout(next, 5000);
    return () => { off = true; clearTimeout(t); };
  }, [g, i]);
  if (!it) return null;
  const del = async () => { if (await confirmDialog('Delete this status update?', 'Delete')) { await api(`/api/status/${it.id}`, { method: 'DELETE' }); onChange(); onClose(); } };
  return <div className="sview" role="dialog" aria-label="Status" onClick={e => e.target === e.currentTarget && onClose()}><div className="scard">
    <div className="bars">{grp.items.map((x, k) => <i key={x.id}><b className={k < i ? 'full' : k === i ? 'run' : ''} /></i>)}</div>
    <header><Avatar name={grp.name} id={grp.user_id} av={grp.av} size={38} /><div><b>{mineS ? 'My status' : grp.name}</b><small>{hm(it.created_at)}</small></div><span className="grow" />
      {mineS && <><small>{it.views} {it.views === 1 ? 'view' : 'views'}</small><button className="ico light" onClick={del} aria-label="Delete"><Icon n="trash" /></button></>}
      <button className="ico light" onClick={onClose} aria-label="Close"><Icon n="close" /></button></header>
    <div className="stage" onClick={e => (e.clientX < window.innerWidth / 3 ? prev() : next())}>
      {it.kind === 'text' ? <div className="txt" style={{ background: it.bg }}><p>{it.body}</p></div>
        : <>{url ? <img src={url} alt="Status" /> : <div className="spin" />}{it.body && <p className="cap">{it.body}</p>}</>}</div></div></div>;
}

export default function StatusTab({ me }) {
  const [feed, setFeed] = useState([]), [compose, setCompose] = useState(false), [view, setView] = useState(null);
  const load = () => api('/api/status').then(setFeed).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, []);
  const groups = useMemo(() => {
    const m = new Map(); feed.forEach(s => { if (!m.has(s.user_id)) m.set(s.user_id, { user_id: s.user_id, name: s.name, av: s.av, items: [] }); m.get(s.user_id).items.push(s); });
    const all = [...m.values()], unseen = g => g.items.some(x => !x.seen);
    return [...all.filter(g => g.user_id === me.id), ...all.filter(g => g.user_id !== me.id).sort((a, b) => unseen(b) - unseen(a))];
  }, [feed]);
  const mineG = groups.find(g => g.user_id === me.id), others = groups.filter(g => g.user_id !== me.id);
  const photo = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { const b = await toJpeg(f, { max: 1280 }), fd = new FormData(); fd.append('file', b, 'status.jpg'); await api('/api/status/image', { method: 'POST', body: fd }); toast('Status posted'); load(); }
    catch (x) { toast(x.message || 'Could not post'); }
  };
  const ringOf = g => (g.items.some(x => !x.seen) ? 'new' : 'seen');
  return <div className="status">
    <div className="srow" onClick={() => (mineG ? setView(0) : setCompose(true))}><Avatar name={me.name} id={me.id} av={me.av} size={50} ring={mineG ? 'mine' : ''} />
      <div><b>My status</b><small>{mineG ? `${mineG.items.length} update${mineG.items.length > 1 ? 's' : ''}` : 'Tap to add a status update'}</small></div></div>
    <h4>Recent updates</h4>
    {others.length ? others.map(g => <div className="srow" key={g.user_id} onClick={() => setView(groups.indexOf(g))}><Avatar name={g.name} id={g.user_id} av={g.av} size={50} ring={ringOf(g)} />
      <div><b>{g.name}</b><small>{hm(g.items[g.items.length - 1].created_at)}</small></div></div>) : <Empty icon="status" title="No updates yet" sub="Status updates from people you chat with will show up here." />}
    <p className="hint pad">Status updates disappear after 24 hours and are only seen by people in your accepted chats.</p>
    <div className="fabs"><button className="fab sm" onClick={() => setCompose(true)} aria-label="Text status"><Icon n="pencil" /></button>
      <label className="fab" aria-label="Photo status"><Icon n="camera" s={24} weight="bold" /><input type="file" accept="image/*" hidden onChange={photo} /></label></div>
    {compose && <Composer onClose={() => setCompose(false)} onPosted={() => { setCompose(false); toast('Status posted'); load(); }} />}
    {view !== null && <Viewer groups={groups} start={view} me={me} onClose={() => setView(null)} onChange={load} />}
  </div>;
}
