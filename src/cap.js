(function (g) {
  // The money side of the league: what every player is paid, every club's payroll against the cap, the tax line and the aprons, and which exceptions a club can use.
  // NPC salaries are not stored: they come from rating and age (the same curve as your own market value, with each player's own year of signing as a spread, and the rookie
  // scale for players still on their first deal), so nothing here touches the random stream. Your own contract is the real one in st.contract.
  const NBA = (g.NBA = g.NBA || {});
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const r1 = (x) => Math.round(x * 10) / 10;
  const hashU = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
  // the lines as shares of the cap (2025-26: cap 154.6, minimum payroll 139.1, tax 187.9, first apron 195.9, second apron 207.2, mid-level 14.1, taxpayer mid-level 5.7)
  const LINE = { floor: 0.9, tax: 1.215, apron1: 1.267, apron2: 1.34, mle: 0.091, tmle: 0.037, room: 0.057 };
  const PAYROLL_K = 1.0;   // how far the payroll of a thin NPC roster is scaled to a real 15-man one (tuned so a typical club sits about 6% over the cap)
  const cap = (L) => NBA.capFor(L.year), minSal = (L) => r1(2.3 * cap(L) / 154.6);
  const maxPctFor = (yrs) => (yrs >= 10 ? 0.35 : yrs >= 7 ? 0.3 : 0.25);
  function rookieSlot(p) { return p.draftSlot || clamp(Math.round(61 - 1.7 * (NBA.ovr(p) - 44)), 1, 60); }
  function salaryOf(L, p) {
    const c = cap(L), mn = minSal(L), o = NBA.ovr(p), yrs = p.yearsPro || 0;
    let pct;
    if (yrs <= 3 && !p.vetDeal) { const s = rookieSlot(p); pct = s <= 30 ? 0.0892 * Math.pow(0.958, s - 1) : Math.max(0.0097, 0.0149 - (s - 31) * 0.00023); }
    else { const v = o - (p.age >= 33 ? 1.2 * (p.age - 32) : 0); pct = NBA.marketCurve(v) * (0.86 + 0.28 * hashU(p.id + '|' + p.name + '|sal')); }
    return Math.max(mn, r1(Math.min(pct, maxPctFor(yrs)) * c * PAYROLL_K));
  }
  // years left on an NPC's deal and any option on its last year (a function of the same hash as the deal itself)
  function dealOf(L, p) {
    const left = Math.max(1, (p.cEnd != null ? p.cEnd : L.year) - L.year + 1), h = hashU(p.id + '|' + p.name + '|opt');
    const opt = left >= 3 && (p.yearsPro || 0) >= 4 && h < 0.28 ? 'player' : (p.yearsPro || 0) <= 3 && p.draftSlot && p.draftSlot <= 30 && left <= 2 ? 'team' : null;
    return { left, opt };
  }
  function rawPayroll(st, t) {
    const L = st.league, rows = NBA.rosterOf(L, t); let sum = 0; rows.forEach((q) => { sum += salaryOf(L, q); });
    if (st.teamId === t.id && st.contract && !st.retired) sum += st.contract.salary;
    const n = rows.length + (st.teamId === t.id ? 1 : 0); return sum + Math.max(0, 14 - n) * minSal(L) * 1.05;   // the rest of a 15-man roster: minimum and two-way deals
  }
  // NPC rosters here are thin and uneven, so the raw sums are pulled toward the league norm: a typical club sits ~6% over the cap with a spread of about 12% (real 2025: median 1.05, sd 0.12)
  function payroll(st, t) {
    const L = st.league, key = L.year + '|' + L.teams.reduce((a, x) => a + x.core.length + (x.bench || []).length, 0), M = L._capMean && L._capMean.key === key ? L._capMean : (L._capMean = { key, v: L.teams.reduce((a, x) => a + rawPayroll(st, x), 0) / L.teams.length });
    const c = cap(L), r = rawPayroll(st, t) / c, base = M.v / c, adj = clamp(1.06 + 0.55 * (r - base), 0.72, 1.5);
    return r1(adj * c);
  }
  function finance(st, t) {
    const L = st.league, c = cap(L), pay = payroll(st, t), space = Math.max(0, r1(c - pay));
    const status = pay < c ? 'Under the cap' : pay < LINE.tax * c ? 'Over the cap' : pay < LINE.apron1 * c ? 'In the luxury tax' : pay < LINE.apron2 * c ? 'Over the first apron' : 'Over the second apron';
    // what a club can offer an outside free agent: room, or one of the exceptions
    const exc = space > minSal(L) * 2 ? { kind: 'Cap room', amount: space } : pay < LINE.apron1 * c ? (pay < LINE.tax * c ? { kind: 'Mid-level exception', amount: r1(LINE.mle * c) } : { kind: 'Taxpayer mid-level exception', amount: r1(LINE.tmle * c) }) : { kind: 'Minimum contracts only', amount: minSal(L) };
    const tax = pay > LINE.tax * c ? r1((pay - LINE.tax * c) * (pay - LINE.tax * c > 20 ? 2.5 : 1.5)) : 0;
    return { payroll: pay, cap: r1(c), space, floor: r1(LINE.floor * c), taxLine: r1(LINE.tax * c), apron1: r1(LINE.apron1 * c), apron2: r1(LINE.apron2 * c), status, exception: exc, taxBill: tax, overTax: pay > LINE.tax * c };
  }
  // the roster sheet: name, rating, salary, years left, option
  function sheet(st, t) {
    const L = st.league, rows = NBA.rosterOf(L, t).map((q) => { const d = dealOf(L, q); return { id: q.id, name: q.name, pos: q.pos, age: q.age, ovr: Math.round(NBA.ovr(q)), salary: salaryOf(L, q), left: d.left, opt: d.opt, user: false }; });
    if (st.teamId === t.id && st.contract) rows.push({ id: 'user', name: st.player.name, pos: st.player.pos, age: st.player.age, ovr: Math.round(NBA.ovr(st.player)), salary: st.contract.salary, left: Math.max(1, st.contract.left), opt: st.contract.opt ? st.contract.opt.type : null, user: true });
    return rows.sort((a, b) => b.salary - a.salary);
  }
  // a trade over the cap has to match salaries: a club over the cap after the deal may take back at most 125% of what it sends out plus 0.1M
  function tradeMatch(st, t, salaryIn, salaryOut) {
    const L = st.league, c = cap(L), pay = payroll(st, t), after = pay - salaryOut + salaryIn;
    if (after <= c) return { ok: true };
    const limit = r1(1.25 * salaryOut + 0.1); if (salaryIn <= limit) return { ok: true };
    return { ok: false, why: 'The ' + t.nick + ' are over the cap and would take back $' + r1(salaryIn) + 'M for $' + r1(salaryOut) + 'M: salaries have to match (at most $' + limit + 'M).' };
  }
  NBA.Cap = { LINE, salaryOf, dealOf, payroll, finance, sheet, tradeMatch, minSal, maxPctFor };
})(typeof window !== 'undefined' ? window : globalThis);
