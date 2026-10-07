// Resizes in the browser (also strips photo metadata such as GPS location). size = square crop, max = longest edge.
export async function toJpeg(file, { size, max }) {
  const bmp = await createImageBitmap(file), c = document.createElement('canvas'), ctx = c.getContext('2d');
  if (size) { const side = Math.min(bmp.width, bmp.height); c.width = c.height = size; ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size); }
  else { const k = Math.min(1, max / Math.max(bmp.width, bmp.height)); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); ctx.drawImage(bmp, 0, 0, c.width, c.height); }
  return new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
}
