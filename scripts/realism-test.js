// Realism test: how close are simulated careers to real NBA careers of the same archetype?
// Real careers: data/real-careers.json (scripts/real-blueprints.py, Basketball-Reference CSVs, debuts 1980-2018).
// Sim careers are classified with the SAME rules as the real ones, then compared feature by feature.
//
// Score per feature = (1 - KS distance between sim and real distributions) / (1 - KS distance a perfect sim would show at this sample size)
// so 100% means "statistically as close as real careers are to each other"; the archetype score is the mean over features.
// Plausibility = share of sim careers whose every key stat falls inside the range real careers of that archetype have covered.
//
// Usage: node scripts/realism-test.js [careers per archetype, default 80]     TUNE='{"knob":1}' to try tuning values
require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const G = require('../src/game.js').Game;
if (process.env.TUNE) Object.assign(NBA.tuning, JSON.parse(process.env.TUNE));
const REAL = require('../data/real-careers.json');
const N = +process.argv[2] || 80, NGEN = +process.env.NGEN || N, ARCHS = (process.env.ARCHS || 'generational,scorer,dominator,shooter,twoway,defender').split(',');
const perfOf = (s) => s.pts * (1 + 2.2 * ((s.ts || 0.57) - 0.57)) + 1.15 * s.reb + 1.5 * s.ast + 2 * (s.stl + s.blk) - 1.1 * (s.tov || 0);
const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);

// features of one career (same definitions as real-blueprints.py)
function features(st) {
  const ps = st.proSeasons.map((s) => Object.assign({ perf: perfOf(s) }, s)), aw = st.career.awards;
  const q = ps.filter((s) => s.gp >= 0.55 * 82); if (q.length < 5) return null;
  const t5 = q.slice().sort((a, b) => b.perf - a.perf).slice(0, 5), m = (k) => mean(t5.map((s) => s[k] || 0));
  const best = q.reduce((b, s) => (s.perf > b.perf ? s : b), q[0]);
  const prime = q.filter((s) => s.age >= best.age - 3 && s.age <= best.age + 3).sort((a, b) => a.age - b.age), d = [];
  for (let i = 1; i < prime.length; i++) if (prime[i].age - prime[i - 1].age === 1) d.push(Math.abs(prime[i].pts - prime[i - 1].pts));
  const played = ps.filter((s) => s.gp >= 20);
  return {
    pts: m('pts'), reb: m('reb'), ast: m('ast'), ts: 100 * m('ts'), mpg: m('mins'), perf: m('perf'), usg: 100 * m('usg'), ar3: mean(t5.map((s) => (s.fga ? (s.tpa || 0) / s.fga : 0))), ftp: m('ftp'),
    stl: m('stl'), blk: m('blk'), peakAge: best.age, debutAge: ps[0].age, finalAge: ps[ps.length - 1].age, seasons: played.length,
    careerPts: ps.reduce((t, s) => t + s.pts * s.gp, 0), best: Math.max(...q.map((s) => s.pts)), n30: q.filter((s) => s.pts >= 30).length,
    noise: d.length ? mean(d) : null, gpRate: mean(played.map((s) => s.gp / 82)), td: ps.reduce((t, s) => t + (s.td || 0), 0),
    mvp: aw.MVP || 0, allnba1: aw['All-NBA 1st Team'] || 0, allnba: aw['All-NBA'] || 0, allstar: aw['All-Star'] || 0, alldef: aw['All-Defense'] || 0, dpoy: aw.DPOY || 0,
  };
}
// the real cohort rules (scripts/real-blueprints.py: arch())
function classify(f) {
  if (f.mvp >= 2 || f.allnba1 >= 5) return 'generational';
  if (f.allstar < 1 && f.allnba < 1 && f.alldef < 1 && f.perf < 27) return null;
  if ((f.ast >= 5.0 && f.reb >= 6.0) || f.td >= 30) return 'dominator';
  if (f.ar3 >= 0.38 && f.ftp >= 0.80 && f.pts >= 15 && f.reb < 6) return 'shooter';
  if (f.pts >= 20) return 'scorer';
  if ((f.stl >= 1.4 || f.blk >= 1.2) && f.pts >= 15 && f.alldef >= 1) return 'twoway';
  if (f.pts < 15 && (f.blk >= 1.3 || f.reb >= 8.5 || f.alldef >= 2)) return 'defender';
  return null;
}
// two-sample Kolmogorov-Smirnov distance
function ks(a, b) {
  const x = a.slice().sort((p, q) => p - q), y = b.slice().sort((p, q) => p - q), all = x.concat(y).sort((p, q) => p - q);
  let dmax = 0, i = 0, j = 0;
  for (const v of all) { while (i < x.length && x[i] <= v) i++; while (j < y.length && y[j] <= v) j++; dmax = Math.max(dmax, Math.abs(i / x.length - j / y.length)); }
  return dmax;
}
let seed = 12345; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
function nullD(real, m) { let t = 0; for (let k = 0; k < 150; k++) { const s = []; for (let i = 0; i < m; i++) s.push(real[Math.floor(rnd() * real.length)]); t += ks(s, real); } return t / 150; }

const FEATS = [['pts', 'peak-5 ppg'], ['reb', 'peak-5 rpg'], ['ast', 'peak-5 apg'], ['usg', 'peak usage %'], ['ts', 'peak TS %'], ['mpg', 'peak minutes'], ['best', 'best season ppg'], ['n30', '30-ppg seasons*'], ['peakAge', 'age of best season'], ['debutAge', 'debut age'],
  ['noise', 'year-to-year ppg swing'], ['gpRate', 'games played share'], ['allstar', 'All-Star seasons*'], ['allnba', 'All-NBA teams*'], ['mvp', 'MVPs*'], ['alldef', 'All-Defense teams*'],
  ['seasons', 'career length*'], ['finalAge', 'final age*'], ['careerPts', 'career points*']];
const INFO = new Set(['usg']);   // shown, not scored: era-adjusting old seasons raises their points but leaves usage share alone
const COMPLETE = new Set(['seasons', 'finalAge', 'careerPts', 'allstar', 'allnba', 'mvp', 'alldef', 'n30']);   // career totals: only finished real careers (last season 2021 or earlier)
// a finished (or nearly finished) real career: retired by 2024, or a veteran who debuted by 2008 (LeBron, Durant, Curry, Harden...)
const done = (x) => x.last <= 2024 || x.debut <= 2008;
// career profile used by the copy check
const CF = ['pts', 'reb', 'ast', 'ts', 'mpg', 'peakAge', 'seasons', 'finalAge', 'n30', 'best', 'allstar', 'allnba', 'mvp', 'alldef', 'gpRate'];
const PLAUS = ['pts', 'reb', 'ast', 'best', 'peakAge', 'allstar', 'mvp', 'seasons', 'finalAge'];

// generate: positions follow the real archetype's position mix. Each career is scored against the real cohort of the archetype it was
// created as, if it became a notable player of that archetype (otherwise e.g. defensive centres spill into the two-way group).
// DUMP=file saves the classified careers; LOAD=a,b,c scores saved runs together (lets several processes share the work).
const pool = {};
if (process.env.LOAD) process.env.LOAD.split(',').forEach((f) => { const d = JSON.parse(require('fs').readFileSync(f, 'utf8')); Object.keys(d).forEach((k) => { pool[k] = (pool[k] || []).concat(d[k]); }); });
else ARCHS.forEach((arch, ai) => {
  const mix = {}; (REAL[arch] || []).forEach((r) => { mix[r.pos] = (mix[r.pos] || 0) + 1; }); const pk = Object.keys(mix), tot = pk.reduce((t, k) => t + mix[k], 0);
  for (let i = 0; i < (arch === 'generational' ? NGEN : N); i++) {
    let u = rnd() * tot, pos = pk[0]; for (const k of pk) { u -= mix[k]; if (u <= 0) { pos = k; break; } }
    const st = G.newCareer({ name: 'x', pos: ['PG', 'SG', 'SF', 'PF', 'C'].includes(pos) ? pos : 'SF', arch, home: 'Ohio', seed: 777000 + (+process.env.SEEDOFF || 0) * 100000 + ['generational', 'scorer', 'dominator', 'shooter', 'twoway', 'defender'].indexOf(arch) * 1000 + i });
    G.auto(st); const f = features(st); if (!f) continue; const c = classify(f); if (c === arch) (pool[c] = pool[c] || []).push(f);   // a career made as archetype X that became a notable X, compared with real X careers
  }
});

if (process.env.DUMP) { require('fs').writeFileSync(process.env.DUMP, JSON.stringify(pool)); console.log('dumped', Object.keys(pool).map((k) => k + ' ' + pool[k].length).join(', ')); process.exit(0); }
// pooled real reference for the copy check
const CREF = (() => {
  const R = []; Object.keys(REAL).forEach((a) => REAL[a].filter(done).forEach((r) => { if (CF.every((k) => r[k] != null && Number.isFinite(r[k]))) R.push(Object.assign({ __arch: a }, r)); }));
  const mu = CF.map((k) => mean(R.map((x) => x[k]))), sd = CF.map((k, i) => Math.sqrt(mean(R.map((x) => (x[k] - mu[i]) ** 2))) + 1e-9);
  const z = (x) => CF.map((k, i) => (x[k] - mu[i]) / sd[i]), dist = (p, q) => Math.sqrt(p.reduce((t, v, i) => t + (v - q[i]) ** 2, 0)), Z = R.map(z);
  const nn = Z.map((p, i) => Math.min(...Z.filter((_, j) => j !== i).map((q) => dist(p, q))));
  const srt = nn.slice().sort((p, q) => p - q);
  return { R, Z, z, dist, nn, thr: srt[Math.floor(0.05 * (srt.length - 1))], hi: srt[Math.floor(0.95 * (srt.length - 1))] };
})();
const SCORE = process.env.LOAD ? (process.env.SCORE_ARCHS || 'generational,scorer,dominator,shooter,twoway,defender').split(',') : ARCHS;
const out = {}; let lines = [];
SCORE.forEach((arch) => {
  const sim = pool[arch] || [], real = REAL[arch] || [];
  if (sim.length < 8) { lines.push(`\n${arch}: only ${sim.length} sim careers classified as ${arch}; not enough to score`); return; }
  const rows = []; let sc = 0, n = 0;
  FEATS.forEach(([k, label]) => {
    const r = (COMPLETE.has(k) ? real.filter(done) : real).map((x) => x[k]).filter((v) => v != null && Number.isFinite(v));
    const s = sim.map((x) => x[k]).filter((v) => v != null && Number.isFinite(v));
    if (r.length < 8 || s.length < 8) return;
    const d = ks(s, r), d0 = nullD(r, s.length), score = Math.max(0, Math.min(1, (1 - d) / (1 - d0)));
    if (!INFO.has(k)) { sc += score; n++; } rows.push({ label: INFO.has(k) ? label + ' (info)' : label, real: mean(r), sim: mean(s), score });
  });
  // plausibility: every key stat inside what real careers of this archetype have done
  const rng = {}; PLAUS.forEach((k) => { const v = real.filter((x) => !COMPLETE.has(k) || done(x)).map((x) => x[k]).filter((z) => z != null); if (v.length >= 5) rng[k] = [Math.min(...v), Math.max(...v)]; });
  const plaus = sim.filter((f) => Object.keys(rng).every((k) => f[k] == null || (f[k] >= rng[k][0] - 1e-9 && f[k] <= rng[k][1] + 1e-9))).length / sim.length;
  const fails = Object.keys(rng).map((k) => [k, sim.filter((f) => f[k] != null && (f[k] < rng[k][0] - 1e-9 || f[k] > rng[k][1] + 1e-9)).length]).filter((x) => x[1]).sort((a, b) => b[1] - a[1]);
  // copy check: is a sim career a near-clone of ANY real notable career? (what people notice: "wait, this is just Kobe")
  // reference = all finished real careers of every archetype (~250), stats standardized over that pool; the copy line is the 5th percentile
  // of real careers' distance to their nearest other real career, so ~5% of real careers are "copies" of someone too (baseline shown per archetype)
  let copy = null;
  {
    const a = (f) => { const v = CREF.z(f); let best = Infinity, bi = -1; CREF.Z.forEach((b, j) => { if (b === f.__z) return; const d = CREF.dist(v, b); if (d < best) { best = d; bi = j; } }); return [best, bi]; };
    const who = {}, nnSim = sim.filter((f) => CF.every((k) => f[k] != null)).map((f) => { const [d, j] = a(f); if (d < CREF.thr) who[CREF.R[j].player] = (who[CREF.R[j].player] || 0) + 1; return d; });
    const realHere = CREF.R.map((r, j) => [r, CREF.nn[j]]).filter(([r]) => r.__arch === arch);
    copy = { rate: nnSim.filter((d) => d < CREF.thr).length / nnSim.length, base: realHere.filter(([, d]) => d < CREF.thr).length / Math.max(1, realHere.length), thr: CREF.thr,
      far: nnSim.filter((d) => d > CREF.hi).length / nnSim.length, farBase: realHere.filter(([, d]) => d > CREF.hi).length / Math.max(1, realHere.length),
      medSim: nnSim.slice().sort((p, q) => p - q)[Math.floor(nnSim.length / 2)], medReal: realHere.map(([, d]) => d).sort((p, q) => p - q)[Math.floor(realHere.length / 2)], who: Object.entries(who).sort((p, q) => q[1] - p[1]).slice(0, 3) };
  }
  out[arch] = { score: sc / n, plaus, copy: copy.rate, far: copy.far, sweet: 1 - copy.rate - copy.far, nSim: sim.length, nReal: real.length, rows };
  lines.push(`\n==== ${arch}: realism ${(100 * sc / n).toFixed(0)}% | sweet spot ${(100 * (1 - copy.rate - copy.far)).toFixed(0)}% (real ${(100 * (1 - copy.base - copy.farBase)).toFixed(0)}%) | copies ${(100 * copy.rate).toFixed(0)}% (real ${(100 * copy.base).toFixed(0)}%) | unprecedented ${(100 * copy.far).toFixed(0)}% (real ${(100 * copy.farBase).toFixed(0)}%) | inside every real range ${(100 * plaus).toFixed(0)}% | ${sim.length} sim vs ${real.length} real careers`);
  lines.push(`  copy check: nearest real career typically ${copy.medSim.toFixed(2)} away (real ${arch}s to their nearest other real career: ${copy.medReal.toFixed(2)}); copy line ${copy.thr.toFixed(2)}, unprecedented beyond ${CREF.hi.toFixed(2)}` + (copy.who.length ? '; closest copies of ' + copy.who.map(([p, c]) => p + ' x' + c).join(', ') : ''));
  lines.push('  ' + 'feature'.padEnd(26) + 'real'.padStart(9) + 'sim'.padStart(9) + 'match'.padStart(8));
  if (fails.length) lines.push('  outside the real range most often: ' + fails.slice(0, 4).map(([k, c]) => k + ' ' + Math.round(100 * c / sim.length) + '% (real ' + rng[k].map((v) => +v.toFixed(1)).join('-') + ')').join(', '));
  rows.forEach((r) => lines.push('  ' + r.label.padEnd(26) + r.real.toFixed(1).padStart(9) + r.sim.toFixed(1).padStart(9) + ((100 * r.score).toFixed(0) + '%').padStart(8)));
});
console.log(lines.join('\n'));
const all = Object.values(out), cps = all.filter((x) => x.copy != null);
console.log('\nOVERALL realism', (100 * mean(all.map((x) => x.score))).toFixed(0) + '%', '| sweet spot', (100 * mean(all.map((x) => x.sweet))).toFixed(0) + '% (real 90%)', '| copies', (100 * mean(cps.map((x) => x.copy))).toFixed(0) + '% (real 5%)', '| unprecedented', (100 * mean(all.map((x) => x.far))).toFixed(0) + '% (real 5%)', '| inside every real range', (100 * mean(all.map((x) => x.plaus))).toFixed(0) + '%');
console.log('(* career totals use finished real careers: retired by 2024, or debuted by 2008)');
if (process.env.JSON) require('fs').writeFileSync(process.env.JSON, JSON.stringify(out));
