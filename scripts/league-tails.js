// League tails per season (sim vs real modern): how many 30-ppg, 10-apg, 12-rpg ... players a season. Usage: node scripts/league-tails.js [seasons]
require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); require('../src/game.js');
if (process.env.TUNE) Object.assign(NBA.tuning, JSON.parse(process.env.TUNE));
const real = require('../data/real-rank-profile.json')._tails; NBA.setSeed(4242); const L = NBA.newLeague(2027, { real: true });
const T = { pts30: ['pts', 30], pts25: ['pts', 25], pts20: ['pts', 20], ast10: ['ast', 10], ast8: ['ast', 8], ast6: ['ast', 6], reb12: ['reb', 12], reb10: ['reb', 10], reb8: ['reb', 8] }; const tl = {}; const Y = +process.argv[2] || 30;
for (let y = 0; y < Y; y++) { const r = NBA.simSeason(L, null); const q = r.entries.filter((x) => x.l.gp >= 58); Object.keys(T).forEach((k) => { const [m, t] = T[k]; tl[k] = (tl[k] || 0) + q.filter((x) => x.l[m] >= t).length; }); NBA.offseason(L, { draft: true }); }
console.log('tails per season sim/real:', Object.keys(T).map((k) => k + ' ' + (tl[k] / Y).toFixed(1) + '/' + real[k].toFixed(1)).join('  '));
