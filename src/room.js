(function (g) {
  // The people around you: a head coach for every club (hired, fired, with a style that suits some players and not others) and a locker room with a best friend, a beef, and the old-versus-young split.
  // Human careers only; everything lives in the decision flags so it survives a season replay.
  const NBA = (g.NBA = g.NBA || {});
  const hashS = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const rng = (key) => NBA.Reporters.mulberry(hashS(key));
  const FIRST = ['Mike', 'Doc', 'Erik', 'Tom', 'Nate', 'Darnell', 'Steve', 'Quin', 'Monty', 'Rick', 'Jason', 'Tyronn', 'Will', 'Ime', 'Chauncey', 'Taylor', 'Kenny', 'Bruce', 'Frank', 'Dwane'];
  const LAST = ['Brannigan', 'Rivers', 'Holloway', 'Castellan', 'Okafor', 'Whitlock', 'Delgado', 'Pruitt', 'Ferrante', 'Abara', 'Lindqvist', 'Mercer', 'Santos', 'Hartwell', 'Quarles', 'Nakamura', 'Boone', 'Trask', 'Valdez', 'Greer'];
  const STYLES = {
    offense: { label: 'an offensive mind', blurb: 'Pace, spacing and shot-making. Scorers eat.', like: (p) => (['scorer', 'shooter', 'generational', 'dominator'].includes(p.arch) ? 1 : p.arch === 'defender' ? -1 : 0) },
    defense: { label: 'a defensive disciplinarian', blurb: 'Effort, rotations and no free points. Stoppers play.', like: (p) => (['defender', 'twoway'].includes(p.arch) ? 1 : p.arch === 'scorer' ? -1 : 0) },
    dev: { label: 'a player developer', blurb: 'Patience with the young and minutes for the kids.', like: (p) => (p.age <= 24 ? 1 : p.age >= 31 ? -1 : 0) },
    vets: { label: 'a players\' coach', blurb: 'Trusts the veterans and runs it through experience.', like: (p) => (p.age >= 29 ? 1 : p.age <= 22 ? -1 : 0) },
  };
  const STYLE_KEYS = Object.keys(STYLES);
  const flags = (st) => NBA.Decisions.state(st).flags;
  function mk(st, teamId, since, n) {
    const r = rng('coach|' + st.player.name + '|' + teamId + '|' + since + '|' + n), name = FIRST[Math.floor(r() * FIRST.length)] + ' ' + LAST[Math.floor(r() * LAST.length)];
    return { name, style: STYLE_KEYS[Math.floor(r() * STYLE_KEYS.length)], since };
  }
  function coachOf(st, teamId) {
    const f = flags(st), cs = f.coaches || (f.coaches = {});
    if (!cs[teamId]) cs[teamId] = mk(st, teamId, st.league.year - 2, 0);
    return cs[teamId];
  }
  // once a year: bad clubs change coaches (yours too); the news goes to the feed and, for you, becomes a decision step
  function offseason(st) {
    const f = flags(st), L = st.league; if (f.coachYear === L.year) return; f.coachYear = L.year;
    const cs = f.coaches || (f.coaches = {}); f.newCoach = null; f.chem = Math.round((f.chem || 0) * 0.5 * 10) / 10; const log = f.coachLog || (f.coachLog = []);
    L.teams.forEach((t) => {
      const c = coachOf(st, t.id), ten = L.year - c.since, r = rng('fire|' + st.player.name + '|' + t.id + '|' + L.year)();
      const pr = t.wins < 28 ? 0.5 : t.wins < 35 ? 0.28 : t.wins < 41 && ten >= 4 ? 0.14 : 0.03;
      if (r < pr) {
        const n = (c.n || 0) + 1, nc = mk(st, t.id, L.year, n); nc.n = n; cs[t.id] = nc;
        log.push({ y: L.year, team: t.nick, from: c.name, to: nc.name, style: nc.style, wins: t.wins }); f.coachLog = log.slice(-40);
        if (t.id === st.teamId) { f.newCoach = { year: L.year, from: c.name, name: nc.name, style: nc.style }; NBA.Game.feedAdd(st, 'coach', { team: t.nick }, { key: 'coach' + L.year, at: null }); }
      }
    });
  }
  const fitOf = (st) => { const c = coachOf(st, st.teamId); return STYLES[c.style].like(st.player); };

  // ---- the locker room: one story a year, picked from who is actually on your team
  function mates(st) { const L = st.league, t = L.teams[st.teamId]; return NBA.rosterOf(L, t).filter((q) => q.id !== 'user').sort((a, b) => NBA.ovr(b) - NBA.ovr(a)); }
  function roomStory(st) {
    const f = flags(st), L = st.league, p = st.player, rm = f.room || (f.room = {});
    if (rm.year === L.year) return rm.story || null;
    rm.year = L.year; rm.story = null;
    const r = rng('room|' + p.name + '|' + L.year), ms = mates(st); if (ms.length < 4 || p.yearsPro < 1) return null;
    const me = NBA.ovr(p), pick = (arr) => arr[Math.floor(r() * arr.length)];
    const pool = [];
    const peer = ms.filter((q) => NBA.ovr(q) >= me - 6 && NBA.ovr(q) <= me + 4), old = ms.filter((q) => q.age >= 31), young = ms.filter((q) => q.age <= 22);
    if (!rm.friend) pool.push({ type: 'friend', w: 3, who: pick(ms.slice(0, 8)) });
    if (peer.length && !(rm.beef && rm.beef.year >= L.year - 2)) pool.push({ type: 'beef', w: me >= 70 ? 3 : 1.5, who: pick(peer) });
    if (old.length && young.length && !(st.contract && st.contract.type === 'rookie')) pool.push({ type: 'split', w: 2, old: pick(old), young: pick(young) });
    if (rm.beef && rm.beef.year >= L.year - 2 && !rm.beef.over) pool.push({ type: 'beefReturn', w: 3, who: { id: rm.beef.id, name: rm.beef.name } });
    if (rm.friend && ms.some((q) => q.id === rm.friend.id)) pool.push({ type: 'friendAsk', w: 2.5, who: { id: rm.friend.id, name: rm.friend.name } });
    if (!pool.length || r() < 0.5) return null;
    let tot = pool.reduce((a, x) => a + x.w, 0), x = r() * tot, s = pool[0]; for (const e of pool) { x -= e.w; if (x <= 0) { s = e; break; } }
    rm.story = s.type === 'split' ? { type: 'split', old: { id: s.old.id, name: s.old.name }, young: { id: s.young.id, name: s.young.name } } : { type: s.type, who: { id: s.who.id, name: s.who.name, age: s.who.age } };
    return rm.story;
  }
  function roomView(st, s) {
    const rm = flags(st).room || {}, tn = st.league.teams[st.teamId].nick;
    if (s.type === 'friend') return { title: 'The locker room', text: s.who.name + ' keeps finding you after practice: dinners, film, video games. The guys notice. Is this your guy?', options: [
      { key: 'close', label: 'Let him in', blurb: 'A real friendship. The room gets tighter, and if he ever gets traded it will hurt.', vibe: 'Chemistry' },
      { key: 'polite', label: 'Keep it friendly', blurb: 'Cool with everyone, close with nobody.', vibe: 'Neutral' } ] };
    if (s.type === 'friendAsk') return { title: 'Your best friend', text: s.who.name + ' is struggling with his role and his head, and he came to you first. What do you give him?', options: [
      { key: 'help', label: 'Give him your time', blurb: 'Extra film, long talks. It costs you a little rest.', vibe: 'Loyal' },
      { key: 'busy', label: 'Say you are slammed', blurb: 'Focus on your own thing this summer.', vibe: 'Selfish' } ] };
    if (s.type === 'beef') return { title: 'Tension in the room', text: s.who.name + ' is frustrated about shots and touches, and the grumbling is starting to reach the press. It is you and him.', options: [
      { key: 'talk', label: 'Talk it out, one on one', blurb: 'Show some respect and give a little. Could cool it off.', vibe: 'Mature' },
      { key: 'callout', label: 'Call him out', blurb: 'Tell him to take the ball up with the coach, not the media.', vibe: 'Heated' },
      { key: 'coach', label: 'Let the coach handle it', blurb: 'Stay out of it and trust the process.', vibe: 'Hands off' } ] };
    if (s.type === 'beefReturn') return { title: 'The beef again', text: 'You and ' + s.who.name + ' still are not right. The room has noticed, and the ' + tn + ' cannot afford this forever.', options: [
      { key: 'peace', label: 'Make peace', blurb: 'Swallow your pride and settle it.', vibe: 'Mature' },
      { key: 'fuel', label: 'Let it burn', blurb: 'Play angry. The team may pay for it.', vibe: 'Volatile' } ] };
    return { title: 'The room is split', text: 'The veterans around ' + s.old.name + ' and the young guys around ' + s.young.name + ' are drifting apart. You are the bridge or you are on a side.', options: [
      { key: 'old', label: 'Stand with the vets', blurb: 'Respect the order. The young guys will say you got old.', vibe: 'Order' },
      { key: 'young', label: 'Stand with the kids', blurb: 'Back the next generation. The vets will not love it.', vibe: 'Energy' },
      { key: 'bridge', label: 'Try to bring it together', blurb: 'A team dinner and some hard honesty. Hard to pull off.', vibe: 'Leadership' } ] };
  }
  function roomChoose(st, s, key) {
    const f = flags(st), rm = f.room, L = st.league, r = rng('roomc|' + st.player.name + '|' + L.year + '|' + key)(), ev = [], who = s.who, nm = who ? who.name : '';
    const rel = (id, name, d) => ev.push({ k: 'rel', id, name, d }), dep = (d, extra) => { ev.push({ k: 'season', v: Object.assign({ depth: d }, extra || {}) }); ev.push({ k: 'meter', f: 'chem', d: Math.round(d * 1.2 * 10) / 10 }); };
    let tone = 'good', text = '', jt = '';
    if (s.type === 'friend') {
      if (key === 'close') { rm.friend = { id: who.id, name: nm, year: L.year }; rel(who.id, nm, 3); dep(1.2); text = nm + ' is your guy now. The whole building can feel it.'; jt = 'Became close with ' + nm + '.'; NBA.Game.feedAdd(st, 'friend', { name: nm, team: L.teams[st.teamId].nick }, { key: 'friend' + L.year, at: null }); }
      else { rel(who.id, nm, 1); text = 'You stayed friendly with everyone.'; tone = 'neutral'; }
    } else if (s.type === 'friendAsk') {
      if (key === 'help') { rel(who.id, nm, 2); dep(0.8); text = nm + ' turned it around, and he told everyone it was you.'; jt = 'Helped ' + nm + ' through a rough patch.'; }
      else { rel(who.id, nm, -2); dep(-0.4); text = nm + ' said it was fine. It was not fine.'; tone = 'bad'; }
    } else if (s.type === 'beef' || s.type === 'beefReturn') {
      const set = (over) => { rm.beef = { id: who.id, name: nm, year: L.year, over: !!over }; };
      if (key === 'talk' || key === 'peace') {
        const ok = r < (key === 'peace' ? 0.8 : 0.65);
        if (ok) { set(true); rel(who.id, nm, 2); dep(1); text = 'You and ' + nm + ' cleared the air. Nobody is going to write about it, which is the point.'; jt = 'Settled things with ' + nm + '.'; }
        else { set(); rel(who.id, nm, -1); dep(-0.8); text = nm + ' did not want to hear it. The tension is still there.'; tone = 'bad'; }
      } else if (key === 'callout' || key === 'fuel') {
        set(); rel(who.id, nm, -3); dep(-1.6, { form: 0.012 }); text = 'It got loud. ' + nm + ' will remember it, and the room is quieter now.'; tone = 'bad'; jt = 'Feud with ' + nm + ' in the locker room.';
        NBA.Game.feedAdd(st, 'beef', { name: nm, team: L.teams[st.teamId].nick }, { key: 'beef' + L.year, at: null });
      } else { set(); rel(who.id, nm, -0.5); dep(-0.6); text = 'The coach stepped in and papered over it, for now.'; tone = 'neutral'; }
    } else {
      if (key === 'bridge') { const ok = r < 0.5; dep(ok ? 2 : -0.8); text = ok ? 'The dinner worked. Vets and kids left as one team.' : 'You tried, but the split was too deep for one dinner.'; tone = ok ? 'good' : 'neutral'; }
      else if (key === 'old') { rel(s.old.id, s.old.name, 2); rel(s.young.id, s.young.name, -1); dep(0.5); text = 'The vets respect you. The kids think you are a lifer.'; }
      else { rel(s.young.id, s.young.name, 2); rel(s.old.id, s.old.name, -1); dep(0.5); text = 'The young guys are all in on you. A few vets rolled their eyes.'; }
    }
    return { effects: ev, tone, text, journal: jt ? { tone, text: jt } : null };
  }

  // ---- the new coach step
  function coachView(st) {
    const nc = flags(st).newCoach, fit = fitOf(st), S = STYLES[nc.style], tn = st.league.teams[st.teamId].nick;
    return { title: 'A new head coach', text: 'The ' + tn + ' fired ' + nc.from + ' and hired ' + nc.name + ', ' + S.label + '. ' + S.blurb + ' ' + (fit > 0 ? 'On paper, your game suits his.' : fit < 0 ? 'On paper, you are not his type of player.' : 'You can fit in either way.'), options: [
      { key: 'buyin', label: 'Buy in publicly', blurb: 'Back him in the press and run his system.', vibe: fit < 0 ? 'Safe' : 'Smooth' },
      { key: 'ask', label: 'Ask for a bigger role', blurb: 'Go see him on day one and make your case.', vibe: fit > 0 ? 'Good shot' : 'Risky' },
      { key: 'quiet', label: 'Keep your head down', blurb: 'Let the camp do the talking.', vibe: 'Neutral' } ] };
  }
  function coachChoose(st, key) {
    const nc = flags(st).newCoach, fit = fitOf(st), r = rng('coachc|' + st.player.name + '|' + st.league.year + '|' + key)(), id = 'coach' + st.teamId, ev = [];
    const base = fit > 0 ? 1.03 : fit < 0 ? 0.96 : 1; let mins = base, tone = 'neutral', text;
    if (key === 'buyin') { mins = fit < 0 ? 0.98 : base * 1.01; ev.push({ k: 'rel', id, name: nc.name, d: 2 }, { k: 'season', v: { depth: 0.6 } }, { k: 'meter', f: 'chem', d: 0.6 }); text = 'You backed ' + nc.name + ' publicly and ran his stuff. ' + (fit < 0 ? 'It softened the fit, and he noticed.' : 'He noticed.'); tone = 'good'; }
    else if (key === 'ask') {
      const ok = r < (fit > 0 ? 0.7 : fit < 0 ? 0.3 : 0.5) + 0.004 * (NBA.ovr(st.player) - 65);
      if (ok) { mins = base * 1.05; ev.push({ k: 'rel', id, name: nc.name, d: 1.5 }); text = nc.name + ' heard you out and gave you a bigger role.'; tone = 'good'; }
      else { mins = base * 0.97; ev.push({ k: 'rel', id, name: nc.name, d: -1.5 }); text = nc.name + ' did not love a player asking for things on day one. Your role got smaller.'; tone = 'bad'; }
    } else text = 'You kept quiet and let the camp speak. ' + (fit > 0 ? 'The fit did the rest.' : fit < 0 ? 'The fit was not great, and it shows in your minutes.' : '');
    ev.push({ k: 'season', v: { minsMult: mins } });
    return { effects: ev, tone, text, journal: { tone, text: 'New coach ' + nc.name + ' (' + STYLES[nc.style].label + '): ' + (key === 'buyin' ? 'bought in' : key === 'ask' ? 'asked for a bigger role' : 'kept quiet') + '.' } };
  }
  // the extra steps 'late' should carry this offseason
  function steps(st) {
    const out = []; offseason(st);
    if (flags(st).newCoach && flags(st).newCoach.year === st.league.year) out.push('coach');
    if (roomStory(st)) out.push('room');
    return out;
  }
  // the coach and the room as a page: who the coach is and how you fit, how tight the locker room is, who likes you and who does not, and the groups in it
  const CHEM = (v) => (v >= 5 ? 'Tight' : v >= 2 ? 'Solid' : v > -2 ? 'Okay' : v > -5 ? 'Tense' : 'Toxic');
  function panel(st) {
    const f = flags(st), D = NBA.Decisions, c = coachOf(st, st.teamId), S = STYLES[c.style], fit = fitOf(st), crel = D.relOf(st, 'coach' + st.teamId), chem = Math.max(-8, Math.min(8, (f.locker || 0) + (f.chem || 0)));
    const ms = mates(st), friend = f.room && f.room.friend, beef = f.room && f.room.beef && !f.room.beef.over ? f.room.beef : null;
    const row = (q) => { const v = D.relOf(st, q.id), lbl = friend && friend.id === q.id ? 'Best friend' : beef && beef.id === q.id ? 'Feud' : v >= 2 ? 'Close' : v >= 0.5 ? 'Friendly' : v <= -2 ? 'Feud' : v <= -0.5 ? 'Tense' : 'Neutral'; return { id: q.id, name: q.name, pos: q.pos, age: q.age, ovr: Math.round(NBA.ovr(q)), v, label: lbl }; };
    const rows = ms.map(row), grp = (name, fn) => { const g = rows.filter(fn); return { name, n: g.length, mood: g.length ? g.reduce((a, x) => a + x.v, 0) / g.length : 0 }; };
    const top3 = ms.slice(0, 3).map((q) => q.id);
    return { coach: { name: c.name, style: S.label, blurb: S.blurb, since: c.since, tenure: st.league.year - c.since, fit, rapport: crel >= 2 ? 'He trusts you' : crel <= -1.5 ? 'He is frustrated with you' : 'A working relationship', crel }, chem, chemLabel: CHEM(chem),
      rows: rows.slice().sort((a, b) => Math.abs(b.v) - Math.abs(a.v) || b.ovr - a.ovr).slice(0, 8), groups: [grp('Veterans (30+)', (x) => x.age >= 30), grp('The stars', (x) => top3.includes(x.id)), grp('The young guys (23 and under)', (x) => x.age <= 23)], friend: friend ? friend.name : null, beef: beef ? beef.name : null, log: (f.coachLog || []).slice(-14).reverse() };
  }
  NBA.Room = { panel, STYLES, coachOf, offseason, fitOf, steps, roomStory, roomView, roomChoose, coachView, coachChoose, mates };
})(typeof window !== 'undefined' ? window : globalThis);
