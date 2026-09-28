const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ffmpeg = path.resolve('work/reel-tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe');
const sources = JSON.parse(fs.readFileSync('work/reel/sources.json', 'utf8'));
// Chosen after reviewing four candidate frames per source. Avoid intro cards,
// blurred whip pans and dark interstitials; retain every visible portfolio film.
const choices = [0, 2, 0, 3, 0, 1, 1, 3, 0, 3, 2, 2];
const refinements = { 0: 3.5, 8: 20.0, 11: 32.0 };
function run(args) {
  const result = spawnSync(ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'error', ...args], { encoding: 'utf8', windowsHide: true });
  if (result.error || result.status) throw result.error || Error(result.stderr);
}
const cuts = [];
for (let i = 0; i < sources.length; i++) {
  const source = sources[i];
  const start = refinements[i] ?? Math.max(0, source.times[choices[i]] - .4);
  const file = `work/reel/cut-${String(i + 1).padStart(2, '0')}.mp4`;
  const filter = '[0:v]split[bg][fg];[bg]scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,boxblur=10:1[back];[fg]scale=1280:720:force_original_aspect_ratio=decrease[front];[back][front]overlay=(W-w)/2:(H-h)/2:shortest=1,setsar=1,fps=24,format=yuv420p[v]';
  if (!process.argv.includes('--revise') || i in refinements) run(['-threads', '1', '-ss', start.toFixed(3), '-i', source.file, '-filter_complex_threads', '1', '-filter_complex', filter,
    '-map', '[v]', '-t', '3', '-an', '-c:v', 'libx264', '-threads', '2', '-preset', 'veryfast', '-crf', '23', '-map_metadata', '-1', '-y', file]);
  cuts.push({ title: source.title, source: source.file, start, duration: 3, file });
  console.log(`Rendered ${i + 1}/${sources.length}: ${source.title}`);
}
fs.writeFileSync('work/reel/cuts.json', JSON.stringify(cuts, null, 2));
fs.writeFileSync('work/reel/concat.txt', cuts.map(cut => `file '${path.basename(cut.file)}'`).join('\n'));
run(['-f', 'concat', '-safe', '0', '-i', 'work/reel/concat.txt', '-c', 'copy', '-movflags', '+faststart', '-y', 'videos/homepage-showreel.mp4']);
run(['-ss', '1', '-i', 'videos/homepage-showreel.mp4', '-frames:v', '1', '-q:v', '3', '-y', 'images/homepage-reel-poster.jpg']);
// Three frames per selected excerpt verify the exported reel, not just the source.
run(['-i', 'videos/homepage-showreel.mp4', '-vf', 'fps=1,scale=320:180,tile=6x6', '-frames:v', '1', '-filter_threads', '1', '-y', 'work/reel/final-review.jpg']);
console.log('Finished: 36 seconds, 12 excerpts, silent H.264 background.');
