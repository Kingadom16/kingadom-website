const fs = require('node:fs');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const html = fs.readFileSync('index.html', 'utf8');
const cards = [...html.matchAll(/<article\b[^>]*class="project-card[^>]*>[\s\S]*?<\/article>/g)].map(m => m[0]);
assert.equal(cards.length, 16);
let previewBytes = 0, posterBytes = 0;
for(const card of cards) {
  assert.ok(!/<source\b[^>]*\bsrc=/.test(card), 'cards never preload full movies');
  assert.ok(/preload="none"/.test(card));
  const preview = card.match(/data-preview="([^"]+)"/)[1];
  const poster = card.match(/poster="([^"]+)"/)[1];
  assert.ok(fs.statSync(preview).size < 512000, 'preview stays under 500KB');
  assert.ok(fs.statSync(poster).size < 100000, 'cover stays under 100KB');
  previewBytes += fs.statSync(preview).size; posterBytes += fs.statSync(poster).size;
}
const hero = html.match(/<video[^>]*id="hero-showreel"[\s\S]*?<\/video>/)[0];
assert.ok(/data-src="videos\/homepage-showreel.mp4"/.test(hero));
assert.ok(!/<source\b[^>]*\bsrc=/.test(hero));
const report = JSON.parse(fs.readFileSync('work/optimized/report.json'));
assert.equal(report.length, 13);
for(const row of report) {
  assert.equal(fs.statSync(row.file).size, row.after);
  assert.ok(row.after <= row.before);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(row.original)).digest('hex'), row.originalHash, 'original backup verified');
}
console.log(JSON.stringify({ servedBeforeMB: report.reduce((n, r) => n + r.before, 0) / 1e6,
  servedAfterMB: report.reduce((n, r) => n + r.after, 0) / 1e6, totalPreviewMB: previewBytes / 1e6, totalCoverKB: posterBytes / 1000 }));
console.log('PASS lazy full-film loading, lightweight previews, covers, and intact original backups');
