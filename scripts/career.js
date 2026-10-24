require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = require('../src/game.js');
const G = N.Game;
function printCareer(st, full) {
  const p = st.player;
  console.log('\n==== ' + p.name + ' | ' + N.data.ARCHETYPES[p.arch].name + (p.sec ? ' + ' + p.sec : '') + ' | ' + p.pos + ' | ' + p.home + ' | ' + st.stars + '★ | hidden ceiling ' + p.ceiling.toFixed(0) + ' ====');
  console.log('College: ' + st.college.name + ' (' + st.collegeYears.length + 'y) ' + st.collegeYears.map(y => y.line.pts.toFixed(1) + '/' + y.line.reb.toFixed(1) + '/' + y.line.ast.toFixed(1)).join(' , ') + ' | drafted #' + st.draft.slot + ' by ' + st.draft.team);
  console.log('yr  age team                    ovr  GP  MIN  PTS  REB  AST  STL BLK  TS%   TD  W-L   playoffs');
  st.proSeasons.forEach((s, i) => {
    const pl = s.playoff ? ' | PO ' + s.playoff.pts.toFixed(1) + '/' + s.playoff.reb.toFixed(1) + '/' + s.playoff.ast.toFixed(1) + (s.heater ? ' 🔥' : '') : '';
    console.log(String(i + 1).padStart(2) + '  ' + String(s.age).padStart(3) + ' ' + s.team.slice(0, 22).padEnd(22) + ' ' + String(s.ovr).padStart(3) + ' ' + String(s.gp).padStart(3) + ' ' + s.mins.toFixed(1).padStart(5) + ' ' + s.pts.toFixed(1).padStart(5) + ' ' + s.reb.toFixed(1).padStart(4) + ' ' + s.ast.toFixed(1).padStart(4) + ' ' + s.stl.toFixed(1).padStart(4) + ' ' + s.blk.toFixed(1).padStart(3) + ' ' + (s.ts * 100).toFixed(1).padStart(5) + ' ' + String(s.td).padStart(3) + ' ' + s.wins + '-' + s.losses + '  ' + s.playoffText.replace(' 🏆', '(C)').slice(0, 40) + pl + (s.awards.length ? '  [' + s.awards.filter(a => !a.startsWith('MVP voting')).join(', ') + ']' : ''));
  });
  const ps = st.proSeasons, gp = ps.reduce((a, s) => a + s.gp, 0);
  const tot = k => ps.reduce((a, s) => a + s[k] * s.gp, 0);
  console.log('CAREER: ' + gp + ' GP  ' + (tot('pts') / gp).toFixed(1) + '/' + (tot('reb') / gp).toFixed(1) + '/' + (tot('ast') / gp).toFixed(1) + ' | ' + Math.round(tot('pts')).toLocaleString() + ' pts | TD ' + st.career.td + ' (' + (100 * st.career.td / gp).toFixed(1) + '%) | TD-avg seasons ' + st.career.tdSeasons + ' (30pt: ' + st.career.td30Seasons + ') | $' + Math.round(st.earnings) + 'M');
  console.log('AWARDS: ' + JSON.stringify(st.career.awards) + ' | HOF ' + st.hof.score + ' — ' + st.hof.tier);
}
module.exports = { printCareer };
if (require.main === module) {
  const arch = process.argv[2] || 'dominator', pos = process.argv[3] || 'C', seed = +process.argv[4] || 1;
  const st = G.newCareer({ name: 'Test Player', pos, arch, home: 'Illinois', seed, stars: process.argv[6] ? +process.argv[6] : undefined, ceiling: process.argv[5] ? +process.argv[5] : undefined, sec: process.argv[7] });
  G.auto(st);
  printCareer(st);
}
