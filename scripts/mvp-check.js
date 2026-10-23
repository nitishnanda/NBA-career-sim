// How often do generational careers win MVP / FMVP / All-NBA 1st given their lines?
require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = require('../src/game.js'); const G = N.Game;
const rows = []; let careers = 0; const tot = { mvp: 0, fmvp: 0, a1: 0, titles: 0, seasons: 0, tdSeasons: 0 };
NBA.onSeasonLog = (st, rec) => rows.push({ pr: rec.perfRank, pts: rec.pts, reb: rec.reb, ast: rec.ast, gp: rec.gp, wins: rec.wins, aw: rec.awards, po: rec.playoffText, rating: rec.avgRating });
for (let i = 0; i < +(process.env.N || 60); i++) {
  const st = G.newCareer({ name: 'x', pos: ['PG', 'SF', 'C', 'PF'][i % 4], arch: process.env.ARCH || 'generational', home: 'Ohio', seed: 8100 + i, stars: 5 }); G.auto(st); careers++;
  tot.mvp += st.career.awards.MVP || 0; tot.fmvp += st.career.awards['Finals MVP'] || 0; tot.a1 += st.career.awards['All-NBA 1st Team'] || 0; tot.titles += st.career.titles; tot.seasons += st.proSeasons.length; tot.tdSeasons += st.career.tdSeasons;
}
console.log('careers', careers, 'per career: MVP', (tot.mvp / careers).toFixed(2), 'FMVP', (tot.fmvp / careers).toFixed(2), 'All-NBA 1st', (tot.a1 / careers).toFixed(2), 'titles', (tot.titles / careers).toFixed(2), 'TD seasons', (tot.tdSeasons / careers).toFixed(2));
const big = rows.filter((r) => r.pts >= 25 && r.gp >= 65 && r.wins >= 50); const mv = big.filter((r) => r.aw.includes('MVP')).length;
const big2 = rows.filter((r) => r.pts >= 27 && r.reb >= 7 && r.ast >= 7 && r.gp >= 65 && r.wins >= 45);
console.log('seasons 25+ ppg & 65+ gp & 50+ wins:', big.length, 'MVP', mv, '| 27/7/7 seasons:', big2.length, 'MVP', big2.filter((r) => r.aw.includes('MVP')).length, 'All-NBA1', big2.filter((r) => r.aw.includes('All-NBA First Team')).length);
const hi = rows.filter((r) => r.pts >= 30 && r.reb >= 10 && r.ast >= 10); console.log('30/10/10 seasons', hi.length, 'MVP', hi.filter((r) => r.aw.includes('MVP')).length, 'avg rating', (hi.reduce((a, r) => a + (r.rating || 0), 0) / Math.max(1, hi.length)).toFixed(2));

const r1 = rows.filter((r) => r.pr === 1 && r.gp >= 65 && r.wins >= 44), r23 = rows.filter((r) => (r.pr === 2 || r.pr === 3) && r.gp >= 65 && r.wins >= 44);
console.log('seasons ranked #1 in league production (65+ gp, 44+ wins):', r1.length, 'MVP', r1.filter((r) => r.aw.includes('MVP')).length, '| #2-3:', r23.length, 'MVP', r23.filter((r) => r.aw.includes('MVP')).length, '| all seasons', rows.length);
