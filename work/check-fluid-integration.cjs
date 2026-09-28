const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const code = fs.readFileSync('fluid-hero.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
assert.match(html, /<canvas id="hero-fluid"/);
assert.match(html, /src="fluid-hero.js"/);
assert.match(html, /href="fluid-hero\.css(?:\?v=\d+)?"/);
const embedded = code.match(/const cameraTexture = "data:image\/jpeg;base64,([^\"]+)"/)[1];
assert.ok(Buffer.from(embedded, 'base64').equals(fs.readFileSync('images/camera-exploded.jpg')));
class Element {
  constructor() {
    this.classes = new Set(); this.listeners = {}; this.open = false;
    this.classList = { add: x => this.classes.add(x), remove: x => this.classes.delete(x),
      contains: x => this.classes.has(x), toggle: (x, force) => force ? this.classes.add(x) : this.classes.delete(x) };
  }
  addEventListener(name, fn) { this.listeners[name] = fn; }
}
for (const fail of [false, true]) {
  const root = new Element(), canvas = new Element(), hero = new Element(), hint = {}, dialog = new Element();
  const window = new Element(); let sync, pauses = [], disposed = 0;
  const elements = { 'hero-fluid': canvas, home: hero, 'fluid-hint': hint, 'video-modal': dialog };
  const context = vm.createContext({ window,
    document: { documentElement: root, getElementById: id => elements[id] },
    cameraTexture: 'data:image/jpeg;base64,' + embedded,
    createFluid: (_, options) => {
      if (fail) throw Error('WebGL unavailable');
      assert.equal(options.initialPaused, true);
      return { setPaused: value => pauses.push(value), dispose: () => disposed++ };
    },
    MutationObserver: class { constructor(fn) { sync = fn; } observe() {} disconnect() {} },
  });
  vm.runInContext(code.slice(code.indexOf('  function mountHero()'), code.indexOf("  if (document.readyState")) + '\nmountHero();', context);
  assert.equal(hero.classes.has('fluid-ready'), !fail);
  if (!fail) {
    assert.equal(pauses.at(-1), true);
    root.classes.add('page-ready'); sync(); assert.equal(pauses.at(-1), false);
    root.classes.add('motion-paused'); sync(); assert.equal(pauses.at(-1), true);
    root.classes.delete('motion-paused'); sync(); assert.equal(pauses.at(-1), false);
    dialog.open = true; sync(); assert.equal(pauses.at(-1), true);
    dialog.open = false; sync(); assert.equal(pauses.at(-1), false);
    window.listeners.pagehide({ persisted: true }); assert.equal(pauses.at(-1), true);
    window.listeners.pageshow(); assert.equal(pauses.at(-1), false);
    window.listeners.pagehide({ persisted: false }); assert.equal(disposed, 1);
  } else assert.equal(hero.classes.has('fluid-still'), true);
  console.log('PASS website shader integration', fail ? 'fallback' : 'intro, motion, modal, page lifecycle');
}
