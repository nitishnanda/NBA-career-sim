// Realism bench: scores the sim against real NBA benchmarks in data/nba-targets.json (scripts/extract-nba-targets.py).
// The Overall Realism Score comes from NPC league output only; user auto-play careers are printed separately as a sanity check,
// so user-only perks do not distort league calibration.
// Usage: node scripts/realism-bench.mjs [--fast | --multi] [--seeds 2001,2002,...] [--quiet]
//   --fast   one seed (SEED, default 4242) x 20 seasons + 250 user careers
//   --multi  5 seeds x 20 seasons, one process per seed in parallel, league only (pooled before scoring)
//   env: TUNE='{"knob":1}'  NOUSER=1 (skip user careers)  JSON=out.json (scores + metrics)
import { createRequire } from 'module';
import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
const require = createRequire(import.meta.url);
const SELF = new URL(import.meta.url).pathname, argv = process.argv.slice(2), arg = (k) => { const i = argv.indexOf(k); return i < 0 ? null : argv[i + 1]; };
const TG = JSON.parse(fs.readFileSync(new URL('../data/nba-targets.json', import.meta.url)));
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN), median = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const SEASONS = +(arg('--seasons') || 20);

function loadSim() {
  require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const G = require('../src/game.js').Game;
  if (process.env.TUNE) Object.assign(globalThis.NBA.tuning, JSON.parse(process.env.TUNE));
  return { NBA: globalThis.NBA, G };
}

// ---------------------------------------------------------------- one seed of the NPC league -> raw pooled data
function leagueRaw(seed) {
  const { NBA } = loadSim();
  NBA.setSeed(seed);
  const L = NBA.newLeague(2027, { real: true });
  const R = { teamPts: [], teamMins: [], fg: [0, 0], tp: [0, 0], ft: [0, 0], rotFg: [], rotTp: [], rotFt: [], s25: [], s30: [], ptsL: [], rebL: [], astL: [], mvp: [], champs: [], car: [] };
  const hist = {}, drafted = {}, asg = {};
  for (let y = 0; y < SEASONS; y++) {
    const r = NBA.simSeason(L, null), E = r.entries.filter((e) => !e.isUser && e.l.gp > 0), tm = {};
    E.forEach((e) => {
      const l = e.l, t = (tm[e.t.id] = tm[e.t.id] || [0, 0]); t[0] += l.pts * l.gp; t[1] += l.mins * l.gp;
      const sv = NBA.rngGet(), s = NBA.shootingLine(e.p, l.pts, l.ts || 0.57, l.usg || 0.2); NBA.rngSet(sv);   // splits off the line, without touching the sim's random stream
      R.fg[0] += s.fgm * l.gp; R.fg[1] += s.fga * l.gp; R.tp[0] += s.tpm * l.gp; R.tp[1] += s.tpa * l.gp; R.ft[0] += s.ftm * l.gp; R.ft[1] += s.fta * l.gp;
      if (l.gp >= 40 && l.mins >= 20) { R.rotFg.push(s.fgp); if (s.tpa >= 1) R.rotTp.push(s.tpp); if (s.fta >= 1) R.rotFt.push(s.ftp); }
      (hist[e.p.id] = hist[e.p.id] || []).push({ age: e.p.age, pts: l.pts, gp: l.gp });
    });
    Object.values(tm).forEach(([p, m]) => { R.teamPts.push(p / 82); R.teamMins.push(m / 82); });
    const q = E.filter((e) => e.l.gp >= 50);
    R.s25.push(q.filter((e) => e.l.pts >= 25).length); R.s30.push(q.filter((e) => e.l.pts >= 30).length);
    R.ptsL.push(Math.max(...q.map((e) => e.l.pts))); R.rebL.push(Math.max(...q.map((e) => e.l.reb))); R.astL.push(Math.max(...q.map((e) => e.l.ast)));
    if (r.awards.mvp) R.mvp.push(r.awards.mvp.pts); R.champs.push(r.playoffs.champion.name);
    (r.awards.allStar || []).forEach((id) => (asg[id] = (asg[id] || 0) + 1));
    NBA.offseason(L, { draft: true });
    Object.values(L.players).forEach((p) => { if (p.rookie && p.draftSlot && !drafted[p.id]) drafted[p.id] = { slot: p.draftSlot, cls: y }; });
  }
  // careers: draft classes early enough to run 15+ seasons (players still active at the end count with the seasons they have)
  R.classes = SEASONS - 14;
  Object.entries(drafted).filter(([, d]) => d.cls < R.classes).forEach(([id, d]) => {
    const h = hist[id] || [], h40 = h.filter((s) => s.gp >= 40);
    R.car.push({ slot: d.slot, yrs: h.length, as: asg[id] || 0, peak: h40.length >= 8 ? h40.reduce((b, s) => (s.pts > b.pts ? s : b)).age : null });
  });
  return R;
}

// ---------------------------------------------------------------- pooled raw data -> sim metrics -> scores
function score(raws) {
  const cat = (k) => [].concat(...raws.map((r) => r[k])), add = (k) => raws.reduce((a, r) => [a[0] + r[k][0], a[1] + r[k][1]], [0, 0]);
  const fg = add('fg'), tp = add('tp'), ft = add('ft'), car = cat('car'), classes = raws.reduce((a, r) => a + r.classes, 0);
  const tierOf = (s) => (s <= 14 ? 'lottery' : s <= 30 ? 'late_first' : 'second_round'), tierN = { lottery: 14, late_first: 16, second_round: 30 }, tiers = {};
  Object.keys(tierN).forEach((k) => { const c = car.filter((x) => tierOf(x.slot) === k);   // picks who never made a roster never appear: they count as never played
    tiers[k] = { as: (100 * c.filter((x) => x.as > 0).length) / (tierN[k] * classes), yrs: mean(c.filter((x) => x.yrs > 0).map((x) => x.yrs)) }; });
  const played = car.filter((x) => x.yrs > 0), bk = (lo, hi) => (100 * played.filter((x) => x.yrs >= lo && x.yrs <= hi).length) / played.length;
  const par = raws.map((r) => { const cc = {}; r.champs.forEach((c) => (cc[c] = (cc[c] || 0) + 1)); return [(Object.keys(cc).length * 20) / r.champs.length, (100 * Object.values(cc).sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0)) / r.champs.length]; });
  const tPts = cat('teamPts'), tMin = cat('teamMins');
  const sim = {
    'Team PPG (raw)': mean(tPts), 'Team PPG (240-min)': mean(tPts.map((p, i) => (240 * p) / tMin[i])),
    'Team FG%': (100 * fg[0]) / fg[1], 'Team 3P%': (100 * tp[0]) / tp[1], 'Team FT%': (100 * ft[0]) / ft[1],
    'Team TS%': (100 * (2 * fg[0] + tp[0] + ft[0])) / (2 * (fg[1] + 0.44 * ft[1])), 'Team 3PA rate': (100 * tp[1]) / fg[1],
    'Rotation FG%': 100 * mean(cat('rotFg')), 'Rotation 3P%': 100 * mean(cat('rotTp')), 'Rotation FT%': 100 * mean(cat('rotFt')),
    '25+ PPG scorers/season': mean(cat('s25')), '30+ PPG scorers/season': mean(cat('s30')), 'Scoring leader PPG': mean(cat('ptsL')), 'Rebound leader RPG': mean(cat('rebL')), 'Assist leader APG': mean(cat('astL')),
    'MVP PPG': mean(cat('mvp')), 'Peak scoring age (median)': median(car.filter((x) => x.peak != null).map((x) => x.peak)),
    'Career 1-3 yrs %': bk(1, 3), 'Career 4-7 yrs %': bk(4, 7), 'Career 8-12 yrs %': bk(8, 12), 'Career 13+ yrs %': bk(13, 99), 'Avg career yrs': mean(played.map((x) => x.yrs)),
    'All-Star avg career yrs': mean(car.filter((x) => x.as > 0).map((x) => x.yrs)), '2nd-round avg career yrs': tiers.second_round.yrs,
    'All-Star rate: lottery %': tiers.lottery.as, 'All-Star rate: picks 15-30 %': tiers.late_first.as, 'All-Star rate: 2nd round %': tiers.second_round.as,
    'Unique champions / 20 yrs': mean(par.map((x) => x[0])), 'Top-3 franchise title share %': mean(par.map((x) => x[1])),
  };
  // [category, real target, tolerance (score 0 at this distance)]
  const t = TG.team, m = TG.modern, d = TG.draft, pr = TG.parity;
  const SPEC = {
    'Team PPG (raw)': ['Environment', t.ppg, 6], 'Team PPG (240-min)': ['Environment', t.ppg, 6],
    'Team FG%': ['Shooting', t.fg_pct, 3], 'Team 3P%': ['Shooting', t['3p_pct'], 3], 'Team FT%': ['Shooting', t.ft_pct, 4], 'Team TS%': ['Shooting', t.ts_pct, 2.5],
    'Team 3PA rate': ['Shooting', t['3pa_rate'], 8], 'Rotation FG%': ['Shooting', m.rotation_fg_pct, 3], 'Rotation 3P%': ['Shooting', m.rotation_3p_pct, 3], 'Rotation FT%': ['Shooting', m.rotation_ft_pct, 4],
    '25+ PPG scorers/season': ['Stars', m.scorers_25plus_per_season, 7], '30+ PPG scorers/season': ['Stars', m.scorers_30plus_per_season, 2.5], 'Scoring leader PPG': ['Stars', m.scoring_leader_ppg, 4],
    'Rebound leader RPG': ['Stars', m.rebound_leader_rpg, 3], 'Assist leader APG': ['Stars', m.assist_leader_apg, 3], 'MVP PPG': ['Stars', m.mvp_ppg, 5],
    'Peak scoring age (median)': ['Careers', m.peak_scoring_age_median, 3],
    'Career 1-3 yrs %': ['Careers', d.career_len_pct['1-3'], 15], 'Career 4-7 yrs %': ['Careers', d.career_len_pct['4-7'], 12], 'Career 8-12 yrs %': ['Careers', d.career_len_pct['8-12'], 12],
    'Career 13+ yrs %': ['Careers', d.career_len_pct['13+'], 12], 'Avg career yrs': ['Careers', d.avg_career_yrs, 3], 'All-Star avg career yrs': ['Careers', d.allstar_avg_career_yrs, 4],
    '2nd-round avg career yrs': ['Careers', d.tiers.second_round.avg_career_yrs, 3],
    'All-Star rate: lottery %': ['Draft', d.tiers.lottery.allstar_rate, 13], 'All-Star rate: picks 15-30 %': ['Draft', d.tiers.late_first.allstar_rate, 6], 'All-Star rate: 2nd round %': ['Draft', d.tiers.second_round.allstar_rate, 3],
    'Unique champions / 20 yrs': ['Parity', pr.unique_champions_20y, 5], 'Top-3 franchise title share %': ['Parity', pr.top3_share_pct, 25],
  };
  const rows = Object.keys(SPEC).map((k) => { const [c, real, tol] = SPEC[k], v = sim[k]; return { k, cat: c, real, v, sc: Number.isFinite(v) ? Math.max(0, 1 - Math.abs(v - real) / tol) : 0 }; });
  const cats = [...new Set(rows.map((r) => r.cat))], sub = Object.fromEntries(cats.map((c) => [c, 100 * mean(rows.filter((r) => r.cat === c).map((r) => r.sc))]));
  return { rows, sub, overall: mean(Object.values(sub)), sim, minutes: mean(tMin), nCar: car.length, classes };
}

// ---------------------------------------------------------------- user auto-play (sanity only, not scored)
function userCareers(n) {
  const { G } = loadSim(), ARCH = ['generational', 'scorer', 'dominator', 'shooter', 'twoway', 'defender'], POS = ['PG', 'SG', 'SF', 'PF', 'C'];
  const U = { yrs: [], p5: [], best: [], as: [], mvp: [], peak: [], ts: [] };
  for (let i = 0; i < n; i++) {
    const st = G.newCareer({ name: 'x', pos: POS[i % 5], arch: ARCH[i % 6], home: 'Ohio', seed: 9100000 + i }); G.auto(st);
    const ps = st.proSeasons.filter((s) => s.gp >= 20), aw = st.career.awards || {}; if (!ps.length) { U.yrs.push(0); continue; }
    const top = ps.slice().sort((a, b) => b.pts - a.pts);
    U.yrs.push(ps.length); U.p5.push(mean(top.slice(0, 5).map((s) => s.pts))); U.best.push(top[0].pts); U.peak.push(top[0].age); U.ts.push(100 * mean(ps.map((s) => s.ts || 0)));
    U.as.push(aw['All-Star'] || 0); U.mvp.push(aw.MVP || 0);
  }
  const pc = (a, f) => ((100 * a.filter(f).length) / a.length).toFixed(0);
  return [`User auto-play (${n} careers, all archetypes): career ${mean(U.yrs).toFixed(1)} yrs, peak age ${median(U.peak)}, TS ${mean(U.ts).toFixed(1)}%`,
    `  peak-5 PPG ${mean(U.p5).toFixed(1)}, best season ${mean(U.best).toFixed(1)} (30+ in ${pc(U.best, (x) => x >= 30)}%)`,
    `  All-Star ${pc(U.as, (x) => x > 0)}% of careers, avg ${mean(U.as).toFixed(1)} selections`,
    `  MVP ${pc(U.mvp, (x) => x > 0)}% of careers, avg ${mean(U.mvp).toFixed(2)} MVPs`];
}

// ---------------------------------------------------------------- main
const runChild = (seed) => new Promise((res, rej) => execFile(process.execPath, [SELF, '--child', String(seed), '--seasons', String(SEASONS)], { env: process.env, maxBuffer: 64 << 20 }, (e, out) => (e ? rej(e) : res(JSON.parse(out)))));
async function pool(seeds) { const out = [], par = Math.max(1, os.cpus().length - 1); let i = 0; await Promise.all(Array.from({ length: Math.min(par, seeds.length) }, async () => { while (i < seeds.length) { const s = seeds[i++]; out.push(await runChild(s)); } })); return out; }

if (argv[0] === '--child') { process.stdout.write(JSON.stringify(leagueRaw(+argv[1]))); }
else {
  const multi = argv.includes('--multi') || arg('--seeds'), seeds = arg('--seeds') ? arg('--seeds').split(',').map(Number) : multi ? [101, 102, 103, 104, 105] : [+process.env.SEED || 4242];
  const S = score(multi ? await pool(seeds) : [leagueRaw(seeds[0])]), f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '-');
  if (!argv.includes('--quiet')) {
    console.log(`NPC league: ${seeds.length} seed(s) x ${SEASONS} seasons, ${S.nCar} drafted careers (${S.classes} classes), avg logged team minutes ${S.minutes.toFixed(1)}`);
    S.rows.forEach((r) => console.log(`${r.k.padEnd(31)} sim ${f1(r.v).padStart(6)}  real ${f1(r.real).padStart(6)}  ${(100 * r.sc).toFixed(0).padStart(3)}%`));
  }
  console.log(`OVERALL ${S.overall.toFixed(1)}%  | ` + Object.entries(S.sub).map(([c, v]) => `${c} ${v.toFixed(0)}`).join('  '));
  if (!process.env.NOUSER && !multi) userCareers(250).forEach((l) => console.log(l));
  if (process.env.JSON) fs.writeFileSync(process.env.JSON, JSON.stringify({ overall: S.overall, sub: S.sub, sim: S.sim, minutes: S.minutes }, null, 1));
}
