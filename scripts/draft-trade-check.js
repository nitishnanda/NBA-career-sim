// draft-night promises (every option resolves, kept and broken both happen) and the sign-and-trade (offered to wanted players, executes, pays the old club in picks)
global.NBA = {}; require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = global.NBA; require('../src/game.js');
const G = N.Game, Dc = N.Decisions;
let bad = 0, seasons = 0, promises = 0, kept = 0, broke = 0, sat = 0, offered = 0; const fail = (m) => { bad++; if (bad < 8) console.log('FAIL', m); };
N.onSeasonLog = (st, rec) => {
  seasons++;
  if (seasons % 1 === 0 && st.draft && !st.__p) {
    st.__p = 1;
    ['starter', 'dev', 'brand', 'none'].forEach((k) => {
      const c = JSON.parse(JSON.stringify(st)); c.autoPlay = false; c.proSeasons = []; c.promiseDone = false; c.dec.pending = null; c.stage = 'pro_ready';
      if (!Dc.offer(c, 'promise')) { fail('no promise offered'); return; }
      const v = Dc.view(c); if (v.options.length !== 4 || /\{/.test(v.text)) fail('bad promise view');
      c.promiseDone = true; const r = G.choosePromise(c, k); promises++; if (!r.text || !r.done) fail('promise ' + k + ' not done');
      if (k === 'starter') { if (/kept their word/.test(r.text)) kept++; else broke++; }
      if (c.stage !== 'agent') fail('stage after promise ' + c.stage);
    });
  }
  if (st.contract) {
    const c = JSON.parse(JSON.stringify(st)); c.stage = 'season_play'; c.proSeasons.push(rec); c.autoPlay = false; c.dec.pending = null; c.contract.left = 0;
    let d; try { d = G.decisionOptions(c); } catch (e) { fail('decisionOptions ' + e.message); return; }
    if (d.signTrade) {
      offered++; const o = d.signTrade[0], old = c.teamId; if (!o.picks || o.teamId === old) fail('bad sat offer');
      if (!c.decision) c.decision = d;
      try { G.decide(c, 'switch', { teamId: o.teamId, salary: o.salary, years: o.years, tag: 'sat' }); sat++; if (c.teamId !== o.teamId || !(c.trades || []).some((t) => /sign-and-trade/.test(t.partner))) fail('sat did not move'); } catch (e) { fail('sat ' + e.message); }
    }
  }
};
for (let i = 0; i < 8; i++) { N.setSeed(2400 + i); const st = G.newCareer({ name: 'D' + i, pos: ['SF', 'PG', 'C'][i % 3], arch: ['scorer', 'defender', 'twoway'][i % 3], stars: 3 + (i % 3) }); G.auto(st, {}); }
console.log(JSON.stringify({ seasons, promises, kept, broke, offered, sat, bad }));
if (bad || !promises || !offered) { console.log('FAILED'); process.exit(1); } console.log('draft-trade OK');
