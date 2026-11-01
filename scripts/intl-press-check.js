// rookies who came up through Europe: press questions mention their country/league/club, never college or high school, and nothing is left unfilled
global.NBA = {}; require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = global.NBA; require('../src/game.js');
const G = N.Game; let bad = 0, pools = 0, intlQ = 0, collegeQ = 0; const seen = new Set();
const fail = (m) => { bad++; if (bad < 8) console.log('FAIL', m); };
N.onSeasonLog = (st, rec) => {
  if (st.proSeasons.length) return; const ml = st.matchLog;
  ml.forEach((it, i) => { if (it.k !== 'g' || it.dnp || !(it.pc || i === 0)) return; const c = JSON.parse(JSON.stringify(st)); c.autoPlay = false; c.matchIdx = i; c.dec.pending = null; let ctx = null; try { ctx = G.pressOpen(c); } catch (e) { fail('pressOpen threw ' + e.message); return; } if (!ctx) return; pools++;
    ctx.pool.forEach((q) => { if (/\{|undefined|NaN/.test(q.text)) fail('unfilled: ' + q.text); if (/Serbia|Spain|France|Turkey|Lithuania|Greece|Germany|Italy|Croatia|Slovenia|United Kingdom|EuroLeague|ABA|ACB|LNB|BBL|LKL|BSL/.test(q.text)) intlQ++; if (/college(?! players)|high school|freshman|national title|transfer/i.test(q.text)) { collegeQ++; fail('college wording for an intl rookie: ' + q.text); } seen.add(q.text.slice(0, 50)); });
    G.pressFacts(c, ctx); });
};
['uk', 'serbia', 'spain', 'france', 'turkey', 'lithuania'].forEach((k, i) => { N.setSeed(9500 + i); const st = G.newCareer({ name: 'P' + i, pos: ['PG', 'SF', 'C'][i % 3], arch: 'scorer', stars: 4, origin: k }); st.autoPlay = true; G.auto(st, {}); });
console.log(JSON.stringify({ pools, intlQ, collegeQ, bad }));
console.log(bad || !pools ? 'FAILED' : 'intl-press OK'); process.exit(bad || !pools ? 1 : 0);
