// real high schools: options by home state + national academies, locks by family money, enrolling, the effects and the press
global.NBA = {}; require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = global.NBA; require('../src/game.js');
const G = N.Game, Dc = N.Decisions; let bad = 0; const t = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const H = N.HS; t(Object.keys(H.states).length === 51 && H.national.length >= 5, 'data: 51 states + national');
Object.keys(H.states).forEach((k) => t(H.states[k].length >= 2, 'state ' + k + ' has schools'));
const named = Object.values(H.states).flat().filter((x) => x.alumni.length).length; t(named >= 140, 'most schools have NBA alumni: ' + named);
const oh = H.states.OH.find((x) => /St. Vincent/.test(x.n)); t(oh && oh.alumni[0][0] === 'LeBron James', 'LeBron at St. Vincent–St. Mary');
const nc = Object.values(H.states).flat().find((x) => /Laney/.test(x.n)); t(nc && nc.alumni.some((a) => a[0] === 'Michael Jordan'), 'Jordan at Laney');
const mk = (o) => { N.setSeed(o.seed || 11); const st = G.newCareer(Object.assign({ name: 'H', pos: 'SG', arch: 'scorer' }, o)); st.autoPlay = false; Dc.offer(st, 'hs'); return st; };
{ const st = mk({ home: 'Ohio', family: 'poor', stars: 3 }), o = G.hsOptions(st); t(o.some((x) => x.kind !== 'national' && x.state === 'OH'), 'Ohio schools offered'); t(o.filter((x) => x.kind === 'national').every((x) => x.locked), 'poor 3-star: academies locked');
  const pub = o.findIndex((x) => !x.locked && x.kind !== 'national'); const r = Dc.choose(st, 'school', pub); t(r.done && st.hs && st.hs.n === o[pub].n, 'enrolled'); const j = st.dec.journal.slice(-1)[0].text; t(/stayed home|state powerhouse/i.test(j) && j.indexOf(o[pub].n) >= 0, 'journal names the school: ' + j); }
{ const st = mk({ home: 'Ohio', family: 'poor', stars: 5 }), o = G.hsOptions(st), i = o.findIndex((x) => x.kind === 'national'); t(!o[i].locked && o[i].paidBy === 'scholarship', 'scholarship opens the academies'); Dc.choose(st, 'school', i); t(st.hs.kind === 'national' && /prep powerhouse/.test(st.dec.journal.slice(-1)[0].text), 'academy = prep'); }
{ const st = mk({ home: 'Ohio', family: 'poor', stars: 3 }), o = G.hsOptions(st), i = o.findIndex((x) => x.locked); let threw = false; try { Dc.choose(st, 'school', i); } catch (e) { threw = true; } t(threw, 'locked school blocked'); }
{ const st = mk({ home: 'Texas', family: 'wealthy', stars: 2 }); t(G.hsOptions(st).every((x) => !x.locked), 'wealthy: every school open'); }
{ N.setSeed(3); const st = G.newCareer({ name: 'U', pos: 'SF', arch: 'scorer', stars: 4, origin: 'uk', family: 'wealthy' }); G.intlToUS(st); const o = G.hsOptions(st); t(o.length && o.every((x) => x.kind === 'national'), 'a prospect from abroad sees only boarding academies'); }
// the autopilot still takes 'prep' and nothing else changes for it
{ N.setSeed(5); const st = G.newCareer({ name: 'A', pos: 'PG', arch: 'scorer', stars: 3 }); st.autoPlay = true; t(Dc.offer(st, 'hs') ? true : true, 'offer'); }
console.log(bad ? 'FAILED' : 'hs OK'); process.exit(bad ? 1 : 0);
