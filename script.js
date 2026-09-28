/* KINGADOM STUDIOS — motion and interactions.
   No dependency downloads. Pausing motion also disables automatic video previews. */
document.addEventListener('DOMContentLoaded', () => {
  'use strict';
  const root = document.documentElement;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 761px)');
  const loader = document.querySelector('.loader');
  const skipIntro = document.querySelector('.intro-skip');
  const motionButton = document.querySelector('.motion-toggle');
  const hero = document.querySelector('.hero');
  const nav = document.querySelector('.nav');
  const navLinks = document.querySelector('.nav-links');
  const menuButton = document.querySelector('.menu-toggle');
  const progress = document.querySelector('.scroll-progress span');
  const modal = document.getElementById('video-modal');
  const modalVideo = document.getElementById('modal-video');
  const modalEmpty = document.querySelector('.modal-empty');
  const cards = [...document.querySelectorAll('.project-card')];
  const previews = cards.map(card => card.querySelector('video'));
  const supportedCategories = new Set(['events', 'editing', 'social']);
  const visibleCards = cards.filter(card => supportedCategories.has(card.dataset.category));
  let manualPause = false;
  let motionEnabled = !reducedMotion.matches;
  let introFinished = false;
  let heroVisible = true;
  let activePreview = null;
  let previewTimer = null;
  let activeHover = null;
  let modalOpener = null;
  let modalClosing = false;
  let playlist = [];
  let playlistIndex = 0;
  let filterRevision = 0;
  let frameId = 0;
  let scrollDirty = true;
  let pointerKnown = false;
  let pointerDirty = false;
  let mouseX = 0, mouseY = 0, ringX = 0, ringY = 0;
  let sceneX = 0, sceneY = 0, sceneTargetX = 0, sceneTargetY = 0;
  let revealObserver;
  let introTimer;
  const motionAnimations = new Set();
  const floaters = [];

  // Use distinct elements for ambient floating and pointer movement.
  document.querySelectorAll('.equip, .app-cloud > span').forEach((element, index) => {
    const visual = document.createElement(element.matches('.equip') ? 'div' : 'span');
    visual.className = 'floating-visual';
    while (element.firstChild) visual.append(element.firstChild);
    element.append(visual);
    const depth = Number(element.dataset.depth || (index % 2 ? -12 : 10));
    floaters.push({ element, depth });
  });

  function stopPreview() {
    clearTimeout(previewTimer);
    previewTimer = null;
    if (activePreview) {
      activePreview.pause();
      activePreview.removeAttribute('src');
      activePreview.load();
      activePreview.classList.remove('has-frame');
    }
    activePreview = null;
  }

  function animate(element, keyframes, options) {
    if (!motionEnabled || document.hidden || !element.animate) return null;
    const animation = element.animate(keyframes, options);
    motionAnimations.add(animation);
    animation.finished.catch(() => {}).finally(() => motionAnimations.delete(animation));
    return animation;
  }

  function updateMotion() {
    motionEnabled = !manualPause && !reducedMotion.matches;
    root.classList.toggle('motion-running', motionEnabled);
    root.classList.toggle('motion-paused', !motionEnabled);
    motionButton.setAttribute('aria-pressed', String(!motionEnabled));
    motionButton.querySelector('.motion-label').textContent = reducedMotion.matches
      ? 'Reduced motion' : motionEnabled ? 'Pause motion' : 'Resume motion';
    motionButton.querySelector('.motion-icon').textContent = motionEnabled ? 'Ⅱ' : '▷';
    motionButton.disabled = reducedMotion.matches;
    if (!motionEnabled) {
      motionAnimations.forEach(animation => animation.cancel());
      stopPreview();
      document.querySelectorAll('.reveal-pending').forEach(element => {
        element.classList.remove('reveal-pending');
        element.classList.add('visible');
      });
      revealObserver?.disconnect();
      root.classList.remove('pointer-visible');
      resetHover();
      sceneX = sceneY = sceneTargetX = sceneTargetY = 0;
      floaters.forEach(({ element }) => {
        element.style.setProperty('--px', '0px');
        element.style.setProperty('--py', '0px');
      });
      hero.style.setProperty('--spot-x', '0px');
      hero.style.setProperty('--spot-y', '0px');
      if (reducedMotion.matches && !introFinished) finishIntro();
    }
    scheduleFrame();
  }

  // The display is an intro, not an invented network progress indicator.
  // It ends after 1.45 seconds regardless of how long media takes to load.
  function finishIntro() {
    if (introFinished) return;
    introFinished = true;
    clearTimeout(introTimer);
    const skipHadFocus = document.activeElement === skipIntro;
    root.classList.add('page-ready', 'intro-exiting');
    loader.classList.add('done');
    document.querySelectorAll('header, main, footer').forEach(element => { element.inert = false; });
    skipIntro.hidden = true;
    const cleanup = () => {
      root.classList.remove('intro-active', 'intro-exiting');
      loader.hidden = true;
      if (skipHadFocus) document.querySelector('.nav .wordmark').focus({ preventScroll: true });
    };
    if (motionEnabled) setTimeout(cleanup, 900);
    else cleanup();
  }

  root.classList.add('js');
  if (!reducedMotion.matches) {
    root.classList.add('intro-active');
    document.querySelectorAll('header, main, footer').forEach(element => { element.inert = true; });
    introTimer = setTimeout(finishIntro, 1450);
  } else {
    finishIntro();
  }
  skipIntro.addEventListener('click', finishIntro);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !introFinished) finishIntro();
  });
  motionButton.addEventListener('click', () => { manualPause = !manualPause; updateMotion(); });
  reducedMotion.addEventListener('change', updateMotion);
  finePointer.addEventListener('change', () => {
    stopPreview();
    resetHover();
    root.classList.remove('pointer-visible');
    sceneTargetX = sceneTargetY = 0;
    scheduleFrame();
  });

  document.getElementById('year').textContent = new Date().getFullYear();
  function closeMenu() {
    navLinks.classList.remove('open');
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', 'Open menu');
  }
  menuButton.addEventListener('click', () => {
    const open = navLinks.classList.toggle('open');
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  });
  navLinks.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && navLinks.classList.contains('open')) {
      closeMenu();
      menuButton.focus();
    }
  });
  document.addEventListener('pointerdown', event => { if (!nav.contains(event.target)) closeMenu(); });

  // Delay a group by its sibling position, not a global index.
  if ('IntersectionObserver' in window) {
    revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.remove('reveal-pending');
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -24px 0px' });
    document.querySelectorAll('.reveal').forEach(element => {
      if (element.closest('.hero')) return;
      const siblings = [...element.parentElement.children].filter(child => child.classList.contains('reveal'));
      element.style.setProperty('--reveal-delay', Math.min(siblings.indexOf(element) * 85, 255) + 'ms');
      if (!reducedMotion.matches) element.classList.add('reveal-pending');
      revealObserver.observe(element);
    });
    const ambientObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        entry.target.classList.toggle('is-inview', entry.isIntersecting);
        if (entry.target === hero) {
          heroVisible = entry.isIntersecting;
          if (!heroVisible) sceneTargetX = sceneTargetY = 0;
          scheduleFrame();
        }
      });
    });
    document.querySelectorAll('.hero, .meet, .portal').forEach(element => ambientObserver.observe(element));
    const previewObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting && entry.target === activePreview) stopPreview();
      });
    });
    previews.forEach(video => previewObserver.observe(video));
  } else {
    document.querySelectorAll('.reveal').forEach(element => element.classList.add('visible'));
    document.querySelectorAll('.hero, .meet, .portal').forEach(element => element.classList.add('is-inview'));
  }

  // A single scheduled frame updates pointer and scroll effects, and stops at rest.
  const sectionLinks = [...navLinks.querySelectorAll('a[href^="#"]')]
    .map(link => ({ link, section: document.querySelector(link.getAttribute('href')) }))
    .filter(item => item.section);
  const ring = document.querySelector('.cursor-ring');
  function scheduleFrame() {
    if (!frameId && !document.hidden) frameId = requestAnimationFrame(renderFrame);
  }
  function renderFrame() {
    frameId = 0;
    if (document.hidden) return;
    if (scrollDirty) {
      const max = document.documentElement.scrollHeight - innerHeight;
      const fraction = max > 0 ? Math.max(0, Math.min(1, scrollY / max)) : 0;
      progress.style.transform = 'scaleX(' + fraction + ')';
      nav.classList.toggle('scrolled', scrollY > 30);
      const marker = Math.min(innerHeight * .4, 280);
      let active = sectionLinks[0];
      for (const item of sectionLinks) {
        if (item.section.getBoundingClientRect().top <= marker &&
            (!active || item.section.offsetTop >= active.section.offsetTop)) active = item;
      }
      sectionLinks.forEach(item => {
        if (item === active) item.link.setAttribute('aria-current', 'location');
        else item.link.removeAttribute('aria-current');
      });
      scrollDirty = false;
    }
    if (!motionEnabled || !finePointer.matches) return;
    if (pointerKnown) {
      ringX += (mouseX - ringX) * .2;
      ringY += (mouseY - ringY) * .2;
      ring.style.transform = 'translate3d(' + ringX + 'px,' + ringY + 'px,0) translate(-50%,-50%)';
    }
    sceneX += (sceneTargetX - sceneX) * .065;
    sceneY += (sceneTargetY - sceneY) * .065;
    if (heroVisible) {
      floaters.forEach(({ element, depth }) => {
        element.style.setProperty('--px', (sceneX * depth).toFixed(2) + 'px');
        element.style.setProperty('--py', (sceneY * depth).toFixed(2) + 'px');
      });
      hero.style.setProperty('--spot-x', (sceneX * 180).toFixed(2) + 'px');
      hero.style.setProperty('--spot-y', (sceneY * 100).toFixed(2) + 'px');
    }
    if (pointerDirty && activeHover) {
      const rect = activeHover.getBoundingClientRect();
      const x = (mouseX - rect.left) / rect.width - .5;
      const y = (mouseY - rect.top) / rect.height - .5;
      if (activeHover.classList.contains('magnetic')) {
        activeHover.style.transform = 'translate3d(' + (x * 10).toFixed(1) + 'px,' + (y * 8).toFixed(1) + 'px,0)';
      } else {
        const media = activeHover.querySelector('.project-media');
        media.style.setProperty('--tilt-x', (-y * 3).toFixed(2) + 'deg');
        media.style.setProperty('--tilt-y', (x * 3).toFixed(2) + 'deg');
        media.style.setProperty('--shine-x', ((x + .5) * 100).toFixed(2) + '%');
        media.style.setProperty('--shine-y', ((y + .5) * 100).toFixed(2) + '%');
      }
    }
    pointerDirty = false;
    if (Math.abs(mouseX - ringX) + Math.abs(mouseY - ringY) > .15 ||
        Math.abs(sceneTargetX - sceneX) + Math.abs(sceneTargetY - sceneY) > .002) scheduleFrame();
  }
  function resetHover() {
    if (!activeHover) return;
    activeHover.style.removeProperty('transform');
    const media = activeHover.querySelector('.project-media');
    media?.style.setProperty('--tilt-x', '0deg');
    media?.style.setProperty('--tilt-y', '0deg');
    activeHover = null;
  }
  window.addEventListener('scroll', () => {
    scrollDirty = true;
    resetHover();
    scheduleFrame();
  }, { passive: true });
  window.addEventListener('resize', () => {
    scrollDirty = true;
    if (innerWidth > 980) closeMenu();
    scheduleFrame();
  }, { passive: true });
  window.addEventListener('pointermove', event => {
    if (!motionEnabled || !finePointer.matches || event.pointerType === 'touch') return;
    mouseX = event.clientX; mouseY = event.clientY;
    if (!pointerKnown) { ringX = mouseX; ringY = mouseY; pointerKnown = true; }
    root.classList.add('pointer-visible');
    const target = event.target instanceof Element ? event.target : null;
    ring.classList.toggle('hover', Boolean(target?.closest('a, button, input, select, textarea')));
    if (heroVisible) {
      const rect = hero.getBoundingClientRect();
      sceneTargetX = Math.max(-.5, Math.min(.5, (mouseX - rect.left) / rect.width - .5));
      sceneTargetY = Math.max(-.5, Math.min(.5, (mouseY - rect.top) / rect.height - .5));
    }
    const hover = target?.closest('.magnetic, .project-card') || null;
    if (hover !== activeHover) { resetHover(); activeHover = hover; }
    pointerDirty = true;
    scheduleFrame();
  }, { passive: true });
  document.addEventListener('pointerleave', () => {
    root.classList.remove('pointer-visible');
    resetHover();
    sceneTargetX = sceneTargetY = 0;
    scheduleFrame();
  });

  // Filters use short fade-outs and animate reflow; the final selected tab wins.
  const filters = [...document.querySelectorAll('[data-filter]')];
  filters.forEach(button => {
    button.setAttribute('aria-pressed', String(button.classList.contains('active')));
    button.addEventListener('click', async () => {
      const category = button.dataset.filter;
      if (button.classList.contains('active')) return;
      const revision = ++filterRevision;
      filters.forEach(filter => {
        const selected = filter === button;
        filter.classList.toggle('active', selected);
        filter.setAttribute('aria-pressed', String(selected));
      });
      stopPreview();
      resetHover();
      cards.forEach(card => card.getAnimations?.().forEach(animation => animation.cancel()));
      const oldPositions = new Map(visibleCards.filter(card => !card.classList.contains('hidden'))
        .map(card => [card, card.getBoundingClientRect()]));
      const shouldShow = card => category === 'all' || card.dataset.category === category;
      const leaving = visibleCards.filter(card => !card.classList.contains('hidden') && !shouldShow(card));
      const fades = leaving.map(card => animate(card,
        [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(10px)' }],
        { duration: 150, easing: 'ease-out' }));
      await Promise.all(fades.filter(Boolean).map(animation => animation.finished.catch(() => {})));
      if (revision !== filterRevision) return;
      visibleCards.forEach(card => {
        card.classList.toggle('hidden', !shouldShow(card));
        if (shouldShow(card)) {
          card.classList.remove('reveal-pending');
          card.classList.add('visible');
        }
      });
      visibleCards.filter(shouldShow).forEach((card, index) => {
        const previous = oldPositions.get(card);
        const next = card.getBoundingClientRect();
        const dx = previous ? previous.left - next.left : 0;
        const dy = previous ? previous.top - next.top : 20;
        animate(card, [
          { transform: 'translate(' + dx + 'px,' + dy + 'px)', opacity: previous ? 1 : 0 },
          { transform: 'translate(0,0)', opacity: 1 }
        ], { duration: 480, delay: Math.min(index * 45, 135), easing: 'cubic-bezier(.16,1,.3,1)' });
      });
      document.getElementById('filter-status').textContent = category === 'all'
        ? 'Showing all projects' : 'Showing ' + ({events: 'events', social: 'social content', editing: 'video edits'}[category]);
      scrollDirty = true;
      scheduleFrame();
    });
  });

  // Card previews are separate three-second files. Full films load only in the viewer.
  cards.forEach(card => {
    const video = card.querySelector('video');
    if (card.dataset.status === 'coming-soon') {
      const play = card.querySelector('.play');
      play.disabled = true;
      play.setAttribute('aria-label', 'Social content coming soon');
      video.preload = 'none';
      return;
    }
    video.muted = true;
    const showFrame = () => { if (video.readyState >= 2) video.classList.add('has-frame'); };
    video.addEventListener('loadeddata', showFrame);
    video.addEventListener('seeked', showFrame);
    video.addEventListener('playing', showFrame);
    video.addEventListener('error', () => video.classList.remove('has-frame'));
    card.addEventListener('pointerenter', event => {
      if (!motionEnabled || !finePointer.matches || event.pointerType === 'touch' || document.hidden || modal.open) return;
      const connection = navigator.connection;
      if (connection?.saveData || ['slow-2g', '2g'].includes(connection?.effectiveType)) return;
      if (!video.dataset.preview) return;
      stopPreview();
      previewTimer = setTimeout(() => {
        previewTimer = null;
        if (!motionEnabled || document.hidden || modal.open) return;
        activePreview = video;
        video.src = video.dataset.preview;
        video.play().then(() => {
          if (activePreview !== video || !motionEnabled || document.hidden || modal.open) video.pause();
        }).catch(() => {});
      }, 250);
    });
    card.addEventListener('pointerleave', () => { if (previewTimer || activePreview === video) stopPreview(); });
    card.addEventListener('click', event => {
      if (!event.target.closest('.project-media, .project-meta')) return;
      stopPreview();
      modalOpener = card.querySelector('.play');
      modalClosing = false;
      playlist = visibleCards.filter(project => !project.classList.contains('hidden') && project.dataset.status !== 'coming-soon');
      playlistIndex = playlist.indexOf(card);
      modal.showModal();
      showFilm(playlistIndex);
      root.classList.add('modal-open');
      animate(modal, [{ opacity: 0, transform: 'translateY(28px) scale(.96)' },
        { opacity: 1, transform: 'translateY(0) scale(1)' }],
        { duration: 450, easing: 'cubic-bezier(.16,1,.3,1)' });
    });
  });
  function showFilm(index) {
    if (modalClosing || index < 0 || index >= playlist.length) return;
    playlistIndex = index;
    const card = playlist[index];
    modalVideo.pause();
    modalVideo.hidden = false;
    modalEmpty.hidden = true;
    modalVideo.src = card.dataset.video;
    document.getElementById('modal-title').textContent = card.dataset.title;
    document.getElementById('modal-category').textContent = card.dataset.category;
    document.getElementById('modal-description').textContent = card.dataset.description;
    document.getElementById('viewer-position').textContent = (index + 1) + ' / ' + playlist.length;
    document.getElementById('previous-film').disabled = index === 0;
    document.getElementById('next-film').disabled = index === playlist.length - 1;
    animate(document.querySelector('.modal-caption'), [{opacity: .4, transform: 'translateY(6px)'}, {opacity: 1, transform: 'none'}], {duration: 250, easing: 'ease-out'});
    modalVideo.play().then(() => { if (!modal.open || modalClosing) modalVideo.pause(); }).catch(() => {});
  }
  document.getElementById('previous-film').addEventListener('click', () => showFilm(playlistIndex - 1));
  document.getElementById('next-film').addEventListener('click', () => showFilm(playlistIndex + 1));
  modal.addEventListener('keydown', event => {
    if (event.target.closest('video, input, textarea, select')) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      showFilm(playlistIndex + (event.key === 'ArrowRight' ? 1 : -1));
    }
  });
  async function closeModal() {
    if (modalClosing || !modal.open) return;
    modalClosing = true;
    modalVideo.pause();
    const exit = animate(modal, [{ opacity: 1, transform: 'scale(1)' },
      { opacity: 0, transform: 'scale(.98)' }], { duration: 170, easing: 'ease-in' });
    if (exit) await exit.finished.catch(() => {});
    modal.close();
  }
  document.querySelector('.modal-close').addEventListener('click', closeModal);
  modal.addEventListener('cancel', event => { event.preventDefault(); closeModal(); });
  modal.addEventListener('click', event => {
    const bounds = modal.getBoundingClientRect();
    if (event.target === modal && (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom)) closeModal();
  });
  modal.addEventListener('close', () => {
    modalVideo.pause();
    modalVideo.removeAttribute('src');
    modalVideo.load();
    modalClosing = false;
    root.classList.remove('modal-open');
    modalOpener?.focus({ preventScroll: true });
  });
  modalVideo.addEventListener('error', () => {
    if (!modal.open) return;
    modalEmpty.hidden = false;
    modalVideo.hidden = true;
  });

  // Services and film references feed into the same booking form.
  const bookingForm = document.getElementById('booking-form');
  const serviceSelect = bookingForm.querySelector('select[name="service"]');
  const reference = document.getElementById('project-reference');
  const bookingSelection = document.getElementById('booking-selection');
  const selectionText = document.getElementById('booking-selection-text');
  const categoryServices = { events: 'Event coverage', editing: 'Video editing', social: 'Social media content' };
  function updateSelection() {
    const parts = [];
    if (serviceSelect.value) parts.push('Selected: ' + serviceSelect.value);
    if (reference.value) parts.push('Film reference: ' + reference.value);
    bookingSelection.hidden = parts.length === 0;
    selectionText.textContent = parts.join(' · ');
    document.getElementById('clear-reference').hidden = !reference.value;
    document.querySelectorAll('.service-book').forEach(button => {
      const selected = button.dataset.service === serviceSelect.value;
      button.setAttribute('aria-pressed', String(selected));
      button.closest('.service').classList.toggle('selected-service', selected);
    });
  }
  function goToBooking(service, film = '') {
    serviceSelect.value = service;
    if (film) reference.value = film;
    updateSelection();
    // Reveal the target immediately, including when motion is disabled.
    bookingForm.classList.remove('reveal-pending');
    bookingForm.classList.add('visible');
    bookingForm.scrollIntoView({ behavior: motionEnabled ? 'smooth' : 'auto', block: 'start' });
    serviceSelect.focus({ preventScroll: true });
  }
  document.querySelectorAll('.service-book').forEach(button => {
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => goToBooking(button.dataset.service));
  });
  serviceSelect.addEventListener('change', updateSelection);
  document.getElementById('clear-reference').addEventListener('click', () => {
    reference.value = '';
    updateSelection();
    serviceSelect.focus({ preventScroll: true });
  });
  document.getElementById('book-project').addEventListener('click', async () => {
    const card = playlist[playlistIndex];
    if (!card) return;
    await closeModal();
    goToBooking(categoryServices[card.dataset.category], card.dataset.title);
  });
  const dateField = bookingForm.querySelector('input[type="date"]');
  const today = new Date();
  dateField.min = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  function buildBrief() {
    return [...new FormData(bookingForm).entries()]
      .filter(([, value]) => String(value).trim() && !String(value).startsWith('Choose a'))
      .map(([key, value]) => (key === 'reference' ? 'FILM REFERENCE' : key.toUpperCase()) + ': ' + value).join('\n');
  }
  function confirmBrief(message) {
    const confirmation = document.getElementById('form-confirmation');
    confirmation.hidden = false;
    confirmation.textContent = message;
    animate(confirmation, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
      { duration: 350, easing: 'ease-out' });
  }
  bookingForm.addEventListener('submit', event => {
    event.preventDefault();
    if (!bookingForm.reportValidity()) return;
    const body = 'Hello KINGADOM! I would like to discuss a project.\n\n' + buildBrief();
    confirmBrief('Your request is ready for WhatsApp. Press Send in WhatsApp to send it to KINGADOM. Your booking is only confirmed after we agree on the details and availability. If WhatsApp does not open, use email or copy your brief.');
    window.location.href = 'https://wa.me/233545196838?text=' + encodeURIComponent(body);
  });
  document.getElementById('booking-email').addEventListener('click', () => {
    if (!bookingForm.reportValidity()) return;
    const body = buildBrief();
    confirmBrief('Your email draft is ready. Press Send in your email app to send it to adombrobbey@gmail.com. Your booking is only confirmed after we agree on the details and availability. If your email app does not open, copy your brief and email it to that address.');
    window.location.href = 'mailto:adombrobbey@gmail.com?subject=' +
      encodeURIComponent('New KINGADOM booking request') + '&body=' + encodeURIComponent(body);
  });

  // Clipboard APIs can be unavailable on a local file. Offer selectable text then.
  async function copyText(text, success) {
    const status = document.getElementById('copy-status');
    const fallback = document.getElementById('copy-fallback');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      fallback.hidden = true;
      status.textContent = success;
      return true;
    } catch {
      fallback.value = text;
      fallback.hidden = false;
      status.textContent = 'Automatic copying is unavailable. Select and copy the text below.';
      fallback.scrollIntoView({ behavior: motionEnabled ? 'smooth' : 'auto', block: 'center' });
      fallback.focus({ preventScroll: true });
      fallback.select();
      return false;
    }
  }
  document.getElementById('copy-email').addEventListener('click', () => copyText('adombrobbey@gmail.com', 'Email address copied.'));
  document.getElementById('copy-request').addEventListener('click', async () => {
    if (!bookingForm.reportValidity()) return;
    const copied = await copyText(buildBrief(), 'Project brief copied.');
    if (copied) confirmBrief('Your brief is copied. Paste it into your preferred messaging app to send it to KINGADOM.');
  });

  // Failed optional photos show the existing fallback instead of a broken image.
  document.querySelectorAll('.about-image img, .bts-grid img, .equip img').forEach(image => {
    const fail = () => { image.hidden = true; };
    image.addEventListener('error', fail);
    if (image.complete && !image.naturalWidth) fail();
  });
  document.addEventListener('visibilitychange', () => {
    root.classList.toggle('tab-hidden', document.hidden);
    if (document.hidden) {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = 0;
      stopPreview();
      modalVideo.pause();
      motionAnimations.forEach(animation => animation.pause());
    } else {
      motionAnimations.forEach(animation => animation.play());
      scrollDirty = true;
      scheduleFrame();
    }
  });
  updateMotion();
});
