// Match log sanity: pts = 2*fgm+tpm+ftm, W-L matches record, averages match the season line, and the rating distribution
require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = require('../src/game.js'); const G = N.Game;
let bad = 0, n = 0, wlBad = 0, avgBad = 0; const byTier = { star: [], role: [] }; const all = []; let sameBad = 0;
for (let i = 0; i < 24; i++) {
  const st = G.newCareer({ name: 'x', pos: 'SF', arch: ['scorer', 'dominator', 'twoway', 'defender', 'shooter', 'generational'][i % 6], home: 'Ohio', seed: 700 + i, stars: 1 + (i % 5) });
  G.auto(st);
  // replay one extra season to inspect its log
}
for (let i = 0; i < 24; i++) {
  const st = G.newCareer({ name: 'x', pos: 'SF', arch: ['scorer', 'dominator', 'twoway', 'defender', 'shooter', 'generational'][i % 6], home: 'Ohio', seed: 900 + i, stars: 1 + (i % 5) });
  // stop auto before retiring: patch retire by running seasons manually via auto then check last log
  G.auto(st);
  const log = st.matchLog, rec = st.proSeasons[st.proSeasons.length - 1];
  const rg = log.filter((x) => x.k === 'g' && !x.po), pl = rg.filter((x) => !x.dnp);
  rg.forEach((g) => { if (!g.dnp) { n++; if (2 * g.fgm + g.tpm + g.ftm !== g.pt || g.fgm > g.fga || g.tpm > g.tpa || g.ftm > g.fta || g.tpm > g.fgm || g.tpa > g.fga) bad++; } if (g.w ? g.f <= g.a : g.f >= g.a) sameBad++; });
  const w = rg.filter((g) => g.w).length; if (w !== rec.wins || rg.length !== 82) wlBad++;
  const avg = pl.reduce((a, g) => a + g.pt, 0) / (pl.length || 1); if (pl.length && Math.abs(avg - rec.pts) > 0.2) avgBad++;
  pl.forEach((g) => { all.push(g.r); (rec.pts >= 20 ? byTier.star : byTier.role).push(g.r); });
}
const mean = (a) => (a.reduce((x, y) => x + y, 0) / (a.length || 1)).toFixed(2); const q = (a, p) => a.slice().sort((x, y) => x - y)[Math.floor(a.length * p)];
console.log('games', n, 'box inconsistencies', bad, '| W-L mismatches', wlBad, '| avg mismatches', avgBad, '| score/result mismatch', sameBad);
console.log('rating mean star(20+ppg)', mean(byTier.star), 'role', mean(byTier.role), '| p5/p50/p95', q(all, .05), q(all, .5), q(all, .95), 'max', Math.max.apply(null, all));
