// Measure how much box-score production (perf) each archetype produces at the same overall rating,
// and print the per-archetype ovr offsets that would equalise them.  Usage: node scripts/ovr-equalize.js
require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = require('../src/game.js');
const pts = []; // [arch, ovr, perf]
for (let seed = 1; seed <= 4; seed++) {
  N.setSeed(90 + seed); const L = N.newLeague(2025); for (let i = 0; i < 4; i++) N.runYear(L);
  for (let y = 0; y < 30; y++) { const res = N.simSeason(L, null);
    res.entries.filter((e) => e.l.gp >= 58 && e.l.mins >= 24).forEach((e) => pts.push([e.p.arch, N.ovr(e.p), e.l.perf]));
    N.offseason(L, { draft: true }); } }
const sel = pts.filter((x) => x[1] >= 72 && x[1] <= 96);
// pooled linear fit
const n = sel.length, mx = sel.reduce((s, x) => s + x[1], 0) / n, my = sel.reduce((s, x) => s + x[2], 0) / n;
let sxy = 0, sxx = 0; sel.forEach((x) => { sxy += (x[1] - mx) * (x[2] - my); sxx += (x[1] - mx) ** 2; });
const b = sxy / sxx, a = my - b * mx;
console.log('pooled: perf = ' + a.toFixed(1) + ' + ' + b.toFixed(2) + ' * ovr  (n=' + n + ')');
const arches = [...new Set(sel.map((x) => x[0]))];
const off = {};
arches.forEach((k) => { const g = sel.filter((x) => x[0] === k); const resid = g.reduce((s, x) => s + (x[2] - (a + b * x[1])), 0) / g.length; off[k] = +(resid / b).toFixed(1); console.log(k.padEnd(13), 'n=' + String(g.length).padStart(5), ' mean residual', resid.toFixed(1).padStart(6), ' => ovr offset', off[k]); });
console.log(JSON.stringify(off));
