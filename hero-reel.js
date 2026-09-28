/* Muted background only; follows the portfolio's existing motion preferences. */
document.addEventListener('DOMContentLoaded', () => {
  const video = document.getElementById('hero-showreel');
  const hero = document.getElementById('home');
  if (!video || !hero) return;
  const root = document.documentElement;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const modal = document.getElementById('video-modal');
  const connection = navigator.connection;
  let inView = false, pageHidden = false, wantsPlay = false;
  video.muted = true;
  video.defaultMuted = true;
  function sync() {
    const saveData = connection?.saveData || ['slow-2g', '2g'].includes(connection?.effectiveType);
    const next = inView && !pageHidden && !document.hidden && !reduced.matches && !saveData &&
      root.classList.contains('page-ready') && !root.classList.contains('intro-active') &&
      !root.classList.contains('motion-paused') && !modal?.open;
    if (next === wantsPlay) return;
    wantsPlay = next;
    if (!next) { video.pause(); return; }
    if (!video.getAttribute('src') && video.dataset.src) video.src = video.dataset.src;
    video.play()?.catch(() => {});
  }
  const mutations = new MutationObserver(sync);
  mutations.observe(root, { attributes: true, attributeFilter: ['class'] });
  if (modal) mutations.observe(modal, { attributes: true, attributeFilter: ['open'] });
  let visibility;
  function measure() {
    const rect = hero.getBoundingClientRect();
    inView = rect.bottom > 0 && rect.top < window.innerHeight;
    sync();
  }
  if ('IntersectionObserver' in window) {
    visibility = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; sync(); });
    visibility.observe(hero);
  } else {
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure, { passive: true });
    measure();
  }
  document.addEventListener('visibilitychange', sync);
  reduced.addEventListener('change', sync);
  connection?.addEventListener?.('change', sync);
  window.addEventListener('pagehide', event => {
    pageHidden = true; sync();
    if (!event.persisted) {
      visibility?.disconnect(); mutations.disconnect();
      document.removeEventListener('visibilitychange', sync);
      reduced.removeEventListener('change', sync);
      connection?.removeEventListener?.('change', sync);
      window.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    }
  });
  window.addEventListener('pageshow', () => { pageHidden = false; sync(); });
});
