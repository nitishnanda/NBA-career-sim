// share of each team's top-8 (by ovr) still on the same team one summer later (real NBA: roughly 70-75% of a rotation returns)
require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); require('../src/game.js');
NBA.setSeed(+process.env.SEED || 12); const L = NBA.newLeague(2026, { real: true }); const top8 = () => { const m = {}; L.teams.forEach((t) => { m[t.id] = Object.values(L.players).filter((p) => p.teamId === t.id && !p.rookie).sort((a, b) => NBA.ovr(b) - NBA.ovr(a)).slice(0, 8).map((p) => p.id); }); return m; };
let tot = 0, same = 0, sw = 0; const yrs = +process.argv[2] || 6;
for (let y = 0; y < yrs; y++) { const before = top8(); NBA.simSeason(L, null); NBA.offseason(L, { draft: true }); const after = top8();
  L.teams.forEach((t) => before[t.id].forEach((id) => { tot++; if (L.players[id] && L.players[id].teamId === t.id) same++; else if (L.players[id]) sw++; })); }
console.log('top-8 still with same team next year:', (100 * same / tot).toFixed(0) + '%', '| moved teams:', (100 * sw / tot).toFixed(0) + '%', '| retired/gone:', (100 * (tot - same - sw) / tot).toFixed(0) + '%');
