(function (g) {
  'use strict';
  const NBA = g.NBA;
  if (typeof require !== 'undefined') { try { require('./real.js'); require('./sizes.js'); require('./combine.js'); } catch (e) { /* browser build loads real.js separately */ } }
  const D = NBA.data;
  const { rand, randn, clamp, rint, pick, weighted, sum, ovr, expLine, genGame, summarize, shootingLine, progress, applyTraining, trainPoints, rollAvail, applyMajorInjury, perfOf } = NBA;
  const ATTRS = D.ATTRS;
  const r1 = (x) => Math.round(x * 10) / 10;

  const STAR_ODDS = { 1: 38, 2: 28, 3: 20, 4: 10, 5: 4 };
  const STAR_NAMES = { 1: 'Zero-hype prospect', 2: 'Under-the-radar', 3: 'Solid recruit', 4: 'Blue-chip', 5: 'Five-star phenom' };
  const TD_CAP = 5;
  // game plan multipliers by style (pts, reb, ast, stl, blk)
  const STYLE_MULT = { balanced: [1, 1, 1, 1, 1], score: [1.06, 0.95, 0.88, 1, 1], playmake: [0.94, 1.08, 1.16, 1, 1], defend: [0.96, 1.03, 1, 1.14, 1.18] };
  const STYLE_KEYS = ['pts', 'reb', 'ast', 'stl', 'blk'];
  // the plan is a list of [slot, style] switches; slot = games into the schedule (0-81 regular season, 82+ playoffs)
  const styleAt = (seq, slot) => { let cur = 'balanced'; for (const [at, sty] of seq) { if (at <= slot) cur = sty; } return cur; };
  const styleShare = (seq, total) => { const out = {}; for (let i = 0; i < seq.length; i++) { const from = seq[i][0], to = i + 1 < seq.length ? Math.min(total, seq[i + 1][0]) : total; if (to > from) out[seq[i][1]] = (out[seq[i][1]] || 0) + (to - from) / total; } return out; };
  // Salary cap by season start year, $M: real history and the official projection through 2034-35
  // (gabriel1200/site_data cap.csv); after that we keep growing 5% a year, the projected pace.
  const CAP_M = { 2005: 49.5, 2010: 58.0, 2015: 70.0, 2016: 94.1, 2017: 99.1, 2018: 101.9, 2019: 109.1, 2020: 109.1, 2021: 112.4, 2022: 123.7, 2023: 136.0, 2024: 140.6, 2025: 154.6, 2026: 165.0, 2027: 174.0, 2028: 182.7, 2029: 191.8, 2030: 201.4, 2031: 211.5, 2032: 222.1, 2033: 233.2, 2034: 244.8 };
  const capFor = (y) => (CAP_M[y] != null ? CAP_M[y] : y > 2034 ? 244.8 * Math.pow(1.05, y - 2034) : CAP_M[2005] * Math.pow(1.04, Math.max(0, y - 2005)));
  // Veteran salary as a share of the cap by rating (real medians by production rank, 2012-26)
  const MARKET = [[56, 0.02], [60, 0.035], [65, 0.06], [68, 0.085], [70.5, 0.095], [72.9, 0.12], [74.9, 0.134], [77.3, 0.17], [80, 0.225], [82.2, 0.24], [84.9, 0.245], [87.8, 0.25], [91.2, 0.31], [94.4, 0.335], [98, 0.35]];
  function marketCurve(v) {
    if (v <= MARKET[0][0]) return MARKET[0][1];
    for (let i = 1; i < MARKET.length; i++) {
      if (v <= MARKET[i][0]) { const [x0, y0] = MARKET[i - 1], [x1, y1] = MARKET[i]; return y0 + ((v - x0) / (x1 - x0)) * (y1 - y0); }
    }
    return MARKET[MARKET.length - 1][1];
  }

  // ---------------------------------------------------------------- creation
  function newCareer(o) {
    if (o.seed != null) NBA.setSeed(o.seed);
    // Generational talents are almost always blue-chip, top-3 picks who dominate college.
    // A rare "Jokic path" (~8%) keeps them under-scouted with a slow start but the same hidden ceiling.
    const genLevel = o.arch === 'generational' ? 2 : o.sec === 'generational' ? 1 : 0;
    const lateBloomer = genLevel > 0 && rand() < NBA.tuning.lateBloom;   // real gens who started slow (Giannis, Kobe, Harden, Howard) were slow starters on their path, not all the time
    let stars = o.stars, ceiling = o.ceiling, gap = 10 + rand() * 12;
    if (genLevel && !lateBloomer) {
      if (!stars) stars = +weighted(genLevel === 2 ? { 5: 70, 4: 25, 3: 5 } : { 5: 40, 4: 35, 3: 25 });
      if (ceiling == null) ceiling = (genLevel === 2 ? 86 : 82) - NBA.tuning.genCeilDrop + NBA.tuning.genCeilRange * Math.pow(rand(), NBA.tuning.genCeilPow);
      gap = NBA.tuning.genGapA + rand() * NBA.tuning.genGapB + (genLevel === 1 ? NBA.tuning.genSecGap : 0);   // a generational tag on top of another archetype starts further from the ceiling (Jokic: 10 ppg at 20)
    } else if (lateBloomer) {
      if (!stars) stars = +weighted({ 1: 50, 2: 50 });
      if (ceiling == null) ceiling = 88 + 8 * rand();
      gap = 20 + rand() * 6;
    }
    if (!stars) stars = +weighted(STAR_ODDS);
    if (ceiling == null) ceiling = NBA.rollCeiling(stars, o.arch);
    const genBonus = genLevel && !lateBloomer ? (genLevel === 2 ? 8 : 4) : 0; // true generational talents are seen as such by scouts
    const p = NBA.makePlayer({ id: 'user', name: o.name || 'Rookie', pos: o.pos, arch: o.arch, sec: o.sec && o.sec !== o.arch ? o.sec : null, home: o.home, ht: o.ht, wt: o.wt, ws: o.ws, ceiling, age: 18, stars, gap });
    p.vis = clamp(0.15 + 0.19 * (stars - 1), 0.15, 0.92);
    const L = NBA.newLeague(2026, { real: true }); // the real league as of 20 Oct 2026
    const st = {
      v: 1, stage: 'scouting', player: p, league: L, stars,
      genBonus, college: null, collegeYears: [], proSeasons: [], playoffLines: [],
      contract: null, teamId: -1, earnings: 0, earnings26: 0, capYears: 0, draft: null,
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
    const minsFixed = clamp(Math.round(19 + 0.85 * (oEff - 64) + ({ 1: 0, 2: 1.5, 3: 3.5, 4: 6.5, 5: 9 }[st.stars] || 0)), 16, 35);
    const e = expLine(p, { pace: 81.6, minsFixed, usgMult: 1.03 + ({ 1: 0, 2: 0.04, 3: 0.1, 4: 0.19, 5: 0.27 }[st.stars] || 0) + 0.02 * (5 - c.prestige) + (c.home ? 0.01 : 0), tsAdj: -0.012 + 0.003 * (oEff - 70) / 5, rebMult: 0.97, astMult: 1.05, coTax: 0 });
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
    let b = (c.prestige - 3) * 0.9 + (st.genBonus || 0) * Math.min(1, Math.max(0, (st.stars - 1) / 3));   // scouts only credit 'generational' once the recruit is a known name
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
  // declaring for the draft leads to the combine: you are measured (height, weight, wingspan, reach), then choose whether to take the athletic tests or skip them,
  // and the scouts' view of you moves; then it is draft night
  function declare(st) {
    const p = st.player, last = st.collegeYears[st.collegeYears.length - 1];
    p.cmb = NBA.combineFor(p, { test: false, year: st.league.year });   // measured at the combine; the tests are the choice
    st.combine = { year: st.league.year, pre: last && last.mock ? last.mock : null, done: false, test: null, post: null, comp: null };
    st.stage = 'combine';
    return st.combine;
  }
  function runCombine(st, test) {
    const p = st.player, c = st.combine;
    const yr = st.league.year, seed = (p.name.length * 7919 + yr * 104729 + 12345) | 0, bonus = stockBonus(st);
    const mine = NBA.combineFor(p, { test: !!test, year: yr }), other = NBA.combineFor(p, { test: !test, year: yr });
    p.cmb = mine; c.test = !!test; c.comp = NBA.combineComp(p, mine); c.done = true;
    // the scouts' projection before the combine, after it, and after the other choice (all against the same classes)
    c.pre = NBA.mockSeeded(st.league, p, bonus, seed, null); c.post = NBA.mockSeeded(st.league, p, bonus, seed, mine); c.alt = NBA.mockSeeded(st.league, p, bonus, seed, other); c.altBonus = other ? other.bonus : 0;
    return c;
  }
  function enterDraft(st) {
    const p = st.player;
    if (!st.combine || !st.combine.done) { if (!st.combine) declare(st); runCombine(st, true); }
    p.from = st.college.name;
    const res = NBA.userDraft(st.league, p, stockBonus(st));
    p.rookie = false; p.isPro = true;
    let slot = res.slot, team = res.team;
    if (!slot) {
      // undrafted: sign a two-way-turned-min deal
      slot = null;
      team = pick(st.league.teams);
    }
    st.draft = { slot, team: team.name, teamId: team.id, year: st.league.year, board: res.board, college: st.college.name, mockRank: res.mockRank, pre: st.combine.pre, post: st.combine.post, combineBonus: p.cmb ? p.cmb.bonus : 0, tested: st.combine.test, classSize: res.classSize, teamRec: team.wins + '-' + team.losses };
    st.teamId = team.id; p.teamId = team.id;
    const cap = capNow(st.league);
    let sal, yrs;
    // rookie scale as a share of the cap: the #1 pick earns ~9% of it, then -4.2% per slot
    const capY = capFor(st.league.year);
    if (slot && slot <= 30) { sal = capY * 0.0892 * Math.pow(0.958, slot - 1); yrs = 4; }
    else if (slot) { sal = capY * Math.max(0.0097, 0.0149 - (slot - 31) * 0.00023); yrs = 3; }
    else { sal = capY * 0.0084; yrs = 2; }
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
  const capNow = (L) => capFor(L.year);

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

  function stratify(games) {
    const n = games.length; if (n < 10) return games;
    const idx = games.map((g, i) => i).sort((a, b) => games[a].pts - games[b].pts), u = rand(), phi = 0.6180339887;
    const slots = games.map((g, i) => ({ i, q: ((i * phi + u) % 1) + 0.03 * randn() })).sort((a, b) => a.q - b.q), out = new Array(n);
    slots.forEach((sl, rank) => { out[sl.i] = games[idx[rank]]; });
    return out;
  }
  function userSeasonLine(st, ctx, avail, fx) {
    const p = st.player, rookie = p.yearsPro === 0, age = p.age;
    // a new teammate changes your role gradually; a franchise player keeps most of it
    const coRaw = p.coTaxPrev == null ? ctx.coTax : 0.7 * p.coTaxPrev + 0.3 * ctx.coTax; p.coTaxPrev = coRaw;
    const coT = coRaw * (1 - NBA.tuning.userTaxCut * clamp((ovr(p) - 80) / 16, 0, 1));
    const paceS = p.paceS == null ? ctx.pace : 0.6 * p.paceS + 0.4 * ctx.pace; p.paceS = paceS;
    const e0 = expLine(p, { coTax: coT, fr: ctx.fr, tsAdj: ctx.tsAdj || 0, wins: ctx.wins, pace: paceS, rookie, minsMult: fx.minsMult, minsMax: fx.minsCap || 0, minsFloor: rookie ? NBA.rookieFloor(st.draft && st.draft.slot) : 0 });
    // Year-to-year shocks sized from real careers (22 generational and ~100 star careers, Basketball-Reference): usage ±6%, TS ±3%, minutes ±4%, rebounds ±10%, assists ±14% between seasons.
    // Nothing else shapes a season: no caps, plans or quotas, so big years, slumps and the rare triple-double season come from the tails of these distributions.
    // steadiness: scorers' year-to-year swings are smaller than the generic noise (real 24+ ppg scorers 3.0 ppg a year, the generic sim 3.4); a secondary tag counts 40%
    const steadyF = (D.ARCHETYPES[p.arch].steady || 1) * (p.sec ? 1 + 0.4 * ((D.ARCHETYPES[p.sec].steady || 1) - 1) : 1);
    const sn = (ovr(p) >= 84 ? 1 : NBA.tuning.noiseNon) * steadyF;   // real non-stars swing more from year to year than the all-time greats (mean |change in ppg| 2.1-2.9)
    const nm = 1 + 0.028 * sn * (ovr(p) >= 84 ? 1 : NBA.tuning.minsNoiseNon) * randn(), nu = 1 + 0.045 * sn * randn(), nt = 1 + 0.02 * randn(), evt = 1 + fx.form;
    const m = { mins: Math.min(NBA.tuning.minsHard - 0.6, e0.mins * nm), pts: e0.pts * nu * nt * nm * evt, reb: e0.reb * (1 + 0.07 * randn()) * nm * evt, ast: e0.ast * (1 + 0.10 * randn()) * nm * Math.sqrt(nu) * evt, stl: e0.stl * (1 + 0.10 * randn()) * nm, blk: e0.blk * (1 + 0.12 * randn()) * nm, tov: e0.tov * nm * nu };
    let gp = avail.gp; const gpCut = false;
    // game plan: a season-average multiplier from how long each style was used (per-game variation is applied when the games are drawn)
    const seq = st.styleSeq && st.styleSeq.length ? st.styleSeq : [[0, st.style || 'balanced']];
    const share = styleShare(seq, 82), eff = STYLE_KEYS.map((k, i) => Object.keys(share).reduce((a, sty) => a + share[sty] * STYLE_MULT[sty][i], 0));
    ['pts', 'reb', 'ast', 'stl', 'blk'].forEach((k, i) => { m[k] *= eff[i]; });
    // rookies: even Wembanyama / Luka / LeBron / Iverson topped out around 21-23.5 ppg (real rookie ppg vs the rating-based expectation)
    if (rookie && m.pts > 18.5) m.pts = 18.5 + (m.pts - 18.5) * 0.36;
    const games = [];
    for (let i = 0; i < gp; i++) {
      const gs = styleAt(seq, Math.min(81, Math.floor(((i + 0.5) * 82) / Math.max(1, gp)))), f = STYLE_MULT[gs], mj = Object.assign({}, m);
      STYLE_KEYS.forEach((k, ki) => { mj[k] = m[k] * f[ki] / (eff[ki] || 1); });
      games.push(genGame(mj));
    }
    // spread good and bad nights evenly through the schedule so a hot first half does not fade into a lower final average
    let ordered = games;
    { const cuts = [0]; for (let j = 1; j < games.length; j++) if (styleAt(seq, Math.min(81, Math.floor(((j + 0.5) * 82) / Math.max(1, gp)))) !== styleAt(seq, Math.min(81, Math.floor(((j - 0.5) * 82) / Math.max(1, gp))))) cuts.push(j); cuts.push(games.length);
      const out = []; for (let c = 0; c + 1 < cuts.length; c++) out.push.apply(out, stratify(games.slice(cuts[c], cuts[c + 1]))); ordered = out; }
    const s = summarize(ordered);
    const tsRaw = clamp(e0.ts * nt * (0.5 + 0.5 * (s.pts / Math.max(1, m.pts))), 0.44, 0.72);
    const sl = shootingLine(p, s.pts, tsRaw, e0.usg);
    const avgTD = gp >= 30 && s.pts >= 10 && s.reb >= 10 && s.ast >= 10;
    return Object.assign({ gp, usg: e0.usg * nu, ovr: e0.ovr, fga: sl.fga, fgp: sl.fgp, tpa: sl.tpa, tpp: sl.tpp, ftp: sl.ftp, fta: sl.fta, ts: sl.ts, tpm: sl.tpm, ftm: sl.ftm, avgTD, games: ordered.length, gpCut, gameList: ordered }, s, { pts: s.pts, reb: s.reb, ast: s.ast });
  }

  function playoffLine(st, ctx, seriesList, base, mode) {
    const p = st.player;
    // real stars (n=202, 2001-26): minutes x1.086, points x1.005, rebounds x1.055, assists x0.944, steals x0.98, blocks x1.15, turnovers x1.09
    const mult = { mins: 1.085, pts: 1.0, reb: 1.055, ast: 0.95, stl: 0.98, blk: 1.15, tov: 1.09 };
    // a postseason's overall form varies far more than a single game's noise (real sd of the points ratio is 0.155)
    // Postseason scoring vs the regular season, measured on 110 real generational-star runs (2001-2024): ratio mean 1.02, sd 0.17 (p10 0.84, p90 1.24); other 20+ ppg scorers: 1.005 / 0.15.
    const starP = clamp((base.ovr - 80) / 14, 0, 1), fp = clamp(1 + 0.008 * starP + (0.12 - 0.035 * starP) * randn(), 0.62, 1.3), fo = clamp(1 + 0.07 * randn(), 0.8, 1.22);   // stars' postseason scoring holds closer to their regular season (real 27+ ppg: sd 0.14, never above 1.29x)
    mult.ast = clamp(0.95 - 0.015 * (base.ast - 5), 0.85, 0.95); // real 7+ apg players lose ~10% of their assists in the playoffs
    mult.pts *= fp; mult.reb *= fo; mult.ast *= fo; mult.stl *= fo; mult.blk *= fo;
    const m = { mins: Math.min(base.mins * mult.mins, 41.5), pts: base.pts * mult.pts, reb: base.reb * mult.reb, ast: base.ast * mult.ast, stl: base.stl * mult.stl, blk: base.blk * mult.blk, tov: base.tov * mult.tov };
    const seq = st.styleSeq && st.styleSeq.length ? st.styleSeq : [[0, st.style || 'balanced']];
    const share = styleShare(seq, 82), eff = STYLE_KEYS.map((k, i) => Object.keys(share).reduce((a, sty) => a + share[sty] * STYLE_MULT[sty][i], 0));
    const poStyleM = (mm, slot) => { const f = STYLE_MULT[styleAt(seq, slot)], o = Object.assign({}, mm); STYLE_KEYS.forEach((k, ki) => { o[k] = mm[k] * f[ki] / (eff[ki] || 1); }); return o; };
    const all = []; let poCount = 0;
    const perSeries = seriesList.map((sr) => {
      const gs = []; for (let i = 0; i < sr.games; i++) { gs.push(genGame(poStyleM(m, 82 + poCount), true)); poCount++; }
      all.push.apply(all, gs);
      const ss = summarize(gs);
      return { round: sr.round, opp: sr.opp, result: (sr.won ? 'W ' : 'L ') + sr.w + '-' + sr.l, pts: ss.pts, reb: ss.reb, ast: ss.ast, gp: sr.games, list: gs, w: sr.w, l: sr.l, won: sr.won };
    });
    const s = summarize(all);
    const sl = shootingLine(p, s.pts, clamp(base.ts - 0.014, 0.44, 0.7), base.usg * 1.03);
    return { line: Object.assign({}, s, { fgp: sl.fgp, tpp: sl.tpp, ftp: sl.ftp, ts: sl.ts, fga: sl.fga, tpa: sl.tpa, fta: sl.fta, tpm: sl.tpm, ftm: sl.ftm }), perSeries, heater: false, legend: false, form: fp };   // form: this postseason's scoring multiplier vs the regular season, before game-to-game luck
  }

  // ---------------------------------------------------------------- match-by-match log (a reveal of the already-simulated season)
  function shootBox(pts, prof) {
    let fta = Math.round(pts * prof.ftaPerPt * (0.55 + 0.9 * rand()));
    let ftm = clamp(Math.round(fta * prof.ftp + 0.9 * Math.sqrt(Math.max(0.2, fta)) * 0.5 * randn()), 0, Math.min(fta, pts));
    let rem = pts - ftm;
    // shot volume is only loosely tied to the points: low-scoring nights tend to be bricky ones (points per shot varies ~25% around the season norm)
    const eff = clamp((0.55 + 0.45 * pts / Math.max(4, prof.avgPts)) * Math.exp(0.25 * randn()), 0.45, 1.7);
    let fga = Math.round(pts * prof.fgaPerPt / eff);
    let tpa = Math.round(fga * prof.tpaShare * (0.65 + 0.7 * rand()));
    let tpm = clamp(Math.round(tpa * prof.tpp + 0.8 * Math.sqrt(Math.max(0.2, tpa)) * 0.5 * randn()), 0, Math.min(tpa, Math.floor(rem / 3)));
    let rem2 = rem - 3 * tpm;
    if (rem2 % 2) { if (ftm < pts && (rem2 - 1) >= 2 * tpm * 0) { ftm++; rem2--; } else if (ftm > 0) { ftm--; rem2++; } else if (tpm > 0) { tpm--; rem2 += 3; } }
    fta = Math.max(fta, ftm);
    const fgm = tpm + rem2 / 2;
    fga = Math.max(fga, fgm); tpa = Math.min(Math.max(tpa, tpm), fga);
    tpa = Math.min(tpa, fga - (fgm - tpm));   // a box score needs at least as many two-point tries as two-point makes (3% of games broke this)
    return { fgm, fga, tpm, tpa, ftm, fta };
  }

  // ---------------------------------------------------------------- shot chart
  // Every shot of a game, consistent with its box score: fga shots, tpa of them threes, fgm made, tpm of the makes threes. Court coordinates in tenths
  // of a foot with the basket at (250, 52), as the dashboard draws it. Where the twos come from follows the player (rim-heavy bigs and slashers,
  // mid-range shooters) around the real 2023-24 league mix of two-point tries: restricted area ~50%, rest of the paint ~29%, mid-range ~21%;
  // corner threes ~22% of threes (more for forwards and bigs). Which tries go in is drawn by each zone's real accuracy (rim 66%, paint 43%, mid 41%,
  // corner three 39%, above the break 35.5%; the odds are sharpened, power 1.4 for twos and 2 for threes, because a game's makes are a fixed number shared
  // out without replacement), so the made shots sit where real makes do: sim rim / paint / mid 65.7 / 42.5 / 42.6%, corner / above the break
  // 41.3 / 37.0% (these careers shoot threes a little better than the league; the corner edge is the real one). One integer a shot keeps saves small:
  // x | y << 9 | made << 18 | zone << 19, zones 0 rim, 1 paint, 2 mid-range, 3 corner three, 4 above-the-break three.
  const ZONE_FG = [0.66, 0.43, 0.41, 0.39, 0.355];
  const mulberry = (seed) => { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  function shotMix(p) {
    const a = p.attrs || {}, lean = clamp(((a.inside || 50) - (a.mid || 50)) / 30 + ({ C: 0.7, PF: 0.35, SF: 0, SG: -0.2, PG: -0.15 }[p.pos] || 0), -1.5, 1.5);
    const rim = 0.5 * Math.exp(0.45 * lean), paint = 0.29 * Math.exp(0.1 * lean), mid = 0.21 * Math.exp(-0.6 * lean), s = rim + paint + mid;
    return { rim: rim / s, paint: paint / s, c3: { PG: 0.17, SG: 0.22, SF: 0.25, PF: 0.27, C: 0.27 }[p.pos] || 0.22 };
  }
  function shotSpot(z, rnd) {
    const at = (r, th) => [250 + r * Math.sin(th), 52 + r * Math.cos(th)];
    for (let k = 0; k < 40; k++) {
      if (z === 0) { const [x, y] = at(3 + 37 * Math.pow(rnd(), 0.9), (rnd() + rnd() - 1) * 1.9); if (y > 8) return [x, y]; }
      else if (z === 1) { const r = 42 + 108 * rnd(), [x, y] = at(r, (rnd() - 0.5) * 2.8); if (Math.abs(x - 250) <= 57 && y <= 187 && y > 8) return [x, y]; }
      else if (z === 2) {
        const [x, y] = at(90 + 142 * rnd(), (rnd() - 0.5) * 3.0);
        const inArc = y <= 140 ? Math.abs(x - 250) <= 214 : Math.hypot(x - 250, y - 52) <= 231, inPaint = Math.abs(x - 250) < 61 && y < 191;
        if (inArc && !inPaint && x > 8 && x < 492 && y > 8) return [x, y];
      } else if (z === 3) { const x = rnd() < 0.5 ? 5 + 21 * rnd() : 474 + 21 * rnd(); return [x, 8 + 124 * rnd()]; }
      else { const [x, y] = at(241 + 34 * Math.pow(rnd(), 2), (rnd() + rnd() - 1) * 1.2); if (y > 143 && x > 6 && x < 494 && y < 462) return [x, y]; }
    }
    return [[250, 70], [250, 140], [250, 215], [16, 70], [250, 300]][z];
  }
  function shotsFor(b, p, seed) {
    const rnd = mulberry(seed), mix = shotMix(p), zs = [];
    const tpa = b.tpa || 0, twoA = Math.max(0, (b.fga || 0) - tpa), tpm = Math.min(b.tpm || 0, tpa), twoM = Math.min(Math.max(0, (b.fgm || 0) - tpm), twoA);
    for (let i = 0; i < twoA; i++) { const u = rnd(); zs.push(u < mix.rim ? 0 : u < mix.rim + mix.paint ? 1 : 2); }
    for (let i = 0; i < tpa; i++) zs.push(rnd() < mix.c3 ? 3 : 4);
    // exactly twoM of the twos and tpm of the threes go in, picked in proportion to each zone's odds (weighted sampling without replacement)
    const made = new Set(), pickMade = (idx, m) => idx.map((i) => { const q = ZONE_FG[zs[i]]; return [Math.pow(rnd(), Math.pow((1 - q) / q, zs[i] < 3 ? 1.4 : 2)), i]; }).sort((x, y) => y[0] - x[0]).slice(0, m).forEach((x) => made.add(x[1]));
    pickMade(zs.map((z, i) => i).filter((i) => zs[i] < 3), twoM); pickMade(zs.map((z, i) => i).filter((i) => zs[i] >= 3), tpm);
    return zs.map((z, i) => { const [x, y] = shotSpot(z, rnd); return clamp(Math.round(x), 0, 499) | (clamp(Math.round(y), 0, 469) << 9) | ((made.has(i) ? 1 : 0) << 18) | (z << 19); });
  }
  const shotSeed = (st, key) => ((st.seasonSeed || 0) ^ 0x51ed27) + 7919 * key;   // schedule slot (playoff games 1000+): a replayed season draws the same spots for the same box
  // Box scores drawn game by game drift from the season's shooting line (FG% ~1 point low for regulars, 10-20 points for low-volume players, and a
  // different split of points between threes, twos and free throws). Two steps put the season's boxes back on its line, each game keeping its points:
  // 1. makes: a two plus a free throw become a three (or back), then a two becomes two free throws (or back), until the season's made threes and
  //    free throws are the line's (so are its made twos: points = 2 FGM + 3PM + FTM);
  // 2. misses: attempts go to or come off games until the totals give the line's 3P%, FG% and FT%, to the nearest attempt.
  // Games are picked in proportion to how much of that shot they already have. The season record is then the sum of its boxes (shootingFromLog).
  function fitShooting(bs, tgt, rnd) {
    if (!bs.length) return;
    const n = bs.length, sum = (k) => bs.reduce((t, b) => t + (b[k] || 0), 0), two = (b) => b.fgm - b.tpm;
    const steer = (want, have, wt, okUp, up, okDown, down, size) => {
      for (let guard = 0; guard < 4000; guard++) {
        const d = Math.round(want()) - have(); if (Math.abs(d) < (size || 1)) return;
        const c = bs.filter(d > 0 ? okUp : okDown); if (!c.length) return;
        let u = rnd() * c.reduce((t, b) => t + wt(b), 0), b = c[c.length - 1]; for (const x of c) { u -= wt(x); if (u <= 0) { b = x; break; } }
        (d > 0 ? up : down)(b);
      }
    };
    if (tgt.tpa != null && tgt.fta != null) {
      steer(() => (tgt.tpm != null ? tgt.tpm : tgt.tpa * tgt.tpp) * n, () => sum('tpm'), (b) => b.tpm + two(b) + 0.5,
        (b) => two(b) >= 1 && b.ftm >= 1, (b) => { b.tpm++; b.tpa++; b.ftm--; },
        (b) => b.tpm >= 1, (b) => { b.tpm--; b.tpa--; b.ftm++; b.fta++; });
      steer(() => (tgt.ftm != null ? tgt.ftm : tgt.fta * tgt.ftp) * n, () => sum('ftm'), (b) => b.ftm + two(b) + 0.5,
        (b) => two(b) >= 1, (b) => { b.fgm--; b.fga--; b.ftm += 2; b.fta += 2; },
        (b) => b.ftm >= 2, (b) => { b.ftm -= 2; b.fta -= 2; b.fgm++; b.fga++; }, 2);
    }
    const TPM = sum('tpm'), FGM = sum('fgm'), FTM = sum('ftm');
    // a line with too few threes for a 3P% (under 0.3 a game) keeps its number of tries instead
    if (TPM && tgt.tpp > 0.05 || tgt.tpa != null) steer(() => (TPM && tgt.tpp > 0.05 ? Math.max(TPM, TPM / tgt.tpp) : Math.max(TPM, tgt.tpa * n)), () => sum('tpa'), (b) => b.tpa + 0.5, () => true, (b) => { b.tpa++; b.fga++; }, (b) => b.tpa > b.tpm, (b) => { b.tpa--; b.fga--; });
    if (FGM && tgt.fgp > 0.05) steer(() => Math.max(FGM + sum('tpa') - TPM, FGM / tgt.fgp), () => sum('fga'), (b) => b.fga - b.tpa + 0.5, () => true, (b) => { b.fga++; }, (b) => b.fga - b.tpa > two(b), (b) => { b.fga--; });
    if (FTM && tgt.ftp > 0.05) steer(() => Math.max(FTM, FTM / tgt.ftp), () => sum('fta'), (b) => b.fta + 0.5, () => true, (b) => { b.fta++; }, (b) => b.fta > b.ftm, (b) => { b.fta--; });
  }
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dateStr = (y, m, d) => { const t = new Date(Date.UTC(y, m, d)); return MON[t.getUTCMonth()] + ' ' + t.getUTCDate(); };
  // the best single games of a season (regular season and playoffs): kept on the season record so career highs survive after the match log is replaced
  function seasonBests(items, label, age) {
    const keep = ['d', 'o', 'oc', 'h', 'w', 'f', 'a', 'ot', 'm', 'pt', 'rb', 'or', 'as', 'st', 'bk', 'to', 'pf', 'pm', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'r', 'n', 'po', 'rnd'];
    const pick = (g) => { const o = {}; keep.forEach((k) => { if (g[k] != null) o[k] = g[k]; }); o.s = label; o.age = age; return o; };
    const out = {};
    [['reg', (g) => !g.po], ['po', (g) => g.po]].forEach(([key, f]) => {
      const gs = items.filter((x) => x.k === 'g' && f(x) && !x.dnp); if (!gs.length) return;
      const top = (k) => gs.reduce((b, g) => (!b || g[k] > b[k] || (g[k] === b[k] && g.r > b.r) ? g : b), null);
      out[key] = { pts: pick(top('pt')), reb: pick(top('rb')), ast: pick(top('as')), stl: pick(top('st')), blk: pick(top('bk')), best: pick(gs.reduce((b, g) => (!b || g.r > b.r ? g : b), null)) };
    });
    return out;
  }
  function gameScore(won, scoreMin) {
    const margin = 1 + Math.round(Math.abs(randn()) * 11.5);
    const win = Math.max(Math.round(112 + margin / 2 + randn() * 7), scoreMin);
    const ot = margin <= 4 && rand() < 0.4 ? 1 : 0;
    return { f: won ? win : win - margin, a: won ? win - margin : win, ot };
  }
  function buildMatchLog(st, rec, line, games, series, t, injuryText, poLine) {
    const L = st.league, teams = Object.values(L.teams).filter((x) => x.id !== st.teamId);
    const total = 82, gp = games.length, miss = Math.max(0, total - gp);
    const ppd = line.pts > 0 ? 1 / line.pts : 0;
    const prof = { avgPts: line.pts, fgaPerPt: (line.fga || line.pts * 0.8) * ppd, tpaShare: line.fga ? (line.tpa || 0) / line.fga : 0.35, ftaPerPt: (line.fta || line.pts * 0.2) * ppd, tpp: line.tpp || 0.35, ftp: line.ftp || 0.78 };
    const mk = (g, fgp, tpp, ftp, ts) => {
      const b = shootBox(g.pts, { avgPts: prof.avgPts, fgaPerPt: prof.fgaPerPt, tpaShare: prof.tpaShare, ftaPerPt: prof.ftaPerPt, tpp: tpp || prof.tpp, ftp: ftp || prof.ftp });
      const cats = [g.pts, g.reb, g.ast, g.stl, g.blk].filter((x) => x >= 10).length;
      const tg = [];
      if (cats >= 3) tg.push('Triple-double'); else if (cats === 2) tg.push('Double-double');
      if (g.pts >= 60) tg.push('60+ points'); else if (g.pts >= 50) tg.push('50+ points'); else if (g.pts >= 40) tg.push('40+ points'); else if (g.pts >= 30 && cats < 3) tg.push('30+ points');
      const rebA = st.player.attrs ? st.player.attrs.reb : 50;
      const orR = clamp(0.2 + (rebA - 50) * 0.003, 0.14, 0.4);
      const orb = clamp(Math.round(g.reb * orR + randn() * 0.7), 0, g.reb);
      const pf = clamp(Math.round(1.9 + (st.player.attrs ? (st.player.attrs.rimP - 40) * 0.01 : 0) + randn() * 1.3), 0, 6);
      return Object.assign({ m: Math.round(g.min), pt: g.pts, rb: g.reb, or: orb, as: g.ast, st: g.stl, bk: g.blk, to: g.tov, pf, r: NBA.gameRating(g, b), tg }, b);
    };
    const score = gameScore;
    // regular season: 82 slots, opponents twice each plus 24 extra
    const opps = []; teams.forEach((x) => { opps.push(x, x); }); while (opps.length < total) opps.push(teams[Math.floor(rand() * teams.length)]);
    for (let i = opps.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [opps[i], opps[j]] = [opps[j], opps[i]]; }
    opps.length = total;
    const missed = new Set();
    if (miss >= 15) { const st0 = Math.floor(rand() * (total - miss + 1)); for (let i = 0; i < miss; i++) missed.add(st0 + i); } else { while (missed.size < miss) missed.add(Math.floor(rand() * total)); }
    const blockInjury = miss >= 15;
    const played = []; for (let i = 0, k = 0; i < total; i++) if (!missed.has(i)) played.push({ slot: i, g: games[k++] });
    const boxes = {}; played.forEach((x) => { boxes[x.slot] = mk(x.g, line.fgp, line.tpp, line.ftp, line.ts); });
    // the season's shooting is the season line (fitShooting), then every game gets its shots; both on their own random streams, so nothing else moves
    fitShooting(played.map((x) => boxes[x.slot]), line, mulberry(shotSeed(st, 5000)));
    played.forEach((x) => { const b = boxes[x.slot]; b.r = NBA.gameRating(x.g, b); b.sh = shotsFor(b, st.player, shotSeed(st, x.slot)); });
    // wins fall on the nights the star was good, plus noise and streakiness
    let ar = 0; const key = []; for (let i = 0; i < total; i++) { ar = 0.5 * ar + randn(); const b = boxes[i]; key.push((b ? (b.r - 7) * 0.9 : 0) + ar); }
    const order = key.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]); const winSlots = new Set(order.slice(0, t.wins).map((x) => x[1]));
    const items = [];
    for (let i = 0; i < total; i++) {
      const won = winSlots.has(i), b = boxes[i];
      const sc = score(won, b ? b.pt + 38 : 0);
      const it = Object.assign({ k: 'g', n: i + 1, d: dateStr(L.year, 9, 22 + Math.round(i * 1.98 + (rand() - 0.5) * 1.5)), o: opps[i].nick, oc: opps[i].city, h: rand() < 0.5 ? 1 : 0, w: won ? 1 : 0, ot: sc.ot }, { f: sc.f, a: sc.a });
      if (b) Object.assign(it, b); else { it.dnp = blockInjury ? (injuryText || 'Injured') : 'Rest'; }
      it.ar = NBA.data.ARENAS[it.h ? t.nick : opps[i].nick] || '';
      if (b) it.pm = Math.round((it.f - it.a) * (b.m / 48) * 1.1 + randn() * 4);
      items.push(it);
      if (i === 51) items.push({ k: 'hdr', text: 'All-Star Weekend' + (rec.awards.includes('All-Star') ? ' · you were selected ★' : '') });
    }
    items.push({ k: 'hdr', text: 'Regular season complete · ' + t.wins + '-' + t.losses });
    // playoffs
    const poGames = [];
    (series || []).forEach((sr, si) => {
      NBA.setSeed((st.seasonSeed ^ 0x1234567) + 977 * (si + 1));
      items.push({ k: 'hdr', text: sr.round + ' · vs ' + sr.opp });
      const n = sr.list.length, winsNeeded = sr.won ? sr.w : sr.w; // user wins = sr.w
      const wl = []; for (let i = 0; i < sr.w - (sr.won ? 1 : 0); i++) wl.push(1); for (let i = 0; i < sr.l - (sr.won ? 0 : 1); i++) wl.push(0);
      for (let i = wl.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [wl[i], wl[j]] = [wl[j], wl[i]]; }
      wl.push(sr.won ? 1 : 0);
      let dd = 0;
      sr.list.forEach((g, i) => {
        const b = mk(g, rec.playoff ? rec.playoff.fgp : line.fgp, rec.playoff ? rec.playoff.tpp : line.tpp, line.ftp, rec.playoff ? rec.playoff.ts : line.ts);
        const w = wl[i] != null ? wl[i] : sr.won ? 1 : 0; const sc = score(!!w, b.pt + 38);
        let w1 = 0, l1 = 0; for (let q = 0; q <= i; q++) { if (wl[q]) w1++; else l1++; }
        const oNick = sr.opp.split(' ').slice(-1)[0], home = [1, 1, 0, 0, 1, 0, 1][i] ? 1 : 0;
        items.push(Object.assign({ k: 'g', po: 1, n: i + 1, d: dateStr(L.year + 1, 3, 19 + Math.round(poGames.length * 2.2)), o: oNick, oc: sr.opp.split(' ').slice(0, -1).join(' '), h: home, w, ot: sc.ot, f: sc.f, a: sc.a, ar: NBA.data.ARENAS[home ? t.nick : (sr.opp.endsWith('Trail Blazers') ? 'Trail Blazers' : oNick)] || '', pm: Math.round((sc.f - sc.a) * (b.m / 48) * 1.1 + randn() * 4), rnd: sr.round, ser: (w1 === l1 ? 'Series tied ' : w1 > l1 ? 'Up ' : 'Down ') + Math.max(w1, l1) + '-' + Math.min(w1, l1) }, b));
        poGames.push([items[items.length - 1], g]);
      });
    });
    if (poGames.length) {
      fitShooting(poGames.map((x) => x[0]), poLine && poLine.fga != null ? poLine : { fgp: rec.playoff ? rec.playoff.fgp : line.fgp, tpp: rec.playoff ? rec.playoff.tpp : line.tpp, ftp: line.ftp }, mulberry(shotSeed(st, 6000)));
      poGames.forEach(([it, g], i) => { it.r = NBA.gameRating(g, it); it.sh = shotsFor(it, st.player, shotSeed(st, 1000 + i)); });
    }
    const rg = items.filter((x) => x.k === 'g' && !x.po && !x.dnp), ratings = rg.map((x) => x.r);
    const pr = items.filter((x) => x.k === 'g' && x.po && !x.dnp).map((x) => x.r); rec.poRating = pr.length ? Math.round(pr.reduce((a, b) => a + b, 0) / pr.length * 100) / 100 : null;
    rec.avgRating = ratings.length ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length * 100) / 100 : null;
    return items;
  }

  let SNAP = null;   // JSON of the career state at tip-off, so a mid-season game-plan change can replay the season (same league results, new user games)
  function playSeason(st, opts) {
    opts = opts || {};
    const wasSeeded = NBA.rngGet().seeded;
    if (!opts.rerun) {
      st.seasonSeed = Math.floor(rand() * 2147483647);
      st.styleSeq = [[0, st.style || 'balanced']];
      st.shotScope = null;   // a new season's shot chart follows the playoffs once they start
      SNAP = JSON.stringify(st);
    }
    NBA.setSeed(st.seasonSeed);
    const L = st.league, p = st.player;
    // career state before this season: the UI shows it (plus games revealed so far) until the season is fully played out
    st.pre = { career: JSON.parse(JSON.stringify(st.career)), earnings: st.earnings, earnings26: st.earnings26 || 0, nPlayoff: st.playoffLines.length, rookie: p.yearsPro === 0 };
    const age = p.age;
    const fx = rollEvents(st, p);
    // rookie role: coaches bring some young players along off the bench whatever their talent (Kobe 15 mpg at 18, Giannis 25, Jokic 22, Harden 23 behind Westbrook and Durant);
    // real future stars' rookie minutes vary by 7-9 mpg, far more than rating alone gives. It is a cap on minutes (it only bites a rookie good enough to play more),
    // drawn on its own stream so nothing else in the season changes; the second season's cap is 8 minutes higher
    if (p.yearsPro === 0) { const sv = NBA.rngGet(); NBA.setSeed(st.seasonSeed ^ 0x3c6ef372); p.benchCap = rand() < NBA.tuning.benchRole * (age <= 19 ? 1.25 : age >= 22 ? 0.6 : 1) ? 15 + 12 * rand() : 0; NBA.rngSet(sv); }
    if (p.yearsPro <= 1 && p.benchCap) { fx.minsCap = p.benchCap + 8 * p.yearsPro; fx.notes.push(p.yearsPro === 0 ? 'Coach is bringing you along slowly: a bench role behind the veterans for now.' : 'Still earning the coach\'s full trust: more minutes, but not a full starter\'s load yet.'); }
    const avail = rollAvail(p, { extraMiss: fx.extraMiss });
    if (avail.major) applyMajorInjury(p);
    p.rookie = p.yearsPro === 0;
    L.teams[st.teamId].depth += fx.depth;
    let userLine = null;
    const user = {
      p, teamId: st.teamId, avail,
      getLine: (ctx) => { const sv = NBA.rngGet(); NBA.setSeed(st.seasonSeed ^ 0x5bd1e995); userLine = userSeasonLine(st, ctx, avail, fx); NBA.rngSet(sv); return userLine; },
    };
    const res = NBA.simSeason(L, user);
    NBA.setSeed(st.seasonSeed ^ 0x2545f491);   // everything below is about the user only: its own random stream, so the league results above never change on a replay
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
    let pline = null, perSeries = [], fmvp = false, heater = false, legend = false, pform = null, resultText = 'Missed the playoffs';
    if (po.userMade && avail.gp < 15) {
      resultText = (po.champion.id === st.teamId ? 'NBA Champions 🏆' : 'Team made the playoffs') + ' (you were injured)';
    } else if (po.userMade) {
      const series = po.userSeries;
      const lost = series.find((s) => !s.won);
      const last = series[series.length - 1];
      resultText = po.champion.id === st.teamId ? 'NBA Champions 🏆' : lost ? 'Lost in the ' + lost.round + ' to ' + lost.opp + ' (' + lost.w + '-' + lost.l + ')' : '';
      if (!series.length) resultText = 'Lost in the play-in';
      if (series.length) {
        const out = playoffLine(st, user.ctx, series, userLine, 'normal');
        pline = out.line; perSeries = out.perSeries; heater = out.heater; legend = out.legend; pform = out.form;
      }
    } else if (po.userOut === null) resultText = 'Missed the playoffs';
    if (po.champion.id === st.teamId) {
      st.career.titles++; cnt('Championships'); awardsHere.push('NBA Champion');
      const fin = perSeries.find((x) => x.round === 'NBA Finals');
      const who = NBA.finalsMVP(L, st.teamId, fin ? { pts: fin.pts, reb: fin.reb, ast: fin.ast, stl: userLine.stl, blk: userLine.blk } : null);
      if (who === 'user') { cnt('Finals MVP'); awardsHere.push('Finals MVP'); fmvp = true; }
    }

    const l = userLine;
    const rec = {
      label: res.label, year: L.year, age, team: t.name, teamId: t.id, wins: t.wins, losses: t.losses,
      gp: l.gp, mins: l.mins, pts: l.pts, reb: l.reb, ast: l.ast, stl: l.stl, blk: l.blk, tov: l.tov,
      fgp: l.fgp, tpp: l.tpp, ftp: l.ftp, ts: l.ts, fga: l.fga, tpa: l.tpa, fta: l.fta, td: l.td, dd: l.dd, g40: l.g40, g50: l.g50, high: l.high, ovr: Math.round(l.ovr), usg: l.usg,
      avgTD: l.avgTD, totPts: l.totPts, totReb: l.totReb, totAst: l.totAst,
      awards: awardsHere, playoffText: resultText, playoff: pline ? { gp: pline.gp, pts: pline.pts, reb: pline.reb, ast: pline.ast, stl: pline.stl, blk: pline.blk, mins: pline.mins, fgp: pline.fgp, tpp: pline.tpp, ts: pline.ts, td: pline.td, high: pline.high, form: pform } : null,
      perSeries, heater, legend, ranks: res.ranks, events: fx.notes, injury: avail.major ? 'Suffered a ' + avail.major + ' and missed ' + avail.miss + ' games.' : avail.notable ? 'Missed ' + avail.miss + ' games with a ' + avail.notable + '.' : avail.miss >= 12 ? 'Missed ' + avail.miss + ' games with injuries.' : null,
      salary: st.contract.salary, mvp: A.mvp ? A.mvp.name + ' (' + r1(A.mvp.pts) + '/' + r1(A.mvp.reb) + '/' + r1(A.mvp.ast) + ')' : '', champion: po.champion.name, league: res.league,
      rookie: p.rookie, leaders: res.leaders, perfRank: 1 + res.entries.filter((e) => !e.isUser && e.l.gp >= 58 && e.l.perf > userLine.perf).length,
    };
    const gl = l.gameList; delete l.gameList;
    if (l.gpCut && !rec.injury) rec.injury = 'Suffered a season-ending injury and missed the rest of the year.';
    st.leagueSnap = { year: L.year, label: res.label, standings: res.standings, leaders: res.leaders, leadersO: res.leadersOthers, race: A.race, raceO: A.raceOthers };
    st.matchLog = buildMatchLog(st, rec, l, gl, perSeries, t, rec.injury, pline); st.matchIdx = 0;
    shootingFromLog(rec, st.matchLog);
    if (rec.playoff) rec.playoff.rating = rec.poRating;
    rec.bests = seasonBests(st.matchLog, rec.label, rec.age);
    if (NBA.onSeasonLog) NBA.onSeasonLog(st, rec);
    rec.perSeries = perSeries.map((x) => { const y = Object.assign({}, x); delete y.list; delete y.w; delete y.l; delete y.won; return y; });
    st.proSeasons.push(rec);
    st.earnings += st.contract.salary;
    st.earnings26 = (st.earnings26 || 0) + (st.contract.salary / capFor(L.year)) * capFor(2026); // in 2026 cap dollars
    st.capYears = (st.capYears || 0) + st.contract.salary / capFor(L.year);
    rec.capM = capFor(L.year);
    st.career.td += l.td;
    if (rec.avgTD) { st.career.tdSeasons++; if (l.pts >= 30) st.career.td30Seasons++; }
    if (pline) st.playoffLines.push(Object.assign({ label: res.label, age, team: t.name }, rec.playoff, { heater, text: resultText }));
    p.yearsPro++;
    st.contract.left--;
    st.bonusPoints = fx.bonusPts;
    st.stage = 'season_play';
    if (!wasSeeded) NBA.useRandom();
    return rec;
  }

  // ---------------------------------------------------------------- changing the game plan mid-season
  function slotNow(st) {
    let reg = 0, po = 0; const items = st.matchLog || [], idx = st.matchIdx || 0;
    for (let i = 0; i < idx; i++) { const it = items[i]; if (it.k === 'g') { if (it.po) po++; else reg++; } }
    return po > 0 ? 82 + po : reg;
  }
  function spliceLog(st, oldLog, newLog, idx) {
    if (!idx) return newLog;
    const a = oldLog[idx - 1], b = newLog[idx - 1];
    if (!a || !b || a.k !== b.k || a.o !== b.o || a.n !== b.n || !!a.po !== !!b.po) return newLog;
    const out = oldLog.slice(0, idx).concat(newLog.slice(idx));
    const rec = st.proSeasons[st.proSeasons.length - 1];
    const regIdx = []; out.forEach((x, i) => { if (x.k === 'g' && !x.po) regIdx.push(i); });
    const diff = rec.wins - regIdx.filter((i) => out[i].w).length;
    if (diff) {
      const fut = regIdx.filter((i) => i >= idx && !!out[i].w === (diff < 0));
      fut.sort((x, y) => (diff > 0 ? (out[y].r || 0) - (out[x].r || 0) : (out[x].r || 9) - (out[y].r || 9)));
      fut.slice(0, Math.abs(diff)).forEach((i) => { const g = out[i], sc = gameScore(!g.w, g.pt ? g.pt + 38 : 0); g.w = g.w ? 0 : 1; g.f = sc.f; g.a = sc.a; g.ot = sc.ot; if (g.pm != null) g.pm = Math.round((g.f - g.a) * ((g.m || 0) / 48) * 1.1); });
    }
    return out;
  }
  // a season's shooting line is the sum of its box scores (regular season and playoffs): the career page, the dashboard and the shot chart show the same numbers
  function shootingFromLog(rec, items) {
    const tot = (gs) => { const t = { fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, pt: 0 }; gs.forEach((g) => { for (const k in t) t[k] += g[k] || 0; }); return t; };
    const pct = (t) => ({ fgp: t.fga ? t.fgm / t.fga : 0, tpp: t.tpa ? t.tpm / t.tpa : 0, ftp: t.fta ? t.ftm / t.fta : 0, ts: t.fga + t.fta ? t.pt / (2 * (t.fga + 0.44 * t.fta)) : 0 });
    const reg = items.filter((x) => x.k === 'g' && !x.po && !x.dnp), po = items.filter((x) => x.k === 'g' && x.po && !x.dnp);
    if (reg.length) { const t = tot(reg); Object.assign(rec, pct(t), { fga: t.fga / reg.length, tpa: t.tpa / reg.length, fta: t.fta / reg.length }); }
    if (rec.playoff && po.length) { const q = pct(tot(po)); Object.assign(rec.playoff, { fgp: q.fgp, tpp: q.tpp, ts: q.ts }); }
  }
  // make the season record agree with the games the user actually saw
  function recomputeFromLog(st) {
    const rec = st.proSeasons[st.proSeasons.length - 1], items = st.matchLog;
    const sumOf = (a, k) => a.reduce((x, g) => x + (g[k] || 0), 0), mean = (a, k) => (a.length ? sumOf(a, k) / a.length : 0);
    const reg = items.filter((x) => x.k === 'g' && !x.po && !x.dnp), n = reg.length, oldTd = rec.td, oldAvg = rec.avgTD;
    if (n) {
      Object.assign(rec, { gp: n, mins: mean(reg, 'm'), pts: mean(reg, 'pt'), reb: mean(reg, 'rb'), ast: mean(reg, 'as'), stl: mean(reg, 'st'), blk: mean(reg, 'bk'), tov: mean(reg, 'to'),
        td: reg.filter((g) => g.tg.includes('Triple-double')).length, dd: reg.filter((g) => g.tg.includes('Double-double') || g.tg.includes('Triple-double')).length,
        g40: reg.filter((g) => g.pt >= 40).length, g50: reg.filter((g) => g.pt >= 50).length, high: Math.max.apply(null, reg.map((g) => g.pt)), totPts: sumOf(reg, 'pt'), totReb: sumOf(reg, 'rb'), totAst: sumOf(reg, 'as'), avgRating: Math.round(mean(reg, 'r') * 100) / 100 });
      rec.avgTD = n >= 30 && rec.pts >= 10 && rec.reb >= 10 && rec.ast >= 10;
    }
    shootingFromLog(rec, items);
    st.career.td += rec.td - oldTd;
    if (!!rec.avgTD !== !!oldAvg) { const d = rec.avgTD ? 1 : -1; st.career.tdSeasons += d; if (rec.pts >= 30) st.career.td30Seasons += d; }
    rec.bests = seasonBests(items, rec.label, rec.age);
    // league-facing results that depend only on the user's final numbers: scoring title, league ranks and the leaders table
    const lo = st.leagueSnap && st.leagueSnap.leadersO;
    if (lo && n) {
      const had = rec.awards.findIndex((a) => /^Scoring Champion/.test(a)), top = lo.pts && lo.pts[0] ? lo.pts[0].v : 0, should = rec.gp >= 58 && rec.pts > top, txt = 'Scoring Champion (' + (Math.round(rec.pts * 10) / 10).toFixed(1) + ')';
      if (should && had >= 0) rec.awards[had] = txt;
      else if (should) { rec.awards.push(txt); st.career.awards['Scoring titles'] = (st.career.awards['Scoring titles'] || 0) + 1; }
      else if (had >= 0) { rec.awards.splice(had, 1); st.career.awards['Scoring titles'] = (st.career.awards['Scoring titles'] || 1) - 1; if (!st.career.awards['Scoring titles']) delete st.career.awards['Scoring titles']; }
      if (rec.ranks) ['pts', 'reb', 'ast', 'stl', 'blk'].forEach((k) => { const r = 1 + (lo[k] || []).filter((o) => o.v > rec[k]).length; if (r <= 7) rec.ranks[k] = r; else if (rec.ranks[k] <= 7) rec.ranks[k] = 8; });
      const me = { name: st.player.name, team: st.league.teams[st.teamId].nick, isUser: true };
      ['pts', 'reb', 'ast', 'stl', 'blk'].forEach((k) => { if (st.leagueSnap.leaders && lo[k]) st.leagueSnap.leaders[k] = lo[k].map((o) => ({ name: o.name, team: o.team, v: o.v })).concat([Object.assign({ v: rec[k] }, me)]).sort((a, b) => b.v - a.v).slice(0, 5); });
    }
    const po = items.filter((x) => x.k === 'g' && x.po && !x.dnp);
    if (rec.playoff && po.length) {
      Object.assign(rec.playoff, { gp: po.length, mins: mean(po, 'm'), pts: mean(po, 'pt'), reb: mean(po, 'rb'), ast: mean(po, 'as'), stl: mean(po, 'st'), blk: mean(po, 'bk'),
        td: po.filter((g) => g.tg.includes('Triple-double')).length, high: Math.max.apply(null, po.map((g) => g.pt)), rating: Math.round(mean(po, 'r') * 100) / 100 });
      rec.poRating = rec.playoff.rating;
      (rec.perSeries || []).forEach((ps) => { const gs = po.filter((g) => g.rnd === ps.round); if (gs.length) { ps.pts = mean(gs, 'pt'); ps.reb = mean(gs, 'rb'); ps.ast = mean(gs, 'as'); } });
      if (st.playoffLines.length > st.pre.nPlayoff) Object.assign(st.playoffLines[st.playoffLines.length - 1], rec.playoff);
    }
  }
  function setStyle(st, style) {
    if (st.stage !== 'season_play' || !st.matchLog) { st.style = style; return { ok: true }; }
    if (!SNAP) return { ok: false, why: 'This save was made before game plans could change mid-season. It will work from the next season.' };
    const slot = slotNow(st), prev = (st.styleSeq || [[0, st.style || 'balanced']]);
    if (styleAt(prev, slot) === style) return { ok: true, same: true };
    const seq = prev.filter((x) => x[0] < slot); seq.push([slot, style]);
    const keep = { idx: st.matchIdx || 0, shotTab: st.shotTab, shotScope: st.shotScope, log: st.matchLog, view: st.view };
    const snapObj = JSON.parse(SNAP);
    Object.keys(st).forEach((k) => delete st[k]); Object.assign(st, snapObj);
    st.style = style; st.styleSeq = seq;
    playSeason(st, { rerun: true });
    st.matchLog = spliceLog(st, keep.log, st.matchLog, keep.idx); st.matchIdx = keep.idx; st.shotTab = keep.shotTab; st.shotScope = keep.shotScope;
    recomputeFromLog(st);
    return { ok: true };
  }


  // ---------------------------------------------------------------- contracts and decisions
  function marketPct(st) {
    const p = st.player;
    let v = ovr(p) - (p.age >= 33 ? 1.2 * (p.age - 32) : 0);
    const raw = marketCurve(v);
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
  // A trade is a swap, not a wish: your club must be willing to move you and must get a comparable player back,
  // and the other club must be willing to give that player up.
  function tradeDeal(st, t) {
    const L = st.league, p = st.player, mine = L.teams[st.teamId], o = ovr(p);
    const base = { teamId: t.id, name: t.name, wins: t.wins, label: teamLabel(t, t.wins), role: role(st, t) };
    const mates = NBA.rosterOf(L, mine), myRank = mates.filter((q) => ovr(q) > o).length;   // 0 = best player on his team
    const franchise = myRank === 0 && o >= 74, system = myRank <= 2 && !franchise;       // starters who hold the system together
    const rb = NBA.rosterOf(L, t), top = rb[0] ? ovr(rb[0]) : 0;
    // the player coming back: close in value; their franchise player is only available if you are clearly better
    const lo = franchise ? o - 5 : system ? o - 7 : o - 12, hi = franchise ? o + 4 : o + 3;
    const cand = rb.filter((q, i) => ovr(q) >= lo && ovr(q) <= hi && (i > 0 || o >= top + 2));
    if (!cand.length) return Object.assign(base, { ok: false, reason: 'The ' + t.nick + ' have nobody close to your value to send back.' });
    const partner = cand.sort((a, b) => ovr(b) - ovr(a))[0];
    base.partner = { id: partner.id, name: partner.name, pos: partner.pos, age: partner.age, ovr: Math.round(ovr(partner)) };
    // your own club
    let accept = 1, why = '';
    if (franchise) { accept = mine.wins < 34 ? 0.75 : mine.wins < 43 ? 0.3 : 0.06; why = 'The ' + mine.nick + ' will not move their franchise player' + (mine.wins >= 43 ? ' while they are winning.' : ' for that offer.'); }
    else if (system) { accept = ovr(partner) >= o - 3 ? 0.85 : 0.3; why = 'The ' + mine.nick + ' will not move a core starter without a real replacement in return.'; }
    else if (myRank >= 5) accept = 0.95;
    if (rand() > accept) return Object.assign(base, { ok: false, reason: why || 'The ' + mine.nick + ' turned the deal down.' });
    return Object.assign(base, { ok: true });
  }
  function decisionOptions(st) {
    const L = st.league, p = st.player, c = st.contract;
    const cap = capNow(L);
    const mk = marketPct(st);
    const baseSal = mk.pct * cap;
    const out = { age: p.age, ovr: Math.round(ovr(p)), expiring: c.left <= 0, contract: c, cap: r1(cap), marketSalary: r1(baseSal), team: L.teams[st.teamId].name };
    // whether anyone still wants you: players who love the game keep finding minimum deals (Haslem, Vince), others walk away while they still could play
    const st0 = (p.tr && p.tr.stay) || 0, sty = p.age >= 31 ? NBA.tuning.stayMarket * (st0 > 0 ? st0 : 0.5 * st0) : 0, v = mk.v + sty;   // only veterans: young players get offers on talent
    const forceRetire = p.age >= 42 || (p.age >= 35 && v < 57) || (p.age >= 25 && v < 55) || (p.age >= 31 && v < 60) || (c.left <= 0 && p.age >= 26 && v < (p.age <= 27 ? 62 : 62 + (p.age - 27) * NBA.tuning.marketSlope));
    out.mustRetire = forceRetire;
    if (out.expiring) {
      const own = L.teams[st.teamId];
      const maxYrsOwn = p.age >= 36 ? 1 : p.age >= 33 ? 2 : 5;
      out.resign = { teamId: own.id, name: own.name, salary: r1(Math.max(2.3 * capFor(L.year) / 154.6, baseSal)), maxYears: maxYrsOwn, role: role(st, own), label: teamLabel(own, own.wins) };
      let offers = [];
      const n = mk.v >= 76 ? 6 : mk.v >= 68 ? 4 : mk.v >= 60 ? 3 : 1;
      const teams = L.teams.filter((t) => t.id !== st.teamId).sort(() => rand() - 0.5).slice(0, n);
      teams.forEach((t) => {
        const sal = Math.max(2.3 * capFor(L.year) / 154.6, baseSal * (0.88 + rand() * 0.17) * (t.wins < 33 ? 1.04 : 1));
        offers.push({ teamId: t.id, name: t.name, salary: r1(sal), maxYears: p.age >= 36 ? 1 : p.age >= 33 ? 2 : 4, role: role(st, t), label: teamLabel(t, t.wins), wins: t.wins });
      });
      out.offers = offers.sort((a, b) => b.salary - a.salary);
    } else {
      const dest = L.teams.filter((t) => t.id !== st.teamId).sort(() => rand() - 0.5).slice(0, 4);
      out.tradeOptions = dest.map((t) => tradeDeal(st, t));
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
      const t = L.teams[arg.teamId], opt = (st.decision && st.decision.tradeOptions || []).find((x) => x.teamId === t.id);
      if (!opt || !opt.ok) throw new Error('trade not available');
      const old = L.teams[st.teamId], partner = L.players[opt.partner.id];
      if (partner) { t.core = t.core.filter((id) => id !== partner.id); t.bench = (t.bench || []).filter((id) => id !== partner.id); old.bench = (old.bench || []).concat([partner.id]); partner.teamId = old.id; }   // the user is not in a roster list: only the partner moves
      st.teamId = t.id; p.teamId = t.id;
      (st.trades = st.trades || []).push({ year: L.year, label: NBA.seasonLabel(L.year), from: old.name, to: t.name, ovr: Math.round(ovr(p)), age: p.age, partner: opt.partner.name + ' (' + opt.partner.ovr + ' ovr)', requested: true });
      note('Traded to ' + t.name + ' for ' + opt.partner.name);
      st.stage = 'training'; st.afterTraining = 'pro';
      return { text: 'Trade done. You are now a ' + t.nick + '; the ' + old.nick + ' got ' + opt.partner.name + '.' };
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
      // the autopilot stays in school like real recruits of the same star rating did (2009-24 draft ages); a projected lottery pick may leave early
      const want = st.autoYears || (st.autoYears = opt.collegeYears || NBA.recruitYears(st.stars));
      if (rec.mustDeclare || rec.year >= want || (slot <= 5 && rec.year >= Math.min(want, 2))) break;
      stayInCollege(st);
      train(st, autoAlloc(st.player, trainingInfo(st).points));
    }
    declare(st); runCombine(st, true); enterDraft(st);
    startPro(st);
    train(st, autoAlloc(st.player, trainingInfo(st).points));
    for (let guard = 0; guard < 30; guard++) {
      const rec = playSeason(st);
      const d = decisionOptions(st);
      const p = st.player;
      if (opt.onDecision) opt.onDecision(st, d);
      const retireNow = d.mustRetire || NBA.retireP(p);
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

  Object.assign(NBA, { Game: { shotsFor, shotSeed, newCareer, scoutReport, collegeOptions, chooseCollege, playCollege, stayInCollege, declare, runCombine, enterDraft, startPro, trainingInfo, autoAlloc, train, playSeason, seasonBests, setStyle, getSnap: () => SNAP, setSnap: (x) => { SNAP = x; }, decisionOptions, decide, rollLeague, retire, hofScore, capNow, auto, STAR_ODDS } });
  if (typeof module !== 'undefined') module.exports = NBA;
})(typeof window !== 'undefined' ? window : globalThis);
