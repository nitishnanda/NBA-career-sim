(function (g) {
  'use strict';
  const NBA = g.NBA;
  const D = NBA.data;
  const { ATTRS, POSITIONS, ARCHETYPES } = D;

  // ---------------------------------------------------------------- RNG
  let _a = 0, _seeded = false;
  function setSeed(s) { _a = s >>> 0; _seeded = true; }
  function useRandom() { _seeded = false; }
  const rngGet = () => ({ a: _a, seeded: _seeded });
  const rngSet = (x) => { _a = x.a; _seeded = x.seeded; };
  function _next() {
    _a |= 0; _a = (_a + 0x6d2b79f5) | 0;
    let t = Math.imul(_a ^ (_a >>> 15), 1 | _a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const rand = () => (_seeded ? _next() : Math.random());
  function randn() {
    let u = 0, v = 0;
    while (!u) u = rand();
    while (!v) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const rint = (a, b) => a + Math.floor(rand() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const r1 = (x) => Math.round(x * 10) / 10;
  function weighted(obj) {
    const keys = Object.keys(obj);
    let tot = 0;
    keys.forEach((k) => (tot += obj[k]));
    let r = rand() * tot;
    for (const k of keys) { r -= obj[k]; if (r <= 0) return k; }
    return keys[keys.length - 1];
  }
  const sum = (a) => a.reduce((s, x) => s + x, 0);

  // ---------------------------------------------------------------- tuning knobs
  const T = {
    pace: 99,            // possessions per game, 2025-ish
    usgBase: 0.16785, usgPerSS: 0.00584, usgConvex: 0.00003,
    tsBase: 0.36421, tsPerSkill: 0.00265, tsEra: 0.012, usgTax: 0.16733,
    minsBase: 11.78235, minsPerOvr: 0.91888, minsCap: 35.74855,
    declineScale: 1.5,
    ceilA: 55, ceilLambda: 11.5, ceilK: 1.3,
    winsPerPt: 0.95, formSd: 0.07, winsCoreAvg: 48, ovrStretch: 1.3,
    growthScale: 0.85, declineLate: 1.2, genGapA: 6, genGapB: 7, injScale: 0.6, retireScale: 1.2,   // career-shape knobs fitted to the real cohorts (scripts/fit-careers.js)
    astKnee: 7, astK: 0.88991, rebKnee: 7.23037, rebK: 0.76112,   // how fast per-36 assists / rebounds flatten for the very best passers and rebounders
    volSpread: 0.43399, frUsg: 0.05, frMins: 0.9, genCeilDrop: 3.5,
    starTs: 0.04142, starReb: 0.06173, starAst: 0.32616,   // extra production for the very best (fitted to the real top of the league)
  };
  NBA.tuning = T;

  // ---------------------------------------------------------------- ratings
  function weightsFor(arch, sec) {
    const w = ARCHETYPES[arch].weights;
    if (!sec) return w;
    const s = ARCHETYPES[sec].weights, out = {};
    ATTRS.forEach((a) => (out[a] = 0.88 * w[a] + 0.12 * s[a]));
    return out;
  }
  const OVR_OFFSET = { scorer: 0.8, shooter: -2, dominator: 2, generational: 2.9, twoway: 0.1, defender: -2.4 };
  function ovrOf(p) {
    const w = weightsFor(p.arch, p.sec);
    let s = 0, ws = 0;
    ATTRS.forEach((a) => { s += w[a] * p.attrs[a]; ws += w[a]; });
    const avg = s / ws;
    const raw = avg < 52 ? avg : 52 + T.ovrStretch * (avg - 52);
    return Math.min(99, raw + (OVR_OFFSET[p.arch] || 0));
  }
  const ovr = (p) => ovrOf(p);

  function fitOvr(attrs, p, goal) {
    const w = weightsFor(p.arch, p.sec);
    for (let i = 0; i < 40; i++) {
      const cur = ovrOf({ attrs, arch: p.arch, sec: p.sec });
      const d = goal - cur;
      if (Math.abs(d) < 0.2) break;
      let norm = 0;
      const m = {};
      ATTRS.forEach((a) => { m[a] = 0.5 + w[a] * 12; norm += w[a] * m[a]; });
      ATTRS.forEach((a) => {
        let step = (d * m[a]) / norm;
        if (step > 0 && attrs[a] > 92) step *= 0.3;
        attrs[a] = clamp(attrs[a] + step, 12, 99);
      });
    }
  }

  function regionOf(state) {
    for (const r in D.REGIONS) if (D.REGIONS[r].states.includes(state)) return r;
    return 'Midwest';
  }

  function buildTarget(p, ceiling) {
    const P = POSITIONS[p.pos], A = ARCHETYPES[p.arch], S = p.sec ? ARCHETYPES[p.sec] : null;
    const tilt = p.home ? D.REGIONS[regionOf(p.home)].tilt : {};
    const t = {};
    ATTRS.forEach((a) => {
      t[a] = clamp(50 + P[a] + A.boost[a] + (S ? 0.4 * S.boost[a] : 0) + (tilt[a] || 0) + randn() * 4.5, 12, 99);
    });
    fitOvr(t, p, ceiling);
    return t;
  }

  function rollCeiling(stars, arch) {
    const nudge = { 1: -2, 2: 1, 3: 4.5, 4: 10, 5: 16 }[stars] || 0;
    const base = T.ceilA + T.ceilLambda * Math.pow(-Math.log(1 - rand()), 1 / T.ceilK);
    const bonus = arch ? ARCHETYPES[arch].ceilingBonus : 0;
    return clamp(base + nudge + bonus, 55, 99);
  }

  // (no scripted career plans: triple-double years, 32-36 ppg years, legend playoff runs and forced injury seasons now come from the fitted distributions alone)
  function rollTdPlan(p) { p.injYears = []; }

  function nameGen() { return pick(D.FIRST) + ' ' + pick(D.LAST); }

  function makePlayer(o) {
    const p = {
      id: o.id, name: o.name || nameGen(), pos: o.pos, arch: o.arch, sec: o.sec || null,
      home: o.home || pick(Object.keys(D.STATE_ABBR)), age: o.age || 18,
      ceiling: o.ceiling, work: o.work != null ? o.work : clamp(0.5 + randn() * 0.22, 0, 1),
      prone: o.prone != null ? o.prone : clamp(1 + randn() * 0.3, 0.5, 1.8),
      stars: o.stars || 0, yearsPro: 0, teamId: -1, injuries: [],
      vol: o.vol != null ? o.vol : clamp(randn() * 0.08, -0.2, 0.2),
    };
    p.target = buildTarget(p, p.ceiling);
    const gap = o.gap != null ? o.gap : 10 + rand() * 12;
    p.attrs = {};
    ATTRS.forEach((a) => {
      const k = a === 'ath' ? 0.55 : a === 'dur' ? 0.2 : 1;
      p.attrs[a] = clamp(p.target[a] - gap * k * (0.7 + rand() * 0.6), 10, 99);
    });
    rollTdPlan(p);
    return p;
  }

  function randomArch(ceiling) {
    if (ceiling >= 93 && rand() < 0.45) return 'generational';
    return weighted({ scorer: 24, twoway: 18, defender: 12, shooter: 18, dominator: 14, generational: 0.4 });
  }
  function randomPos(arch) {
    if (arch === 'defender') return weighted({ C: 60, PF: 30, SF: 6, SG: 2, PG: 2 });
    if (arch === 'shooter') return weighted({ SG: 40, SF: 22, PG: 28, PF: 8, C: 2 });
    if (arch === 'dominator') return weighted({ PG: 30, SG: 10, SF: 16, PF: 14, C: 30 });
    return weighted({ PG: 20, SG: 22, SF: 22, PF: 18, C: 18 });
  }

  // ---------------------------------------------------------------- progression
  function growthRate(age) { return T.growthScale * growthRate0(age); }
  function growthRate0(age) {
    if (age <= 19) return 0.3; if (age === 20) return 0.3; if (age === 21) return 0.28;
    if (age === 22) return 0.27; if (age === 23) return 0.25; if (age === 24) return 0.23;
    if (age === 25) return 0.2; if (age === 26) return 0.17; if (age === 27) return 0.13;
    return 0;
  }
  const ATH_DEC = { 28: 0.3, 29: 0.9, 30: 1.4, 31: 1.7, 32: 2.1, 33: 2.5, 34: 2.9, 35: 3.5 };
  const PHY_DEC = { 29: 0.2, 30: 0.5, 31: 0.8, 32: 1.1, 33: 1.5, 34: 1.9, 35: 2.5 };
  const SKL_DEC = { 31: 0.3, 32: 0.5, 33: 0.9, 34: 1.3, 35: 1.8 };
  function decAt(tbl, age, max) {
    if (age < +Object.keys(tbl)[0]) return 0;
    return tbl[Math.min(age, 35)] * (age > 35 ? 1 + (age - 35) * 0.1 : 1);
  }
  function declineFor(a, age, p) {
    const A = ARCHETYPES[p.arch];
    let m = A.declineMult * (p.sec ? 0.9 * A.declineMult + 0.1 * ARCHETYPES[p.sec].declineMult : 1) / (p.sec ? A.declineMult : 1);
    if (!p.sec) m = A.declineMult;
    const athRel = clamp((p.target.ath - 50) / 45, 0, 1.25);
    let base = 0;
    if (a === 'ath') base = decAt(ATH_DEC, age) * (0.7 + 0.5 * athRel);
    else if (a === 'reb' || a === 'perD' || a === 'rimP') base = decAt(PHY_DEC, age) * (0.8 + 0.4 * athRel);
    else if (a === 'dur') base = age >= 30 ? 0.7 + (age - 30) * 0.3 : 0;
    else if (a === 'ft' || a === 'iq') base = age >= 34 ? decAt(SKL_DEC, age) * 0.5 : 0;
    else if (a === 'three' || a === 'passing') base = decAt(SKL_DEC, age) * 0.7;
    else if (a === 'inside') base = decAt(SKL_DEC, age) * 1.1 + decAt(ATH_DEC, age) * 0.15;
    else base = decAt(SKL_DEC, age);
    return base * m * T.declineScale * (age >= 31 ? 0.78 : 1) * (age >= 33 ? T.declineLate : 1);
  }

  function progress(p) {
    const next = p.age + 1;
    const wk = 0.88 + 0.24 * p.work;
    const shock = randn() * (next <= 22 ? 1.9 : next <= 26 ? 1.1 : 0.7) * (next > 23 && ovrOf(p) >= 84 ? 0.5 : 1); // stars' ratings move steadily; the prime is not a coin flip
    const before = ovrOf(p);
    ATTRS.forEach((a) => {
      let cur = p.attrs[a];
      const rate = growthRate(next) * wk;
      if (rate > 0) cur += (p.target[a] - cur) * rate + randn() * (next <= 21 ? 1.6 : 0.9) + shock;
      else cur += shock * 0.35;
      cur -= declineFor(a, next, p) * (0.85 + rand() * 0.3);
      p.attrs[a] = clamp(cur, 8, 99);
    });
    // young players do not lose rating through noise alone; small dips only appear in the mid/late 20s
    const gain = ovrOf(p) - before;
    const floor = next <= 23 ? 0.3 : next <= 25 ? 0.1 : next <= 27 ? -0.3 : null;
    if (floor != null && gain < floor) {
      const add = (floor - gain) / T.ovrStretch;
      ATTRS.forEach((a) => (p.attrs[a] = clamp(p.attrs[a] + add, 8, 99)));
    }
    p.age = next;
  }

  const rookieFloor = (slot) => (!slot ? 9 : slot === 1 ? 27 : slot <= 3 ? 24 : slot <= 5 ? 22 : slot <= 10 ? 20 : slot <= 14 ? 19 : slot <= 30 ? 16 : 12);
  function trainPoints(p) {
    const a = p.age;
    return a <= 21 ? 9 : a <= 25 ? 7 : a <= 29 ? 5 : 4;
  }
  function applyTraining(p, alloc) {
    ATTRS.forEach((a) => {
      const pts = alloc[a] || 0;
      if (!pts) return;
      let eff = pts * (0.85 + 0.3 * p.work) * 0.7;
      if (p.attrs[a] > 92) eff *= 0.35; else if (p.attrs[a] > 85) eff *= 0.6;
      if (p.age >= 31) eff *= 0.8;
      p.attrs[a] = clamp(p.attrs[a] + eff, 8, 99);
      p.target[a] = clamp(p.target[a] + eff * 0.8, 8, 99);
    });
  }

  // ---------------------------------------------------------------- stat model
  function top3shots(a) {
    const s = [a.inside, a.mid, a.three].sort((x, y) => y - x);
    return s;
  }
  // real 25-ppg scorers keep ~90% of their peak scoring at 30, ~85% at 32, ~80% at 34 (Basketball-Reference)
  const AGE_USG = { 28: 1, 29: 0.96, 30: 0.91, 31: 0.9, 32: 0.89, 33: 0.9, 34: 0.92, 35: 0.93, 36: 0.93, 37: 0.93, 38: 0.93 };
  const ks0 = (o) => clamp((o - 78) / 14, 0, 1);
  function expLine(p, c) {
    c = c || {};
    const a = p.attrs, A = ARCHETYPES[p.arch], S = p.sec ? ARCHETYPES[p.sec] : null;
    const o = ovrOf(p);
    const sh = top3shots(a);
    const SS = 0.34 * sh[0] + 0.14 * sh[1] + 0.12 * a.ft + 0.12 * a.handling + 0.1 * a.iq + 0.18 * a.ath;
    let usg = T.usgBase + T.usgPerSS * (SS - 55) + T.usgConvex * Math.pow(Math.max(0, SS - 70), 2) + A.usg + (S ? 0.4 * S.usg : 0) - (c.coTax || 0);
    { const tw = (c.wins == null ? 41 : c.wins) - 41; usg *= 1 + ks0(o) * (tw < 0 ? 0.0055 * Math.min(22, -tw) : -0.0006 * Math.min(28, tw)); } // good players on good teams share the ball; stars on bad teams take over
    usg *= 1 + (p.vol || 0) * (1 + T.volSpread);   // some players just shoot more (or less) than their skill suggests: the usage/efficiency spread of real rosters
    usg *= 1 + T.frUsg * (c.fr || 0);   // franchise player: the offence runs through him
    usg = clamp(usg * (c.usgMult || 1) * (AGE_USG[Math.min(Math.max(p.age, 28), 38)] || 1), 0.12, 0.354 + 0.016 * ks0(o));
    let mins = clamp(T.minsBase + T.minsPerOvr * (o - 58), 8, T.minsCap);
    if (p.age >= 33) mins -= (p.age - 32) * 0.6;
    if (c.rookie && o < 84) mins *= 0.93;
    if (c.rookie) { usg *= 0.96; }
    // stars on bad teams carry the load (38-40 mpg, extra shots); stars on winners share it and get rested in blowouts
    const tg = (c.wins == null ? 41 : c.wins) - 41, ks = clamp((o - 78) / 14, 0, 1);
    mins += ks * clamp(-tg * 0.3, -1.8, 5.2);
    mins += T.frMins * (c.fr || 0);
    mins = clamp(mins * (c.minsMult || 1), 6, c.minsMax || (38 + 2.6 * ks * clamp(-tg / 12, 0, 1) + 0.8 * (c.fr || 0)));
    if (c.minsFixed) mins = c.minsFixed;
    else if (c.minsFloor) mins = Math.max(mins, c.minsFloor);

    const skillShoot = 0.5 * sh[0] + 0.2 * sh[1] + 0.2 * a.ft + 0.1 * a.iq;
    let ts = T.tsBase + T.tsPerSkill * skillShoot + T.tsEra - T.usgTax * (usg - 0.2) * 1.0 + A.ts + (S ? 0.4 * S.ts : 0);
    ts += 0.5 * Math.max(0, 0.2 - usg);
    ts += (c.tsAdj || 0) - (c.rookie ? 0.012 : 0);
    const top = clamp((o - 90) / 9, 0, 1);
    ts += T.starTs * top;
    ts = clamp(ts, 0.44, 0.7);

    const pace = c.pace || T.pace;
    const used = usg * (mins / 48) * pace;
    let pts = used * 1.82 * ts;
    const pm = 0.65 * a.passing + 0.35 * a.handling;
    const soft = (x, knee, k) => (x > knee ? knee + (x - knee) * k : x);
    const reb36 = soft(Math.max(1.6, 0.18 * a.reb - 3.8), T.rebKnee, T.rebK);
    const ast36 = soft(Math.max(1.0, 0.125 * (pm - 30) + 10 * (usg - 0.2)), T.astKnee, T.astK);
    const defx = 0.65 * a.perD + 0.35 * a.ath;
    const stl36 = Math.max(0.62, 0.031 * (defx - 33) + 0.08);
    const blk36 = soft(Math.max(0.15, 0.043 * (a.rimP - 28)), 1.25, 0.5);
    const tov36 = 0.55 + 8.2 * usg;
    const k = mins / 36;
    // a 30+ ppg usage load costs you the ball-handling and glass work: real 33+ ppg seasons come with ~6 ast / ~6 reb
    const hi = Math.max(0, pts - 27), astTrade = Math.max(0.52, 1 - 0.07 * hi), rebTrade = Math.max(0.66, 1 - 0.04 * hi);
    return {
      ovr: o, usg, ts, mins, pace,
      pts, reb: reb36 * k * (c.rebMult || 1) * (p.arch === 'generational' ? 0.97 : 1) * rebTrade * (1 + T.starReb * top), ast: ast36 * k * (c.astMult || 1) * (p.arch === 'generational' ? 0.88 : 1) * astTrade * (1 + T.starAst * top),
      stl: stl36 * k, blk: blk36 * k, tov: tov36 * k,
    };
  }

  // Convert a points figure into a full shooting line.
  function shootingLine(p, pts, ts, usg) {
    const a = p.attrs;
    if (pts < 0.05) return { fga: 0, fgm: 0, fgp: 0, tpa: 0, tpm: 0, tpp: 0, fta: 0, ftm: 0, ftp: 0, ts: 0 };
    const S = pts / (2 * ts);
    const ftRate = clamp(0.16 + 0.0016 * (a.inside - 50) + 0.0012 * (a.ath - 50) + 0.001 * (usg * 100 - 20), 0.08, 0.5);
    let fga = S / (1 + 0.44 * ftRate);
    const fta = fga * ftRate;
    const ftp = clamp(0.33 + 0.0062 * a.ft + randn() * 0.006, 0.45, 0.95);
    const ftm = fta * ftp;
    const tr = clamp(0.02 + 0.0085 * (a.three - 30), 0.02, 0.6);
    const tpa = fga * tr;
    const tpp = clamp(0.22 + 0.0024 * a.three + randn() * 0.006, 0.2, 0.47);
    const tpm = tpa * tpp;
    const fgm = (pts - ftm - tpm) / 2;
    let fgp = fgm / fga;
    if (fgp > 0.68) { fga = fgm / 0.68; fgp = 0.68; } else if (fgp < 0.37) { fga = fgm / 0.37; fgp = 0.37; }
    // 50/40/90 is a once-in-a-generation line (Nash x4 on ~4 threes a game; Bird, Dirk, Durant, Curry, Kyrie once each): high-volume shooters rarely get all three,
    // so when a line lands there, usually one of the three slips just under the mark
    let tpp2 = tpa > 0.3 ? tpm / tpa : 0, fgm2 = fgm, tpm2 = tpm, ftm2 = ftm, ftp2 = ftp;
    if (tpa >= 2 && fgp >= 0.5 && tpp2 >= 0.4 && ftp2 >= 0.9 && rand() > (tpa >= 6 ? 0.13 : tpa >= 3.5 ? 0.25 : 0.35)) {
      const miss = 0.002 + rand() * 0.013, m = [fgp - 0.5, tpp2 - 0.4, ftp2 - 0.9], w = m.indexOf(Math.min.apply(null, m));
      if (w === 0) { fga = fgm / (0.5 - miss); fgp = fgm / fga; }
      else if (w === 1) { tpp2 = 0.4 - miss; tpm2 = tpa * tpp2; fgm2 = (pts - ftm2 - tpm2) / 2; fgp = fgm2 / fga; }
      else { ftp2 = 0.9 - miss; ftm2 = fta * ftp2; fgm2 = (pts - ftm2 - tpm2) / 2; fgp = fgm2 / fga; }
    }
    const fta2 = fta, tsReal = pts / (2 * (fga + 0.44 * fta2));
    return { fga, fgm: fgm2, fgp, tpa, tpm: tpm2, tpp: tpp2, fta: fta2, ftm: ftm2, ftp: ftp2, ts: tsReal };
  }

  // ---------------------------------------------------------------- per-game box scores
  function genGame(m) {
    const gs = randn();
    const mm = clamp(1 + 0.085 * gs, 0.55, 1.28);
    const hot = rand() < 0.06 ? 1.28 : 0.9825;
    let pts = Math.max(0, Math.round(m.pts * mm * (1 + 0.29 * randn()) * hot));
    const eng = clamp(1 + 0.13 * randn(), 0.55, 1.4);
    const ctr = (mean, extra) => {
      const lam = mean * mm * eng;
      return Math.max(0, Math.round(lam + (Math.sqrt(lam) * 0.95 + 0.04 * lam) * randn() * (extra || 1)));
    };
    const reb = ctr(m.reb), ast = ctr(m.ast);
    const stl = Math.max(0, Math.round(m.stl * mm + Math.sqrt(m.stl * mm) * 0.9 * randn()));
    const blk = Math.max(0, Math.round(m.blk * mm + Math.sqrt(m.blk * mm) * 0.95 * randn()));
    const tov = Math.max(0, Math.round(m.tov * mm + Math.sqrt(m.tov * mm) * 0.8 * randn()));
    return { min: m.mins * mm, pts, reb, ast, stl, blk, tov };
  }
  // Sofascore-style match rating (3-10, everyone starts at 6.5). Coefficients fitted to eight reference box scores for the rating tiers (red 3-5 ... deep blue 9-10)
  // supplied by the user, plus season-average anchors (30/10/10 ≈ 8.3, Jokic-style 26/12/9 ≈ 8.7). Fewer minutes shrink the swing toward 6.5.
  function gameRating(g, b) {
    const poe = g.pts - 0.8 * (b.fga + 0.44 * b.fta);
    const swing = 0.111 * poe + 0.065 * g.reb + 0.089 * g.ast + 0.054 * g.stl + 0.171 * g.blk - 0.146 * g.tov - 0.484 * Math.min(1, g.min / 36);
    const r = 6.5 + 0.86 * swing * Math.min(1, g.min / 14);
    return Math.round(clamp(r, 3, 10) * 10) / 10;
  }
  function summarize(games) {
    const n = games.length || 1;
    const s = { gp: games.length, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, mins: 0, td: 0, dd: 0, g40: 0, g50: 0, high: 0 };
    games.forEach((g1) => {
      s.pts += g1.pts; s.reb += g1.reb; s.ast += g1.ast; s.stl += g1.stl; s.blk += g1.blk; s.tov += g1.tov; s.mins += g1.min;
      const cats = [g1.pts, g1.reb, g1.ast, g1.stl, g1.blk].filter((x) => x >= 10).length;
      if (cats >= 3) s.td++;
      if (cats >= 2) s.dd++;
      if (g1.pts >= 40) s.g40++;
      if (g1.pts >= 50) s.g50++;
      if (g1.pts > s.high) s.high = g1.pts;
    });
    s.totPts = s.pts; s.totReb = s.reb; s.totAst = s.ast;
    ['pts', 'reb', 'ast', 'stl', 'blk', 'tov', 'mins'].forEach((k) => (s[k] = s[k] / n));
    return s;
  }

  Object.assign(NBA, {
    rand, randn, clamp, rint, pick, r1, weighted, sum, setSeed, useRandom, rngGet, rngSet,
    ovr, ovrOf, makePlayer, buildTarget, rollCeiling, rollTdPlan, randomArch, randomPos, nameGen, regionOf,
    progress, applyTraining, trainPoints, rookieFloor, expLine, shootingLine, genGame, summarize, gameRating,
  });
  if (typeof module !== 'undefined') module.exports = NBA;
})(typeof window !== 'undefined' ? window : globalThis);
