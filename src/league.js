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
    const lam = T.minorRate * p.prone * (A.injury || 1) * clamp(1.25 - p.attrs.dur / 110, 0.35, 1.2) * (1 + Math.max(0, p.age - 28) * 0.04);
    const n = poisson(lam);
    let miss = 0;
    const list = [];
    for (let i = 0; i < n; i++) {
      const d = clamp(Math.round(Math.exp(T.injMu + T.injSd * randn())), 1, T.injMax);
      miss += d; list.push(d);
    }
    let major = null, notable = null;
    const mp = T.majorRate * T.injScale * p.prone * (A.injury || 1) * (1 + Math.max(0, p.age - 26) * 0.05) * (1 + clamp((p.target.ath - 70) / 60, 0, 0.5));
    if (rand() < mp) {
      major = pick(['torn ACL', 'torn Achilles', 'fractured foot', 'torn meniscus', 'ruptured patellar tendon']);
      miss = rand() < T.seasonEnding ? rint(66, 82) : rint(48, 65);   // about half the majors cost the whole season (Durant 2019-20, Klay 2019-21)
    }
    if (!major && (p.injYears || []).includes(p.age)) {
      notable = pick(['stress fracture', 'high ankle sprain', 'torn labrum', 'sports hernia', 'knee sprain', 'broken hand']);
      miss = Math.max(miss, rint(34, 70));
    }
    const o = ovr(p);
    let rest = o >= 74 ? (p.age >= 30 ? rint(3, 3 + T.restOld) : rint(0, T.restStar)) : o >= 68 ? rint(0, 8) : rint(0, 26); // role players churn: DNPs, waivers, two-way deals
    if (opts.noRest) rest = 0;
    // the 65-game rule for awards (2024-): stars close to the line skip rest days to qualify (real stars' seasons since cluster at 65+)
    { const left = 82 - miss - (opts.extraMiss || 0); if (o >= T.qualifyOvr && !major && left - rest < 65 && left >= 65) rest = Math.min(rest, left - 65); }
    return { gp: clamp(82 - miss - rest - (opts.extraMiss || 0), 0, 82), miss, rest, injuries: list, major, notable };
  }
  // what a major injury takes from the body: the burst (athleticism) and the durability. Drawn once; a person's rehab choice scales it later, the autopilot just takes it.
  function injuryDamage() { return { ath: 3 + rand() * 4, dur: 2 + rand() * 4, tath: 3 }; }
  function applyInjuryDamage(p, d, f) {
    f = f == null ? 1 : f;
    p.attrs.ath = clamp(p.attrs.ath - d.ath * f, 8, 99); p.attrs.dur = clamp(p.attrs.dur - d.dur * f, 8, 99); p.target.ath = clamp(p.target.ath - d.tath * f, 8, 99);
  }
  function applyMajorInjury(p) { applyInjuryDamage(p, injuryDamage(), 1); }

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
    const rs = (NBA.REAL_SIZES || {})[name];   // real roster players carry their real size; their ratings already come from their real production, so size does not move them
    const p = makePlayer({ id: L.nextId++, name, pos, arch, sec: sec && sec !== arch ? sec : null, ceiling, age, gap: Math.max(0, ceiling - goal), ht: rs && rs[0], wt: rs && rs[1], sizeFx: false });
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
    let tax = 0, above = 0;
    const me = ovr(self);
    roster.forEach((q) => {
      if (q === self) return;
      const o = ovr(q);
      if (o >= me && o > 72) above++;
      // the pecking order: a better teammate takes your shots; a lesser one takes fewer (coTaxDown < 1), so a real #2 option keeps a #2's volume
      tax += (o >= me ? 1 : T.coTaxDown) * T.coTaxK * Math.max(0, o - 72) - 0.0008 * Math.max(0, 70 - o);
    });
    // the cap grows with every good player ahead of you: a third option behind two stars gives up more shots than a second option behind one
    return clamp(tax, -0.03, T.coTaxMax * (1 + T.coTaxStack * Math.max(0, above - 1)));
  }
  // star gravity: a great #1 draws the defence, so his teammates get easier looks (real 2016-25: the #2-#4 scorers shoot +2 to +3 TS% next to a
  // 26+ ppg #1 than next to a sub-22 one); weak rosters' supporting cast shoots worse. The best player on the roster gets nothing from it.
  function gravityFor(self, roster) {
    const best = Math.max(...roster.filter(Boolean).map(ovr));
    return ovr(self) >= best ? 0 : T.gravTs * clamp((best - T.gravMid) / 6, -1.5, 1.5);
  }
  // the clear #1 on his roster is the franchise player: the offence runs through him and he plays heavy minutes
  function franchiseFor(self, roster) {
    const o = ovr(self); let best = 0; roster.forEach((q) => { if (q !== self) best = Math.max(best, ovr(q)); });
    return clamp((o - best - 1) / 9, 0, 1) * clamp((o - 70) / 14, 0, 1);
  }
  const perfOf = (l) => l.pts * (1 + 2.2 * (l.ts - 0.57)) + 1.15 * l.reb + 1.5 * l.ast + 2 * (l.stl + l.blk) - 1.1 * l.tov;
  function defScore(p, l) {
    return 4 * l.blk + 3.5 * l.stl + 0.12 * Math.max(p.attrs.rimP, p.attrs.perD);
  }
  function lineFromExp(p, e, gp, form) {
    const sh = 1 + T.formSd * randn();
    const ind = () => 1 + 0.035 * randn();
    const soft = (x) => (x <= 30 ? x : 30 + 0.75 * (x - 30));   // no one holds 33-36 a night for a decade: the very top is trimmed (nothing at or below 30 moves)
    const l = { gp, mins: e.mins, pts: soft(e.pts * sh * ind()), reb: e.reb * sh * ind(), ast: e.ast * sh * ind(), stl: e.stl * sh * ind(), blk: e.blk * sh * ind(), tov: e.tov, ts: e.ts, usg: e.usg };
    l.perf = perfOf(l);
    return l;
  }

  // ------------------------------------------------------------ playoffs
  function playGame(pa, pb, hcaA) { return rand() < 1 / (1 + Math.exp(-0.145 * (pa - pb + (hcaA ? 2.5 : -2.5)))); }
  function series(L, a, b, fx) {
    // a is the higher seed (home court). fx: the user's own plan for this series (a power adjustment, and a forced result for a Game 7 he decided)
    const ra = a.power + (fx && fx.uid === a.id ? fx.d : 0), rb = b.power + (fx && fx.uid === b.id ? fx.d : 0);
    let wa = 0, wb = 0, g = 0;
    const hc = [1, 1, 0, 0, 1, 0, 1];
    while (wa < 4 && wb < 4) {
      if (playGame(ra, rb, hc[g++])) wa++; else wb++;
    }
    if (fx && fx.force && wa + wb === 7) {   // a Game 7 the player decided: the series ends 4-3 for whoever he made it
      const aUser = fx.uid === a.id, want = fx.force === 'win' ? (aUser ? 'a' : 'b') : (aUser ? 'b' : 'a');
      if ((wa > wb ? 'a' : 'b') !== want) { const t = wa; wa = wb; wb = t; }
    }
    return { a, b, wa, wb, winner: wa > wb ? a : b, loser: wa > wb ? b : a, games: wa + wb };
  }
  function simPlayoffs(L, userTeamId, mods) {
    const um = mods || {}, fxFor = (r, m) => (userTeamId != null && (m[0].id === userTeamId || m[1].id === userTeamId) ? { uid: userTeamId, d: (um.rounds || [])[r] || 0, force: um.force && um.force[r] } : null);
    const out = { rounds: [], playin: [], champion: null, userSeries: [], userMade: false, userOut: null };
    const confs = { E: [], W: [] };
    L.teams.forEach((t) => confs[t.conf].push(t));
    const seeds = {};
    ['E', 'W'].forEach((c) => {
      const s = confs[c].slice().sort((x, y) => y.wins - x.wins || rand() - 0.5);
      // play-in: 7 v 8 (winner is the 7 seed), 9 v 10 (loser is out), then the loser of 7 v 8 hosts the winner of 9 v 10 for the 8 seed
      const pi = (hi, lo, label, stake) => {
        const r = playGame(hi.power, lo.power, true) ? [hi, lo] : [lo, hi];
        out.playin.push({ conf: c, label, stake, hi: hi.name, lo: lo.name, hiSeed: s.indexOf(hi) + 1, loSeed: s.indexOf(lo) + 1, w: r[0].name, l: r[1].name });
        if (userTeamId != null && (hi.id === userTeamId || lo.id === userTeamId)) { const won = r[0].id === userTeamId, opp = hi.id === userTeamId ? lo : hi; out.userSeries.push({ round: 'Play-In', playin: true, label, stake, opp: opp.name, home: hi.id === userTeamId, w: won ? 1 : 0, l: won ? 0 : 1, games: 1, won }); }
        return r;
      };
      const g78 = pi(s[6], s[7], '7 vs 8', 'The winner is the ' + c + ' 7 seed; the loser gets a second chance'), g910 = pi(s[8], s[9], '9 vs 10', 'Win or go home');
      const g8 = pi(g78[1], g910[0], 'For the 8 seed', 'Win or go home');
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
          const s = series(L, hi, lo, fxFor(r, m)); winners.push(s.winner); return s;
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
    const fin = series(L, hi, lo, fxFor(3, [hi, lo]));
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
        // team impact the rating misses: near their peaks, real box-score dominators' teams won 47 (scorers' 43, gens' 54) while the ratings under-credit
        // all-round production (scripts/ovr-equalize.js), so archetypes carry a fitted impact term (realism test: 'team wins near peak')
        const x = ovr(p) - 60 + (D.ARCHETYPES[p.arch].impact || 0);
        // young players have a smaller impact on winning than their rating suggests
        const expF = 0.85 + 0.05 * Math.min(3, p.yearsPro || 0);
        return (x <= 20 ? x : 20 + (x - 20) * T.starWinK) * (gp / 82) * expF;
      }).sort((x, y) => y - x).slice(0, 4);
      t.S = sum(vals);
      t.pace = 99 + randn() * 1.4;
    });
    const meanS = sum(L.teams.map((t) => t.S)) / L.teams.length;
    L.teams.forEach((t) => {
      // superstars pull talent (front offices build around them) on every team, not only the user's: depth fades 40% a year
      const best = Math.max(0, ...teamRoster(L, t, user).filter(Boolean).map(ovr));
      t.depth = 0.6 * t.depth + randn() * 3.0 + clamp((best - 84) * T.starPull, 0, 6);
      t.wins = 41 + T.winsPerPt * (t.S - meanS) + t.depth + randn() * 4.6;
    });
    // roster continuity: a team does not flip from the lottery to the top seed in one summer
    L.teams.forEach((t) => { t.wins = 0.9 * t.wins + 0.1 * (t.prevWins == null ? 41 : t.prevWins); });
    const mw = sum(L.teams.map((t) => t.wins)) / L.teams.length;
    // real tails: more truly bad teams, fewer 60+ juggernauts
    L.teams.forEach((t) => { let w = t.wins - (mw - 41); if (w < 33) w -= (33 - w) * 0.22; if (w > 54) w -= (w - 54) * ((user && t.id === user.teamId && ovr(user.p) >= 88) ? T.userWinShrink : 0.2); t.wins = clamp(Math.round(w), 12, 73); t.losses = 82 - t.wins; });
    L.teams.forEach((t) => { t.power = (t.wins - 41) / 2.7 + randn() * 0.8; t.prevWins = t.wins; });
    deadlineTrades(L);
    if (user) { const ut = L.teams[user.teamId]; ut.power += clamp((ovr(user.p) - 84) * 0.1, 0, 1.5); } // superstars matter more in the playoffs: shorter rotations, more minutes

    // user line (needs team context)
    if (user) {
      const t = L.teams[user.teamId];
      const roster = teamRoster(L, t, user);
      user.ctx = { coTax: coTaxFor(user.p, roster), fr: franchiseFor(user.p, roster), tsAdj: gravityFor(user.p, roster), pace: t.pace, wins: t.wins };
      user.line = user.getLine(user.ctx);
    }
    // everyone else
    const lines = {};
    allPlayers.forEach((p) => {
      const t = L.teams[p.teamId];
      const roster = teamRoster(L, t, user);
      const e = expLine(p, { coTax: coTaxFor(p, roster), fr: franchiseFor(p, roster), tsAdj: gravityFor(p, roster), wins: t.wins, pace: t.pace, rookie: p.rookie, minsFloor: p.rookie ? NBA.rookieFloor(p.draftSlot) : 0 });
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
    // one ball, one set of boards: a roster cannot have two players each taking a star's assists/rebounds/points
    // (a real team's rotation totals ~29 ast, ~46 reb); the extra is shaved off the lesser producers, never off the user
    const byTeam = {}; entries.forEach((e) => { if (e.l.gp >= 20) (byTeam[e.t.id] = byTeam[e.t.id] || []).push(e); });
    const CAP = { ast: T.capAst || 32, reb: T.capReb || 50, pts: T.capPts };
    Object.keys(byTeam).forEach((tid) => {
      const es = byTeam[tid];
      Object.keys(CAP).forEach((k) => {
        const tot = sum(es.map((e) => e.l[k])); if (tot <= CAP[k]) return;
        const fixed = sum(es.filter((e) => e.isUser).map((e) => e.l[k])), npc = es.filter((e) => !e.isUser).sort((a, b) => b.l[k] - a.l[k]);
        const top = npc.length && !es.some((e) => e.isUser && e.l[k] >= npc[0].l[k]) ? npc[0].l[k] : 0;   // the team's lead producer of that stat keeps his line unless the user is the lead
        const rest = tot - fixed - top; if (rest <= 0) return;
        const f = clamp((CAP[k] - fixed - top) / rest, 0.5, 1);
        npc.forEach((e, i) => { if (i === 0 && top) return; e.l[k] *= f; });
      });
    });
    entries.forEach((e) => { if (!e.isUser && byTeam[e.t.id]) e.l.perf = perfOf(e.l); });
    L.lines = lines;

    // awards
    const q65 = entries.filter((e) => e.l.gp >= T.awardMinGp);
    // Voting models fitted to real data (scripts/real-mvp-model.py, 1981-2025): MVP = conditional logit over the league's 14 best producers on production, team wins and scoring;
    // All-NBA = logistic on the same three plus last season's All-NBA (voters lean on reputation, as for All-Star and All-Defense).
    // Voters' randomness is the Gumbel / logistic noise of those models, nothing else is bolted on.
    const gumbel = () => -Math.log(-Math.log(Math.max(1e-9, rand())));
    const pool = q65.slice().sort((a, b) => b.l.perf - a.l.perf);
    // voter fatigue fitted on 1981-2025 voting (scripts/real-mvp-model.py): winning last year changes nothing, but a two-time reigning MVP is a big underdog
    // for a third straight (12 chances, Bird the only one to do it)
    const mvpAll = pool.map((e, i) => ({ e, s: 0.318 * e.l.perf + 0.294 * e.l.wins + 0.068 * e.l.pts + ((e.p.mvpStreak || 0) >= 2 ? -2.05 : 0) + (i < 14 ? gumbel() : -50) })).sort((a, b) => b.s - a.s);
    const byMVP = mvpAll;
    const dpoy = q65.map((e) => ({ e, s: defScore(e.p, e.l) + 0.12 * (e.l.wins - 41) + randn() * 2 })).sort((a, b) => b.s - a.s);
    const roy = entries.filter((e) => e.p.rookie && e.l.gp >= 50).map((e) => ({ e, s: e.l.perf + 0.1 * (e.l.wins - 41) + randn() * 1.5 })).sort((a, b) => b.s - a.s);
    const mip = q65.filter((e) => !e.p.rookie && e.p.prevPerf != null && e.p.age <= 28).map((e) => ({ e, s: (e.l.perf - e.p.prevPerf) + randn() * 1.5 })).sort((a, b) => b.s - a.s);
    const logisticNoise = () => { const u = Math.max(1e-9, Math.min(1 - 1e-9, rand())); return Math.log(u / (1 - u)); };
    const allNBA = pool.slice(0, 35).map((e) => ({ e, s: -15.12 + 0.184 * e.l.perf + 0.111 * e.l.wins + 0.092 * e.l.pts + (e.p.prevAN ? 1.349 : 0) + 0.7 * logisticNoise() })).sort((a, b) => b.s - a.s).slice(0, 15);   // the vote noise is tighter than the logistic: real 1st-team picks are almost all top-10 producers (11% outside), and 2nd/3rd teams 45% / 73% outside
    // All-Star and All-Defense: logistic selection models fitted to 2001-25 voting (scripts/real-allstar-model.py) plus logistic noise;
    // All-Stars are the top 12 per conference, All-Defense the top 10 in the league (positionless since 2024)
    const ASM = { b0: -15.572, perf: 0.2108, pts: 0.1557, wins: 0.0916, prevAS: 1.485 }, ADM = { b0: -14.619, stl: 2.4768, blk: 1.5368, reb: 0.0154, mins: 0.0591, wins: 0.1055, prevAD: 3.0275 };
    const allDef = q65.map((e) => ({ e, s: ADM.b0 + ADM.stl * e.l.stl + ADM.blk * e.l.blk + ADM.reb * e.l.reb + ADM.mins * e.l.mins + ADM.wins * e.l.wins + (e.p.prevAD ? ADM.prevAD : 0) + logisticNoise() })).sort((a, b) => b.s - a.s).slice(0, 10);
    const asCand = entries.filter((e) => e.l.gp >= 40).map((e) => ({ e, s: ASM.b0 + ASM.perf * e.l.perf + ASM.pts * e.l.pts + ASM.wins * e.l.wins + (e.p.prevAS ? ASM.prevAS : 0) + logisticNoise() })).sort((a, b) => b.s - a.s);
    const stars = ['E', 'W'].reduce((acc, c) => acc.concat(asCand.filter((x) => x.e.t.conf === c).slice(0, 12)), []);
    entries.forEach((e) => { e.p.prevAS = false; e.p.prevAD = false; e.p.prevAN = false; e.p.mvpStreak = mvpAll[0] && mvpAll[0].e === e ? (e.p.mvpStreak || 0) + 1 : 0; });
    stars.forEach((x) => { x.e.p.prevAS = true; }); allDef.forEach((x) => { x.e.p.prevAD = true; }); allNBA.forEach((x) => { x.e.p.prevAN = true; });
    const qual = entries.filter((e) => e.l.gp >= 58);
    const lead = (k) => qual.slice().sort((a, b) => b.l[k] - a.l[k]);
    // a 64+ win team needs a real producer: real 66+ win teams (9 since 2005) all had a top-10 producer, while the sim let rated-but-quiet stars
    // carry 66 wins. Such teams without one are pulled back toward 62 (a quarter of any win beyond 64 is kept). Real 60+ teams: 68% had one
    { const bestRk = {}; qual.slice().sort((a, b) => b.l.perf - a.l.perf).forEach((e, i) => { if (bestRk[e.t.id] == null) bestRk[e.t.id] = i + 1; });
      L.teams.forEach((t) => { if (T.winCapRank && t.wins >= 64 && !(bestRk[t.id] <= T.winCapRank)) { t.wins = Math.round(62 + 0.25 * (t.wins - 64)); t.losses = 82 - t.wins; } }); }
    const scoring = lead('pts');
    const ref = (x) => (x ? { id: x.e.id, name: x.e.p.name, team: x.e.t.nick, isUser: !!x.e.isUser, pts: x.e.l.pts, reb: x.e.l.reb, ast: x.e.l.ast } : null);
    const awards = {
      mvp: ref(byMVP[0]), mvpRunner: ref(byMVP[1]), dpoy: ref(dpoy[0]), roy: ref(roy[0]), mip: ref(mip[0]),
      scoring: scoring[0] ? { id: scoring[0].id, name: scoring[0].p.name, ppg: scoring[0].l.pts, isUser: !!scoring[0].isUser } : null,
      allNBA: allNBA.map((x) => x.e.id), allDef: allDef.map((x) => x.e.id), allStar: stars.map((x) => x.e.id),
      mvpIds: byMVP.slice(0, 5).map((x) => x.e.id),
    };
    const rrow = (x) => ({ id: x.e.id, name: x.e.p.name, team: x.e.t.nick, pts: x.e.l.pts, reb: x.e.l.reb, ast: x.e.l.ast, stl: x.e.l.stl, blk: x.e.l.blk, perf: x.e.l.perf, gp: x.e.l.gp, wins: x.e.t.wins, isUser: !!x.e.isUser, s: x.s, da: Math.max(x.e.p.attrs.rimP, x.e.p.attrs.perD) });
    awards.race = { mvp: byMVP.slice(0, 5).map(rrow), dpoy: dpoy.slice(0, 5).map(rrow), roy: roy.slice(0, 5).map(rrow), mip: mip.slice(0, 5).map(rrow) };
    // versions without the user, so a live (mid-season) view can merge in the user's real to-date line without leaking where they finish
    awards.raceOthers = { mvp: byMVP.filter((x) => !x.e.isUser).slice(0, 7).map(rrow), dpoy: dpoy.filter((x) => !x.e.isUser).slice(0, 7).map(rrow), roy: roy.filter((x) => !x.e.isUser).slice(0, 7).map(rrow), mip: mip.filter((x) => !x.e.isUser).slice(0, 7).map(rrow) };
    awards.allNBATeams = [0, 1, 2].map((i) => allNBA.slice(i * 5, i * 5 + 5).map((x) => x.e.id));
    awards.allDefTeams = [0, 1].map((i) => allDef.slice(i * 5, i * 5 + 5).map((x) => x.e.id));
    const rankOf = (k, id) => { const i = lead(k).findIndex((e) => e.id === id); return i < 0 ? null : i + 1; };
    const leaders = {};
    ['pts', 'reb', 'ast', 'stl', 'blk'].forEach((k) => (leaders[k] = lead(k).slice(0, 5).map((e) => ({ id: e.isUser ? 'user' : e.id, name: e.p.name, team: e.t.nick, v: e.l[k], isUser: !!e.isUser }))));
    L.lastLeaders = leaders;
    const leadersOthers = {};
    ['pts', 'reb', 'ast', 'stl', 'blk'].forEach((k) => (leadersOthers[k] = lead(k).filter((e) => !e.isUser).slice(0, 7).map((e) => ({ id: e.id, name: e.p.name, team: e.t.nick, v: e.l[k] }))));
    const league = {
      n30: qual.filter((e) => e.l.pts >= 30).length, n25: qual.filter((e) => e.l.pts >= 25).length,
      topScorers: scoring.slice(0, 5).map((e) => ({ name: e.p.name, ppg: e.l.pts })),
    };
    const playoffs = simPlayoffs(L, user ? user.teamId : null, user ? user.poMods : null);
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
    // every league player's own career page: a compact line per season (year, age, team, gp, pts, reb, ast, stl, blk, ovr; the per-game numbers x10) and his awards
    { const pos = (arr, id) => arr.some((x) => x.e.id === id), champId = playoffs.champion.id;
      entries.forEach((e) => {
        if (e.isUser || !e.p || e.l.gp < 15) return;
        const p = e.p, r1 = (v) => Math.round(v * 10);
        if (!p.hist && (p.yearsPro || 0) >= 1) {   // first time on record: the seasons before this save are rebuilt from his present line, flagged as estimates
          const back = [], n = Math.min(4, p.yearsPro), up = p.age <= 26, old = p.age >= 30, idn = typeof p.id === 'number' ? p.id : 7;
          for (let k = n; k >= 1; k--) { const wob = 1 + 0.09 * Math.sin(idn * 12.9898 + k * 78.233), f = clamp((up ? 1 - 0.1 * k : old ? 1 + 0.04 * k : 1 - 0.03 * k) * wob, 0.45, 1.3), gpk = 52 + ((idn * 37 + k * 13) % 29);
            back.push([L.year - k, p.age - k, -1, gpk, r1(e.l.pts * f), r1(e.l.reb * f), r1(e.l.ast * f), r1(e.l.stl * f), r1(e.l.blk * f), Math.round(ovr(p) - (up ? 2.2 : old ? -1.2 : 0.5) * k), 1]); }
          p.hist = back;
        }
        p.hist = (p.hist || []).concat([[L.year, p.age, e.t.id, Math.round(e.l.gp), r1(e.l.pts), r1(e.l.reb), r1(e.l.ast), r1(e.l.stl), r1(e.l.blk), Math.round(ovr(p))]]).slice(-16);
        const a = (p.awd = p.awd || {}), add = (k) => { a[k] = (a[k] || 0) + 1; };
        if (awards.mvp && awards.mvp.id === e.id) add('MVP'); if (awards.dpoy && awards.dpoy.id === e.id) add('DPOY'); if (awards.roy && awards.roy.id === e.id) add('ROY'); if (awards.mip && awards.mip.id === e.id) add('MIP');
        if (awards.scoring && awards.scoring.id === e.id) add('Scoring titles');
        if (awards.allStar.includes(e.id)) add('All-Star'); if (awards.allNBA.includes(e.id)) add('All-NBA'); if (awards.allDef.includes(e.id)) add('All-Defense');
        if (e.t.id === champId && e.l.gp >= 30) add('Champion');
      }); }
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
    const o = ovr(p), st = (p.tr && p.tr.stay) || 0;
    let h = p.age < 32 ? 0 : p.age < 34 ? 0.03 : p.age < 36 ? 0.09 : p.age < 38 ? 0.18 : p.age < 40 ? 0.3 : p.age < 42 ? 0.5 : 0.9;
    h *= clamp((T.retireKnee - o) / T.retireSpan, T.retireFloor, 2.0);   // players still producing keep playing; the declining ones get squeezed out
    // fading players can be out of the league at 29-31 (no offers, injuries, overseas); stars still producing do not walk away that early
    if (p.age >= 29 && p.age < 32) h += T.earlyExit * (p.age - 28) * clamp((80 - o) / 10, 0, 1.5);
    if (p.age >= 30 && o < 64) h += 0.18;
    const sm = Math.exp(-T.trStay * st * (o >= 80 ? 0.4 : 1));   // some walk away early, some hang on as role players into their late 30s; stars' choices vary less
    h *= o >= 84 && p.age < 35 ? 0.15 * Math.min(1, sm) : sm;   // ...but a star still producing rarely walks away before 35 (no real gen did: Bird 35, Barkley 36)
    if (o >= 84 && p.age >= 33) h *= T.starRetire;   // superstars in their mid-30s leave on their own terms: the real gens' careers end at 35-40, not in the 40s
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

  // ------------------------------------------------------------ draft combine
  // Every prospect is measured (barefoot height, weight, wingspan, standing reach) and can be put through the athletic tests (standing and max vertical, lane agility,
  // 3/4-court sprint, shuttle, bench press). Numbers come from the real combine tables (NBA.COMBINE, src/combine.js, scripts/real-combine.py): each test is the prospect's
  // athleticism rating on the real test's scale for his position, with the real structure (the tests share one athleticism factor: loadings .70 vertical, .69 sprint, .44
  // agility; heavier and taller prospects test slower) and noise. Scouts read the combine: its result moves a prospect's draft stock (the bonus below), it never changes his
  // ratings. Real draft position vs combine, within a position (1,534 prospects): per +1 sd, log(pick) -0.15 height, -0.08 wingspan, -0.06 weight, and -0.15 for the average
  // of the vertical / sprint / agility z-scores (~10 stock points per unit of log(pick) in this sim); size already shapes ratings here, so the size terms are 60% of the real ones.
  const ATH_POS = { PG: [54.9, 13.0], SG: [56.5, 13.4], SF: [61.8, 12.0], PF: [62.6, 11.7], C: [57.7, 11.6] };   // prospects' athleticism rating by position: mean, sd
  const CB_K = { ath: 1.5, hgt: 0.9, len: 0.5, wgt: 0.35, skip: -0.8 };   // stock points per +1 sd (athletic composite, height, wingspan beyond height, weight for his height); skipping the tests
  const CB_SD = 1.3;   // sd of the combine bonus across a class (measured), so mock-draft ranges carry the same spread
  const mulberry = (seed) => { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const hashOf = (v) => { const t = String(v); let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return h | 0; };
  const phi = (z) => 0.5 * (1 + Math.tanh(0.7978845608 * (z + 0.044715 * z * z * z)));
  function combineFor(p, o) {
    o = o || {}; const C = NBA.COMBINE; if (!C || p.ht == null) return null;
    const rnd = mulberry(hashOf(p.id + '|' + p.name + '|' + (o.year || 0) + '|' + (p.cseed || 0)) ^ 0x2c1b3c6d), gauss = () => { let u = 0, v = 0; while (u === 0) u = rnd(); v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };   // its own random stream: the league's never moves
    const T0 = C.tab[p.pos] || C.tab.SF, ap = ATH_POS[p.pos] || [58.5, 12.7], sz = NBA.sizeZ(p), ws0 = p.ws != null ? p.ws : p.ht + (D.SIZE[p.pos] || D.SIZE.SF).arm;
    const q4 = (x) => Math.round(x * 4) / 4;
    const hb = q4(p.ht - 0.87 + 0.2 * gauss()), wt = Math.round(p.wt + (T0.wgt.m - (D.SIZE[p.pos] || D.SIZE.SF).wt) + 3 * gauss()), ws = q4(ws0 + 0.2 * gauss());
    const reach = Math.round((C.reach.a + C.reach.h * hb + C.reach.w * ws + C.reach.sd * gauss()) * 2) / 2;
    const athz = clamp((p.attrs.ath - ap[0]) / ap[1], -3, 3), zt = (k, load, extra) => 0.85 * load * athz + C.eff[k].hgt * sz.h + C.eff[k].wgt * sz.w + Math.sqrt(Math.max(0.05, 1 - load * load)) * gauss() + (extra || 0);
    const zV = zt('vert', C.load.vert), zSp = zt('sprint', C.load.sprint), zL = zt('lane', C.load.lane), zSh = zt('shuttle', C.load.shuttle), zB = 0.45 * sz.w + 0.25 * athz + 0.85 * gauss();
    const tests = { stv: T0.stv.m + T0.stv.sd * (0.93 * zV + 0.37 * gauss()), mxv: T0.mxv.m + T0.mxv.sd * zV, lane: T0.lane.m - T0.lane.sd * zL, sprint: T0.sprint.m - T0.sprint.sd * zSp, shuttle: T0.shuttle.m - T0.shuttle.sd * zSh, bench: Math.max(0, Math.round(T0.bench.m + T0.bench.sd * zB)) };
    const r1 = (x, d) => Math.round(x * d) / d; tests.stv = r1(tests.stv, 2); tests.mxv = r1(tests.mxv, 2); tests.lane = r1(tests.lane, 100); tests.sprint = r1(tests.sprint, 100); tests.shuttle = r1(tests.shuttle, 100);
    const cz = (zV + zSp + zL) / 3, z = { vert: zV, sprint: zSp, lane: zL, shuttle: zSh, bench: zB };
    const pct = (v, t) => Math.round(100 * phi((v - t.m) / t.sd)), pc = { hgt: pct(hb, T0.hgt), wgt: pct(wt, T0.wgt), ws: pct(ws, T0.ws), reach: pct(reach, T0.reach), vert: Math.round(100 * phi(zV)), sprint: Math.round(100 * phi(zSp)), lane: Math.round(100 * phi(zL)), shuttle: Math.round(100 * phi(zSh)), bench: Math.round(100 * phi(zB)) };
    const parts = { ath: o.test ? CB_K.ath * cz : CB_K.skip, hgt: CB_K.hgt * sz.h, len: CB_K.len * sz.l, wgt: CB_K.wgt * sz.w };
    return { year: o.year || 0, hb, wt, ws, reach, tested: !!o.test, tests: o.test ? tests : null, z: o.test ? z : null, pct: pc, cz: o.test ? cz : null, parts, bonus: parts.ath + parts.hgt + parts.len + parts.wgt };
  }
  // the real prospect whose measurements are closest (same position or one next to it): height, weight, wingspan and, when both were tested, jump and speed
  function combineComp(p, cb) {
    const C = NBA.COMBINE; if (!C || !cb) return null; const order = ['PG', 'SG', 'SF', 'PF', 'C'], pi = order.indexOf(p.pos), T0 = C.tab[p.pos] || C.tab.SF;
    let best = null, bd = Infinity;
    C.comps.forEach((c) => { const ci = order.indexOf(c[1]); if (Math.abs(ci - pi) > 1) return;
      let d = ((c[2] - cb.hb) / 1.2) ** 2 + ((c[3] - cb.wt) / 12) ** 2 + ((c[4] - cb.ws) / 1.5) ** 2 + 2 * (ci - pi) ** 2;
      if (cb.tests && c[5] != null && c[6] != null) d += ((c[5] - cb.tests.mxv) / 3.2) ** 2 + ((c[6] - cb.tests.sprint) / 0.11) ** 2;
      if (d < bd) { bd = d; best = c; } });
    return best ? { name: best[0], pos: best[1], hgt: best[2], wgt: best[3], ws: best[4], year: best[8] } : null;
  }
  const INTL = ['Spain', 'France', 'Australia', 'Serbia', 'Germany', 'Lithuania', 'Canada', 'Turkey', 'Greece', 'Brazil', 'Nigeria', 'Slovenia', 'Italy', 'Croatia', 'Japan', 'G League Ignite', 'NBL Next Stars', 'Overtime Elite'];
  function schoolFor(p, q, intl) {   // cosmetic: where he played (big programs for the best recruits), on its own stream
    const r = mulberry(hashOf(p.id + '|from') ^ 0x51ed27), list = D.COLLEGES;
    if (intl) return INTL[Math.floor(r() * INTL.length)];
    const pr = clamp(Math.round(5 - 3.4 * q + 0.9 * (r() + r() + r() - 1.5) * 2), 1, 5), pool = list.filter((c) => c.prestige === pr);
    return (pool.length ? pool : list)[Math.floor(r() * (pool.length || list.length))].name;
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
    // scouts only see the true ceiling in proportion to how visible the prospect is (recruit tier); an under-scouted talent is judged on what they look like now
    const vis = p.vis == null ? 1 : p.vis, o = ovr(p) - 7 * (1 - vis), seen = vis * p.ceiling + (1 - vis) * 76;
    const est = seen + randn() * (9 + 10 * (1 - vis)) + (rand() < 0.12 ? randn() * 16 : 0);
    return 0.5 * o + 0.5 * est - 1.4 * (p.age - 19) + (bonus || 0) + (p.cmb ? p.cmb.bonus : 0) + randn() * 5;
  }
  function projectStock(p) { // deterministic version for mock draft
    return 0.5 * ovr(p) + 0.5 * p.ceiling - 1.4 * (p.age - 19);
  }
  // Age at draft by recruit tier (real 2009-24 college prospects, data/real-draft-prospects.csv): share of class, then % Fr/So/Jr/Sr
  const RECRUIT_TIERS = [[0.052, [90, 9, 1, 0]], [0.055, [54, 25, 12, 8]], [0.126, [36, 28, 18, 19]], [0.155, [15, 21, 26, 38]], [0.159, [5, 17, 20, 58]], [0.296, [2, 13, 21, 63]], [0.158, [5, 6, 14, 75]]];
  // years in college a recruit of this star rating chooses, sampled from the real 2009-24 draft-age shares above
  function recruitYears(stars) {
    const t = stars >= 5 ? [72, 17, 6.5, 4] : RECRUIT_TIERS[{ 4: 2, 3: 3, 2: 4, 1: 5 }[stars] || 5][1];
    let u = rand() * (t[0] + t[1] + t[2] + t[3]);
    for (let i = 0; i < 4; i++) { u -= t[i]; if (u <= 0) return i + 1; }
    return 4;
  }
  function draftClass(L, n) {
    const out = [];
    const nInt = Math.round(n * 0.26), nCol = n - nInt; // internationals / pro-pathway prospects skew young and are not in the college table
    const ceils = []; for (let i = 0; i < nCol; i++) ceils.push(rollCeiling(0, null));
    ceils.sort((a, b) => b - a);
    ceils.forEach((c, i) => {
      const q = (i + 0.5) / nCol; let acc = 0, tier = RECRUIT_TIERS[RECRUIT_TIERS.length - 1];
      for (const t of RECRUIT_TIERS) { acc += t[0]; if (q <= acc / 1.0) { tier = t; break; } }
      const yr = +weighted({ 0: tier[1][0], 1: tier[1][1], 2: tier[1][2], 3: tier[1][3] });
      const p = makeProspect(L, 19 + yr, c); p.cmb = combineFor(p, { test: true, year: L.year }); p.from = schoolFor(p, q, false); p.stock = stockOf(p); out.push(p);
    });
    for (let i = 0; i < nInt; i++) {
      const p = makeProspect(L, +weighted({ 19: 45, 20: 30, 21: 18, 22: 7 })); p.cmb = combineFor(p, { test: true, year: L.year }); p.from = schoolFor(p, 0.5, true); p.stock = stockOf(p); out.push(p);
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
  // ------------------------------------------------------------ team needs, draft-night trades and the draft itself
  // A team's need at a position: its rotation (the top 8) counted by position, 0 when it has two or more there, up to 1 when it has none.
  function teamNeeds(L, t) {
    const cnt = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 }; rosterOf(L, t).slice(0, 8).forEach((q) => { cnt[q.pos] = (cnt[q.pos] || 0) + 1; });
    const out = {}; Object.keys(cnt).forEach((k) => { out[k] = clamp((2 - cnt[k]) / 2, 0, 1); }); return out;
  }
  const NEED_WORDS = { PG: 'a point guard', SG: 'a shooting guard', SF: 'a wing', PF: 'a forward', C: 'a big man' };
  function needText(L, t) { const n = teamNeeds(L, t), k = Object.keys(n).sort((a, b) => n[b] - n[a])[0]; return n[k] >= 0.5 ? 'Needs ' + NEED_WORDS[k] : 'Deep roster, best player available'; }
  // Picks change hands on draft night: 3 to 6 deals, each a team moving up from a later slot to an earlier one (sending the later pick plus a sweetener), announced just before the earlier pick.
  function planTrades(L, orderIds, seed) {
    const rnd = mulberry(hashOf('trades|' + seed)), order = orderIds.slice(), events = [], used = new Set(), n = 3 + Math.floor(rnd() * 4);
    for (let k = 0; k < n * 6 && events.length < n; k++) {
      const sb = 1 + Math.floor(rnd() * 34), gap = 2 + Math.floor(rnd() * 14), sa = sb + gap;
      if (sa > 55 || used.has(sb) || used.has(sa) || order[sb - 1] === order[sa - 1]) continue;
      used.add(sb); used.add(sa);
      const A = L.teams[order[sa - 1]], B = L.teams[order[sb - 1]];   // A moves up from sa to sb
      order[sb - 1] = A.id; order[sa - 1] = B.id;
      const sweet = sb <= 14 && gap >= 8 ? 'a 2028 first-round pick' : rnd() < 0.5 ? 'a 2029 second-round pick' : rnd() < 0.5 ? 'cash considerations' : 'a 2028 second-round pick';
      events.push({ slot: sb, other: sa, upId: A.id, downId: B.id, text: A.nick + ' trade up to #' + sb + ', sending #' + sa + ' and ' + sweet + ' to ' + B.nick });
    }
    events.sort((a, b) => a.slot - b.slot);
    return { order, events };
  }
  // user draft. o.cls / o.order (team ids) / o.stock: the class, the draft order and the player's stock settled when he declared (so the mock drafts he saw describe this very draft).
  // o.bias: how much each team (by id) liked him after the workouts, in stock points. The draft is run pick by pick: each team takes the best of the T.draftWindow highest-rated players still
  // there by stock plus its own taste (need at the position, a little noise; for the player, his workouts), so a team that loves you can take you ahead of where the board says,
  // and a team that does not can pass. Picks are traded on the night, and he may be traded right after he is picked.
  function userDraft(L, user, bonus, o) {
    o = o || {};
    const baseIds = o.order ? o.order.slice() : lotteryOrder(L).map((t) => t.id);
    const cls = o.cls || draftClass(L, 72);
    user.stock = o.stock != null ? o.stock : stockOf(user, bonus);
    const seed = L.year + '|' + user.name + '|' + (o.seed || 0), tp = planTrades(L, baseIds, seed), order = tp.order.map((id) => L.teams[id]);
    const needs = {}, need = (t) => needs[t.id] || (needs[t.id] = teamNeeds(L, t)), gz = (p, t) => { const r = mulberry(hashOf(p.id + '|' + p.name + '|' + t.id + '|want')); let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
    const avail = cls.concat([user]).sort((a, b) => b.stock - a.stock), picks = [];
    for (let k = 0; k < 60 && avail.length; k++) {
      const t = order[k]; let best = null, bs = -Infinity;
      avail.slice(0, T.draftWindow).forEach((p, i) => { const taste = p === user ? T.workoutK * ((o.bias && o.bias[t.id]) || 0) + 0.9 * need(t)[p.pos] : 0.9 * need(t)[p.pos] + 0.7 * gz(p, t), sc = p.stock + taste - 0.001 * i; if (sc > bs) { bs = sc; best = p; } });
      avail.splice(avail.indexOf(best), 1); picks.push(best);
    }
    const all = picks.concat(avail), uslot = picks.indexOf(user) + 1;
    // traded right after he is picked: more likely when a team that loved him in workouts does not hold his pick
    let userTrade = null;
    if (uslot) {
      const owner = order[uslot - 1], rnd = mulberry(hashOf('usertrade|' + seed)), bias = o.bias || {}, fans = Object.keys(bias).filter((id) => +id !== owner.id && bias[id] >= 2.4).length;
      if (rnd() < clamp(T.userTradeP + 0.05 * fans, 0, 0.4)) {
        const cands = L.teams.filter((t) => t.id !== owner.id), w = cands.map((t) => 1 + 2.5 * Math.max(0, bias[t.id] || 0) + 1.2 * need(t)[user.pos]), tot = sum(w);
        let u = rnd() * tot, dest = cands[cands.length - 1]; for (let q = 0; q < cands.length; q++) { u -= w[q]; if (u <= 0) { dest = cands[q]; break; } }
        const later = order.findIndex((t, q) => q + 1 > uslot && t.id === dest.id) + 1;   // a pick the destination holds later in this draft, which comes back to the drafting team
        const future = uslot <= 20 ? 'a 2029 first-round pick' : 'a 2029 second-round pick';
        if (later > 0) order[later - 1] = owner;
        userTrade = { fromId: owner.id, toId: dest.id, from: owner.name, to: dest.name, fromNick: owner.nick, toNick: dest.nick, slotBack: later || null, text: owner.nick + ' trade your draft rights to ' + dest.nick + ' for ' + (later ? '#' + later + ' and ' + future : future) };
      }
    }
    const rookies = []; all.forEach((p, i) => { if (p !== user && i < 60) rookies.push({ p, slot: i + 1 }); });
    addRookies(L, rookies, order);
    // the board: all 60 picks with who, where from, how big, how he tested, and where the pre-draft ranking (by talent and age alone, before the scouts' noise and the combine) had him
    const proj = all.slice().sort((x, y) => (projectStock(y) + (y === user ? bonus || 0 : 0)) - (projectStock(x) + (x === user ? bonus || 0 : 0))), mockRank = new Map(proj.map((q, i) => [q, i + 1]));
    const evAt = {}; tp.events.forEach((e) => { evAt[e.slot] = e; evAt[e.other] = e; });
    const board = all.slice(0, 60).map((p, i) => { const t = order[i], o0 = L.teams[baseIds[i]], via = t.id !== o0.id ? o0 : null; return { slot: i + 1, name: p.name, pos: p.pos, age: p.age, team: t.name, nick: t.nick, teamRec: t.wins + '-' + t.losses, via: via ? via.nick : null, viaName: via ? via.name : null, viaRec: via ? via.wins + '-' + via.losses : null, trade: evAt[i + 1] ? evAt[i + 1].text : (userTrade && userTrade.slotBack === i + 1 ? userTrade.text : null), isUser: p === user, ovr: Math.round(ovr(p)), from: p.from || '', ht: p.ht, wt: p.wt, ws: p.ws, mockRank: mockRank.get(p), cz: p.cmb && p.cmb.cz != null ? Math.round(100 * p.cmb.cz) / 100 : null, bonus: p.cmb ? Math.round(10 * p.cmb.bonus) / 10 : 0 }; });
    const drafted = uslot ? order[uslot - 1] : null, landing = userTrade ? L.teams[userTrade.toId] : drafted;
    return { slot: uslot || null, team: landing, draftedBy: drafted, userTrade, trades: tp.events.map((e) => ({ slot: e.slot, other: e.other, text: e.text, upNick: L.teams[e.upId].nick, downNick: L.teams[e.downId].nick })), board, order, classSize: all.length, mockRank: mockRank.get(user) };
  }
  function mockRange(L, user, bonus, n) {
    // rough projection: run a few class simulations
    // cheap approximation of the class (no full player objects) so this stays fast
    const rem = { 19: 0.7, 20: 0.49, 21: 0.35, 22: 0.26 };
    const ranks = [];
    const K = n || 16;
    for (let k = 0; k < K; k++) {
      const s = stockOf(user, bonus);
      let better = 0;
      for (let i = 0; i < 72; i++) {
        const age = +weighted({ 19: 46, 20: 26, 21: 16, 22: 12 });
        const c = rollCeiling(0, null);
        const o = c - (10 + 12 * rand()) * rem[age];
        const st = 0.5 * o + 0.5 * (c + randn() * 9) - 1.4 * (age - 19) + randn() * 5 + randn() * CB_SD;
        if (st > s) better++;
      }
      ranks.push(1 + better);
    }
    ranks.sort((a, b) => a - b);
    return { lo: ranks[Math.round(0.14 * (K - 1))], mid: ranks[Math.round(0.5 * (K - 1))], hi: ranks[Math.round(0.86 * (K - 1))] };
  }
  // ------------------------------------------------------------ mock drafts
  // Three outlets mock the class that will actually be drafted. A mock is a noisy preview: each blends the prospect's real draft stock (0.5) with what scouts can see of
  // him (0.5: current rating, the part of his ceiling that is visible, age, college prestige) and adds its own opinion (sd 3.5 stock points), so mocks agree on the top
  // few picks, disagree further down, and the real night still holds surprises (the real order carries the rest of the scouting noise).
  const OUTLETS = ['Hoops Insider', 'Draft Central', 'Courtside Report'];
  function scoutMean(p, bonus) { const vis = p.vis == null ? 1 : p.vis, o = ovr(p) - 7 * (1 - vis), seen = vis * p.ceiling + (1 - vis) * 76; return 0.5 * o + 0.5 * seen - 1.4 * (p.age - 19) + (bonus || 0); }
  // the player's stock without the combine and with a fixed seed for the scouting noise: stock after the combine = this + the combine's bonus
  function stockBase(L, user, bonus, seed) { const sv = NBA.rngGet(), keep = user.cmb; user.cmb = null; NBA.setSeed(seed); const r = stockOf(user, bonus); NBA.rngSet(sv); user.cmb = keep; return r; }
  function mockBoards(L, cls, user, bonus, orderIds, stocks) {   // stocks: the player's stock in the three states: { before, after, alt }
    const order = orderIds.map((id) => L.teams[id]), gauss = (r) => { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
    const noise = cls.concat([user]).reduce((m, p) => { m.set(p, OUTLETS.map((n, oi) => 3.5 * gauss(mulberry(hashOf(oi + '|' + p.id + '|' + p.name + '|mock'))))); return m; }, new Map());
    const run = (us) => {
      const sc = (p, oi) => { const st = p === user ? us : p.stock; return 0.5 * st + 0.5 * scoutMean(p, p === user ? bonus : 0) + noise.get(p)[oi]; };
      const boards = OUTLETS.map((name, oi) => cls.concat([user]).map((p) => ({ p, s: sc(p, oi) })).sort((a, b) => b.s - a.s));
      const cons = cls.concat([user]).map((p) => ({ p, s: OUTLETS.reduce((t, n, oi) => t + sc(p, oi), 0) / OUTLETS.length })).sort((a, b) => b.s - a.s);
      return { boards, cons };
    };
    const rows = (items) => items.slice(0, 30).map((x, i) => ({ slot: i + 1, name: x.p.name, pos: x.p.pos, age: x.p.age, from: x.p.from || '', nick: order[i] ? order[i].nick : '', isUser: x.p === user, ht: x.p.ht, ws: x.p.ws }));
    const ranks = (r) => r.boards.map((b) => 1 + b.findIndex((x) => x.p === user)).concat([1 + r.cons.findIndex((x) => x.p === user)]);
    const after = run(stocks.after), before = run(stocks.before), alt = run(stocks.alt);
    return { outlets: after.boards.map((b, oi) => ({ name: OUTLETS[oi], rows: rows(b), rank: 1 + b.findIndex((x) => x.p === user) })).concat([{ name: 'Consensus', rows: rows(after.cons), rank: 1 + after.cons.findIndex((x) => x.p === user) }]), ranks: { before: ranks(before), after: ranks(after), alt: ranks(alt) } };
  }
  // the same projection drawn from a fixed seed, so two projections of one player (with and without the combine, tested or skipped) face the same classes and the same scouting noise:
  // the difference is the combine's alone. The league's own random stream is put back afterwards.
  function mockSeeded(L, user, bonus, seed, cmb) {
    const sv = NBA.rngGet(), keep = user.cmb; user.cmb = cmb || null; NBA.setSeed(seed);
    const r = mockRange(L, user, bonus, 40); NBA.rngSet(sv); user.cmb = keep; return r;
  }

  function settleRookies(L) {
    Object.values(L.players).filter((p) => p.rookie).forEach((p) => {
      p.rookie = false;
      const t = L.teams[p.teamId];
      t.bench = t.bench || [];
      if (!t.core.includes(p.id) && !t.bench.includes(p.id)) t.bench.push(p.id);
    });
  }

  // teams shop their lesser players for similar value; a franchise player only moves when a bad team sells him to a contender
  const rosterOf = (L, t) => t.core.concat(t.bench || []).map((id) => L.players[id]).filter((q) => q && !q.rookie).sort((x, y) => ovr(y) - ovr(x));
  // ------------------------------------------------------------ contracts, tenure and the trade market
  // Every player has a tenure (when he joined his club) and a contract end, handed out from his id so nothing here touches the random stream until a deal is made.
  // A player who has just arrived is almost never moved again (real: ~85% of players on a roster have been there 2+ seasons at the deadline); sellers trade veterans, buyers pay younger depth.
  const hOf = (p) => Math.abs(hashOf('d|' + p.id + '|' + p.name));
  function deal(L, p) {
    if (p.since == null) p.since = L.year - (p.rookie ? 0 : hOf(p) % 5);
    if (p.cEnd == null) p.cEnd = L.year + (hOf(p) >> 3) % (p.age >= 33 ? 2 : 4);
    return p;
  }
  const tenureAt = (L, p, phase) => (phase === 'deadline' ? L.year + 0.5 : L.year + 1) - deal(L, p).since;   // offseason runs at the end of season L.year: the season just played counts
  const moveWeight = (L, p, phase) => { const t = tenureAt(L, p, phase), young = (p.yearsPro || 0) <= 3 ? 0.35 : 1; return young * (t >= 2.5 ? 1 : t >= 2 ? 0.8 : t >= 1 ? 0.12 : 0.02); };
  const tag = (q) => q.pos + ', ' + q.age + ', ' + Math.round(ovr(q));
  function logMove(L, phase, text, a, b) { (L.moves = L.moves || []).push({ year: L.year, phase, text, a: a.nick, b: b.nick }); if (L.moves.length > 160) L.moves.shift(); }
  function swapPlayers(L, a, pa, b, pb) {
    [a, b].forEach((t) => { t.core = t.core.filter((id) => id !== pa.id && id !== pb.id); t.bench = (t.bench || []).filter((id) => id !== pa.id && id !== pb.id); });
    a.bench.push(pb.id); b.bench.push(pa.id); pa.teamId = b.id; pb.teamId = a.id;
  }
  const cashOut = (L, pa, phase) => { deal(L, pa); };
  // phase 'offseason': mostly like-for-like swaps (talent just changes address) plus the odd star request; 'deadline': sellers move veterans to contenders for lesser, younger players
  function marketTrades(L, n, phase) {
    const dl = phase === 'deadline', yr = dl ? L.year + 0.5 : L.year + 1;
    let done = 0;
    for (let k = 0; k < 80 && done < n; k++) {
      const sellers = L.teams.filter((t) => t.wins <= 37), buyers = L.teams.filter((t) => t.wins >= 43);
      const a = dl || rand() < 0.6 ? pick(sellers.length ? sellers : L.teams) : pick(L.teams), b = dl || rand() < 0.6 ? pick(buyers.length ? buyers : L.teams) : pick(L.teams);
      if (a === b) continue;
      const ra = rosterOf(L, a), rb = rosterOf(L, b); if (ra.length < 6 || rb.length < 6) continue;
      const star = !dl && done === 0 && rand() < 0.3 && a.wins < 33 && b.wins >= 44 && ovr(ra[0]) >= 80 && ra[0].age >= 26 && tenureAt(L, ra[0], phase) >= 3;
      const pool = star ? [ra[0]] : ra.filter((q, i) => i >= 2 && (dl ? q.age >= 27 && ovr(q) >= 64 : true));
      if (!pool.length) continue;
      const pa = pool[rint(0, pool.length - 1)];
      if (rand() > moveWeight(L, pa, phase)) continue;
      const tg = ovr(pa);
      const cand = rb.filter((q, i) => (star ? i <= 2 && ovr(q) >= tg - 7 && ovr(q) <= tg + 1 : dl ? i >= 2 && ovr(q) <= tg - 1.5 && ovr(q) >= tg - 8 && q.age <= pa.age - 2 : i >= 3 && Math.abs(ovr(q) - tg) <= 4) && rand() <= moveWeight(L, q, phase));
      if (!cand.length) continue;
      const pb = pick(cand);
      swapPlayers(L, a, pa, b, pb); done++;
      pa.since = yr; pb.since = yr; pa.moved = pb.moved = L.year;
      const sweet = ovr(pa) - ovr(pb) >= 3 ? ' and a ' + (L.year + 1 + rint(0, 3)) + ' ' + (rand() < 0.6 ? 'first' : 'second') + '-round pick' : '';
      logMove(L, phase, star ? a.nick + ' trade franchise player ' + pa.name + ' (' + tag(pa) + ') to the ' + b.nick + ' after a trade request, for ' + pb.name + ' (' + tag(pb) + ')' + sweet
        : b.nick + ' acquire ' + pa.name + ' (' + tag(pa) + ') from the ' + a.nick + ' for ' + pb.name + ' (' + tag(pb) + ')' + sweet, a, b);
      if (dl) { b.dlBoost = (b.dlBoost || 0) + clamp((ovr(pa) - ovr(pb)) * 0.12, 0.05, 0.7); }
    }
    return done;
  }
  // free agency: some contracts end each summer; most stars and starters re-sign, the rest test the market and fill roster spots at other clubs (the unlucky ones fall out of the league)
  function freeAgency(L) {
    const fa = [], yr = L.year + 1;
    L.teams.forEach((t) => rosterOf(L, t).forEach((p) => {
      deal(L, p);
      if (p.cEnd > L.year) return;
      const o = ovr(p), tn = tenureAt(L, p, 'offseason');
      const keep = clamp(0.58 + 0.014 * (o - 66) + (tn >= 3 ? 0.1 : 0) - (p.age >= 33 ? 0.2 : 0) + (o >= 82 ? 0.15 : 0), 0.25, 0.97);
      if (rand() < keep) { p.cEnd = L.year + 1 + (p.age >= 33 ? rint(0, 1) : p.age >= 30 ? rint(0, 2) : rint(1, 4)); return; }
      t.core = t.core.filter((id) => id !== p.id); t.bench = (t.bench || []).filter((id) => id !== p.id);
      fa.push({ p, from: t });
    }));
    fa.sort((x, y) => ovr(y.p) - ovr(x.p));
    fa.forEach((f) => {
      const open = L.teams.filter((t) => rosterOf(L, t).length < 10 && t.id !== f.from.id);
      if (!open.length) return;
      // stars and good players pick winners, role players take whatever fits
      const w = open.map((t) => Math.exp(clamp((ovr(f.p) - 68) / 12, -1, 2) * (t.wins - 41) / 14));
      let r = rand() * sum(w), t = open[open.length - 1];
      for (let i = 0; i < open.length; i++) { r -= w[i]; if (r <= 0) { t = open[i]; break; } }
      f.p.teamId = t.id; t.bench = (t.bench || []).concat([f.p.id]); f.p.since = yr; f.p.moved = L.year; f.p.cEnd = L.year + 1 + (f.p.age >= 33 ? rint(0, 1) : rint(1, 3)); f.signed = t;
      if (ovr(f.p) >= 70) logMove(L, 'freeagency', f.p.name + ' (' + tag(f.p) + ') leaves the ' + f.from.nick + ' in free agency and signs with the ' + t.nick, f.from, t);
    });
    fa.filter((f) => !f.signed).forEach((f) => { delete L.players[f.p.id]; if (ovr(f.p) >= 66) logMove(L, 'freeagency', f.p.name + ' (' + tag(f.p) + ') went unsigned and is out of the league', f.from, f.from); });
  }
  // the deadline: real contenders add veterans for the run, bad teams sell (this season's playoff strength moves a little with it)
  function deadlineTrades(L) {
    const n = marketTrades(L, 3 + (rand() < 0.5 ? 1 : 0), 'deadline');
    L.teams.forEach((t) => { if (t.dlBoost) { t.power += t.dlBoost; t.dlBoost = 0; } });
    return n;
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
    freeAgency(L);
    marketTrades(L, 5, 'offseason');
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

  Object.assign(NBA, { injuryDamage, applyInjuryDamage, recruitYears, rosterOf, swapPlayers, seasonLabel, rollAvail, applyMajorInjury, newLeague, simSeason, finalsMVP, offseason, runYear, makeReal, userDraft, teamNeeds, needText, npcDraft, draftClass, mockSeeded, stockBase, mockBoards, ATH_POS, combineFor, combineComp, CB_K, makeProspect, retireP, mockRange, projectStock, lotteryOrder, poolStats, perfOf, defScore, coTaxFor, teamRoster, makeNPC, poisson });
  if (typeof module !== 'undefined') module.exports = NBA;
})(typeof window !== 'undefined' ? window : globalThis);
