/* Catchability map (results/lofo.csv, 10-seed means) and the false-alarm budget slider (results/budget.csv). */
(function () {
  'use strict';
  const SL = (window.SL = window.SL || {});
  const D = window.STRAYLINE_DATA;
  const $ = (id) => document.getElementById(id);
  const pct = (v) => (v >= 0.995 ? (v * 100).toFixed(1) : v < 0.1 ? (v * 100).toFixed(1) : Math.round(v * 100)) + '%';
  const NOTES = {
    'DDoS': 'DDoS: the classifier catches it without ever having seen it. The autoencoder misses it at this budget.',
    'Infiltration': 'Infiltration: only 36 flows. The autoencoder catches 87% (95% interval 73 to 95%); treat as indicative.',
    'Port scan': 'Port scan: the classifier calls unseen port scans normal. The autoencoder catches about a third at 1% false alarms.',
    'Brute force': 'Brute force: close to invisible at this budget. Routing uncertain flows to the autoencoder helps a little.',
    'DoS': 'DoS: a blind spot: slow DoS traffic sits near the normal line.',
    'Botnet': 'Botnet: a blind spot: quiet beaconing looks like ordinary traffic to both models.',
    'Web attack': 'Web attack: only 104 flows, and none caught at 1% false alarms. This is where a human is still needed.',
  };

  SL.initMap = function () {
    const grid = $('grid'), note = $('map-note');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let html = '<div class="h" role="columnheader">Hidden family</div>' + D.methods.map((m) => `<div class="h" role="columnheader">${m}</div>`).join('');
    D.map.forEach((r, ri) => {
      html += `<div class="f" role="rowheader">${r.family}<small>${r.n.toLocaleString('en-US')} flows</small></div>`;
      r.det.forEach((v, ci) => { html += `<div class="cell${v < 0.1 ? ' blind' : ''}" role="cell" data-r="${ri}" data-c="${ci}" data-v="${v}">${pct(v)}</div>`; });
    });
    grid.innerHTML = html;
    const cells = Array.from(grid.querySelectorAll('.cell'));
    const paint = (el) => {
      const v = +el.dataset.v;
      el.style.background = `rgba(47,109,181,${(0.05 + 0.95 * Math.pow(v, 0.85)).toFixed(3)})`;
      el.style.color = v > 0.42 ? '#FFFFFF' : v < 0.1 ? '#C8423B' : '#0E1116';
      el.classList.add('on');
    };
    const baseNote = `Mean of ${D.seeds} seeds. Outlined cells are blind spots: under 10% of a never-seen family caught.`;
    note.textContent = baseNote;

    let started = false, row = -1, timer = 0;
    const sweep = () => {
      cells.forEach((c) => c.classList.remove('sweep'));
      row = (row + 1) % (D.map.length + 1);
      if (row === D.map.length) { note.textContent = baseNote; return; }
      cells.filter((c) => +c.dataset.r === row).forEach((c) => c.classList.add('sweep'));
      note.textContent = NOTES[D.map[row].family];
    };
    new IntersectionObserver((e) => {
      const vis = e[0].isIntersecting;
      if (vis && !started) {
        started = true;
        cells.forEach((c, i) => setTimeout(() => paint(c), reduced ? 0 : 60 * i));
      }
      clearInterval(timer);
      if (vis && !reduced) timer = setInterval(sweep, 3600);
    }, { threshold: 0.3 }).observe(grid);

    // budget slider
    const bars = $('bars'), input = $('fpr'), out = $('fpr-val');
    bars.innerHTML = D.budget.map((b, i) => `<div class="brow"><span class="nm">${b.family}</span><span class="tr"><span><i class="a" id="ba-${i}"></i></span><span><i class="c" id="bc-${i}"></i></span></span><em id="bv-${i}"></em></div>`).join('');
    const set = (k) => {
      out.textContent = D.fprs[k] * 100 + '%';
      D.budget.forEach((b, i) => {
        $('ba-' + i).style.width = b.ae[k] * 100 + '%';
        $('bc-' + i).style.width = b.clf[k] * 100 + '%';
        $('bv-' + i).textContent = pct(b.ae[k]);
      });
    };
    set(+input.value);
    let auto = !reduced, dir = 1, bt = 0;
    const stop = () => { auto = false; clearInterval(bt); };
    input.addEventListener('input', () => set(+input.value));
    ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => input.addEventListener(ev, stop, { passive: true }));
    new IntersectionObserver((e) => {
      clearInterval(bt);
      if (e[0].isIntersecting && auto) bt = setInterval(() => {
        let k = +input.value + dir;
        if (k > 3 || k < 0) { dir = -dir; k = +input.value + dir; }
        input.value = k; set(k);
      }, 2400);
    }, { threshold: 0.3 }).observe($('budget'));
  };
})();
