// how often do teammates both average big all-round lines (real: 20/8/8 duos on one team essentially never; team assists ~26/g)
require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); require('../src/game.js');
NBA.setSeed(31); const L = NBA.newLeague(2027, { real: true }); const Y = +process.argv[2] || 40; let n888 = 0, duo = 0, duoLoose = 0, sums = { pts: 0, reb: 0, ast: 0 }, tn = 0, hiAst = 0;
for (let y = 0; y < Y; y++) { const r = NBA.simSeason(L, null); const by = {};
  r.entries.filter((e) => e.l.gp >= 40).forEach((e) => { (by[e.t.id] = by[e.t.id] || []).push(e.l); if (e.l.pts >= 20 && e.l.reb >= 8 && e.l.ast >= 8) n888++; });
  Object.values(by).forEach((a) => { const s = (k) => a.reduce((t, l) => t + l[k] * l.mins / 48 * 0 + l[k], 0); sums.pts += s('pts'); sums.reb += s('reb'); sums.ast += s('ast'); tn++;
    if (a.filter((l) => l.pts >= 20 && l.reb >= 8 && l.ast >= 8).length >= 2) duo++;
    if (a.filter((l) => l.pts >= 18 && l.reb >= 6 && l.ast >= 6).length >= 2) duoLoose++;
    if (a.filter((l) => l.ast >= 7).length >= 2) hiAst++; });
  NBA.offseason(L, { draft: true }); }
console.log('20/8/8 players per season', (n888 / Y).toFixed(2), '| teams with two 20/8/8:', duo, 'of', tn, '| two 18/6/6:', duoLoose, '| two 7+ apg:', hiAst, '| team sums of rotation (40+ gp) per game: pts', (sums.pts / tn).toFixed(0), 'reb', (sums.reb / tn).toFixed(0), 'ast', (sums.ast / tn).toFixed(0));
