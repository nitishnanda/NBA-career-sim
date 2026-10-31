require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = require('../src/game.js');
const G = N.Game;
const n = +process.argv[2] || 150, seed0 = +process.argv[3] || 100;
const ARCH = ['generational', 'scorer', 'twoway', 'defender', 'shooter', 'dominator'];
const POS = { generational: ['SF', 'PF', 'C', 'PG'], scorer: ['SG', 'SF', 'PF'], twoway: ['SF', 'SG', 'PF'], defender: ['C', 'PF'], shooter: ['PG', 'SG', 'SF'], dominator: ['PG', 'SF', 'C', 'PF'] };
const res = {}; const mvpWins = [], mvpAges = [], rookies = [];
let t0 = Date.now(), n35 = 0, seasons = 0, n30 = 0;
const poTD36 = [];
for (let i = 0; i < n; i++) {
  const arch = ARCH[i % 6];
  const st = G.newCareer({ name: 'P' + i, pos: POS[arch][i % POS[arch].length], arch, home: 'Ohio', seed: seed0 + i });
  G.auto(st);
  const ps = st.proSeasons; if (!ps.length) continue;
  const gp = ps.reduce((a, s) => a + s.gp, 0);
  const tot = k => ps.reduce((a, s) => a + s[k] * s.gp, 0);
  (res[arch] = res[arch] || []).push({ years: ps.length, gp, ppg: tot('pts') / gp, rpg: tot('reb') / gp, apg: tot('ast') / gp, peak: Math.max(...ps.map(s => s.pts)), td: st.career.td, tdPct: st.career.td / gp, tdSeas: st.career.tdSeasons, td30: st.career.td30Seasons, hof: st.hof.score, ceiling: st.player.ceiling, mvp: st.career.awards.MVP || 0, titles: st.career.titles, slot: st.draft.slot, tdSeas0: ps.filter(s => s.avgTD).length });
  ps.forEach(s => { seasons++; if (s.pts >= 30) n30++; if (s.pts >= 35) n35++; if (s.awards.includes('MVP')) { mvpWins.push(s.wins); mvpAges.push(s.age); } if (s.playoff && s.playoff.pts >= 35 && s.playoff.reb >= 10 && s.playoff.ast >= 10) poTD36.push(s.pts.toFixed(1) + ' reg/' + s.playoff.pts.toFixed(1) + 'po'); });
  if (ps[0].rookie) rookies.push({ pts: ps[0].pts, ovr: ps[0].ovr, slot: st.draft.slot });
}
const avg = a => a.reduce((s, x) => s + x, 0) / a.length;
const med = a => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
console.log('n=' + n + ' time ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
console.log('arch'.padEnd(13), 'n  yrs  ppg   rpg  apg  peakPPG  TD%  tdSeas td30  HOFscore  MVPs  titles  avgSlot');
for (const a of ARCH) {
  const r = res[a]; if (!r) continue;
  console.log(a.padEnd(13), String(r.length).padStart(3), avg(r.map(x => x.years)).toFixed(1).padStart(4), avg(r.map(x => x.ppg)).toFixed(1).padStart(5), avg(r.map(x => x.rpg)).toFixed(1).padStart(5), avg(r.map(x => x.apg)).toFixed(1).padStart(4), avg(r.map(x => x.peak)).toFixed(1).padStart(7), (100 * avg(r.map(x => x.tdPct))).toFixed(1).padStart(6), avg(r.map(x => x.tdSeas0)).toFixed(2).padStart(6), avg(r.map(x => x.td30)).toFixed(2).padStart(5), avg(r.map(x => x.hof)).toFixed(0).padStart(7), avg(r.map(x => x.mvp)).toFixed(2).padStart(6), avg(r.map(x => x.titles)).toFixed(2).padStart(6), avg(r.map(x => x.slot || 61)).toFixed(0).padStart(6));
}
console.log('seasons simulated', seasons, '| 30+ppg seasons', n30, '| 35+ppg seasons', n35);
console.log('MVP team wins median', med(mvpWins), 'mean age', avg(mvpAges).toFixed(1), 'n', mvpWins.length);
console.log('rookie ppg overall', avg(rookies.map(r => r.pts)).toFixed(1), '| #1-5 picks', avg(rookies.filter(r => r.slot && r.slot <= 5).map(r => r.pts)).toFixed(1), '(n' + rookies.filter(r => r.slot && r.slot <= 5).length + ') | late 1st', avg(rookies.filter(r => r.slot > 14 && r.slot <= 30).map(r => r.pts)).toFixed(1));
console.log('36pt playoff TD runs', poTD36.join(', '));
const all = Object.values(res).flat();
console.log('career length mean', avg(all.map(x => x.years)).toFixed(1), '| HOF(>=62) share', (100 * all.filter(x => x.hof >= 85).length / all.length).toFixed(1) + '%', '| undrafted/2nd rd share', (100 * all.filter(x => !x.slot || x.slot > 30).length / all.length).toFixed(0) + '%');
const dom = res.dominator || []; const domElite = dom.filter(x => x.ceiling >= 86);
console.log('elite dominators n=' + domElite.length, 'TD% mean', (100 * avg(domElite.map(x => x.tdPct))).toFixed(1), 'min', (100 * Math.min(...domElite.map(x => x.tdPct))).toFixed(1), 'max', (100 * Math.max(...domElite.map(x => x.tdPct))).toFixed(1), '| TD-avg seasons', domElite.map(x => x.tdSeas0).join(','), '| career TDs max', Math.max(...dom.map(x => x.td)));
