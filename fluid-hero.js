/* KINGADOM — GPU liquid hero, integrated with the existing portfolio. */
(() => {
'use strict';
const VERTEX = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() { vUv = aPosition * .5 + .5; gl_Position = vec4(aPosition, 0., 1.); }
`;

const NOISE = `
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x),
             mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y);
}
float fbm(vec2 p) {
  float sum = 0., amplitude = .5;
  for (int i = 0; i < OCTAVES; i++) {
    sum += amplitude * noise(p);
    p = mat2(.8, -.6, .6, .8) * p * 2.03 + 13.1;
    amplitude *= .5;
  }
  return sum;
}
`;

const INK = `
varying vec2 vUv;
uniform sampler2D uInk;
uniform vec2 uFrom, uTo, uTexel;
uniform float uAspect, uTime, uDelta, uForce, uRadius;
${NOISE}
void main() {
  vec2 p = vec2(vUv.x * uAspect, vUv.y);
  // A slowly evolving divergence-like swirl carries pigment away from the brush.
  float n = noise(p * 3. + uTime * .08);
  vec2 flow = vec2(cos(n * 6.283), sin(n * 6.283));
  vec2 center = p - vec2(uAspect * .5, .5);
  flow += vec2(-center.y, center.x) * .65;
  vec2 uv = vUv - flow * vec2(1. / uAspect, 1.) * uDelta * .032;
  vec4 ink = texture2D(uInk, uv) * .72;
  ink += texture2D(uInk, uv + vec2(uTexel.x, 0.)) * .07;
  ink += texture2D(uInk, uv - vec2(uTexel.x, 0.)) * .07;
  ink += texture2D(uInk, uv + vec2(0., uTexel.y)) * .07;
  ink += texture2D(uInk, uv - vec2(0., uTexel.y)) * .07;
  ink *= exp(-uDelta * .34);
  vec2 a = vec2(uFrom.x * uAspect, uFrom.y);
  vec2 b = vec2(uTo.x * uAspect, uTo.y);
  vec2 segment = b - a;
  float along = clamp(dot(p - a, segment) / max(dot(segment, segment), .000001), 0., 1.);
  float distanceToBrush = length(p - a - along * segment);
  float feather = .8 + .35 * noise(p * 24. + uTime * .2);
  float brush = exp(-pow(distanceToBrush / (uRadius * feather), 2.) * 2.);
  // Exponential injection is time-based, so a hold works without pointer movement.
  float deposit = (1. - exp(-uForce * uDelta * 8.)) * brush;
  ink.r = clamp(ink.r + deposit, 0., 1.);
  ink.g = clamp(ink.g + deposit * .7, 0., 1.);
  gl_FragColor = vec4(ink.rg, 0., 1.);
}
`;

const PAINT = `
varying vec2 vUv;
uniform sampler2D uInk, uImage;
uniform vec2 uResolution, uImageSize;
uniform float uTime, uAspect, uHasImage, uGrain, uPaletteSpeed;
${NOISE}
void main() {
  vec2 p = vec2(vUv.x * uAspect, vUv.y);
  float t = uTime * .075;
  vec2 q = vec2(fbm(p * 2.3 + t), fbm(p * 2.3 + vec2(4.2, 1.3) - t));
  vec2 r = vec2(fbm(p * 2. + q * 3.5 + vec2(1.7, 9.2) + t),
                fbm(p * 2. + q * 3.5 + vec2(8.3, 2.8) - t));
  float ink = texture2D(uInk, vUv).r;
  vec2 bent = p * 2.4 + r * 3.2 + ink * vec2(1.5, -1.2);
  float pigment = fbm(bent);
  float ridges = pow(1. - abs(pigment * 2. - 1.), 8.);
  // Starts cool; ambient cycles and brush pigment both introduce warm tones.
  float warmth = clamp(.5 - .5 * cos(uTime * uPaletteSpeed) + ink * .65, 0., 1.);
  vec3 dark = mix(vec3(.008, .065, .09), vec3(.10, .012, .025), warmth);
  vec3 middle = mix(vec3(.015, .44, .48), vec3(.80, .09, .055), warmth);
  vec3 light = mix(vec3(.52, .92, .83), vec3(1., .65, .28), warmth);
  vec3 color = mix(dark, middle, smoothstep(.17, .67, pigment + ink * .15));
  color = mix(color, light, clamp(ridges * .30 + ink * .22, 0., .7));
  // Cover-fit without stretching, then distort only the sampled image coordinates.
  float imageAspect = uImageSize.x / max(uImageSize.y, 1.);
  vec2 cover = vec2(min(uAspect / imageAspect, 1.), min(imageAspect / uAspect, 1.));
  vec2 imageUv = (vUv - .5) * cover + .5;
  imageUv += (r - .5) * .026 * ink;
  vec4 imageSample = texture2D(uImage, clamp(imageUv, .001, .999));
  vec3 photo = imageSample.rgb;
  float threshold = .15 + noise(p * 14. + r) * .20;
  float reveal = smoothstep(threshold, threshold + .30, ink) * uHasImage * imageSample.a;
  photo = mix(photo, photo * (light + .35), .25);
  color = mix(color, photo, reveal * .88);
  // Paper-scale mottling and fine animated grain are part of the GPU pass.
  float paper = noise(vUv * uResolution * .32) - .5;
  float grain = hash(gl_FragCoord.xy + fract(uTime) * 317.) - .5;
  color += paper * .022 + grain * uGrain;
  float vignette = 1. - smoothstep(.18, .95, length((vUv - .5) * vec2(1., .8)));
  color *= .67 + .33 * vignette;
  gl_FragColor = vec4(max(color, 0.), 1.);
}
`;

function createFluid(canvas, options) {
  const gl = canvas.getContext("webgl", {
    alpha: false, antialias: false, depth: false, stencil: false,
    preserveDrawingBuffer: false, powerPreference: "low-power",
  });
  if (!gl) throw new Error("WebGL unavailable");
  const resources = [];
  const cleanups = [];
  let destroyed = false, frame = 0, previousTime = 0, time = 0;
  let width = 1, height = 1, inView = true, paused = Boolean(options.initialPaused), lastCost = 0;
  let imageReady = false, imageWidth = 1, imageHeight = 1;
  let read, write, imageTexture, inkProgram, paintProgram, buffer;
  let qualityScale = 1, slowFrames = 0;
  const media = matchMedia("(prefers-reduced-motion: reduce)");
  const mobile = matchMedia("(pointer: coarse)").matches;
  const pointer = { x: .5, y: .5, fromX: .5, fromY: .5, active: false, down: false, id: null };
  const keep = (kind, value) => { resources.push([kind, value]); return value; };
  const listen = (target, event, fn, config) => {
    target.addEventListener(event, fn, config);
    cleanups.push(() => target.removeEventListener(event, fn, config));
  };
  function dispose() {
    destroyed = true;
    cancelAnimationFrame(frame);
    cleanups.forEach((fn) => fn());
    resources.reverse().forEach(([kind, value]) => gl[`delete${kind}`](value));
  }
  function program(fragment) {
    const precision = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    const prefix = `precision ${precision && precision.precision ? "highp" : "mediump"} float;\n#define OCTAVES ${mobile ? 3 : 4}\n`;
    function compile(type, source) {
      const shader = keep("Shader", gl.createShader(type));
      gl.shaderSource(shader, prefix + source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    }
    const result = keep("Program", gl.createProgram());
    gl.attachShader(result, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(result, compile(gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(result);
    if (!gl.getProgramParameter(result, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(result));
    return { value: result, uniforms: new Map(), position: gl.getAttribLocation(result, "aPosition") };
  }
  function uniform(p, name, ...values) {
    if (!p.uniforms.has(name)) p.uniforms.set(name, gl.getUniformLocation(p.value, name));
    gl[`uniform${values.length}f`](p.uniforms.get(name), ...values);
  }
  function texture() {
    const result = keep("Texture", gl.createTexture());
    gl.bindTexture(gl.TEXTURE_2D, result);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return result;
  }
  function target() {
    return { texture: texture(), framebuffer: keep("Framebuffer", gl.createFramebuffer()), width: 1, height: 1 };
  }
  function allocate(target, w, h) {
    target.width = w; target.height = h;
    gl.bindTexture(gl.TEXTURE_2D, target.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("Incomplete ink framebuffer");
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  }
  function bind(p, name, value, unit) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, value);
    if (!p.uniforms.has(name)) p.uniforms.set(name, gl.getUniformLocation(p.value, name));
    gl.uniform1i(p.uniforms.get(name), unit);
  }
  function use(p, target) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
    gl.viewport(0, 0, target ? target.width : width, target ? target.height : height);
    gl.useProgram(p.value);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(p.position);
    gl.vertexAttribPointer(p.position, 2, gl.FLOAT, false, 0, 0);
  }
  function resize() {
    if (destroyed || gl.isContextLost()) return;
    const bounds = canvas.getBoundingClientRect();
    const cap = Math.min(options.maxDpr, mobile ? 1.25 : 1.5, window.devicePixelRatio || 1);
    const scale = Math.min(cap, 1600 / Math.max(bounds.width, bounds.height, 1)) * qualityScale;
    const w = Math.max(1, Math.round(bounds.width * scale));
    const h = Math.max(1, Math.round(bounds.height * scale));
    if (w === width && h === height && read.width > 1) return;
    width = canvas.width = w; height = canvas.height = h;
    const sim = mobile ? 256 : 384;
    const simScale = sim / Math.max(w, h);
    allocate(read, Math.max(2, Math.round(w * simScale)), Math.max(2, Math.round(h * simScale)));
    allocate(write, read.width, read.height);
  }
  function draw(delta) {
    if (delta > 0) {
    use(inkProgram, write);
    bind(inkProgram, "uInk", read.texture, 0);
    uniform(inkProgram, "uTexel", 1 / read.width, 1 / read.height);
    uniform(inkProgram, "uAspect", width / height);
    uniform(inkProgram, "uTime", time);
    uniform(inkProgram, "uDelta", delta);
    uniform(inkProgram, "uFrom", pointer.fromX, pointer.fromY);
    uniform(inkProgram, "uTo", pointer.x, pointer.y);
    uniform(inkProgram, "uRadius", options.brushRadius);
    uniform(inkProgram, "uForce", 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    [read, write] = [write, read];
    pointer.fromX = pointer.x; pointer.fromY = pointer.y;
    }
    use(paintProgram, null);
    bind(paintProgram, "uInk", read.texture, 0);
    bind(paintProgram, "uImage", imageTexture, 1);
    uniform(paintProgram, "uResolution", width, height);
    uniform(paintProgram, "uImageSize", imageWidth, imageHeight);
    uniform(paintProgram, "uAspect", width / height);
    uniform(paintProgram, "uTime", time);
    uniform(paintProgram, "uHasImage", imageReady ? 1 : 0);
    uniform(paintProgram, "uGrain", options.grain);
    uniform(paintProgram, "uPaletteSpeed", options.paletteSpeed);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  const running = () => !destroyed && !paused && !media.matches && inView && !document.hidden && !gl.isContextLost();
  function tick(now) {
    frame = 0;
    if (!running()) return;
    const elapsed = previousTime ? (now - previousTime) / 1000 : 1 / 60;
    previousTime = now;
    const delta = Math.min(elapsed, .035);
    time += delta;
    draw(delta);
    // Conservative one-way downshift for sustained slow frames, not a 60fps guarantee.
    lastCost = lastCost * .95 + elapsed * .05;
    slowFrames = lastCost > .024 ? slowFrames + 1 : 0;
    if (slowFrames > 100 && qualityScale > .6) {
      qualityScale = Math.max(.6, qualityScale - .15); slowFrames = 0; resize();
    }
    frame = requestAnimationFrame(tick);
  }
  function wake() {
    cancelAnimationFrame(frame); frame = 0; previousTime = 0;
    if (destroyed || gl.isContextLost()) return;
    if (running()) frame = requestAnimationFrame(tick);
    else if (inView && !document.hidden) draw(0);
  }
  function position(event) {
    if (pointer.id !== null && event.pointerId !== pointer.id) return;
    const bounds = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    const y = Math.max(0, Math.min(1, 1 - (event.clientY - bounds.top) / bounds.height));
    if (!pointer.active) { pointer.fromX = x; pointer.fromY = y; }
    pointer.x = x; pointer.y = y; pointer.active = true;
  }
  try {
    inkProgram = program(INK); paintProgram = program(PAINT);
    buffer = keep("Buffer", gl.createBuffer());
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    read = target(); write = target(); imageTexture = texture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    resize();
    if (options.imageSrc) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        if (destroyed || gl.isContextLost()) return;
        // Reject oversized assets without leaving WebGL in an invalid-texture state.
        const limit = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        if (img.naturalWidth > limit || img.naturalHeight > limit) { options.onImageError(); return; }
        try {
          gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, imageTexture);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
          imageWidth = img.naturalWidth; imageHeight = img.naturalHeight;
          imageReady = true; wake();
        } catch { options.onImageError(); }
      };
      img.onerror = options.onImageError;
      img.src = options.imageSrc;
      cleanups.push(() => { img.onload = null; img.onerror = null; });
    }
    const release = () => { pointer.down = false; pointer.active = false; pointer.id = null; };
    listen(window, "blur", release);
    listen(document, "visibilitychange", () => { release(); wake(); });
    listen(media, "change", () => { options.onReducedMotion(media.matches); wake(); });
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => { resize(); wake(); });
      observer.observe(canvas); cleanups.push(() => observer.disconnect());
    } else listen(window, "resize", () => { resize(); wake(); });
    if (typeof IntersectionObserver !== "undefined") {
      const observer = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; wake(); });
      observer.observe(canvas); cleanups.push(() => observer.disconnect());
    }
    options.onReducedMotion(media.matches);
    wake();
    return { dispose, setPaused(value) { paused = value; wake(); } };
  } catch (error) { dispose(); throw error; }
}


  // The embedded original photo allows texture uploads in the existing file://
  // preview, without cross-origin requests or a new runtime dependency.
  const cameraTexture = "data:image/jpeg;base64,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";
  function mountHero() {
    const canvas = document.getElementById('hero-fluid');
    const hero = document.getElementById('home');
    if (!canvas || !hero) return;
    const root = document.documentElement;
    let engine = null, previousPause = null, failed = false, imageFailed = false;
    function sync() {
      const paused = !root.classList.contains('page-ready') ||
        root.classList.contains('intro-active') || root.classList.contains('motion-paused') ||
        document.getElementById('video-modal')?.open;
      hero.classList.toggle('fluid-still', Boolean(paused) || failed);
      if (engine && paused !== previousPause) engine.setPaused(Boolean(paused));
      previousPause = paused;
    }
    function start() {
      engine?.dispose(); engine = null; previousPause = null; failed = false; imageFailed = false;
      try {
        engine = createFluid(canvas, {
          initialPaused: true, imageSrc: cameraTexture, maxDpr: 1.5,
          brushRadius: .09, grain: .025, paletteSpeed: .12,
          onReducedMotion() {},
          onImageError() { imageFailed = true; sync(); },
        });
        hero.classList.add('fluid-ready');
      } catch {
        failed = true; hero.classList.remove('fluid-ready');
      }
      sync();
    }
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    const dialog = document.getElementById('video-modal');
    if (dialog) observer.observe(dialog, { attributes: true, attributeFilter: ['open'] });
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault(); failed = true; hero.classList.remove('fluid-ready'); sync();
    });
    canvas.addEventListener('webglcontextrestored', start);
    window.addEventListener('pagehide', event => {
      if (event.persisted) engine?.setPaused(true);
      else { engine?.dispose(); observer.disconnect(); }
    });
    window.addEventListener('pageshow', () => { previousPause = null; sync(); });
    start();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountHero, { once: true });
  else mountHero();

})();
