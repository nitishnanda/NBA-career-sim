(function (g) {
  'use strict';
  const NBA = g.NBA;
  if (typeof require !== 'undefined') { try { require('./real.js'); } catch (e) { /* browser build loads real.js separately */ } }
  const D = NBA.data;
  const { rand, randn, clamp, rint, pick, weighted, sum, ovr, expLine, genGame, summarize, shootingLine, progress, applyTraining, trainPoints, rollAvail, applyMajorInjury, perfOf } = NBA;
  const ATTRS = D.ATTRS;
  const r1 = (x) => Math.round(x * 10) / 10;

  const STAR_ODDS = { 1: 38, 2: 28, 3: 20, 4: 10, 5: 4 };
  const STAR_NAMES = { 1: 'Zero-hype prospect', 2: 'Under-the-radar', 3: 'Solid recruit', 4: 'Blue-chip', 5: 'Five-star phenom' };
  const TD_CAP = 5;
  const CAPG = 1.015; // salary cap growth per year

  // ---------------------------------------------------------------- creation
  function newCareer(o) {
    if (o.seed != null) NBA.setSeed(o.seed);
    // Generational talents are almost always blue-chip, top-3 picks who dominate college.
    // A rare "Jokic path" (~8%) keeps them under-scouted with a slow start but the same hidden ceiling.
    const genLevel = o.arch === 'generational' ? 2 : o.sec === 'generational' ? 1 : 0;
    const lateBloomer = genLevel > 0 && rand() < 0.08;
    let stars = o.stars, ceiling = o.ceiling, gap = 10 + rand() * 12;
    if (genLevel && !lateBloomer) {
      if (!stars) stars = +weighted(genLevel === 2 ? { 5: 70, 4: 25, 3: 5 } : { 5: 40, 4: 35, 3: 25 });
      if (ceiling == null) ceiling = (genLevel === 2 ? 86 : 82) + (genLevel === 2 ? 12 : 12) * Math.pow(rand(), 1.9);
      gap = 6 + rand() * 7;
    } else if (lateBloomer) {
      if (!stars) stars = +weighted({ 1: 50, 2: 50 });
      if (ceiling == null) ceiling = 88 + 8 * rand();
      gap = 20 + rand() * 6;
    }
    if (!stars) stars = +weighted(STAR_ODDS);
    if (ceiling == null) ceiling = NBA.rollCeiling(stars, o.arch);
    const genBonus = genLevel && !lateBloomer ? (genLevel === 2 ? 8 : 4) : 0; // true generational talents are seen as such by scouts
    const p = NBA.makePlayer({ id: 'user', name: o.name || 'Rookie', pos: o.pos, arch: o.arch, sec: o.sec && o.sec !== o.arch ? o.sec : null, home: o.home, ceiling, age: 18, stars, gap });
    const L = NBA.newLeague(2026, { real: true }); // the real league as of 20 Oct 2026
    const st = {
      v: 1, stage: 'scouting', player: p, league: L, stars,
      genBonus, college: null, collegeYears: [], proSeasons: [], playoffLines: [],
      contract: null, teamId: -1, earnings: 0, draft: null,
      career: { awards: {}, td: 0, td30Seasons: 0, tdSeasons: 0, titles: 0 },
      log: [], retired: false, hof: null, pendingEvents: [],
    };
    return st;
  }

  function scoutReport(st) {
    const p = st.player;
    const pot = p.ceiling + randn() * 3;
    const grade = pot >= 92 ? 'A+' : pot >= 88 ? 'A' : pot >= 84 ? 'A-' : pot >= 80 ? 'B+' : pot >= 76 ? 'B' : pot >= 72 ? 'B-' : pot >= 69 ? 'C+' : pot >= 66 ? 'C' : 'C-';
    return { stars: st.stars, label: STAR_NAMES[st.stars], ovr: Math.round(ovr(p)), potential: grade };
  }

  // ---------------------------------------------------------------- college
  function collegeOptions(st) {
    const s = st.stars, p = st.player;
    const maxP = s === 1 ? 2 : s === 2 ? 3 : s === 3 ? 4 : 5;
    const minP = s === 5 ? 4 : s === 4 ? 3 : 1;
    const homeAbbr = D.STATE_ABBR[p.home];
    let list = D.COLLEGES.filter((c) => c.prestige <= maxP && c.prestige >= minP);
    // a handful, always including a home-state school if one is eligible
    const home = list.filter((c) => c.state === homeAbbr);
    const rest = list.filter((c) => c.state !== homeAbbr).sort(() => rand() - 0.5);
    const picks = home.slice(0, 2).concat(rest).slice(0, s >= 4 ? 9 : 8);
    return picks.sort((a, b) => b.prestige - a.prestige).map((c) => Object.assign({ home: c.state === homeAbbr }, c));
  }
  function chooseCollege(st, id) {
    const c = D.COLLEGES[id];
    st.college = { id: c.id, name: c.name, state: c.state, prestige: c.prestige, home: c.state === D.STATE_ABBR[st.player.home] };
    st.stage = 'college_ready';
    return st.college;
  }

  function collegeSeason(st) {
    const p = st.player, c = st.college;
    const yr = st.collegeYears.length + 1;
    const o = ovr(p);
    const oEff = o + 5.5 + (5 - c.prestige) * 1.1;
    const minsFixed = clamp(Math.round(19 + 0.85 * (oEff - 64) + ({ 1: 0, 2: 1, 3: 2.5, 4: 4.5, 5: 6.5 }[st.stars] || 0)), 16, 35);
    const e = expLine(p, { pace: 81.6, minsFixed, usgMult: 1.03 + 0.02 * (5 - c.prestige) + (c.home ? 0.01 : 0), tsAdj: -0.012 + 0.003 * (oEff - 70) / 5, rebMult: 1.08, astMult: 1.05, coTax: 0 });
    const av = rollAvail(p, { noRest: true });
    const gp = clamp(34 - Math.round(av.miss * 0.35), 12, 36);
    const m = { pts: e.pts * (1 + 0.04 * randn()), reb: e.reb, ast: e.ast, stl: e.stl * 1.1, blk: e.blk * 1.1, tov: e.tov, mins: e.mins };
    const games = []; for (let i = 0; i < gp; i++) games.push(genGame(m));
    const s = summarize(games);
    const sl = shootingLine(p, s.pts, e.ts, e.usg);
    const line = { gp, mins: s.mins, pts: s.pts, reb: s.reb, ast: s.ast, stl: s.stl, blk: s.blk, tov: s.tov, fgp: sl.fgp, tpp: sl.tpp, ftp: sl.ftp, ts: sl.ts, td: s.td, high: s.high };
    const pf = perfOf({ pts: s.pts, reb: s.reb, ast: s.ast, stl: s.stl, blk: s.blk, tov: s.tov, ts: sl.ts });
    const games2 = 33;
    const wins = clamp(Math.round(22 + (c.prestige - 3) * 2.6 + (oEff - 70) * 0.22 + randn() * 3.4), 8, 37);
    const rounds = ['Lost in the First Round', 'Lost in the Round of 32', 'Lost in the Sweet 16', 'Lost in the Elite Eight', 'Lost in the Final Four', 'Lost in the National Championship', 'Won the National Championship'];
    let tourney = 'Missed the NCAA Tournament';
    if (wins >= 20) {
      const rw = clamp(Math.floor((wins - 21) / 3.2 + randn() * 1.15), 0, 6);
      tourney = rounds[rw]; if (rw === 6) st.career.collegeTitle = true;
    }
    const honors = [];
    if (pf >= 40) honors.push('National Player of the Year'); else if (pf >= 33) honors.push('Consensus All-American'); else if (pf >= 26) honors.push('All-Conference');
    if (yr === 1 && pf >= 29) honors.push('Freshman of the Year');
    const rec = { year: yr, label: ['Freshman', 'Sophomore', 'Junior', 'Senior'][yr - 1], age: p.age, school: c.name, record: wins + '-' + (games2 - wins), tourney, honors, line, ovr: Math.round(o), pf };
    st.collegeYears.push(rec);
    return rec;
  }

  function stockBonus(st) {
    const c = st.college, last = st.collegeYears[st.collegeYears.length - 1];
    let b = (c.prestige - 3) * 0.9 + (st.genBonus || 0);
    if (last.honors.includes('National Player of the Year')) b += 3;
    else if (last.honors.includes('Consensus All-American')) b += 1.5;
    if (st.collegeYears.some((y) => y.tourney.includes('Won the National'))) b += 0.8;
    return b;
  }

  // run the league for the season the player just spent in college; returns season result and a mock-draft range
  function playCollege(st) {
    const p = st.player;
    const rec = collegeSeason(st);
    NBA.runYear(st.league, { draft: false });
    const mock = NBA.mockRange(st.league, p, stockBonus(st));
    rec.mock = mock;
    rec.mustDeclare = rec.year >= 4;
    st.stage = 'college_decision';
    return rec;
  }
  function stayInCollege(st) {
    NBA.npcDraft(st.league);
    st.league.year; // year already advanced by the league sim
    st.stage = 'training'; st.afterTraining = 'college';
    return trainingInfo(st);
  }
  function declare(st) {
    const p = st.player;
    const res = NBA.userDraft(st.league, p, stockBonus(st));
    p.rookie = false; p.isPro = true;
    let slot = res.slot, team = res.team;
    if (!slot) {
      // undrafted: sign a two-way-turned-min deal
      slot = null;
      team = pick(st.league.teams);
    }
    st.draft = { slot, team: team.name, teamId: team.id, year: st.league.year, board: res.board, college: st.college.name };
    st.teamId = team.id; p.teamId = team.id;
    const cap = capNow(st.league);
    let sal, yrs;
    if (slot && slot <= 30) { sal = 13.8 * Math.pow(0.958, slot - 1) * Math.pow(CAPG, st.league.year - 2025); yrs = 4; }
    else if (slot) { sal = Math.max(1.5, 2.3 - (slot - 31) * 0.035) * Math.pow(CAPG, st.league.year - 2025); yrs = 3; }
    else { sal = 1.3 * Math.pow(CAPG, st.league.year - 2025); yrs = 2; }
    st.contract = { salary: r1(sal), years: yrs, left: yrs, type: 'rookie' };
    st.stage = 'draft_night';
    return st.draft;
  }
  function startPro(st) {
    st.stage = 'training'; st.afterTraining = 'pro_first';
    return trainingInfo(st);
  }

  // ---------------------------------------------------------------- training / progression
  function trainingInfo(st) {
    const p = st.player;
    return { points: trainPoints(p) + (st.bonusPoints || 0), attrs: ATTRS.map((a) => ({ key: a, label: D.ATTR_LABELS[a], v: Math.round(p.attrs[a]) })), ovr: Math.round(ovr(p)), age: p.age };
  }
  function autoAlloc(p, points) {
    const w = D.ARCHETYPES[p.arch].weights;
    const alloc = {};
    ATTRS.forEach((a) => (alloc[a] = 0));
    let left = points;
    const order = ATTRS.slice().sort((a, b) => w[b] * (100 - p.attrs[b]) - w[a] * (100 - p.attrs[a]));
    for (let i = 0; left > 0 && i < 40; i++) {
      const a = order[i % 5];
      if (alloc[a] < 4 && p.attrs[a] < 97) { alloc[a]++; left--; }
    }
    return alloc;
  }
  function train(st, alloc) {
    const p = st.player;
    const before = {}; ATTRS.forEach((a) => (before[a] = p.attrs[a]));
    const ovr0 = ovr(p);
    const cap = trainPoints(p) + (st.bonusPoints || 0);
    const total = sum(ATTRS.map((a) => alloc[a] || 0));
    if (total > cap) throw new Error('too many training points');
    applyTraining(p, alloc);
    const ovrAfterTrain = ovr(p);
    progress(p);
    st.bonusPoints = 0;
    const rep = { age: p.age, ovr0: Math.round(ovr0), ovr1: Math.round(ovr(p)), trainGain: r1(ovrAfterTrain - ovr0), changes: ATTRS.map((a) => ({ key: a, label: D.ATTR_LABELS[a], from: Math.round(before[a]), to: Math.round(p.attrs[a]) })) };
    const next = st.afterTraining;
    if (next === 'college') st.stage = 'college_ready';
    else if (next === 'pro_first') st.stage = 'pro_ready';
    else { NBA.offseason(st.league, { draft: true }); st.stage = 'pro_ready'; }
    return rep;
  }

  // ---------------------------------------------------------------- pro season
  const capNow = (L) => L.capBase * Math.pow(CAPG, L.year - 2025);

  function rollEvents(st, p) {
    const fx = { form: 0, extraMiss: 0, minsMult: 1, depth: 0, bonusPts: 0, notes: [] };
    const n = rand() < 0.4 ? 0 : rand() < 0.8 ? 1 : 2;
    const pool = [
      ['hot', 'Player of the Month — you went nuclear in January 🔥', () => (fx.form += 0.03)],
      ['slump', 'Brutal shooting slump in February. Twitter was not kind.', () => (fx.form -= 0.025)],
      ['scare', 'Ankle scare mid-season. Missed a few games but nothing serious.', () => (fx.extraMiss += rint(2, 7))],
      ['coach', 'Coach put the ball in your hands more after a team meeting.', () => (fx.minsMult *= 1.04)],
      ['drama', 'Locker room drama dragged the team down a bit.', () => (fx.depth -= 2.5)],
      ['chem', 'Team chemistry clicked after a players-only dinner.', () => (fx.depth += 2.5)],
      ['trainer', 'Worked with a skills trainer in-season. +1 upgrade point in the offseason.', () => (fx.bonusPts += 1)],
      ['viral', 'Viral dunk/clutch shot all over social media. Jersey sales up.', () => {}],
      ['rumor', 'Trade rumors swirled around you at the deadline. Nothing happened.', () => {}],
    ];
    const used = new Set();
    for (let i = 0; i < n; i++) {
      const e = pick(pool);
      if (used.has(e[0])) continue;
      used.add(e[0]); e[2](); fx.notes.push(e[1]);
    }
    return fx;
  }

  function userSeasonLine(st, ctx, avail, fx) {
    const p = st.player;
    const rookie = p.yearsPro === 0;
    const e0 = expLine(p, { coTax: ctx.coTax, pace: ctx.pace, rookie, minsMult: fx.minsMult, minsFloor: rookie ? NBA.rookieFloor(st.draft && st.draft.slot) : 0 });
    const sh = 1 + NBA.tuning.formSd * randn() + fx.form;
    const ind = () => 1 + 0.035 * randn();
    const m = { mins: e0.mins, pts: e0.pts * sh * ind(), reb: e0.reb * sh * ind(), ast: e0.ast * sh * ind(), stl: e0.stl * sh * ind(), blk: e0.blk * sh * ind(), tov: e0.tov };
    const age = p.age, gp = avail.gp;
    // everyday scoring is soft-capped; big years (32-33, rarely 34-36) come from the career plan
    const SOFT = 30.2;
    if (m.pts > SOFT) m.pts = SOFT + (m.pts - SOFT) * 0.25;
    let tierMode = null;
    const bigOK = e0.ovr >= 88 && age >= 24 && age <= 32 && gp >= 60;

    // triple-double window: no hints before it, one contiguous run of seasons starting in the late 20s
    // the window rolls forward (to 34) if injury or form wrecked it before the first triple-double year
    const inWin = p.tdPlan > 0 && age >= p.tdStart && age <= 34 && (age < p.tdStart + p.tdPlan || p.tdUsed === 0);
    const preWin = p.tdPlan > 0 && age < p.tdStart;
    let surge = null;
    if (inWin && p.tdUsed < p.tdPlan && e0.ovr >= 82 && m.pts >= 16 && rand() < 0.92) {
      surge = { big: p.td30Ages.includes(age) && p.td30Used < p.td30Plan && e0.ovr >= 86 && m.pts >= 24.5 };
    }
    if (surge && surge.big) m.pts = Math.max(m.pts, 30.3 + rand() * 1);
    if (!surge) {
      if (preWin && m.ast > 8.1) m.ast = 8.1 + (m.ast - 8.1) * 0.3;
      if (p.tdUsed >= TD_CAP) { m.ast = Math.min(m.ast, 9.4); m.reb = Math.min(m.reb, 9.4); }
      if (m.reb >= 8 && m.ast >= 7) {
        // keep natural triple-double rates in the real-world 17-27% band
        if (m.ast > 8.6) m.ast = 8.6 + (m.ast - 8.6) * 0.3;
        if (m.reb > 10.6) m.reb = 10.6 + (m.reb - 10.6) * 0.35;
      }
      const gpSoFar = sum(st.proSeasons.map((x) => x.gp));
      if (gpSoFar > 200 && st.career.td / gpSoFar > 0.255) { m.reb = Math.min(m.reb, 9.8); m.ast = Math.min(m.ast, 8.2); }
      if (bigOK && p.tier34 && !p.tier34Done && m.pts >= 28 && rand() < 0.3) tierMode = { lo: 34.0, hi: 36.6 };
      else if (bigOK && p.tier32 && !p.tier32Done && m.pts >= 27 && rand() < 0.3) tierMode = { lo: 32.0, hi: 33.9 };
      if (tierMode) m.pts = Math.max(m.pts, tierMode.lo + 0.3 + rand() * (tierMode.lo >= 34 ? 1.6 : 0.9));
    } else {
      m.reb = Math.max(m.reb, 10.25 + rand() * 0.9);
      m.ast = Math.max(m.ast, 10.25 + rand() * 0.9);
    }
    let games, s;
    for (let tries = 0; tries < 16; tries++) {
      games = []; for (let i = 0; i < gp; i++) games.push(genGame(m));
      s = summarize(games);
      if (gp < 50 || (!surge && !tierMode)) break;
      if (surge && s.pts >= (surge.big ? 30 : 10) && s.reb >= 10 && s.ast >= 10) break;
      if (tierMode && s.pts >= tierMode.lo && s.pts <= tierMode.hi) break;
    }
    if (s.pts >= 34) p.tier34Done = true;
    if (s.pts >= 32) p.tier32Done = true;
    const used = e0.usg * (s.pts / Math.max(1, e0.pts));
    const tsRaw = clamp(e0.ts * (0.5 + 0.5 * (s.pts / Math.max(1, m.pts))), 0.44, 0.72);
    const sl = shootingLine(p, s.pts, tsRaw, e0.usg);
    const avgTD = gp >= 30 && s.pts >= 10 && s.reb >= 10 && s.ast >= 10;
    if (avgTD) { p.tdUsed++; if (s.pts >= 30) p.td30Used++; }
    return Object.assign({ gp, usg: e0.usg, ovr: e0.ovr, fga: sl.fga, fgp: sl.fgp, tpa: sl.tpa, tpp: sl.tpp, ftp: sl.ftp, fta: sl.fta, ts: sl.ts, avgTD, games: games.length }, s, { pts: s.pts, reb: s.reb, ast: s.ast });
  }

  function playoffLine(st, ctx, seriesList, base, mode) {
    const p = st.player;
    const mult = { mins: 1.06, pts: 1.06, reb: 1.04, ast: 1.08, stl: 1.05, blk: 1.05, tov: 1.1 };
    let cap = Math.max(33.8, base.pts + 1), maxAvg = Math.max(35.8, base.pts + 2.5);
    if (mode === 'heater') { const h = 1.15 + rand() * 0.07; mult.pts *= h; mult.reb *= 1.08; mult.ast *= 1.12; mult.mins *= 1.03; cap = Math.min(37.2, Math.max(35.4, base.pts + 2)); maxAvg = Math.min(38.6, Math.max(37.4, base.pts + 3.5)); }
    if (mode === 'legend') { mult.pts *= 1.22; mult.reb *= 1.15; mult.ast *= 1.2; mult.mins *= 1.04; cap = 37.2; maxAvg = 38.6; }
    const m = { mins: Math.min(base.mins * mult.mins, 43), pts: Math.min(base.pts * mult.pts, cap), reb: base.reb * mult.reb, ast: base.ast * mult.ast, stl: base.stl * mult.stl, blk: base.blk * mult.blk, tov: base.tov * mult.tov };
    if (mode === 'legend') { m.reb = Math.max(m.reb, 10.6); m.ast = Math.max(m.ast, 10.6); m.pts = Math.max(m.pts, 36.2); }
    let all, s, perSeries;
    for (let tries = 0; tries < 24; tries++) {
      all = [];
      perSeries = seriesList.map((sr) => {
        const gs = []; for (let i = 0; i < sr.games; i++) gs.push(genGame(m));
        all.push.apply(all, gs);
        const ss = summarize(gs);
        return { round: sr.round, opp: sr.opp, result: (sr.won ? 'W ' : 'L ') + sr.w + '-' + sr.l, pts: ss.pts, reb: ss.reb, ast: ss.ast, gp: sr.games };
      });
      s = summarize(all);
      const ok = s.pts <= maxAvg && (mode !== 'legend' || (s.pts >= 35.5 && s.reb >= 10 && s.ast >= 10));
      if (ok) break;
    }
    const legendHit = mode === 'legend' && s.pts >= 35.5 && s.reb >= 10 && s.ast >= 10;
    const sl = shootingLine(p, s.pts, clamp(base.ts - 0.014, 0.44, 0.7), base.usg * 1.03);
    return { line: Object.assign({}, s, { fgp: sl.fgp, tpp: sl.tpp, ftp: sl.ftp, ts: sl.ts }), perSeries, heater: mode !== 'normal', legend: legendHit };
  }

  function playSeason(st) {
    const L = st.league, p = st.player;
    const age = p.age;
    const fx = rollEvents(st, p);
    const avail = rollAvail(p, { extraMiss: fx.extraMiss });
    if (avail.major) applyMajorInjury(p);
    p.rookie = p.yearsPro === 0;
    L.teams[st.teamId].depth += fx.depth;
    let userLine = null;
    const user = {
      p, teamId: st.teamId, avail,
      getLine: (ctx) => (userLine = userSeasonLine(st, ctx, avail, fx)),
    };
    const res = NBA.simSeason(L, user);
    const t = L.teams[st.teamId];
    const awardsHere = [];
    const A = res.awards;
    const mine = (x) => x && x.isUser;
    const cnt = (k, n) => { st.career.awards[k] = (st.career.awards[k] || 0) + (n || 1); };
    if (mine(A.mvp)) { cnt('MVP'); awardsHere.push('MVP'); }
    if (mine(A.dpoy)) { cnt('DPOY'); awardsHere.push('Defensive Player of the Year'); }
    if (mine(A.roy)) { cnt('ROY'); awardsHere.push('Rookie of the Year'); }
    if (mine(A.mip)) { cnt('MIP'); awardsHere.push('Most Improved Player'); }
    if (A.scoring && A.scoring.isUser) { cnt('Scoring titles'); awardsHere.push('Scoring Champion (' + r1(A.scoring.ppg) + ')'); }
    const tIdx = A.allNBATeams.findIndex((tm) => tm.includes('user'));
    if (tIdx >= 0) { cnt('All-NBA ' + ['1st', '2nd', '3rd'][tIdx] + ' Team'); cnt('All-NBA'); awardsHere.push('All-NBA ' + ['First', 'Second', 'Third'][tIdx] + ' Team'); }
    const dIdx = A.allDefTeams.findIndex((tm) => tm.includes('user'));
    if (dIdx >= 0) { cnt('All-Defense'); awardsHere.push('All-Defensive ' + ['First', 'Second'][dIdx] + ' Team'); }
    if (A.allStar.includes('user')) { cnt('All-Star'); awardsHere.push('All-Star'); }
    const mvpPlace = A.mvpIds.indexOf('user');
    if (mvpPlace > 0) awardsHere.push('MVP voting: #' + (mvpPlace + 1));

    // playoffs
    const po = res.playoffs;
    let pline = null, perSeries = [], fmvp = false, heater = false, legend = false, resultText = 'Missed the playoffs';
    if (po.userMade && avail.gp < 15) {
      resultText = (po.champion.id === st.teamId ? 'NBA Champions 🏆' : 'Team made the playoffs') + ' (you were injured)';
    } else if (po.userMade) {
      const series = po.userSeries;
      const lost = series.find((s) => !s.won);
      const last = series[series.length - 1];
      resultText = po.champion.id === st.teamId ? 'NBA Champions 🏆' : lost ? 'Lost in the ' + lost.round + ' to ' + lost.opp + ' (' + lost.w + '-' + lost.l + ')' : '';
      if (!series.length) resultText = 'Lost in the play-in';
      if (series.length && avail.gp >= 30 || series.length) {
        const elite = userLine.ovr >= 85;
        const domish = p.arch === 'dominator' || p.sec === 'dominator' || p.arch === 'generational';
        const wantLegend = p.legendUsed < p.legendPlan && elite && domish && p.age >= 23 && userLine.pts >= 25.5 && userLine.reb >= 8 && userLine.ast >= 7.5 && rand() < 0.4;
        const wantHeater = !wantLegend && p.heatersUsed < p.heaterPlan && elite && p.age >= 23 && rand() < 0.3;
        const out = playoffLine(st, user.ctx, series, userLine, wantLegend ? 'legend' : wantHeater ? 'heater' : 'normal');
        pline = out.line; perSeries = out.perSeries; heater = out.heater; legend = out.legend;
        if (wantLegend && out.legend) p.legendUsed++;
        else if (heater) p.heatersUsed++;
      }
    } else if (po.userOut === null) resultText = 'Missed the playoffs';
    if (po.champion.id === st.teamId) {
      st.career.titles++; cnt('Championships'); awardsHere.push('NBA Champion');
      const fin = perSeries.find((x) => x.round === 'NBA Finals');
      const who = NBA.finalsMVP(L, st.teamId, fin ? { pts: fin.pts, reb: fin.reb, ast: fin.ast } : null);
      if (who === 'user') { cnt('Finals MVP'); awardsHere.push('Finals MVP'); fmvp = true; }
    }

    const l = userLine;
    const rec = {
      label: res.label, year: L.year, age, team: t.name, teamId: t.id, wins: t.wins, losses: t.losses,
      gp: l.gp, mins: l.mins, pts: l.pts, reb: l.reb, ast: l.ast, stl: l.stl, blk: l.blk, tov: l.tov,
      fgp: l.fgp, tpp: l.tpp, ftp: l.ftp, ts: l.ts, td: l.td, dd: l.dd, g40: l.g40, g50: l.g50, high: l.high, ovr: Math.round(l.ovr), usg: l.usg,
      avgTD: l.avgTD, totPts: l.totPts, totReb: l.totReb, totAst: l.totAst,
      awards: awardsHere, playoffText: resultText, playoff: pline ? { gp: pline.gp, pts: pline.pts, reb: pline.reb, ast: pline.ast, stl: pline.stl, blk: pline.blk, mins: pline.mins, fgp: pline.fgp, tpp: pline.tpp, ts: pline.ts, td: pline.td, high: pline.high } : null,
      perSeries, heater, legend, ranks: res.ranks, events: fx.notes, injury: avail.major ? 'Suffered a ' + avail.major + ' and missed ' + avail.miss + ' games.' : avail.notable ? 'Missed ' + avail.miss + ' games with a ' + avail.notable + '.' : avail.miss >= 12 ? 'Missed ' + avail.miss + ' games with injuries.' : null,
      salary: st.contract.salary, mvp: A.mvp ? A.mvp.name + ' (' + r1(A.mvp.pts) + '/' + r1(A.mvp.reb) + '/' + r1(A.mvp.ast) + ')' : '', champion: po.champion.name, league: res.league,
      rookie: p.rookie, leaders: res.leaders,
    };
    st.proSeasons.push(rec);
    st.earnings += st.contract.salary;
    st.career.td += l.td;
    if (rec.avgTD) { st.career.tdSeasons++; if (l.pts >= 30) st.career.td30Seasons++; }
    if (pline) st.playoffLines.push(Object.assign({ label: res.label, age, team: t.name }, rec.playoff, { heater, text: resultText }));
    p.yearsPro++;
    st.contract.left--;
    st.bonusPoints = fx.bonusPts;
    st.stage = 'season_recap';
    return rec;
  }

  // ---------------------------------------------------------------- contracts and decisions
  function marketPct(st) {
    const p = st.player;
    let v = ovr(p) - (p.age >= 33 ? 2 * (p.age - 32) : 0);
    const raw = (0.015 + Math.pow(clamp((v - 60) / 32, 0, 1.2), 1.5) * 0.35) * 0.8;
    const yrs = p.yearsPro;
    const maxPct = yrs >= 10 ? 0.35 : yrs >= 7 ? 0.3 : 0.25;
    return { pct: Math.min(raw, maxPct), v, maxPct };
  }
  function teamLabel(t, lastWins) { return lastWins >= 50 ? 'Contender' : lastWins >= 41 ? 'Playoff team' : lastWins >= 33 ? 'Fringe team' : 'Rebuilding'; }
  function role(st, t) {
    const L = st.league, o = ovr(st.player);
    const core = t.core.map((id) => ovr(L.players[id])).sort((a, b) => b - a);
    return o >= core[0] ? 'Franchise player' : o >= core[1] ? 'Co-star' : o >= core[3] ? 'Starter' : 'Role player';
  }
  function decisionOptions(st) {
    const L = st.league, p = st.player, c = st.contract;
    const cap = capNow(L);
    const mk = marketPct(st);
    const baseSal = mk.pct * cap;
    const out = { age: p.age, ovr: Math.round(ovr(p)), expiring: c.left <= 0, contract: c, cap: r1(cap), marketSalary: r1(baseSal), team: L.teams[st.teamId].name };
    const forceRetire = p.age >= 41 || (p.age >= 35 && mk.v < 57) || (p.age >= 25 && mk.v < 55) || (p.age >= 31 && mk.v < 60) || (c.left <= 0 && p.age >= 26 && mk.v < (p.age <= 27 ? 62 : 62 + (p.age - 27) * 1.7));
    out.mustRetire = forceRetire;
    if (out.expiring) {
      const own = L.teams[st.teamId];
      const maxYrsOwn = p.age >= 36 ? 1 : p.age >= 33 ? 2 : 5;
      out.resign = { teamId: own.id, name: own.name, salary: r1(Math.max(2.3 * Math.pow(CAPG, L.year - 2025), baseSal)), maxYears: maxYrsOwn, role: role(st, own), label: teamLabel(own, own.wins) };
      let offers = [];
      const n = mk.v >= 76 ? 6 : mk.v >= 68 ? 4 : mk.v >= 60 ? 3 : 1;
      const teams = L.teams.filter((t) => t.id !== st.teamId).sort(() => rand() - 0.5).slice(0, n);
      teams.forEach((t) => {
        const sal = Math.max(2.3 * Math.pow(CAPG, L.year - 2025), baseSal * (0.88 + rand() * 0.17) * (t.wins < 33 ? 1.04 : 1));
        offers.push({ teamId: t.id, name: t.name, salary: r1(sal), maxYears: p.age >= 36 ? 1 : p.age >= 33 ? 2 : 4, role: role(st, t), label: teamLabel(t, t.wins), wins: t.wins });
      });
      out.offers = offers.sort((a, b) => b.salary - a.salary);
    } else {
      const dest = L.teams.filter((t) => t.id !== st.teamId).sort(() => rand() - 0.5).slice(0, 3);
      out.tradeOptions = dest.map((t) => ({ teamId: t.id, name: t.name, wins: t.wins, label: teamLabel(t, t.wins), role: role(st, t) }));
    }
    return out;
  }
  function decide(st, action, arg) {
    const L = st.league, p = st.player, c = st.contract;
    const note = (s) => st.log.push(L.year + ': ' + s);
    if (action === 'retire') { return retire(st); }
    if (action === 'stay') {
      if (c.left <= 0) throw new Error('contract expired: choose resign or switch');
      st.stage = 'training'; st.afterTraining = 'pro';
      return { text: 'Staying put with the ' + L.teams[st.teamId].nick + '.' };
    }
    if (action === 'trade') {
      const t = L.teams[arg.teamId];
      st.teamId = t.id; p.teamId = t.id;
      note('Traded to ' + t.name);
      st.stage = 'training'; st.afterTraining = 'pro';
      return { text: 'Trade request granted. You are now a ' + t.nick + '.' };
    }
    if (action === 'resign' || action === 'switch') {
      const years = arg.years;
      const t = L.teams[arg.teamId];
      st.teamId = t.id; p.teamId = t.id;
      st.contract = { salary: arg.salary, years, left: years, type: 'veteran' };
      note((action === 'switch' ? 'Signed with ' : 'Re-signed with ') + t.name + ' (' + years + 'y, $' + arg.salary + 'M)');
      st.stage = 'training'; st.afterTraining = 'pro';
      return { text: (action === 'switch' ? 'Signed with the ' : 'Re-signed with the ') + t.nick + ' for ' + years + ' years, $' + arg.salary + 'M/yr.' };
    }
    throw new Error('bad action');
  }

  // after training/progress the league rolls into the next year
  function rollLeague(st) {
    NBA.offseason(st.league, { draft: true });
  }

  // ---------------------------------------------------------------- retirement and HOF
  function hofScore(st) {
    const a = st.career.awards, seasons = st.proSeasons;
    const pts = sum(seasons.map((s) => s.totPts || 0)), reb = sum(seasons.map((s) => s.totReb || 0)), ast = sum(seasons.map((s) => s.totAst || 0));
    let sc = 0;
    sc += 14 * (a.MVP || 0) + 7 * (a['Finals MVP'] || 0) + 6 * (a.Championships || 0) + 7 * (a.DPOY || 0);
    sc += 6 * (a['All-NBA 1st Team'] || 0) + 4 * (a['All-NBA 2nd Team'] || 0) + 3 * (a['All-NBA 3rd Team'] || 0);
    sc += 1.5 * (a['All-Defense'] || 0) + 2 * (a['All-Star'] || 0) + 3 * (a['Scoring titles'] || 0) + 3 * (a.ROY || 0);
    sc += pts / 1500 + reb / 900 + ast / 600;
    return { score: Math.round(sc), pts, reb, ast };
  }
  function retire(st) {
    st.retired = true; st.stage = 'retired';
    const h = hofScore(st);
    const tier = h.score >= 220 ? 'Top-10 All-Time Great' : h.score >= 140 ? 'First-Ballot Hall of Famer' : h.score >= 85 ? 'Hall of Famer' : h.score >= 60 ? 'Borderline Hall of Fame case' : h.score >= 35 ? 'Multiple-time All-Star' : h.score >= 15 ? 'Solid long-time starter' : 'Journeyman';
    st.hof = { score: h.score, tier, totals: h, hall: h.score >= 85 };
    return st.hof;
  }

  // ---------------------------------------------------------------- auto-play for testing / examples
  function auto(st, opt) {
    opt = opt || {};
    const lines = [];
    // pick college: most prestigious we can
    const opts = collegeOptions(st);
    chooseCollege(st, opts[0].id);
    for (;;) {
      const rec = playCollege(st);
      const slot = rec.mock.mid;
      if (rec.mustDeclare || slot <= (opt.declareAt || 22) || (rec.year >= 2 && slot <= 40)) break;
      stayInCollege(st);
      train(st, autoAlloc(st.player, trainingInfo(st).points));
    }
    declare(st);
    startPro(st);
    train(st, autoAlloc(st.player, trainingInfo(st).points));
    for (let guard = 0; guard < 30; guard++) {
      const rec = playSeason(st);
      const d = decisionOptions(st);
      const p = st.player;
      const retireNow = d.mustRetire || (p.age >= 36 && ovr(p) < 72 && rand() < 0.5) || (p.age >= 38 && rand() < 0.45);
      if (retireNow) { retire(st); break; }
      if (d.expiring) {
        const best = d.offers && d.offers[0];
        if (best && best.salary > d.resign.salary * 1.15 && rand() < 0.5) decide(st, 'switch', { teamId: best.teamId, salary: best.salary, years: Math.min(3, best.maxYears) });
        else decide(st, 'resign', { teamId: d.resign.teamId, salary: d.resign.salary, years: Math.min(4, d.resign.maxYears) });
      } else decide(st, 'stay');
      train(st, autoAlloc(st.player, trainingInfo(st).points));
    }
    if (!st.retired) retire(st);
    return st;
  }

  Object.assign(NBA, { Game: { newCareer, scoutReport, collegeOptions, chooseCollege, playCollege, stayInCollege, declare, startPro, trainingInfo, autoAlloc, train, playSeason, decisionOptions, decide, rollLeague, retire, hofScore, capNow, auto, STAR_ODDS } });
  if (typeof module !== 'undefined') module.exports = NBA;
})(typeof window !== 'undefined' ? window : globalThis);
