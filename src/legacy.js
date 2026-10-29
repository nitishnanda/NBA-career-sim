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
    { id: 'atlas', name: 'Atlas Motors', cat: 'Cars', share: 0.14, clause: 'none' },
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
    const pool = SPONSORS.filter((s) => !taken.has(s.id) && !(s.shoe && hasShoe)).map((s) => [rnd() + (s.shoe ? -0.4 * (sc >= 60 ? 1 : 0) : 0), s]).sort((x, y) => x[0] - y[0]).slice(0, n).map((x) => x[1]);
    const total = poolM(st) * ag.endorse;
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
  NBA.Legacy = { afterlife, doJersey, doSpeech, doPath, AGENTS, agentOf, SPONSORS, brandYear, brandTarget, endorseOffers, answerOffer, jerseyInfo, SPEECH, PATHS, pathOptions, simulatePath, poolM };
})(typeof window !== 'undefined' ? window : globalThis);
