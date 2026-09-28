const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const ffmpeg = path.resolve('work/reel-tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe');
const backup = 'C:/Users/adomb/Documents/Codex/kingadom-video-originals-2026-09-10';
const html = fs.readFileSync('index.html', 'utf8');
const films = [...new Set([...html.matchAll(/data-video="([^"]+)"/g)].map(m => m[1]))];
const cuts = JSON.parse(fs.readFileSync('work/reel/cuts.json', 'utf8'));
const items = [...films, 'videos/homepage-showreel.mp4'];
for (const dir of [backup, 'work/optimized', 'videos/previews', 'images/video-posters']) fs.mkdirSync(dir, { recursive: true });
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const metadata = file => {
  const p = spawnSync(ffmpeg, ['-hide_banner', '-i', file], { encoding: 'utf8', windowsHide: true });
  if (p.error) throw p.error;
  const match = p.stderr.match(/Duration: (\d+):(\d+):([\d.]+)/);
  if (!match) throw Error('Unreadable video: ' + file);
  return { duration: +match[1] * 3600 + +match[2] * 60 + +match[3], audio: /Audio:/.test(p.stderr), description: p.stderr };
};
function run(args) {
  const result = spawnSync(ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'error', ...args], { encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) throw result.error || Error(result.stderr);
}
const report = [];
for (let index = 0; index < items.length; index++) {
  const file = items[index];
  const name = path.basename(file);
  const original = path.join(backup, name);
  const beforeHash = hash(file);
  if (fs.existsSync(original)) {
    if (hash(original) !== beforeHash) throw Error('Backup exists with different content: ' + name);
  } else fs.copyFileSync(file, original, fs.constants.COPYFILE_EXCL);
  if (hash(original) !== beforeHash) throw Error('Backup verification failed: ' + name);
  const info = metadata(original);
  const isHero = name === 'homepage-showreel.mp4';
  const optimized = path.join('work/optimized', name);
  const fit = isHero ? 'scale=960:540:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1,fps=24' : "scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1";
  run(['-threads', '2', '-i', original, '-map', '0:v:0', '-map', '0:a:0?', '-vf', fit, '-filter_threads', '1',
    '-c:v', 'libx264', '-threads', '2', '-preset', 'fast', '-crf', isHero ? '27' : '24', '-maxrate', isHero ? '850k' : '1800k',
    '-bufsize', isHero ? '1700k' : '3600k', '-fpsmax', '30', '-pix_fmt', 'yuv420p',
    ...(isHero ? ['-an'] : ['-c:a', 'aac', '-b:a', '96k']), '-map_metadata', '-1', '-movflags', '+faststart', '-y', optimized]);
  const afterInfo = metadata(optimized);
  if (Math.abs(afterInfo.duration - info.duration) > .2 || (!isHero && afterInfo.audio !== info.audio)) throw Error('Duration/audio mismatch: ' + name);
  if (!/Video: h264/.test(afterInfo.description)) throw Error('Unexpected output codec: ' + name);
  // Full decode verifies the staged video before it can replace the served copy.
  run(['-threads', '1', '-i', optimized, '-f', 'null', 'NUL']);
  if (!isHero) {
    const start = cuts.find(cut => cut.source === file)?.start ?? Math.min(3, info.duration * .2);
    const preview = 'videos/previews/' + name;
    run(['-threads', '1', '-ss', String(start), '-i', original, '-t', '3', '-an', '-vf',
      "scale=w='min(640,iw)':h='min(360,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1,fps=15", '-filter_threads', '1',
      '-c:v', 'libx264', '-threads', '2', '-preset', 'veryfast', '-crf', '28', '-maxrate', '450k', '-bufsize', '900k',
      '-pix_fmt', 'yuv420p', '-map_metadata', '-1', '-movflags', '+faststart', '-y', preview]);
    run(['-ss', '1', '-i', preview, '-frames:v', '1', '-q:v', '4', '-y', 'images/video-posters/' + name.replace('.mp4', '.jpg')]);
  }
  const before = fs.statSync(file).size;
  const candidate = fs.statSync(optimized).size;
  report.push({ file, original, before, after: Math.min(candidate, before), replace: candidate < before, optimized, originalHash: beforeHash, duration: info.duration });
  console.log(`${index + 1}/${items.length} ${name}: ${(before / 1e6).toFixed(1)} MB -> ${(Math.min(candidate, before) / 1e6).toFixed(1)} MB`);
  fs.writeFileSync('work/optimized/report.json', JSON.stringify(report, null, 2));
}
// Publish only after every output passes verification and all originals are safe.
for (const item of report) {
  if (hash(item.file) !== item.originalHash) throw Error('Source changed during conversion: ' + item.file);
  if (item.replace) fs.copyFileSync(item.optimized, item.file);
}
const before = report.reduce((n, row) => n + row.before, 0), after = report.reduce((n, row) => n + row.after, 0);
console.log(JSON.stringify({ beforeMB: before / 1e6, afterMB: after / 1e6, savingPercent: 100 * (1 - after / before), backup }));
