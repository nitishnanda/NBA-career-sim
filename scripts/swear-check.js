// fines for swearing / criticizing the officials in the press; the fan podcast has none
global.NBA = {}; require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = global.NBA; require('../src/game.js');
const P = N.Press; let bad = 0; const t = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
t(P.isProfane('that was bullshit and you know it'), 'bullshit'); t(P.isProfane('shut the fuck up'), 'fuck'); t(!P.isProfane('that was a heck of a game'), 'clean'); t(!P.isProfane('hell of a night, damn'), 'mild');
t(P.badmouth('the refs were terrible tonight'), 'refs bad'); t(P.badmouth('the league office is a joke'), 'league'); t(!P.badmouth('shout out to the refs, good game'), 'refs neutral'); t(P.badmouth('the owner is cheap garbage'), 'owner');
const c = { me: 'T', oppStar: 'Rival Guy', opp: 'Lakers' }; const r = P.readTyped('the refs are blind and rigged, fuck this', c, { heat: 1 }); t(r.profane && r.badmouth, 'readTyped flags');
// resolvePress fines: a game press with a profane / refs-bashing pick takes money
N.setSeed(9); const G = N.Game, Dc = N.Decisions; const st = G.newCareer({ name: 'S', pos: 'SF', arch: 'scorer', stars: 4 }); st.autoPlay = false;
G.chooseCollege(st, G.collegeOptions(st)[0].id); G.playCollege(st); G.declare(st); G.runCombine(st, true); G.enterDraft(st); G.startPro(st); G.playSeason(st);
const idx = st.matchLog.findIndex((x) => x.k === 'g' && !x.dnp); st.matchIdx = idx; const ctx = G.pressOpen ? null : null;
const base = st.earnings; st.earnings = 10;
const mk = (pick) => ({ kind: 'game', idx, si: null, why: 'x', opp: st.matchLog[idx].o, pool: [], take: 1, chosen: [], cur: null, picks: [pick], c: { oppStarOvr: 80, winning: true, hot: false, slump: false, opp: st.matchLog[idx].o, team: 'x', me: 'S' }, headlines: [], persona: 'neutral' });
const e0 = st.earnings; try { G.resolvePress(st, mk({ tone: 'fight', topic: 'refs', text: 'x', profane: true, badmouth: true })); } catch (e) { console.log('resolve threw', e.message); bad++; }
t(st.earnings < e0, 'fine taken: ' + st.earnings + ' vs ' + e0);
// no leaks: mid-season, the career facts are the career at tip-off (a rookie has no seasons yet) and no final records show up
{ const cf = G.careerFacts(st); t(st.stage === 'season_play' && cf.seasons === 0 && !cf.lastSeason && cf.careerPoints === 0, 'careerFacts leaks the season being played: ' + JSON.stringify(cf)); t(st.league.lastWins && Object.keys(st.league.lastWins).length >= 30, 'lastWins snapshot'); }
// honest game grades: 9-10 points from a starter-level rookie is a poor night, a big night is good/great
{ const gg = (o, it, a, n) => G.gameGrade(o, Object.assign({ m: 28, rb: 4, as: 3, st: 1, bk: 0, fga: 12, fgm: 5, fta: 2 }, it), a, n).grade;
  t(gg(63, { pt: 10, fgm: 4, fga: 11 }, 0, 0) === 'poor', 'rookie 10 pts is poor: ' + gg(63, { pt: 10, fgm: 4, fga: 11 }, 0, 0)); t(gg(63, { pt: 9, fgm: 3, fga: 10 }, 0, 0) === 'poor' || gg(63, { pt: 9 }, 0, 0) === 'awful', 'rookie 9 pts poor');
  t(['good', 'great'].includes(gg(63, { pt: 22, fgm: 9, fga: 16 }, 0, 0)), 'rookie 22 is good'); t(gg(80, { pt: 12, fgm: 4, fga: 14 }, 26, 30) === 'awful' || gg(80, { pt: 12, fgm: 4, fga: 14 }, 26, 30) === 'poor', 'star 12 pts is poor');
  t(gg(80, { pt: 38, fgm: 14, fga: 25 }, 26, 30) === 'great', 'star 38 great'); t(gg(63, { pt: 10, fgm: 4, fga: 8, rb: 13 }, 0, 0) !== 'awful', 'hustle night not awful'); }
// podcast: appears, resolves for each answer, no money fine
{ let seen = 0; const pr = (Dc.state(st).flags.pr = Dc.state(st).flags.pr || { quotes: [], tally: [], feuds: {}, heads: [], rep: {} });
  for (let i = 1; i < st.matchLog.length && seen < 3; i++) { const it = st.matchLog[i]; if (it.k !== 'g' || it.dnp) continue; pr.feuds[it.o] = { star: 'X', level: 1, y: 1, quote: 'q', seen: 0 }; const c = JSON.parse(JSON.stringify(st)); c.matchIdx = i + 1; c.dec.pending = null; c.dec.flags.pod = { y: c.league.year, n: 0 };
    if (!Dc.offer(c, 'podcast')) continue; seen++; const ctx = c.dec.pending.ctx; t(!/\{|undefined/.test(ctx.base.unfiltered + ctx.hostQ), 'podcast text'); t(/shit|fuck|ass|damn/i.test(ctx.base.unfiltered), 'unfiltered has swearing'); t(!/shit|fuck|ass\b/i.test(ctx.base.clean), 'clean is clean');
    const v = Dc.view(c); t(v.options.length === 3, 'pod options'); const e1 = c.earnings; const r = Dc.choose(c, ['clean', 'loose', 'unfiltered'][seen % 3]); t(r.done && r.text && c.earnings === e1, 'pod resolve'); }
  t(seen >= 1, 'podcast never offered'); }
console.log(bad ? 'FAILED' : 'swear OK'); process.exit(bad ? 1 : 0);
