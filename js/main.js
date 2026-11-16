/* Boot: film loop + scroll progress, nav, reveals, console and map. */
(function () {
  'use strict';
  // Where "Pilot it" / "Get in touch" go. Swap for a mailto: or a form link when ready.
  const CONTACT_URL = 'mailto:krobin@bates.edu?subject=Strayline%20pilot';

  const SL = window.SL, D = window.STRAYLINE_DATA;
  const { clamp, smooth } = SL.util;
  const $ = (id) => document.getElementById(id);

  document.querySelectorAll('[data-contact]').forEach((a) => { a.href = CONTACT_URL; });

  const filmEl = $('film'), nav = $('nav'), rail = document.querySelectorAll('.rail i'), cnt = $('cnt-alerts');
  const film = new SL.Film($('stage'));
  const hint = $('hint');
  const HINTS = ['Drag to orbit · touch the surface · click to launch an attack', 'Click the surface: launch an attack at the gate', 'Click the surface: see which detector catches it',
    'Drag to orbit the alert cloud', 'Hover a cluster: each one is a real incident', 'Click a cluster to open it in the console'];
  rail.forEach((el, i) => el.addEventListener('click', () => window.scrollTo({ top: filmEl.offsetTop + i * vh, behavior: 'smooth' })));
  const stageBox = document.querySelector('.stage');
  // scene height = the sticky stage's height (stable on phones; innerHeight changes as the address bar hides)
  let vh = stageBox.clientHeight || window.innerHeight, vw = window.innerWidth, filmVisible = true, last = 0, raf = 0;

  function progress() {
    const top = filmEl.getBoundingClientRect().top;
    film.p = clamp(-top / vh, 0, 5);
    nav.classList.toggle('solid', window.scrollY > 40);
    const k = Math.round(film.p);
    rail.forEach((el, i) => el.classList.toggle('on', i === k));
    if (hint.textContent !== HINTS[k]) hint.textContent = HINTS[k];
    cnt.textContent = Math.round(D.funnel.alerts * smooth((film.p - 2.3) / 0.6)).toLocaleString('en-US');
  }
  function tick(now) {
    raf = 0;
    if (!filmVisible || document.hidden) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
    progress();
    film.frame(dt);
    raf = requestAnimationFrame(tick);
  }
  const kick = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } };

  new IntersectionObserver((e) => { filmVisible = e[0].isIntersecting; if (filmVisible) kick(); }).observe(filmEl);
  document.addEventListener('visibilitychange', kick);
  // never rely on one signal to keep the scene alive: scroll, touch and a watchdog all restart it
  const onScreen = () => { const r = filmEl.getBoundingClientRect(); return r.bottom > 0 && r.top < window.innerHeight; };
  const wake = () => { filmVisible = onScreen(); if (filmVisible) kick(); else progress(); };
  window.addEventListener('scroll', wake, { passive: true });
  window.addEventListener('pageshow', wake);
  window.addEventListener('touchstart', wake, { passive: true });
  setInterval(() => { if (!raf && !document.hidden && onScreen()) { filmVisible = true; kick(); } }, 1000);
  window.addEventListener('resize', () => {
    if (window.innerWidth === vw && window.innerWidth < 980) return;   // address bar only: nothing to redo
    vw = window.innerWidth; vh = stageBox.clientHeight || window.innerHeight; film.resize(); progress();
  });
  window.addEventListener('orientationchange', () => setTimeout(() => { vw = window.innerWidth; vh = stageBox.clientHeight || window.innerHeight; film.resize(); progress(); }, 250));
  const stage = $('stage');
  progress(); film.frame(0.016);   // draw the first frame immediately so the hero is never blank
  kick();

  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

  SL.initConsole();
  SL.initMap();
  SL.film = film;
})();
