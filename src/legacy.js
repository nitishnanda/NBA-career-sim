(function (g) {
  // Off the court: an agent, a brand and its endorsements, and life after the last game (a jersey in the rafters, the Hall of Fame speech, what you do next).
  const NBA = (g.NBA = g.NBA || {});
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const hashS = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const rng = (key) => NBA.Reporters.mulberry(hashS(key));

  const AGENTS = [
    { id: 'shark', name: 'Rich Barron', tag: 'The Shark', blurb: 'Squeezes every dollar and every front office hates the phone call. About 5% more on contracts, and a big fee.', contract: 1.05, endorse: 1.0, fee: 0.05, brand: 1.0, trust: -0.01 },
    { id: 'guru', name: 'Maya Chen', tag: 'The Brand Builder', blurb: 'Turns you into a household name. Endorsements pay about half again as much and your brand grows faster.', contract: 1.0, endorse: 1.5, fee: 0.04, brand: 1.3, trust: 0 },
    { id: 'friend', name: 'Uncle Dre', tag: 'The Family Friend', blurb: 'Cheap, loyal, and he cares about you more than the number. A tiny fee, and clubs trust you a little more. Smaller deals.', contract: 0.98, endorse: 0.9, fee: 0.01, brand: 1.0, trust: 0.03 },
  ];
  const agentOf = (st) => AGENTS.find((a) => a.id === st.agent) || null;

  const SPONSORS = [
    { id: 'stride', name: 'Stride Athletics', cat: 'Shoes', share: 0.5, shoe: true, clause: 'image' }, { id: 'volt', name: 'VoltDrink', cat: 'Energy drink', share: 0.15, clause: 'none' },
    { id: 'crown', name: 'Crown Watches', cat: 'Luxury', share: 0.13, clause: 'image' }, { id: 'flex', name: 'FlexFit', cat: 'Fitness', share: 0.12, clause: 'none' },
    { id: 'gamma', name: 'Gamma Gaming', cat: 'Video games', share: 0.1, clause: 'none' }, { id: 'peak', name: 'Peak Insurance', cat: 'Insurance', share: 0.1, clause: 'image' },
    { id: 'mint', name: 'Mint Bank', cat: 'Banking', share: 0.1, clause: 'image' }, { id: 'hoopz', name: 'Hoopz Cereal', cat: 'Breakfast', share: 0.08, clause: 'image' },
    { id: 'atlas', name: 'Atlas Motors', cat: 'Cars', share: 0.14, clause: 'none' }, { id: 'tempo', name: 'Tempo Social', cat: 'Social posts', share: 0.07, clause: 'none', social: 500 },
  ];
  const brandOf = (st) => (st.brand ? st.brand.score : 0);
  // what a player's name is worth each year, as a share of the salary cap (a 100 brand is worth about 45% of the cap, a 50 brand about 10%)
  const poolM = (st) => NBA.capFor(st.league.year) * 0.45 * Math.pow(clamp(brandOf(st), 0, 100) / 100, 2.2);
  function brandTarget(st) {
    const L = st.league, p = st.player, rec = st.proSeasons[st.proSeasons.length - 1], a = (rec && rec.awards) || [], D0 = NBA.Decisions.state(st), pr = D0.flags.pr || { tally: [] };
    let raw = 0.5 * Math.max(0, NBA.ovr(p) - 58);
    if (a.includes('All-Star')) raw += 4; if (a.some((x) => /^All-NBA/.test(x))) raw += 7; if (a.includes('MVP')) raw += 14; if (a.includes('NBA Champion')) raw += 10; if (a.includes('Finals MVP')) raw += 6;
    raw += 0.7 * clamp(D0.flags.media || 0, -8, 8);
    const persona = NBA.Reporters.personaOf(pr.tally); raw += { entertainer: 4, villain: 3, humble: 2, confident: 2, guarded: 0, open: 0 }[persona] || 0;
    if (st.draft && st.draft.slot && st.draft.slot <= 3) raw += 5;
    if (rec && rec.gp >= 40 && rec.pts >= 25) raw += 3;
    if (NBA.Social) raw += clamp(Math.log10(Math.max(1, NBA.Social.state(st).f / 50)) * 3, 0, 8);   // reach is part of a brand
    return clamp(raw, 0, 100);
  }
  // once a year, at the offseason: the brand moves toward what you were this year, the deals pay out (less the agent's cut) and the clauses are checked
  function brandYear(st) {
    const L = st.league, ag = agentOf(st) || { fee: 0.03, endorse: 1, brand: 1 }; if (!st.brand) st.brand = { score: 0, deals: [], offers: null, earned: 0, year: null };
    const b = st.brand; if (b.year === L.year) return null; b.year = L.year;
    const D0 = NBA.Decisions, media = D0.state(st).flags.media || 0, notes = [];
    const t = brandTarget(st); b.score = clamp(b.score + (t - b.score) * (t > b.score ? 0.4 * ag.brand : 0.3), 0, 100);
    const salary = st.contract ? st.contract.salary : 0, cap = NBA.capFor(L.year);
    let income = 0;
    b.deals = b.deals.filter((d) => {
      if (d.clause === 'image' && media <= -3) { notes.push(d.name + ' dropped you over your image.'); b.score = clamp(b.score - 3, 0, 100); return false; }
      income += d.annual; d.years--; if (d.years <= 0) { notes.push('The ' + d.name + ' deal ran out.'); return false; } return true;
    });
    const net = income * (1 - ag.fee) - salary * ag.fee;   // the agent's cut of the endorsements and of the salary (the salary itself was counted at season end)
    st.earnings = Math.max(0, st.earnings + net); st.earnings26 = Math.max(0, (st.earnings26 || 0) + net / cap * NBA.capFor(2026)); b.earned = (b.earned || 0) + income * (1 - ag.fee);
    b.offers = null;
    if (income > 0 || notes.length) D0.log(st, { kind: 'brand', title: 'Business', tone: notes.length && !income ? 'bad' : 'good', text: (income > 0 ? 'Endorsements paid $' + Math.round(income * 10) / 10 + 'M this year (brand ' + Math.round(b.score) + '). ' : '') + notes.join(' ') });
    return { income, notes };
  }
  // new offers for the summer: better brands get more, and bigger names get the shoe deal
  function endorseOffers(st) {
    const L = st.league, b = st.brand || (st.brand = { score: 0, deals: [], offers: null, earned: 0 }), ag = agentOf(st) || { endorse: 1 };
    if (b.offers) return b.offers;
    const rnd = rng('endorse|' + st.player.name + '|' + L.year), sc = b.score, n = sc >= 75 ? 3 : sc >= 50 ? 2 : sc >= 25 ? 1 : 0, taken = new Set(b.deals.map((d) => d.id)), hasShoe = b.deals.some((d) => d.shoe);
    const fol = NBA.Social ? NBA.Social.state(st).f : 0, pool = SPONSORS.filter((s) => !taken.has(s.id) && !(s.shoe && hasShoe) && !(s.social && fol < s.social)).map((s) => [rnd() + (s.shoe ? -0.4 * (sc >= 60 ? 1 : 0) : 0), s]).sort((x, y) => x[0] - y[0]).slice(0, n).map((x) => x[1]);
    const total = poolM(st) * ag.endorse * (NBA.Social ? NBA.Social.mult(st) : 1);
    b.offers = pool.map((s) => ({ id: s.id, name: s.name, cat: s.cat, shoe: !!s.shoe, clause: s.clause, years: 1 + Math.floor(rnd() * 3), annual: Math.round(Math.max(0.2, total * s.share * (0.8 + 0.4 * rnd())) * 10) / 10, state: null }));
    return b.offers;
  }
  function answerOffer(st, id, accept) {
    const b = st.brand, o = b && b.offers && b.offers.find((x) => x.id === id); if (!o || o.state) throw new Error('no such offer');
    if (accept && b.deals.length >= 4) throw new Error('too many deals');
    o.state = accept ? 'yes' : 'no';
    if (accept) {
      b.deals.push({ id: o.id, name: o.name, cat: o.cat, shoe: o.shoe, clause: o.clause, years: o.years, annual: o.annual });
      if (o.shoe && b.score >= 80) { b.score = clamp(b.score + 4, 0, 100); }
      NBA.Decisions.log(st, { kind: 'brand', title: 'Endorsement', tone: 'good', text: 'Signed with ' + o.name + ' (' + o.cat.toLowerCase() + '): $' + o.annual + 'M a year for ' + o.years + ' year' + (o.years > 1 ? 's' : '') + (o.clause === 'image' ? ' with an image clause.' : '.') });
      NBA.Game.feedAdd(st, 'endorse', { brand: o.name }, { key: 'end' + st.league.year + o.id, at: null });
    }
    return o;
  }

  // ---------------------------------------------------------------- life after
  const teamSeasons = (st) => { const m = {}; st.proSeasons.forEach((s) => { m[s.teamId] = (m[s.teamId] || 0) + 1; }); return m; };
  function jerseyInfo(st) {
    const m = teamSeasons(st), ids = Object.keys(m).sort((a, b) => m[b] - m[a]), id = ids[0]; if (id == null) return null;
    const years = m[id], titles = st.proSeasons.filter((s) => String(s.teamId) === String(id) && (s.awards || []).includes('NBA Champion')).length, hof = st.hof ? st.hof.score : 0;
    if (!(years >= 5 && (hof >= 45 || titles >= 1))) return null;
    const team = st.league.teams[+id], num = 1 + (hashS(st.player.name) % 98);
    return { teamId: +id, team: team.name, nick: team.nick, years, titles, num };
  }
  const SPEECH = {
    humble: { label: 'Thank everyone', blurb: 'Teammates, coaches, family, fans. No ego.', bonus: 1, text: 'You thanked every person who got you here and left the building in tears.' },
    emotional: { label: 'Let it all out', blurb: 'The whole journey, the doubters, the sacrifice. Not a dry eye.', bonus: 2, text: 'You told the whole story, the doubters and the sacrifice, and nobody in the building was dry-eyed.' },
    funny: { label: 'Bring the jokes', blurb: 'Roast your old teammates and make the room cry laughing.', bonus: 1.5, text: 'You roasted your old teammates for ten minutes and had the room in stitches.' },
    defiant: { label: 'Settle the scores', blurb: 'Name the doubters. Mention the rings. Walk off.', bonus: -1, text: 'You named the doubters one by one. It was the most talked-about speech in years, for better and for worse.' },
  };
  const PATHS = {
    coach: { label: 'Coaching', blurb: 'Start as an assistant and work toward a head job. Rewards a high basketball IQ.', fit: (st) => st.player.attrs.iq },
    analyst: { label: 'TV analyst', blurb: 'A seat at the desk. Rewards a big personality and a strong brand.', fit: (st) => 40 + 0.4 * brandOf(st) + 4 * (NBA.Decisions.state(st).flags.media || 0) },
    gm: { label: 'Front office', blurb: 'Build teams from the executive suite. Rewards IQ and relationships.', fit: (st) => 0.7 * st.player.attrs.iq + 6 * Math.min(4, Object.keys(NBA.Decisions.state(st).rel).length) },
    business: { label: 'Business and ownership', blurb: 'Ventures, investments and maybe a minority stake in a club. Rewards money and brand.', fit: (st) => 30 + 0.4 * brandOf(st) + 6 * Math.log10(1 + (st.earnings26 || 0)) },
    family: { label: 'Step away', blurb: 'A foundation, youth camps, and a quiet life. Nothing to prove.', fit: () => 55 },
  };
  // a few milestones per path, rolled from the career (own stream); each adds a little to the legacy
  function simulatePath(st, key) {
    const rnd = rng('path|' + st.player.name + '|' + key), p = st.player, a = st.career.awards || {}, iq = p.attrs.iq, ms = [], ret = p.age, titles = a.Championships || 0, name = p.name, hof = st.hof ? st.hof.score : 0;
    const team = (st.league.teams[st.teamId] || {}).name || 'a club', br = brandOf(st); let bonus = 0;
    const add = (age, text, tone, b) => { ms.push({ age, text, tone: tone || 'neutral' }); bonus += b || 0; };
    if (key === 'coach') {
      add(ret + 3, 'Joined ' + team + ' as an assistant coach.', 'good', 0.5);
      if (rnd() < clamp(0.2 + (iq - 60) * 0.012 + (titles ? 0.1 : 0), 0.12, 0.8)) {
        const yrs = 6 + Math.floor(rnd() * 8); let t = 0; for (let i = 0; i < yrs; i++) if (rnd() < 0.05 + 0.002 * iq * (hof >= 85 ? 1.5 : 1)) t++;
        add(ret + 8, 'Named head coach of ' + team + '. ' + name + ' brought the players\' respect and a championship résumé.', 'good', 2);
        if (t) add(ret + 8 + yrs, 'Won ' + t + ' title' + (t > 1 ? 's' : '') + ' as a head coach over ' + yrs + ' seasons.', 'good', 3 + 3 * t); else add(ret + 8 + yrs, 'Coached ' + yrs + ' seasons: respected, never a champion.', 'neutral', 1);
        if (rnd() < 0.18) add(ret + 12, 'Coach of the Year.', 'good', 2);
      } else add(ret + 10, 'Never got the head job. A respected assistant for twenty years.', 'neutral', 1);
    } else if (key === 'analyst') {
      const star = rnd() < clamp(0.2 + br / 130 + 0.04 * (NBA.Decisions.state(st).flags.media || 0), 0.1, 0.85);
      add(ret + 1, 'Joined a national network as a studio analyst.', 'good', 0.5);
      if (star) add(ret + 5, 'Became the face of the desk: the catchphrases, the takes, the clips that go everywhere.', 'good', 3);
      else add(ret + 5, 'A solid, quiet analyst. Nobody shouts about him, nobody shouts at him.', 'neutral', 1);
      if (rnd() < 0.2) add(ret + 9, 'Got into hot water over a live comment and was suspended for a month.', 'bad', -1);
      if (rnd() < 0.3) add(ret + 10, 'Launched a podcast that went to number one.', 'good', 1.5);
    } else if (key === 'gm') {
      add(ret + 2, 'Started in the front office as a special assistant.', 'good', 0.5);
      const ok = rnd() < clamp(0.2 + (iq - 60) * 0.01, 0.1, 0.7);
      if (ok) { const t = rnd() < 0.3 ? 1 + (rnd() < 0.3 ? 1 : 0) : 0; add(ret + 8, 'Became general manager of ' + team + '.', 'good', 2); if (t) add(ret + 14, 'Built a champion: ' + t + ' title' + (t > 1 ? 's' : '') + ' as an executive.', 'good', 3 + 3 * t); else add(ret + 14, 'Built a perennial playoff team and kept a good name.', 'neutral', 1.5); if (rnd() < 0.15) add(ret + 15, 'Executive of the Year.', 'good', 2); }
      else add(ret + 8, 'Never got the top chair. A trusted adviser to three general managers.', 'neutral', 1);
    } else if (key === 'business') {
      const w = (st.earnings26 || 0) / 1000;   // billions of 2026 dollars
      add(ret + 1, 'Launched a venture fund and a shoe-and-apparel company.', 'good', 1);
      const hit = rnd() < clamp(0.2 + br / 200 + w / 4, 0.1, 0.7);
      if (hit) add(ret + 7, 'One of the ventures took off: a household brand and a fortune that dwarfs the playing contracts.', 'good', 3); else add(ret + 7, 'The ventures were up and down: comfortable, not spectacular.', 'neutral', 1);
      if (rnd() < 0.25) add(ret + 11, 'Bought a minority stake in an NBA club.', 'good', 2);
    } else {
      add(ret + 1, 'Stepped away from the game completely: a foundation, youth camps, and a quiet life.', 'good', 1.5);
      if (rnd() < 0.5) add(ret + 8, 'The foundation built courts and classrooms in the old neighborhood.', 'good', 1.5);
      if (rnd() < 0.2) add(ret + 15, 'Eventually could not resist: came back to run a youth academy.', 'good', 1);
    }
    return { ms, bonus: Math.round(bonus * 10) / 10 };
  }
  function pathOptions(st) { return Object.keys(PATHS).map((k) => ({ key: k, label: PATHS[k].label, blurb: PATHS[k].blurb, fit: Math.round(PATHS[k].fit(st)) })).map((o) => Object.assign(o, { read: o.fit >= 72 ? 'Natural fit' : o.fit >= 55 ? 'Decent fit' : 'Long shot' })); }


  // ---------------------------------------------------------------- the afterlife: ceremonies and the next chapter, each done once from the retirement page
  const after = (st) => st.after || (st.after = { jersey: null, speech: null, path: null });
  function afterlife(st) { const a = after(st); return { jersey: NBA.Legacy.jerseyInfo(st), hall: !!(st.hof && st.hof.hall), done: a }; }
  const bump = (st, b) => { if (st.hof) st.hof.score = Math.round((st.hof.score + b) * 10) / 10; };
  function doJersey(st) {
    const a = after(st), j = jerseyInfo(st); if (!j || a.jersey) throw new Error('no ceremony');
    a.jersey = j; bump(st, 2);
    NBA.Decisions.log(st, { kind: 'brand', title: 'Jersey retired', tone: 'good', text: 'The ' + j.nick + ' raised #' + j.num + ' to the rafters after ' + j.years + ' seasons' + (j.titles ? ' and ' + j.titles + ' title' + (j.titles > 1 ? 's' : '') : '') + '.' });
    NBA.Game.feedAdd(st, 'jersey', { team: j.nick, num: j.num }, { key: 'jersey', at: null }); return j;
  }
  function doSpeech(st, key) {
    const a = after(st), sp = SPEECH[key]; if (!sp || a.speech || !(st.hof && st.hof.hall)) throw new Error('no speech');
    a.speech = key; bump(st, sp.bonus);
    NBA.Decisions.log(st, { kind: 'brand', title: 'Hall of Fame', tone: sp.bonus < 0 ? 'neutral' : 'good', text: sp.text });
    NBA.Game.feedAdd(st, 'hof', {}, { key: 'hof', at: null }); return sp;
  }
  function doPath(st, key) {
    const a = after(st); if (!PATHS[key] || a.path) throw new Error('no path');
    const r = simulatePath(st, key); a.path = { key, ms: r.ms, bonus: r.bonus }; bump(st, r.bonus);
    NBA.Decisions.log(st, { kind: 'brand', title: 'After basketball', tone: 'good', text: PATHS[key].label + ': ' + r.ms.map((m) => m.text).join(' ') });
    NBA.Game.feedAdd(st, 'path', {}, { key: 'path', at: null }); return a.path;
  }

  // ---------------------------------------------------------------- the next chapter, played: four decisions over the years, each with a roll that your fit for the work moves
  const O = (label, blurb, vibe, p, ok, no, bOk, bNo, ms) => ({ label, blurb, vibe, p, ok, no, bOk, bNo, ms });
  const STEPS = {
    coach: [
      { age: 2, title: 'Your first coaching job', text: 'Everyone wants the star who just retired on their bench. Where do you start?', opts: [
        O('Assistant under a legend', 'Learn the craft from a Hall of Fame coach and build a name.', 'Safe', 0.82, 'You soaked up everything and the head coach started handing you the game plans.', 'It was a grind of film and fetching, but you learned how a staff works.', 1, 0.3, 'Started as an assistant under a legend.'),
        O('Player-development coach', 'Work one on one with the young guys.', 'Steady', 0.7, 'Your guys got better fast and the league noticed who coached them.', 'Not every project grows, but the staff valued the work ethic.', 1.2, 0.4, 'Became a player-development coach.'),
        O('Head coach at a college', 'Skip the line, take your own program.', 'Risky', 0.45, 'The program took off and every NBA team put you on its list.', 'A tough job, a losing record and a lot of lessons.', 2, -0.3, 'Took a college head-coaching job.')] },
      { age: 6, title: 'A head-coaching vacancy', text: 'A job is open. A rebuilding club wants you, a contender wants to wait on you.', opts: [
        O('Take the rebuilding job', 'A young roster, patience and a long runway.', 'High variance', 0.5, 'The kids bought in, the culture changed and the wins started to come.', 'It was too early and too thin. They moved on after two seasons.', 2.5, 0.2, 'Took over a rebuilding team as head coach.'),
        O('Wait for a contender', 'Stay on staff until a real job opens.', 'Patient', 0.6, 'The call came from a winning club and you inherited a real roster.', 'The call never came. You stayed an assistant, respected and passed over.', 3, 0.5, 'Waited for the right head job.'),
        O('Go back to college for now', 'Rebuild your résumé as a head coach.', 'Safe', 0.7, 'A deep tournament run put you back in the NBA conversation.', 'A quiet few seasons that did little for your stock.', 1, 0.2, 'Went back to the college ranks.')] },
      { age: 9, title: 'Build your staff', text: 'You have the chair and a budget. Who sits next to you?', opts: [
        O('Veteran assistants', 'Experience in every seat.', 'Steady', 0.62, 'The room trusted the bench and the team played like it.', 'Too much old thinking and the game passed you by.', 1.5, 0, 'Hired a veteran staff.'),
        O('Young analytics minds', 'New ideas, a new style.', 'Bold', 0.5, 'The numbers found edges nobody else saw and it showed in the standings.', 'The players did not buy the spreadsheets.', 2, -0.3, 'Hired a young analytics staff.'),
        O('Old teammates', 'People who know you and trust you.', 'Loyal', 0.58, 'The locker room trusted you because your friends were in the room.', 'Loyalty got in the way of honest feedback.', 1.5, 0, 'Hired former teammates.')] },
      { age: 13, title: 'The biggest game of your coaching life', text: 'Your team is in the deciding game of a series. What is the plan?', opts: [
        O('Trust your stars', 'Ride the best players and live with it.', 'Safe', 0.6, 'The stars delivered and so did you.', 'The stars could not get it done, and the questions started.', 3, 0.5, 'Coached a deciding game and trusted the stars.'),
        O('A bold lineup change', 'Surprise them with something different.', 'Risky', 0.45, 'It worked perfectly, the building roared and your name was in the books.', 'It backfired badly and the second-guessing was loud.', 4, -0.5, 'Made a bold lineup change in a deciding game.'),
        O('Lean on your defense', 'Win ugly.', 'Steady', 0.55, 'Win ugly, win anyway.', 'They could not buy a basket, but neither could you.', 2.5, 0.3, 'Leaned on defense in a deciding game.')] },
    ],
    analyst: [
      { age: 1, title: 'Your first TV job', text: 'Three networks called the day you retired. Which one?', opts: [
        O('A national studio show', 'Big stage, big competition.', 'High variance', 0.5, 'You were a natural: sharp, funny and fearless on the desk.', 'It was too much too soon, and the producers cooled on you.', 2, 0, 'Joined a national studio show.'),
        O('Game analyst', 'Call games next to a play-by-play veteran.', 'Steady', 0.7, 'You had the chemistry and the booth loved you.', 'Solid, but not memorable.', 1.2, 0.3, 'Became a game analyst.'),
        O('A podcast of your own', 'Your own show, your own voice.', 'Bold', 0.55, 'Fans loved the honesty and the downloads climbed.', 'It never found an audience.', 2, -0.2, 'Launched a podcast.')] },
      { age: 5, title: 'A hot take goes viral', text: 'You said something about a current star on air, and it is everywhere.', opts: [
        O('Double down', 'Stand on it.', 'Risky', 0.45, 'The clip became your trademark and the ratings agreed.', 'It blew up in your face and the star never forgot it.', 2, -1, 'Doubled down on a viral take.'),
        O('Walk it back', 'A calm, honest correction.', 'Safe', 0.75, 'People respected that you could admit it.', 'It looked weak, but it passed.', 0.8, 0.2, 'Walked back a viral take.'),
        O('Call the player', 'Take it off the air and have a real talk.', 'Smart', 0.65, 'The player appreciated it and became a friend and a source.', 'He did not pick up.', 1.2, 0.2, 'Called the player directly.')] },
      { age: 8, title: 'Your own show', text: 'The network offers you a show with your name on it.', opts: [
        O('Take it', 'A nightly show, a big contract.', 'Big', 0.55, 'It worked: the catchphrases and the debates took off.', 'The format never clicked and it was cancelled in a year.', 3, 0, 'Got his own show.'),
        O('Negotiate for control', 'A smaller show with your rules.', 'Smart', 0.6, 'You built something that felt like you.', 'They did not budge and the deal faded.', 2, 0.3, 'Negotiated for control of a show.'),
        O('Stay a contributor', 'Keep your freedom.', 'Steady', 0.7, 'You were the voice everyone wanted on their panel.', 'A quiet job that was fine.', 1, 0.3, 'Stayed a contributor.')] },
      { age: 12, title: 'Hall of Fame weekend', text: 'You are asked to host the biggest night of the year.', opts: [
        O('Host it', 'The whole league watching.', 'Big stage', 0.6, 'You nailed it and it became the speech of the weekend.', 'You tripped over a line and it was the clip of the week.', 2.5, 0, 'Hosted the Hall of Fame ceremony.'),
        O('Give the spotlight to the inductees', 'A small, classy role.', 'Humble', 0.75, 'It was warm and perfect.', 'Nobody noticed, which was the point.', 1.2, 0.4, 'Gave the Hall of Fame spotlight to the inductees.'),
        O('Turn it down', 'Not your night.', 'Safe', 0.8, 'You stayed out of it and kept your good name.', 'You kept your good name.', 0.4, 0.2, 'Turned down hosting the Hall of Fame.')] },
    ],
    gm: [
      { age: 2, title: 'Your first front-office job', text: 'You want to build teams. How do you start?', opts: [
        O('Special assistant to a GM', 'Learn the business from the inside.', 'Safe', 0.8, 'You learned the cap, the trade market and the people.', 'You learned that the job is mostly spreadsheets and phone calls.', 1, 0.3, 'Became a special assistant to a GM.'),
        O('Scouting department', 'Hit the road and watch games.', 'Steady', 0.7, 'You found a diamond in a late pick and people noticed.', 'A lot of airports, not a lot of credit.', 1.2, 0.3, 'Joined the scouting department.'),
        O('Agent-side job', 'See the business from the other table.', 'Bold', 0.5, 'You built relationships across the league.', 'It was not the right fit and cost some friendships.', 1.5, -0.2, 'Worked on the agent side.')] },
      { age: 6, title: 'Your first big trade', text: 'The owner wants a splash. You have a chance to move a pillar of the franchise.', opts: [
        O('Trade the star for a haul', 'Picks and young players.', 'Risky', 0.5, 'The haul turned into a great young core.', 'The haul turned into nothing and the fans turned on you.', 3, -0.5, 'Traded the franchise star for a haul.'),
        O('Hold the star, build around him', 'Patience.', 'Steady', 0.65, 'The patience paid off with a title window.', 'The supporting cast never arrived.', 2.2, 0.2, 'Built around the star.'),
        O('Trade for a second star', 'Go all-in.', 'Bold', 0.45, 'The two stars clicked immediately.', 'The pairing was a disaster and cost everything.', 3.5, -0.8, 'Traded for a second star.')] },
      { age: 9, title: 'Draft night', text: 'You hold a top pick. The consensus is clear and you disagree.', opts: [
        O('Take the consensus pick', 'Do not overthink it.', 'Safe', 0.7, 'A safe star and a few good years.', 'Safe was boring, and he was just good.', 1.5, 0.3, 'Took the consensus draft pick.'),
        O('Take your guy', 'Trust your eyes.', 'Risky', 0.45, 'You were right and it became your signature.', 'You were wrong and it followed you.', 3, -0.5, 'Took his own guy in the draft.'),
        O('Trade down for more picks', 'Volume over the top.', 'Smart', 0.6, 'A few of those picks hit.', 'None of them became anything.', 2, 0, 'Traded down in the draft.')] },
      { age: 14, title: 'The championship push', text: 'You have a shot at a title. The trade deadline is here.', opts: [
        O('Go all-in', 'Trade the future for the present.', 'Risky', 0.5, 'It worked: banner night.', 'It cost the future and delivered nothing.', 4, -0.8, 'Went all-in at the deadline.'),
        O('Stay the course', 'Do not mortgage the future.', 'Steady', 0.6, 'A deep run and a healthy future.', 'A second-round exit and a quiet summer.', 2, 0.3, 'Stayed the course at the deadline.'),
        O('Make a modest move', 'A smart addition.', 'Balanced', 0.58, 'The pickup was the difference.', 'It was not quite enough.', 2.5, 0.2, 'Made a modest deadline move.')] },
    ],
    business: [
      { age: 1, title: 'Your first venture', text: 'You have money and a name. What do you build?', opts: [
        O('A shoe and apparel line', 'Your name on the product.', 'Bold', 0.5, 'It sold out and the line grew every year.', 'It never found its audience.', 2.5, -0.2, 'Launched an apparel line.'),
        O('A venture fund', 'Invest in other people.', 'Smart', 0.6, 'A few early bets made a fortune.', 'The bets were mostly flat.', 2, 0.2, 'Launched a venture fund.'),
        O('Restaurants and real estate', 'Steady and local.', 'Safe', 0.75, 'It grew steadily and turned a comfortable profit.', 'A few leases went wrong.', 1.2, 0.2, 'Opened restaurants and bought real estate.')] },
      { age: 5, title: 'A partner wants in', text: 'A big company wants to partner with you.', opts: [
        O('Sign the partnership', 'Their money and your name.', 'Big', 0.6, 'It tripled the business.', 'They took more than they gave.', 2.5, -0.2, 'Signed a big partnership.'),
        O('Keep it independent', 'Grow slowly, own it all.', 'Steady', 0.65, 'You kept the control and the profit.', 'You grew slower than everyone else.', 1.8, 0.2, 'Kept the business independent.'),
        O('Sell a piece', 'Take the cash and the help.', 'Smart', 0.7, 'A smart partner and a smoother road.', 'It diluted your voice.', 1.5, 0.3, 'Sold a stake in the business.')] },
      { age: 9, title: 'Buy a stake in a club?', text: 'A minority share of an NBA team is for sale.', opts: [
        O('Buy in', 'A seat at the table.', 'Big', 0.5, 'The club took off and so did the value.', 'The club struggled and it cost you.', 3.5, -0.3, 'Bought a minority stake in an NBA club.'),
        O('Pass', 'Keep your money working.', 'Safe', 0.8, 'Your other bets paid off.', 'Your other bets were flat.', 1, 0.3, 'Passed on buying into a club.'),
        O('Buy in with the old gang', 'A group of former teammates.', 'Fun', 0.55, 'It was the best group chat of your life, and it made money.', 'Too many cooks.', 2.2, 0, 'Bought a stake with former teammates.')] },
      { age: 13, title: 'The big exit', text: 'A giant company wants to buy what you built.', opts: [
        O('Sell it', 'Take the money.', 'Big', 0.65, 'A life-changing payday.', 'The deal fell through at the last minute.', 3.5, 0, 'Sold the company.'),
        O('Hold on', 'It is yours.', 'Steady', 0.6, 'It kept growing for another decade.', 'The market turned.', 2.5, 0.2, 'Held on to the company.'),
        O('Go public', 'The whole world can own it.', 'Risky', 0.45, 'The IPO was a hit.', 'The IPO was a flop.', 4, -0.5, 'Took the company public.')] },
    ],
    family: [
      { age: 1, title: 'Step away', text: 'You are done with the game. What do you do first?', opts: [
        O('Spend the year with your family', 'No schedule, no travel.', 'Calm', 0.9, 'The best year of your life.', 'It was nice, and you got restless.', 1.2, 0.5, 'Spent a year with his family.'),
        O('Start a foundation', 'Give back to where you came from.', 'Purposeful', 0.75, 'The foundation built its first court.', 'It struggled to get off the ground.', 1.8, 0.3, 'Started a foundation.'),
        O('Travel the world', 'See what you missed.', 'Free', 0.85, 'You came back with new eyes.', 'It was fun, and it was a lot.', 1, 0.4, 'Traveled the world.')] },
      { age: 5, title: 'Youth camps', text: 'The kids in your hometown want to meet you.', opts: [
        O('Run a camp every summer', 'Be there every year.', 'Loyal', 0.8, 'A generation of kids grew up with your camp.', 'It was a hassle, but you showed up.', 1.8, 0.5, 'Ran a youth camp every summer.'),
        O('Build a youth academy', 'Something permanent.', 'Big', 0.6, 'The academy sent kids to college and a few to the league.', 'It was harder than it looked.', 2.5, 0, 'Built a youth academy.'),
        O('Do a few events', 'Keep it light.', 'Easy', 0.9, 'A few good days.', 'Nothing came of it.', 0.8, 0.3, 'Did occasional youth events.')] },
      { age: 9, title: 'Something is calling', text: 'The game keeps coming back to you.', opts: [
        O('Coach your kid\'s team', 'Just for fun.', 'Warm', 0.8, 'You got to see the game from the bench with your own kid.', 'It was chaos, and it was great.', 1.5, 0.5, 'Coached a kid\'s team.'),
        O('A part-time role with your old club', 'Ambassador and mentor.', 'Steady', 0.75, 'You became the face of the franchise\'s alumni.', 'It was a ceremonial role.', 1.5, 0.3, 'Became an ambassador for his old club.'),
        O('Stay out', 'This is the life.', 'Calm', 0.9, 'You enjoyed it.', 'It was quiet.', 0.8, 0.3, 'Stayed away from the game.')] },
      { age: 14, title: 'A legacy project', text: 'You can put your name on something that lasts.', opts: [
        O('A school', 'A building with your name and your values.', 'Big', 0.65, 'The school opened and the kids thrived.', 'Funding was a constant fight.', 3, 0.3, 'Opened a school.'),
        O('A scholarship fund', 'Quiet and effective.', 'Steady', 0.8, 'Hundreds of students got a start.', 'It was smaller than you hoped.', 2, 0.4, 'Started a scholarship fund.'),
        O('A museum or a documentary', 'Tell the whole story.', 'Bold', 0.55, 'The film was a hit and a classic.', 'Nobody watched.', 2.5, 0, 'Made a documentary about his career.')] },
    ],
  };
  const runOf = (st) => after(st).run;
  function startPath(st, key) {
    const a = after(st); if (a.path || a.run || !PATHS[key]) throw new Error('no path');
    a.run = { key, i: 0, ms: [], bonus: 0, fit: PATHS[key].fit(st) }; return a.run;
  }
  function pathStep(st) {
    const run = runOf(st); if (!run) return null; const step = STEPS[run.key][run.i]; if (!step) return null;
    return { n: run.i + 1, of: STEPS[run.key].length, title: step.title, text: step.text, age: st.player.age + step.age, options: step.opts.map((o, k) => ({ key: String(k), label: o.label, blurb: o.blurb, vibe: o.vibe })), pathLabel: PATHS[run.key].label };
  }
  function pathAnswer(st, k) {
    const run = runOf(st), step = STEPS[run.key][run.i], o = step && step.opts[+k]; if (!o) throw new Error('bad option');
    const r = rng('pathstep|' + st.player.name + '|' + run.key + '|' + run.i)(), p = clamp(o.p + 0.005 * (run.fit - 60), 0.12, 0.92), ok = r < p, age = st.player.age + step.age;
    run.ms.push({ age, text: o.ms + ': ' + (ok ? o.ok : o.no), tone: ok ? 'good' : 'bad' }); run.bonus += ok ? o.bOk : o.bNo; run.i++;
    const out = { ok, text: ok ? o.ok : o.no, tone: ok ? 'good' : 'bad', done: run.i >= STEPS[run.key].length };
    if (out.done) {
      const a = after(st), bonus = Math.round(run.bonus * 10) / 10; a.path = { key: run.key, ms: run.ms, bonus, played: true }; bump(st, bonus); a.run = null;
      NBA.Decisions.log(st, { kind: 'brand', title: 'After basketball', tone: bonus >= 5 ? 'good' : 'neutral', text: PATHS[run.key].label + ': ' + run.ms.map((m) => m.text).join(' ') });
      NBA.Game.feedAdd(st, 'path', {}, { key: 'path', at: null });
    }
    return out;
  }
  // changing agents costs you: a few points of brand and a year of the new agent's trust
  function switchAgent(st, id) {
    if (!AGENTS.some((x) => x.id === id) || st.agent === id) throw new Error('bad agent');
    const old = agentOf(st); st.agent = id; if (st.brand) st.brand.score = clamp(st.brand.score - 3, 0, 100);
    NBA.Decisions.log(st, { kind: 'brand', title: 'New agent', tone: 'neutral', text: 'Left ' + (old ? old.name : 'your agent') + ' for ' + agentOf(st).name + ' (' + agentOf(st).tag.toLowerCase() + '). It cost a little goodwill.' });
    return agentOf(st);
  }
  NBA.Legacy = { startPath, pathStep, pathAnswer, switchAgent, STEPS, afterlife, doJersey, doSpeech, doPath, AGENTS, agentOf, SPONSORS, brandYear, brandTarget, endorseOffers, answerOffer, jerseyInfo, SPEECH, PATHS, pathOptions, simulatePath, poolM };
})(typeof window !== 'undefined' ? window : globalThis);
