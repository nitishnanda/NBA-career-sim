require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = require('../src/game.js');
const G = N.Game;
const n = +process.argv[2] || 24, lo = +process.argv[3] || 88, hi = +process.argv[4] || 97;
const ARCH = process.env.ARCH ? process.env.ARCH.split(',') : ['generational', 'scorer', 'twoway', 'defender', 'shooter', 'dominator'];
const POS = { generational: ['SF', 'PF', 'C', 'PG'], scorer: ['SG', 'SF', 'PF'], twoway: ['SF', 'SG', 'PF'], defender: ['C', 'PF'], shooter: ['PG', 'SG', 'SF'], dominator: ['PG', 'SF', 'C', 'PF'] };
const avg = a => a.reduce((s, x) => s + x, 0) / a.length;
console.log('arch'.padEnd(13), 'n  yrs  ppg   rpg  apg  peak  #30+  #35+  TD%  tdSeas td30  careerTD   MVPs titles  poHeater  rookiePPG  blk  stl  3P%  FT%  50/40/90');
const heaters = [];
for (const arch of ARCH) {
  const rs = [];
  for (let i = 0; i < n; i++) {
    const st = G.newCareer({ name: 'E', pos: POS[arch][i % POS[arch].length], arch, home: 'Ohio', seed: 5000 + i * 7 + ARCH.indexOf(arch), stars: 5, ceiling: lo + (hi - lo) * (i / (n - 1)) });
    G.auto(st);
    const ps = st.proSeasons, gp = ps.reduce((a, s) => a + s.gp, 0), tot = k => ps.reduce((a, s) => a + s[k] * s.gp, 0);
    const poH = ps.filter(s => s.heater && s.playoff);
    poH.forEach(s => heaters.push(arch + ' ' + s.age + 'y ' + s.playoff.pts.toFixed(1) + '/' + s.playoff.reb.toFixed(1) + '/' + s.playoff.ast.toFixed(1) + ' (' + s.playoff.gp + 'g)'));
    rs.push({ yrs: ps.length, ppg: tot('pts') / gp, rpg: tot('reb') / gp, apg: tot('ast') / gp, peak: Math.max(...ps.map(s => s.pts)), n30: ps.filter(s => s.pts >= 30).length, n35: ps.filter(s => s.pts >= 35).length, tdp: st.career.td / gp, tdS: ps.filter(s => s.avgTD).length, td30: st.career.td30Seasons, td: st.career.td, mvp: st.career.awards.MVP || 0, ti: st.career.titles, poH: poH.length, rk: ps[0].pts, blk: tot('blk') / gp, stl: tot('stl') / gp, tp: avg(ps.map(s => s.tpp)), ft: avg(ps.map(s => s.ftp)), s5040: ps.filter(s => s.fgp >= 0.5 && s.tpp >= 0.4 && s.ftp >= 0.9).length });
  }
  const f = (k, d) => avg(rs.map(x => x[k])).toFixed(d == null ? 1 : d);
  console.log(arch.padEnd(13), String(n).padStart(2), f('yrs').padStart(4), f('ppg').padStart(5), f('rpg').padStart(5), f('apg').padStart(4), f('peak').padStart(5), f('n30').padStart(5), f('n35', 2).padStart(5), (100 * avg(rs.map(x => x.tdp))).toFixed(1).padStart(5), f('tdS', 2).padStart(6), f('td30', 2).padStart(5), f('td', 0).padStart(7), f('mvp').padStart(8), f('ti').padStart(6), f('poH', 2).padStart(8), f('rk').padStart(8), f('blk').padStart(5), f('stl').padStart(4), (100 * avg(rs.map(x => x.tp))).toFixed(1).padStart(5), (100 * avg(rs.map(x => x.ft))).toFixed(1).padStart(4), f('s5040', 2).padStart(5));
  if (arch === 'dominator' || arch === 'generational') console.log('   TD-avg seasons per career:', rs.map(x => x.tdS).join(','), '| career TDs:', rs.map(x => x.td).join(','), '| TD%:', rs.map(x => (100 * x.tdp).toFixed(0)).join(','));
}
console.log('playoff heater lines:', heaters.join(' | '));
