/* Live console: replays the real Friday run in time order, forever.
   Rows, triage rationales and investigator reports are the agents' actual output. */
(function () {
  'use strict';
  const SL = (window.SL = window.SL || {});
  const D = window.STRAYLINE_DATA;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const FAMILY = { PortScan: 'port scan · never seen in training', Botnet: 'botnet', DDoS: 'DDoS' };
  const MAX_ROWS = 60;

  SL.initConsole = function () {
    const q = $('q'), detail = $('detail'), root = $('con');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const list = D.incidents.slice().sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
    const F = D.funnel;
    const stats = [['flows', 'flows replayed', ''], ['alerts', 'alerts', ''], ['inc', 'incidents', ''],
      ['esc', 'escalated', 'esc'], ['mon', 'monitor', 'mon'], ['dis', 'dismissed', 'dis']];
    $('con-stats').innerHTML = stats.map((s) => `<div class="stat ${s[2]}"><b id="st-${s[0]}">0</b><span>${s[1]}</span></div>`).join('');

    let visible = false, paused = false, holdUntil = 0, typing = 0, shown = null;
    new IntersectionObserver((e) => { visible = e[0].isIntersecting; }, { threshold: 0.15 }).observe(root);
    const running = () => visible && !paused && !document.hidden && Date.now() > holdUntil;
    const sleep = (ms) => new Promise((res) => {
      const tick = () => { if (!running()) return setTimeout(tick, 200); ms -= 50; ms <= 0 ? res() : setTimeout(tick, 50); };
      tick();
    });

    function type(el, text, speed) {
      const my = ++typing;
      if (reduced) { el.textContent = text; return Promise.resolve(); }
      el.classList.add('caret');
      return new Promise((res) => {
        let n = 0;
        const step = () => {
          if (my !== typing) return res();
          n = Math.min(text.length, n + speed);
          el.textContent = text.slice(0, n);
          if (n < text.length) requestAnimationFrame(step); else { el.classList.remove('caret'); res(); }
        };
        step();
      });
    }

    function show(r, animate) {
      shown = r.id;
      q.querySelectorAll('.sel').forEach((n) => n.classList.remove('sel'));
      const row = q.querySelector(`[data-id="${r.id}"]`); if (row) row.classList.add('sel');
      const maxE = Math.max.apply(null, r.feat.map((f) => f[1]).concat([1]));
      const rep = r.rep;
      detail.innerHTML = `
        <div class="d-top"><h3>${r.id}</h3><span class="badge ${r.dec}">${r.dec} · p${r.pri}</span>
          ${r.truth ? `<span class="truth">ground truth, joined afterwards: ${esc(FAMILY[r.truth] || r.truth)}</span>` : ''}</div>
        <p class="d-route">${esc(r.src)} → ${esc(r.dst)} · ${esc(r.dir)} · first seen ${r.t}</p>
        <div class="d-grid">
          <div><b>${fmt(r.flows)}</b><span>alerted flows</span></div>
          <div><b>${r.dur} min</b><span>duration</span></div>
          <div><b>${fmt(r.ports)}</b><span>dst ports</span></div>
          <div><b>${esc(r.sus)}</b><span>suspected</span></div>
        </div>
        <div class="d-cols">
          <div><p class="d-h">Which detector fired</p>
            <div class="meter"><span>Classifier</span><span class="track"><i class="amber" data-w="${r.clf * 100}"></i></span><em>${Math.round(r.clf * 100)}%</em></div>
            <div class="meter"><span>Autoencoder</span><span class="track"><i class="red" data-w="${r.ae * 100}"></i></span><em>${Math.round(r.ae * 100)}%</em></div>
          </div>
          <div><p class="d-h">Most unusual features vs normal</p>
            ${r.feat.map((f) => `<div class="meter"><span title="${esc(f[0])}">${esc(f[0])}</span><span class="track"><i data-w="${(f[1] / maxE) * 100}"></i></span><em>${f[1] >= 100 ? Math.round(f[1]) : f[1]}×</em></div>`).join('')}
          </div>
        </div>
        <div class="say"><div class="who"><b>Triage agent</b><span>confidence ${Math.round(r.conf * 100)}%</span></div><p id="d-why"></p></div>
        ${rep ? `<div class="say inv"><div class="who"><b>Investigator agent</b><span class="badge ${rep.sev === 'high' || rep.sev === 'critical' ? 'escalate' : 'monitor'}">${esc(rep.type)} · ${esc(rep.sev)}</span><span>confidence ${Math.round(rep.conf * 100)}%</span></div>
            <p id="d-sum"></p><ul id="d-ev" hidden>${rep.ev.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>
          ${rep.blind ? `<div class="say blind" id="d-blind" hidden><div class="who"><b>Blind-spot warning</b></div><p>${esc(rep.blind)}</p></div>` : ''}` : ''}`;
      detail.scrollTop = 0;
      requestAnimationFrame(() => detail.querySelectorAll('[data-w]').forEach((n) => { n.style.width = n.dataset.w + '%'; }));
      const finish = () => { const ev = $('d-ev'), bl = $('d-blind'); if (ev) ev.hidden = false; if (bl) bl.hidden = false; };
      if (!animate) {
        typing++; $('d-why').textContent = r.why; if (rep) { $('d-sum').textContent = rep.sum; finish(); }
        return Promise.resolve();
      }
      return type($('d-why'), r.why, 5).then(() => (rep && shown === r.id ? type($('d-sum'), rep.sum, 6).then(finish) : null));
    }

    function addRow(r) {
      const li = document.createElement('li');
      li.dataset.id = r.id;
      li.innerHTML = `<span class="id">${r.id}</span><span class="who">${esc(r.src)} → ${esc(r.dst)}<small>${fmt(r.flows)} flows</small></span><span class="badge ${r.dec}">${r.dec}${r.dec === 'escalate' ? ' · p' + r.pri : ''}</span>`;
      li.addEventListener('click', () => { holdUntil = Date.now() + 20000; $('con-status').textContent = 'inspecting · replay resumes shortly'; show(r, false); });
      q.prepend(li);
      while (q.children.length > MAX_ROWS) q.lastChild.remove();
    }

    $('con-toggle').addEventListener('click', () => {
      paused = !paused; holdUntil = 0;
      $('con-toggle').textContent = paused ? 'Resume' : 'Pause';
      $('con-status').textContent = paused ? 'paused' : 'replaying';
    });

    SL.showIncident = (id) => {
      const r = list.find((x) => x.id === id); if (!r) return;
      holdUntil = Date.now() + 30000; $('con-status').textContent = 'inspecting · replay resumes shortly';
      show(r, false); root.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    async function loop() {
      for (;;) {
        q.innerHTML = ''; detail.innerHTML = '';
        const c = { alerts: 0, esc: 0, mon: 0, dis: 0 };
        for (let i = 0; i < list.length; i++) {
          const r = list[i];
          await sleep(r.dec === 'escalate' ? 420 : 85);
          $('con-status').textContent = 'replaying';
          c.alerts += r.flows; c[r.dec === 'escalate' ? 'esc' : r.dec === 'monitor' ? 'mon' : 'dis']++;
          addRow(r);
          $('con-clock').textContent = r.t;
          $('st-flows').textContent = fmt((F.flows * (i + 1)) / list.length);
          $('st-alerts').textContent = fmt(c.alerts); $('st-inc').textContent = i + 1;
          $('st-esc').textContent = c.esc; $('st-mon').textContent = c.mon; $('st-dis').textContent = c.dis;
          $('q-count').textContent = `${i + 1} / ${list.length}`;
          $('con-prog').style.width = ((i + 1) / list.length) * 100 + '%';
          if (r.dec === 'escalate' && (r.rep || !shown || c.esc % 4 === 0)) {
            await show(r, true);
            await sleep(r.rep ? 4200 : 1400);
          } else if (i === 0) show(r, true);
        }
        $('con-status').textContent = 'replay complete · restarting';
        await sleep(6000);
        shown = null;
      }
    }
    loop();
  };
})();
