const fs = require('node:fs');
const assert = require('node:assert/strict');
const html = fs.readFileSync('index.html', 'utf8');
const films = [
  ['presec-speech-day-01.mp4', 'Presec Speech Day', 'events'],
  ['presec-speech-day-02.mp4', 'Presec Speech Day', 'events'],
  ['vintage-gala.mp4', 'Vintage Gala', 'events'],
  ['presec-talent-show.mp4', 'Presec Talent Show', 'events'],
  ['cafe-boho.mp4', 'Cafe Boho', 'social'],
  ['supercar-spectacle-26.mp4', 'Supercar Spectacle ’26', 'events'],
];
const articles = [...html.matchAll(/<article\b[\s\S]*?<\/article>/g)].map(m => m[0]);
for (const [file, title, category] of films) {
  const matches = articles.filter(card => card.includes(`data-video="videos/${file}"`));
  assert.equal(matches.length, 1);
  assert.ok(matches[0].includes(`data-title="${title}"`));
  assert.ok(matches[0].includes(`data-category="${category}"`));
  assert.ok(matches[0].includes(`<h3>${title}</h3>`));
  assert.ok(matches[0].includes(`data-preview="videos/previews/${file}"`));
  assert.ok(matches[0].includes(`poster="images/video-posters/${file.replace('.mp4','.jpg')}"`));
  assert.ok(!matches[0].includes('coming-soon'));
  const bytes = fs.readFileSync('videos/' + file);
  assert.ok(bytes.length > 1000);
  assert.ok(bytes.includes(Buffer.from('avc1')), file + ' uses H.264');
  assert.ok(bytes.includes(Buffer.from('moov')), file + ' finalized');
  if (['cafe-boho.mp4', 'supercar-spectacle-26.mp4', 'vintage-gala.mp4'].includes(file)) {
    assert.ok(bytes.indexOf(Buffer.from('moov')) < bytes.indexOf(Buffer.from('mdat')), file + ' fast-start metadata');
  }
  console.log('PASS', category, title, file);
}
