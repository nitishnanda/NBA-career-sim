// the road through Europe: every country, every star level, club moves, the draft, then the NBA
global.NBA = {}; require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = global.NBA; require('../src/game.js');
const G = N.Game, I = N.Intl; let bad = 0, n = 0; const fail = (m) => { bad++; if (bad < 8) console.log('FAIL', m); };
const agg = { tier: {}, ppg: {}, slots: [], honors: {} };
Object.keys(I.COUNTRIES).forEach((k, ci) => [1, 3, 5].forEach((stars, si) => {
  N.setSeed(8100 + ci * 10 + si); const st = G.newCareer({ name: 'E' + ci + si, pos: ['PG', 'SF', 'C'][si], arch: ['scorer', 'twoway', 'shooter'][si], stars, origin: k }); n++;
  if (!st.origin || !st.origin.intl || st.player.country !== k) { fail('origin not set ' + k); return; }
  st.autoPlay = true; G.auto(st, {});
  if (!st.collegeYears.length || !st.collegeYears.every((y) => y.line.gp >= 8 && Number.isFinite(y.line.pts) && y.tourney && y.school)) fail('bad intl years ' + k + ' ' + stars);
  st.collegeYears.forEach((y) => { agg.tier[y.tier] = (agg.tier[y.tier] || 0) + 1; (agg.ppg[y.tier] = agg.ppg[y.tier] || []).push(y.line.pts); (y.honors || []).forEach((h) => { agg.honors[h] = (agg.honors[h] || 0) + 1; }); });
  if (st.draft) agg.slots.push(st.draft.slot || 99); if (!st.proSeasons.length) fail('never reached the NBA ' + k);
  if (st.college.intl !== true && !st.college.tier) fail('club not stored');
}));
// the US route from the UK
{ N.setSeed(8999); const st = G.newCareer({ name: 'U', pos: 'SG', arch: 'scorer', stars: 4, origin: 'uk' }); G.intlToUS(st); if (st.origin.intl !== false || st.stage !== 'hs') fail('US route'); st.autoPlay = true; G.auto(st, {}); if (!st.collegeYears.length || st.collegeYears[0].tier) fail('US route did not play college'); }
// draft and stash: force the offer, stash, play another year, get news, join; the rookie deal comes from the original pick
{ let stashed = 0, joined = 0;
  for (let i = 0; i < 24 && joined < 3; i++) {
    N.setSeed(9300 + i); const st = G.newCareer({ name: 'S' + i, pos: 'PF', arch: 'scorer', stars: 3, origin: ['serbia', 'spain', 'france', 'lithuania'][i % 4] }); st.autoPlay = true;
    G.chooseClub(st, G.intlOptions(st).filter((x) => x.home)[0].id); G.playIntl(st); G.stayIntl(st); G.train(st, G.autoAlloc(st.player, G.trainingInfo(st).points)); G.playIntl(st);
    G.declare(st); G.runCombine(st, true); G.enterDraft(st); if (!st.draft.slot) continue; st.draft.stashOffer = true;
    const slot = st.draft.slot, sal0 = st.contract.salary; G.stashPlayer(st); stashed++;
    if (st.stash.slot !== slot || st.teamId !== -1 || st.contract !== null || st.stage !== 'training') fail('stash state');
    G.train(st, G.autoAlloc(st.player, G.trainingInfo(st).points)); if (st.stage !== 'intl_ready') fail('after training: ' + st.stage);
    const rec = G.playIntl(st); if (rec.mustDeclare || st.stage !== 'intl_decision' || !st.stash) fail('stashed season');
    G.stashStay(st); G.train(st, G.autoAlloc(st.player, G.trainingInfo(st).points)); G.playIntl(st);
    const bo = G.buyoutM(st), e0 = st.earnings; G.joinFromStash(st); joined++;
    if (st.contract.type !== 'rookie' || st.teamId !== st.stash.teamId || st.stage !== 'training' || st.afterTraining !== 'pro_first' || !(st.contract.salary > 0)) fail('join state');
    G.train(st, G.autoAlloc(st.player, G.trainingInfo(st).points)); const r = G.playSeason(st); if (!r || !Number.isFinite(r.pts) || r.gp < 1) fail('first NBA season after a stash');
  }
  console.log('stash: stashed ' + stashed + ' joined ' + joined); if (joined < 2) fail('stash flow never completed'); }
const avg = (a) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
console.log(JSON.stringify({ careers: n, bad, years: agg.tier, ppg: Object.fromEntries(Object.keys(agg.ppg).map((t) => [t, avg(agg.ppg[t])])), medianSlot: agg.slots.sort((a, b) => a - b)[Math.floor(agg.slots.length / 2)], honors: agg.honors }));
console.log(bad ? 'FAILED' : 'intl OK'); process.exit(bad ? 1 : 0);
