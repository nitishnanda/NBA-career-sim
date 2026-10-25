// Fit the league to the real modern era by random-restart hill climbing on the tuning knobs. Targets (all from the Basketball-Reference CSVs):
//  - production by league rank and the per-season tails (data/real-rank-profile.json, 2016-25, 58+ games)
//  - team hierarchy: each team's 1st-4th scorer / rebounder / passer, how often two teammates both score 20 (real-rank-profile.json _team)
//  - top-scorer turnover: top-5 scorers who repeat, how much a top-10 scorer's ppg moves the next year (data/real-scoring-turnover.json, 1985-2025)
// Usage: node scripts/fit-league-profile.js [iterations]   SEASONS=30 per seed (4 seeds; two seeds overfit team makeup); START='{"usgBase":0.17,...}' to resume; RSEED=7 restart seed; REPORT=1 prints the fit only
require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); require('../src/game.js');
const real = require('../data/real-rank-profile.json'), turn = require('../data/real-scoring-turnover.json'); const T = NBA.tuning; const ITER = +process.argv[2] || 60; const SEASONS = +process.env.SEASONS || 30;
if (process.env.START) Object.assign(T, JSON.parse(process.env.START));
const KNOBS = { usgBase: [0.15, 0.23], usgPerSS: [0.003, 0.008], usgConvex: [0.00002, 0.0004], tsBase: [0.33, 0.44], tsPerSkill: [0.0015, 0.0045], usgTax: [0.1, 0.4], minsBase: [8, 16], minsPerOvr: [0.6, 1.3], minsCap: [34, 38.5], starTs: [0, 0.05], starReb: [0, 0.3], starAst: [0, 0.6], volSpread: [0, 2], astKnee: [7, 11], astK: [0.4, 0.95], rebKnee: [7, 11], rebK: [0.4, 0.95],
  coTaxK: [0, 0.004], coTaxDown: [0, 1], coTaxMax: [0.01, 0.06], coTaxStack: [0, 2], capPts: [118, 170], formSd: [0.025, 0.08], blkKnee: [1, 2.6], blkK: [0.3, 1] };
const W = { mpg: 1 / 1.0, usg: 1 / 4,   // usage barely counts: the sim's points-per-used-possession constant differs from Basketball-Reference's usage formula, and usage is never shown
  ts: 1 / 0.8, pts: 1 / 1.0, reb: 1 / 0.6, ast: 1 / 0.5, perf: 1 / 1.5 };
const TAILS = { pts30: ['pts', 30], pts27: ['pts', 27], pts25: ['pts', 25], pts20: ['pts', 20], pts15: ['pts', 15], ast10: ['ast', 10], ast8: ['ast', 8], ast6: ['ast', 6], reb12: ['reb', 12], reb10: ['reb', 10], reb8: ['reb', 8], stl2: ['stl', 2], blk2: ['blk', 2] };
const bands = Object.keys(real).filter((k) => k[0] !== '_'), TEAM = real._team;
function evaluate() {
  const acc = {}, tl = {}, tm = { pts: [0, 0, 0, 0], reb: [0, 0, 0, 0], ast: [0, 0, 0, 0], two20: 0, two25: 0, three20: 0, n: 0 }, rep = [], dd = []; let top = 0, ns = 0;
  (process.env.SEEDS ? JSON.parse(process.env.SEEDS) : [4242, 4243, 4244, 4245]).forEach((sd) => {
    NBA.setSeed(sd); const L = NBA.newLeague(2027, { real: true }); let prev = null;
    for (let y = 0; y < SEASONS; y++) {
      const r = NBA.simSeason(L, null); const q = r.entries.filter((x) => x.l.gp >= 58); const e = q.slice().sort((a, b) => b.l.perf - a.l.perf); ns++;
      bands.forEach((k) => { const [lo, hi] = k.split('-').map(Number); e.slice(lo - 1, hi).forEach((x) => { const a = acc[k] = acc[k] || { n: 0, mpg: 0, usg: 0, ts: 0, pts: 0, reb: 0, ast: 0, perf: 0 }; a.n++; a.mpg += x.l.mins; a.usg += 100 * x.l.usg; a.ts += 100 * x.l.ts; a.pts += x.l.pts; a.reb += x.l.reb; a.ast += x.l.ast; a.perf += x.l.perf; }); });
      Object.keys(TAILS).forEach((k) => { const [m, t] = TAILS[k]; tl[k] = (tl[k] || 0) + q.filter((x) => x.l[m] >= t).length; });
      const sc = q.slice().sort((a, b) => b.l.pts - a.l.pts); top += sc[0].l.pts;
      // team hierarchy (players with 40+ games)
      const bt = {}; r.entries.forEach((x) => { if (x.l.gp >= 40) (bt[x.t.id] = bt[x.t.id] || []).push(x.l); });
      Object.values(bt).forEach((ls) => { tm.n++; ['pts', 'reb', 'ast'].forEach((k) => { const v = ls.map((l) => l[k]).sort((a, b) => b - a).concat([0, 0, 0, 0]); for (let i = 0; i < 4; i++) tm[k][i] += v[i]; if (k === 'pts') { tm.two20 += v[1] >= 20; tm.two25 += v[1] >= 25; tm.three20 += v[2] >= 20; } }); });
      // turnover
      const by = {}; r.entries.forEach((x) => { by[x.id] = x.l; }); const ids = sc.map((x) => x.id);
      if (prev) { rep.push(ids.slice(0, 5).filter((i) => prev.ids.slice(0, 5).includes(i)).length); prev.ids.slice(0, 10).forEach((i) => { if (by[i] && by[i].gp >= 58) dd.push(by[i].pts - prev.by[i].pts); }); }
      prev = { ids, by }; NBA.offseason(L, { draft: true });
    }
  });
  const sq = (x) => x * x; let loss = 0, lt = 0, lh = 0, lr = 0;
  bands.forEach((k) => { const a = acc[k]; if (!a) { loss += 1e3; return; } const bw = k === '1-1' ? 2.5 : k === '2-3' ? 2 : k === '4-6' ? 1.5 : 1; Object.keys(W).forEach((m) => { loss += bw * sq(((a[m] / a.n) - real[k][m]) * W[m]); }); });
  Object.keys(TAILS).forEach((k) => { const sim = tl[k] / ns, re = real._tails[k]; lt += 0.8 * sq((sim - re) / Math.max(0.6, 0.12 * re)); });
  lt += 3 * sq((top / ns - real._tails.top_scorer) / 0.9);
  ['pts', 'reb', 'ast'].forEach((k) => { for (let i = 0; i < 4; i++) lh += sq((tm[k][i] / tm.n - TEAM[k][i]) / (k === 'pts' ? 0.5 : 0.3)); });
  lh += sq((tm.two20 / tm.n - TEAM.two20) / 0.025) + sq((tm.two25 / tm.n - TEAM.two25) / 0.015) + sq((tm.three20 / tm.n - TEAM.three20) / 0.01);
  const ddm = dd.reduce((a, b) => a + b, 0) / dd.length, dsd = Math.sqrt(dd.reduce((a, b) => a + sq(b - ddm), 0) / dd.length), rp = rep.reduce((a, b) => a + b, 0) / rep.length;
  lr += sq((rp - turn.top5_repeat) / 0.1) + sq((dsd - turn.top10_next_dppg_sd) / 0.15);
  loss += lt + lh + lr;
  return { loss, parts: { bands: loss - lt - lh - lr, tails: lt, team: lh, turnover: lr }, acc, tl, ns, top: top / ns, tm, rep: rp, dsd, ddm };
}
const fmt = () => JSON.stringify(Object.fromEntries(Object.keys(KNOBS).map((k) => [k, +T[k].toPrecision(5)])));
function report(r) {
  console.log('loss', r.loss.toFixed(1), JSON.stringify(Object.fromEntries(Object.entries(r.parts).map(([k, v]) => [k, +v.toFixed(1)]))));
  bands.forEach((k) => { const a = r.acc[k]; console.log(' rank ' + k.padEnd(7), Object.keys(W).map((m) => m + ' ' + (a[m] / a.n).toFixed(1) + '/' + real[k][m].toFixed(1)).join('  ')); });
  console.log(' tails (sim/real):', Object.keys(TAILS).map((k) => k + ' ' + (r.tl[k] / r.ns).toFixed(1) + '/' + real._tails[k].toFixed(1)).join('  '), '| top scorer', r.top.toFixed(1), '/', real._tails.top_scorer.toFixed(1));
  console.log(' team ranks 1-4 (sim/real):', ['pts', 'reb', 'ast'].map((k) => k + ' ' + r.tm[k].map((v, i) => (v / r.tm.n).toFixed(1) + '/' + TEAM[k][i].toFixed(1)).join(' ')).join(' | '), '| two 20-ppg teammates', (r.tm.two20 / r.tm.n).toFixed(2) + '/' + TEAM.two20.toFixed(2), 'two 25', (r.tm.two25 / r.tm.n).toFixed(3) + '/' + TEAM.two25.toFixed(3), 'three 20', (r.tm.three20 / r.tm.n).toFixed(3) + '/' + TEAM.three20.toFixed(3));
  console.log(' turnover: top-5 repeat', r.rep.toFixed(2) + '/' + turn.top5_repeat.toFixed(2), '| top-10 next-year ppg change sd', r.dsd.toFixed(2) + '/' + turn.top10_next_dppg_sd.toFixed(2), 'mean', r.ddm.toFixed(2) + '/' + turn.top10_next_dppg_mean.toFixed(2));
}
if (process.env.REPORT) { report(evaluate()); process.exit(0); }
let best = evaluate().loss; console.log('start loss', best.toFixed(2));
const clampK = (k, v) => Math.min(KNOBS[k][1], Math.max(KNOBS[k][0], v));
let seedRnd = +process.env.RSEED || 7; const rnd = () => { seedRnd = (seedRnd * 16807) % 2147483647; return seedRnd / 2147483647; };
for (let it = 0; it < ITER; it++) {
  const keys = Object.keys(KNOBS), pickN = 1 + Math.floor(rnd() * 3), old = {}, sc = it < ITER / 2 ? 0.3 : 0.12;
  for (let i = 0; i < pickN; i++) { const k = keys[Math.floor(rnd() * keys.length)]; if (old[k] == null) old[k] = T[k]; const span = KNOBS[k][1] - KNOBS[k][0]; T[k] = clampK(k, T[k] + (rnd() - 0.5) * sc * span); }
  const { loss } = evaluate();
  if (loss < best) { best = loss; console.log('it', it, 'loss', loss.toFixed(2), fmt()); } else Object.keys(old).forEach((k) => { T[k] = old[k]; });
}
console.log('FINAL', fmt(), 'loss', best.toFixed(2));
report(evaluate());
