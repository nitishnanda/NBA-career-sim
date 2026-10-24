// Fit career-shape knobs (growth, decline, durability, retirement, start gap) so sim cohorts follow the real archetype blueprints
// (data/real-blueprints.json): rating-vs-peak by age, minutes, games played, peak age, career length.
// Usage: node scripts/fit-careers.js [iterations]   env: PER=25 careers per archetype, ARCHS=generational,scorer,defender, START='{"growthScale":1.0}'
require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = require('../src/game.js'); const G = N.Game; const T = NBA.tuning;
const real = require('../data/real-blueprints.json'); const ITER = +process.argv[2] || 40; const PER = +process.env.PER || 25;
const ARCHS = (process.env.ARCHS || 'generational,scorer,defender').split(',');
if (process.env.START) Object.assign(T, JSON.parse(process.env.START));
const KNOBS = { growthScale: [0.6, 1.4], declineScale: [0.8, 2.2], declineLate: [0.7, 2.2], genGapA: [4, 22], genGapB: [4, 16], injScale: [0.3, 1.2], retireScale: [0.5, 2.2] };
const perfOf = (s) => s.pts * (1 + 2.2 * ((s.ts || 0.57) - 0.57)) + 1.15 * s.reb + 1.5 * s.ast + 2 * (s.stl + s.blk) - 1.1 * (s.tov || 0);
const med = (a) => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : NaN; };
const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
function cohort(arch) {
  const out = [];
  for (let i = 0; i < PER; i++) {
    const st = G.newCareer({ name: 'x', pos: ['PG', 'SG', 'SF', 'PF', 'C'][i % 5], arch, home: 'Ohio', seed: 81000 + i * 11, stars: arch === 'generational' ? 5 : undefined });
    G.auto(st); const ps = st.proSeasons.map((s) => Object.assign({ perf: perfOf(s) }, s)); const asn = ps.filter((s) => s.awards.includes('All-Star')).length;
    if (arch === 'generational' || asn >= 2) out.push(ps);
  }
  return out;
}
function evaluate() {
  let loss = 0, detail = {};
  ARCHS.forEach((arch) => {
    const R = real[arch], C = cohort(arch); if (C.length < 6) { loss += 200; return; }
    const age = {}, pa = [], pw = [], cl = [], p5 = [];
    C.forEach((ps) => { const q = ps.filter((s) => s.gp >= 45); if (q.length < 4) return; const best = q.reduce((b, s) => (s.perf > b.perf ? s : b), q[0]); pa.push(best.age); pw.push(q.filter((s) => s.perf >= 0.92 * best.perf).length); cl.push(ps.filter((s) => s.gp >= 20).length); p5.push(mean(q.slice().sort((a, b) => b.perf - a.perf).slice(0, 5).map((s) => s.perf)));
      ps.forEach((s) => { const a = age[s.age] = age[s.age] || { rel: [], gf: [], mpg: [] }; a.rel.push(s.perf / best.perf); a.gf.push(s.gp / 82); a.mpg.push(s.mins); }); });
    let l = 0;
    for (let ag = 20; ag <= 38; ag += 2) { const rc = R.curve[ag], sc = age[ag]; if (!rc || !sc || sc.rel.length < 5) continue; l += Math.pow((med(sc.rel) - rc.rel) / 0.05, 2) + Math.pow((med(sc.gf) - rc.gf) / 0.05, 2) + Math.pow((med(sc.mpg) - rc.mpg) / 1.8, 2); }
    l += 4 * Math.pow((med(pa) - R.peak_age.med) / 1.0, 2) + 2 * Math.pow((mean(cl) - R.career_len.mean) / 1.5, 2) + 2 * Math.pow((mean(pw) - R.peak_width92.mean) / 0.6, 2);
    l += 3 * Math.pow((mean(p5) - R.peak5.perf.mean) / 2.0, 2);
    loss += l; detail[arch] = { l: +l.toFixed(1), peak: med(pa), len: +mean(cl).toFixed(1), width: +mean(pw).toFixed(1) };
  });
  return { loss, detail };
}
let best = evaluate(); console.log('start', best.loss.toFixed(1), JSON.stringify(best.detail));
const clampK = (k, v) => Math.min(KNOBS[k][1], Math.max(KNOBS[k][0], v));
let sr = 11; const rnd = () => { sr = (sr * 16807) % 2147483647; return sr / 2147483647; };
for (let it = 0; it < ITER; it++) {
  const keys = Object.keys(KNOBS), pickN = 1 + Math.floor(rnd() * 2), old = {};
  for (let i = 0; i < pickN; i++) { const k = keys[Math.floor(rnd() * keys.length)]; if (old[k] == null) old[k] = T[k]; const span = KNOBS[k][1] - KNOBS[k][0]; T[k] = clampK(k, T[k] + (rnd() - 0.5) * 0.3 * span); }
  const r = evaluate();
  if (r.loss < best.loss) { best = r; console.log('it', it, r.loss.toFixed(1), JSON.stringify(Object.fromEntries(Object.keys(KNOBS).map((k) => [k, +T[k].toFixed(4)]))), JSON.stringify(r.detail)); } else Object.keys(old).forEach((k) => { T[k] = old[k]; });
}
console.log('FINAL', JSON.stringify(Object.fromEntries(Object.keys(KNOBS).map((k) => [k, +T[k].toFixed(4)]))), best.loss.toFixed(1));
