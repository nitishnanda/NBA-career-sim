require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = require('../src/game.js');
const G = N.Game; const avg = a => a.reduce((s, x) => s + x, 0) / a.length;
// item 6: how much does a top pick change a team's record in year one and year two?
const d1 = [], d2 = [], tops = [];
for (let i = 0; i < 60; i++) {
  const st = G.newCareer({ name: 'R', pos: 'SF', arch: ['generational', 'scorer', 'dominator'][i % 3], home: 'Ohio', seed: 200 + i, stars: 5, ceiling: 85 + (i % 10) });
  const c = G.collegeOptions(st)[0]; G.chooseCollege(st, c.id); G.playCollege(st); G.declare(st);
  const before = st.league.teams[st.teamId].wins; G.startPro(st); G.train(st, G.autoAlloc(st.player, 9));
  G.playSeason(st); const w1 = st.proSeasons[0].wins; G.decide(st, 'stay'); G.train(st, G.autoAlloc(st.player, 9)); G.playSeason(st); const w2 = st.proSeasons[1].wins;
  d1.push(w1 - before); d2.push(w2 - before); if (w1 >= 50 && before <= 32) tops.push(before + '->' + w1);
}
console.log('item 6: wins change vs prior season, year 1 mean', avg(d1).toFixed(1), 'max', Math.max(...d1), '| year 2 mean', avg(d2).toFixed(1), '| lottery team -> 50+ wins in yr 1:', tops.length + '/60', tops.join(' '));
// item 7: triple-double timing for dominators
const ages = [], early = [], seasons = [], startGap = [];
for (let i = 0; i < 40; i++) {
  const st = G.newCareer({ name: 'D', pos: ['PG', 'C', 'SF'][i % 3], arch: 'dominator', sec: i % 2 ? 'generational' : '', home: 'Ohio', seed: 600 + i, stars: 5, ceiling: 88 + (i % 8) });
  G.auto(st);
  const ps = st.proSeasons, td = ps.filter(s => s.avgTD);
  seasons.push(td.length); td.forEach(s => ages.push(s.age));
  if (td.length) { const a = td.map(s => s.age); startGap.push(Math.max(...a) - Math.min(...a) + 1 - a.length); }
  early.push(avg(ps.filter(s => s.age <= 24).map(s => s.ast)));
}
const hist = {}; ages.forEach(a => (hist[a] = (hist[a] || 0) + 1));
console.log('item 7: careers with 0 TD seasons', seasons.filter(x => x === 0).length + '/40', '| TD seasons per career', avg(seasons).toFixed(2), '| age histogram of TD seasons', JSON.stringify(hist), '| min age', Math.min(...ages), '| non-contiguous gaps (avg)', avg(startGap).toFixed(2), '| avg apg through age 24', avg(early).toFixed(1));
