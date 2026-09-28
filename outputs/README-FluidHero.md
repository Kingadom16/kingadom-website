# Kingadom fluid hero

`FluidHero.jsx` is a self-contained React component: all shaders, pointer handling, styles, and resource cleanup are inside one file. React is its only dependency. The existing plain-HTML portfolio now also uses this shader through `fluid-hero.js` and `fluid-hero.css`, connected directly to its Home section and existing motion controls. No React conversion is needed to see it on the portfolio.

## Use it

Copy `FluidHero.jsx` into your React app. Place your reveal photo in its `public/images/` folder. Your existing `images/camera-exploded.jpg` can be used, or replace it with a portrait/hand photo you own.

```jsx
import FluidHero from "./FluidHero.jsx";

export default function App() {
  return (
    <>
      <FluidHero
        imageSrc="/images/camera-exploded.jpg"
        title="KINGADOM"
        eyebrow="Kingadom Studios"
        ctaHref="#work"
        ctaLabel="Explore my work"
      />
      <section id="work">
        <h2>My work</h2>
        {/* Your existing portfolio content */}
      </section>
    </>
  );
}
```

Serve it through your React app, not by opening the JSX file directly. The component is client-marked for Next.js and does not access the DOM during server rendering. Its implementation uses `React.createElement`, so the source also parses as ordinary JavaScript.

## Interaction and rendering

- Move a mouse to paint; press or hold a touch to deposit more pigment. A segment brush joins fast movements without isolated dots.
- A low-resolution ping-pong GPU texture advects and diffuses pigment. The final shader adds multi-octave value-noise domain warping, a teal-to-orange gradient map, paper mottling, and animated film grain. This is a fluid-like visual approximation, not a full Navier–Stokes pressure solver.
- The photo is cover-fitted and revealed only inside sufficiently dense paint, with irregular noise-softened edges. A transparent image works too, but use an opaque photograph for the intended photographic reveal. Remote images must permit cross-origin texture use; same-origin files are simplest. Missing images leave the paint usable and show a short status message.
- The circular cue does not block painting. The bottom CTA is a real keyboard-accessible link. Dragging on the active canvas draws instead of scrolling; the CTA and non-canvas controls remain usable. Paused/reduced-motion mode restores vertical touch scrolling.
- Pause freezes the current frame. Reduced-motion users receive a still shader frame, without ongoing animation. Rendering stops off-screen or in hidden tabs. Context recovery rebuilds resources; unavailable WebGL gets a readable gradient fallback.

## Controls

| Prop | Default | Effect |
| --- | --- | --- |
| `imageSrc` | omitted | Photo URL; omit for paint only |
| `title`, `eyebrow`, `subtitle` | Kingadom copy | Visible text; use empty subtitle to hide it |
| `ctaLabel`, `ctaHref`, `onCtaClick` | Explore my work / #work | Bottom link and optional callback |
| `maxDpr` | 1.5 | Pixel-density ceiling; try 1 on slower devices |
| `brushRadius` | 0.085 | Brush radius relative to hero height |
| `paletteSpeed` | 0.12 | Radians/second; 0 keeps ambient palette cool, while painting still warms it |
| `grain` | 0.035 | Grain strength; 0 disables fine grain |
| `className`, `style` | none | Outer section customization |
| `nonce` | none | Nonce for the embedded style tag if required by your CSP |

Desktop feedback resolution is at most 384px on its longest edge (256px for coarse pointers). The output canvas caps its longest edge at 1600px, uses a lower mobile pixel density, and reduces resolution after sustained slow frames. There are no per-frame React state updates or texture readbacks. Smoothness still depends on device, browser, image size, and surrounding page load: 60fps is a target, not a measured guarantee.

Use an appropriately compressed photo around 1200–2000px across. Assets larger than the device texture limit are rejected gracefully. Host image domains must be allowed by your app's `img-src` policy. With a strict CSP, allow this component's style tag via `nonce` or move the CSS into an allowed stylesheet; its optional `style` prop and fallback canvas visibility also use inline styles.

## Validation boundary

Source syntax and a mocked WebGL lifecycle/interaction check can validate wiring and cleanup, but do not compile GLSL on a real GPU or measure visual quality/frame rate. Before production, check the actual React integration on a desktop and a touch device, including image loading, reduced motion, resize, and WebGL context recovery.
