(function (g) {
  'use strict';
  // The world around your box score: teammates' and opponents' lines and the game told by quarters, the other 29 teams' storylines,
  // an agent who works, awards night, evolving your game as the body ages, contract incentives, the championship moment, and your jersey number.
  // Human careers only. Game details are derived from a hash of the game (nothing in the season's random streams moves).
  const NBA = (g.NBA = g.NBA || {});
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const ovr = (p) => NBA.ovr(p);
  const DC = () => NBA.Decisions;
  const flags = (st) => DC().state(st).flags;
  const hashS = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const mul = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const gameRng = (st, it, k) => mul(hashS((st.player.name || '') + '|' + st.league.year + '|' + (it.po ? 'p' : 'r') + it.n + '|' + (it.o || '') + '|' + k));

  // ---------------------------------------------------------------- 1-2. the rest of the box score and the game by quarters
  const seasonLine = (q, year) => { const h = q.hist || [], row = h.find((x) => x[0] === year) || h[h.length - 1]; return row ? { pts: row[4] / 10, reb: row[5] / 10, ast: row[6] / 10 } : { pts: Math.max(4, (ovr(q) - 55) * 0.8), reb: 4, ast: 2.5 }; };
  function lineFor(r, base, won, star) { const hot = r() < (star ? 0.05 : 0.025) ? 1.45 : 1, f = (0.72 + 0.56 * r()) * hot * (won ? 1.04 : 0.96); return { pts: Math.max(0, Math.round(base.pts * f)), reb: Math.max(0, Math.round(base.reb * (0.6 + 0.8 * r()))), ast: Math.max(0, Math.round(base.ast * (0.55 + 0.9 * r()))) }; }
  function boxOf(st, it) {
    if (!it || it.k !== 'g' || it.dnp == null && it.pt == null) return null; const L = st.league, t = L.teams[st.teamId], ot = L.teams.find((x) => x.nick === it.o); if (!t) return null;
    const out = NBA.Arc ? NBA.Arc.mateOutAt(st, it) : null, r = gameRng(st, it, 'box'), mates = NBA.rosterOf(L, t).filter((q) => q.id !== 'user' && q.id !== st.player.id && q.id !== out).slice(0, 4), opp = ot ? NBA.rosterOf(L, ot).slice(0, 2) : [];
    // a teammate is out: his shots go to the others, most to whoever takes his spot (real: a 20-ppg starter's absence adds ~3-5 to the next man up)
    const oq = out != null ? L.players[out] : null, ol = oq ? seasonLine(oq, L.year) : null, full = NBA.rosterOf(L, t).filter((q) => q.id !== 'user' && q.id !== st.player.id).slice(0, 4).map((q) => q.id);
    const ours = mates.map((q, i) => { const b = Object.assign({}, seasonLine(q, L.year)), up = ol && !full.includes(q.id); if (ol) b.pts += ol.pts * (up ? 0.3 : 0.1); if (up) { b.reb += ol.reb * 0.3; b.ast += ol.ast * 0.3; } return Object.assign({ id: q.id, name: q.name, pos: q.pos, up: !!up }, lineFor(r, b, !!it.w, i === 0)); });
    const step = oq ? ours.find((x) => x.up) : null;
    const theirs = opp.map((q, i) => { const l = Object.assign({ id: q.id, name: q.name, pos: q.pos }, lineFor(r, seasonLine(q, L.year), !it.w, i === 0)); if (i === 0 && it.asg) l.pts = Math.round(l.pts * 0.68); return l; });   // you took the assignment: their star had a rough night
    return { ours, theirs, quarters: quarters(st, it), story: null, out: oq ? oq.name : null, step: step ? { id: step.id, name: step.name, pts: step.pts } : null };
  }
  function quarters(st, it) {
    if (it.f == null || it.a == null) return null; const r = gameRng(st, it, 'q'), split = (tot, n) => { const w = Array.from({ length: n }, () => 0.8 + 0.4 * r()), s = w.reduce((a, b) => a + b, 0), out = w.map((x) => Math.round(tot * x / s)); out[n - 1] += tot - out.reduce((a, b) => a + b, 0); return out; };
    let f = it.f, a = it.a, ot = null;
    if (it.ot) { const m = it.f - it.a, fo = Math.max(8, Math.abs(m) + 3) + Math.floor(r() * 5); ot = [fo, fo - m]; f -= ot[0]; a -= ot[1]; }
    const qf = split(f, 4), qa = split(a, 4); if (ot) { qf.push(ot[0]); qa.push(ot[1]); }
    return { us: qf, them: qa };
  }
  function gameStory(st, it) {
    const q = quarters(st, it); if (!q) return ''; const cum = (arr, n) => arr.slice(0, n).reduce((a, b) => a + b, 0), half = cum(q.us, 2) - cum(q.them, 2), three = cum(q.us, 3) - cum(q.them, 3);
    const big = q.us.slice(0, 4).map((x, i) => [x - q.them[i], i]).sort((a, b) => Math.abs(b[0]) - Math.abs(a[0]))[0], qn = ['first', 'second', 'third', 'fourth'][big[1]];
    let s = half > 0 ? 'Up ' + half + ' at the half' : half < 0 ? 'Down ' + -half + ' at the half' : 'Tied at the half';
    s += it.w ? (half < 0 ? ', then a ' + q.us[2] + '-point third quarter turned it' : three > 10 ? ' and never let it get close' : ', and you held on late') : (half > 0 ? ', then it slipped away' + (big[0] < 0 ? ' in the ' + qn + ' quarter' : '') : three < -10 ? ' and it was over before the fourth' : ' and the comeback fell short');
    if (it.ot) s += '. Overtime decided it'; return s + '.';
  }

  // ---------------------------------------------------------------- 3. the other 29 teams
  function leagueStories(st) {
    const f = flags(st), L = st.league; if (f.lgStories && f.lgStories.y === L.year) return f.lgStories.list;
    const lw = L.lastWins || {}, out = [], r = mul(hashS('lg|' + st.player.name + '|' + L.year)), others = L.teams.filter((t) => t.id !== st.teamId);
    others.slice().sort((a, b) => Math.abs(b.wins - (lw[b.nick] || b.wins)) - Math.abs(a.wins - (lw[a.nick] || a.wins))).slice(0, 4).forEach((t) => { const was = lw[t.nick]; if (was == null) return; const d = t.wins - was; if (d >= 12) out.push({ k: 'rise', t: t.nick, text: '📈 The ' + t.nick + ' jumped from ' + was + ' to ' + t.wins + ' wins. Nobody saw it coming.' }); else if (was >= 50 && t.wins <= 40) out.push({ k: 'fall', t: t.nick, text: '📉 The ' + t.nick + ' fell from ' + was + ' wins to ' + t.wins + '. The window might be closing.' }); });
    const bottom = others.slice().sort((a, b) => a.wins - b.wins).slice(0, 3);
    bottom.forEach((t) => { const y = NBA.rosterOf(L, t).filter((q) => q.age <= 22).sort((a, b) => ovr(b) - ovr(a))[0]; if (y) out.push({ k: 'tank', t: t.nick, text: '🧱 The ' + t.nick + ' (' + t.wins + ' wins) are all in on the rebuild around ' + y.name + ' (' + y.age + '). Lottery balls, here they come.' }); });
    others.forEach((t) => { const h = t.hist || []; const titles = h.slice(-3).filter((x) => x.po >= 5).length; if (titles >= 2) out.push({ k: 'dyn', t: t.nick, text: '👑 The ' + t.nick + ' have won ' + titles + ' of the last ' + Math.min(3, h.length) + ' titles. Dynasty talk is everywhere.' }); });
    // the stars: the old guard, the unhappy star (a real move), the young riser
    const stars = []; others.forEach((t) => NBA.rosterOf(L, t).slice(0, 2).forEach((q) => stars.push({ q, t }))); stars.sort((a, b) => ovr(b.q) - ovr(a.q));
    const old = stars.find((x) => x.q.age >= 35); if (old) out.push({ k: 'old', t: old.t.nick, text: '🕰️ ' + old.q.name + ' (' + old.q.age + ') says he will decide on retirement "when it feels right". Every arena is treating it like a farewell.' });
    const young = stars.find((x) => x.q.age <= 22 && ovr(x.q) >= 78); if (young) out.push({ k: 'young', t: young.t.nick, text: '🌟 ' + young.q.name + ' (' + young.q.age + ', ' + young.t.nick + ') is the next one. Scouts are using the word "franchise".' });
    const sad = stars.slice(0, 20).find((x) => x.t.wins <= 30 && x.q.age >= 26);
    if (sad && r() < 0.6) { const dest = others.filter((t) => t.id !== sad.t.id && t.wins >= 45).sort((a, b) => b.wins - a.wins)[Math.floor(r() * 3)], back = dest && NBA.rosterOf(L, dest).filter((q) => q.id !== 'user')[2];
      if (dest && back) { NBA.swapPlayers(L, sad.t, sad.q, dest, back); (L.moves = L.moves || []).push({ year: L.year, phase: 'offseason', text: sad.q.name + ' requested a trade from the ' + sad.t.nick + ' and got it: he is a ' + dest.nick + ' now (' + back.name + ' goes back)', a: sad.t.nick, b: dest.nick }); out.unshift({ k: 'trade', t: dest.nick, text: '🚨 ' + sad.q.name + ' asked out of the ' + sad.t.nick + ' (' + sad.t.wins + ' wins) and got his wish: he joins the ' + dest.nick + '. The West/East just shifted.'.replace('West/East', dest.conf === 'E' ? 'East' : 'West') }); } }
    f.lgStories = { y: L.year, list: out.slice(0, 7) }; return f.lgStories.list;
  }

  // ---------------------------------------------------------------- 4. an agent who works
  function agentAdvice(st, d) {
    const out = [], c = st.contract; if (!c || !d) return out;
    if (d.marketSalary && c.salary && d.marketSalary > c.salary * 1.25 && c.left >= 1) out.push('You are underpaid: the market says about $' + Math.round(d.marketSalary) + 'M a year and you make $' + Math.round(c.salary) + 'M. Be patient; your next deal is where it gets fixed.');
    if (d.extension) out.push(d.extension.crit ? 'There is a bigger number if you make ' + d.extension.crit + ' next season. Betting on yourself could pay, but an injury would cost you.' : 'The extension on the table is fair. Signing now buys security; waiting buys leverage.');
    if (d.market && d.market.length) { const top = d.market.slice().sort((a, b) => (b.salary || 0) - (a.salary || 0)).slice(0, 3); out.push('The money is with ' + top.map((m) => 'the ' + (m.nick || m.name)).join(', ') + '.'); }
    if (c.left === 1 && !d.expiring) out.push('Contract year next season. Every game is an audition.');
    if (!out.length) out.push('Quiet summer. Play well and the money will come.');
    return out;
  }
  function leak(st, d, teamId) {
    const f = flags(st), L = st.league; if (f.leakYear === L.year) throw new Error('one leak a summer'); f.leakYear = L.year;
    const m = (d.market || []).find((x) => x.teamId === teamId); if (!m) throw new Error('no such suitor'); m.salary = Math.round((m.salary || 0) * 1.06 * 10) / 10; m.leaked = true;
    if (NBA.Core) NBA.Core.setFo(st, -0.4); DC().apply(st, [{ k: 'meter', f: 'media', d: 0.2 }]);
    DC().log(st, { kind: 'brand', title: 'Agent', tone: 'neutral', text: 'Your agent leaked your interest in the ' + (m.nick || m.name) + '. Their number went up; your own front office was not thrilled.' });
    return { text: 'Your agent leaked that you love the ' + (m.nick || m.name) + '. Their offer went up about 6%. Your current team noticed.' };
  }

  // ---------------------------------------------------------------- 7. awards night
  const RACE = { mvp: 'MVP', dpoy: 'Defensive Player of the Year', roy: 'Rookie of the Year', mip: 'Most Improved Player' };
  function awardsNight(st) {
    const L = st.league, rec = st.proSeasons[st.proSeasons.length - 1], snap = st.leagueSnap; if (!rec || !snap || !snap.race) return [];
    const out = [];
    Object.keys(RACE).forEach((k) => { const list = (snap.race[k] || []).slice().sort((a, b) => b.s - a.s); const i = list.findIndex((x) => x.isUser); if (i < 0 || i > 2) return;
      const ex = list.map((x) => Math.exp(x.s / 7)), tot = ex.reduce((a, b) => a + b, 0) || 1, won = i === 0 && (rec.awards || []).some((a) => a.indexOf(RACE[k] === 'MVP' ? 'MVP' : RACE[k]) === 0 || a === RACE[k]);
      out.push({ key: k, award: RACE[k], rank: i + 1, won: i === 0, share: Math.round(ex[i] / tot * 100), winner: list[0].isUser ? null : list[0].name, gap: i ? Math.round((ex[0] - ex[i]) / tot * 100) : Math.round((ex[0] - (ex[1] || 0)) / tot * 100) }); });
    return out;
  }
  function awardSpeech(st, key, choice) {
    const f = flags(st), L = st.league, an = (f.awardNight = f.awardNight || {}), k = L.year + ':' + key; if (an[k]) throw new Error('done'); an[k] = choice;
    const r = mul(hashS('speech|' + st.player.name + '|' + k))(); let text, eff;
    if (choice === 'team') { eff = [{ k: 'meter', f: 'locker', d: 0.4 }, { k: 'meter', f: 'chem', d: 0.3 }]; text = 'You called your teammates up on stage. The room will remember that.'; }
    else if (choice === 'family') { eff = [{ k: 'meter', f: 'media', d: 0.4 }]; text = 'You thanked your family and your mom cried. The clip did numbers.'; }
    else if (choice === 'doubters') { eff = r < 0.55 ? [{ k: 'meter', f: 'media', d: 0.5 }] : [{ k: 'meter', f: 'media', d: -0.4 }]; text = r < 0.55 ? 'You named every doubter. The timeline loved it.' : 'The doubters speech came off bitter. Even on your big night.'; }
    else if (choice === 'classy') { eff = [{ k: 'meter', f: 'media', d: 0.3 }]; text = 'You congratulated the winner and meant it. Class.'; }
    else { eff = [{ k: 'meter', f: 'media', d: -0.3 }, { k: 'meter', f: 'locker', d: 0.1 }]; text = 'You said the vote was a joke. Half the internet agrees with you; the other half calls you salty.'; if (NBA.Social && NBA.Social.change) NBA.Social.change(st, 0.01); }
    DC().apply(st, eff); DC().log(st, { kind: 'award', title: 'Awards night', tone: 'neutral', text });
    return { text };
  }

  // ---------------------------------------------------------------- 8. evolving your game as the body ages
  const EVOLVE = {
    stretch: { label: 'Add a real three', blurb: 'Hours of catch-and-shoot: your range grows while the legs fade.', attrs: { three: 3, mid: 1 } },
    post: { label: 'Move to the post', blurb: 'Footwork, fadeaways, bully ball. Old-man game.', attrs: { inside: 2.5, mid: 1.5, reb: 1 } },
    play: { label: 'Become a playmaker', blurb: 'See the floor, run the offense, make everyone better.', attrs: { passing: 2.5, iq: 1.5 } },
    anchor: { label: 'Become a defensive anchor', blurb: 'Positioning over athleticism: talk, rotate, protect.', attrs: { perD: 1.5, rimP: 1.5, iq: 1 } },
  };
  const canEvolve = (st) => st.player.age >= 30 && st.contract && (flags(st).evolveYear == null || st.league.year - flags(st).evolveYear >= 2);
  function evolve(st, key) {
    if (!canEvolve(st)) throw new Error('not now'); const e = EVOLVE[key]; if (!e) throw new Error('no such path'); const p = st.player; flags(st).evolveYear = st.league.year;
    Object.keys(e.attrs).forEach((a) => { p.attrs[a] = clamp(p.attrs[a] + e.attrs[a], 8, 99); if (p.target && p.target[a] != null) p.target[a] = clamp(p.target[a] + e.attrs[a] * 0.7, 8, 99); });
    st.bonusPoints = (st.bonusPoints || 0) - 1; DC().log(st, { kind: 'camp', title: 'Evolution', tone: 'good', text: 'You reinvented your game: ' + e.label.toLowerCase() + '.' });
    return { text: e.label + ': done. ' + e.blurb + ' (It cost one upgrade point of summer time.)' };
  }

  // ---------------------------------------------------------------- 9. contract incentives
  const INCENT = { allstar: { label: 'All-Star bonus', pay: 2, test: (r) => (r.awards || []).some((a) => /^All-Star/.test(a)) }, games: { label: '70 games played', pay: 1.5, test: (r) => r.gp >= 70 }, allnba: { label: 'All-NBA bonus', pay: 4, test: (r) => (r.awards || []).some((a) => /All-NBA/.test(a)) }, title: { label: 'Championship bonus', pay: 3, test: (r) => (r.awards || []).some((a) => /Champion/.test(a) && !/Scoring|Contest/.test(a)) } };
  const cKey = (st) => st.contract ? st.contract.salary + ':' + st.contract.years : '';
  function addIncentive(st, kind) {
    const f = flags(st), c = st.contract; if (!c || c.type === 'rookie') throw new Error('no deal'); if (f.incent && f.incent.c === cKey(st)) throw new Error('one per contract');
    const fo = NBA.Core ? NBA.Core.foMood(st) : 0, r = mul(hashS('inc|' + st.player.name + '|' + st.league.year + kind))(), ok = r < clamp(0.55 + fo * 0.1, 0.2, 0.9);
    f.incent = { c: cKey(st), kind: ok ? kind : null, y: st.league.year };
    return ok ? { ok, text: 'The front office agreed: ' + INCENT[kind].label + ' worth $' + INCENT[kind].pay + 'M a season.' } : { ok, text: 'The front office said no to the ' + INCENT[kind].label.toLowerCase() + '.' };
  }
  function payIncentives(st) {
    const f = flags(st), inc = f.incent, rec = st.proSeasons[st.proSeasons.length - 1]; if (!inc || !inc.kind || !rec || rec.year <= inc.y || inc.paid === st.league.year || inc.c !== cKey(st)) return null;
    inc.paid = st.league.year; const k = INCENT[inc.kind];
    if (!k.test(rec)) return { ok: false, text: 'Incentive missed: no ' + k.label.toLowerCase() + ' this season.' };
    st.earnings = (st.earnings || 0) + k.pay; return { ok: true, text: '💰 Incentive hit: ' + k.label + ', +$' + k.pay + 'M.' };
  }

  // ---------------------------------------------------------------- 10. the championship moment
  function champMoment(st) {
    const rec = st.proSeasons[st.proSeasons.length - 1]; if (!rec || !(rec.awards || []).some((a) => /^(NBA )?Champion/.test(a))) return null;
    const fmvp = (rec.awards || []).some((a) => /Finals MVP/.test(a)), rings = (st.career.awards || {}).Championships || 1, done = (flags(st).parade || {})[st.league.year];
    return { rings, fmvp, done, po: rec.playoff, team: st.league.teams[st.teamId].nick };
  }
  function parade(st, key) {
    const f = flags(st), pr = (f.parade = f.parade || {}); if (pr[st.league.year]) throw new Error('done'); pr[st.league.year] = key;
    const T = { humble: ['"This is for the city." You let the fans have the moment.', [{ k: 'meter', f: 'media', d: 0.4 }, { k: 'meter', f: 'locker', d: 0.3 }]], repeat: ['"We are not done." You told the city to save the date for next year.', [{ k: 'meter', f: 'media', d: 0.5 }, { k: 'season', v: { form: 0.003 } }]], doubters: ['You named every person who said you could not win the big one. The parade crowd roared.', [{ k: 'meter', f: 'media', d: 0.3 }]] }[key];
    DC().apply(st, T[1]); DC().log(st, { kind: 'award', title: 'Parade', tone: 'good', text: T[0] }); if (NBA.Social && NBA.Social.change) NBA.Social.change(st, 0.03);
    return { text: T[0] };
  }

  // ---------------------------------------------------------------- 11. your number
  const RETIRED = { Bulls: [4, 10, 23, 33], Celtics: [1, 2, 3, 5, 6, 10, 14, 15, 16, 17, 18, 19, 21, 22, 23, 24, 25, 31, 32, 33, 34, 35], Lakers: [8, 13, 16, 22, 24, 25, 32, 33, 34, 42, 44, 52, 99], Warriors: [13, 14, 16, 17, 24, 42], Knicks: [10, 12, 15, 19, 22, 24, 33], Heat: [1, 3, 6, 10, 23, 32, 33, 40], Spurs: [6, 9, 12, 13, 20, 21, 32, 44, 50], Mavericks: [12, 15, 22, 24, 41], Pistons: [1, 2, 3, 4, 10, 11, 15, 16, 21, 32, 40], '76ers': [2, 3, 4, 6, 10, 13, 15, 24, 32, 34], Rockets: [11, 22, 23, 24, 33, 34, 45], Jazz: [1, 7, 9, 12, 14, 32, 35, 53], Suns: [5, 6, 7, 9, 13, 24, 31, 32, 33, 34, 42, 44], Bucks: [1, 2, 4, 8, 10, 14, 16, 32, 33] };
  function jerseyNeed(st) { const j = st.jersey; return !!st.contract && !st.autoPlay && (!j || j.teamId !== st.teamId); }
  function jerseyTaken(st, teamId) {
    const L = st.league, t = L.teams[teamId], ret = RETIRED[t.nick] || [], r = mul(hashS('jt|' + t.nick + '|' + L.year)), mates = NBA.rosterOf(L, t).filter((q) => q.id !== 'user').slice(0, 13), taken = {};
    mates.forEach((q) => { let n; do { n = Math.floor(r() * 56); } while (ret.includes(n) || taken[n]); taken[n] = { id: q.id, name: q.name, star: ovr(q) >= 80 }; });
    return { retired: ret, taken };
  }
  function pickJersey(st, num, buy) {
    const L = st.league, t = L.teams[st.teamId], n = Math.round(+num); if (!(n >= 0 && n <= 99)) throw new Error('0 to 99');
    const tk = jerseyTaken(st, st.teamId); if (tk.retired.includes(n)) return { ok: false, text: '#' + n + ' is retired by the ' + t.nick + '. Pick another one.' };
    const owner = tk.taken[n];
    if (owner && !buy) return { ok: false, owner, text: owner.name + ' wears #' + n + '. You could buy it from him' + (owner.star ? ' (he is a star, so it will not be cheap)' : '') + '.' };
    let text = 'You will wear #' + n + ' for the ' + t.nick + '.';
    if (owner) { const price = owner.star ? 2 : 0.5, r = mul(hashS('jbuy|' + owner.id + '|' + L.year))(); if (owner.star && r < 0.5) return { ok: false, text: owner.name + ' would not sell #' + n + ' at any price. Pick another one.' };
      st.earnings = Math.max(0, (st.earnings || 0) - price); DC().apply(st, [{ k: 'rel', id: owner.id, name: owner.name, d: 0.4 }]); text = 'You bought #' + n + ' from ' + owner.name + ' for $' + price + 'M (and a watch). ' + text; }
    const prev = st.jersey; st.jersey = { num: n, teamId: st.teamId, team: t.nick, y: L.year }; (st.jerseys = st.jerseys || []).push({ num: n, team: t.nick, y: L.year });
    if (prev && prev.num !== n) text += ' (You wore #' + prev.num + ' with the ' + prev.team + '.)';
    DC().log(st, { kind: 'brand', title: 'Jersey', tone: 'neutral', text }); return { ok: true, text };
  }

  NBA.World = { avgOf: (st, id) => { const q = st.league.players[id]; return q ? seasonLine(q, st.league.year).pts : null; }, boxOf, quarters, gameStory, leagueStories, agentAdvice, leak, awardsNight, awardSpeech, RACE, EVOLVE, canEvolve, evolve, INCENT, addIncentive, payIncentives, champMoment, parade, jerseyNeed, jerseyTaken, pickJersey, RETIRED };
  if (typeof module !== 'undefined') module.exports = NBA;
})(typeof window !== 'undefined' ? window : globalThis);
