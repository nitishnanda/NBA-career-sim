// Sim college lines by star level vs real college prospects by recruit tier (data/real-draft-prospects.csv)
require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = require('../src/game.js'); const G = N.Game;
const out = {};
for (let i = 0; i < 600; i++) {
  const stars = [1, 2, 3, 4, 5][i % 5];
  const st = G.newCareer({ name: 'x', pos: ['PG', 'SG', 'SF', 'PF', 'C'][i % 5], arch: ['scorer', 'twoway', 'shooter', 'dominator', 'defender'][(i >> 2) % 5], home: 'Ohio', seed: 500 + i, stars });
  const o = G.collegeOptions(st); G.chooseCollege(st, o[o.length - 1].id);
  const r = G.playCollege(st); const y = st.collegeYears[0]; if (!y) continue;
  (out[stars] = out[stars] || []).push(y);
}
Object.keys(out).forEach((k) => { const a = out[k], m = (f) => (a.reduce((s, x) => s + ((x.line[f] || 0)), 0) / a.length).toFixed(1); console.log(k + '★ n=' + a.length, 'ppg', m('pts'), 'rpg', m('reb'), 'apg', m('ast'), 'mpg', m('mins')); });
