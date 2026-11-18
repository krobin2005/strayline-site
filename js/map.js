/* Catchability map and budget slider: Strayline v1 on a network it was not trained on
   (results/product_eval_netflow, 3 seeds), against the first version (results/product_eval_host). */
(function () {
  'use strict';
  const SL = (window.SL = window.SL || {});
  const D = window.STRAYLINE_DATA;
  const $ = (id) => document.getElementById(id);
  const pct = (v) => (v == null ? '—' : (v >= 0.995 ? (v * 100).toFixed(1) : v < 0.1 ? (v * 100).toFixed(1) : Math.round(v * 100)) + '%');
  const short = (v) => (v == null ? '—' : v < 0.1 ? (v * 100).toFixed(1) + '%' : Math.round(v * 100) + '%');
  const NOTES = {
    'DDoS': 'DDoS: caught in full on a new network, in both directions. The first version caught 9% and 39%.',
    'Port scan': 'Port scan: 99% and above. Learning per-host behaviour (many ports per minute) makes scans stand out.',
    'Brute force': 'Brute force: 100% and 81%, up from 23% and under 1%.',
    'DoS': 'DoS: 99% and 69%, up from 5% and 23%. Per-host flood counts carry across networks.',
    'Botnet': 'Botnet: 96% on the 2018 network, but only 7% on the 2017 one. A blind spot in one direction.',
    'Web attack': 'Web attack: 74% and 69%. On the 2017 network the first version did better (89%).',
    'Infiltration': 'Infiltration: the weak spot, 40% on the 2018 network. Too few flows to test on the 2017 one.',
  };

  SL.initMap = function () {
    const grid = $('grid'), note = $('map-note');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let html = '<div class="h" role="columnheader">Attack family</div>' + D.methods.map((m) => `<div class="h" role="columnheader">${m}</div>`).join('');
    D.map.forEach((r, ri) => {
      html += `<div class="f" role="rowheader">${r.family}${r.n ? `<small>${r.n.toLocaleString('en-US')} flows</small>` : ''}</div>`;
      r.det.forEach((v, ci) => { html += `<div class="cell${v != null && v < 0.1 ? ' blind' : ''}" role="cell" data-r="${ri}" data-c="${ci}" data-v="${v == null ? '' : v}">${pct(v)}</div>`; });
    });
    grid.innerHTML = html;
    const cells = Array.from(grid.querySelectorAll('.cell'));
    const paint = (el) => {
      if (el.dataset.v === '') { el.style.color = '#8A929E'; el.classList.add('on'); return; }
      const v = +el.dataset.v;
      el.style.background = `rgba(47,109,181,${(0.05 + 0.95 * Math.pow(v, 0.85)).toFixed(3)})`;
      el.style.color = v > 0.42 ? '#FFFFFF' : v < 0.1 ? '#C8423B' : '#0E1116';
      el.classList.add('on');
    };
    const baseNote = `Share of each family's attack traffic caught at 2% false alarms. Mean of ${D.seeds} seeds, with 1% attack traffic hidden in the data each network learns from. Outlined cells are blind spots: under 10% caught.`;
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
        $('ba-' + i).style.width = (b.ae[k] || 0) * 100 + '%';
        $('bc-' + i).style.width = (b.clf[k] || 0) * 100 + '%';
        $('bv-' + i).textContent = short(b.ae[k]) + (b.clf[k] == null ? '' : ' · ' + short(b.clf[k]));
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
        if (k > D.fprs.length - 1 || k < 0) { dir = -dir; k = +input.value + dir; }
        input.value = k; set(k);
      }, 2400);
    }, { threshold: 0.3 }).observe($('budget'));
  };
})();
