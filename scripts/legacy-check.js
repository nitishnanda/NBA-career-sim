// off-court life: agent choice, brand and endorsements across a human career, and the post-retirement ceremonies and path
global.NBA = {}; require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = global.NBA; require('../src/game.js');
const G = N.Game, Dc = N.Decisions, Lg = N.Legacy;
let bad = 0; const fail = (m) => { bad++; console.log('FAIL', m); };
const st0 = {}; let deals = 0, seasons = 0, maxBrand = 0, jersey = 0, hall = 0, earnedSum = 0;
for (let i = 0; i < 10; i++) {
  N.setSeed(2100 + i); const st = G.newCareer({ name: 'L' + i, pos: ['SF', 'PG', 'C'][i % 3], arch: ['scorer', 'twoway'][i % 2], stars: 4 + (i % 2) });
  st.agent = Lg.AGENTS[i % 3].id;
  N.onSeasonLog = (s, rec) => { seasons++; };
  G.auto(st, {});
  if (!st.retired) continue;
  const b = st.brand; if (b) { maxBrand = Math.max(maxBrand, b.score); }
  if (st.autoPlay === false) {}
  const A = Lg.afterlife(st); if (A.jersey) { Lg.doJersey(st); jersey++; try { Lg.doJersey(st); fail('twice'); } catch (e) {} }
  if (A.hall) { hall++; Lg.doSpeech(st, 'emotional'); } else { try { Lg.doSpeech(st, 'humble'); fail('speech without hall'); } catch (e) {} }
  const r = Lg.doPath(st, ['coach', 'analyst', 'gm', 'business', 'family'][i % 5]); if (!r.ms.length) fail('empty path');
}
// a human-style offseason: brandYear pays and offers show up
N.setSeed(2200); const st = G.newCareer({ name: 'H', pos: 'SF', arch: 'scorer', stars: 5 });
st.agent = 'guru'; st.brand = { score: 70, deals: [], offers: null, earned: 0, year: null };
const e0 = st.earnings; const r = Lg.brandYear(st); const o = Lg.endorseOffers(st);
if (!(o.length >= 2)) fail('offers ' + o.length);
Lg.answerOffer(st, o[0].id, true); if (st.brand.deals.length !== 1) fail('deal not signed');
st.league.year++; const e1 = st.earnings; Lg.brandYear(st); if (!(st.earnings > e1 - 0.0001 + 0 && st.brand.earned > 0)) fail('no endorsement income ' + st.earnings + ' ' + e1);
console.log(JSON.stringify({ seasons, maxBrand: Math.round(maxBrand), jersey, hall, offers: o.map((x) => x.name + ' $' + x.annual) }));
if (bad) { console.log('FAILED'); process.exit(1); } console.log('legacy OK');
