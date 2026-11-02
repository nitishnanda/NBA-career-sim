(function (g) {
  'use strict';
  // GM Mode: after the playing career, run a front office in the same league. The owner hires you (better legends get better jobs), you trade,
  // sign free agents, re-sign or let walk, pick in the draft and sim seasons; the owner's patience rises with wins and runs and falls with
  // losing and the luxury tax. Lose it and you are fired. Every move gets leaked by league sources before the press release.
  // Nothing here draws from the league's random stream: GM randomness is a hash of the save, the year and the move.
  const NBA = (g.NBA = g.NBA || {});
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const ovr = (p) => NBA.ovr(p);
  const r1 = (x) => Math.round(x * 10) / 10;
  const hashS = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const rngOf = (key) => { let a = hashS(key) || 1; return () => { a ^= a << 13; a >>>= 0; a ^= a >>> 17; a ^= a << 5; a >>>= 0; return a / 4294967296; }; };
  const gmRng = (st, k) => rngOf((st.player ? st.player.name : 'gm') + '|' + (st.gm ? st.gm.since : 0) + '|' + st.league.year + '|' + k);
  const cap = (L) => NBA.capFor(L.year);

  // ---- the job offers: the worst teams always call; a Hall of Famer also hears from a good one
  function offers(st) {
    const L = st.league, ranked = L.teams.slice().sort((a, b) => a.wins - b.wins), hall = st.hof && st.hof.hall, score = st.hof ? st.hof.score : 30;
    const pool = ranked.slice(0, 8), r = gmRng(st, 'offers'), out = [];
    while (out.length < (hall ? 2 : 3) && pool.length) out.push(pool.splice(Math.floor(r() * Math.min(pool.length, 5)), 1)[0]);
    if (hall || score >= 70) { const good = ranked.slice(16, 24); out.push(good[Math.floor(r() * good.length)]); }
    return out.map((t) => ({ id: t.id, nick: t.nick, name: t.name, wins: t.wins, losses: t.losses, best: NBA.rosterOf(L, t)[0] ? NBA.rosterOf(L, t)[0].name : '-', pitch: t.wins <= 30 ? 'A rebuild. The owner wants a plan and some patience from the fans.' : t.wins >= 45 ? 'A contender that wants one more piece. The owner expects to win now.' : 'Stuck in the middle. The owner wants a direction.' }));
  }
  function start(st, teamId) {
    const L = st.league, t = L.teams[teamId], hall = st.hof && st.hof.hall;
    st.gm = { teamId, since: L.year, patience: hall ? 75 : 62, seasons: [], log: [], phase: 'pre', fired: false, done: false, exp: null };
    leak(st, 'The ' + t.name + ' have hired ' + st.player.name + ' as president of basketball operations. "' + (hall ? 'A Hall of Famer in the front office. That changes the phone calls." ' : 'He knows what it takes on the floor." ') + '— league sources');
    newYear(st); return st.gm;
  }
  const teamOf = (st) => st.league.teams[st.gm.teamId];
  function leak(st, text) { st.gm.log.unshift({ y: st.league.year, text }); if (st.gm.log.length > 60) st.gm.log.pop(); }

  // ---- the roster: everyone under contract, the rookies too
  function roster(st) {
    const L = st.league, t = teamOf(st), main = NBA.rosterOf(L, t), rk = Object.values(L.players).filter((q) => q.rookie && q.teamId === t.id);
    const k = st.gm.payK && st.gm.payK.y === L.year ? st.gm.payK.v : 1;
    return main.concat(rk).map((q) => ({ id: q.id, name: q.name, pos: q.pos, age: q.age, ovr: Math.round(ovr(q)), arch: q.arch, sal: r1(NBA.Cap.salaryOf(L, q) * k), cEnd: q.cEnd != null ? q.cEnd : null, rookie: !!q.rookie, real: !!q.real }));
  }
  // sim rosters are thinner and less even than real ones, so raw sums are scaled so the league's average payroll sits where real ones do (~5% over the cap)
  function payK(st) {
    const L = st.league, k = st.gm.payK; if (k && k.y === L.year) return k.v;
    const raw = (t) => NBA.rosterOf(L, t).reduce((a, q) => a + NBA.Cap.salaryOf(L, q), 0), mean = L.teams.reduce((a, t) => a + raw(t), 0) / L.teams.length;
    const v = clamp(1.05 * cap(L) / Math.max(1, mean), 0.4, 1.6); st.gm.payK = { y: L.year, v }; return v;
  }
  function payroll(st) { return r1(roster(st).reduce((a, x) => a + x.sal, 0) * payK(st)); }
  function capView(st) {
    payK(st); const L = st.league, c = cap(L), pay = payroll(st), L2 = NBA.Cap.LINE;
    return { cap: r1(c), pay, tax: r1(L2.tax * c), apron: r1(L2.apron1 * c), status: pay < c ? 'Under the cap' : pay < L2.tax * c ? 'Over the cap' : pay < L2.apron1 * c ? 'In the luxury tax' : 'Over the apron', room: r1(Math.max(0, c - pay)) };
  }
  // reorder a team after a move: the four best are the core the season's strength reads
  function reorder(L, t) { const all = t.core.concat(t.bench || []).map((id) => L.players[id]).filter((q) => q && !q.rookie).sort((a, b) => ovr(b) - ovr(a)); t.core = all.slice(0, 4).map((q) => q.id); t.bench = all.slice(4).map((q) => q.id); }
  function move(L, q, to) { const from = L.teams[q.teamId]; if (from) { from.core = from.core.filter((id) => id !== q.id); from.bench = (from.bench || []).filter((id) => id !== q.id); } q.teamId = to.id; if (!q.rookie) (to.bench = to.bench || []).push(q.id); q.since = L.year + 0.5; q.moved = L.year; }

  // ---- trades: what a player is worth to a front office (talent, age, contract), and whether the other side says yes
  function value(L, q) {
    const o = ovr(q), age = q.age, ageF = age <= 22 ? 1.3 : age <= 25 ? 1.18 : age <= 28 ? 1.05 : age <= 31 ? 0.92 : age <= 33 ? 0.72 : 0.5;
    const sal = NBA.Cap.salaryOf(L, q), fair = NBA.marketCurve ? NBA.marketCurve(o) * cap(L) : sal, contract = clamp(1 + (fair - sal) / Math.max(8, cap(L) * 0.25), 0.75, 1.25);
    return Math.pow(1.14, o - 60) * ageF * contract;
  }
  function quote(st, mineIds, otherId, theirsIds) {
    const L = st.league, me = teamOf(st), them = L.teams[otherId]; if (!them || them === me) return { ok: false, why: 'Pick a team to trade with.' };
    const A = mineIds.map((id) => L.players[id]).filter(Boolean), B = theirsIds.map((id) => L.players[id]).filter(Boolean);
    if (!A.length || !B.length) return { ok: false, why: 'Pick at least one player on each side.' };
    if (B.concat(A).some((q) => q.since != null && q.since > L.year)) return { ok: false, why: 'A player traded or signed this season cannot be moved again until next season.' };
    const vA = A.reduce((a, q) => a + value(L, q), 0), vB = B.reduce((a, q) => a + value(L, q), 0);
    const rebuilding = them.wins <= 35, want = rebuilding ? 1.12 : 1.06;   // they want to win the trade; a rebuilding team wants it a bit more
    const youth = rebuilding ? A.reduce((a, q) => a + (q.age <= 24 ? 0.06 : q.age >= 31 ? -0.08 : 0), 0) : 0;
    const cv = capView(st), k = payK(st), sA = A.reduce((a, q) => a + NBA.Cap.salaryOf(L, q) * k, 0), sB = B.reduce((a, q) => a + NBA.Cap.salaryOf(L, q) * k, 0);
    const nMe = roster(st).filter((x) => !x.rookie).length - A.length + B.length, nThem = NBA.rosterOf(L, them).length - B.length + A.length;
    if (nMe > 13 || nThem > 13) return { ok: false, why: 'A roster would end up over 13 players.', vA, vB };
    if (nMe < 8 || nThem < 8) return { ok: false, why: 'A roster would end up under 8 players.', vA, vB };
    if (cv.pay - sA + sB > cv.tax && sB > sA * 1.25 + 0.1) return { ok: false, why: 'Salaries do not match: over the tax line you can take back at most 125% of what you send ($' + r1(sA * 1.25) + 'M).', vA, vB };
    const ratio = vA * (1 + youth) / (vB * want), ok = ratio >= 1;
    return { ok, ratio: r1(ratio * 100) / 100, why: ok ? 'They would take it.' : ratio >= 0.85 ? 'Close. They want a little more.' : ratio >= 0.6 ? 'Not enough. They hang up politely.' : 'They laughed and hung up.', vA, vB, sA: r1(sA), sB: r1(sB) };
  }
  function trade(st, mineIds, otherId, theirsIds) {
    const q = quote(st, mineIds, otherId, theirsIds); if (!q.ok) return q;
    const L = st.league, me = teamOf(st), them = L.teams[otherId], A = mineIds.map((id) => L.players[id]), B = theirsIds.map((id) => L.players[id]);
    A.forEach((p) => move(L, p, them)); B.forEach((p) => move(L, p, me)); reorder(L, me); reorder(L, them);
    const names = (xs) => xs.map((p) => p.name).join(' and ');
    leak(st, '🚨 League sources: the ' + me.nick + ' are trading ' + names(A) + ' to the ' + them.nick + ' for ' + names(B) + '.');
    (L.moves = L.moves || []).push({ year: L.year, phase: 'gm', text: me.nick + ' acquire ' + names(B) + ' from the ' + them.nick + ' for ' + names(A), a: me.nick, b: them.nick });
    return Object.assign(q, { done: true });
  }

  // ---- free agents: a summer market of veterans (and the odd real name a team let go), each with an asking price
  function newYear(st) {
    const L = st.league, r = gmRng(st, 'fa'), n = 7, fa = [];
    for (let i = 0; i < n; i++) {
      const goal = i === 0 ? (r() < 0.45 ? 76 + r() * 5 : 71 + r() * 4) :   // a star on the market some summers, not every summer
         i <= 2 ? 71 + r() * 4 : 64 + r() * 6, age = 25 + Math.floor(r() * 9);
      const p = NBA.makeNPC(L, age, { ceiling: goal + 1, bonus: 0 });
      for (let k = 0; k < 4; k++) { const d = (goal - ovr(p)) / (NBA.tuning.ovrStretch || 1); (NBA.data.ATTRS || []).forEach((a) => (p.attrs[a] = clamp(p.attrs[a] + d, 8, 99))); }
      p.yearsPro = Math.max(4, age - 20); p.vetDeal = true; fa.push(p);
    }
    const k = payK(st); st.gm.fa = fa.map((p) => ({ p, ask: r1(Math.max(NBA.Cap.minSal(L), NBA.Cap.salaryOf(L, p) * k * (0.9 + 0.3 * r()))), yrs: p.age >= 31 ? 1 : 2 + Math.floor(r() * 2) }));
    st.gm.phase = 'pre'; st.gm.exp = Math.round(41 + 0.6 * ((teamOf(st).wins || 41) - 41));
  }
  function sign(st, idx) {
    const L = st.league, f = st.gm.fa[idx]; if (!f) return { ok: false, why: 'Gone.' }; const cv = capView(st), n = roster(st).filter((x) => !x.rookie).length;
    if (n >= 13) return { ok: false, why: 'Your roster is full (13). Waive or trade someone first.' };
    const minS = NBA.Cap.minSal(L), mle = r1(NBA.Cap.LINE.mle * cap(L));
    if (f.ask > minS * 1.05 && cv.pay + f.ask > cv.cap && f.ask > mle) return { ok: false, why: 'Over the cap you can only offer the mid-level exception ($' + mle + 'M) or the minimum. He wants $' + f.ask + 'M.' };
    if (f.ask > minS * 1.05 && cv.pay > cv.apron) return { ok: false, why: 'Over the apron you can only sign minimum contracts.' };
    const t = teamOf(st), p = f.p; p.teamId = t.id; p.cEnd = L.year + f.yrs; p.since = L.year + 0.5; L.players[p.id] = p; (t.bench = t.bench || []).push(p.id); reorder(L, t);
    st.gm.fa.splice(idx, 1);
    leak(st, '🚨 League sources: ' + p.name + ' (' + p.pos + ', ' + Math.round(ovr(p)) + ') agrees to a ' + f.yrs + '-year, $' + r1(f.ask * f.yrs) + 'M deal with the ' + t.nick + '.');
    return { ok: true };
  }
  function waive(st, id) {
    const L = st.league, t = teamOf(st), q = L.players[id]; if (!q || q.teamId !== t.id) return { ok: false };
    t.core = t.core.filter((x) => x !== id); t.bench = (t.bench || []).filter((x) => x !== id); delete L.players[id]; reorder(L, t);
    leak(st, 'The ' + t.nick + ' have waived ' + q.name + '.'); return { ok: true };
  }
  // re-sign or let walk: a player whose deal ends this summer (decided before the league's own free agency runs)
  function resign(st, id, keep) {
    const L = st.league, q = L.players[id]; if (!q) return;
    if (keep) { q.cEnd = L.year + 1 + (q.age >= 31 ? 1 : 2 + (hashS(q.name + L.year) % 2)); q.vetDeal = true; leak(st, q.name + ' re-signs with the ' + teamOf(st).nick + ' (through ' + NBA.seasonLabel(q.cEnd) + ').'); }
    else { q.cEnd = L.year; q.gmWalk = true; }
  }
  const expiring = (st) => roster(st).filter((x) => !x.rookie && x.cEnd != null && x.cEnd <= st.league.year && !st.league.players[x.id].gmWalk);

  // ---- the draft: your slot, and the board as it will look when you are on the clock
  function draftBoard(st) {
    const L = st.league; if (!L.draftPlan || L.draftPlan.year !== L.year) { const order = NBA.lotteryOrder(L).map((t) => t.id), cls = NBA.draftClass(L, 72).sort((a, b) => b.stock - a.stock).slice(0, 60); L.draftPlan = { year: L.year, order, cls, lobby: null }; }
    const pl = L.draftPlan, slot = pl.order.indexOf(st.gm.teamId) + 1; if (slot < 1) return null;
    const board = pl.cls.slice(slot - 1, slot + 7).map((q) => ({ id: q.id, name: q.name, pos: q.pos, age: q.age, ovr: Math.round(ovr(q)), ceil: Math.round(q.ceiling) }));
    return { slot, board, picked: pl.gmPick || null };
  }
  function draftPick(st, id) {
    const pl = st.league.draftPlan, b = draftBoard(st); if (!b) return; const i = pl.cls.findIndex((q) => q.id === id); if (i < b.slot - 1) return;
    const q = pl.cls.splice(i, 1)[0]; pl.cls.splice(b.slot - 1, 0, q); pl.gmPick = q.name;
    leak(st, 'With the #' + b.slot + ' pick, the ' + teamOf(st).nick + ' select ' + q.name + ' (' + q.pos + ', ' + q.age + ').');
  }

  // ---- the season: sim it, read it, and face the owner
  function playSeason(st) {
    const L = st.league, t = teamOf(st), res = NBA.simSeason(L, null), po = res.playoffs || {};
    let made = false, rounds = 0, champ = po.champion === t;
    (po.rounds || []).forEach((rd) => rd.series.forEach((s) => { if (s.a === t || s.b === t) { made = true; if (s.winner === t) rounds++; } }));
    const exp = st.gm.exp != null ? st.gm.exp : 41, cv = capView(st), tax = cv.pay > cv.tax;
    const prevW = st.gm.seasons.length ? st.gm.seasons[st.gm.seasons.length - 1].w : null, better = prevW != null && t.wins >= prevW + 4;
    let d = 1.1 * (t.wins - exp) + (made ? 6 : 0) + 4 * rounds + (champ ? 30 : 0) - (tax ? (cv.pay > cv.apron ? 9 : 5) : 0) - 2 + (better ? 4 : 0);   // a rebuild that is going somewhere buys time
    const yrs = st.gm.seasons.length; if (yrs === 0) d = Math.max(d, -6);   // year one: the owner gives you a pass on the roster you inherited
    st.gm.patience = clamp(Math.round(st.gm.patience + d), 0, 100); if (champ) st.gm.patience = 100;
    const rec = { y: L.year, w: t.wins, l: t.losses, exp, made, rounds, champ, pay: cv.pay, tax, patience: st.gm.patience, champion: po.champion ? po.champion.nick : null, mvp: res.awards && res.awards.mvp ? res.awards.mvp.name : null };
    st.gm.seasons.push(rec); st.gm.phase = 'post'; st.gm.last = rec;
    const roundName = ['missed the playoffs', 'lost in the first round', 'lost in the second round', 'lost in the conference finals', 'lost in the Finals', 'won the championship'];
    leak(st, NBA.seasonLabel(L.year) + ': the ' + t.nick + ' went ' + t.wins + '-' + t.losses + ' (the owner expected about ' + exp + ') and ' + (champ ? 'won the championship 🏆' : made ? roundName[rounds + 1] : 'missed the playoffs') + '. Owner patience: ' + st.gm.patience + '/100.');
    if (st.gm.patience <= 15) { st.gm.fired = true; leak(st, '🚨 League sources: the ' + t.nick + ' have fired ' + st.player.name + ' after ' + st.gm.seasons.length + ' season' + (st.gm.seasons.length > 1 ? 's' : '') + '.'); }
    return rec;
  }
  // after the season: the offseason runs (the draft with your pick, then free agency), and a new year begins
  function nextYear(st) {
    const L = st.league; if (st.gm.fired) return;
    NBA.offseason(L, { draft: true }); reorder(L, teamOf(st)); newYear(st);
  }
  function quit(st) { st.gm.done = true; st.stage = 'retired'; leak(st, st.player.name + ' steps down as head of the ' + teamOf(st).nick + ' front office.'); }
  function summary(st) {
    const g2 = st.gm; if (!g2) return null; const ss = g2.seasons, w = ss.reduce((a, x) => a + x.w, 0), l = ss.reduce((a, x) => a + x.l, 0);
    return { team: teamOf(st).name, seasons: ss.length, w, l, playoffs: ss.filter((x) => x.made).length, titles: ss.filter((x) => x.champ).length, fired: g2.fired, best: ss.slice().sort((a, b) => b.w - a.w)[0] || null };
  }

  NBA.GM = { offers, start, roster, payroll, capView, value, quote, trade, sign, waive, resign, expiring, draftBoard, draftPick, playSeason, nextYear, quit, summary };
  if (typeof module !== 'undefined') module.exports = NBA;
})(typeof window !== 'undefined' ? window : globalThis);
