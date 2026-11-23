// Demo shim: answers the console's /api calls from data.js, so the real UI runs without a server.
(function () {
  if (window.top !== window) document.documentElement.classList.add("embed");  // inside the website
  const D = window.DEMO, fb = {}, quar = {};
  const json = (body, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
  const latest = (day) => Object.fromEntries(Object.entries(fb).filter(([k]) => k.startsWith(day + "|")).map(([k, v]) => [k.split("|")[1], v]));
  const days = () => D.days.map((s) => {
    const f = latest(s.day), labs = Object.values(f).map((v) => v.label);
    return { ...s, labelled: labs.length, label_counts: { real_threat: labs.filter((l) => l === "real_threat").length,
      unusual_but_fine: labs.filter((l) => l === "unusual_but_fine").length, false_alarm: labs.filter((l) => l === "false_alarm").length } };
  });
  const queue = (day) => D.queues[day].map((c) => ({ ...c, feedback: latest(day)[c.id] || null, quarantined: !!quar[c.src] }));
  const incident = (day, id) => {
    const c = D.incidents[day + "|" + id]; if (!c) return null;
    const q = quar[c.src];
    return { ...c, feedback: latest(day)[id] || null, quarantine: q || null, can_quarantine: !!D.rules[c.src],
             release_rules: q && D.rules[c.src] ? D.rules[c.src].release : null, investigation: D.investigated[day + "|" + id] ? D.investigations[day + "|" + id] : null };
  };
  const now = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19); };
  const realFetch = window.fetch.bind(window);
  window.fetch = async (url, opt = {}) => {
    const u = new URL(url, location.href), p = u.pathname.split("/api/")[1];
    if (p === undefined) return realFetch(url, opt);
    const parts = p.split("/").filter(Boolean), body = opt.body ? JSON.parse(opt.body) : {};
    if (parts[0] === "days" && parts.length === 1) return json(days());
    if (parts[0] === "days" && parts.length === 2) return D.queues[parts[1]] ? json(queue(parts[1])) : json({ error: "no such day" }, 404);
    if (parts[0] === "days" && parts.length === 3) { const c = incident(parts[1], decodeURIComponent(parts[2])); return c ? json(c) : json({ error: "no such incident" }, 404); }
    if (parts[0] === "summary") return json(days().map((s) => ({ day: s.day, connections: s.connections, alert_rate: s.alert_rate, incidents: s.incidents,
      for_review: s.for_review, analyst_minutes: null, queues: Object.fromEntries(["volume", "low-and-slow"].map((q) => {
        const rows = D.queues[s.day].filter((c) => c.queue === q), f = latest(s.day), labs = rows.map((c) => f[c.id]).filter(Boolean).map((v) => v.label);
        return [q, { sent: rows.length, labelled: labs.length, real_threat: labs.filter((l) => l === "real_threat").length,
          unusual_but_fine: labs.filter((l) => l === "unusual_but_fine").length, false_alarm: labs.filter((l) => l === "false_alarm").length }];
      })) })));
    if (parts[0] === "feedback") { const r = { ...body, at: now() }; fb[body.day + "|" + body.id] = r; return json(r); }
    if (parts[0] === "quarantine") {
      const c = D.incidents[body.day + "|" + body.id], rules = c && D.rules[c.src];
      if (!rules) return json({ error: "unknown incident" }, 400);
      if (body.action === "quarantine") quar[c.src] = { day: body.day, id: body.id, src: c.src, action: "quarantine", at: now() }; else delete quar[c.src];
      return json({ day: body.day, id: body.id, src: c.src, action: body.action, at: now(), ip: rules.ip, rules: body.action === "quarantine" ? rules.block : rules.release });
    }
    if (parts[0] === "investigate") {
      const k = body.day + "|" + body.id, inv = D.investigations[k];
      if (!inv) return json({ error: "No recorded report for this incident in the demo." }, 404);
      await new Promise((r) => setTimeout(r, 2600));  // the local AI took about 6 s on a laptop
      D.investigated[k] = true;
      return json({ ...inv, at: now() });
    }
    if (parts[0] === "ask") return json({ text: "In the demo, use Investigate: it replays the case report the local AI wrote for this incident.", model: null, seconds: 0 });
    return json({ error: "not found" }, 404);
  };
})();
