// Playoff vs regular-season production for sim stars, against the real ratios (data/real-targets-extra.json).
require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = require('../src/game.js');
const real = require('../data/real-targets-extra.json');
const G = N.Game; const avg = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1); const sd = (a) => { const m = avg(a); return Math.sqrt(avg(a.map((x) => (x - m) ** 2))); };
const ARCH = ['generational', 'scorer', 'twoway', 'shooter', 'dominator', 'defender'];
const R = { mins: [], pts: [], reb: [], ast: [], stl: [], blk: [], tov: [] }; const ptsRatio = []; let tdRuns = 0, run35 = 0, runs = 0, legends = 0, careers = 0, gamesSum = [];
for (let i = 0; i < 160; i++) {
  const arch = ARCH[i % 6];
  const st = G.newCareer({ name: 'x', pos: ['SF', 'PG', 'C', 'PF'][i % 4], arch, home: 'Ohio', seed: 9000 + i, stars: 5, ceiling: 86 + (i % 11) }); G.auto(st); careers++;
  st.proSeasons.forEach((s) => { if (!s.playoff || s.pts < 20 || s.gp < 50 || s.playoff.gp < 4) return;
    runs++; R.mins.push(s.playoff.mins / s.mins); R.pts.push(s.playoff.pts / s.pts); R.reb.push(s.playoff.reb / s.reb); R.ast.push(s.playoff.ast / Math.max(.1, s.ast));
    R.stl.push(s.playoff.stl / Math.max(.1, s.stl)); R.blk.push(s.playoff.blk / Math.max(.05, s.blk)); ptsRatio.push(s.playoff.pts / s.pts); gamesSum.push(s.playoff.gp);
    if (s.playoff.pts >= 10 && s.playoff.reb >= 10 && s.playoff.ast >= 10) tdRuns++; if (s.playoff.pts >= 35) run35++; if (s.legend) legends++; });
}
const S = real.playoff_vs_regular.stars_perf40;
const row = (k, a, b) => console.log(k.padEnd(34), String(a).padStart(8), String(b).padStart(8));
console.log('SIM stars (' + runs + ' postseasons) vs REAL stars (n=' + S.n + ')'); row('', 'real', 'sim');
row('minutes ratio', S.mpg_ratio, avg(R.mins).toFixed(3)); row('points ratio', S.pts_ratio, avg(R.pts).toFixed(3)); row('rebounds ratio', S.reb_ratio, avg(R.reb).toFixed(3));
row('assists ratio', S.ast_ratio, avg(R.ast).toFixed(3)); row('steals ratio', S.stl_ratio, avg(R.stl).toFixed(3)); row('blocks ratio', S.blk_ratio, avg(R.blk).toFixed(3));
row('sd of points ratio', S.pts_ratio_sd, sd(ptsRatio).toFixed(3)); row('share pts +15% or more', S.share_pts_up_15pct, (ptsRatio.filter((x) => x >= 1.15).length / runs).toFixed(3)); row('share pts +25% or more', S.share_pts_up_25pct, (ptsRatio.filter((x) => x >= 1.25).length / runs).toFixed(3));
row('share pts -15% or less', S.share_pts_down_15pct, (ptsRatio.filter((x) => x <= 0.85).length / runs).toFixed(3));
row('playoff games (mean)', real.star_playoff_games.mean, avg(gamesSum).toFixed(1));
console.log('\nplayoff runs averaging 35+ ppg:', run35, 'of', runs, '(real: 9 ever in ~600 star runs since 2001 incl. earlier eras)  | 10/10/10 playoff runs:', tdRuns, '(real: 3 ever) | planned legend runs completed:', legends, 'across', careers, 'careers');
