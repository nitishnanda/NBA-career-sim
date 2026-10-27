// the market and the deadline in the real page: a trade deadline decision (pending set by the test), free agency pitches and rejections, a trade request
const path = require('path');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
let PG = null;
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const mobile = process.env.MOBILE === '1';
  const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1000, height: 900 } });
  const page = await ctx.newPage(); PG = page; const errors = [];
  page.on('pageerror', (e) => { errors.push('PAGEERROR ' + e.message); console.log('PAGEERROR', e.message); }); page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); }); page.on('dialog', (d) => d.accept());
  const shot = (n) => page.screenshot({ path: (process.env.SHOTS || '/s') + '/' + (mobile ? 'm-' : '') + n + '.png', fullPage: true });
  await page.goto('file://' + path.resolve(__dirname, '../dist/index.html'));
  // a career at the start of his third pro season (built the same way the UI builds it)
  await page.evaluate(() => {
    const N = window.NBA, G = N.Game, Dc = N.Decisions; N.setSeed(21);
    const st = G.newCareer({ name: 'Market Test', pos: 'SF', arch: 'scorer', stars: 4 });
    G.chooseCollege(st, G.collegeOptions(st)[0].id); G.playCollege(st); G.declare(st); G.runCombine(st, true); G.enterDraft(st); G.startPro(st);
    for (let i = 0; i < 2; i++) { G.train(st, G.autoAlloc(st.player, G.trainingInfo(st).points)); if (st.stage === 'camp') Dc.autoResolve(st); st.stage = 'pro_ready'; G.playSeason(st); const d = G.decisionOptions(st); if (d.expiring) G.decide(st, 'resign', { teamId: d.resign.teamId, salary: d.resign.salary, years: 3 }); else G.decide(st, 'stay'); }
    G.train(st, G.autoAlloc(st.player, G.trainingInfo(st).points)); if (st.stage === 'camp') Dc.autoResolve(st); st.stage = 'pro_ready';
    window.__NBA_UI.state = st; window.__NBA_UI.go();
  });
  // ---- 1. the deadline: a trade request comes due with suitors
  await page.click('text=/Tip off the .* season/');
  // the opener is a hyped game: the press room comes first. Three kinds of answer, each with the words you would say; a trash-talk option appears when a question has bite
  await page.waitForSelector('h1:has-text("Press conference")');
  const pc0 = await page.evaluate(() => ({ q: document.querySelector('.card.suspense h2').textContent, opts: document.querySelectorAll('.wkcard').length, lines: Array.from(document.querySelectorAll('.wkcard .small')).filter((e) => /^["\u201C]/.test(e.textContent)).length, why: document.querySelector('h1 + p').textContent }));
  const okPc = pc0.opts >= 3 && pc0.lines === pc0.opts && pc0.q.length > 15; console.log('PRESS screen', okPc ? 'OK' : 'MISMATCH', JSON.stringify(pc0)); if (!okPc) errors.push('PRESS ' + JSON.stringify(pc0)); await shot('27-press');
  for (let k = 0; k < 4 && (await page.$('.wkcard button')); k++) await page.click('.wkcard button >> nth=0');
  const rs = await page.evaluate(() => ({ card: !!document.querySelector('.card.suspense .jmsg'), cont: /Play the game/i.test(document.body.innerText), game: /Before game 1/i.test(document.body.innerText) })); console.log('PRESS result page', rs.card && rs.cont && rs.game ? 'OK' : 'MISMATCH', JSON.stringify(rs)); if (!(rs.card && rs.cont && rs.game)) errors.push('PRESS result page'); await shot('27b-press-result');
  await page.click('button:text-matches("Play the game|Back to the season", "i")');
  const pc1 = await page.evaluate(() => { const S = window.__NBA_UI.state; return { pd: !!S.matchLog[0].pd, meters: Object.keys(S.dec.flags).filter((k) => /media|locker/.test(k)).length }; });
  const okPc1 = pc1.pd && pc1.meters === 2; console.log('PRESS answered', okPc1 ? 'OK' : 'MISMATCH', JSON.stringify(pc1)); if (!okPc1) errors.push('PRESS answered ' + JSON.stringify(pc1));
  // the press room after a game: park the season just after a flagged game, answer, and put everything back
  { const saved = await page.evaluate(() => { const S = window.__NBA_UI.state, i = S.matchLog.findIndex((x) => x.k === 'g' && x.pp && !x.po); if (i < 0) return null; const keep = { idx: S.matchIdx, pending: S.dec.pending }; S.matchIdx = i + 1; S.dec.pending = null; window.__NBA_UI.go(); return Object.assign(keep, { i }); });
    if (!saved) { console.log('POST press: no flagged game'); errors.push('POST none'); } else {
      await page.waitForSelector('h1:has-text("Press conference")'); const pq = await page.evaluate(() => ({ sub: document.querySelector('h1 + p').textContent, q: document.querySelector('.card.suspense h2').textContent, opts: document.querySelectorAll('.wkcard').length }));
      for (let k = 0; k < 4 && (await page.$('.wkcard button')); k++) await page.click('.wkcard button >> nth=0');
      const back = await page.$('button:has-text("Back to the season")'); const okPp = /After game/.test(pq.sub) && /Final: [WL] \d+-\d+/.test(pq.sub) && pq.opts >= 3 && !!back;
      console.log('POST press', okPp ? 'OK' : 'MISMATCH', JSON.stringify(pq)); if (!okPp) errors.push('POST press ' + JSON.stringify(pq)); await shot('27c-post-press');
      if (back) await back.click();
      await page.evaluate((sv) => { const S = window.__NBA_UI.state; S.matchLog[sv.i].ppd = 0; S.matchIdx = sv.idx; S.dec.pending = sv.pending; window.__NBA_UI.go(); }, saved); } }
  await page.waitForSelector('text=Sim next game');
  const arm = () => page.evaluate(() => {
    const S = window.__NBA_UI.state, G = window.NBA.Game; if (!S.matchLog || S.dlDone) return null; window.__NBA_UI.saveSnap();
    if (S.dec.pending) return null;
    const opts = G.tradeOffers(S, 29).filter((o) => o.ok).slice(0, 3);
    S.dlChecked = true; S.dec.flags.tradeReq = S.league.year;
    S.dec.pending = { id: 'deadline', ctx: { kind: 'request', text: 'The team found suitors for your trade request.', options: opts }, step: 0, log: [] };
    return { n: opts.length, team: S.league.teams[S.teamId].name };
  });
  const set = await arm();
  // clutch moments stop the games on the way: the first one is checked (four options with a read, not a number), then answered
  let clutchN = 0;
  const simOn = async () => { const b = await page.$('button:has-text("Sim to playoffs")') || await page.$('button:has-text("Sim to All-Star")'); if (b) await b.click(); };
  const handleHold = async () => {
    const h1 = await page.textContent('h1');
    if (/Clutch time|Game 7/.test(h1)) {
      if (!clutchN++) {
        const c = await page.evaluate(() => ({ opts: document.querySelectorAll('.wkcard').length, vibes: document.querySelectorAll('.wkcard .vibe').length, numbers: /%/.test(document.querySelector('#app').innerText) }));
        const ok = c.opts === 4 && c.vibes === 4 && !c.numbers; console.log('CLUTCH options', ok ? 'OK' : 'MISMATCH', JSON.stringify(c)); if (!ok) errors.push('CLUTCH ' + JSON.stringify(c)); await shot('24-clutch');
      }
      await page.click('.wkcard button >> nth=0'); await page.waitForSelector('button:text-matches("Play the game|Back to the season", "i")'); await page.click('button:text-matches("Play the game|Back to the season", "i")'); await page.waitForTimeout(100); await arm(); return 'clutch';
    }
    if (/Press conference/.test(h1)) { for (let k = 0; k < 4 && (await page.$('.wkcard button')); k++) await page.click('.wkcard button >> nth=0'); await page.click('button:text-matches("Play the game|Back to the season", "i")'); await arm(); return 'press'; }
    return /Trade deadline/.test(h1) ? 'deadline' : /^(First Round|Conference|NBA Finals)/i.test(h1) ? 'series' : null;
  };
  await page.click('button:has-text("Instant")'); await simOn();
  for (let k = 0; k < 14; k++) { const r = await handleHold(); if (r === 'deadline') break; await simOn(); }
  await page.waitForSelector('h1:has-text("Trade deadline")');
  const dl = await page.evaluate(() => ({ idx: window.__NBA_UI.state.matchIdx, opts: Array.from(document.querySelectorAll('button')).filter((b) => /Accept trade/.test(b.textContent)).length, games: (document.body.innerText.match(/through (\d+) games/) || [])[1] }));
  console.log('DEADLINE stops at game 55', dl.games === '55' && dl.opts === set.n ? 'OK' : 'MISMATCH', JSON.stringify({ set, dl })); if (!(dl.games === '55' && dl.opts === set.n)) errors.push('DEADLINE ' + JSON.stringify({ set, dl }));
  await shot('20-deadline');
  const before = await page.evaluate(() => ({ team: window.__NBA_UI.state.league.teams[window.__NBA_UI.state.teamId].name, first: window.__NBA_UI.state.matchLog.slice(0, 54).map((g) => g.o + g.w).join() }));
  await page.click('button:has-text("Accept trade") >> nth=0');
  await page.waitForSelector('text=Sim next game');
  const after = await page.evaluate(() => { const S = window.__NBA_UI.state, rec = S.proSeasons[S.proSeasons.length - 1]; return { team: S.league.teams[S.teamId].name, rec: rec.team, prev: rec.prevTeam, first: S.matchLog.slice(0, 54).map((g) => g.o + g.w).join(), idx: S.matchIdx, wl: rec.wins + '-' + rec.losses, regW: S.matchLog.filter((x) => x.k === 'g' && !x.po && x.w).length, journal: S.dec.journal.length, flag: S.dec.flags.tradeReq, moves: S.seasonMoves.length }; });
  const okT = after.team !== before.team && after.prev === before.team && after.rec === after.team && after.first === before.first && after.idx === 57 && after.journal >= 1 && !after.flag && after.moves === 1 && after.wl.split('-')[0] === String(after.regW);
  console.log('DEADLINE trade', okT ? 'OK' : 'MISMATCH', JSON.stringify({ before: before.team, after })); if (!okT) errors.push('DEADLINE trade ' + JSON.stringify({ before: before.team, after }));
  // switching the plan afterwards keeps the move
  await page.evaluate(() => { window.NBA.Game.setStyle(window.__NBA_UI.state, 'score'); window.__NBA_UI.render(); }); await page.waitForTimeout(300);
  const keep = await page.evaluate(() => { const S = window.__NBA_UI.state; return { team: S.league.teams[S.teamId].name, moves: S.seasonMoves.length, prev: S.proSeasons[S.proSeasons.length - 1].prevTeam, hdr: S.matchLog.find((x) => x.k === 'hdr' && x.dl).text }; });
  const okK = keep.team === after.team && keep.moves === 1 && keep.prev === before.team && /traded to/.test(keep.hdr); console.log('DEADLINE survives plan change', okK ? 'OK' : 'MISMATCH', JSON.stringify(keep)); if (!okK) errors.push('DEADLINE keep ' + JSON.stringify(keep));
  await page.click('button:has-text("Instant")');
  let planDone = false;
  for (let k = 0; k < 60; k++) {
    const r = await handleHold();
    if (r === 'series') {
      const so = await page.evaluate(() => ({ opts: document.querySelectorAll('.wkcard').length, h1: document.querySelector('h1').textContent, si: Object.keys(window.__NBA_UI.state.poPlans || {}).length }));
      if (!planDone) {
        const ok = so.opts === 4; console.log('SERIES plan screen', ok ? 'OK' : 'MISMATCH', JSON.stringify(so)); if (!ok) errors.push('SERIES ' + JSON.stringify(so)); await shot('25-series-plan');
        await page.click('.wkcard:has-text("Go all-in") button');
        await page.waitForTimeout(200);
        const st1 = await page.evaluate(() => { const S = window.__NBA_UI.state; return { plan: S.poPlans[0], team: S.league.teams[S.teamId].name, moves: S.seasonMoves.length, idx: S.matchIdx, hdr: S.matchLog[S.matchIdx - 1] && S.matchLog[S.matchIdx - 1].ps }; });
        const okP = st1.plan === 'allin' && st1.team === after.team && st1.moves === 1; console.log('SERIES plan applied, trade kept', okP ? 'OK' : 'MISMATCH', JSON.stringify(st1)); if (!okP) errors.push('SERIES applied ' + JSON.stringify(st1)); planDone = true;
      } else await page.click('.wkcard:has-text("Stay balanced") button, button:has-text("Stay balanced")');
      continue;
    }
    const nx = await page.$('button:has-text("Sim next playoff game")'); if (nx) { await nx.click(); continue; }
    if (await page.$('button:has-text("Season recap")')) break;
    await simOn();
  }
  await page.click('button:has-text("Season recap")').catch(async () => { await page.click('button:has-text("Skip to recap")'); });
  await page.click('text=Offseason decisions');
  // ---- 2. free agency: an expired contract becomes a market of pitches, clubs can say no
  await page.evaluate(() => { const S = window.__NBA_UI.state; S.contract.left = 0; S.decision = null; window.__NBA_UI.go(); });
  await page.waitForSelector('text=negotiate with other clubs');
  const fa0 = await page.evaluate(() => ({ neg: Array.from(document.querySelectorAll('button')).filter((b) => /^Negotiate$/.test(b.textContent)).length, vibes: document.querySelectorAll('.vibe').length, own: /want you back|letting you walk/.test(document.body.innerText) }));
  const okF0 = fa0.neg >= 6 && fa0.vibes >= 6 && fa0.own; console.log('FA market', okF0 ? 'OK' : 'MISMATCH', JSON.stringify(fa0)); if (!okF0) errors.push('FA market ' + JSON.stringify(fa0));
  await shot('21-free-agency');

  const sweep = await page.evaluate(() => { const S = window.__NBA_UI.state, G = window.NBA.Game, d = S.decision; return Object.values(d.neg).map((c) => ({ own: c.own, desp: +c.desp.toFixed(2), alts: +c.alts.toFixed(2), fair: c.fair, p100: Math.round(G.negOdds(S, c.teamId, { salary: c.fair, years: c.pref, role: c.offered }).p * 100), p115: Math.round(G.negOdds(S, c.teamId, { salary: Math.min(c.maxSal, c.fair * 1.15), years: c.pref, role: c.offered }).p * 100), p130: Math.round(G.negOdds(S, c.teamId, { salary: Math.min(c.maxSal, c.fair * 1.3), years: c.pref, role: c.offered }).p * 100) })); });
  console.log('NEG sweep', JSON.stringify(sweep));
  // the dial: asking for more lowers the odds, asking for the minimum raises them
  await page.click('button:text-is("Negotiate") >> nth=1'); await page.waitForSelector('.negdial');
  const pct = () => page.evaluate(() => parseInt(document.querySelector('.negpct').textContent, 10));
  const setSal = async (v) => { await page.evaluate((v) => { const i = document.querySelector('.negform input[type=number]'); i.value = v; i.dispatchEvent(new Event('input')); }, v); };
  const bounds = await page.evaluate(() => { const i = document.querySelector('.negform input[type=number]'); return { min: +i.min, max: +i.max, cur: +i.value }; });
  await setSal(bounds.max); const pHi = await pct(); await setSal(bounds.min); const pLo = await pct();
  await page.selectOption('.negform select >> nth=1', 'Franchise player'); const pRole = await pct(); await page.selectOption('.negform select >> nth=1', 'Role player'); const pRole2 = await pct();
  const okD = pHi < pLo && pHi <= 40 && pRole <= pRole2 && /They would go up to about/.test(await page.evaluate(() => document.querySelector('.negform').innerText));
  console.log('NEGOTIATION dial', okD ? 'OK' : 'MISMATCH', JSON.stringify({ pHi, pLo, pRole, pRole2 })); if (!okD) errors.push('NEG dial ' + JSON.stringify({ pHi, pLo, pRole, pRole2 })); await shot('22-negotiation');
  // an absurd ask gets turned down or countered; a modest one gets a deal (counters are accepted)
  await setSal(bounds.max); await page.click('button:has-text("Make the offer")'); await page.waitForTimeout(100);
  const rej = await page.evaluate(() => ({ t: document.body.innerText.match(/(laughed|broke down|counter)[^\n]*/), closed: /Talks over|laughed off|broke down/.test(document.body.innerText), counter: /Accept counter/.test(document.body.innerText), signed: window.__NBA_UI.state.stage !== 'decision' }));
  console.log('NEGOTIATION absurd ask', JSON.stringify(rej)); if (rej.signed) errors.push('NEG absurd ask signed');
  if (rej.counter) { await page.click('button:has-text("Decline and keep haggling")'); await page.waitForTimeout(50); }
  const g = await page.evaluate(() => { const S = window.__NBA_UI.state, d = S.decision, ids = Object.keys(d.neg).filter((k) => !d.neg[k].closed && !d.neg[k].own); return { ids, n: d.neg[ids[0]] && d.neg[ids[0]].attempts }; });
  const sg = await page.evaluate(() => { const S = window.__NBA_UI.state, G = window.NBA.Game, d = S.decision, id = Object.keys(d.neg).find((k) => !d.neg[k].closed && !d.neg[k].own), c = d.neg[id]; let r = null; for (let i = 0; i < 3 && !(r && r.ok); i++) { if (c.counter) { r = G.acceptCounter(S, +id); break; } r = G.negotiate(S, +id, { salary: c.minSal, years: 1, role: 'Role player' }); } return { ok: !!(r && r.ok), contract: S.contract, stage: S.stage, journal: S.dec.journal.slice(-1)[0].text }; });
  const okS = sg.ok && sg.contract.role && /Negotiated a deal/.test(sg.journal); console.log('NEGOTIATION signed', okS ? 'OK' : 'MISMATCH', JSON.stringify(sg)); if (!okS) errors.push('NEG signed ' + JSON.stringify(sg));
  // ---- late career: a 34-year-old is asked how he wants to play the late years; a loyalty deal and ring-chase discounts show up in the market
  await page.evaluate(() => { const S = window.__NBA_UI.state; S.player.age = 34; S.stage = 'decision'; S.contract.left = 0; S.dec.season = {}; S.player.tr = Object.assign({}, S.player.tr, { stay: 1 }); S.decision = null; S.dec.pending = null; window.__NBA_UI.go(); });
  await page.waitForSelector('text=How do you want to play the late years');
  const lt = await page.evaluate(() => ({ opts: document.querySelectorAll('.wkcard').length, loyal: /Loyalty deal/.test(document.body.innerText), ring: /ring chase/.test(document.body.innerText), tour: /farewell season/i.test(document.body.innerText), age: window.__NBA_UI.state.player.age }));
  const okL = lt.opts >= 4 && lt.loyal; console.log('LATE CAREER card', okL ? 'OK' : 'MISMATCH', JSON.stringify(lt)); if (!okL) errors.push('LATE ' + JSON.stringify(lt)); await shot('26-late-career');
  await page.click('.wkcard:has-text("Chase wins") button');
  const lt2 = await page.evaluate(() => { const S = window.__NBA_UI.state; return { depth: S.dec.season.depth, mins: S.dec.season.minsMult, journal: S.dec.journal.slice(-1)[0].text }; });
  const okL2 = lt2.depth === 1.6 && lt2.mins === 0.95 && /smaller role/.test(lt2.journal); console.log('LATE CAREER stance applied', okL2 ? 'OK' : 'MISMATCH', JSON.stringify(lt2)); if (!okL2) errors.push('LATE stance ' + JSON.stringify(lt2));
  // ---- 3. nobody wants you: every club says no, your own is letting you walk: the career ends
  await page.evaluate(() => { const S = window.__NBA_UI.state; S.decision = window.NBA.Game.decisionOptions(S); S.decision.resign = null; S.decision.market.forEach((m) => { m.pitched = 'no'; m.reason = 'They went in another direction.'; }); Object.values(S.decision.neg).forEach((c) => { c.closed = 'broke'; }); window.__NBA_UI.render(); });
  await page.waitForSelector('text=no team wants you');
  await shot('23-nobody-wants-you');
  await page.click('button:has-text("Retire from basketball")'); await page.waitForSelector('text=retires');
  console.log('FA nobody wants you OK');
  // ---- the comeback: he retired, and a few years later wants back in (Jordan); then the farewell season and the warning for going back on it
  await page.waitForSelector('h3:has-text("Miss it already")');
  const cb0 = await page.evaluate(() => ({ age: window.__NBA_UI.state.player.age, hof: !!window.__NBA_UI.state.hof, opts: document.querySelectorAll('.row select option').length }));
  await page.selectOption('.row select', '2'); await shot('28-comeback-card');
  await page.click('button:has-text("Come out of retirement")'); await page.click('button:has-text("Tap again to confirm")');
  await page.waitForSelector('text=negotiate with other clubs, text=Offseason: what now', { timeout: 15000 }).catch(() => {});
  const cb1 = await page.evaluate(() => { const S = window.__NBA_UI.state; return { retired: S.retired, stage: S.stage, n: S.comebacks, age: S.player.age, last: S.dec.journal.slice(-1)[0].text }; });
  const okCb = !cb1.retired && cb1.stage === 'decision' && cb1.n === 1 && cb1.age === cb0.age + 2 && /Came out of retirement/.test(cb1.last); console.log('COMEBACK', okCb ? 'OK' : 'MISMATCH', JSON.stringify({ cb0, cb1 })); if (!okCb) errors.push('COMEBACK ' + JSON.stringify({ cb0, cb1 }));
  await page.evaluate(() => { const S = window.__NBA_UI.state; S.stage = 'pro_ready'; S.player.age = 36; S.decision = null; S.dec.season = {}; S.dec.flags.media = 0; window.__NBA_UI.go(); });
  await page.waitForSelector('text=Is this the last one');
  await page.click('button:has-text("Announce my farewell season")'); await page.click('button:has-text("Tap again to confirm")');
  await page.waitForSelector('text=Farewell season announced');
  const fw = await page.evaluate(() => { const S = window.__NBA_UI.state; return { fy: S.finalYear, fx: S.dec.season }; });
  const okFw = fw.fy === true && fw.fx.minsMult === 0.94 && fw.fx.form === 0.02 && (fw.fx.depth === -0.4 || fw.fx.depth === -0.9); console.log('FAREWELL announced', okFw ? 'OK' : 'MISMATCH', JSON.stringify(fw)); if (!okFw) errors.push('FAREWELL ' + JSON.stringify(fw));
  await page.evaluate(() => { const S = window.__NBA_UI.state; S.stage = 'decision'; S.contract = { salary: 20, years: 3, left: 2, type: 'veteran' }; S.player.tr = Object.assign({}, S.player.tr, { stay: 1 }); S.decision = null; window.__NBA_UI.go(); });
  await page.waitForSelector('text=Your farewell season is over'); await shot('29-farewell-over');
  const fo = await page.evaluate(() => ({ retire: Array.from(document.querySelectorAll('button')).some((b) => /Retire, as promised/.test(b.textContent)), again: Array.from(document.querySelectorAll('button')).some((b) => /Play another year anyway/.test(b.textContent)) }));
  await page.click('button:has-text("Play another year anyway")'); await page.click('button:has-text("Tap again to confirm")');
  await page.waitForSelector('text=it will cost you'); await shot('30-farewell-warning');
  await page.click('button:has-text("Stay")');
  const fb = await page.evaluate(() => { const S = window.__NBA_UI.state; return { fy: S.finalYear, broken: S.farewellBroken, media: S.dec.flags.media, last: S.dec.journal.filter((j) => j.kind === 'farewell').slice(-1)[0].text }; });
  const okFb = fo.retire && fo.again && fb.fy === false && fb.broken === 1 && fb.media === -1.5 && /changed your mind/.test(fb.last); console.log('FAREWELL reversed', okFb ? 'OK' : 'MISMATCH', JSON.stringify({ fo, fb })); if (!okFb) errors.push('FAREWELL reversed ' + JSON.stringify({ fo, fb }));
  console.log('errors:', errors.length ? errors : 'none'); await browser.close();
})().catch(async (e) => { console.error('TEST FAILED', e.message); if (PG) { try { console.error(await PG.evaluate(() => JSON.stringify({ stage: window.__NBA_UI.state.stage, idx: window.__NBA_UI.state.matchIdx, pend: window.__NBA_UI.state.dec && window.__NBA_UI.state.dec.pending && window.__NBA_UI.state.dec.pending.id, text: document.querySelector('#app').innerText.slice(0, 300) }))); } catch (x) { /* ignore */ } } process.exit(1); });
