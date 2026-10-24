// Compare the sim against real NBA targets (data/real-targets.json, from scripts/real-targets.py).
// Usage: node scripts/real-compare.js [seasons=60] [seeds=3]
require('../src/data.js'); require('../src/engine.js'); require('../src/league.js');
const N = require('../src/game.js');
const real = require('../data/real-targets.json');
const SEASONS = +process.argv[2] || 60, SEEDS = +process.argv[3] || 3;
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const sd = (a) => { const m = avg(a); return Math.sqrt(avg(a.map((x) => (x - m) ** 2))); };
const f = (x, d = 1) => (x == null || Number.isNaN(x) ? '  n/a' : (+x).toFixed(d));
const corr = (x, y) => { const mx = avg(x), my = avg(y); let a = 0, b = 0, c = 0; x.forEach((v, i) => { a += (v - mx) * (y[i] - my); b += (v - mx) ** 2; c += (y[i] - my) ** 2; }); return a / Math.sqrt(b * c); };

const yoy = { all: [], mid: [], star: [], starPersist: [], starDelta: [] };
const supply = { any: [], three: [], five: [] };
const rankP = {}, rankG = {}, nQual = [];
const RANKS = [1, 3, 5, 10, 15, 24, 35, 50, 75, 100, 125, 150];
const acc = { n30: [], n28: [], n25: [], n20: [], top: [], top5: [], perf1: [], perf5: [], perf10: [], perf24: [], perf50: [], perf100: [], r24: [], star: { min: [], usg: [], ts: [], gp: [] },
  ageP: {}, ageD: {}, ageDstar: {}, cohort: {}, mvp: { age: [], w: [], ppg: [], p25: [], perf: [], usg: [], distinct: [], max: [] }, a1: { ppg: [], perf: [] },
  wins: { sd: [], s60: [], s55: [], u25: [], u20: [], yoy: [], absch: [], bad: [], bad20: [], bad50: [] }, rook: {}, top3: { y1: [], y2: [] }, top5scorers: [] };
const push = (o, k, v) => (o[k] = o[k] || []).push(v);

for (let seed = 1; seed <= SEEDS; seed++) {
  N.setSeed(1000 + seed);
  const L = N.newLeague(2025);
  for (let i = 0; i < 6; i++) N.runYear(L);
  const hist = []; const prevSeason = {}; const mvpCount = {}; const standings = [];
  const everQual25 = new Set(); const rows = []; const classOf = {}; const asCount = {};
  for (let y = 0; y < SEASONS; y++) {
    const res = N.simSeason(L, null); // read everything BEFORE the offseason advances ages and rookie flags
    const ent = res.entries;
    const q = ent.filter((e) => e.l.gp >= 58);
    const by = (k) => q.map((e) => e.l[k]).sort((a, b) => b - a);
    const pts = by('pts'), perf = by('perf');
    nQual.push(q.length); { const pp = q.map((e) => e.l.perf).sort((a, b) => b - a), gg = q.map((e) => e.l.pts).sort((a, b) => b - a); RANKS.forEach((r) => { if (pp.length >= r) { (rankP[r] = rankP[r] || []).push(pp[r - 1]); (rankG[r] = rankG[r] || []).push(gg[r - 1]); } }); }
    acc.n30.push(q.filter((e) => e.l.pts >= 30).length); acc.n28.push(q.filter((e) => e.l.pts >= 28).length);
    acc.n25.push(q.filter((e) => e.l.pts >= 25).length); acc.n20.push(q.filter((e) => e.l.pts >= 20).length);
    acc.top.push(pts[0]); acc.top5.push(avg(pts.slice(0, 5)));
    acc.perf1.push(perf[0]); acc.perf5.push(avg(perf.slice(0, 5))); acc.perf10.push(avg(perf.slice(0, 10))); acc.perf24.push(avg(perf.slice(0, 24)));
    acc.perf50.push(avg(perf.slice(0, 50))); acc.perf100.push(avg(perf.slice(0, 100))); acc.r24.push(perf[23]);
    q.filter((e) => e.l.perf >= 40).forEach((e) => { acc.star.min.push(e.l.mins); acc.star.usg.push(e.l.usg * 100); acc.star.ts.push(e.l.ts); });
    ent.filter((e) => e.l.perf >= 40 && e.l.mins >= 25).forEach((e) => acc.star.gp.push(e.l.gp / 82));
    // aging
    ent.filter((e) => e.l.gp >= 50 && e.l.mins >= 20 && !e.isUser).forEach((e) => {
      push(acc.ageP, e.p.age, e.l.perf);
      const prev = prevSeason[e.id];
      if (prev && prev.season === y - 1) { yoy.all.push(e.l.perf - prev.perf); if (prev.age >= 24 && prev.age <= 30) yoy.mid.push(e.l.perf - prev.perf); if (prev.perf >= 38) yoy.star.push(e.l.perf - prev.perf); if (prev.perf >= 38 && prev.age >= 26 && prev.age <= 31) { yoy.starDelta.push(e.l.perf - prev.perf); yoy.starPersist.push(e.l.perf >= 38 ? 1 : 0); } push(acc.ageD, prev.age, e.l.perf - prev.perf); if (prev.perf >= 38) push(acc.ageDstar, prev.age, e.l.perf - prev.perf); }
      prevSeason[e.id] = { season: y, age: e.p.age, perf: e.l.perf };
    });
    ent.filter((e) => e.l.gp >= 40).forEach((e) => rows.push({ id: e.id, age: e.p.age, pts: e.l.pts, gp: e.l.gp }));
    q.filter((e) => e.l.pts >= 25).forEach((e) => everQual25.add(e.id));
    ent.forEach((e) => { if (e.p.rookie && e.id !== 'user' && classOf[e.id] == null) classOf[e.id] = y; });
    res.awards.allStar.forEach((id) => { asCount[id] = (asCount[id] || 0) + 1; });
    // awards
    if (y < 46) {
      const m = res.awards.mvp; const me = ent.find((e) => e.id === m.id);
      if (me) { acc.mvp.age.push(me.p.age); acc.mvp.w.push(me.l.wins); acc.mvp.ppg.push(me.l.pts); acc.mvp.p25.push(me.l.pts >= 25 ? 1 : 0); acc.mvp.perf.push(me.l.perf); acc.mvp.usg.push(me.l.usg * 100); }
      mvpCount[m.id] = (mvpCount[m.id] || 0) + 1;
    }
    res.awards.allNBATeams[0].forEach((id) => { const e = ent.find((x) => x.id === id); if (e) { acc.a1.ppg.push(e.l.pts); acc.a1.perf.push(e.l.perf); } });
    const t5 = q.slice().sort((a, b) => b.l.pts - a.l.pts).slice(0, 5).map((e) => e.id);
    acc.top5scorers.push(t5.filter((id) => res.awards.allNBA.includes(id)).length / 5);
    // wins
    const w = res.standings.map((s) => s.wins);
    standings.push(res.standings.map((s) => ({ id: s.id, w: s.wins })));
    acc.wins.sd.push(sd(w)); acc.wins.s60.push(w.filter((x) => x >= 60).length / 30); acc.wins.s55.push(w.filter((x) => x >= 55).length / 30);
    acc.wins.u25.push(w.filter((x) => x < 25).length / 30); acc.wins.u20.push(w.filter((x) => x < 20).length / 30);
    // rookies
    ent.filter((e) => e.p.rookie && e.p.draftSlot && e.l.gp >= 40).forEach((e) => {
      const s = e.p.draftSlot; const b = s === 1 ? '1' : s <= 3 ? '2-3' : s <= 5 ? '4-5' : s <= 10 ? '6-10' : s <= 14 ? '11-14' : s <= 30 ? '15-30' : '31-60';
      push(acc.rook, b, { ppg: e.l.pts, mpg: e.l.mins });
      if (s <= 3) hist.push({ y, team: e.t.id });
    });
    N.offseason(L, { draft: true });
  }
  // wins persistence and star-effect measures
  for (let i = 1; i < standings.length; i++) {
    const a = standings[i - 1].map((s) => s.w), b = standings[i].map((s) => s.w);
    acc.wins.yoy.push(corr(a, b)); acc.wins.absch.push(avg(a.map((x, j) => Math.abs(b[j] - x))));
    standings[i].forEach((s, j) => { if (a[j] <= 28) { acc.wins.bad.push(s.w - a[j]); acc.wins.bad20.push(s.w - a[j] >= 20 ? 1 : 0); acc.wins.bad50.push(s.w >= 50 ? 1 : 0); } });
  }
  hist.forEach((h) => {
    if (h.y >= 1 && h.y + 1 < standings.length) {
      const g = (yy) => standings[yy].find((s) => s.id === h.team).w;
      acc.top3.y1.push(g(h.y) - g(h.y - 1)); acc.top3.y2.push(g(h.y + 1) - g(h.y - 1));
    }
  });
  { const per = {}; Object.keys(classOf).forEach((id) => { const c = classOf[id]; if (c > SEASONS - 20) return; per[c] = per[c] || { any: 0, three: 0, five: 0 }; const n = asCount[id] || 0; if (n >= 1) per[c].any++; if (n >= 3) per[c].three++; if (n >= 5) per[c].five++; });
    Object.values(per).forEach((v) => { supply.any.push(v.any); supply.three.push(v.three); supply.five.push(v.five); }); }
  acc.mvp.distinct.push(Object.keys(mvpCount).length); acc.mvp.max.push(Math.max(...Object.values(mvpCount)));
  const co = {}; rows.filter((r) => everQual25.has(r.id)).forEach((r) => push(co, r.age, r.pts));
  Object.keys(co).forEach((a) => push(acc.cohort, a, avg(co[a])));
}

// ---------------------------------------------------------------- draft classes -> careers
function classOutcomes(nClasses, CUT) {
  const L = N.newLeague(2025);
  const bins = [[1, 1], [2, 3], [4, 5], [6, 10], [11, 14], [15, 20], [21, 30], [31, 45], [46, 60]];
  const acc2 = {}; bins.forEach(([a, b]) => (acc2[a + '-' + b] = { n: 0, any: 0, asg3: 0, seasons: 0, gp: 0 }));
  let supply = { any: 0, three: 0, five: 0 };
  for (let c = 0; c < nClasses; c++) {
    const cls = N.draftClass(L, 72).sort((a, b) => b.stock - a.stock);
    cls.slice(0, 60).forEach((p, i) => {
      const slot = i + 1; let star = 0, seasons = 0, a1 = 0;
      for (let idx = 0; idx < 22; idx++) {
        const av = N.rollAvail(p); if (av.major) N.applyMajorInjury(p);
        const e = N.expLine(p, { pace: 99, rookie: idx === 0, minsFloor: idx === 0 ? N.rookieFloor(slot) : 0, coTax: 0.005 });
        if (idx >= 2 && N.ovr(p) < 58) break;
        if (idx >= 4 && N.ovr(p) < 62 && slot > 20) break;
        seasons++;
        // same season-to-season production noise the league sim applies, so stars have off years
        const sh = 1 + N.tuning.formSd * N.randn(), ind = () => 1 + 0.035 * N.randn();
        const perf = N.perfOf({ pts: e.pts * sh * ind(), reb: e.reb * sh * ind(), ast: e.ast * sh * ind(), stl: e.stl * sh * ind(), blk: e.blk * sh * ind(), tov: e.tov, ts: e.ts });
        if (av.gp >= 58 && perf >= CUT) star++;
        if (av.gp >= 58 && perf >= 45) a1++;
        N.progress(p); if (N.retireP(p)) break;
      }
      const b = bins.find(([lo, hi]) => slot >= lo && slot <= hi); const k = b[0] + '-' + b[1];
      acc2[k].n++; acc2[k].any += star >= 1 ? 1 : 0; acc2[k].asg3 += star >= 3 ? 1 : 0; acc2[k].seasons += seasons;
      supply.any += star >= 1 ? 1 : 0; supply.three += star >= 3 ? 1 : 0; supply.five += star >= 5 ? 1 : 0;
    });
  }
  return { bins: acc2, supply: { any: supply.any / nClasses, three: supply.three / nClasses, five: supply.five / nClasses } };
}
N.setSeed(777);
const draftSim = classOutcomes(60, avg(acc.r24)); // the sim's own 24th-best perf, so 'All-Star' means the same thing in both

// ---------------------------------------------------------------- report
const R = real.scoring_recent_mean;
const line = (name, r, s, tol) => console.log(name.padEnd(46), f(r, 2).padStart(8), f(s, 2).padStart(8), (Math.abs(s - r) / Math.abs(r) > (tol || 0.12) ? '  <-- off' : ''));
console.log('REAL (Basketball-Reference through ' + real.through_season + ') vs SIM (' + SEEDS + ' seeds x ' + SEASONS + ' seasons)');
console.log(''.padEnd(46), '    real', '     sim');
console.log('\n-- scoring and production (2016-26, gp>=58)');
line('players >= 30 ppg / season', R.n30, avg(acc.n30), 0.25); line('players >= 28 ppg', R.n28, avg(acc.n28), 0.2); line('players >= 25 ppg', R.n25, avg(acc.n25)); line('players >= 20 ppg', R.n20, avg(acc.n20), 0.2);
line('top scorer ppg', R.top, avg(acc.top), 0.05); line('mean of top-5 scorers', R.top5, avg(acc.top5), 0.05);
line('perf rank 1', R.perf1, avg(acc.perf1), 0.08); line('perf mean top 5', R.perf5, avg(acc.perf5), 0.08); line('perf mean top 10', R.perf10, avg(acc.perf10), 0.08);
line('perf mean top 24 (All-Star tier)', R.perf24, avg(acc.perf24), 0.08); line('perf mean top 50', R.perf50, avg(acc.perf50), 0.08);
line('perf of 24th best (All-Star cutoff)', R.perf_r24, avg(acc.r24), 0.08);
line('star (perf>=40) minutes', real.star_minutes.mean, avg(acc.star.min), 0.05); line('star usage %', real.star_minutes.usg_mean, avg(acc.star.usg), 0.07); line('star TS%', real.star_minutes.ts_mean, avg(acc.star.ts), 0.03);
line('star games played share (g/82)', avg(Object.values(real.star_gp_pct_by_age)), avg(acc.star.gp), 0.07);
console.log('\n-- depth: production and scoring by league rank (the sim now models full rotations)');
line('qualified players per season (gp>=58)', real.qualified_per_season, avg(nQual), 0.12);
RANKS.forEach((r) => console.log(('perf / ppg at rank ' + r).padEnd(46), (f(real.perf_by_rank[r]) + ' / ' + f(real.ppg_by_rank[r])).padStart(14), (f(avg(rankP[r] || [])) + ' / ' + f(avg(rankG[r] || []))).padStart(14)));
console.log('\n-- aging: mean year-over-year change in perf (qualified players)');
console.log('age'.padEnd(6), 'real_all'.padStart(9), 'sim_all'.padStart(9), '   real_star'.padStart(11), 'sim_star'.padStart(9), '   mean perf real / sim');
for (let a = 19; a <= 37; a++) {
  console.log(String(a).padEnd(6), f(real.age_delta_perf[a]).padStart(9), f(avg(acc.ageD[a] || [])).padStart(9), f(real.star_age_delta_perf[a]).padStart(11), f(avg(acc.ageDstar[a] || [])).padStart(9), '   ', f(real.age_mean_perf[a]), '/', f(avg(acc.ageP[a] || [])), ' n=' + (real.age_delta_perf_n[a] || 0) + '/' + (acc.ageD[a] || []).length);
}
line('year-to-year sd of perf change (all)', real.yoy_perf_sd.all, sd(yoy.all), 0.15); line('  ... ages 24-30', real.yoy_perf_sd.age_24_30, sd(yoy.mid), 0.15); line('  ... stars (perf>=38)', real.yoy_perf_sd.stars_perf38, sd(yoy.star), 0.15);
line('star mean change, ages 26-31', real.yoy_perf_sd.stars_mean_change_26_31, avg(yoy.starDelta), 0.3); line('P(star stays star | qualifies next yr, 26-31)', real.star_persistence.stay_star_next_year_26_31 / (1 - real.star_persistence.missing_or_qual_fail), avg(yoy.starPersist), 0.15);
console.log('\n-- scorer cohort: mean ppg by age for players who ever scored 25+ (real vs sim)');
console.log([20, 22, 24, 26, 28, 30, 32, 34, 36, 38].map((a) => a + ': ' + f((real.ppg_by_age_of_25ppg_scorers[a] || [NaN])[0]) + '/' + f(avg(acc.cohort[a] || []))).join('   '));
console.log('\n-- awards (since 2000 / first 46 sim seasons)');
const M = real.mvp_summary_since_2000;
line('MVP age', M.age_mean, avg(acc.mvp.age), 0.05); line('MVP team wins (median real, mean sim)', M.w82_median, avg(acc.mvp.w), 0.08); line('MVP ppg', M.ppg_mean, avg(acc.mvp.ppg), 0.07);
line('MVP share scoring 25+', M.share_ppg_25plus, avg(acc.mvp.p25), 0.15); line('MVP perf', M.perf_mean, avg(acc.mvp.perf), 0.08); line('MVP usage %', M.usg_mean, avg(acc.mvp.usg), 0.08);
const mc = Object.values(real.mvp_counts_since_1980);
line('distinct MVP winners in 46 seasons', mc.length, avg(acc.mvp.distinct), 0.2); line('most MVPs by one player in 46 seasons', Math.max(...mc), avg(acc.mvp.max), 0.3);
line('All-NBA 1st: ppg', real.all_nba_first_since_2005.ppg_mean, avg(acc.a1.ppg), 0.07); line('All-NBA 1st: perf', real.all_nba_first_since_2005.perf_mean, avg(acc.a1.perf), 0.07);
line('top-5 scorers who make All-NBA', real.top5_scorers_make_all_nba, avg(acc.top5scorers), 0.1);
console.log('\n-- team wins');
const T = real.team_wins;
line('sd of wins', T.sd_by_season_mean, avg(acc.wins.sd), 0.1); line('share of teams 60+ wins', T.share_60plus, avg(acc.wins.s60), 0.3); line('share 55+', T.share_55plus, avg(acc.wins.s55), 0.2);
line('share under 25', T.share_under_25, avg(acc.wins.u25), 0.2); line('share under 20', T.share_under_20, avg(acc.wins.u20), 0.3);
line('year-to-year win correlation', T.year_to_year_corr, avg(acc.wins.yoy), 0.1); line('mean abs change in wins', T.mean_abs_change, avg(acc.wins.absch), 0.1);
line('bad team (<=28) next-year change', real.bad_team_next_year.mean_change, avg(acc.wins.bad), 0.25); line('bad team gains 20+', real.bad_team_next_year.share_gain_20plus, avg(acc.wins.bad20), 0.3);
line('top-3 pick team wins, year 1', real.top3_pick_team_effect.year1_mean_change, avg(acc.top3.y1), 0.25); line('top-3 pick team wins, year 2', real.top3_pick_team_effect.year2_mean_change, avg(acc.top3.y2), 0.25);
console.log('\n-- rookies by draft slot: ppg / mpg   (real | sim)');
Object.keys(real.rookies_by_pick_2011_2025).forEach((k) => { const r = real.rookies_by_pick_2011_2025[k], s = acc.rook[k] || []; console.log(k.padEnd(8), (f(r.ppg) + ' / ' + f(r.mpg)).padStart(14), ' | ', (f(avg(s.map((x) => x.ppg))) + ' / ' + f(avg(s.map((x) => x.mpg)))).padStart(14), ' n=' + s.length); });
console.log('\n-- draft slot -> career (real 1990-2015 vs sim classes): P(>=1 All-Star season)  |  P(3+)  |  mean seasons');
Object.keys(real.draft_outcomes_1990_2015).forEach((k) => { const r = real.draft_outcomes_1990_2015[k], s = draftSim.bins[k]; console.log(k.padEnd(7), (f(100 * r.any_asg, 0) + '%').padStart(6), (f(100 * s.any / s.n, 0) + '%').padStart(6), '  |', (f(100 * r.asg3, 0) + '%').padStart(5), (f(100 * s.asg3 / s.n, 0) + '%').padStart(5), '  |', f(r.mean_seasons).padStart(5), f(s.seasons / s.n).padStart(5)); });
const S = real.per_class_star_supply;
console.log('per class: All-Stars (real/sim)', f(S.any_all_star), '/', f(draftSim.supply.any), '  3+ All-Star', f(S.three_plus_all_star), '/', f(draftSim.supply.three), '  5+ seasons', f(S.five_plus_all_nba, 2), '/', f(draftSim.supply.five, 2));

console.log('league-sim classes with real competition for 24 All-Star slots: any', f(avg(supply.any)), ' 3+', f(avg(supply.three)), ' 5+', f(avg(supply.five), 2), '   (real 5.35 / 2.73 / 1.27)');
