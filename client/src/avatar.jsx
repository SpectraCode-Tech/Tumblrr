import { useEffect, useState } from 'react';
import { API, tok } from './api.js';
const COLORS = [['#7c5cff', '#4b2fd0'], ['#2dd4bf', '#0f766e'], ['#fb7185', '#be123c'], ['#fbbf24', '#b45309'], ['#60a5fa', '#1d4ed8'], ['#c084fc', '#7e22ce'], ['#22d3ee', '#0e7490']], cache = new Map();
export function Avatar({ name, id, av, size = 42, ring }) {
  const key = id + ':' + av, [url, setUrl] = useState(cache.get(key));
  useEffect(() => {
    if (!av) { setUrl(); return; }
    if (cache.has(key)) { setUrl(cache.get(key)); return; }
    let off = false;
    fetch(`${API}/api/users/${id}/avatar?v=${av}`, { headers: { Authorization: 'Bearer ' + tok.get() } })
      .then(r => (r.ok ? r.blob() : Promise.reject())).then(b => { const u = URL.createObjectURL(b); cache.set(key, u); if (!off) setUrl(u); }).catch(() => {});
    return () => { off = true; };
  }, [key]);
  return <span className={'av' + (ring ? ' ring-' + ring : '')} style={{ width: size, height: size, fontSize: size * 0.42, background: url ? 'var(--field)' : `linear-gradient(135deg, ${COLORS[(id || 0) % COLORS.length][0]}, ${COLORS[(id || 0) % COLORS.length][1]})` }}>
    {url ? <img src={url} alt="" /> : (name || '?')[0].toUpperCase()}</span>;
}
