const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const sharp = require('C:/Users/adomb/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const ffmpeg = path.resolve('work/reel-tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe');
const html = fs.readFileSync('index.html', 'utf8');
const cards = [...html.matchAll(/<article\b[^>]*data-category="(events|editing|social)"[^>]*data-video="([^"]+)"[^>]*data-title="([^"]+)"/g)];
fs.mkdirSync('work/reel', { recursive: true });
function run(args) {
  const result = spawnSync(ffmpeg, ['-nostdin', '-hide_banner', '-threads', '1', ...args], { encoding: 'utf8', windowsHide: true });
  if (result.error) throw result.error;
  return result;
}
(async () => {
  const manifest = [];
  for (let index = 0; index < cards.length; index++) {
    const [, category, file, title] = cards[index];
    const probe = run(['-i', file]).stderr;
    const d = probe.match(/Duration: (\d+):(\d+):([\d.]+)/);
    if (!d) throw Error('No duration: ' + file);
    const duration = Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]);
    const times = [.18, .38, .58, .78].map(part => Math.min(duration - 3.1, duration * part));
    const frames = [];
    for (let j = 0; j < times.length; j++) {
      const output = `work/reel/${index}-${j}.jpg`;
      const result = run(['-v', 'error', '-ss', String(times[j]), '-i', file, '-frames:v', '1', '-vf', 'scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2', '-filter_threads', '1', '-y', output]);
      if (result.status) throw Error(result.stderr);
      frames.push({ input: output, left: j * 320, top: 30 });
    }
    const label = `${index + 1}. ${title} | ` + times.map((t, i) => `${String.fromCharCode(65 + i)}: ${t.toFixed(1)}s`).join(' / ');
    const escaped = label.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
    frames.push({ input: Buffer.from(`<svg width="1280" height="30"><rect width="100%" height="100%" fill="#111"/><text x="10" y="21" font-size="17" font-family="Arial" fill="white">${escaped}</text></svg>`), left: 0, top: 0 });
    await sharp({ create: { width: 1280, height: 210, channels: 3, background: '#111' } }).composite(frames).jpeg({ quality: 83 }).toFile(`work/reel/sheet-${index + 1}.jpg`);
    manifest.push({ index: index + 1, category, file, title, duration, times });
    console.log(label);
  }
  fs.writeFileSync('work/reel/sources.json', JSON.stringify(manifest, null, 2));
  for (let group = 0; group < Math.ceil(manifest.length / 4); group++) {
    const count = Math.min(4, manifest.length - group * 4);
    await sharp({ create: { width: 1280, height: count * 210, channels: 3, background: '#111' } })
      .composite(Array.from({ length: count }, (_, i) => ({ input: `work/reel/sheet-${group * 4 + i + 1}.jpg`, left: 0, top: i * 210 })))
      .jpeg({ quality: 88 }).toFile(`work/reel/review-${group + 1}.jpg`);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
