"use client";

import React, { useEffect, useRef, useState } from "react";

// No Three.js, animation library, float-texture extension, or external stylesheet.
// RGBA8 feedback stores pigment; this is advected domain-warped ink, not a
// pressure-projected Navier–Stokes solver.
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
  let width = 1, height = 1, inView = true, paused = false, lastCost = 0;
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
    uniform(inkProgram, "uForce", !media.matches && pointer.active ? (pointer.down ? 3.5 : .9) : 0);
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
    listen(canvas, "pointermove", position);
    listen(canvas, "pointerdown", (event) => {
      if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
      position(event); pointer.down = true; pointer.id = event.pointerId;
      canvas.setPointerCapture(event.pointerId);
    });
    const release = () => { pointer.down = false; pointer.active = false; pointer.id = null; };
    listen(canvas, "pointerup", release);
    listen(canvas, "pointercancel", release);
    listen(canvas, "lostpointercapture", release);
    listen(canvas, "pointerleave", () => { if (!pointer.down) pointer.active = false; });
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

const CSS = `
.kd-fluid{position:relative;isolation:isolate;display:grid;place-items:center;min-height:100vh;min-height:100svh;overflow:hidden;background:radial-gradient(ellipse at 70% 30%,#17666b,#04151f 70%);color:#fff;font-family:Arial,Helvetica,sans-serif}
.kd-fluid canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}
.kd-fluid[data-still="true"] canvas{touch-action:pan-y}
.kd-fluid__shade{position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(0,8,14,.26),transparent 30%,rgba(0,8,14,.66))}
.kd-fluid__content{position:relative;pointer-events:none;text-align:center;padding:7rem 1.25rem 11rem;width:100%;box-sizing:border-box}
.kd-fluid__eyebrow{font-size:.75rem;letter-spacing:.28em;text-transform:uppercase;margin:0 0 1.5rem}
.kd-fluid__title{font-size:clamp(2rem,8.7vw,9rem);font-weight:500;line-height:1.08;letter-spacing:-.045em;margin:0;text-shadow:0 4px 50px #04151f66;overflow-wrap:anywhere}
.kd-fluid__subtitle{max-width:32rem;margin:1.5rem auto 0;font-size:1rem;line-height:1.6;color:#e0f0ee}
.kd-fluid__cue{display:grid;place-items:center;width:6.5rem;height:6.5rem;border:1px solid #e5ffef80;border-radius:50%;margin:2.75rem auto 0;font-size:.75rem;letter-spacing:.1em;text-transform:uppercase}
.kd-fluid__bottom{position:absolute;left:1.25rem;right:1.25rem;bottom:max(2rem,env(safe-area-inset-bottom));display:flex;flex-direction:column;align-items:center;gap:1rem}
.kd-fluid__cta{display:inline-flex;align-items:center;justify-content:center;gap:1.5rem;border:1px solid #fff9;border-radius:999px;padding:1rem 1.5rem;color:#09262c;background:#edfff1;text-decoration:none;font:inherit;font-size:.875rem;cursor:pointer;min-height:48px;box-sizing:border-box}
.kd-fluid__cta:hover{background:white;color:#000}.kd-fluid__cta:focus-visible,.kd-fluid__motion:focus-visible{outline:3px solid #ffc376;outline-offset:5px}
.kd-fluid__hint{display:flex;align-items:center;gap:.5rem;font-size:.75rem;color:#e0f0ee;margin:0}
.kd-fluid__hint svg{width:18px;height:18px}
.kd-fluid__motion{position:absolute;top:max(1.25rem,env(safe-area-inset-top));right:1.25rem;padding:.65rem .9rem;border:1px solid #ffffff55;border-radius:999px;background:#04151fcc;color:#fff;font:inherit;font-size:.75rem;cursor:pointer;min-height:44px}
.kd-fluid__motion:disabled{cursor:default}
.kd-fluid__status{position:absolute;left:1rem;top:1rem;max-width:55%;font-size:.75rem;line-height:1.5;color:#e0f0ee}
@media(max-height:650px){.kd-fluid__content{padding-top:5rem;padding-bottom:10rem}.kd-fluid__cue{width:4rem;height:4rem;margin-top:1.25rem;font-size:.65rem}.kd-fluid__subtitle{margin-top:1rem}}
`;

/**
 * Full-screen GPU watercolor hero. Pass a same-origin imageSrc to enable reveal.
 * React 18+; works in Vite, CRA, and Next.js client components. No SSR DOM access.
 */
export default function FluidHero({
  imageSrc,
  title = "KINGADOM",
  eyebrow = "Kingadom Studios",
  subtitle = "Stories in motion. Made to feel something.",
  ctaLabel = "Explore my work",
  ctaHref = "#work",
  onCtaClick,
  maxDpr = 1.5,
  brushRadius = .085,
  paletteSpeed = .12,
  grain = .035,
  className = "",
  style,
  nonce,
}) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [status, setStatus] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const canvas = canvasRef.current;
    setStatus(""); setUnavailable(false);
    function lost(event) {
      event.preventDefault(); setUnavailable(true); setStatus("Animation paused while graphics recover.");
    }
    function restored() { setRevision((value) => value + 1); }
    canvas.addEventListener("webglcontextlost", lost);
    canvas.addEventListener("webglcontextrestored", restored);
    try {
      engineRef.current = createFluid(canvas, {
        imageSrc,
        maxDpr: Math.max(.5, Math.min(2, Number(maxDpr) || 1.5)),
        brushRadius: Math.max(.015, Math.min(.3, Number(brushRadius) || .085)),
        paletteSpeed: Math.max(0, Math.min(1, Number(paletteSpeed) || 0)),
        grain: Math.max(0, Math.min(.1, Number(grain) || 0)),
        onReducedMotion: setReduced,
        onImageError: () => setStatus("Paint is ready; the image could not be loaded."),
      });
      engineRef.current.setPaused(pausedRef.current);
    } catch {
      setUnavailable(true); setStatus("Still view — interactive graphics are unavailable on this device.");
    }
    return () => {
      engineRef.current?.dispose(); engineRef.current = null;
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.removeEventListener("webglcontextrestored", restored);
    };
  }, [imageSrc, maxDpr, brushRadius, paletteSpeed, grain, revision]);
  useEffect(() => { pausedRef.current = paused; engineRef.current?.setPaused(paused); }, [paused]);
  const h = React.createElement;
  const still = paused || reduced || unavailable;
  return h("section", { className: `kd-fluid ${className}`, style, "aria-label": `${eyebrow} introduction`, "data-still": still },
    h("style", { nonce }, CSS),
    h("canvas", { ref: canvasRef, "aria-hidden": true, style: unavailable ? { visibility: "hidden" } : undefined }),
    h("div", { className: "kd-fluid__shade" }),
    h("div", { className: "kd-fluid__content" },
      h("p", { className: "kd-fluid__eyebrow" }, eyebrow),
      h("h1", { className: "kd-fluid__title" }, title),
      subtitle && h("p", { className: "kd-fluid__subtitle" }, subtitle),
      !still && h("div", { className: "kd-fluid__cue", "aria-hidden": true }, "Draw here")),
    h("div", { className: "kd-fluid__bottom" },
      h("a", { className: "kd-fluid__cta", href: ctaHref, onClick: onCtaClick }, ctaLabel, h("span", { "aria-hidden": true }, "↗")),
      h("p", { className: "kd-fluid__hint" },
        h("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.4, "aria-hidden": true },
          h("circle", { cx: 12, cy: 12, r: 8 }), h("circle", { cx: 12, cy: 12, r: 2 })),
        still ? "Still view" : "Move to paint · tap & hold to reveal")),
    h("button", { className: "kd-fluid__motion", type: "button", disabled: reduced || unavailable,
      "aria-pressed": paused, onClick: () => setPaused((value) => !value) },
      reduced ? "Reduced motion" : unavailable ? "Still view" : paused ? "Resume motion" : "Pause motion"),
    h("p", { className: "kd-fluid__status", role: "status" }, status));
}
