// Final-season age distribution of sim careers by archetype (real gens: median 38.5, p25 36, p75 39; scorers/defenders median 35)
require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const G = require('../src/game.js').Game;
if (process.env.TUNE) Object.assign(NBA.tuning, JSON.parse(process.env.TUNE));
const pct = (a, p) => { const b = a.slice().sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(b.length * p))]; };
['generational', 'scorer', 'defender'].forEach((arch) => { const ages = [];
  for (let i = 0; i < (+process.argv[2] || 60); i++) { const st = G.newCareer({ name: 'x', pos: ['PG', 'SG', 'SF', 'PF', 'C'][i % 5], arch, home: 'Ohio', seed: 9100 + i * 13, stars: arch === 'generational' ? 5 : undefined }); G.auto(st); const ps = st.proSeasons.filter((s) => s.gp >= 20); ages.push(ps[ps.length - 1].age); }
  console.log(arch.padEnd(13), 'final age p10/25/50/75/90', [0.1, 0.25, 0.5, 0.75, 0.9].map((p) => pct(ages, p)).join('/'), 'mean', (ages.reduce((a, b) => a + b, 0) / ages.length).toFixed(1)); });
