// coaches and the locker room: every club has a coach, bad clubs fire them, the late-career decision carries the coach and room steps, and every option resolves with its effects
global.NBA = {}; require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = global.NBA; require('../src/game.js');
const G = N.Game, Dc = N.Decisions, R = N.Room;
let panels = 0, bad = 0, seasons = 0, coachSteps = 0, roomSteps = 0, fired = 0, keys = {}, types = {}, tests = 0; const fail = (m) => { bad++; if (bad < 8) console.log('FAIL', m); };
let n = 0;
N.onSeasonLog = (st, rec) => {
  seasons++; n++;
  const c = JSON.parse(JSON.stringify(st)); c.stage = 'season_play'; c.proSeasons.push(rec); c.autoPlay = false; c.dec.pending = null;
  let d; try { d = G.decisionOptions(c); } catch (e) { fail('decisionOptions ' + e.message); return; }
  const co = R.coachOf(c, c.teamId); if (!co || !R.STYLES[co.style]) fail('no coach');
  const f = Dc.state(c).flags; if (f.newCoach && f.newCoach.year === c.league.year) fired++;
  { const P = R.panel(c); panels++; if (!P.coach || !P.coach.name || !(P.chem >= -8 && P.chem <= 8) || !P.chemLabel || P.groups.length !== 3 || P.rows.some((x) => !x.label)) fail('panel ' + JSON.stringify(P).slice(0, 200)); }
  let guard = 0;
  while (Dc.state(c).pending && Dc.state(c).pending.id === 'late' && guard++ < 6) {
    const v = Dc.view(c); if (v.step === 'coach') coachSteps++; if (v.step === 'room') { roomSteps++; types[R.roomStory(c).type] = 1; }
    if (!v.options || v.options.length < 2 || /\{/.test(v.text || '')) { fail('bad view ' + v.step); break; }
    const o = v.options[n % v.options.length]; keys[v.step + ':' + o.key] = 1; tests++;
    try { const r = Dc.choose(c, o.key); if (!r.text) fail('no text ' + v.step + ' ' + o.key); } catch (e) { fail(v.step + ' ' + o.key + ' ' + e.message); break; }
  }
  if (Dc.state(c).pending) { try { Dc.autoResolve(c); } catch (e) { fail('auto ' + e.message); } }
};
for (let i = 0; i < 10; i++) { N.setSeed(2300 + i); const st = G.newCareer({ name: 'R' + i, pos: ['SF', 'PG', 'C'][i % 3], arch: ['scorer', 'defender', 'twoway'][i % 3], stars: 3 + (i % 3) }); G.auto(st, {}); }
console.log(JSON.stringify({ panels, seasons, coachSteps, roomSteps, fired, types, options: Object.keys(keys).length, tests, bad }));
if (bad || !roomSteps || !coachSteps) { console.log('FAILED'); process.exit(1); } console.log('room OK');
