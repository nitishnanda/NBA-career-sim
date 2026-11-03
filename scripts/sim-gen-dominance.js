// How dominant are sim careers that reach the real 'generational' bar (2+ MVP or 5+ All-NBA 1st)? Seasons as the league's #1 producer and the margin over #2,
// next to the real gens (1980-2024, era-scaled perf: 1.8 seasons as #1 per career, most 0-3; margin when #1: median 3.0). MVP count distribution too.
// Usage: N=200 node scripts/sim-gen-dominance.js     (TUNE='{...}')
require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const G = require('../src/game.js').Game;
if (process.env.TUNE) Object.assign(NBA.tuning, JSON.parse(process.env.TUNE));
const N = +process.env.N || 200, out = []; let cur = null;
NBA.onSeasonLog = (st, rec) => { if (rec.gp < 0.7 * 82) return; const others = Object.values(st.league.lines).filter((l) => l.gp >= 58).map((l) => l.perf); const best = Math.max(...others); cur.push({ me: NBA.perfOf(rec), best }); };
const POS = ['PG', 'SG', 'SF', 'PF', 'C'];
for (let i = 0; i < N; i++) { cur = []; const st = G.newCareer({ name: 'x', pos: POS[i % 5], arch: 'generational', home: 'Ohio', seed: 4400000 + (+process.env.SEEDOFF || 0) * 10000 + i }); G.auto(st);
  const aw = st.career.awards; out.push({ gen: (aw.MVP || 0) >= 2 || (aw['All-NBA 1st Team'] || 0) >= 5, mvp: aw.MVP || 0, n1: cur.filter((s) => s.me > s.best).length, marg: cur.filter((s) => s.me > s.best).map((s) => s.me - s.best) }); }
const g = out.filter((x) => x.gen), mean = (a) => a.reduce((t, v) => t + v, 0) / Math.max(1, a.length), m = [].concat(...g.map((x) => x.marg)).sort((a, b) => a - b);
console.log('gen picks', N, '| reach the gen bar', (g.length / N).toFixed(2), '| MVPs per pick', mean(out.map((x) => x.mvp)).toFixed(2), '| per gen', mean(g.map((x) => x.mvp)).toFixed(2), '(real 1.86) | 4+ MVPs', (g.filter((x) => x.mvp >= 4).length / g.length).toFixed(2), '(real 0.14) | 6+', (g.filter((x) => x.mvp >= 6).length / g.length).toFixed(2), '(real 0.00)');
console.log('seasons as #1 producer per gen', mean(g.map((x) => x.n1)).toFixed(2), '(real 1.79) dist', JSON.stringify(g.map((x) => x.n1).sort((a, b) => a - b).filter((_, i, a) => i % Math.max(1, Math.floor(a.length / 14)) === 0)), '| margin when #1: mean', mean(m).toFixed(2), 'median', (m[Math.floor(m.length / 2)] || 0).toFixed(2), '(real 3.85 / 3.01)');
