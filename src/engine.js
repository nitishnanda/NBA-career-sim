(function (g) {
  'use strict';
  const NBA = g.NBA;
  const D = NBA.data;
  const { ATTRS, POSITIONS, ARCHETYPES } = D;

  // ---------------------------------------------------------------- RNG
  let _rng = Math.random;
  function setSeed(s) {
    let a = s >>> 0;
    _rng = function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = () => _rng();
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
    usgBase: 0.195, usgPerSS: 0.0045, usgConvex: 0.00012,
    tsBase: 0.385, tsPerSkill: 0.0025, tsEra: 0.012, usgTax: 0.22,
    minsBase: 12, minsPerOvr: 0.95, minsCap: 36.5,
    declineScale: 1.6,
    ceilA: 55, ceilLambda: 13.1, ceilK: 1.51,
    winsPerPt: 0.62, winsCoreAvg: 48, ovrStretch: 1.3,
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
  function ovrOf(p) {
    const w = weightsFor(p.arch, p.sec);
    let s = 0, ws = 0;
    ATTRS.forEach((a) => { s += w[a] * p.attrs[a]; ws += w[a]; });
    const avg = s / ws;
    return avg < 52 ? avg : Math.min(99, 52 + T.ovrStretch * (avg - 52));
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

  function rollTdPlan(p) {
    const tbl = (arch, sec) => {
      if (arch === 'dominator') return { 0: 5, 1: 28, 2: 27, 3: 20, 4: 12, 5: 8 };
      if (sec === 'dominator') return { 0: 60, 1: 28, 2: 12 };
      if (arch === 'generational') return { 0: 78, 1: 18, 2: 4 };
      return { 0: 100 };
    };
    p.tdPlan = +weighted(tbl(p.arch, p.sec));
    p.td30Plan = p.tdPlan > 0 ? Math.min(p.tdPlan, rand() < 0.45 ? 2 : 1) : 0;
    p.tdUsed = 0; p.td30Used = 0;
    p.heaterPlan = (p.arch === 'dominator' || p.arch === 'generational' || p.sec === 'dominator') ? (rand() < 0.3 ? 0 : rand() < 0.55 ? 1 : 2) : (rand() < 0.65 ? 0 : 1);
    p.heatersUsed = 0;
    p.legendPlan = +weighted(p.arch === 'dominator' ? { 0: 25, 1: 45, 2: 30 } : p.sec === 'dominator' ? { 0: 70, 1: 25, 2: 5 } : p.arch === 'generational' ? { 0: 85, 1: 15 } : { 0: 100 });
    p.legendUsed = 0;
    p.hist35 = false;
  }

  function nameGen() { return pick(D.FIRST) + ' ' + pick(D.LAST); }

  function makePlayer(o) {
    const p = {
      id: o.id, name: o.name || nameGen(), pos: o.pos, arch: o.arch, sec: o.sec || null,
      home: o.home || pick(Object.keys(D.STATE_ABBR)), age: o.age || 18,
      ceiling: o.ceiling, work: o.work != null ? o.work : clamp(0.5 + randn() * 0.22, 0, 1),
      prone: o.prone != null ? o.prone : clamp(1 + randn() * 0.3, 0.5, 1.8),
      stars: o.stars || 0, yearsPro: 0, teamId: -1, injuries: [],
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
    if (ceiling >= 90 && rand() < 0.5) return 'generational';
    return weighted({ scorer: 22, twoway: 16, defender: 12, shooter: 17, dominator: 13, generational: 4 });
  }
  function randomPos(arch) {
    if (arch === 'defender') return weighted({ C: 60, PF: 30, SF: 6, SG: 2, PG: 2 });
    if (arch === 'shooter') return weighted({ SG: 40, SF: 22, PG: 28, PF: 8, C: 2 });
    if (arch === 'dominator') return weighted({ PG: 30, SG: 10, SF: 16, PF: 14, C: 30 });
    return weighted({ PG: 20, SG: 22, SF: 22, PF: 18, C: 18 });
  }

  // ---------------------------------------------------------------- progression
  function growthRate(age) {
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
    return base * m * T.declineScale;
  }

  function progress(p) {
    const next = p.age + 1;
    const wk = 0.88 + 0.24 * p.work;
    const shock = randn() * (next <= 22 ? 1.9 : next <= 26 ? 1.1 : 0.7);
    ATTRS.forEach((a) => {
      let cur = p.attrs[a];
      const rate = growthRate(next) * wk;
      if (rate > 0) cur += (p.target[a] - cur) * rate + randn() * (next <= 21 ? 1.6 : 0.9) + shock;
      else cur += shock * 0.35;
      cur -= declineFor(a, next, p) * (0.85 + rand() * 0.3);
      p.attrs[a] = clamp(cur, 8, 99);
    });
    p.age = next;
  }

  const rookieFloor = (slot) => (!slot ? 8 : slot <= 3 ? 29 : slot <= 5 ? 27 : slot <= 10 ? 24 : slot <= 14 ? 21 : slot <= 30 ? 14 : 8);
  function trainPoints(p) {
    const a = p.age;
    return a <= 21 ? 9 : a <= 25 ? 7 : a <= 29 ? 5 : 4;
  }
  function applyTraining(p, alloc) {
    ATTRS.forEach((a) => {
      const pts = alloc[a] || 0;
      if (!pts) return;
      let eff = pts * (0.85 + 0.3 * p.work);
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
  function expLine(p, c) {
    c = c || {};
    const a = p.attrs, A = ARCHETYPES[p.arch], S = p.sec ? ARCHETYPES[p.sec] : null;
    const o = ovrOf(p);
    const sh = top3shots(a);
    const SS = 0.34 * sh[0] + 0.14 * sh[1] + 0.12 * a.ft + 0.12 * a.handling + 0.1 * a.iq + 0.18 * a.ath;
    let usg = T.usgBase + T.usgPerSS * (SS - 55) + T.usgConvex * Math.pow(Math.max(0, SS - 70), 2) + A.usg + (S ? 0.4 * S.usg : 0) - (c.coTax || 0);
    usg = clamp(usg * (c.usgMult || 1), 0.12, 0.362);
    let mins = clamp(T.minsBase + T.minsPerOvr * (o - 58), 8, T.minsCap);
    if (p.age >= 33) mins -= (p.age - 32) * 0.6;
    if (c.rookie && o < 84) mins *= 0.93;
    if (c.rookie) { usg *= 0.96; }
    mins = clamp(mins * (c.minsMult || 1), 6, c.minsMax || 38);
    if (c.minsFixed) mins = c.minsFixed;
    else if (c.minsFloor) mins = Math.max(mins, c.minsFloor);

    const skillShoot = 0.5 * sh[0] + 0.2 * sh[1] + 0.2 * a.ft + 0.1 * a.iq;
    let ts = T.tsBase + T.tsPerSkill * skillShoot + T.tsEra - T.usgTax * (usg - 0.2) * 1.0 + A.ts + (S ? 0.4 * S.ts : 0);
    ts += 0.5 * Math.max(0, 0.2 - usg);
    ts += (c.tsAdj || 0) - (c.rookie ? 0.012 : 0);
    ts = clamp(ts, 0.44, 0.7);

    const pace = c.pace || T.pace;
    const used = usg * (mins / 48) * pace;
    let pts = used * 1.82 * ts;
    const pm = 0.65 * a.passing + 0.35 * a.handling;
    const soft = (x, knee, k) => (x > knee ? knee + (x - knee) * k : x);
    const reb36 = soft(Math.max(1.6, 0.18 * a.reb - 3.8), 9, 0.6);
    const ast36 = soft(Math.max(1.0, 0.125 * (pm - 30) + 10 * (usg - 0.2)), 8.5, 0.62);
    const defx = 0.65 * a.perD + 0.35 * a.ath;
    const stl36 = Math.max(0.55, 0.031 * (defx - 33));
    const blk36 = Math.max(0.15, 0.043 * (a.rimP - 28));
    const tov36 = 0.8 + 10.5 * usg;
    const k = mins / 36;
    return {
      ovr: o, usg, ts, mins, pace,
      pts, reb: reb36 * k * (c.rebMult || 1), ast: ast36 * k * (c.astMult || 1),
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
    const fta2 = fta, tsReal = pts / (2 * (fga + 0.44 * fta2));
    return { fga, fgm, fgp, tpa, tpm, tpp: tpa > 0.3 ? tpm / tpa : 0, fta: fta2, ftm, ftp, ts: tsReal };
  }

  // ---------------------------------------------------------------- per-game box scores
  function genGame(m) {
    const gs = randn();
    const mm = clamp(1 + 0.085 * gs, 0.55, 1.28);
    const hot = rand() < 0.06 ? 1.28 : 0.9825;
    let pts = Math.max(0, Math.round(m.pts * mm * (1 + 0.205 * randn()) * hot));
    const ctr = (mean, extra) => {
      const lam = mean * mm;
      return Math.max(0, Math.round(lam + (Math.sqrt(lam) * 0.95 + 0.04 * lam) * randn() * (extra || 1)));
    };
    const reb = ctr(m.reb), ast = ctr(m.ast);
    const stl = Math.max(0, Math.round(m.stl * mm + Math.sqrt(m.stl * mm) * 0.9 * randn()));
    const blk = Math.max(0, Math.round(m.blk * mm + Math.sqrt(m.blk * mm) * 0.95 * randn()));
    const tov = Math.max(0, Math.round(m.tov * mm + Math.sqrt(m.tov * mm) * 0.8 * randn()));
    return { min: m.mins * mm, pts, reb, ast, stl, blk, tov };
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
    rand, randn, clamp, rint, pick, r1, weighted, sum, setSeed,
    ovr, ovrOf, makePlayer, buildTarget, rollCeiling, rollTdPlan, randomArch, randomPos, nameGen, regionOf,
    progress, applyTraining, trainPoints, rookieFloor, expLine, shootingLine, genGame, summarize,
  });
  if (typeof module !== 'undefined') module.exports = NBA;
})(typeof window !== 'undefined' ? window : globalThis);
