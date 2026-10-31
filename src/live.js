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

  // events for the stretch (t0, t1]: the player's remaining counts (rem), and the points still to be scored by his team (teamRem, his own included) and theirs (oppRem)
  function gen(ctx, o) {
    const rnd = o.rnd, pick = (a) => a[Math.floor(rnd() * a.length)], me = ctx.me, ev = [], rem = o.rem, t0 = o.t0, t1 = o.t1, win = o.win;
    const W = win.reduce((s, [a, b]) => s + b - a, 0);
    const tAt = () => { if (W <= 0) return Math.round(t0 + 2 + rnd() * Math.max(1, t1 - t0 - 4)); let u = rnd() * W; for (const [a, b] of win) { if (u < b - a) return Math.round(a + u); u -= b - a; } return Math.round(win[win.length - 1][1] - 1); };
    const nm = (list) => list.length ? list[Math.min(list.length - 1, Math.floor(Math.pow(rnd(), 1.6) * list.length))] : 'a teammate';
    const mates = ctx.mates && ctx.mates.length ? ctx.mates : ['a teammate'], opps = ctx.opps && ctx.opps.length ? ctx.opps : ['an opposing player'];
    let mine = 0; const add = (e) => { ev.push(Object.assign({ seq: o.seq0 + ev.length }, e)); };
    // shots: the recorded shot chart when it matches the counts, else drawn from the counts (with court spots from the caller when it can)
    let shots = o.shots && o.shots.length === rem.fga && o.shots.filter((v) => (v >> 19) >= 3).length === rem.tpa ? o.shots.slice() : (ctx.mkShots ? ctx.mkShots(rem) : null);
    if (!shots || shots.length !== rem.fga) {
      const twoA = Math.max(0, rem.fga - rem.tpa), twoM = Math.max(0, rem.fgm - rem.tpm); shots = [];
      for (let i = 0; i < twoA; i++) shots.push({ z: Math.floor(rnd() * 3), made: i < twoM });
      for (let i = 0; i < rem.tpa; i++) shots.push({ z: 3 + (rnd() < 0.3 ? 0 : 1), made: i < rem.tpm });
    } else shots = shots.map((v) => ({ z: v >> 19, made: (v >> 18) & 1, x: v & 511, y: (v >> 9) & 511 }));
    shots.forEach((s) => {
      const three = s.z >= 3, pts = s.made ? (three ? 3 : 2) : 0, txt = s.made ? pick(three ? T.mk3 : s.z === 2 ? T.mkMid : T.mk2) : pick(three ? T.ms3 : T.ms2);
      mine += pts;
      add({ t: tAt(), side: 'me', k: 'shot', text: fill(txt, { me: last(me) }), d: { fga: 1, fgm: s.made ? 1 : 0, tpa: three ? 1 : 0, tpm: three && s.made ? 1 : 0, pt: pts }, tm: pts, hl: s.made && three, shot: s.x != null ? { x: s.x, y: s.y, made: s.made, z: s.z } : null });
    });
    const ftf = []; for (let i = 0; i < rem.fta; i++) ftf.push(i < rem.ftm ? 1 : 0); for (let i = ftf.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ftf[i], ftf[j]] = [ftf[j], ftf[i]]; }
    for (let i = 0; i < ftf.length; i += 2) { const trip = ftf.slice(i, i + 2), mk = trip.reduce((s, x) => s + x, 0); mine += mk; add({ t: tAt(), side: 'me', k: 'ft', text: last(me) + ' at the line: ' + mk + '/' + trip.length, d: { fta: trip.length, ftm: mk, pt: mk }, tm: mk }); }
    const others = Math.max(0, o.teamRem - mine); let apts = 0; const asz = [];
    for (let i = 0; i < (rem.as || 0); i++) asz.push(rnd() < 0.3 ? 3 : 2);
    while (asz.reduce((s, x) => s + x, 0) > others - 6 && asz.some((x) => x === 3)) asz[asz.indexOf(3)] = 2;
    asz.forEach((sz) => { if (apts + sz > others - 4) sz = 0; apts += sz; const who = nm(mates); add({ t: tAt(), side: 'me', k: 'ast', text: fill(pick(T.ast), { me: last(me), who: last(who) }), d: { as: 1 }, tm: sz, who, whoPts: sz }); });
    for (let i = 0; i < (rem.rb || 0); i++) { const off = i < (rem.or || 0); add({ t: tAt(), side: 'me', k: 'reb', text: fill(pick(off ? T.oreb : T.reb), { me: last(me) }), d: off ? { rb: 1, or: 1 } : { rb: 1 } }); }
    [['st', 'stl'], ['bk', 'blk'], ['to', 'to'], ['pf', 'pf']].forEach(([s, k]) => { for (let i = 0; i < (rem[s] || 0); i++) add({ t: tAt(), side: 'me', k, text: fill(pick(T[k]), { me: last(me) }), d: { [s]: 1 }, hl: k === 'blk' }); });
    const chunks = (left, side, list) => {
      let guard = 0;
      while (left > 0 && guard++ < 400) {
        const sz = left === 1 ? 1 : left === 2 ? 2 : left === 3 ? (rnd() < 0.5 ? 3 : 2) : (() => { const u = rnd(); return u < 0.27 ? 3 : u < 0.82 ? 2 : 1; })();
        const who = nm(list), t = Math.round(t0 + 3 + rnd() * Math.max(1, t1 - t0 - 6));
        add(side === 'tm' ? { t, side: 'tm', k: 'tm', text: fill(pick(T['tm' + sz]), { who: last(who) }), tm: sz, who, whoPts: sz } : { t, side: 'opp', k: 'opp', text: fill(pick(T['op' + sz]), { who: last(who), opp: ctx.oppNick || 'opponent' }), op: sz, who, whoPts: sz });
        left -= sz;
      }
    };
    chunks(Math.max(0, o.teamRem - mine - apts), 'tm', mates);
    chunks(Math.max(0, o.oppRem), 'opp', opps);
    return ev;
  }
  const lineOf = (it) => { const o = blank(); STATS.forEach((k) => (o[k] = it[k] || 0)); return o; };
  // the whole game up to its last possession (or to the buzzer when there is no call to make)
  function build(it, ctx) {
    const rnd = NBA.Reporters.mulberry(hashS('live|' + ctx.key)), ot = it.ot ? 1 : 0;
    const cl = ctx.clutch ? { text: ctx.clutch.text, tied: /^Tied/.test(ctx.clutch.text), need: /^Down 3/.test(ctx.clutch.text) ? 3 : 2, secs: +((/(\d+) seconds/.exec(ctx.clutch.text) || [])[1] || 8) } : null;
    const tl = { key: ctx.key, clutch: cl, ot: cl ? 0 : ot, me: ctx.me, mates: ctx.mates, opps: ctx.opps, oppNick: ctx.oppNick, nick: ctx.nick, shots0: ctx.shots };
    totals(tl, it); tl.m = it.m || 30; tl.win = windows(tl.m, tl.ot, tl.limit, !!cl);
    tl.events = gen(ctx, { rnd, rem: lineOf(it), t0: 0, t1: tl.limit, win: tl.win, teamRem: tl.tp, oppRem: tl.op, shots: ctx.shots, seq0: 0 }).sort((a, b) => a.t - b.t || a.seq - b.seq);
    tl.W = tl.win.reduce((s, [a, b]) => s + b - a, 0); tl.end = tl.limit; tl.pause = cl ? tl.limit : null; tl.final = !cl; tl.line0 = lineOf(it); tl.f = it.f; tl.a = it.a;
    return tl;
  }
  // the scoreboard the game is laid out to: the final score, or (with a last-possession call) the score going into it
  function totals(tl, it) {
    const lo = Math.min(it.f, it.a), cl = tl.clutch; tl.limit = REG + OTLEN * tl.ot;
    if (cl) { const op = lo - 2; tl.tp = Math.max(cl.tied ? op : op - cl.need, (it.pt || 0) + 20); tl.op = op; tl.limit = REG - cl.secs; } else { tl.tp = it.f; tl.op = it.a; }
  }
  // after a decision at time t0 changed the game (a new line and score in `it`), lay out the rest of it again: what happened up to t0 stays, the remaining events are drawn to reach the new totals
  function replan(tl, t0, it, ctx, extra) {
    const rnd = NBA.Reporters.mulberry(hashS('replan|' + tl.key + '|' + t0 + '|' + (extra || ''))), s = stateAt(tl, [], t0), keep = tl.events.filter((e) => e.t <= t0);
    totals(tl, it); tl.m = it.m || tl.m;
    const rem = blank(); STATS.forEach((k) => (rem[k] = Math.max(0, (it[k] || 0) - s.box[k])));
    // your floor time from here: the new minutes minus what you have played, spread over the stints that are left
    const want = Math.max(0, Math.round(tl.m * 60 - secOn(tl.win, t0))), cur = tl.win.map(([a, b]) => [Math.max(a, t0), Math.min(b, tl.limit)]).filter(([a, b]) => b - a >= 10), curSec = cur.reduce((x, [a, b]) => x + b - a, 0);
    const room = Math.max(0, tl.limit - t0); let nw = [];
    if (want > 0 && room > 0) { const sec = Math.min(want, room), k = curSec ? sec / curSec : 1; if (curSec) { let at = t0; cur.forEach(([a, b], i) => { const len = Math.max(15, Math.round((b - a) * k)), st = Math.max(at, a); const e = Math.min(tl.limit, st + len); if (e - st >= 10) { nw.push([st, e]); at = e; } }); } else nw = [[t0 + 5, Math.min(tl.limit, t0 + 5 + sec)]]; }
    if (tl.clutch && nw.length) { const l = nw[nw.length - 1]; l[1] = tl.limit; if (l[1] - l[0] < 40) l[0] = Math.max(t0, tl.limit - 40); }
    tl.win = tl.win.map(([a, b]) => [a, Math.min(b, t0)]).filter(([a, b]) => b - a >= 10).concat(nw); tl.W = tl.win.reduce((x, [a, b]) => x + b - a, 0);
    const maxSeq = keep.reduce((m, e) => Math.max(m, e.seq), 0) + 1;
    const fresh = gen(ctx, { rnd, rem, t0, t1: tl.limit, win: nw, teamRem: Math.max(0, tl.tp - s.sc[0]), oppRem: Math.max(0, tl.op - s.sc[1]), shots: null, seq0: maxSeq });
    tl.events = keep.concat(fresh.map((e) => Object.assign(e, { t: Math.max(e.t, t0 + 1) }))).sort((a, b) => a.t - b.t || a.seq - b.seq);
    tl.line0 = lineOf(it); tl.f = it.f; tl.a = it.a; tl.end = tl.limit; if (tl.clutch) tl.pause = tl.limit;
    return tl;
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
  // ---- the decisions inside a game: when they come up and what is asked. Effects live in the game (NBA.Game.liveDecision), which also edits the logged game.
  const CPS = [{ id: 'open', t: 0 }, { id: 'form', t: 720 }, { id: 'rest', t: 1080 }, { id: 'half', t: 1440 }, { id: 'foul', t: 1800 }, { id: 'legs', t: 2160 }, { id: 'crunch', t: 2460 }];
  function checkpointSpec(id, tl, state, it) {
    const b = state.box, margin = state.sc[0] - state.sc[1], atts = b.fga, pctFg = atts ? b.fgm / atts : 0, q = (t) => Math.max(0, t);
    if (id === 'open') return { id, title: 'Tip-off', text: 'Opening night energy, the building is loud. How do you want to start?', options: [
      { key: 'attack', label: 'Attack early', blurb: 'Look for your shot and set the tone.', vibe: 'More shots' },
      { key: 'table', label: 'Set the table', blurb: 'Get everyone involved early and feel the game out.', vibe: 'More passing' },
      { key: 'lock', label: 'Lock in on defense', blurb: 'Win the first quarter with stops and let the offense come.', vibe: 'Defense first' }] };
    if (id === 'form') {
      if (atts >= 5 && pctFg >= 0.55) return { id: 'form', variant: 'hot', title: 'You are feeling it', text: b.pt + ' points on ' + b.fgm + '/' + b.fga + ' already, and the rim looks wide. Keep hunting, or move the ball?', options: [
        { key: 'hunt', label: 'Keep hunting shots', blurb: 'Ride the hot hand. The defense will adjust.', vibe: 'Hot hand' }, { key: 'spread', label: 'Get teammates going', blurb: 'Use the attention you are drawing.', vibe: 'Balanced' }] };
      if (atts >= 5 && pctFg <= 0.3) return { id: 'form', variant: 'cold', title: 'Cold start', text: 'Just ' + b.fgm + ' for ' + b.fga + ' and the crowd is noticing. How do you respond?', options: [
        { key: 'shootout', label: 'Keep shooting through it', blurb: 'One falls and it turns. Or it does not.', vibe: 'Risky' }, { key: 'settle', label: 'Settle for easy looks', blurb: 'Cut, rebound, get to the line.', vibe: 'Steady' }, { key: 'facilitate', label: 'Go to a passing game', blurb: 'Make it about the team until the shot comes back.', vibe: 'Playmaker' }] };
      return null;
    }
    if (id === 'rest') return { id, title: 'The coach looks your way', text: 'Late in the second quarter with ' + Math.floor(state.mins || 0) + ' minutes on your legs. Do you want a breather before the half?', options: [
      { key: 'normal', label: 'Stick with the rotation', blurb: 'Whatever the coach has planned.', vibe: 'Steady' }, { key: 'stay', label: 'Stay in', blurb: 'Keep your rhythm and the pressure on.', vibe: 'More minutes' }, { key: 'rest', label: 'Take a breather', blurb: 'Sit a few minutes and come back fresh.', vibe: 'Rested' }] };
    if (id === 'legs') return { id, title: 'Start of the fourth', text: 'You have played ' + Math.floor(state.mins || 0) + ' minutes and the building is tight. How are your legs?', options: [
      { key: 'normal', label: 'Play it as it comes', blurb: 'Trust the rotation.', vibe: 'Steady' }, { key: 'push', label: 'Push through', blurb: 'Stay on the floor and run on adrenaline.', vibe: 'All-out' }, { key: 'sub', label: 'Ask for a quick rest', blurb: 'Two minutes on the bench, then back for the finish.', vibe: 'Smart' }] };
    if (id === 'half') return { id, title: 'Halftime', text: (margin > 0 ? 'Up ' + margin : margin < 0 ? 'Down ' + (-margin) : 'Tied') + ' at the break. The coach asks what you want to run in the second half.', options: [
      { key: 'pnr', label: 'Pick-and-roll with you', blurb: 'You run it all half: score or find the roller.', vibe: 'Balanced' },
      { key: 'iso', label: 'Isolations for you', blurb: 'Clear out and go to work. High volume, high variance.', vibe: 'Hero ball' },
      { key: 'pace', label: 'Push the pace', blurb: 'More possessions for both teams.', vibe: 'Fast and loose' },
      { key: 'press', label: 'Pressure defense', blurb: 'Pick them up full court and force mistakes. Fouls may come.', vibe: 'Aggressive' }] };
    if (id === 'foul') { if (b.pf < 3) return null; return { id, title: 'Foul trouble', text: 'You have ' + b.pf + ' fouls in the third quarter. The coach looks down the bench.', options: [
      { key: 'sit', label: 'Sit for a stretch', blurb: 'Stay out of trouble and come back later.', vibe: 'Safe' }, { key: 'stay', label: 'Stay in, play carefully', blurb: 'Same minutes, a little less aggression.', vibe: 'Steady' }, { key: 'aggressive', label: 'Stay aggressive', blurb: 'Your team needs you on the floor. One more foul and it gets ugly.', vibe: 'Risky' }] }; }
    if (id === 'crunch') { if (Math.abs(margin) > 12) return null; return { id, title: 'Crunch time', text: (margin > 0 ? 'Up ' + margin : margin < 0 ? 'Down ' + (-margin) : 'Tied') + ' with seven minutes left. The coach takes a timeout: what do you want to run?', options: [
      { key: 'run', label: 'Run it through you', blurb: 'Take the big shots yourself.', vibe: 'Hero ball' }, { key: 'swing', label: 'Move the ball', blurb: 'Trust the offense and take what the defense gives.', vibe: 'Ball movement' }, { key: 'stops', label: 'Win it with defense', blurb: 'Get stops, run in transition and let the game come to you.', vibe: 'Defense' }] }; }
    return null;
  }
  NBA.Live = { replan, lineOf, CPS, checkpointSpec, build, ending, windows, secOn, periodOf, clockOf, stateAt, STATS, REG, OTLEN, blank };
})(typeof window !== 'undefined' ? window : globalThis);
