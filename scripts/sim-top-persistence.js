// Sim league: same persistence metrics as top-persistence.py
require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); require('../src/game.js');
if (process.env.TUNE) Object.assign(NBA.tuning, JSON.parse(process.env.TUNE));
NBA.setSeed(+process.env.SEED || 777); const L = NBA.newLeague(2027, { real: true }); const tops = [];
for (let y = 0; y < (+process.env.YEARS || 40); y++) { const r = NBA.simSeason(L, null); tops.push(r.entries.filter((x) => x.l.gp >= 58).sort((a, b) => b.l.pts - a.l.pts).map((x) => x.p.id)); NBA.offseason(L, { draft: true }); }
[5, 10].forEach((k) => { const ov = []; for (let y = 1; y < tops.length; y++) ov.push(tops[y].slice(0, k).filter((i) => tops[y - 1].slice(0, k).includes(i)).length); console.log('sim top', k, 'repeat from prior year: mean', (ov.reduce((a, b) => a + b, 0) / ov.length).toFixed(2)); });
const ds = []; for (let a = 0; a + 10 <= tops.length; a++) { const s = new Set(); for (let y = a; y < a + 10; y++) tops[y].slice(0, 5).forEach((i) => s.add(i)); ds.push(s.size); }
console.log('sim distinct top-5 scorers in a 10-yr window:', (ds.reduce((a, b) => a + b, 0) / ds.length).toFixed(1));
