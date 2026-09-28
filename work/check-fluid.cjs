// Non-browser checks only: mocked GPU calls validate wiring, not GLSL or fps.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const native = process.argv.includes('--native');
const nativeCode = native ? fs.readFileSync('fluid-hero.js', 'utf8') : '';
const source = (native ? nativeCode.slice(nativeCode.indexOf('const VERTEX ='), nativeCode.indexOf('  const cameraTexture =')) : fs.readFileSync('outputs/FluidHero.jsx', 'utf8'))
  .replace(/import React[^;]+;/, '')
  .replace('export default function FluidHero', 'function FluidHero');
class Events {
  constructor() { this.listeners = new Map(); }
  addEventListener(name, fn) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(fn); }
  removeEventListener(name, fn) { this.listeners.get(name)?.delete(fn); }
  emit(name, event = {}) { this.listeners.get(name)?.forEach(fn => fn(event)); }
  count() { return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0); }
}
function scenario({ reduced = false, mobile = false, failShader = false, failFramebuffer = false, noContext = false } = {}) {
  const pending = new Map(); let rafId = 0, draws = 0, created = 0, deleted = 0;
  const uniforms = new Map(); const shaders = []; const observers = [];
  const gl = { FRAGMENT_SHADER: 1, HIGH_FLOAT: 2, COMPILE_STATUS: 3, LINK_STATUS: 4,
    FRAMEBUFFER_COMPLETE: 5, MAX_TEXTURE_SIZE: 6,
    getShaderPrecisionFormat: () => ({ precision: 23 }), getShaderParameter: () => !failShader,
    getProgramParameter: () => true, getShaderInfoLog: () => 'test compile failure',
    getAttribLocation: () => 0, getUniformLocation: (_, name) => name,
    getParameter: () => 4096, checkFramebufferStatus: () => failFramebuffer ? -1 : 5,
    shaderSource: (_, text) => shaders.push(text), isContextLost: () => false,
    uniform1f: (name, a) => uniforms.set(name, a), uniform2f: (name, ...args) => uniforms.set(name, args),
    drawArrays: () => draws++,
  };
  for (const kind of ['Shader', 'Program', 'Texture', 'Framebuffer', 'Buffer']) {
    gl['create' + kind] = () => ({ id: ++created });
    gl['delete' + kind] = () => deleted++;
  }
  for (const name of ['compileShader', 'attachShader', 'linkProgram', 'bindTexture', 'texParameteri', 'texImage2D',
    'bindFramebuffer', 'framebufferTexture2D', 'clearColor', 'clear', 'activeTexture', 'uniform1i',
    'viewport', 'useProgram', 'bindBuffer', 'enableVertexAttribArray', 'vertexAttribPointer', 'bufferData', 'pixelStorei']) gl[name] = () => {};
  const canvas = new Events(); canvas.getContext = () => noContext ? null : gl;
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1200, height: 800 });
  canvas.setPointerCapture = () => {};
  const window = new Events(); window.devicePixelRatio = 3;
  const document = new Events(); document.hidden = false;
  const media = new Events(); media.matches = reduced;
  class Observer {
    constructor(fn) { this.fn = fn; observers.push(this); }
    observe() {} disconnect() { this.disconnected = true; }
  }
  const context = vm.createContext({ window, document,
    matchMedia: (q) => q.includes('coarse') ? { matches: mobile } : media,
    ResizeObserver: Observer, IntersectionObserver: Observer, Float32Array, Uint8Array,
    requestAnimationFrame: (fn) => { const id = ++rafId; pending.set(id, fn); return id; },
    cancelAnimationFrame: (id) => pending.delete(id),
  });
  vm.runInContext(source + '\nthis.make = createFluid;', context);
  const make = () => context.make(canvas, { maxDpr: 1.5, brushRadius: .085, grain: .035, paletteSpeed: .12,
    onReducedMotion: () => {}, onImageError: () => {} });
  if (failShader || failFramebuffer || noContext) {
    assert.throws(make); assert.equal(created, deleted); assert.equal(pending.size, 0); return;
  }
  const engine = make();
  assert.ok(shaders.some(s => s.includes(mobile ? '#define OCTAVES 3' : '#define OCTAVES 4')));
  assert.ok(canvas.width <= 1600);
  const step = now => { const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach(fn => fn(now)); };
  if (reduced) { assert.equal(pending.size, 0); assert.equal(draws, 1); }
  else {
    step(16); assert.equal(draws, 2);
    canvas.emit('pointerdown', { pointerId: 1, isPrimary: true, pointerType: 'touch', clientX: 300, clientY: 400 });
    step(32); assert.equal(uniforms.get('uForce'), native ? 0 : 3.5);
    assert.deepEqual([...uniforms.get('uTo')], native ? [.5, .5] : [.25, .5]);
    if (native) assert.equal(canvas.listeners.has('pointerdown'), false, 'Homepage fluid does not capture touch');
    canvas.emit('pointerup'); step(48); assert.equal(uniforms.get('uForce'), 0);
    engine.setPaused(true); assert.equal(pending.size, 0);
    const before = draws; step(64); assert.equal(draws, before);
    engine.setPaused(false); assert.equal(pending.size, 1);
    document.hidden = true; document.emit('visibilitychange'); assert.equal(pending.size, 0);
    document.hidden = false; document.emit('visibilitychange'); assert.equal(pending.size, 1);
    observers[1].fn([{ isIntersecting: false }]); assert.equal(pending.size, 0);
    observers[1].fn([{ isIntersecting: true }]); assert.equal(pending.size, 1);
    media.matches = true; media.emit('change'); assert.equal(pending.size, 0);
  }
  engine.dispose();
  assert.equal(created, deleted); assert.equal(pending.size, 0);
  assert.equal(canvas.count() + window.count() + document.count() + media.count(), 0);
  assert.ok(observers.every(observer => observer.disconnected));
}
for (const config of [{}, { mobile: true }, { reduced: true }, { failShader: true }, { failFramebuffer: true }, { noContext: true }]) {
  scenario(config); console.log('PASS', JSON.stringify(config));
}
