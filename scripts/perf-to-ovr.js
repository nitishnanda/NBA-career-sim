// Build the sim's overall-rating -> production (perf) curve, used to rate real players from their real stats.
// Usage: node scripts/perf-to-ovr.js   -> data/perf-ovr.json
require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = require('../src/game.js');
const pairs = []; const rankSums = []; let nLeagues = 0;
for (let seed = 1; seed <= 4; seed++) {
  N.setSeed(500 + seed); const L = N.newLeague(2025); for (let i = 0; i < 4; i++) N.runYear(L);
  for (let y = 0; y < 30; y++) { const res = N.simSeason(L, null);
    res.entries.filter((e) => e.l.gp >= 40 && e.l.mins >= 18 && !e.p.rookie).forEach((e) => pairs.push([N.ovr(e.p), e.l.perf]));
    // talent by rank: the rating of the Nth best player in the league that year
    const os = res.entries.filter((e) => e.l.gp >= 40 && !e.p.rookie).map((e) => N.ovr(e.p)).sort((a, b) => b - a);
    os.forEach((o, i) => { rankSums[i] = (rankSums[i] || 0) + o; }); nLeagues++;
    N.offseason(L, { draft: true }); } }
const bins = {};
pairs.forEach(([o, p]) => { const b = Math.round(o / 2) * 2; (bins[b] = bins[b] || []).push(p); });
let rows = Object.keys(bins).map(Number).sort((a, b) => a - b).filter((b) => bins[b].length >= 30).map((b) => ({ ovr: b, perf: bins[b].reduce((s, x) => s + x, 0) / bins[b].length, n: bins[b].length }));
// enforce monotonic perf with a running max (pool-adjacent smoothing)
for (let i = 1; i < rows.length; i++) if (rows[i].perf < rows[i - 1].perf) rows[i].perf = rows[i - 1].perf + 0.2;
const ovrByRank = rankSums.map((v) => +(v / nLeagues).toFixed(2));
require('fs').writeFileSync(__dirname + '/../data/perf-ovr.json', JSON.stringify({ ovrByRank, rows, note: 'mean perf of sim players (gp>=40, mpg>=18) by overall rating, 2-point bins' }, null, 1));
console.log(rows.map((r) => r.ovr + ':' + r.perf.toFixed(1)).join('  '));
