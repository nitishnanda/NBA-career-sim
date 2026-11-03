// Season-to-season scoring stability, playoff vs regular-season ppg and the visible peak for elite careers
require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = require('../src/game.js'); const G = N.Game;
const d = []; const po = []; let c = 0, dips = 0, peakW = [], best = [];
for (let i = 0; i < +(process.env.N || 60); i++) {
  const st = G.newCareer({ name: 'x', pos: ['PG', 'SF', 'C', 'PF'][i % 4], arch: process.env.ARCH || 'generational', home: 'Ohio', seed: 21000 + i, stars: 5, ceiling: 90 + (i % 7) }); G.auto(st); c++;
  const ps = st.proSeasons.filter((s) => s.gp >= 55);
  for (let k = 1; k < ps.length; k++) if (ps[k].age >= 24 && ps[k].age <= 32 && ps[k - 1].age === ps[k].age - 1) d.push(ps[k].pts - ps[k - 1].pts);
  for (let k = 2; k < ps.length; k++) { const a = ps[k - 1].pts - ps[k - 2].pts, b = ps[k].pts - ps[k - 1].pts; if (ps[k].age >= 25 && ps[k].age <= 32 && ps[k].age - ps[k - 2].age === 2 && Math.abs(a) >= 3 && Math.abs(b) >= 3 && a * b < 0) dips++; }
  st.proSeasons.forEach((s) => { if (s.playoff && s.gp >= 55 && s.playoff.gp >= 5 && s.age >= 23 && s.age <= 33) po.push({ r: s.playoff.pts / s.pts, p: s.playoff.pts, rs: s.pts, ovr: s.ovr }); });
  // peak: number of seasons within 1.5 ppg of the career-best (prime window)
  const top = Math.max.apply(null, ps.map((s) => s.pts)); peakW.push(ps.filter((s) => s.pts >= top - 1.5).length); best.push(top);
}
const m = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length), sd = (a) => { const mu = m(a); return Math.sqrt(m(a.map((x) => (x - mu) ** 2))); };
console.log('careers', c, '| prime yr-to-yr ppg change: mean|d|', m(d.map(Math.abs)).toFixed(2), 'sd', sd(d).toFixed(2), '| share |d|>=4:', (d.filter((x) => Math.abs(x) >= 4).length / d.length * 100).toFixed(1) + '%', '| zig-zag patterns (up/down or down/up, both >=3 ppg) per career', (dips / c).toFixed(2));
console.log('playoff/RS ppg ratio mean', m(po.map((x) => x.r)).toFixed(3), 'sd', sd(po.map((x) => x.r)).toFixed(3), '| share ratio<0.8:', (po.filter((x) => x.r < 0.8).length / po.length * 100).toFixed(1) + '%', '>1.25:', (po.filter((x) => x.r > 1.25).length / po.length * 100).toFixed(1) + '%', '| playoff ppg>=30', (po.filter((x) => x.p >= 30).length / po.length * 100).toFixed(0) + '%', '<20', (po.filter((x) => x.p < 20).length / po.length * 100).toFixed(0) + '%');
console.log('seasons within 1.5 ppg of career-best (peak width): mean', m(peakW).toFixed(1), '| best-season ppg mean', m(best).toFixed(1));
