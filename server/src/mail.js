// Email via Resend. Without RESEND_API_KEY the message is printed to the server console (dev only).
export async function sendEmail(to, subject, html) {
  if (!process.env.RESEND_API_KEY) { console.log('[dev email]', to, '|', subject, '|', html.replace(/<[^>]+>/g, '')); return; }
  const r = await fetch('https://api.resend.com/emails', { method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.MAIL_FROM || 'AgeGap <onboarding@resend.dev>', to: [to], subject, html }) });
  if (!r.ok) throw new Error('Resend ' + r.status + ' ' + (await r.text()));
}
