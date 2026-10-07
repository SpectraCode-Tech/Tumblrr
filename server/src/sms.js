// Phone codes via Twilio Verify (Twilio generates and checks the code). To use another provider, keep these two exports.
const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_VERIFY_SID: svc } = process.env;
const dev = () => { if (process.env.NODE_ENV === 'production') throw new Error('Twilio keys are missing'); };
const call = (path, params) => fetch(`https://verify.twilio.com/v2/Services/${svc}/${path}`, { method: 'POST',
  headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(params) });
export async function startPhone(to) {
  if (!svc) { dev(); console.log('[dev sms] code for', to, 'is 000000'); return; }
  const r = await call('Verifications', { To: to, Channel: 'sms' });
  if (!r.ok) throw new Error('Twilio ' + r.status + ' ' + (await r.text()));
}
export async function checkPhone(to, code) {
  if (!svc) { dev(); return code === '000000'; }
  const r = await call('VerificationCheck', { To: to, Code: code });
  return r.ok && (await r.json()).status === 'approved';
}
