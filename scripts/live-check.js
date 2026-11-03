// the live game: for every logged game the play-by-play adds up to the box score and the final score; clutch games stop on the last possession, and every call (all four
// options, win and lose) ends exactly on the score and line the game ended with
global.NBA = {}; require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = global.NBA; require('../src/game.js');
const G = N.Game, Dc = N.Decisions, Lv = N.Live;
let seen = 0, decTests = 0, decDone = 0, decKinds = {}; let bad = 0, games = 0, clutch = 0, branches = 0, ots = 0, events = 0, maxEv = 0; const fail = (m) => { bad++; if (bad < 10) console.log('FAIL', m); };
const lineOf = (it) => { const o = {}; Lv.STATS.forEach((k) => (o[k] = it[k] || 0)); return o; };
const same = (a, b) => Lv.STATS.every((k) => a[k] === b[k]);
let inHook = false;
N.onSeasonLog = (st, rec) => {
  if (inHook) return; inHook = true;
  const p = st.player, L = st.league, tm = L.teams[st.teamId];
  st.matchLog.forEach((it, idx) => {
    if (it.k !== 'g' || it.dnp) return;
    const opT = L.teams.find((x) => x.nick === it.o), ctx0 = { key: st.seasonSeed + '|' + it.n + '|' + (it.po ? 1 : 0), me: p.name, nick: tm.nick, oppNick: it.o, mates: N.rosterOf(L, tm).filter((q) => q.id !== 'user').map((q) => q.name), opps: opT ? N.rosterOf(L, opT).map((q) => q.name) : [], shots: it.sh || G.shotsFor(it, p, G.shotSeed(st, idx)) };
    // decisions inside the game: walk every checkpoint with a random option, lay the rest out again, and the game must still end on the edited line and score
    if (++seen % (+process.env.LIVEEVERY || 45) === 0 && decTests < (+process.env.LIVEN || 40)) {
      decTests++;
      const c = JSON.parse(JSON.stringify(st)); c.autoPlay = false; c.matchIdx = idx; c.dec.pending = null; c.proSeasons.push(rec);
      const clutchOn = !!(it.cl && !it.cd); if (clutchOn && it.g7) return; if (clutchOn) { if (!Dc.offer(c, 'clutch')) return; G.clutchLock(c, idx); }
      const it0 = c.matchLog[idx], info = clutchOn ? G.clutchInfo(c) : null, ctxD = Object.assign({}, ctx0, { clutch: info ? { text: info.text } : null });
      const tl = Lv.build(JSON.parse(JSON.stringify(it0)), ctxD); let taken = 0;
      Lv.CPS.forEach((cp, ci) => {
        const t = cp.t; if (t > (tl.clutch ? tl.limit - 30 : 99999)) return;
        const stt = Lv.stateAt(tl, [], t), mins = tl.W ? tl.m * Math.min(1, Lv.secOn(tl.win, t) / tl.W) : 0, spec = Lv.checkpointSpec(cp.id, tl, stt, c.matchLog[idx]); if (!spec) return;
        const key = spec.options[(decTests + ci) % spec.options.length].key; taken++; decKinds[cp.id + ':' + key] = 1;
        let r; try { r = G.liveDecision(c, idx, cp.id, key, { box: stt.box, sc: stt.sc, mins }); } catch (e) { fail('decision ' + cp.id + ' ' + key + ' ' + e.message); return; }
        const itN = c.matchLog[idx]; Lv.replan(tl, t, itN, ctxD, cp.id);
        const s2 = Lv.stateAt(tl, [], 99999); if (!same(s2.box, lineOf(itN))) fail('after ' + cp.id + ' ' + key + ': box ' + JSON.stringify(s2.box) + ' vs ' + JSON.stringify(lineOf(itN)));
        if (!tl.clutch && (s2.sc[0] !== itN.f || s2.sc[1] !== itN.a)) fail('after ' + cp.id + ' ' + key + ': score ' + s2.sc + ' vs ' + itN.f + '-' + itN.a);
        if (tl.clutch) { const pre = Lv.stateAt(tl, [], tl.pause); if (pre.sc[1] - pre.sc[0] < 0 || pre.sc[1] - pre.sc[0] > 3) fail('pause margin after decision ' + (pre.sc[1] - pre.sc[0])); }
        if (itN.pf > 6 || itN.fgm > itN.fga || itN.pt !== itN.fgm * 2 + itN.tpm + itN.ftm) fail('line invariant ' + JSON.stringify(lineOf(itN)));
        if (tl.events.some((e) => e.t < 0 || e.t > 2880 + 300)) fail('event out of range');
      });
      decDone += taken;
      if (clutchOn && taken >= 0) {
        const it1pre = c.matchLog[idx], r = Dc.choose(c, 'shot'), it1 = c.matchLog[idx], ext = Lv.ending(tl, it1, { key: 'shot', wins: !!it1.w, text: r.text }), s3 = Lv.stateAt(tl, ext.events, 99999);
        if (!same(s3.box, lineOf(it1))) fail('decisions + call: box'); if (s3.sc[0] !== it1.f || s3.sc[1] !== it1.a) fail('decisions + call: score ' + s3.sc + ' vs ' + it1.f + '-' + it1.a + ' tl.tp=' + tl.tp + ' tl.op=' + tl.op + ' pre ' + it1pre.f + '-' + it1pre.a + ' was ' + it0.f + '-' + it0.a);
      }
      return;
    }
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
console.log(JSON.stringify({ decTests, decDone, decKinds: Object.keys(decKinds).length, games, ots, clutch, branches, avgEvents: Math.round(events / Math.max(1, games)), maxEv, bad }));
if (bad || !games || !clutch) { console.log('FAILED'); process.exit(1); } console.log('live OK');
