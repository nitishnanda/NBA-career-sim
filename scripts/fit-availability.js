// Fit games played to the modern league: next-season games of the previous season's top-150 scorers (real 2016-25 percentiles, per 82 games,
// whole seasons: a traded player's combined TOT row, as the sim counts him), their share of games in seasons of 20+ games (what careers' games-played
// share measures) and how many of the top-10 scorers play 58+ again. Knobs: minor-injury rate and length distribution, stars' rest days, major-injury rate.
// Usage: node scripts/fit-availability.js [iterations]  (RSEED, START)
require('../src/data.js'); require('../src/engine.js'); require('../src/league.js');
const T = NBA.tuning; if (process.env.START) Object.assign(T, JSON.parse(process.env.START));
const REAL = [30, 41, 53, 60, 65, 68, 72, 75, 78, 80], P = [5, 10, 20, 30, 40, 50, 60, 70, 80, 90], REAL_Q10 = 0.76, REAL_SHARE20 = 0.798;   // (earlier targets counted team stints, so traded players looked like missed games)
const KNOBS = { minorRate: [0.8, 3], injMu: [1.2, 2.6], injSd: [0.6, 1.5], injMax: [30, 82], restStar: [0, 14], restOld: [0, 16], majorRate: [0.01, 0.06] };
function evaluate() {
  const v = []; let q = 0, n = 0;
  [3, 4].forEach((sd) => { NBA.setSeed(sd); const L = NBA.newLeague(2027, { real: true }); let prev = null;
    for (let y = 0; y < 40; y++) { const r = NBA.simSeason(L, null); const by = {}; r.entries.forEach((e) => (by[e.id] = e));
      if (prev) prev.forEach((id, i) => { if (by[id]) v.push(by[id].l.gp); if (i < 10) { n++; q += by[id] && by[id].l.gp >= 58 ? 1 : 0; } });
      prev = r.entries.filter((e) => e.l.gp >= 58).sort((a, b) => b.l.pts - a.l.pts).slice(0, 150).map((e) => e.id); NBA.offseason(L, { draft: true }); } });
  v.sort((a, b) => a - b); const pc = P.map((p) => v[Math.floor(p / 100 * v.length)]), g20 = v.filter((x) => x >= 20), share = g20.reduce((t, x) => t + x, 0) / g20.length / 82;
  return { loss: pc.reduce((t, x, i) => t + ((x - REAL[i]) / 2) ** 2, 0) + ((q / n - REAL_Q10) / 0.03) ** 2 + ((share - REAL_SHARE20) / 0.005) ** 2, pc, q10: q / n, share };
}
const fmt = () => JSON.stringify(Object.fromEntries(Object.keys(KNOBS).map((k) => [k, +T[k].toPrecision(4)])));
let best = evaluate(); console.log('start', best.loss.toFixed(1), best.pc.join(','), 'q10', best.q10.toFixed(2), 'share in 20+ game seasons', best.share.toFixed(3));
let s = +process.env.RSEED || 5; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
for (let it = 0; it < (+process.argv[2] || 80); it++) {
  const old = Object.assign({}, T), keys = Object.keys(KNOBS);
  for (let i = 0; i < 1 + Math.floor(rnd() * 2); i++) { const k = keys[Math.floor(rnd() * keys.length)], [a, b] = KNOBS[k]; T[k] = Math.min(b, Math.max(a, T[k] + (rnd() - 0.5) * 0.3 * (b - a))); if (k === 'injMax' || k === 'restStar' || k === 'restOld') T[k] = Math.round(T[k]); }
  const r = evaluate(); if (r.loss < best.loss) { best = r; console.log('it', it, r.loss.toFixed(1), fmt(), r.pc.join(','), 'q10', r.q10.toFixed(2)); } else Object.assign(T, old);
}
console.log('FINAL', fmt(), best.loss.toFixed(1)); console.log('percentiles 5..90 sim', best.pc.join(','), '| real', REAL.join(','), '| top-10 58+ again', best.q10.toFixed(2), '(' + REAL_Q10 + ') | share of games in 20+ game seasons', best.share.toFixed(3), '(' + REAL_SHARE20 + ')');
