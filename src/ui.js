(function () {
  'use strict';
  const NBA = window.NBA, D = NBA.data, G = NBA.Game;
  const KEY = 'nba-career-sim-save-v1';
  const BUILD = 'build 26 Oct · BallerSim dashboard v40';
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
    const sz = D.SIZE[draft.pos], manual = draft.sizeMode === 'manual', note = h('div', { class: 'small muted' }), fx = h('div', { class: 'small' });
    const val = () => h('b', { class: 'szv' });
    const v = { ht: val(), wt: val(), ws: val() };
    const show = () => {
      const m = mySize(), z = NBA.sizeZ({ pos: draft.pos, ht: m.ht, wt: m.wt, ws: m.ws });
      v.ht.textContent = NBA.fmtHt(m.ht); v.wt.textContent = m.wt + ' lb'; v.ws.textContent = NBA.fmtHt(m.ws);
      const pc = Math.round(100 * cdf(z.h));
      note.textContent = (pc >= 45 && pc <= 55 ? 'Right at the average height for a ' + draft.pos : (pc > 50 ? 'Taller than ' + pc : 'Shorter than ' + (100 - pc)) + '% of NBA ' + draft.pos + 's') + (z.w > 0.8 ? ', built heavy' : z.w < -0.8 ? ', built lean' : '') + (z.l > 0.8 ? ', with long arms.' : z.l < -0.8 ? ', with short arms.' : '.');
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
    return h('div', { class: 'szcard' }, h('h3', null, 'Height, weight & wingspan'), mode, ...body, note, fx);
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
        h('h3', null, 'Current ratings'), attrBars(S.player), h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'primary', onclick: () => { S.stage = 'college_pick'; go(); } }, 'Choose my college →')));
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
    const yr = S.collegeYears.length + 1;
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
        h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'primary', onclick: () => { G.enterDraft(S); go(); } }, 'Head to the draft →'))));
    }
    return h('div', null, cards);
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
      h('div', { class: 'pmain' }, h('b', null, r.isUser ? '⭐ ' + r.name : r.name), h('div', { class: 'small muted' }, r.pos + ' · ' + r.age + ' · ' + (r.from || '—'))), h('div', { class: 'pside' }, h('span', { class: 'small' }, r.nick), h('span', { class: 'small muted' }, chipOf(r))), t ? h('span', { class: 'pill ' + t[1] }, t[0]) : null); };
    const r1 = h('div', { class: 'pround' }, h('div', { class: 'rhead' }, 'Round 1')), r2 = h('div', { class: 'pround' }, h('div', { class: 'rhead' }, 'Round 2'));
    // the lottery has been held: every slot already shows who holds the pick (the same for every slot, so nothing gives away where you will go); the player fills in when it is announced
    const pending = (r) => h('div', { class: 'prow pending' }, h('span', { class: 'pn' }, r.slot), logo(r.nick, 30), h('div', { class: 'pmain' }, h('b', { class: 'muted' }, r.team), h('div', { class: 'small muted' }, 'Last season ' + (r.teamRec || '–'))), h('div', { class: 'pside' }, h('span', { class: 'small muted' }, 'on the board')));
    const rowEls = board.map((r) => pending(r)); rowEls.forEach((el, i) => (i < 30 ? r1 : r2).append(el));
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
        h('section', { class: 'card callout reveal' }, d.slot ? h('div', null, h('div', { class: 'big' }, '#' + d.slot + ' pick'), h('p', null, 'With the ' + ord(d.slot) + ' pick in the ' + d.year + ' NBA Draft, the ' + d.team + ' select ', h('b', null, S.player.name), ' of ' + d.college + '.'), h('p', { class: 'muted small' }, verdict)) : h('div', null, h('div', { class: 'big' }, 'Undrafted'), h('p', null, 'Your name was never called. You signed a minimum deal with the ' + d.team + ' right after the draft. Prove them wrong.'), h('p', { class: 'muted small' }, verdict)),
          h('p', null, 'Rookie contract: ' + money(S.contract.salary) + ' × ' + S.contract.years + ' years'), h('button', { class: 'primary', onclick: () => { G.startPro(S); alloc = {}; go(); } }, 'Start my NBA career →')),
        h('section', { class: 'card' }, h('h2', null, 'Your landing spot'), h('div', { class: 'row' }, logo(t.nick, 44), h('div', null, h('b', null, t.name), h('div', { class: 'small muted' }, 'Last season ' + (d.teamRec || (t.wins + '-' + t.losses)) + ' · ' + (t.conf === 'W' ? 'West' : 'East')))),
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
      controls.replaceChildren(h('button', { class: 'primary', onclick: () => { held = false; showWrap(); auto = true; setControls(); schedule(1400); } }, 'Continue →'));
    };
    const step = (manual) => {
      draftTimer = null; if (idx >= N) return finish();
      if (idx === mine && !wrapped && !S.draftSeen) return yourPick();
      const r = board[idx]; reveal(r); if (idx >= N) return finish();
      if (auto && !manual) schedule(delayAfter(r)); setControls();
    };
    function toMine() { if (draftTimer) clearTimeout(draftTimer); draftTimer = null; while (idx < mine) { append(board[idx]); idx++; } setProg(); auto = true; step(false); }
    function all() { if (draftTimer) { clearTimeout(draftTimer); draftTimer = null; } held = false; while (idx < N) { append(board[idx]); idx++; } setProg(); clock.replaceChildren(pickLine(board[N - 1])); finish(); }
    if (S.draftSeen) { board.forEach((r) => append(Object.assign({}, r))); idx = N; setProg(); clock.replaceChildren(h('div', { class: 'small muted' }, 'Draft complete')); showWrap(); }
    else if (S.draftProg > 0 && S.draftProg < N) {   // the screen was redrawn mid-draft: pick up where it was
      while (idx < S.draftProg) { append(board[idx]); idx++; } setProg(); if (mine >= 0 && idx > mine) { phase = 2; showWrap(); }
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
  function stopAuto() { playing = false; if (timer) { clearTimeout(timer); timer = null; } }
  function advanceOne() {
    const items = S.matchLog; let got = false;
    while (S.matchIdx < items.length) {
      const it = items[S.matchIdx]; S.matchIdx++;
      if (it.k === 'g') got = true;
      if (got) { while (items[S.matchIdx] && items[S.matchIdx].k === 'hdr') S.matchIdx++; break; }
    }
  }
  function autoplay(until) {
    stopAuto(); const items = S.matchLog, delay = { '1x': 480, '2x': 200, inst: 0 }[speed];
    if (!delay) { let guard = 0; while (!until() && S.matchIdx < items.length && guard++ < 400) advanceOne(); save(); render(); return; }
    playing = true;
    const tick = () => { if (!playing) return; if (until() || S.matchIdx >= items.length) { stopAuto(); save(); render(); return; } advanceOne(); save(); render(); timer = setTimeout(tick, delay); };
    tick();
  }

  // ------------------------------------------------------------ season dashboard
  function screenSeasonPlay() {
    if (!S.leagueSnap || !S.matchLog) { S.stage = 'season_recap'; save(); return screenRecap(); } // save from an older build
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
    const sim1 = () => { stopAuto(); advanceOne(); save(); render(); };
    const simBar = done
      ? h('div', { class: 'simbar well' }, ctl('Season recap →', () => { stopAuto(); S.stage = 'season_recap'; go(); }, 'primary big-btn'))
      : h('div', { class: 'simbar well' },
        playing ? ctl('Pause', () => { stopAuto(); render(); }, 'primary big-btn', 'pause') : ctl(nextIsPo ? 'Sim next playoff game' : 'Sim next game', sim1, 'primary big-btn', 'play'),
        !asDone && asIdx >= 0 && !nextIsPo ? ctl('Sim to All-Star', () => autoplay(() => S.matchIdx > asIdx), 'ghost', 'ff') : (regEndIdx >= 0 && idx <= regEndIdx ? ctl('Sim to playoffs', () => autoplay(() => S.matchIdx > regEndIdx), 'ghost', 'ff') : null),
        h('div', { class: 'speed' }, h('span', null, 'SPEED'), ['1x', '2x', 'inst'].map((k) => h('button', { class: speed === k ? 'on' : '', onclick: () => { speed = k; render(); } }, k === 'inst' ? 'Instant' : k))),
        h('div', { class: 'simmini' }, ctl('Sim 10', () => { let c = 0; autoplay(() => c++ >= 10); }, 'tiny'), ctl('Skip to recap »', () => { stopAuto(); S.matchIdx = items.length; S.stage = 'season_recap'; go(); }, 'tiny')));
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
    const streamRow = (g) => h('div', { class: 'srow' }, h('div', { class: 'sr-a' }, h('span', { class: 'wl ' + (g.w ? 'w' : 'l') }, g.w ? 'W' : 'L'), h('b', null, (g.h ? 'VS ' : '@ ') + ab(g.o) + ' (' + (g.po ? 'G' + g.n : 'GAME ' + g.n) + ')'), h('span', { class: 'spacer' }), h('span', { class: 'sc' }, g.f + ' - ' + g.a + (g.ot ? ' (OT)' : ''))), h('div', { class: 'sr-b' }, h('span', null, (g.ar || '') + ' · Final' + (g.ot ? '/OT' : '')), h('span', { class: 'spacer' }), h('span', null, g.pt + ' PTS · ' + g.as + ' AST · ' + g.rb + ' REB'), h('span', { class: 'rating xs ' + rClass(g.r) }, g.r.toFixed(1))));
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
    const wrap = h('div', { class: 'dash mt-' + mTab }, h('div', { class: 'dtop' }, hero, quick, mtabs, telemetry), playoffPanel, h('div', { class: 'dmid' }, stream, averages, defense), planPanel);
    return wrap;
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

  // ------------------------------------------------------------ team page
  const rosterRole = (r) => (r.me ? 'You' : r.mins >= 24 ? 'Starter' : r.mins >= 14 ? 'Rotation' : 'Bench');
  function rosterTable(rows) {
    return h('div', { class: 'scroll' }, h('table', { class: 'st roster' }, h('thead', null, h('tr', null, ['Player', 'Role', 'OVR', 'GP', 'MPG', 'PPG', 'RPG', 'APG', 'STL', 'BLK', 'RTG'].map((x, i) => h('th', { class: i < 2 ? 'l' : '' }, x)))),
      h('tbody', null, rows.map((r) => h('tr', { class: r.me ? 'me' : '' }, h('td', { class: 'l' }, h('b', null, r.name), h('div', { class: 'small muted' }, r.pos + ' · age ' + r.age + (r.sz ? ' · ' + r.sz : ''))), h('td', { class: 'l muted' }, rosterRole(r)), h('td', null, r.ovr), h('td', null, r.gp), h('td', null, r.mins ? r.mins.toFixed(1) : '–'), h('td', null, r.line.pts.toFixed(1)), h('td', null, r.line.reb.toFixed(1)), h('td', null, r.line.ast.toFixed(1)), h('td', null, r.line.stl.toFixed(1)), h('td', null, r.line.blk.toFixed(1)), h('td', null, r.rating ? ratingBadge(r.rating, 1) : '–'))))));
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
    const rate = (l, mins) => { const den = l.pts / (2 * Math.max(0.4, l.ts || 0.56)), fga = den / 1.088, fta = 0.2 * fga; return NBA.gameRating({ pts: l.pts, reb: l.reb, ast: l.ast, stl: l.stl, blk: l.blk, tov: l.tov, min: mins }, { fga, fta }); };
    // everyone on the club, rookies included (they only join the core/bench lists the summer after their draft)
    const rows = Object.values(L.players).filter((q) => q.teamId === t.id).map((q) => {
      const id = q.id, l = L.lines[id]; if (!l) return null;
      const line = { pts: bridge(l.pts, id * 3 + 1), reb: bridge(l.reb, id * 3 + 2), ast: bridge(l.ast, id * 3 + 3), stl: l.stl, blk: l.blk, tov: l.tov, ts: l.ts };
      return { name: q.name, pos: q.pos, sz: sizeTxt(q), age: q.age, ovr: Math.round(NBA.ovr(q)), mins: l.mins, gp: Math.round(l.gp * prog), line, rating: rate(line, l.mins) };
    }).filter(Boolean);
    // you: games so far this season (or last season when the season is over)
    const shown = items.slice(0, idx), { t: T, av: A, g: gl } = seasonTotals(shown), last = S.proSeasons[S.proSeasons.length - 1];
    if (t.id !== S.teamId) { /* another team: no user row */ } else if (inSeason && T.n) rows.push({ me: true, name: p.name, pos: p.pos, sz: sizeTxt(p), age: p.age, ovr: Math.round(NBA.ovr(p)), mins: A.m, gp: T.n, line: { pts: A.pt, reb: A.rb, ast: A.as, stl: A.st, blk: A.bk, tov: A.to }, rating: gl.reduce((a, g) => a + g.r, 0) / gl.length });
    else if (!inSeason && last) rows.push({ me: true, name: p.name, pos: p.pos, sz: sizeTxt(p), age: p.age, ovr: Math.round(NBA.ovr(p)), mins: last.mins, gp: last.gp, line: { pts: last.pts, reb: last.reb, ast: last.ast, stl: last.stl, blk: last.blk, tov: last.tov }, rating: last.avgRating || rate(last, last.mins) });
    else rows.push({ me: true, name: p.name, pos: p.pos, sz: sizeTxt(p), age: p.age, ovr: Math.round(NBA.ovr(p)), mins: 0, gp: 0, line: { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0 }, rating: null });
    rows.sort((a, b) => b.mins - a.mins);
    return rows;
  }

  function screenTeam() {
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
          h('tbody', null, rows.map((r) => h('tr', { class: r.me ? 'me' : '' }, h('td', { class: 'l' }, h('b', null, r.name), h('div', { class: 'small muted' }, r.pos + ' · age ' + r.age + (r.sz ? ' · ' + r.sz : ''))), h('td', { class: 'l muted' }, role(r)), h('td', null, r.ovr), h('td', null, r.gp), h('td', null, r.mins ? r.mins.toFixed(1) : '–'), h('td', null, r.line.pts.toFixed(1)), h('td', null, r.line.reb.toFixed(1)), h('td', null, r.line.ast.toFixed(1)), h('td', null, r.line.stl.toFixed(1)), h('td', null, r.line.blk.toFixed(1)), h('td', null, r.rating ? ratingBadge(r.rating, 1) : '–')))))),
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
  function screenLeague() {
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
        const list = (snap.leadersO[k] || []).map((x, i) => ({ name: x.name, team: x.team, v2: bridge(x.v, ki * 9 + i) }));
        list.push({ name: S.player.name, team: userNick, v2: userAvg[k], isUser: true });
        list.sort((a, b) => b.v2 - a.v2);
        return h('div', { class: 'well' }, h('div', { class: 'small caps muted' }, name + ' · ' + unit), list.slice(0, 5).map((x, i) => h('div', { class: 'rank-row' + (x.isUser ? ' me' : '') }, h('span', { class: 'n' }, i + 1), h('span', null, x.name, h('em', null, ' ' + ab(x.team))), h('b', null, x.v2.toFixed(1)))), list.slice(0, 5).some((x) => x.isUser) ? null : h('div', { class: 'small muted', style: 'margin-top:6px' }, 'You: ' + userAvg[k].toFixed(1)));
      });
    } else leadCards = leaders ? keys.map(([k, name, unit]) => h('div', { class: 'well' }, h('div', { class: 'small caps muted' }, name + ' · ' + unit), (leaders[k] || []).slice(0, 5).map((x, i) => h('div', { class: 'rank-row' + (x.isUser ? ' me' : '') }, h('span', { class: 'n' }, i + 1), h('span', null, x.name, h('em', null, ' ' + ab(x.team))), h('b', null, x.v.toFixed(1)))))) : [h('p', { class: 'muted' }, 'Leaders show up once a season has been played.')];
    const raceKeys = [['mvp', 'MVP'], ['dpoy', 'DPOY'], ['roy', 'ROY'], ['mip', 'MIP']];
    let raceBody;
    if (live) {
      const pace = (nick) => { const r = rows.find((t) => t.nick === nick); return r && r.gp ? (r.wins / r.gp) * 82 : 41; }, rec = (nick) => { const r = rows.find((t) => t.nick === nick); return r ? r.wins + '-' + r.losses : ''; };
      const prod = (c) => c.perf;
      const idxOf = (c) => (leagueRace === 'dpoy' ? 2.2 * c.stl + 2 * c.blk + 0.1 * (c.pace - 41) : leagueRace === 'mvp' ? 0.318 * c.perf + 0.294 * c.pace + 0.068 * c.pts : c.perf + 0.1 * (c.pace - 41));
      if (N < 15) raceBody = h('p', { class: 'muted' }, 'The ladder opens after 15 games.');
      else {
        const list = ((snap.raceO || {})[leagueRace] || []).map((x, i) => { const c = { name: x.name, team: x.team, pts: bridge(x.pts, 60 + i), reb: bridge(x.reb, 70 + i), ast: bridge(x.ast, 80 + i), stl: bridge(x.stl, 90 + i), blk: bridge(x.blk, 100 + i), perf: bridge(x.perf || 0, 110 + i) }; c.pace = pace(x.team); return c; });
        const missed = items.slice(0, idx).filter((x) => x.k === 'g' && !x.po && x.dnp).length, uPace = pace(userNick);
        const gpOk = missed <= 17, winsOk = true;  // same eligibility as the final vote: 65+ games played (there is no minimum for team wins)
        const elig = (leagueRace === 'mvp' || leagueRace === 'dpoy' || (leagueRace === 'roy' && S.pre && S.pre.rookie)) && gpOk && winsOk;
        const uTov = tot.av.to, uTs = tot.t.fga ? tot.av.pt / (2 * (tot.av.fga + 0.44 * tot.av.fta)) : 0.55;
        const uPerf = NBA.perfOf({ pts: userAvg.pts, reb: userAvg.reb, ast: userAvg.ast, stl: userAvg.stl, blk: userAvg.blk, tov: uTov, ts: uTs });
        if (elig) list.push({ name: S.player.name, team: userNick, pts: userAvg.pts, reb: userAvg.reb, ast: userAvg.ast, stl: userAvg.stl, blk: userAvg.blk, perf: uPerf, recent: S.player.mvpRecent || 0, pace: uPace, isUser: true });
        list.forEach((c) => (c.ix = idxOf(c))); list.sort((a, b) => b.ix - a.ix);
        raceBody = [h('p', { class: 'small muted' }, 'Ladder as of game ' + N + ': ranked on what has happened so far, not a forecast.'), list.slice(0, 5).map((x, i) => h('div', { class: 'race' + (x.isUser ? ' me' : '') }, h('div', { class: 'row' }, h('span', { class: 'n' }, i + 1), h('b', null, x.name), h('em', null, ab(x.team)), h('span', { class: 'spacer' }), h('span', { class: 'small muted' }, rec(x.team))), h('div', { class: 'small muted' }, x.pts.toFixed(1) + ' pts · ' + x.reb.toFixed(1) + ' reb · ' + x.ast.toFixed(1) + ' ast' + (leagueRace === 'dpoy' ? ' · ' + x.stl.toFixed(1) + ' stl · ' + x.blk.toFixed(1) + ' blk' : '')))),
          list.slice(0, 5).some((x) => x.isUser) ? null : h('p', { class: 'small muted', style: 'margin-top:8px' }, elig ? 'You are outside the top 5 for now.' : !gpOk ? 'You have missed ' + missed + ' games: 65 played are needed to qualify.' : 'Not eligible for this award.')];
      }
    } else {
      const race = snap && snap.race ? snap.race : null;
      if (!race) raceBody = h('p', { class: 'muted' }, 'The award race starts once you are in the league.');
      else {
        const list = (race[leagueRace] || []).slice().sort((a, b) => b.s - a.s);
        const ex = list.map((x) => Math.exp(x.s / 7)), tot2 = ex.reduce((a, b) => a + b, 0) || 1;
        raceBody = list.length ? list.map((x, i) => h('div', { class: 'race' + (x.isUser ? ' me' : '') }, h('div', { class: 'row' }, h('span', { class: 'n' }, i + 1), h('b', null, x.name), h('em', null, ab(x.team)), h('span', { class: 'spacer' }), h('b', null, Math.round(100 * ex[i] / tot2) + '%')), h('div', { class: 'bar2' }, h('i', { style: 'width:' + Math.round(100 * ex[i] / tot2) + '%' })), h('div', { class: 'small muted' }, x.pts.toFixed(1) + ' pts · ' + x.reb.toFixed(1) + ' reb · ' + x.ast.toFixed(1) + ' ast' + (leagueRace === 'dpoy' ? ' · ' + x.stl.toFixed(1) + ' stl · ' + x.blk.toFixed(1) + ' blk' : '') + ' · ' + x.wins + ' team wins'))) : h('p', { class: 'muted' }, 'No candidates this year.');
        if (list.length && !list.some((x) => x.isUser)) { const rr = S.proSeasons[S.proSeasons.length - 1]; raceBody = [raceBody, h('p', { class: 'small muted', style: 'margin-top:8px' }, rr && rr.gp < 65 ? 'You were not in this race: you played ' + rr.gp + ' games and 65 are needed to qualify.' : 'You were not in this race.')]; }
      }
    }
    return h('div', { class: 'dash' },
      h('div', { class: 'dlg' },
        h('section', { class: 'panel' }, h('div', { class: 'ph' }, h('span', { class: 'pi' }, '☷'), h('h2', null, 'Standings'), h('span', { class: 'spacer' }), h('span', { class: 'badge' }, label)),
          h('div', { class: 'grid2 conf' }, h('div', null, h('h3', null, 'Eastern conference'), confTable(rows, 'E', mine)), h('div', null, h('h3', null, 'Western conference'), confTable(rows, 'W', mine))), h('p', { class: 'small muted' }, 'Top 6 clinch a playoff spot, 7-10 go to the play-in.')),
        h('section', { class: 'panel' }, h('div', { class: 'ph' }, h('span', { class: 'pi' }, '★'), h('h2', null, live ? 'Award ladder' : 'Award race'), h('span', { class: 'spacer' }), h('div', { class: 'seg2 tight' }, raceKeys.map(([k, n]) => h('button', { class: leagueRace === k ? 'on' : '', onclick: () => { leagueRace = k; render(); } }, n)))), raceBody)),
      h('section', { class: 'panel' }, h('div', { class: 'ph' }, h('span', { class: 'pi' }, '▲'), h('h2', null, 'Stat leaders · top 5'), h('span', { class: 'spacer' }), h('span', { class: 'badge' }, snap ? snap.label : 'Last season')), h('div', { class: 'grid3' }, leadCards)));
  }
  // download the whole career as a file (for bug reports: lets a problem be replayed from the exact save)
  function exportSave() {
    try {
      const blob = new Blob([JSON.stringify({ build: BUILD, exportedAt: new Date().toISOString(), state: S, snap: G.getSnap() || null })], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'nba-career-sim-save-' + (S.player.name || 'career').replace(/[^A-Za-z0-9]+/g, '-') + '.json';
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    } catch (e) { alert('Could not export the save: ' + e.message); }
  }
  function screenCareer() {
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
        h('div', { class: 'scroll' }, h('table', null, h('thead', null, h('tr', null, ['Round', 'Opponent', 'Result', 'PTS', 'REB', 'AST'].map((x, i) => h('th', { class: i < 3 ? 'l' : '' }, x)))), h('tbody', null, r.perSeries.map((s) => h('tr', null, h('td', { class: 'l' }, s.round), h('td', { class: 'l' }, s.opp), h('td', { class: 'l' }, s.result), h('td', null, f1(s.pts)), h('td', null, f1(s.reb)), h('td', null, f1(s.ast)))))))) : null,
      h('div', { class: 'card ink' }, h('h2', null, 'Around the league'), h('p', null, 'Champion: ', h('b', null, r.champion), ' · MVP: ', h('b', null, r.mvp)), h('p', { class: 'muted small' }, r.league.n30 + ' players averaged 30+ this year, ' + r.league.n25 + ' averaged 25+.'), h('h3', null, 'Top scorers'), r.league.topScorers.slice(0, 5).map((t, i) => h('div', { class: 'rank-row' }, h('span', { class: 'n' }, i + 1), h('span', null, t.name), h('b', null, f1(t.ppg))))),
      h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => { S.stage = 'decision'; S.decision = G.decisionOptions(S); go(); } }, 'Offseason decisions →')));
  }

  function screenDecision() {
    const d = S.decision || (S.decision = G.decisionOptions(S));
    const done = (res) => { S.decision = null; alloc = {}; S.flash = res && res.text; go(); };
    const out = [h('h1', null, 'Offseason: what now?'), h('p', { class: 'muted' }, 'Age ' + d.age + ' · OVR ' + d.ovr + ' · ' + d.team + ' · market value ~' + money(d.marketSalary) + ' (cap ' + money(d.cap) + ')')];
    if (d.mustRetire) out.push(h('div', { class: 'callout' }, 'No team has an offer for you and your body says it is time. This is the end of the road.'));
    if (d.expiring && !d.mustRetire) {
      const mkOffer = (o, kind) => {
        let yrs = Math.min(3, o.maxYears);
        const lab = h('b', null);
        const sel = h('select', { onchange: (e) => (yrs = +e.target.value) }, Array.from({ length: o.maxYears }, (_, i) => h('option', { value: i + 1, selected: i + 1 === yrs }, (i + 1) + ' year' + (i ? 's' : ''))));
        return h('div', { class: 'card' }, h('div', { class: 'row' }, h('div', null, h('b', null, o.name), h('div', { class: 'small muted' }, o.label + ' · you would be a ' + o.role)), h('span', { class: 'spacer' }), h('b', null, money(o.salary) + ' / yr'), sel, h('button', { class: 'primary', onclick: () => done(G.decide(S, kind, { teamId: o.teamId, salary: o.salary, years: yrs })) }, kind === 'resign' ? 'Re-sign' : 'Sign')));
      };
      out.push(h('h3', null, 'Your contract expired · stay'), mkOffer(d.resign, 'resign'), h('h3', null, 'Test free agency · switch teams'), d.offers.length ? d.offers.map((o) => mkOffer(o, 'switch')) : h('p', { class: 'muted' }, 'No other team made an offer.'));
    } else if (!d.mustRetire) {
      out.push(h('div', { class: 'card' }, h('div', { class: 'row' }, h('div', null, h('b', null, 'Stay with the ' + d.team), h('div', { class: 'small muted' }, 'Contract: ' + money(d.contract.salary) + ' · ' + d.contract.left + ' more year(s)')), h('span', { class: 'spacer' }), h('button', { class: 'primary', onclick: () => done(G.decide(S, 'stay')) }, 'Stay'))),
        h('h3', null, 'Demand a trade (pick a destination)'), d.tradeOptions.map((o) => h('div', { class: 'card' + (o.ok ? '' : ' off') }, h('div', { class: 'row' }, h('div', null, withLogo(o.name.split(' ').slice(-1)[0] === 'Blazers' ? 'Trail Blazers' : (D.TEAMS.find((x) => x.id === o.teamId) || {}).nick, 22, o.name), h('div', { class: 'small muted' }, o.label + ' (' + o.wins + ' wins last year) · you would be a ' + o.role), o.partner ? h('div', { class: 'small' }, 'They send back: ', h('b', null, o.partner.name), ' · ' + o.partner.pos + ' · age ' + o.partner.age + ' · ' + o.partner.ovr + ' OVR') : null, o.ok ? null : h('div', { class: 'small bad' }, '✖ ' + o.reason)), h('span', { class: 'spacer' }), o.ok ? h('button', { onclick: () => done(G.decide(S, 'trade', { teamId: o.teamId })) }, 'Request trade') : h('span', { class: 'badge' }, 'Rejected')))), h('p', { class: 'small muted' }, 'A trade is a swap: your club has to be willing to move you and get a comparable player back, and the other side has to agree. Franchise players on winning teams are not traded on request.'));
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
        : h('tr', null, h('td', null, s.label), h('td', null, s.age), h('td', { class: 'l' }, s.team), h('td', null, s.wins + '-' + s.losses), h('td', null, s.gp), h('td', null, f1(s.mins)), h('td', null, f1(s.pts)), h('td', null, f1(s.reb)), h('td', null, f1(s.ast)), h('td', null, f1(s.stl)), h('td', null, f1(s.blk)), h('td', null, pct(s.fgp)), h('td', null, pct(s.tpp)), h('td', null, pct(s.ftp)), h('td', null, pct(s.ts)), h('td', null, s.td), h('td', null, s.ovr), h('td', null, s.avgRating ? ratingBadge(s.avgRating, 2) : '–'))))));
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
  function screenRetired() {
    const hof = S.hof, p = S.player;
    const mark = NBA.logos && NBA.logos._NBA ? h('div', { class: 'nbahero' }, h('span', null, h('img', { src: NBA.logos._NBA, alt: 'NBA' }))) : null;
    return h('div', null, mark, h('h1', null, p.name + ' retires'),
      h('div', { class: 'card' }, h('div', { class: 'big', style: 'color:' + (hof.hall ? 'var(--gold)' : 'inherit') }, hof.hall ? '🏛️ ' + hof.tier : hof.tier), (() => { const ct = careerTotals(S.proSeasons), pt = playoffTotals(S.playoffLines); return ct && ct.rating ? h('p', null, h('b', null, 'Career avg match rating '), ratingBadge(ct.rating, 2), pt && pt.rating ? h('span', null, '  ·  playoffs ', ratingBadge(pt.rating, 2)) : null) : null; })(),
        h('p', { class: 'muted' }, 'Legacy score ' + hof.score + ' (Hall of Fame line: 85) · ' + S.proSeasons.length + ' seasons · ' + archLabel(p) + ' · hidden ceiling was ' + Math.round(p.ceiling) + ' · ' + S.stars + '★ recruit' + (S.draft && S.draft.slot ? ' · drafted #' + S.draft.slot : ' · undrafted'))),
      movesCard(),
      h('div', { class: 'card' }, careerBody()),
      h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => { wipe(); S = null; boot(); } }, 'Start a new career')));
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
    const m = { scouting: screenScouting, college_pick: screenCollegePick, college_ready: screenCollegeReady, college_decision: screenCollegeDecision, combine: screenCombine, draft_night: screenDraft, training: screenTraining, pro_ready: screenProReady, season_play: screenSeasonPlay, season_recap: screenRecap, decision: screenDecision, retired: screenRetired };
    if (S.flash && st !== 'decision') { app.append(h('div', { class: 'callout' }, S.flash)); S.flash = null; }
    app.append((m[st] || screenCreate)());
  }
  function boot() { S = null; draft.name = ''; render(); }
  window.__NBA_UI = { get state() { return S; } };
  boot();
})();
