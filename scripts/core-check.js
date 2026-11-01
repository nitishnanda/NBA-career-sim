// the NBA core levers (v102): series moments, the co-star question, team building, the national team, history, badges, summers, mentoring, summer league
global.NBA = {}; require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = global.NBA; require('../src/game.js');
const G = N.Game, Dc = N.Decisions, C = N.Core; const R = { seasons: 0, moments: {}, alpha: 0, built: 0, buildOk: 0, natl: 0, medals: {}, hist: 0, summers: 0, mentors: 0, sl: 0, badges: 0, bad: 0 };
const fail = (m) => { R.bad++; if (R.bad < 10) console.log('FAIL', m); };
let REC = null; const clone = (st) => { const c = JSON.parse(JSON.stringify(st)); c.autoPlay = false; c.dec.pending = null; if (REC) c.proSeasons.push(JSON.parse(JSON.stringify(REC))); return c; };
N.onSeasonLog = (st, rec) => {
  R.seasons++; REC = rec;
  try {
    // series moments: every playoff game that has one resolves and keeps the box score sane
    st.matchLog.forEach((it, i) => { if (it.k !== 'g' || !it.po || it.dnp || it.pi) return; const m = C.momentOf(st, i); if (!m) return; R.moments[m.key] = (R.moments[m.key] || 0) + 1;
      if (R.moments[m.key] > 6) return; const c = clone(st); c.matchIdx = i; if (!Dc.offer(c, 'seriesmoment')) return fail('no moment offer');
      const v = Dc.view(c), k = v.options[v.options.length - 1].key, r = Dc.choose(c, k), b = c.matchLog[i]; if (!r.done || !r.text || /Game \d+ is next/.test(r.text) === false) fail('moment text ' + r.text);
      if (!(b.pt === b.fgm * 2 + b.tpm + b.ftm) || b.fgm > b.fga || b.tpm > b.tpa || b.ftm > b.fta || b.pt < 0) fail('bad box after moment'); });
    // the co-star question at game 41
    { const c = clone(st); const i = c.matchLog.findIndex((x) => x.k === 'g' && !x.po && x.n === 41); c.matchIdx = i; if (Dc.offer(c, 'alpha')) { R.alpha++; const r = Dc.choose(c, ['share', 'demand', 'defer'][R.alpha % 3]); if (!r.done || !r.text) fail('alpha'); } }
    // offseason levers on a clone (the real career is not touched)
    const c = clone(st); c.league.year += 0;
    const tg = C.targets(c); tg.forEach((x) => { if (!(x.odds >= 3 && x.odds <= 70)) fail('odds ' + x.odds); });
    if (tg.length) { const r = C.buildTeam(c, tg[0].id, R.built % 2 ? 'demand' : 'recruit'); R.built++; if (r.ok) { R.buildOk++; if (N.Teams ? false : !N.rosterOf(c.league, c.league.teams[c.teamId]).some((q) => q.id === tg[0].id)) fail('star not moved'); } let threw = false; try { C.buildTeam(c, tg[0].id, 'recruit'); } catch (e) { threw = true; } if (!threw) fail('two moves in a summer'); }
    const nt = C.nationalTeam(c); if (nt && nt.picked) { const r = C.playNational(c, true); R.natl++; R.medals[r.finish] = (R.medals[r.finish] || 0) + 1; if (/undefined|NaN/.test(r.text)) fail('natl text ' + r.text); }
    const tot = { pts: st.proSeasons.reduce((a, s) => a + s.pts * s.gp, 0), reb: st.proSeasons.reduce((a, s) => a + s.reb * s.gp, 0), ast: st.proSeasons.reduce((a, s) => a + s.ast * s.gp, 0) };
    R.hist += C.historyCheck(c, tot).length; if (C.historyCheck(c, tot).length) fail('history repeats');
    const so = C.summerOptions(c); if (so.length !== 5) fail('summer options'); C.doSummer(c, so[R.summers % 5].key); R.summers++;
    const mt = C.mentees(c); if (mt.length) { C.mentor(c, mt[0].id); R.mentors++; }
    if (st.proSeasons.length === 0) { const sl = C.summerLeague(clone(st)); R.sl++; if (!(sl.pts > 0)) fail('summer league'); }
    R.badges += C.badges(st.player).length; C.captainCheck(c); c.dec.flags.chem = -3; C.unhappyTeammate(c);
  } catch (e) { fail(e.stack.split('\n').slice(0, 3).join(' | ')); }
};
for (let i = 0; i < 6; i++) { N.setSeed(9100 + i); const st = G.newCareer({ name: 'c' + i, pos: ['SF', 'PG', 'C'][i % 3], arch: ['scorer', 'twoway', 'shooter'][i % 3], stars: 5 }); st.autoPlay = false; st.loadMgmt = i % 2 ? 'light' : 'off'; G.auto(st, {}); }
console.log(JSON.stringify(R));
if (R.bad || !R.seasons || !R.built || !R.summers) { console.log('FAILED'); process.exit(1); } console.log('core OK');
