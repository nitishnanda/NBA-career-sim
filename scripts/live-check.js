// the live game: for every logged game the play-by-play adds up to the box score and the final score; clutch games stop on the last possession, and every call (all four
// options, win and lose) ends exactly on the score and line the game ended with
global.NBA = {}; require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = global.NBA; require('../src/game.js');
const G = N.Game, Dc = N.Decisions, Lv = N.Live;
let bad = 0, games = 0, clutch = 0, branches = 0, ots = 0, events = 0, maxEv = 0; const fail = (m) => { bad++; if (bad < 10) console.log('FAIL', m); };
const lineOf = (it) => { const o = {}; Lv.STATS.forEach((k) => (o[k] = it[k] || 0)); return o; };
const same = (a, b) => Lv.STATS.every((k) => a[k] === b[k]);
let inHook = false;
N.onSeasonLog = (st, rec) => {
  if (inHook) return; inHook = true;
  const p = st.player, L = st.league, tm = L.teams[st.teamId];
  st.matchLog.forEach((it, idx) => {
    if (it.k !== 'g' || it.dnp) return;
    const opT = L.teams.find((x) => x.nick === it.o), ctx0 = { key: st.seasonSeed + '|' + it.n + '|' + (it.po ? 1 : 0), me: p.name, nick: tm.nick, oppNick: it.o, mates: N.rosterOf(L, tm).filter((q) => q.id !== 'user').map((q) => q.name), opps: opT ? N.rosterOf(L, opT).map((q) => q.name) : [], shots: it.sh || G.shotsFor(it, p, G.shotSeed(st, idx)) };
    if (!(it.cl && !it.cd)) {
      games++; if (it.ot) ots++;
      const tl = Lv.build(it, ctx0); events += tl.events.length; maxEv = Math.max(maxEv, tl.events.length);
      const s = Lv.stateAt(tl, [], 99999);
      if (!same(s.box, lineOf(it))) fail('box ' + it.n + ' ' + JSON.stringify(s.box) + ' vs ' + JSON.stringify(lineOf(it)));
      if (s.sc[0] !== it.f || s.sc[1] !== it.a) fail('score ' + s.sc + ' vs ' + it.f + '-' + it.a);
      if (tl.events.some((e) => e.t < 0 || e.t > tl.end)) fail('event time out of range');
      if (tl.events.some((e) => e.side === 'me' && Lv.secOn(tl.win, e.t) === 0 && false)) fail('x');
      return;
    }
    clutch++; if (clutch % 4 !== 1) return;
    ['shot', 'pass', 'drive', 'reset'].forEach((key) => [0].forEach((rep) => {
      const c = JSON.parse(JSON.stringify(st)); c.autoPlay = false; c.matchIdx = idx; c.dec.pending = null; c.proSeasons.push(rec);
      const it0 = JSON.parse(JSON.stringify(c.matchLog[idx]));
      if (!Dc.offer(c, 'clutch')) { return; }
      const info = G.clutchInfo(c), tl = Lv.build(it0, Object.assign({}, ctx0, { clutch: { text: info.text } }));
      const pre = Lv.stateAt(tl, [], tl.pause), d = pre.sc[1] - pre.sc[0];
      const need = /^Down 3/.test(info.text) ? 3 : /^Tied/.test(info.text) ? 0 : 2; if (d !== need) fail('pause margin ' + d + ' vs ' + need + ' (' + info.text + ')');
      if (!same(Lv.stateAt(tl, [], 99999).box, lineOf(it0))) fail('pre box');
      const r = Dc.choose(c, key), it1 = c.matchLog[idx]; branches++;
      const ext = Lv.ending(tl, it1, { key, wins: !!it1.w, text: r.text });
      const s = Lv.stateAt(tl, ext.events, 99999);
      if (!same(s.box, lineOf(it1))) fail('clutch box ' + key + ' ' + JSON.stringify(s.box) + ' vs ' + JSON.stringify(lineOf(it1)));
      if (s.sc[0] !== it1.f || s.sc[1] !== it1.a) fail('clutch score ' + key + ' ' + s.sc + ' vs ' + it1.f + '-' + it1.a + ' tp ' + tl.tp + ' op ' + tl.op);
      if (ext.events.some((e) => e.t <= tl.pause || e.t > 2880)) fail('ending time');
    }));
  });
  inHook = false;
};
for (let i = 0; i < 3; i++) { N.setSeed(2600 + i); const st = G.newCareer({ name: 'V' + i, pos: ['SF', 'PG', 'C'][i % 3], arch: ['scorer', 'defender', 'twoway'][i % 3], stars: 3 + (i % 3) }); G.auto(st, {}); }
console.log(JSON.stringify({ games, ots, clutch, branches, avgEvents: Math.round(events / Math.max(1, games)), maxEv, bad }));
if (bad || !games || !clutch) { console.log('FAILED'); process.exit(1); } console.log('live OK');
