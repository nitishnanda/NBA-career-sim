(function (g) {
  // All-Star Weekend. The selection comes from the season's award model (who is an All-Star is decided there); this is the weekend itself: who started, the events
  // you are invited to (Rising Stars, the Three-Point Contest, the Slam Dunk Contest) and the game. Human careers only. The state lives in the decision flags (it
  // survives a season replay) and the awards it hands out are put back on the season's record when a replay rebuilds it.
  const NBA = (g.NBA = g.NBA || {});
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const r1 = (x) => Math.round(x * 10) / 10;
  const flags = (st) => NBA.Decisions.state(st).flags;
  const rng = (st, key) => NBA.Decisions.rng(st, 'asw|' + st.league.year + '|' + key);
  const lastName = (n) => String(n || '').split(' ').slice(-1)[0];

  // called once per season when the awards are worked out: the two rosters, starters first
  function build(st, A) {
    const L = st.league, out = { year: L.year, E: [], W: [], sel: false, starter: false };
    (A.allStar || []).forEach((id) => {
      const q = id === 'user' ? st.player : L.players[id], t = L.teams[id === 'user' ? st.teamId : q && q.teamId]; if (!q || !t) return;
      const list = out[t.conf === 'W' ? 'W' : 'E']; list.push({ id, name: q.name, pos: q.pos, team: t.nick, ovr: Math.round(NBA.ovr(q)), starter: list.length < 5, isUser: id === 'user' });
    });
    const me = out.E.concat(out.W).find((x) => x.isUser); out.sel = !!me; out.starter = !!(me && me.starter);
    st.asRoster = out;
    return out;
  }
  // the league's best at the contests, not counting you
  function pools(st) {
    const L = st.league, all = []; L.teams.forEach((t) => NBA.rosterOf(L, t).forEach((q) => { if (q.id !== 'user') all.push({ q, t }); }));
    const three = all.slice().sort((a, b) => b.q.attrs.three - a.q.attrs.three).slice(0, 16), dunk = all.filter((x) => x.q.age <= 29).sort((a, b) => b.q.attrs.ath - a.q.attrs.ath).slice(0, 14);
    const young = all.filter((x) => (x.q.yearsPro || 0) <= 1).sort((a, b) => NBA.ovr(b.q) - NBA.ovr(a.q)).slice(0, 8);
    const mate = (x) => ({ name: x.q.name, team: x.t.nick, three: Math.round(x.q.attrs.three), ath: Math.round(x.q.attrs.ath), ovr: Math.round(NBA.ovr(x.q)) });
    return { three: three.map(mate), dunk: dunk.map(mate), young: young.map(mate), all };
  }
  const grant = (st, name) => {
    const rec = st.proSeasons[st.proSeasons.length - 1], f = flags(st).asw; if (!rec || !f) return;
    if (!rec.awards.includes(name)) { rec.awards.push(name); st.career.awards[name] = (st.career.awards[name] || 0) + 1; }
    (f.res.awards = f.res.awards || []).includes(name) || f.res.awards.push(name);
    st.legacy = (st.legacy || 0) + 1;
  };
  // a replay rebuilds the season record: put the weekend's awards back
  function reapply(st, rec) {
    const f = flags(st).asw; if (!f || f.year !== st.league.year || !f.res || !f.res.awards) return;
    f.res.awards.forEach((n) => { if (!rec.awards.includes(n)) { rec.awards.push(n); st.career.awards[n] = (st.career.awards[n] || 0) + 1; } });
  }
  const bump = (st, d) => { const D = NBA.Decisions; D.apply(st, [{ k: 'meter', f: 'media', d: d.media || 0 }]); if (d.brand) { const b = st.brand || (st.brand = { score: 0, deals: [], offers: null, earned: 0, year: null }); b.score = clamp(b.score + d.brand, 0, 100); } };

  // ---- the weekend: what you are invited to
  function start(st) {
    const f = flags(st), L = st.league, p = st.player;
    if (f.asw && f.asw.year === L.year) return !f.asw.done;
    const R = st.asRoster; if (!R || R.year !== L.year) return false;
    const P = pools(st), steps = ['intro'], inv = {};
    const threeRank = P.three.filter((x) => x.three > p.attrs.three).length, dunkRank = P.dunk.filter((x) => x.ath > p.attrs.ath).length;
    if ((p.yearsPro || 0) <= 1) { inv.rising = true; steps.push('rising'); }
    if (threeRank < 8 && p.attrs.three >= 76) { inv.three = true; steps.push('three'); }
    if (dunkRank < 6 && p.attrs.ath >= 82 && p.age <= 29 && NBA.ovr(p) < 86) { inv.dunk = true; steps.push('dunk'); }
    if (R.sel) { inv.game = true; steps.push('game'); }
    if (!steps.some((s) => s !== 'intro')) return false;
    steps.push('recap');
    f.asw = { year: L.year, steps, i: 0, inv, res: {}, last: null, done: false, sel: R.sel, starter: R.starter };
    if (R.sel) { NBA.Decisions.log(st, { kind: 'asw', title: 'All-Star', tone: 'good', text: 'Named an All-Star' + (R.starter ? ' and voted a starter.' : ' as a reserve, picked by the coaches.') }); }
    return true;
  }
  const active = (st) => { const f = flags(st).asw; return !!(f && f.year === st.league.year && !f.done); };
  function skip(st) { const f = flags(st); if (!(f.asw && f.asw.year === st.league.year)) f.asw = { year: st.league.year, steps: [], i: 0, inv: {}, res: {}, last: null, done: true }; else f.asw.done = true; }

  // ---- the events
  const sc3 = (st, q, rnd, mode) => 11 + (q.three - 72) * 0.22 + rnd() * 3.2 + (mode === 'money' ? (rnd() < 0.35 ? 4.5 : -3) : 0);
  function threeContest(st, key) {
    const rnd = rng(st, 'three|' + key), P = pools(st), p = st.player, npcs = P.three.slice().sort(() => rnd() - 0.5).slice(0, 7);
    const mine = { name: p.name, three: p.attrs.three, user: true }, field = [mine].concat(npcs.map((x) => ({ name: x.name, three: x.three })));
    field.forEach((x) => { x.r1 = r1(Math.max(4, sc3(st, x, rnd, x.user ? key : (rnd() < 0.3 ? 'money' : 'steady')))); });
    field.sort((a, b) => b.r1 - a.r1); const fin = field.slice(0, 3); fin.forEach((x) => { x.fin = r1(Math.max(4, sc3(st, x, rnd, x.user ? key : (rnd() < 0.3 ? 'money' : 'steady')))); });
    fin.sort((a, b) => b.fin - a.fin); const fi = fin.findIndex((x) => x.user), place = fi >= 0 ? fi + 1 : 4;
    return { field, fin, place, inFinal: fi >= 0, win: place === 1, champ: fin[0].name };
  }
  function dunkContest(st, key) {
    const rnd = rng(st, 'dunk|' + key), P = pools(st), p = st.player, npcs = P.dunk.slice().sort(() => rnd() - 0.5).slice(0, 3);
    const dunk = (ath, mode) => 37 + (ath - 80) * 0.3 + (mode === 'ambitious' ? (rnd() < 0.5 ? 9 : -8) : mode === 'prop' ? 3 + (rnd() - 0.5) * 6 : (rnd() - 0.5) * 4) + (rnd() - 0.5) * 4;
    const field = [{ name: p.name, ath: p.attrs.ath, user: true }].concat(npcs.map((x) => ({ name: x.name, ath: x.ath })));
    field.forEach((x) => { const m = x.user ? key : ['safe', 'ambitious', 'prop'][Math.floor(rnd() * 3)]; x.d1 = r1(clamp(dunk(x.ath, m), 20, 50)); x.d2 = r1(clamp(dunk(x.ath, x.user ? key : 'safe'), 20, 50)); x.tot = r1(x.d1 + x.d2); });
    field.sort((a, b) => b.tot - a.tot);
    return { field, place: field.findIndex((x) => x.user) + 1, win: field[0].user, champ: field[0].name };
  }
  function allStarGame(st, key) {
    const rnd = rng(st, 'game|' + key), R = st.asRoster, rec = st.proSeasons[st.proSeasons.length - 1], p = st.player;
    const avg = (l) => l.reduce((s, x) => s + x.ovr, 0) / Math.max(1, l.length), mine = R.E.some((x) => x.isUser) ? 'E' : 'W', opp = mine === 'E' ? 'W' : 'E';
    const pw = clamp(0.5 + 0.02 * (avg(R[mine]) - avg(R[opp])) + (key === 'compete' ? 0.012 : 0), 0.3, 0.7), won = rnd() < pw, margin = 2 + Math.floor(rnd() * 14), tot = 318 + Math.floor(rnd() * 30);
    const hi = Math.round((tot + margin) / 2), lo = tot - hi, f = won ? hi : lo, a = won ? lo : hi;
    const ppg = rec ? rec.pts : 15, k = { compete: 1.12, cruise: 0.8, showtime: 0.95 }[key] * (R.starter ? 1 : 0.85);
    const pts = Math.max(2, Math.round(ppg * 0.85 * k + (rnd() - 0.4) * 9)), reb = Math.max(0, Math.round((rec ? rec.reb : 5) * 0.65 * k + (rnd() - 0.5) * 4)), ast = Math.max(0, Math.round((rec ? rec.ast : 3) * 0.7 * k + (key === 'showtime' ? 3 : 0) + (rnd() - 0.5) * 3));
    const mins = R.starter ? 22 : 17, line = pts + 0.7 * (reb + ast) + (won ? 5 : 0) + (key === 'showtime' ? 3 : 0), best = 28 + rnd() * 12;
    const mvp = line > best && rnd() < 0.85;
    const npcMvp = (won ? R[mine] : R[opp]).filter((x) => !x.isUser)[Math.floor(rnd() * 3)] || { name: 'a star' };
    return { won, f, a, mine, pts, reb, ast, mins, mvp, mvpName: mvp ? p.name : npcMvp.name };
  }
  const risingStars = (st, key) => {
    const rnd = rng(st, 'rising|' + key), o = NBA.ovr(st.player), pw = clamp(0.5 + (key === 'allout' ? 0.03 : 0), 0.3, 0.7), won = rnd() < pw, rec = st.proSeasons[st.proSeasons.length - 1], k = key === 'allout' ? 1.1 : 0.85;
    const pts = Math.max(4, Math.round((rec ? rec.pts : 12) * 1.2 * k + (rnd() - 0.4) * 8)), mvp = key === 'allout' && won && pts >= 22 && rnd() < 0.5;
    return { won, pts, mvp, f: 150 + Math.floor(rnd() * 20), a: 140 + Math.floor(rnd() * 20) };
  };

  // ---- the screen's view: one step at a time
  const OPTS = {
    rising: [{ key: 'allout', label: 'Play to win', blurb: 'Rising Stars is a real game for bragging rights. Go hard.', vibe: 'Competitive' }, { key: 'fun', label: 'Have fun', blurb: 'Showtime passes and dunks. The fans love it.', vibe: 'Entertaining' }],
    three: [{ key: 'steady', label: 'Steady shooting', blurb: 'Trust the stroke, no money ball gambles.', vibe: 'Solid' }, { key: 'money', label: 'Money ball on every rack', blurb: 'Big swing: a hot night wins it, a cold one ends it early.', vibe: 'High variance' }],
    dunk: [{ key: 'safe', label: 'Clean and smooth', blurb: 'Polished dunks the judges always like.', vibe: 'Steady' }, { key: 'ambitious', label: 'Something nobody has seen', blurb: 'A 10 if it lands. A bad miss if it does not.', vibe: 'Risky' }, { key: 'prop', label: 'Bring a prop and a guest', blurb: 'Jump over a celebrity. The crowd will talk about it, the judges might not.', vibe: 'Showtime' }],
    game: [{ key: 'compete', label: 'Play like it counts', blurb: 'Hard defense, real minutes, chase the MVP.', vibe: 'Serious' }, { key: 'cruise', label: 'Cruise and enjoy it', blurb: 'Smile, trade jokes with the guys you guard all year.', vibe: 'Relaxed' }, { key: 'showtime', label: 'Showtime', blurb: 'Lobs, behind-the-back passes, a crowd-pleaser.', vibe: 'Entertainer' }],
  };
  const TITLE = { rising: 'Rising Stars', three: 'Three-Point Contest', dunk: 'Slam Dunk Contest', game: 'The All-Star Game' };
  function view(st) {
    const f = flags(st).asw, step = f.steps[f.i], R = st.asRoster || { E: [], W: [] };
    if (f.last) return { step, title: f.last.title, text: f.last.text, tone: f.last.tone, rows: f.last.rows, result: true, options: [] };
    if (step === 'intro') return { step, title: 'All-Star Weekend', text: R.sel ? (R.starter ? 'You were voted a starter.' : 'The coaches picked you as a reserve.') + ' The whole league is in town.' : 'You are not an All-Star this year, but you were invited to the weekend.', roster: R, invites: f.inv, options: [] };
    if (step === 'recap') return { step, title: 'Weekend recap', text: (f.res.lines || []).join(' ') || 'A quiet weekend.', awards: f.res.awards || [], options: [] };
    return { step, title: TITLE[step], text: { rising: 'Rookies and second-years play a showcase game. The hosts want you in it.', three: 'You are one of the best shooters in the league and the contest wants you.', dunk: 'Your athleticism got you an invite to the dunk contest.', game: 'You are in the game. How do you play it?' }[step], options: OPTS[step], canPass: step !== 'game' };
  }
  // answering the current step: runs it, files the result, applies what it earns
  function answer(st, key) {
    const f = flags(st).asw, step = f.steps[f.i], D = NBA.Decisions, p = st.player, lines = (f.res.lines = f.res.lines || []);
    if (f.last) throw new Error('continue first');
    if (step === 'intro' || step === 'recap') { if (step === 'recap') f.done = true; else f.i++; return { ok: true }; }
    if (key === 'pass' && step !== 'game') { lines.push('You passed on the ' + TITLE[step] + '.'); f.last = { title: TITLE[step], text: 'You sat it out and watched from the stands.', tone: 'neutral', rows: [] }; return f.last; }
    if (!OPTS[step].some((o) => o.key === key)) throw new Error('bad option');
    const feed = (kind, c) => NBA.Game.feedAdd(st, kind, c, { key: 'asw' + st.league.year + kind, at: null });
    let r;
    if (step === 'three') {
      const t = threeContest(st, key); f.res.three = { place: t.place, win: t.win };
      const text = t.win ? 'You won the Three-Point Contest. The final round was close and the building lost it.' : t.inFinal ? 'You made the final round and finished ' + ['', 'second', 'third'][t.place - 1] + ', behind ' + t.champ + '.' : 'You went out in the first round. ' + t.champ + ' won it.';
      if (t.win) { grant(st, 'Three-Point Contest Champion'); bump(st, { media: 1.5, brand: 4 }); feed('three', { name: p.name }); } else bump(st, { media: 0.3, brand: 1 });
      lines.push(t.win ? 'Won the Three-Point Contest.' : 'Three-Point Contest: ' + (t.inFinal ? 'finished ' + ['', '2nd', '3rd'][t.place - 1] + ' in the final' : 'out in round one') + '.');
      D.log(st, { kind: 'asw', title: 'Three-Point Contest', tone: t.win ? 'good' : 'neutral', text: text });
      r = { title: 'Three-Point Contest', text, tone: t.win ? 'good' : 'neutral', rows: t.field.map((x) => [x.name, x.r1, x.fin != null ? x.fin : '–']), cols: ['Shooter', 'Round 1', 'Final'] };
    } else if (step === 'dunk') {
      const d = dunkContest(st, key); f.res.dunk = { place: d.place, win: d.win };
      const text = d.win ? 'You won the Slam Dunk Contest. The perfect-score dunk is already the clip of the weekend.' : 'You finished ' + ['', 'second', 'third', 'last'][d.place - 1] + ' in the Slam Dunk Contest. ' + d.champ + ' took it.';
      if (d.win) { grant(st, 'Slam Dunk Contest Champion'); bump(st, { media: 1.5, brand: 5 }); feed('dunk', { name: p.name }); } else bump(st, { media: key === 'prop' ? 0.6 : 0.2, brand: key === 'prop' ? 2 : 1 });
      lines.push(d.win ? 'Won the Slam Dunk Contest.' : 'Slam Dunk Contest: finished ' + ['', '2nd', '3rd', '4th'][d.place - 1] + '.');
      D.log(st, { kind: 'asw', title: 'Slam Dunk Contest', tone: d.win ? 'good' : 'neutral', text });
      r = { title: 'Slam Dunk Contest', text, tone: d.win ? 'good' : 'neutral', rows: d.field.map((x) => [x.name, x.d1, x.d2, x.tot]), cols: ['Dunker', 'Dunk 1', 'Dunk 2', 'Total'] };
    } else if (step === 'rising') {
      const g = risingStars(st, key); f.res.rising = g;
      const text = (g.won ? 'Your team won Rising Stars ' : 'Your team lost Rising Stars ') + g.f + '-' + g.a + ' and you had ' + g.pts + ' points.' + (g.mvp ? ' You were named MVP.' : '');
      if (g.mvp) { grant(st, 'Rising Stars MVP'); bump(st, { media: 0.8, brand: 2 }); } else bump(st, { media: 0.3 });
      lines.push('Rising Stars: ' + (g.won ? 'won' : 'lost') + ', ' + g.pts + ' points' + (g.mvp ? ', MVP' : '') + '.');
      D.log(st, { kind: 'asw', title: 'Rising Stars', tone: g.won ? 'good' : 'neutral', text });
      r = { title: 'Rising Stars', text, tone: g.won ? 'good' : 'neutral', rows: [] };
    } else {
      const g = allStarGame(st, key); f.res.game = g;
      const text = 'The ' + (g.mine === 'E' ? 'East' : 'West') + ' ' + (g.won ? 'won' : 'lost') + ' ' + g.f + '-' + g.a + '. You had ' + g.pts + ' points, ' + g.reb + ' rebounds and ' + g.ast + ' assists in ' + g.mins + ' minutes.' + (g.mvp ? ' You were named All-Star Game MVP.' : ' ' + g.mvpName + ' took the MVP.');
      if (g.mvp) { grant(st, 'All-Star Game MVP'); bump(st, { media: 1.2, brand: 5 }); feed('asmvp', { name: p.name }); } else bump(st, { media: key === 'showtime' ? 0.5 : 0.2, brand: key === 'showtime' ? 2 : 1 });
      lines.push('All-Star Game: ' + (g.won ? 'won' : 'lost') + ' ' + g.f + '-' + g.a + ', ' + g.pts + '/' + g.reb + '/' + g.ast + (g.mvp ? ', MVP' : '') + '.');
      D.log(st, { kind: 'asw', title: 'All-Star Game', tone: g.mvp ? 'good' : 'neutral', text });
      r = { title: 'The All-Star Game', text, tone: g.mvp || g.won ? 'good' : 'neutral', rows: [[p.name, g.pts, g.reb, g.ast, g.mins]], cols: ['Player', 'PTS', 'REB', 'AST', 'MIN'] };
    }
    f.last = r; return r;
  }
  const next = (st) => { const f = flags(st).asw; f.last = null; f.i++; if (f.steps[f.i] === undefined) f.done = true; };
  NBA.AllStar = { build, start, active, skip, view, answer, next, reapply };
})(typeof window !== 'undefined' ? window : globalThis);
