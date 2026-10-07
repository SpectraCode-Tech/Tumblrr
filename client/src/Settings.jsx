import { useEffect, useState } from 'react';
import { api } from './api.js'; import { lockStore } from './lock.js'; import { Icon, Pride } from './icons.jsx'; import { Avatar } from './avatar.jsx';
import { toast, confirmDialog, promptDialog } from './ui.jsx'; import { toJpeg } from './img.js';

function Profile({ me, reload }) {
  const [name, setName] = useState(me.name), [about, setAbout] = useState(me.about || ''), [busy, setBusy] = useState(false);
  const pick = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return; setBusy(true);
    try { const b = await toJpeg(f, { size: 320 }), fd = new FormData(); fd.append('file', b, 'avatar.jpg'); await api('/api/me/avatar', { method: 'POST', body: fd }); await reload(); toast('Photo updated'); }
    catch (x) { toast(x.message || 'Could not use that photo'); }
    setBusy(false);
  };
  const save = async () => { try { await api('/api/me/profile', { method: 'PUT', body: { name, about } }); await reload(); toast('Saved'); } catch (x) { toast(x.message); } };
  return <div className="sbody">
    <div className="pfp"><Avatar name={me.name} id={me.id} av={me.av} size={120} />
      <label className="cam" aria-label="Change photo"><Icon n="camera" s={20} /><input type="file" accept="image/*" hidden onChange={pick} disabled={busy} /></label></div>
    {me.av && <button className="link center" onClick={async () => { await api('/api/me/avatar', { method: 'DELETE' }); reload(); }}>Remove photo</button>}
    <label className="fld">Name<input value={name} maxLength={30} onChange={e => setName(e.target.value)} /></label>
    <label className="fld">About<input value={about} maxLength={140} placeholder="Say something about yourself" onChange={e => setAbout(e.target.value)} /></label>
    <p className="hint">Your photo is shown only to people in your accepted chats. Adults can also choose to show it in Discover under Privacy.</p>
    <button className="primary" onClick={save}>Save</button></div>;
}
function Blocked() {
  const [list, setList] = useState(null);
  const load = () => api('/api/blocks').then(setList);
  useEffect(() => { load(); }, []);
  const unblock = async u => { await api(`/api/block/${u.id}`, { method: 'DELETE' }); toast(`${u.name} unblocked`); load(); };
  if (!list) return <p className="empty">Loading…</p>;
  return <div className="sbody">{list.length ? list.map(u => <div className="set-row" key={u.id}><Avatar name={u.name} id={u.id} /><span><b>{u.name}</b></span><button onClick={() => unblock(u)}>Unblock</button></div>)
    : <p className="empty">You have not blocked anyone.</p>}</div>;
}
function Security() {
  const [pin, setPin] = useState(''), [has, setHas] = useState(lockStore.has());
  return <div className="sbody"><div className="set-row static"><Icon n="lock" /><span><b>App lock</b><small>Ask for a PIN when you come back to the app after a minute away.</small></span></div>
    {has ? <button onClick={() => { lockStore.clear(); setHas(false); toast('App lock removed'); }}>Remove PIN</button>
      : <div className="row"><input type="password" inputMode="numeric" maxLength={8} placeholder="New PIN (4 to 8 digits)" value={pin} onChange={e => setPin(e.target.value)} />
        <button className="primary" onClick={async () => { if (/^[0-9]{4,8}$/.test(pin)) { await lockStore.set(pin); setHas(true); setPin(''); toast('App lock on'); } else toast('Use 4 to 8 digits'); }}>Set PIN</button></div>}
    <p className="hint">The PIN locks this device only. It keeps casual snoopers out but cannot protect against someone who controls your phone.</p></div>;
}

export default function SettingsPanel({ me, reload, onLogout, pushOn, onPush, pushSupported, adminView }) {
  const [page, setPage] = useState('home');
  const save = async patch => { try { await api('/api/me/settings', { method: 'PUT', body: patch }); reload(); } catch (x) { toast(x.message); } };
  const tog = (k, col, title, sub) => <label className="set-row"><span><b>{title}</b><small>{sub}</small></span>
    <span className="switch"><input type="checkbox" checked={!!me[col]} onChange={e => save({ [k]: e.target.checked })} /><i /></span></label>;
  const item = (icon, title, sub, to, danger) => <button className={'set-row nav' + (danger ? ' danger' : '')} onClick={() => (typeof to === 'function' ? to() : setPage(to))}>
    <Icon n={icon} /><span><b>{title}</b>{sub && <small>{sub}</small>}</span>{typeof to !== 'function' && <Icon n="arrow" s={18} />}</button>;
  const head = t => <div className="sub-head"><button className="ico" onClick={() => setPage('home')} aria-label="Back"><Icon n="back" /></button><b>{t}</b></div>;
  const deleteAccount = async () => {
    if ((await promptDialog('This permanently erases your profile, photo and messages. Type DELETE to confirm.')) !== 'DELETE') return;
    try { await api('/api/me', { method: 'DELETE' }); onLogout(); } catch (x) { toast(x.message); }
  };
  if (page === 'profile') return <>{head('Profile')}<Profile me={me} reload={reload} /></>;
  if (page === 'admin') return <>{head('Admin')}{adminView}</>;
  if (page === 'blocked') return <>{head('Blocked contacts')}<Blocked /></>;
  if (page === 'security') return <>{head('Security')}<Security /></>;
  if (page === 'privacy') return <>{head('Privacy')}<div className="sbody"><div className="group">
    {tog('photoPublic', 'photo_public', 'Show my photo in Discover', 'Adults only. Otherwise only people in your accepted chats see it.')}
    {tog('hideOnline', 'hide_online', 'Hide online status', 'You will not see theirs either.')}
    {tog('hideReceipts', 'hide_receipts', 'Hide read receipts', 'You will not see theirs either.')}
    {tog('showFlag', 'is_lgbtq', 'Rainbow flag', 'Shown only to people you chose to share your info with.')}</div></div></>;
  if (page === 'notifications') return <>{head('Notifications')}<div className="sbody">
    <div className="group">{tog('discreetPush', 'discreet_push', 'Discreet notifications', 'No names or message text on your lock screen.')}</div>
    {pushSupported && !pushOn && <button className="primary" onClick={onPush}>Turn on notifications</button>}
    {pushOn && <p className="hint">Notifications are on for this device.</p>}</div></>;
  if (page === 'account') return <>{head('Account')}<div className="sbody"><button className="danger-btn" onClick={deleteAccount}><Icon n="trash" s={18} /> Delete my account</button>
    <p className="hint">This erases your profile, photo, selfie and messages. Reports about abuse are kept for safety.</p></div></>;
  return <div className="sbody">
    <button className="set-row nav profile-card" onClick={() => setPage('profile')}><Avatar name={me.name} id={me.id} av={me.av} size={64} />
      <span><b>{me.name} {me.is_lgbtq && <Pride />}</b><small>{me.about || 'Add an about'}</small></span><Icon n="arrow" s={18} /></button>
    <div className="group">{item('lock', 'Privacy', 'Photo, online status, receipts, flag', 'privacy')}
    {item('bell', 'Notifications', 'Discreet alerts and device setup', 'notifications')}
    {item('shield', 'Security', 'App lock PIN', 'security')}
    {item('ban', 'Blocked contacts', 'Unblock people', 'blocked')}
    {item('user', 'Account', 'Delete my account', 'account')}</div>
    <div className="group">{me.is_admin && item('shield', 'Admin', 'Selfie checks and reports', 'admin')}
    {item('logout', 'Log out', '', onLogout, true)}</div></div>;
}
