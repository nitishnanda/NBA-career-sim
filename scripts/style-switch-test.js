// Mid-season game-plan change: league results must not move, revealed games must not change, season record must match the tiles.
require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = require('../src/game.js'); const G = N.Game;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b); let fails = 0; const ck = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
for (const arch of ['generational', 'dominator', 'scorer']) {
  const st = G.newCareer({ name: 'x', pos: 'SF', arch, home: 'Ohio', seed: 321, stars: 5, ceiling: 92 });
  let guard = 0; while (st.stage !== 'pro_ready' && guard++ < 30) { if (st.stage === 'scouting') st.stage = 'college_pick'; else if (st.stage === 'college_pick') { const o = G.collegeOptions(st); G.chooseCollege(st, o[0].id); } else if (st.stage === 'college_ready') G.playCollege(st); else if (st.stage === 'college_decision') G.declare(st); else if (st.stage === 'combine') G.enterDraft(st); else if (st.stage === 'draft_night') G.startPro(st); else if (st.stage === 'training') G.train(st, G.autoAlloc(st.player, G.trainingInfo(st).points)); }
  G.playSeason(st); const log0 = JSON.parse(JSON.stringify(st.matchLog)), snap0 = JSON.parse(JSON.stringify(st.leagueSnap)), rec0 = JSON.parse(JSON.stringify(st.proSeasons[st.proSeasons.length - 1]));
  const idx = log0.findIndex((x) => x.k === 'g' && x.n === 40 && !x.po) + 1; st.matchIdx = idx;
  const r = G.setStyle(st, 'score'); ck(r.ok, arch + ' setStyle ok');
  const rec = st.proSeasons[st.proSeasons.length - 1];
  ck(eq(st.matchLog.slice(0, idx), log0.slice(0, idx)), arch + ' revealed games unchanged');
  ck(eq(st.leagueSnap.standings, snap0.standings) && eq(st.leagueSnap.leadersO, snap0.leadersO), arch + ' league standings/leaders unchanged');
  const reg = st.matchLog.filter((x) => x.k === 'g' && !x.po), played = reg.filter((x) => !x.dnp), wins = reg.filter((x) => x.w).length;
  ck(reg.length === 82 && wins === rec.wins, arch + ' W-L matches record ' + wins + ' vs ' + rec.wins);
  const avg = played.reduce((a, g) => a + g.pt, 0) / played.length; ck(Math.abs(avg - rec.pts) < 1e-6, arch + ' ppg matches tiles ' + avg.toFixed(2) + ' vs ' + rec.pts.toFixed(2));
  const fut = (log) => { const g = log.slice(idx).filter((x) => x.k === 'g' && !x.po && !x.dnp); return g.reduce((a, x) => a + x.pt, 0) / Math.max(1, g.length); };
  console.log(arch, 'before: ppg', rec0.pts.toFixed(1), 'future-games ppg', fut(log0).toFixed(1), '| after switch to score: ppg', rec.pts.toFixed(1), 'future-games ppg', fut(st.matchLog).toFixed(1), 'ast', rec0.ast.toFixed(1), '->', rec.ast.toFixed(1));
  { const sc = rec.awards.find((a) => /^Scoring Champion/.test(a)), top = st.leagueSnap.leadersO.pts[0].v; ck(!!sc === (rec.gp >= 58 && rec.pts > top), arch + ' scoring title agrees with final ppg ' + rec.pts.toFixed(1) + ' vs best other ' + top.toFixed(1)); if (sc) ck(sc === 'Scoring Champion (' + rec.pts.toFixed(1) + ')', arch + ' title text ' + sc); }
  // switch again and back
  st.matchIdx = Math.min(st.matchLog.length, idx + 20); const r2 = G.setStyle(st, 'playmake'); ck(r2.ok, 'second switch'); const rec2 = st.proSeasons[st.proSeasons.length - 1];
  const reg2 = st.matchLog.filter((x) => x.k === 'g' && !x.po); ck(reg2.filter((x) => x.w).length === rec2.wins, arch + ' W-L after 2nd switch');
  ck(st.styleSeq.length === 3 && st.styleSeq[1][1] === 'score' && st.styleSeq[2][1] === 'playmake', arch + ' seq ' + JSON.stringify(st.styleSeq));
  // switch at game 0
  st.matchIdx = 0; G.setStyle(st, 'defend'); ck(st.styleSeq.length === 1 && st.styleSeq[0][1] === 'defend', 'switch at 0 replaces first segment');
  // playoffs
  st.matchIdx = st.matchLog.length - 2; const r3 = G.setStyle(st, 'score'); ck(r3.ok, 'late switch ok');
}
console.log(fails ? fails + ' FAILURES' : 'all style-switch checks passed');
