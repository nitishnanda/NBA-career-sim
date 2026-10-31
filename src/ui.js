(function () {
  'use strict';
  const NBA = window.NBA, D = NBA.data, G = NBA.Game;
  const KEY = 'nba-career-sim-save-v1';
  const BUILD = 'build 26 Oct · BallerSim dashboard v89';
  const app = document.getElementById('app');
  let S = null;           // game state
  let draft = { name: '', pos: 'SF', arch: 'scorer', sec: '', home: 'Illinois', sizeMode: 'random', roll: null, ht: null, wd: 0, wsd: 0 };   // size: a random roll for his position, or chosen by hand (ht inches, wd lb above what his height predicts, wsd inches of wingspan beyond the position's norm)
  let alloc = {};
  let report = null;
  let tab = 'overview';

  // ------------------------------------------------------------ helpers
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const k in props || {}) {
      const v = props[k];
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
    }
    kids.flat(Infinity).forEach((c) => { if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c)); });
    return el;
  }
  const f1 = (x) => (x == null ? '–' : x.toFixed(1));
  const pct = (x) => (x == null ? '–' : (x * 100).toFixed(1));
  const ord = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  const money = (m) => '$' + (m >= 100 ? Math.round(m) : m.toFixed(1)) + 'M';
  const stars = (n, off) => h('div', { class: 'stars' }, '★'.repeat(n), off ? h('span', { class: 'off' }, '★'.repeat(5 - n)) : '');
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage may be unavailable */ } }
  function load() { try { const r = localStorage.getItem(KEY); return r ? JSON.parse(r) : null; } catch (e) { return null; } }
  const SNAPKEY = 'nba-career-sim-snap-v1';
  function saveSnap() { try { localStorage.setItem(SNAPKEY, G.getSnap() || ''); } catch (e) { /* too big or blocked: mid-season plan changes just stay off */ } }
  function loadSnap() { try { G.setSnap(localStorage.getItem(SNAPKEY) || null); } catch (e) { G.setSnap(null); } }
  function dropSnap() { try { localStorage.removeItem(SNAPKEY); } catch (e) { /* ignore */ } G.setSnap(null); }
  function wipe() { dropSnap(); try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
  function go() { stopAuto(); view = 'season'; if (S && S.stage !== 'season_play') dropSnap(); save(); render(); window.scrollTo(0, 0); }
  function confirmBtn(label, cls, fn) {
    let armed = false, t = null;
    const b = h('button', { class: cls, onclick: () => {
      if (!armed) { armed = true; b.textContent = 'Tap again to confirm'; t = setTimeout(() => { armed = false; b.textContent = label; }, 3500); return; }
      clearTimeout(t); fn();
    } }, label);
    return b;
  }
  function statBox(v, l) { return h('div', { class: 'statbox' }, h('div', { class: 'big' }, v), h('div', { class: 'lbl' }, l)); }

  function attrBars(p, deltas) {
    return h('div', null, D.ATTRS.map((a) => {
      const v = Math.round(p.attrs[a]);
      return h('div', { class: 'attr' }, h('span', null, D.ATTR_LABELS[a]), h('div', { class: 'bar' }, h('i', { style: 'width:' + v + '%' })), h('b', null, v));
    }));
  }

  // ------------------------------------------------------------ header
  let view = 'season';
  function renderHeader() {
    const nav = document.getElementById('nav'), who = document.getElementById('who');
    nav.textContent = ''; who.textContent = '';
    if (!S || S.stage === 'create') return;
    const p = S.player, ini = p.name.split(/\s+/).map((x) => x[0]).join('').slice(0, 2).toUpperCase();
    [['season', 'Season', 'Season'], ['team', 'Team', 'Team'], ['league', 'Around the league', 'League'], ['career', 'Career', 'Career']].forEach(([k, l, sh]) => nav.append(h('button', { class: view === k ? 'on' : '', onclick: () => { if (view !== k) { stopAuto(); view = k; leagueTeam = null; render(); window.scrollTo(0, 0); } } }, h('span', { class: 'nlg' }, l), h('span', { class: 'nsm' }, sh))));
    who.append(h('div', { class: 'whotxt' }, h('div', null, 'OVR ' + Math.round(NBA.ovr(p)) + ' · ' + archLabel(p)), h('div', { class: 'muted' }, 'Age ' + p.age + ' · ' + p.pos + (S.proSeasons.length ? ' · Year ' + S.proSeasons.length : ''))),
      confirmBtn('New', 'danger tiny', () => { wipe(); S = null; view = 'season'; stopAuto(); boot(); }), h('div', { class: 'avatar' }, ini));
  }

  // ------------------------------------------------------------ screens
  const sizeTxt = (p) => (p && p.ht != null ? NBA.fmtHt(p.ht) + ', ' + p.wt + ' lb' + (p.ws != null ? ', ' + NBA.fmtHt(p.ws) + ' wingspan' : '') : '');   // players from saves before v37 have no size
  // ---- height and weight of the player being created: the slider spans the real 2nd-98th percentile of his position
  const cdf = (z) => 0.5 * (1 + Math.tanh(0.7978845608 * (z + 0.044715 * z * z * z)));
  const armOf = (pos) => Math.round(D.SIZE[pos].arm);
  const mySize = () => {
    const sz = D.SIZE[draft.pos];
    if (draft.sizeMode === 'manual') { const ht = draft.ht != null ? Math.min(sz.hi, Math.max(sz.lo, draft.ht)) : Math.round(sz.ht); return { ht, wt: NBA.wtAt(draft.pos, ht) + (draft.wd || 0), ws: ht + armOf(draft.pos) + (draft.wsd || 0) }; }
    if (!draft.roll || draft.roll.pos !== draft.pos) draft.roll = NBA.randomSize(draft.pos);
    return draft.roll;
  }
  function sizeCard() {
    const sz = D.SIZE[draft.pos], manual = draft.sizeMode === 'manual', note = h('div', { class: 'small muted' }), fx = h('div', { class: 'small' }), warn = h('div', { class: 'szwarn small' });
    const val = () => h('b', { class: 'szv' });
    const v = { ht: val(), wt: val(), ws: val() };
    const show = () => {
      const m = mySize(), z = NBA.sizeZ({ pos: draft.pos, ht: m.ht, wt: m.wt, ws: m.ws });
      v.ht.textContent = NBA.fmtHt(m.ht); v.wt.textContent = m.wt + ' lb'; v.ws.textContent = NBA.fmtHt(m.ws);
      const pc = Math.round(100 * cdf(z.h));
      note.textContent = (pc >= 45 && pc <= 55 ? 'Right at the average height for a ' + draft.pos : (pc > 50 ? 'Taller than ' + pc : 'Shorter than ' + (100 - pc)) + '% of NBA ' + draft.pos + 's') + (z.w > 0.8 ? ', built heavy' : z.w < -0.8 ? ', built lean' : '') + (z.l > 0.8 ? ', with long arms.' : z.l < -0.8 ? ', with short arms.' : '.');
      // how unusual is the whole body? raw z-scores (the displayed z is capped), joint tail of a 3-dof chi-square
      const zh = (m.ht - sz.ht) / sz.sd, zw = (m.wt - NBA.wtAt(draft.pos, m.ht)) / sz.rsd, zl = (m.ws - m.ht - sz.arm) / sz.asd, x = zh * zh + zw * zw + zl * zl;
      const erfc = (t) => { const a = Math.abs(t), k = 1 / (1 + 0.3275911 * a), y = k * (0.254829592 + k * (-0.284496736 + k * (1.421413741 + k * (-1.453152027 + k * 1.061405429)))) * Math.exp(-a * a); return t >= 0 ? y : 2 - y; };
      const tail = Math.max(1e-4, erfc(Math.sqrt(x / 2)) + Math.sqrt((2 * x) / Math.PI) * Math.exp(-x / 2)), one = Math.round(1 / tail);
      const lim = [];
      if (manual) { if (m.ht <= sz.lo) lim.push('shortest'); if (m.ht >= sz.hi) lim.push('tallest'); if ((draft.wd || 0) <= Math.round(-2 * sz.rsd)) lim.push('lightest'); if ((draft.wd || 0) >= Math.round(2 * sz.rsd)) lim.push('heaviest'); if ((draft.wsd || 0) >= 5) lim.push('longest-armed'); if ((draft.wsd || 0) <= -(armOf(draft.pos) + 1)) lim.push('shortest-armed'); }
      warn.className = 'szwarn small ' + (tail < 0.02 ? 'bad' : tail < 0.1 ? 'warm' : 'ok');
      warn.textContent = (tail < 0.005 ? '🚫 Basically unrealistic: only about 1 in ' + one + ' NBA ' + draft.pos + 's would have this exact combination of height, weight and arms. Pull one of the sliders back if you want a believable player.'
        : tail < 0.02 ? '⚠️ Very rare: about 1 in ' + one + ' NBA ' + draft.pos + 's look like this. It is possible, but scouts would call you a freak of nature.'
        : tail < 0.1 ? 'Unusual but real: about 1 in ' + one + ' NBA ' + draft.pos + 's has a build like this.' : '✅ A realistic ' + draft.pos + ' body: plenty of NBA players look like this.') + (lim.length ? ' You are at the limit of the real NBA range (the ' + lim.join(', ') + ' ' + draft.pos + 's the league has had), so the sliders stop there.' : '');
      const up = [], dn = [];
      if (z.h > 0.6) { up.push('rebounding', 'rim protection'); dn.push('ball handling'); } else if (z.h < -0.6) { up.push('ball handling', 'quickness'); dn.push('rebounding', 'rim protection'); }
      if (z.w > 0.8) { up.push('strength inside'); dn.push('quickness'); } else if (z.w < -0.8) { up.push('quickness'); dn.push('strength inside'); }
      if (z.l > 0.8) up.push('rim protection', 'perimeter defence'); else if (z.l < -0.8) dn.push('rim protection', 'perimeter defence');
      const U = [...new Set(up)], Dn = [...new Set(dn)];
      fx.textContent = U.length || Dn.length ? (U.length ? 'A little better at ' + U.join(', ') : '') + (U.length && Dn.length ? '; ' : '') + (Dn.length ? (U.length ? 'a little worse at ' : 'A little worse at ') + Dn.join(', ') : '') + '. Size reshapes your ratings, it never raises them.' : 'No size edge either way: ratings come from your archetype and talent.';
    };
    const slider = (label, min, max, value, onIn, aria, out) => h('div', { class: 'szrow' }, h('label', { class: 'small muted' }, label), h('input', { type: 'range', min, max, step: 1, value, 'aria-label': aria, oninput: (e) => { onIn(+e.target.value); show(); } }), out);
    const readout = (label, out) => h('div', { class: 'szrow szro' }, h('label', { class: 'small muted' }, label), h('span'), out);
    const mode = h('div', { class: 'seg2' },
      h('button', { class: manual ? '' : 'on', onclick: () => { if (manual) { draft.sizeMode = 'random'; draft.roll = null; render(); } } }, '🎲 Random'),
      h('button', { class: manual ? 'on' : '', onclick: () => { if (!manual) { const m = mySize(); draft.sizeMode = 'manual'; draft.ht = m.ht; draft.wd = m.wt - NBA.wtAt(draft.pos, m.ht); draft.wsd = m.ws - m.ht - armOf(draft.pos); render(); } } }, '✋ Choose myself'));
    show();
    const body = manual
      ? [slider('Height', sz.lo, sz.hi, mySize().ht, (x) => { draft.ht = x; }, 'Height', v.ht), slider('Weight', Math.round(-2 * sz.rsd), Math.round(2 * sz.rsd), draft.wd || 0, (x) => { draft.wd = x; }, 'Weight', v.wt), slider('Wingspan', -(armOf(draft.pos) + 1), 5, draft.wsd || 0, (x) => { draft.wsd = x; }, 'Wingspan', v.ws)]
      : [readout('Height', v.ht), readout('Weight', v.wt), readout('Wingspan', v.ws), h('div', { class: 'row', style: 'margin:6px 0' }, h('button', { class: 'tiny', onclick: () => { draft.roll = NBA.randomSize(draft.pos); render(); } }, '🎲 Re-roll'))];
    return h('div', { class: 'szcard' }, h('h3', null, 'Height, weight & wingspan'), h('p', { class: 'small muted' }, 'New to this? Height is the listed height in shoes (6\'6\" = 78 inches). Wingspan is fingertip to fingertip: NBA players usually measure about 4 inches wider than they are tall, so a long wingspan is a plus. Weight is judged against players of your height. The sliders only go as far as real NBA players at your position, and the bar below tells you how rare your combination is.'), mode, ...body, note, warn, fx);
  }
  function screenCreate() {
    const regions = D.REGIONS;
    const stateOptions = [];
    Object.keys(regions).forEach((r) => regions[r].states.slice().sort().forEach((s) => stateOptions.push(h('option', { value: s, selected: s === draft.home }, s + ' (' + r + ')'))));
    const archCards = Object.keys(D.ARCHETYPES).map((k) => {
      const a = D.ARCHETYPES[k];
      return h('div', { class: 'opt' + (draft.arch === k ? ' sel' : ''), onclick: () => { draft.arch = k; if (draft.sec === k) draft.sec = ''; render(); } },
        h('b', null, a.icon + ' ' + a.name), h('div', { class: 'small' }, a.blurb),
        // what a pick of this archetype usually becomes in the sim, and the real players at its top (scripts/arch-cards.js)
        a.typical ? h('div', { class: 'ctyp' }, h('span', { class: 'lab' }, 'Typical pick'), a.typical) : null,
        h('div', { class: 'ctyp' }, h('span', { class: 'lab' }, 'Best of the type'), a.best || a.comps),
        a.odds ? h('div', { class: 'codds' }, a.odds) : null);
    });
    const nameIn = h('input', { type: 'text', placeholder: 'Your name', value: draft.name, maxlength: 28, oninput: (e) => (draft.name = e.target.value) });
    const saved = load();
    return h('div', null,
      h('h1', null, 'Build your NBA legend'),
      h('p', { class: 'muted' }, 'Pick a name, position, archetype and where you grew up. Scouts will rate you, you choose a college, then it is draft night. Stats are tuned to the real NBA: nobody averages 35 for a decade.'),
      saved && saved.stage !== 'create' ? h('div', { class: 'callout row' }, h('span', null, 'Saved career found: ', h('b', null, saved.player.name), ' (' + saved.stage.replace(/_/g, ' ') + ')'), h('span', { class: 'spacer' }), h('button', { class: 'primary', onclick: () => { S = saved; if (S.player && S.player.ht == null) NBA.rollSize(S.player, { sizeFx: false }); if (S.stage === 'season_play') loadSnap(); render(); } }, 'Continue')) : null,
      h('div', { class: 'card' }, h('h2', null, '1. Who are you?'), h('div', { class: 'grid g2' }, h('div', null, h('label', { class: 'small muted' }, 'Name'), nameIn), h('div', null, h('label', { class: 'small muted' }, 'Where in the US are you from?'), h('select', { onchange: (e) => (draft.home = e.target.value) }, stateOptions))),
        h('h3', null, 'Position'), h('div', { class: 'row' }, Object.keys(D.POSITIONS).map((p) => h('button', { class: draft.pos === p ? 'primary' : '', onclick: () => { draft.pos = p; draft.ht = null; draft.wd = 0; draft.wsd = 0; draft.roll = null; render(); } }, p))),
        sizeCard()),
      h('div', { class: 'card' }, h('h2', null, '2. Archetype'), h('div', { class: 'grid g3' }, archCards),
        h('h3', null, 'Secondary tag (optional, small bonus)'), h('select', { onchange: (e) => (draft.sec = e.target.value) }, h('option', { value: '' }, 'None'), Object.keys(D.ARCHETYPES).filter((k) => k !== draft.arch).map((k) => h('option', { value: k, selected: draft.sec === k }, D.ARCHETYPES[k].name)))),
      h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => { S = G.newCareer({ name: (draft.name || '').trim() || 'Rookie', pos: draft.pos, arch: draft.arch, sec: draft.sec, home: draft.home, ht: mySize().ht, wt: mySize().wt, ws: mySize().ws }); S.stage = 'scouting'; S.revealed = false; go(); } }, 'Get scouted →')),
      h('p', { class: 'muted small', style: 'text-align:center;margin-top:18px' }, BUILD));
  }

  function screenScouting() {
    const rep = G.scoutReport(S);
    const box = h('div', { class: 'card' });
    const holder = h('div');
    const info = h('div', { class: 'hidden', style: 'display:none' });
    function fill(n) { holder.replaceChildren(stars(n, true)); }
    box.append(h('h2', null, 'Scouting report'), h('p', { class: 'muted' }, S.player.name + ' · ' + S.player.pos + (sizeTxt(S.player) ? ' · ' + sizeTxt(S.player) : '') + ' · ' + S.player.home), holder, info);
    const details = () => {
      info.style.display = ''; info.className = 'reveal';
      info.replaceChildren(h('h2', { style: 'color:var(--gold)' }, rep.label), h('div', { class: 'row' }, h('span', { class: 'pill' }, 'Current OVR ' + rep.ovr), h('span', { class: 'pill' }, 'Potential grade ' + rep.potential)),
        h('p', { class: 'muted small' }, 'Scouts are not always right. Potential is an estimate; your real ceiling is hidden, and draft slot only loosely predicts it (Jokic went #41).'),
        h('h3', null, 'Current ratings'), attrBars(S.player), h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'primary', onclick: () => { S.stage = 'hs'; S.hsResult = null; DEC().offer(S, 'hs'); go(); } }, 'Next: high school →')));
    };
    if (S.revealed) { fill(rep.stars); details(); } else {
      let i = 0; fill(0);
      const t = setInterval(() => { i++; fill(i); if (i >= S.stars) { clearInterval(t); S.revealed = true; save(); setTimeout(details, 350); } }, 520);
    }
    return h('div', null, box);
  }

  function screenCollegePick() {
    S.collegeOpts = S.collegeOpts || G.collegeOptions(S);
    return h('div', null, h('h1', null, 'Pick your college'),
      h('p', { class: 'muted' }, 'Your ' + S.stars + '★ rating decides who recruits you. Bigger programs give more draft hype but fewer shots; smaller schools mean more usage and stats, less exposure. Home-state schools get a small role bump.'),
      h('div', { class: 'grid g2' }, S.collegeOpts.map((c) => h('div', { class: 'opt', onclick: () => { G.chooseCollege(S, c.id); S.collegeOpts = null; go(); } },
        h('b', null, c.name + (c.home ? ' 🏠' : '')), h('div', { class: 'small muted' }, c.state + ' · program ' + '★'.repeat(c.prestige) + ' · ' + ['', 'Mid-major', 'Rising program', 'Power conference', 'Elite program', 'Blue blood'][c.prestige])))));
  }

  function collegeTable() {
    return h('div', { class: 'scroll' }, h('table', null, h('thead', null, h('tr', null, ['Year', 'School', 'Record', 'GP', 'MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'FG%', '3P%', 'FT%'].map((x) => h('th', null, x)))),
      h('tbody', null, S.collegeYears.map((y) => h('tr', null, h('td', null, y.label), h('td', { class: 'l' }, y.school), h('td', null, y.record), h('td', null, y.line.gp), h('td', null, f1(y.line.mins)), h('td', null, f1(y.line.pts)), h('td', null, f1(y.line.reb)), h('td', null, f1(y.line.ast)), h('td', null, f1(y.line.stl)), h('td', null, f1(y.line.blk)), h('td', null, pct(y.line.fgp)), h('td', null, pct(y.line.tpp)), h('td', null, pct(y.line.ftp)))))));
  }

  function screenCollegeReady() {
    const yr = S.collegeYears.length + 1, Dc = DEC();
    if (yr === 1 && !S.collegeRole && !(S.dec && S.dec.pending && S.dec.pending.id === 'role')) Dc.offer(S, 'role');
    const rolePend = S.dec && S.dec.pending && S.dec.pending.id === 'role';
    if (rolePend) { const v = Dc.view(S); return h('div', null, h('h1', null, S.college.name + ' · what is your role?'), h('p', { class: 'muted' }, 'You are a freshman on a roster full of people who want the ball. How you play your first year shapes your numbers, your hype and your development.'),
      h('div', { class: 'wkgrid' }, v.options.map((o) => h('div', { class: 'wkcard' }, h('b', null, o.label), h('div', { class: 'small', style: 'margin:6px 0' }, o.blurb), h('div', { class: 'small vibe' }, o.vibe), h('div', { style: 'margin-top:8px' }, h('button', { class: 'primary', onclick: () => { try { const r = Dc.choose(S, o.key); S.flash = r.text; save(); render(); } catch (e) { console.error(e); } } }, 'Choose')))))); }
    return h('div', null, h('h1', null, S.college.name + ' · ' + ['Freshman', 'Sophomore', 'Junior', 'Senior'][yr - 1] + ' year'),
      h('div', { class: 'card' }, h('p', null, 'Age ' + S.player.age + ' · OVR ' + Math.round(NBA.ovr(S.player))), attrBars(S.player), h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'primary', onclick: () => { G.playCollege(S); go(); } }, 'Play the season →'))),
      S.collegeYears.length ? h('div', { class: 'card' }, h('h2', null, 'College stats so far'), collegeTable()) : null);
  }

  function screenCollegeDecision() {
    const y = S.collegeYears[S.collegeYears.length - 1], l = y.line;
    const mock = y.mock;
    const proj = tierRange(mock);
    return h('div', null, h('h1', null, y.label + ' season complete'),
      h('div', { class: 'card' }, h('div', { class: 'grid stats' }, statBox(f1(l.pts), 'PPG'), statBox(f1(l.reb), 'RPG'), statBox(f1(l.ast), 'APG'), statBox(f1(l.stl), 'SPG'), statBox(f1(l.blk), 'BPG'), statBox(pct(l.ts) + '%', 'TS%')),
        h('p', { style: 'margin-top:12px' }, h('b', null, y.record), ' · ' + y.tourney), y.honors.length ? h('div', null, y.honors.map((x) => h('span', { class: 'pill gold' }, '🏅 ' + x))) : null),
      (!S.transferred && !y.mustDeclare && (y.mock.mid > 20 || !y.honors.length) ? h('div', { class: 'card' }, h('h2', null, 'Transfer portal'), h('p', { class: 'small muted' }, 'It is not going the way you hoped here. You can leave for a new school and a new role, but you lose a year of chemistry and the new place may not be better. Once.'),
        h('div', { class: 'wkgrid' }, (S.transferOpts && S.transferOpts.y === S.collegeYears.length ? S.transferOpts : (S.transferOpts = { y: S.collegeYears.length, l: G.collegeOptions(S).filter((c) => c.id !== S.college.id).slice(0, 4) })).l.map((c) => h('div', { class: 'wkcard' }, h('b', null, c.name), h('div', { class: 'small muted' }, c.state + ' · program ' + '★'.repeat(c.prestige)), h('div', { style: 'margin-top:8px' }, confirmBtn('Transfer here', '', () => { G.transferCollege(S, c.id); alloc = {}; go(); })))))) : null),
      h('div', { class: 'card' }, h('h2', null, 'Draft stock'), h('p', null, 'Where the mock drafts have you: ', h('b', null, proj)),
        h('p', { class: 'muted small' }, 'Staying develops your game (and adds upgrade points) but draft boards move on, and you only get so many years of eligibility.'),
        h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => { G.declare(S); go(); } }, 'Declare for the NBA Draft'),
          y.mustDeclare ? h('span', { class: 'muted' }, 'Senior year: eligibility is up.') : h('button', { onclick: () => { G.stayInCollege(S); alloc = {}; go(); } }, 'Stay another year'))),
      h('div', { class: 'card' }, h('h2', null, 'College stats'), collegeTable()));
  }

  // ------------------------------------------------------------ draft combine and draft night
  const ftIn = (x) => { const f = Math.floor(x / 12), r = Math.round((x - 12 * f) * 4) / 4; return f + "'" + String(r).replace(/\.0$/, '') + '"'; };
  const tierOf = (pc) => (pc >= 90 ? ['Elite', 'p-elite'] : pc >= 70 ? ['Above average', 'p-good'] : pc >= 30 ? ['Average', 'p-mid'] : pc >= 10 ? ['Below average', 'p-low'] : ['Poor', 'p-poor']);
  const pbar = (pc) => { const t = tierOf(pc); return h('div', { class: 'pbarw' }, h('div', { class: 'pbar' }, h('i', { class: t[1], style: 'width:' + Math.max(3, pc) + '%' })), h('span', { class: 'ptag ' + t[1] }, t[0] + ' · ' + ord(pc))); };
  const slotTier = (n) => (n > 60 ? 'undrafted' : n <= 5 ? 'a top-5 pick' : n <= 14 ? 'the lottery' : n <= 20 ? 'the middle of the first round' : n <= 30 ? 'the end of the first round' : n <= 45 ? 'the early second round' : 'the late second round');
  const tierRange = (m) => { if (!m) return '–'; const a = slotTier(m.lo), b = slotTier(Math.min(61, m.hi)); return a === b ? 'around ' + a + ' (mocks disagree)' : 'from ' + a + ' to ' + b + ' (mocks disagree)'; };

  function screenCombine() {
    const p = S.player, cb = p.cmb, c = S.combine;
    if (!cb || !c) { G.enterDraft(S); save(); return screenDraft(); }   // a save from before the combine existed
    const pos = D.SIZE[p.pos] ? p.pos : 'SF', ap = NBA.ATH_POS[pos] || [58.5, 12.7], athz = (p.attrs.ath - ap[0]) / ap[1];
    const tile = (lbl, val, pc, sub) => h('div', { class: 'ctile' }, h('div', { class: 'ctl' }, lbl), h('div', { class: 'ctv' }, val), pc != null ? pbar(pc) : null, sub ? h('div', { class: 'small muted' }, sub) : null);
    const meas = h('div', { class: 'ctiles' }, tile('Height (no shoes)', ftIn(cb.hb), cb.pct.hgt, 'vs. ' + pos + 's at the combine'), tile('Weight', cb.wt + ' lb', cb.pct.wgt), tile('Wingspan', ftIn(cb.ws), cb.pct.ws, (cb.ws - cb.hb >= 0 ? '+' : '') + (Math.round((cb.ws - cb.hb) * 4) / 4) + '" over his height'), tile('Standing reach', ftIn(cb.reach), cb.pct.reach));
    const cards = [h('h1', null, 'NBA Draft Combine'), h('p', { class: 'muted' }, c.year + ' · Chicago · every team in the building. ' + S.player.name + ' · ' + p.pos + ' · ' + S.college.name), h('div', { class: 'card' }, h('h2', null, 'Measurements'), meas)];
    if (!c.done) {
      const hint = athz >= 0.7 ? 'You are one of the more explosive ' + pos + 's out there. The tests should help you.' : athz <= -0.7 ? 'Your athleticism is below average for a ' + pos + '. The tests could cost you, though skipping costs a little too.' : 'Your athleticism is about average for a ' + pos + ': testing is close to a coin flip.';
      cards.push(h('div', { class: 'card' }, h('h2', null, 'Athletic testing'), h('p', null, 'Vertical leap, lane agility, three-quarter-court sprint, shuttle run and the bench press. Scouts read them against every other ' + pos + ' in the gym. Skip them and they only have your measurements and the tape, and a skip always raises an eyebrow.'),
        h('p', { class: 'small muted' }, h('b', null, 'Your read: '), hint, ' Testing never changes your ratings, only what scouts think of you.'),
        h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => { G.runCombine(S, true); save(); render(); window.scrollTo(0, 0); } }, '🏃 Take all the tests'), h('button', { onclick: () => { G.runCombine(S, false); save(); render(); window.scrollTo(0, 0); } }, '🧤 Skip: measurements only'))));
    } else {
      if (c.test) {
        const t = cb.tests, row = (lbl, val, pc) => h('div', { class: 'trow' }, h('span', { class: 'tl' }, lbl), h('b', { class: 'tv' }, val), pbar(pc));
        cards.push(h('div', { class: 'card' }, h('h2', null, 'Athletic testing'), row('Max vertical', t.mxv + '"', cb.pct.vert), row('Standing vertical', t.stv + '"', cb.pct.vert), row('Lane agility', t.lane.toFixed(2) + ' s', cb.pct.lane), row('3/4-court sprint', t.sprint.toFixed(2) + ' s', cb.pct.sprint), row('Shuttle run', t.shuttle.toFixed(2) + ' s', cb.pct.shuttle), row('Bench press (185 lb)', t.bench + ' reps', cb.pct.bench),
          h('p', { class: 'small muted', style: 'margin-top:10px' }, 'Percentiles against the real combine classes, 2000 to 2026, for ' + pos + 's.')));
      } else cards.push(h('div', { class: 'card' }, h('h2', null, 'Athletic testing'), h('p', null, 'You skipped it. Scouts have your measurements and your tape, and the question marks are on you.')));
      // mock drafts: three outlets and their consensus, all of the class you will face on draft night; the combine moved them, and you only see how
      const L0 = S.league, ord0 = (S.draftOrder || []).map((id) => L0.teams[id]).filter(Boolean);
      if (ord0.length) cards.push(h('div', { class: 'card' }, h('h2', null, 'Draft order'), h('p', { class: 'small muted' }, 'The lottery has been held. The rest of the first round follows by record, then round 2 in the same order.'),
        h('div', { class: 'lotgrid' }, ord0.slice(0, 14).map((t, i) => h('div', { class: 'lotrow' }, h('span', { class: 'pn' }, i + 1), logo(t.nick, 26), h('div', { class: 'pmain' }, h('b', null, t.nick), h('div', { class: 'small muted' }, t.wins + '-' + t.losses)))))));
      const mk = c.mocks, R = mk.ranks, cons = R.after[3] - R.before[3], mv = -cons, altD = R.after[3] - R.alt[3];
      const idxTab = Math.min(S.mockTab == null ? 3 : S.mockTab, mk.outlets.length - 1), ob = mk.outlets[idxTab];
      const arrow = (i) => { const d = R.before[i] - R.after[i]; return d >= 2 ? h('span', { class: 'pill good' }, '▲ up') : d <= -2 ? h('span', { class: 'pill bad' }, '▼ down') : h('span', { class: 'pill' }, '▬ steady'); };
      const tabs = h('div', { class: 'seg2 mocktabs' }, mk.outlets.map((o, i) => h('button', { class: i === idxTab ? 'on' : '', onclick: () => { S.mockTab = i; render(); } }, o.name)));
      const list = ob.rows.map((r) => h('div', { class: 'mrow' + (r.isUser ? ' me' : '') }, h('span', { class: 'pn' }, r.slot), logo(r.nick, 24), h('div', { class: 'pmain' }, h('b', null, r.isUser ? '⭐ ' + r.name : r.name), h('span', { class: 'small muted' }, ' ' + r.pos + ' · ' + r.age + ' · ' + (r.from || '—')))));
      const chips = []; const P = cb.parts; const chip = (lbl, v) => { if (Math.abs(v) >= 0.2) chips.push(h('span', { class: 'pill ' + (v > 0 ? 'good' : 'bad') }, lbl + ' ' + (v > 0 ? '+' : '') + v.toFixed(1))); };
      if (c.test) chip('Athletic testing', P.ath); else chip('Skipped the testing', P.ath); chip('Height', P.hgt); chip('Length', P.len); chip('Frame', P.wgt);
      cards.push(h('div', { class: 'card' }, h('h2', null, 'Mock drafts'), h('p', { class: 'small muted' }, 'Three outlets mock the class you will face. Mocks are educated guesses: they agree on the top of the board and argue about the rest, and the real night can differ.'), tabs,
        h('div', { class: 'mocklist' }, list), !ob.rows.some((r) => r.isUser) ? h('div', { class: 'small muted', style: 'margin-top:8px' }, 'This mock does not have you in the first round.') : null,
        h('div', { class: 'mockmoves' }, h('div', { class: 'small muted' }, 'Since the combine'), mk.outlets.map((o, i) => h('div', { class: 'kv' }, h('span', null, o.name), arrow(i)))),
        h('p', { class: 'stockmove ' + (mv >= 2 ? 'up' : mv <= -2 ? 'down' : '') }, mv >= 2 ? '▲ the mocks have you higher after the combine' : mv <= -2 ? '▼ the mocks have you lower after the combine' : '▬ the mocks barely moved'),
        h('div', { style: 'margin:6px 0' }, chips.length ? chips : h('span', { class: 'muted small' }, 'Nothing about your numbers stood out.')),
        Math.abs(altD) >= 2 ? h('p', { class: 'small muted' }, (c.test ? 'Skipping the tests' : 'Taking the tests') + ' would have moved the consensus about ' + Math.abs(altD) + (altD > 0 ? ' spots in your favour.' : ' spots against you.')) : null,
        c.comp ? h('p', { class: 'small' }, h('b', null, 'Measurables comp: '), c.comp.name + ' (' + c.comp.year + ' combine: ' + ftIn(c.comp.hgt) + ', ' + c.comp.wgt + ' lb, ' + ftIn(c.comp.ws) + ' wingspan)') : null,
        h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'primary', onclick: () => { G.startWorkouts(S); go(); } }, 'On to the workouts →'))));
    }
    return h('div', null, cards);
  }

  // pre-draft workouts: teams around where the mocks have you invite you in; you can visit four. How it went is a read, not a number, and a team that loves you may reach for you
  function screenWorkouts() {
    const w = S.workouts; if (!w) { G.startWorkouts(S); save(); return screenWorkouts(); }
    const used = Object.keys(w.done).length, left = w.max - used;
    const card = (v) => { const r = w.done[v.id];
      return h('div', { class: 'wkcard' + (r ? ' done t' + r.tier : '') }, h('div', { class: 'row' }, logo(v.nick, 44), h('div', null, h('b', null, v.name), h('div', { class: 'small muted' }, 'Last season ' + v.rec + ' · holds the ' + ord(v.slot) + ' pick'))),
        h('div', { class: 'small', style: 'margin:8px 0' }, v.need), r ? h('div', { class: 'wkres' }, r.msg) : h('button', { disabled: left <= 0, onclick: () => { G.doWorkout(S, v.id); save(); render(); } }, left > 0 ? 'Work out for them' : 'No visits left')); };
    return h('div', null, h('h1', null, 'Pre-draft workouts'), h('p', { class: 'muted' }, 'Teams around where the mock drafts have you invited you in. You can visit ' + w.max + '. Each visit is a read on how it went: a team that loves you may reach for you on the night, and one that cools on you may pass. Skip the rest and they only have your tape and the combine.'),
      h('div', { class: 'card' }, h('div', { class: 'row' }, h('h2', { style: 'margin:0' }, left + ' of ' + w.max + ' visits left'), h('span', { class: 'spacer' }), h('button', { class: 'primary', onclick: () => { G.enterDraft(S); go(); } }, left > 0 && used ? 'Head to the draft (skip ' + left + ') →' : used ? 'Head to the draft →' : 'Skip the workouts →')),
        h('div', { class: 'wkgrid' }, w.invites.map(card))));
  }

  // draft night is paced like the real one: the top of the lottery gets time, the second round moves, and your own pick is built up and then held until you are ready
  let draftTimer = null;
  function screenDraft() {
    if (draftTimer) { clearTimeout(draftTimer); draftTimer = null; }
    const d = S.draft, board = d.board, L = S.league, p = S.player, N = board.length, mine = board.findIndex((r) => r.isUser);   // mine: -1 when undrafted
    board.forEach((r) => { if (!r.nick) r.nick = (r.team || '').split(' ').slice(-1)[0]; if (r.mockRank == null) r.mockRank = r.slot; });   // boards saved before v39 had 30 picks and no pre-draft rank
    const tag = (r) => { const dl = r.slot - r.mockRank; return dl >= 12 ? ['▲ Steal', 'good'] : dl <= -12 ? ['▼ Reach', 'bad'] : r.slot <= 3 ? ['Franchise pick', 'gold'] : null; };   // taken 12+ spots later / earlier than his talent-only rank
    const chipOf = (r) => ftIn(r.ht) + (r.ws ? ' · ' + ftIn(r.ws) + ' WS' : '');
    const prow = (r) => { const t = r.isUser ? null : tag(r); return h('div', { class: 'prow reveal' + (r.isUser ? ' me' : '') + (r.slot <= 5 ? ' top' : '') }, h('span', { class: 'pn' }, r.slot), logo(r.nick, 30),
      h('div', { class: 'pmain' }, h('b', null, r.isUser ? '⭐ ' + r.name : r.name), h('div', { class: 'small muted' }, r.pos + ' · ' + r.age + ' · ' + (r.from || '—'))), h('div', { class: 'pside' }, h('span', { class: 'small' }, r.nick), r.via ? h('span', { class: 'small muted' }, 'via ' + r.via) : null, h('span', { class: 'small muted' }, chipOf(r))), r.tradedTo ? h('span', { class: 'pill gold' }, '⇄ Traded to ' + r.tradedTo) : t ? h('span', { class: 'pill ' + t[1] }, t[0]) : null); };
    const r1 = h('div', { class: 'pround' }, h('div', { class: 'rhead' }, 'Round 1')), r2 = h('div', { class: 'pround' }, h('div', { class: 'rhead' }, 'Round 2'));
    // the lottery has been held: every slot already shows who holds the pick (the same for every slot, so nothing gives away where you will go); the player fills in when it is announced
    // (a pick that changes hands on the night shows its original owner until the trade is announced)
    const pending = (r, orig) => { const o = orig && r.via; return h('div', { class: 'prow pending' }, h('span', { class: 'pn' }, r.slot), logo(o ? r.via : r.nick, 30), h('div', { class: 'pmain' }, h('b', { class: 'muted' }, o ? r.viaName : r.team), h('div', { class: 'small muted' }, 'Last season ' + ((o ? r.viaRec : r.teamRec) || '–'))), h('div', { class: 'pside' }, h('span', { class: 'small muted' }, 'on the board'))); };
    const rowEls = board.map((r) => pending(r, true)); rowEls.forEach((el, i) => (i < 30 ? r1 : r2).append(el));
    const swapPending = (slot) => { const el = rowEls[slot - 1]; if (el && el.classList.contains('pending')) { const n = pending(board[slot - 1], false); el.replaceWith(n); rowEls[slot - 1] = n; } };
    const tradeAt = {}, tradeDone = {}; (d.trades || []).forEach((e) => { tradeAt[e.slot] = e; });
    const clock = h('div', { class: 'onclock well' }), controls = h('div', { class: 'row dctl' }), wrap = h('div'), prog = h('div', { class: 'bar2' }, h('i', { style: 'width:0%' }));
    const pickLine = (r, big) => h('div', { class: big ? 'bigpick' : '' }, h('div', { class: 'cap2' }, 'Pick ' + r.slot + ' · ' + (r.slot <= 30 ? 'Round 1' : 'Round 2')), h('div', { class: 'clk' }, logo(r.nick, big ? 72 : 56), h('div', null, h('div', { class: 'small muted' }, 'With the ' + ord(r.slot) + ' pick, the ' + r.team + ' select'), h('div', { class: 'clkname' }, r.isUser ? '⭐ ' + r.name : r.name), h('div', { class: 'small muted' }, r.pos + ' · ' + r.age + ' · ' + (r.from || '—') + ' · ' + chipOf(r)))));
    // --- your road to the draft: nothing about where you are projected until your name is called; then how the mocks had you
    const cb = p.cmb, mk = d.mocks;
    const ruler = (marks) => {
      const x = (v) => 6 + 88 * (Math.min(60, Math.max(1, v)) - 1) / 59, ms = marks.filter((m) => m.v != null), merged = [];
      ms.forEach((m) => { const same = merged.find((q) => !q.big && !m.big && Math.abs(q.v - m.v) < 3); if (same) same.t += ' · ' + m.t; else merged.push(Object.assign({}, m)); });
      return h('div', { html: '<svg viewBox="0 0 100 34" class="ruler"><line x1="6" y1="14" x2="94" y2="14" stroke="rgba(255,255,255,.25)" stroke-width="1"/>' + [1, 10, 20, 30, 40, 50, 60].map((t) => '<text x="' + x(t) + '" y="32" font-size="4" text-anchor="middle" fill="rgba(255,255,255,.45)">' + t + '</text>').join('')
        + merged.map((m) => '<circle cx="' + x(m.v) + '" cy="14" r="' + (m.big ? 4.2 : 2.6) + '" fill="' + m.c + '"/><text x="' + Math.min(88, Math.max(12, x(m.v))) + '" y="' + (m.big ? 6 : 24) + '" font-size="3.8" text-anchor="middle" fill="' + m.c + '">' + m.t + '</text>').join('') + '</svg>' });
    };
    const mocksLine = () => (mk ? h('div', { class: 'rulerwrap' }, h('div', { class: 'small muted' }, 'Where the mock drafts had you, and where you went'), mk.outlets.slice(0, 3).map((n, i) => h('div', { class: 'kv' }, h('span', null, n), h('b', null, mk.ranks.after[i] > 60 ? 'out of the first two rounds' : '#' + mk.ranks.after[i]))),
      ruler([{ v: mk.ranks.after[3], c: '#9ecbff', t: 'mocks' }, { v: d.slot || null, c: '#ffd166', t: '#' + d.slot, big: true }])) : null);
    const story = h('section', { class: 'card' }, h('h2', null, 'Your road to the draft'),
      h('div', { class: 'kv' }, h('span', null, 'College'), h('b', null, S.college.name)), h('div', { class: 'kv' }, h('span', null, 'Combine'), h('b', null, d.tested ? 'Tested' + (cb && cb.bonus >= 0.5 ? ' · buzz up' : cb && cb.bonus <= -0.5 ? ' · buzz down' : '') : 'Skipped the tests')),
      cb ? h('div', { class: 'kv' }, h('span', null, 'Measurables'), h('b', null, ftIn(cb.hb) + ' · ' + cb.wt + ' lb · ' + ftIn(cb.ws) + ' WS')) : null, h('div', { class: 'rulerwrap small muted' }, 'Nobody knows where you will go. Every team has you on its board. Wait for your name.'));
    const host = h('div', { class: 'dgrid' }, h('div', { class: 'dleft' }, h('section', { class: 'card dhead' }, h('h2', null, d.year + ' NBA Draft'), h('div', { class: 'cap2' }, 'Barclays Center, Brooklyn · night of · ' + S.player.name), prog, clock, controls), r1, r2), h('div', { class: 'dside' }, story, wrap));
    // --- the reveal
    let idx = 0, auto = true, wrapped = false, phase = 0, held = false;
    const setProg = () => { prog.firstChild.style.width = Math.round(100 * idx / N) + '%'; };
    const showWrap = () => {
      if (wrapped) return; wrapped = true;
      const t = L.teams[d.teamId], ros = NBA.rosterOf(L, t).slice(0, 3), myOvr = Math.round(NBA.ovr(p)), rank = 1 + NBA.rosterOf(L, t).filter((q) => NBA.ovr(q) > NBA.ovr(p)).length;
      const dl = d.slot && mk ? mk.ranks.after[3] - d.slot : 0;
      const verdict = !d.slot ? 'Your name was never called.' : dl >= 6 ? 'You went about ' + dl + ' spots higher than the mock drafts had you.' : dl <= -6 ? 'You slid about ' + -dl + ' spots below the mock drafts.' : 'Right about where the mock drafts had you.';
      const tops = board.slice(0, 5), others = board.filter((r) => !r.isUser), steal = others.slice().sort((a, b) => (b.slot - b.mockRank) - (a.slot - a.mockRank))[0], reach = others.slice().sort((a, b) => (a.slot - a.mockRank) - (b.slot - b.mockRank))[0];
      wrap.replaceChildren(
        h('section', { class: 'card callout reveal' }, d.slot ? h('div', null, h('div', { class: 'big' }, '#' + d.slot + ' pick' + (d.userTrade ? ' · traded' : '')), h('p', null, 'With the ' + ord(d.slot) + ' pick in the ' + d.year + ' NBA Draft, the ' + (d.draftedBy || d.team) + ' select ', h('b', null, S.player.name), ' of ' + d.college + '.'), d.userTrade ? h('p', null, h('b', null, 'Then: '), d.userTrade.text + '. You are a ' + d.userTrade.toNick.replace(/s$/, '') + ' now.') : null, h('p', { class: 'muted small' }, verdict)) : h('div', null, h('div', { class: 'big' }, 'Undrafted'), h('p', null, 'Your name was never called. You signed a minimum deal with the ' + d.team + ' right after the draft. Prove them wrong.'), h('p', { class: 'muted small' }, verdict)),
          h('p', null, 'Rookie contract: ' + money(S.contract.salary) + ' × ' + S.contract.years + ' years'), h('button', { class: 'primary', onclick: () => { G.startPro(S); alloc = {}; go(); } }, 'Start my NBA career →')),
        h('section', { class: 'card' }, h('h2', null, 'Your landing spot'), h('div', { class: 'row' }, logo(t.nick, 44), h('div', null, h('b', null, t.name), d.userTrade ? h('div', { class: 'small gold' }, 'Drafted by the ' + d.draftedBy + ', traded to the ' + t.nick) : null, h('div', { class: 'small muted' }, 'Last season ' + (t.wins + '-' + t.losses) + ' · ' + (t.conf === 'W' ? 'West' : 'East')))),
          h('div', { class: 'small', style: 'margin-top:8px' }, h('b', null, 'Core: '), ros.map((q) => q.name + ' (' + Math.round(NBA.ovr(q)) + ')').join(' · ')), h('div', { class: 'small muted' }, 'You arrive as a ' + myOvr + ' OVR, which would rank ' + ord(rank) + ' on the roster today.')),
        h('section', { class: 'card' }, h('h2', null, 'Class notes'), h('div', { class: 'small' }, h('b', null, 'Top of the board: '), tops.map((r) => r.slot + '. ' + r.name + ' (' + r.nick + ')').join(' · ')),
          steal && steal.slot - steal.mockRank >= 5 ? h('div', { class: 'small', style: 'margin-top:6px' }, h('b', null, 'Biggest steal: '), steal.name + ', ' + ord(steal.slot) + ' pick (ranked ' + ord(steal.mockRank) + ' by talent).') : null,
          reach && reach.mockRank - reach.slot >= 5 ? h('div', { class: 'small', style: 'margin-top:6px' }, h('b', null, 'Biggest reach: '), reach.name + ', ' + ord(reach.slot) + ' pick (ranked ' + ord(reach.mockRank) + ' by talent).') : null));
      story.querySelector('.rulerwrap').replaceWith(mocksLine() || h('div'));
    };
    // how long a pick stays on screen before the next one: the top of the lottery gets the longest, your neighbours get a beat of tension, the rest of the board moves once you are in
    const delayAfter = (r) => { if (mine >= 0 && idx > mine) return r.slot <= 30 ? 650 : 380; const next = idx; return (r.slot <= 3 ? 4200 : r.slot <= 5 ? 3400 : r.slot <= 14 ? 2500 : r.slot <= 30 ? 1700 : 1000) + (mine >= 0 && mine - next >= 0 && mine - next <= 2 ? 1600 : 0); };
    const awayNote = (r) => { const n = mine - idx; return mine >= 0 && n >= 1 && n <= 5 ? h('div', { class: 'small gold', style: 'margin-top:6px' }, n === 1 ? 'You are next.' : 'You are ' + n + ' picks away.') : null; };
    const append = (r) => { const el = prow(r); rowEls[r.slot - 1].replaceWith(el); rowEls[r.slot - 1] = el; };
    const reveal = (r) => { append(r); idx++; S.draftProg = idx; setProg(); clock.replaceChildren(pickLine(r)); const a = awayNote(r); if (a) clock.firstChild.append(a); };
    const finish = () => { auto = false; if (!S.draftSeen) { S.draftSeen = true; save(); } showWrap(); clock.replaceChildren(h('div', null, h('div', { class: 'cap2' }, 'Draft complete'), h('div', { class: 'small muted' }, N + ' picks in two rounds · ' + d.classSize + ' prospects'))); controls.replaceChildren(); };
    const setControls = () => {
      if (held) return;
      controls.replaceChildren(...[h('button', { onclick: () => { auto = !auto; if (auto) schedule(600); else if (draftTimer) { clearTimeout(draftTimer); draftTimer = null; } setControls(); } }, auto ? '⏸ Pause' : '▶ Play'), !auto ? h('button', { onclick: () => step(true) }, 'Next pick ▸') : null,
        mine >= 0 && idx <= mine ? h('button', { onclick: toMine }, 'Skip to my pick ▸▸') : null, h('button', { onclick: all }, 'Reveal everything ⏭')].filter(Boolean));
    };
    const schedule = (ms) => { if (draftTimer) clearTimeout(draftTimer); draftTimer = setTimeout(() => step(false), ms); };
    // your pick: the call comes in (2.6 s), the team turns in its card (2.6 s), then the pick is shown and held until you press Continue
    const yourPick = () => {
      const r = board[mine]; held = true; controls.replaceChildren();
      if (phase === 0) { phase = 1; clock.replaceChildren(h('div', { class: 'suspense' }, h('div', { class: 'cap2' }, 'Pick ' + r.slot), logo(r.nick, 64), h('div', { class: 'clkname' }, 'The ' + r.team + ' are on the clock'), h('div', { class: 'small muted' }, '📱 Your phone is ringing…'))); draftTimer = setTimeout(yourPick, 3000); return; }
      if (phase === 1) { phase = 2; clock.replaceChildren(h('div', { class: 'suspense' }, h('div', { class: 'cap2' }, 'Pick ' + r.slot), logo(r.nick, 64), h('div', { class: 'clkname' }, 'The ' + r.team + ' have turned in their card'), h('div', { class: 'small muted' }, 'The commissioner is walking to the podium…'))); draftTimer = setTimeout(yourPick, 2800); return; }
      append(r); idx++; S.draftProg = idx; setProg(); clock.replaceChildren(pickLine(r, true), h('p', { class: 'small', style: 'margin-top:10px' }, 'Welcome to the ' + r.team + '. Take a second.'));
      controls.replaceChildren(h('button', { class: 'primary', onclick: () => { if (d.userTrade) return userTradeScene(); held = false; showWrap(); auto = true; setControls(); schedule(1400); } }, 'Continue →'));
    };
    // right after you are picked: breaking news, your rights are moved
    const userTradeScene = () => {
      const ut = d.userTrade, r = board[mine]; held = true; controls.replaceChildren();
      clock.replaceChildren(h('div', { class: 'suspense' }, h('div', { class: 'cap2' }, 'Breaking'), h('div', { class: 'clkname' }, 'Wait. There is news on your pick…'), h('div', { class: 'small muted' }, '📱 Your phone is buzzing again…')));
      draftTimer = setTimeout(() => {
        r.tradedTo = ut.toNick; append(r); if (ut.slotBack) swapPending(ut.slotBack);
        clock.replaceChildren(h('div', { class: 'bigpick' }, h('div', { class: 'cap2' }, 'Draft-night trade'), h('div', { class: 'clk' }, logo(ut.fromNick, 56), h('span', { class: 'tradearrow' }, '➜'), logo(ut.toNick, 72), h('div', null, h('div', { class: 'clkname' }, 'Traded to the ' + ut.to), h('div', { class: 'small muted' }, ut.text))), h('p', { class: 'small', style: 'margin-top:10px' }, 'Same rookie contract, new team, new situation. Take a second.')));
        controls.replaceChildren(h('button', { class: 'primary', onclick: () => { held = false; showWrap(); auto = true; setControls(); schedule(1400); } }, 'Continue →'));
      }, 2800);
    };
    // another team trades up: announced just before the earlier pick, both slots change hands
    const tradeScene = (e) => {
      tradeDone[e.slot] = true; swapPending(e.slot); swapPending(e.other);
      clock.replaceChildren(h('div', { class: 'suspense' }, h('div', { class: 'cap2' }, '🔁 Trade alert · pick ' + e.slot), h('div', { class: 'clk' }, logo(e.downNick, 44), h('span', { class: 'tradearrow' }, '⇄'), logo(e.upNick, 44), h('div', { class: 'clkname' }, e.upNick + ' move up')), h('div', { class: 'small muted' }, e.text)));
    };
    const step = (manual) => {
      draftTimer = null; if (idx >= N) return finish();
      if (tradeAt[idx + 1] && !tradeDone[idx + 1] && !S.draftSeen) { tradeScene(tradeAt[idx + 1]); if (auto && !manual) schedule(3200); setControls(); return; }
      if (idx === mine && !wrapped && !S.draftSeen) return yourPick();
      const r = board[idx]; reveal(r); if (idx >= N) return finish();
      if (auto && !manual) schedule(delayAfter(r)); setControls();
    };
    function toMine() { if (draftTimer) clearTimeout(draftTimer); draftTimer = null; (d.trades || []).forEach((e) => { if (e.slot <= mine) { tradeDone[e.slot] = true; swapPending(e.slot); swapPending(e.other); } }); while (idx < mine) { append(board[idx]); idx++; } setProg(); auto = true; step(false); }
    function all() { if (draftTimer) { clearTimeout(draftTimer); draftTimer = null; } held = false; if (d.userTrade && mine >= 0) board[mine].tradedTo = d.userTrade.toNick; while (idx < N) { append(board[idx]); idx++; } setProg(); clock.replaceChildren(pickLine(board[N - 1])); finish(); }
    if (S.draftSeen) { if (d.userTrade && mine >= 0) board[mine].tradedTo = d.userTrade.toNick; board.forEach((r) => append(Object.assign({}, r))); idx = N; setProg(); clock.replaceChildren(h('div', { class: 'small muted' }, 'Draft complete')); showWrap(); }
    else if (S.draftProg > 0 && S.draftProg < N) {   // the screen was redrawn mid-draft: pick up where it was
      (d.trades || []).forEach((e) => { if (e.slot <= S.draftProg + 1) { tradeDone[e.slot] = true; swapPending(e.slot); swapPending(e.other); } });
      while (idx < S.draftProg) { append(board[idx]); idx++; } setProg(); if (mine >= 0 && idx > mine) { phase = 2; if (d.userTrade) board[mine].tradedTo = d.userTrade.toNick; append(board[mine]); showWrap(); }
      clock.replaceChildren(h('div', { class: 'small muted' }, 'Back on the clock…')); setControls(); draftTimer = setTimeout(() => step(false), 1500);
    } else { clock.replaceChildren(h('div', null, h('div', { class: 'cap2' }, 'Green room'), h('div', { class: 'clkname' }, 'The commissioner approaches the podium…'), h('div', { class: 'small muted' }, N + ' picks, two rounds. Nobody knows where you will go.'))); setControls(); draftTimer = setTimeout(() => step(false), 3500); }
    return h('div', null, host);
  }

  function screenTraining() {
    const info = G.trainingInfo(S);
    if (report) return screenReport();
    const used = D.ATTRS.reduce((s, a) => s + (alloc[a] || 0), 0);
    const left = info.points - used;
    const rows = D.ATTRS.map((a) => {
      const v = Math.round(S.player.attrs[a]);
      const add = alloc[a] || 0;
      return h('div', { class: 'attr train' }, h('span', null, D.ATTR_LABELS[a]), h('div', { class: 'bar' }, h('i', { style: 'width:' + Math.min(100, v + add) + '%' })), h('b', null, v + (add ? ' +' + add : '')),
        h('div', { class: 'ctl' }, h('button', { disabled: !add, onclick: () => { alloc[a] = add - 1; render(); } }, '−'), h('button', { disabled: left <= 0 || add >= 4, onclick: () => { alloc[a] = add + 1; render(); } }, '+')));
    });
    return h('div', null, h('h1', null, 'Offseason training'),
      h('p', { class: 'muted' }, 'Spend upgrade points (max +4 per attribute). Gains shrink at high ratings and after 31. Natural development and aging happen after you confirm.'),
      h('div', { class: 'card' }, h('div', { class: 'row' }, h('h2', { style: 'margin:0' }, left + ' / ' + info.points + ' points left'), h('span', { class: 'spacer' }), h('button', { onclick: () => { alloc = G.autoAlloc(S.player, info.points); render(); } }, 'Auto-allocate'), h('button', { onclick: () => { alloc = {}; render(); } }, 'Reset')), rows,
        h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'primary', onclick: () => { try { report = G.train(S, alloc); alloc = {}; go(); } catch (e) { console.error(e); } } }, 'Confirm & advance the offseason'))));
  }

  function screenReport() {
    const r = report;
    return h('div', null, h('h1', null, 'Offseason report · age ' + r.age),
      h('div', { class: 'card' }, h('div', { class: 'row' }, h('div', { class: 'big' }, r.ovr0 + ' → ' + r.ovr1), h('span', { class: r.ovr1 >= r.ovr0 ? 'pos' : 'neg' }, (r.ovr1 - r.ovr0 >= 0 ? '+' : '') + (r.ovr1 - r.ovr0) + ' OVR'), h('span', { class: 'muted small' }, 'upgrades contributed ' + (r.trainGain >= 0 ? '+' : '') + r.trainGain)),
        h('div', { class: 'grid g2', style: 'margin-top:10px' }, r.changes.map((c) => { const d = c.to - c.from; return h('div', { class: 'row small' }, h('span', { style: 'width:130px' }, c.label), h('span', null, c.from + ' → ' + c.to), h('span', { class: d > 0 ? 'pos' : d < 0 ? 'neg' : 'muted' }, d ? (d > 0 ? '+' : '') + d : '–')); })),
        h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'primary', onclick: () => { report = null; go(); } }, 'Continue →'))));
  }

  function screenProReady() {
    const L = S.league, t = L.teams[S.teamId], p = S.player, c = S.contract;
    const isRook = S.proSeasons.length === 0;
    return h('div', null, h('h1', null, NBA.seasonLabel(L.year) + (isRook ? ' · Rookie season' : ' season')),
      h('div', { class: 'card' }, h('div', { class: 'row' }, h('div', null, h('div', { class: 'big' }, Math.round(NBA.ovr(p))), h('div', { class: 'muted small' }, 'OVERALL')), h('div', null, h('b', null, t.name), h('div', { class: 'muted small' }, 'Last season: ' + t.wins + '-' + t.losses + ' · age ' + p.age)), h('div', null, h('b', null, money(c.salary) + ' / yr'), h('div', { class: 'muted small' }, (c.type === 'rookie' ? 'Rookie deal' : 'Contract') + ' · ' + c.left + ' yr left'))), h('p', { class: 'small muted' }, 'Game plan: ' + ({ balanced: 'Balanced', score: 'Scoring priority', playmake: 'Pass & rebound', defend: 'Defend more' }[S.style || 'balanced']) + '. You can switch it at any point during the season.'),
        h('h3', null, 'Ratings'), attrBars(p),
        (p.age >= 33 || S.finalYear ? (S.finalYear
          ? h('div', { class: 'callout', style: 'margin-top:12px' }, '🎤 Farewell season announced. Every arena is planning a tribute, there will be more cameras, and the team feels the distraction.')
          : h('div', { class: 'callout', style: 'margin-top:12px' }, h('b', null, 'Is this the last one? '), 'You can announce that this is your farewell season. You get a send-off, more attention and more press conferences, and the team feels the distraction. You can still change your mind later, but the fans will notice.', h('div', { style: 'margin-top:8px' }, confirmBtn('Announce my farewell season', '', () => { G.announceFarewell(S); save(); render(); })))) : null),
        h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'primary', onclick: () => { G.playSeason(S); saveSnap(); go(); } }, 'Tip off the ' + NBA.seasonLabel(L.year) + ' season →'))));
  }

  // ------------------------------------------------------------ shared bits for the dashboard
  const rClass = (r) => (r < 6 ? 'r1' : r < 6.5 ? 'r2' : r < 7 ? 'r3' : r < 8 ? 'r4' : r < 9 ? 'r5' : 'r6');
  const ratingBadge = (r, dec) => h('span', { class: 'rating sm ' + rClass(r) }, r.toFixed(dec));
  const ab = (nick) => D.ABBR[nick] || (nick || '').slice(0, 3).toUpperCase();

  // generated team crests (stylised, not the real marks): team colours, a shape per club and the abbreviation
  const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255); };
  function logo(nick, size) {
    const img = NBA.logos && NBA.logos[nick];
    if (img) return h('span', { class: 'logo real', style: 'width:' + size + 'px;height:' + size + 'px;padding:' + Math.round(size * 0.12) + 'px', title: nick }, h('img', { src: img, alt: nick }));
    const c = (D.TEAM_COLORS && D.TEAM_COLORS[nick]) || ['#555555', '#ffffff'], a = ab(nick); let k = 0; for (let i = 0; i < (nick || '').length; i++) k = (k * 7 + nick.charCodeAt(i)) % 4;
    const shape = [
      '<circle cx="50" cy="50" r="46" fill="' + c[0] + '" stroke="' + c[1] + '" stroke-width="7"/><circle cx="50" cy="50" r="35" fill="none" stroke="' + c[1] + '" stroke-opacity=".45" stroke-width="2"/>',
      '<path d="M50 4 L90 16 V50 C90 72 72 88 50 97 C28 88 10 72 10 50 V16 Z" fill="' + c[0] + '" stroke="' + c[1] + '" stroke-width="7" stroke-linejoin="round"/>',
      '<path d="M50 3 L91 26 V74 L50 97 L9 74 V26 Z" fill="' + c[0] + '" stroke="' + c[1] + '" stroke-width="7" stroke-linejoin="round"/>',
      '<rect x="8" y="8" width="84" height="84" rx="26" fill="' + c[0] + '" stroke="' + c[1] + '" stroke-width="7"/><path d="M8 62 H92" stroke="' + c[1] + '" stroke-opacity=".5" stroke-width="3"/>',
    ][k];
    const tc = lum(c[0]) > 150 ? '#111' : '#fff';
    return h('span', { class: 'logo', style: 'width:' + size + 'px;height:' + size + 'px', title: nick, html: '<svg viewBox="0 0 100 100" width="' + size + '" height="' + size + '" aria-hidden="true">' + shape + '<text x="50" y="' + (a.length > 3 ? 58 : 60) + '" text-anchor="middle" font-family="system-ui,Arial,sans-serif" font-weight="800" font-size="' + (a.length > 3 ? 26 : 30) + '" fill="' + tc + '">' + a + '</text></svg>' });
  }
  const withLogo = (nick, size, label) => h('span', { class: 'tl' }, logo(nick, size || 20), label == null ? nick : label);
  // the league mark replaces the basketball in the header
  (function () { const el = document.querySelector('.brand .logo'); if (el && NBA.logos && NBA.logos._NBA) { el.className = 'nbamark'; el.textContent = ''; el.append(h('img', { src: NBA.logos._NBA, alt: 'NBA' })); } })();
  let leagueTeam = null;   // team page being viewed from Around the league
  // primary archetype plus the optional secondary tag
  const archLabel = (p) => D.ARCHETYPES[p.arch].name + (p.sec && D.ARCHETYPES[p.sec] ? ' + ' + D.ARCHETYPES[p.sec].name : '');
  const jersey = (name) => { let x = 7; for (let i = 0; i < name.length; i++) x = (x * 31 + name.charCodeAt(i)) % 97; return x % 99; };
  function seeded(seed) { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  // a decision is a medium pop-up over whatever page you are on, never a screen of its own. It sits first in the page so its own title comes first.
  const modal = (content) => h('div', { class: 'dlg-back' }, h('div', { class: 'dlg', role: 'dialog' }, content));
  const svgEl = (html, cls) => h('div', { html, class: cls || '' });
  function mini(vals, w, hgt) {
    w = w || 110; hgt = hgt || 26; if (vals.length < 2) return h('div', { style: 'height:' + hgt + 'px' });
    const lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), sp = Math.max(0.01, hi - lo);
    const pts = vals.map((v, i) => (2 + (i * (w - 4)) / (vals.length - 1)).toFixed(1) + ',' + (hgt - 3 - ((v - lo) / sp) * (hgt - 8)).toFixed(1)).join(' ');
    return svgEl('<svg viewBox="0 0 ' + w + ' ' + hgt + '" width="100%" height="' + hgt + '" preserveAspectRatio="none"><polyline points="' + pts + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/></svg>', 'mini');
  }
  const COURT = '<g fill="none" stroke="rgba(255,255,255,.35)" stroke-width="1.6"><rect x="1" y="1" width="498" height="468" rx="2"/><rect x="190" y="1" width="120" height="190"/><circle cx="250" cy="190" r="60"/><path d="M210 40a40 40 0 0 0 80 0"/><line x1="220" y1="40" x2="280" y2="40"/><circle cx="250" cy="52" r="9"/><path d="M30 1V140A237 237 0 0 0 470 140V1"/></g>';

  // season-to-date numbers from the revealed games
  function seasonTotals(shown) {
    const g = shown.filter((x) => x.k === 'g' && !x.po && !x.dnp), n = g.length, t = { n, pt: 0, rb: 0, or: 0, as: 0, st: 0, bk: 0, to: 0, pf: 0, pm: 0, m: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, r: 0 };
    g.forEach((x) => { for (const k in t) if (k !== 'n' && x[k] != null) t[k] += x[k]; });
    const av = {}; for (const k in t) av[k] = n ? t[k] / n : 0;
    return { t, av, g };
  }
  function proRate(snap, N, items, idx) {
    // standings "through game N": each team's final record scaled to N games with fading noise; your team uses the real record
    const reg = items.slice(0, idx).filter((x) => x.k === 'g' && !x.po), N0 = reg.length, done = idx >= items.length || N0 >= 82;
    const mine = S.teamId;
    return snap.standings.map((t) => {
      if (done && !(snap.live)) return Object.assign({ gp: t.wins + t.losses }, t);
      if (t.id === mine) { const w = reg.filter((x) => x.w).length; return Object.assign({}, t, { wins: w, losses: reg.length - w, gp: reg.length }); }
      const r = seeded(t.id * 977 + N0 * 13 + snap.year)();
      const w = Math.max(0, Math.min(N0, Math.round((t.wins * N0) / 82 + (r - 0.5) * Math.sqrt(N0) * 1.1 * (1 - N0 / 82))));
      return Object.assign({}, t, { wins: w, losses: N0 - w, gp: N0 });
    });
  }
  function confTable(rows, conf, mine) {
    const list = rows.filter((t) => t.conf === conf).sort((a, b) => b.wins - a.wins || a.losses - b.losses);
    const lead = list[0] || { wins: 0, losses: 0 };
    return h('div', { class: 'scroll' }, h('table', { class: 'st' }, h('thead', null, h('tr', null, ['#', 'Team', 'W', 'L', 'PCT', 'GB'].map((x, i) => h('th', { class: i < 2 ? 'l' : '' }, x)))),
      h('tbody', null, list.map((t, i) => h('tr', { class: (t.id === mine ? 'me ' : '') + (i === 5 ? 'cut1 ' : '') + (i === 9 ? 'cut2' : '') }, h('td', { class: 'l muted' }, i + 1), h('td', { class: 'l' }, h('button', { class: 'tlink', onclick: () => { leagueTeam = t.id; render(); window.scrollTo(0, 0); } }, withLogo(t.nick, 22, t.name))), h('td', null, t.wins), h('td', null, t.losses), h('td', null, (t.wins + t.losses ? t.wins / (t.wins + t.losses) : 0).toFixed(3).replace(/^0/, '')), h('td', null, i === 0 ? '–' : (((lead.wins - t.wins) + (t.losses - lead.losses)) / 2).toFixed(1)))))));
  }

  // autoplay engine for the season screen
  let mTab = 'box';
  let speed = '2x', playing = false, timer = null, leagueRace = 'mvp';
  function stopAuto() { bulk = false; playing = false; if (timer) { clearTimeout(timer); timer = null; } }
  // the trade deadline stops the games: the front office has something to say (or nothing, and the season carries on)
  // (when the front office has nothing to say the games simply carry on)
  const holdAt = () => {
    if (!S.matchLog) return false;
    const Dc = NBA.Decisions, pend = (id) => S.dec && S.dec.pending && S.dec.pending.id === id;
    if (S.noPress) {   // press conferences are switched off: nothing is asked, nothing is said (the meters stay where they are)
      if (pend('press')) Dc.autoResolve(S);
      const pv = S.matchLog[(S.matchIdx || 0) - 1]; if (pv && pv.pp && !pv.ppd) pv.ppd = 1;
      const cu = S.matchLog[S.matchIdx || 0];
      if (cu && cu.k === 'g' && cu.pc && !cu.pd && !cu.po) cu.pd = 1;
      if (cu && cu.k === 'hdr' && cu.ps != null && cu.pc && S.poPlans && S.poPlans[cu.ps] !== undefined && !(S.poPress && S.poPress[cu.ps] !== undefined)) S.poPress = Object.assign({}, S.poPress, { [cu.ps]: null });
    }
    // the press room after a game that mattered: it is asked about the game that was just played
    const prev = S.matchLog[(S.matchIdx || 0) - 1];
    if (prev && prev.k === 'g' && prev.pp && !prev.ppd && !prev.dnp) {
      if (!pend('press')) Dc.offer(S, 'press');
      if (pend('press')) { if (S.autoDec) { Dc.autoResolve(S); prev.ppd = 1; save(); return holdAt(); } return true; }
      prev.ppd = 1;
    }
    const it = S.matchLog[S.matchIdx || 0]; if (!it) return false;
    // a long injury: how do you come back? (the choice edits the games ahead and what the body keeps)
    if (it.k === 'g' && it.inj && !(S.dec.flags.injChoice && S.dec.flags.injChoice.y === S.league.year)) {
      if (!pend('injury')) Dc.offer(S, 'injury');
      if (pend('injury')) { if (S.autoDec) { Dc.autoResolve(S); save(); return holdAt(); } return true; }
    }
    if (it.k === 'hdr' && it.asw) {   // All-Star Weekend: the selection, the events you are invited to, the game
      if (S.autoDec) { NBA.AllStar.skip(S); S.matchIdx++; save(); return holdAt(); }
      if (NBA.AllStar.start(S)) return true;
      S.matchIdx++; save(); return holdAt();
    }
    if (it.k === 'hdr' && it.dl && !S.dlDone) {
      if (!S.dlChecked) { S.dlChecked = true; Dc.offer(S, 'deadline'); save(); }
      if (pend('deadline')) { if (S.autoDec) { Dc.autoResolve(S); S.dlDone = true; S.matchIdx++; save(); return false; } return true; }
      S.dlDone = true; S.matchIdx++; save(); return false;
    }
    if (it.k === 'hdr' && it.ps != null) {
      if (!(S.poPlans && S.poPlans[it.ps] !== undefined)) {
        if (!pend('series')) Dc.offer(S, 'series');
        if (!pend('series')) { S.poPlans = Object.assign({}, S.poPlans, { [it.ps]: 'balanced' }); return holdAt(); }
        if (S.autoDec) { Dc.autoResolve(S); save(); return holdAt(); }
        return true;
      }
      // the plan is set: the press conference before a big series, then the series itself
      if (it.pc && !(S.poPress && S.poPress[it.ps] !== undefined)) {
        if (!pend('press')) Dc.offer(S, 'press');
        if (pend('press')) { if (S.autoDec) { Dc.autoResolve(S); save(); return holdAt(); } return true; }
        S.poPress = Object.assign({}, S.poPress, { [it.ps]: null });
      }
      S.matchIdx++; save(); return holdAt();
    }
    if (it.k === 'g') {
      if (it.pc && !it.pd && !it.po) {
        if (!pend('press')) Dc.offer(S, 'press');
        if (pend('press')) { if (S.autoDec) { Dc.autoResolve(S); save(); return holdAt(); } return true; }
        it.pd = 1;
      }
      if (!S.noSocial && !S.autoPlay && !it.po && (it.n === 12 || it.n === 48) && !it.sd) {   // the timeline wants a post from you, twice a season
        if (!pend('social') && !Dc.offer(S, 'social')) it.sd = 1;
        if (pend('social')) { if (S.autoDec) { Dc.autoResolve(S); it.sd = 1; save(); return holdAt(); } return true; }
      }
      { const prev = (S.matchIdx || 0) > 0 ? S.matchLog[S.matchIdx - 1] : null;   // somebody mentioned you after the last game: a news pop-up
        if (!S.noSocial && !S.autoPlay && prev && prev.k === 'g' && !prev.dnp && !prev.md) {
          if (pend('mention')) { if (S.autoDec) { Dc.autoResolve(S); prev.md = 1; save(); return holdAt(); } return true; }
          prev.md = 1; if (Dc.offer(S, 'mention')) { if (S.autoDec) { Dc.autoResolve(S); save(); return holdAt(); } save(); return true; } } }
      { const prev = (S.matchIdx || 0) > 0 ? S.matchLog[S.matchIdx - 1] : null;   // a fan podcast wants you on
        if (!S.noSocial && !S.autoPlay && prev && prev.k === 'g' && !prev.dnp && !prev.pcast) {
          if (pend('podcast')) { if (S.autoDec) { Dc.autoResolve(S); prev.pcast = 1; save(); return holdAt(); } return true; }
          prev.pcast = 1; if (Dc.offer(S, 'podcast')) { if (S.autoDec) { Dc.autoResolve(S); save(); return holdAt(); } save(); return true; } } }
      if (it.cl && !it.cd) {   // last-possession calls are made only inside a live game; a simmed game just plays out
        if (S.liveMode && !bulk) return false;
        if (pend('clutch')) S.dec.pending = null;
        it.cd = 1;
      }
    }
    return false;
  };
  function advanceOne() {
    const items = S.matchLog; let got = false;
    if (holdAt()) return;
    while (S.matchIdx < items.length) {
      const it = items[S.matchIdx]; S.matchIdx++;
      if (it.k === 'g') got = true;
      if (got) { while (items[S.matchIdx] && items[S.matchIdx].k === 'hdr' && !(items[S.matchIdx].dl && !S.dlDone) && !(items[S.matchIdx].ps != null) && !items[S.matchIdx].asw) S.matchIdx++; break; }
    }
  }
  function autoplay(until) {
    stopAuto(); bulk = true; const items = S.matchLog, delay = { '1x': 480, '2x': 200, inst: 0 }[speed];
    if (!delay) { let guard = 0; while (!until() && S.matchIdx < items.length && !holdAt() && guard++ < 400) advanceOne(); bulk = false; save(); render(); return; }
    playing = true;
    const tick = () => { if (!playing) return; if (until() || S.matchIdx >= items.length || holdAt()) { stopAuto(); save(); render(); return; } advanceOne(); save(); render(); timer = setTimeout(tick, delay); };
    tick();
  }

  // ------------------------------------------------------------ season dashboard
  function screenSeasonPlay() {
    if (LV && S.matchLog && S.stage === 'season_play') return screenLive();
    if (!S.leagueSnap || !S.matchLog) { S.stage = 'season_recap'; save(); return screenRecap(); } // save from an older build
    // every decision is a pop-up over the season page (not a screen of its own)
    let overlay = null;
    if (S.decResult) overlay = screenDecResult();
    else if (holdAt()) { if (NBA.AllStar.active(S)) overlay = screenAllStar(); else { const pid = S.dec.pending.id; overlay = pid === 'series' ? screenSeries() : pid === 'clutch' ? screenClutch() : pid === 'press' ? screenPress() : pid === 'injury' ? screenInjury() : pid === 'social' ? screenSocial() : pid === 'mention' ? screenMention() : pid === 'podcast' ? screenPodcast() : screenDeadline(); } if (overlay === 'again') return screenSeasonPlay(); }
    const items = S.matchLog || [], idx = S.matchIdx || 0, L = S.league, p = S.player, t = L.teams[S.teamId];
    const shown = items.slice(0, idx), done = idx >= items.length;
    const reg = shown.filter((x) => x.k === 'g' && !x.po), poG = shown.filter((x) => x.k === 'g' && x.po);
    const regTotal = items.filter((x) => x.k === 'g' && !x.po).length, wins = reg.filter((x) => x.w).length, losses = reg.length - wins;
    const nextG = items.slice(idx).find((x) => x.k === 'g'), nextIsPo = !!(nextG && nextG.po);
    const { t: T, av: A, g: gl } = seasonTotals(shown);
    const rec = S.proSeasons[S.proSeasons.length - 1], prev = S.proSeasons.length > 1 ? S.proSeasons[S.proSeasons.length - 2] : null;
    const snap = Object.assign({ live: true }, S.leagueSnap), rows = proRate(snap, reg.length, items, idx);
    const confRows = rows.filter((x) => x.conf === t.conf).sort((a, b) => b.wins - a.wins || a.losses - b.losses), seed = confRows.findIndex((x) => x.id === S.teamId) + 1;
    const oppRow = nextG ? rows.find((x) => (D.ABBR[x.nick] || x.nick) === ab(nextG.o) || x.nick === nextG.o) : null;
    const asIdx = items.findIndex((x) => x.k === 'hdr' && /All-Star/.test(x.text)), asDone = asIdx >= 0 && idx > asIdx, regEndIdx = items.findIndex((x) => x.k === 'hdr' && /Regular season complete/.test(x.text));
    const gamesToAS = asIdx >= 0 ? 52 - reg.length : 0;
    const first = items.find((x) => x.k === 'g'), lastReg = items.filter((x) => x.k === 'g' && !x.po).slice(-1)[0];
    const phase = done ? 'SEASON COMPLETE' : nextIsPo || poG.length ? 'PLAYOFFS' : 'LIVE CAMPAIGN';
    const ord2 = (n) => ord(n);

    // ---- hero
    const ICON = { play: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M7 4.5v15l12-7.5z" fill="currentColor"/></svg>', ff: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 5v14l9-7zm9 0v14l9-7z" fill="currentColor"/></svg>', pause: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M6 4h4v16H6zm8 0h4v16h-4z" fill="currentColor"/></svg>' };
    const ctl = (label, fn, cls, icon) => h('button', { class: cls || '', onclick: fn }, icon ? h('span', { class: 'ic', html: ICON[icon] }) : null, label);
    const step = (n) => () => { stopAuto(); let c = 0; autoplay(() => c++ >= n); };
    const sim1 = () => { stopAuto(); if (S.liveMode && nextG) { startLive(); return; } advanceOne(); save(); render(); };
    const simBar = done
      ? h('div', { class: 'simbar well' }, ctl('Season recap →', () => { stopAuto(); S.stage = 'season_recap'; go(); }, 'primary big-btn'))
      : h('div', { class: 'simbar well' },
        playing ? ctl('Pause', () => { stopAuto(); render(); }, 'primary big-btn', 'pause') : ctl(S.liveMode ? (nextIsPo ? '📺 Watch next playoff game live' : '📺 Watch next game live') : nextIsPo ? 'Sim next playoff game' : 'Sim next game', sim1, 'primary big-btn', 'play'),
        !asDone && asIdx >= 0 && !nextIsPo ? ctl('Sim to All-Star', () => autoplay(() => S.matchIdx > asIdx), 'ghost', 'ff') : (regEndIdx >= 0 && idx <= regEndIdx ? ctl('Sim to playoffs', () => autoplay(() => S.matchIdx > regEndIdx), 'ghost', 'ff') : null),
        h('div', { class: 'speed' }, h('span', null, 'SPEED'), ['1x', '2x', 'inst'].map((k) => h('button', { class: speed === k ? 'on' : '', onclick: () => { speed = k; render(); } }, k === 'inst' ? 'Instant' : k))),
        h('div', { class: 'simmini' }, ctl('Sim 10', () => { let c = 0; autoplay(() => c++ >= 10); }, 'tiny'), ctl('Skip to recap »', () => { stopAuto(); S.matchIdx = items.length; S.stage = 'season_recap'; go(); }, 'tiny'), h('label', { class: 'small muted', style: 'margin-left:10px;white-space:nowrap' }, h('input', { type: 'checkbox', checked: !S.noPress, onchange: (e) => { S.noPress = !e.target.checked; save(); } }), ' Press conferences'), h('label', { class: 'small muted', style: 'margin-left:10px;white-space:nowrap' }, h('input', { type: 'checkbox', checked: !S.noSocial, onchange: (e) => { S.noSocial = !e.target.checked; save(); } }), ' Social moments'), h('label', { class: 'small muted', style: 'margin-left:10px;white-space:nowrap' }, h('input', { type: 'checkbox', checked: !!S.liveMode, onchange: (e) => { S.liveMode = e.target.checked; save(); render(); } }), ' Watch games live')));
    const schedule = nextIsPo || poG.length
      ? h('div', null, h('div', { class: 'row small caps' }, h('span', null, 'Postseason'), h('span', { class: 'spacer' }), h('span', null, (poG.length ? poG[poG.length - 1].rnd + ' · ' + poG[poG.length - 1].ser : 'Bracket set'))), h('div', { class: 'bar2' }, h('i', { style: 'width:100%' })))
      : h('div', null, h('div', { class: 'row small caps' }, h('span', null, 'Regular season schedule'), h('span', { class: 'spacer' }), h('span', null, 'Game ' + reg.length + ' / ' + regTotal + ' · ' + (100 * reg.length / Math.max(1, regTotal)).toFixed(0) + '%')),
        h('div', { class: 'bar2' }, h('i', { style: 'width:' + Math.round(100 * reg.length / Math.max(1, regTotal)) + '%' })),
        h('div', { class: 'row small caps muted', style: 'justify-content:space-between' }, h('span', null, (first ? first.d : '') + ' opener' + (reg.length ? ' (' + (reg[0].w ? 'W' : 'L') + ')' : '')), h('span', null, asDone ? '✓ All-Star weekend' : asIdx >= 0 ? '◉ All-Star weekend [in ' + Math.max(0, gamesToAS) + ' games]' : ''), h('span', null, (lastReg ? lastReg.d : '') + ' finale')));
    const plans = [['balanced', '⚖ Balanced', 'Natural game.'], ['score', '🎯 Scoring', 'More shots and points, fewer assists and boards.'], ['playmake', '🤝 Pass & rebound', 'More assists and boards, more triple-double chances, a few fewer points.'], ['defend', '🛡 Defend', 'More steals and blocks, slightly less scoring.']];
    const curPlan = S.style || 'balanced';
    const choose = (k) => () => { stopAuto(); const r = G.setStyle(S, k); if (!r.ok) { S.flash = r.why; } save(); render(); };
    const gamePlan = h('div', { class: 'gplan' }, h('div', { class: 'small caps muted' }, 'Game plan · switch any time'), h('div', { class: 'seg2' }, plans.map(([k, l]) => h('button', { class: curPlan === k ? 'on' : '', disabled: done, onclick: choose(k) }, l))), h('div', { class: 'small muted' }, (plans.find((x) => x[0] === curPlan) || plans[0])[2] + (S.styleSeq && S.styleSeq.length > 1 ? '  ·  switched ' + (S.styleSeq.length - 1) + '×' : '')));
    const hero = h('section', { class: 'panel hero' },
      h('div', { class: 'row chips2', style: 'justify-content:center' }, h('span', { class: 'cp' }, h('i', { class: 'live' }), phase), h('span', { class: 'cp' }, (t.conf === 'W' ? 'Western' : 'Eastern') + ' Conference · ' + (reg.length ? ord2(seed) + ' seed' : 'preseason')),
        nextG && !done ? h('span', { class: 'cp plain' }, logo(nextG.o, 18), ' Next: ' + (nextG.h ? 'vs ' : '@ ') + nextG.oc + ' ' + nextG.o + (oppRow && !nextIsPo ? ' (' + oppRow.wins + '-' + oppRow.losses + ')' : '')) : null),
      h('div', { class: 'hid' }, h('h1', { class: 'nm' }, p.name), h('div', { class: 'sub' }, t.name + ' · ' + p.pos + (sizeTxt(p) ? ' · ' + sizeTxt(p) : '') + ' · ' + archLabel(p) + ({ score: ' · Scoring priority', playmake: ' · Pass & rebound', defend: ' · Defend more' }[S.style] || '')),
        h('div', { class: 'jr' }, h('div', { class: 'jersey' }, '#' + jersey(p.name)), h('div', { class: 'recbox2 well' }, h('div', { class: 'lbl' }, 'Record'), h('div', { class: 'num' }, wins + '-' + losses), h('div', { class: 'sub2' }, (reg.length ? (wins / reg.length).toFixed(3).replace(/^0/, '') : '.000') + ' PCT')))),
      schedule, gamePlan, simBar);

    // ---- shot telemetry: every shot of the games played so far, as the sim recorded them with each box score (shots = FGA, makes = FGM, threes = 3PA / 3PM).
    // Regular season and playoffs are separate charts; the last game's shots are picked out in gold, so each game visibly adds to the chart.
    const scope = !poG.length ? 'reg' : S.shotScope || 'po';
    const sGames = (scope === 'po' ? poG : reg).filter((x) => !x.dnp), ZT = ['paint', 'paint', 'mid', 'three', 'three'];   // rim and short paint tries are both Paint; corner and above-the-break threes both 3PT
    const dots = [], box = { fga: 0, fgm: 0, tpa: 0, tpm: 0 };
    sGames.forEach((g, gi) => {
      Object.keys(box).forEach((k) => (box[k] += g[k] || 0));
      (g.sh || G.shotsFor(g, p, G.shotSeed(S, items.indexOf(g)))).forEach((v) => dots.push({ x: v & 511, y: (v >> 9) & 511, made: (v >> 18) & 1, z: ZT[v >> 19], last: gi === sGames.length - 1 }));   // saves from before v36 have no stored shots: drawn from the box the same way
    });
    const zones = { paint: { a: 0, m: 0 }, mid: { a: 0, m: 0 }, three: { a: 0, m: 0 } }; dots.forEach((d) => { zones[d.z].a++; zones[d.z].m += d.made; });
    const fga = dots.length, fgm = dots.reduce((t, d) => t + d.made, 0), fgPct = fga ? (100 * fgm / fga).toFixed(1) : '–';
    const zpct = (z) => (z.a ? (100 * z.m / z.a).toFixed(1) : '–');
    const [shotTab, setShotTab] = [S.shotTab || 'all', (v) => { S.shotTab = v; render(); }];
    const vis = dots.filter((d) => shotTab === 'all' || d.z === shotTab), shotLastG = sGames[sGames.length - 1], lastVis = vis.filter((d) => d.last);
    const rad = Math.max(2.2, Math.min(5.5, 5.5 * Math.sqrt(200 / Math.max(1, vis.length)))), arm = rad * 0.75;   // smaller marks as the season fills the court
    const mark = (d, col) => d.made ? '<circle cx="' + d.x + '" cy="' + d.y + '" r="' + rad.toFixed(1) + '" fill="' + col + '"/>'
      : '<g stroke="' + col + '" stroke-width="' + (rad > 4 ? 1.8 : 1.3) + '"><line x1="' + (d.x - arm).toFixed(1) + '" y1="' + (d.y - arm).toFixed(1) + '" x2="' + (d.x + arm).toFixed(1) + '" y2="' + (d.y + arm).toFixed(1) + '"/><line x1="' + (d.x + arm).toFixed(1) + '" y1="' + (d.y - arm).toFixed(1) + '" x2="' + (d.x - arm).toFixed(1) + '" y2="' + (d.y + arm).toFixed(1) + '"/></g>';
    const shotSvg = '<svg viewBox="0 0 500 470" class="court">' + COURT + vis.filter((d) => !d.last).map((d) => mark(d, d.made ? '#fff' : 'rgba(255,255,255,.5)')).join('') + lastVis.map((d) => mark(d, '#ffd166')).join('') + '</svg>';
    const tabBtn = (k, lbl, pc) => h('button', { class: shotTab === k ? 'on' : '', onclick: () => setShotTab(k) }, lbl + ' (' + pc + '%)');
    const scopeBtn = (k, lbl) => h('button', { class: scope === k ? 'on' : '', disabled: k === 'po' && !poG.length, onclick: () => { S.shotScope = k; render(); } }, lbl);
    const lastMade = lastVis.filter((d) => d.made).length;
    const telemetry = h('section', { class: 'panel mp', 'data-mt': 'shots' }, h('div', { class: 'ph' }, h('span', { class: 'pi' }, '◎'), h('div', null, h('h2', null, 'Shot telemetry'), h('div', { class: 'cap2' }, 'Every shot this ' + (scope === 'po' ? 'postseason' : 'regular season') + ' · ' + sGames.length + ' game' + (sGames.length === 1 ? '' : 's'))), h('span', { class: 'spacer' }), h('span', { class: 'badge' }, NBA.seasonLabel(L.year))),
      h('div', { class: 'seg2' }, scopeBtn('reg', 'Regular season'), scopeBtn('po', 'Playoffs')),
      h('div', { class: 'seg2' }, tabBtn('all', 'All', fgPct), tabBtn('paint', 'Paint', zpct(zones.paint)), tabBtn('mid', 'Mid', zpct(zones.mid)), tabBtn('three', '3PT', zpct(zones.three))),
      h('div', { class: 'courtwrap well', 'data-shots': fga + '/' + fgm + '/' + zones.three.a + '/' + zones.three.m, 'data-box': box.fga + '/' + box.fgm + '/' + box.tpa + '/' + box.tpm }, fga ? svgEl(shotSvg) : h('p', { class: 'muted', style: 'text-align:center;padding:60px 0' }, scope === 'po' ? 'Playoff shots show up here from game 1.' : 'Shots show up here once the season tips off.')),
      shotLastG ? h('div', { class: 'small muted lastshots' }, h('i', { class: 'dotg' }), 'Last game ' + (shotLastG.h ? 'vs ' : '@ ') + shotLastG.o + ': ' + lastMade + '/' + lastVis.length + (shotTab === 'all' ? ' FG' : ' from this zone') + ' (gold)') : null,
      h('div', { class: 'row legend well' }, h('span', null, h('i', { class: 'dotm' }), fgm + ' FGM ', h('em', null, '(made)')), h('span', null, '✕ ' + (fga - fgm) + ' misses'), h('span', { class: 'spacer' }), h('b', null, fgPct + '% FG')));

    // ---- sim stream & box score
    const last3 = gl.length || poG.length ? shown.filter((x) => x.k === 'g' && !x.dnp).slice(-3).reverse() : [];
    const feat = last3.length ? last3.slice().sort((a, b) => b.r - a.r)[0] : null;
    const streamRow = (g) => h('div', { class: 'srow' }, h('div', { class: 'sr-a' }, h('span', { class: 'wl ' + (g.w ? 'w' : 'l') }, g.w ? 'W' : 'L'), h('b', null, (g.h ? 'VS ' : '@ ') + ab(g.o) + ' (' + (g.pi ? 'PLAY-IN' : g.po ? 'G' + g.n : 'GAME ' + g.n) + ')'), h('span', { class: 'spacer' }), h('span', { class: 'sc' }, g.f + ' - ' + g.a + (g.ot ? ' (OT)' : ''))), h('div', { class: 'sr-b' }, h('span', null, (g.ar || '') + ' · Final' + (g.ot ? '/OT' : '')), h('span', { class: 'spacer' }), h('span', null, g.pt + ' PTS · ' + g.as + ' AST · ' + g.rb + ' REB'), h('span', { class: 'rating xs ' + rClass(g.r) }, g.r.toFixed(1))));
    const featured = feat ? h('div', { class: 'well feat' }, h('div', { class: 'row' }, h('span', { class: 'caps small' }, 'Featured line: ' + (feat.h ? 'vs ' : '@ ') + ab(feat.o)), h('span', { class: 'spacer' }), h('span', { class: 'rating xs ' + rClass(feat.r) }, (feat.r >= 8.5 ? '★ ' : '') + feat.r.toFixed(1) + (feat.r >= 8.5 ? ' POTG' : '')), h('span', { class: 'small muted' }, feat.m + ' MIN')),
      h('div', { class: 'tiles4' }, [[feat.pt, 'PTS'], [feat.as, 'AST'], [feat.rb, 'REB'], [(feat.pm > 0 ? '+' : '') + feat.pm, '+/-']].map(([v, l]) => h('div', { class: 'tile' }, h('b', null, v), h('span', null, l)))),
      h('div', { class: 'kv' }, h('span', null, 'Shooting split'), h('b', null, feat.fgm + '/' + feat.fga + ' FG (' + Math.round(100 * feat.fgm / Math.max(1, feat.fga)) + '%) · ' + feat.tpm + '/' + feat.tpa + ' 3PT · ' + feat.ftm + '/' + feat.fta + ' FT')),
      h('div', { class: 'kv' }, h('span', null, 'Rebounds'), h('b', null, feat.or + ' OFF · ' + (feat.rb - feat.or) + ' DEF (' + feat.rb + ' TOT)')),
      h('div', { class: 'kv' }, h('span', null, 'Hustle / discipline'), h('b', null, feat.st + ' STL · ' + feat.bk + ' BLK · ' + feat.to + ' TO · ' + feat.pf + ' PF'))) : null;
    const stream = h('section', { class: 'panel mp', 'data-mt': 'box' }, h('div', { class: 'ph' }, h('span', { class: 'pi' }, '☰'), h('h2', null, 'Sim stream & box score'), h('span', { class: 'spacer' }), h('span', { class: 'badge' }, 'Last ' + Math.max(0, last3.length) + ' games')),
      last3.length ? last3.map(streamRow) : h('p', { class: 'muted' }, 'No games yet. Hit "Sim next game" to start the season.'), featured,
      h('button', { class: 'wide', onclick: () => showGameLog(shown) }, '▤ View full ' + (reg.length + poG.length) + '-game game log'));

    // ---- season averages
    const sel = (k) => (done && rec && rec.ranks && rec.ranks[k] && rec.ranks[k] <= 10 ? '#' + rec.ranks[k] + ' NBA' : null); // league ranks are a season-end result: hidden until the last game
    const dlt = (cur, old) => (old == null || !T.n ? null : h('span', { class: cur >= old ? 'up' : 'down' }, (cur >= old ? '↗ +' : '↘ ') + (cur - old).toFixed(1)));
    const lastVals = (k) => gl.slice(-10).map((x) => x[k]);
    const avgCard = (lbl, val, badge, sub, vals, dl) => h('div', { class: 'well avgc' }, h('div', { class: 'row small caps' }, h('span', null, lbl), h('span', { class: 'spacer' }), badge ? h('span', { class: 'badge' }, badge) : null), h('div', { class: 'row', style: 'align-items:baseline;gap:8px' }, h('span', { class: 'bignum' }, val), dl || null), h('div', { class: 'small muted' }, sub), mini(vals));
    const ts = T.fga ? A.pt / (2 * (A.fga + 0.44 * A.fta)) : 0;
    const bar = (lbl, made, att) => { const pc = att ? made / att : 0; return h('div', { class: 'sbar' }, h('div', { class: 'row small' }, h('span', null, lbl), h('span', { class: 'spacer' }), h('b', null, (100 * pc).toFixed(1) + '% (' + Math.round(made) + ' / ' + Math.round(att) + ')')), h('div', { class: 'bar2' }, h('i', { style: 'width:' + Math.min(100, 100 * pc) + '%' }))); };
    const mvp = S.leagueSnap && S.leagueSnap.race && S.leagueSnap.race.mvp ? S.leagueSnap.race.mvp : [], mvpPlace = mvp.findIndex((x) => x.isUser);
    const averages = h('section', { class: 'panel mp', 'data-mt': 'stats' }, h('div', { class: 'ph' }, h('span', { class: 'pi' }, '🏀'), h('h2', null, 'Season averages'), h('span', { class: 'spacer' }), h('span', { class: 'badge' }, 'Per game stats')),
      h('div', { class: 'grid2' }, avgCard('Scoring (PPG)', A.pt.toFixed(1), sel('pts'), T.n + ' games', lastVals('pt'), dlt(A.pt, prev && prev.pts)), avgCard('Playmaking (APG)', A.as.toFixed(1), sel('ast'), A.to ? (A.as / A.to).toFixed(1) + ' A/TO' : '–', lastVals('as'), dlt(A.as, prev && prev.ast)),
        avgCard('Rebounds (RPG)', A.rb.toFixed(1), sel('reb'), A.or.toFixed(1) + ' OFF · ' + (A.rb - A.or).toFixed(1) + ' DEF', lastVals('rb'), dlt(A.rb, prev && prev.reb)), avgCard('Minutes (MPG)', A.m.toFixed(1), A.m >= 34 ? 'Heavy load' : A.m >= 28 ? 'Starter' : 'Rotation', (A.r || 0).toFixed(2) + ' avg rating', lastVals('m'))),
      h('div', { class: 'well' }, h('div', { class: 'row small caps' }, h('span', null, 'Shooting splits'), h('span', { class: 'spacer' }), h('span', null, (T.fga ? (100 * T.fgm / T.fga).toFixed(1) : '–') + ' / ' + (T.tpa ? (100 * T.tpm / T.tpa).toFixed(1) : '–') + ' / ' + (T.fta ? (100 * T.ftm / T.fta).toFixed(1) : '–'))),
        bar('Field goal (FG%)', T.fgm, T.fga), bar('Three-point (3P%)', T.tpm, T.tpa), bar('Free throw (FT%)', T.ftm, T.fta),
        h('div', { class: 'grid2' }, h('div', { class: 'pillbox' }, h('span', null, 'True shooting'), h('b', null, (100 * ts).toFixed(1) + '% TS')), h('div', { class: 'pillbox' }, h('span', null, 'Usage rate'), h('b', null, T.n ? (100 * (A.fga + 0.44 * A.fta + A.to) / ((A.m / 48) * 108)).toFixed(1) + '% USG' : '–')))),
      h('div', { class: 'row small caps foot' }, h('span', null, '◉ Avg rating ' + (A.r || 0).toFixed(2)), h('span', { class: 'spacer' }), h('span', null, !done ? 'Season in progress' : mvpPlace >= 0 ? 'Ranked ' + ord(mvpPlace + 1) + ' on the MVP ballot' : 'Not on the MVP ballot')));

    // ---- defensive impact
    const att = p.attrs || {};
    const skill = (l, v) => h('div', { class: 'sk' }, h('span', null, l), h('div', { class: 'bar2' }, h('i', { style: 'width:' + Math.round(v) + '%' })), h('b', null, Math.round(v)));
    const defense = h('section', { class: 'panel mp', 'data-mt': 'def' }, h('div', { class: 'ph' }, h('span', { class: 'pi' }, '⛨'), h('h2', null, 'Defensive impact'), h('span', { class: 'spacer' }), h('span', { class: 'badge' }, (rec && rec.awards && rec.awards.some((a) => /Defens/.test(a)) && done) ? 'All-Defense' : 'Two-way tracker')),
      h('div', { class: 'grid2' }, avgCard('Steals (SPG)', A.st.toFixed(1), sel('stl'), Math.round(T.st) + ' total steals', lastVals('st')), avgCard('Blocks (BPG)', A.bk.toFixed(1), sel('blk'), Math.round(T.bk) + ' total blocks', lastVals('bk'))),
      h('div', { class: 'grid2' }, [['Turnovers / gm', A.to.toFixed(1), A.to ? (A.as / A.to).toFixed(1) + ' assist-to-TO' : '–'], ['Fouls / gm', A.pf.toFixed(1), 'Discipline'], ['Avg +/-', (A.pm > 0 ? '+' : '') + A.pm.toFixed(1), 'On-court margin'], ['Stocks / gm', (A.st + A.bk).toFixed(1), 'Steals + blocks']].map(([l, v, s]) => h('div', { class: 'well' }, h('div', { class: 'small caps muted' }, l), h('div', { class: 'bignum sm' }, v), h('div', { class: 'small muted' }, s)))),
      h('div', { class: 'well' }, h('div', { class: 'row small caps' }, h('span', null, 'Skill spectrum profile'), h('span', { class: 'spacer' }), h('span', null, archLabel(p))),
        skill('Perimeter clamp', att.perD || 0), skill('Rim protection', att.rimP || 0), skill('Athleticism', att.ath || 0), skill('Basketball IQ', att.iq || 0)),
      h('button', { class: 'wide', onclick: showRatings }, '⛨ View full ratings'));

    const poP = poG.filter((x) => !x.dnp), poAv = (k) => (poP.length ? poP.reduce((a, g) => a + g[k], 0) / poP.length : 0), lastPo = poG[poG.length - 1];
    const pk = (cls, lbl, val, sub) => h('div', { class: 'kpi ' + cls }, h('div', { class: 'k-lbl' }, lbl), h('div', { class: 'k-val' }, val), h('div', { class: 'k-sub' }, sub || ' '));
    const playoffPanel = poP.length ? h('section', { class: 'panel mp', 'data-mt': 'po' }, h('div', { class: 'ph' }, h('span', { class: 'pi' }, '🏆'), h('h2', null, 'Playoff run'), h('span', { class: 'spacer' }), h('span', { class: 'badge' }, lastPo ? lastPo.rnd + ' · ' + lastPo.ser : 'Postseason')),
      h('div', { class: 'kpis', style: 'margin:0' }, pk('hot', 'Playoff points', poAv('pt').toFixed(1), poP.length + ' games'), pk('', 'Playoff rebounds', poAv('rb').toFixed(1), (poAv('rb') - poAv('or')).toFixed(1) + ' def'), pk('', 'Playoff assists', poAv('as').toFixed(1), poAv('to') ? (poAv('as') / poAv('to')).toFixed(1) + ' A/TO' : ' '),
        h('div', { class: 'kpi ink' }, h('div', { class: 'k-lbl' }, 'Playoff rating'), ratingBadge(poP.reduce((a, g) => a + g.r, 0) / poP.length, 2), h('div', { class: 'k-sub' }, poG.filter((g) => g.w).length + '-' + poG.filter((g) => !g.w).length + ' in the playoffs')))) : null;
    const planPanel = h('section', { class: 'panel mp mplan', 'data-mt': 'plan' }, h('div', { class: 'ph' }, h('span', { class: 'pi' }, '⚙'), h('h2', null, 'Game plan'), h('span', { class: 'spacer' }), h('span', { class: 'badge' }, 'Switch any time')),
      h('div', { class: 'plist' }, plans.map(([k, l, d]) => h('button', { class: 'popt' + (curPlan === k ? ' on' : ''), disabled: done, onclick: choose(k) }, h('b', null, l), h('span', null, d)))));
    const lastG = last3[0];
    const quick = h('div', { class: 'mquick' }, h('div', { class: 'qgrid' }, [[A.pt.toFixed(1), 'PPG'], [A.rb.toFixed(1), 'RPG'], [A.as.toFixed(1), 'APG']].map(([v, l]) => h('div', { class: 'qt' }, h('b', null, v), h('span', { class: 'ql' }, l))), h('div', { class: 'qt' }, T.n ? ratingBadge((gl.reduce((a, g) => a + g.r, 0) / gl.length), 2) : h('b', null, '–'), h('span', { class: 'ql' }, 'RTG'))),
      lastG ? h('div', { class: 'qlast' }, h('span', { class: 'wl ' + (lastG.w ? 'w' : 'l') }, lastG.w ? 'W' : 'L'), h('b', null, (lastG.h ? 'VS ' : '@ ') + ab(lastG.o)), h('span', { class: 'muted' }, lastG.f + '-' + lastG.a), h('span', { class: 'spacer' }), h('span', null, lastG.pt + ' pts · ' + lastG.rb + ' reb · ' + lastG.as + ' ast'), h('span', { class: 'rating xs ' + rClass(lastG.r) }, lastG.r.toFixed(1))) : h('div', { class: 'qlast muted' }, 'Tap Sim next game to tip off.'));
    const tabs = [['box', 'Box'], ['shots', 'Shots'], ['stats', 'Stats'], ['def', 'Defense'], ['plan', 'Plan']].concat(poP.length ? [['po', 'Playoffs']] : []);
    if (!tabs.some((x) => x[0] === mTab)) mTab = 'box';
    const mtabs = h('div', { class: 'mtabs' }, tabs.map(([k, l]) => h('button', { class: mTab === k ? 'on' : '', onclick: () => { mTab = k; render(); } }, l)));
    const fb = feedBlocks(L.year, idx, 4);
    const feedPanel = h('section', { class: 'panel' }, h('div', { class: 'ph' }, h('span', { class: 'pi' }, '📱'), h('h2', null, 'Timeline'), h('span', { class: 'small muted', style: 'margin-left:10px' }, (() => { const sx = NBA.Social.state(S); return sx.handle + ' · ' + NBA.Social.fmt(sx.f) + ' followers' + (sx.gain ? ' (' + (sx.gain > 0 ? '+' : '') + NBA.Social.fmt(Math.abs(sx.gain)) + ' this season)' : ''); })()), h('span', { class: 'spacer' }), h('button', { class: 'ghost tiny', onclick: showTimeline }, 'See everything')), fb.length ? fb.map(feedBlock) : h('p', { class: 'muted' }, 'Quiet for now. Big nights, trades and headlines show up here.'));
    // hurt: say so on the season screen (it used to show only in the game log)
    const injBanner = (() => {
      let i = idx, n = 0, lbl = null; while (items[i] && n < 90) { const x = items[i]; if (x.k === 'g' && !x.po) { if (x.dnp && x.dnp !== 'Rest') { n++; lbl = lbl || x.dnp; } else break; } else if (x.k === 'g') break; i++; }
      if (!n) return null;
      const nm = (items.slice(Math.max(0, idx - 40), idx + n + 2).map((x) => x.inj && x.inj.name).filter(Boolean)[0]) || (S.dec.flags.injChoice && S.dec.flags.injChoice.y === L.year ? S.dec.flags.injChoice.label : 'a lingering injury');
      const back = items[i] && items[i].k === 'g' ? 'Back for game ' + items[i].n : 'Out for the rest of the regular season';
      return h('div', { class: 'callout inj' }, '🩹 You are hurt: ' + nm + '. ' + (lbl === 'Setback' ? 'A setback in rehab. ' : lbl === 'Rehab' ? 'Held out for rehab. ' : '') + 'Out ' + n + ' more game' + (n > 1 ? 's' : '') + ' · ' + back + '.');
    })();
    const wrap = h('div', { class: 'dash mt-' + mTab }, injBanner, h('div', { class: 'dtop' }, hero, quick, mtabs, telemetry), playoffPanel, h('div', { class: 'dmid' }, stream, averages, defense), planPanel, feedPanel);
    if (!LV) setTimeout(aiFeedUpgrade, 600);
    return overlay ? h('div', null, modal(overlay), wrap) : wrap;
  }
  // click any player's name for his career page: who he is, his awards and every season on record (the record starts with this save)
  function plink(id, name) {
    if (id == null || id === 'user' || !S || !S.league || !S.league.players[id]) return name;
    return h('button', { class: 'plink', onclick: (e) => { e.stopPropagation(); showPlayer(id); } }, name);
  }
  function showPlayer(id) {
    const L = S.league, q = L.players[id]; if (!q) return;
    const t = L.teams[q.teamId], hist = (q.hist || []).slice().reverse(), aw = q.awd || {};
    const tm = (tid) => (L.teams[tid] ? L.teams[tid].nick : '');
    const tot = hist.reduce((a, r) => { a.gp += r[3]; ['pts', 'reb', 'ast', 'stl', 'blk'].forEach((k, i) => { a[k] += r[4 + i] * r[3]; }); return a; }, { gp: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 });
    const avg = (k) => (tot.gp ? (tot[k] / tot.gp / 10).toFixed(1) : '–');
    const pills = Object.keys(aw).sort((a, b) => aw[b] - aw[a]).map((k) => h('span', { class: 'badge' }, (aw[k] > 1 ? aw[k] + '× ' : '') + k));
    const body = h('div', null,
      h('div', { class: 'row', style: 'margin:8px 0' }, t ? logo(t.nick, 44) : null, h('div', null, h('b', null, q.pos + ' · age ' + q.age + (t ? ' · ' + t.name : '')), h('div', { class: 'small muted' }, Math.round(NBA.ovr(q)) + ' OVR' + (sizeTxt(q) ? ' · ' + sizeTxt(q) : '') + ' · ' + (q.yearsPro || 0) + ' year' + (q.yearsPro === 1 ? '' : 's') + ' pro' + (q.draftSlot ? ' · drafted #' + q.draftSlot : '')))),
      pills.length ? h('div', { class: 'row', style: 'flex-wrap:wrap;gap:6px;margin:8px 0' }, pills) : h('p', { class: 'small muted' }, 'No awards on record yet.'),
      hist.length ? h('div', { class: 'scroll' }, h('table', { class: 'st' }, h('thead', null, h('tr', null, ['Season', 'Age', 'Team', 'GP', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'OVR'].map((x, i) => h('th', { class: i < 3 ? 'l' : '' }, x)))),
        h('tbody', null, hist.map((r) => h('tr', null, h('td', { class: 'l' }, NBA.seasonLabel(r[0]) + (r[10] ? ' ~' : '')), h('td', { class: 'l' }, r[1]), h('td', { class: 'l' }, r[10] ? '—' : tm(r[2])), h('td', null, r[3]), h('td', null, (r[4] / 10).toFixed(1)), h('td', null, (r[5] / 10).toFixed(1)), h('td', null, (r[6] / 10).toFixed(1)), h('td', null, (r[7] / 10).toFixed(1)), h('td', null, (r[8] / 10).toFixed(1)), h('td', null, r[9])))),
          h('tfoot', null, h('tr', { class: 'me' }, h('td', { class: 'l', colspan: 3 }, 'On record'), h('td', null, tot.gp), h('td', null, avg('pts')), h('td', null, avg('reb')), h('td', null, avg('ast')), h('td', null, avg('stl')), h('td', null, avg('blk')), h('td', null, ''))))) : h('p', { class: 'muted' }, 'No seasons on record yet.'),
      hist.some((r) => r[10]) ? h('p', { class: 'small muted' }, '~ Seasons before this save are estimates rebuilt from his current game; real records start with this save.') : null,
      h('h3', null, 'Ratings'), attrBars(q));
    showModal(q.name, body);
  }
  function showModal(title, body) {
    const m = document.getElementById('modal'); m.classList.remove('hidden');
    m.replaceChildren(h('div', { class: 'box' }, h('div', { class: 'row' }, h('h2', { style: 'margin:0' }, title), h('span', { class: 'spacer' }), h('button', { onclick: () => m.classList.add('hidden') }, 'Close ✕')), body));
    m.onclick = (e) => { if (e.target === m) m.classList.add('hidden'); };
  }
  function showRatings() { showModal(S.player.name + ' · ratings (OVR ' + Math.round(NBA.ovr(S.player)) + ')', attrBars(S.player)); }
  function showGameLog(shown) {
    const rows = shown.filter((x) => x.k === 'g').slice().reverse();
    showModal('Game log', h('div', { class: 'scroll' }, h('table', { class: 'gl' }, h('thead', null, h('tr', null, ['Date', 'Match', 'Result', 'MIN', 'PTS', 'REB', 'AST', 'FG', '+/-', 'RTG'].map((x, i) => h('th', { class: i < 3 ? 'l' : '' }, x)))),
      h('tbody', null, rows.map((g) => g.dnp
        ? h('tr', { class: 'muted' }, h('td', null, g.d), h('td', { class: 'l' }, (g.h ? 'vs ' : '@ ') + g.o), h('td', { class: 'l' }, h('span', { class: 'res ' + (g.w ? 'w' : 'l') }, g.w ? 'W' : 'L'), ' ' + g.f + '-' + g.a), h('td', { colspan: 7 }, 'DNP · ' + g.dnp))
        : h('tr', null, h('td', null, g.d), h('td', { class: 'l' }, (g.h ? 'vs ' : '@ ') + g.o + (g.po ? ' · G' + g.n : '')), h('td', { class: 'l' }, h('span', { class: 'res ' + (g.w ? 'w' : 'l') }, g.w ? 'W' : 'L'), ' ' + g.f + '-' + g.a), h('td', null, g.m), h('td', null, g.pt), h('td', null, g.rb), h('td', null, g.as), h('td', null, g.fgm + '/' + g.fga), h('td', null, (g.pm > 0 ? '+' : '') + g.pm), h('td', null, h('span', { class: 'rating xs ' + rClass(g.r) }, g.r.toFixed(1)))))))));
  }

  // ------------------------------------------------------------ the timeline (feed)
  const FEED_LABEL = { big: 'Big night', td: 'Triple-double', bad: 'Rough night', streakW: 'Win streak', streakL: 'Losing streak', blowoutWin: 'Blowout win', blowoutLoss: 'Blowout loss', po: 'Series win', elim: 'Eliminated', champ: 'Champions', playin: 'Play-in', trade: 'Trade', tradeReq: 'Trade request', sign: 'Signing', resign: 'Re-signed', waived: 'Waived', injury: 'Injury', ret: 'Back on the floor', award: 'Award', allstar: 'All-Star', draft: 'Draft', retire: 'Retirement', press: 'Press room', winner: 'Game-winner', miss: 'Missed shot', hot: 'Hot take', coach: 'Coaching change', friend: 'Locker room', beef: 'Locker room', win: 'Win', loss: 'Loss' };
  const kfmt = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n));
  const feedPost = (p) => h('div', { class: 'fan' }, h('b', null, p.who), p.news ? ' ' : '', ' ' + p.text + (p.ai ? ' ✨' : ''), h('span', { class: 'likes' }, ' ♥ ' + kfmt(p.likes || 0)));
  // everything the feed said this season, newest first: posts on the games you have seen plus the events (trades, awards, injuries, press) up to now
  function feedBlocks(year, idx, limit) {
    const out = [], items = S.matchLog || [];
    items.slice(0, idx).forEach((g, i) => { if (g.k === 'g' && g.fan && g.fan.length) out.push({ at: i + 0.5, kind: g.fk, sub: g.po ? (g.rnd || 'Playoffs') : 'Game ' + g.n + ' vs ' + g.o, posts: g.fan }); });
    ((S.dec && S.dec.flags && S.dec.flags.feed) || []).forEach((e, k) => { if (e.y === year && (e.at == null || e.at <= idx)) out.push({ at: e.at == null ? idx + 0.1 : e.at + 0.6 + k * 0.001, kind: e.kind, sub: '', posts: e.posts }); });
    out.sort((a, b) => b.at - a.at); return limit ? out.slice(0, limit) : out;
  }
  const feedBlock = (b) => h('div', { class: 'feedblock' }, h('div', { class: 'small caps muted' }, (FEED_LABEL[b.kind] || 'Timeline') + (b.sub ? ' · ' + b.sub : '')), b.posts.map(feedPost));
  function showTimeline() {
    const L = S.league, all = [];
    ((S.dec && S.dec.flags && S.dec.flags.feed) || []).slice().reverse().forEach((e) => all.push(h('div', { class: 'feedblock' }, h('div', { class: 'small caps muted' }, NBA.seasonLabel(e.y) + ' · ' + (FEED_LABEL[e.kind] || 'Timeline')), e.posts.map(feedPost))));
    const cur = feedBlocks(L.year, (S.matchLog || []).length, 0).filter((b) => b.kind && ['big', 'td', 'bad', 'streakW', 'streakL', 'blowoutWin', 'blowoutLoss', 'po', 'elim', 'champ', 'playin'].includes(b.kind));
    showModal('The timeline', h('div', null, cur.length ? [h('h3', null, 'This season'), cur.map(feedBlock)] : null, h('h3', null, 'Moments from your career'), all.length ? all : h('p', { class: 'muted' }, 'Nothing yet: the timeline wakes up when you do something.')));
  }
  // ------------------------------------------------------------ team page
  const rosterRole = (r) => (r.me ? 'You' : r.mins >= 24 ? 'Starter' : r.mins >= 14 ? 'Rotation' : 'Bench');
  function rosterTable(rows) {
    return h('div', { class: 'scroll' }, h('table', { class: 'st roster' }, h('thead', null, h('tr', null, ['Player', 'Role', 'OVR', 'GP', 'MPG', 'PPG', 'RPG', 'APG', 'STL', 'BLK', 'RTG'].map((x, i) => h('th', { class: i < 2 ? 'l' : '' }, x)))),
      h('tbody', null, rows.map((r) => h('tr', { class: r.me ? 'me' : '' }, h('td', { class: 'l' }, h('b', null, r.me ? r.name : plink(r.id, r.name)), h('div', { class: 'small muted' }, r.pos + ' · age ' + r.age + (r.sz ? ' · ' + r.sz : ''))), h('td', { class: 'l muted' }, rosterRole(r)), h('td', null, r.ovr), h('td', null, r.gp), ...(r.gp === 0 ? ['MPG', 'PPG', 'RPG', 'APG', 'STL', 'BLK', 'RTG'].map(() => h('td', { class: 'muted' }, '–')) : [h('td', null, r.mins ? r.mins.toFixed(1) : '–'), h('td', null, r.line.pts.toFixed(1)), h('td', null, r.line.reb.toFixed(1)), h('td', null, r.line.ast.toFixed(1)), h('td', null, r.line.stl.toFixed(1)), h('td', null, r.line.blk.toFixed(1)), h('td', null, r.rating ? ratingBadge(r.rating, 1) : '–')]))))));
  }
  // season-by-season results of a team (this year is hidden until the season has been played out)
  function histPanel(t, hideYear) {
    const hist = (t.hist || []).filter((x) => hideYear == null || x.year < hideYear).slice().reverse();
    return h('section', { class: 'panel' }, h('div', { class: 'ph' }, h('span', { class: 'pi' }, '◔'), h('h2', null, 'Season results'), h('span', { class: 'spacer' }), h('span', { class: 'badge' }, hist.length + (hist.length === 1 ? ' season' : ' seasons'))),
      hist.length ? h('div', { class: 'scroll' }, h('table', { class: 'st' }, h('thead', null, h('tr', null, ['Season', 'W-L', 'Result'].map((x, i) => h('th', { class: i !== 1 ? 'l' : '' }, x)))),
        h('tbody', null, hist.map((x) => h('tr', { class: x.po === 5 ? 'me' : '' }, h('td', { class: 'l' }, x.label), h('td', null, x.w + '-' + x.l), h('td', { class: 'l' }, (x.po === 5 ? '🏆 ' : '') + x.text)))))) : h('p', { class: 'muted' }, 'No completed seasons yet.'));
  }
  // team page for any club (Around the league): record, seed, roster production, results
  function teamDetail(id, rows, label, live, N) {
    const L = S.league, t = L.teams[id], mineT = id === S.teamId && (S.proSeasons.length || S.draft), prog = live ? Math.min(1, N / 82) : 1;
    const rec = rows.find((r) => r.id === id) || { wins: t.wins, losses: t.losses };
    const conf = rows.filter((r) => r.conf === t.conf).sort((a, b) => b.wins - a.wins || a.losses - b.losses), seed = conf.findIndex((r) => r.id === id) + 1;
    const pl = rosterRows(t, live, N, prog), mates = pl.filter((r) => !r.me), mm = mates.reduce((a, r) => a + r.mins, 0) || 1;
    const top8 = pl.slice().sort((a, b) => b.ovr - a.ovr).slice(0, 8), avgOvr = top8.length ? top8.reduce((a, r) => a + r.ovr, 0) / top8.length : 0;
    const avgRate = pl.reduce((a, r) => a + (r.rating || 0) * r.mins, 0) / (pl.reduce((a, r) => a + (r.rating ? r.mins : 0), 0) || 1);
    const lead = (k) => pl.filter((r) => r.gp > 0).slice().sort((a, b) => b.line[k] - a.line[k])[0];
    const tile = (cls, lbl, val, sub) => h('div', { class: 'kpi ' + cls }, h('div', { class: 'k-lbl' }, lbl), h('div', { class: 'k-val' }, val), h('div', { class: 'k-sub' }, sub || ' '));
    const ldr = (k, lbl) => { const r = lead(k); return tile('', lbl + ' leader', r ? r.line[k].toFixed(1) : '–', r ? r.name : ' '); };
    const last = (t.hist || []).filter((x) => !live || x.year < L.year).slice(-1)[0];
    const others = L.teams.slice().sort((a, b) => a.name.localeCompare(b.name));
    const pick = h('select', { class: 'tsel', onchange: (e) => { leagueTeam = +e.target.value; render(); } }, others.map((x) => h('option', Object.assign({ value: x.id }, x.id === id ? { selected: true } : {}), x.name)));
    return h('div', { class: 'dash' },
      h('section', { class: 'panel' }, h('div', { class: 'ph' }, h('button', { class: 'ghost tiny', onclick: () => { leagueTeam = null; render(); window.scrollTo(0, 0); } }, '← League'), logo(t.nick, 44), h('div', null, h('h2', null, t.name + (mineT ? ' · your team' : '')), h('div', { class: 'cap2' }, label)), h('span', { class: 'spacer' }), pick),
        h('div', { class: 'kpis', style: 'margin:0' }, tile('hot', 'Record', rec.wins + '-' + rec.losses, (t.conf === 'W' ? 'Western' : 'Eastern') + ' #' + seed + (seed <= 6 ? ' · in playoffs' : seed <= 10 ? ' · play-in' : '')), tile('', 'Top-8 OVR', avgOvr ? avgOvr.toFixed(0) : '–', 'average rating of the rotation'),
          h('div', { class: 'kpi ink' }, h('div', { class: 'k-lbl' }, 'Team rating'), avgRate ? ratingBadge(avgRate, 2) : h('div', { class: 'k-val' }, '–'), h('div', { class: 'k-sub' }, 'minutes-weighted')), tile('', 'Last season', last ? last.w + '-' + last.l : '–', last ? last.text : 'no data yet')),
        h('div', { class: 'kpis', style: 'margin:12px 0 0' }, ldr('pts', 'Scoring'), ldr('reb', 'Rebound'), ldr('ast', 'Assist'), ldr('stl', 'Steal'))),
      h('section', { class: 'panel' }, h('div', { class: 'ph' }, h('span', { class: 'pi' }, '☰'), h('h2', null, 'Roster and stats'), h('span', { class: 'spacer' }), h('span', { class: 'badge' }, pl.length + ' players')), pl.length ? rosterTable(pl) : h('p', { class: 'muted' }, 'No roster data yet.'),
        h('p', { class: 'small muted', style: 'margin-top:10px' }, live ? 'Per-game numbers so far this season. Ratings are the match rating of each player\'s average line.' : 'Last season\'s numbers. Ratings are the match rating of each player\'s average line.')),
      histPanel(t, live ? L.year : null));
  }
  // players of a team with their production (this season so far); the user is added to their own team
  function rosterRows(t, inSeason, N, prog) {
    const L = S.league, items = S.matchLog || [], idx = S.matchIdx || 0, p = S.player;
    const noise = (k) => seeded(k * 131 + N * 7 + 3), bridge = (v, k) => v * (1 + (noise(k)() - 0.5) * 0.12 * (1 - prog));
    const rate = (l, mins) => { const den = l.pts / (2 * Math.max(0.4, l.ts || 0.56)), fga = den / 1.088, fta = 0.2 * fga; return NBA.gameRating({ pts: l.pts, reb: l.reb, ast: l.ast, stl: l.stl, blk: l.blk, tov: l.tov, min: mins }, { fga, fgm: fga * (l.fgp || 0.46), fta, ftm: fta * (l.ftp || 0.78), tpm: (l.tpa || 0) * (l.tpp || 0.35) || 0.3 * fga * 0.4 }); };
    // everyone on the club, rookies included (they only join the core/bench lists the summer after their draft)
    const rows = Object.values(L.players).filter((q) => q.teamId === t.id).map((q) => {
      const id = q.id, l = L.lines[id]; if (!l) return null;
      const line = { pts: bridge(l.pts, id * 3 + 1), reb: bridge(l.reb, id * 3 + 2), ast: bridge(l.ast, id * 3 + 3), stl: l.stl, blk: l.blk, tov: l.tov, ts: l.ts };
      return { id: q.id, name: q.name, pos: q.pos, sz: sizeTxt(q), age: q.age, ovr: Math.round(NBA.ovr(q)), mins: l.mins, gp: Math.round(l.gp * prog), line, rating: rate(line, l.mins) };
    }).filter(Boolean);
    // you: games so far this season (or last season when the season is over)
    const shown = items.slice(0, idx), { t: T, av: A, g: gl } = seasonTotals(shown), last = S.proSeasons[S.proSeasons.length - 1];
    if (t.id !== S.teamId) { /* another team: no user row */ } else if (inSeason && T.n) rows.push({ me: true, name: p.name, pos: p.pos, sz: sizeTxt(p), age: p.age, ovr: Math.round(NBA.ovr(p)), mins: A.m, gp: T.n, line: { pts: A.pt, reb: A.rb, ast: A.as, stl: A.st, blk: A.bk, tov: A.to }, rating: gl.reduce((a, g) => a + g.r, 0) / gl.length });
    else if (!inSeason && last) rows.push({ me: true, name: p.name, pos: p.pos, sz: sizeTxt(p), age: p.age, ovr: Math.round(NBA.ovr(p)), mins: last.mins, gp: last.gp, line: { pts: last.pts, reb: last.reb, ast: last.ast, stl: last.stl, blk: last.blk, tov: last.tov }, rating: last.avgRating || rate(last, last.mins) });
    else rows.push({ me: true, name: p.name, pos: p.pos, sz: sizeTxt(p), age: p.age, ovr: Math.round(NBA.ovr(p)), mins: 0, gp: 0, line: { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0 }, rating: null });
    if (inSeason) rows.forEach((r) => { if (r.gp === 0) r.rating = null; });   // nobody has played yet: no numbers to show
    rows.sort((a, b) => b.mins - a.mins);
    return rows;
  }

  // the cap sheet: your club's payroll against the cap, the tax line and the aprons, then every contract
  function capPanel(t) {
    const C = NBA.Cap, f = C.finance(S, t), rows = C.sheet(S, t), top = f.apron2 * 1.08, pc = (x) => Math.min(100, 100 * x / top).toFixed(1) + '%';
    const mark = (x, lbl) => h('i', { class: 'capmark', style: 'left:' + pc(x), title: lbl + ' ' + money(x) }, h('span', null, lbl));
    return h('section', { class: 'panel' }, h('div', { class: 'ph' }, h('span', { class: 'pi' }, '🏦'), h('h2', null, 'Payroll and cap'), h('span', { class: 'spacer' }), h('span', { class: 'badge' }, f.status)),
      h('div', { class: 'capbar' }, h('b', { style: 'width:' + pc(f.payroll) }), mark(f.cap, 'Cap'), mark(f.taxLine, 'Tax'), mark(f.apron1, 'Apron 1'), mark(f.apron2, 'Apron 2')),
      h('div', { class: 'row small muted', style: 'justify-content:space-between;margin:10px 0' }, h('span', null, 'Payroll ' + money(f.payroll)), h('span', null, f.space ? 'Cap room ' + money(f.space) : 'Over the cap by ' + money(f.payroll - f.cap)), h('span', null, f.taxBill ? 'Tax bill about ' + money(f.taxBill) : 'Exception: ' + f.exception.kind + (f.space ? '' : ' up to ' + money(f.exception.amount)))),
      h('table', { class: 'lvq capsheet' }, h('tr', null, ['Player', 'Pos', 'OVR', 'Salary', 'Years'].map((c, i) => h('th', null, c))), rows.map((r) => h('tr', { class: r.user ? 'me' : '' }, h('td', { style: 'text-align:left' }, r.name + (r.user ? ' (you)' : '')), h('td', null, r.pos), h('td', null, r.ovr), h('td', null, money(r.salary)), h('td', null, r.left + (r.opt === 'player' ? ' · player option' : r.opt === 'team' ? ' · team option' : ''))))));
  }
  // the coach and the locker room: who he is and how you fit, how tight the room is, who likes you, the groups, and the coaching carousel around the league
  function roomPanel() {
    const R = NBA.Room.panel(S), c = R.coach, pct = (R.chem + 8) / 16 * 100, mood = (v) => (v >= 1.5 ? 'good' : v <= -1 ? 'bad' : '');
    return h('section', { class: 'panel' }, h('div', { class: 'ph' }, h('span', { class: 'pi' }, '🧑‍🏫'), h('h2', null, 'Coach and locker room'), h('span', { class: 'spacer' }), h('span', { class: 'badge' }, R.chemLabel)),
      h('div', { class: 'row', style: 'margin:6px 0' }, h('div', null, h('b', null, 'Coach ' + c.name), h('div', { class: 'small muted' }, c.style + ' · ' + c.blurb + ' · with the club since ' + c.since), h('div', { class: 'small' }, (c.fit > 0 ? 'Your game fits his system.' : c.fit < 0 ? 'You are not his kind of player.' : 'He can use you either way.') + ' ' + c.rapport + '.'))),
      h('div', { class: 'small caps muted', style: 'margin-top:10px' }, 'Locker room chemistry'), h('div', { class: 'capbar', style: 'margin:8px 0 14px' }, h('b', { style: 'width:' + pct.toFixed(0) + '%' })),
      h('div', { class: 'small caps muted' }, 'Who likes you'), R.rows.map((x) => h('div', { class: 'row small', style: 'margin:4px 0' }, h('span', null, x.name + ' · ' + x.pos + ' · ' + x.ovr + ' OVR'), h('span', { class: 'spacer' }), h('span', { class: mood(x.v) }, x.label))),
      h('div', { class: 'small caps muted', style: 'margin-top:10px' }, 'The groups'), R.groups.map((g2) => h('div', { class: 'row small', style: 'margin:4px 0' }, h('span', null, g2.name + ' (' + g2.n + ')'), h('span', { class: 'spacer' }), h('span', { class: mood(g2.mood) }, g2.mood >= 1.5 ? 'With you' : g2.mood <= -1 ? 'Against you' : 'Neutral'))),
      R.friend ? h('p', { class: 'small' }, '⭐ Your best friend on the team: ' + R.friend + '.') : null, R.beef ? h('p', { class: 'small bad' }, '⚠ An open beef with ' + R.beef + '.') : null);
  }
  // the draft picks a club owns: its own, and the ones it got from others (and the ones it traded away)
  function picksPanel(t) {
    const L = S.league, Pk = NBA.Picks; if (!Pk) return null; const mine = Pk.ofTeam(L, t.id), P = Pk.ensure(L), away = Object.keys(P).map((k) => P[k]).filter((p) => p.orig === t.id && p.owner !== t.id).sort((a, b) => a.y - b.y || a.r - b.r);
    const line = (p, tag) => h('div', { class: 'small', style: 'margin:4px 0' }, p.y + ' ' + (p.r === 1 ? 'first' : 'second') + '-round pick', h('span', { class: 'muted' }, tag));
    return h('section', { class: 'panel' }, h('div', { class: 'ph' }, h('span', { class: 'pi' }, '🎟'), h('h2', null, 'Draft picks'), h('span', { class: 'spacer' }), h('span', { class: 'badge' }, mine.filter((p) => p.r === 1).length + ' firsts · ' + mine.filter((p) => p.r === 2).length + ' seconds')),
      mine.map((p) => line(p, p.orig === t.id ? ' · own' : ' · from the ' + L.teams[p.orig].nick)), away.length ? h('div', { class: 'small caps muted', style: 'margin-top:10px' }, 'Traded away') : null, away.map((p) => line(p, ' · to the ' + L.teams[p.owner].nick)));
  }
  function screenTeam() { const el = screenTeam0(); if (S.contract && S.teamId != null && el.append) { el.append(roomPanel()); el.append(capPanel(S.league.teams[S.teamId])); const pp = picksPanel(S.league.teams[S.teamId]); if (pp) el.append(pp); } return el; }
  function leaguePayrolls() {
    const C = NBA.Cap, rows = S.league.teams.map((t) => Object.assign({ t }, C.finance(S, t))).sort((a, b) => b.payroll - a.payroll);
    return h('section', { class: 'panel' }, h('div', { class: 'ph' }, h('span', { class: 'pi' }, '🏦'), h('h2', null, 'Payrolls around the league')),
      h('table', { class: 'lvq capsheet' }, h('tr', null, ['Team', 'Payroll', 'Status', 'Room / tax'].map((c) => h('th', null, c))), rows.map((r) => h('tr', { class: r.t.id === S.teamId ? 'me' : '' }, h('td', { style: 'text-align:left' }, r.t.name), h('td', null, money(r.payroll)), h('td', null, r.status), h('td', null, r.space ? money(r.space) + ' room' : r.taxBill ? money(r.taxBill) + ' tax' : '–')))));
  }
  function carousel() {
    const log = (S.dec && S.dec.flags.coachLog || []).slice(-16).reverse(); if (!log.length) return null;
    return h('section', { class: 'panel' }, h('div', { class: 'ph' }, h('span', { class: 'pi' }, '🧑‍🏫'), h('h2', null, 'Coaching carousel')),
      log.map((x) => h('div', { class: 'small', style: 'margin:5px 0' }, x.y + ': the ' + x.team + ' (' + x.wins + ' wins) fired ' + x.from + ' and hired ' + x.to + ' (' + (NBA.Room.STYLES[x.style] || { label: 'a coach' }).label + ').')));
  }
  function screenLeague() { const el = screenLeague0(); if (S.contract && el.append) { el.append(leaguePayrolls()); const cc = carousel(); if (cc) el.append(cc); } return el; }
  function screenTeam0() {
    const L = S.league, t = L.teams[S.teamId], items = S.matchLog || [], idx = S.matchIdx || 0, p = S.player;
    if (!(S.proSeasons.length || S.draft)) return h('div', { class: 'dash' }, h('section', { class: 'panel' }, h('div', { class: 'ph' }, h('span', { class: 'pi' }, '👥'), h('h2', null, 'Team')), h('p', { class: 'muted' }, 'You get a team after the draft. Come back then to see your teammates.')));
    const inSeason = S.stage === 'season_play' && S.matchLog && idx < items.length, reg = items.slice(0, idx).filter((x) => x.k === 'g' && !x.po), N = inSeason ? reg.length : 82, prog = inSeason ? Math.min(1, N / 82) : 1;
    const wins = inSeason ? reg.filter((x) => x.w).length : t.wins, losses = inSeason ? reg.length - wins : t.losses;
    const rows = rosterRows(t, inSeason, N, prog);
    const mates = rows.filter((r) => !r.me), mm = mates.reduce((a, r) => a + r.mins, 0) || 1;
    const avgOvr = mates.length ? mates.slice(0, 8).reduce((a, r) => a + r.ovr, 0) / Math.min(8, mates.length) : 0, avgRate = mates.reduce((a, r) => a + r.rating * r.mins, 0) / mm;
    const teamPts = rows.reduce((a, r) => a + r.line.pts, 0), me = rows.find((r) => r.me), best = mates.slice().sort((a, b) => b.ovr - a.ovr)[0];
    const role = (r) => (r.me ? 'You' : r.mins >= 32 ? 'Starter' : r.mins >= 24 ? 'Starter' : r.mins >= 14 ? 'Rotation' : 'Bench');
    const tile = (cls, lbl, val, sub) => h('div', { class: 'kpi ' + cls }, h('div', { class: 'k-lbl' }, lbl), h('div', { class: 'k-val' }, val), h('div', { class: 'k-sub' }, sub || ' '));
    const confRows = L.teams.filter((x) => x.conf === t.conf).sort((a, b) => b.wins - a.wins);
    return h('div', { class: 'dash' },
      h('section', { class: 'panel' }, h('div', { class: 'ph' }, logo(t.nick, 40), h('div', null, h('h2', null, t.name), h('div', { class: 'cap2' }, (inSeason ? NBA.seasonLabel(L.year) + ' · after ' + N + ' games' : 'Roster and production'))), h('span', { class: 'spacer' }), h('span', { class: 'badge' }, wins + '-' + losses)),
        h('div', { class: 'kpis', style: 'margin:0' }, tile('hot', 'Record', wins + '-' + losses, (t.conf === 'W' ? 'Western' : 'Eastern') + ' Conf.'), tile('', 'Teammate OVR', avgOvr ? avgOvr.toFixed(0) : '–', 'avg of the top 8'), h('div', { class: 'kpi ink' }, h('div', { class: 'k-lbl' }, 'Teammate rating'), avgRate ? ratingBadge(avgRate, 2) : h('div', { class: 'k-val' }, '–'), h('div', { class: 'k-sub' }, 'minutes-weighted')), tile('', 'Your scoring share', me && teamPts ? Math.round(100 * me.line.pts / teamPts) + '%' : '–', best ? 'Best teammate: ' + best.name.split(' ').slice(-1)[0] + ' (' + best.ovr + ')' : ' '))),
      h('section', { class: 'panel' }, h('div', { class: 'ph' }, h('span', { class: 'pi' }, '☰'), h('h2', null, 'Roster'), h('span', { class: 'spacer' }), h('span', { class: 'badge' }, rows.length + ' players')),
        h('div', { class: 'scroll' }, h('table', { class: 'st roster' }, h('thead', null, h('tr', null, ['Player', 'Role', 'OVR', 'GP', 'MPG', 'PPG', 'RPG', 'APG', 'STL', 'BLK', 'RTG'].map((x, i) => h('th', { class: i < 2 ? 'l' : '' }, x)))),
          h('tbody', null, rows.map((r) => h('tr', { class: r.me ? 'me' : '' }, h('td', { class: 'l' }, h('b', null, r.me ? r.name : plink(r.id, r.name)), h('div', { class: 'small muted' }, r.pos + ' · age ' + r.age + (r.sz ? ' · ' + r.sz : ''))), h('td', { class: 'l muted' }, role(r)), h('td', null, r.ovr), h('td', null, r.gp), h('td', null, r.mins ? r.mins.toFixed(1) : '–'), h('td', null, r.line.pts.toFixed(1)), h('td', null, r.line.reb.toFixed(1)), h('td', null, r.line.ast.toFixed(1)), h('td', null, r.line.stl.toFixed(1)), h('td', null, r.line.blk.toFixed(1)), h('td', null, r.rating ? ratingBadge(r.rating, 1) : '–')))))),
        h('p', { class: 'small muted', style: 'margin-top:10px' }, 'Teammate ratings are the match rating of their average line. Yours is the real average of your games.')),
      h('section', { class: 'panel' }, h('div', { class: 'ph' }, h('span', { class: 'pi' }, '◷'), h('h2', null, 'Recent results'), h('span', { class: 'spacer' }), h('span', { class: 'badge' }, wins + '-' + losses)), recentResults(inSeason ? items.slice(0, idx) : items)),
      histPanel(t, inSeason ? L.year : null));
  }
  function recentResults(all) {
    const games = all.filter((x) => x.k === 'g').slice(-10).reverse();
    if (!games.length) return h('p', { class: 'muted' }, 'No games played yet.');
    return h('div', { class: 'scroll' }, h('table', { class: 'st' }, h('thead', null, h('tr', null, ['Date', 'Opponent', 'Result'].map((x) => h('th', { class: 'l' }, x)))),
      h('tbody', null, games.map((g) => h('tr', null, h('td', { class: 'l muted' }, g.d), h('td', { class: 'l' }, withLogo(g.o, 20, (g.h ? 'vs ' : '@ ') + g.o + (g.po ? ' · playoffs' : ''))), h('td', { class: 'l' }, h('span', { class: 'res ' + (g.w ? 'w' : 'l') }, g.w ? 'W' : 'L'), ' ' + g.f + '-' + g.a + (g.ot ? ' (OT)' : '')))))));
  }

  // ------------------------------------------------------------ around the league
  function screenLeague0() {
    const L = S.league, snap = S.leagueSnap, inSeason = S.stage === 'season_play' && snap && S.matchLog;
    const items = S.matchLog || [], idx = S.matchIdx || 0;
    let rows, label, N = 82;
    if (inSeason) { N = items.slice(0, idx).filter((x) => x.k === 'g' && !x.po).length; rows = proRate(Object.assign({ live: true }, snap), N, items, idx); label = NBA.seasonLabel(L.year) + (idx >= items.length ? ' · final standings' : ' · after ' + N + ' games'); }
    else if (snap) { rows = snap.standings; label = snap.label + ' · final standings'; }
    else { rows = L.teams.map((t) => ({ id: t.id, name: t.name, nick: t.nick, conf: t.conf, wins: t.wins, losses: t.losses })); label = 'Last season · standings'; }
    const mine = S.proSeasons.length || S.draft ? S.teamId : -1;
    if (leagueTeam != null) return teamDetail(leagueTeam, rows, label, !!inSeason && idx < items.length, N);
    const prog = inSeason ? Math.min(1, N / 82) : 1;
    const noise = (k) => seeded(k * 131 + N * 7 + 3);
    const live = !!inSeason && idx < items.length;   // mid-season: only as-of-now information, nothing derived from how the season ends for you
    const tot = live ? seasonTotals(items.slice(0, idx)) : null, userAvg = tot ? { pts: tot.av.pt, reb: tot.av.rb, ast: tot.av.as, stl: tot.av.st, blk: tot.av.bk } : null;
    const userNick = L.teams[S.teamId].nick, bridge = (v, k) => v * (1 + (noise(k)() - 0.5) * 0.14 * (1 - prog));
    const keys = [['pts', 'Points', 'PPG'], ['reb', 'Rebounds', 'RPG'], ['ast', 'Assists', 'APG'], ['stl', 'Steals', 'SPG'], ['blk', 'Blocks', 'BPG']];
    const leaders = live ? null : (snap && snap.leaders) || L.lastLeaders;
    let leadCards;
    if (live) {
      leadCards = N < 10 ? [h('p', { class: 'muted' }, 'Leaders appear after 10 games.')] : keys.map(([k, name, unit], ki) => {
        const list = (snap.leadersO[k] || []).map((x, i) => ({ id: x.id, name: x.name, team: x.team, v2: bridge(x.v, ki * 9 + i) }));
        list.push({ id: 'user', name: S.player.name, team: userNick, v2: userAvg[k], isUser: true });
        list.sort((a, b) => b.v2 - a.v2);
        return h('div', { class: 'well' }, h('div', { class: 'small caps muted' }, name + ' · ' + unit), list.slice(0, 5).map((x, i) => h('div', { class: 'rank-row' + (x.isUser ? ' me' : '') }, h('span', { class: 'n' }, i + 1), h('span', null, plink(x.id, x.name), h('em', null, ' ' + ab(x.team))), h('b', null, x.v2.toFixed(1)))), list.slice(0, 5).some((x) => x.isUser) ? null : h('div', { class: 'small muted', style: 'margin-top:6px' }, 'You: ' + userAvg[k].toFixed(1)));
      });
    } else leadCards = leaders ? keys.map(([k, name, unit]) => h('div', { class: 'well' }, h('div', { class: 'small caps muted' }, name + ' · ' + unit), (leaders[k] || []).slice(0, 5).map((x, i) => h('div', { class: 'rank-row' + (x.isUser ? ' me' : '') }, h('span', { class: 'n' }, i + 1), h('span', null, plink(x.id, x.name), h('em', null, ' ' + ab(x.team))), h('b', null, x.v.toFixed(1)))))) : [h('p', { class: 'muted' }, 'Leaders show up once a season has been played.')];
    const raceKeys = [['mvp', 'MVP'], ['dpoy', 'DPOY'], ['roy', 'ROY'], ['mip', 'MIP']];
    let raceBody;
    const votesIn = !!inSeason && items.some((x, i) => x.k === 'hdr' && /Regular season complete/.test(x.text) && idx > i);   // the regular season is over: the ballots are in and being counted
    if (live && !votesIn) {
      const pace = (nick) => { const r = rows.find((t) => t.nick === nick); return r && r.gp ? (r.wins / r.gp) * 82 : 41; }, rec = (nick) => { const r = rows.find((t) => t.nick === nick); return r ? r.wins + '-' + r.losses : ''; };
      const prod = (c) => c.perf;
      const idxOf = (c) => (leagueRace === 'dpoy' ? 4 * c.blk + 3.5 * c.stl + 0.12 * (c.da || 70) + 0.12 * (c.pace - 41) : leagueRace === 'mvp' ? 0.318 * c.perf + 0.294 * c.pace + 0.068 * c.pts : c.perf + 0.1 * (c.pace - 41));
      if (N < 15) raceBody = h('p', { class: 'muted' }, 'The ladder opens after 15 games.');
      else {
        const list = ((snap.raceO || {})[leagueRace] || []).map((x, i) => { const c = { id: x.id, name: x.name, team: x.team, pts: bridge(x.pts, 60 + i), reb: bridge(x.reb, 70 + i), ast: bridge(x.ast, 80 + i), stl: bridge(x.stl, 90 + i), blk: bridge(x.blk, 100 + i), perf: bridge(x.perf || 0, 110 + i), da: x.da }; c.pace = pace(x.team); return c; });
        const missed = items.slice(0, idx).filter((x) => x.k === 'g' && !x.po && x.dnp).length, uPace = pace(userNick);
        const gpOk = missed <= 17, winsOk = true;  // same eligibility as the final vote: 65+ games played (there is no minimum for team wins)
        const elig = (leagueRace === 'mvp' || leagueRace === 'dpoy' || (leagueRace === 'roy' && S.pre && S.pre.rookie)) && gpOk && winsOk;
        const uTov = tot.av.to, uTs = tot.t.fga ? tot.av.pt / (2 * (tot.av.fga + 0.44 * tot.av.fta)) : 0.55;
        const uPerf = NBA.perfOf({ pts: userAvg.pts, reb: userAvg.reb, ast: userAvg.ast, stl: userAvg.stl, blk: userAvg.blk, tov: uTov, ts: uTs });
        if (elig) list.push({ id: 'user', name: S.player.name, team: userNick, pts: userAvg.pts, reb: userAvg.reb, ast: userAvg.ast, stl: userAvg.stl, blk: userAvg.blk, perf: uPerf, recent: S.player.mvpRecent || 0, pace: uPace, isUser: true, da: Math.max(S.player.attrs.rimP, S.player.attrs.perD) });
        list.forEach((c) => (c.ix = idxOf(c))); list.sort((a, b) => b.ix - a.ix);
        // what the media says: four made-up outlets with their own habits (numbers, winning, highlights, fan buzz) each file a ballot; the consensus adds them up (these are opinions, not the vote)
        const pool = list.slice(0, 10), zs = (f) => { const v = pool.map(f), m = v.reduce((p, q) => p + q, 0) / (v.length || 1), sd = Math.sqrt(v.reduce((p, q) => p + (q - m) * (q - m), 0) / (v.length || 1)) || 1; return v.map((x) => (x - m) / sd); };
        const buzz = (c) => (leagueRace === 'dpoy' ? c.stl + c.blk : leagueRace === 'mvp' ? c.pts : c.perf), zi = zs((c) => c.ix), zt = zs((c) => c.pace), zb = zs(buzz);
        const hn = (str) => { let hv = 2166136261; for (let k = 0; k < str.length; k++) { hv ^= str.charCodeAt(k); hv = Math.imul(hv, 16777619); } return ((hv >>> 0) % 2000) / 1000 - 1; };
        const OUT = [['ESPN', 'the production', 0.8, 0.3, 0.2, 0.2], ['The Athletic', 'the analytics', 1, 0.2, 0, 0.15], ['Sports Illustrated', 'winning', 0.45, 0.85, 0.2, 0.3], ['Bleacher Report', 'the highlights', 0.5, 0.1, 0.7, 0.35], ['Yahoo Sports', 'fan buzz', 0.3, 0.3, 0.9, 0.6]], nb = Math.floor(N / 5);
        const ballots = OUT.map((o) => ({ name: o[0], lens: o[1], rank: pool.map((c, i) => ({ c, s: o[2] * zi[i] + o[3] * zt[i] + o[4] * zb[i] + o[5] * hn(o[0] + c.name + nb + leagueRace) })).sort((x, y) => y.s - x.s).map((x) => x.c) }));
        const pts = new Map(), firsts = new Map(); ballots.forEach((bl) => bl.rank.slice(0, 5).forEach((c, i) => { pts.set(c, (pts.get(c) || 0) + 5 - i); if (!i) firsts.set(c, (firsts.get(c) || 0) + 1); }));
        const cons = Array.from(pts.keys()).sort((x, y) => pts.get(y) - pts.get(x) || y.ix - x.ix).slice(0, 5), mx = Math.max(1, ...cons.map((c) => pts.get(c)));
        const nm = (c) => (c.isUser ? h('b', null, c.name) : plink(c.id, c.name));
        raceBody = [h('p', { class: 'small muted' }, 'What the media says as of game ' + N + '. Simulated ballots from five outlets, each with its own habits, and the consensus adds them up: opinions, not the vote.' + (leagueRace === 'dpoy' ? ' Voters weigh blocks and steals, defensive ratings and team record.' : '')),
          h('div', { class: 'cap2', style: 'margin:6px 0' }, 'Consensus'),
          cons.map((x, i) => h('div', { class: 'race' + (x.isUser ? ' me' : '') }, h('div', { class: 'row' }, h('span', { class: 'n' }, i + 1), h('b', null, plink(x.id, x.name)), h('em', null, ab(x.team)), h('span', { class: 'spacer' }), h('span', { class: 'small muted' }, rec(x.team))), h('div', { class: 'bar2' }, h('i', { style: 'width:' + Math.round(100 * pts.get(x) / mx) + '%' })), h('div', { class: 'small muted' }, (firsts.get(x) ? 'Picked first by ' + firsts.get(x) + ' of ' + OUT.length + ' outlets · ' : 'On ' + ballots.filter((bl) => bl.rank.slice(0, 5).includes(x)).length + ' of ' + OUT.length + ' ballots · ') + x.pts.toFixed(1) + ' pts · ' + x.reb.toFixed(1) + ' reb · ' + x.ast.toFixed(1) + ' ast' + (leagueRace === 'dpoy' ? ' · ' + x.stl.toFixed(1) + ' stl · ' + x.blk.toFixed(1) + ' blk' : '')))),
          h('div', { class: 'cap2', style: 'margin:12px 0 6px' }, 'The ballots'),
          ballots.map((bl) => h('div', { class: 'small', style: 'margin:4px 0' }, h('b', null, bl.name), h('span', { class: 'muted' }, ' (' + bl.lens + '): '), bl.rank.slice(0, 3).map((c, i) => [i ? ' › ' : '', nm(c)]))),
          cons.some((x) => x.isUser) ? null : h('p', { class: 'small muted', style: 'margin-top:8px' }, elig ? 'The media does not have you in the top 5 for now.' : !gpOk ? 'You have missed ' + missed + ' games: 65 played are needed to qualify.' : 'Not eligible for this award.')];
      }
    } else {
      const race = snap && snap.race ? snap.race : null;
      if (!race) raceBody = h('p', { class: 'muted' }, 'The award race starts once you are in the league.');
      else {
        const list = (race[leagueRace] || []).slice().sort((a, b) => b.s - a.s);
        const ex = list.map((x) => Math.exp(x.s / 7)), tot2 = ex.reduce((a, b) => a + b, 0) || 1;
        raceBody = list.length ? [votesIn ? h('p', { class: 'small muted' }, 'The regular season is over: the ballots are in and being counted. These are the final vote shares.') : null].concat(list.map((x, i) => h('div', { class: 'race' + (x.isUser ? ' me' : '') }, h('div', { class: 'row' }, h('span', { class: 'n' }, i + 1), h('b', null, plink(x.id, x.name)), h('em', null, ab(x.team)), h('span', { class: 'spacer' }), h('b', null, Math.round(100 * ex[i] / tot2) + '%')), h('div', { class: 'bar2' }, h('i', { style: 'width:' + Math.round(100 * ex[i] / tot2) + '%' })), h('div', { class: 'small muted' }, x.pts.toFixed(1) + ' pts · ' + x.reb.toFixed(1) + ' reb · ' + x.ast.toFixed(1) + ' ast' + (leagueRace === 'dpoy' ? ' · ' + x.stl.toFixed(1) + ' stl · ' + x.blk.toFixed(1) + ' blk' : '') + ' · ' + x.wins + ' team wins')))) : h('p', { class: 'muted' }, 'No candidates this year.');
        if (list.length && !list.some((x) => x.isUser)) { const rr = S.proSeasons[S.proSeasons.length - 1]; raceBody = [raceBody, h('p', { class: 'small muted', style: 'margin-top:8px' }, rr && rr.gp < 65 ? 'You were not in this race: you played ' + rr.gp + ' games and 65 are needed to qualify.' : 'You were not in this race.')]; }
      }
    }
    // the play-in tournament: shown once the regular season is over (the results are decided, but nobody sees them early)
    const reEnd = items.findIndex((x) => x.k === 'hdr' && /Regular season complete/.test(x.text));
    const piGames = snap && snap.playin && snap.playin.length && (!live || (reEnd >= 0 && idx > reEnd)) ? snap.playin : null;
    const piPanel = piGames ? h('section', { class: 'panel' }, h('div', { class: 'ph' }, h('span', { class: 'pi' }, '⚔'), h('h2', null, 'Play-In Tournament'), h('span', { class: 'spacer' }), h('span', { class: 'badge' }, snap.label)),
      h('div', { class: 'grid2 conf' }, ['E', 'W'].map((c) => h('div', null, h('h3', null, c === 'E' ? 'Eastern conference' : 'Western conference'),
        piGames.filter((g) => g.conf === c).map((g) => h('div', { class: 'jrow' }, h('div', null, h('div', { class: 'small caps muted' }, g.label), h('div', null, h('b', null, g.w), ' beat ' + g.l), h('div', { class: 'small muted' }, g.stake)))))))) : null;
    return h('div', { class: 'dash' },
      h('div', { class: 'dlg' },
        h('section', { class: 'panel' }, h('div', { class: 'ph' }, h('span', { class: 'pi' }, '☷'), h('h2', null, 'Standings'), h('span', { class: 'spacer' }), h('span', { class: 'badge' }, label)),
          h('div', { class: 'grid2 conf' }, h('div', null, h('h3', null, 'Eastern conference'), confTable(rows, 'E', mine)), h('div', null, h('h3', null, 'Western conference'), confTable(rows, 'W', mine))), h('p', { class: 'small muted' }, 'Top 6 clinch a playoff spot, 7-10 go to the play-in.')),
        h('section', { class: 'panel' }, h('div', { class: 'ph' }, h('span', { class: 'pi' }, '★'), h('h2', null, live && !votesIn ? 'Award ladder' : votesIn ? 'Award voting' : 'Award race'), h('span', { class: 'spacer' }), h('div', { class: 'seg2 tight' }, raceKeys.map(([k, n]) => h('button', { class: leagueRace === k ? 'on' : '', onclick: () => { leagueRace = k; render(); } }, n)))), raceBody)),
      piPanel,
      h('section', { class: 'panel' }, h('div', { class: 'ph' }, h('span', { class: 'pi' }, '▲'), h('h2', null, 'Stat leaders · top 5'), h('span', { class: 'spacer' }), h('span', { class: 'badge' }, snap ? snap.label : 'Last season')), h('div', { class: 'grid3' }, leadCards)),
      (L.moves && L.moves.length ? h('section', { class: 'panel' }, h('div', { class: 'ph' }, h('span', { class: 'pi' }, '⇄'), h('h2', null, 'Transactions'), h('span', { class: 'spacer' }), h('span', { class: 'badge' }, 'Trades and free agency')), h('div', { class: 'jlist' }, L.moves.slice(-14).reverse().map((m) => h('div', { class: 'jrow' }, h('span', { class: 'jyr' }, m.phase === 'deadline' ? 'Deadline ' + m.year : m.phase === 'freeagency' ? 'FA ' + (m.year + 1) : 'Summer ' + (m.year + 1)), h('div', { class: 'small' }, m.text))))) : null));
  }
  // download the whole career as a file (for bug reports: lets a problem be replayed from the exact save)
  function exportSave() {
    try {
      const blob = new Blob([JSON.stringify({ build: BUILD, exportedAt: new Date().toISOString(), state: S, snap: G.getSnap() || null })], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'nba-career-sim-save-' + (S.player.name || 'career').replace(/[^A-Za-z0-9]+/g, '-') + '.json';
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    } catch (e) { alert('Could not export the save: ' + e.message); }
  }
  function socialCard() {
    const sx = NBA.Social.state(S), hs = sx.hist.slice(-8);
    return h('section', { class: 'panel' }, h('div', { class: 'ph' }, h('span', { class: 'pi' }, '📱'), h('h2', null, 'Your following'), h('span', { class: 'spacer' }), h('span', { class: 'badge' }, sx.handle + (sx.verified ? ' ✓' : ''))),
      h('div', { class: 'big' }, NBA.Social.fmt(sx.f) + ' followers'), h('p', { class: 'small muted' }, 'Sponsors pay for reach: your following moves your endorsement offers up or down. Awards, big games, a viral post and a good press room grow it.'),
      hs.length ? h('table', { class: 'lvq' }, h('tr', null, ['Year', 'Followers', 'Change'].map((c) => h('th', null, c))), hs.slice().reverse().map((x) => h('tr', null, h('td', null, x.y), h('td', null, NBA.Social.fmt(x.f)), h('td', { class: x.g >= 0 ? 'good' : 'bad' }, (x.g >= 0 ? '+' : '−') + NBA.Social.fmt(Math.abs(x.g)))))) : null);
  }
  function screenCareer() { const el = screenCareer0(); if (S.contract && el.append) el.append(socialCard()); return el; }
  function screenCareer0() {
    return h('div', { class: 'dash' }, h('section', { class: 'panel' }, h('div', { class: 'ph' }, h('span', { class: 'pi' }, '▣'), h('h2', null, S.player.name + ' · career'), h('span', { class: 'spacer' }), h('button', { class: 'ghost tiny', title: 'Download this career as a file (for bug reports)', onclick: exportSave }, '⬇ Export save')), careerBody()));
  }

  function screenRecap() {
    const r = S.proSeasons[S.proSeasons.length - 1];
    const p = S.player;
    const awardPills = r.awards.map((a) => h('span', { class: 'pill gold' }, '🏅 ' + a));
    const ranks = r.ranks ? ['pts', 'reb', 'ast', 'stl', 'blk'].filter((k) => r.ranks[k] && r.ranks[k] <= 5).map((k) => h('span', { class: 'pill good' }, '#' + r.ranks[k] + ' in ' + { pts: 'scoring', reb: 'rebounding', ast: 'assists', stl: 'steals', blk: 'blocks' }[k])) : [];
    const pr = S.proSeasons.length > 1 ? S.proSeasons[S.proSeasons.length - 2] : null;
    const dl = (cur, old) => (old == null ? h('div', { class: 'k-sub' }, ' ') : h('div', { class: 'k-sub ' + (cur >= old ? 'up' : 'down') }, (cur >= old ? '▲ ' : '▼ ') + Math.abs(cur - old).toFixed(1) + ' vs last season'));
    const rk = (cls, l, v, sub) => h('div', { class: 'kpi ' + cls }, h('div', { class: 'k-lbl' }, l), h('div', { class: 'k-val' }, v), sub);
    const recKpis = h('div', { class: 'kpis' }, rk('hot', 'Points', f1(r.pts), dl(r.pts, pr && pr.pts)), rk('', 'Rebounds', f1(r.reb), dl(r.reb, pr && pr.reb)), rk('', 'Assists', f1(r.ast), dl(r.ast, pr && pr.ast)),
      h('div', { class: 'kpi ink' }, h('div', { class: 'k-lbl' }, 'Avg rating'), h('div', { style: 'margin-top:8px' }, r.avgRating ? ratingBadge(r.avgRating, 2) : '–'), h('div', { class: 'k-sub' }, r.wins + '-' + r.losses + (r.poRating ? ' · playoffs ' + r.poRating.toFixed(2) : ''))));
    return h('div', null, h('h1', null, r.label + ' season recap'), recKpis,
      h('div', { class: 'card' }, h('p', { class: 'muted' }, r.team + ' · age ' + r.age + ' · OVR ' + r.ovr + ' · ' + money(r.salary)),
        h('div', { class: 'grid stats' }, statBox(f1(r.stl), 'SPG'), statBox(f1(r.blk), 'BPG'), statBox(r.gp, 'Games'), statBox(r.td, 'Triple-doubles')),
        h('p', { style: 'margin-top:10px' }, 'FG ' + pct(r.fgp) + '% · 3P ' + pct(r.tpp) + '% · FT ' + pct(r.ftp) + '% · TS ' + pct(r.ts) + '% · ' + f1(r.mins) + ' mpg · High game ' + r.high),
        h('p', null, 'Triple-doubles: ', h('b', null, r.td), ' · Double-doubles: ', h('b', null, r.dd), r.g40 ? ' · 40-pt games: ' + r.g40 : '', r.avgTD ? ' · 🔥 AVERAGED A TRIPLE-DOUBLE' : ''),
        h('p', null, h('b', null, r.wins + '-' + r.losses), ' · ' + r.playoffText), awardPills, ranks, r.injury ? h('div', { class: 'callout' }, '🩹 ' + r.injury) : null, r.events.map((e) => h('div', { class: 'callout' }, e))),
      r.playoff ? h('div', { class: 'card' }, h('h2', null, 'Playoffs' + (r.legend ? ' 🔥 LEGENDARY RUN' : r.heater ? ' 🔥 on a heater' : '')), h('div', { class: 'grid stats' }, statBox(f1(r.playoff.pts), 'PPG'), statBox(f1(r.playoff.reb), 'RPG'), statBox(f1(r.playoff.ast), 'APG'), r.poRating ? h('div', { class: 'statbox' }, h('div', { class: 'big' }, ratingBadge(r.poRating, 2)), h('div', { class: 'lbl' }, 'Playoff rating')) : null), h('p', { class: 'muted small' }, r.playoff.gp + ' games · ' + (r.playoff.form != null ? 'postseason form ×' + r.playoff.form.toFixed(2) + ' (' + f1(r.playoff.pts) + ' vs ' + f1(r.pts) + ' ppg in the regular season) · ' : '') + pct(r.playoff.ts) + ' TS% · ' + r.playoff.td + ' triple-doubles · high ' + r.playoff.high),
        h('div', { class: 'scroll' }, h('table', null, h('thead', null, h('tr', null, ['Round', 'Opponent', 'Result', 'PTS', 'REB', 'AST'].map((x, i) => h('th', { class: i < 3 ? 'l' : '' }, x)))), h('tbody', null, r.perSeries.map((s) => h('tr', null, h('td', { class: 'l' }, s.round), h('td', { class: 'l' }, s.opp), h('td', { class: 'l' }, s.result + (s.missed ? ' · missed ' + s.missed : '')), h('td', null, f1(s.pts)), h('td', null, f1(s.reb)), h('td', null, f1(s.ast)))))))) : null,
      h('div', { class: 'card ink' }, h('h2', null, 'Around the league'), h('p', null, 'Champion: ', h('b', null, r.champion), ' · MVP: ', h('b', null, r.mvp)), h('p', { class: 'muted small' }, r.league.n30 + ' players averaged 30+ this year, ' + r.league.n25 + ' averaged 25+.'), h('h3', null, 'Top scorers'), r.league.topScorers.slice(0, 5).map((t, i) => h('div', { class: 'rank-row' }, h('span', { class: 'n' }, i + 1), h('span', null, t.name), h('b', null, f1(t.ppg))))),
      (() => { const fb = feedBlocks(S.league.year, (S.matchLog || []).length, 0).slice(0, 6); return fb.length ? h('div', { class: 'card' }, h('h2', null, '📱 The timeline this year'), fb.map(feedBlock), h('div', { class: 'row' }, h('button', { class: 'ghost tiny', onclick: showTimeline }, 'See everything'))) : null; })(),
      h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => { S.stage = 'decision'; S.decision = G.decisionOptions(S); go(); } }, 'Offseason decisions →')));
  }


  // contract negotiation: name your money, years and role; the dial shows the odds live, the club answers when you submit
  let negOpen = null;
  const capText = (c) => (c.kind === 'Cap room' ? '💰 Cap room ' + money(c.room) + ' (payroll ' + money(c.payroll) + ')' : '🧾 ' + c.status + ': only the ' + c.kind.toLowerCase() + ', up to ' + money(c.max)) + (c.capped ? ' · they would pay more if they could' : '');
  function negCard(d, o, kind, doneFn) {
    const c = d.neg && d.neg[o.teamId]; if (!c) return null;
    const ask = { salary: Math.min(c.maxSal, Math.max(c.minSal, o.salary)), years: Math.min(c.pref, c.maxYears), role: c.offered };
    const open = negOpen === o.teamId;
    const head = h('div', { class: 'row' }, h('div', null, h('b', null, o.name), h('div', { class: 'small muted' }, (o.label || '') + ' · they see you as a ' + c.offered.toLowerCase() + ' · opening offer ' + money(c.fair) + ' / yr'), o.cap ? h('div', { class: 'small muted' }, capText(o.cap)) : null, c.read.length ? h('div', { class: 'small vibe' }, c.read.join(' ')) : null, c.msg ? h('div', { class: 'small ' + (c.closed ? 'bad' : '') }, c.msg) : null), h('span', { class: 'spacer' }),
      c.closed ? h('span', { class: 'badge' }, 'Talks over') : h('button', { onclick: () => { negOpen = open ? null : o.teamId; render(); } }, open ? 'Close' : 'Negotiate'));
    if (!open || c.closed) return h('div', { class: 'card' + (c.closed ? ' off' : '') }, head);
    // the dial
    const R = 60, LEN = Math.PI * R, arcD = 'M10 70 A60 60 0 0 1 130 70';
    const NS = 'http://www.w3.org/2000/svg', el = (t, a) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); return e; };
    const svg = el('svg', { viewBox: '0 0 140 84', class: 'negdial' }), track = el('path', { d: arcD, fill: 'none', stroke: 'rgba(255,255,255,.12)', 'stroke-width': 12, 'stroke-linecap': 'round' }), fill = el('path', { d: arcD, fill: 'none', 'stroke-width': 12, 'stroke-linecap': 'round' }), txt = el('text', { x: 70, y: 66, 'text-anchor': 'middle', class: 'negpct' });
    svg.append(track, fill, txt);
    const why = h('div', { class: 'small muted' });
    const sal = h('input', { type: 'number', min: c.minSal, max: c.maxSal, step: 0.1, value: ask.salary }), rng = h('input', { type: 'range', min: c.minSal, max: c.maxSal, step: 0.1, value: ask.salary });
    const yrs = h('select', null, Array.from({ length: c.maxYears }, (_, i) => h('option', { value: i + 1, selected: i + 1 === ask.years }, (i + 1) + ' year' + (i ? 's' : ''))));
    const optBox = h('input', { type: 'checkbox', onchange: () => upd() }), optRow = h('label', { class: 'small muted', style: 'display:block;margin-top:6px' }, optBox, ' Player option on the last year (you can walk after the year before it; clubs like it less)');
    const rl = h('select', null, G.ROLES.slice().reverse().map((r) => h('option', { value: r, selected: r === ask.role }, r)));
    const upd = () => {
      ask.salary = Math.min(c.maxSal, Math.max(c.minSal, +sal.value || c.minSal)); ask.years = +yrs.value; ask.role = rl.value; optBox.disabled = ask.years < 3; if (ask.years < 3) optBox.checked = false; ask.option = optBox.checked ? 'player' : null;
      const r = G.negOdds(S, o.teamId, ask), p = r.p;
      fill.setAttribute('stroke', 'hsl(' + Math.round(p * 120) + ',70%,55%)'); fill.setAttribute('stroke-dasharray', (p * LEN).toFixed(1) + ' ' + LEN.toFixed(1)); txt.textContent = Math.round(p * 100) + '%';
      why.textContent = 'They would go up to about ' + money(Math.min(r.ceil, c.maxSal)) + ' for these terms. ' + r.parts.filter((x) => Math.abs(x.v) >= 0.02).map((x) => x.label + ' ' + (x.v > 0 ? '+' : '−') + Math.round(Math.abs(x.v) * 100) + '%').join(' · ');
    };
    sal.oninput = () => { rng.value = sal.value; upd(); }; rng.oninput = () => { sal.value = rng.value; upd(); }; yrs.onchange = upd; rl.onchange = upd; upd();
    const body = c.counter
      ? h('div', null, h('div', { class: 'callout' }, c.msg), h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => { try { doneFn(G.acceptCounter(S, o.teamId)); } catch (e) { console.error(e); } } }, 'Accept counter'), h('button', { onclick: () => { try { G.declineCounter(S, o.teamId); save(); render(); } catch (e) { console.error(e); } } }, 'Decline and keep haggling')))
      : h('div', { class: 'negbox' }, svg, h('div', { class: 'negform' }, h('label', { class: 'small muted' }, 'Salary ($M / yr)'), h('div', { class: 'row' }, sal, rng), h('div', { class: 'row' }, h('div', null, h('label', { class: 'small muted' }, 'Years'), yrs), h('div', null, h('label', { class: 'small muted' }, 'Role'), rl)), optRow, why,
        h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => { try { const res = G.negotiate(S, o.teamId, ask); if (res.ok) doneFn(res); else { save(); render(); } } catch (e) { console.error(e); } } }, 'Make the offer'))));
    return h('div', { class: 'card' }, head, body);
  }

  // the offseason page, with the late-career / locker-room / new-coach decision as a pop-up over it
  let decModal = null;
  function screenDecision() { decModal = null; const pg = screenDecision0(); return decModal ? h('div', null, modal(decModal), pg) : pg; }
  function screenDecision0() {
    const d = S.decision || (S.decision = G.decisionOptions(S));
    const done = (res) => { if (S.dec && S.dec.pending && S.dec.pending.id === 'late') DEC().autoResolve(S); S.farewellOverride = false; S.decision = null; alloc = {}; S.flash = res && res.text; go(); };
    const out = [h('h1', null, 'Offseason: what now?'), h('p', { class: 'muted' }, 'Age ' + d.age + ' · OVR ' + d.ovr + ' · ' + d.team + ' · market value ~' + money(d.marketSalary) + ' (cap ' + money(d.cap) + ')')];
    { const dd = S.dec, rv = dd && dd.rival, rq = rv && S.league.players[rv.id];
      if (rv && rq) { const tm = S.league.teams[rq.teamId], g = (S.matchLog || []).filter((x) => x.k === 'g' && !x.po && !x.dnp && tm && x.o === tm.nick), w = g.filter((x) => x.w).length;
        out.push(h('div', { class: 'card' }, h('div', { class: 'row' }, tm ? logo(tm.nick, 36) : null, h('div', null, h('b', null, '🔥 Your rival: ', plink(rv.id, rv.name)), h('div', { class: 'small muted' }, (tm ? tm.name + ' · ' : '') + Math.round(NBA.ovr(rq)) + ' OVR · rivals since ' + rv.since + (g.length ? ' · you went ' + w + '-' + (g.length - w) + ' against his team this year' : '')))))); } }
    if (d.farewell && !d.mustRetire && !S.farewellOverride) {
      out.push(h('div', { class: 'callout' }, 'Your farewell season is over. You told the world this was the last one.'),
        h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => { G.retire(S); S.decision = null; go(); } }, 'Retire, as promised'), confirmBtn('Play another year anyway', 'danger', () => { S.farewellOverride = true; render(); })),
        h('p', { class: 'small muted' }, 'If you play on, the fans and the media will remember that you said goodbye, and the locker room will feel it.'));
      return h('div', null, out);
    }
    if (d.farewell && S.farewellOverride) out.push(h('div', { class: 'callout' }, 'You said this was your farewell. If you sign or stay, the fans, the media and the room will all notice, and it will cost you.'));
    if (d.brand && (d.brand.score > 0 || d.brand.deals.length || d.brand.offers.length)) {
      const L2 = NBA.Legacy, b = d.brand, ag = b.agent, full = b.deals.length >= 4;
      out.push(h('div', { class: 'card bizcard' }, h('h3', { style: 'margin-top:0' }, '💼 Business'), h('p', { class: 'small muted' }, 'Brand ' + b.score + '/100' + (ag ? ' · agent ' + ag.name + ' keeps ' + Math.round(ag.fee * 100) + '%' : '')),
        ag ? (() => { const sel = h('select', null, L2.AGENTS.filter((x) => x.id !== ag.id).map((x) => h('option', { value: x.id }, x.name + ' · ' + x.tag))); return h('div', { class: 'row small', style: 'margin:4px 0 8px' }, h('span', { class: 'muted' }, 'Not happy with your agent?'), sel, confirmBtn('Switch agent', '', () => { try { L2.switchAgent(S, sel.value); S.decision = null; save(); render(); } catch (e) { console.error(e); } })); })() : null,
        b.deals.length ? h('div', null, b.deals.map((x) => h('div', { class: 'small' }, '• ' + x.name + ' (' + x.cat.toLowerCase() + '): ' + money(x.annual) + ' a year, ' + x.years + ' left' + (x.clause === 'image' ? ' · image clause' : '')))) : h('p', { class: 'small muted' }, 'No endorsement deals yet.'),
        b.offers.map((o) => h('div', { class: 'row', style: 'margin:6px 0' }, h('div', null, h('b', null, o.name), h('div', { class: 'small muted' }, o.cat + ' · ' + money(o.annual) + ' a year for ' + o.years + ' year' + (o.years > 1 ? 's' : '') + (o.clause === 'image' ? ' · image clause: they leave if the media turns on you' : ''))), h('span', { class: 'spacer' }),
          o.state ? h('span', { class: 'small muted' }, o.state === 'yes' ? 'Signed' : 'Passed') : h('span', { class: 'row' }, h('button', { class: 'primary', disabled: full, onclick: () => { try { L2.answerOffer(S, o.id, true); save(); render(); } catch (e) { console.error(e); } } }, full ? 'Deals full' : 'Sign'), h('button', { onclick: () => { L2.answerOffer(S, o.id, false); save(); render(); } }, 'Pass'))))));
    }
    // the money: where your club stands against the cap, a team option the club used, a player option for you, an extension on the table
    if (d.finance) { const f = d.finance; out.push(h('div', { class: 'small muted', style: 'margin:6px 0' }, '🏦 ' + d.team + ' payroll ' + money(f.payroll) + ' · cap ' + money(f.cap) + ' · tax line ' + money(f.taxLine) + ' · ' + f.status + (f.space ? ' · ' + money(f.space) + ' of room' : '') + (f.taxBill ? ' · tax bill about ' + money(f.taxBill) : ''))); }
    if (d.optionNote) out.push(h('div', { class: 'callout' }, d.optionNote));
    if (d.taxNote) out.push(h('div', { class: 'callout' }, '🧾 ' + d.taxNote));
    if (d.playerOption) { const po = d.playerOption;
      out.push(h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, 'Your player option'), h('p', { class: 'small muted' }, 'The last year of your deal is yours to keep or leave: $' + po.salary + 'M, or test the market now (your value is about ' + money(po.marketSalary) + '). ' + (po.better ? 'The market looks better than your option.' : 'The market is not obviously better than your option.')),
        h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => { try { done(G.decide(S, 'option', { take: true })); } catch (e) { console.error(e); } } }, 'Opt in for ' + money(po.salary)), confirmBtn('Decline and test free agency', '', () => { try { G.decide(S, 'option', { take: false }); S.decision = null; save(); render(); } catch (e) { console.error(e); } })))); }
    if (d.extension) { const ex = d.extension; let yrs = ex.years;
      out.push(h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, '✍️ ' + ex.kind), h('p', { class: 'small muted' }, 'The ' + ex.team + ' want to lock you in before you hit the market: ' + money(ex.salary) + ' a year, starting next season' + (ex.crit ? ' (you qualify for the bigger number with ' + ex.crit + ')' : '') + '. You still play out your current year.'),
        h('div', { class: 'row' }, h('b', null, money(ex.salary) + ' / yr'), h('select', { onchange: (e) => { yrs = +e.target.value; } }, Array.from({ length: ex.maxYears }, (_, i) => h('option', { value: i + 1, selected: i + 1 === yrs }, (i + 1) + ' year' + (i ? 's' : '')))), h('span', { class: 'spacer' }),
          h('button', { class: 'primary', onclick: () => { try { done(G.decide(S, 'extend', { salary: ex.salary, years: yrs })); } catch (e) { console.error(e); } } }, 'Sign the extension'), h('button', { class: 'ghost', onclick: () => { S.decision.extension = null; save(); render(); } }, 'Not now')))); }
    else if (d.extensionNo) out.push(h('p', { class: 'small muted' }, d.extensionNo));
    { const ij = ((S.dec && S.dec.journal) || []).filter((e) => e.kind === 'injury' && e.year === S.league.year).slice(-1)[0]; if (ij) out.push(h('div', { class: 'callout' }, '🩹 ' + ij.title + ': ' + ij.text)); }

    if (S.dec && S.dec.pending && S.dec.pending.id === 'late' && !d.mustRetire) { const v = DEC().view(S);
      decModal = (h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, v.title), h('p', { class: 'small muted' }, v.text), S.dec.pending.log.length ? h('div', { class: 'jlog' }, S.dec.pending.log.map((x) => h('div', { class: 'jmsg ' + x.tone }, x.text))) : null,
        h('div', { class: 'wkgrid' }, v.options.map((o) => h('div', { class: 'wkcard' }, h('b', null, o.label), h('div', { class: 'small', style: 'margin:6px 0' }, o.blurb), h('div', { class: 'small vibe' }, o.vibe), h('div', { style: 'margin-top:8px' }, h('button', { onclick: () => { try { DEC().choose(S, o.key); save(); render(); } catch (e) { console.error(e); } } }, 'Choose'))))))); }
    if (d.mustRetire) out.push(h('div', { class: 'callout' }, d.farewell ? 'Your farewell season is over. The league gives you a standing ovation, and it is time to hang them up.' : 'No team has an offer for you and your body says it is time. This is the end of the road.'));
    if (d.expiring && !d.mustRetire) {
      const mkOffer = (o, kind) => {
        let yrs = Math.min(3, o.maxYears);
        const lab = h('b', null);
        const sel = h('select', { onchange: (e) => (yrs = +e.target.value) }, Array.from({ length: o.maxYears }, (_, i) => h('option', { value: i + 1, selected: i + 1 === yrs }, (i + 1) + ' year' + (i ? 's' : ''))));
        return h('div', { class: 'card' }, h('div', { class: 'row' }, h('div', null, h('b', null, o.name), h('div', { class: 'small muted' }, o.label + ' · you would be a ' + o.role)), h('span', { class: 'spacer' }), h('b', null, money(o.salary) + ' / yr'), sel, h('button', { class: 'primary', onclick: () => done(G.decide(S, kind, { teamId: o.teamId, salary: o.salary, years: yrs, tag: o.tag })) }, kind === 'resign' ? 'Re-sign' : 'Sign')));
      };
      if (d.waived) out.push(h('div', { class: 'callout' }, d.waived));
      if (d.signTrade) out.push(h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, '🔁 Option: leave in a sign-and-trade'), h('p', { class: 'small muted' }, 'Nothing has happened yet. Pick one of these and the ' + d.team + ' will re-sign you and immediately trade you to that contender, who could not sign you outright. They get picks and you get the deal shown. Or ignore this and use the re-sign and free agency options below.'),
        d.signTrade.map((o) => h('div', { class: 'row', style: 'margin:6px 0' }, logo(o.nick, 32), h('div', null, h('b', null, o.name), h('div', { class: 'small muted' }, o.label + ' · ' + o.role + ' · the ' + d.team + ' get ' + o.picks)), h('span', { class: 'spacer' }), h('b', null, money(o.salary) + ' / yr'), h('span', { class: 'small muted' }, o.years + 'y'),
          confirmBtn('Do this deal', 'primary', () => done(G.decide(S, 'switch', { teamId: o.teamId, salary: o.salary, years: o.years, tag: 'sat' })))))));
      if (d.market) {
        // free agency is a pitch, not a menu: clubs can say no
        const pitchCard = (m) => d.neg && d.neg[m.teamId] ? negCard(d, Object.assign({}, m, { name: m.name }), 'switch', done) : m.pitched === 'offer' ? mkOffer(Object.assign({}, m, { name: m.name, tag: m.ring ? 'ring' : null, label: m.label + ' · they made you an offer' + (m.ring ? ' · ring chase (a discount to play for a title)' : '') + (m.vouch ? ' · someone you trained with spoke up for you' : '') }), 'switch')
          : h('div', { class: 'card' + (m.pitched === 'no' ? ' off' : '') }, h('div', { class: 'row' }, logo(m.nick, 36), h('div', null, h('b', null, m.name), h('div', { class: 'small muted' }, m.label + ' · you would be a ' + m.role),
            m.pitched === 'no' ? h('div', { class: 'small bad' }, '✖ Turned you down. ' + m.reason) : h('div', { class: 'small vibe' }, m.vibe)), h('span', { class: 'spacer' }),
            m.pitched ? h('span', { class: 'badge' }, 'Rejected') : null));
        out.push(h('h3', null, 'Your club'), d.resign ? [h('p', { class: 'small muted' }, d.resignText), mkOffer(d.resign, 'resign'), d.neg && d.neg[d.resign.teamId] ? negCard(d, d.resign, 'resign', done) : null, d.resign.loyal ? mkOffer(Object.assign({}, d.resign, { salary: d.resign.loyal.salary, maxYears: d.resign.loyal.years, label: 'Loyalty deal: you take less so the team can build around you', tag: 'loyal' }), 'resign') : null] : [h('div', { class: 'card off' }, d.resignText), d.neg && d.neg[S.teamId] ? negCard(d, { teamId: S.teamId, name: d.team, label: '', salary: d.neg[S.teamId].fair }, 'resign', done) : null], h('h3', null, 'Free agency · negotiate with other clubs'),
          h('p', { class: 'small muted' }, 'Negotiate with as many clubs as you like. Pick the money, years and role you want and the dial shows your chances. Desperate clubs (no one at your position, bad record, cap room) will stretch for you; clubs with other options will not. Ask for too much and they walk.'), d.market.map(pitchCard));
        if (!d.resign && d.market.every((m) => m.pitched === 'no')) out.push(h('div', { class: 'callout' }, 'Every club turned you down and nobody is calling. This is where the road ends: no team wants you.'), h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => { G.retire(S); S.decision = null; go(); } }, 'Retire from basketball')));
      } else {
        out.push(h('h3', null, 'Your contract expired · stay'), mkOffer(d.resign, 'resign'), h('h3', null, 'Test free agency · switch teams'), d.offers.length ? d.offers.map((o) => mkOffer(o, 'switch')) : h('p', { class: 'muted' }, 'No other team made an offer.'));
      }
    } else if (!d.mustRetire) {
      out.push(h('div', { class: 'card' }, h('div', { class: 'row' }, h('div', null, h('b', null, 'Stay with the ' + d.team), h('div', { class: 'small muted' }, 'Contract: ' + money(d.contract.salary) + ' · ' + d.contract.left + ' more year(s)')), h('span', { class: 'spacer' }), h('button', { class: 'primary', onclick: () => done(G.decide(S, 'stay')) }, 'Stay'))),
        h('div', { class: 'card' }, h('div', { class: 'row' }, h('div', null, h('b', null, d.requested ? 'Trade request on file' : 'Ask for a trade'), h('div', { class: 'small muted' }, d.requested ? 'The front office is shopping you. They will report back at the deadline.' : 'File a request and let them shop you through the season. A request that goes nowhere costs you chemistry.')), h('span', { class: 'spacer' }), d.requested ? null : confirmBtn('File a request', '', () => done(G.decide(S, 'request'))))), h('h3', null, 'Demand a trade (pick a destination)'), d.tradeOptions.map((o) => h('div', { class: 'card' + (o.ok ? '' : ' off') }, h('div', { class: 'row' }, h('div', null, withLogo(o.name.split(' ').slice(-1)[0] === 'Blazers' ? 'Trail Blazers' : (D.TEAMS.find((x) => x.id === o.teamId) || {}).nick, 22, o.name), h('div', { class: 'small muted' }, o.label + ' (' + o.wins + ' wins last year) · you would be a ' + o.role), o.partner ? h('div', { class: 'small' }, 'They send back: ', h('b', null, plink(o.partner.id, o.partner.name)), ' · ' + o.partner.pos + ' · age ' + o.partner.age + ' · ' + o.partner.ovr + ' OVR', o.extra ? ' and ' + o.extra.name + ' (' + o.extra.pos + ', ' + o.extra.age + ', ' + o.extra.ovr + ' OVR)' : '', o.picks ? ' and ' + o.picks : '') : null, o.ok ? null : h('div', { class: 'small bad' }, '✖ ' + o.reason)), h('span', { class: 'spacer' }), o.ok ? h('button', { onclick: () => done(G.decide(S, 'trade', { teamId: o.teamId })) }, 'Request trade') : h('span', { class: 'badge' }, 'Rejected')))), h('p', { class: 'small muted' }, 'A trade is a swap: your club has to be willing to move you and get a comparable player back, and the other side has to agree. Franchise players on winning teams are not traded on request.'));
    }
    out.push(h('div', { class: 'row', style: 'margin-top:14px' }, confirmBtn('Retire from basketball', 'danger', () => { G.retire(S); S.decision = null; go(); })));
    return h('div', null, out);
  }

  function seasonTable(rows, playoffs) {
    const head = playoffs ? ['Season', 'Age', 'Team', 'GP', 'MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'FG%', '3P%', 'TS%', 'TD', 'VS RS', 'FORM', 'RTG'] : ['Season', 'Age', 'Team', 'W-L', 'GP', 'MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'FG%', '3P%', 'FT%', 'TS%', 'TD', 'OVR', 'RTG'];
    const rings = new Set(S.proSeasons.filter((x) => (x.awards || []).includes('NBA Champion')).map((x) => x.label));
    return h('div', { class: 'scroll' }, h('table', null, h('thead', null, h('tr', null, head.map((x, i) => h('th', { class: i === 2 ? 'l' : '' }, x)))),
      h('tbody', null, rows.map((s) => playoffs
        ? h('tr', null, h('td', null, s.label + (rings.has(s.label) ? ' 🏆' : '')), h('td', null, s.age), h('td', { class: 'l' }, s.team), h('td', null, s.gp), h('td', null, f1(s.mins)), h('td', null, f1(s.pts)), h('td', null, f1(s.reb)), h('td', null, f1(s.ast)), h('td', null, f1(s.stl)), h('td', null, f1(s.blk)), h('td', null, pct(s.fgp)), h('td', null, pct(s.tpp)), h('td', null, pct(s.ts)), h('td', null, s.td), h('td', { title: 'Playoff ppg as a share of this season\'s regular-season ppg' }, (() => { const rs = S.proSeasons.find((x) => x.label === String(s.label).replace(' ●', '')); return rs && rs.pts ? '×' + (s.pts / rs.pts).toFixed(2) : '–'; })()), h('td', { title: 'Postseason scoring form: this run\'s scoring multiplier vs the regular season, before game-to-game luck' }, s.form != null ? '×' + s.form.toFixed(2) : '–'), h('td', null, s.rating ? ratingBadge(s.rating, 2) : '–'))
        : h('tr', null, h('td', null, s.label), h('td', null, s.age), h('td', { class: 'l' }, (s.prevTeam ? s.prevTeam.split(' ').slice(-1)[0] + ' → ' : '') + s.team), h('td', null, s.wins + '-' + s.losses), h('td', null, s.gp), h('td', null, f1(s.mins)), h('td', null, f1(s.pts)), h('td', null, f1(s.reb)), h('td', null, f1(s.ast)), h('td', null, f1(s.stl)), h('td', null, f1(s.blk)), h('td', null, pct(s.fgp)), h('td', null, pct(s.tpp)), h('td', null, pct(s.ftp)), h('td', null, pct(s.ts)), h('td', null, s.td), h('td', null, s.ovr), h('td', null, s.avgRating ? ratingBadge(s.avgRating, 2) : '–'))))));
  }
  function careerTotals(ps) {
    if (!ps.length) return null;
    const gp = ps.reduce((a, s) => a + s.gp, 0), tot = (k) => ps.reduce((a, s) => a + s[k] * s.gp, 0);
    const rs = ps.filter((x) => x.avgRating), rgp = rs.reduce((a, x) => a + x.gp, 0), rating = rgp ? rs.reduce((a, x) => a + x.avgRating * x.gp, 0) / rgp : null;
    return { rating, gp, pts: tot('pts') / gp, reb: tot('reb') / gp, ast: tot('ast') / gp, totPts: Math.round(tot('pts')), totReb: Math.round(tot('reb')), totAst: Math.round(tot('ast')), totStl: Math.round(tot('stl')), totBlk: Math.round(tot('blk')), td: CV_TD };
  }
  function playoffTotals(pl) {
    if (!pl.length) return null;
    const gp = pl.reduce((a, s) => a + s.gp, 0), tot = (k) => pl.reduce((a, s) => a + (s[k] || 0) * s.gp, 0);
    const rs = pl.filter((x) => x.rating), rgp = rs.reduce((a, x) => a + x.gp, 0), rating = rgp ? rs.reduce((a, x) => a + x.rating * x.gp, 0) / rgp : null;
    return { rating, gp, pts: tot('pts') / gp, reb: tot('reb') / gp, ast: tot('ast') / gp, stl: tot('stl') / gp, blk: tot('blk') / gp, totPts: Math.round(tot('pts')), totReb: Math.round(tot('reb')), totAst: Math.round(tot('ast')), td: pl.reduce((a, s) => a + (s.td || 0), 0), runs: pl.length };
  }

  const ratingBox = (r, l) => h('div', { class: 'statbox' }, h('div', { class: 'big' }, ratingBadge(r, 2)), h('div', { class: 'lbl' }, l));
  let CV_TD = 0;
  // Career as of the games revealed so far. While a season is being played out, the stored season record (final stats, awards, titles, earnings) is hidden:
  // you see everything up to last season plus this season's line to date.
  function careerView() {
    if (S.stage !== 'season_play' || !S.pre || !S.matchLog) return { ps: S.proSeasons, pl: S.playoffLines, career: S.career, earnings: S.earnings, earnings26: S.earnings26, td: S.career.td };
    const shown = S.matchLog.slice(0, S.matchIdx || 0), cur = S.proSeasons[S.proSeasons.length - 1], ps = S.proSeasons.slice(0, -1), pl = S.playoffLines.slice(0, S.pre.nPlayoff);
    const lineOf = (games, label) => {
      const n = games.length; if (!n) return null; const sum = (k) => games.reduce((a, g) => a + (g[k] || 0), 0), fga = sum('fga'), fta = sum('fta');
      return { label, age: cur.age, team: cur.team, gp: n, mins: sum('m') / n, pts: sum('pt') / n, reb: sum('rb') / n, ast: sum('as') / n, stl: sum('st') / n, blk: sum('bk') / n, fgp: fga ? sum('fgm') / fga : null, tpp: sum('tpa') ? sum('tpm') / sum('tpa') : null, ftp: fta ? sum('ftm') / fta : null, ts: fga + fta ? sum('pt') / (2 * (fga + 0.44 * fta)) : null, td: games.filter((g) => g.tg.includes('Triple-double')).length, ovr: cur.ovr, totPts: sum('pt'), totReb: sum('rb'), totAst: sum('as'), rating: games.reduce((a, g) => a + g.r, 0) / n };
    };
    const regAll = shown.filter((x) => x.k === 'g' && !x.po), reg = regAll.filter((x) => !x.dnp), po = shown.filter((x) => x.k === 'g' && !x.po === false && !x.dnp);
    const live = lineOf(reg, cur.label + ' ●'), lw = regAll.filter((x) => x.w).length;
    if (live || po.length) live && (live.bests = G.seasonBests(shown, cur.label, cur.age));
    if (live) { live.wins = lw; live.losses = regAll.length - lw; live.avgRating = live.rating; ps.push(live); }
    const pLive = lineOf(po, cur.label + ' ●'); if (pLive) pl.push(pLive);
    return { ps, pl, career: S.pre.career, earnings: S.pre.earnings, earnings26: S.pre.earnings26, td: S.pre.career.td + (live ? live.td : 0) };
  }
  // career highs and the best box score of the career, across regular season and playoffs
  function highsSection(ps, live) {
    const all = ps.filter((s) => s.bests); if (!all.length) return null;
    const pickMax = (key, k) => { let b = null; all.forEach((s) => { const g = s.bests[key] && s.bests[key][k]; if (g && (!b || g[({ pts: 'pt', reb: 'rb', ast: 'as', stl: 'st', blk: 'bk' })[k]] > b[({ pts: 'pt', reb: 'rb', ast: 'as', stl: 'st', blk: 'bk' })[k]])) b = g; }); return b; };
    const field = { pts: 'pt', reb: 'rb', ast: 'as', stl: 'st', blk: 'bk' }, names = { pts: 'Points', reb: 'Rebounds', ast: 'Assists', stl: 'Steals', blk: 'Blocks' };
    const where = (g) => (g.h ? 'vs ' : '@ ') + g.o + ' · ' + g.d + ' · ' + String(g.s).replace(' ●', '') + (g.po ? ' · ' + (g.rnd || 'Playoffs') : '');
    const tiles = (key) => h('div', { class: 'grid stats' }, Object.keys(names).map((k) => { const g = pickMax(key, k); return g ? h('div', { class: 'statbox' }, h('div', { class: 'big' }, g[field[k]]), h('div', { class: 'lbl' }, 'Career-high ' + names[k].toLowerCase()), h('div', { class: 'small muted', style: 'margin-top:4px' }, where(g))) : null; }));
    let best = null; all.forEach((s) => ['reg', 'po'].forEach((key) => { const g = s.bests[key] && s.bests[key].best; if (g && (!best || g.r > best.r)) best = g; }));
    const box = best ? h('div', { class: 'card', style: 'margin:10px 0' }, h('div', { class: 'row' }, h('div', null, h('div', { class: 'small caps muted' }, 'Career-best game'), h('div', { class: 'small' }, (best.w ? 'W ' : 'L ') + best.f + '-' + best.a + (best.ot ? ' (OT)' : '') + ' · ' + where(best))), h('span', { class: 'spacer' }), ratingBadge(best.r, 1)),
      h('div', { class: 'tiles4', style: 'margin-top:12px' }, [[best.pt, 'PTS'], [best.rb, 'REB'], [best.as, 'AST'], [(best.pm > 0 ? '+' : '') + (best.pm == null ? 0 : best.pm), '+/-']].map(([v, l]) => h('div', { class: 'tile' }, h('b', null, v), h('span', null, l)))),
      h('p', { class: 'small', style: 'margin-top:10px' }, best.fgm + '/' + best.fga + ' FG · ' + best.tpm + '/' + best.tpa + ' 3PT · ' + best.ftm + '/' + best.fta + ' FT · ' + best.st + ' STL · ' + best.bk + ' BLK · ' + best.to + ' TO · ' + best.m + ' MIN')) : null;
    const hasPo = all.some((s) => s.bests.po);
    return h('div', null, h('h3', null, 'Career highs · regular season'), tiles('reg'), hasPo ? h('div', null, h('h3', null, 'Career highs · playoffs'), tiles('po')) : null, h('h3', null, 'Career-best game'), box);
  }
  function careerBody() {
    const cv = careerView(); CV_TD = cv.td;
    const ps = cv.ps, ct = careerTotals(ps), aw = cv.career.awards;
    const wrap = h('div');
    if (!ct) { wrap.append(h('p', { class: 'muted' }, 'No NBA games yet.'), S.collegeYears.length ? collegeTable() : null); return wrap; }
    wrap.append(h('h3', null, 'Regular season career'), h('div', { class: 'grid stats' }, ct.rating ? ratingBox(ct.rating, 'Avg match rating') : null, statBox(f1(ct.pts), 'PPG'), statBox(f1(ct.reb), 'RPG'), statBox(f1(ct.ast), 'APG'), statBox(ct.totPts.toLocaleString(), 'Total points'), statBox(ct.totReb.toLocaleString(), 'Total rebounds'), statBox(ct.totAst.toLocaleString(), 'Total assists'), statBox(ct.totStl.toLocaleString(), 'Total steals'), statBox(ct.totBlk.toLocaleString(), 'Total blocks'), statBox(ct.gp.toLocaleString(), 'Games'), statBox(ct.td, 'Triple-doubles (' + (100 * ct.td / ct.gp).toFixed(1) + '%)'), statBox(money(cv.earnings), 'Career earnings · ' + money(cv.earnings26 || cv.earnings) + ' in 2026 $')),
      (() => { const pt = playoffTotals(cv.pl); return pt ? h('div', null, h('h3', null, 'Playoff career'), h('div', { class: 'grid stats' }, pt.rating ? ratingBox(pt.rating, 'Playoff avg rating') : null, statBox(f1(pt.pts), 'PPG'), statBox(f1(pt.reb), 'RPG'), statBox(f1(pt.ast), 'APG'), statBox(f1(pt.stl), 'SPG'), statBox(f1(pt.blk), 'BPG'), statBox(pt.gp.toLocaleString(), 'Playoff games'), statBox(pt.totPts.toLocaleString(), 'Playoff points'), statBox(pt.totReb.toLocaleString(), 'Playoff rebounds'), statBox(pt.totAst.toLocaleString(), 'Playoff assists'), statBox(cv.career.titles || 0, 'Championships'))) : null; })(),
      h('div', { style: 'margin-top:8px' }, Object.keys(aw).map((k) => h('span', { class: 'pill gold' }, aw[k] + '× ' + k))),
      h('p', { class: 'muted small' }, 'Seasons averaging a triple-double: ' + cv.career.tdSeasons + (cv.career.td30Seasons ? ' (' + cv.career.td30Seasons + ' with 30+ ppg)' : '')),
      highsSection(ps),
      h('h3', null, 'Regular season'), seasonTable(ps, false));
    if (cv.pl.length) wrap.append(h('h3', null, 'Playoffs'), seasonTable(cv.pl, true));
    if (S.collegeYears.length) wrap.append(h('h3', null, 'College'), collegeTable());
    return wrap;
  }
  function showCareer() {
    const m = document.getElementById('modal');
    m.classList.remove('hidden'); m.replaceChildren(h('div', { class: 'box' }, h('div', { class: 'row' }, h('h2', { style: 'margin:0' }, S.player.name + ' · Career'), h('span', { class: 'spacer' }), h('button', { onclick: () => m.classList.add('hidden') }, 'Close ✕')), careerBody()));
    m.onclick = (e) => { if (e.target === m) m.classList.add('hidden'); };
  }

  // trades, signings and team changes across the whole career
  function movesCard() {
    const mv = (S.log || []).filter((x) => /Traded to|Signed with|Re-signed with|Drafted/.test(x)), tr = S.trades || [];
    const draft = S.draft ? [S.draft.year + ': ' + (S.draft.slot ? 'Drafted #' + S.draft.slot + ' by ' : 'Signed undrafted with ') + S.draft.team] : [];
    const rows = draft.concat(mv.filter((x) => !/^\d+: Drafted/.test(x)));
    return h('div', { class: 'card' }, h('div', { class: 'row' }, h('h2', { style: 'margin:0' }, 'Trades & moves'), h('span', { class: 'spacer' }), h('span', { class: 'badge' }, tr.length + (tr.length === 1 ? ' trade' : ' trades'))),
      tr.length ? h('div', { class: 'scroll', style: 'margin-top:10px' }, h('table', { class: 'st' }, h('thead', null, h('tr', null, ['Season', 'Trade', 'You (ovr)', 'Came back'].map((x) => h('th', { class: 'l' }, x)))), h('tbody', null, tr.map((x) => h('tr', null, h('td', { class: 'l' }, x.label), h('td', { class: 'l' }, x.from + ' → ' + x.to), h('td', { class: 'l' }, 'age ' + x.age + ' · ' + x.ovr), h('td', { class: 'l' }, x.partner)))))) : h('p', { class: 'muted' }, 'You were never traded.'),
      rows.length ? h('div', { class: 'small muted', style: 'margin-top:10px' }, rows.map((x) => h('div', null, x))) : null);
  }
  // retirement is not a cliff: a jersey, a speech, and the next chapter, each once
  function afterCard() {
    const L2 = NBA.Legacy, A = L2.afterlife(S), d = A.done, run = (fn, arg) => { try { fn(S, arg); save(); render(); } catch (e) { console.error(e); } };
    const parts = [];
    if (A.jersey) parts.push(d.jersey ? h('p', { class: 'jmsg good' }, '🎽 The ' + d.jersey.nick + ' raised #' + d.jersey.num + ' to the rafters.') : h('div', { class: 'row' }, h('div', null, h('b', null, '🎽 Jersey retirement'), h('div', { class: 'small muted' }, 'The ' + A.jersey.nick + ' want to retire your number (' + A.jersey.years + ' seasons' + (A.jersey.titles ? ', ' + A.jersey.titles + ' title' + (A.jersey.titles > 1 ? 's' : '') : '') + ').')), h('span', { class: 'spacer' }), h('button', { class: 'primary', onclick: () => run(L2.doJersey) }, 'Attend the ceremony')));
    if (A.hall) parts.push(d.speech ? h('p', { class: 'jmsg good' }, '🏛️ ' + L2.SPEECH[d.speech].text) : h('div', null, h('b', null, '🏛️ Hall of Fame speech'), h('div', { class: 'small muted' }, 'You are going in. What do you say?'), h('div', { class: 'row', style: 'flex-wrap:wrap' }, Object.keys(L2.SPEECH).map((k) => h('button', { title: L2.SPEECH[k].blurb, onclick: () => run(L2.doSpeech, k) }, L2.SPEECH[k].label)))));
    parts.push(d.path ? h('div', null, h('b', null, 'After basketball: ' + L2.PATHS[d.path.key].label), d.path.ms.map((m) => h('div', { class: 'jmsg ' + m.tone, style: 'margin:4px 0' }, 'Age ' + m.age + ': ' + m.text)))
      : h('div', null, h('b', null, 'What comes next?'), h('div', { class: 'small muted' }, 'You are done playing, not done living.'), L2.pathOptions(S).map((o) => h('div', { class: 'row', style: 'margin:6px 0' }, h('div', null, h('b', null, o.label + ' · ' + o.read), h('div', { class: 'small muted' }, o.blurb)), h('span', { class: 'spacer' }), h('button', { class: 'primary', onclick: () => run(L2.startPath, o.key) }, 'Begin'), h('button', { class: 'ghost', onclick: () => run(L2.doPath, o.key) }, 'Skip ahead')))));
    const b = S.brand;
    return h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, 'Life after the game'), b && b.earned ? h('p', { class: 'small muted' }, 'Endorsement career: ' + money(Math.round(b.earned)) + ' earned, peak brand built to ' + Math.round(b.score) + '.') : null, parts);
  }
  // the next chapter: four decisions over the years, each a pop-up, each with a result
  function screenRetired() {
    const pg = screenRetired0(), run = S.after && S.after.run; if (!run) return pg;
    const L2 = NBA.Legacy;
    if (S.afterRes) { const r = S.afterRes; return h('div', null, modal(h('div', null, h('h1', null, r.done ? 'The chapter closes' : 'How it went'), h('div', { class: 'card suspense' }, h('p', { class: 'jmsg ' + r.tone, style: 'margin:0' }, r.text)), h('div', { class: 'row' }, h('button', { class: 'primary big-btn', onclick: () => { S.afterRes = null; save(); render(); } }, r.done ? 'See how it all turned out' : 'Continue →')))), pg); }
    const sp = L2.pathStep(S); if (!sp) return pg;
    return h('div', null, modal(h('div', null, h('h1', null, sp.title), h('p', { class: 'muted' }, sp.pathLabel + ' · age ' + sp.age + ' · decision ' + sp.n + ' of ' + sp.of), h('div', { class: 'card suspense' }, h('p', { style: 'margin:0' }, sp.text)),
      h('div', { class: 'wkgrid' }, sp.options.map((o) => h('div', { class: 'wkcard' }, h('b', null, o.label), h('div', { class: 'small', style: 'margin:6px 0' }, o.blurb), h('div', { class: 'small vibe' }, o.vibe), h('div', { style: 'margin-top:8px' }, h('button', { class: 'primary', onclick: () => { try { S.afterRes = L2.pathAnswer(S, o.key); save(); render(); } catch (e) { console.error(e); } } }, 'Choose'))))))), pg);
  }
  function screenRetired0() {
    const hof = S.hof, p = S.player;
    const mark = NBA.logos && NBA.logos._NBA ? h('div', { class: 'nbahero' }, h('span', null, h('img', { src: NBA.logos._NBA, alt: 'NBA' }))) : null;
    return h('div', null, mark, h('h1', null, p.name + ' retires'),
      h('div', { class: 'card' }, h('div', { class: 'big', style: 'color:' + (hof.hall ? 'var(--gold)' : 'inherit') }, hof.hall ? '🏛️ ' + hof.tier : hof.tier), (() => { const ct = careerTotals(S.proSeasons), pt = playoffTotals(S.playoffLines); return ct && ct.rating ? h('p', null, h('b', null, 'Career avg match rating '), ratingBadge(ct.rating, 2), pt && pt.rating ? h('span', null, '  ·  playoffs ', ratingBadge(pt.rating, 2)) : null) : null; })(),
        h('p', { class: 'muted' }, 'Legacy score ' + hof.score + ' (Hall of Fame line: 85) · ' + S.proSeasons.length + ' seasons · ' + archLabel(p) + ' · hidden ceiling was ' + Math.round(p.ceiling) + ' · ' + S.stars + '★ recruit' + (S.draft && S.draft.slot ? ' · drafted #' + S.draft.slot : ' · undrafted'))),
      (G.canComeback(S) ? (() => { let yrs = 1; return h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, 'Miss it already?'),
        h('p', { class: 'small muted' }, 'Players do come back (ask Jordan). A few years away costs you athleticism and the league moves on, but a famous name still gets a call. You are ' + p.age + (S.farewellAnnounced || S.farewellDone ? '. You told the world it was your farewell, so the fans will be split.' : '.')),
        h('div', { class: 'row' }, h('select', { onchange: (e) => { yrs = +e.target.value; } }, [1, 2, 3].filter((y) => p.age + y <= 42).map((y) => h('option', { value: y }, y + (y === 1 ? ' year away' : ' years away')))), confirmBtn('Come out of retirement', '', () => { G.comeback(S, yrs); go(); }))); })() : null),
      afterCard(), movesCard(), journalCard(40, 'Career journal'),
      h('div', { class: 'card' }, careerBody()),
      h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => { wipe(); S = null; boot(); } }, 'Start a new career')));
  }

  // ------------------------------------------------------------ the trade deadline (decision engine)
  function screenDeadline() {
    const Dc = DEC(), L = S.league, t = L.teams[S.teamId];
    if (!S.dlChecked) { S.dlChecked = true; Dc.offer(S, 'deadline'); save(); }
    if (!(S.dec && S.dec.pending && S.dec.pending.id === 'deadline')) { S.dlDone = true; S.matchIdx++; save(); return 'again'; }
    const v = Dc.view(S), deals = (L.moves || []).filter((m) => m.year === L.year && m.phase === 'deadline');
    const reg = (S.matchLog || []).slice(0, S.matchIdx).filter((x) => x.k === 'g' && !x.po), w = reg.filter((x) => x.w).length;
    const finish = (key, arg) => {
      try { const r = Dc.choose(S, key, arg); S.dlDone = true; S.matchIdx = (S.matchIdx || 0) + 1; S.flash = r.text; save(); if (key !== 'decline') saveSnap(); go(); } catch (e) { console.error(e); S.flash = 'That deal fell through.'; render(); }
    };
    const optCard = (o) => h('div', { class: 'card' }, h('div', { class: 'row' }, logo(o.nick || (D.TEAMS.find((x) => x.id === o.teamId) || {}).nick, 40), h('div', null, h('b', null, o.name), h('div', { class: 'small muted' }, (o.label || '') + (o.role ? ' · you would be a ' + o.role : '')),
      o.partnerName ? h('div', { class: 'small' }, 'They send back: ', h('b', null, o.partnerName), o.extra ? ' and ' + o.extra.name + ' (' + o.extra.pos + ', ' + o.extra.age + ', ' + o.extra.ovr + ' OVR)' : '', o.picks ? ' and send ' + o.picks : '') : null, v.kind === 'waive' ? h('div', { class: 'small' }, 'Minimum contract, rest of the season') : null),
      h('span', { class: 'spacer' }), h('button', { class: 'primary', onclick: () => finish(v.kind === 'waive' ? 'sign' : 'trade', o.teamId) }, v.kind === 'waive' ? 'Sign' : 'Accept trade')));
    const declineLabel = v.kind === 'norequest' ? 'Continue the season' : v.kind === 'request' ? 'Stay with the ' + t.nick : 'Stay put';
    return h('div', null, h('h1', null, 'Trade deadline'), h('p', { class: 'muted' }, t.name + ' · ' + w + '-' + (reg.length - w) + ' through ' + reg.length + ' games'),
      h('div', { class: 'card' + (v.kind === 'waive' ? ' off' : '') }, h('h3', { style: 'margin-top:0' }, v.kind === 'waive' ? 'You have been waived' : v.kind === 'norequest' ? 'No deal for your request' : v.kind === 'request' ? 'Your trade request' : 'Contenders are calling'), h('p', null, v.text)),
      v.options.map(optCard), v.canDecline ? h('div', { class: 'row' }, h('button', { onclick: () => finish('decline') }, declineLabel)) : null,
      deals.length ? h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, 'Around the league'), deals.map((m) => h('div', { class: 'small', style: 'margin:4px 0' }, '• ' + m.text))) : null);
  }

  // ------------------------------------------------------------ the press conference
  // Claude in the artifact: the same page also runs on plain GitHub Pages, where there is no window.claude and the built-in reader does the job
  let samplePromise = null;
  const getSample = () => (samplePromise || (samplePromise = (async () => { try { return window.claude && window.claude.use ? await window.claude.use('sample') : null; } catch (e) { return null; } })()));
  // when this page runs inside Claude, Claude writes the press questions and the answers, the room's reaction, tomorrow's headline and the timeline posts; everywhere else (and whenever Claude is busy) the hand-written banks are used
  let aiOff = 0, feedAiBusy = false, feedAiNone = false;
  async function aiJson(prompt) {
    const sm = await getSample(); if (!sm || Date.now() < aiOff) return null;
    try { return await Promise.race([sm.json(prompt, { modelTier: 'quick', cache: false }), new Promise((_, rej) => setTimeout(() => rej({ code: 'timeout' }), 20000))]); }
    catch (e) { if (e && (e.code === 'rate_limited' || e.code === 'not_granted' || e.code === 'sampling_disabled')) aiOff = Date.now() + 60000; return null; }
  }
  async function aiFeedUpgrade() {
    if (feedAiBusy || feedAiNone || !S || !S.dec || !S.matchLog) return;
    const sm = await getSample(); if (!sm) { feedAiNone = true; return; }
    const items = S.matchLog || [], idx = S.matchIdx || 0, L = S.league, p = S.player, tm = L.teams[S.teamId], cand = [];
    items.slice(0, idx).forEach((g, i) => { if (g.k === 'g' && g.fan && g.fan.length && !g.aiF && !g.aiTry) cand.push({ ref: g, kind: g.fk, at: i, facts: { opponent: g.o, result: (g.w ? 'W ' : 'L ') + g.f + '-' + g.a, home: !!g.h, points: g.pt, rebounds: g.rb, assists: g.as, steals: g.st, blocks: g.bk, fg: g.fgm + '/' + g.fga, playoff: !!g.po, round: g.rnd || null, game: g.n } }); });
    ((S.dec.flags.feed) || []).forEach((e) => { if (e.y === L.year && !e.ai && !e.aiTry && e.kind !== 'press' && (e.at == null || e.at <= idx)) cand.push({ ref: e, kind: e.kind, at: e.at == null ? idx : e.at, facts: e.c || {} }); });
    const todo = cand.sort((a, b) => b.at - a.at).slice(0, 4); if (!todo.length) return;
    feedAiBusy = true; todo.forEach((t) => { t.ref.aiTry = 1; });
    const events = todo.map((t, i) => ({ id: i, kind: t.kind, player: { name: p.name, pos: p.pos, team: tm.name, age: p.age, ovr: Math.round(NBA.ovr(p)) }, facts: t.facts, examples: (t.ref.fan || t.ref.posts || []).slice(0, 2).map((x) => x.text) }));
    const got = NBA.Press.checkClaudeFeed(await aiJson(NBA.Press.claudeFeedPrompt(events)), events); let changed = 0;
    todo.forEach((t, i) => { if (!got[i]) return; const old = t.ref.fan || t.ref.posts || [], likes = old.map((x) => x.likes || 0).sort((a, b) => b - a), hs = NBA.Feed.HANDLES.slice().sort(() => Math.random() - 0.5);
      const posts = got[i].map((text, k) => ({ who: '@' + hs[k % hs.length], text, likes: likes[k] != null ? likes[k] : Math.round(Math.pow(Math.random(), 2) * 8000 + 12), ai: 1 }));
      if (t.ref.fan) { t.ref.fan = posts; t.ref.aiF = 1; } else { t.ref.posts = posts; t.ref.ai = 1; } changed++; });
    feedAiBusy = false; if (changed) { save(); if (!LV && !document.querySelector('.dlg-back') && S && S.stage === 'season_play') render(); }
  }
  const SAMPLE_MSG = { not_granted: 'Claude is switched off for this page, so the built-in reader read you.', rate_limited: 'Claude is busy right now, so the built-in reader read you.', sampling_disabled: 'Claude is unavailable here, so the built-in reader read you.' };
  // what a decision did, shown right on its own page before the games carry on (the text used to land on the season page, a game later than the choice)
  function screenDecResult() {
    const r = S.decResult, sents = String(r.text || '').split(/(?<=[.!?"])\s+(?=[A-Z])/).filter(Boolean);
    return h('div', null, h('h1', null, r.title), r.sub ? h('p', { class: 'muted' }, r.sub) : null,
      h('div', { class: 'card suspense' }, h('div', { class: 'cap2' }, r.cap || 'What happened'), sents.map((x) => h('p', { class: 'jmsg ' + (r.tone || ''), style: 'margin:8px 0' }, x))),
      r.headline ? h('div', { class: 'card' }, h('div', { class: 'cap2' }, '📰 Tomorrow\'s headline'), h('div', { class: 'headline' }, '“' + r.headline.text + '”'), h('div', { class: 'small muted' }, r.headline.outlet)) : null,
      r.react ? h('div', { class: 'card' }, h('div', { class: 'cap2' }, '🎤 The room ✨'), h('p', { class: 'jmsg', style: 'margin:6px 0' }, r.react)) : null,
      r.fans && r.fans.length ? h('div', { class: 'card' }, h('div', { class: 'cap2' }, '📱 The timeline' + (r.ai ? ' ✨' : '')), r.fans.map((f) => h('div', { class: 'fan' }, h('b', null, f.who), ' ' + f.text))) : null,
      r.moods && r.moods.length ? h('div', { class: 'small muted', style: 'margin:6px 0' }, r.moods.map((m) => m.who + ' (' + m.outlet + ') ' + (m.d > 0.15 ? 'liked that' : m.d < -0.15 ? 'was not impressed' : 'took notes') + '.').join(' ')) : null,
      r.persona ? h('div', { class: 'small muted' }, 'Your media image: ', h('b', null, NBA.Reporters.PERSONAS[r.persona].label)) : null,
      h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => { const r0 = S.decResult; S.decResult = null; stopAuto(); if (!(r0 && r0.post)) advanceOne(); save(); go(); } }, S.decResult && S.decResult.post ? 'Back to the season →' : 'Play the game →')));
  }
  function screenPress() {
    const Dc = DEC(), v = Dc.view(S), t = S.league.teams[S.teamId], pd = S.dec.pending;
    const gi = S.matchLog && S.matchLog[pd.ctx.idx], post = pd.ctx.kind === 'post', gno = post && gi ? 'Final: ' + (gi.w ? 'W' : 'L') + ' ' + gi.f + '-' + gi.a + ' ' + (gi.h ? 'vs' : 'at') + ' the ' + gi.o : gi && gi.k === 'g' ? 'Before game ' + gi.n + ' of the season' + (gi.o ? ' · vs the ' + gi.o : '') : pd.ctx.why;
    const finish = (r) => { if (!(S.dec.pending && S.dec.pending.id === 'press')) { S.decResult = { title: 'Press conference', sub: t.name + ' · ' + gno, text: r.text, tone: r.tone === 'good' ? 'good' : r.tone === 'bad' ? 'bad' : '', cap: 'The reaction', post, headline: r.headline, fans: r.fans, moods: r.moods, persona: r.persona }; saveSnap(); } save(); go(); };
    const act = (key, arg) => { try { const ctx0 = pd.ctx, facts0 = key === 'pick' ? null : G.pressFacts(S, ctx0), r = Dc.choose(S, key, arg); finish(r); if (r && r.done && facts0) aiReact(ctx0, facts0); } catch (e) { console.error(e); } };
    const skipBar = h('div', { class: 'row', style: 'margin-top:10px' }, h('button', { class: 'ghost tiny', onclick: () => { S.noPress = true; try { Dc.autoResolve(S); } catch (e) { console.error(e); } save(); go(); } }, 'Skip press conferences from now on'), h('span', { class: 'small muted' }, 'You can switch them back on under the season controls.'));
    const persona = h('div', { class: 'small muted' }, 'Your media image: ', h('b', null, v.persona.label), ' · ' + v.persona.blurb);
    const rep = (r) => (r ? r.name + ' · ' + r.outlet : 'The press room');
    const SRC = { mem: 'Your story', callback: 'You said it', feud: 'The feud', post: 'The game', bank: '' };
    if (v.phase === 'pick') {
      const aiNote = h('div', { class: 'small muted pressnote' }, '');
      maybeAiQuestions(pd, aiNote);
      return h('div', null, h('h1', null, 'Press conference'), h('p', { class: 'muted' }, t.name + ' · ' + v.why + (gno && gno !== v.why ? ' · ' + gno : '')),
        pd.log.length ? h('div', { class: 'jlog' }, pd.log.map((x) => h('div', { class: 'jmsg' }, x.text.charAt(0) === '\uD83D' ? x.text : '🎤 ' + x.text))) : null,
        h('div', { class: 'card suspense' }, h('div', { class: 'cap2' }, 'Pick your question · ' + (v.taken + 1) + ' of ' + v.take), h('p', { class: 'small muted', style: 'margin:6px 0' }, 'Reporters are shouting. You can take ' + (v.take - v.taken) + (v.take - v.taken === 1 ? ' question' : ' questions') + ' and the rest get ignored (they will remember).'), persona, aiNote),
        h('div', { class: 'wkgrid' }, v.candidates.map((c) => h('div', { class: 'wkcard qcard' + (c.heat >= 2 ? ' spicy' : '') }, h('div', { class: 'small muted' }, rep(c.reporter), (SRC[c.src] || c.ai) ? h('span', { class: 'badge', style: 'margin-left:8px' }, SRC[c.src] || (c.reporter && c.reporter.fresh ? 'New voice' : 'Fresh question')) : null), h('div', { style: 'margin:8px 0' }, '“' + c.text + '”'), h('button', { class: 'primary', onclick: () => act('pick', c.idx) }, 'Take this one')))),
        skipBar, autoDecBar());
    }
    const q = pd.ctx.pool[pd.ctx.cur];
    // your own words: read by Claude when this page runs inside Claude, by the built-in reader everywhere else; either way they come out as one of the six tones
    const ta = h('textarea', { class: 'pressbox', rows: 3, maxlength: 240, placeholder: 'Or say it your own way… (up to 240 characters)' }), count = h('span', { class: 'small muted' }, '0 / 240'), note = h('div', { class: 'small muted pressnote' }, '');
    const go2 = h('button', { class: 'primary', disabled: true }, 'Say it');
    ta.oninput = () => { count.textContent = ta.value.length + ' / 240'; go2.disabled = !ta.value.trim(); };
    getSample().then((sm) => { if (sm) note.textContent = '✨ The reporters in this room are Claude: they will react to exactly what you type.'; else note.textContent = 'The reporters read your answer for tone: trash talk, humility, jokes, heat.'; });
    go2.onclick = async () => {
      const text = ta.value.trim(); if (!text) return; go2.disabled = true; ta.disabled = true; note.textContent = 'The reporters are reacting…';
      const c = pd.ctx.c, local = NBA.Press.readTyped(text, c, q); let res = null;
      const sm = await getSample();
      if (sm) {
        try { res = NBA.Press.checkClaude(await sm.json(NBA.Press.claudePrompt(text, c, q, pd.ctx.why), { modelTier: 'quick', cache: false }), local); }
        catch (e) { note.textContent = SAMPLE_MSG[e && e.code] || 'Claude could not read that one, so the built-in reader did.'; }
      }
      if (!res) res = local;
      // the built-in reader is the safety net: if Claude calls a flat answer a fight or the other way round by a wide margin the sim still follows the tone Claude picked (it read the words), but profanity the reader saw is never lost
      if (local.profane && !res.profane) res.profane = true; if (local.badmouth && !res.badmouth) res.badmouth = true;
      try { finish(Dc.choose(S, 'typed', Object.assign({ text }, res))); } catch (e) { console.error(e); ta.disabled = false; go2.disabled = false; note.textContent = 'That one did not go through. Try again.'; }
    };
    return h('div', null, h('h1', null, 'Press conference'), h('p', { class: 'muted' }, t.name + ' · ' + v.why + (gno && gno !== v.why ? ' · ' + gno : '')),
      pd.log.length ? h('div', { class: 'jlog' }, pd.log.map((x) => h('div', { class: 'jmsg' }, x.text.charAt(0) === '\uD83D' ? x.text : '🎤 ' + x.text))) : null,
      h('div', { class: 'card suspense' }, h('div', { class: 'cap2' }, 'Question ' + (v.step + 1) + ' of ' + v.total + ' · ' + rep(v.reporter)), h('h2', { style: 'margin:8px 0' }, '“' + v.question + '”'), persona),
      h('div', { class: 'wkgrid' }, v.options.map((o) => h('div', { class: 'wkcard' + (o.spicy ? ' spicy' : '') }, h('b', null, o.label), h('div', { class: 'small', style: 'margin:6px 0' }, o.line), h('div', { style: 'margin-top:8px' }, h('button', { class: o.spicy ? '' : 'primary', onclick: () => act(o.key) }, 'Say it'))))),
      h('div', { class: 'card' }, h('b', null, 'Say it in your own words'), ta, h('div', { class: 'row', style: 'margin-top:8px' }, go2, count), note),
      skipBar, autoDecBar());
  }
  // the artifact's reporters are Claude: fresh questions written from this moment (what is at stake, what you said before). Anywhere else the bank is used.
  let aiBusy = false;
  const HANDLES = ['hoopsbrain', 'courtside_carl', 'dimes_n_dubs', 'bucketsonly', 'fadeaway.fm', 'the_sixth_man', 'ankle_breaker99', 'paint_patrol', 'zone_defense_dan', 'twoway_tay'];
  // the reporters' reaction to the answers you gave (button answers; your own words are already read by Claude)
  async function aiReact(ctx, facts) {
    if (!(await getSample())) return;
    const picks = ctx.chosen.map((ix, k) => ({ asked: (ctx.pool[ix] || {}).text, tone: (ctx.picks[k] || {}).tone, said: (ctx.picks[k] || {}).text })).filter((x) => x.asked);
    const got = NBA.Press.checkClaudeReact(await aiJson(NBA.Press.claudeReactPrompt(facts, picks))); if (!got) return;
    const r = S.decResult; if (!r || r.title !== 'Press conference') return;
    const hs = HANDLES.slice().sort(() => Math.random() - 0.5), fans = got.fans.map((text, k) => ({ who: '@' + hs[k % hs.length], text, likes: Math.round(Math.pow(Math.random(), 2) * 9000 + 20), ai: 1 }));
    r.headline = Object.assign({ outlet: 'The Wire' }, r.headline || {}, { text: got.headline }); if (fans.length) r.fans = fans; r.react = got.reaction; r.ai = 1;
    G.patchPressAI(S, got.headline, fans); save(); if (S.decResult === r && !LV) render();
  }
  // the artifact's reporters are Claude: every generic question is written fresh for this moment (what is at stake, what you said before), the questions tied to your story get Claude's answers
  function maybeAiQuestions(pd, noteEl) {
    const ctx = pd.ctx; if (ctx.aiDone || aiBusy) return;
    getSample().then(async (sm) => {
      if (!sm) { ctx.aiDone = true; return; }
      aiBusy = true; noteEl.textContent = '✨ The reporters in this room are Claude: they are writing fresh questions for this moment…';
      try {
        const facts = G.pressFacts(S, ctx), cast = facts.cast, gen = ctx.pool.filter((q) => q.src === 'bank' || q.src === 'post'), story = ctx.pool.filter((q) => q.src !== 'bank' && q.src !== 'post' && !q.ai);
        const want = Math.max(2, Math.min(4, gen.length || 3)), T = NBA.Press.TONES, team = S.league.teams[S.teamId], R = NBA.Reporters, pr = (DEC().state(S).flags.pr || { rep: {} });
        const jobs = [aiJson(NBA.Press.claudeQuestionsPrompt(facts, want))];
        const sq = story.map((q, k) => ({ id: 'q' + k, text: q.text, heat: q.heat || 0 }));
        if (sq.length) jobs.push(aiJson(NBA.Press.claudeAnswersPrompt(facts, sq)));
        const [qr, ar] = await Promise.all(jobs);
        const mk = (x, calmN, spicyOk) => { const spicy = spicyOk ? ['trash', 'fight'].filter((k) => x[k]) : [], calm = ['humble', 'confident', 'joke', 'deflect'].sort(() => Math.random() - 0.5).slice(0, spicy.length ? 2 : calmN); return calm.concat(spicy).map((k) => ({ key: k, label: T[k].label, line: '“' + x[k] + '”', spicy: k === 'trash' || k === 'fight' })); };
        const got = NBA.Press.checkClaudeQuestions(qr, cast);
        const fresh = got.slice(0, want).map((q, k) => { const cand = { i: 4000 + k, topic: 'ai', heat: q.heat, text: q.text, src: 'ai', ai: true, opts: mk(q.answers, 3, true) }; cand.reporter = q.reporter ? { id: q.reporter.name, name: q.reporter.name, outlet: q.reporter.outlet, style: q.reporter.style, fresh: !!q.reporter.fresh } : R.reporterFor(team, cand, pr.rep, Math.random); return cand; });
        const ans = ar ? NBA.Press.checkClaudeAnswers(ar, sq) : {};
        if (ctx.cur == null && !ctx.chosen.length) {
          story.forEach((q, k) => { const a = ans['q' + k]; if (a) { q.opts = mk(a, 3, true); q.ai = true; if (a._q) q.text = a._q; } });
          if (fresh.length) ctx.pool = ctx.pool.filter((q) => q.src !== 'bank' && q.src !== 'post').concat(fresh);
        }
        noteEl.textContent = '';
      } catch (e) { noteEl.textContent = SAMPLE_MSG[e && e.code] || ''; }
      aiBusy = false; ctx.aiDone = true; save(); render();
    });
  }

  // ------------------------------------------------------------ playoff approach and clutch moments (decision engine)
  const autoDecBar = () => h('label', { class: 'small muted autodec' }, h('input', { type: 'checkbox', checked: !!S.autoDec, onchange: (e) => { S.autoDec = e.target.checked; save(); } }), ' Let the coach make these calls for the rest of the season');
  function screenSeries() {
    const Dc = DEC(), v = Dc.view(S), t = S.league.teams[S.teamId];
    const pick = (key) => { try { Dc.choose(S, key); save(); saveSnap(); go(); } catch (e) { console.error(e); } };
    return h('div', null, h('h1', null, v.round), h('p', { class: 'muted' }, t.name + ' vs the ' + v.opp + (v.oppWins != null ? ' (' + v.oppWins + ' wins)' : '') + (v.g7 ? '' : '')),
      h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, 'How do you want to approach this series?'),
        h('p', { class: 'small muted' }, (v.rival ? '🔥 Rivalry series: ' + v.rival + ' is on the other side. ' : '') + (v.oppStar ? 'Their best player: ' + v.oppStar + '. ' : '') + 'Your supporting cast averages ' + v.support + ' OVR; you are ' + v.mine + '. Every approach has a price: nothing here is free.'),
        h('div', { class: 'wkgrid' }, v.options.map((o) => h('div', { class: 'wkcard' }, h('b', null, o.label), h('div', { class: 'small', style: 'margin:6px 0' }, o.blurb), o.fit ? h('div', { class: 'small vibe' }, o.fit) : null, h('div', { style: 'margin-top:8px' }, h('button', { class: o.key === 'balanced' ? '' : 'primary', onclick: () => pick(o.key) }, o.key === 'balanced' ? 'Stay balanced' : 'Choose')))))),
      autoDecBar());
  }
  function screenInjury() {
    const Dc = DEC(), v = Dc.view(S), t = S.league.teams[S.teamId];
    const pick = (key) => { try { const r = Dc.choose(S, key); S.decResult = { title: 'Injury', sub: t.name + ' · ' + v.name, text: r.text, tone: r.tone === 'good' ? 'good' : r.tone === 'bad' ? 'bad' : '', cap: 'Your rehab plan', post: true }; saveSnap(); save(); go(); } catch (e) { console.error(e); } };
    return h('div', null, h('h1', null, 'Injury'), h('p', { class: 'muted' }, t.name + ' · ' + v.name),
      h('div', { class: 'card suspense' }, h('div', { class: 'cap2' }, v.major ? 'A major injury' : 'You are hurt'), h('h2', { style: 'margin:6px 0' }, 'A ' + v.name + ': about ' + v.games + ' games out.'), h('p', { class: 'small muted' }, v.major ? 'This is the kind of injury that ends seasons and sometimes the burst that made you special. How you come back matters.' : 'The medical staff has a timeline. How you handle it is up to you.')),
      h('div', { class: 'wkgrid' }, v.options.map((o) => h('div', { class: 'wkcard' }, h('b', null, o.label), h('div', { class: 'small', style: 'margin:6px 0' }, o.blurb), h('div', { class: 'small vibe' }, o.risk), h('div', { style: 'margin-top:8px' }, h('button', { class: 'primary', onclick: () => pick(o.key) }, 'Choose'))))),
      autoDecBar());
  }
  // ------------------------------------------------------------ the live game
  // A game from the season log replayed as it happens. The result is already in the log: the play-by-play is laid out to match it (NBA.Live), the clock only reveals it.
  // The last-possession call is made here, inside the game, only when you choose to watch live; simmed games keep the old clutch screen.
  let LV = null, bulk = false;
  const LIVE_SPEEDS = [[24, 'Max · 2 min'], [12, '4 min'], [6, '8 min'], [1, 'Real time']];
  const LV_COLS = [['pt', 'PTS'], ['rb', 'REB'], ['as', 'AST'], ['st', 'STL'], ['bk', 'BLK'], ['to', 'TO'], ['pf', 'PF']];
  function liveStop() { if (LV && LV.timer) { clearInterval(LV.timer); LV.timer = null; } }
  function liveSkipHdrs() { const items = S.matchLog; while (items[S.matchIdx] && items[S.matchIdx].k === 'hdr' && !(items[S.matchIdx].dl && !S.dlDone) && items[S.matchIdx].ps == null && !items[S.matchIdx].asw) S.matchIdx++; }
  function startLive() {
    stopAuto(); const items = S.matchLog;
    if (holdAt()) { render(); return; }
    liveSkipHdrs(); if (holdAt()) { render(); return; }
    const it = items[S.matchIdx];
    if (!it || it.k !== 'g' || it.dnp) { advanceOne(); save(); render(); return; }
    const idx = S.matchIdx, L = S.league, p = S.player, tm = L.teams[S.teamId], opT = L.teams.find((x) => x.nick === it.o), Dc = DEC();
    let clutch = null;
    if (it.cl && !it.cd) { if (!(S.dec && S.dec.pending && S.dec.pending.id === 'clutch')) Dc.offer(S, 'clutch'); if (S.dec && S.dec.pending && S.dec.pending.id === 'clutch') clutch = { text: G.clutchInfo(S).text }; else it.cd = 1; }
    const ctxL = { key: (S.seasonSeed || 0) + '|' + it.n + '|' + (it.po ? 1 : 0), me: p.name, nick: tm.nick, oppNick: it.o, mates: NBA.rosterOf(L, tm).filter((q) => q.id !== 'user').map((q) => q.name), opps: opT ? NBA.rosterOf(L, opT).map((q) => q.name) : [], shots: it.sh || G.shotsFor(it, p, G.shotSeed(S, idx)), clutch  };
    ctxL.mkShots = (rem) => G.shotsFor(rem, p, G.shotSeed(S, 8000 + idx + 17 * ((ctxL._n = (ctxL._n || 0) + 1))));
    if (clutch) G.clutchLock(S, idx);
    const tl = NBA.Live.build(it, ctxL);
    LV = { idx, it, tl, evs: tl.events, i: 0, t: 0, speed: S.liveSpeed || 12, state: 'play', box: NBA.Live.blank(), sc: [0, 0], per: [], pts: {}, opp: {}, feed: [], shots: [], res: null, end: tl.end, lim: tl.pause != null ? tl.pause : tl.end, timer: null, run: true, newFeed: [] };
    LV.ctx = ctxL; LV.noDec = !!(clutch && it.g7); LV.cpDone = {};   // (a Game 7 with a call can rebuild the series, which would throw earlier decisions away: only the final call there)
    LV.lim = liveLim(); liveCheckCp(); render(); liveRun();
  }
  // the next place the game stops: a decision coming up, the last possession, or the buzzer
  function liveLim() { const A = LV, Lv = NBA.Live, base = A.res ? A.end : (A.tl.pause != null ? A.tl.pause : A.tl.end), cp = A.noDec ? null : Lv.CPS.find((c) => !A.cpDone[c.id] && c.t < (A.tl.clutch ? A.tl.limit - 30 : A.tl.end) && c.t >= 0); return cp ? Math.min(cp.t, base) : base; }
  function liveMins() { const A = LV, w = A.tl.W; return w ? A.tl.m * Math.min(1, NBA.Live.secOn(A.tl.win, A.t) / w) : 0; }
  // a decision is due when the clock reaches its time: the game stops and the pop-up asks (a spot that does not apply to this game, like foul trouble with no fouls, is skipped)
  function liveCheckCp() {
    const A = LV, Lv = NBA.Live; if (A.state !== 'play') return false;
    for (const c of (A.noDec ? [] : Lv.CPS)) { if (A.cpDone[c.id] || c.t > A.t || (A.tl.clutch && c.t >= A.tl.limit - 30)) continue; A.cpDone[c.id] = true; const spec = Lv.checkpointSpec(c.id, A.tl, { box: A.box, sc: A.sc }, A.it); if (!spec) continue;
      if (S.autoDec) { const o = spec.options.find((x) => /^(Steady|Balanced|Safe|Hot hand)/.test(x.vibe)) || spec.options[0]; liveCp(spec, o.key); return false; }
      A.spec = spec; A.state = 'cp'; liveStop(); return true; }
    return false;
  }
  function liveCp(spec, key) {
    const A = LV, Lv = NBA.Live; if (!A) return;
    try {
      const r = G.liveDecision(S, A.idx, spec.id, key, { box: Object.assign({}, A.box), sc: A.sc.slice(), mins: liveMins() }); A.it = S.matchLog[A.idx];
      Lv.replan(A.tl, A.t, A.it, A.ctx, spec.id); A.evs = A.tl.events; const ni = A.evs.findIndex((e) => e.t > A.t); A.i = ni < 0 ? A.evs.length : ni;
      A.newFeed.push({ e: { side: 'n', k: 'note', text: spec.title + ': ' + r.text, hl: true }, ck: Lv.clockOf(A.t, 1e9) });
      A.spec = null; A.state = 'play'; A.lim = liveLim(); save(); if (A.refs) paintLive(); if (!S.autoDec || true) { render(); liveRun(); }
    } catch (e) { console.error(e); }
  }
  function liveRun() { liveStop(); if (!LV || LV.state !== 'play' || !LV.run) return; LV.timer = setInterval(() => { if (!LV || LV.state !== 'play') { liveStop(); return; } LV.t = Math.min(LV.t + 0.1 * LV.speed, LV.lim); liveFlush(); }, 100); }
  function liveApply(e) {
    const A = LV, p = NBA.Live.periodOf(Math.min(e.t, NBA.Live.REG + NBA.Live.OTLEN * 3)); A.per[p] = A.per[p] || [0, 0];
    if (e.d) for (const k in e.d) A.box[k] = (A.box[k] || 0) + e.d[k];
    if (e.tm) { A.sc[0] += e.tm; A.per[p][0] += e.tm; } if (e.op) { A.sc[1] += e.op; A.per[p][1] += e.op; }
    if (e.who && e.whoPts) { const m = e.side === 'opp' ? A.opp : A.pts; m[e.who] = (m[e.who] || 0) + e.whoPts; }
    if (e.shot) A.shots.push(e.shot);
    A.newFeed.push({ e, ck: e.k === 'end' ? 'Final' : NBA.Live.clockOf(e.t, 1e9) });
  }
  function liveFlush() {
    const A = LV; while (A.i < A.evs.length && A.evs[A.i].t <= A.t) liveApply(A.evs[A.i++]);
    if (A.state === 'play' && A.t >= A.lim) {
      if (liveCheckCp()) { render(); return; }
      A.lim = liveLim();   // a spot that did not apply to this game: on to the next stop
      if (A.t >= A.lim) {
        if (A.tl.pause != null && !A.res) { A.state = 'call'; liveStop(); if (S.autoDec) { const w = S.dec.pending.ctx._win; liveDecide(Object.keys(w).sort((x, y) => w[y] - w[x])[0]); return; } render(); return; }
        if (A.i >= A.evs.length) { A.state = 'done'; liveStop(); render(); return; }
      }
    }
    if (A.refs) paintLive();
  }
  function liveDecide(key) {
    const A = LV, Dc = DEC(); if (!A || A.state !== 'call') return;
    try {
      const r = Dc.choose(S, key), it1 = S.matchLog[A.idx], ext = NBA.Live.ending(A.tl, it1, { key, wins: !!it1.w, text: r.text });
      A.res = { r, key, wins: !!it1.w }; A.it = it1; A.evs = A.evs.concat([{ t: A.tl.pause + 1, seq: -1, side: 'n', k: 'note', text: r.text, hl: true }], ext.events); A.evs = A.evs.slice(0, A.i).concat(A.evs.slice(A.i).sort((x, y) => x.t - y.t || x.seq - y.seq));
      A.end = ext.end; A.state = 'play'; A.lim = liveLim(); save(); render(); liveRun();
    } catch (e) { console.error(e); }
  }
  function liveSkip() { const A = LV; if (!A || A.state !== 'play') return; const GE = A.tl.clutch ? NBA.Live.REG : A.tl.end; A.t = Math.min(A.lim, GE - A.t > 600 ? A.t + 600 : GE); liveFlush(); }
  function liveFinish() { const idx = LV.idx; liveStop(); LV = null; S.matchIdx = idx + 1; liveSkipHdrs(); save(); render(); window.scrollTo(0, 0); }
  function screenLive() {
    const A = LV, Lv = NBA.Live, it = A.it, tl = A.tl, p = S.player, t = S.league.teams[S.teamId], Dc = DEC(), GE = tl.clutch ? Lv.REG : tl.end;
    const nP = 4 + (tl.ot ? 1 : 0), per = (i) => (A.per[i] || [0, 0]), refs = (A.refs = { q: [], box: {}, ld: {} });
    const mk = (cls, txt) => h('span', { class: cls || '' }, txt == null ? '' : String(txt));
    const scoreSide = (nick, cap, key) => h('div', { class: 'lvteam' }, logo(nick, 46), h('b', null, nick), h('div', { class: 'small muted' }, cap), (refs[key] = h('div', { class: 'lvscore' }, '0')));
    const board = h('section', { class: 'panel lvboard' }, h('div', { class: 'row chips2', style: 'justify-content:center' }, h('span', { class: 'cp' }, h('i', { class: 'live' }), A.state === 'done' ? 'FINAL' : 'LIVE'), h('span', { class: 'cp plain' }, it.po ? (it.rnd || 'Playoffs') + ' · Game ' + it.n : 'Game ' + it.n + ' · ' + it.d), h('span', { class: 'cp plain' }, it.ar || '')),
      h('div', { class: 'lvbar' }, scoreSide(t.nick, it.h ? 'Home' : 'Away', 'us'), h('div', null, (refs.clock = h('div', { class: 'lvclock' }, '')), h('div', { class: 'small muted' }, p.name + ' · ' + p.pos)), scoreSide(it.o, it.h ? 'Away' : 'Home', 'them')));
    const qrow = (label, idx) => { const cells = []; for (let i = 0; i < nP; i++) cells.push(h('td', null, (refs.q[idx * 10 + i] = h('span', null, '–')))); return h('tr', null, h('th', null, label), cells, h('td', null, h('b', null, (refs.q[idx * 10 + 9] = h('span', null, '0'))))); };
    const qtab = h('table', { class: 'lvq' }, h('tr', null, h('th', null, ''), Array.from({ length: nP }, (_, i) => h('th', null, i < 4 ? 'Q' + (i + 1) : 'OT')), h('th', null, 'T')), qrow(t.nick, 0), qrow(it.o, 1));
    const bx = (k, lbl) => h('div', null, h('b', null, (refs.box[k] = mk('', 0))), h('span', { class: 'small muted' }, lbl));
    const box = h('section', { class: 'panel' }, h('div', { class: 'ph' }, h('span', { class: 'pi' }, '☰'), h('h2', null, p.name + ' · live box score')),
      h('div', { class: 'lvbox' }, h('div', null, h('b', null, (refs.box.min = mk('', '0'))), h('span', { class: 'small muted' }, 'MIN')), LV_COLS.map(([k, l]) => bx(k, l))),
      h('div', { class: 'row small muted', style: 'justify-content:space-around;margin-top:8px' }, h('span', null, 'FG ', (refs.box.fg = mk('', '0/0'))), h('span', null, '3PT ', (refs.box.tp = mk('', '0/0'))), h('span', null, 'FT ', (refs.box.ft = mk('', '0/0')))),
      h('div', { style: 'margin-top:10px' }, qtab),
      h('div', { class: 'lvlead small' }, h('div', null, h('b', null, t.nick + ' scoring'), (refs.ld.us = h('div', { class: 'muted' }, ''))), h('div', null, h('b', null, it.o + ' scoring'), (refs.ld.them = h('div', { class: 'muted' }, '')))));
    const feed = h('section', { class: 'panel' }, h('div', { class: 'ph' }, h('span', { class: 'pi' }, '▶'), h('h2', null, 'Play-by-play')), (refs.feed = h('div', { class: 'lvfeed' })));
    const court = h('section', { class: 'panel' }, h('div', { class: 'ph' }, h('span', { class: 'pi' }, '◎'), h('h2', null, 'Shots tonight')), (refs.court = h('div', { class: 'courtwrap well lvcourt' })));
    // controls
    const remainToEnd = GE - A.t, ctl = h('div', { class: 'simbar well lvctl' });
    if (A.state === 'play') {
      ctl.append(h('button', { class: 'primary', onclick: () => { A.run = !A.run; if (A.run) liveRun(); else liveStop(); render(); } }, A.run ? 'Pause' : 'Play'),
        h('div', { class: 'speed' }, h('span', null, 'SPEED'), LIVE_SPEEDS.map(([v, l]) => h('button', { class: A.speed === v ? 'on' : '', onclick: () => { A.speed = v; S.liveSpeed = v; save(); render(); if (A.run) liveRun(); } }, l))),
        h('button', { class: 'ghost', onclick: () => liveSkip() }, remainToEnd > 600 ? '⏩ Skip 10 min' : A.lim < GE ? '⏭ Skip to the next decision' : '⏭ Skip to the end'));
    }
    let panel = null;
    let pop = null;
    if (A.state === 'call') {
      const v = Dc.view(S);
      pop = modal(h('div', null, h('h1', null, tl.clutch && it.g7 ? 'Game 7' : 'Last possession'), h('div', { class: 'card suspense' }, h('div', { class: 'cap2' }, tl.clutch && it.g7 ? 'Winner moves on' : 'Everything on one possession'), h('h2', { style: 'margin:6px 0' }, v.text), h('p', { class: 'small muted' }, 'The coach looks at you. What do you do?')),
        h('div', { class: 'wkgrid' }, v.opts.map((o) => h('div', { class: 'wkcard' }, h('b', null, o.label), h('div', { class: 'small', style: 'margin:6px 0' }, o.blurb), h('div', { class: 'small vibe' }, o.vibe), h('div', { style: 'margin-top:8px' }, h('button', { class: 'primary', onclick: () => liveDecide(o.key) }, 'Do it'))))), autoDecBar()));
    }
    if (A.state === 'cp' && A.spec) {
      const sp = A.spec, sc = A.sc;
      pop = modal(h('div', null, h('h1', null, sp.title), h('p', { class: 'muted' }, NBA.Live.clockOf(A.t, 1e9) + ' · ' + t.nick + ' ' + sc[0] + ', ' + it.o + ' ' + sc[1]), h('div', { class: 'card suspense' }, h('p', { style: 'margin:0' }, sp.text)),
        h('div', { class: 'wkgrid' }, sp.options.map((o) => h('div', { class: 'wkcard' }, h('b', null, o.label), h('div', { class: 'small', style: 'margin:6px 0' }, o.blurb), h('div', { class: 'small vibe' }, o.vibe), h('div', { style: 'margin-top:8px' }, h('button', { class: 'primary', onclick: () => liveCp(sp, o.key) }, 'Do it'))))), autoDecBar()));
    }
    if (A.state === 'done') {
      const fin = A.it, won = !!fin.w;
      panel = h('section', { class: 'panel' }, h('div', { class: 'card suspense' }, h('div', { class: 'cap2' }, won ? 'Final · win' : 'Final · loss'), h('h2', { style: 'margin:6px 0' }, t.nick + ' ' + fin.f + ', ' + fin.o + ' ' + fin.a + (fin.ot ? ' (OT)' : '')), h('p', null, p.name + ': ' + fin.pt + ' pts, ' + fin.rb + ' reb, ' + fin.as + ' ast on ' + fin.fgm + '/' + fin.fga + ' shooting. Match rating ', ratingBadge(fin.r || 6, 1))),
        h('div', { class: 'row' }, h('button', { class: 'primary big-btn', onclick: liveFinish }, 'Continue →')));
    }
    const out = h('div', null, pop, board, ctl, panel, h('div', { class: 'lvgrid' }, box, feed), court);
    setTimeout(() => { paintLive(true); }, 0);
    return out;
  }
  function paintLive(full) {
    const A = LV; if (!A || !A.refs) return; const R = A.refs, Lv = NBA.Live, b = A.box, tl = A.tl, nP = 4 + (tl.ot ? 1 : 0);
    if (!R.us || !R.us.isConnected) return;
    R.us.textContent = A.sc[0]; R.them.textContent = A.sc[1]; R.clock.textContent = A.state === 'done' ? 'Final' : Lv.clockOf(A.t, 1e9);
    for (let r = 0; r < 2; r++) { let tot = 0; for (let i = 0; i < nP; i++) { const c = R.q[r * 10 + i]; if (!c) continue; const pr = A.per[i]; c.textContent = pr ? pr[r] : '–'; tot += pr ? pr[r] : 0; } R.q[r * 10 + 9].textContent = A.sc[r]; }
    const GE = tl.clutch ? Lv.REG : tl.end, sec = Math.min(Lv.secOn(tl.win, A.t), tl.W), mins = tl.W ? tl.m * Math.min(1, sec / tl.W) : 0;
    R.box.min.textContent = A.state === 'done' ? tl.m : Math.floor(mins) + ':' + String(Math.floor((mins % 1) * 60)).padStart(2, '0');
    LV_COLS.forEach(([k]) => (R.box[k].textContent = b[k])); R.box.fg.textContent = b.fgm + '/' + b.fga; R.box.tp.textContent = b.tpm + '/' + b.tpa; R.box.ft.textContent = b.ftm + '/' + b.fta;
    const lead = (m, meName) => Object.keys(m).map((k) => [k, m[k]]).concat(meName ? [[meName, b.pt]] : []).sort((x, y) => y[1] - x[1]).slice(0, 4).map((x) => x[0].split(' ').slice(-1)[0] + ' ' + x[1]).join(' · ');
    R.ld.us.textContent = lead(A.pts, S.player.name); R.ld.them.textContent = lead(A.opp, null);
    if (A.newFeed.length || full) {
      const fresh = A.newFeed.splice(0); if (full) { A.feed = A.feed || []; }
      fresh.forEach((f) => { const row = h('div', { class: 'lvrow ' + (f.e.side === 'me' ? 'me' : f.e.side === 'opp' ? 'opp' : '') + (f.e.hl ? ' hl' : '') }, h('span', { class: 'ck' }, f.ck), h('span', null, f.e.text)); A.feedRows = A.feedRows || []; A.feedRows.unshift(row); });
      if (A.feedRows) { A.feedRows.length = Math.min(A.feedRows.length, 60); R.feed.replaceChildren(...A.feedRows.slice(0, 18)); }
      const ZT = []; const rad = 5, arm = 4;
      R.court.replaceChildren(svgEl('<svg viewBox="0 0 500 470" class="court">' + COURT + A.shots.map((d) => d.made ? '<circle cx="' + d.x + '" cy="' + d.y + '" r="' + rad + '" fill="#fff"/>' : '<g stroke="rgba(255,255,255,.55)" stroke-width="1.6"><line x1="' + (d.x - arm) + '" y1="' + (d.y - arm) + '" x2="' + (d.x + arm) + '" y2="' + (d.y + arm) + '"/><line x1="' + (d.x + arm) + '" y1="' + (d.y - arm) + '" x2="' + (d.x - arm) + '" y2="' + (d.y + arm) + '"/></g>').join('') + '</svg>'));
    }
  }

  // ------------------------------------------------------------ All-Star Weekend
  function screenAllStar() {
    const AS = NBA.AllStar, v = AS.view(S), R = v.roster, f = S.dec.flags.asw;
    const step = (key) => { try { AS.answer(S, key); save(); render(); window.scrollTo(0, 0); } catch (e) { console.error(e); } };
    const cont = () => { AS.next(S); save(); render(); window.scrollTo(0, 0); };
    const table = (cols, rows) => h('table', { class: 'lvq' }, h('tr', null, cols.map((c, i) => h('th', null, c))), rows.map((r) => h('tr', null, r.map((c, i) => h(i ? 'td' : 'th', null, String(c))))));
    const conf = (name, list) => h('div', null, h('b', null, name), list.map((x) => h('div', { class: 'small' + (x.isUser ? ' me-line' : ''), style: x.isUser ? 'font-weight:700' : '' }, (x.starter ? '★ ' : '') + x.name + ' · ' + x.pos + ' · ' + x.team + (x.isUser ? ' (you)' : ''))));
    const out = [h('div', { class: 'callout' }, '⭐ All-Star Weekend · game ' + ((S.matchLog || []).slice(0, S.matchIdx).filter((x) => x.k === 'g' && !x.po).length) + ' of the season'), h('h1', null, v.title), h('p', { class: 'muted' }, v.text)];
    if (v.step === 'intro') {
      const fl = (list) => h('div', null, list.map((x) => h('div', { class: 'small', style: x.isUser ? 'font-weight:700' : '' }, (x.sel ? '★ ' : '') + x.name + ' · ' + x.team + ' · ' + x.votes + 'M votes' + (x.isUser ? ' (you)' : ''))));
      out.push(h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, 'The fan vote'), h('p', { class: 'small muted' }, 'Fans, players and media vote the starters (★ marks an All-Star). Coaches pick the reserves.' + (v.fanRank ? ' You finished ' + v.fanRank + (v.fanRank === 1 ? 'st' : v.fanRank === 2 ? 'nd' : v.fanRank === 3 ? 'rd' : 'th') + ' in your conference with ' + v.votes + 'M votes.' : '')), h('div', { class: 'lvlead' }, h('div', null, h('b', null, 'East'), fl(v.fan.E)), h('div', null, h('b', null, 'West'), fl(v.fan.W)))));
      out.push(h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, 'The rosters'), h('p', { class: 'small muted' }, 'Starters (★) are the top five in each conference by the vote, reserves are picked by the coaches.'), h('div', { class: 'lvlead' }, conf('East', R.E), conf('West', R.W))),
        h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, 'Your weekend'), h('ul', null, [f.sel ? h('li', null, 'The All-Star Game' + (f.starter ? ' (starter)' : ' (reserve)')) : null, f.inv.rising ? h('li', null, 'Rising Stars') : null, f.inv.three ? h('li', null, 'Three-Point Contest invite') : null, f.inv.dunk ? h('li', null, 'Slam Dunk Contest invite') : null])),
        h('div', { class: 'row' }, h('button', { class: 'primary big-btn', onclick: () => step('go') }, 'Start the weekend →')));
    } else if (v.result) {
      out.push(h('div', { class: 'card suspense' }, h('div', { class: 'cap2' }, v.tone === 'good' ? 'Highlight' : 'Result'), h('p', { class: 'jmsg ' + (v.tone || '') }, v.text), v.rows && v.rows.length ? table(f.last.cols || ['Player', 'R1', 'Final'], v.rows) : null), h('div', { class: 'row' }, h('button', { class: 'primary big-btn', onclick: cont }, 'Continue →')));
    } else if (v.step === 'recap') {
      out.push(h('div', { class: 'card' }, (f.res.lines || []).length ? f.res.lines.map((l) => h('p', { class: 'jmsg', style: 'margin:6px 0' }, '• ' + l)) : h('p', null, 'You took it all in.'), v.awards.length ? h('p', { class: 'jmsg good' }, '🏆 ' + v.awards.join(' · ')) : null), h('div', { class: 'row' }, h('button', { class: 'primary big-btn', onclick: () => { AS.answer(S, 'done'); S.matchIdx++; save(); go(); } }, 'Back to the season')));
    } else {
      out.push(h('div', { class: 'wkgrid' }, v.options.map((o) => h('div', { class: 'wkcard' }, h('b', null, o.label), h('div', { class: 'small', style: 'margin:6px 0' }, o.blurb), h('div', { class: 'small vibe' }, o.vibe), h('div', { style: 'margin-top:8px' }, h('button', { class: 'primary', onclick: () => step(o.key) }, v.step === 'game' ? 'Play' : 'Enter'))))), v.canPass ? h('div', { class: 'row', style: 'margin-top:10px' }, h('button', { class: 'ghost', onclick: () => step('pass') }, 'Pass on this one')) : null);
    }
    return h('div', null, out);
  }
  // somebody in the league talked about you: the quote, and your answer (in the artifact Claude writes the quote and the replies from the stats)
  let mnBusy = false;
  function screenMention() {
    const Dc = DEC(), v = Dc.view(S), pd = S.dec.pending, ctx = pd.ctx, t = S.league.teams[S.teamId];
    if (!ctx.aiDone && !mnBusy) { mnBusy = true; getSample().then(async (sm) => { if (!sm) { ctx.aiDone = true; mnBusy = false; return; } try { const got = NBA.Press.checkClaudeMention(await aiJson(NBA.Press.claudeMentionPrompt({ kind: ctx.kind, speaker: ctx.who, quote: ctx.quote, opponent: ctx.oppName, oppRecord: ctx.oppRecord, game: ctx.game, season: ctx.season, career: ctx.career, feud: ctx.feud, player: ctx.me, team: ctx.team }))); if (got && S.dec.pending === pd) { ctx.quote = got.quote; ctx.lines = got.lines; ctx.ai = 1; ctx.ext = { headline: got.headline, fans: got.fans }; } } catch (e) { /* the hand-written one stays */ } ctx.aiDone = true; mnBusy = false; save(); if (S.dec.pending === pd) render(); }); }
    const pick = (key) => { try { const r = Dc.choose(S, key); const ex = ctx.ext; S.decResult = { title: 'In the news', sub: ctx.who.name + ' · ' + ctx.oppName, text: r.text, tone: r.tone === 'good' ? 'good' : r.tone === 'bad' ? 'bad' : 'neutral', cap: r.tone === 'good' ? 'It landed' : r.tone === 'bad' ? 'It backfired' : 'The story', post: true, headline: ex && ex.headline ? { text: ex.headline, outlet: 'The Wire' } : null, fans: ex && ex.fans && ex.fans.length ? ex.fans.map((x, k) => ({ who: '@' + HANDLES[(k * 3 + 1) % HANDLES.length], text: x })) : null, ai: ex ? 1 : 0 }; const it = S.matchLog[ctx.idx]; if (it) it.md = 1; save(); go(); } catch (e) { console.error(e); } };
    return h('div', null, h('h1', null, '📰 ' + v.title), h('p', { class: 'muted' }, t.name + ' · ' + v.text),
      h('div', { class: 'card suspense' }, h('div', { class: 'cap2' }, v.who.name + ' · ' + v.who.role + (v.ai ? ' ✨' : '')), h('h2', { style: 'margin:8px 0' }, v.quote)),
      h('div', { class: 'wkgrid' }, v.options.map((o) => h('div', { class: 'wkcard' + (o.key === 'fire' ? ' spicy' : '') }, h('b', null, o.label), h('div', { class: 'small', style: 'margin:6px 0' }, o.blurb), h('div', { class: 'small vibe' }, o.vibe), h('div', { style: 'margin-top:8px' }, h('button', { class: o.key === 'respect' ? 'primary' : '', onclick: () => pick(o.key) }, 'Say it'))))), autoDecBar());
  }
  let podBusy = false;
  function screenPodcast() {
    const Dc = DEC(), v = Dc.view(S), pd = S.dec.pending, ctx = pd.ctx, t = S.league.teams[S.teamId];
    if (!ctx.aiDone && !podBusy) { podBusy = true; getSample().then(async (sm) => { if (!sm) { ctx.aiDone = true; podBusy = false; return; } try { const got = NBA.Press.checkClaudePodcast(await aiJson(NBA.Press.claudePodcastPrompt({ show: ctx.show, host: ctx.host, opponent: ctx.oppName, oppStar: ctx.star, oppRecord: ctx.oppRecord, game: ctx.game, season: ctx.season, career: ctx.career, feud: ctx.feud, player: ctx.me, team: ctx.team }))); if (got && S.dec.pending === pd) { ctx.hostQ = got.host; ctx.lines = got.lines; ctx.ai = 1; ctx.ext = { headline: got.headline, fans: got.fans }; } } catch (e) { /* the hand-written lines stay */ } ctx.aiDone = true; podBusy = false; save(); if (S.dec.pending === pd) render(); }); }
    const pick = (key) => { try { const r = Dc.choose(S, key), ex = ctx.ext; S.decResult = { title: 'Fan podcast', sub: ctx.show + ' · ' + t.name, text: r.text, tone: r.tone === 'good' ? 'good' : r.tone === 'bad' ? 'bad' : 'neutral', cap: r.tone === 'good' ? 'The clip' : r.tone === 'bad' ? 'The fallout' : 'The clip', post: true, headline: ex && ex.headline ? { text: ex.headline, outlet: ctx.show } : null, fans: (ex && ex.fans && ex.fans.length ? ex.fans : key === 'unfiltered' ? ['bro got bleeped mid sentence \uD83D\uDE2D', 'the way the host panicked \uD83D\uDC80 cut the mic', 'ouu shi this trash talk is lowkey real \uD83D\uDD25'] : null) ? (ex && ex.fans && ex.fans.length ? ex.fans : ['bro got bleeped mid sentence \uD83D\uDE2D', 'the way the host panicked \uD83D\uDC80 cut the mic', 'ouu shi this trash talk is lowkey real \uD83D\uDD25']).map((x, k) => ({ who: '@' + HANDLES[(k * 3 + 2) % HANDLES.length], text: x })) : null, ai: ex ? 1 : 0 }; const it = S.matchLog[ctx.idx]; if (it) it.pcast = 1; save(); go(); } catch (e) { console.error(e); } };
    return h('div', null, h('h1', null, '🎙️ ' + v.title), h('p', { class: 'muted' }, t.name + ' · ' + v.text),
      h('div', { class: 'card suspense' }, h('div', { class: 'cap2' }, v.host + ' · ' + v.show + (v.ai ? ' ✨' : '')), h('h2', { style: 'margin:8px 0' }, '“' + v.question + '”')),
      h('div', { class: 'wkgrid' }, v.options.map((o) => h('div', { class: 'wkcard' + (o.spicy ? ' spicy' : '') }, h('b', null, o.label), h('div', { class: 'small', style: 'margin:6px 0' }, o.blurb), h('div', { class: 'small vibe' }, o.vibe), h('div', { style: 'margin-top:8px' }, h('button', { class: o.key === 'clean' ? 'primary' : '', onclick: () => pick(o.key) }, 'Say it'))))), autoDecBar());
  }
  function screenSocial() {
    const Dc = DEC(), v = Dc.view(S), s = NBA.Social.state(S);
    const pick = (key) => { try { const r = Dc.choose(S, key), it = S.matchLog[S.matchIdx || 0]; if (it) it.sd = 1; S.decResult = { title: 'Posted', sub: s.handle + ' · ' + NBA.Social.fmt(NBA.Social.state(S).f) + ' followers', text: r.text, tone: r.tone === 'good' ? 'good' : r.tone === 'bad' ? 'bad' : 'neutral', cap: r.tone === 'good' ? 'It landed' : r.tone === 'bad' ? 'It did not land' : 'Posted' }; save(); go(); } catch (e) { console.error(e); } };
    return h('div', null, h('h1', null, v.title), h('div', { class: 'card suspense' }, h('div', { class: 'cap2' }, '📱 ' + s.handle + (s.verified ? ' ✓' : '')), h('p', { style: 'margin:6px 0 0' }, v.text)),
      h('div', { class: 'wkgrid' }, v.options.map((o) => h('div', { class: 'wkcard' }, h('b', null, o.label), h('div', { class: 'small', style: 'margin:6px 0' }, o.blurb), h('div', { class: 'small vibe' }, o.vibe), h('div', { style: 'margin-top:8px' }, h('button', { class: 'primary', onclick: () => pick(o.key) }, 'Post'))))), autoDecBar());
  }
  function screenClutch() {
    const Dc = DEC(), v = Dc.view(S), t = S.league.teams[S.teamId], rec = S.proSeasons[S.proSeasons.length - 1];
    const pick = (key) => { try { const r = Dc.choose(S, key); S.decResult = { title: v.g7 ? 'Game 7' : 'Clutch time', sub: t.name + (v.home ? ' vs ' : ' at ') + 'the ' + v.opp + (v.g7 ? '' : ' · game ' + v.n), text: r.text, tone: r.tone === 'good' ? 'good' : 'bad', cap: r.tone === 'good' ? 'You came through' : 'It did not go your way' }; save(); go(); } catch (e) { console.error(e); } };
    return h('div', null, h('h1', null, v.g7 ? 'Game 7' : 'Clutch time'), h('p', { class: 'muted' }, t.name + (v.home ? ' vs ' : ' at ') + 'the ' + v.opp + (v.ser ? ' · ' + v.round : '')),
      h('div', { class: 'card suspense' }, h('div', { class: 'cap2' }, v.g7 ? 'Winner moves on' : 'Everything on one possession'), h('h2', { style: 'margin:6px 0' }, v.text), h('p', { class: 'small muted' }, 'The coach looks at you. What do you do?')),
      h('div', { class: 'wkgrid' }, v.opts.map((o) => h('div', { class: 'wkcard' }, h('b', null, o.label), h('div', { class: 'small', style: 'margin:6px 0' }, o.blurb), h('div', { class: 'small vibe' }, o.vibe), h('div', { style: 'margin-top:8px' }, h('button', { class: 'primary', onclick: () => pick(o.key) }, 'Do it'))))),
      autoDecBar());
  }

  // ------------------------------------------------------------ high school (decision engine)
  function screenHS() {
    const Dc = DEC(), pend = S.dec && S.dec.pending && S.dec.pending.id === 'hs';
    if (!pend && !S.hsResult) { S.stage = 'college_pick'; return screenCollegePick(); }
    if (!pend) return h('div', null, h('h1', null, 'Senior year'), h('div', { class: 'card' }, h('p', null, S.hsResult.text), h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'primary', onclick: () => { S.stage = 'college_pick'; S.hsResult = null; go(); } }, 'Choose my college →'))));
    const v = Dc.view(S);
    return h('div', null, h('h1', null, 'Where do you finish high school?'), h('p', { class: 'muted' }, 'This is your recruiting year. It decides how good your game is when you arrive and how many people have seen it. Every path has a price.'),
      h('div', { class: 'wkgrid' }, v.options.map((o) => h('div', { class: 'wkcard' }, h('b', null, o.label), h('div', { class: 'small', style: 'margin:6px 0' }, o.blurb), h('div', { class: 'small vibe' }, o.vibe), h('div', { style: 'margin-top:8px' }, h('button', { class: 'primary', onclick: () => { try { S.hsResult = Dc.choose(S, o.key); save(); go(); } catch (e) { console.error(e); } } }, 'Choose'))))));
  }

  // ------------------------------------------------------------ preseason camp (decision engine)
  const DEC = () => NBA.Decisions;
  function journalCard(n, title) {
    const j = ((S.dec && S.dec.journal) || []).slice().reverse(); if (!j.length) return null;
    return h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, title || 'Your journal'), h('div', { class: 'jlist' }, j.slice(0, n || 40).map((e) => h('div', { class: 'jrow ' + (e.tone || '') }, h('span', { class: 'jyr' }, e.label), h('div', null, h('b', { class: 'small' }, e.title), h('div', { class: 'small' }, e.text))))));
  }
  // the preseason decisions (promise, agent, camp) are pop-ups over the preseason page
  function preModal(fn) { const c = fn(), bg = screenProReady(); return c === 'again' ? bg : h('div', null, modal(c), bg); }
  function screenPromise() {
    const Dc = DEC(); if (!S.dec || !S.dec.pending || S.dec.pending.id !== 'promise') { S.stage = 'pro_ready'; return 'again'; }
    const v = Dc.view(S), step = (key) => { try { S.decResult = null; const r = G.choosePromise(S, key); S.flash = r.text; save(); go(); } catch (e) { console.error(e); } };
    return h('div', null, h('h1', null, v.title), h('p', { class: 'muted' }, v.text),
      h('div', { class: 'wkgrid' }, v.options.map((o) => h('div', { class: 'wkcard' }, h('b', null, o.label), h('div', { class: 'small', style: 'margin:6px 0' }, o.blurb), h('div', { class: 'small vibe' }, o.vibe), h('div', { style: 'margin-top:8px' }, h('button', { class: 'primary', onclick: () => step(o.key) }, 'Ask'))))));
  }
  function screenAgent() {
    const Ag = NBA.Legacy.AGENTS;
    return h('div', null, h('h1', null, 'Pick your agent'), h('p', { class: 'muted' }, 'This is the person who negotiates your contracts and sells your name. You can only pick once, so choose who you trust.'),
      Ag.map((a) => h('div', { class: 'card' }, h('div', { class: 'row' }, h('div', null, h('b', null, a.name + ' · ' + a.tag), h('div', { class: 'small muted' }, a.blurb)), h('span', { class: 'spacer' }), h('button', { class: 'primary', onclick: () => { G.chooseAgent(S, a.id); save(); go(); } }, 'Hire')))));
  }
  function screenCamp() {
    const Dc = DEC(); if (!S.dec || !S.dec.pending || S.dec.pending.id !== 'camp') { S.stage = 'pro_ready'; return 'again'; }
    const v = Dc.view(S), L = S.league;
    const n = v.partners.length, full = n >= v.slots, noAsks = v.asks <= 0;
    const act = (key, arg) => () => { try { Dc.choose(S, key, arg); save(); render(); } catch (e) { console.error(e); } };
    const finish = (key, arg) => { try { Dc.choose(S, key, arg); S.stage = 'pro_ready'; go(); } catch (e) { console.error(e); } };
    const card = (m) => h('div', { class: 'wkcard mcard' + (m.asked === 'yes' ? ' done t3' : m.asked === 'no' ? ' done t0' : '') },
      h('div', { class: 'row' }, logo(m.team, 44), h('div', null, h('b', null, plink(m.id, m.name)), h('div', { class: 'small muted' }, m.tierLabel + ' · ' + m.pos + ' · ' + m.age + ' · ' + m.team + ' · ' + m.ovr + ' OVR'))),
      h('div', { class: 'small', style: 'margin:8px 0' }, 'Teaches ' + m.skillLabel + ' (' + m.his + ' vs your ' + m.yours + ')'),
      m.asked ? h('div', { class: 'wkres' }, m.asked === 'yes' ? 'Said yes' : 'Turned you down') : h('div', { class: 'row' }, h('span', { class: 'vibe' }, m.vibe), h('span', { class: 'spacer' }), h('button', { disabled: noAsks || full, onclick: act('ask', m.id) }, 'Ask')));
    const TL = { star: 'A star has noticed you', vet: 'A veteran has something to hand down', mate: 'Your teammate wants a summer partner', young: 'A young player wants to learn from you', rival: 'Your rival wants you in his gym' };
    const icard = (m) => h('div', { class: 'wkcard mcard inv' + (m.state === 'yes' ? ' done t3' : m.state === 'no' ? ' done t0' : '') },
      h('div', { class: 'row' }, logo(m.team, 44), h('div', null, h('b', null, plink(m.id, m.name)), h('div', { class: 'small muted' }, m.pos + ' · ' + m.age + ' · ' + m.team + ' · ' + m.ovr + ' OVR'))),
      h('div', { class: 'small', style: 'margin:8px 0' }, h('b', null, TL[m.type]), m.skill ? h('div', null, 'Wants to work on ' + m.skillLabel + ' (' + m.his + ' vs your ' + m.yours + ')') : h('div', null, 'You would be the teacher: it earns respect in the room.')),
      m.state ? h('div', { class: 'wkres' }, m.state === 'yes' ? 'You said yes' : 'You passed') : h('div', { class: 'row' }, h('button', { class: 'primary', disabled: full, onclick: act('accept', m.id) }, 'Train together'), h('button', { onclick: act('decline', m.id) }, 'Pass')));
    const left = v.invites.filter((x) => !x.state).length;
    return h('div', null, h('h1', null, 'Preseason camp · ' + NBA.seasonLabel(L.year)),
      h('p', { class: 'muted' }, 'Who do you want to train with this summer? Camp has room for ' + v.slots + ' partners. Ask people yourself (' + v.asks + ' ask' + (v.asks === 1 ? '' : 's') + ' left: big names teach the most and say no the most, and every no costs you summer time), or say yes to the players who invite you. Each extra partner gets less out of you and wears you down more.'),
      h('div', { class: 'card' }, h('div', { class: 'row' }, h('h2', { style: 'margin:0' }, n ? n + ' of ' + v.slots + ' partners set' : 'No partners yet · ' + v.asks + ' asks left'), h('span', { class: 'spacer' }), n ? h('button', { class: 'primary', onclick: () => finish('solo') }, 'Start the season →') : null),
        v.log.length ? h('div', { class: 'jlog' }, v.log.map((x) => h('div', { class: 'jmsg ' + x.tone }, x.text))) : null,
        v.invites.length ? h('div', null, h('h3', null, '📨 Players who want to train with you' + (left ? '' : ' · all answered')), h('div', { class: 'wkgrid' }, v.invites.map(icard))) : null,
        h('h3', null, 'Ask someone yourself'), h('div', { class: 'wkgrid' }, v.mentors.map(card))),
      n ? null : h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, noAsks && !left ? 'No partner this summer: work on your own game' : 'Or work on your own game'),
        h('p', { class: 'small muted' }, v.soloGain > 0 ? 'Guaranteed, but small: about +' + v.soloGain.toFixed(1) + ' on one skill. Each no from a mentor takes some of that away.' : 'Nobody wanted to work with you, and the summer is gone.'),
        h('div', { class: 'row', style: 'flex-wrap:wrap' }, v.soloGain > 0 ? v.solo.map((a) => h('button', { onclick: () => finish('solo', a.key) }, a.label + ' (' + a.v + ')')) : null, h('button', { onclick: () => finish('rest') }, v.soloGain > 0 ? 'Take the summer off' : 'Continue →'))));
  }

  // ------------------------------------------------------------ router
  function render() {
    renderHeader();
    app.replaceChildren();
    if (!S) { app.append(screenCreate()); return; }
    if (report) { app.append(screenReport()); return; }
    const st = S.stage;
    if (view === 'team' && st !== 'create') { app.append(screenTeam()); return; }
    if (view === 'league' && st !== 'create') { app.append(screenLeague()); return; }
    if (view === 'career' && st !== 'create') { app.append(screenCareer()); return; }
    const m = { scouting: screenScouting, hs: screenHS, college_pick: screenCollegePick, college_ready: screenCollegeReady, college_decision: screenCollegeDecision, combine: screenCombine, workouts: screenWorkouts, draft_night: screenDraft, training: screenTraining, camp: () => preModal(screenCamp), agent: () => preModal(screenAgent), promise: () => preModal(screenPromise), pro_ready: screenProReady, season_play: screenSeasonPlay, season_recap: screenRecap, decision: screenDecision, retired: screenRetired };
    if (S.flash && st !== 'decision') { app.append(h('div', { class: 'callout' }, S.flash)); S.flash = null; }
    app.append((m[st] || screenCreate)());
    document.body.classList.toggle('dlg-open', !!app.querySelector('.dlg-back'));
  }
  function boot() { S = null; draft.name = ''; render(); }
  window.__NBA_UI = { get state() { return S; }, set state(v) { S = v; }, get live() { return LV; }, go, render, saveSnap };
  boot();
})();
