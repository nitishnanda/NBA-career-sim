// Fit the generational box-score dominator's age curve (dominator archetype with the generational tag) to the real CSV pool
// (data/real-gen-dominators.json 'gen': Magic, LeBron, Jokic, Westbrook, Harden, Giannis, Luka, Kidd, Bird; median ppg by age).
// Loss: squared gap of the sim's median ppg to the real median at ages 22-34, weighted by how many real players the age has.
// Usage: node scripts/fit-gen-dominator.js [iterations]   (N careers per evaluation, default 60; RSEED; START)
require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const G = require('../src/game.js').Game;
const T = NBA.tuning; if (process.env.START) Object.assign(T, JSON.parse(process.env.START));
const real = require('../data/real-gen-dominators.json').gen, N = +process.env.N || 60;
const KNOBS = { genDomUsg: [0, 0.15], gdTs: [0, 0.04], gdDecline: [0.3, 1.6], gdMins: [0, 3] };
const AGES = []; for (let a = 22; a <= 34; a++) if (real[a]) AGES.push(a);
function evaluate() {
  const by = {};
  for (let i = 0; i < N; i++) { const st = G.newCareer({ name: 'x', pos: ['PG', 'SF', 'C'][i % 3], arch: 'dominator', sec: 'generational', home: 'Ohio', seed: 300 + i }); G.auto(st); st.proSeasons.forEach((s) => { (by[s.age] = by[s.age] || []).push(s.pts); }); }
  const med = (a) => { const v = (by[a] || []).slice().sort((x, y) => x - y); return v.length ? v[Math.floor(v.length / 2)] : 0; };
  const curve = AGES.map(med); return { loss: AGES.reduce((t, a, i) => t + real[a].n * (curve[i] - real[a].pts) ** 2, 0) / 10, curve };
}
const fmt = () => JSON.stringify(Object.fromEntries(Object.keys(KNOBS).map((k) => [k, +T[k].toPrecision(4)])));
let best = evaluate(); console.log('start', best.loss.toFixed(1), AGES.map((a, i) => a + ':' + best.curve[i].toFixed(1)).join(' '));
let s = +process.env.RSEED || 5; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
for (let it = 0; it < (+process.argv[2] || 30); it++) {
  const old = Object.assign({}, T), keys = Object.keys(KNOBS);
  for (let i = 0; i < 1 + Math.floor(rnd() * 2); i++) { const k = keys[Math.floor(rnd() * keys.length)], [a, b] = KNOBS[k]; T[k] = Math.min(b, Math.max(a, T[k] + (rnd() - 0.5) * 0.35 * (b - a))); }
  const r = evaluate(); if (r.loss < best.loss) { best = r; console.log('it', it, r.loss.toFixed(1), fmt()); } else Object.assign(T, old);
}
console.log('FINAL', fmt(), best.loss.toFixed(1));
console.log('age  ' + AGES.join('    ')); console.log('sim  ' + best.curve.map((v) => v.toFixed(1)).join('  ')); console.log('real ' + AGES.map((a) => real[a].pts.toFixed(1)).join('  '));
