// Local PIN lock. It deters casual snooping on a shared or borrowed phone; it is not protection against someone who controls the device.
const enc = new TextEncoder();
async function hashPin(pin, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 200000, hash: 'SHA-256' }, key, 256);
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}
export const lockStore = {
  has: () => !!localStorage.getItem('pin'),
  async set(pin) { const salt = crypto.randomUUID(); localStorage.setItem('pin', salt + ':' + (await hashPin(pin, salt))); },
  clear: () => localStorage.removeItem('pin'),
  async check(pin) { const [salt, h] = (localStorage.getItem('pin') || '').split(':'); return !!h && h === (await hashPin(pin, salt)); },
};
