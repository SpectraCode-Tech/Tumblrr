import { useEffect, useState } from 'react';
import { Icon } from './icons.jsx';
// Friendly empty state used by lists.
export const Empty = ({ icon, title, sub }) => <div className="empty rich"><span className="eic"><Icon n={icon} s={30} /></span><b>{title}</b><span>{sub}</span></div>;
// In-app toasts and dialogs, used instead of the browser's alert/confirm/prompt.
let push = () => {};
export const toast = text => push({ type: 'toast', text });
export const confirmDialog = (text, yes = 'Confirm') => new Promise(res => push({ type: 'confirm', text, yes, res }));
export const promptDialog = (text, value = '') => new Promise(res => push({ type: 'prompt', text, value, res }));
export function Host() {
  const [items, setItems] = useState([]), [val, setVal] = useState('');
  useEffect(() => {
    push = it => { const id = Math.random(); setItems(o => [...o, { ...it, id }]); if (it.type === 'toast') setTimeout(() => setItems(o => o.filter(x => x.id !== id)), 3500); else setVal(it.value || ''); };
    return () => { push = () => {}; };
  }, []);
  const done = (it, v) => { it.res(v); setItems(o => o.filter(x => x.id !== it.id)); };
  const dlg = items.find(i => i.type !== 'toast');
  return <>
    <div className="toasts" aria-live="polite">{items.filter(i => i.type === 'toast').map(i => <div key={i.id} className="toast">{i.text}</div>)}</div>
    {dlg && <div className="modal" onClick={() => done(dlg, dlg.type === 'prompt' ? null : false)}><div className="dialog" role="dialog" onClick={e => e.stopPropagation()}>
      <p>{dlg.text}</p>
      {dlg.type === 'prompt' && <input autoFocus value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && done(dlg, val)} />}
      <div className="row"><button onClick={() => done(dlg, dlg.type === 'prompt' ? null : false)}>Cancel</button>
        <button className="primary" onClick={() => done(dlg, dlg.type === 'prompt' ? val : true)}>{dlg.type === 'prompt' ? 'OK' : dlg.yes}</button></div></div></div>}
  </>;
}
