// Sim league: top-scorer turnover and scoring tails, the same metrics as scripts/scoring-turnover.py (real, era-adjusted to 2016-25).
// NPC league:   SEED=1 YEARS=80 node scripts/sim-scoring-turnover.js
// With a user career in the league (what a player sees):  USER_ARCH=generational N=20 node scripts/sim-scoring-turnover.js
require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const G = require('../src/game.js').Game;
if (process.env.TUNE) Object.assign(NBA.tuning, JSON.parse(process.env.TUNE));
const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const runs = [];   // each run = array of seasons; a season = { tops: [ids by ppg], by: {id: {ppg, q, age}}, top150 }
function record(res, run) {
  const by = {}; res.entries.forEach((e) => { by[e.id] = { ppg: e.l.pts, q: e.l.gp >= 58, age: e.p.age, user: !!e.isUser }; });
  const q = res.entries.filter((e) => e.l.gp >= 58).sort((a, b) => b.l.pts - a.l.pts);
  run.push({ tops: q.map((e) => e.id), by, top150: mean(q.slice(0, 150).map((e) => e.l.pts)) });
}
if (process.env.USER_ARCH) {
  const arch = process.env.USER_ARCH, N = +process.env.N || 20, orig = NBA.simSeason;
  for (let i = 0; i < N; i++) {
    const run = []; NBA.simSeason = (L, u) => { const r = orig(L, u); if (u) record(r, run); return r; };
    const st = G.newCareer({ name: 'x', pos: ['PG', 'SG', 'SF', 'PF', 'C'][i % 5], arch, home: 'Ohio', seed: 555000 + (+process.env.SEED || 0) * 1000 + i });
    G.auto(st); runs.push(run);
  }
  NBA.simSeason = orig;
} else {
  NBA.setSeed(+process.env.SEED || 777); const L = NBA.newLeague(2027, { real: true }), run = [];
  for (let y = 0; y < (+process.env.YEARS || 40); y++) { record(NBA.simSeason(L, null), run); NBA.offseason(L, { draft: true }); }
  runs.push(run);
}
const o = { top5_repeat: [], top10_repeat: [], distinct_top5_10yr: [], dd: [], stay: [], age5: [], top1: [], top5: [], top10: [], pts30: [], pts27: [], pts25: [], pts20: [], top150: [], userTop5: [] };
runs.forEach((run) => run.forEach((s, y) => {
  ['pts30', 'pts27', 'pts25', 'pts20'].forEach((k) => o[k].push(s.tops.filter((id) => s.by[id].ppg >= +k.slice(3)).length));
  o.top1.push(s.by[s.tops[0]].ppg); o.top5.push(s.by[s.tops[4]].ppg); o.top10.push(s.by[s.tops[9]].ppg); o.top150.push(s.top150);
  s.tops.slice(0, 5).forEach((id) => o.age5.push(s.by[id].age)); o.userTop5.push(s.tops.slice(0, 5).includes('user') ? 1 : 0);
  if (y > 0) {
    const p = run[y - 1]; [5, 10].forEach((k) => o['top' + k + '_repeat'].push(s.tops.slice(0, k).filter((id) => p.tops.slice(0, k).includes(id)).length));
    p.tops.slice(0, 10).forEach((id) => { const n = s.by[id]; o.stay.push(n && n.q ? 1 : 0); if (n && n.q) o.dd.push(n.ppg - p.by[id].ppg); });
  }
  if (y + 9 < run.length) { const set = new Set(); for (let j = y; j < y + 10; j++) run[j].tops.slice(0, 5).forEach((id) => set.add(id)); o.distinct_top5_10yr.push(set.size); }
}));
const ddm = mean(o.dd), r = (v) => +v.toFixed(2);
const sim = { top5_repeat: mean(o.top5_repeat), top10_repeat: mean(o.top10_repeat), distinct_top5_10yr: mean(o.distinct_top5_10yr), top10_next_dppg_mean: ddm,
  top10_next_dppg_sd: Math.sqrt(mean(o.dd.map((d) => (d - ddm) ** 2))), top10_next_qualify: mean(o.stay), top5_age_mean: mean(o.age5),
  top1_ppg: mean(o.top1), top5_ppg: mean(o.top5), top10_ppg: mean(o.top10), pts30: mean(o.pts30), pts27: mean(o.pts27), pts25: mean(o.pts25), pts20: mean(o.pts20), top150_ppg: mean(o.top150), seasons: o.top1.length };
if (runs[0] && runs[0].some((s) => 'user' in s.by)) sim.user_in_top5 = mean(o.userTop5);
const real = (() => { try { return require('../data/real-scoring-turnover.json'); } catch (e) { return {}; } })();
if (process.env.JSON) console.log(JSON.stringify(sim));
else Object.keys(sim).forEach((k) => console.log(k.padEnd(22), String(r(sim[k])).padStart(8), real[k] != null ? ' real ' + r(real[k]) : ''));
