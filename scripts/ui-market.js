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
  await page.waitForSelector('text=Sim next game');
  const arm = () => page.evaluate(() => {
    const S = window.__NBA_UI.state, G = window.NBA.Game; if (!S.matchLog || S.dlDone) return null; window.__NBA_UI.saveSnap();
    if (S.dec.pending && S.dec.pending.id === 'deadline') return null;
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
      await page.click('.wkcard button >> nth=0'); await page.waitForTimeout(100); await arm(); return 'clutch';
    }
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
  await page.waitForSelector('text=pitch to other clubs');
  const fa0 = await page.evaluate(() => ({ cards: document.querySelectorAll('button').length, pitch: Array.from(document.querySelectorAll('button')).filter((b) => /Pitch yourself/.test(b.textContent)).length, vibes: document.querySelectorAll('.vibe').length, own: /want you back|letting you walk/.test(document.body.innerText) }));
  const okF0 = fa0.pitch >= 6 && fa0.vibes >= 6 && fa0.own; console.log('FA market', okF0 ? 'OK' : 'MISMATCH', JSON.stringify(fa0)); if (!okF0) errors.push('FA market ' + JSON.stringify(fa0));
  await shot('21-free-agency');
  for (let k = 0; k < 12; k++) { const b = await page.$('button:has-text("Pitch yourself")'); if (!b) break; await b.click(); await page.waitForTimeout(50); }
  const fa1 = await page.evaluate(() => ({ rejected: document.querySelectorAll('.small.bad').length, sign: Array.from(document.querySelectorAll('button')).filter((b) => /^Sign$/.test(b.textContent)).length, pitchLeft: Array.from(document.querySelectorAll('button')).filter((b) => /Pitch yourself/.test(b.textContent)).length }));
  const okF1 = fa1.pitchLeft === 0 && fa1.rejected + fa1.sign >= 6; console.log('FA pitches answered', okF1 ? 'OK' : 'MISMATCH', JSON.stringify(fa1)); if (!okF1) errors.push('FA pitches ' + JSON.stringify(fa1));
  await shot('22-free-agency-pitched');
  // ---- late career: a 34-year-old is asked how he wants to play the late years; a loyalty deal and ring-chase discounts show up in the market
  await page.evaluate(() => { const S = window.__NBA_UI.state; S.player.age = 34; S.player.tr = Object.assign({}, S.player.tr, { stay: 1 }); S.decision = null; S.dec.pending = null; window.__NBA_UI.go(); });
  await page.waitForSelector('text=How do you want to play the late years');
  const lt = await page.evaluate(() => ({ opts: document.querySelectorAll('.wkcard').length, loyal: /Loyalty deal/.test(document.body.innerText), ring: /ring chase/.test(document.body.innerText), tour: /farewell season/i.test(document.body.innerText), age: window.__NBA_UI.state.player.age }));
  const okL = lt.opts >= 4 && lt.loyal; console.log('LATE CAREER card', okL ? 'OK' : 'MISMATCH', JSON.stringify(lt)); if (!okL) errors.push('LATE ' + JSON.stringify(lt)); await shot('26-late-career');
  await page.click('.wkcard:has-text("Chase wins") button');
  const lt2 = await page.evaluate(() => { const S = window.__NBA_UI.state; return { depth: S.dec.season.depth, mins: S.dec.season.minsMult, journal: S.dec.journal.slice(-1)[0].text }; });
  const okL2 = lt2.depth === 1.6 && lt2.mins === 0.95 && /smaller role/.test(lt2.journal); console.log('LATE CAREER stance applied', okL2 ? 'OK' : 'MISMATCH', JSON.stringify(lt2)); if (!okL2) errors.push('LATE stance ' + JSON.stringify(lt2));
  // ---- 3. nobody wants you: every club says no, your own is letting you walk: the career ends
  await page.evaluate(() => { const S = window.__NBA_UI.state; S.decision = window.NBA.Game.decisionOptions(S); S.decision.resign = null; S.decision.market.forEach((m) => { m.yes = false; }); window.__NBA_UI.render(); });
  for (let k = 0; k < 12; k++) { const b = await page.$('button:has-text("Pitch yourself")'); if (!b) break; await b.click(); await page.waitForTimeout(50); }
  await page.waitForSelector('text=no team wants you');
  await shot('23-nobody-wants-you');
  await page.click('button:has-text("Retire from basketball")'); await page.waitForSelector('text=retires');
  console.log('FA nobody wants you OK');
  console.log('errors:', errors.length ? errors : 'none'); await browser.close();
})().catch(async (e) => { console.error('TEST FAILED', e.message); if (PG) { try { console.error(await PG.evaluate(() => JSON.stringify({ stage: window.__NBA_UI.state.stage, idx: window.__NBA_UI.state.matchIdx, pend: window.__NBA_UI.state.dec && window.__NBA_UI.state.dec.pending && window.__NBA_UI.state.dec.pending.id, text: document.querySelector('#app').innerText.slice(0, 300) }))); } catch (x) { /* ignore */ } } process.exit(1); });
