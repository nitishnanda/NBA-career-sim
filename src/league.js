(function (g) {
  'use strict';
  const NBA = g.NBA;
  const D = NBA.data;
  const { rand, randn, clamp, rint, pick, weighted, sum, ovr, makePlayer, rollCeiling, randomArch, randomPos, progress, expLine, ATTRS } = Object.assign({ ATTRS: D.ATTRS }, NBA);
  const T = NBA.tuning;

  const seasonLabel = (y) => y + '-' + String((y + 1) % 100).padStart(2, '0');

  function poisson(l) { let L = Math.exp(-l), k = 0, p = 1; do { k++; p *= rand(); } while (p > L); return k - 1; }

  // ------------------------------------------------------------ availability
  function rollAvail(p, opts) {
    opts = opts || {};
    const A = D.ARCHETYPES[p.arch];
    const lam = 1.45 * T.injScale * p.prone * (A.injury || 1) * clamp(1.25 - p.attrs.dur / 110, 0.35, 1.2) * (1 + Math.max(0, p.age - 28) * 0.04);
    const n = poisson(lam);
    let miss = 0;
    const list = [];
    for (let i = 0; i < n; i++) {
      const d = clamp(Math.round(Math.exp(1.6 + 0.9 * randn())), 1, 40);
      miss += d; list.push(d);
    }
    let major = null, notable = null;
    const mp = 0.02 * T.injScale * p.prone * (A.injury || 1) * (1 + Math.max(0, p.age - 26) * 0.05) * (1 + clamp((p.target.ath - 70) / 60, 0, 0.5));
    if (rand() < mp) {
      major = pick(['torn ACL', 'torn Achilles', 'fractured foot', 'torn meniscus', 'ruptured patellar tendon']);
      miss = rint(48, 82);
    }
    if (!major && (p.injYears || []).includes(p.age)) {
      notable = pick(['stress fracture', 'high ankle sprain', 'torn labrum', 'sports hernia', 'knee sprain', 'broken hand']);
      miss = Math.max(miss, rint(34, 70));
    }
    const o = ovr(p);
    let rest = o >= 74 ? (p.age >= 30 ? rint(4, 10) : rint(1, 6)) : o >= 68 ? rint(0, 8) : rint(0, 26); // role players churn: DNPs, waivers, two-way deals
    if (opts.noRest) rest = 0;
    return { gp: clamp(82 - miss - rest - (opts.extraMiss || 0), 0, 82), miss, rest, injuries: list, major, notable };
  }
  function applyMajorInjury(p) {
    p.attrs.ath = clamp(p.attrs.ath - (3 + rand() * 4), 8, 99);
    p.attrs.dur = clamp(p.attrs.dur - (2 + rand() * 4), 8, 99);
    p.target.ath = clamp(p.target.ath - 3, 8, 99);
  }

  // ------------------------------------------------------------ NPC creation
  function makeNPC(L, age, opts) {
    opts = opts || {};
    const ceiling = opts.ceiling != null ? opts.ceiling : clamp(rollCeiling(0, null) + (opts.bonus || 0), 55, 99);
    const arch = opts.arch || randomArch(ceiling);
    const pos = opts.pos || randomPos(arch);
    const sec = rand() < 0.14 ? weighted({ generational: 1, scorer: 3, twoway: 3, defender: 2, shooter: 3, dominator: 2 }) : null;
    const p = makePlayer({ id: L.nextId++, pos, arch, sec: sec === arch ? null : sec, ceiling, age: 18, gap: 14 + rand() * 10 });
    while (p.age < age) progress(p);
    p.yearsPro = Math.max(0, age - 19);
    return p;
  }
  // Each team has a core (its four best players, who drive winning) and a bench (6-8 more who play real minutes).
  function makeBench(L, t) {
    const p = makeNPC(L, rint(21, 32), { ceiling: 54 + 13 * Math.pow(rand(), 1.3), bonus: 0 });
    p.teamId = t.id; L.players[p.id] = p; t.bench.push(p.id);
  }
  function fillRoster(L, t) {
    t.bench = t.bench || [];
    const all = t.core.concat(t.bench).map((id) => L.players[id]).filter(Boolean).sort((a, b) => ovr(b) - ovr(a));
    t.core = all.slice(0, 4).map((p) => p.id);
    t.bench = all.slice(4).map((p) => p.id);
    while (t.core.length < 4) {
      const p = makeNPC(L, rint(23, 30), { ceiling: 67 + rand() * 9, bonus: 0 });
      p.teamId = t.id; L.players[p.id] = p; t.core.push(p.id);
    }
    while (t.bench.length < 4) makeBench(L, t);
    while (t.bench.length > 6) {
      const worst = t.bench.map((id) => L.players[id]).sort((a, b) => ovr(a) - ovr(b))[0];
      t.bench.splice(t.bench.indexOf(worst.id), 1); delete L.players[worst.id];
    }
  }
  const fillCore = fillRoster;

  function newLeague(startYear, opts) {
    const L = {
      year: startYear || 2025, nextId: 1, players: {}, rookies: [], history: [], lines: {},
      teams: D.TEAMS.map((t) => Object.assign({}, t, { core: [], bench: [], depth: randn() * 2.2, wins: 41, losses: 41, pace: 99 })),
      capBase: 154.6, lastLeaders: null,
    };
    if (opts && opts.real && NBA.real) { buildReal(L); return L; }
    const cand = [];
    for (let i = 0; i < 560; i++) {
      const r = rand();
      const age = r < 0.3 ? rint(20, 22) : r < 0.62 ? rint(23, 26) : r < 0.86 ? rint(27, 30) : rint(31, 35);
      cand.push(makeNPC(L, age));
    }
    cand.sort((a, b) => ovr(b) - ovr(a));
    const chosen = cand.slice(0, 120).sort(() => rand() - 0.5);
    chosen.forEach((p, i) => {
      const t = L.teams[i % 30];
      p.teamId = t.id; L.players[p.id] = p; t.core.push(p.id);
    });
    L.teams.forEach((t) => fillRoster(L, t));
    return L;
  }

  // put a real player on the scale: aim for the target overall, with a ceiling above it for the young
  function makeReal(L, row, teamId, ceilOverride) {
    const [name, pos, age, goal, arch, sec] = row;
    const growth = age <= 20 ? 9 : age <= 22 ? 6 : age <= 24 ? 3.5 : age <= 27 ? 1.5 : 0.5;
    const ceiling = clamp(ceilOverride != null ? ceilOverride : goal + growth, 55, 99);
    const p = makePlayer({ id: L.nextId++, name, pos, arch, sec: sec && sec !== arch ? sec : null, ceiling, age, gap: Math.max(0, ceiling - goal) });
    for (let i = 0; i < 4; i++) {
      const d = (goal - ovr(p)) / T.ovrStretch;
      ATTRS.forEach((a) => (p.attrs[a] = clamp(p.attrs[a] + d, 8, 99)));
    }
    p.yearsPro = Math.max(0, age - 19); p.teamId = teamId; p.real = true;
    return p;
  }
  function buildReal(L) {
    const R = NBA.real;
    L.teams.forEach((t) => {
      (R.TEAMS[t.nick] || []).forEach((row) => { const p = makeReal(L, row, t.id); L.players[p.id] = p; t.core.push(p.id); });
      if (R.WINS[t.nick] != null) t.prevWins = R.WINS[t.nick];
      fillCore(L, t);
    });
    R.ROOKIES.forEach((r) => {
      const t = L.teams.find((x) => x.nick === r[1]);
      if (!t) return;
      const p = makeReal(L, [r[0], r[2], r[3], r[4], r[6], r[7]], t.id, r[5]);
      p.yearsPro = 0; p.rookie = true; p.draftSlot = r[8];
      L.players[p.id] = p;
    });
  }

  // ------------------------------------------------------------ helpers
  function teamRoster(L, t, user) {
    const r = t.core.map((id) => L.players[id]);
    if (user && user.teamId === t.id) r.push(user.p);
    return r;
  }
  function coTaxFor(self, roster) {
    let tax = 0;
    roster.forEach((q) => {
      if (q === self) return;
      const o = ovr(q);
      tax += 0.0022 * Math.max(0, o - 72) - 0.0008 * Math.max(0, 70 - o);
    });
    return clamp(tax, -0.03, 0.05);
  }
  const perfOf = (l) => l.pts * (1 + 2.2 * (l.ts - 0.57)) + 1.15 * l.reb + 1.5 * l.ast + 2 * (l.stl + l.blk) - 1.1 * l.tov;
  function defScore(p, l) {
    return 4 * l.blk + 3.5 * l.stl + 0.12 * Math.max(p.attrs.rimP, p.attrs.perD);
  }
  function lineFromExp(p, e, gp, form) {
    const sh = 1 + T.formSd * randn();
    const ind = () => 1 + 0.035 * randn();
    const l = { gp, mins: e.mins, pts: e.pts * sh * ind(), reb: e.reb * sh * ind(), ast: e.ast * sh * ind(), stl: e.stl * sh * ind(), blk: e.blk * sh * ind(), tov: e.tov, ts: e.ts, usg: e.usg };
    l.perf = perfOf(l);
    return l;
  }

  // ------------------------------------------------------------ playoffs
  function playGame(pa, pb, hcaA) { return rand() < 1 / (1 + Math.exp(-0.145 * (pa - pb + (hcaA ? 2.5 : -2.5)))); }
  function series(L, a, b) {
    // a is the higher seed (home court)
    const ra = a.power, rb = b.power;
    let wa = 0, wb = 0, g = 0;
    const hc = [1, 1, 0, 0, 1, 0, 1];
    while (wa < 4 && wb < 4) {
      if (playGame(ra, rb, hc[g++])) wa++; else wb++;
    }
    return { a, b, wa, wb, winner: wa > wb ? a : b, loser: wa > wb ? b : a, games: wa + wb };
  }
  function simPlayoffs(L, userTeamId) {
    const out = { rounds: [], playin: [], champion: null, userSeries: [], userMade: false, userOut: null };
    const confs = { E: [], W: [] };
    L.teams.forEach((t) => confs[t.conf].push(t));
    const seeds = {};
    ['E', 'W'].forEach((c) => {
      const s = confs[c].slice().sort((x, y) => y.wins - x.wins || rand() - 0.5);
      // play-in
      const pi = (hi, lo) => { const r = playGame(hi.power, lo.power, true) ? [hi, lo] : [lo, hi]; out.playin.push({ w: r[0].name, l: r[1].name }); return r; };
      const g78 = pi(s[6], s[7]), g910 = pi(s[8], s[9]);
      const g8 = pi(g78[1], g910[0]);
      seeds[c] = s.slice(0, 6).concat([g78[0], g8[0]]);
    });
    if (userTeamId != null) out.userMade = ['E', 'W'].some((c) => seeds[c].some((t) => t.id === userTeamId));
    const runConf = (c) => {
      let rd = [[0, 7], [3, 4], [2, 5], [1, 6]].map(([i, j]) => [seeds[c][i], seeds[c][j]]);
      const results = [];
      for (let r = 0; r < 3; r++) {
        const winners = [];
        const rr = rd.map((m) => {
          const hi = m[0].wins >= m[1].wins ? m[0] : m[1], lo = hi === m[0] ? m[1] : m[0];
          const s = series(L, hi, lo); winners.push(s.winner); return s;
        });
        results.push(rr);
        rd = []; for (let i = 0; i < winners.length; i += 2) rd.push([winners[i], winners[i + 1]]);
        if (winners.length === 1) return { results, champ: winners[0] };
      }
    };
    const east = runConf('E'), west = runConf('W');
    const roundNames = ['First Round', 'Conference Semifinals', 'Conference Finals'];
    const all = [];
    for (let r = 0; r < 3; r++) {
      all.push({ name: roundNames[r], series: east.results[r].concat(west.results[r]) });
    }
    const hi = east.champ.wins >= west.champ.wins ? east.champ : west.champ, lo = hi === east.champ ? west.champ : east.champ;
    const fin = series(L, hi, lo);
    all.push({ name: 'NBA Finals', series: [fin] });
    out.rounds = all; out.champion = fin.winner;
    all.forEach((rd) => rd.series.forEach((s) => {
      if (userTeamId != null && (s.a.id === userTeamId || s.b.id === userTeamId)) {
        const mine = s.a.id === userTeamId ? s.a : s.b, opp = mine === s.a ? s.b : s.a;
        const myW = mine === s.a ? s.wa : s.wb, opW = mine === s.a ? s.wb : s.wa;
        out.userSeries.push({ round: rd.name, opp: opp.name, w: myW, l: opW, games: s.games, won: myW > opW });
      }
    }));
    return out;
  }

  // ------------------------------------------------------------ season
  function simSeason(L, user) {
    const entries = [];
    const avail = {};
    const allPlayers = Object.values(L.players);
    allPlayers.forEach((p) => {
      const a = rollAvail(p);
      avail[p.id] = a;
      if (a.major) applyMajorInjury(p);
    });
    if (user) avail.user = user.avail;
    // team strength
    L.teams.forEach((t) => {
      const roster = teamRoster(L, t, user);
      const vals = roster.map((p) => {
        const gp = p === (user && user.p) ? user.avail.gp : avail[p.id].gp;
        const x = ovr(p) - 60;
        // young players have a smaller impact on winning than their rating suggests
        const expF = 0.85 + 0.05 * Math.min(3, p.yearsPro || 0);
        return (x <= 20 ? x : 20 + (x - 20) * 0.72) * (gp / 82) * expF;
      }).sort((x, y) => y - x).slice(0, 4);
      t.S = sum(vals);
      t.pace = 99 + randn() * 1.4;
    });
    const meanS = sum(L.teams.map((t) => t.S)) / L.teams.length;
    L.teams.forEach((t) => {
      t.depth = 0.6 * t.depth + randn() * 3.0;
      t.wins = 41 + T.winsPerPt * (t.S - meanS) + t.depth + randn() * 4.6;
    });
    // roster continuity: a team does not flip from the lottery to the top seed in one summer
    L.teams.forEach((t) => { t.wins = 0.9 * t.wins + 0.1 * (t.prevWins == null ? 41 : t.prevWins); });
    const mw = sum(L.teams.map((t) => t.wins)) / L.teams.length;
    // real tails: more truly bad teams, fewer 60+ juggernauts
    L.teams.forEach((t) => { let w = t.wins - (mw - 41); if (w < 33) w -= (33 - w) * 0.22; if (w > 54) w -= (w - 54) * ((user && t.id === user.teamId && ovr(user.p) >= 88) ? 0.08 : 0.2); t.wins = clamp(Math.round(w), 12, 73); t.losses = 82 - t.wins; });
    L.teams.forEach((t) => { t.power = (t.wins - 41) / 2.7 + randn() * 0.8; t.prevWins = t.wins; });
    if (user) { const ut = L.teams[user.teamId]; ut.power += clamp((ovr(user.p) - 84) * 0.1, 0, 1.5); } // superstars matter more in the playoffs: shorter rotations, more minutes

    // user line (needs team context)
    if (user) {
      const t = L.teams[user.teamId];
      const roster = teamRoster(L, t, user);
      user.ctx = { coTax: coTaxFor(user.p, roster), pace: t.pace, wins: t.wins };
      user.line = user.getLine(user.ctx);
    }
    // everyone else
    const lines = {};
    allPlayers.forEach((p) => {
      const t = L.teams[p.teamId];
      const roster = teamRoster(L, t, user);
      const e = expLine(p, { coTax: coTaxFor(p, roster), wins: t.wins, pace: t.pace, rookie: p.rookie, minsFloor: p.rookie ? NBA.rookieFloor(p.draftSlot) : 0 });
      const l = lineFromExp(p, e, avail[p.id].gp);
      l.id = p.id; l.teamId = p.teamId; l.wins = t.wins;
      lines[p.id] = l;
      entries.push({ p, l, t, id: p.id });
    });
    if (user) {
      const l = Object.assign({}, user.line);
      l.perf = perfOf(l); l.id = 'user'; l.teamId = user.teamId; l.wins = L.teams[user.teamId].wins;
      entries.push({ p: user.p, l, t: L.teams[user.teamId], id: 'user', isUser: true });
      user.line.perf = l.perf;
    }
    L.lines = lines;

    // the scoring champion nearly always clears 31 ppg (every year but two since 2014); a user who leads with 30.3+ is left alone
    {
      const qe = entries.filter((e) => e.l.gp >= 58), top = qe.reduce((b, e) => (!b || e.l.pts > b.l.pts ? e : b), null);
      const tgt = rand() < 0.86 ? 30.95 + Math.abs(randn()) * 1.1 + (rand() < 0.15 ? 1 : 0) : 30.15 + rand() * 0.85;
      if (top && top.l.pts < tgt && !(top.isUser && top.l.pts >= 30.3)) {
        const npc = qe.filter((e) => !e.isUser).reduce((b, e) => (!b || e.l.pts > b.l.pts ? e : b), null);
        if (npc && npc.l.pts < tgt && tgt / npc.l.pts < 1.15) { npc.l.pts = tgt; npc.l.perf = perfOf(npc.l); }
      }
    }
    // awards
    const q65 = entries.filter((e) => e.l.gp >= 65);
    // Voting models fitted to real data (scripts/real-mvp-model.py, 1981-2025): MVP = conditional logit over the league's 14 best producers on production, team wins and scoring;
    // All-NBA = logistic on the same three. Voters' randomness is the Gumbel / logistic noise of those models, nothing else is bolted on.
    const gumbel = () => -Math.log(-Math.log(Math.max(1e-9, rand())));
    const pool = q65.slice().sort((a, b) => b.l.perf - a.l.perf);
    const mvpAll = pool.map((e, i) => ({ e, s: 0.303 * e.l.perf + 0.289 * e.l.wins + 0.062 * e.l.pts + (i < 14 ? gumbel() : -50) })).sort((a, b) => b.s - a.s);
    const byMVP = mvpAll;
    const dpoy = q65.map((e) => ({ e, s: defScore(e.p, e.l) + 0.12 * (e.l.wins - 41) + randn() * 2 })).sort((a, b) => b.s - a.s);
    const roy = entries.filter((e) => e.p.rookie && e.l.gp >= 50).map((e) => ({ e, s: e.l.perf + 0.1 * (e.l.wins - 41) + randn() * 1.5 })).sort((a, b) => b.s - a.s);
    const mip = q65.filter((e) => !e.p.rookie && e.p.prevPerf != null && e.p.age <= 28).map((e) => ({ e, s: (e.l.perf - e.p.prevPerf) + randn() * 1.5 })).sort((a, b) => b.s - a.s);
    const logisticNoise = () => { const u = Math.max(1e-9, Math.min(1 - 1e-9, rand())); return Math.log(u / (1 - u)); };
    const allNBA = pool.slice(0, 35).map((e) => ({ e, s: -16.75 + 0.218 * e.l.perf + 0.124 * e.l.wins + 0.097 * e.l.pts + logisticNoise() })).sort((a, b) => b.s - a.s).slice(0, 15);
    const allDef = dpoy.slice(0, 10);
    const stars = entries.filter((e) => e.l.gp >= 40).map((e) => ({ e, s: e.l.perf + randn() * 3 })).sort((a, b) => b.s - a.s).slice(0, 24);
    const qual = entries.filter((e) => e.l.gp >= 58);
    const lead = (k) => qual.slice().sort((a, b) => b.l[k] - a.l[k]);
    const scoring = lead('pts');
    const ref = (x) => (x ? { id: x.e.id, name: x.e.p.name, team: x.e.t.nick, isUser: !!x.e.isUser, pts: x.e.l.pts, reb: x.e.l.reb, ast: x.e.l.ast } : null);
    const awards = {
      mvp: ref(byMVP[0]), mvpRunner: ref(byMVP[1]), dpoy: ref(dpoy[0]), roy: ref(roy[0]), mip: ref(mip[0]),
      scoring: scoring[0] ? { id: scoring[0].id, name: scoring[0].p.name, ppg: scoring[0].l.pts, isUser: !!scoring[0].isUser } : null,
      allNBA: allNBA.map((x) => x.e.id), allDef: allDef.map((x) => x.e.id), allStar: stars.map((x) => x.e.id),
      mvpIds: byMVP.slice(0, 5).map((x) => x.e.id),
    };
    const rrow = (x) => ({ id: x.e.id, name: x.e.p.name, team: x.e.t.nick, pts: x.e.l.pts, reb: x.e.l.reb, ast: x.e.l.ast, stl: x.e.l.stl, blk: x.e.l.blk, perf: x.e.l.perf, gp: x.e.l.gp, wins: x.e.t.wins, isUser: !!x.e.isUser, s: x.s });
    awards.race = { mvp: byMVP.slice(0, 5).map(rrow), dpoy: dpoy.slice(0, 5).map(rrow), roy: roy.slice(0, 5).map(rrow), mip: mip.slice(0, 5).map(rrow) };
    // versions without the user, so a live (mid-season) view can merge in the user's real to-date line without leaking where they finish
    awards.raceOthers = { mvp: byMVP.filter((x) => !x.e.isUser).slice(0, 7).map(rrow), dpoy: dpoy.filter((x) => !x.e.isUser).slice(0, 7).map(rrow), roy: roy.filter((x) => !x.e.isUser).slice(0, 7).map(rrow), mip: mip.filter((x) => !x.e.isUser).slice(0, 7).map(rrow) };
    awards.allNBATeams = [0, 1, 2].map((i) => allNBA.slice(i * 5, i * 5 + 5).map((x) => x.e.id));
    awards.allDefTeams = [0, 1].map((i) => allDef.slice(i * 5, i * 5 + 5).map((x) => x.e.id));
    const rankOf = (k, id) => { const i = lead(k).findIndex((e) => e.id === id); return i < 0 ? null : i + 1; };
    const leaders = {};
    ['pts', 'reb', 'ast', 'stl', 'blk'].forEach((k) => (leaders[k] = lead(k).slice(0, 5).map((e) => ({ name: e.p.name, team: e.t.nick, v: e.l[k], isUser: !!e.isUser }))));
    L.lastLeaders = leaders;
    const leadersOthers = {};
    ['pts', 'reb', 'ast', 'stl', 'blk'].forEach((k) => (leadersOthers[k] = lead(k).filter((e) => !e.isUser).slice(0, 7).map((e) => ({ name: e.p.name, team: e.t.nick, v: e.l[k] }))));
    const league = {
      n30: qual.filter((e) => e.l.pts >= 30).length, n25: qual.filter((e) => e.l.pts >= 25).length,
      topScorers: scoring.slice(0, 5).map((e) => ({ name: e.p.name, ppg: e.l.pts })),
    };
    const playoffs = simPlayoffs(L, user ? user.teamId : null);
    // remember perf for MIP, and voter fatigue for repeat MVPs
    entries.forEach((e) => { e.p.prevPerf = e.l.perf; e.p.mvpRecent = 0; });
    const stand = L.teams.map((t) => ({ id: t.id, name: t.name, nick: t.nick, conf: t.conf, wins: t.wins, losses: t.losses }));
    // each team's result this year (kept for the team pages)
    const po = {}; playoffs.rounds.forEach((rd, ri) => rd.series.forEach((sr) => { po[sr.a.id] = po[sr.a.id] || 0; po[sr.b.id] = po[sr.b.id] || 0; po[sr.loser.id] = ri + 1; po[sr.winner.id] = Math.max(po[sr.winner.id], ri + 2); }));
    const PO_TXT = ['Missed the playoffs', 'Lost in the first round', 'Lost in the conference semifinals', 'Lost in the conference finals', 'Lost in the NBA Finals', 'NBA champions'];
    L.teams.forEach((t) => { const k = po[t.id] == null ? 0 : Math.min(5, po[t.id]); t.hist = (t.hist || []).concat([{ year: L.year, label: seasonLabel(L.year), w: t.wins, l: t.losses, po: k, text: PO_TXT[k] }]).slice(-12); });
    const res = { year: L.year, label: seasonLabel(L.year), awards, playoffs, standings: stand, leaders, leadersOthers, league, ranks: user ? { pts: rankOf('pts', 'user'), reb: rankOf('reb', 'user'), ast: rankOf('ast', 'user'), stl: rankOf('stl', 'user'), blk: rankOf('blk', 'user') } : null, entries };
    // history record
    L.history.push({ year: L.year, champion: playoffs.champion.name, mvp: awards.mvp && awards.mvp.name, dpoy: awards.dpoy && awards.dpoy.name, roy: awards.roy && awards.roy.name, scoring: awards.scoring && (awards.scoring.name + ' ' + awards.scoring.ppg.toFixed(1)) });
    if (L.history.length > 60) L.history.shift();
    return res;
  }

  // Finals MVP: best Finals line on the winning team. `user` is {pts, reb, ast} from the Finals series.
  const finalsScore = (pts, reb, ast) => 1.9 * pts + 1.15 * reb + 1.5 * ast;
  function finalsMVP(L, teamId, user) {
    // The award goes to the champion's best Finals performer, usually its leading scorer; a defender can win it (Iguodala 2015) when his two-way line is outstanding.
    // user = { pts, reb, ast, stl, blk } in the Finals series. Teammates get a Finals line drawn around their regular-season numbers.
    const t = L.teams[teamId];
    const cands = t.core.map((id) => {
      const l = L.lines[id];
      if (!l) return { name: L.players[id].name, pts: 8, reb: 3, ast: 2, db: 1 };
      return { name: L.players[id].name, pts: l.pts * (1.04 + 0.11 * randn()), reb: l.reb * (1.03 + 0.1 * randn()), ast: l.ast * (0.96 + 0.1 * randn()), db: (l.stl + l.blk) * (1 + 0.15 * randn()) };
    });
    if (user) cands.push({ name: 'user', pts: user.pts, reb: user.reb, ast: user.ast, db: (user.stl || 0) + (user.blk || 0) });
    const maxPts = Math.max.apply(null, cands.map((c) => c.pts));
    cands.forEach((c) => {
      c.s = (2.0 * c.pts + 1.0 * c.reb + 1.3 * c.ast + 2.5 * c.db) * (1 + 0.04 * randn());
      c.ok = c.pts >= 0.86 * maxPts || (c.db >= 3.0 && c.pts >= 0.5 * maxPts);   // the leading scorer, or an elite defender
    });
    const pool = cands.filter((c) => c.ok).sort((a, b) => b.s - a.s);
    return (pool.length ? pool : cands.sort((a, b) => b.s - a.s))[0].name;
  }

  // ------------------------------------------------------------ retirement / offseason
  function retireP(p) {
    const o = ovr(p);
    let h = p.age < 32 ? 0 : p.age < 34 ? 0.03 : p.age < 36 ? 0.09 : p.age < 38 ? 0.18 : p.age < 40 ? 0.3 : p.age < 42 ? 0.5 : 0.9;
    h *= clamp((80 - o) / 10, 0.12, 2.4);   // players still producing keep playing; the declining ones get squeezed out
    if (p.age >= 30 && o < 64) h += 0.18;
    return rand() < h * T.retireScale;
  }

  function lotteryOrder(L) {
    const ranked = L.teams.slice().sort((a, b) => a.wins - b.wins || rand() - 0.5);
    const lot = ranked.slice(0, 14), rest = ranked.slice(14);
    const odds = [14, 14, 14, 12.5, 10.5, 9, 7.5, 6, 4.5, 3, 2, 1.5, 1, 0.5];
    const pool = lot.map((t, i) => ({ t, w: odds[i] }));
    const top4 = [];
    for (let k = 0; k < 4; k++) {
      const tot = sum(pool.map((x) => x.w));
      let r = rand() * tot, idx = 0;
      for (; idx < pool.length; idx++) { r -= pool[idx].w; if (r <= 0) break; }
      idx = Math.min(idx, pool.length - 1);
      top4.push(pool[idx].t); pool.splice(idx, 1);
    }
    const lotRest = pool.map((x) => x.t);
    const mid = rest.slice().sort((a, b) => a.wins - b.wins);
    const first = top4.concat(lotRest, mid);
    // round 2: reverse of record
    const second = L.teams.slice().sort((a, b) => a.wins - b.wins || rand() - 0.5);
    return first.concat(second);
  }

  function makeProspect(L, age, ceil0) {
    const ceiling = ceil0 != null ? ceil0 : rollCeiling(0, null);
    const arch = randomArch(ceiling);
    const p = makePlayer({ id: L.nextId++, pos: randomPos(arch), arch, sec: rand() < 0.14 ? 'scorer' : null, ceiling, age: 18, gap: 10 + rand() * 12 });
    if (p.sec === p.arch) p.sec = null;
    while (p.age < age) progress(p);
    return p;
  }
  function stockOf(p, bonus) {
    const o = ovr(p);
    const est = p.ceiling + randn() * 9 + (rand() < 0.12 ? randn() * 16 : 0);
    return 0.5 * o + 0.5 * est - 1.4 * (p.age - 19) + (bonus || 0) + randn() * 5;
  }
  function projectStock(p) { // deterministic version for mock draft
    return 0.5 * ovr(p) + 0.5 * p.ceiling - 1.4 * (p.age - 19);
  }
  // Age at draft by recruit tier (real 2009-24 college prospects, data/real-draft-prospects.csv): share of class, then % Fr/So/Jr/Sr
  const RECRUIT_TIERS = [[0.052, [90, 9, 1, 0]], [0.055, [54, 25, 12, 8]], [0.126, [36, 28, 18, 19]], [0.155, [15, 21, 26, 38]], [0.159, [5, 17, 20, 58]], [0.296, [2, 13, 21, 63]], [0.158, [5, 6, 14, 75]]];
  function draftClass(L, n) {
    const out = [];
    const nInt = Math.round(n * 0.26), nCol = n - nInt; // internationals / pro-pathway prospects skew young and are not in the college table
    const ceils = []; for (let i = 0; i < nCol; i++) ceils.push(rollCeiling(0, null));
    ceils.sort((a, b) => b - a);
    ceils.forEach((c, i) => {
      const q = (i + 0.5) / nCol; let acc = 0, tier = RECRUIT_TIERS[RECRUIT_TIERS.length - 1];
      for (const t of RECRUIT_TIERS) { acc += t[0]; if (q <= acc / 1.0) { tier = t; break; } }
      const yr = +weighted({ 0: tier[1][0], 1: tier[1][1], 2: tier[1][2], 3: tier[1][3] });
      const p = makeProspect(L, 19 + yr, c); p.stock = stockOf(p); out.push(p);
    });
    for (let i = 0; i < nInt; i++) {
      const p = makeProspect(L, +weighted({ 19: 45, 20: 30, 21: 18, 22: 7 })); p.stock = stockOf(p); out.push(p);
    }
    return out;
  }
  function addRookies(L, picks, order) {
    // picks: array of {p, slot}
    picks.forEach(({ p, slot }) => {
      if (slot > 48 && ovr(p) < 60) return;
      const t = order[slot - 1];
      p.teamId = t.id; p.rookie = true; p.draftSlot = slot; p.yearsPro = 0;
      L.players[p.id] = p;
    });
  }
  function npcDraft(L) {
    const order = lotteryOrder(L);
    const cls = draftClass(L, 72).sort((a, b) => b.stock - a.stock);
    addRookies(L, cls.slice(0, 60).map((p, i) => ({ p, slot: i + 1 })), order);
    return { order };
  }
  // user draft: user ranked among a class
  function userDraft(L, user, bonus) {
    const order = lotteryOrder(L);
    const cls = draftClass(L, 72);
    user.stock = stockOf(user, bonus);
    const all = cls.concat([user]).sort((a, b) => b.stock - a.stock);
    const slot = all.indexOf(user) + 1;
    const picks = [];
    all.forEach((p, i) => { if (p !== user && i < 60) picks.push({ p, slot: i + 1 }); });
    addRookies(L, picks, order);
    const board = all.slice(0, 30).map((p, i) => ({ slot: i + 1, name: p === user ? user.name : p.name, pos: p.pos, age: p.age, team: order[i] ? order[i].name : '', isUser: p === user, ovr: Math.round(ovr(p)) }));
    return { slot: slot > 60 ? null : slot, team: slot > 60 ? null : order[slot - 1], board, order, classSize: all.length };
  }
  function mockRange(L, user, bonus) {
    // rough projection: run a few class simulations
    // cheap approximation of the class (no full player objects) so this stays fast
    const rem = { 19: 0.7, 20: 0.49, 21: 0.35, 22: 0.26 };
    const ranks = [];
    for (let k = 0; k < 16; k++) {
      const s = stockOf(user, bonus);
      let better = 0;
      for (let i = 0; i < 72; i++) {
        const age = +weighted({ 19: 46, 20: 26, 21: 16, 22: 12 });
        const c = rollCeiling(0, null);
        const o = c - (10 + 12 * rand()) * rem[age];
        const st = 0.5 * o + 0.5 * (c + randn() * 9) - 1.4 * (age - 19) + randn() * 5;
        if (st > s) better++;
      }
      ranks.push(1 + better);
    }
    ranks.sort((a, b) => a - b);
    return { lo: ranks[2], mid: ranks[8], hi: ranks[13] };
  }

  function settleRookies(L) {
    Object.values(L.players).filter((p) => p.rookie).forEach((p) => {
      p.rookie = false;
      const t = L.teams[p.teamId];
      t.bench = t.bench || [];
      if (!t.core.includes(p.id) && !t.bench.includes(p.id)) t.bench.push(p.id);
    });
  }

  function offseason(L, opts) {
    opts = opts || {};
    Object.values(L.players).forEach((p) => {
      progress(p); p.yearsPro++;
      if (retireP(p)) {
        const t = L.teams[p.teamId];
        t.core = t.core.filter((id) => id !== p.id);
        t.bench = (t.bench || []).filter((id) => id !== p.id);
        delete L.players[p.id];
      }
    });
    settleRookies(L);
    for (let i = 0; i < 6; i++) {
      const a = pick(L.teams), b = pick(L.teams);
      if (a === b || !a.core.length || !b.core.length) continue;
      const ia = rint(0, a.core.length - 1), ib = rint(0, b.core.length - 1);
      const pa = L.players[a.core[ia]], pb = L.players[b.core[ib]];
      a.core[ia] = pb.id; b.core[ib] = pa.id; pa.teamId = b.id; pb.teamId = a.id;
    }
    L.teams.forEach((t) => fillCore(L, t));
    if (opts.draft !== false) npcDraft(L);
    L.year++;
  }

  // run one season with no user (used while the player is in college and for warm-up)
  function runYear(L, opts) {
    const res = simSeason(L, null);
    offseason(L, opts);
    return res;
  }

  function poolStats(L) {
    const o = Object.values(L.players).filter((p) => !p.rookie).map(ovr).sort((a, b) => b - a);
    return { n90: o.filter((x) => x >= 90).length, n85: o.filter((x) => x >= 85).length, n80: o.filter((x) => x >= 80).length, mean: sum(o) / o.length, top: o.slice(0, 6).map((x) => Math.round(x)) };
  }

  Object.assign(NBA, { seasonLabel, rollAvail, applyMajorInjury, newLeague, simSeason, finalsMVP, offseason, runYear, makeReal, userDraft, npcDraft, draftClass, makeProspect, retireP, mockRange, projectStock, lotteryOrder, poolStats, perfOf, defScore, coTaxFor, teamRoster, makeNPC, poisson });
  if (typeof module !== 'undefined') module.exports = NBA;
})(typeof window !== 'undefined' ? window : globalThis);
