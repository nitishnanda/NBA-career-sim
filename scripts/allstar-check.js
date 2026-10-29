// All-Star Weekend: the roster is built every season; a selected player (or one invited to an event) gets the weekend, every step and option resolves, contests and the game
// give their awards once, the awards come back after a replay, and a player with nothing to do skips it
global.NBA = {}; require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = global.NBA; require('../src/game.js');
const G = N.Game, Dc = N.Decisions, AS = N.AllStar;
const S = { seasons: 0, rosters: 0, weekends: 0, none: 0, steps: {}, wins: {}, awards: {}, passes: 0, reapplied: 0, bad: 0 }; const fail = (m) => { S.bad++; if (S.bad < 8) console.log('FAIL', m); };
N.onSeasonLog = (st, rec) => {
  S.seasons++; const R = st.asRoster;
  if (!R || R.year !== st.league.year || R.E.length < 10 || R.W.length < 10) { fail('roster'); return; } S.rosters++;
  if (R.E.filter((x) => x.starter).length !== 5 || R.W.filter((x) => x.starter).length !== 5) fail('starters');
  if (R.sel !== rec.awards.includes('All-Star')) fail('sel vs awards');
  const c = JSON.parse(JSON.stringify(st)); c.autoPlay = false; c.proSeasons.push(rec); c.dec.pending = null;
  const k = S.seasons;
  if (!AS.start(c)) { S.none++; if (R.sel) fail('selected but no weekend'); return; }
  S.weekends++; const f = c.dec.flags.asw; let guard = 0;
  while (!f.done && guard++ < 20) {
    const v = AS.view(c); S.steps[v.step] = (S.steps[v.step] || 0) + 1;
    if (!v.title || /\{|undefined/.test(v.text || '')) fail('bad view ' + v.step + ' ' + v.text);
    if (v.step === 'intro') { AS.answer(c, 'go'); continue; }
    if (v.step === 'recap') { AS.answer(c, 'done'); break; }
    const pass = v.canPass && k % 5 === 0;
    const key = pass ? 'pass' : v.options[(k + guard) % v.options.length].key; if (pass) S.passes++;
    let r; try { r = AS.answer(c, key); } catch (e) { fail(v.step + ' ' + key + ' ' + e.message); break; }
    if (!r.text) fail('no result text'); if (v.step === 'game' && !/You had \d+ points/.test(r.text)) fail('game text ' + r.text);
    try { AS.answer(c, key); fail('answered twice'); } catch (e) {}
    AS.next(c);
  }
  if (!f.done) fail('weekend never finished');
  (f.res.awards || []).forEach((a) => { S.awards[a] = (S.awards[a] || 0) + 1; const r2 = c.proSeasons[c.proSeasons.length - 1]; if (!r2.awards.includes(a) || !c.career.awards[a]) fail('award not filed ' + a); });
  // a replay rebuilds the record: the awards come back, once
  if ((f.res.awards || []).length) {
    const rec2 = JSON.parse(JSON.stringify(rec)); rec2.awards = rec2.awards.filter((a) => !f.res.awards.includes(a)); const before = (c.career.awards[f.res.awards[0]] || 1);
    c.career.awards[f.res.awards[0]] = before - 1; AS.reapply(c, rec2); AS.reapply(c, rec2);
    if (!f.res.awards.every((a) => rec2.awards.includes(a)) || c.career.awards[f.res.awards[0]] !== before) fail('reapply'); else S.reapplied++;
  }
};
for (let i = 0; i < 14; i++) { N.setSeed(2800 + i); const st = G.newCareer({ name: 'A' + i, pos: ['SF', 'PG', 'C', 'SG'][i % 4], arch: ['scorer', 'shooter', 'twoway', 'generational'][i % 4], stars: 3 + (i % 3) }); G.auto(st, {}); }
console.log(JSON.stringify(S));
if (S.bad || !S.weekends || !S.steps.game) { console.log('FAILED'); process.exit(1); } console.log('allstar OK');
