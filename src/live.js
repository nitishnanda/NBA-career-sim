(function (g) {
  // The live game: a logged game replayed as a play-by-play. The box score and the final score are already decided (they live in the season log), so the game is
  // laid out in time to match them exactly: your shots, free throws, assists, boards and so on at the moments you were on the floor, and the rest of the points for
  // your team and theirs. A clutch game stops on the last possession so the call is made in the game; the ending is built after the call, from the result.
  const NBA = (g.NBA = g.NBA || {});
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const hashS = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const REG = 2880, OTLEN = 300;
  const STATS = ['pt', 'fga', 'fgm', 'tpa', 'tpm', 'fta', 'ftm', 'rb', 'or', 'as', 'st', 'bk', 'to', 'pf'];
  const blank = () => { const o = {}; STATS.forEach((k) => (o[k] = 0)); return o; };
  const last = (n) => String(n || '').split(' ').slice(-1)[0];

  // when you were on the floor: a starter's four stints or a bench player's, scaled to the minutes you played; the last one runs to the end of a close game
  function windows(m, ot, limit, clutch) {
    const starter = m >= 26;
    const tpl = starter ? [[0, 9], [14, 24], [24, 34], [38, 48]] : [[5, 12], [17, 22], [30, 35], [40, 46]];
    let w = tpl.map(([a, b]) => [a * 60, b * 60]);
    if (ot) w.push([REG, REG + OTLEN]);
    const tot = w.reduce((s, x) => s + x[1] - x[0], 0), k = clamp((m * 60) / tot, 0.25, 1.6);
    const n = w.length;
    w = w.map(([a, b], i) => {
      const len = (b - a) * k, c = (a + b) / 2;
      if (i === 0 && starter) return [0, len];
      if (i === n - 1 && !ot) return [REG - len, REG];
      return [c - len / 2, c + len / 2];
    });
    const out = [];
    w.forEach(([a, b]) => { a = Math.max(a, out.length ? out[out.length - 1][1] : 0); b = Math.min(b, limit); if (b - a >= 20) out.push([Math.round(a), Math.round(b)]); });
    if (!out.length) out.push([0, Math.min(limit, 600)]);
    if (clutch) { const l = out[out.length - 1]; l[1] = limit; if (l[1] - l[0] < 60) l[0] = Math.max(out.length > 1 ? out[out.length - 2][1] : 0, limit - 60); }
    return out;
  }
  const secOn = (win, t) => win.reduce((s, [a, b]) => s + Math.max(0, Math.min(b, t) - a), 0);

  const T = {
    mk2: ['{me} finishes at the rim', '{me} gets to the cup and scores', '{me} drives and lays it in', '{me} hits a floater in the lane', '{me} bangs one home inside'],
    mkMid: ['{me} pulls up from mid-range, good', '{me} steps back and cashes a jumper', '{me} hits the elbow jumper'],
    mk3: ['{me} buries a three', '{me} pulls up from deep and it is good', '{me} drains one from the wing', '{me} hits a corner three'],
    ms2: ['{me} misses a layup', '{me} forces one up and misses', '{me} rims out a jumper', '{me} misses in the lane'],
    ms3: ['{me} misses a three', '{me} lets a three fly and it is off', '{me} airballs a long one'],
    ast: ['{me} finds {who} for the bucket', '{me} drops it off to {who}', '{me} swings it to {who} for a score', '{me} threads a pass to {who}'],
    reb: ['{me} pulls down the defensive board', '{me} cleans the glass', '{me} grabs the rebound'],
    oreb: ['{me} crashes the offensive glass', '{me} tips it back out for the offensive rebound'],
    stl: ['{me} picks the pocket', '{me} jumps the lane for a steal', '{me} strips the ball'],
    blk: ['{me} swats it away', '{me} rejects the shot', '{me} blocks it at the rim'],
    to: ['{me} loses the ball', '{me} throws it away', '{me} is called for traveling'],
    pf: ['Foul on {me}', '{me} picks up a foul', '{me} reaches and gets whistled'],
    tm3: ['{who} hits a three', '{who} drains it from deep'], tm2: ['{who} scores inside', '{who} hits a pull-up', '{who} finishes the layup'], tm1: ['{who} knocks down a free throw', '{who} at the line'],
    op3: ['{who} hits a three for the {opp}', '{who} buries one for the {opp}'], op2: ['{who} scores for the {opp}', '{who} gets a bucket for the {opp}'], op1: ['{who} makes a free throw for the {opp}', '{who} at the line for the {opp}'],
  };
  const fill = (s, c) => String(s).replace(/\{(\w+)\}/g, (m, k) => (c[k] != null ? c[k] : ''));

  // the play-by-play for one game up to its last possession (or the whole game when there is no call to make)
  function build(it, ctx) {
    const rnd = NBA.Reporters.mulberry(hashS('live|' + ctx.key)), pick = (a) => a[Math.floor(rnd() * a.length)];
    const me = ctx.me, ev = [], ot = it.ot ? 1 : 0;
    const cl = ctx.clutch ? { text: ctx.clutch.text, tied: /^Tied/.test(ctx.clutch.text), need: /^Down 3/.test(ctx.clutch.text) ? 3 : 2, secs: +((/(\d+) seconds/.exec(ctx.clutch.text) || [])[1] || 8) } : null;
    const lo = Math.min(it.f, it.a);
    let tTot = it.f, oTot = it.a, limit = REG + OTLEN * ot, tp = null;
    if (cl) { const op = lo - 2; tTot = Math.max(cl.tied ? op : op - cl.need, (it.pt || 0) + 20); oTot = op; limit = REG - cl.secs; tp = limit; }
    const win = windows(it.m || 30, cl ? 0 : ot, limit, !!cl), W = win.reduce((s, [a, b]) => s + b - a, 0);
    const tAt = () => { let u = rnd() * W; for (const [a, b] of win) { if (u < b - a) return Math.round(a + u); u -= b - a; } return Math.round(win[win.length - 1][1] - 1); };
    const nm = (list) => list.length ? list[Math.min(list.length - 1, Math.floor(Math.pow(rnd(), 1.6) * list.length))] : 'a teammate';
    const mates = ctx.mates && ctx.mates.length ? ctx.mates : ['a teammate'], opps = ctx.opps && ctx.opps.length ? ctx.opps : ['an opposing player'];
    const line0 = blank(); STATS.forEach((k) => (line0[k] = it[k] || 0));
    let mine = 0;   // the points your events put on your team's board
    const add = (e) => { ev.push(Object.assign({ seq: ev.length }, e)); };
    // shots, from the recorded shot chart when it matches the box score, else from the counts
    let shots = ctx.shots && ctx.shots.length === it.fga && ctx.shots.filter((v) => (v >> 19) >= 3).length === it.tpa ? ctx.shots.slice() : null;
    if (!shots) {
      const twoA = Math.max(0, it.fga - it.tpa), twoM = Math.max(0, it.fgm - it.tpm); shots = [];
      for (let i = 0; i < twoA; i++) shots.push({ z: Math.floor(rnd() * 3), made: i < twoM });
      for (let i = 0; i < it.tpa; i++) shots.push({ z: 3 + (rnd() < 0.3 ? 0 : 1), made: i < it.tpm });
    } else shots = shots.map((v) => ({ z: v >> 19, made: (v >> 18) & 1, x: v & 511, y: (v >> 9) & 511 }));
    shots.forEach((s) => {
      const three = s.z >= 3, pts = s.made ? (three ? 3 : 2) : 0, txt = s.made ? pick(three ? T.mk3 : s.z === 2 ? T.mkMid : T.mk2) : pick(three ? T.ms3 : T.ms2);
      mine += pts;
      add({ t: tAt(), side: 'me', k: 'shot', text: fill(txt, { me: last(me) }), d: { fga: 1, fgm: s.made ? 1 : 0, tpa: three ? 1 : 0, tpm: three && s.made ? 1 : 0, pt: pts }, tm: pts, hl: s.made && three, shot: s.x != null ? { x: s.x, y: s.y, made: s.made, z: s.z } : null });
    });
    // free throws in trips of two
    const ftf = []; for (let i = 0; i < it.fta; i++) ftf.push(i < it.ftm ? 1 : 0); for (let i = ftf.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ftf[i], ftf[j]] = [ftf[j], ftf[i]]; }
    for (let i = 0; i < ftf.length; i += 2) { const trip = ftf.slice(i, i + 2), mk = trip.reduce((s, x) => s + x, 0); mine += mk; add({ t: tAt(), side: 'me', k: 'ft', text: last(me) + ' at the line: ' + mk + '/' + trip.length, d: { fta: trip.length, ftm: mk, pt: mk }, tm: mk }); }
    // assists carry a teammate's basket
    const others = Math.max(0, tTot - mine); let apts = 0; const asz = [];
    for (let i = 0; i < (it.as || 0); i++) asz.push(rnd() < 0.3 ? 3 : 2);
    while (asz.reduce((s, x) => s + x, 0) > others - 6 && asz.some((x) => x === 3)) asz[asz.indexOf(3)] = 2;
    asz.forEach((sz) => { if (apts + sz > others - 4) sz = 0; apts += sz; const who = nm(mates); add({ t: tAt(), side: 'me', k: 'ast', text: fill(pick(T.ast), { me: last(me), who: last(who) }), d: { as: 1 }, tm: sz, who, whoPts: sz }); });
    for (let i = 0; i < (it.rb || 0); i++) { const off = i < (it.or || 0); add({ t: tAt(), side: 'me', k: 'reb', text: fill(pick(off ? T.oreb : T.reb), { me: last(me) }), d: off ? { rb: 1, or: 1 } : { rb: 1 } }); }
    [['st', 'stl'], ['bk', 'blk'], ['to', 'to'], ['pf', 'pf']].forEach(([s, k]) => { for (let i = 0; i < (it[s] || 0); i++) add({ t: tAt(), side: 'me', k, text: fill(pick(T[k]), { me: last(me) }), d: { [s]: 1 }, hl: k === 'blk' }); });
    // the rest of the points: teammates for your team, the other side for theirs
    const chunks = (rem, side, list, label) => {
      let guard = 0;
      while (rem > 0 && guard++ < 400) {
        const sz = rem === 1 ? 1 : rem === 2 ? 2 : rem === 3 ? (rnd() < 0.5 ? 3 : 2) : (() => { const u = rnd(); return u < 0.27 ? 3 : u < 0.82 ? 2 : 1; })();
        const who = nm(list), t = Math.round(10 + rnd() * (limit - 20));
        add(side === 'tm' ? { t, side: 'tm', k: 'tm', text: fill(pick(T['tm' + sz]), { who: last(who) }), tm: sz, who, whoPts: sz } : { t, side: 'opp', k: 'opp', text: fill(pick(T['op' + sz]), { who: last(who), opp: ctx.oppNick || 'opponent' }), op: sz, who, whoPts: sz });
        rem -= sz;
      }
    };
    chunks(Math.max(0, tTot - mine - apts), 'tm', mates);
    chunks(oTot, 'opp', opps);
    ev.sort((a, b) => a.t - b.t || a.seq - b.seq);
    return { key: ctx.key, events: ev, end: limit, final: !cl, pause: tp, clutch: cl, win, W, m: it.m || 30, line0, tp: tTot, op: oTot, me, mates, opps, f: it.f, a: it.a, ot: cl ? 0 : ot, oppNick: ctx.oppNick, nick: ctx.nick };
  }

  // after the call: the last seconds, built from what the game became (the player's changes, and the points that take both teams to the final score)
  function ending(tl, it1, res) {
    const rnd = NBA.Reporters.mulberry(hashS('liveEnd|' + (tl.key || '') + '|' + tl.tp + '|' + (res && res.key))), pick = (a) => a[Math.floor(rnd() * a.length)];
    const t0 = tl.pause, d = {}; STATS.forEach((k) => (d[k] = (it1[k] || 0) - (tl.line0[k] || 0)));
    const ev = [], me = last(tl.me), need = tl.clutch ? tl.clutch.need : 2, key = res && res.key;
    const flavor = { shot: res.wins ? me + ' rises up and it is good!' : me + ' takes the shot and it rims out.', pass: res.wins ? me + ' finds the open man and he knocks it down!' : me + ' looks for the open man and the pass does not come together.', drive: res.wins ? me + ' attacks the rim and wins it at the line.' : me + ' attacks the rim but cannot finish.', reset: res.wins ? 'The play works exactly as drawn.' : 'The play breaks down and nothing good comes of it.' }[key] || (res.text || '');
    const cT = clamp(d.pt + (d.as > 0 ? need : 0), 0, Math.max(0, it1.f - tl.tp));
    const clutchD = {}; STATS.forEach((k) => { if (d[k]) clutchD[k] = d[k]; });
    ev.push({ t: t0 + 1, seq: 0, side: 'me', k: 'clutch', text: flavor, d: clutchD, tm: cT, hl: true, who: d.as > 0 ? tl.mates[0] : null, whoPts: d.as > 0 ? need : 0 });
    const place = (rem, side, list) => {
      let guard = 0;
      while (rem > 0 && guard++ < 50) {
        const sz = rem >= 3 ? (rnd() < 0.4 ? 3 : 2) : rem, t = Math.round(t0 + 2 + rnd() * Math.max(1, REG - t0 - 2)), who = list[Math.floor(Math.pow(rnd(), 1.6) * list.length)] || 'a player';
        ev.push(side === 'tm' ? { t, seq: ev.length, side: 'tm', k: 'tm', text: fill(pick(T['tm' + sz]), { who: last(who) }), tm: sz, who, whoPts: sz } : { t, seq: ev.length, side: 'opp', k: 'opp', text: fill(pick(T['op' + sz]), { who: last(who), opp: tl.oppNick || 'opponent' }), op: sz, who, whoPts: sz });
        rem -= sz;
      }
    };
    place(Math.max(0, it1.f - tl.tp - cT), 'tm', tl.mates); place(Math.max(0, it1.a - tl.op), 'opp', tl.opps);
    ev.push({ t: REG, seq: ev.length + 1, side: 'n', k: 'end', text: (it1.w ? 'FINAL: the ' + (tl.nick || 'team') + ' win ' : 'FINAL: the ' + (tl.nick || 'team') + ' lose ') + it1.f + '-' + it1.a + '.', hl: true });
    ev.sort((a, b) => a.t - b.t || a.seq - b.seq);
    return { events: ev, end: REG, fin: { f: it1.f, a: it1.a } };
  }

  // helpers the screen shares with the tests
  const periodOf = (t) => (t < REG ? Math.floor(t / 720) : 4 + Math.floor((t - REG) / OTLEN));
  const clockOf = (t, end) => {
    if (t >= end) return 'Final';
    const p = periodOf(t), left = p < 4 ? (p + 1) * 720 - t : REG + (p - 3) * OTLEN - t;
    return (p < 4 ? 'Q' + (p + 1) : p === 4 ? 'OT' : 'OT' + (p - 3)) + ' ' + Math.floor(left / 60) + ':' + String(Math.floor(left % 60)).padStart(2, '0');
  };
  // the whole state at time t (the screen keeps this incrementally; the tests use it to check the totals)
  function stateAt(tl, extra, t) {
    const box = blank(), sc = [0, 0], per = [], pts = {}, opp = {};
    (tl.events.concat(extra || [])).forEach((e) => {
      if (e.t > t) return; const p = periodOf(e.t); per[p] = per[p] || [0, 0];
      if (e.d) for (const k in e.d) box[k] += e.d[k];
      if (e.tm) { sc[0] += e.tm; per[p][0] += e.tm; } if (e.op) { sc[1] += e.op; per[p][1] += e.op; }
      if (e.who && e.whoPts) (e.side === 'opp' ? opp : pts)[e.who] = ((e.side === 'opp' ? opp : pts)[e.who] || 0) + e.whoPts;
    });
    return { box, sc, per, pts, opp };
  }
  NBA.Live = { build, ending, windows, secOn, periodOf, clockOf, stateAt, STATS, REG, OTLEN, blank };
})(typeof window !== 'undefined' ? window : globalThis);
