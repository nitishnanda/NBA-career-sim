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
// season plans, Euro contracts, the national team and the end-of-season report
{ const P = {}; let nat = 0, years = 0, bad0 = bad;
  ['takeover', 'team', 'develop', 'showcase'].forEach((pl, pi) => { for (let i = 0; i < 10; i++) { N.setSeed(9400 + i); const st = G.newCareer({ name: 'P' + i, pos: 'SF', arch: 'scorer', stars: 4, origin: ['serbia', 'spain', 'france', 'uk', 'greece'][i % 5] }); G.chooseClub(st, G.intlOptions(st).filter((x) => x.home)[0].id); st.intlPlan = pl;
    if (!st.euroDeal || !(st.euroDeal.salary > 0)) { fail('no euro deal'); continue; } const e0 = st.earnings, left0 = st.euroDeal.left; const rec = G.playIntl(st); years++; (P[pl] = P[pl] || []).push([rec.line.pts, rec.line.ts, parseInt(rec.record)]);
    if (rec.plan !== pl) fail('plan not recorded'); if (!(st.earnings > e0)) fail('no salary earned'); if (st.euroDeal.left !== left0 - 1 && !rec.reSigned) fail('deal years'); if (rec.nat) { nat++; if (!rec.nat.event || !rec.nat.result || !(rec.nat.line.pts >= 0)) fail('nat shape'); }
    const rep = G.intlReport(st, rec); if (!rep.media || rep.media.length !== 3 || rep.media.some((m) => !m.text || /\{|undefined|NaN/.test(m.text))) fail('media'); if (!rep.interest || rep.interest.length !== 3 || rep.interest.some((x) => !x.nick || !(x.fit >= 35))) fail('interest'); if (rep.prog.ovr == null) fail('prog');
    if (pl === 'develop' && !(st.bonusPoints >= 1)) fail('develop bonus points'); } });
  const av = (k, j) => (P[k].reduce((a, x) => a + x[j], 0) / P[k].length);
  console.log('plans ppg: takeover ' + av('takeover', 0).toFixed(1) + ' team ' + av('team', 0).toFixed(1) + ' develop ' + av('develop', 0).toFixed(1) + ' showcase ' + av('showcase', 0).toFixed(1) + ' | wins team ' + av('team', 2).toFixed(1) + ' vs takeover ' + av('takeover', 2).toFixed(1) + ' | national team selections ' + nat + '/' + years);
  if (!(av('takeover', 0) > av('team', 0))) fail('takeover should score more than fit-in'); if (!nat) fail('no national team call-ups'); }
// the out clause: leaving early costs a buyout only without it
{ N.setSeed(9450); const a = G.newCareer({ name: 'C1', pos: 'PF', arch: 'scorer', stars: 4, origin: 'spain' }); G.chooseClub(a, G.intlOptions(a).filter((x) => x.home && x.tier !== 'academy')[0].id); const sal = a.euroDeal.salary; G.setClause(a, true); if (!(a.euroDeal.salary < sal) || G.euroBuyout(a) !== 0) fail('clause'); G.setClause(a, false); if (!(G.euroBuyout(a) >= 0) || a.euroDeal.salary !== sal) fail('no clause'); }
{ const P2 = N.Press, facts = { outlets: ['A', 'B', 'C'], clubs: ['Knicks', 'Hawks', 'Jazz'] };
  const ok = P2.checkClaudeIntl({ media: [{ outlet: 'x', text: 'He averaged 14.2 points and the scouts noticed.' }, { outlet: 'y', text: 'A real NBA-caliber prospect now, with a clear role.' }, { outlet: 'z', text: 'Another strong year against grown men in Europe.' }], scouts: [{ team: 'Knicks', text: 'They see a combo guard who fits their rotation.' }, { team: 'Fake FC', text: 'This team does not exist at all.' }] }, facts);
  if (!ok || ok.media.length !== 3 || ok.media[0].outlet !== 'A' || ok.scouts.length !== 1) fail('checkClaudeIntl'); if (P2.checkClaudeIntl({ media: [{ text: 'short' }] }, facts) !== null) fail('checkClaudeIntl rejects short'); if (!/DATA/.test(P2.claudeIntlPrompt({}))) fail('intl prompt'); }
const avg = (a) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
console.log(JSON.stringify({ careers: n, bad, years: agg.tier, ppg: Object.fromEntries(Object.keys(agg.ppg).map((t) => [t, avg(agg.ppg[t])])), medianSlot: agg.slots.sort((a, b) => a - b)[Math.floor(agg.slots.length / 2)], honors: agg.honors }));
console.log(bad ? 'FAILED' : 'intl OK'); process.exit(bad ? 1 : 0);
