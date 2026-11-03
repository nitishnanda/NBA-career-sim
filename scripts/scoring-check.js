require('../src/data.js'); require('../src/engine.js'); const N = require('../src/league.js');
N.setSeed(+process.argv[2] || 11);
const L = N.newLeague(2025);
for (let i = 0; i < 4; i++) N.runYear(L);
const rows = []; let teamCore = [], n30 = [], n28 = [], n25 = [], n20 = [], top1 = [], td = [], mvpPts = [], tsAll = [];
for (let y = 0; y < 60; y++) {
  const r = N.runYear(L);
  const es = r.entries.filter(e => e.l.gp >= 58);
  const byT = {}; r.entries.forEach(e => { byT[e.t.id] = (byT[e.t.id] || 0) + e.l.pts; });
  teamCore.push(Object.values(byT).reduce((a, b) => a + b, 0) / 30);
  n30.push(es.filter(e => e.l.pts >= 30).length); n28.push(es.filter(e => e.l.pts >= 28).length); n25.push(es.filter(e => e.l.pts >= 25).length); n20.push(es.filter(e => e.l.pts >= 20).length);
  top1.push(Math.max(...es.map(e => e.l.pts)));
  mvpPts.push(r.awards.mvp.pts);
  es.forEach(e => tsAll.push(e.l.ts));
}
const avg = a => (a.reduce((s, x) => s + x, 0) / a.length);
console.log('core-4 pts per team', avg(teamCore).toFixed(1), '| #30+', avg(n30).toFixed(2), '#28+', avg(n28).toFixed(2), '#25+', avg(n25).toFixed(2), '#20+', avg(n20).toFixed(2), '| top scorer', avg(top1).toFixed(1), '| MVP ppg', avg(mvpPts).toFixed(1), '| TS avg', avg(tsAll).toFixed(3));
