// the G League: assignment, seasons, the club's verdict (wants you / open / develop), pushing for a spot, the call-up, and the first NBA season after
global.NBA = {}; require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = global.NBA; require('../src/game.js');
const G = N.Game; let bad = 0, runs = 0, called = 0; const V = {}, ppg = [], offers = { gl: 0, n: 0, byBand: {} };
const fail = (m) => { bad++; if (bad < 8) console.log('FAIL', m); };
for (let i = 0; i < 20; i++) {
  N.setSeed(9700 + i); const st = G.newCareer({ name: 'G' + i, pos: ['PG', 'SF', 'C', 'SG'][i % 4], arch: ['scorer', 'twoway', 'defender'][i % 3], stars: 2 + (i % 3) }); st.autoPlay = true;
  const o = G.collegeOptions(st); G.chooseCollege(st, o[o.length - 1].id); G.playCollege(st); G.declare(st); G.runCombine(st, true); G.enterDraft(st);
  offers.n++; if (st.draft.glOffer) offers.gl++; const band = !st.draft.slot ? 'UD' : st.draft.slot <= 14 ? '1-14' : st.draft.slot <= 30 ? '15-30' : '31+'; (offers.byBand[band] = offers.byBand[band] || [0, 0])[1]++; if (st.draft.glOffer) offers.byBand[band][0]++;
  st.draft.glOffer = true; runs++;
  G.assignGLeague(st); if (st.stash.kind !== 'gl' || st.teamId !== -1 || st.stage !== 'training' || !st.college.tier) fail('assign');
  const c0 = st.contract.salary; G.train(st, G.autoAlloc(st.player, G.trainingInfo(st).points)); if (st.stage !== 'intl_ready') fail('stage after training ' + st.stage);
  for (let yr = 1; yr <= 3; yr++) {
    const rec = G.playIntl(st); ppg.push(rec.line.pts); if (rec.tier !== 'gleague' || rec.line.gp < 8 || !Number.isFinite(rec.line.pts) || st.glYears.length !== yr || !/^G League/.test(rec.label)) fail('gl season ' + yr);
    const w = G.teamWant(st); V[w.verdict] = (V[w.verdict] || 0) + 1; if (!w.reasons.length || !Number.isFinite(w.score)) fail('want');
    if (w.verdict === 'develop' && yr < 3) { const pr = G.pushForSpot(st); if (typeof pr.ok !== 'boolean' || !pr.text) fail('push'); if (pr.ok) break; G.stashStay(st); G.train(st, G.autoAlloc(st.player, G.trainingInfo(st).points)); continue; }
    if (w.verdict !== 'develop' || yr === 3) break; G.stashStay(st); G.train(st, G.autoAlloc(st.player, G.trainingInfo(st).points));
  }
  G.joinFromStash(st); called++;
  if (st.teamId !== st.stash.teamId || st.contract.type !== 'rookie' || st.contract.salary !== c0 || st.stage !== 'training' || st.afterTraining !== 'pro_first') fail('call-up state');
  G.train(st, G.autoAlloc(st.player, G.trainingInfo(st).points)); const r = G.playSeason(st); if (!r || !Number.isFinite(r.pts) || r.gp < 1) fail('first NBA season');
}
const avg = (a) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
console.log(JSON.stringify({ runs, called, verdicts: V, glPpg: avg(ppg), offerShare: (offers.gl / offers.n).toFixed(2), byBand: offers.byBand, bad }));
console.log(bad ? 'FAILED' : 'gleague OK'); process.exit(bad ? 1 : 0);
