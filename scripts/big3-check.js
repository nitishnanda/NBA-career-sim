// Share of careers reaching 30k pts / 10k reb / 10k ast (real: only LeBron ever hit 30k pts + 10k ast + 10k reb... 30/10/10 career totals)
require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = require('../src/game.js'); const G = N.Game;
const ARCH = ['generational', 'scorer', 'twoway', 'shooter', 'dominator', 'defender'];
const n = +process.env.N || 180; let c30 = 0, cAll = 0, c25 = 0, c20 = 0, c10r = 0, c10a = 0, tot = 0; const yrs = [];
for (let i = 0; i < n; i++) {
  const st = G.newCareer({ name: 'x', pos: ['SF', 'PG', 'C', 'PF'][i % 4], arch: ARCH[i % 6], home: 'Ohio', seed: 31000 + i, stars: 5, ceiling: 84 + (i % 13) }); G.auto(st); tot++;
  const P = st.proSeasons.reduce((s, x) => s + x.totPts, 0), R = st.proSeasons.reduce((s, x) => s + x.totReb, 0), A = st.proSeasons.reduce((s, x) => s + x.totAst, 0);
  yrs.push(st.proSeasons.length); if (P >= 30000) c30++; if (P >= 25000) c25++; if (P >= 20000) c20++; if (R >= 10000) c10r++; if (A >= 10000) c10a++; if (P >= 30000 && R >= 10000 && A >= 10000) cAll++;
}
console.log('careers', tot, '| 20k+', c20, '25k+', c25, '30k+', c30, '| 10k reb', c10r, '10k ast', c10a, '| ALL THREE', cAll, '| mean seasons', (yrs.reduce((a, b) => a + b) / n).toFixed(1));
const by = {};
for (let i = 0; i < 60; i++) { const arch = ['generational', 'dominator'][i % 2];
  const st = G.newCareer({ name: 'x', pos: ['C', 'PF', 'SF', 'PG'][i % 4], arch, home: 'Ohio', seed: 41000 + i, stars: 5 }); G.auto(st);
  const P = st.proSeasons.reduce((s, x) => s + x.totPts, 0), R = st.proSeasons.reduce((s, x) => s + x.totReb, 0), A = st.proSeasons.reduce((s, x) => s + x.totAst, 0), g = st.proSeasons.reduce((s, x) => s + x.gp, 0);
  const b = by[arch] = by[arch] || { n: 0, p30: 0, r10: 0, a10: 0, all: 0, P: 0, R: 0, A: 0, g: 0, y: 0 }; b.n++; b.P += P; b.R += R; b.A += A; b.g += g; b.y += st.proSeasons.length;
  if (P >= 30000) b.p30++; if (R >= 10000) b.r10++; if (A >= 10000) b.a10++; if (P >= 30000 && R >= 10000 && A >= 10000) b.all++; }
Object.keys(by).forEach((k) => { const b = by[k]; console.log(k, 'n', b.n, '30k', b.p30, '10kR', b.r10, '10kA', b.a10, 'ALL', b.all, '| avg career', Math.round(b.P / b.n), Math.round(b.R / b.n), Math.round(b.A / b.n), 'games', Math.round(b.g / b.n), 'yrs', (b.y / b.n).toFixed(1)); });
