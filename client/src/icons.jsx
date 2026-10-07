import * as P from '@phosphor-icons/react';
// Phosphor icons (regular, bold and fill weights). The hand-drawn set below is only a fallback if a name is missing.
// One consistent line-icon set (24px grid, 1.8 stroke) plus the brand mark.
const S = {
  chat: <path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-5 4v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />,
  status: <><circle cx="12" cy="12" r="8.5" strokeDasharray="3.2 2.6" /><circle cx="12" cy="12" r="3.2" /></>,
  people: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17" cy="9" r="2.4" /><path d="M17 14c2.5 0 4 1.8 4 4.5" /></>,
  inbox: <><path d="M3 13l2.2-7.2a2 2 0 0 1 1.9-1.4h9.8a2 2 0 0 1 1.9 1.4L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M3 13h5l1.5 2.5h5L16 13h5" /></>,
  sliders: <><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
  bell: <><path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 21h4" /></>,
  back: <path d="M19 12H5M11 6l-6 6 6 6" />,
  arrow: <path d="M9 5l7 7-7 7" />,
  more: <><circle cx="12" cy="5" r="1.4" fill="currentColor" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /><circle cx="12" cy="19" r="1.4" fill="currentColor" /></>,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
  send: <><path d="M21 3L10 14" /><path d="M21 3l-6.5 18-3.5-7.5L3.5 10z" /></>,
  clip: <path d="M20 11l-8.2 8.2a5 5 0 0 1-7.1-7.1l8.6-8.6a3.4 3.4 0 0 1 4.8 4.8l-8.6 8.6a1.8 1.8 0 0 1-2.5-2.5L15 7" />,
  trash: <path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13M10 11v5M14 11v5" />,
  check: <path d="M5 12.5l4.2 4.2L19 7" />,
  checks: <><path d="M1.5 12.5l4.2 4.2L14 8.5" /><path d="M10 15.5l1.2 1.2L21 7" /></>,
  play: <path d="M8 5.5v13l11-6.5z" fill="currentColor" />,
  pause: <><rect x="6.5" y="5" width="3.8" height="14" rx="1" fill="currentColor" /><rect x="13.7" y="5" width="3.8" height="14" rx="1" fill="currentColor" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="10" rx="2.2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>,
  shield: <><path d="M12 3l7.5 3v5.5c0 4.5-3.1 8-7.5 9.5-4.4-1.5-7.5-5-7.5-9.5V6z" /><path d="M9 12l2.2 2.2L15.5 10" /></>,
  camera: <><path d="M4 8h3l1.6-2.2h6.8L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13" r="3.6" /></>,
  image: <><rect x="3.5" y="4.5" width="17" height="15" rx="2.2" /><circle cx="9" cy="10" r="1.6" /><path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5" /></>,
  ban: <><circle cx="12" cy="12" r="8.5" /><path d="M6 6l12 12" /></>,
  logout: <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 8l4 4-4 4M19 12H9" />,
  pencil: <path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z" />,
  globe: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.2 3.5 8.5S14.4 18.1 12 20.5C9.6 18.1 8.5 15.3 8.5 12S9.6 5.9 12 3.5z" /></>,
  user: <><circle cx="12" cy="8.5" r="3.6" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></>,
  type: <path d="M5 6.5V5h14v1.5M12 5v14M9 19h6" />,
  archive: <><path d="M4 7h16v3.5H4zM6 10.5V19a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-8.5M10 14h4" /></>,
  pin: <path d="M9 4h6l-1 6 3 3H7l3-3zM12 13v7" />,
  reply: <path d="M9 7L4 12l5 5M4 12h10a6 6 0 0 1 6 6" />,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
  translate: <path d="M4 6h9M8.5 4v2M6 6c.7 3.2 2.6 5.4 5.5 6.6M11 6c-.4 3.5-3 6.3-6.5 7.4M13.5 20l4-9 4 9M15 16.8h5" />,
  down: <path d="M6 9l6 6 6-6" />,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
};
const MAP = { chat: 'ChatCircleDots', status: 'CircleDashed', people: 'UsersThree', inbox: 'Tray', sliders: 'Sliders', bell: 'Bell', back: 'ArrowLeft', arrow: 'CaretRight', more: 'DotsThreeVertical', mic: 'Microphone', send: 'PaperPlaneRight', clip: 'Paperclip', trash: 'Trash', check: 'Check', checks: 'Checks', play: 'Play', pause: 'Pause', plus: 'Plus', close: 'X', search: 'MagnifyingGlass', lock: 'Lock', shield: 'ShieldCheck', camera: 'Camera', image: 'Image', ban: 'Prohibit', logout: 'SignOut', pencil: 'PencilSimple', globe: 'Globe', user: 'User', eye: 'Eye', type: 'TextAa', clock: 'Clock', archive: 'Archive', pin: 'PushPin', reply: 'ArrowBendUpLeft', copy: 'Copy', translate: 'Translate', down: 'CaretDown' };
export const Icon = ({ n, s = 22, weight = 'regular', ...p }) => {
  const C = P[MAP[n]];
  return C ? <C size={s} weight={weight} aria-hidden="true" {...p} />
    : <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>{S[n]}</svg>;
};

export const Logo = ({ size = 34, text = true }) => <span className="logo">
  <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true"><defs><linearGradient id="lgrad" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#7556ff" /><stop offset="1" stopColor="#3a1fb5" /></linearGradient></defs>
    <rect width="40" height="40" rx="11" fill="url(#lgrad)" /><path d="M11 12a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-7l-5 4v-4a3 3 0 0 1-3-3z" fill="#fff" />
    <circle cx="16.5" cy="16" r="1.6" fill="#4b2fd0" /><circle cx="23.5" cy="16" r="1.6" fill="#4b2fd0" /></svg>{text && <b>Tumblrr</b>}</span>;

const STRIPES = ['#e40303', '#ff8c00', '#ffed00', '#008026', '#004dff', '#750787'];
export const Pride = ({ w = 18 }) => <svg className="pride" width={w} height={w * 0.72} viewBox="0 0 18 13" role="img" aria-label="Rainbow flag">{STRIPES.map((c, i) => <rect key={c} y={i * 13 / 6} width="18" height={13 / 6 + 0.1} fill={c} />)}</svg>;
export const OnceBadge = ({ timed }) => <span className="once">{timed ? <Icon n="clock" s={14} /> : '1'}</span>;

// Light, crisp "new chat" mark: a speech bubble outline with a plus inside.
export const NewChat = ({ s = 26 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-5 4v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" /><path d="M12 8.5v5M9.5 11h5" /></svg>;
