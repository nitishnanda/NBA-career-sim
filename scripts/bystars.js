require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = require('../src/game.js');
const G = N.Game; const n = +process.argv[2] || 300;
const ARCH = ['generational', 'scorer', 'twoway', 'defender', 'shooter', 'dominator'];
const POS = { generational: ['SF', 'PF', 'C', 'PG'], scorer: ['SG', 'SF', 'PF'], twoway: ['SF', 'SG', 'PF'], defender: ['C', 'PF'], shooter: ['PG', 'SG', 'SF'], dominator: ['PG', 'SF', 'C', 'PF'] };
const by = {};
for (let i = 0; i < n; i++) {
  const arch = ARCH[i % 6];
  const st = G.newCareer({ name: 'P', pos: POS[arch][i % POS[arch].length], arch, home: 'Ohio', seed: 7000 + i });
  G.auto(st);
  const ps = st.proSeasons, gp = ps.reduce((a, s) => a + s.gp, 0) || 1;
  (by[st.stars] = by[st.stars] || []).push({ yrs: ps.length, ppg: ps.reduce((a, s) => a + s.pts * s.gp, 0) / gp, peak: Math.max(0, ...ps.map(s => s.pts)), peakOvr: Math.max(0, ...ps.map(s => s.ovr)), hof: st.hof.score, slot: st.draft.slot || 61, tier: st.hof.tier, allstars: st.career.awards['All-Star'] || 0 });
}
const avg = a => a.reduce((s, x) => s + x, 0) / a.length;
console.log('stars  n   yrs  ppg  peakPPG  peakOVR  slot  allStars  HOFscore  HOF%(>=85)  starter%(>=15)');
for (const s of [1, 2, 3, 4, 5]) { const r = by[s]; if (!r) continue; console.log(String(s).padStart(4), String(r.length).padStart(4), avg(r.map(x => x.yrs)).toFixed(1).padStart(5), avg(r.map(x => x.ppg)).toFixed(1).padStart(5), avg(r.map(x => x.peak)).toFixed(1).padStart(7), avg(r.map(x => x.peakOvr)).toFixed(0).padStart(8), avg(r.map(x => x.slot)).toFixed(0).padStart(5), avg(r.map(x => x.allstars)).toFixed(1).padStart(8), avg(r.map(x => x.hof)).toFixed(0).padStart(9), (100 * r.filter(x => x.hof >= 85).length / r.length).toFixed(0).padStart(9) + '%', (100 * r.filter(x => x.hof >= 15).length / r.length).toFixed(0).padStart(11) + '%'); }
const tiers = {}; Object.values(by).flat().forEach(x => (tiers[x.tier] = (tiers[x.tier] || 0) + 1));
console.log(tiers);
