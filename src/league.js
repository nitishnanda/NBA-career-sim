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
    const lam = 0.8 * p.prone * (A.injury || 1) * clamp(1.25 - p.attrs.dur / 110, 0.35, 1.2) * (1 + Math.max(0, p.age - 28) * 0.04);
    const n = poisson(lam);
    let miss = 0;
    const list = [];
    for (let i = 0; i < n; i++) {
      const d = clamp(Math.round(Math.exp(1.6 + 0.9 * randn())), 1, 40);
      miss += d; list.push(d);
    }
    let major = null;
    const mp = 0.012 * p.prone * (A.injury || 1) * (1 + Math.max(0, p.age - 26) * 0.05) * (1 + clamp((p.target.ath - 70) / 60, 0, 0.5));
    if (rand() < mp) {
      major = pick(['torn ACL', 'torn Achilles', 'fractured foot', 'torn meniscus', 'ruptured patellar tendon']);
      miss = rint(48, 82);
    }
    const o = ovr(p);
    let rest = o >= 74 ? (p.age >= 30 ? rint(3, 7) : rint(0, 4)) : rint(0, 2);
    if (opts.noRest) rest = 0;
    return { gp: clamp(82 - miss - rest - (opts.extraMiss || 0), 0, 82), miss, rest, injuries: list, major };
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
  function fillCore(L, t) {
    while (t.core.length < 4) {
      const p = makeNPC(L, rint(23, 30), { ceiling: 67 + rand() * 9, bonus: 0 });
      p.teamId = t.id; L.players[p.id] = p; t.core.push(p.id);
    }
  }

  function newLeague(startYear) {
    const L = {
      year: startYear || 2025, nextId: 1, players: {}, rookies: [], history: [], lines: {},
      teams: D.TEAMS.map((t) => Object.assign({}, t, { core: [], depth: randn() * 2.2, wins: 41, losses: 41, pace: 99 })),
      capBase: 154.6, lastLeaders: null,
    };
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
    return L;
  }
  L_proto();
  function L_proto() {}

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
    const k = form || 1;
    const l = { gp, mins: e.mins, pts: e.pts * k, reb: e.reb * (0.97 + 0.06 * rand()), ast: e.ast * (0.97 + 0.06 * rand()), stl: e.stl, blk: e.blk, tov: e.tov, ts: e.ts, usg: e.usg };
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
        return (x <= 20 ? x : 20 + (x - 20) * 0.72) * (gp / 82);
      }).sort((x, y) => y - x).slice(0, 4);
      t.S = sum(vals);
      t.pace = 99 + randn() * 1.4;
    });
    const meanS = sum(L.teams.map((t) => t.S)) / L.teams.length;
    L.teams.forEach((t) => {
      t.depth = 0.55 * t.depth + randn() * 2.0;
      t.wins = 41 + T.winsPerPt * (t.S - meanS) + t.depth + randn() * 4.0;
    });
    const mw = sum(L.teams.map((t) => t.wins)) / L.teams.length;
    L.teams.forEach((t) => { t.wins = clamp(Math.round(t.wins - (mw - 41)), 12, 70); t.losses = 82 - t.wins; });
    L.teams.forEach((t) => { t.power = (t.wins - 41) / 2.7 + randn() * 0.8; });

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
      const e = expLine(p, { coTax: coTaxFor(p, roster), pace: t.pace, rookie: p.rookie, minsFloor: p.rookie ? NBA.rookieFloor(p.draftSlot) : 0 });
      const l = lineFromExp(p, e, avail[p.id].gp, 1 + 0.05 * randn());
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

    // awards
    const q65 = entries.filter((e) => e.l.gp >= 65);
    const byMVP = q65.map((e) => ({ e, s: e.l.perf + 0.5 * e.l.pts + 0.35 * (e.l.wins - 41) + randn() * 6 - (e.p.mvpRecent || 0), ok: e.l.wins >= 36 })).filter((x) => x.ok).sort((a, b) => b.s - a.s);
    const dpoy = q65.map((e) => ({ e, s: defScore(e.p, e.l) + 0.12 * (e.l.wins - 41) + randn() * 2 })).sort((a, b) => b.s - a.s);
    const roy = entries.filter((e) => e.p.rookie && e.l.gp >= 50).map((e) => ({ e, s: e.l.perf + 0.1 * (e.l.wins - 41) + randn() * 1.5 })).sort((a, b) => b.s - a.s);
    const mip = q65.filter((e) => !e.p.rookie && e.p.prevPerf != null && e.p.age <= 28).map((e) => ({ e, s: (e.l.perf - e.p.prevPerf) + randn() * 1.5 })).sort((a, b) => b.s - a.s);
    const allNBA = q65.map((e) => ({ e, s: e.l.perf + 0.4 * e.l.pts + 0.15 * (e.l.wins - 41) + randn() * 2 })).sort((a, b) => b.s - a.s).slice(0, 15);
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
    awards.allNBATeams = [0, 1, 2].map((i) => allNBA.slice(i * 5, i * 5 + 5).map((x) => x.e.id));
    awards.allDefTeams = [0, 1].map((i) => allDef.slice(i * 5, i * 5 + 5).map((x) => x.e.id));
    const rankOf = (k, id) => { const i = lead(k).findIndex((e) => e.id === id); return i < 0 ? null : i + 1; };
    const leaders = {};
    ['pts', 'reb', 'ast', 'stl', 'blk'].forEach((k) => (leaders[k] = lead(k).slice(0, 5).map((e) => ({ name: e.p.name, team: e.t.nick, v: e.l[k], isUser: !!e.isUser }))));
    L.lastLeaders = leaders;
    const league = {
      n30: qual.filter((e) => e.l.pts >= 30).length, n25: qual.filter((e) => e.l.pts >= 25).length,
      topScorers: scoring.slice(0, 5).map((e) => ({ name: e.p.name, ppg: e.l.pts })),
    };
    const playoffs = simPlayoffs(L, user ? user.teamId : null);
    // remember perf for MIP, and voter fatigue for repeat MVPs
    entries.forEach((e) => { e.p.prevPerf = e.l.perf; e.p.mvpRecent = (e.p.mvpRecent || 0) * 0.55 + (awards.mvp && awards.mvp.id === e.id ? 4 : 0); });
    const stand = L.teams.map((t) => ({ id: t.id, name: t.name, nick: t.nick, conf: t.conf, wins: t.wins, losses: t.losses }));
    const res = { year: L.year, label: seasonLabel(L.year), awards, playoffs, standings: stand, leaders, league, ranks: user ? { pts: rankOf('pts', 'user'), reb: rankOf('reb', 'user'), ast: rankOf('ast', 'user'), stl: rankOf('stl', 'user'), blk: rankOf('blk', 'user') } : null, entries };
    // history record
    L.history.push({ year: L.year, champion: playoffs.champion.name, mvp: awards.mvp && awards.mvp.name, dpoy: awards.dpoy && awards.dpoy.name, roy: awards.roy && awards.roy.name, scoring: awards.scoring && (awards.scoring.name + ' ' + awards.scoring.ppg.toFixed(1)) });
    if (L.history.length > 60) L.history.shift();
    return res;
  }

  // finals MVP: user entry optional {perf}
  function finalsMVP(L, teamId, userPerf) {
    const t = L.teams[teamId];
    const cands = t.core.map((id) => ({ name: L.players[id].name, s: (L.lines[id] ? L.lines[id].perf : 20) * (1 + 0.12 * randn()) + ovr(L.players[id]) * 0.1 }));
    if (userPerf != null) cands.push({ name: 'user', s: userPerf * 1.04 + 8 + 0.08 * randn() });
    cands.sort((a, b) => b.s - a.s);
    return cands[0].name;
  }

  // ------------------------------------------------------------ retirement / offseason
  function retireP(p) {
    let h = p.age < 32 ? 0 : p.age < 34 ? 0.04 : p.age < 36 ? 0.14 : p.age < 38 ? 0.3 : p.age < 40 ? 0.55 : 0.9;
    const o = ovr(p);
    if (p.age >= 30 && o < 64) h += 0.18;
    return rand() < h;
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

  function makeProspect(L, age) {
    const ceiling = rollCeiling(0, null);
    const arch = randomArch(ceiling);
    const p = makePlayer({ id: L.nextId++, pos: randomPos(arch), arch, sec: rand() < 0.14 ? 'scorer' : null, ceiling, age: 18, gap: 10 + rand() * 12 });
    if (p.sec === p.arch) p.sec = null;
    while (p.age < age) progress(p);
    return p;
  }
  function stockOf(p, bonus) {
    const o = ovr(p);
    const est = p.ceiling + randn() * 4;
    return 0.5 * o + 0.5 * est - 1.4 * (p.age - 19) + (bonus || 0) + randn() * 2.5;
  }
  function projectStock(p) { // deterministic version for mock draft
    return 0.5 * ovr(p) + 0.5 * p.ceiling - 1.4 * (p.age - 19);
  }
  function draftClass(L, n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const age = weighted({ 19: 46, 20: 26, 21: 16, 22: 12 });
      const p = makeProspect(L, +age);
      p.stock = stockOf(p);
      out.push(p);
    }
    return out;
  }
  function addRookies(L, picks, order) {
    // picks: array of {p, slot}
    picks.forEach(({ p, slot }) => {
      if (slot > 24 && ovr(p) < 66) return;
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
        const st = 0.5 * o + 0.5 * (c + randn() * 4) - 1.4 * (age - 19) + randn() * 2.5;
        if (st > s) better++;
      }
      ranks.push(1 + better);
    }
    ranks.sort((a, b) => a - b);
    return { lo: ranks[2], mid: ranks[8], hi: ranks[13] };
  }

  function settleRookies(L) {
    const rooks = Object.values(L.players).filter((p) => p.rookie);
    const ovrB = (p) => ovr(p) + (p.draftSlot <= 10 ? 3 : p.draftSlot <= 20 ? 1 : 0);
    rooks.sort((a, b) => ovrB(b) - ovrB(a));
    rooks.forEach((p) => (p.rookie = false));
    const placed = new Set();
    // own team first if it has a vacancy
    rooks.forEach((p) => {
      const t = L.teams[p.teamId];
      if (t.core.length < 4) { t.core.push(p.id); placed.add(p.id); }
    });
    // leftover talent goes to whichever teams still have holes (trades / draft-day deals)
    rooks.forEach((p) => {
      if (placed.has(p.id)) return;
      const t = L.teams.find((x) => x.core.length < 4);
      if (!t) return;
      p.teamId = t.id; t.core.push(p.id); placed.add(p.id);
    });
    // a top pick can still take a starting spot from the worst core guy
    rooks.forEach((p) => {
      if (placed.has(p.id)) return;
      const t = L.teams[p.teamId];
      const worst = t.core.map((id) => L.players[id]).sort((a, b) => ovr(a) - ovr(b))[0];
      if (p.draftSlot <= 6 && worst && ovr(p) > ovr(worst) + 3) {
        t.core.splice(t.core.indexOf(worst.id), 1); delete L.players[worst.id];
        t.core.push(p.id); placed.add(p.id);
      }
    });
    rooks.forEach((p) => { if (!placed.has(p.id)) delete L.players[p.id]; });
  }

  function offseason(L, opts) {
    opts = opts || {};
    Object.values(L.players).forEach((p) => {
      progress(p); p.yearsPro++;
      if (retireP(p)) {
        const t = L.teams[p.teamId];
        t.core = t.core.filter((id) => id !== p.id);
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

  Object.assign(NBA, { seasonLabel, rollAvail, applyMajorInjury, newLeague, simSeason, finalsMVP, offseason, runYear, userDraft, npcDraft, mockRange, projectStock, lotteryOrder, poolStats, perfOf, defScore, coTaxFor, teamRoster, makeNPC, poisson });
  if (typeof module !== 'undefined') module.exports = NBA;
})(typeof window !== 'undefined' ? window : globalThis);
