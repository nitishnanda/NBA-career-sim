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
    });
  }
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
    if (res.done) d.pending = null;
    return res;
  }
  // the autopilot answers every question with a sensible default (so bulk careers, tests and realism checks do not need a person)
  function autoResolve(st) {
    const d = state(st);
    for (let guard = 0; d.pending && guard < 12; guard++) { const def = REG[d.pending.id], a = def.auto(st, d.pending.ctx, d.pending); choose(st, a.key, a.arg); }
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

  Object.assign(NBA, { Decisions: { register, state, rng, vibe, apply, offer, view, choose, autoResolve, takeSeason, log, relOf, TIERS, SKILL_WORDS, campMentors, standing } });
  if (typeof module !== 'undefined') module.exports = NBA;
})(typeof window !== 'undefined' ? window : globalThis);
