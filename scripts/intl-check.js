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
const avg = (a) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
console.log(JSON.stringify({ careers: n, bad, years: agg.tier, ppg: Object.fromEntries(Object.keys(agg.ppg).map((t) => [t, avg(agg.ppg[t])])), medianSlot: agg.slots.sort((a, b) => a - b)[Math.floor(agg.slots.length / 2)], honors: agg.honors }));
console.log(bad ? 'FAILED' : 'intl OK'); process.exit(bad ? 1 : 0);
