(function (g) {
  'use strict';
  // The rest of an NBA life: free-agent meetings with strings attached, trade rumors and the buyout market, coaches with real power,
  // rivalries with a record, life away from the floor (and owning a piece of a team after it), teammates' and draft classmates' careers,
  // and lottery night. Human careers only (the bulk autopilot never calls any of it); every roll has its own seeded stream.
  const NBA = (g.NBA = g.NBA || {});
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const ovr = (p) => NBA.ovr(p);
  const DC = () => NBA.Decisions;
  const rng = (st, k) => DC().rng(st, k);
  const flags = (st) => DC().state(st).flags;
  const conf = (t) => (t.conf === 'E' ? 'East' : 'West');
  const ord = (n) => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
  const BIG = new Set(['Lakers', 'Knicks', 'Warriors', 'Bulls', 'Celtics', 'Clippers', 'Nets', 'Heat', '76ers']);
  const SMALL = new Set(['Grizzlies', 'Pelicans', 'Jazz', 'Thunder', 'Kings', 'Spurs', 'Hornets', 'Pacers', 'Bucks', 'Timberwolves', 'Trail Blazers']);
  const market = (t) => (BIG.has(t.nick) ? 'Big market: brighter lights, bigger brand, louder media' : SMALL.has(t.nick) ? 'Small market: quiet, loyal, fewer endorsements' : 'Mid-size market');
  const confRank = (L, t) => 1 + L.teams.filter((x) => x.conf === t.conf && x.id !== t.id && x.wins > t.wins).length;

  // ---------------------------------------------------------------- 1. free agency: the meeting, and "I sign if you get him"
  function pitchOf(st, teamId) {
    const L = st.league, t = L.teams[teamId]; if (!t) return null;
    const ros = NBA.rosterOf(L, t).filter((q) => q.id !== 'user'), me = ovr(st.player), r = confRank(L, t);
    const c = NBA.Room && NBA.Room.coachOf ? NBA.Room.coachOf(st, teamId) : null, fit = c && NBA.Room.STYLES ? NBA.Room.STYLES[c.style].like(st.player) : 0;
    const top = ros.slice(0, 2).map((q) => ({ id: q.id, name: q.name, ovr: Math.round(ovr(q)) })), above = ros.filter((q) => ovr(q) > me).length;
    const status = t.wins >= 50 ? 'Contender' : t.wins >= 42 ? 'Playoff team' : t.wins >= 33 ? 'Fringe team' : 'Rebuilding';
    const pitch = status === 'Contender' ? 'We are one piece away. You are the piece.' : status === 'Rebuilding' ? 'Come build something. It is your team from day one.' : 'You take us from good to dangerous.';
    return { teamId, nick: t.nick, status, rank: r, conf: conf(t), wins: t.wins, top, role: above === 0 ? 'the first option' : above === 1 ? 'the second option' : 'a supporting piece', coach: c ? { name: c.name, style: NBA.Room.STYLES ? NBA.Room.STYLES[c.style].label : c.style, fit } : null, market: market(t), pitch };
  }
  // the stars you could ask a suitor to get before you sign: they want you, so they listen; can it be done is up to the other team
  function faTargets(st, teamId) {
    const L = st.league, t = L.teams[teamId], me = ovr(st.player), out = [];
    L.teams.forEach((o) => { if (o.id === teamId || o.id === st.teamId) return; const q = NBA.rosterOf(L, o).filter((x) => x.id !== 'user')[0]; if (q && ovr(q) >= 78) out.push({ q, o }); });
    return out.sort((a, b) => ovr(b.q) - ovr(a.q)).slice(0, 4).map(({ q, o }) => {
      const sell = clamp(0.6 + (41 - o.wins) * 0.012 + (q.age >= 30 ? 0.12 : q.age <= 24 ? -0.1 : 0) - (ovr(q) - 82) * 0.012, 0.12, 0.9);
      const want = clamp(0.7 + (me - 80) * 0.025 + (st.career.awards['All-NBA'] || 0) * 0.02, 0.2, 0.95);
      return { id: q.id, name: q.name, ovr: Math.round(ovr(q)), age: q.age, team: o.nick, teamId: o.id, odds: Math.round(clamp(sell * want, 0.03, 0.85) * 100) };
    });
  }
  function faCondition(st, teamId, targetId) {
    const f = flags(st), L = st.league, k = (f.faCond = f.faCond || {}); if (k[teamId] === L.year) throw new Error('one ask per team');
    k[teamId] = L.year; const tg = faTargets(st, teamId).find((x) => x.id === targetId); if (!tg) throw new Error('not available');
    const t = L.teams[teamId], o = L.teams[tg.teamId], q = L.players[targetId], r = rng(st, 'facond|' + L.year + '|' + teamId + '|' + targetId)();
    if (r >= tg.odds / 100) { DC().log(st, { kind: 'trade', title: 'Free agency', tone: 'neutral', text: 'You told the ' + t.nick + ' you would sign if they got ' + q.name + '. The ' + o.nick + ' would not deal.' }); return { ok: false, text: 'The ' + t.nick + ' tried, but the ' + o.nick + ' would not move ' + q.name + '. Their offer to you still stands.' }; }
    const pool = NBA.rosterOf(L, t).filter((x) => x.id !== 'user').sort((a, b) => ovr(b) - ovr(a)), out = pool.find((x) => ovr(x) <= ovr(q) - 2) || pool[pool.length - 1];
    NBA.swapPlayers(L, t, out, o, q);
    (L.moves = L.moves || []).push({ year: L.year, phase: 'offseason', text: q.name + ' traded to the ' + t.nick + ' (' + out.name + ' to the ' + o.nick + ') as they chase ' + st.player.name, a: t.nick, b: o.nick });
    DC().log(st, { kind: 'trade', title: 'Free agency', tone: 'good', text: 'You told the ' + t.nick + ' you would sign if they got ' + q.name + '. They did it.' });
    if (NBA.Game && NBA.Game.feedAdd) NBA.Game.feedAdd(st, 'trade', { name: q.name, team: t.nick, old: o.nick }, { key: 'facond' + L.year, at: null });
    return { ok: true, text: 'Done: the ' + t.nick + ' traded for ' + q.name + ' (' + out.name + ' went the other way). Now it is on you to sign.' };
  }

  // ---------------------------------------------------------------- 2. the trade deadline as a player: rumors, then the buyout market
  const shownRec = (st, upto) => { const g0 = (st.matchLog || []).slice(0, upto).filter((x) => x.k === 'g' && !x.po); const w = g0.filter((x) => x.w).length; return { w, l: g0.length - w, n: g0.length }; };
  function rumorOpen(st) {
    const f = flags(st), L = st.league, idx = st.matchIdx || 0, it = (st.matchLog || [])[idx]; if (!it || it.po || f.rumorYear === L.year || !st.contract || st.contract.type === 'rookie') return null;
    const rc = shownRec(st, idx), pct = rc.n ? rc.w / rc.n : 0.5, me = ovr(st.player), fo = NBA.Core ? NBA.Core.foMood(st) : 0, r = rng(st, 'rumor|' + L.year)();
    const chance = (pct < 0.4 ? 0.55 : pct < 0.5 ? 0.25 : 0.06) + (fo <= -1 ? 0.25 : 0) + (st.contract.left === 1 ? 0.15 : 0) + (me >= 80 ? 0.1 : 0);
    if (r >= chance) return null; f.rumorYear = L.year;
    const suit = L.teams.filter((x) => x.id !== st.teamId).sort((a, b) => b.wins - a.wins).slice(0, 6), s = suit[Math.floor(rng(st, 'rumor2|' + L.year)() * suit.length)];
    return { idx, rec: rc.w + '-' + rc.l, suitor: s.nick, suitorId: s.id, text: 'Reports say the ' + L.teams[st.teamId].nick + ' (' + rc.w + '-' + rc.l + ') are listening to offers for you, and the ' + s.nick + ' have called twice. The deadline is in a few weeks.' };
  }
  function buyoutOpen(st) {
    const f = flags(st), L = st.league, idx = st.matchIdx || 0, it = (st.matchLog || [])[idx], p = st.player, c = st.contract; if (!it || it.po || f.buyoutYear === L.year || !c || c.left !== 1 || p.age < 29 || c.type === 'rookie') return null;
    const rc = shownRec(st, idx); if (!rc.n || rc.w / rc.n >= 0.42) return null; f.buyoutYear = L.year;
    const opts = L.teams.filter((x) => x.id !== st.teamId).sort((a, b) => b.wins - a.wins).slice(0, 3).map((t) => ({ teamId: t.id, nick: t.nick, rec: shownRec(st, idx).n ? null : null, role: NBA.rosterOf(L, t).filter((q) => q.id !== 'user' && ovr(q) > ovr(p)).length <= 2 ? 'a real rotation role' : 'minutes off the bench' }));
    return { idx, rec: rc.w + '-' + rc.l, opts, text: 'The ' + L.teams[st.teamId].nick + ' are ' + rc.w + '-' + rc.l + ' and going nowhere. Your contract ends this summer. The front office is open to a buyout: you give back a little money and pick any contender that wants you for the playoff run.' };
  }

  // ---------------------------------------------------------------- 3. coaches with real power
  const CFIRST = ['Mark', 'Dan', 'Andre', 'Joe', 'Will', 'Kevin', 'Sam', 'Marcus', 'J.B.', 'Luis'], CLAST = ['Ellison', 'Whitfield', 'Okoye', 'Brandt', 'Calloway', 'Rowe', 'Bianchi', 'Hale', 'Tatum-Ross', 'Varga'];
  function fireCoachOdds(st) {
    if (!NBA.Room || !NBA.Room.coachOf) return null; const ts = NBA.Core ? NBA.Core.teamStatus(st) : { listen: 40 }, c = NBA.Room.coachOf(st, st.teamId), fit = NBA.Room.fitOf(st), ten = st.league.year - c.since;
    return { coach: c, fit, odds: Math.round(clamp(ts.listen / 100 * (fit < 0 ? 0.8 : 0.45) * (ten <= 1 ? 0.5 : 1), 0.03, 0.85) * 100) };
  }
  function fireCoach(st) {
    const f = flags(st), L = st.league; if (f.fireYear === L.year) throw new Error('once a summer'); f.fireYear = L.year;
    const o = fireCoachOdds(st), r = rng(st, 'fire|' + L.year)(), t = L.teams[st.teamId];
    if (r >= o.odds / 100) { if (NBA.Core) NBA.Core.setFo(st, -0.8); DC().apply(st, [{ k: 'meter', f: 'media', d: -0.4 }, { k: 'meter', f: 'chem', d: -0.3 }]); DC().log(st, { kind: 'room', title: 'Coach', tone: 'bad', text: 'You went to the front office about ' + o.coach.name + '. They backed the coach, and everybody knows you tried.' }); return { ok: false, text: 'The front office backed ' + o.coach.name + '. It leaked, too: he knows you went over his head.' }; }
    const rr = rng(st, 'newcoach|' + L.year), keys = Object.keys(NBA.Room.STYLES), style = keys.find((k) => NBA.Room.STYLES[k].like(st.player) > 0) || keys[0];
    const nc = { name: CFIRST[Math.floor(rr() * CFIRST.length)] + ' ' + CLAST[Math.floor(rr() * CLAST.length)], style, since: L.year, n: (o.coach.n || 0) + 1 };
    f.coaches[st.teamId] = nc; f.newCoach = { year: L.year, from: o.coach.name, name: nc.name, style };
    (f.coachLog = f.coachLog || []).push({ y: L.year, team: t.nick, from: o.coach.name, to: nc.name, style, wins: t.wins, you: true });
    DC().apply(st, [{ k: 'meter', f: 'media', d: -0.2 }, { k: 'meter', f: 'locker', d: -0.2 }]);
    DC().log(st, { kind: 'room', title: 'Coach', tone: 'good', text: o.coach.name + ' was fired after you went to the front office. ' + nc.name + ' (' + NBA.Room.STYLES[style].label + ') takes over.' });
    return { ok: true, text: o.coach.name + ' is out. The new coach is ' + nc.name + ', ' + NBA.Room.STYLES[style].label + ', and the system fits you. The league noticed who made the call.' };
  }
  function benchOpen(st) {
    const f = flags(st), L = st.league, idx = st.matchIdx || 0, items = st.matchLog || [], it = items[idx]; if (!it || it.po || f.benchYear === L.year || !NBA.Room || !NBA.Room.fitOf) return null;
    if (NBA.Room.fitOf(st) >= 0 || ovr(st.player) >= 82) return null;
    const last = items.slice(0, idx).filter((x) => x.k === 'g' && !x.po && !x.dnp).slice(-10); if (last.length < 8) return null;
    const avg = last.reduce((a, x) => a + (x.r || 6.5), 0) / last.length; if (avg >= 6.5) return null;
    f.benchYear = L.year; const c = NBA.Room.coachOf(st, st.teamId);
    return { idx, coach: c.name, avg: Math.round(avg * 10) / 10, text: c.name + ' is cutting your minutes. Your last ten games averaged a ' + (Math.round(avg * 10) / 10).toFixed(1) + ' rating and he wants more from you in his system.' };
  }
  function cutMinutes(st, from, n, f) {
    let k = 0; (st.matchLog || []).forEach((x, i) => { if (i >= from && k < n && x.k === 'g' && !x.po && !x.dnp) { k++; x.m = Math.max(10, Math.round(x.m * f)); NBA.Game.scaleBox(st, x, { pts: f, ast: f, reb: f, def: f }); x.tg = (x.tg || []).concat(['Reduced role']); } });
  }

  // ---------------------------------------------------------------- 4. rivalries with a record
  function rivalRecord(st) {
    const f = flags(st), d = DC().state(st), rv = d.rival; if (!rv || !st.matchLog) return; const L = st.league, q = L.players[rv.id], tm = q && L.teams[q.teamId]; if (!tm) return;
    const book = f.rivalBook || (f.rivalBook = {}), key = L.year + ':' + rv.id; if (book[key]) return;
    const gs = st.matchLog.filter((x) => x.k === 'g' && !x.dnp && x.o === tm.nick), po = gs.filter((x) => x.po);
    book[key] = { y: L.year, team: tm.nick, w: gs.filter((x) => x.w).length, l: gs.filter((x) => !x.w).length, pts: gs.length ? Math.round(gs.reduce((a, x) => a + x.pt, 0) / gs.length * 10) / 10 : 0, po: po.length ? { w: po.filter((x) => x.w).length, l: po.filter((x) => !x.w).length, rnd: po[0].rnd } : null };
  }
  function rivalCard(st) {
    const d = DC().state(st), rv = d.rival; if (!rv) return null; const L = st.league, q = L.players[rv.id], f = flags(st), book = Object.values(f.rivalBook || {}).filter((x) => x && String(Object.keys(f.rivalBook).find((k) => f.rivalBook[k] === x)).endsWith(':' + rv.id));
    const w = book.reduce((a, x) => a + x.w, 0), l = book.reduce((a, x) => a + x.l, 0), meets = book.filter((x) => x.po), pw = meets.filter((x) => x.po.w > x.po.l).length;
    const me = st.career.awards || {}, his = (q && q.awd) || {}, score = (a) => 5 * (a.MVP || 0) + 4 * (a.Championships || a.Champion || 0) + 1.5 * (a['All-NBA'] || 0) + 0.6 * (a['All-Star'] || 0) + 2 * (a['Finals MVP'] || 0);
    const sm = score(me) + w * 0.05 + pw * 1.5, sh = score(his) + l * 0.05 + (meets.length - pw) * 1.5, share = Math.round(clamp(50 + (sm - sh) * 4, 5, 95));
    const hs = q && q.hist && q.hist.length ? q.hist[q.hist.length - 1] : null;
    return { name: rv.name, id: rv.id, since: rv.since, team: q && L.teams[q.teamId] ? L.teams[q.teamId].nick : 'retired', ovr: q ? Math.round(ovr(q)) : null, w, l, meets: meets.map((x) => ({ y: x.y, rnd: x.po.rnd, won: x.po.w > x.po.l, w: x.po.w, l: x.po.l })), seasons: book.length, his: hs ? { pts: Math.round(hs[4]) / 10 } : null, you: score(me), them: score(his), share, verdict: share >= 65 ? 'The debate is leaning your way.' : share <= 35 ? 'Right now most people take him.' : 'A real debate. Barbershops are split.' };
  }

  // ---------------------------------------------------------------- 6. life away from the floor, and owning a piece of a team
  const LIFE = {
    partner: { title: 'Someone special', text: 'You met someone this summer who has nothing to do with basketball, and it is serious.', opts: [['private', 'Keep it private', 'No posts, no red carpets. Just yours.', [{ k: 'meter', f: 'locker', d: 0.2 }]], ['public', 'Go public', 'The internet finds out. Some love it, some get weird about it.', [{ k: 'meter', f: 'media', d: 0.3 }]]] },
    wedding: { title: 'The wedding', text: 'You are getting married. Big or small?', opts: [['small', 'Small, family only', 'A quiet weekend with the people who matter.', [{ k: 'meter', f: 'locker', d: 0.3 }]], ['big', 'A huge wedding', 'Teammates, celebrities, a magazine cover. It costs a fortune.', [{ k: 'meter', f: 'media', d: 0.4 }], -2]] },
    kid: { title: 'A new baby', text: 'You are about to become a parent. The due date is in the season.', opts: [['miss', 'Miss games for the birth', 'Family first. You will miss a couple of games and nobody who matters will blame you.', [{ k: 'meter', f: 'locker', d: 0.4 }, { k: 'meter', f: 'media', d: 0.2 }]], ['play', 'Play through it', 'You will be there for what you can. The team needs you.', [{ k: 'season', v: { form: 0.004 } }, { k: 'meter', f: 'media', d: -0.2 }]]] },
    parents: { title: 'Take care of home', text: 'Your family still lives where you grew up.', opts: [['house', 'Buy your parents a house', 'The video of your mom crying goes viral.', [{ k: 'meter', f: 'media', d: 0.4 }], -3], ['later', 'Not yet', 'Save the money. There will be time.', []]] },
    foundation: { title: 'Give back', text: 'Your agent says it is time to start a foundation.', opts: [['found', 'Start a foundation', 'Courts, scholarships and a summer camp back home.', [{ k: 'meter', f: 'media', d: 0.5 }], -2], ['donate', 'Write a check quietly', 'No press release.', [{ k: 'meter', f: 'locker', d: 0.1 }], -1]] },
    business: { title: 'An investment', text: 'A friend from home wants you to put money into a business.', opts: [['tech', 'A tech start-up', 'Could triple. Could vanish.', [], 'tech'], ['food', 'A restaurant chain back home', 'Slow, steady, and your name on the door.', [], 'food'], ['pass', 'Pass', 'Basketball first.', []]] },
    city: { title: 'Your city', text: 'You have to decide how you live in this city.', opts: [['scene', 'Be part of the scene', 'Courtside at concerts, front row at fashion week. Brand up, a few late nights.', [{ k: 'meter', f: 'media', d: 0.3 }, { k: 'season', v: { form: -0.003 } }]], ['home', 'Stay home and stay locked in', 'Gym, family, film. Boring and effective.', [{ k: 'season', v: { form: 0.004 } }]]] },
  };
  function lifeOpen(st) {
    const f = flags(st), L = st.league, p = st.player, life = f.life || (f.life = {}); if (life.year === L.year || p.age < 21 || !st.contract) return life.year === L.year ? life.cur : null;
    life.year = L.year; life.cur = null; const r = rng(st, 'life|' + L.year), pool = [];
    if (!life.partner) pool.push('partner'); if (life.partner && !life.married && p.age >= 24) pool.push('wedding'); if (life.married && (life.kids || 0) < 3 && p.age >= 25) pool.push('kid');
    if (!life.parents) pool.push('parents'); if (!life.foundation && p.age >= 24) pool.push('foundation'); if ((life.biz || []).length < 2 && p.age >= 23) pool.push('business'); if (!life.cityDone || life.cityDone !== st.teamId) pool.push('city');
    if (!pool.length || r() < 0.3) return null; const key = pool[Math.floor(r() * pool.length)]; life.cur = { key, done: null }; return life.cur;
  }
  function lifeChoose(st, opt) {
    const f = flags(st), life = f.life, cur = life && life.cur; if (!cur || cur.done) throw new Error('no life event');
    const ev = LIFE[cur.key], o = ev.opts.find((x) => x[0] === opt); if (!o) throw new Error('no such option'); cur.done = opt;
    if (o[3] && o[3].length) DC().apply(st, o[3]);
    const cost = typeof o[4] === 'number' ? o[4] : 0; if (cost) st.earnings = Math.max(0, (st.earnings || 0) + cost);
    let text = o[2];
    if (cur.key === 'partner') life.partner = true; if (cur.key === 'wedding') life.married = true; if (cur.key === 'kid') life.kids = (life.kids || 0) + 1;
    if (cur.key === 'parents' && opt === 'house') life.parents = true; if (cur.key === 'foundation' && opt !== 'later') life.foundation = opt; if (cur.key === 'city') life.cityDone = st.teamId;
    if (cur.key === 'business' && opt !== 'pass') { const r = rng(st, 'biz|' + st.league.year)(), mult = opt === 'tech' ? (r < 0.25 ? 4 : r < 0.6 ? 1 : 0) : (r < 0.8 ? 1.6 : 0.6), stake = Math.round(Math.max(1, (st.earnings || 0) * 0.05)); (life.biz = life.biz || []).push({ kind: opt, stake, mult, y: st.league.year }); st.earnings = Math.max(0, (st.earnings || 0) - stake + Math.round(stake * mult)); text = opt === 'tech' ? (mult >= 4 ? 'The start-up got bought. Your $' + stake + 'M became $' + stake * 4 + 'M.' : mult === 1 ? 'The start-up is alive. You got your money back, for now.' : 'The start-up folded. $' + stake + 'M gone.') : (mult > 1 ? 'The restaurants are doing well: your $' + stake + 'M is worth $' + Math.round(stake * mult) + 'M.' : 'The restaurants are struggling. You lost some of your $' + stake + 'M.'); }
    DC().log(st, { kind: 'brand', title: ev.title, tone: 'neutral', text: ev.title + ': ' + text });
    return { text };
  }
  // after the career: buy a piece of a team (values are rough 2026 numbers, $M)
  function stakeOptions(st) {
    const money = st.earnings || 0, L = st.league;
    return L.teams.slice().sort((a, b) => (BIG.has(b.nick) ? 1 : 0) - (BIG.has(a.nick) ? 1 : 0) || a.nick.localeCompare(b.nick)).map((t) => { const val = BIG.has(t.nick) ? 7000 : SMALL.has(t.nick) ? 3500 : 4800, pct = [5, 2, 1].find((x) => val * x / 100 <= money * 0.6); return pct ? { teamId: t.id, nick: t.nick, value: val, pct, cost: Math.round(val * pct / 100) } : null; }).filter(Boolean).slice(0, 8);
  }
  function buyStake(st, teamId) {
    const o = stakeOptions(st).find((x) => x.teamId === teamId); if (!o) throw new Error('cannot afford'); st.after = st.after || {}; if (st.after.stake) throw new Error('already an owner');
    st.after.stake = { nick: o.nick, pct: o.pct, cost: o.cost }; st.earnings -= o.cost;
    return { text: 'You bought ' + o.pct + '% of the ' + o.nick + ' for about $' + o.cost + 'M. You are in the owners\' meetings now.' };
  }

  // ---------------------------------------------------------------- 7. teammates' and draft classmates' careers
  function mateNews(st) {
    const f = flags(st), L = st.league, t = L.teams[st.teamId]; if (!t) return [];
    const snap = f.mateOvr || {}, now = {}, out = [];
    NBA.rosterOf(L, t).filter((q) => q.id !== 'user').forEach((q) => { const o = Math.round(ovr(q)); now[q.id] = o; if (snap[q.id] != null && f.mateYear !== L.year) { const d = o - snap[q.id]; if (d >= 4) out.push('📈 ' + q.name + ' broke out: ' + snap[q.id] + ' → ' + o + ' OVR.'); else if (d <= -4) out.push('📉 ' + q.name + ' is slipping: ' + snap[q.id] + ' → ' + o + ' OVR' + (q.age >= 32 ? ' (age ' + q.age + ')' : '') + '.'); } });
    if (f.mateYear !== L.year) { f.mateYear = L.year; f.mateOvr = now; f.mateNewsList = out; }
    return f.mateNewsList || [];
  }
  function classmates(st) {
    const L = st.league, ids = (st.class || []).map((q) => q.id), out = [];
    ids.forEach((id) => { const q = L.players[id]; if (q && q.draftSlot) out.push({ id, name: q.name, slot: q.draftSlot, team: L.teams[q.teamId] ? L.teams[q.teamId].nick : 'free agent', ovr: Math.round(ovr(q)), awd: q.awd || {} }); });
    const gone = ids.length - out.length;
    return { list: out.sort((a, b) => a.slot - b.slot).slice(0, 14), best: out.slice().sort((a, b) => b.ovr - a.ovr).slice(0, 3), gone, you: st.draft && st.draft.slot ? st.draft.slot : null };
  }

  // ---------------------------------------------------------------- 8. lottery night and a say in the pick
  const LOT_ODDS = [14, 14, 14, 12.5, 10.5, 9, 7.5, 6, 4.5, 3, 2, 1.5, 1, 0.5];
  function lotteryInfo(st) {
    const L = st.league, t = L.teams[st.teamId]; if (!t) return null; const ranked = L.teams.slice().sort((a, b) => a.wins - b.wins), i = ranked.findIndex((x) => x.id === t.id);
    if (i >= 14) return null; const plan = L.draftPlan && L.draftPlan.year === L.year ? L.draftPlan : null;
    return { seed: i + 1, top1: LOT_ODDS[i], top4: Math.round(Math.min(100, LOT_ODDS[i] * 3.6) * 10) / 10, plan, pick: plan ? plan.order.indexOf(t.id) + 1 : null };
  }
  function runLottery(st) {
    const L = st.league; if (L.draftPlan && L.draftPlan.year === L.year) return L.draftPlan;
    const order = NBA.lotteryOrder(L).map((t) => t.id), cls = NBA.draftClass(L, 72).sort((a, b) => b.stock - a.stock).slice(0, 60);
    L.draftPlan = { year: L.year, order, cls, lobby: null }; return L.draftPlan;
  }
  function prospects(st) { const pl = runLottery(st); return pl.cls.slice(0, 10).map((q, i) => ({ id: q.id, name: q.name, pos: q.pos, age: q.age, ovr: Math.round(ovr(q)), rank: i + 1 })); }
  function lobby(st, prospectId) {
    const L = st.league, pl = runLottery(st); if (pl.lobby) throw new Error('already lobbied'); const slot = pl.order.indexOf(st.teamId) + 1, k = pl.cls.findIndex((q) => q.id === prospectId); if (k < 0) throw new Error('no such prospect');
    const ts = NBA.Core ? NBA.Core.teamStatus(st) : { listen: 50 }, reach = k + 1 < slot, r = rng(st, 'lobby|' + L.year)(), odds = clamp(ts.listen / 100 * (reach ? 0.6 : 1), 0.05, 0.95);
    if (k + 1 < slot) { pl.lobby = { id: prospectId, ok: false }; return { ok: false, text: pl.cls[k].name + ' will be gone before your pick (#' + slot + '). The front office cannot trade up this year.' }; }
    const ok = r < odds; pl.lobby = { id: prospectId, ok };
    if (ok) { const [q] = pl.cls.splice(k, 1); pl.cls.splice(slot - 1, 0, q); }
    DC().log(st, { kind: 'draft', title: 'Lottery night', tone: ok ? 'good' : 'neutral', text: ok ? 'You pushed for ' + pl.cls[slot - 1].name + ' and the front office took him at #' + slot + '.' : 'You pushed for a prospect; the front office went its own way at #' + slot + '.' });
    return { ok, text: ok ? 'The front office listened: they will take ' + pl.cls[slot - 1].name + ' at #' + slot + '.' : 'The front office thanked you and said they would draft their own board at #' + slot + '.' };
  }

  NBA.Story = { pitchOf, faTargets, faCondition, rumorOpen, buyoutOpen, fireCoachOdds, fireCoach, benchOpen, cutMinutes, rivalRecord, rivalCard, LIFE, lifeOpen, lifeChoose, stakeOptions, buyStake, mateNews, classmates, lotteryInfo, runLottery, prospects, lobby, market };
  if (typeof module !== 'undefined') module.exports = NBA;
})(typeof window !== 'undefined' ? window : globalThis);
