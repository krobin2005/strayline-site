/* The film, in 3D. A small perspective engine on Canvas 2D: no libraries.
   World: x = direction of flow, z = depth, y = up. Normal traffic is a flowing surface;
   strays lift off it. Scroll position p in [0, 5] moves the camera and morphs the particles:
   0 hero · 1 known-attack gate · 2 two detectors · 3 alert flood · 4 414 incidents · 5 triage tiers
   Cluster sizes and triage tiers come from the real v1 run (window.STRAYLINE_DATA): every incident sent to
   the AI plus a sample of those the ranking held back. */
(function () {
  'use strict';
  const SL = (window.SL = window.SL || {});
  const D = window.STRAYLINE_DATA;

  const INK = [52, 60, 74], RED = [217, 72, 63], BLUE = [47, 109, 181], GREY = [164, 170, 180], AMBER = [176, 116, 24];
  const GREEN = '#117A5F', CREAM = [255, 248, 236];
  // tiers: held back by the ranking (never sent to the AI) · reviewed by the triage agent · escalated
  const DEC = { held: 0, dismiss: 1, monitor: 1, escalate: 2 }, DEC_RGB = [GREY, BLUE, RED];
  const BEHAV = ['novel_unknown', 'port_scan', 'botnet_c2', 'infiltration_lateral', 'brute_force', 'web_attack', 'dos_flood'];
  const X = 10, Z = 3.2, XS = 11.5, PLANE = 2.7, GY = [1.3, 2.7, 4.3], GATE_A = -0.8, GATE_B = 3.2;
  const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif', MONO = 'ui-monospace, "SF Mono", Menlo, monospace';

  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const lerp = (a, b, f) => a + (b - a) * f;
  const rgb = (a, b, f) => 'rgb(' + ((a[0] + (b[0] - a[0]) * f) | 0) + ',' + ((a[1] + (b[1] - a[1]) * f) | 0) + ',' + ((a[2] + (b[2] - a[2]) * f) | 0) + ')';
  const rgba = (c, a) => 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a.toFixed(3) + ')';

  function Film(canvas) {
    this.c = canvas; this.ctx = canvas.getContext('2d');
    this.p = 0; this.t = 0; this.mx = -999; this.my = -999; this.sx = 0.5; this.sy = 0.5;
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const glow = (c) => {
      const g = document.createElement('canvas'); g.width = g.height = 96;
      const x = g.getContext('2d'), r = x.createRadialGradient(48, 48, 0, 48, 48, 48);
      r.addColorStop(0, 'rgba(' + c + ',0.6)'); r.addColorStop(0.4, 'rgba(' + c + ',0.2)'); r.addColorStop(1, 'rgba(' + c + ',0)');
      x.fillStyle = r; x.fillRect(0, 0, 96, 96); return g;
    };
    this.glowR = glow('226,60,48'); this.glowA = glow('214,140,20');
    this.orbY = 0; this.orbP = 0; this.velY = 0; this.velP = 0; this.drag = false; this.hov = false;
    this.hx = 0; this.hz = 0; this.hs = 0; this.hit = false; this.rip = []; this.pick = -1; this.lastPick = -2; this.next = 0;
    this.tipEl = document.createElement('div'); this.tipEl.className = 'tip'; canvas.parentNode.appendChild(this.tipEl);
    this.resize();
    this.bind();
  }

  // touch: drag orbits the camera, a tap ripples the surface and launches a stray (or opens the hovered incident)
  Film.prototype.bind = function () {
    const c = this.c;
    let px = 0, py = 0, moved = 0;
    c.style.touchAction = 'pan-y'; c.style.cursor = 'grab';
    const pos = (e) => { const r = c.getBoundingClientRect(); this.mx = e.clientX - r.left; this.my = e.clientY - r.top; this.hov = true; };
    c.addEventListener('pointerdown', (e) => { pos(e); this.drag = true; moved = 0; this.moved = 0; px = e.clientX; py = e.clientY; try { c.setPointerCapture(e.pointerId); } catch (_) {} });
    c.addEventListener('pointermove', (e) => {
      pos(e);
      if (!this.drag) return;
      const dx = e.clientX - px, dy = e.clientY - py; px = e.clientX; py = e.clientY; moved += Math.abs(dx) + Math.abs(dy); this.moved = moved;
      this.velY = -dx * 0.0032; this.velP = dy * 0.0028; this.orbY += this.velY; this.orbP += this.velP;
    });
    const release = (e) => { if (e.pointerType !== 'mouse') { this.hov = false; this.mx = this.my = -999; } };
    c.addEventListener('pointerup', (e) => { if (!this.drag) return; this.drag = false; if (moved < 6) this.tap(); release(e); });
    c.addEventListener('pointercancel', (e) => { this.drag = false; release(e); });
    c.addEventListener('pointerleave', () => { if (!this.drag) this.hov = false; });
  };

  Film.prototype.tap = function () {
    if (this.pick >= 0) { if (SL.showIncident) SL.showIncident(D.incidents[this.pick].id); return; }
    if (!this.hit) return;
    this.rip.push(this.hx, this.hz, this.t); if (this.rip.length > 12) this.rip.splice(0, 3);
    if (this.p < 2.6) {
      const i = this.next++ % this.nBig, u = clamp((this.hx / X + 1) / 2, 0.02, 0.9);
      this.u0[i] = (((u - this.t * this.sp[i]) % 1) + 1) % 1; this.zp[i] = clamp(this.hz, -Z * 0.9, Z * 0.9);
      this.lt[i] = this.t; this.le[i] = this.t + (1 - u) / this.sp[i];
    }
  };

  Film.prototype.resize = function () {
    const r = this.c.getBoundingClientRect();
    const W = Math.max(320, Math.round(r.width)), H = Math.max(320, Math.round(r.height));
    if (W === this.W && H === this.H) return;
    this.W = W; this.H = H;
    const dpr = Math.min(window.devicePixelRatio || 1, W < 980 ? 1.75 : 2);
    this.c.width = Math.round(W * dpr); this.c.height = Math.round(H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const nar = (this.narrow = W < 980);
    this.cam = {
      yaw: [-0.5, -0.22, 0.28, 0.1, -0.38, -0.46],
      pitch: [0.3, 0.24, 0.3, 0.46, 0.62, 0.4],
      dist: nar ? [9.5, 8.5, 9, 11.5, 17, 19.5] : [11, 10, 10.5, 13.5, 18.5, 21],
      ty: [0.4, 0.5, 0.6, 1.6, 2.0, 2.4],
      cx: nar ? [0.5, 0.5, 0.5, 0.5, 0.5, 0.45] : [0.6, 0.62, 0.62, 0.6, 0.63, 0.61],
      cy: nar ? [0.8, 0.34, 0.34, 0.32, 0.31, 0.3] : [0.58, 0.52, 0.52, 0.52, 0.5, 0.56],
    };
    const N = nar ? 1400 : clamp(Math.round((W * H) / 420), 2200, 3400);
    if (N !== this.N) this.build(N);
  };

  function place(list, R, GX, GZ, jit, seed) {
    const n = list.length, w = R.x1 - R.x0, d = R.z1 - R.z0;
    const cols = Math.max(1, Math.round(Math.sqrt((n * w) / d))), rows = Math.ceil(n / cols);
    list.forEach((j, k) => {
      GX[j] = R.x0 + ((k % cols) + 0.5 + (hash(j * 1.3 + seed) - 0.5) * jit) * (w / cols);
      GZ[j] = R.z0 + (Math.floor(k / cols) + 0.5 + (hash(j * 2.9 + seed) - 0.5) * jit) * (d / rows);
    });
  }

  Film.prototype.build = function (N) {
    this.N = N;
    const A = (this.A = Math.round(N * (D.film_alert_share || D.funnel.alerts / D.funnel.flows)));
    const f32 = () => new Float32Array(N);
    const u0 = (this.u0 = f32()), sp = (this.sp = f32()), zp = (this.zp = f32()), dev = (this.dev = f32()), adev = (this.adev = f32()),
      ox = (this.ox = f32()), oy = (this.oy = f32()), oz = (this.oz = f32()), al = (this.al = f32()), jy = (this.jy = f32());
    const kind = (this.kind = new Uint8Array(N)), cl = (this.cl = new Uint16Array(N));
    this.lt = f32().fill(-99); this.le = f32();
    const nBig = (this.nBig = this.narrow ? 8 : 13), nSmall = this.narrow ? 5 : 8, nKnown = this.narrow ? 7 : 11;
    this.nk = nBig + nSmall + nKnown;
    for (let i = 0; i < N; i++) {
      u0[i] = hash(i * 1.7 + 0.3);
      sp[i] = 0.03 + 0.028 * hash(i * 2.3);
      zp[i] = ((hash(i * 3.1) + hash(i * 4.3) + hash(i * 5.9)) / 1.5 - 1) * Z * 0.98;
      al[i] = 0.28 + 0.4 * hash(i * 6.7);
      jy[i] = 0.03 + 0.07 * hash(i * 7.3);
      adev[i] = 0.04 + 0.96 * Math.pow(hash(i * 7.7), 1.5);
      if (i < nBig) { kind[i] = 1; dev[i] = 1.1 + 1.3 * hash(i * 9.1); u0[i] = (i + hash(i)) / nBig; }
      else if (i < nBig + nSmall) { kind[i] = 2; dev[i] = 0.16 + 0.12 * hash(i * 9.1); u0[i] = (i - nBig + hash(i)) / nSmall; }
      else if (i < nBig + nSmall + nKnown) { kind[i] = 3; dev[i] = 1.0 + 1.2 * hash(i * 9.1); u0[i] = (i - nBig - nSmall + hash(i)) / nKnown; }
      if (kind[i]) { sp[i] = 0.032 + 0.01 * hash(i * 2.3); zp[i] = (hash(i * 11.3) * 2 - 1) * Z * 0.8; }
    }
    // alert particles -> real incidents; more particles for incidents with more alerted flows
    const inc = D.incidents, M = inc.length;
    const w = inc.map((r) => Math.log10(r.flows + 1) + 0.6), sw = w.reduce((a, b) => a + b, 0);
    const cnt = new Uint16Array(M);
    let used = 0;
    for (let j = 0; j < M; j++) { cnt[j] = Math.max(1, Math.floor((A * w[j]) / sw)); used += cnt[j]; }
    for (let j = 0; used < A; j = (j + 37) % M) { cnt[j]++; used++; }
    this.dec = Uint8Array.from(inc, (r) => DEC[r.dec]);
    this.atk = Uint8Array.from(inc, (r) => (r.truth ? 1 : 0));
    const s = 0.072;
    for (let j = 0, i = 0; j < M && i < A; j++) {
      for (let m = 0; m < cnt[j] && i < A; m++, i++) {
        cl[i] = j;
        const rr = s * Math.sqrt(m + 0.25), th = m * 2.39996 + j;
        ox[i] = rr * Math.cos(th); oz[i] = rr * Math.sin(th); oy[i] = (hash(i * 13.7) - 0.5) * s * 1.6;
      }
    }
    this.rad = Float32Array.from(cnt, (k) => s * Math.sqrt(k) + 0.05);
    // layouts in world space
    const all = Array.from({ length: M }, (_, j) => j);
    this.g4x = new Float32Array(M); this.g4z = new Float32Array(M); this.g5x = new Float32Array(M); this.g5z = new Float32Array(M);
    this.R4 = { x0: -6.3, x1: 6.3, z0: -Z * 0.95, z1: Z * 0.95 };
    place(all, this.R4, this.g4x, this.g4z, 0.5, 1);
    const F = D.funnel, xr = [[-6.6, -2.0], [-1.4, 2.6], [3.2, 6.6]], nm = [[F.held, 'held back by ranking'], [F.reviewed, 'reviewed by AI'], [F.escalated, 'escalated']];
    this.groups = xr.map((r, g) => {
      const plain = all.filter((j) => this.dec[j] === g && !this.atk[j]), hot = all.filter((j) => this.dec[j] === g && this.atk[j]);
      const list = plain.slice();   // spread the real attacks through their tier
      hot.forEach((j, k) => list.splice(Math.round(((k + 0.5) * list.length) / hot.length), 0, j));
      const R = { x0: r[0], x1: r[1], z0: -Z * 0.95, z1: Z * 0.95 };
      place(list, R, this.g5x, this.g5z, 0.35, 2);
      return { R, y: GY[g], n: nm[g][0], label: nm[g][1], c: DEC_RGB[g] };
    });
  };

  Film.prototype.frame = function (dt) {
    if (!this.reduced) this.t += dt; else this.t = 20;
    const ctx = this.ctx, W = this.W, H = this.H, t = this.t, p = this.p, nar = this.narrow, cam = this.cam;
    const s = Math.min(4, Math.floor(p)), f = p - s, s2 = s + 1, fs = smooth(f);
    const L = (a) => lerp(a[s], a[s2], fs);
    const w = (k) => Math.max(0, 1 - Math.abs(p - k)), w0 = w(0), w1 = w(1), w2 = w(2);

    // camera: scene pose + slow drift + pointer parallax
    const tx = this.mx > -900 && !this.reduced ? this.mx / W : 0.5, tyy = this.my > -900 && !this.reduced ? this.my / H : 0.5;
    this.sx += (tx - this.sx) * 0.04; this.sy += (tyy - this.sy) * 0.04;
    if (!this.drag) {
      this.orbY += this.velY; this.orbP += this.velP; this.velY *= 0.92; this.velP *= 0.92;
      const k = 1 - Math.min(1, dt * 0.25); this.orbY *= k; this.orbP *= k;
    }
    this.orbY = clamp(this.orbY, -1.1, 1.1);
    const yaw = L(cam.yaw) + 0.07 * Math.sin(t * 0.13) + (this.sx - 0.5) * 0.18 + this.orbY;
    const pitch = clamp(L(cam.pitch) + 0.02 * Math.sin(t * 0.17) - (this.sy - 0.5) * 0.08 + this.orbP, 0.06, 1.25);
    this.orbP = pitch - (L(cam.pitch) + 0.02 * Math.sin(t * 0.17) - (this.sy - 0.5) * 0.08);
    const dist = L(cam.dist), tgy = L(cam.ty);
    const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sn = Math.sin(pitch);
    const camx = dist * syw * cp, camy = tgy + dist * sn, camz = dist * cyw * cp;
    const foc = 1.1 * Math.min(W, H * 1.2), cx = W * L(cam.cx), cy = H * L(cam.cy);
    let PX = 0, PY = 0, PS = 0, PD = 0;
    const proj = (x, y, z) => {
      const vx = x - camx, vy = y - camy, vz = z - camz;
      const x1 = vx * cyw - vz * syw, z1 = vx * syw + vz * cyw;
      const dp = -(z1 * cp + vy * sn);
      if (dp < 0.6) return false;
      PD = dp; PS = foc / dp; PX = cx + x1 * PS; PY = cy - (vy * cp - z1 * sn) * PS;
      return true;
    };
    // where the pointer touches the surface (ray from the camera through the pointer)
    this.hit = false;
    if (this.hov && this.mx > -900) {
      const a = (this.mx - cx) / foc, b = -(this.my - cy) / foc, vy = b * cp - sn, z1 = -(cp + b * sn);
      if (vy < -0.02) {
        const k = (0.1 - camy) / vy, x = camx + k * (a * cyw + z1 * syw), z = camz + k * (-a * syw + z1 * cyw);
        if (Math.abs(x) < XS && Math.abs(z) < Z + 0.6) { this.hx = x; this.hz = z; this.hit = true; }
      }
    }
    this.hs += ((this.hit && p < 3.6 && !this.reduced ? 1 : 0) - this.hs) * 0.12;
    const hx = this.hx, hz = this.hz, hs = this.hs, rip = this.rip;
    // active strays pull the surface up into hot peaks (until the flood takes over)
    const pk = 1 - smooth((p - 2.2) / 0.7), fl = smooth((p - 2.2) / 0.7) * (1 - smooth(p - 3.1));
    const bumpOf = (i, u) => Math.min(1, smooth((u - 0.22) / 0.16) + (this.lt[i] > -50 ? (t < this.le[i] ? smooth((t - this.lt[i]) / 0.9) : ((this.lt[i] = -99), 0)) : 0));
    const act = [];
    if (pk > 0.01) for (let i = 0; i < this.nk; i++) {
      if (this.kind[i] === 2) continue;
      const u = (this.u0[i] + t * this.sp[i]) % 1, bm = bumpOf(i, u);
      if (bm > 0.02) act.push((u * 2 - 1) * X, this.zp[i], this.dev[i] * bm);
    }
    const h = (x, z) => {
      let y = 0.55 * (0.55 * Math.sin(x * 0.55 - t * 0.5 + z * 0.3) + 0.3 * Math.sin(x * 1.1 + 1 + t * 0.33 - z * 0.55) + 0.16 * Math.sin(x * 2.3 - t * 0.9 + z * 0.9));
      if (hs > 0.01) { const dx = x - hx, dz = z - hz; y += 0.5 * hs * Math.exp(-(dx * dx + dz * dz) / 0.8); }
      for (let k = 0; k < rip.length; k += 3) {
        const age = t - rip[k + 2]; if (age > 5) continue;
        const dx = x - rip[k], dz = z - rip[k + 1], d = Math.sqrt(dx * dx + dz * dz) - age * 2.6;
        y += 0.42 * Math.exp(-age * 0.8) * Math.exp(-(d * d) / 0.35) * Math.cos(d * 3);
      }
      if (pk > 0.01) for (let k = 0; k < act.length; k += 3) {
        const dx = x - act[k]; if (dx > 1.8 || dx < -1.8) continue;
        const dz = z - act[k + 1]; y += 0.5 * pk * act[k + 2] * Math.exp(-(dx * dx + dz * dz) / 0.45);
      }
      return y;
    };
    const heat = (x, z) => {
      let v = 0;
      if (pk > 0.01) for (let k = 0; k < act.length; k += 3) {
        const dx = x - act[k]; if (dx > 2.6 || dx < -2.6) continue;
        const dz = z - act[k + 1]; v += pk * Math.min(1, act[k + 2]) * Math.exp(-(dx * dx + dz * dz) / 0.42);
      }
      if (fl > 0.01) v += fl * (0.45 + 0.45 * Math.sin(x * 0.9 + t * 0.7 + z * 1.3) * Math.sin(z * 1.1 - t * 0.5 + x * 0.4));
      return v;
    };
    const fog = () => clamp((dist * 1.95 - PD) / dist, 0.12, 1);

    ctx.clearRect(0, 0, W, H);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    // the normal surface
    const sheetA = 1 - 0.4 * smooth((p - 3.4) / 0.8);
    const path = (fn, n) => {
      ctx.beginPath();
      let pen = false;
      for (let j = 0; j <= n; j++) { if (fn(j / n)) { if (pen) ctx.lineTo(PX, PY); else ctx.moveTo(PX, PY); pen = true; } else pen = false; }
    };
    // a lit, filled mesh that turns red-hot where traffic strays
    const GXN = nar ? 40 : 60, GZN = nar ? 12 : 16, row = GXN + 1;
    if (!this.gp) { const n = 61 * 17; this.gp = { x: new Float32Array(n), y: new Float32Array(n), h: new Float32Array(n), ht: new Float32Array(n), ok: new Uint8Array(n) }; }
    const gp = this.gp;
    for (let iz = 0, n = 0; iz <= GZN; iz++) {
      const z = -Z + (2 * Z * iz) / GZN;
      for (let ix = 0; ix <= GXN; ix++, n++) {
        const x = -XS + (2 * XS * ix) / GXN, y = h(x, z);
        gp.h[n] = y; gp.ht[n] = heat(x, z); gp.ok[n] = proj(x, y, z) ? 1 : 0; gp.x[n] = PX; gp.y[n] = PY;
      }
    }
    ctx.lineWidth = 0.6; ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    const fwd = camx >= 0;
    for (let iz = 0; iz < GZN; iz++) for (let q = 0; q < GXN; q++) {
      const ix = fwd ? q : GXN - 1 - q, a = iz * row + ix, b = a + 1, c = b + row, d = a + row;
      if (!(gp.ok[a] && gp.ok[b] && gp.ok[c] && gp.ok[d])) continue;
      const sh = clamp(0.5 + (gp.h[a] - gp.h[b]) * 1.5 + (gp.h[d] - gp.h[a]) * 0.9, 0, 1);
      const ht = Math.min(1, (gp.ht[a] + gp.ht[c]) * 0.5);
      const r = lerp(lerp(26, 104, sh), lerp(176, 246, sh), ht), g = lerp(lerp(84, 162, sh), lerp(40, 118, sh), ht), bl = lerp(lerp(162, 226, sh), lerp(38, 92, sh), ht);
      ctx.globalAlpha = 0.95 * Math.min(1, Math.min(ix, GXN - 1 - ix) / 5) * sheetA;
      ctx.fillStyle = 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (bl | 0) + ')';
      ctx.beginPath(); ctx.moveTo(gp.x[a], gp.y[a]); ctx.lineTo(gp.x[b], gp.y[b]); ctx.lineTo(gp.x[c], gp.y[c]); ctx.lineTo(gp.x[d], gp.y[d]); ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,250,240,' + (0.95 * sheetA).toFixed(3) + ')'; ctx.lineWidth = nar ? 1.8 : 2.4;
    path((q) => { const x = -XS + 2 * XS * q; return proj(x, h(x, 0), 0); }, 90); ctx.stroke();

    if (hs > 0.02) {   // the touch point, drawn on the surface
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.95 * hs).toFixed(3) + ')'; ctx.lineWidth = 1.8;
      path((q) => { const a = q * 6.2832, x = hx + 0.42 * Math.cos(a), z = hz + 0.42 * Math.sin(a); return proj(x, h(x, z), z); }, 28); ctx.stroke();
    }

    // detector gates: planes across the flow
    const quad = (pts, fill, stroke, lw) => {
      ctx.beginPath();
      for (let k = 0; k < pts.length; k += 3) { if (!proj(pts[k], pts[k + 1], pts[k + 2])) return false; if (k) ctx.lineTo(PX, PY); else ctx.moveTo(PX, PY); }
      ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
      return true;
    };
    const gate = (gx, a, c, title, sub) => {
      if (a < 0.01) return;
      const y0 = -0.9, y1 = 3.1;
      quad([gx, y0, -Z, gx, y0, Z, gx, y1, Z, gx, y1, -Z], rgba(c, 0.07 * a), rgba(c, 0.55 * a), 1);
      ctx.strokeStyle = rgba(c, 0.9 * a); ctx.lineWidth = 1.6;
      path((q) => { const z = -Z + 2 * Z * q; return proj(gx, h(gx, z), z); }, 14); ctx.stroke();
      const sy = lerp(y0, y1, (t * 0.28) % 1);
      ctx.strokeStyle = rgba(c, 0.35 * a); ctx.lineWidth = 1;
      path((q) => proj(gx, sy, -Z + 2 * Z * q), 1); ctx.stroke();
      if (proj(gx, y1, Z)) {
        ctx.globalAlpha = a; ctx.textAlign = 'left'; ctx.fillStyle = rgb(c, c, 0);
        ctx.font = '700 11px ' + MONO; ctx.fillText(title, PX + 8, PY + 16);
        ctx.fillStyle = '#5B6470'; ctx.font = '12px ' + SANS; ctx.fillText(sub, PX + 8, PY + 32);
        ctx.globalAlpha = 1;
      }
    };
    gate(GATE_A, w1, AMBER, 'KNOWN-ATTACK TOOL', 'catches what it was taught');
    gate(GATE_A, w2, AMBER, 'CLASSIFIER', 'known attacks');
    gate(GATE_B, w2, RED, 'AUTOENCODER', 'anything unusual');

    // incident plane (scene 4) and triage tiers (scene 5)
    const a4 = smooth((p - 3.45) / 0.5) * (1 - smooth((p - 4.15) / 0.5)), a5 = smooth((p - 4.45) / 0.45);
    const slab = (R, y, c, a) => {
      const m = 0.25;
      const P = [R.x0 - m, y, R.z0 - m, R.x1 + m, y, R.z0 - m, R.x1 + m, y, R.z1 + m, R.x0 - m, y, R.z1 + m];
      quad(P, 'rgba(251,247,240,' + (0.9 * a).toFixed(3) + ')');
      quad(P, rgba(c, 0.1 * a), 'rgba(30,42,62,' + (0.35 * a).toFixed(3) + ')', 1);
    };
    if (a4 > 0.01) slab(this.R4, PLANE - 0.12, INK, a4);
    if (a5 > 0.01) {
      this.groups.forEach((g) => {
        slab(g.R, g.y - 0.12, g.c, a5);
        ctx.setLineDash([2, 5]); ctx.strokeStyle = 'rgba(30,42,62,' + (0.22 * a5).toFixed(3) + ')';
        [[g.R.x0, g.R.z1], [g.R.x1, g.R.z1], [g.R.x1, g.R.z0], [g.R.x0, g.R.z0]].forEach((c) => {
          const yb = h(c[0], c[1]);
          path((q) => proj(c[0], lerp(g.y - 0.12, yb, q), c[1]), 1); ctx.stroke();
        });
        ctx.setLineDash([]);
      });
    }

    // particles
    const N = this.N, A = this.A, u0 = this.u0, sp = this.sp, zp = this.zp, dev = this.dev, adev = this.adev, kind = this.kind,
      cl = this.cl, ox = this.ox, oy = this.oy, oz = this.oz, al = this.al, jy = this.jy, dec = this.dec;
    const g4x = this.g4x, g4z = this.g4z, g5x = this.g5x, g5z = this.g5z;
    const a3 = smooth((p - 2.2) / 0.7), g5 = smooth((p - 4.25) / 0.6), hide = 1 - 0.5 * smooth((p - 3.3) / 0.7), inCl = smooth(p - 3);
    const escS = 1.35, pins = [];
    let TX = 0, TY = 0, TZ = 0;
    const target = (k, i, x, yS, z, hy) => {
      if (k <= 2 || i >= A) { TX = x; TY = yS; TZ = z; return; }
      if (k === 3) { TX = x; TY = hy + 0.25 + adev[i] * 4.1; TZ = z; return; }
      const j = cl[i], d = dec[j], sc = (k === 5 && d === 2 ? escS : 1) * (1 + 0.07 * Math.sin(t * 1.3 + j));
      TX = (k === 4 ? g4x[j] : g5x[j]) + ox[i] * sc; TY = (k === 4 ? PLANE : GY[d]) + oy[i] * sc; TZ = (k === 4 ? g4z[j] : g5z[j]) + oz[i] * sc;
    };
    const inkStyle = 'rgb(255,248,236)';
    ctx.fillStyle = inkStyle;
    for (let i = N - 1; i >= 0; i--) {
      const u = (u0[i] + t * sp[i]) % 1, x = (u * 2 - 1) * X, z = zp[i], hy = h(x, z), kd = kind[i];
      const bm = kd ? bumpOf(i, u) : 0;
      const yS = hy + jy[i] + (kd ? dev[i] * bm * (kd === 2 ? 1 : 1 - 0.5 * pk) : 0);
      const fi = s >= 2 ? smooth(clamp(f * 1.5 - hash(i * 8.3) * 0.5, 0, 1)) : fs;
      target(s, i, x, yS, z, hy); const ax = TX, ay = TY, az = TZ;
      target(s2, i, x, yS, z, hy);
      const wx = ax + (TX - ax) * fi, wy = ay + (TY - ay) * fi, wz = az + (TZ - az) * fi;
      if (!proj(wx, wy, wz)) continue;
      const fg = fog();
      if (i >= A) {
        const sz = clamp(0.022 * PS, 1.1, 3.4);
        ctx.globalAlpha = Math.min(1, (al[i] + 0.3) * hide * fg);
        ctx.fillRect(PX - sz * 0.5, PY - sz * 0.5, sz, sz);
        continue;
      }
      let size = clamp((0.022 + 0.03 * a3) * PS, 1.2, 6), orb = 0, amber = false;
      let alpha = lerp(al[i] + 0.3, 0.86 + 0.14 * Math.sin(t * 3 + i), a3 * (1 - inCl));
      alpha = lerp(alpha, 0.92, inCl) * lerp(fg, 1, Math.max(inCl * 0.6, a3 * 0.7));
      let col;
      if (g5 > 0) { const d = dec[cl[i]]; col = rgb(RED, DEC_RGB[d], g5); if (d === 0) alpha *= 1 - 0.3 * g5; }
      else col = rgb(CREAM, RED, a3);
      if (kd) {
        const known = kd === 3, km = known ? clamp(w1 + w2, 0, 1) : 0, sm = kd === 2 ? 0.5 : 1;
        if (p < 2.6) { col = rgb(RED, AMBER, km); alpha = lerp(1, alpha, a3); size = lerp(Math.max(nar ? 11 : 16, 0.18 * PS) * sm, size, a3); orb = 1 - a3; amber = km > 0.5; }
        const c0 = kd !== 2 && bm > 0.6 ? smooth((bm - 0.6) / 0.4) : 0;
        const cA = known ? smooth((x - GATE_A) / 0.4) : 0, cB = kd === 1 ? smooth((x - GATE_B) / 0.4) : 0;
        const pa = w0 * c0 + w1 * cA + w2 * (known ? cA : cB);
        if (pa > 0.02) { const qx = PX, qy = PY, qs = PS; if (proj(wx, hy, wz)) pins.push(qx, qy, qs, PX, PY, pa, km, i); PX = qx; PY = qy; }
      }
      ctx.globalAlpha = clamp(alpha, 0, 1);
      ctx.fillStyle = col;
      if (orb > 0.05 && size > 5) {   // an attack: glowing sphere
        const gs = size * 3.8, al2 = clamp(alpha, 0, 1);
        ctx.globalAlpha = al2 * orb; ctx.drawImage(amber ? this.glowA : this.glowR, PX - gs / 2, PY - gs / 2, gs, gs);
        ctx.globalAlpha = al2; ctx.beginPath(); ctx.arc(PX, PY, size * 0.5, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = al2 * 0.6; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(PX - size * 0.15, PY - size * 0.17, size * 0.15, 0, 6.2832); ctx.fill();
      }
      else if (size > 2.4) { ctx.beginPath(); ctx.arc(PX, PY, size * 0.5, 0, 6.2832); ctx.fill(); }
      else ctx.fillRect(PX - size * 0.5, PY - size * 0.5, size, size);
      ctx.fillStyle = inkStyle;
    }
    ctx.globalAlpha = 1;

    // hover an incident cluster: highlight + tooltip with the real incident
    this.pick = -1;
    if (p > 3.7 && this.hov && (!this.drag || this.moved < 6)) {  // keep the pick during a click, drop it once dragging
      const cf = s >= 4 ? fs : 0;
      let best = 26 * 26, bx = 0, by = 0, br = 0;
      for (let j = 0; j < dec.length; j++) {
        if (!proj(lerp(g4x[j], g5x[j], cf), lerp(PLANE, GY[dec[j]], cf), lerp(g4z[j], g5z[j], cf))) continue;
        const dx = PX - this.mx, dy = PY - this.my, d2 = dx * dx + dy * dy;
        if (d2 < best) { best = d2; this.pick = j; bx = PX; by = PY; br = this.rad[j] * PS; }
      }
      if (this.pick >= 0) {
        ctx.strokeStyle = '#0E1116'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(bx, by, Math.max(br + 5, 8), 0, 6.2832); ctx.stroke();
        this.tipEl.style.transform = 'translate(' + Math.round(Math.min(bx + 16, W - 280)) + 'px,' + Math.round(by + 16) + 'px)';
      }
    }
    if (this.pick !== this.lastPick) {
      this.lastPick = this.pick;
      const el = this.tipEl;
      el.classList.toggle('on', this.pick >= 0);
      if (this.pick >= 0) {
        const r = D.incidents[this.pick];
        el.textContent = '';
        const add = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; n.textContent = text; el.appendChild(n); };
        add('b', '', r.id); add('span', 'badge ' + r.dec, (r.dec === 'held' ? 'held back' : r.dec) + (r.dec === 'escalate' ? ' · p' + r.pri : ''));
        add('p', '', r.src + ' → ' + r.dst); add('p', '', r.flows.toLocaleString('en-US') + ' alerted flows · ' + r.sus);
        add('small', '', r.dec === 'held' ? 'Held back by the ranking · click for why' : 'Click to open in the console');
      }
    }
    this.c.style.cursor = this.pick >= 0 ? 'pointer' : this.drag ? 'grabbing' : 'grab';

    // real attacks: green ring, tethered to the surface
    const ra = smooth((p - 4.35) / 0.45);
    if (ra > 0.01) {
      const cf = s >= 4 ? fs : 0;
      ctx.strokeStyle = GREEN;
      for (let j = 0; j < this.atk.length; j++) {
        if (!this.atk[j]) continue;
        const x = lerp(g4x[j], g5x[j], cf), z = lerp(g4z[j], g5z[j], cf), y = lerp(PLANE, GY[2], cf);
        if (!proj(x, h(x, z), z)) continue;
        const bx = PX, by = PY;
        if (!proj(x, y, z)) continue;
        const r = clamp(this.rad[j] * escS * PS + 4, nar ? 4 : 6, nar ? 8 : 14);
        ctx.globalAlpha = ra * 0.5; ctx.lineWidth = 1; ctx.setLineDash([1, 5]);
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(PX, PY + r); ctx.stroke(); ctx.setLineDash([]);
        ctx.globalAlpha = ra; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(PX, PY, r, 0, 6.2832); ctx.stroke();
        const pu = (t * 0.5 + j * 0.13) % 1;
        ctx.globalAlpha = ra * (1 - pu) * 0.55; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(PX, PY, r + pu * 12, 0, 6.2832); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // pins: shadow on the surface, dotted stem, ring + dot (the logo, in space)
    for (let q = 0; q < pins.length; q += 8) {
      const px = pins[q], py = pins[q + 1], ps = pins[q + 2], bx = pins[q + 3], by = pins[q + 4], pa = pins[q + 5], km = pins[q + 6], i = pins[q + 7];
      const R = clamp(0.16 * ps, 12, 26);
      ctx.globalAlpha = pa * 0.12; ctx.fillStyle = '#0E1116';
      ctx.beginPath(); ctx.ellipse(bx, by, R * 0.95, R * 0.34, 0, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = pa; ctx.strokeStyle = rgb([200, 66, 59], AMBER, km);
      ctx.lineWidth = 2.2; ctx.setLineDash([0.1, 7]);
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(px, lerp(by, py + R, pa)); ctx.stroke(); ctx.setLineDash([]);
      ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(px, py, R * (1.6 - 0.6 * pa), 0, 6.2832); ctx.stroke();
      const pulse = (t * 0.6 + hash(i)) % 1;
      ctx.globalAlpha = pa * (1 - pulse) * 0.45; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(px, py, R + pulse * 15, 0, 6.2832); ctx.stroke();
      for (let e = 0; e < 2; e++) {   // shockwave on the surface under the attack
        const q2 = (t * 0.5 + hash(i) + e * 0.5) % 1, rr = R * (0.6 + 2.8 * q2);
        ctx.globalAlpha = pa * (1 - q2) * 0.8; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.ellipse(bx, by, rr, rr * 0.36, 0, 0, 6.2832); ctx.stroke();
      }
      if (w0 > 0.05 && !nar) {
        ctx.globalAlpha = pa * w0; ctx.fillStyle = '#0E1116'; ctx.textAlign = 'left';
        ctx.font = '600 11.5px ' + MONO; ctx.fillText(BEHAV[i % BEHAV.length], px + R + 8, py + 3.5);
      }
    }
    ctx.globalAlpha = 1;

    // tier labels
    if (a5 > 0.01) {
      ctx.textAlign = 'left';
      this.groups.forEach((g, k) => {
        if (!proj(g.R.x0 - 0.25, g.y - 0.12, g.R.z1 + 0.25)) return;
        const lx = PX, ly = PY + 20;
        ctx.globalAlpha = a5;
        ctx.font = '700 15px ' + SANS; ctx.fillStyle = k === 0 ? '#5B6470' : rgb(g.c, g.c, 0);
        const gn = g.n.toLocaleString('en-US');
        ctx.fillText(gn, lx, ly);
        const nw = ctx.measureText(gn).width;
        ctx.font = '13px ' + SANS; ctx.fillStyle = '#5B6470'; ctx.fillText(g.label, lx + nw + 6, ly);
        if (k === 2) { ctx.fillStyle = GREEN; ctx.font = '700 12px ' + SANS; ctx.fillText('○ ' + D.funnel.attacks_escalated + ' / ' + D.funnel.attacks + ' real intrusion', lx, ly + 17); }
      });
      ctx.globalAlpha = 1;
    }
  };

  SL.Film = Film;
  SL.util = { clamp, smooth, lerp, hash };
})();
