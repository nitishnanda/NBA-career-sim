// v106: assignments, lockdowns, a co-star's injury, the rookie wall, the narrative, jersey nights, earned progression, AI storyline checker, live "run" decision
global.NBA = {}; require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = global.NBA; require('../src/game.js');
const G = N.Game, Dc = N.Decisions, A = N.Arc, W = N.World, R = { seasons: 0, asg: 0, lock: 0, mateinj: 0, mateOutOk: 0, wall: 0, narr: {}, nights: 0, earned: 0, earnedTot: 0, story: 0, run: 0, bad: 0 };
const fail = (m) => { R.bad++; if (R.bad < 10) console.log('FAIL', m); };
let IN = false;
N.onSeasonLog = (st, rec) => { if (IN) return; IN = true; try { R.seasons++; const c = JSON.parse(JSON.stringify(st)); c.autoPlay = false; c.dec.pending = null; c.proSeasons.push(JSON.parse(JSON.stringify(rec)));
  // the assignment before a press game
  const ia = c.matchLog.findIndex((x) => x.k === 'g' && !x.po && x.pc && !x.dnp); if (ia >= 0) { c.matchIdx = ia; c.player.attrs.perD = Math.max(c.player.attrs.perD, 75); if (Dc.offer(c, 'assignment')) { R.asg++; Dc.choose(c, 'take'); if (!c.matchLog[ia].asg) fail('asg flag'); if (A.lockdownOf(c, c.matchLog[ia])) R.lock++; } }
  // the co-star's injury: force the game it would come at
  const f = Dc.state(c).flags; { const want = 15 + Math.floor(Dc.rng(c, 'mateinj-n|' + c.league.year)() * 45), i = c.matchLog.findIndex((x) => x.k === 'g' && !x.po && x.n === want); c.matchIdx = i; f.mateInjY = null; const o = A.mateInjuryOpen(c);
    if (o) { c.dec.pending = { id: 'mateinj', ctx: o, step: 0, log: [] }; R.mateinj++; Dc.choose(c, 'stepup'); const g = c.matchLog.find((y) => y.k === 'g' && !y.po && y.n === f.mateOut.from), b = W.boxOf(c, g); if (b && b.ours.every((m) => m.id !== f.mateOut.id)) R.mateOutOk++; else fail('injured mate in box'); } }
  // the rookie wall
  if (st.proSeasons.length === 0) { const iw = c.matchLog.findIndex((x) => x.k === 'g' && !x.po && x.n === 50); c.matchIdx = iw; if (Dc.offer(c, 'rookiewall')) { R.wall++; Dc.choose(c, ['rest', 'push', 'film'][R.wall % 3]); } }
  { const tr = {}; N.rosterOf(c.league, c.league.teams[c.teamId]).forEach((q) => { tr[A.traitOf(q)] = 1; }); R.traits = Object.assign(R.traits || {}, tr);
    const cards = A.mateCards(c); if (!cards.length || cards.some((m) => !m.trait || /undefined|NaN/.test(JSON.stringify(m)))) fail('mate cards');
    const keyN = [20, 62]; keyN.forEach((n) => { const cc = JSON.parse(JSON.stringify(c)); cc.autoPlay = false; cc.dec.pending = null; const gi = cc.matchLog.findIndex((x) => x.k === 'g' && !x.po && x.n === n); cc.matchIdx = gi; const f = Dc.state(cc).flags; delete f['mateEv' + cc.league.year + ':' + n];
      let tries = 0, got = null; while (!got && tries++ < 40) { delete f['mateEv' + cc.league.year + ':' + n]; cc.league.year += 0; cc.dec.pending = null; if (Dc.offer(cc, 'mateevent')) got = cc.dec.pending; else { cc.matchLog[gi].n = n; f['mateEvSalt'] = tries; cc.league.year += 0; if (tries % 2) cc.seasonSeed = (cc.seasonSeed || 1) + 1; } }
      if (got) { R.mateEv = (R.mateEv || 0) + 1; const v = Dc.view(cc); if (!v.options || v.options.length < 2 || /undefined|NaN/.test(JSON.stringify(v))) fail('mateevent view ' + JSON.stringify(v).slice(0, 120)); const r = Dc.choose(cc, v.options[R.mateEv % v.options.length].key); if (!r.done || !r.text) fail('mateevent result'); R.mateEvKinds = R.mateEvKinds || {}; R.mateEvKinds[got.ctx.tr] = 1; } }); }
  const nr = A.narrative(c); if (nr) R.narr[nr.key] = (R.narr[nr.key] || 0) + 1;
  const js = A.jerseyNights(c); if (js.length) { A.jerseyNight(c, js[0].team, 'thanks'); R.nights++; }
  { const rr = JSON.parse(JSON.stringify(rec)); rr.tpa = 8; rr.ast = 7; A.earned(c, rr); rec.earned = rr.earned; }
  if (rec.earned) { R.earned++; R.earnedTot += rec.earned.total; Object.values(rec.earned.attrs).forEach((v) => { if (!(v > 0 && v <= 1)) fail('earned ' + v); }); }
  // the live run decision changes the logged game legally
  const ig = c.matchLog.findIndex((x) => x.k === 'g' && !x.dnp && !x.po); const it = c.matchLog[ig], f0 = it.f, a0 = it.a; G.liveDecision(c, ig, 'run', 'timeout', { box: {}, sc: [40, 50] }); R.run++; if (!(it.f >= 0 && it.a >= 0)) fail('run broke score');
} catch (e) { fail(e.stack.split('\n').slice(0, 3).join(' | ')); } finally { IN = false; } };
for (let i = 0; i < 4; i++) { N.setSeed(8100 + i); const st = G.newCareer({ name: 'a' + i, pos: ['SF', 'C', 'PG', 'SG'][i % 4], arch: ['twoway', 'defender', 'generational', 'scorer'][i % 4], stars: [4, 3, 5, 4][i % 4] }); st.autoPlay = false; G.auto(st, {}); }
// the AI storyline checker: a good event passes (effects clamped), a bad one fails
const good = A.checkStory({ title: 'A rival calls you out', text: 'Your rival said on a podcast that you disappear in big games, and the clip has two million views already.', options: [{ label: 'Fire back', blurb: 'Answer him on your own podcast tonight.', effects: { media: 2, chem: -0.2 } }, { label: 'Stay quiet', blurb: 'Let the season do the talking.', effects: { media: -0.1 } }, { label: 'Call him', blurb: 'Settle it privately like grown men.', effects: { locker: 0.3 } }] });
if (!good || good.options[0].effects.media !== 0.6) fail('story check good'); else R.story++;
if (A.checkStory({ title: 'x', text: 'short', options: [] })) fail('story check bad passed');
console.log(JSON.stringify(R));
if (R.bad || !R.asg || !R.mateinj || !R.run || !R.story || !R.mateEv) { console.log('FAILED'); process.exit(1); } console.log('arc OK');
