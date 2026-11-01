// the NBA core levers (v102): series moments, the co-star question, team building, the national team, history, badges, summers, mentoring, summer league
global.NBA = {}; require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = global.NBA; require('../src/game.js');
const G = N.Game, Dc = N.Decisions, C = N.Core; const R = { seasons: 0, moments: {}, alpha: 0, built: 0, buildOk: 0, natl: 0, medals: {}, hist: 0, summers: 0, mentors: 0, sl: 0, badges: 0, bad: 0 };
const fail = (m) => { R.bad++; if (R.bad < 10) console.log('FAIL', m); };
let REC = null; const clone = (st) => { const c = JSON.parse(JSON.stringify(st)); c.autoPlay = false; c.dec.pending = null; if (REC) c.proSeasons.push(JSON.parse(JSON.stringify(REC))); return c; };
let IN = false; R.flips = 0; R.flipChecks = 0;
N.onSeasonLog = (st, rec) => {
  if (IN) return; IN = true; try { onLog(st, rec); } finally { IN = false; }
};
const seriesOk = (log) => { const by = {}; log.forEach((x) => { if (x.k === 'g' && x.po && !x.pi) (by[x.si] = by[x.si] || []).push(x); }); return Object.values(by).every((gs) => { let w = 0, l = 0; for (let i = 0; i < gs.length; i++) { if (w === 4 || l === 4) return false; if (gs[i].w) w++; else l++; } return w === 4 || l === 4; }); };
function onLog(st, rec) {
  R.seasons++; REC = rec;
  try {
    // series moments: every playoff game that has one resolves and keeps the box score sane
    st.matchLog.forEach((it, i) => { if (it.k !== 'g' || !it.po || it.dnp || it.pi) return; const m = C.momentOf(st, i); if (!m) return; R.moments[m.key] = (R.moments[m.key] || 0) + 1;
      if (R.moments[m.key] > 6) return; const c = clone(st); c.matchIdx = i; if (!Dc.offer(c, 'seriesmoment')) return fail('no moment offer');
      const v = Dc.view(c); if (!v.options.every((o) => /Win chance \d+% → \d+%/.test(o.vibe))) fail('no odds ' + v.options[0].vibe);
      const k = v.options.slice().sort((x, y) => +y.vibe.match(/→ (\d+)/)[1] - +x.vibe.match(/→ (\d+)/)[1])[R.moments[m.key] % 2 ? 0 : v.options.length - 1].key, w0 = c.matchLog[i].w, r = Dc.choose(c, k), b = c.matchLog[i]; if (!r.done || !r.text || /Game \d+ is next/.test(r.text) === false) fail('moment text ' + r.text);
      if (!!b.w !== !!w0) R.flips++; R.flipChecks++; if (!seriesOk(c.matchLog)) fail('series broken after moment ' + m.key + ' flip=' + (!!b.w !== !!w0)); if (c.matchIdx !== i) fail('idx moved'); if (!b.smd) fail('smd lost');
      if (!(b.pt === b.fgm * 2 + b.tpm + b.ftm) || b.fgm > b.fga || b.tpm > b.tpa || b.ftm > b.fta || b.pt < 0) fail('bad box after moment'); });
    // the co-star question at game 41
    { const c = clone(st); const i = c.matchLog.findIndex((x) => x.k === 'g' && !x.po && x.n === 41); c.matchIdx = i; if (Dc.offer(c, 'alpha')) { R.alpha++; const r = Dc.choose(c, ['share', 'demand', 'defer'][R.alpha % 3]); if (!r.done || !r.text) fail('alpha'); } }
    // offseason levers on a clone (the real career is not touched)
    const c = clone(st); c.league.year += 0;
    const tg = C.targets(c); tg.forEach((x) => { if (!(x.odds >= 2 && x.odds <= 85 && x.push >= 2 && x.push <= 85)) fail('odds ' + x.odds + '/' + x.push); });
    if (tg.length) { const r = C.buildTeam(c, tg[0].id, R.built % 2 ? 'demand' : 'recruit'); R.built++; if (r.ok) { R.buildOk++; if (N.Teams ? false : !N.rosterOf(c.league, c.league.teams[c.teamId]).some((q) => q.id === tg[0].id)) fail('star not moved'); } let threw = false; try { C.buildTeam(c, tg[0].id, 'recruit'); } catch (e) { threw = true; } if (!threw) fail('two moves in a summer'); }
    const nt = C.nationalTeam(c); if (nt && nt.picked) { const r = C.playNational(c, true); R.natl++; R.medals[r.finish] = (R.medals[r.finish] || 0) + 1; if (/undefined|NaN/.test(r.text)) fail('natl text ' + r.text); }
    const tot = { pts: st.proSeasons.reduce((a, s) => a + s.pts * s.gp, 0), reb: st.proSeasons.reduce((a, s) => a + s.reb * s.gp, 0), ast: st.proSeasons.reduce((a, s) => a + s.ast * s.gp, 0) };
    R.hist += C.historyCheck(c, tot).length; if (C.historyCheck(c, tot).length) fail('history repeats');
    const so = C.summerOptions(c); if (so.length !== 5) fail('summer options'); C.doSummer(c, so[R.summers % 5].key); R.summers++;
    const mt = C.mentees(c); if (mt.length) { C.mentor(c, mt[0].id); R.mentors++; }
    if (st.proSeasons.length === 0) { const sl = C.summerLeague(clone(st)); R.sl++; if (!(sl.pts > 0)) fail('summer league'); }
    R.badges += C.badges(st.player).length; C.captainCheck(c); c.dec.flags.chem = -3; C.unhappyTeammate(c);
  } catch (e) { fail(e.stack.split('\n').slice(0, 3).join(' | ')); }
}
for (let i = 0; i < 6; i++) { N.setSeed(9100 + i); const st = G.newCareer({ name: 'c' + i, pos: ['SF', 'PG', 'C'][i % 3], arch: ['scorer', 'twoway', 'shooter'][i % 3], stars: 5 }); st.autoPlay = false; st.loadMgmt = i % 2 ? 'light' : 'off'; G.auto(st, {}); }
console.log(JSON.stringify(R));
if (R.bad || !R.seasons || !R.built || !R.summers) { console.log('FAILED'); process.exit(1); } console.log('core OK');
// team status drives the front office: a franchise player on a weak team is heard, a contender is not
{ N.setSeed(77); const st = G.newCareer({ name: 'fo', pos: 'SF', arch: 'generational', stars: 5 }); let done = false;
  try { G.auto(st, { onDecision: (s) => { if (s.proSeasons.length >= 4) throw 'stop'; } }); } catch (e) { if (e !== 'stop') throw e; }
  const c = JSON.parse(JSON.stringify(st)); c.autoPlay = false; const t = c.league.teams[c.teamId], conf = c.league.teams.filter((x) => x.conf === t.conf);
  conf.forEach((x) => { if (x.id !== t.id) x.wins = 45; }); t.wins = 22; c.proSeasons.forEach((x) => { if (x.teamId === t.id) x.wins = 24; }); const weak = C.teamStatus(c);
  t.wins = 62; c.proSeasons.forEach((x) => { if (x.teamId === t.id) x.wins = 60; }); c.dec.flags.confRank = {}; const cont = C.teamStatus(c);
  console.log(JSON.stringify({ weak: [weak.tier, weak.franchise, weak.listen], contender: [cont.tier, cont.listen] }));
  if (weak.tier !== 'weak' || cont.tier !== 'contender' || !(weak.listen >= 70 && cont.listen <= 30)) { console.log('FAILED fo'); process.exit(1); } console.log('fo OK'); }
