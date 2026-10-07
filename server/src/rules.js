// Pure rules, free of database and network code so they can be unit tested.
export function clampPrefs(age, min, max) {
  min = +min || age - 2; max = +max || age + 2;
  if (age < 18) { min = Math.max(min, age - 2, 13); max = Math.min(max, age + 2, 17); } else min = Math.max(min, 18);
  return [Math.min(min, max), max];
}
export const E164 = /^\+[1-9]\d{7,14}$/;
export const cleanPhone = p => String(p || '').replace(/[\s-]/g, '');
export const ephemeralAllowed = (mode, mutualSexual) => mode === 'none' || !!mutualSexual;
export function moderationDecision(v, mutualSexual) {
  if (v.minors) return 'That cannot be sent';
  if (v.sexual && !mutualSexual) return 'Sexual content needs both people to be 18+ and to allow it';
  return null;
}
export const REQUEST_LIMIT = 3; // messages the person who starts a chat can send before the other accepts
export function requestDecision(status, initiator, sender, sentCount) {
  if (status === 'declined') return 'Chat unavailable';
  if (status === 'pending' && initiator === sender && sentCount >= REQUEST_LIMIT) return 'Wait for them to accept your request before sending more';
  return null;
}
export const mediaUnlocked = status => status === 'accepted';
export const EDIT_WINDOW_MS = 15 * 60e3, DELETE_WINDOW_MS = 48 * 3600e3;
export const canEdit = (created, now = Date.now()) => now - +new Date(created) <= EDIT_WINDOW_MS;
export const canDelete = (created, now = Date.now()) => now - +new Date(created) <= DELETE_WINDOW_MS;
