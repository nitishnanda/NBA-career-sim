// sim as you go: results are decided when games are played; the season model's win total holds when nobody intervenes; decisions move real wins; series stay valid
global.NBA = {}; require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = global.NBA; require('../src/game.js');
const G = N.Game, R = { seasons: 0, games: 0, changed: 0, totalDiff: [], modGain: [], poSeries: 0, swings: 0, bad: 0, champs: { pre: 0, live: 0 } };
const fail = (m) => { R.bad++; if (R.bad < 12) console.log('FAIL', m); };
const seriesOk = (log) => { const by = {}; log.forEach((x) => { if (x.k === 'g' && x.po && !x.pi) (by[x.si] = by[x.si] || []).push(x); }); return Object.values(by).every((gs) => { let w = 0, l = 0; for (const x of gs) { if (w === 4 || l === 4) return false; if (x.w) w++; else l++; } return w === 4 || l === 4; }); };
function season(seed, modReg, modPo) {
  N.setSeed(seed); const st = G.newCareer({ name: 'g' + seed, pos: ['PG', 'SF', 'C'][seed % 3], arch: ['scorer', 'twoway', 'generational'][seed % 3], stars: 3 + seed % 3 });
  try { G.auto(st, { onDecision: (s) => { if (s.proSeasons.length >= 2) throw 'stop'; } }); } catch (e) { if (e !== 'stop') throw e; }
  st.autoPlay = false; st.autoDecide = false; const d = G.decisionOptions(st);
  try { if (d.expiring) { const o = d.resign || (d.offers || [])[0]; if (!o) return null; G.decide(st, d.resign ? 'resign' : 'switch', { teamId: o.teamId, salary: o.salary, years: 2 }); } else G.decide(st, 'stay'); } catch (e) { return null; }
  G.train(st, G.autoAlloc(st.player, G.trainingInfo(st).points)); if (st.dec) st.dec.pending = null; if (st.stage === 'season_play' && st.matchLog) return null;
  G.playSeason(st); const rec = st.proSeasons[st.proSeasons.length - 1], pre = rec.wins, layout = st.matchLog.map((x) => x.k === 'g' ? x.w : null), preChamp = (rec.awards || []).includes('NBA Champion');
  st.matchLog.forEach((x) => { if (x.k === 'g' && !x.po && modReg) x.mod = modReg; if (x.k === 'g' && x.po && !x.pi && modPo) x.mod = modPo; });
  for (let i = 0; i < st.matchLog.length; i++) { const x = st.matchLog[i]; if (x.k === 'g' && !x.rs) { const before = st.matchLog; st.matchIdx = i; G.resolveGame(st, i); if (st.matchLog !== before) R.swings++; } }
  const log = st.matchLog, reg = log.filter((x) => x.k === 'g' && !x.po), wins = reg.filter((x) => x.w).length;
  if (log.some((x) => x.k === 'g' && !x.rs)) fail('unresolved games'); if (!seriesOk(log)) fail('series broken');
  if (wins !== st.proSeasons[st.proSeasons.length - 1].wins) fail('record ' + wins + ' vs rec ' + st.proSeasons[st.proSeasons.length - 1].wins);
  log.forEach((x, i) => { if (x.k === 'g' && x.f != null && (!!x.w) !== (x.f > x.a)) fail('score vs result at ' + i); });
  { const L = st.league, ut = L.teams[st.teamId], row = st.leagueSnap && st.leagueSnap.standings && st.leagueSnap.standings.find((x) => x.id === st.teamId);
    if (wins !== pre) { R.reseeds = (R.reseeds || 0) + (st.reseed && st.reseed.y === L.year ? 1 : 0); if (!(st.reseed && st.reseed.y === L.year)) fail('no reseed after a changed record'); }
    if (ut.wins !== wins) fail('team wins ' + ut.wins + ' vs played ' + wins); if (row && row.wins !== wins) fail('standings row ' + row.wins + ' vs played ' + wins);
    const hdr = log.find((x) => x.k === 'hdr' && /^Regular season complete/.test(x.text)); if (hdr && hdr.text.indexOf(wins + '-' + (reg.length - wins)) < 0) fail('banner ' + hdr.text + ' vs ' + wins); }
  { const pis = log.filter((x) => x.k === 'g' && x.pi); pis.forEach((x) => { R.pi = (R.pi || 0) + 1; const hd = (() => { let h = log.indexOf(x); while (h > 0 && log[h].k !== 'hdr') h--; return log[h].text; })(), m = hd.match(/Play-In Tournament · (.+?) · vs /); if (!m) fail('pi header ' + hd); else if (st.piForce && st.piForce[m[1]] != null && (!!x.w) !== (st.piForce[m[1]] === 1)) fail('play-in result vs piForce ' + m[1]); if (!x.rs) fail('unresolved pi'); if ((!!x.w) !== (x.f > x.a)) fail('pi score'); });
    if (st.piForce && Object.keys(st.piForce).length) R.piForced = (R.piForced || 0) + 1;
    const br = st.leagueSnap && st.leagueSnap.bracket; if (!br || br.length !== 4 || br[3].series.length !== 1 || br[0].series.length !== 8) fail('bracket shape'); else { R.brackets = (R.brackets || 0) + 1; br.forEach((rd) => rd.series.forEach((x) => { if (!(Math.max(x.wa, x.wb) === 4 && Math.min(x.wa, x.wb) < 4)) fail('bracket series ' + x.a + ' ' + x.wa + '-' + x.wb); })); if (br[3].series[0].w !== st.leagueSnap.champion) fail('champion vs finals'); } }
  R.seasons++; R.games += reg.length; if (!modReg && !modPo) R.changed += reg.filter((x, k) => { const i = log.indexOf(x); return layout[i] != null && !!layout[i] !== !!x.w; }).length;
  R.poSeries += new Set(log.filter((x) => x.po && !x.pi && x.k === 'g').map((x) => x.si)).size;
  if (preChamp) R.champs.pre++; if ((st.proSeasons[st.proSeasons.length - 1].awards || []).includes('NBA Champion')) R.champs.live++;
  return { pre, wins };
}
for (let i = 0; i < 10; i++) { const r = season(400 + i, 0, 0); if (r) R.totalDiff.push(r.wins - r.pre); }
for (let i = 0; i < 10; i++) { const r = season(400 + i, 0.08, 0.15); if (r) R.modGain.push(r.wins - r.pre); }
for (let i = 0; i < 16; i++) season(600 + i, -0.07, -0.05);   // worse teams: the play-in and the lottery
const avg = (a) => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : 'n/a';
console.log(JSON.stringify({ seasons: R.seasons, regGames: R.games, resultsChangedFromLayout: R.changed, noDecisionWinDiff: R.totalDiff, avgNoDecision: avg(R.totalDiff), withModsWinGain: R.modGain, avgGain: avg(R.modGain), poSeries: R.poSeries, swings: R.swings, reseeds: R.reseeds || 0, playInGames: R.pi || 0, withPiForce: R.piForced || 0, brackets: R.brackets || 0, champs: R.champs, bad: R.bad }));
if (R.bad || !R.seasons) { console.log('FAILED'); process.exit(1); } console.log('simgo OK');
