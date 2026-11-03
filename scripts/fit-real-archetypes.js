// For every real player: which of the six archetypes, at their rating, best reproduces their real per-36 line?
// Also reports how well the engine predicts real lines overall (a direct validation against real stats).
// Usage: node scripts/fit-real-archetypes.js [--write]   (--write saves data/real-arch-fit.json for build-real.py)
require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); require('../src/real.js'); const N = require('../src/game.js');
const ARCHS = Object.keys(N.data.ARCHETYPES);
const SCALE = { pts: 5, reb: 2, ast: 1.8, stl: 0.5, blk: 0.5 };
const rows = [];
Object.entries(N.real.TEAMS).forEach(([team, ps]) => ps.forEach((r) => { if (r[6] && r[6][1] >= 30) rows.push({ team, r }); }));
const L = { nextId: 1 };
const fits = {}; let sumErr = {}, n = 0; const resid = {}; ARCHS.forEach((a) => (resid[a] = { pts: [], reb: [], ast: [], stl: [], blk: [], n: 0 }));
rows.forEach(({ r }) => {
  const [name, pos, age, goal, arch, sec, act] = r;
  const [, g, mpg, pts, reb, ast, stl, blk] = act; const k = 36 / mpg;
  const a36 = { pts: pts * k, reb: reb * k, ast: ast * k, stl: stl * k, blk: blk * k };
  const errs = {}; const preds = {};
  ARCHS.forEach((ar) => {
    const acc = { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 }; const S = 10;
    for (let i = 0; i < S; i++) {
      const p = N.makeReal(L, [name, pos, age, goal, ar, ar === arch ? sec : ''], 0);
      const e = N.expLine(p, { pace: 99, coTax: 0.01 }); const kk = 36 / e.mins;
      acc.pts += e.pts * kk / S; acc.reb += e.reb * kk / S; acc.ast += e.ast * kk / S; acc.stl += e.stl * kk / S; acc.blk += e.blk * kk / S;
    }
    preds[ar] = acc;
    errs[ar] = Math.sqrt(Object.keys(SCALE).reduce((s, key) => s + ((acc[key] - a36[key]) / SCALE[key]) ** 2, 0) / 5);
  });
  const best = ARCHS.slice().sort((a, b) => errs[a] - errs[b])[0];
  fits[name] = { mine: arch, best, errMine: +errs[arch].toFixed(2), errBest: +errs[best].toFixed(2) };
  Object.keys(SCALE).forEach((key) => resid[arch][key].push(preds[arch][key] - a36[key])); resid[arch].n++;
  n++; sumErr.mine = (sumErr.mine || 0) + errs[arch]; sumErr.best = (sumErr.best || 0) + errs[best];
});
const avg = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
console.log('players validated (>=30 games last season):', n, '| mean error with my archetype', (sumErr.mine / n).toFixed(2), '| with best-fit archetype', (sumErr.best / n).toFixed(2));
console.log('\nPREDICTED minus ACTUAL per-36 production, by the archetype the player was given (mean; + means the sim over-produces):');
console.log('archetype'.padEnd(13), 'n'.padStart(3), 'pts'.padStart(6), 'reb'.padStart(6), 'ast'.padStart(6), 'stl'.padStart(6), 'blk'.padStart(6));
ARCHS.forEach((a) => { const x = resid[a]; if (x.n) console.log(a.padEnd(13), String(x.n).padStart(3), ...['pts', 'reb', 'ast', 'stl', 'blk'].map((k) => avg(x[k]).toFixed(2).padStart(6))); });
const switches = Object.entries(fits).filter(([, f]) => f.best !== f.mine && f.errBest < 0.7 * f.errMine);
console.log('\nplayers where another archetype fits >30% better than the one given:', switches.length);
console.log(switches.map(([nm, f]) => nm + ': ' + f.mine + ' -> ' + f.best + ' (' + f.errMine + ' -> ' + f.errBest + ')').join('\n'));
if (process.argv.includes('--write')) { require('fs').writeFileSync(__dirname + '/../data/real-arch-fit.json', JSON.stringify(fits, null, 1)); console.log('\nwrote data/real-arch-fit.json'); }
