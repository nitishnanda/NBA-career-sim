// Gen-tagged box-score dominator careers by age next to the real CSV curve (data/real-gen-dominators.json 'gen' curve, built by scripts/real-gen-dominators.py: Magic, LeBron, Jokic, Westbrook, Harden, Giannis, Luka, Kidd, Bird)
require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const G = require('../src/game.js').Game;
if (process.env.TUNE) Object.assign(NBA.tuning, JSON.parse(process.env.TUNE));
const real = require('../data/real-gen-dominators.json'); const N = +process.env.N || 60; const by = {}; let peak = [];
for (let i = 0; i < N; i++) { const st = G.newCareer({ name: 'x', pos: ['PG', 'SF', 'C'][i % 3], arch: 'dominator', sec: 'generational', home: 'Ohio', seed: 300 + i }); G.auto(st);
  st.proSeasons.forEach((s) => { (by[s.age] = by[s.age] || []).push(s); }); const q = st.proSeasons.filter((s) => s.gp >= 50); if (q.length) peak.push(q.reduce((a, s) => (s.pts + s.reb + s.ast > a.pts + a.reb + a.ast ? s : a)).age); }
const mean = (a, k) => a.reduce((t, s) => t + s[k], 0) / a.length; const med = (a, k) => { const b = a.map((s) => s[k]).sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const rr = (a) => real.gen[String(a)];
const r = (age) => { const x = real.gen[String(age)]; return x ? [x.mpg, x.pts, x.reb, x.ast, x.gf / 100 * 82] : null; };
console.log('age   n | sim mpg  pts  reb  ast   gp | real mpg  pts  reb  ast   gp   (real = CSV gen pool, median)');
for (let a = 19; a <= 38; a++) { const s = by[a]; if (!s || s.length < 8) continue; const x = r(a), f = (v, d) => v.toFixed(d == null ? 1 : d);
  const U = (arr) => 100 * mean(arr, 'usg'), TS = (arr) => 100 * mean(arr, 'ts'); const x2 = rr(a);
  console.log(String(a).padEnd(5) + String(s.length).padStart(3) + ' | ' + [med(s, 'mins'), med(s, 'pts'), med(s, 'reb'), med(s, 'ast')].map((v) => f(v).padStart(5)).join(' ') + String(Math.round(med(s, 'gp'))).padStart(5) + ' | ' + (x ? x.map((v, i) => f(v, i === 4 ? 0 : 1).padStart(5)).join(' ') : '   –')); }
peak.sort((p, q) => p - q); console.log('age of best season (sim median)', peak[Math.floor(peak.length / 2)]);
