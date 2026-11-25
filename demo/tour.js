// Demo tour: steps through the console's features on the recorded data. Loaded after app.js,
// so it can call the console's own functions (showDay, openIncident, investigate, showSummary).
(function () {
  const TOUR_DAY = "2018-05-13";
  const firstRow = () => document.querySelector("#view tbody tr");
  // Each step sets up what it shows, so Back works from any step.
  const day = async () => { if (state.tab !== "queue" || state.day !== TOUR_DAY) await showDay(state.days.some((d) => d.day === TOUR_DAY) ? TOUR_DAY : state.days[0].day); };
  const open = async () => { await day(); const r = firstRow(); if (r && state.open?.id !== r.dataset.id) await openIncident(r.dataset.id); };
  const STEPS = [
    { el: "#days", text: "Strayline runs once a day on the network logs a site already keeps. Each day gets its own short list. This demo is 5 days of a real smart-device network, with one device infected by Mirai-style malware.",
      go: day },
    { el: "#view .stats", text: "The point: hundreds of thousands of connections and tens of thousands of raw alerts become a couple of incidents a person can actually look at.", go: day },
    { el: () => firstRow(), text: "Each row is one device worth a look, ranked by how many alerts it set off. Strayline groups alerts per device, so you get one case per device, not one alert per connection.", go: day },
    { el: "#detail dl", text: "Open a case and you see what the device did: when, how much, how many hosts and ports it touched, and which models flagged it.",
      go: open },
    { el: "#detail table", text: "Why it was flagged: the traits where this device is furthest from this network's own normal, in standard deviations.", go: open },
    { el: "#inv", text: "Investigate: the local AI pulls the device's history and activity, checks the warning signs, and writes a case report with a verdict and a recommendation. Here it replays the report it wrote on a laptop (about 6 s, nothing sent to the cloud).",
      go: async () => { await open(); if (!state.open?.investigation && document.querySelector("#inv-go")) await investigate(); } },
    { el: "#quar", text: "Contain: one click gives the firewall rules to cut this device off (pf, iptables, nftables or Cisco ACL) and logs who decided and why. Release undoes it. Try it: nothing in the demo is saved.", go: open },
    { el: ".fb", text: "Your judgement: label the case. Labels feed the next day's run (devices you clear count as normal again) and add up in the pilot summary.", go: open },
    { el: ".ask", text: "Ask: type any question about the case to the local AI. It needs Strayline and its local AI installed on your own machine, so it doesn't answer in this web demo.", go: open },
    { el: "#view", text: "Pilot summary: day by day, how many connections came in, how many cases went to a person, and how they were labelled. That's what a pilot is judged on.",
      go: async () => { await showSummary(); } },
    { el: null, text: "That's the tour. Pick any day or case and click around: Investigate, Quarantine and labels all work here, and nothing is saved." },
  ];

  let i = -1, card = null, busy = false;
  const css = document.createElement("style");
  css.textContent = `
    .tour-btn { color: var(--ink) !important; box-shadow: 0 0 0 1px var(--blue) !important; }
    .tour-hl { outline: 3px solid var(--red) !important; outline-offset: 3px; border-radius: 6px; }
    .tour { position: fixed; z-index: 50; left: 16px; bottom: 16px; width: min(340px, calc(100vw - 32px)); background: var(--card);
      border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 8px 28px rgba(0,0,0,.18); padding: 14px 16px; font-size: 14px; line-height: 1.45; }
    .tour .n { font: 12px var(--mono); color: var(--muted); }
    .tour p { margin: 6px 0 12px; }
    .tour .row { display: flex; gap: 8px; justify-content: flex-end; }
    .tour button { font: inherit; padding: 5px 12px; border-radius: 6px; border: 1px solid var(--line); background: none; cursor: pointer; color: var(--ink); }
    .tour button.primary { background: var(--blue); border-color: var(--blue); color: #fff; }
    .tour button:disabled { opacity: .5; cursor: default; }`;
  document.head.appendChild(css);

  const find = (s) => (typeof s.el === "function" ? s.el() : s.el && document.querySelector(s.el));
  const clear = () => document.querySelectorAll(".tour-hl").forEach((e) => e.classList.remove("tour-hl"));
  function end() { clear(); card?.remove(); card = null; i = -1; }

  async function show(n) {
    if (busy || n < 0 || n >= STEPS.length) return;
    busy = true; i = n; clear();
    const s = STEPS[n];
    render(s, true);
    try { if (s.go) await s.go(); } catch (e) { /* a failed step still shows its text */ }
    const el = find(s);
    if (el) { el.classList.add("tour-hl"); el.scrollIntoView({ behavior: "smooth", block: el.offsetHeight > innerHeight * 0.6 ? "start" : "center" }); }
    busy = false; render(s, false);
  }

  function render(s, loading) {
    if (!card) { card = document.createElement("div"); card.className = "tour"; card.setAttribute("role", "dialog"); card.setAttribute("aria-label", "Demo tour"); document.body.appendChild(card); }
    const last = i === STEPS.length - 1;
    card.innerHTML = `<div class="n">Tour · ${i + 1} of ${STEPS.length}</div><p>${s.text}</p>
      <div class="row"><button data-a="end">${last ? "Close" : "Skip"}</button>${i > 0 ? `<button data-a="back"${loading ? " disabled" : ""}>Back</button>` : ""}
      ${last ? "" : `<button data-a="next" class="primary"${loading ? " disabled" : ""}>Next</button>`}</div>`;
    card.querySelector('[data-a="end"]').onclick = end;
    card.querySelector('[data-a="back"]')?.addEventListener("click", () => show(i - 1));
    card.querySelector('[data-a="next"]')?.addEventListener("click", () => show(i + 1));
    card.querySelector(last ? '[data-a="end"]' : '[data-a="next"]').focus({ preventScroll: true });
  }

  document.addEventListener("keydown", (e) => { if (card && e.key === "Escape") end(); });
  const btn = document.createElement("button");
  btn.className = "tour-btn"; btn.textContent = "Take the tour";
  btn.onclick = () => show(0);
  document.querySelector("header nav").appendChild(btn);
})();
