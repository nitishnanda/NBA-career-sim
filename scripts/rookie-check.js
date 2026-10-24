// Rookie scoring distribution for user careers (real since 2000: max ~23.5, 20+ ppg about once every 2-3 years league-wide)
require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = require('../src/game.js'); const G = N.Game;
const ARCH = ['generational', 'scorer', 'twoway', 'shooter', 'dominator', 'defender']; const out = [];
for (let i = 0; i < +(process.env.N || 240); i++) {
  const arch = ARCH[i % 6], stars = 3 + (i % 3);
  const st = G.newCareer({ name: 'x', pos: ['SF', 'PG', 'C', 'PF', 'SG'][i % 5], arch, home: 'Ohio', seed: 5100 + i, stars });
  const o = G.collegeOptions(st); G.chooseCollege(st, o[0].id); let guard = 0;
  while (st.stage !== 'pro_ready' && guard++ < 20) { if (st.stage === 'college_ready') G.playCollege(st); else if (st.stage === 'college_decision') G.declare(st); else if (st.stage === 'draft_night') G.startPro(st); else if (st.stage === 'training') { G.train(st, G.autoAlloc(st.player, G.trainingInfo(st).points)); } else break; }
  if (st.stage !== 'pro_ready') continue;
  const rec = G.playSeason(st); if (rec.gp >= 50) out.push({ arch, ppg: rec.pts, slot: st.draft && st.draft.slot, gp: rec.gp });
}
out.sort((a, b) => b.ppg - a.ppg);
console.log('n', out.length, 'top 12', out.slice(0, 12).map((x) => x.arch.slice(0, 4) + ' #' + x.slot + ' ' + x.ppg.toFixed(1)).join(' | '));
const gt = (v) => out.filter((x) => x.ppg >= v).length; console.log('20+', gt(20), '22+', gt(22), '25+', gt(25), 'mean', (out.reduce((a, x) => a + x.ppg, 0) / out.length).toFixed(1));
