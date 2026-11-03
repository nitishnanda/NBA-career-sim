require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = require('../src/game.js');
const G = N.Game; const avg = a => a.reduce((s, x) => s + x, 0) / a.length;
const arch = process.argv[2] || 'scorer', lo = +process.argv[3] || 86, hi = +process.argv[4] || 95, n = +process.argv[5] || 30;
const r = [];
for (let i = 0; i < n; i++) {
  const st = G.newCareer({ name: 'S', pos: ['SF', 'SG', 'PF'][i % 3], arch, home: 'Ohio', seed: 900 + i, stars: 5, ceiling: lo + (hi - lo) * i / (n - 1) });
  G.auto(st);
  const ps = st.proSeasons, gp = ps.reduce((a, s) => a + s.gp, 0), A = st.career.awards;
  r.push({ ceil: st.player.ceiling, pts: ps.reduce((a, s) => a + s.totPts, 0), gp, ppg: ps.reduce((a, s) => a + s.pts * s.gp, 0) / gp, n30: ps.filter(s => s.pts >= 30).length, n32: ps.filter(s => s.pts >= 32).length, n34: ps.filter(s => s.pts >= 34).length, peak: Math.max(...ps.map(s => s.pts)), mvp: A.MVP || 0, a1: A['All-NBA 1st Team'] || 0, an: A['All-NBA'] || 0, ti: A.Championships || 0, fm: A['Finals MVP'] || 0, earn: st.earnings, yrs: ps.length });
}
const f = (k, d = 1) => avg(r.map(x => x[k])).toFixed(d);
console.log(arch, 'n=' + n, '| yrs', f('yrs'), '| GP', f('gp', 0), '| career pts', Math.round(avg(r.map(x => x.pts))).toLocaleString(), '(min', Math.round(Math.min(...r.map(x => x.pts))).toLocaleString(), 'max', Math.round(Math.max(...r.map(x => x.pts))).toLocaleString() + ')', '| ppg', f('ppg'), '| peak', f('peak'), '| seasons 30+', f('n30'), '32+', f('n32'), '34+', f('n34', 2), '| with a 32+ season', (100 * r.filter(x => x.n32 > 0).length / n).toFixed(0) + '%', '34+', (100 * r.filter(x => x.n34 > 0).length / n).toFixed(0) + '%', '| MVP', f('mvp'), '| All-NBA 1st', f('a1'), 'any', f('an'), '| titles', f('ti'), 'FMVP', f('fm'), '| earnings $M', f('earn', 0));
