require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = require('../src/game.js');
const G = N.Game; const avg = a => a.reduce((s, x) => s + x, 0) / a.length;
for (const [label, arch, sec] of [['generational primary', 'generational', ''], ['dominator + generational sec', 'dominator', 'generational'], ['plain dominator', 'dominator', '']]) {
  const r = [];
  for (let i = 0; i < 40; i++) {
    const st = G.newCareer({ name: 'X', pos: ['PG', 'SF', 'C'][i % 3], arch, sec, home: 'Ohio', seed: 300 + i });
    G.auto(st);
    const ps = st.proSeasons, gp = ps.reduce((a, s) => a + s.gp, 0) || 1;
    const t = k => ps.reduce((a, s) => a + s[k] * s.gp, 0) / gp;
    r.push({ stars: st.stars, slot: st.draft.slot || 61, col: st.collegeYears[0].line.pts, ppg: t('pts'), rpg: t('reb'), apg: t('ast'), earn: st.earnings, yrs: ps.length, mvp: st.career.awards.MVP || 0, hof: st.hof.score, earn32: 0 });
  }
  console.log(label.padEnd(30), 'stars', avg(r.map(x => x.stars)).toFixed(1), '| top3 picks', r.filter(x => x.slot <= 3).length + '/40', '| slot>10', r.filter(x => x.slot > 10).length, '| frosh ppg', avg(r.map(x => x.col)).toFixed(1), '| career', avg(r.map(x => x.ppg)).toFixed(1) + '/' + avg(r.map(x => x.rpg)).toFixed(1) + '/' + avg(r.map(x => x.apg)).toFixed(1), '| earnings $M', avg(r.map(x => x.earn)).toFixed(0), 'min', Math.min(...r.map(x => x.earn)).toFixed(0), '| MVPs', avg(r.map(x => x.mvp)).toFixed(1), '| HOF', avg(r.map(x => x.hof)).toFixed(0));
}
