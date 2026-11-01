(function (g) {
  'use strict';
  // The NBA career's own levers: building your team, Team USA, chasing history, your game (badges, summers, load management),
  // playoff series as stories, teammates as people, summer league, the contract year. Everything is for a person playing
  // (the bulk autopilot never calls any of it), and every roll has its own seeded stream.
  const NBA = (g.NBA = g.NBA || {});
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const ovr = (p) => NBA.ovr(p);
  const DC = () => NBA.Decisions;
  const rng = (st, k) => DC().rng(st, k);
  const flags = (st) => DC().state(st).flags;

  // ---------------------------------------------------------------- 1. building your team
  // the front office's mood with you (-3..3): winning lifts it, pushing them lowers it
  const foMood = (st) => { const f = flags(st), k = 'fo' + st.teamId; return f[k] == null ? 0 : f[k]; };
  const setFo = (st, d) => { const f = flags(st), k = 'fo' + st.teamId; f[k] = clamp(Math.round(((f[k] || 0) + d) * 10) / 10, -3, 3); };
  const foLabel = (m) => (m >= 1.5 ? 'They will do almost anything for you' : m >= 0.5 ? 'Happy with you' : m > -0.5 ? 'Neutral' : m > -1.5 ? 'A little tired of your demands' : 'Frustrated with you');
  // where the team stands: conference rank now and over the last three years with you, and whether you are the franchise player.
  // The front office only listens when the squad needs it: a team that keeps finishing top 3 in its conference does not chase stars,
  // a franchise player carrying a weak team gets what he asks for.
  const confRankOf = (L, t) => 1 + L.teams.filter((x) => x.conf === t.conf && x.id !== t.id && x.wins > t.wins).length;
  function teamStatus(st) {
    const L = st.league, t = L.teams[st.teamId], f = flags(st); if (!t) return null;
    const cr = f.confRank || (f.confRank = {}); cr[L.year + ':' + t.id] = confRankOf(L, t);
    const rankNow = cr[L.year + ':' + t.id], recent = (st.proSeasons || []).filter((x) => x.teamId === t.id).slice(-3);
    const rankIn = (x) => cr[x.year + ':' + t.id] != null ? cr[x.year + ':' + t.id] : x.wins >= 53 ? 2 : x.wins >= 49 ? 4 : x.wins >= 44 ? 6 : x.wins >= 38 ? 9 : 12;
    const ranks = recent.length ? recent.map(rankIn) : [rankNow], top3 = ranks.filter((r) => r <= 3).length, avgRank = ranks.reduce((a, b) => a + b, 0) / ranks.length;
    const me = ovr(st.player), mates = NBA.rosterOf(L, t).filter((q) => q.id !== 'user' && q.id !== st.player.id), best = mates.length ? Math.max.apply(null, mates.map(ovr)) : 0;
    const last = recent[recent.length - 1] || {}, aw = (last.awards || []).join(' '), elite = /MVP|All-NBA/.test(aw) || (last.pts || 0) >= 26 || me >= 86, good = elite || /All-Star/.test(aw) || (last.pts || 0) >= 21 || me >= 81;
    const franchise = me >= best + 1 && me >= 78;
    const tier = top3 >= 2 || (ranks.length === 1 && rankNow <= 2) ? 'contender' : avgRank >= 9 || rankNow >= 10 ? 'weak' : 'middle';
    let listen = { contender: 0.06, middle: 0.45, weak: 0.75 }[tier];
    if (franchise) listen += tier === 'weak' ? 0.2 : tier === 'contender' ? 0.06 : 0.12; else listen *= me >= best - 2 ? 0.7 : 0.35;
    if (elite) listen += 0.1; else if (!good) listen -= 0.1;
    listen += foMood(st) * 0.04; listen = clamp(listen, 0.03, 0.95);
    const why = tier === 'contender' ? 'The ' + t.nick + ' finished top 3 in the ' + (t.conf === 'E' ? 'East' : 'West') + ' ' + top3 + ' of the last ' + ranks.length + ' years. The front office: "We are not breaking up a contender."'
      : tier === 'weak' ? (franchise ? 'You are the franchise and the team around you is not good enough (' + ord(rankNow) + ' in the ' + (t.conf === 'E' ? 'East' : 'West') + '). The front office knows it owes you help.' : 'The team is ' + ord(rankNow) + ' in the ' + (t.conf === 'E' ? 'East' : 'West') + ' and needs help, but you are not the player they are building around.')
      : (franchise ? 'A middle-of-the-pack team (' + ord(rankNow) + ' in the ' + (t.conf === 'E' ? 'East' : 'West') + ') with you as the face of it. They will listen, within reason.' : 'A middle-of-the-pack team (' + ord(rankNow) + ' in the ' + (t.conf === 'E' ? 'East' : 'West') + '), and the big calls are not yours to make yet.');
    return { tier, rankNow, ranks, top3, franchise, elite, listen: Math.round(listen * 100), why };
  }
  const ord = (n) => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
  // the stars you could bring in: the best player of other teams, plus a few top-60 players on bad teams
  function targets(st) {
    const L = st.league, mine = L.teams[st.teamId]; if (!mine) return [];
    const ts = teamStatus(st), out = [];
    L.teams.forEach((t) => { if (t.id === st.teamId) return; NBA.rosterOf(L, t).slice(0, 2).forEach((q, i) => { if (ovr(q) >= 76 && (i === 0 || t.wins < 38)) out.push({ q, t }); }); });
    return out.sort((a, b) => ovr(b.q) - ovr(a.q)).slice(0, 8).map(({ q, t }) => ({ id: q.id, name: q.name, pos: q.pos, age: q.age, ovr: Math.round(ovr(q)), team: t.nick, teamId: t.id, teamWins: t.wins, odds: pitchOdds(st, q, t, 'recruit', ts), push: pitchOdds(st, q, t, 'demand', ts) }));
  }
  // the chance a move happens = will the front office do it (the team's need, your standing) x can it be done (his team selling, his interest)
  function pitchOdds(st, q, t, how, ts) {
    ts = ts || teamStatus(st); const L = st.league, me = ovr(st.player), mine = L.teams[st.teamId], listen = ts.listen / 100;
    const sell = clamp(0.4 + (41 - t.wins) * 0.012 + (q.age >= 30 ? 0.12 : q.age >= 28 ? 0.05 : q.age <= 24 ? -0.12 : 0) - (ovr(q) - 82) * 0.015, 0.08, 0.9);
    const interest = clamp(0.35 + (me - 80) * 0.025 + (mine.wins - 41) * 0.006 + (t.wins < 35 ? 0.1 : 0) + (q.age >= 29 ? 0.08 : 0) + (flags(st).media || 0) * 0.01 + (NBA.Room && NBA.Room.fitOf ? 0.02 * NBA.Room.fitOf(st) : 0), 0.05, 0.95);
    const p = how === 'demand' ? Math.min(1, listen * 1.2) * sell : listen * Math.sqrt(sell * interest);
    return Math.round(clamp(p, 0.02, 0.8) * 100);
  }
  // recruit (his choice: a sign-and-trade he asks for) or demand (you push the front office to trade for him)
  function buildTeam(st, id, how) {
    const f = flags(st), L = st.league; if (f.builtYear === L.year) throw new Error('one big move a summer');
    const tg = targets(st).find((x) => x.id === id); if (!tg) throw new Error('not available');
    const r = rng(st, 'build|' + L.year + '|' + id + '|' + how)(), q = L.players[id], his = L.teams[tg.teamId], mine = L.teams[st.teamId];
    const ts = teamStatus(st), odds = (how === 'demand' ? tg.push : tg.odds) / 100; f.builtYear = L.year;
    if (how === 'demand') setFo(st, ts.tier === 'contender' ? -1 : -0.6);
    if (r >= odds) {
      if (how === 'demand') setFo(st, -0.6);
      DC().log(st, { kind: 'trade', title: 'Team building', tone: 'bad', text: how === 'demand' ? 'You pushed the front office to trade for ' + q.name + '. The ' + his.nick + ' said no, and your bosses did not enjoy the pressure.' : 'You recruited ' + q.name + ' all summer. He stayed with the ' + his.nick + '.' });
      const foNo = ts.listen < 35 && r < 1 - ts.listen / 100 * 0.6;
      return { ok: false, text: foNo ? (ts.tier === 'contender' ? 'The front office shut it down: "We are a top-3 team. We are not trading our depth for ' + q.name + '."' : 'The front office did not take your call seriously. You are not the one they are building around.') + (how === 'demand' ? ' Pushing them did not help your standing.' : '') : how === 'demand' ? 'The front office tried, but the ' + his.nick + ' would not move ' + q.name + '. Your bosses did not love being pushed.' : q.name + ' listened, thanked you, and stayed with the ' + his.nick + '.' };
    }
    // the deal: he comes over for your team's best non-star (the closest rating below him); salaries are left to the cap system's normal matching
    const pool = NBA.rosterOf(L, mine).filter((x) => x.id !== 'user' && x.id !== st.player.id).sort((a, b) => ovr(b) - ovr(a));
    const out = pool.find((x) => ovr(x) <= ovr(q) - 2) || pool[pool.length - 1];
    NBA.swapPlayers(L, mine, out, his, q);
    (L.moves = L.moves || []).push({ year: L.year, phase: 'offseason', text: q.name + ' joins the ' + mine.nick + ' (' + out.name + ' to the ' + his.nick + ') after ' + st.player.name + (how === 'demand' ? ' pushed for the trade' : ' recruited him'), a: mine.nick, b: his.nick });
    setFo(st, how === 'demand' ? 0.2 : 0.5); f.superteam = (f.superteam || 0) + (ovr(q) >= 85 ? 1 : 0);
    DC().apply(st, [{ k: 'meter', f: 'chem', d: -0.3 }, { k: 'meter', f: 'media', d: 0.3 }, { k: 'rel', id: q.id, name: q.name, d: 1 }]);
    DC().log(st, { kind: 'trade', title: 'Team building', tone: 'good', text: (how === 'demand' ? 'You pushed for it and the front office got it done: ' : 'Your recruiting worked: ') + q.name + ' (' + Math.round(ovr(q)) + ' OVR) joins you; ' + out.name + ' goes to the ' + his.nick + '.' });
    if (NBA.Game && NBA.Game.feedAdd) NBA.Game.feedAdd(st, 'trade', { name: q.name, team: mine.nick, old: his.nick }, { key: 'build' + L.year, at: null });
    return { ok: true, text: q.name + ' is coming! ' + out.name + ' heads to the ' + his.nick + ' in the deal.' + (ovr(q) >= 85 ? ' The timeline is already calling it a super team.' : '') };
  }
  // the front office's mood moves with the season (called once per offseason)
  function foSeason(st) { const f = flags(st), L = st.league; teamStatus(st); if (f.foYear === L.year) return; f.foYear = L.year; const t = L.teams[st.teamId]; if (t) setFo(st, t.wins >= 50 ? 0.4 : t.wins <= 30 ? -0.3 : 0.1); }

  // ---------------------------------------------------------------- 2. Team USA, the Olympics and the World Cup (or your own country)
  const NON_US = new Set(['Nikola Jokic', 'Nikola Jokić', 'Giannis Antetokounmpo', 'Luka Doncic', 'Luka Dončić', 'Victor Wembanyama', 'Shai Gilgeous-Alexander', 'Domantas Sabonis', 'Pascal Siakam', 'Rudy Gobert', 'Lauri Markkanen', 'Franz Wagner', 'Moritz Wagner', 'Alperen Sengun', 'Alperen Şengün', 'Kristaps Porzingis', 'Nikola Vucevic', 'Jonas Valanciunas', 'Jamal Murray', 'RJ Barrett', 'Luguentz Dort', 'Josh Giddey', 'Dyson Daniels', 'Dennis Schroder', 'Rui Hachimura', 'Deni Avdija', 'Bogdan Bogdanovic', 'Andrew Nembhard', 'Bennedict Mathurin', 'Zach Edey', 'Dillon Brooks', 'Kelly Olynyk', 'Jakob Poeltl', 'Alex Sarr', 'Zaccharie Risacher', 'Bilal Coulibaly', 'Josh Green', 'Joe Ingles', 'Patty Mills', 'Jusuf Nurkic', 'Ivica Zubac', 'Dario Saric', 'Clint Capela', 'Nikola Topić', 'Tidjane Salaün', 'Ousmane Dieng', 'Guerschon Yabusele', 'Josh Okogie', 'Precious Achiuwa', 'Jock Landale']);
  function intlYear(st) { const y = st.league.year + 1; return y % 4 === 0 ? { kind: 'Olympics', name: (y === 2028 ? 'LA' : y === 2032 ? 'Brisbane' : y === 2036 ? 'the' : 'the') + ' ' + y + ' Olympics', y } : y % 4 === 3 ? { kind: 'World Cup', name: 'the ' + y + ' FIBA World Cup', y } : null; }
  function nationalTeam(st) {
    const ev = intlYear(st); if (!ev || !st.contract) return null;
    const L = st.league, p = st.player, me = ovr(p), intl = st.origin && st.origin.intl, country = intl ? NBA.Intl.COUNTRIES[st.origin.country].name : 'USA';
    let pool = [];
    L.teams.forEach((t) => NBA.rosterOf(L, t).forEach((q) => { if (q.id !== 'user' && (intl ? false : !NON_US.has(q.name))) pool.push(q); }));
    pool.sort((a, b) => ovr(b) - ovr(a));
    const rank = 1 + pool.filter((q) => ovr(q) > me).length, picked = intl ? me >= 68 : rank <= (ev.kind === 'Olympics' ? 12 : 14) && p.age <= 37;
    return { ev, country, team: intl ? country : 'Team USA', picked, rank, mates: intl ? [] : pool.filter((q) => ovr(q) > me - 30).slice(0, 11).map((q) => q.name) };
  }
  function playNational(st, accept) {
    const nt = nationalTeam(st), f = flags(st), L = st.league; if (!nt || !nt.picked || f.natYear === nt.ev.y) throw new Error('not selected');
    f.natYear = nt.ev.y;
    if (!accept) { DC().log(st, { kind: 'brand', title: nt.team, tone: 'neutral', text: 'Declined ' + nt.team + ' for ' + nt.ev.name + ' to rest.' }); if (!st.origin) DC().apply(st, [{ k: 'meter', f: 'media', d: -0.2 }]); return { declined: true, text: 'You stayed home and rested. Some fans did not love it.' }; }
    const r = rng(st, 'natl|' + nt.ev.y), me = ovr(st.player), strength = nt.team === 'Team USA' ? (nt.ev.kind === 'Olympics' ? 1.35 : 0.9) : ({ spain: 0.6, france: 0.7, serbia: 0.8, germany: 0.7, greece: 0.4, slovenia: 0.4, lithuania: 0.2, turkey: 0.2, italy: 0.1, croatia: 0, uk: -0.8 })[st.origin && st.origin.country] || 0;
    const sc = strength + (me - 80) * 0.03 + (r() - 0.5) * 1.6, medal = sc >= 1.1 ? 'Gold' : sc >= 0.55 ? 'Silver' : sc >= 0.15 ? 'Bronze' : null, finish = medal ? medal + ' medal' : sc >= -0.4 ? 'Quarterfinals' : 'Group stage';
    const role = nt.team === 'Team USA' ? clamp(1 - (nt.rank - 1) / 14, 0.25, 1) : 1, games = nt.ev.kind === 'Olympics' ? 6 : 8;
    const pts = Math.round((role * (me - 52) * 0.55 + 4 + (r() - 0.5) * 3) * 10) / 10, reb = Math.round((2 + role * 4 + r() * 2) * 10) / 10, ast = Math.round((1 + role * 3 + r() * 2) * 10) / 10;
    const mvp = medal === 'Gold' && role >= 0.9 && r() < 0.45, aw = st.career.awards, key = nt.ev.kind === 'Olympics' ? 'Olympic ' + (medal || '') : 'World Cup ' + (medal || '');
    if (medal) { aw[key.trim() + ' medal'] = (aw[key.trim() + ' medal'] || 0) + 1; st.legacy = (st.legacy || 0) + (medal === 'Gold' ? (nt.ev.kind === 'Olympics' ? 2.5 : 1.5) : 0.8); }
    DC().apply(st, [{ k: 'meter', f: 'media', d: medal === 'Gold' ? 0.6 : 0.2 }, { k: 'season', v: { form: -0.003 } }]);
    if (NBA.Social && NBA.Social.change) NBA.Social.change(st, medal === 'Gold' ? 0.03 : 0.01);
    const text = nt.team + ' at ' + nt.ev.name + ': ' + finish + '. You averaged ' + pts + ' points, ' + reb + ' rebounds and ' + ast + ' assists in ' + games + ' games' + (mvp ? ', and you were named tournament MVP.' : '.');
    DC().log(st, { kind: 'award', title: nt.team, tone: medal ? 'good' : 'neutral', text });
    return { medal, finish, pts, reb, ast, games, mvp, text, mates: nt.mates };
  }

  // ---------------------------------------------------------------- 3. chasing history: the all-time lists (approximate career totals as of the start of 2026-27)
  const ALLTIME = {
    pts: [['LeBron James', 42900], ['Kareem Abdul-Jabbar', 38387], ['Karl Malone', 36928], ['Kobe Bryant', 33643], ['Michael Jordan', 32292], ['Kevin Durant', 31700], ['Dirk Nowitzki', 31560], ['Wilt Chamberlain', 31419], ['Shaquille O\'Neal', 28596], ['Carmelo Anthony', 28289], ['James Harden', 28100], ['Moses Malone', 27409], ['Elvin Hayes', 27313], ['Russell Westbrook', 26700], ['Hakeem Olajuwon', 26946], ['Oscar Robertson', 26710], ['Dominique Wilkins', 26668], ['Tim Duncan', 26496], ['Paul Pierce', 26397], ['John Havlicek', 26395], ['Kevin Garnett', 26071], ['Stephen Curry', 25900], ['DeMar DeRozan', 25700], ['Vince Carter', 25728], ['Alex English', 25613], ['Reggie Miller', 25279], ['Jerry West', 25192], ['Patrick Ewing', 24815], ['Ray Allen', 24505], ['Allen Iverson', 24368], ['Charles Barkley', 23757], ['Robert Parish', 23334], ['Adrian Dantley', 23177], ['Dwyane Wade', 23165], ['Elgin Baylor', 23149], ['Damian Lillard', 21900], ['Clyde Drexler', 22195], ['Gary Payton', 21813], ['Larry Bird', 21791], ['Hal Greer', 21586], ['Walt Bellamy', 20941], ['Pau Gasol', 20894], ['Bob Pettit', 20880], ['David Robinson', 20790], ['George Gervin', 20708], ['Chris Paul', 22300], ['Giannis Antetokounmpo', 22000], ['Kyrie Irving', 20000], ['Tom Chambers', 20049], ['Antawn Jamison', 20042]],
    reb: [['Wilt Chamberlain', 23924], ['Bill Russell', 21620], ['Kareem Abdul-Jabbar', 17440], ['Elvin Hayes', 16279], ['Moses Malone', 16212], ['Tim Duncan', 15091], ['Karl Malone', 14968], ['Robert Parish', 14715], ['Kevin Garnett', 14662], ['Dwight Howard', 14627], ['Nate Thurmond', 14464], ['Walt Bellamy', 14241], ['Wes Unseld', 13769], ['Hakeem Olajuwon', 13748], ['Shaquille O\'Neal', 13099], ['Buck Williams', 13017], ['Jerry Lucas', 12942], ['Bob Pettit', 12849], ['Charles Barkley', 12546], ['Dikembe Mutombo', 12359], ['LeBron James', 11900], ['Andre Drummond', 11100], ['Paul Silas', 10953], ['Dirk Nowitzki', 11489], ['Pau Gasol', 11305], ['Nikola Vucevic', 9800], ['Rudy Gobert', 9300], ['Kevin Love', 9400], ['Dennis Rodman', 11954], ['Patrick Ewing', 11607]],
    ast: [['John Stockton', 15806], ['Chris Paul', 12550], ['Jason Kidd', 12091], ['LeBron James', 11700], ['Steve Nash', 10335], ['Mark Jackson', 10334], ['Magic Johnson', 10141], ['Russell Westbrook', 10000], ['Oscar Robertson', 9887], ['James Harden', 9300], ['Isiah Thomas', 9061], ['Gary Payton', 8966], ['Andre Miller', 8524], ['Rod Strickland', 7987], ['Rajon Rondo', 7584], ['Maurice Cheeks', 7392], ['Lenny Wilkens', 7211], ['Terry Porter', 7160], ['Tim Hardaway', 7095], ['Tony Parker', 7036], ['Stephen Curry', 6700], ['Kyle Lowry', 7100], ['Mike Conley', 6400], ['Nikola Jokic', 5600], ['Luka Doncic', 5000]],
  };
  const MILES = { pts: [10000, 15000, 20000, 25000, 30000, 35000, 40000], reb: [5000, 10000, 15000], ast: [5000, 7500, 10000, 12500, 15000] };
  const LABEL = { pts: 'points', reb: 'rebounds', ast: 'assists' };
  function allTime(k, total) {
    const list = ALLTIME[k].slice().sort((a, b) => b[1] - a[1]), rank = 1 + list.filter((x) => x[1] > total).length, ahead = list.filter((x) => x[1] > total).slice(-2).reverse();
    return { rank, ahead: ahead.map((x) => ({ name: x[0], v: x[1], gap: x[1] - Math.round(total) })), passed: list.filter((x) => x[1] <= total).map((x) => x[0]) };
  }
  // new passes and milestones since the last check (each one once), for the toast, the journal and the feed
  function historyCheck(st, totals) {
    const f = flags(st), seen = f.hist || (f.hist = []), news = [];
    ['pts', 'reb', 'ast'].forEach((k) => {
      const t = totals[k] || 0, at = allTime(k, t);
      at.passed.forEach((nm) => { const key = k + ':' + nm; if (seen.indexOf(key) < 0) { seen.push(key); if (t > 0 && ALLTIME[k].find((x) => x[0] === nm)[1] > 2500) news.push('📈 You passed ' + nm + ' for #' + allTime(k, t + 0.1).rank + ' on the all-time ' + LABEL[k] + ' list.'); } });
      MILES[k].forEach((m) => { const key = k + '#' + m; if (t >= m && seen.indexOf(key) < 0) { seen.push(key); news.push('🏅 ' + m.toLocaleString('en-US') + ' career ' + LABEL[k] + '.'); } });
    });
    news.forEach((x) => DC().log(st, { kind: 'award', title: 'History', tone: 'good', text: x.replace(/^\S+\s/, '') }));
    return news;
  }

  // ---------------------------------------------------------------- 4. your game: badges, the summer program, load management
  const BADGES = [['three', 'Deadeye shooter'], ['mid', 'Mid-range maestro'], ['inside', 'Finisher'], ['passing', 'Floor general'], ['handling', 'Handles for days'], ['perD', 'Lockdown defender'], ['rimP', 'Rim protector'], ['reb', 'Glass cleaner'], ['ath', 'Athletic freak'], ['iq', 'Basketball genius'], ['ft', 'Automatic at the line'], ['dur', 'Iron man']];
  function badges(p) { const out = []; BADGES.forEach(([a, nm]) => { const v = p.attrs[a]; if (v >= 80) out.push({ a, name: nm, tier: v >= 95 ? 'Hall of Fame' : v >= 90 ? 'Gold' : v >= 85 ? 'Silver' : 'Bronze', v: Math.round(v) }); }); return out.sort((x, y) => y.v - x.v); }
  const LEGEND = { inside: ['Hakeem Olajuwon', 'post footwork'], mid: ['Kobe Bryant', 'the mid-range'], three: ['Stephen Curry', 'range'], passing: ['Steve Nash', 'vision'], perD: ['Kawhi Leonard', 'perimeter defense'], rimP: ['Dikembe Mutombo', 'rim protection'], reb: ['Dennis Rodman', 'rebounding'], handling: ['Kyrie Irving', 'handles'] };
  function summerOptions(st) {
    const p = st.player, w = NBA.data.ARCHETYPES[p.arch].weights, sk = Object.keys(LEGEND).sort((a, b) => w[b] * (100 - p.attrs[b]) - w[a] * (100 - p.attrs[a]))[0], lg = LEGEND[sk];
    return [
      { key: 'skills', label: 'Hire a skills coach', blurb: 'All summer in the gym: one extra upgrade point.', vibe: 'Steady' },
      { key: 'legend', label: 'Work out with ' + lg[0], blurb: 'Two weeks learning ' + lg[1] + ' from a legend: a real jump in that one skill.', vibe: 'Targeted', skill: sk, legend: lg[0] },
      { key: 'strength', label: 'Strength and conditioning', blurb: 'Fight the clock: athleticism and durability hold up better.', vibe: p.age >= 29 ? 'Smart at your age' : 'Building a body' },
      { key: 'rest', label: 'Rest and heal', blurb: 'No basketball for a month. Fresh legs, fewer injuries next season.', vibe: 'Recovery' },
      { key: 'brand', label: 'Sneaker tour and content', blurb: 'Grow your brand and your following. You lose a little training time.', vibe: 'Money and fame' },
    ];
  }
  function doSummer(st, key) {
    const f = flags(st), L = st.league, p = st.player; if (f.summerYear === L.year) throw new Error('summer already planned'); f.summerYear = L.year;
    const o = summerOptions(st).find((x) => x.key === key); if (!o) throw new Error('no such program');
    const bump = (a, d) => { p.attrs[a] = clamp(p.attrs[a] + d, 8, 99); if (p.target && p.target[a] != null) p.target[a] = clamp(p.target[a] + d * 0.6, 8, 99); };
    let text;
    if (key === 'skills') { st.bonusPoints = (st.bonusPoints || 0) + 1; text = 'A summer with a skills coach: one extra upgrade point.'; }
    else if (key === 'legend') { bump(o.skill, 2.2); text = 'You spent two weeks with ' + o.legend + ': your ' + NBA.data.ATTR_LABELS[o.skill].toLowerCase() + ' jumped.'; }
    else if (key === 'strength') { bump('ath', 1); bump('dur', 1); text = 'A strength and conditioning summer: your body holds up better.'; }
    else if (key === 'rest') { bump('dur', 1.5); f.restedYear = L.year + 1; text = 'You rested and healed. Fresh legs for the new season.'; }
    else { st.bonusPoints = (st.bonusPoints || 0) - 1; if (NBA.Social && NBA.Social.change) NBA.Social.change(st, 0.03); if (st.brand) st.brand.score = (st.brand.score || 0) + 3; text = 'A sneaker tour and a content summer: more followers and a bigger brand, a little less gym time.'; }
    DC().log(st, { kind: 'camp', title: 'Summer', tone: 'good', text });
    return { text };
  }
  // load management: rest some games to save the body (age 30+); costs games, saves wear, risks the 65-game rule
  const LOAD = { off: { label: 'Full load', miss: 0, save: 0 }, light: { label: 'Light rest (~6 games)', miss: 6, save: 0.4 }, heavy: { label: 'Heavy rest (~12 games)', miss: 12, save: 0.8 } };

  // ---------------------------------------------------------------- 5. playoff series as stories
  // where a series stands before a playoff game: its header, my wins, their wins
  function seriesState(st, idx) {
    const items = st.matchLog || [], it = items[idx]; if (!it || it.k !== 'g' || !it.po || it.pi) return null;
    let h = idx; while (h > 0 && items[h].k !== 'hdr') h--; let w = 0, l = 0; for (let i = h + 1; i < idx; i++) { const x = items[i]; if (x.k === 'g' && x.po) { if (x.w) w++; else l++; } }
    return { hdr: items[h], w, l, n: it.n };
  }
  function momentOf(st, idx) {
    const s = seriesState(st, idx); if (!s) return null; const it = st.matchLog[idx];
    if (it.g7 || it.cl) return null;
    if (s.w === 0 && s.l === 2) return { key: 'down02', title: 'Down 0-2', text: 'You are down 0-2 against the ' + it.o + '. Nobody has ever been this close to the end and felt fine.' };
    if (s.l === 3 && s.w < 3) return { key: 'elim', title: 'Win or go home', text: 'Game ' + it.n + '. Lose and your season is over.' };
    if (s.w === 3 && s.l < 3) return { key: 'closeout', title: 'Close it out', text: 'Game ' + it.n + ': one more win and you move on.' };
    if (s.w === 2 && s.l === 2) return { key: 'swing', title: 'Swing game', text: 'Tied 2-2. Game 5 decides who has the edge.' };
    return null;
  }
  const MOMENT_OPTS = {
    takeover: { label: 'Put the team on your back', blurb: 'More shots, more of everything. It might not be pretty.', pts: 1.25, ast: 0.9, reb: 1.05, def: 1, chem: 0, media: 0.3 },
    trust: { label: 'Trust the system', blurb: 'Make the right play every time and let the others eat.', pts: 0.92, ast: 1.3, reb: 1, def: 1, chem: 0.3, media: 0 },
    defense: { label: 'Take their best player', blurb: 'Your energy goes to the other end of the floor.', pts: 0.9, ast: 1, reb: 1.1, def: 1.6, chem: 0.2, media: 0.1 },
    callout: { label: 'Call out your teammates', blurb: 'Say it in the film room, and maybe in public. It could wake them up.', pts: 1.05, ast: 1.05, reb: 1, def: 1, chem: -0.5, media: 0.4 },
  };

  // ---------------------------------------------------------------- 6. teammates as people: captaincy, mentoring, the co-star, the teammate who wants out
  function captainCheck(st) {
    const L = st.league, t = L.teams[st.teamId], f = flags(st); if (!t || f.captain === st.teamId) return null;
    const yrs = (st.proSeasons || []).filter((s) => s.teamId === st.teamId).length, top = NBA.rosterOf(L, t).filter((q) => q.id !== 'user').filter((q) => ovr(q) > ovr(st.player)).length;
    if (yrs >= 3 && top <= 1 && st.player.age >= 23) { f.captain = st.teamId; DC().apply(st, [{ k: 'meter', f: 'chem', d: 0.5 }, { k: 'meter', f: 'locker', d: 0.5 }]); DC().log(st, { kind: 'room', title: 'Captain', tone: 'good', text: 'Named captain of the ' + t.nick + '.' }); return 'The ' + t.nick + ' named you team captain.'; }
    return null;
  }
  function mentees(st) { const L = st.league, t = L.teams[st.teamId]; if (!t || st.player.age < 27) return []; return NBA.rosterOf(L, t).filter((q) => q.id !== 'user' && q.age <= 23).slice(0, 2).map((q) => ({ id: q.id, name: q.name, age: q.age, pos: q.pos, ovr: Math.round(ovr(q)) })); }
  function mentor(st, id) {
    const f = flags(st), L = st.league; if (f.mentorYear === L.year) throw new Error('one mentee a summer'); const q = L.players[id]; if (!q) throw new Error('no such player'); f.mentorYear = L.year;
    Object.keys(q.attrs).forEach((a) => { if (a !== 'dur') q.attrs[a] = clamp(q.attrs[a] + 1.5, 8, 99); });
    st.bonusPoints = (st.bonusPoints || 0) - 1;
    DC().apply(st, [{ k: 'rel', id: q.id, name: q.name, d: 1.2 }, { k: 'meter', f: 'chem', d: 0.4 }, { k: 'meter', f: 'media', d: 0.2 }]);
    DC().log(st, { kind: 'room', title: 'Mentor', tone: 'good', text: 'Took ' + q.name + ' under your wing for the summer: he got better, you gave up some of your own gym time.' });
    return { text: q.name + ' is better for it (and so is the locker room). You lost one upgrade point of your own time.' };
  }
  // a teammate who cannot stand the situation asks out (low chemistry, a bad relationship)
  function unhappyTeammate(st) {
    const f = flags(st), L = st.league, t = L.teams[st.teamId]; if (!t || f.unhappyYear === L.year) return null; f.unhappyYear = L.year;
    if ((f.chem || 0) > -1.5) return null; const rel = DC().state(st).rel || {};
    const q = NBA.rosterOf(L, t).filter((x) => x.id !== 'user').find((x) => rel[x.id] && rel[x.id].v <= -0.5) || (rng(st, 'unhappy|' + L.year)() < 0.35 ? NBA.rosterOf(L, t).filter((x) => x.id !== 'user')[1] : null);
    if (!q) return null;
    const other = L.teams.filter((x) => x.id !== t.id)[Math.floor(rng(st, 'unhappy2|' + L.year)() * (L.teams.length - 1))], back = NBA.rosterOf(L, other).filter((x) => Math.abs(ovr(x) - ovr(q)) <= 5)[0] || NBA.rosterOf(L, other)[3];
    if (!back) return null; NBA.swapPlayers(L, t, q, other, back);
    (L.moves = L.moves || []).push({ year: L.year, phase: 'offseason', text: q.name + ' asked out of ' + t.nick + ' and was traded to the ' + other.nick + ' for ' + back.name, a: t.nick, b: other.nick });
    DC().apply(st, [{ k: 'meter', f: 'chem', d: 0.6 }, { k: 'meter', f: 'media', d: -0.3 }]);
    DC().log(st, { kind: 'room', title: 'Locker room', tone: 'bad', text: q.name + ' asked for a trade, citing the situation with you, and got it: he is a ' + other.nick + ' now (' + back.name + ' comes back).' });
    return q.name + ' asked for a trade, and the reports say you were the reason. He was dealt to the ' + other.nick + ' for ' + back.name + '.';
  }
  // the co-star: a teammate close to your level
  function coStar(st) { const L = st.league, t = L.teams[st.teamId]; if (!t) return null; const me = ovr(st.player); return NBA.rosterOf(L, t).filter((q) => q.id !== 'user').find((q) => ovr(q) >= 80 && Math.abs(ovr(q) - me) <= 4) || null; }

  // ---------------------------------------------------------------- 7. summer league (rookies) and the contract year
  function summerLeague(st) {
    const f = flags(st); if (f.summerLeague) return f.summerLeague;
    const p = st.player, me = ovr(p), r = rng(st, 'sl|' + st.league.year), pts = Math.round(((me - 55) * 0.85 + 11 + (r() - 0.5) * 6) * 10) / 10, reb = Math.round((3 + r() * 5) * 10) / 10, ast = Math.round((2 + r() * 4) * 10) / 10;
    const verdict = pts >= 22 ? 'Summer League MVP buzz' : pts >= 16 ? 'One of the standouts in Las Vegas' : pts >= 11 ? 'Solid, nothing loud' : 'A rough week in Las Vegas';
    f.summerLeague = { games: 5, pts: Math.max(2, pts), reb, ast, verdict, honor: pts >= 21 ? 'All-Summer League First Team' : null };
    DC().apply(st, [{ k: 'meter', f: 'media', d: pts >= 18 ? 0.3 : pts < 10 ? -0.2 : 0 }]);
    DC().log(st, { kind: 'draft', title: 'Summer League', tone: pts >= 16 ? 'good' : 'neutral', text: 'Summer League in Las Vegas: ' + f.summerLeague.pts + ' points, ' + reb + ' rebounds, ' + ast + ' assists a game. ' + verdict + '.' });
    return f.summerLeague;
  }

  NBA.Core = { foMood, foLabel, teamStatus, pitchOdds, targets, buildTeam, foSeason, nationalTeam, playNational, intlYear, allTime, historyCheck, ALLTIME, badges, summerOptions, doSummer, LOAD, seriesState, momentOf, MOMENT_OPTS, captainCheck, mentees, mentor, unhappyTeammate, coStar, summerLeague };
  if (typeof module !== 'undefined') module.exports = NBA;
})(typeof window !== 'undefined' ? window : globalThis);
