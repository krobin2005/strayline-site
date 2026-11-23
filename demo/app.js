// Strayline console: daily queue, incident detail, analyst feedback, pilot summary.
const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const LABEL = { real_threat: "Real threat", unusual_but_fine: "Unusual but fine", false_alarm: "False alarm" };
const pct = (x) => `${(100 * x).toFixed(x < 0.01 ? 2 : 1)}%`;
const api = async (path, body) => {
  const r = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
};

let state = { days: [], day: null, rows: [], open: null, tab: "queue" };

async function loadDays() {
  state.days = await api("/api/days");
  $("#days").innerHTML = `<div class="eyebrow">Days</div>` + (state.days.length ? state.days.map((d) => `
    <button class="day ${d.day === state.day ? "on" : ""}" data-day="${esc(d.day)}">${esc(d.day)}
      <small>${d.for_review} to review · ${d.labelled} labelled</small></button>`).join("") : `<p class="note">No reports yet.</p>`);
  document.querySelectorAll(".day").forEach((b) => (b.onclick = () => showDay(b.dataset.day)));
}

function firedBar(f) {
  const c = Math.round(100 * (f.classifier || 0)), a = Math.round(100 * (f.autoencoder || 0));
  return `<span class="bar" title="classifier ${c}% · anomaly ${a}%"><i style="width:${c / 2}%;background:var(--red)"></i><i style="width:${a / 2}%;background:var(--blue)"></i></span>`;
}

async function showDay(day) {
  state.tab = "queue"; setTab();
  state.day = day; state.open = null; closeDetail();
  await loadDays();
  const s = state.days.find((d) => d.day === day);
  state.rows = await api(`/api/days/${day}`);
  const real = s.label_counts.real_threat;
  $("#view").innerHTML = `
    <div class="eyebrow">Daily queue · ${esc(day)}</div>
    <div class="stats">
      <div class="stat"><b>${s.connections.toLocaleString()}</b><span>connections</span></div>
      <div class="stat"><b>${s.alerts.toLocaleString()}</b><span>alerts (${pct(s.alert_rate)})</span></div>
      <div class="stat"><b>${s.incidents.toLocaleString()}</b><span>incidents</span></div>
      <div class="stat"><b>${s.for_review}</b><span>for review (${s.by_queue.volume} volume, ${s.by_queue["low-and-slow"]} low-and-slow)</span></div>
      <div class="stat" id="stat-labelled"><b>${s.labelled}/${s.for_review}</b><span>labelled · ${real} real</span></div>
    </div>
    <p class="note">Thresholds ${esc(s.thresholds)}, aiming for ${pct(s.fpr_target)} of normal traffic. Ranked by alert volume, then the low-and-slow queue. These are leads for a person, not verdicts.</p>
    <table><thead><tr><th>#</th><th>Incident</th><th>Queue</th><th>Source</th><th class="hide-sm">Destinations</th><th>First seen</th><th class="num">Alerts</th><th class="hide-sm">Ports</th><th class="hide-sm">Fired by</th><th>Label</th></tr></thead>
    <tbody>${state.rows.map((c) => `<tr data-id="${esc(c.id)}">
      <td>${c.rank}</td><td class="nw">${esc(c.id)}</td><td><span class="pill q-${esc(c.queue)}">${esc(c.queue)}</span></td>
      <td class="nw">${esc(c.src)}${c.quarantined ? ` <span class="pill quar">quarantined</span>` : ""}</td><td class="hide-sm">${esc(c.dst)}</td><td>${esc(c.first_seen)}</td>
      <td class="num">${c.alerted_flows.toLocaleString()}</td><td class="hide-sm">${esc((c.top_dst_ports || []).slice(0, 3).join(", "))}</td>
      <td class="hide-sm">${firedBar(c.fired_by)}</td>
      <td>${c.feedback ? `<span class="pill l-${esc(c.feedback.label)}">${LABEL[c.feedback.label]}</span>` : ""}</td></tr>`).join("")}</tbody></table>`;
  document.querySelectorAll("tbody tr").forEach((tr) => (tr.onclick = () => openIncident(tr.dataset.id)));
  history.replaceState(null, "", `#${day}`);
}

function closeDetail() {
  $("#detail").hidden = true; $("main").classList.remove("with-detail");
  document.querySelectorAll("tbody tr").forEach((t) => t.classList.remove("on"));
}

async function openIncident(id) {
  const c = await api(`/api/days/${state.day}/${encodeURIComponent(id)}`);
  state.open = c;
  document.querySelectorAll("tbody tr").forEach((t) => t.classList.toggle("on", t.dataset.id === id));
  const fb = c.feedback || {};
  const feats = (c.unusual_features || []).map((f) => `<tr><td>${esc(f.feature)}</td><td class="num">${f.deviation_sd}</td><td class="num">${esc(f.typical_here)}</td><td class="num">${esc(f.typical_normal)}</td></tr>`).join("");
  const protos = Object.entries(c.protocols || {}).map(([p, n]) => `${{ 6: "TCP", 17: "UDP", 1: "ICMP" }[p] || p}: ${n}`).join(", ");
  $("#detail").innerHTML = `
    <button class="close" title="Close">×</button>
    <div class="eyebrow">${esc(c.queue || "not queued")} · ${esc(state.day)}</div>
    <h2>${esc(c.id)}: ${esc(c.src)} → ${esc(c.dst)}</h2>
    <dl>
      <dt>Direction</dt><dd>${esc(c.direction)}</dd>
      <dt>First seen</dt><dd>${esc(c.first_seen)} for ${c.duration_min} min</dd>
      <dt>Alerted flows</dt><dd>${c.alerted_flows.toLocaleString()} (${c.flows_per_min}/min)</dd>
      <dt>Targets</dt><dd>${c.distinct_dst_hosts} hosts, ${c.distinct_dst_ports} ports (top: ${esc((c.top_dst_ports || []).join(", "))})</dd>
      <dt>Protocols</dt><dd>${esc(protos)}</dd>
      <dt>Fired by</dt><dd>classifier ${pct(c.fired_by.classifier)}, anomaly ${pct(c.fired_by.autoencoder)} ${firedBar(c.fired_by)}</dd>
      <dt>Looks like</dt><dd>${esc(Object.keys(c.nearest_known_class || {})[0] || "-")}</dd>
    </dl>
    <div class="eyebrow">Most unusual vs. this site's normal</div>
    <table><thead><tr><th>Feature</th><th class="num">SD</th><th class="num">Here</th><th class="num">Normal</th></tr></thead><tbody>${feats}</tbody></table>
    ${c.zeek_uids ? `<p class="note">Zeek uids to pull the raw lines (first ${c.zeek_uids.length}): <code>${esc(c.zeek_uids.slice(0, 5).join(" "))}${c.zeek_uids.length > 5 ? " …" : ""}</code></p>` : ""}
    <div class="eyebrow" style="margin-top:16px">Your judgement</div>
    <div class="fb">${Object.entries(LABEL).map(([k, v]) => `<button data-l="${k}" class="${fb.label === k ? "on" : ""}">${v}</button>`).join("")}</div>
    <textarea id="fb-note" placeholder="Note (what you checked, what it was)">${esc(fb.note || "")}</textarea>
    <div class="row"><label class="note" for="fb-min">Minutes spent</label><input id="fb-min" type="number" min="0" step="0.5" value="${esc(fb.minutes ?? "")}"><span id="fb-saved" class="saved"></span></div>
    <div class="eyebrow" style="margin-top:16px">Investigate</div>
    <div id="inv">${invHTML(c.investigation, c)}</div>
    <div class="eyebrow" style="margin-top:16px">Contain</div>
    <div id="quar">${quarHTML(c)}</div>
    <div class="eyebrow" style="margin-top:16px">Ask about this incident</div>
    <div class="ask"><input id="ask-q" placeholder="Is this worth investigating? What would you check first?">
    <div class="row"><button id="ask-go">Ask local AI</button><span class="note">Runs on this machine; sends only the card above.</span></div>
    <div id="ask-out"></div></div>`;
  $("#detail").hidden = false; $("main").classList.add("with-detail");
  $(".close").onclick = closeDetail;
  document.querySelectorAll(".fb button").forEach((b) => (b.onclick = () => save(b.dataset.l)));
  $("#ask-go").onclick = askAI;
  wireQuar();
  wireInv();
}

const VERDICT = { likely_compromised: "Likely compromised", suspicious: "Suspicious", likely_benign: "Likely benign" };
const REC = { quarantine: "Quarantine it", watch: "Keep watching", close: "Close it" };

function invHTML(inv, c) {
  if (!inv) return `<div class="row"><button id="inv-go" class="qbtn">Investigate this device</button></div>
    <p class="note">The local AI checks this device's other incidents, its history and (with --logs) everything it did today, then writes a case report. Nothing leaves this machine.</p>`;
  const r = inv.report;
  return `<div class="case v-${esc(r.verdict)}">
      <div class="row"><span class="pill verdict">${esc(VERDICT[r.verdict] || r.verdict)}</span><span class="note">${esc(r.confidence)} confidence</span></div>
      <p class="sum">${esc(r.summary)}</p>
      <ul>${(r.what_happened || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      <p><b>Recommendation: ${esc(REC[r.recommendation] || r.recommendation)}.</b> ${esc(r.why)}</p>
      <p class="note"><b>Check next:</b> ${esc(r.next_check)}</p>
      ${r.capped ? `<p class="note">The AI leaned toward quarantine; Strayline lowered it because no strong warning sign supports cutting this device off.</p>` : ""}
      <details><summary class="note">Warning signs found (${(inv.evidence.signals || []).length})</summary><ul class="steps">${(inv.evidence.signals || []).map((s) => `<li><b>${esc(s.strength)}</b>: ${esc(s.text)}</li>`).join("")}</ul></details>
      ${r.recommendation === "quarantine" && c.can_quarantine && !c.quarantine ? `<div class="row"><button id="inv-quar" class="qbtn danger">Quarantine (recommended)</button></div>` : ""}
      <details><summary class="note">What it checked</summary><ol class="steps">${inv.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol></details>
      <div class="row"><span class="note">${esc(inv.model)} · ${inv.seconds}s · ${esc(inv.at.replace("T", " "))}</span><button id="inv-go" class="copy">Re-run</button></div>
    </div>`;
}

function wireInv() {
  const go = $("#inv-go"), q = $("#inv-quar");
  if (go) go.onclick = investigate;
  if (q) q.onclick = () => quarantine("quarantine");
}

async function investigate() {
  const box = $("#inv"), c = state.open;
  box.innerHTML = `<p class="note">Investigating ${esc(c.src)}: gathering its incidents, history and activity, then writing the report (local AI, up to a minute)…</p>`;
  try {
    c.investigation = await api("/api/investigate", { day: state.day, id: c.id });
    if (state.open !== c) return;
    box.innerHTML = invHTML(c.investigation, c);
  } catch (e) {
    box.innerHTML = invHTML(c.investigation, c) + `<p class="note">${esc(e.message)}</p>`;
  }
  wireInv();
}

function rulesHTML(rules) {
  return Object.entries(rules).map(([fw, cmd]) => `<div class="rule"><div class="row"><b>${esc(fw)}</b>
    <button class="copy" data-cmd="${esc(cmd)}">Copy</button></div><pre>${esc(cmd)}</pre></div>`).join("");
}

function quarHTML(c, rules) {
  if (!c.can_quarantine) return `<p class="note">Start the console with <code>--state</code> (the pilot's state folder) to quarantine devices.</p>`;
  if (c.quarantine) return `<p><span class="pill quar">quarantined</span> ${esc(c.src)} since ${esc(c.quarantine.at.replace("T", " "))}</p>
    ${rules ? `<p class="note">Apply one of these on the firewall in front of this device:</p>${rulesHTML(rules)}` : ""}
    <div class="row"><button id="q-release" class="qbtn">Release device</button></div>
    ${c.release_rules && !rules ? `<details><summary class="note">Commands to undo the block</summary>${rulesHTML(c.release_rules)}</details>` : ""}`;
  return `${rules ? `<p class="saved">Released. Undo the block with one of these:</p>${rulesHTML(rules)}` : ""}
    <div class="row"><button id="q-go" class="qbtn danger">Quarantine this device</button></div>
    <p class="note">Records the decision and gives the firewall rules to cut ${esc(c.src)} off. A firewall only blocks traffic that passes through it; to stop it reaching devices on the same network, also turn off its switch port or Wi-Fi access.</p>`;
}

function wireQuar(rules) {
  document.querySelectorAll("#quar .copy").forEach((b) => (b.onclick = async () => {
    try { await navigator.clipboard.writeText(b.dataset.cmd); b.textContent = "Copied"; } catch { b.textContent = "Select and copy"; }
  }));
  const go = $("#q-go"), rel = $("#q-release");
  if (go) go.onclick = () => quarantine("quarantine");
  if (rel) rel.onclick = () => quarantine("release");
}

async function quarantine(action) {
  const c = state.open;
  if (!confirm(action === "quarantine" ? `Quarantine ${c.src}? This records the decision and shows the block rules.` : `Release ${c.src}?`)) return;
  try {
    const r = await api("/api/quarantine", { day: state.day, id: c.id, action, note: $("#fb-note").value });
    c.quarantine = action === "quarantine" ? r : null;
    if (action === "quarantine") c.release_rules = null;
    $("#quar").innerHTML = quarHTML(c, r.rules);
    wireQuar();
    if (c.investigation) { $("#inv").innerHTML = invHTML(c.investigation, c); wireInv(); }
    if (action === "quarantine") $("#quar").scrollIntoView({ behavior: "smooth", block: "start" });
    state.rows.forEach((row) => { if (row.src === c.src) row.quarantined = action === "quarantine"; });
    document.querySelectorAll("tbody tr").forEach((tr) => {
      const row = state.rows.find((x) => x.id === tr.dataset.id);
      if (row && row.src === c.src) tr.children[3].innerHTML = esc(row.src) + (row.quarantined ? ` <span class="pill quar">quarantined</span>` : "");
    });
  } catch (e) { $("#quar").insertAdjacentHTML("beforeend", `<p class="note">${esc(e.message)}</p>`); }
}

async function save(label) {
  const c = state.open;
  try {
    await api("/api/feedback", { day: state.day, id: c.id, label, note: $("#fb-note").value, minutes: $("#fb-min").value });
    document.querySelectorAll(".fb button").forEach((b) => b.classList.toggle("on", b.dataset.l === label));
    $("#fb-saved").textContent = "Saved";
    const row = state.rows.find((r) => r.id === c.id);
    if (row) row.feedback = { label };
    const tr = document.querySelector(`tbody tr[data-id="${CSS.escape(c.id)}"] td:last-child`);
    if (tr) tr.innerHTML = `<span class="pill l-${label}">${LABEL[label]}</span>`;
    await loadDays();
    const s = state.days.find((d) => d.day === state.day);
    if (s) $("#stat-labelled").innerHTML = `<b>${s.labelled}/${s.for_review}</b><span>labelled · ${s.label_counts.real_threat} real</span>`;
  } catch (e) { $("#fb-saved").textContent = e.message; }
}

async function askAI() {
  const out = $("#ask-out"), btn = $("#ask-go");
  btn.disabled = true; out.innerHTML = `<p class="note">Thinking (local model, can take a minute on first use)…</p>`;
  try {
    const r = await api("/api/ask", { day: state.day, id: state.open.id, question: $("#ask-q").value });
    out.innerHTML = `<div class="answer">${esc(r.text)}</div>${r.model ? `<p class="note">${esc(r.model)} · ${r.seconds}s · nothing left this machine</p>` : ""}`;
  } catch (e) { out.innerHTML = `<p class="note">${esc(e.message)}</p>`; }
  btn.disabled = false;
}

async function showSummary() {
  state.tab = "summary"; setTab(); closeDetail();
  const rows = await api("/api/summary");
  const cell = (q) => q.sent ? `${q.labelled}/${q.sent} labelled · <b>${q.real_threat}</b> real, ${q.unusual_but_fine} unusual, ${q.false_alarm} false` : "-";
  const tot = rows.reduce((a, r) => { for (const q of ["volume", "low-and-slow"]) { a.sent += r.queues[q].sent; a.lab += r.queues[q].labelled; a.real += r.queues[q].real_threat; a.fine += r.queues[q].unusual_but_fine; } a.min += r.analyst_minutes || 0; return a; }, { sent: 0, lab: 0, real: 0, fine: 0, min: 0 });
  $("#view").innerHTML = `
    <div class="eyebrow">Pilot summary · ${rows.length} days</div>
    <div class="stats">
      <div class="stat"><b>${rows.length ? Math.round(tot.sent / rows.length) : 0}</b><span>for review per day</span></div>
      <div class="stat"><b>${tot.lab}/${tot.sent}</b><span>labelled</span></div>
      <div class="stat"><b>${tot.lab ? pct((tot.real + tot.fine) / tot.lab) : "-"}</b><span>worth a look (real + unusual)</span></div>
      <div class="stat"><b>${tot.real}</b><span>real threats</span></div>
      <div class="stat"><b>${tot.min ? Math.round(tot.min) : "-"}</b><span>analyst minutes</span></div>
    </div>
    <table><thead><tr><th>Day</th><th class="num">Connections</th><th class="num">Alert rate</th><th class="num">Incidents</th><th>Volume queue</th><th>Low-and-slow queue</th><th class="num">Minutes</th></tr></thead>
    <tbody>${rows.map((r) => `<tr data-day="${esc(r.day)}"><td>${esc(r.day)}</td><td class="num">${r.connections.toLocaleString()}</td><td class="num">${pct(r.alert_rate)}</td><td class="num">${r.incidents.toLocaleString()}</td><td>${cell(r.queues.volume)}</td><td>${cell(r.queues["low-and-slow"])}</td><td class="num">${r.analyst_minutes ?? "-"}</td></tr>`).join("")}</tbody></table>
    <p class="note">Precision comes from these labels. Recall comes from authorized test scans: check that each one shows up in that day's queue.</p>`;
  document.querySelectorAll("tbody tr").forEach((tr) => (tr.onclick = () => showDay(tr.dataset.day)));
}

function setTab() {
  $("#tab-queue").classList.toggle("on", state.tab === "queue");
  $("#tab-summary").classList.toggle("on", state.tab === "summary");
}
$("#tab-queue").onclick = () => state.days.length && showDay(state.day || state.days[0].day);
$("#tab-summary").onclick = showSummary;

(async () => {
  await loadDays();
  const [want, inc] = decodeURIComponent(location.hash.slice(1)).split("/");  // #YYYY-MM-DD or #YYYY-MM-DD/INC-0001
  if (state.days.length) {
    await showDay(state.days.some((d) => d.day === want) ? want : state.days[0].day);
    if (inc && state.rows.some((r) => r.id === inc)) openIncident(inc);
  }
  else $("#view").innerHTML = `<p class="empty">No daily reports in this folder yet. Run <code>strayline_pilot.py run</code> first.</p>`;
})();
