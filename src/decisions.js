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
    for (let guard = 0; state(st).pending && guard < 12; guard++) { const pd = state(st).pending, def = REG[pd.id], a = def.auto(st, pd.ctx, pd); choose(st, a.key, a.arg); }
  }

  // ================================================================ decision 1: preseason camp
  // Who you train with. Stars get asked by everybody and say no to most; teammates and journeymen say yes more, and teach less.
  const TIERS = { star: { label: 'Superstar', gain: 3.2, ask: -0.2 }, allstar: { label: 'All-Star', gain: 2.4, ask: 0 }, vet: { label: 'Skill specialist', gain: 2.0, ask: 0.35 }, mate: { label: 'Teammate', gain: 1.5, ask: 0.7 } };
  const SKILL_WORDS = { inside: 'finishing inside', mid: 'the mid-range game', three: 'shooting threes', ft: 'free throws', handling: 'ball handling', passing: 'passing', iq: 'reading the game', reb: 'rebounding', perD: 'perimeter defense', rimP: 'rim protection', ath: 'athletic work', dur: 'staying healthy' };
  const CAMP_ASKS = 2;

  // standing: how much a mentor would want to spend a summer on you
  function standing(st, m) {
    const p = st.player, a = st.career.awards, mine = ovr(p);
    const slot = st.draft && st.draft.slot ? st.draft.slot : 0, rookie = p.yearsPro === 0;
    let s = TIERS[m.tier].ask - 0.09 * (m.ovr - mine);
    s += Math.min(1.4, 0.22 * ((a['All-Star'] || 0) + 2 * (a['All-NBA'] || 0) + 3 * (a.MVP || 0)) + 0.5 * (a.Championships || 0));
    if (rookie) s += slot && slot <= 3 ? 1.2 : slot && slot <= 10 ? 0.7 : slot && slot <= 20 ? 0.25 : 0;
    s += 0.4 * (m.pos === p.pos ? 1 : 0) + 0.45 * Math.min(2, relOf(st, m.id));
    if (m.age >= 34) s += 0.3;                                                    // veterans like handing it down
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
  const lineFor = (st, m, tab, i) => { const a = tab[m.tier]; return a[Math.abs(hashStr(m.id + '|' + st.league.year + '|' + i)) % a.length]; };

  register({
    id: 'camp', title: 'Preseason camp', trigger: 'camp',
    open(st) {
      const mentors = campMentors(st);
      return { year: st.league.year, mentors, asks: CAMP_ASKS, rejects: 0, taken: null, solo: soloAttrs(st), asked: {} };
    },
    view(st, ctx) {
      return { asks: ctx.asks, rejects: ctx.rejects, taken: ctx.taken, solo: ctx.solo.map((a) => ({ key: a, label: D.ATTR_LABELS[a], v: Math.round(st.player.attrs[a]) })), soloGain: ctx.taken ? 0 : r1(Math.max(0, 1.2 - 0.6 * ctx.rejects)),
        mentors: ctx.mentors.map((m) => ({ id: m.id, name: m.name, age: m.age, pos: m.pos, team: m.team, teamId: m.teamId, ovr: m.ovr, tier: m.tier, tierLabel: TIERS[m.tier].label, skill: m.skill, skillLabel: SKILL_WORDS[m.skill], his: m.his, yours: m.yours, vibe: vibe(m.p), asked: ctx.asked[m.id] || null, rel: relOf(st, m.id) })) };
    },
    // key 'ask' (arg: mentor id), 'solo' (arg: attribute), 'rest' (nothing: take the summer off)
    choose(st, ctx, key, arg, pd) {
      const p = st.player, T0 = TIERS;
      if (key === 'ask') {
        const m = ctx.mentors.find((x) => x.id === arg);
        if (!m || ctx.asked[m.id] || ctx.asks <= 0 || ctx.taken) throw new Error('cannot ask');
        ctx.asks--;
        const roll = rng(st, 'ask|' + m.id + '|' + ctx.year)();
        if (roll < m.p) {
          ctx.asked[m.id] = 'yes'; ctx.taken = m.id;
          const gain = T0[m.tier].gain * (0.85 + 0.3 * p.work), eff = [{ k: 'attr', a: m.skill, d: gain }, { k: 'rel', id: m.id, name: m.name, d: 1 }];
          if (m.tier === 'mate') eff.push({ k: 'season', v: { depth: 1.2 } });
          if (m.tier === 'star') eff.push({ k: 'flag', f: 'trained:' + m.id, v: m.name });
          const att = eff[0];
          const text = m.name + ' said yes. ' + lineFor(st, m, YES_LINES, 0) + ' You worked on ' + SKILL_WORDS[m.skill] + ' all summer.';
          return { done: false, tone: 'good', text, effects: eff, journal: { tone: 'good', text: () => 'Asked ' + m.name + ' (' + m.team + ') to train together. They said yes: a summer on ' + SKILL_WORDS[m.skill] + ' (' + D.ATTR_LABELS[m.skill] + ' +' + att.got + ').' } };
        }
        ctx.asked[m.id] = 'no'; ctx.rejects++;
        const eff = [{ k: 'rel', id: m.id, name: m.name, d: -0.3 }];
        const ended = ctx.asks <= 0;
        return { done: false, ended, tone: 'bad', text: m.name + ' passed. ' + lineFor(st, m, NO_LINES, 0), effects: eff };
      }
      if (key === 'solo' || key === 'rest') {
        const gain = ctx.taken ? 0 : Math.max(0, 1.2 - 0.6 * ctx.rejects), a = arg && ATTRS.includes(arg) ? arg : ctx.solo[0];
        const eff = gain > 0 && key === 'solo' ? [{ k: 'attr', a, d: gain }] : [];
        const asked = Object.keys(ctx.asked).map((id) => ctx.mentors.find((x) => String(x.id) === id)).filter(Boolean);
        const taken = ctx.taken && ctx.mentors.find((x) => x.id === ctx.taken);
        let text = taken ? 'Camp starts. You are working with ' + taken.name + '.' : gain > 0 ? 'You worked alone on ' + SKILL_WORDS[a] + '.' : 'The rejections cost you the summer: no real work got done.';
        const rej = asked.filter((m) => ctx.asked[m.id] === 'no').map((m) => m.name);
        const jt = rej.length && !taken ? 'Asked ' + rej.join(' and ') + ' to train, but ' + (rej.length > 1 ? 'both turned me down' : 'it was a no') + '. ' + (gain > 0 ? 'Worked alone on ' + SKILL_WORDS[a] + ' (' + a + ' +' + r1(gain) + ').' : 'No summer to speak of.') : taken ? null : 'Worked alone all summer on ' + SKILL_WORDS[a] + '.';
        return { done: true, tone: gain > 0 ? 'neutral' : 'bad', text: key === 'rest' ? 'You took the summer off.' : text, effects: eff, journal: jt ? { tone: gain > 0 ? 'neutral' : 'bad', text: jt } : null };
      }
      throw new Error('bad camp choice');
    },
    // autopilot: a sensible ask for the standing (skip anyone below ~25%), then solo work on the archetype's best attribute
    auto(st, ctx) {
      if (ctx.taken || ctx.asks <= 0) return { key: 'solo', arg: ctx.solo[0] };
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
        G.midSeasonMove(st, { kind: 'trade', teamId: o.teamId, partnerId: o.partner.id, partnerText: o.partner.name + ' (' + o.partner.ovr + ' ovr)', requested: ctx.kind === 'request', text });
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
      return steps.length ? { steps, hurt, done: {} } : null;
    },
    view(st, ctx, pd) {
      const step = ctx.steps[pd.step] || ctx.steps[ctx.steps.length - 1], p = st.player, o = ovr(p);
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
    auto(st, ctx, pd) { const step = ctx.steps[pd.step]; return step === 'injury' ? { key: 'rehab' } : { key: 'normal' }; },
  });


  // ================================================================ decision 8: the press conference
  register({
    id: 'press', title: 'Press conference', trigger: 'press',
    open(st) { return NBA.Game.pressOpen(st); },
    view(st, ctx, pd) {
      const q = ctx.qs[pd.step] || ctx.qs[ctx.qs.length - 1];
      return { why: ctx.why, kind: ctx.kind, opp: ctx.opp, step: pd.step, total: ctx.qs.length, topic: q.topic, question: q.text, options: q.opts.map((o) => ({ key: o.key, label: o.label, line: o.line, spicy: o.spicy })) };
    },
    choose(st, ctx, key, arg, pd) {
      const q = ctx.qs[pd.step], o = q.opts.find((x) => x.key === key); if (!o) throw new Error('bad answer');
      ctx.picks.push({ tone: key, topic: q.topic });
      if (pd.step + 1 < ctx.qs.length) return { done: false, tone: 'neutral', text: o.line };
      const r = NBA.Game.resolvePress(st, ctx);
      return { done: true, tone: r.tone, text: r.text, journal: r.journal };
    },
    auto(st, ctx, pd) { const q = ctx.qs[pd.step]; return { key: (q.opts.find((o) => o.key === 'deflect') || q.opts.find((o) => !o.spicy) || q.opts[0]).key }; },
  });

  Object.assign(NBA, { Decisions: { carry, register, state, rng, vibe, apply, offer, view, choose, autoResolve, takeSeason, log, relOf, TIERS, SKILL_WORDS, campMentors, standing } });
  if (typeof module !== 'undefined') module.exports = NBA;
})(typeof window !== 'undefined' ? window : globalThis);
