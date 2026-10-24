// Fit how much stars drive winning, so the league's best producers play on teams as good as real ones do:
// real 1985-2025, team wins of the #1 / #2-3 / #4-10 / #11-30 producer: 55.1 / 51.5 / 49.2 / 43.8, with real team-record spread
// (sd 12.2 wins, 1.5 teams of 60+ and 3.6 under 25 per season). Real top producers' minutes barely depend on team quality, so the
// 'stars on bad teams carry the load' boosts are fitted too. Usage: node scripts/fit-star-wins.js [iterations]  (RSEED, START)
require('../src/data.js'); require('../src/engine.js'); require('../src/league.js');
const T = NBA.tuning; if (process.env.START) Object.assign(T, JSON.parse(process.env.START));
const REAL = [55.1, 51.5, 49.2, 43.8], B = [[1, 1], [2, 3], [4, 10], [11, 30]];
const KNOBS = { starWinK: [0.6, 2.5], winsPerPt: [0.5, 1.1], badTeamUsg: [0, 0.006], badTeamMins: [0, 0.3] };
function evaluate() {
  const acc = B.map(() => []), W = [];
  [81, 82].forEach((sd) => { NBA.setSeed(sd); const L = NBA.newLeague(2027, { real: true }); for (let y = 0; y < 45; y++) { const r = NBA.simSeason(L, null); if (y >= 5) { L.teams.forEach((t) => W.push(t.wins)); const q = r.entries.filter((e) => e.l.gp >= 58).sort((a, b) => b.l.perf - a.l.perf); B.forEach(([lo, hi], i) => q.slice(lo - 1, hi).forEach((e) => acc[i].push(e.l.wins))); } NBA.offseason(L, { draft: true }); } });
  const m = (a) => a.reduce((x, y) => x + y, 0) / a.length, sd = Math.sqrt(m(W.map((w) => (w - m(W)) ** 2))), ys = W.length / 30, hi = W.filter((w) => w >= 60).length / ys, lo = W.filter((w) => w < 25).length / ys, bw = acc.map(m);
  const loss = bw.reduce((t, v, i) => t + ((v - REAL[i]) / (i === 0 ? 1.0 : 0.8)) ** 2, 0) + ((sd - 12.2) / 0.4) ** 2 + ((hi - 1.52) / 0.3) ** 2 + ((lo - 3.6) / 0.5) ** 2;
  return { loss, bw, sd, hi, lo };
}
const fmt = () => JSON.stringify(Object.fromEntries(Object.keys(KNOBS).map((k) => [k, +T[k].toPrecision(4)])));
const show = (r) => 'producers #1 / 2-3 / 4-10 / 11-30 team wins ' + r.bw.map((v) => v.toFixed(1)).join(' / ') + ' (real ' + REAL.join(' / ') + ') | sd ' + r.sd.toFixed(1) + ' (12.2) 60+ ' + r.hi.toFixed(2) + ' (1.52) <25 ' + r.lo.toFixed(2) + ' (3.6)';
let best = evaluate(); console.log('start', best.loss.toFixed(2), show(best));
let s = +process.env.RSEED || 5; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
for (let it = 0; it < (+process.argv[2] || 60); it++) {
  const old = Object.assign({}, T), keys = Object.keys(KNOBS);
  for (let i = 0; i < 1 + Math.floor(rnd() * 2); i++) { const k = keys[Math.floor(rnd() * keys.length)], [a, b] = KNOBS[k]; T[k] = Math.min(b, Math.max(a, T[k] + (rnd() - 0.5) * 0.3 * (b - a))); }
  const r = evaluate(); if (r.loss < best.loss) { best = r; console.log('it', it, r.loss.toFixed(2), fmt()); } else Object.assign(T, old);
}
console.log('FINAL', fmt(), best.loss.toFixed(2)); console.log(show(best));
