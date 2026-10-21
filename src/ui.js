(function () {
  'use strict';
  const NBA = window.NBA, D = NBA.data, G = NBA.Game;
  const KEY = 'nba-career-sim-save-v1';
  const BUILD = 'build 21 Oct · sport-dash theme';
  const app = document.getElementById('app');
  let S = null;           // game state
  let draft = { name: '', pos: 'SF', arch: 'scorer', sec: '', home: 'Illinois' };
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
  function wipe() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
  function go() { save(); render(); window.scrollTo(0, 0); }
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
  function renderHeader() {
    const who = document.getElementById('who'), btns = document.getElementById('topbtns');
    who.textContent = ''; btns.textContent = '';
    if (!S || S.stage === 'create') return;
    const p = S.player;
    let ctx = p.name + ' · ' + D.ARCHETYPES[p.arch].name + ' · ' + p.pos + ' · age ' + p.age + ' · OVR ' + Math.round(NBA.ovr(p));
    if (S.proSeasons.length || S.draft) ctx += ' · ' + S.league.teams[S.teamId].nick;
    who.textContent = ctx;
    btns.append(h('button', { onclick: showCareer }, '📋 Career'), confirmBtn('New', 'danger', () => { wipe(); S = null; boot(); }));
  }

  // ------------------------------------------------------------ screens
  function screenCreate() {
    const regions = D.REGIONS;
    const stateOptions = [];
    Object.keys(regions).forEach((r) => regions[r].states.slice().sort().forEach((s) => stateOptions.push(h('option', { value: s, selected: s === draft.home }, s + ' (' + r + ')'))));
    const archCards = Object.keys(D.ARCHETYPES).map((k) => {
      const a = D.ARCHETYPES[k];
      return h('div', { class: 'opt' + (draft.arch === k ? ' sel' : ''), onclick: () => { draft.arch = k; if (draft.sec === k) draft.sec = ''; render(); } },
        h('b', null, a.icon + ' ' + a.name), h('div', { class: 'small' }, a.blurb), h('div', { class: 'comps' }, a.comps));
    });
    const nameIn = h('input', { type: 'text', placeholder: 'Your name', value: draft.name, maxlength: 28, oninput: (e) => (draft.name = e.target.value) });
    const saved = load();
    return h('div', null,
      h('h1', null, 'Build your NBA legend'),
      h('p', { class: 'muted' }, 'Pick a name, position, archetype and where you grew up. Scouts will rate you, you choose a college, then it is draft night. Stats are tuned to the real NBA: nobody averages 35 for a decade.'),
      saved && saved.stage !== 'create' ? h('div', { class: 'callout row' }, h('span', null, 'Saved career found: ', h('b', null, saved.player.name), ' (' + saved.stage.replace(/_/g, ' ') + ')'), h('span', { class: 'spacer' }), h('button', { class: 'primary', onclick: () => { S = saved; render(); } }, 'Continue')) : null,
      h('div', { class: 'card' }, h('h2', null, '1. Who are you?'), h('div', { class: 'grid g2' }, h('div', null, h('label', { class: 'small muted' }, 'Name'), nameIn), h('div', null, h('label', { class: 'small muted' }, 'Where in the US are you from?'), h('select', { onchange: (e) => (draft.home = e.target.value) }, stateOptions))),
        h('h3', null, 'Position'), h('div', { class: 'row' }, Object.keys(D.POSITIONS).map((p) => h('button', { class: draft.pos === p ? 'primary' : '', onclick: () => { draft.pos = p; render(); } }, p)))),
      h('div', { class: 'card' }, h('h2', null, '2. Archetype'), h('div', { class: 'grid g3' }, archCards),
        h('h3', null, 'Secondary tag (optional, small bonus)'), h('select', { onchange: (e) => (draft.sec = e.target.value) }, h('option', { value: '' }, 'None'), Object.keys(D.ARCHETYPES).filter((k) => k !== draft.arch).map((k) => h('option', { value: k, selected: draft.sec === k }, D.ARCHETYPES[k].name)))),
      h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => { S = G.newCareer({ name: (draft.name || '').trim() || 'Rookie', pos: draft.pos, arch: draft.arch, sec: draft.sec, home: draft.home }); S.stage = 'scouting'; S.revealed = false; go(); } }, 'Get scouted →')),
      h('p', { class: 'muted small', style: 'text-align:center;margin-top:18px' }, BUILD));
  }

  function screenScouting() {
    const rep = G.scoutReport(S);
    const box = h('div', { class: 'card' });
    const holder = h('div');
    const info = h('div', { class: 'hidden', style: 'display:none' });
    function fill(n) { holder.replaceChildren(stars(n, true)); }
    box.append(h('h2', null, 'Scouting report'), h('p', { class: 'muted' }, S.player.name + ' · ' + S.player.pos + ' · ' + S.player.home), holder, info);
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
    const proj = mock.lo > 60 ? 'Undrafted risk' : '#' + mock.lo + ' – #' + Math.min(60, mock.hi) + ' (most likely ~#' + Math.min(60, mock.mid) + ')';
    return h('div', null, h('h1', null, y.label + ' season complete'),
      h('div', { class: 'card' }, h('div', { class: 'grid stats' }, statBox(f1(l.pts), 'PPG'), statBox(f1(l.reb), 'RPG'), statBox(f1(l.ast), 'APG'), statBox(f1(l.stl), 'SPG'), statBox(f1(l.blk), 'BPG'), statBox(pct(l.ts) + '%', 'TS%')),
        h('p', { style: 'margin-top:12px' }, h('b', null, y.record), ' · ' + y.tourney), y.honors.length ? h('div', null, y.honors.map((x) => h('span', { class: 'pill gold' }, '🏅 ' + x))) : null),
      h('div', { class: 'card' }, h('h2', null, 'Draft stock'), h('p', null, 'Mock draft range: ', h('b', null, proj)),
        h('p', { class: 'muted small' }, 'Staying develops your game (and adds upgrade points) but draft boards move on, and you only get so many years of eligibility.'),
        h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => { G.declare(S); go(); } }, 'Declare for the NBA Draft'),
          y.mustDeclare ? h('span', { class: 'muted' }, 'Senior year: eligibility is up.') : h('button', { onclick: () => { G.stayInCollege(S); alloc = {}; go(); } }, 'Stay another year'))),
      h('div', { class: 'card' }, h('h2', null, 'College stats'), collegeTable()));
  }

  function screenDraft() {
    const d = S.draft;
    const board = d.board.slice();
    const host = h('div', { class: 'card' });
    const list = h('div'); const footer = h('div');
    host.append(h('h2', null, d.year + ' NBA Draft · Night of'), h('p', { class: 'muted' }, S.player.name + ' · ' + d.college), list, footer);
    const finish = () => {
      footer.replaceChildren(h('div', { class: 'callout reveal' }, d.slot ? h('div', null, h('div', { class: 'big' }, '#' + d.slot + ' pick'), h('p', null, 'With the ' + ord(d.slot) + ' pick in the ' + d.year + ' NBA Draft, the ' + d.team + ' select ', h('b', null, S.player.name), ' of ' + d.college + '.')) : h('div', null, h('div', { class: 'big' }, 'Undrafted'), h('p', null, 'Your name was never called. You signed a minimum deal with the ' + d.team + ' right after the draft. Prove them wrong.')),
        h('p', null, 'Rookie contract: ' + money(S.contract.salary) + ' × ' + S.contract.years + ' years'), h('button', { class: 'primary', onclick: () => { G.startPro(S); alloc = {}; go(); } }, 'Start my NBA career →')));
    };
    const limit = d.slot ? Math.min(d.slot, board.length) : board.length;
    if (S.draftSeen) { board.slice(0, limit).forEach((r) => list.append(tick(r))); finish(); } else {
      let i = 0;
      const t = setInterval(() => {
        const r = board[i]; list.append(tick(r)); i++;
        if (i >= limit) { clearInterval(t); S.draftSeen = true; save(); setTimeout(finish, 700); }
      }, d.slot && d.slot <= 5 ? 700 : 220);
    }
    return h('div', null, host);
    function tick(r) { return h('div', { class: 'tick reveal' + (r.isUser ? ' me' : '') }, h('span', { class: 'n' }, '#' + r.slot), h('span', null, r.isUser ? '⭐ ' + r.name : r.name), h('span', { class: 'muted' }, r.pos + ' · ' + r.team)); }
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
      h('div', { class: 'card' }, h('div', { class: 'row' }, h('div', null, h('div', { class: 'big' }, Math.round(NBA.ovr(p))), h('div', { class: 'muted small' }, 'OVERALL')), h('div', null, h('b', null, t.name), h('div', { class: 'muted small' }, 'Last season: ' + t.wins + '-' + t.losses + ' · age ' + p.age)), h('div', null, h('b', null, money(c.salary) + ' / yr'), h('div', { class: 'muted small' }, (c.type === 'rookie' ? 'Rookie deal' : 'Contract') + ' · ' + c.left + ' yr left'))), h('h3', null, 'Ratings'), attrBars(p),
        h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'primary', onclick: () => { G.playSeason(S); go(); } }, 'Tip off the ' + NBA.seasonLabel(L.year) + ' season →'))));
  }

  let seasonView = 'feed';
  function sparkline(vals) {
    const W = 320, H = 96, pad = 14, lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), span = Math.max(1, hi - lo);
    const x = (i) => pad + (i * (W - 2 * pad)) / Math.max(1, vals.length - 1), y = (v) => H - 22 - ((v - lo) / span) * (H - 44);
    const pts = vals.map((v, i) => x(i).toFixed(1) + ',' + y(v).toFixed(1)), avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const dots = vals.map((v, i) => '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="3" fill="var(--accent)"/><text x="' + x(i).toFixed(1) + '" y="' + (y(v) - 7).toFixed(1) + '" text-anchor="middle">' + v + '</text>').join('');
    const svg = '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Points in the last games"><defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".35"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>'
      + '<line x1="' + pad + '" x2="' + (W - pad) + '" y1="' + y(avg).toFixed(1) + '" y2="' + y(avg).toFixed(1) + '" stroke="var(--muted)" stroke-dasharray="3 4" opacity=".5"/>'
      + '<polygon points="' + x(0).toFixed(1) + ',' + (H - 6) + ' ' + pts.join(' ') + ' ' + x(vals.length - 1).toFixed(1) + ',' + (H - 6) + '" fill="url(#sg)"/><polyline points="' + pts.join(' ') + '" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' + dots + '</svg>';
    return h('div', { html: svg });
  }

  // ------------------------------------------------------------ match by match
  const rClass = (r) => (r < 6 ? 'r1' : r < 6.5 ? 'r2' : r < 7 ? 'r3' : r < 8 ? 'r4' : r < 9 ? 'r5' : 'r6');
  const ratingBadge = (r, dec) => h('span', { class: 'rating sm ' + rClass(r) }, r.toFixed(dec));
  function matchTile(g, fresh) {
    const res = h('div', { class: 'm-res ' + (g.w ? 'w' : 'l') }, g.w ? 'W' : 'L');
    const where = (g.h ? 'vs ' : '@ ') + g.oc + ' ' + g.o;
    const score = (g.w ? 'W ' : 'L ') + g.f + '–' + g.a + (g.ot ? ' (OT)' : '');
    if (g.dnp) return h('div', { class: 'match dnp' + (fresh ? ' fresh' : '') }, res, h('div', { class: 'm-main' }, h('div', { class: 'm-top' }, h('span', { class: 'm-date' }, g.d), h('span', { class: 'm-vs' }, where), h('b', { class: 'm-score' }, score)), h('div', { class: 'm-box muted' }, 'Did not play · ' + g.dnp)), h('div', { class: 'rating none' }, '–'));
    const tags = g.tg.map((x) => h('span', { class: 'pill gold' }, x));
    return h('div', { class: 'match' + (fresh ? ' fresh' : '') + (g.po ? ' po' : '') }, res,
      h('div', { class: 'm-main' }, h('div', { class: 'm-top' }, h('span', { class: 'm-date' }, (g.po ? 'Game ' + g.n + ' · ' : '') + g.d), h('span', { class: 'm-vs' }, where), h('b', { class: 'm-score' }, score)),
        h('div', { class: 'm-box' }, h('b', null, g.pt), ' PTS · ', h('b', null, g.rb), ' REB · ', h('b', null, g.as), ' AST', g.st ? ' · ' + g.st + ' STL' : '', g.bk ? ' · ' + g.bk + ' BLK' : '', ' · ' + g.to + ' TO · ' + g.m + ' min'),
        h('div', { class: 'm-shoot muted' }, 'FG ' + g.fgm + '/' + g.fga + ' · 3P ' + g.tpm + '/' + g.tpa + ' · FT ' + g.ftm + '/' + g.fta + (g.ser ? ' · ' + g.ser : '')), tags.length ? h('div', null, tags) : null),
      h('div', { class: 'rating ' + rClass(g.r) }, g.r.toFixed(1)));
  }
  function screenSeasonPlay() {
    const items = S.matchLog || [], idx = S.matchIdx || 0, L = S.league, p = S.player;
    const shown = items.slice(0, idx), done = idx >= items.length;
    const reg = shown.filter((x) => x.k === 'g' && !x.po), poG = shown.filter((x) => x.k === 'g' && x.po);
    const played = reg.filter((x) => !x.dnp), wins = reg.filter((x) => x.w).length;
    const avg = (k) => (played.length ? played.reduce((a, g) => a + g[k], 0) / played.length : 0);
    const last5 = reg.slice(-5).map((g) => h('span', { class: 'dot ' + (g.w ? 'w' : 'l') }, g.w ? 'W' : 'L'));
    const regTotal = items.filter((x) => x.k === 'g' && !x.po).length, nextG = items.slice(idx).find((x) => x.k === 'g'), nextIsPo = !!(nextG && nextG.po);
    const ctl = (label, fn, cls) => h('button', { class: cls || '', onclick: fn }, label);
    const step = (n, until) => () => {
      let c = 0;
      while (S.matchIdx < items.length) {
        const it = items[S.matchIdx]; S.matchIdx++;
        if (it.k === 'g') c++;
        if (until === 'reg' && it.k === 'hdr' && /Regular season complete/.test(it.text)) break;
        if (until == null && c >= n) { while (items[S.matchIdx] && items[S.matchIdx].k === 'hdr') S.matchIdx++; break; }
      }
      save(); render();
    };
    const next = (n) => step(n, null);
    const regLeft = items.slice(idx).some((x) => x.k === 'hdr' && /Regular season complete/.test(x.text));
    const prev = S.proSeasons.length > 1 ? S.proSeasons[S.proSeasons.length - 2] : null;
    const delta = (cur, old) => (old == null ? null : h('div', { class: 'k-sub ' + (cur >= old ? 'up' : 'down') }, (cur >= old ? '▲ ' : '▼ ') + Math.abs(cur - old).toFixed(1) + ' vs last season'));
    const kpi = (cls, lbl, val, sub) => h('div', { class: 'kpi ' + cls }, h('div', { class: 'k-lbl' }, lbl), h('div', { class: 'k-val' }, val), sub || h('div', { class: 'k-sub' }, ' '));
    const allShown = shown.filter((x) => x.k === 'g' && !x.dnp);
    const last10 = allShown.slice(-10);
    const head = h('div', { class: 'card hero' }, h('div', { class: 'row' }, h('div', null, h('div', { class: 'eyebrow' }, NBA.seasonLabel(L.year) + (nextIsPo || poG.length ? ' · playoffs' : ' · regular season')), h('h1', { style: 'margin:2px 0' }, L.teams[S.teamId].name)),
        h('span', { class: 'spacer' }), h('div', { class: 'recbox' }, h('div', { class: 'big' }, wins + '-' + (reg.length - wins)), h('div', { class: 'muted small' }, reg.length + ' of ' + regTotal + ' played'))),
      h('div', { class: 'bar', style: 'margin:12px 0' }, h('i', { style: 'width:' + Math.round(100 * reg.length / Math.max(1, regTotal)) + '%' })),
      h('div', { class: 'row small', style: 'justify-content:space-between' }, h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Form'), last5.length ? last5 : h('span', { class: 'muted' }, '–')), reg.length ? h('span', { class: 'muted' }, Math.round(100 * wins / reg.length) + '% win rate') : null));
    const kpis = played.length ? h('div', { class: 'kpis' },
      kpi('hot', 'Points', f1(avg('pt')), prev ? delta(avg('pt'), prev.pts) : null), kpi('', 'Rebounds', f1(avg('rb')), prev ? delta(avg('rb'), prev.reb) : null), kpi('', 'Assists', f1(avg('as')), prev ? delta(avg('as'), prev.ast) : null),
      h('div', { class: 'kpi ink' }, h('div', { class: 'k-lbl' }, 'Avg rating'), h('div', { style: 'margin-top:8px' }, ratingBadge(played.reduce((a, g) => a + g.r, 0) / played.length, 2)), h('div', { class: 'k-sub' }, played.length + ' games'))) : h('div', { class: 'card' }, h('p', { class: 'muted' }, 'Opening night is coming up. Grab your headphones, then tap the button below.'));
    const sparkCard = last10.length >= 3 ? h('div', { class: 'card' }, h('div', { class: 'row' }, h('h3', { style: 'margin:0' }, 'Last ' + last10.length + ' games'), h('span', { class: 'spacer' }), h('span', { class: 'small muted' }, last10.filter((g) => g.w).length + '-' + last10.filter((g) => !g.w).length + ' · ' + f1(last10.reduce((a, g) => a + g.pt, 0) / last10.length) + ' ppg · ' + (100 * last10.reduce((a, g) => a + g.fgm, 0) / Math.max(1, last10.reduce((a, g) => a + g.fga, 0))).toFixed(0) + '% FG')), sparkline(last10.map((g) => g.pt))) : null;
    const viewSeg = h('div', { class: 'seg' }, h('button', { class: seasonView === 'feed' ? 'on' : '', onclick: () => { seasonView = 'feed'; render(); } }, 'Feed'), h('button', { class: seasonView === 'log' ? 'on' : '', onclick: () => { seasonView = 'log'; render(); } }, 'Game log'));
    const controls = done
      ? h('div', { class: 'card donebar' }, h('p', null, 'That is the season in the books.'), h('button', { class: 'primary big-btn', onclick: () => { S.stage = 'season_recap'; go(); } }, 'See the season recap →'))
      : h('div', { class: 'card ctl-card' }, h('div', { class: 'row' }, ctl(nextIsPo ? 'Next playoff game ▶' : 'Next match ▶', next(1), 'primary big-btn'), ctl('Sim 5', next(5)), ctl('Sim 10', next(10)),
        regLeft ? ctl('Finish regular season', step(0, 'reg')) : null, h('span', { class: 'spacer' }), ctl('Skip to recap »', () => { S.matchIdx = items.length; S.stage = 'season_recap'; go(); })));
    const pv = S.prevIdx != null ? S.prevIdx : idx;
    const feed = shown.map((x, i) => [x, i]).reverse().map(([x, i]) => (x.k === 'hdr' ? h('div', { class: 'divider' + (i >= pv ? ' fresh' : '') }, x.text) : matchTile(x, i >= pv)));
    S.prevIdx = idx;
    const logRows = shown.filter((x) => x.k === 'g').reverse();
    const logCard = h('div', { class: 'card ink gl' }, h('div', { class: 'scroll' }, h('table', null, h('thead', null, h('tr', null, ['Date', 'Match', 'Result', 'MIN', 'PTS', 'REB', 'AST', 'FG', 'RTG'].map((x, i) => h('th', { class: i < 3 ? 'l' : '' }, x)))),
      h('tbody', null, logRows.map((g) => g.dnp
        ? h('tr', { class: 'muted' }, h('td', null, g.d), h('td', { class: 'l' }, (g.h ? 'vs ' : '@ ') + g.o), h('td', { class: 'l' }, h('span', { class: 'res ' + (g.w ? 'w' : 'l') }, g.w ? 'W' : 'L'), ' ' + g.f + '-' + g.a), h('td', { colspan: 6 }, 'DNP · ' + g.dnp))
        : h('tr', null, h('td', null, g.d), h('td', { class: 'l' }, (g.h ? 'vs ' : '@ ') + g.o + (g.po ? ' · G' + g.n : '')), h('td', { class: 'l' }, h('span', { class: 'res ' + (g.w ? 'w' : 'l') }, g.w ? 'W' : 'L'), ' ' + g.f + '-' + g.a), h('td', null, g.m), h('td', null, g.pt), h('td', null, g.rb), h('td', null, g.as), h('td', null, g.fgm + '/' + g.fga), h('td', null, h('span', { class: 'rating ' + rClass(g.r) }, g.r.toFixed(1)))))))));
    return h('div', { class: 'sp' }, head, kpis, controls, sparkCard, h('div', { class: 'row', style: 'margin:6px 0' }, h('h3', { style: 'margin:0' }, 'Matches'), h('span', { class: 'spacer' }), viewSeg), seasonView === 'log' ? logCard : h('div', { class: 'feed' }, feed));
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
      h('div', { class: 'kpi ink' }, h('div', { class: 'k-lbl' }, 'Avg rating'), h('div', { style: 'margin-top:8px' }, r.avgRating ? ratingBadge(r.avgRating, 2) : '–'), h('div', { class: 'k-sub' }, r.wins + '-' + r.losses)));
    return h('div', null, h('h1', null, r.label + ' season recap'), recKpis,
      h('div', { class: 'card' }, h('p', { class: 'muted' }, r.team + ' · age ' + r.age + ' · OVR ' + r.ovr + ' · ' + money(r.salary)),
        h('div', { class: 'grid stats' }, statBox(f1(r.stl), 'SPG'), statBox(f1(r.blk), 'BPG'), statBox(r.gp, 'Games'), statBox(r.td, 'Triple-doubles')),
        h('p', { style: 'margin-top:10px' }, 'FG ' + pct(r.fgp) + '% · 3P ' + pct(r.tpp) + '% · FT ' + pct(r.ftp) + '% · TS ' + pct(r.ts) + '% · ' + f1(r.mins) + ' mpg · High game ' + r.high),
        h('p', null, 'Triple-doubles: ', h('b', null, r.td), ' · Double-doubles: ', h('b', null, r.dd), r.g40 ? ' · 40-pt games: ' + r.g40 : '', r.avgTD ? ' · 🔥 AVERAGED A TRIPLE-DOUBLE' : ''),
        h('p', null, h('b', null, r.wins + '-' + r.losses), ' · ' + r.playoffText), awardPills, ranks, r.injury ? h('div', { class: 'callout' }, '🩹 ' + r.injury) : null, r.events.map((e) => h('div', { class: 'callout' }, e))),
      r.playoff ? h('div', { class: 'card' }, h('h2', null, 'Playoffs' + (r.legend ? ' 🔥 LEGENDARY RUN' : r.heater ? ' 🔥 on a heater' : '')), h('div', { class: 'grid stats' }, statBox(f1(r.playoff.pts), 'PPG'), statBox(f1(r.playoff.reb), 'RPG'), statBox(f1(r.playoff.ast), 'APG')), h('p', { class: 'muted small' }, r.playoff.gp + ' games · ' + pct(r.playoff.ts) + ' TS% · ' + r.playoff.td + ' triple-doubles · high ' + r.playoff.high),
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
        h('h3', null, 'Demand a trade (pick a destination)'), d.tradeOptions.map((o) => h('div', { class: 'card' }, h('div', { class: 'row' }, h('div', null, h('b', null, o.name), h('div', { class: 'small muted' }, o.label + ' (' + o.wins + ' wins last year) · you would be a ' + o.role)), h('span', { class: 'spacer' }), h('button', { onclick: () => done(G.decide(S, 'trade', { teamId: o.teamId })) }, 'Request trade')))));
    }
    out.push(h('div', { class: 'row', style: 'margin-top:14px' }, confirmBtn('Retire from basketball', 'danger', () => { G.retire(S); S.decision = null; go(); })));
    return h('div', null, out);
  }

  function seasonTable(rows, playoffs) {
    const head = playoffs ? ['Season', 'Age', 'Team', 'GP', 'MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'FG%', '3P%', 'TS%', 'TD'] : ['Season', 'Age', 'Team', 'W-L', 'GP', 'MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'FG%', '3P%', 'FT%', 'TS%', 'TD', 'OVR'];
    return h('div', { class: 'scroll' }, h('table', null, h('thead', null, h('tr', null, head.map((x, i) => h('th', { class: i === 2 ? 'l' : '' }, x)))),
      h('tbody', null, rows.map((s) => playoffs
        ? h('tr', null, h('td', null, s.label), h('td', null, s.age), h('td', { class: 'l' }, s.team), h('td', null, s.gp), h('td', null, f1(s.mins)), h('td', null, f1(s.pts)), h('td', null, f1(s.reb)), h('td', null, f1(s.ast)), h('td', null, f1(s.stl)), h('td', null, f1(s.blk)), h('td', null, pct(s.fgp)), h('td', null, pct(s.tpp)), h('td', null, pct(s.ts)), h('td', null, s.td))
        : h('tr', null, h('td', null, s.label), h('td', null, s.age), h('td', { class: 'l' }, s.team), h('td', null, s.wins + '-' + s.losses), h('td', null, s.gp), h('td', null, f1(s.mins)), h('td', null, f1(s.pts)), h('td', null, f1(s.reb)), h('td', null, f1(s.ast)), h('td', null, f1(s.stl)), h('td', null, f1(s.blk)), h('td', null, pct(s.fgp)), h('td', null, pct(s.tpp)), h('td', null, pct(s.ftp)), h('td', null, pct(s.ts)), h('td', null, s.td), h('td', null, s.ovr))))));
  }
  function careerTotals() {
    const ps = S.proSeasons; if (!ps.length) return null;
    const gp = ps.reduce((a, s) => a + s.gp, 0), tot = (k) => ps.reduce((a, s) => a + s[k] * s.gp, 0);
    return { gp, pts: tot('pts') / gp, reb: tot('reb') / gp, ast: tot('ast') / gp, totPts: Math.round(tot('pts')), totReb: Math.round(tot('reb')), totAst: Math.round(tot('ast')), totStl: Math.round(tot('stl')), totBlk: Math.round(tot('blk')), td: S.career.td };
  }
  function playoffTotals() {
    const pl = S.playoffLines; if (!pl.length) return null;
    const gp = pl.reduce((a, s) => a + s.gp, 0), tot = (k) => pl.reduce((a, s) => a + (s[k] || 0) * s.gp, 0);
    return { gp, pts: tot('pts') / gp, reb: tot('reb') / gp, ast: tot('ast') / gp, stl: tot('stl') / gp, blk: tot('blk') / gp, totPts: Math.round(tot('pts')), totReb: Math.round(tot('reb')), totAst: Math.round(tot('ast')), td: pl.reduce((a, s) => a + (s.td || 0), 0), runs: pl.length };
  }

  function careerBody() {
    const ps = S.proSeasons, ct = careerTotals(), aw = S.career.awards;
    const wrap = h('div');
    if (!ct) { wrap.append(h('p', { class: 'muted' }, 'No NBA games yet.'), S.collegeYears.length ? collegeTable() : null); return wrap; }
    wrap.append(h('h3', null, 'Regular season career'), h('div', { class: 'grid stats' }, statBox(f1(ct.pts), 'PPG'), statBox(f1(ct.reb), 'RPG'), statBox(f1(ct.ast), 'APG'), statBox(ct.totPts.toLocaleString(), 'Total points'), statBox(ct.totReb.toLocaleString(), 'Total rebounds'), statBox(ct.totAst.toLocaleString(), 'Total assists'), statBox(ct.totStl.toLocaleString(), 'Total steals'), statBox(ct.totBlk.toLocaleString(), 'Total blocks'), statBox(ct.gp.toLocaleString(), 'Games'), statBox(ct.td, 'Triple-doubles (' + (100 * ct.td / ct.gp).toFixed(1) + '%)'), statBox(money(S.earnings), 'Career earnings · ' + money(S.earnings26 || S.earnings) + ' in 2026 $')),
      (() => { const pt = playoffTotals(); return pt ? h('div', null, h('h3', null, 'Playoff career'), h('div', { class: 'grid stats' }, statBox(f1(pt.pts), 'PPG'), statBox(f1(pt.reb), 'RPG'), statBox(f1(pt.ast), 'APG'), statBox(f1(pt.stl), 'SPG'), statBox(f1(pt.blk), 'BPG'), statBox(pt.gp.toLocaleString(), 'Playoff games'), statBox(pt.totPts.toLocaleString(), 'Playoff points'), statBox(pt.totReb.toLocaleString(), 'Playoff rebounds'), statBox(pt.totAst.toLocaleString(), 'Playoff assists'), statBox(S.career.titles || 0, 'Championships'))) : null; })(),
      h('div', { style: 'margin-top:8px' }, Object.keys(aw).map((k) => h('span', { class: 'pill gold' }, aw[k] + '× ' + k))),
      h('p', { class: 'muted small' }, 'Seasons averaging a triple-double: ' + S.career.tdSeasons + (S.career.td30Seasons ? ' (' + S.career.td30Seasons + ' with 30+ ppg)' : '')),
      h('h3', null, 'Regular season'), seasonTable(ps, false));
    if (S.playoffLines.length) wrap.append(h('h3', null, 'Playoffs'), seasonTable(S.playoffLines, true));
    if (S.collegeYears.length) wrap.append(h('h3', null, 'College'), collegeTable());
    return wrap;
  }
  function showCareer() {
    const m = document.getElementById('modal');
    m.classList.remove('hidden'); m.replaceChildren(h('div', { class: 'box' }, h('div', { class: 'row' }, h('h2', { style: 'margin:0' }, S.player.name + ' · Career'), h('span', { class: 'spacer' }), h('button', { onclick: () => m.classList.add('hidden') }, 'Close ✕')), careerBody()));
    m.onclick = (e) => { if (e.target === m) m.classList.add('hidden'); };
  }

  function screenRetired() {
    const hof = S.hof, p = S.player;
    return h('div', null, h('h1', null, p.name + ' retires'),
      h('div', { class: 'card' }, h('div', { class: 'big', style: 'color:' + (hof.hall ? 'var(--gold)' : 'inherit') }, hof.hall ? '🏛️ ' + hof.tier : hof.tier), h('p', { class: 'muted' }, 'Legacy score ' + hof.score + ' (Hall of Fame line: 85) · ' + S.proSeasons.length + ' seasons · ' + D.ARCHETYPES[p.arch].name + ' · hidden ceiling was ' + Math.round(p.ceiling) + ' · ' + S.stars + '★ recruit' + (S.draft && S.draft.slot ? ' · drafted #' + S.draft.slot : ' · undrafted'))),
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
    const m = { scouting: screenScouting, college_pick: screenCollegePick, college_ready: screenCollegeReady, college_decision: screenCollegeDecision, draft_night: screenDraft, training: screenTraining, pro_ready: screenProReady, season_play: screenSeasonPlay, season_recap: screenRecap, decision: screenDecision, retired: screenRetired };
    if (S.flash && st !== 'decision') { app.append(h('div', { class: 'callout' }, S.flash)); S.flash = null; }
    app.append((m[st] || screenCreate)());
  }
  function boot() { S = null; draft.name = ''; render(); }
  window.__NBA_UI = { get state() { return S; } };
  boot();
})();
