// Career earnings by All-Star tier, sim vs real (real: data/real-targets-extra.json). Usage: node scripts/earnings-check.js [n=300]
require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = require('../src/game.js');
const real = require('../data/real-targets-extra.json').career_earnings_by_all_star_tier_1996_2021_careers;
const G = N.Game; const n = +process.argv[2] || 300;
const ARCH = ['generational', 'scorer', 'twoway', 'defender', 'shooter', 'dominator'];
const POS = { generational: ['SF', 'PF', 'C', 'PG'], scorer: ['SG', 'SF', 'PF'], twoway: ['SF', 'SG', 'PF'], defender: ['C', 'PF'], shooter: ['PG', 'SG', 'SF'], dominator: ['PG', 'SF', 'C', 'PF'] };
const tiers = { never_all_star: [], '1-2 all-star': [], '3-5 all-star': [], '6-9 all-star': [], '10+ all-star': [] };
for (let i = 0; i < n; i++) {
  const arch = ARCH[i % 6];
  const st = G.newCareer({ name: 'x', pos: POS[arch][i % POS[arch].length], arch, home: 'Ohio', seed: 8000 + i }); G.auto(st);
  const a = st.career.awards['All-Star'] || 0;
  const k = a === 0 ? 'never_all_star' : a <= 2 ? '1-2 all-star' : a <= 5 ? '3-5 all-star' : a <= 9 ? '6-9 all-star' : '10+ all-star';
  tiers[k].push({ seasons: st.proSeasons.length, nominal: st.earnings, e26: st.earnings26, cy: st.capYears });
}
const avg = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
console.log('tier'.padEnd(16), 'n'.padStart(4), 'seasons'.padStart(9), 'cap-years sim/real'.padStart(20), '  2026$M (sim)'.padStart(15), ' real nominal M (their era)');
Object.keys(tiers).forEach((k) => { const t = tiers[k]; const r = real[k]; if (!t.length) return;
  console.log(k.padEnd(16), String(t.length).padStart(4), (avg(t.map((x) => x.seasons)).toFixed(1) + '/' + (r ? r.mean_seasons : '?')).padStart(9), (avg(t.map((x) => x.cy)).toFixed(2) + ' / ' + (r ? r.mean_cap_years : '?')).padStart(20), Math.round(avg(t.map((x) => x.e26))).toString().padStart(14), '   ' + (r ? r.mean_nominal_m : '?')); });
