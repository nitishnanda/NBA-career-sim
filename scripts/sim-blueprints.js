// Sim careers by archetype next to the real career blueprints (data/real-blueprints.json, built by scripts/real-blueprints.py).
// Usage: node scripts/sim-blueprints.js [careers per archetype]    ARCH=scorer to run one
require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = require('../src/game.js'); const G = N.Game;
const real = require('../data/real-blueprints.json'); if (process.env.TUNE) Object.assign(NBA.tuning, JSON.parse(process.env.TUNE));
const PER = +process.argv[2] || 120; const ONLY = process.env.ARCH;
const perfOf = (s) => s.pts * (1 + 2.2 * ((s.ts || 0.57) - 0.57)) + 1.15 * s.reb + 1.5 * s.ast + 2 * (s.stl + s.blk) - 1.1 * (s.tov || 0);
const pct = (a, p) => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(b.length * p))] : NaN; };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const f = (x, d) => (Number.isFinite(x) ? x.toFixed(d == null ? 1 : d) : '–');
const ARCHS = ONLY ? [ONLY] : ['generational', 'scorer', 'dominator', 'shooter', 'twoway', 'defender'];
// sim careers (any chosen archetype, random recruit stars) are classified by the SAME rules as the real cohorts, from their five best seasons
const pool = {}; const awN = (ps, k) => ps.filter((s) => s.awards.includes(k)).length;
const classify = (ps, aw) => { const q = ps.filter((s) => s.gp >= 0.55 * 82); if (q.length < 5) return null; const t5 = q.slice().sort((a, b) => b.perf - a.perf).slice(0, 5); const m = (k) => mean(t5.map((s) => s[k] || 0));
  const as = aw['All-Star'] || 0, an = aw['All-NBA'] || 0, ad = aw['All-Defense'] || 0; const pts = m('pts'), reb = m('reb'), ast = m('ast'), stl = m('stl'), blk = m('blk');
  if ((aw.MVP || 0) >= 2 || (aw['All-NBA 1st Team'] || 0) >= 5) return 'generational'; if (as < 1 && an < 1 && ad < 1 && m('perf') < 27) return null;
  if ((ast >= 5.0 && reb >= 6.0) || ps.reduce((t, s) => t + (s.td || 0), 0) >= 30) return 'dominator'; if (pts >= 20) return 'scorer'; if ((stl >= 1.4 || blk >= 1.2) && pts >= 15 && ad >= 1) return 'twoway'; if (pts < 15 && (blk >= 1.3 || reb >= 8.5 || ad >= 2)) return 'defender'; return null; };
['generational', 'scorer', 'dominator', 'shooter', 'twoway', 'defender'].forEach((arch, ai) => { for (let i = 0; i < PER; i++) {
  const st = G.newCareer({ name: 'x', pos: ['PG', 'SG', 'SF', 'PF', 'C'][i % 5], arch, home: 'Ohio', seed: 61000 + i * 7 + ai, stars: arch === 'generational' ? 5 : undefined });
  G.auto(st); const ps = st.proSeasons.map((s) => Object.assign({ perf: perfOf(s) }, s)); const c = classify(ps, st.career.awards); if (c) (pool[c] = pool[c] || []).push({ ps, aw: st.career.awards, asn: awN(ps, 'All-Star') }); } });
ARCHS.forEach((arch) => {
  const cohort = pool[arch] || [];
  const R = real[arch]; console.log('\n==== ' + arch + ': ' + cohort.length + ' sim careers (' + (arch === 'generational' ? 'all' : '2+ All-Star seasons') + ') vs ' + (R ? R.n + ' real' : 'no real cohort'));
  if (!cohort.length) return;
  const pa = [], pw = [], cl = [], d = [], zz = [], pk = { pts: [], reb: [], ast: [], perf: [], usg: [] }; let zzN = 0; const rk = { 1: 0, 3: 0, 10: 0, 24: 0 };
  const ageAgg = {};
  cohort.forEach(({ ps }) => {
    const q = ps.filter((s) => s.gp >= 0.55 * 82); if (q.length < 5) return;
    const best = q.reduce((b, s) => (s.perf > b.perf ? s : b), q[0]); pa.push(best.age); pw.push(q.filter((s) => s.perf >= 0.92 * best.perf).length); cl.push(ps.filter((s) => s.gp >= 20).length);
    const t5 = q.slice().sort((a, b) => b.perf - a.perf).slice(0, 5); pk.pts.push(mean(t5.map((s) => s.pts))); pk.reb.push(mean(t5.map((s) => s.reb))); pk.ast.push(mean(t5.map((s) => s.ast))); pk.perf.push(mean(t5.map((s) => s.perf))); pk.usg.push(mean(t5.map((s) => 100 * s.usg)));
    const prime = q.filter((s) => s.age >= best.age - 3 && s.age <= best.age + 3).sort((a, b) => a.age - b.age);
    for (let i = 1; i < prime.length; i++) if (prime[i].age - prime[i - 1].age === 1) d.push(prime[i].pts - prime[i - 1].pts);
    let z = 0; for (let i = 2; i < prime.length; i++) { const a1 = prime[i - 1].pts - prime[i - 2].pts, b1 = prime[i].pts - prime[i - 1].pts; if (Math.abs(a1) >= 3 && Math.abs(b1) >= 3 && a1 * b1 < 0) z++; } zz.push(z);
    ps.forEach((s) => { if (s.gp >= 58) [1, 3, 10, 24].forEach((k) => { if (s.perfRank <= k) rk[k]++; }); const a = ageAgg[s.age] = ageAgg[s.age] || { pts: [], rel: [], gf: [], mpg: [] }; a.pts.push(s.pts); a.rel.push(s.perf / best.perf); a.gf.push(s.gp / 82); a.mpg.push(s.mins); });
  });
  const n = cohort.length, awn = (k) => mean(cohort.map((c) => c.aw[k] || 0));
  const row = (label, a, b) => console.log('  ' + label.padEnd(34) + String(a).padStart(16) + String(b).padStart(16));
  console.log('  ' + ''.padEnd(34) + 'real'.padStart(16) + 'sim'.padStart(16));
  row('peak age (p25/med/p75)', R ? [R.peak_age.p25, R.peak_age.med, R.peak_age.p75].map((x) => f(x, 0)).join('/') : '', [pct(pa, 0.25), pct(pa, 0.5), pct(pa, 0.75)].map((x) => f(x, 0)).join('/'));
  row('peak width (seasons >=92% of best)', R ? f(R.peak_width92.mean) : '', f(mean(pw)));
  row('career length (seasons, mean)', R ? f(R.career_len.mean) : '', f(mean(cl)));
  row('peak-5 ppg / reb / ast', R ? ['pts', 'reb', 'ast'].map((k) => f(R.peak5[k].mean)).join(' / ') : '', [mean(pk.pts), mean(pk.reb), mean(pk.ast)].map((x) => f(x)).join(' / '));
  row('peak-5 perf / usage', R ? f(R.peak5.perf.mean) + ' / ' + f(R.peak5.usg.mean) : '', f(mean(pk.perf)) + ' / ' + f(mean(pk.usg)));
  row('prime ppg change: mean|d| / >=4', R ? f(R.prime_dppg.mean_abs, 2) + ' / ' + f(100 * R.prime_dppg.share_ge4, 0) + '%' : '', f(mean(d.map(Math.abs)), 2) + ' / ' + f(100 * d.filter((x) => Math.abs(x) >= 4).length / Math.max(1, d.length), 0) + '%');
  row('zig-zags per career', R ? f(R.dominance.zigzag_per_career, 2) : '', f(mean(zz), 2));
  row('seasons #1 / top3 / top10 / top24', R ? [1, 3, 10, 24].map((k) => f(R.dominance['seasons_rank_le_' + k], 1)).join(' / ') : '', [1, 3, 10, 24].map((k) => f(rk[k] / n, 1)).join(' / '));
  row('MVP / All-NBA 1st / All-NBA', R ? [R.per_career.mvp, R.per_career.allnba1, R.per_career.allnba].map((x) => f(x, 1)).join(' / ') : '', [awn('MVP'), awn('All-NBA 1st Team'), awn('All-NBA')].map((x) => f(x, 1)).join(' / '));
  row('All-Star / All-Defense / DPOY', R ? [R.per_career.allstar, R.per_career.alldef, R.per_career.dpoy].map((x) => f(x, 1)).join(' / ') : '', [awn('All-Star'), awn('All-Defense'), awn('DPOY')].map((x) => f(x, 1)).join(' / '));
  const ages = [20, 22, 24, 26, 28, 30, 32, 34, 36, 38];
  console.log('  age   ppg (real/sim)   rel-perf (real/sim)   games% (real/sim)   mpg sim');
  ages.forEach((a) => { const rc = R && R.curve[a], sc = ageAgg[a]; if (!sc || sc.pts.length < 5) return; console.log('  ' + String(a).padEnd(6) + (rc ? f(rc.pts) : '–').padStart(6) + ' /' + f(pct(sc.pts, 0.5)).padStart(5) + '        ' + (rc ? f(rc.rel, 2) : '–').padStart(5) + ' /' + f(pct(sc.rel, 0.5), 2).padStart(5) + '           ' + (rc ? f(100 * rc.gf, 0) : '–').padStart(4) + ' /' + f(100 * pct(sc.gf, 0.5), 0).padStart(4) + '          ' + f(pct(sc.mpg, 0.5))); });
});
