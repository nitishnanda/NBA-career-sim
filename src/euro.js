(function (g) {
  'use strict';
  // The EuroLeague and the NBA G League as living leagues: real 2026-27 clubs and players (NBA.EuroData), a season a year (standings, playoffs,
  // player stat lines, leaders and awards), players aging, improving, retiring and moving on. No games are simulated one by one: a season is
  // settled from team strength. Everything here draws from its own random stream, so it never moves the NBA simulation.
  const NBA = (g.NBA = g.NBA || {});
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const hashS = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const mul = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const gauss = (r) => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const EU_FIRST = ['Luka', 'Nikola', 'Marko', 'Dario', 'Mateo', 'Lucas', 'Hugo', 'Théo', 'Aleix', 'Pau', 'Giorgos', 'Kostas', 'Arnas', 'Rokas', 'Mantas', 'Emre', 'Cedi', 'Tim', 'Jonas', 'Filip', 'Ognjen', 'Lorenzo', 'Matteo', 'Jaime', 'Yago', 'Ivan', 'Stefan', 'Dimitris', 'Noah', 'Malcolm'];
  const EU_LAST = ['Petrović', 'Jovanović', 'Kalinić', 'Fernández', 'García', 'Moreau', 'Lefèvre', 'Papadopoulos', 'Kazlauskas', 'Valančiūnas', 'Yılmaz', 'Öztürk', 'Schröder', 'Weber', 'Rossi', 'Bianchi', 'Novak', 'Horvat', 'Kovač', 'Marinković', 'Ruiz', 'Pérez', 'Dubois', 'Laurent', 'Nikolaidis', 'Sabonis', 'Mayer', 'Conti', 'Đorđević', 'Andersson'];
  const KEYS = { el: 'euroleague', gl: 'gleague' };
  const LEAGUE = {
    el: { name: 'EuroLeague', games: 38, teamPts: 84, teamReb: 35, teamAst: 18, minTotal: 200, minRoster: 13, starter: 27, starterMax: 32 },
    gl: { name: 'NBA G League', games: 50, teamPts: 116, teamReb: 45, teamAst: 26, minTotal: 240, minRoster: 12, starter: 31, starterMax: 37 },
  };
  const ab3 = (name) => { const w = name.replace(/[^A-Za-zÀ-ž0-9 ]/g, '').split(/\s+/).filter(Boolean); return (w.length >= 2 ? w.slice(0, 3).map((x) => x[0]).join('') : name.slice(0, 3)).toUpperCase(); };

  // ---- the leagues as they stand on day one (real rosters, topped up to a full squad)
  function build(key, rnd) {
    const D = NBA.EuroData, src = D[KEYS[key]], players = {}, teams = []; let nid = 1;
    const TC = (NBA.data && NBA.data.TEAM_COLORS) || {};
    src.forEach((t, ti) => {
      const id = key + ti, roster = [];
      (t.players || []).forEach((r) => { const pid = key + 'p' + nid++; players[pid] = key === 'el' ? { id: pid, n: r[0], pos: r[1], age: r[2], ovr: r[3], nat: r[4], ht: r[5], team: id, real: 1 } : { id: pid, n: r[0], pos: r[1], age: r[2], ovr: r[3], note: r[4], ht: r[5], col: r[6], team: id, real: 1 }; roster.push(pid); });
      teams.push(key === 'el' ? { id, name: t.name, abbr: t.abbr, city: t.city, country: t.country, coach: t.coach, colors: t.colors, roster }
        : { id, name: t.name, abbr: ab3(t.name), city: t.city, conf: t.conf, parent: t.parent, coach: t.coach, colors: TC[t.parent] || ['#3a3a3a', '#d0d0d0'], roster });
    });
    const lg = { key, teams, players, nid, season: null, prev: null, history: [], year: D.season };
    teams.forEach((t) => fill(lg, t, rnd));
    return lg;
  }
  function genPlayer(lg, t, rnd, young) {
    const key = lg.key, pos = ['PG', 'SG', 'SF', 'PF', 'C'][Math.floor(rnd() * 5)], age = young ? 19 + Math.floor(rnd() * 4) : 21 + Math.floor(rnd() * 11);
    const F = key === 'el' ? EU_FIRST : (NBA.data && NBA.data.FIRST) || EU_FIRST, L = key === 'el' ? EU_LAST : (NBA.data && NBA.data.LAST) || EU_LAST;
    const base = key === 'el' ? 63 : 56, pid = key + 'p' + lg.nid++;
    lg.players[pid] = { id: pid, n: F[Math.floor(rnd() * F.length)] + ' ' + L[Math.floor(rnd() * L.length)], pos, age, ovr: Math.round(clamp(base + gauss(rnd) * 3 - (age <= 20 ? 3 : 0), 48, 76)), ht: 0, team: t.id, gen: 1 };
    t.roster.push(pid); return pid;
  }
  function fill(lg, t, rnd) { while (t.roster.length < LEAGUE[lg.key].minRoster) genPlayer(lg, t, rnd, rnd() < 0.4); }
  function init(st) {
    if (!NBA.EuroData) return null;
    if (!st.euro) { const rnd = mul(hashS('euro|' + (st.player ? st.player.name : '') + '|' + (st.league ? st.league.year : 0))); st.euro = { el: build('el', rnd), gl: build('gl', rnd) }; }
    return st.euro;
  }
  const league = (st, key) => (init(st) || {})[key];
  // which modelled club a player is at (a EuroLeague club, or the G League affiliate of his NBA club)
  function clubOf(st) {
    const c = st.college; if (!c || !init(st)) return null;
    if (c.tier === 'gleague') { const lg = st.euro.gl, nick = st.stash && st.stash.nick; const t = lg.teams.find((x) => x.parent === nick) || lg.teams[0]; return { key: 'gl', team: t }; }
    if (c.tier === 'euroleague') { const lg = st.euro.el, nm = (c.elName || c.name || '').toLowerCase(); const t = lg.teams.find((x) => x.name.toLowerCase() === nm || nm.indexOf(x.name.toLowerCase()) >= 0 || x.name.toLowerCase().indexOf(nm) >= 0); return t ? { key: 'el', team: t } : null; }
    return null;
  }
  // ---- one season: strength -> standings -> playoffs -> player lines -> leaders and awards
  const W9 = [1, 0.95, 0.9, 0.8, 0.7, 0.55, 0.45, 0.35, 0.25];
  function strength(lg, t, extra) { const o = t.roster.map((id) => lg.players[id].ovr).concat(extra ? [extra] : []).sort((a, b) => b - a); let s = 0, w = 0; W9.forEach((k, i) => { if (o[i] != null) { s += k * o[i]; w += k; } }); return w ? s / w : 60; }
  function seriesWin(r, sa, sb, need, homeA) { let a = 0, b = 0, k = 0; while (a < need && b < need) { const home = homeA ? [1, 1, 0, 0, 1][k % 5] : 0; const p = 1 / (1 + Math.exp(-((sa - sb) * 0.38 + (home ? 0.25 : -0.05)))); if (r() < p) a++; else b++; k++; } return { won: a > b, a, b }; }
  function simSeason(st, key, user) {
    const lg = league(st, key), C = LEAGUE[key], year = (st.league && st.league.year) || lg.year, rnd = mul(hashS('season|' + key + '|' + year + '|' + (st.player ? st.player.name : '')));
    if (lg.season && lg.season.year === year) return lg.season;
    const ut = user && user.team, str = {}; lg.teams.forEach((t) => { str[t.id] = strength(lg, t, ut && ut.id === t.id ? user.ovr : null) + gauss(rnd) * 0.8; });
    const mean = lg.teams.reduce((a, t) => a + str[t.id], 0) / lg.teams.length;
    const rec = {}; lg.teams.forEach((t) => { const p = 1 / (1 + Math.exp(-(str[t.id] - mean) * 0.24)); const w = clamp(Math.round(C.games * p + gauss(rnd) * 2.6), 4, C.games - 3); rec[t.id] = { id: t.id, w, l: C.games - w }; });
    const table = lg.teams.map((t) => rec[t.id]).sort((a, b) => b.w - a.w || str[b.id] - str[a.id]);
    const res = {}; lg.teams.forEach((t) => { res[t.id] = key === 'el' ? 'Missed the playoffs' : 'Missed the playoffs'; });
    const rounds = []; let champ = null, runner = null;
    if (key === 'el') {
      const seed = table.map((x) => x.id); const pin = (a, b) => (rnd() < 1 / (1 + Math.exp(-(str[a] - str[b]) * 0.38 - 0.2)) ? [a, b] : [b, a]);
      [6, 7, 8, 9].forEach((i) => { if (seed[i] != null) res[seed[i]] = 'Out in the play-in'; });
      const [w78, l78] = pin(seed[6], seed[7]), [w910] = pin(seed[8], seed[9]), [w8] = pin(l78, w910);
      rounds.push({ name: 'Play-in', text: lg.teams.find((t) => t.id === w78).name + ' and ' + lg.teams.find((t) => t.id === w8).name + ' take the last two spots' });
      const qf = [[seed[0], w8], [seed[1], w78], [seed[2], seed[5]], [seed[3], seed[4]]], semis = [];
      const qt = qf.map(([a, b]) => { const s = seriesWin(rnd, str[a], str[b], 3, true), w = s.won ? a : b, l = s.won ? b : a; res[l] = 'Lost in the playoffs'; semis.push(w); return nm(lg, w) + ' beat ' + nm(lg, l) + ' ' + Math.max(s.a, s.b) + '-' + Math.min(s.a, s.b); });
      rounds.push({ name: 'Playoffs', text: qt.join(' · ') });
      const ff = (a, b) => (rnd() < 1 / (1 + Math.exp(-(str[a] - str[b]) * 0.38)) ? [a, b] : [b, a]);
      const [f1, l1] = ff(semis[0], semis[3]), [f2, l2] = ff(semis[1], semis[2]); res[l1] = 'Final Four'; res[l2] = 'Final Four';
      const [cw, cl] = ff(f1, f2); champ = cw; runner = cl; res[cw] = 'EuroLeague champions'; res[cl] = 'Lost in the final';
      rounds.push({ name: 'Final Four', text: nm(lg, f1) + ' beat ' + nm(lg, l1) + ' · ' + nm(lg, f2) + ' beat ' + nm(lg, l2) + ' · Final: ' + nm(lg, cw) + ' over ' + nm(lg, cl) });
    } else {
      const confs = ['East', 'West'].map((cf) => table.filter((x) => lg.teams.find((t) => t.id === x.id).conf === cf).slice(0, 4).map((x) => x.id));
      const one = (a, b) => (rnd() < 1 / (1 + Math.exp(-(str[a] - str[b]) * 0.38 - 0.15)) ? [a, b] : [b, a]), fin = [];
      confs.forEach((s, ci) => { if (s.length < 4) return; s.forEach((id) => { res[id] = 'Lost in the first round'; }); const [a] = one(s[0], s[3]), [b] = one(s[1], s[2]); const [c, l] = one(a, b); res[l] = 'Lost in the conference finals'; fin.push(c); rounds.push({ name: (ci ? 'West' : 'East') + ' playoffs', text: nm(lg, c) + ' win the ' + (ci ? 'West' : 'East') }); });
      if (fin.length === 2) { const s = seriesWin(rnd, str[fin[0]], str[fin[1]], 2, true); champ = s.won ? fin[0] : fin[1]; runner = s.won ? fin[1] : fin[0]; res[champ] = 'G League champions'; res[runner] = 'Lost in the G League Finals'; rounds.push({ name: 'Finals', text: nm(lg, champ) + ' beat ' + nm(lg, runner) + ' ' + Math.max(s.a, s.b) + '-' + Math.min(s.a, s.b) }); }
    }
    // player lines: minutes by depth, points / rebounds / assists shared out by minutes, rating and position
    const stats = {}, rows = [];
    lg.teams.forEach((t) => {
      const ros = t.roster.map((id) => lg.players[id]).concat(ut && ut.id === t.id ? [{ id: 'user', n: user.name, pos: user.pos, age: user.age, ovr: user.ovr, user: 1 }] : []).sort((a, b) => b.ovr - a.ovr);
      const mins = ros.map((p, i) => (i < 5 ? C.starter + (p.ovr - 66) * 0.25 : i < 9 ? C.starter * 0.55 + (p.ovr - 62) * 0.2 : i < 11 ? 6 : 2.5)).map((m) => clamp(m, 1.5, C.starterMax));
      const tot = mins.reduce((a, m) => a + m, 0), mk = C.minTotal / tot; for (let i = 0; i < mins.length; i++) mins[i] = clamp(mins[i] * mk, 1, C.starterMax);
      const usg = ros.map((p, i) => mins[i] * Math.exp((p.ovr - 66) * 0.075)), su = usg.reduce((a, x) => a + x, 0);
      const rw = ros.map((p, i) => mins[i] * ({ C: 1.6, PF: 1.3, SF: 1.0, SG: 0.8, PG: 0.65 }[p.pos] || 1)), sr = rw.reduce((a, x) => a + x, 0);
      const aw = ros.map((p, i) => mins[i] * ({ PG: 2.3, SG: 1.2, SF: 1.0, PF: 0.7, C: 0.55 }[p.pos] || 1) * Math.exp((p.ovr - 66) * 0.03)), sa = aw.reduce((a, x) => a + x, 0);
      ros.forEach((p, i) => {
        if (p.user) return;
        const gp = clamp(Math.round(C.games * (0.78 + 0.2 * rnd())), 6, C.games), j = () => 0.88 + 0.24 * rnd();
        const pts = C.teamPts * usg[i] / su * j(), reb = C.teamReb * rw[i] / sr * j(), ast = C.teamAst * aw[i] / sa * j(), stl = mins[i] * 0.03 * j(), blk = mins[i] * ({ C: 0.05, PF: 0.03 }[p.pos] || 0.012) * j(), tov = pts * 0.11 + ast * 0.15;
        const ln = { gp, min: mins[i], pts, reb, ast, stl, blk, tov, pir: pts + reb + ast + stl + blk - tov - pts * 0.35 };
        stats[p.id] = ln; rows.push({ id: p.id, n: p.n, pos: p.pos, age: p.age, ovr: p.ovr, team: t.id, ln });
      });
      if (ut && ut.id === t.id && user.line) { const L0 = user.line; const ln = { gp: L0.gp, min: L0.mins, pts: L0.pts, reb: L0.reb, ast: L0.ast, stl: L0.stl, blk: L0.blk, tov: L0.tov || 1.5, pir: L0.pts + L0.reb + L0.ast + L0.stl + L0.blk - (L0.tov || 1.5) - L0.pts * 0.35 }; rows.push({ id: 'user', n: user.name, pos: user.pos, age: user.age, ovr: user.ovr, team: t.id, ln, user: 1 }); }
    });
    const winPct = (tid) => rec[tid].w / C.games, qual = rows.filter((r) => r.ln.gp >= C.games * 0.5);
    const top = (k, n) => qual.slice().sort((a, b) => b.ln[k] - a.ln[k]).slice(0, n || 5).map((r) => ({ id: r.id, n: r.n, team: r.team, v: Math.round(r.ln[k] * 10) / 10, user: !!r.user }));
    const mvp = qual.slice().sort((a, b) => b.ln.pir * (0.7 + winPct(b.team)) - a.ln.pir * (0.7 + winPct(a.team)))[0];
    const young = qual.filter((r) => r.age <= (key === 'el' ? 22 : 23)).sort((a, b) => b.ln.pir - a.ln.pir)[0];
    const finalsMvp = rows.filter((r) => r.team === champ).sort((a, b) => b.ln.pir - a.ln.pir)[0];
    const allTeam = qual.slice().sort((a, b) => b.ln.pir * (0.8 + 0.5 * winPct(b.team)) - a.ln.pir * (0.8 + 0.5 * winPct(a.team))).slice(0, 5);
    const pick = (r) => (r ? { id: r.id, n: r.n, team: r.team, user: !!r.user } : null);
    const season = { year, table: table.map((x) => ({ id: x.id, w: x.w, l: x.l, res: res[x.id] })), rounds, champ, runner,
      awards: { mvp: pick(mvp), young: pick(young), finalsMvp: pick(finalsMvp), allTeam: allTeam.map(pick) },
      leaders: { pts: top('pts'), reb: top('reb'), ast: top('ast'), pir: top('pir') },
      lines: Object.fromEntries(rows.map((r) => [r.id, [r.team, Math.round(r.ln.gp), +r.ln.min.toFixed(1), +r.ln.pts.toFixed(1), +r.ln.reb.toFixed(1), +r.ln.ast.toFixed(1), +r.ln.stl.toFixed(1), +r.ln.blk.toFixed(1), +r.ln.pir.toFixed(1), r.n, r.pos, r.age]])) };
    lg.prev = lg.season; lg.season = season;
    lg.history.unshift({ year, champ: nm(lg, champ), mvp: season.awards.mvp ? season.awards.mvp.n : '' }); lg.history = lg.history.slice(0, 30);
    return season;
  }
  const nm = (lg, id) => { const t = lg.teams.find((x) => x.id === id); return t ? t.name : '?'; };
  // ---- the off-season: everyone a year older; the young improve, the old decline and retire, the best leave for the NBA, the G League churns
  function advance(st, key) {
    const lg = league(st, key), rnd = mul(hashS('adv|' + key + '|' + lg.season.year)), news = [];
    Object.values(lg.players).forEach((p) => {
      if (!lg.teams.some((t) => t.id === p.team)) return;
      p.age++; const a = p.age, d = a <= 22 ? 2 + gauss(rnd) * 1.8 : a <= 26 ? 1 + gauss(rnd) * 1.4 : a <= 30 ? gauss(rnd) * 1.1 : a <= 33 ? -1 + gauss(rnd) * 1.3 : -2.5 + gauss(rnd) * 1.4;
      p.ovr = Math.round(clamp(p.ovr + d, 45, 88));
      const t = lg.teams.find((x) => x.id === p.team); let leave = null;
      if (a >= 36 || (a >= 33 && p.ovr < 60 && rnd() < 0.5)) leave = 'retired';
      else if (key === 'el' && p.ovr >= 78 && a <= 28 && rnd() < 0.18) leave = 'left for the NBA';
      else if (key === 'gl' && p.ovr >= 65 && rnd() < 0.45) leave = 'signed with an NBA club';
      else if (key === 'gl' && rnd() < 0.42) leave = 'moved on';
      else if (key === 'el' && rnd() < 0.1) { const nt = lg.teams[Math.floor(rnd() * lg.teams.length)]; if (nt.id !== t.id) { t.roster = t.roster.filter((x) => x !== p.id); nt.roster.push(p.id); p.team = nt.id; if (p.ovr >= 72) news.push(p.n + ' moved from ' + t.name + ' to ' + nt.name + '.'); } }
      if (leave) { t.roster = t.roster.filter((x) => x !== p.id); p.team = null; if (p.ovr >= 72 || leave !== 'moved on') news.push(p.n + ' (' + t.name + ') ' + leave + '.'); }
    });
    Object.keys(lg.players).forEach((id) => { if (lg.players[id].team == null) delete lg.players[id]; });
    lg.teams.forEach((t) => fill(lg, t, rnd));
    lg.news = news.slice(0, 12);
  }
  // once a year, for both leagues; the league the player is in gets him and his line
  function yearEnd(st, user) {
    if (!init(st)) return; const year = st.league.year;
    ['el', 'gl'].forEach((k) => { const lg = st.euro[k]; if (lg.season && lg.season.year === year) return; const u = user && user.key === k ? user : null; simSeason(st, k, u); advance(st, k); });
  }
  // a pre-season camp in Europe or the G League: train with a club veteran, a club leader, or a star elsewhere in the league
  const SKILL = { PG: 'passing', SG: 'three', SF: 'mid', PF: 'reb', C: 'inside' };
  function campOptions(st) {
    const cl = clubOf(st), key = cl ? cl.key : st.college && st.college.tier === 'gleague' ? 'gl' : 'el', lg = league(st, key); if (!lg) return [];
    const mates = cl ? cl.team.roster.map((id) => lg.players[id]).sort((a, b) => b.ovr - a.ovr) : [], others = Object.values(lg.players).filter((p) => !cl || p.team !== cl.team.id).sort((a, b) => b.ovr - a.ovr);
    const out = []; const add = (p, tier) => { if (p && !out.some((x) => x.id === p.id)) out.push({ id: p.id, n: p.n, pos: p.pos, age: p.age, ovr: p.ovr, team: nm(lg, p.team), tier, skill: SKILL[p.pos] || 'iq' }); };
    add(mates.find((p) => p.age >= 29) || mates[1], 'vet'); add(mates[0], 'leader'); add(others[Math.floor((st.player.age * 7) % 5)], 'star');
    for (let i = 0; out.length < 3 && i < 8; i++) add(others[i], 'star');
    return out;
  }
  function doCamp(st, id) {
    const o = campOptions(st).find((x) => x.id === id); if (!o) throw new Error('no such partner');
    const gain = { vet: 1.4, leader: 1.0, star: 1.8 }[o.tier], p = st.player; p.attrs[o.skill] = clamp(p.attrs[o.skill] + gain, 8, 99); if (p.target) p.target[o.skill] = clamp((p.target[o.skill] || 0) + gain * 0.6, 8, 99);
    st.euroCamp = st.league.year;
    NBA.Decisions.log(st, { kind: 'camp', title: 'Training camp', tone: 'good', text: 'Spent the pre-season working with ' + o.n + ' (' + o.team + '): your ' + ((NBA.data.ATTR_LABELS || {})[o.skill] || o.skill).toLowerCase() + ' improved.' });
    return o;
  }
  NBA.Euro = { init, league, clubOf, simSeason, advance, yearEnd, campOptions, doCamp, LEAGUE, KEYS, strength };
  if (typeof module !== 'undefined') module.exports = NBA;
})(typeof window !== 'undefined' ? window : globalThis);
