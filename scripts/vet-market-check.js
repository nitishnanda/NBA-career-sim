// a veteran with a big season is wanted: a 36-year-old whose rating has slipped but who just posted a top-10 line is neither forced to retire nor ignored
global.NBA = {}; require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = global.NBA; require('../src/game.js');
const G = N.Game; let bad = 0;
N.setSeed(77); const st = G.newCareer({ name: 'old', pos: 'SF', arch: 'scorer', stars: 3 }); G.auto(st, { seasons: 4 });
const p = st.player; p.age = 36; st.finalYear = false; st.autoPlay = false; st.contract.left = 0;
Object.keys(p.attrs).forEach((k) => { p.attrs[k] = Math.max(40, p.attrs[k] - 14); });   // a slipped rating
const rec = st.proSeasons[st.proSeasons.length - 1];
const before = Object.assign({}, rec); rec.gp = 72; rec.perfRank = 400;
const v0 = G.marketV(st), d0 = G.decisionOptions(st); rec.perfRank = 6; const v1 = G.marketV(st), d1 = G.decisionOptions(st);
console.log({ ovr: d1.ovr, vSlipped: v0.toFixed(1), vTop10: v1.toFixed(1), retire0: d0.mustRetire, retire1: d1.mustRetire, offers: (d1.market || []).length });
if (!(v1 > v0 + 5)) { bad++; console.log('FAIL: a top-10 season does not lift the value'); }
if (d1.mustRetire) { bad++; console.log('FAIL: a top-10 36-year-old was told to retire'); }
process.exit(bad ? 1 : 0);
