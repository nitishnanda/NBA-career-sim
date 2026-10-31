(function (g) {
  'use strict';
  const NBA = g.NBA;
  const D = NBA.data, { ovr, clamp } = NBA;
  const T = NBA.tuning;
  const ATTRS = D.ATTRS;

  // ---------------------------------------------------------------- decision engine
  // A decision is a small data object: when it is offered (a trigger), what the options are (with a vibe read of the odds, never a number),
  // how a choice resolves, and what that changes. Everything a choice does goes through one effect list, so it is logged to the career
  // journal and can be undone or inspected. Rolls use their own seeded stream (st.dec.seed): a decision never moves the league's random stream.
  const mulberry = (seed) => { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const hashStr = (v) => { const t = String(v); let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return h | 0; };
  const sig = (x) => 1 / (1 + Math.exp(-x));
  const r1 = (x) => Math.round(x * 10) / 10;

  const REG = {};
  const register = (def) => { REG[def.id] = def; return def; };

  function state(st) {
    if (!st.dec) st.dec = { v: 1, seed: (hashStr(st.player.name + '|' + st.player.age + '|' + (st.stars || 0)) ^ Math.floor(Math.random() * 2147483647)) | 0, seq: 0, journal: [], rel: {}, flags: {}, season: {}, pending: null };
    return st.dec;
  }
  // a private random stream for one roll: the same career, decision and moment always give the same dice
  const rng = (st, key) => mulberry(hashStr(state(st).seed + '|' + key));

  // how a probability reads to the player: a vibe, never a percentage
  const vibe = (p) => (p < 0.1 ? 'Almost no chance' : p < 0.25 ? 'Long shot' : p < 0.45 ? 'Could go either way' : p < 0.65 ? 'Decent shot' : p < 0.85 ? 'Good shot' : 'Near lock');

  // ---------------------------------------------------------------- effects
  // attr: permanent rating gain (training-style: capped by the ceiling, lifts it a little);  season: modifiers the next season reads (form, minutes, chemistry, injuries)
  // rel: relationship with a named person;  flag: story state;  bonusPts: extra upgrade points next offseason
  function apply(st, eff) {
    const d = state(st), p = st.player;
    (eff || []).forEach((e) => {
      if (e.k === 'attr') {
        const a = e.a, before = p.attrs[a];
        p.attrs[a] = clamp(Math.min(p.attrs[a] + e.d, Math.max(p.attrs[a], p.target[a] + 1)), 8, 99);
        if (!p.target0) p.target0 = Object.assign({}, p.target);
        p.target[a] = clamp(Math.min(p.target[a] + e.d * 0.8, p.target0[a] + T.trainCap), 8, 99);
        e.got = r1(p.attrs[a] - before);
      } else if (e.k === 'season') {
        const s = d.season; for (const key in e.v) { if (key === 'minsMult') s.minsMult = (s.minsMult || 1) * e.v[key]; else s[key] = (s[key] || 0) + e.v[key]; }
      } else if (e.k === 'rel') {
        d.rel[e.id] = r1(((d.rel[e.id] && d.rel[e.id].v) || 0) + e.d); d.rel[e.id] = { v: d.rel[e.id], name: e.name || (d.rel[e.id] && d.rel[e.id].name) };
      } else if (e.k === 'flag') d.flags[e.f] = e.v == null ? true : e.v;
      else if (e.k === 'bonusPts') st.bonusPoints = (st.bonusPoints || 0) + e.d;
      else if (e.k === 'raw') { const a = e.a, before = p.attrs[a]; p.attrs[a] = clamp(p.attrs[a] + e.d, 8, 99); e.got = r1(p.attrs[a] - before); }   // a direct change (wear and tear), not training
      else if (e.k === 'player') p[e.f] = clamp((p[e.f] || 0) + e.d, 0, 1);
      else if (e.k === 'stars') st.stars = clamp(st.stars + e.d, 1, 5);
      else if (e.k === 'set') st[e.f] = e.v;
      else if (e.k === 'meter') d.flags[e.f] = clamp((d.flags[e.f] || 0) + e.d, -8, 8);
    });
  }
  // after a season is replayed from its snapshot, the decisions made since tip-off (journal, relationships, flags, an open question) carry over
  function carry(st, live) { const d = state(st); if (live) { d.journal = live.journal; d.rel = live.rel; d.flags = live.flags; d.pending = live.pending; d.seq = live.seq; } }
  const relOf = (st, id) => { const r = state(st).rel[id]; return r ? r.v : 0; };
  // the next season consumes whatever the player's decisions queued (playSeason merges it into the season's event modifiers)
  function takeSeason(st) { const d = state(st), s = d.season; d.season = {}; return s; }

  // ---------------------------------------------------------------- journal
  function log(st, entry) {
    const d = state(st), L = st.league, t = L.teams[st.teamId];
    d.journal.push(Object.assign({ year: L.year, label: NBA.seasonLabel(L.year), age: st.player.age, team: t ? t.nick : '' }, entry));
  }

  // ---------------------------------------------------------------- offer / choose
  // offer: the first registered decision for this trigger whose gate passes; it waits in st.dec.pending until the player chooses
  function offer(st, trigger) {
    const d = state(st);
    for (const id in REG) {
      const def = REG[id];
      if (def.trigger !== trigger || (def.when && !def.when(st))) continue;
      const ctx = def.open(st);
      if (!ctx) continue;
      d.pending = { id, ctx, step: 0, log: [] };
      return d.pending;
    }
    return null;
  }
  function view(st) { const d = state(st), pd = d.pending; if (!pd) return null; const def = REG[pd.id]; return Object.assign({ id: pd.id, title: def.title, step: pd.step, log: pd.log }, def.view(st, pd.ctx, pd)); }
  // choose: resolve one option. A decision can take several steps (ask a second mentor); it ends when the resolver says done
  function choose(st, key, arg) {
    const d = state(st), pd = d.pending; if (!pd) throw new Error('nothing to decide');
    const def = REG[pd.id];
    const res = def.choose(st, pd.ctx, key, arg, pd);
    pd.step++; if (res.text) pd.log.push({ text: res.text, tone: res.tone || 'neutral' });
    if (res.effects) apply(st, res.effects);
    if (res.journal) { if (typeof res.journal.text === 'function') res.journal.text = res.journal.text(); log(st, Object.assign({ kind: pd.id, title: def.title }, res.journal)); }
    if (res.done) state(st).pending = null;   // a replayed season swaps st.dec: always write to the live one
    return res;
  }
  // the autopilot answers every question with a sensible default (so bulk careers, tests and realism checks do not need a person)
  function autoResolve(st) {
    // (a replayed season swaps st.dec under us: always look at the live one)
    for (let guard = 0; state(st).pending && guard < 24; guard++) { const pd = state(st).pending, def = REG[pd.id], a = def.auto(st, pd.ctx, pd); choose(st, a.key, a.arg); }
  }

  // ================================================================ decision 1: preseason camp
  // Who you train with. Stars get asked by everybody and say no to most; teammates and journeymen say yes more, and teach less.
  const TIERS = { star: { label: 'Superstar', gain: 3.2, ask: -0.2 }, allstar: { label: 'All-Star', gain: 2.4, ask: 0 }, vet: { label: 'Skill specialist', gain: 2.0, ask: 0.35 }, mate: { label: 'Teammate', gain: 1.5, ask: 0.7 } };
  const SKILL_WORDS = { inside: 'finishing inside', mid: 'the mid-range game', three: 'shooting threes', ft: 'free throws', handling: 'ball handling', passing: 'passing', iq: 'reading the game', reb: 'rebounding', perD: 'perimeter defense', rimP: 'rim protection', ath: 'athletic work', dur: 'staying healthy' };
  const CAMP_ASKS = 3;

  // standing: how much a mentor would want to spend a summer on you
  function standing(st, m) {
    const p = st.player, a = st.career.awards, mine = ovr(p);
    const slot = st.draft && st.draft.slot ? st.draft.slot : 0, rookie = p.yearsPro === 0;
    let s = TIERS[m.tier].ask - 0.09 * (m.ovr - mine);
    s += Math.min(1.4, 0.22 * ((a['All-Star'] || 0) + 2 * (a['All-NBA'] || 0) + 3 * (a.MVP || 0)) + 0.5 * (a.Championships || 0));
    if (rookie) s += slot && slot <= 3 ? 1.2 : slot && slot <= 10 ? 0.7 : slot && slot <= 20 ? 0.25 : 0;
    s += 0.4 * (m.pos === p.pos ? 1 : 0) + 0.45 * Math.min(2, relOf(st, m.id));
    if (m.age >= 34) s += 0.3;                                                    // veterans like handing it down
    if (p.age >= 30 && !st.autoPlay) s += Math.min(0.8, 0.1 * (p.age - 28));                      // nobody turns down a veteran with a résumé out of hand
    return s;
  }
  function campMentors(st) {
    const L = st.league, p = st.player, me = ovr(p), rnd = rng(st, 'camp|' + L.year), out = [], used = new Set();
    const all = [];
    L.teams.forEach((t) => NBA.rosterOf(L, t).forEach((q) => all.push({ q, t })));
    all.sort((x, y) => ovr(y.q) - ovr(x.q));
    // the skill he teaches: the attribute where he is best and you can still learn the most
    const w = D.ARCHETYPES[p.arch].weights, wmax = Math.max.apply(null, ATTRS.map((a) => w[a])), fit = (a) => 0.5 + w[a] / wmax;   // skills that matter for his archetype first
    const skillOf = (q) => { const sc = (a) => (q.attrs[a] - 0.5 * p.attrs[a]) * fit(a); return ATTRS.filter((a) => a !== 'dur' && a !== 'ath').sort((a, b) => sc(b) - sc(a))[0]; };
    const add = (x, tier) => {
      if (!x || used.has(x.q.id)) return;
      used.add(x.q.id);
      const sk = skillOf(x.q);
      out.push({ id: x.q.id, name: x.q.name, age: x.q.age, pos: x.q.pos, teamId: x.t.id, team: x.t.nick, ovr: Math.round(ovr(x.q)), tier, skill: sk, his: Math.round(x.q.attrs[sk]), yours: Math.round(p.attrs[sk]), noise: (rnd() - 0.5) * 0.9 });
    };
    const stars = all.slice(0, 5), allstars = all.slice(5, 28).filter((x) => x.t.id !== st.teamId), mates = all.filter((x) => x.t.id === st.teamId && ovr(x.q) >= me - 4 && ovr(x.q) < 80);
    const vets = all.filter((x) => x.q.age >= 30 && ovr(x.q) >= 60 && ovr(x.q) < 76 && ATTRS.some((a) => a !== 'dur' && a !== 'ath' && x.q.attrs[a] >= 76 && x.q.attrs[a] - p.attrs[a] >= 8));
    const sh = (arr) => arr.slice().sort(() => rnd() - 0.5);
    sh(stars).slice(0, 2).forEach((x) => add(x, 'star'));
    sh(allstars).slice(0, 2).forEach((x) => add(x, 'allstar'));
    sh(vets).slice(0, 2).forEach((x) => add(x, 'vet'));
    sh(mates).slice(0, 1).forEach((x) => add(x, 'mate'));
    out.forEach((m) => { m.p = sig(standing(st, m) + m.noise); });
    return out.sort((a, b) => b.ovr - a.ovr);
  }
  // the player's own path: his archetype's most useful attributes that still have room
  function soloAttrs(st) {
    const p = st.player, w = D.ARCHETYPES[p.arch].weights;
    return ATTRS.filter((a) => a !== 'dur' && a !== 'ath').sort((a, b) => w[b] * (100 - p.attrs[b]) - w[a] * (100 - p.attrs[a])).slice(0, 4);
  }
  const NO_LINES = {
    star: ['"Not this summer. Everybody wants a piece of me." 😬', '"Call my agent. Actually, don\'t."', '"Prove yourself first, kid."'],
    allstar: ['"I\'m locked in on my own stuff this summer."', '"Maybe next year. Keep working."', '"My schedule is jammed, sorry."'],
    vet: ['"Not a good time, my knees need the summer."', '"I\'m running my own camp, you wouldn\'t get reps."'],
    mate: ['"Man I need a real break, hit me next summer."'],
  };
  const YES_LINES = {
    star: ['"Alright, you\'ve got a motor. Be in the gym at 6."', '"I see some of me in you. Don\'t waste this."'],
    allstar: ['"Bring your own water. We start tomorrow."', '"You earned it. Let\'s get to work."'],
    vet: ['"Come on over, I\'ll show you what took me ten years to learn."', '"Finally someone asks. Let\'s go."'],
    mate: ['"Sure, I was going to lift anyway."'],
  };
  // a veteran or a decorated player is not told to "prove yourself, kid": the same mentors answer with respect
  const NO_ELDER = {
    star: ['"It is an honor you asked. I just cannot do it this summer."', '"Honestly, I should be the one asking you. My summer is booked, sorry."', '"Respect. Next summer, maybe."'],
    allstar: ['"You are a legend to me, but I am locked in on my own stuff this summer."', '"Respect. The timing is just bad this year."'],
    vet: ['"I would feel strange teaching you anything. Not this summer."', '"My knees need the summer, and you do not need me."'],
    mate: ['"Man I need a real break, hit me next summer."'],
  };
  const YES_ELDER = {
    star: ['"It is an honor. Honestly, I should be learning from you."', '"Always wanted to work with you. Be in the gym at 6."'],
    allstar: ['"You have been doing this longer than I have. Let us trade some ideas."', '"Of course. Come on over."'],
    vet: ['"Always wanted to work with you. Let us go."', '"Two old heads in a gym. I love it."'],
    mate: ['"Sure, I was going to lift anyway."'],
  };
  const isElder = (st) => { const p = st.player, a = st.career.awards || {}; return p.age >= 30 || (p.yearsPro || 0) >= 9 || (a['All-Star'] || 0) + 2 * (a['All-NBA'] || 0) + 3 * (a.MVP || 0) + 2 * (a.Championships || 0) >= 6; };
  const lineFor = (st, m, tab, i) => { const elder = isElder(st), a = (elder ? (tab === NO_LINES ? NO_ELDER : tab === YES_LINES ? YES_ELDER : tab) : tab)[m.tier]; return a[Math.abs(hashStr(m.id + '|' + st.league.year + '|' + i)) % a.length]; };

  // The summer is a camp with room for up to three training partners. You can ask people (three asks: big names teach the most and say no the most), and other players invite you too
  // (a teammate, a star who has noticed you, a veteran, a young player, your rival). Every partner after the first gets less out of you and wears you down more.
  const CAMP_SLOTS = 3, SLOT_F = [1, 0.75, 0.5];
  register({
    id: 'camp', title: 'Preseason camp', trigger: 'camp',
    open(st) {
      const mentors = campMentors(st), ids = new Set(mentors.map((m) => m.id));
      const inv = (st.autoPlay || st.autoDecide ? [] : invites(st).list.filter((x) => !ids.has(x.id)));
      return { year: st.league.year, mentors, asks: CAMP_ASKS, rejects: 0, partners: [], slots: CAMP_SLOTS, invites: inv, solo: soloAttrs(st), asked: {} };
    },
    view(st, ctx) {
      return { asks: ctx.asks, rejects: ctx.rejects, partners: ctx.partners.slice(), slots: ctx.slots, taken: ctx.partners.length ? ctx.partners[0] : null, solo: ctx.solo.map((a) => ({ key: a, label: D.ATTR_LABELS[a], v: Math.round(st.player.attrs[a]) })), soloGain: ctx.partners.length ? 0 : r1(Math.max(0, 1.2 - 0.6 * ctx.rejects)),
        invites: ctx.invites.map((m) => ({ id: m.id, name: m.name, age: m.age, pos: m.pos, team: m.team, ovr: m.ovr, type: m.type, skill: m.skill, skillLabel: m.skill ? SKILL_WORDS[m.skill] : null, his: m.his, yours: m.yours, state: m.state })),
        mentors: ctx.mentors.map((m) => ({ id: m.id, name: m.name, age: m.age, pos: m.pos, team: m.team, teamId: m.teamId, ovr: m.ovr, tier: m.tier, tierLabel: TIERS[m.tier].label, skill: m.skill, skillLabel: SKILL_WORDS[m.skill], his: m.his, yours: m.yours, vibe: vibe(m.p), asked: ctx.asked[m.id] || null, rel: relOf(st, m.id) })) };
    },
    // 'ask' (mentor id), 'accept' / 'decline' (an invite's player id), 'solo' (finish; arg: attribute for solo work), 'rest' (finish, take the summer off)
    choose(st, ctx, key, arg, pd) {
      const p = st.player, T0 = TIERS, idx = ctx.partners.length, f = SLOT_F[Math.min(idx, SLOT_F.length - 1)];
      const wear = (n) => (n === 1 ? [{ k: 'season', v: { extraMiss: 2 } }] : n >= 2 ? [{ k: 'season', v: { extraMiss: 5 } }] : []);
      if (key === 'ask') {
        const m = ctx.mentors.find((x) => x.id === arg);
        if (!m || ctx.asked[m.id] || ctx.asks <= 0 || idx >= ctx.slots) throw new Error('cannot ask');
        ctx.asks--;
        const roll = rng(st, 'ask|' + m.id + '|' + ctx.year)();
        if (roll < m.p) {
          ctx.asked[m.id] = 'yes'; ctx.partners.push(m.id);
          const gain = T0[m.tier].gain * (0.85 + 0.3 * p.work) * f, eff = [{ k: 'attr', a: m.skill, d: gain }, { k: 'rel', id: m.id, name: m.name, d: 1 }].concat(wear(idx));
          if (m.tier === 'mate') eff.push({ k: 'season', v: { depth: 1.2 } });
          if (m.tier === 'star') eff.push({ k: 'flag', f: 'trained:' + m.id, v: m.name });
          const att = eff[0];
          const text = m.name + ' said yes. ' + lineFor(st, m, YES_LINES, 0) + ' You worked on ' + SKILL_WORDS[m.skill] + ' together.' + (idx ? ' Another partner means less of you to go around, and it shows in your legs.' : '');
          return { done: false, tone: 'good', text, effects: eff, journal: { tone: 'good', text: () => 'Asked ' + m.name + ' (' + m.team + ') to train together. They said yes: ' + SKILL_WORDS[m.skill] + ' (' + D.ATTR_LABELS[m.skill] + ' +' + att.got + ').' } };
        }
        ctx.asked[m.id] = 'no'; ctx.rejects++;
        return { done: false, tone: 'bad', text: m.name + ' passed. ' + lineFor(st, m, NO_LINES, 0), effects: [{ k: 'rel', id: m.id, name: m.name, d: -0.3 }] };
      }
      if (key === 'accept' || key === 'decline') {
        const inv = ctx.invites.find((x) => x.id === arg);
        if (!inv || inv.state) throw new Error('no such invite');
        if (key === 'accept' && idx >= ctx.slots) throw new Error('camp is full');
        const r = answerInvite(st, inv.id, key === 'accept', idx);
        if (key === 'accept') ctx.partners.push(inv.id);
        return { done: false, tone: key === 'accept' ? 'good' : 'neutral', text: r.text };
      }
      if (key === 'solo' || key === 'rest') {
        const gain = ctx.partners.length ? 0 : Math.max(0, 1.2 - 0.6 * ctx.rejects), a = arg && ATTRS.includes(arg) ? arg : ctx.solo[0];
        const eff = gain > 0 && key === 'solo' ? [{ k: 'attr', a, d: gain }] : [];
        const asked = Object.keys(ctx.asked).map((id) => ctx.mentors.find((x) => String(x.id) === id)).filter(Boolean);
        const taken = ctx.partners.length;
        const text = taken ? 'Camp starts. You trained with ' + ctx.partners.map((id) => { const q = ctx.mentors.find((x) => x.id === id) || ctx.invites.find((x) => x.id === id); return q ? q.name : ''; }).filter(Boolean).join(', ') + '.' : gain > 0 ? 'You worked alone on ' + SKILL_WORDS[a] + '.' : 'The rejections cost you the summer: no real work got done.';
        const rej = asked.filter((m) => ctx.asked[m.id] === 'no').map((m) => m.name);
        const jt = rej.length && !taken ? 'Asked ' + rej.join(' and ') + ' to train, but ' + (rej.length > 1 ? 'both turned me down' : 'it was a no') + '. ' + (gain > 0 ? 'Worked alone on ' + SKILL_WORDS[a] + ' (' + a + ' +' + r1(gain) + ').' : 'No summer to speak of.') : taken ? null : 'Worked alone all summer on ' + SKILL_WORDS[a] + '.';
        return { done: true, tone: gain > 0 || taken ? 'neutral' : 'bad', text: key === 'rest' && !taken ? 'You took the summer off.' : text, effects: eff, journal: jt ? { tone: gain > 0 ? 'neutral' : 'bad', text: jt } : null };
      }
      throw new Error('bad camp choice');
    },
    // autopilot: a sensible ask for the standing (skip anyone below ~25%), at most two tries, then solo work on the archetype's best attribute
    auto(st, ctx) {
      if (ctx.partners.length || ctx.asks <= 0 || Object.keys(ctx.asked).length >= 2) return { key: 'solo', arg: ctx.solo[0] };
      const best = ctx.mentors.filter((m) => !ctx.asked[m.id]).map((m) => ({ m, v: m.p * TIERS[m.tier].gain })).sort((a, b) => b.v - a.v)[0];
      return best && best.m.p >= 0.25 ? { key: 'ask', arg: best.m.id } : { key: 'solo', arg: ctx.solo[0] };
    },
  });

  // ================================================================ decision 2: the trade deadline
  // Fires once a season when the games reach the deadline. One situation at most: a club cuts you (you are doing badly), your trade request comes due, or a contender calls.
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  register({
    id: 'deadline', title: 'Trade deadline', trigger: 'deadline',
    open(st) {
      const G = NBA.Game, L = st.league, p = st.player, t = L.teams[st.teamId], d = state(st), rnd = rng(st, 'dl|' + L.year);
      const v = G.marketV(st), rec = st.proSeasons[st.proSeasons.length - 1], c = st.contract;
      const shown = (st.matchLog || []).slice(0, st.matchIdx || 0).filter((x) => x.k === 'g' && !x.po && !x.dnp);
      // 1. waived: a vet who is playing badly on a deal that still has years on it
      if (!st.autoPlay && c.left >= 1 && p.age >= 24 && v < 64 && v >= 52 && rec && rec.perfRank > 250 && !G.protection(st) && rnd() < 0.45) {
        const sal = G.minSalary(L), paid = Math.round(c.salary * 54 / 82 * 10) / 10;
        const teams = L.teams.filter((x) => x.id !== st.teamId && x.wins >= 36).map((x) => [rnd(), x]).sort((a, b) => a[0] - b[0]).slice(0, 3).map((x) => x[1]);
        return { kind: 'waive', text: 'The ' + t.nick + ' are waiving you. The rest of your contract is guaranteed, but you are out of their plans.', options: teams.map((x) => ({ teamId: x.id, name: x.name, nick: G.teamKey(x), label: x.wins + ' wins', salary: sal, paid })) };
      }
      const offers = () => G.tradeOffers(st, 6).filter((o) => o.ok).slice(0, 3);
      // 2. your request comes due
      if (d.flags.tradeReq) {
        const found = rnd() < (t.wins < 38 ? 0.7 : 0.5), opts = found ? offers() : [];
        if (opts.length) return { kind: 'request', text: 'The ' + t.nick + ' found suitors for your trade request. Pick a destination, or stay put.', options: opts };
        return { kind: 'norequest', text: 'The ' + t.nick + ' could not find a deal for you before the deadline. You are staying, and the front office remembers the request.', options: [] };
      }
      // 3. a contender calls (a good player on a team going nowhere)
      if (t.wins <= 36 && v >= 70 && p.age >= 27 && rnd() < 0.3) {
        const opts = offers().slice(0, 2);
        if (opts.length) return { kind: 'call', text: 'Contenders are calling the ' + t.nick + ' about you. If you want out, now is the time.', options: opts };
      }
      return null;
    },
    view(st, ctx) {
      return { kind: ctx.kind, text: ctx.text, options: ctx.options.map((o) => Object.assign({}, o, o.partner ? { partnerName: o.partner.name + ' (' + o.partner.pos + ', ' + o.partner.age + ', ' + o.partner.ovr + ' OVR)' } : {})), canDecline: ctx.kind !== 'waive' };
    },
    choose(st, ctx, key, arg) {
      const G = NBA.Game, L = st.league, d = state(st), old = L.teams[st.teamId];
      if (key === 'decline') {
        if (ctx.kind === 'norequest') { d.flags.tradeReq = null; return { done: true, tone: 'bad', text: 'You stay put.', effects: [{ k: 'season', v: { depth: -1 } }], journal: { tone: 'bad', text: 'Your trade request went nowhere: the ' + old.nick + ' kept you, and the room was tense for the rest of the year.' } }; }
        if (ctx.kind === 'request') { d.flags.tradeReq = null; return { done: true, tone: 'neutral', text: 'You turned the offers down.', journal: { tone: 'neutral', text: 'Wanted out of the ' + old.nick + ', but none of the deals felt right. Stayed.' } }; }
        return { done: true, tone: 'neutral', text: 'You told them you are staying.', journal: { tone: 'neutral', text: 'Contenders called at the deadline. Stayed with the ' + old.nick + '.' } };
      }
      if (key === 'trade') {
        const o = ctx.options.find((x) => x.teamId === arg); if (!o) throw new Error('bad trade');
        const t = L.teams[o.teamId], text = 'traded to the ' + t.nick;
        G.midSeasonMove(st, { kind: 'trade', teamId: o.teamId, partnerId: o.partner.id, extraId: o.extra ? o.extra.id : null, pickKeys: o.pickKeys || [], partnerText: o.partner.name + ' (' + o.partner.ovr + ' ovr)' + (o.extra ? ' and ' + o.extra.name : '') + (o.picks ? ' and ' + o.picks : ''), requested: ctx.kind === 'request', text });
        state(st).flags.tradeReq = null;
        return { done: true, tone: 'good', text: 'Traded to the ' + t.nick + ' for ' + o.partner.name + '. New team, new situation.', journal: { tone: 'good', text: (ctx.kind === 'request' ? 'Got the trade you asked for: ' : 'Traded at the deadline: ') + old.nick + ' to ' + t.nick + ', for ' + o.partner.name + '.' } };
      }
      if (key === 'sign') {
        const o = ctx.options.find((x) => x.teamId === arg); if (!o) throw new Error('bad suitor');
        const t = L.teams[o.teamId];
        G.midSeasonMove(st, { kind: 'sign', teamId: o.teamId, salary: o.salary, paid: o.paid, text: 'waived by the ' + old.nick + ', signed with the ' + t.nick });
        return { done: true, tone: 'bad', text: 'Signed with the ' + t.nick + ' on a minimum deal.', journal: { tone: 'bad', text: 'Waived by the ' + old.nick + ' at the deadline after a bad stretch. Picked up by the ' + t.nick + ' on a minimum deal.' } };
      }
      throw new Error('bad deadline choice');
    },
    auto(st, ctx) { return ctx.kind === 'waive' && ctx.options.length ? { key: 'sign', arg: ctx.options[0].teamId } : { key: 'decline' }; },
  });


  // ================================================================ decision 3: the playoff approach (one per series)
  const fitWord = (f) => (f < 0.12 ? 'Not made for your roster' : f < 0.32 ? 'Fits okay' : 'Fits you well');
  register({
    id: 'series', title: 'Playoff approach', trigger: 'series',
    open(st) {
      const it = (st.matchLog || [])[st.matchIdx || 0];
      if (!it || it.k !== 'hdr' || it.ps == null || (st.poPlans && st.poPlans[it.ps] !== undefined)) return null;
      const G = NBA.Game, info = G.SERIES_INFO(st, it), rv = state(st).rival, ot = st.league.teams.find((x) => x.name === it.opp), rq = rv && st.league.players[rv.id];
      const rivalHere = !!(rq && ot && rq.teamId === ot.id);
      return Object.assign(info, { si: it.ps, g7: !!it.g7, teamId: ot ? ot.id : null, rival: rivalHere ? rv.name : null, options: G.planOptions(st).filter((o) => o.key !== 'callout' || rivalHere).map((o) => ({ key: o.key, label: o.label, blurb: o.blurb, fit: o.key === 'balanced' || o.key === 'callout' ? null : fitWord(o.fit) })) });
    },
    view(st, ctx) { return ctx; },
    choose(st, ctx, key) {
      const G = NBA.Game, label = G.PLANS[key].label;
      if (key === 'callout') state(st).flags.calledOut = { id: state(st).rival.id, name: ctx.rival, teamId: ctx.teamId, year: st.league.year };
      G.setPlan(st, ctx.si, key);
      return { done: true, tone: 'neutral', text: label + ' against the ' + ctx.opp.split(' ').slice(-1)[0] + '.', journal: key === 'balanced' ? null : { tone: 'neutral', text: ctx.round + ' vs the ' + ctx.opp + ': ' + label.toLowerCase() + '.' } };
    },
    auto() { return { key: 'balanced' }; },
  });

  // ================================================================ decision 4: the clutch moment
  register({
    id: 'clutch', title: 'Clutch moment', trigger: 'clutch',
    open(st) { const info = NBA.Game.clutchInfo(st); return info; },
    view(st, ctx) { return ctx; },
    choose(st, ctx, key) { const r = NBA.Game.resolveClutch(st, key); return { done: true, tone: r.wins ? 'good' : 'bad', text: r.text, effects: [], journal: r.journal, result: r }; },
    auto(st, ctx) { const w = ctx._win; return { key: Object.keys(w).sort((a, b) => w[b] - w[a])[0] }; },
  });


  // ================================================================ decisions 5-6: high school and the role you take in college
  const soloTop = (st, n) => { const p = st.player, w = D.ARCHETYPES[p.arch].weights; return ATTRS.filter((a) => a !== 'dur' && a !== 'ath').sort((a, b) => w[b] * (100 - p.attrs[b]) - w[a] * (100 - p.attrs[a])).slice(0, n); };
  register({
    id: 'hs', title: 'High school', trigger: 'hs',
    open(st) { return { top: soloTop(st, 1)[0], breakP: st.stars <= 3 ? 0.34 : st.stars === 4 ? 0.2 : 0 }; },
    view(st, ctx) {
      return { options: [
        { key: 'prep', label: 'A national prep powerhouse', blurb: 'Elite coaching and every scout in the building. You play with other stars, so the numbers are modest.', vibe: 'Steady and well-seen' },
        { key: 'home', label: 'Stay home and be the guy', blurb: 'You are the whole offense, you work harder than anyone, and fewer scouts ever see you.', vibe: 'Big numbers, small stage' },
        { key: 'circuit', label: 'Chase the summer circuit', blurb: 'Showcases against the best in the country. You could blow up, or you could wear yourself down.', vibe: ctx.breakP ? 'High risk, high reward' : 'A grind: little to gain at the top' },
      ] };
    },
    choose(st, ctx, key) {
      const p = st.player, rnd = rng(st, 'hs')();
      if (key === 'prep') return { done: true, tone: 'good', text: 'You went to a prep powerhouse: the coaching sharpened your game and the scouts know your name.', effects: [{ k: 'attr', a: 'iq', d: 1.2 }, { k: 'player', f: 'vis', d: 0.1 }], journal: { tone: 'good', text: 'Spent senior year at a national prep powerhouse: better coaching, more eyes on you.' } };
      if (key === 'home') return { done: true, tone: 'neutral', text: 'You stayed home and carried the team. It made you tougher, even if fewer people watched.', effects: [{ k: 'attr', a: ctx.top, d: 1.4 }, { k: 'player', f: 'work', d: 0.05 }, { k: 'player', f: 'vis', d: -0.05 }], journal: { tone: 'neutral', text: 'Stayed home for senior year and carried the team. Tougher, but fewer scouts saw it.' } };
      const up = rnd < ctx.breakP, eff = [{ k: 'attr', a: 'handling', d: 1 }, { k: 'raw', a: 'dur', d: -2 }];
      if (up) eff.push({ k: 'stars', d: 1 }, { k: 'player', f: 'vis', d: 0.12 });
      return { done: true, tone: up ? 'good' : 'bad', text: up ? 'You blew up on the circuit: your stock jumped and the big programs are calling. It cost your body something.' : 'The circuit ground you down. You got a bit sharper, and a bit more worn.', effects: eff, journal: { tone: up ? 'good' : 'bad', text: up ? 'Dominated the summer circuit: recruiting rank jumped to ' + Math.min(5, st.stars + 1) + ' stars. Paid for it in wear and tear.' : 'Ground through the summer circuit. A bit sharper, a bit worn down, no breakout.' } };
    },
    auto() { return { key: 'prep' }; },
  });
  register({
    id: 'role', title: 'Your role in college', trigger: 'role',
    open(st) { return { top: soloTop(st, 1)[0] }; },
    view(st, ctx) {
      return { options: [
        { key: 'takeover', label: 'Take over the offense', blurb: 'More shots and minutes, a bigger name. The team wins less and you develop a little less.', vibe: 'Stats and draft hype' },
        { key: 'fit', label: 'Fit into the system', blurb: 'Win games, play for the team. Your numbers are modest and you learn the game.', vibe: 'Wins and a clean reputation' },
        { key: 'quiet', label: 'Develop quietly', blurb: 'Fewer minutes and shots while you work on your game. Scouts see less.', vibe: 'Growth over hype' },
      ] };
    },
    choose(st, ctx, key) {
      const eff = [{ k: 'set', f: 'collegeRole', v: key }];
      if (key === 'quiet') eff.push({ k: 'attr', a: ctx.top, d: 1.5 }); if (key === 'fit') eff.push({ k: 'attr', a: 'iq', d: 0.9 });
      const text = { takeover: 'You will be the first option. Everyone knows it.', fit: 'You will play within the system and win.', quiet: 'You will take a back seat and work on your game.' }[key];
      return { done: true, tone: 'neutral', text, effects: eff, journal: { tone: 'neutral', text: { takeover: 'Arrived at ' + st.college.name + ' ready to take over the offense.', fit: 'Arrived at ' + st.college.name + ' and bought into the system.', quiet: 'Arrived at ' + st.college.name + ' and chose to develop quietly.' }[key] } };
    },
    auto() { return { key: 'fit' }; },
  });


  // ================================================================ decision 7: the offseason questions of a long career
  // (1) coming back from a major injury, (2) how you play the late years: stats, winning, mentoring or a farewell tour
  register({
    id: 'late', title: 'Late-career choices', trigger: 'late',
    when(st) { return !st.autoPlay; },
    open(st) {
      const p = st.player, rec = st.proSeasons[st.proSeasons.length - 1], steps = [];
      const hurt = rec && rec.injury && /Suffered a/.test(rec.injury) && !/season-ending injury/.test(rec.injury) ? rec.injury : (rec && /season-ending/.test(rec.injury || '') ? rec.injury : null);
      if (hurt) steps.push('injury');
      if (p.age >= 33) steps.push('stance');
      NBA.Room.steps(st).forEach((x) => steps.push(x));
      return steps.length ? { steps, hurt, done: {} } : null;
    },
    view(st, ctx, pd) {
      const step = ctx.steps[pd.step] || ctx.steps[ctx.steps.length - 1], p = st.player, o = ovr(p);
      if (step === 'coach') return Object.assign({ step }, NBA.Room.coachView(st));
      if (step === 'room') return Object.assign({ step }, NBA.Room.roomView(st, NBA.Room.roomStory(st)));
      if (step === 'injury') return { step, title: 'Coming back from injury', text: ctx.hurt + ' How do you handle the comeback?', options: [
        { key: 'rush', label: 'Rush back for opening night', blurb: 'You play right away. Your body may not be ready.', vibe: 'Risky' },
        { key: 'rehab', label: 'Do the full rehab', blurb: 'You miss the first stretch of games but come back right.', vibe: 'Patient' },
      ] };
      return { step, title: 'How do you want to play the late years?', text: 'You are ' + p.age + '. The body is not what it was. What matters now?', options: [
        { key: 'normal', label: 'Just play', blurb: 'No changes.', vibe: 'Neutral' },
        { key: 'stats', label: 'Chase numbers', blurb: 'More shots and minutes for you, and the team pays for it.', vibe: 'Stats up, team down' },
        { key: 'wins', label: 'Chase wins', blurb: 'Take a smaller role and make the team better.', vibe: 'Team up, numbers down' },
        { key: 'mentor', label: 'Become the mentor', blurb: 'Fewer minutes, a locker room that follows you, and a legacy as a leader.', vibe: 'Legacy over stats' },
      ] };
    },
    choose(st, ctx, key, arg, pd) {
      const step = ctx.steps[pd.step], more = pd.step + 1 < ctx.steps.length, p = st.player;
      if (step === 'coach' || step === 'room') { const r = step === 'coach' ? NBA.Room.coachChoose(st, key) : NBA.Room.roomChoose(st, NBA.Room.roomStory(st), key); return { done: !more, tone: r.tone, text: r.text, effects: r.effects, journal: r.journal }; }
      if (step === 'injury') {
        const hit = rng(st, 'comeback|' + st.league.year)() < 0.38;
        const eff = key === 'rush' ? (hit ? [{ k: 'season', v: { extraMiss: 18 } }, { k: 'raw', a: 'ath', d: -1.2 }] : [{ k: 'season', v: { form: -0.01 } }]) : [{ k: 'season', v: { extraMiss: 9 } }, { k: 'raw', a: 'dur', d: 2 }];
        const text = key === 'rush' ? (hit ? 'You came back too soon and the injury flared up again. It cost you more time and some of your athleticism.' : 'You pushed through and got away with it.') : 'You did the full rehab. You will miss the opening stretch, but your body thanks you.';
        return { done: !more, tone: key === 'rush' && hit ? 'bad' : 'good', text, effects: eff, journal: { tone: key === 'rush' && hit ? 'bad' : 'neutral', text: key === 'rush' ? (hit ? 'Rushed back from injury and re-aggravated it.' : 'Rushed back from injury and was fine.') : 'Did the full rehab after the injury and came back durable.' } };
      }
      const eff = { normal: [], stats: [{ k: 'season', v: { form: 0.025, depth: -1.2, minsMult: 1.03 } }], wins: [{ k: 'season', v: { form: -0.01, depth: 1.6, minsMult: 0.95 } }], mentor: [{ k: 'season', v: { form: -0.02, depth: 1, minsMult: 0.88 } }, { k: 'flag', f: 'legacy', v: ((state(st).flags.legacy || 0) + 2) }] }[key] || [];
      if (key === 'mentor') st.legacy = (st.legacy || 0) + 2;
      const text = { normal: 'You just play.', stats: 'You hunt your numbers this season.', wins: 'You take a smaller role to win.', mentor: 'You become the leader in the locker room.' }[key];
      return { done: true, tone: 'neutral', text, effects: eff, journal: key === 'normal' ? null : { tone: 'neutral', text: { stats: 'Chased numbers in the late years.', wins: 'Took a smaller role to help the team win.', mentor: 'Became the mentor in the locker room.' }[key] } };
    },
    auto(st, ctx, pd) { const step = ctx.steps[pd.step]; return step === 'injury' ? { key: 'rehab' } : step === 'coach' ? { key: 'quiet' } : step === 'room' ? { key: { friend: 'polite', split: 'bridge', beefReturn: 'peace', friendAsk: 'help' }[NBA.Room.roomStory(st).type] || 'coach' } : { key: 'normal' }; },
  });



  // ================================================================ the draft-night promise
  // The club that took you says what it sees for you. Higher picks get bigger promises and the club keeps them more often; a promise a club breaks is remembered.
  register({
    id: 'promise', title: 'Draft-night promise', trigger: 'promise',
    when(st) { return !st.autoPlay; },
    open(st) { const dr = st.draft; if (!dr) return null; const t = st.league.teams[st.teamId]; return { slot: dr.slot, team: t.name, nick: t.nick, teamId: t.id }; },
    view(st, ctx) {
      const hi = ctx.slot && ctx.slot <= 14, mid = ctx.slot && ctx.slot <= 30;
      return { title: ctx.slot ? 'Draft night: ' + ctx.nick + ' take you #' + ctx.slot : 'Undrafted: the ' + ctx.nick + ' sign you', text: ctx.slot ? 'The front office pulled you aside after the pick. Everyone wants something from a rookie: what do you ask them for?' : 'You were not picked, but the ' + ctx.nick + ' want you in camp. You can still ask for something.', options: [
        { key: 'starter', label: 'A starting spot', blurb: 'Make them put the role in writing. If the roster is crowded, a promise can get broken.', vibe: hi ? 'Good shot' : mid ? 'Could go either way' : 'Long shot' },
        { key: 'dev', label: 'Development minutes', blurb: 'A plan: bench minutes, a skills coach, and room to make mistakes.', vibe: 'Safe' },
        { key: 'brand', label: 'A marketing push', blurb: 'Jersey, billboards and a feature on the arena screen. Your name gets out there faster.', vibe: 'Brand over basketball' },
        { key: 'none', label: 'No promises', blurb: 'Earn it on the court. The coaches like the attitude.', vibe: 'Humble' } ] };
    },
    choose(st, ctx, key) {
      const sl = ctx.slot || 60, keep = key === 'starter' ? (sl <= 5 ? 0.85 : sl <= 14 ? 0.7 : sl <= 30 ? 0.5 : 0.3) : 1, ok = rng(st, 'promise|' + sl)() < keep, id = 'team' + ctx.teamId, tn = ctx.nick;
      if (key === 'starter') {
        if (ok) return { done: true, tone: 'good', text: 'The ' + tn + ' kept their word: you are in the starting five on opening night.', effects: [{ k: 'season', v: { minsMult: 1.07, form: 0.006 } }, { k: 'rel', id, name: ctx.team, d: 1 }], journal: { tone: 'good', text: 'The ' + tn + ' promised a starting spot and delivered.' } };
        return { done: true, tone: 'bad', text: 'The ' + tn + ' signed a veteran in July and the promise quietly disappeared. You are on the bench and they know you know.', effects: [{ k: 'season', v: { minsMult: 0.95, depth: -0.5 } }, { k: 'rel', id, name: ctx.team, d: -2 }], journal: { tone: 'bad', text: 'The ' + tn + ' promised a starting spot and broke it.' } };
      }
      if (key === 'dev') return { done: true, tone: 'good', text: 'The ' + tn + ' wrote you a development plan. A little less floor time, a lot more coaching.', effects: [{ k: 'season', v: { minsMult: 0.97 } }, { k: 'bonusPts', d: 1 }, { k: 'rel', id, name: ctx.team, d: 1 }], journal: { tone: 'good', text: 'Agreed a development plan with the ' + tn + '.' } };
      if (key === 'brand') {
        const b = st.brand || (st.brand = { score: 0, deals: [], offers: null, earned: 0, year: null }); b.score = Math.min(100, b.score + 8);
        return { done: true, tone: 'good', text: 'The ' + tn + ' put your face on the building. Your brand is already ahead of where a rookie should be.', effects: [{ k: 'season', v: { minsMult: 0.99 } }], journal: { tone: 'good', text: 'The ' + tn + ' gave you a marketing push.' } };
      }
      return { done: true, tone: 'good', text: 'You told them you would earn it. The coaches noticed.', effects: [{ k: 'season', v: { form: 0.008 } }, { k: 'rel', id, name: ctx.team, d: 1 }], journal: { tone: 'good', text: 'Asked for no promises and went to work.' } };
    },
    auto() { return { key: 'none' }; },
  });

  // ================================================================ workout invitations
  // Other players reach out in the offseason: a teammate who wants a summer partner, a star who has noticed you, a veteran with a skill to hand down, a kid who wants to learn from you, a rival who wants you in his gym.
  // Each one is a yes or a no; the second yes costs you (nobody can train with everyone), and not everyone is who they seem.
  const INV_TYPES = { star: { label: 'Star', gain: 2.6 }, vet: { label: 'Skill specialist', gain: 2.0 }, mate: { label: 'Teammate', gain: 1.2 }, young: { label: 'Young player', gain: 0 }, rival: { label: 'Your rival', gain: 1.8 } };
  function inviteSkill(st, q) {
    const p = st.player, w = D.ARCHETYPES[p.arch].weights, wmax = Math.max.apply(null, ATTRS.map((a) => w[a])), fit = (a) => 0.5 + w[a] / wmax;
    const sc = (a) => (q.attrs[a] - 0.5 * p.attrs[a]) * fit(a);
    return ATTRS.filter((a) => a !== 'dur' && a !== 'ath').sort((a, b) => sc(b) - sc(a))[0];
  }
  function invites(st) {
    const d = state(st), L = st.league;
    if (d.invites && d.invites.year === L.year) return d.invites;
    const p = st.player, me = ovr(p), rnd = rng(st, 'invites|' + L.year), all = [], list = [], used = new Set(), aw = st.career.awards || {};
    L.teams.forEach((t) => NBA.rosterOf(L, t).forEach((q) => { if (q.id !== 'user') all.push({ q, t }); }));
    all.sort((x, y) => ovr(y.q) - ovr(x.q));
    const add = (x, type, pr) => {
      if (!x || used.has(x.q.id) || rnd() >= pr) return;
      used.add(x.q.id);
      const sk = type === 'young' ? null : inviteSkill(st, x.q);
      list.push({ id: x.q.id, name: x.q.name, age: x.q.age, pos: x.q.pos, team: x.t.nick, teamId: x.t.id, ovr: Math.round(ovr(x.q)), type, skill: sk, his: sk ? Math.round(x.q.attrs[sk]) : null, yours: sk ? Math.round(p.attrs[sk]) : null, gain: INV_TYPES[type].gain, state: null });
    };
    const rel = (q) => relOf(st, q.id), mates = all.filter((x) => x.t.id === st.teamId && Math.abs(ovr(x.q) - me) <= 8);
    const acc = Math.min(1, 0.1 * ((aw['All-Star'] || 0) + 2 * (aw['All-NBA'] || 0) + 3 * (aw.MVP || 0)));
    const stars = all.slice(0, 10).filter((x) => x.t.id !== st.teamId && me >= ovr(x.q) - 10);
    const vets = all.filter((x) => x.q.age >= 31 && ovr(x.q) >= 60 && ovr(x.q) < 78 && ATTRS.some((a) => a !== 'dur' && a !== 'ath' && x.q.attrs[a] >= 76 && x.q.attrs[a] - p.attrs[a] >= 8));
    const kids = all.filter((x) => x.q.age <= 22 && (x.q.yearsPro || 0) <= 2 && ovr(x.q) <= me - 4 && ovr(x.q) >= me - 24);
    const shf = (a) => a.slice().sort(() => rnd() - 0.5);
    const rv = d.rival && L.players[d.rival.id]; if (rv && rv.teamId != null) add({ q: rv, t: L.teams[rv.teamId] }, 'rival', 0.5);
    shf(stars).slice(0, 3).forEach((x) => add(x, 'star', clamp(0.1 + 0.04 * (me - ovr(x.q) + 10) + 0.12 * rel(x.q) + acc * 0.4, 0.05, 0.7)));
    shf(vets).slice(0, 2).forEach((x) => add(x, 'vet', 0.4 + 0.1 * rel(x.q)));
    shf(mates).slice(0, 2).forEach((x) => add(x, 'mate', 0.5 + 0.1 * rel(x.q)));
    if (me >= 68) shf(kids).slice(0, 2).forEach((x) => add(x, 'young', 0.4));
    d.invites = { year: L.year, list: list.slice(0, 4), taken: 0 };
    return d.invites;
  }
  const INV_YES = { star: 'They said they like how you carry yourself, and the gym is yours at 6 AM.', vet: 'They have been waiting for someone to ask about it for years.', mate: 'Summer runs with your own teammate: the room gets tighter.', young: 'The kid took notes on everything. It felt good.', rival: 'You trained in his gym. It was weird and it was good.' };
  function answerInvite(st, id, accept, idx) {
    const d = state(st), inv = d.invites, it = inv && inv.list.find((x) => x.id === id);
    if (!it || it.state) throw new Error('no such invite');
    const p = st.player, yr = st.league.year;
    if (!accept) {
      it.state = 'no'; apply(st, [{ k: 'rel', id: it.id, name: it.name, d: it.type === 'star' ? -0.3 : -0.2 }]);
      return { text: 'You said no to ' + it.name + '.' };
    }
    idx = idx || 0; inv.taken++; const first = idx === 0, eff = [];
    const gain = it.gain * (0.85 + 0.3 * p.work) * SLOT_F[Math.min(idx, SLOT_F.length - 1)];
    if (it.skill) eff.push({ k: 'attr', a: it.skill, d: gain });
    if (it.type === 'young') eff.push({ k: 'attr', a: 'iq', d: 0.4 }, { k: 'meter', f: 'locker', d: 1 }, { k: 'meter', f: 'media', d: 0.5 }, { k: 'flag', f: 'legacy', v: (d.flags.legacy || 0) + 1 });
    eff.push({ k: 'rel', id: it.id, name: it.name, d: it.type === 'young' ? 0.6 : 1 });
    if (it.type === 'mate') eff.push({ k: 'season', v: { depth: 1 } });
    let extra = '';
    const r = rng(st, 'invrisk|' + id + '|' + yr)();
    if (!first) { eff.push({ k: 'season', v: { extraMiss: idx === 1 ? 2 : 5 } }); extra = ' Another partner means less of you to go around, and it shows in your legs.'; }
    else if (r < 0.07) { eff.push({ k: 'season', v: { extraMiss: 6 } }); extra = ' You tweaked something in the gym and it will cost you a few games.'; }
    if (it.type === 'rival' && r > 0.7) { eff.push({ k: 'season', v: { form: -0.006 } }); extra += ' He studied your game the whole time: expect him to know your moves.'; }
    apply(st, eff);
    it.state = 'yes';
    const got = eff[0] && eff[0].k === 'attr' && eff[0].a === it.skill ? eff[0].got : null;
    const text = it.name + ' (' + it.team + ') ' + (it.skill ? 'and you worked on ' + SKILL_WORDS[it.skill] + (got != null ? ' (' + D.ATTR_LABELS[it.skill] + ' +' + got + ')' : '') : 'and you spent the summer showing him how you do it') + '. ' + INV_YES[it.type] + extra;
    log(st, { kind: 'invite', title: 'Workout invite', tone: 'good', text });
    return { text };
  }

  // ================================================================ the injury: how do you come back
  register({
    id: 'injury', title: 'Injury', trigger: 'injury',
    open(st) { const info = NBA.Game.injuryInfo(st); return info ? { name: info.name, major: info.major, games: info.games, options: info.options, idx: st.matchIdx } : null; },
    view(st, ctx) { return { name: ctx.name, major: ctx.major, games: ctx.games, options: ctx.options }; },
    choose(st, ctx, key) {
      const r = NBA.Game.applyInjuryChoice(st, key);
      return { done: true, tone: r.sb ? 'bad' : key === 'rush' ? 'neutral' : 'good', text: r.text, journal: { tone: r.sb ? 'bad' : 'neutral', text: 'Suffered a ' + ctx.name + '. ' + r.text } };
    },
    auto(st, ctx) { return { key: ctx.major ? 'rehab' : 'standard' }; },
  });

  // ================================================================ decision 8: the press conference
  register({
    id: 'press', title: 'Press conference', trigger: 'press',
    open(st) { return NBA.Game.pressOpen(st); },
    // two phases: pick which reporter's question to take (a few are on offer), then answer it. Big moments let you take two.
    view(st, ctx, pd) {
      const persona = NBA.Reporters.personaOf((state(st).flags.pr || { tally: [] }).tally), P = NBA.Reporters.PERSONAS[persona];
      const base = { why: ctx.why, kind: ctx.kind, opp: ctx.opp, take: ctx.take, taken: ctx.chosen.length, persona: { key: persona, label: P.label, blurb: P.blurb } };
      if (ctx.cur == null) return Object.assign(base, { phase: 'pick', candidates: ctx.pool.map((q, i) => ({ idx: i, reporter: q.reporter, text: q.text, heat: q.heat, src: q.src, ai: !!q.ai, done: ctx.chosen.indexOf(i) >= 0 })).filter((x) => !x.done) });
      const q = ctx.pool[ctx.cur];
      return Object.assign(base, { phase: 'answer', step: ctx.chosen.length, total: ctx.take, reporter: q.reporter, src: q.src, topic: q.topic, question: q.text, options: q.opts.map((o) => ({ key: o.key, label: o.label, line: o.line, spicy: o.spicy })) });
    },
    choose(st, ctx, key, arg, pd) {
      if (key === 'pick') {
        const i = +arg; if (!(i >= 0 && i < ctx.pool.length) || ctx.chosen.indexOf(i) >= 0 || ctx.cur != null) throw new Error('bad question');
        ctx.cur = i; return { done: false, tone: 'neutral' };
      }
      if (ctx.cur == null) throw new Error('pick a question first');
      const q = ctx.pool[ctx.cur], strip = (t) => String(t || '').replace(/^[\u201C"]|[\u201D"]$/g, '');
      let pick, react;
      if (key === 'typed') {
        // your own words, already read (by the built-in reader or by Claude): the tone it came out as decides the effects, exactly like a button answer
        const a = arg || {}, tn = NBA.Press.TONES[a.tone] ? a.tone : 'deflect', words = String(a.text || '').slice(0, 240);
        pick = { tone: tn, topic: q.topic, text: words, intensity: Math.max(0.7, Math.min(1.3, +a.intensity || 1)), profane: !!a.profane, badmouth: !!a.badmouth, fans: Array.isArray(a.fans) ? a.fans.map((x) => String(x).slice(0, 160)).slice(0, 2) : [] };
        (ctx.headlines = ctx.headlines || []).push(String(a.headline || '').slice(0, 90));
        react = '\uD83D\uDDE3 \u201C' + words + '\u201D \u2192 ' + String(a.reaction || '').slice(0, 260);
      } else {
        const o = q.opts.find((x) => x.key === key); if (!o) throw new Error('bad answer');
        pick = { tone: key, topic: q.topic, text: strip(o.line) }; if (key === 'fight' || key === 'trash') { pick.profane = !!NBA.Press.isProfane(pick.text); pick.badmouth = !!NBA.Press.badmouth(pick.text); } react = o.line;
      }
      ctx.picks.push(pick); ctx.chosen.push(ctx.cur); ctx.cur = null;
      const left = ctx.pool.length - ctx.chosen.length;
      if (ctx.chosen.length < ctx.take && left > 0) return { done: false, tone: 'neutral', text: react };
      const r = NBA.Game.resolvePress(st, ctx);
      return { done: true, tone: r.tone, text: r.text, journal: r.journal, headline: r.headline, fans: r.fans, moods: r.moods, persona: r.persona };
    },
    auto(st, ctx, pd) {
      if (ctx.cur == null) { const i = ctx.pool.map((q, k) => ({ q, k })).filter((x) => ctx.chosen.indexOf(x.k) < 0).sort((a, b) => a.q.heat - b.q.heat)[0]; return { key: 'pick', arg: i.k }; }
      const q = ctx.pool[ctx.cur]; return { key: (q.opts.find((o) => o.key === 'deflect') || q.opts.find((o) => !o.spicy) || q.opts[0]).key };
    },
  });

  // ================================================================ a moment on social media: twice a season the timeline wants something from you
  register({
    id: 'social', title: 'The timeline', trigger: 'social',
    when(st) { return !st.autoPlay; },
    open(st) {
      const it = (st.matchLog || [])[(st.matchIdx || 0) - 1]; if (!it || it.k !== 'g' || it.dnp) return null;
      return { opp: it.o, won: !!it.w, pts: it.pt, reb: it.rb, ast: it.as, score: it.f + '-' + it.a, n: it.n, followers: NBA.Social.state(st).f };
    },
    view(st, ctx) {
      const S = NBA.Social.state(st), line = ctx.won ? 'You went for ' + ctx.pts + ' on the ' + ctx.opp + ' last night (' + ctx.score + ' W) and the timeline is buzzing.' : 'A tough one against the ' + ctx.opp + ' (' + ctx.score + ' L), and the replies are... a lot.';
      return { title: 'The timeline', text: line + ' ' + S.handle + ' · ' + NBA.Social.fmt(S.f) + ' followers. What do you post?', options: [
        { key: 'hype', label: ctx.won ? 'Post the highlights' : 'Post a hype video', blurb: 'A clip and a caption that says everything.', vibe: 'Safe and fun' },
        { key: 'thanks', label: 'Thank the fans and the team', blurb: 'Gratitude, no ego. The locker room likes it.', vibe: 'Warm' },
        { key: 'clap', label: 'Reply to a hater', blurb: 'Someone said you were washed. You have thoughts.', vibe: 'Could go viral. Could backfire' },
        { key: 'quiet', label: 'Log off for a few days', blurb: 'Stay off the timeline. Focus on the game.', vibe: 'Quiet' }] };
    },
    choose(st, ctx, key) {
      const r = rng(st, 'social|' + st.league.year + '|' + ctx.n)(), Sx = NBA.Social, G = NBA.Game; let text, tone = 'neutral', eff = [];
      if (key === 'hype') { const viral = r < 0.16; Sx.change(st, viral ? 0.04 : 0.012); eff = [{ k: 'meter', f: 'media', d: 0.2 }]; text = viral ? 'The clip took off: millions of views and a wave of new followers.' : 'The post did its job: a nice bump in likes and followers.'; tone = viral ? 'good' : 'neutral'; if (viral) G.feedAdd(st, 'hot', {}, { key: 'sv' + st.league.year + ctx.n, at: null }); }
      else if (key === 'thanks') { Sx.change(st, 0.007); eff = [{ k: 'meter', f: 'media', d: 0.4 }, { k: 'meter', f: 'chem', d: 0.3 }]; text = 'Fans and teammates loved it. The room noticed.'; tone = 'good'; }
      else if (key === 'clap') { if (r < 0.5) { Sx.change(st, 0.045); eff = [{ k: 'meter', f: 'media', d: 0.3 }]; text = 'You said it perfectly. The reply got a million likes and the hater deleted the account.'; tone = 'good'; G.feedAdd(st, 'hot', {}, { key: 'sv' + st.league.year + ctx.n, at: null }); } else { Sx.change(st, -0.015); eff = [{ k: 'meter', f: 'media', d: -1 }, { k: 'meter', f: 'chem', d: -0.3 }]; text = 'It backfired: the quote tweets were brutal and the press picked it up.'; tone = 'bad'; } }
      else { Sx.change(st, -0.004); eff = [{ k: 'meter', f: 'chem', d: 0.3 }]; text = 'You logged off and focused on the game. The timeline moved on.'; tone = 'neutral'; }
      return { done: true, tone, text, effects: eff, journal: key === 'clap' ? { tone, text: 'Replied to a hater online: ' + text } : null };
    },
    auto() { return { key: 'thanks' }; },
  });

  // ================================================================ somebody mentions you: an opponent star or coach said something about you after the game
  register({
    id: 'mention', title: 'In the news', trigger: 'mention',
    when(st) { return !st.autoPlay; },
    open(st) { return NBA.Game.mentionOpen(st, (st.matchLog || [])[(st.matchIdx || 0) - 1]); },
    view(st, ctx) {
      const praise = ctx.kind === 'praise', nm = ctx.who.name;
      const o = ctx.lines || {};
      return { title: 'In the news', who: ctx.who, quote: ctx.quote, ai: !!ctx.ai, text: (praise ? nm + ' (' + ctx.who.role + ') spoke about you after the game.' : nm + ' (' + ctx.who.role + ') took a shot at you after the game.') + ' Want to respond?', options: [
        { key: 'respect', label: praise ? 'Return the respect' : 'Take the high road', blurb: o.respect || (praise ? 'Thank him. Class gets noticed.' : 'Acknowledge it and move on.'), vibe: 'Safe' },
        { key: 'ignore', label: 'No comment', blurb: o.ignore || 'Say nothing and let your game talk.', vibe: 'Quiet' },
        { key: 'clap', label: 'Answer with the receipts', blurb: o.clap || 'Hit back with the numbers and the record.', vibe: praise ? 'Cocky. Could go either way' : 'Spicy. Could backfire' },
        { key: 'fire', label: 'Fire back, no filter', blurb: o.fire || 'Say exactly what you think of him.', vibe: 'Loud. Starts a feud' }] };
    },
    choose(st, ctx, key) {
      const r = rng(st, 'mention-r|' + st.league.year + '|' + ctx.game.n + '|' + (ctx.game.po ? 'p' : 'r'))(), G = NBA.Game, pr = G.pressState ? G.pressState(st) : null, praise = ctx.kind === 'praise'; let text, tone = 'neutral', eff = [];
      const nm = ctx.who.name, rel = (d) => ({ k: 'rel', id: ctx.who.id, name: nm, d });
      const feud = (lvl) => { try { const f = Dc0(st); f.feuds[ctx.opp] = { star: nm, level: lvl, y: st.league.year, quote: ctx.quote.replace(/^[\u201C"]|[\u201D"]$/g, '').slice(0, 80), seen: 0 }; } catch (e) { /* no feud book */ } };
      if (key === 'respect') { eff = [{ k: 'meter', f: 'media', d: 0.5 }, rel(0.6)]; text = praise ? 'You thanked ' + nm + ' and the clip made the rounds: class all around.' : 'You took the high road. Reporters noted how calm you were, and ' + nm + ' had nothing to push against.'; tone = 'good'; }
      else if (key === 'ignore') { eff = [{ k: 'meter', f: 'media', d: -0.1 }]; text = 'No comment. The story faded in a day.'; }
      else if (key === 'clap') { const ok = r < clamp0(0.5 + 0.1 * (ctx.game.won ? 1 : -1) + (ctx.game.pts >= 25 ? 0.08 : -0.05)); if (ok) { eff = [{ k: 'meter', f: 'media', d: 0.6 }, rel(praise ? 0.2 : -0.4)]; text = 'You came back with the numbers and the record. The room loved it and ' + nm + ' went quiet.'; tone = 'good'; } else { eff = [{ k: 'meter', f: 'media', d: -0.5 }, { k: 'meter', f: 'chem', d: -0.2 }, rel(-0.6)]; text = 'The receipts did not hold up: your answer got picked apart and ' + nm + ' got the last word.'; tone = 'bad'; } if (!praise) feud(1); }
      else { const ok = r < 0.42; if (ok) { eff = [{ k: 'meter', f: 'media', d: 0.3 }, rel(-1)]; text = 'You fired back with no filter and it went viral. This one is a feud now.'; tone = 'good'; } else { eff = [{ k: 'meter', f: 'media', d: -1 }, { k: 'meter', f: 'chem', d: -0.3 }, rel(-1)]; text = 'It went too far. The league called, the headlines ran, and ' + nm + ' could not have asked for a better gift.'; tone = 'bad'; } feud(2); }
      return { done: true, tone, text, effects: eff, journal: key === 'respect' || key === 'ignore' ? null : { tone, text: nm + ' mentioned you in the press: ' + text } };
    },
    auto() { return { key: 'ignore' }; },
  });
  // ================================================================ a fan podcast: no league fines, so the language is real
  register({
    id: 'podcast', title: 'Fan podcast', trigger: 'podcast',
    when(st) { return !st.autoPlay; },
    open(st) { return NBA.Game.podcastOpen(st, (st.matchLog || [])[(st.matchIdx || 0) - 1]); },
    view(st, ctx) {
      const L = ctx.lines || ctx.base;
      return { title: 'Fan podcast', host: ctx.host, show: ctx.show, ai: !!ctx.ai, question: ctx.hostQ, text: ctx.show + ' invited you on after the ' + (ctx.game.won ? 'win' : 'loss') + ' over the ' + ctx.opp + '. No league fines on a fan podcast, so you can say what you actually think.', options: [
        { key: 'clean', label: 'Keep it clean', blurb: L.clean, vibe: 'Safe' },
        { key: 'loose', label: 'Get loose', blurb: L.loose, vibe: 'Some swearing. Fun' },
        { key: 'unfiltered', label: 'Fully unfiltered', blurb: L.unfiltered, vibe: 'Heavy swearing. Could go viral or sink you', spicy: true }] };
    },
    choose(st, ctx, key) {
      const r = rng(st, 'pod-r|' + st.league.year + '|' + ctx.game.n + '|' + (ctx.game.po ? 'p' : 'r'))(), Sx = NBA.Social, nm = ctx.star; let text, tone = 'neutral', eff = [];
      const feud = (lvl) => { if (!nm) return; try { Dc0(st).feuds[ctx.opp] = { star: nm, level: lvl, y: st.league.year, quote: (ctx.lines && ctx.lines[key] ? ctx.lines[key] : ctx.base[key]).replace(/^[\u201C"]|[\u201D"]$/g, '').slice(0, 80), seen: 0 }; } catch (e) { /* no feud book */ } };
      if (key === 'clean') { Sx.change(st, 0.008); eff = [{ k: 'meter', f: 'media', d: 0.4 }]; text = 'You kept it fun and clean. The clip did decent numbers and nobody had a problem with it.'; tone = 'good'; }
      else if (key === 'loose') { const ok = r < 0.68; if (ok) { Sx.change(st, 0.03); eff = [{ k: 'meter', f: 'media', d: 0.5 }, { k: 'meter', f: 'locker', d: 0.2 }]; text = 'You got loose and the swearing felt natural. The clip is everywhere and fans say it is the realest interview of the year.'; tone = 'good'; } else { Sx.change(st, -0.004); eff = [{ k: 'meter', f: 'media', d: -0.2 }]; text = 'The jokes did not land. A few people made it a meme, but not the kind you wanted.'; } feud(1); }
      else { const ok = r < 0.5; if (ok) { Sx.change(st, 0.06); eff = [{ k: 'meter', f: 'media', d: 0.4 }, { k: 'meter', f: 'locker', d: 0.3 }]; text = 'Fully unfiltered and it went nuclear: millions of views, a wave of new followers, and the other locker room is fuming.'; tone = 'good'; } else { Sx.change(st, -0.015); eff = [{ k: 'meter', f: 'media', d: -0.9 }, { k: 'meter', f: 'chem', d: -0.3 }]; text = 'It went too far. A sponsor sent a polite email, the team asked you to calm it down, and the clip is the only thing anyone is talking about.'; tone = 'bad'; } feud(2); }
      return { done: true, tone, text, effects: eff, journal: key === 'clean' ? null : { tone, text: 'Fan podcast (' + ctx.show + '): ' + text } };
    },
    auto() { return { key: 'clean' }; },
  });
  const clamp0 = (x) => Math.max(0.15, Math.min(0.85, x));
  const Dc0 = (st) => { const f = state(st).flags; return f.pr || (f.pr = { quotes: [], tally: [], feuds: {}, heads: [], rep: {} }); };

  Object.assign(NBA, { Decisions: { invites, answerInvite, INV_TYPES, carry, register, state, rng, vibe, apply, offer, view, choose, autoResolve, takeSeason, log, relOf, TIERS, SKILL_WORDS, campMentors, standing } });
  if (typeof module !== 'undefined') module.exports = NBA;
})(typeof window !== 'undefined' ? window : globalThis);
