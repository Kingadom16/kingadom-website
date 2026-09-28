const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('index.html', 'utf8');
assert.ok(!/Only Demon Slayer|Worldwide|worldwide|id="bts"|href="#bts"|fluid-draw-cue|fluid-hint/.test(html));
assert.ok(html.includes('projects within Ghana only'));
assert.ok(fs.readFileSync('images/director-kingadom.jpg').equals(fs.readFileSync('C:/Users/adomb/Desktop/KINGADOM edits/Snapchat-1130518937.jpg')));
assert.equal(JSON.parse(fs.readFileSync('work/reel/cuts.json')).length, 12);
assert.equal(JSON.parse(fs.readFileSync('work/reel/cuts.json')).reduce((sum, c) => sum + c.duration, 0), 36);
class Events {
  constructor() { this.events = {}; }
  addEventListener(name, fn) { (this.events[name] ||= []).push(fn); }
  removeEventListener(name, fn) { this.events[name] = this.events[name]?.filter(f => f !== fn); }
  fire(name, event = {}) { this.events[name]?.forEach(fn => fn(event)); }
}
for (const [reducedInitially, saveDataInitially] of [[false, false], [true, false], [false, true]]) {
  const classes = new Set();
  const root = { classList: { contains: name => classes.has(name) } };
  const document = new Events(), window = new Events(), media = new Events();
  let plays = 0, paused = true, changed, entered;
  media.matches = reducedInitially;
  const video = { dataset: { src: 'videos/homepage-showreel.mp4' }, getAttribute() { return this.src; }, play() { plays++; paused = false; return Promise.resolve(); }, pause() { paused = true; } };
  const hero = {}, modal = { open: false };
  document.documentElement = root; document.hidden = false;
  document.getElementById = id => ({ 'hero-showreel': video, home: hero, 'video-modal': modal })[id];
  window.matchMedia = () => media;
  class IO { constructor(fn) { entered = fn; } observe() {} disconnect() {} }
  window.IntersectionObserver = IO;
  const connection = new Events(); connection.saveData = saveDataInitially;
  const context = { document, window, navigator: { connection }, IntersectionObserver: IO, MutationObserver: class { constructor(fn) { changed = fn; } observe() {} disconnect() {} } };
  vm.runInNewContext(fs.readFileSync('hero-reel.js', 'utf8'), context);
  document.fire('DOMContentLoaded');
  entered([{ isIntersecting: true }]); assert.equal(plays, 0);
  assert.equal(video.src, undefined, 'no background video requested before intro finishes');
  classes.add('page-ready'); changed();
  assert.equal(plays, reducedInitially || saveDataInitially ? 0 : 1);
  if(reducedInitially || saveDataInitially)assert.equal(video.src, undefined, 'no video request when automatic motion is disabled');
  assert.equal(video.muted, true);
  media.matches = false; connection.saveData = false; connection.fire('change'); media.fire('change'); assert.equal(paused, false);
  classes.add('motion-paused'); changed(); assert.equal(paused, true);
  classes.delete('motion-paused'); changed(); assert.equal(paused, false);
  modal.open = true; changed(); assert.equal(paused, true);
  modal.open = false; changed(); assert.equal(paused, false);
  entered([{ isIntersecting: false }]); assert.equal(paused, true);
  entered([{ isIntersecting: true }]); assert.equal(paused, false);
  document.hidden = true; document.fire('visibilitychange'); assert.equal(paused, true);
  document.hidden = false; document.fire('visibilitychange'); assert.equal(paused, false);
  window.fire('pagehide', { persisted: true }); assert.equal(paused, true);
  window.fire('pageshow'); assert.equal(paused, false);
  console.log('PASS homepage reel: reduced motion, intro, mute, pause/resume, viewport, modal, visibility', reducedInitially);
}
console.log('PASS requested content, unchanged portrait bytes, 12 three-second excerpts');
