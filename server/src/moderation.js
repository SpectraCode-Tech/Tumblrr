// Text, image, video and voice moderation using OpenAI (omni-moderation-latest, whisper-1). Videos: sampled frames plus soundtrack via ffmpeg.
import fs from 'fs'; import os from 'os'; import path from 'path'; import { execFile } from 'child_process'; import { promisify } from 'util';
const run = promisify(execFile), WORDS = /\b(sex|sexy|nude|nudes|naked|porn|horny|fuck|fucking|fucked|dick|cock|pussy|boobs|tits|cum|blowjob|handjob|anal|orgasm|nsfw)\b/i;
const verdict = res => ({ sexual: res.some(r => r.categories.sexual), minors: res.some(r => r.categories['sexual/minors']) });
const merge = (a, b) => ({ sexual: a.sexual || b.sexual, minors: a.minors || b.minors });
async function openai(input) {
  const r = await fetch('https://api.openai.com/v1/moderations', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.OPENAI_API_KEY },
    body: JSON.stringify({ model: 'omni-moderation-latest', input }) });
  if (!r.ok) throw new Error('moderation ' + r.status);
  return (await r.json()).results;
}
export async function sexualCheck(text) {
  if (process.env.OPENAI_API_KEY) {
    try { return verdict(await openai(text)); } catch (e) { console.error('moderation failed, using keywords:', e.message); }
  }
  return { sexual: WORDS.test(text), minors: false };
}
async function transcribe(file, mime) {
  const ext = mime.includes('webm') ? 'webm' : mime.includes('ogg') ? 'ogg' : mime.includes('wav') ? 'wav' : mime.includes('mpeg') ? 'mp3' : 'm4a';
  const fd = new FormData(); fd.append('model', 'whisper-1'); fd.append('file', new Blob([fs.readFileSync(file)], { type: mime }), 'audio.' + ext);
  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY }, body: fd });
  if (!r.ok) throw new Error('transcription ' + r.status);
  return (await r.json()).text || '';
}
async function speechVerdict(file, mime) {
  const text = (await transcribe(file, mime)).trim();
  return text ? verdict(await openai(text)) : { sexual: false, minors: false }; // silence or music: nothing to check
}
// Throws when the file cannot be checked. The caller must then NOT send it (fail closed).
export async function mediaCheck(file, mime) {
  if (!process.env.OPENAI_API_KEY) {
    if (process.env.NODE_ENV === 'production') throw new Error('Media moderation is not configured');
    console.warn('[dev] media is NOT being moderated (no OPENAI_API_KEY)'); return { sexual: false, minors: false };
  }
  if (mime.startsWith('audio/')) return speechVerdict(file, mime);
  let frames = [file], tmp;
  if (mime.startsWith('video/')) {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'frames-'));
    await run('ffmpeg', ['-v', 'error', '-i', file, '-vf', 'fps=1/2,scale=512:-2', '-frames:v', '4', path.join(tmp, 'f%d.jpg')]);
    frames = fs.readdirSync(tmp).map(f => path.join(tmp, f));
    if (!frames.length) throw new Error('No frames could be read');
  }
  try {
    let v = verdict(await openai(frames.map(f => ({ type: 'image_url', image_url: { url: `data:${f === file ? mime : 'image/jpeg'};base64,${fs.readFileSync(f).toString('base64')}` } }))));
    if (tmp) { // video: check the soundtrack too
      const wav = path.join(tmp, 'sound.wav'); let hasAudio = true;
      try { await run('ffmpeg', ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', '16000', '-t', '120', wav]); } catch { hasAudio = false; } // no audio track
      if (hasAudio) v = merge(v, await speechVerdict(wav, 'audio/wav'));
    }
    return v;
  } finally { if (tmp) fs.rmSync(tmp, { recursive: true, force: true }); }
}
