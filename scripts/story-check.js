// v104: free-agent meetings, rumors, buyouts, coaches, rivals, life, teammates, classmates, lottery night
global.NBA = {}; require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = global.NBA; require('../src/game.js');
const G = N.Game, Dc = N.Decisions, X = N.Story, R = { seasons: 0, pitches: 0, cond: 0, condOk: 0, rumor: 0, buyout: 0, bench: 0, benchCut: 0, rival: 0, life: {}, mates: 0, lottery: 0, lobbyOk: 0, lobbyPlaced: 0, stake: 0, bad: 0 };
const fail = (m) => { R.bad++; if (R.bad < 10) console.log('FAIL', m); };
const clone = (st, rec) => { const c = JSON.parse(JSON.stringify(st)); c.autoPlay = false; c.dec.pending = null; if (rec) c.proSeasons.push(JSON.parse(JSON.stringify(rec))); return c; };
let IN = false;
N.onSeasonLog = (st, rec) => { if (IN) return; IN = true; try { R.seasons++; const c = clone(st, rec), L = c.league;
  // free agency
  L.teams.slice(0, 3).forEach((t) => { if (t.id === c.teamId) return; const pc = X.pitchOf(c, t.id); R.pitches++; if (!pc || !pc.role || /undefined|NaN/.test(JSON.stringify(pc))) fail('pitch ' + JSON.stringify(pc)); const tg = X.faTargets(c, t.id); if (tg.length) { const r = X.faCondition(c, t.id, tg[0].id); R.cond++; if (r.ok) { R.condOk++; if (N.rosterOf(L, t).every((q) => q.id !== tg[0].id)) fail('cond star not moved'); } } });
  // rumors / buyout / benching (forced situations)
  const i30 = c.matchLog.findIndex((x) => x.k === 'g' && !x.po && x.n === 38); c.matchIdx = i30; c.matchLog.slice(0, i30).forEach((x) => { if (x.k === 'g') x.w = 0; });
  if (Dc.offer(c, 'rumor')) { R.rumor++; const v = Dc.view(c); Dc.choose(c, v.options[R.rumor % 3].key); }
  const i58 = c.matchLog.findIndex((x) => x.k === 'g' && !x.po && x.n === 58); c.matchIdx = i58; c.player.age = Math.max(30, c.player.age); c.contract.left = 1; c.contract.type = 'veteran';
  if (Dc.offer(c, 'buyout')) { R.buyout++; const v = Dc.view(c); if (v.options.length < 2) fail('buyout options'); Dc.choose(c, 'stay'); }
  { const b = clone(st, rec), i25 = b.matchLog.findIndex((x) => x.k === 'g' && !x.po && x.n === 25); b.matchIdx = i25; b.matchLog.slice(0, i25).forEach((x) => { if (x.k === 'g' && !x.dnp) x.r = 5.5; }); const f = Dc.state(b).flags; f.coaches = f.coaches || {}; const cs = N.Room.coachOf(b, b.teamId); cs.style = Object.keys(N.Room.STYLES).find((k) => N.Room.STYLES[k].like(b.player) < 0) || cs.style;
    if (N.ovr(b.player) < 82 && N.Room.fitOf(b) < 0 && Dc.offer(b, 'bench')) {} if (Dc.offer(b, 'benched')) { R.bench++; const m0 = b.matchLog[i25 + 1].m; Dc.choose(b, 'accept'); const it = b.matchLog.slice(i25).find((x) => x.k === 'g' && !x.dnp); if (it && it.tg.includes('Reduced role')) R.benchCut++; else fail('no reduced role'); } }
  // coach, rival, life, teammates
  const fo = X.fireCoachOdds(c); if (!fo || !(fo.odds >= 3)) fail('coach odds'); X.fireCoach(c);
  const d = Dc.state(c); if (!d.rival) { const q = N.rosterOf(L, L.teams.find((t) => t.id !== c.teamId))[0]; d.rival = { id: q.id, name: q.name, since: N.seasonLabel(L.year) }; }
  X.rivalRecord(c); const rc = X.rivalCard(c); R.rival++; if (!rc || rc.share < 5 || rc.share > 95 || /NaN/.test(JSON.stringify(rc))) fail('rival ' + JSON.stringify(rc));
  const lf = X.lifeOpen(c); if (lf) { const ev = X.LIFE[lf.key]; R.life[lf.key] = (R.life[lf.key] || 0) + 1; const e0 = c.earnings; X.lifeChoose(c, ev.opts[0][0]); if (!(c.earnings >= 0)) fail('earnings'); }
  R.mates += X.mateNews(c).length;
  // lottery night: lobby, then the real draft honours the plan
  const lt = X.lotteryInfo(c);
  if (lt) { R.lottery++; const pl = X.runLottery(c), slot = pl.order.indexOf(c.teamId) + 1, pr = X.prospects(c), pick = pr[Math.min(pr.length - 1, slot - 1 + 2)] || pr[pr.length - 1]; const r = X.lobby(c, pick.id);
    if (r.ok) { R.lobbyOk++; N.npcDraft(L); const q = L.players[pick.id]; if (q && q.teamId === c.teamId && q.draftSlot === slot) R.lobbyPlaced++; else fail('lobbied pick not placed ' + (q && q.teamId) + '/' + c.teamId + ' slot ' + (q && q.draftSlot) + '/' + slot); } }
  c.earnings = 400; const so = X.stakeOptions(c); if (so.length) { X.buyStake(c, so[0].teamId); R.stake++; }
} catch (e) { fail(e.stack.split('\n').slice(0, 3).join(' | ')); } finally { IN = false; } };
for (let i = 0; i < 4; i++) { N.setSeed(6100 + i); const st = G.newCareer({ name: 's' + i, pos: ['SF', 'PG', 'C', 'SG'][i % 4], arch: ['scorer', 'twoway', 'shooter', 'generational'][i % 4], stars: [3, 4, 5, 2][i % 4] }); G.auto(st, {}); }
console.log(JSON.stringify(R));
if (R.bad || !R.cond || !R.rumor || !R.buyout || !R.lottery) { console.log('FAILED'); process.exit(1); } console.log('story OK');
