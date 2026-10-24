require('../src/data.js'); require('../src/engine.js'); const N = require('../src/league.js');
N.setSeed(+process.argv[2] || 7);
const L = N.newLeague(2025);
console.log('init pool', JSON.stringify(N.poolStats(L)));
let n30 = [], n25 = [], tds = [];
for (let y = 0; y < 40; y++) {
  const r = N.runYear(L);
  if (y >= 5) { n30.push(r.league.n30); n25.push(r.league.n25); }
  if (y % 8 === 7) console.log(r.label, 'pool', JSON.stringify(N.poolStats(L)), 'top scorers', r.league.topScorers.map(s => s.ppg.toFixed(1)).join(','), 'MVP', r.awards.mvp.name, r.awards.mvp.pts.toFixed(1)+'/'+r.awards.mvp.reb.toFixed(1)+'/'+r.awards.mvp.ast.toFixed(1), 'champ', r.playoffs.champion.nick);
}
const avg = a => (a.reduce((s, x) => s + x, 0) / a.length).toFixed(1);
console.log('avg # 30+ppg', avg(n30), ' avg # 25+ppg', avg(n25));
