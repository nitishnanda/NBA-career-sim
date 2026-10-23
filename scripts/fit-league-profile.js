// Fit the league's production-by-rank curve and its tails to the real modern-era profile (data/real-rank-profile.json) by random-restart hill climbing on the tuning knobs.
// Usage: node scripts/fit-league-profile.js [iterations]     (SEASONS=60 per evaluation; START='{"usgBase":0.17,...}' to resume from a result)
require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); require('../src/game.js');
const real = require('../data/real-rank-profile.json'); const T = NBA.tuning; const ITER = +process.argv[2] || 60; const SEASONS = +process.env.SEASONS || 60;
if (process.env.START) Object.assign(T, JSON.parse(process.env.START));
const KNOBS = { usgBase: [0.15, 0.23], usgPerSS: [0.003, 0.008], usgConvex: [0.00002, 0.0004], tsBase: [0.33, 0.44], tsPerSkill: [0.0015, 0.0045], usgTax: [0.1, 0.4], minsBase: [8, 16], minsPerOvr: [0.6, 1.3], minsCap: [34, 38.5], starTs: [0, 0.05], starReb: [0, 0.3], starAst: [0, 0.6], volSpread: [0, 2], astKnee: [7, 11], astK: [0.4, 0.95], rebKnee: [7, 11], rebK: [0.4, 0.95] };
const W = { mpg: 1 / 1.0, usg: 1 / 1.2, ts: 1 / 0.8, pts: 1 / 1.0, reb: 1 / 0.6, ast: 1 / 0.5, perf: 1 / 1.5 };
const TAILS = { pts30: ['pts', 30], pts27: ['pts', 27], pts25: ['pts', 25], pts20: ['pts', 20], pts15: ['pts', 15], ast10: ['ast', 10], ast8: ['ast', 8], ast6: ['ast', 6], reb12: ['reb', 12], reb10: ['reb', 10], reb8: ['reb', 8], stl2: ['stl', 2], blk2: ['blk', 2] };
const bands = Object.keys(real).filter((k) => k[0] !== '_');
function evaluate() {
  NBA.setSeed(4242); const L = NBA.newLeague(2027, { real: true }); const acc = {}; const tl = {}; let top = 0;
  for (let y = 0; y < SEASONS; y++) { const r = NBA.simSeason(L, null); const q = r.entries.filter((x) => x.l.gp >= 58); const e = q.slice().sort((a, b) => b.l.perf - a.l.perf);
    bands.forEach((k) => { const [lo, hi] = k.split('-').map(Number); e.slice(lo - 1, hi).forEach((x) => { const a = acc[k] = acc[k] || { n: 0, mpg: 0, usg: 0, ts: 0, pts: 0, reb: 0, ast: 0, perf: 0 }; a.n++; a.mpg += x.l.mins; a.usg += 100 * x.l.usg; a.ts += 100 * x.l.ts; a.pts += x.l.pts; a.reb += x.l.reb; a.ast += x.l.ast; a.perf += x.l.perf; }); });
    Object.keys(TAILS).forEach((k) => { const [m, t] = TAILS[k]; tl[k] = (tl[k] || 0) + q.filter((x) => x.l[m] >= t).length; });
    top += Math.max.apply(null, q.map((x) => x.l.pts)); NBA.offseason(L, { draft: true }); }
  let loss = 0; bands.forEach((k) => { const a = acc[k]; if (!a) { loss += 1e3; return; } const bw = k === '1-1' ? 2.5 : k === '2-3' ? 2 : k === '4-6' ? 1.5 : 1; Object.keys(W).forEach((m) => { loss += bw * Math.pow(((a[m] / a.n) - real[k][m]) * W[m], 2); }); });
  Object.keys(TAILS).forEach((k) => { const sim = tl[k] / SEASONS, re = real._tails[k]; loss += 0.8 * Math.pow((sim - re) / Math.max(0.6, 0.12 * re), 2); });
  loss += 3 * Math.pow((top / SEASONS - real._tails.top_scorer) / 0.9, 2);
  return { loss, acc, tl, top: top / SEASONS };
}
let best = evaluate().loss; console.log('start loss', best.toFixed(2));
const clampK = (k, v) => Math.min(KNOBS[k][1], Math.max(KNOBS[k][0], v));
let seedRnd = 7; const rnd = () => { seedRnd = (seedRnd * 16807) % 2147483647; return seedRnd / 2147483647; };
for (let it = 0; it < ITER; it++) {
  const keys = Object.keys(KNOBS), pickN = 1 + Math.floor(rnd() * 3), old = {};
  for (let i = 0; i < pickN; i++) { const k = keys[Math.floor(rnd() * keys.length)]; if (old[k] == null) old[k] = T[k]; const span = KNOBS[k][1] - KNOBS[k][0]; T[k] = clampK(k, T[k] + (rnd() - 0.5) * 0.3 * span); }
  const { loss } = evaluate();
  if (loss < best) { best = loss; console.log('it', it, 'loss', loss.toFixed(2), JSON.stringify(Object.fromEntries(Object.keys(KNOBS).map((k) => [k, +T[k].toFixed(5)])))); } else Object.keys(old).forEach((k) => { T[k] = old[k]; });
}
console.log('FINAL', JSON.stringify(Object.fromEntries(Object.keys(KNOBS).map((k) => [k, +T[k].toFixed(5)]))), 'loss', best.toFixed(2));
const last = evaluate(); console.log('tails per season (sim / real):', Object.keys(TAILS).map((k) => k + ' ' + (last.tl[k] / SEASONS).toFixed(1) + '/' + real._tails[k].toFixed(1)).join('  '), '| top scorer', last.top.toFixed(1), '/', real._tails.top_scorer.toFixed(1));
