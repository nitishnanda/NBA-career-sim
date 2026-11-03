// v105: box lines + quarters, league storylines, agent, awards night, evolve, incentives, champion moment, jerseys, All-Star captain
global.NBA = {}; require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = global.NBA; require('../src/game.js');
const G = N.Game, W = N.World, R = { seasons: 0, boxes: 0, hotMates: 0, qBad: 0, stories: {}, awards: 0, champs: 0, evolve: 0, inc: 0, incPaid: 0, jersey: 0, jerseyRetiredBlocked: 0, captain: 0, bad: 0 };
const fail = (m) => { R.bad++; if (R.bad < 10) console.log('FAIL', m); };
let IN = false;
N.onSeasonLog = (st, rec) => { if (IN) return; IN = true; try { R.seasons++; const c = JSON.parse(JSON.stringify(st)); c.autoPlay = false; c.proSeasons.push(JSON.parse(JSON.stringify(rec)));
  c.matchLog.forEach((it) => { if (it.k !== 'g') return; const b = W.boxOf(c, it); if (!b) return; R.boxes++; if (b.ours.some((x) => x.pts >= 33)) R.hotMates++;
    const q = b.quarters; if (q) { const sf = q.us.reduce((a, x) => a + x, 0), sa = q.them.reduce((a, x) => a + x, 0); if (sf !== it.f || sa !== it.a || q.us.some((x) => x < 0) || q.them.some((x) => x < 0)) R.qBad++; if (it.ot && q.us.slice(0, 4).reduce((a, x) => a + x, 0) !== q.them.slice(0, 4).reduce((a, x) => a + x, 0)) R.qBad++; }
    const s = W.gameStory(c, it); if (!s || /undefined|NaN/.test(s)) fail('story ' + s); });
  W.leagueStories(c).forEach((x) => { R.stories[x.k] = (R.stories[x.k] || 0) + 1; if (/undefined|NaN/.test(x.text)) fail('lg ' + x.text); });
  const adv = W.agentAdvice(c, G.decisionOptions(c)); if (!adv.length) fail('agent');
  const an = W.awardsNight(c); an.forEach((a) => { R.awards++; if (!(a.share >= 0 && a.share <= 100)) fail('share'); W.awardSpeech(c, a.key, a.won ? 'team' : 'classy'); });
  if (W.champMoment(c)) { R.champs++; W.parade(c, 'humble'); }
  c.player.age = Math.max(31, c.player.age); if (W.canEvolve(c)) { const t0 = c.player.attrs.three; W.evolve(c, 'stretch'); R.evolve++; if (!(c.player.attrs.three > t0 || t0 >= 99)) fail('evolve'); }
  if (c.contract && c.contract.type !== 'rookie') { const r = W.addIncentive(c, 'games'); R.inc++; if (r.ok) { c.league.year++; c.proSeasons.push(Object.assign({}, rec, { year: c.league.year, gp: 75 })); const e0 = c.earnings, p = W.payIncentives(c); if (p && p.ok && c.earnings > e0) R.incPaid++; } }
  const t = c.league.teams[c.teamId], ret = W.RETIRED[t.nick]; if (ret && ret.length) { const r = W.pickJersey(c, ret[0]); if (!r.ok) R.jerseyRetiredBlocked++; else fail('retired number allowed'); }
  const tk = W.jerseyTaken(c, c.teamId); let n = 0; while (tk.retired.includes(n) || tk.taken[n]) n++; const r = W.pickJersey(c, n); if (r.ok && c.jersey.num === n) R.jersey++; else fail('jersey ' + r.text);
  // the All-Star captain draft (when the build marks one)
  if (c.asRoster && c.asRoster.sel && c.asRoster.starter) { c.asRoster.rank = 1; N.Decisions.state(c).flags.asw = null; if (N.AllStar.start(c)) { const f = N.Decisions.state(c).flags.asw; if (f.steps.includes('captain')) { while (f.steps[f.i] !== 'captain') f.i++; const res = N.AllStar.answer(c, 'rival'); R.captain++; if (!res.rows || res.rows.length < 1) fail('captain rows'); N.AllStar.next(c); const g = N.AllStar.answer(c, 'compete'); if (!g.rows || g.rows.length < 4) fail('asg rows ' + (g.rows || []).length); } } }
} catch (e) { fail(e.stack.split('\n').slice(0, 3).join(' | ')); } finally { IN = false; } };
for (let i = 0; i < 4; i++) { N.setSeed(7300 + i); const st = G.newCareer({ name: 'w' + i, pos: ['SF', 'PG', 'C', 'SG'][i % 4], arch: ['generational', 'scorer', 'twoway', 'shooter'][i % 4], stars: [5, 4, 3, 5][i % 4] }); G.auto(st, {}); }
console.log(JSON.stringify(R));
if (R.bad || R.qBad || !R.boxes || !R.jersey || !R.inc) { console.log('FAILED'); process.exit(1); } console.log('world OK');
