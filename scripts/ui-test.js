const path = require('path');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
let PG_DBG = null;
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const mobile = process.env.MOBILE === '1';
  const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1000, height: 900 } });
  const page = await ctx.newPage(); PG_DBG = page;
  const errors = [];
  page.on('pageerror', (e) => { errors.push('PAGEERROR ' + e.message); console.log('PAGEERROR', e.message, (e.stack || '').split('\n').slice(0, 4).join(' | ')); });
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
  page.on('dialog', (d) => d.accept());
  const shot = (n) => page.screenshot({ path: process.env.SHOTS + '/' + (mobile ? 'm-' : '') + n + '.png', fullPage: true });
  await page.goto('file://' + path.resolve(__dirname, process.env.DIST ? '../dist/index.html' : '../index.html'));
  await page.fill('input[type=text]', 'Nitish Nanda');
  await page.click('text=Box-Score Dominator');
  await page.click('button:has-text("C")');
  // size: Random shows a rolled body (and re-rolls), Choose myself gives three sliders; either way the body reaches the player and the scouting report
  const bodyNow = () => page.evaluate(() => ({ v: Array.from(document.querySelectorAll('.szv')).map((e) => e.textContent).join(' / '), mode: document.querySelector('.szcard .seg2 button.on').textContent.trim(), sliders: document.querySelectorAll('.szcard input[type=range]').length }));
  const r0 = await bodyNow(); await page.click('button:has-text("Re-roll")'); const r1 = await bodyNow();
  let reroll = r0.v !== r1.v; for (let k = 0; !reroll && k < 6; k++) { await page.click('button:has-text("Re-roll")'); reroll = (await bodyNow()).v !== r0.v; }
  console.log('SIZE random', reroll && r0.sliders === 0 ? 'OK' : 'MISMATCH', JSON.stringify({ first: r0.v, rerolled: r1.v, sliders: r0.sliders })); if (!(reroll && r0.sliders === 0)) errors.push('SIZE random');
  await page.click('button:has-text("Choose myself")');
  const sz0 = await bodyNow();
  await page.$eval('input[aria-label=Height]', (el) => { el.value = el.max; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.$eval('input[aria-label=Weight]', (el) => { el.value = 10; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.$eval('input[aria-label=Wingspan]', (el) => { el.value = 3; el.dispatchEvent(new Event('input', { bubbles: true })); });
  const sz1 = await page.evaluate(() => ({ v: Array.from(document.querySelectorAll('.szv')).map((e) => e.textContent).join(' / '), note: document.querySelector('.szcard').innerText.replace(/\s+/g, ' ').slice(0, 330) }));
  console.log('SIZE create', JSON.stringify({ mode: sz0.mode, sliders: sz0.sliders, tallest: sz1.v, note: sz1.note }));
  await shot('01-create');
  await page.click('text=Get scouted');
  await page.waitForSelector('text=Next: high school', { timeout: 15000 });
  const szS = await page.evaluate(() => ({ ht: window.__NBA_UI.state.player.ht, wt: window.__NBA_UI.state.player.wt, ws: window.__NBA_UI.state.player.ws, line: (document.body.innerText.match(/C · [^\n]*lb[^\n]*/) || [''])[0] }));
  const okSz = sz0.sliders === 3 && szS.ht === 86 && szS.wt === Math.round(249 + 2.5 * (86 - 82.8)) + 10 && szS.ws === 86 + 4 + 3 && /7'2"/.test(szS.line) && /7'9" wingspan/.test(szS.line);
  console.log('SIZE scouting', okSz ? 'OK' : 'MISMATCH', JSON.stringify(szS)); if (!okSz) errors.push('SIZE scouting ' + JSON.stringify(szS));
  await shot('02-scouting');
  // high school: three paths, each with a read (not a number); then the college pick, then the role you take in your first year
  await page.click('text=Next: high school');
  await page.waitForSelector('h1:has-text("finish high school")'); await shot('02b-high-school');
  const hs = await page.evaluate(() => ({ opts: document.querySelectorAll('.wkcard').length, vibes: document.querySelectorAll('.wkcard .vibe').length, stage: window.__NBA_UI.state.stage }));
  const okHs = hs.opts === 3 && hs.vibes === 3 && hs.stage === 'hs'; console.log('HIGH SCHOOL', okHs ? 'OK' : 'MISMATCH', JSON.stringify(hs)); if (!okHs) errors.push('HS ' + JSON.stringify(hs));
  await page.click('.wkcard >> nth=0 >> button');
  await page.waitForSelector('text=Choose my college');
  const hsj = await page.evaluate(() => window.__NBA_UI.state.dec.journal.length); if (hsj !== 1) errors.push('HS journal ' + hsj);
  await page.click('text=Choose my college');
  await shot('03-college-pick');
  await page.click('.opt >> nth=0');
  await page.waitForSelector('h1:has-text("what is your role")'); await shot('03b-college-role');
  await page.click('.wkcard >> nth=1 >> button');
  const role = await page.evaluate(() => window.__NBA_UI.state.collegeRole); console.log('COLLEGE role', role === 'fit' ? 'OK' : 'MISMATCH', role); if (role !== 'fit') errors.push('role ' + role);
  await page.click('text=Play the season');
  await page.waitForSelector('text=Declare for the NBA Draft');
  await shot('04-college-decision');
  await page.click('text=Declare for the NBA Draft');
  // the combine: measurements shown are the player's own, the tests can be taken, the scouts' report moves the projection, and the draft board is the whole 60-pick class with him on it
  await page.waitForSelector('text=NBA Draft Combine'); await shot('04b-combine-measured');
  const cm0 = await page.evaluate(() => { const S = window.__NBA_UI.state, cb = S.player.cmb, shown = Array.from(document.querySelectorAll('.ctv')).map((e) => e.textContent); return { shown, stage: S.stage, tested: cb.tested, hasTests: !!cb.tests, hb: cb.hb, wt: cb.wt, ws: cb.ws }; });
  const okM = cm0.stage === 'combine' && !cm0.tested && !cm0.hasTests && cm0.shown.length === 4 && cm0.shown[1] === cm0.wt + ' lb';
  console.log('COMBINE measured', okM ? 'OK' : 'MISMATCH', JSON.stringify(cm0)); if (!okM) errors.push('COMBINE measured ' + JSON.stringify(cm0));
  await page.click('button:has-text("Take all the tests")'); await page.waitForSelector('text=Mock drafts'); await shot('04c-combine-tested');
  const cm1 = await page.evaluate(() => { const S = window.__NBA_UI.state, cb = S.player.cmb, c = S.combine; return { tested: cb.tested, rows: document.querySelectorAll('.trow').length, bonus: +cb.bonus.toFixed(2), post: !!(c.mocks && c.mocks.outlets.length === 4 && c.mocks.ranks.before.length === 4 && c.mocks.ranks.after.length === 4 && c.mocks.ranks.alt.length === 4), bars: document.querySelectorAll('.ctile .pbar, .trow .pbar').length }; });
  const okT = cm1.tested && cm1.rows === 6 && cm1.post && cm1.bars === 3 + 6 + 1;
  console.log('COMBINE tested', okT ? 'OK' : 'MISMATCH', JSON.stringify(cm1)); if (!okT) errors.push('COMBINE tested ' + JSON.stringify(cm1));
  // workouts: invited teams with their pick and need, three visits used, each gives a read, the rest can be skipped
  await page.click('button:has-text("On to the workouts")'); await page.waitForSelector('text=Pre-draft workouts'); await shot('04d-workouts');
  const w0 = await page.evaluate(() => ({ cards: document.querySelectorAll('.wkcard').length, stage: window.__NBA_UI.state.stage, left: document.querySelector('.card h2').innerText }));
  for (let k = 0; k < 3; k++) await page.click('button:has-text("Work out for them") >> nth=0');
  const w1 = await page.evaluate(() => { const S = window.__NBA_UI.state; return { reads: document.querySelectorAll('.wkres').length, done: Object.keys(S.workouts.done).length, left: document.querySelector('.card h2').innerText, btn: document.querySelector('.card button.primary').innerText }; });
  const okW = w0.cards >= 6 && w0.stage === 'workouts' && /4 of 4/i.test(w0.left) && w1.reads === 3 && w1.done === 3 && /1 of 4/i.test(w1.left) && /skip 1/i.test(w1.btn);
  console.log('WORKOUTS', okW ? 'OK' : 'MISMATCH', JSON.stringify({ w0, w1 })); if (!okW) errors.push('WORKOUTS ' + JSON.stringify({ w0, w1 }));
  await page.click('button:has-text("Head to the draft")');
  // draft night is paced: nothing about where he is projected is on the page, the first picks take seconds, and the player's own pick is held until Continue
  await page.waitForSelector('button:has-text("Reveal everything")'); await page.waitForTimeout(500);
  const spoil = await page.evaluate(() => /about #|projected|final mock/i.test(document.querySelector('.dgrid').innerText));
  const t0 = Date.now(); await page.waitForSelector('.prow:not(.pending)', { timeout: 15000 }); const firstPickMs = Date.now() - t0;
  const okP = !spoil && firstPickMs >= 2500; console.log('DRAFT pacing', okP ? 'OK' : 'MISMATCH', JSON.stringify({ spoil, firstPickMs }));
  if (!okP) errors.push('DRAFT pacing ' + JSON.stringify({ spoil, firstPickMs }));
  // a trade alert can hold the controls for a few seconds, and an early pick has nothing to skip to
  await page.waitForSelector('button:has-text("Skip to my pick"), button:has-text("Continue →")', { timeout: 30000 });
  if (await page.$('button:has-text("Skip to my pick")')) await page.click('button:has-text("Skip to my pick")');
  const hold = await page.waitForSelector('button:has-text("Continue →")', { timeout: 90000 }).then(() => page.evaluate(() => ({ rows: document.querySelectorAll('.prow:not(.pending)').length, big: !!document.querySelector('.bigpick'), wrapShown: /landing spot/i.test(document.body.innerText) })));
  const pickN = await page.evaluate(() => window.__NBA_UI.state.draft.slot);
  const okH = hold.big && !hold.wrapShown && (pickN ? hold.rows === pickN : true); console.log('DRAFT held pick', okH ? 'OK' : 'MISMATCH', JSON.stringify(hold));
  if (!okH) errors.push('DRAFT held pick ' + JSON.stringify(hold));
  // after the pick: if his rights are traded there is a second held scene (breaking news), then the wrap-up
  await page.click('button:has-text("Continue →")'); let sawTrade = false;
  for (let k = 0; k < 10; k++) { if (await page.evaluate(() => /your landing spot/i.test(document.body.innerText))) break; if (await page.evaluate(() => /draft-night trade/i.test(document.querySelector('.onclock').innerText))) { sawTrade = true; await shot('05b-user-trade'); await page.click('button:has-text("Continue →")'); } else await page.waitForTimeout(1000); }
  await page.waitForSelector('text=Your landing spot'); await page.click('button:has-text("Reveal everything")');
  await page.waitForSelector('text=Start my NBA career', { timeout: 30000 });
  const dr = await page.evaluate(() => { const S = window.__NBA_UI.state, d = S.draft, rows = Array.from(document.querySelectorAll('.prow')), me = rows.filter((r) => r.classList.contains('me')), pos = rows.indexOf(me[0]);
    return { rows: rows.length, board: d.board.length, me: me.length, slot: d.slot, rowSlot: pos + 1, rounds: document.querySelectorAll('.rhead').length, userRowOnBoard: d.board.filter((r) => r.isUser).length, tested: d.tested }; });
  const okD = dr.rows === 60 && dr.board === 60 && dr.rounds === 2 && (dr.slot ? dr.me === 1 && dr.rowSlot === dr.slot : dr.me === 0);
  console.log('DRAFT board', okD ? 'OK' : 'MISMATCH', JSON.stringify(dr)); if (!okD) errors.push('DRAFT board ' + JSON.stringify(dr));
  const tr = await page.evaluate(() => { const S = window.__NBA_UI.state, d = S.draft, ev = d.trades || [], bad = ev.filter((e) => { const a = d.board[e.slot - 1], b = d.board[e.other - 1]; return !(a.via && b.via && a.nick === e.upNick && b.nick === e.downNick); }).length;
    const ut = d.userTrade, row = d.board.find((r) => r.isUser); return { events: ev.length, badEvents: bad, userTraded: !!ut, landing: d.teamId, expectLanding: ut ? ut.toId : d.draftedById, stTeam: S.teamId, rowNick: row ? row.nick : null, drafter: ut ? ut.fromNick : null, tradedPill: !!document.querySelector('.prow.me .pill.gold') }; });
  const okTr = tr.events >= 3 && tr.events <= 6 && tr.badEvents === 0 && tr.landing === tr.expectLanding && tr.stTeam === tr.landing && (!tr.userTraded || (tr.rowNick === tr.drafter && tr.tradedPill));
  console.log('DRAFT trades', okTr ? 'OK' : 'MISMATCH', JSON.stringify(tr)); if (!okTr) errors.push('DRAFT trades ' + JSON.stringify(tr));
  await shot('05-draft-night');
  await page.click('text=Start my NBA career');
  const trainLoop = async () => {
    await page.click('text=Auto-allocate');
    await page.click('text=Confirm & advance the offseason');
    await page.click('text=Continue →');
    await campStep();
  };
  // preseason camp: ask the most accessible mentors until one says yes or the asks run out, then solo work; the journal has to say what happened
  let campN = 0;
  const campStep = async () => {
    await page.waitForSelector('h1:has-text("Preseason camp")'); campN++;
    const c0 = await page.evaluate(() => ({ cards: document.querySelectorAll('.mcard').length, vibes: document.querySelectorAll('.mcard .vibe').length, asksLeft: (document.body.innerText.match(/(\d) of 2 asks left/i) || [])[1] }));
    for (let k = 0; k < 2; k++) {
      const taken = await page.evaluate(() => !!document.querySelector('.mcard.t3'));
      if (taken) break;
      const btns = await page.$$('.mcard button:not([disabled])'); if (!btns.length) break;
      await btns[btns.length - 1].click();   // the least famous mentor is the likeliest yes
    }
    const c1 = await page.evaluate(() => ({ said: document.querySelectorAll('.jmsg').length, yes: document.querySelectorAll('.mcard.t3').length, no: document.querySelectorAll('.mcard.t0').length }));
    const okC = c0.cards >= 5 && c0.vibes === c0.cards && c0.asksLeft === '2' && c1.said === c1.yes + c1.no && c1.said >= 1;
    if (campN === 1) { console.log('CAMP', okC ? 'OK' : 'MISMATCH', JSON.stringify({ c0, c1 })); if (!okC) errors.push('CAMP ' + JSON.stringify({ c0, c1 })); await shot('06a-camp'); }
    if (await page.$('button:has-text("Start the season")')) await page.click('button:has-text("Start the season")');
    else if (await page.$('.mcard.t3')) await page.click('button:has-text("Start the season")');
    else await page.click('h3:has-text("own game") ~ div button >> nth=0');
    if (campN === 1) { const j = await page.evaluate(() => window.__NBA_UI.state.dec.journal.map((e) => e.kind).join()); if (j !== 'hs,role,camp') errors.push('CAMP journal ' + j); else console.log('CAMP journal OK (hs, role, camp)'); }
  };
  await trainLoop();
  await shot('06-pro-ready');
  // the shot chart against the box scores of the same games: its own totals, the summed box scores and the marks drawn on the court must all agree
  const shotCheck = async (label) => {
    const r = await page.evaluate(() => {
      const S = window.__NBA_UI.state, shown = S.matchLog.slice(0, S.matchIdx).filter((x) => x.k === 'g' && !x.dnp), anyPo = shown.some((g) => g.po);
      const scope = !anyPo ? 'reg' : S.shotScope || 'po', games = shown.filter((g) => (scope === 'po' ? g.po : !g.po)), sum = (k) => games.reduce((t, g) => t + (g[k] || 0), 0);
      const cw = document.querySelector('.courtwrap'); if (!cw) return { missing: true };
      const svg = cw.querySelector('svg.court'), made = svg ? svg.querySelectorAll(':scope > circle').length : 0, miss = svg ? svg.querySelectorAll(':scope > g').length - 1 : 0;
      return { scope, games: games.length, shots: cw.dataset.shots, box: cw.dataset.box, state: [sum('fga'), sum('fgm'), sum('tpa'), sum('tpm')].join('/'), drawn: (made + miss) + '/' + made, tab: S.shotTab || 'all' };
    });
    const ok = !r.missing && r.shots === r.box && r.box === r.state && (r.tab !== 'all' || r.drawn === r.shots.split('/').slice(0, 2).join('/'));
    console.log('SHOT CHECK', label, ok ? 'OK' : 'MISMATCH', JSON.stringify(r));
    if (!ok) errors.push('SHOT CHECK ' + label + ' ' + JSON.stringify(r));
  };
  // the trade deadline stops the games: answer it (stay put, or sign when waived) and carry on; the first one is checked
  let dlN = 0;
  const dlFix = async () => {
    if (!(await page.$('h1:has-text("Trade deadline")'))) return false;
    dlN++; const info = await page.evaluate(() => ({ cards: document.querySelectorAll('.card').length, text: document.querySelector('.card p') ? document.querySelector('.card p').textContent.slice(0, 60) : '' }));
    if (dlN === 1) console.log('DEADLINE seen', JSON.stringify(info));
    const stay = await page.$('button:not(.primary):text-matches("^(Stay|Continue the season)")');
    if (stay) await stay.click(); else await page.click('button.primary:has-text("Sign")');
    return true;
  };
  const scopeTo = (lbl) => page.evaluate((t) => { const b = Array.from(document.querySelectorAll('.seg2 button')).find((x) => x.textContent === t); if (b) b.click(); }, lbl);
  for (let i = 0; i < 40; i++) {
    console.log('season', i); await page.click('text=/Tip off the .* season/');
    await page.evaluate(() => { window.__NBA_UI.state.autoDec = true; window.__NBA_UI.render(); });   // the coach makes the in-game calls here; the decision screens are tested in ui-market.js
    await page.waitForSelector('text=Sim next game');
    if (i === 0) {
      await shot('06b-opening-night');
      for (let k = 0; k < 3; k++) await page.click('button:has-text("Sim next game")');
      await shot('06c-three-games'); await shotCheck('3 games');
      if (mobile) { await page.click('.mtabs button:has-text("Plan")'); await page.click('.popt:has-text("Scoring")'); await page.waitForSelector('.popt.on:has-text("Scoring")'); await page.click('.mtabs button:has-text("Box")'); } else { await page.click('.gplan button:has-text("Scoring")'); await page.waitForSelector('.gplan button.on:has-text("Scoring")'); } await page.click('button:has-text("Sim next game")'); await shotCheck('after a game-plan switch');
      await page.click('button:has-text("Instant")');
      await page.click('button:has-text("Sim to All-Star")');
      await shot('06d-all-star'); await shotCheck('All-Star break');
      await page.click('nav button:has-text("Around the league")'); await shot('06f-league'); { const mb = await page.evaluate(() => ({ cons: /Consensus/i.test(document.body.innerText), ballots: /The ballots/i.test(document.body.innerText), outlets: ['ESPN', 'The Athletic', 'Sports Illustrated', 'Bleacher Report', 'Yahoo Sports'].every((x) => document.body.innerText.includes(x)) })); console.log('MEDIA ballots', mb.cons && mb.ballots && mb.outlets ? 'OK' : 'MISMATCH', JSON.stringify(mb)); if (!(mb.cons && mb.ballots && mb.outlets)) throw new Error('media ballots missing'); }
      await page.click('.tlink >> nth=3'); await page.waitForSelector('text=Roster and stats'); await shot('06j-league-team'); await page.selectOption('.tsel', { index: 10 }); await page.waitForSelector('text=Roster and stats'); await page.click('button:has-text("← League")'); await page.waitForSelector('.tlink');
      await page.click('nav button:has-text("Team")'); await shot('06i-team');
      await page.click('nav button:has-text("Career")'); await shot('06g-career');
      await page.click('nav button:has-text("Season")');
      await page.click('button:has-text("Sim to playoffs")');
      if (await dlFix()) await page.click('button:has-text("Sim to playoffs")');
      await shot('06h-reg-season-done'); await shotCheck('regular season done');
      const po = await page.$('button:has-text("Sim next playoff game")');
      if (po) { await po.click(); await shot('06e-playoffs'); await shotCheck('playoff game 1');
        await scopeTo('Regular season'); await shotCheck('back to the regular-season chart');
        if (mobile) await page.click('.mtabs button:has-text("Shots")'); await shot('06k-shots-regular'); if (mobile) await page.click('.mtabs button:has-text("Box")');
        await scopeTo('Playoffs'); }
      const sk = await page.$('button:has-text("Skip to recap")'); if (sk) await sk.click(); else await page.click('button:has-text("Season recap")');
    } else if (i === 1) {
      await page.click('button:has-text("Instant")'); for (let k = 0; k < 3; k++) await page.click('button:has-text("Sim 10")'); await shotCheck('season 2, 30 games');
      await page.click('nav button:has-text("Career")');
      const chk = await page.evaluate(() => {
        const S = window.__NBA_UI.state, shown = S.matchLog.slice(0, S.matchIdx).filter((x) => x.k === 'g' && !x.po && !x.dnp);
        const prevTot = Math.round(S.proSeasons.slice(0, -1).reduce((a, x) => a + x.totPts, 0)), live = shown.reduce((a, g) => a + g.pt, 0);
        const labels = Array.from(document.querySelectorAll('#app .statbox')).map((el) => el.textContent);
        const cell = labels.find((t) => /Total points/i.test(t)) || '';
        const cur = S.proSeasons[S.proSeasons.length - 1];
        return { shown: shown.length, expected: prevTot + live, cell, finalSeasonTot: Math.round(cur.totPts), awardsNow: JSON.stringify(S.pre.career.awards), hasLiveRow: /●/.test(document.body.textContent) };
      });
      console.log('LEAK CHECK', JSON.stringify(chk));
      await page.click('nav button:has-text("Season")');
      await page.click('button:has-text("Instant")'); await page.click('button:has-text("Sim to All-Star")'); await page.click('button:has-text("Sim to playoffs")'); if (await dlFix()) await page.click('button:has-text("Sim to playoffs")'); while (await page.$('button:has-text("Sim next playoff game")')) await page.click('button:has-text("Sim next playoff game")'); await page.click('button:has-text("Season recap")'); }
    else { const sk = await page.$('button:has-text("Skip to recap")'); if (sk) await sk.click(); else await page.click('button:has-text("Season recap")'); }
    await page.waitForSelector('text=Offseason decisions');
    if (i === 0) await shot('07-recap');
    await page.click('text=Offseason decisions');
    if (i === 0) await shot('08-decision');
    const retire = await page.$('text=No team has an offer');
    if (retire || i >= 5) { await page.click('text=Retire from basketball'); await page.click('text=Tap again to confirm'); break; }
    const tr = i === 2 ? await page.$('button:has-text("Request trade")') : null; if (i === 2) await shot('08b-trade-options');
    let btn = tr || (await page.$('button:has-text("Stay")')) || (await page.$('button:has-text("Re-sign")'));
    if (!btn) {   // your club let you walk: pitch around the league and take the first offer (or retire when nobody wants you)
      const signed = await page.evaluate(() => { const S = window.__NBA_UI.state, G = window.NBA.Game, d = S.decision; for (const id of Object.keys(d.neg || {})) { const c = d.neg[id]; if (c.closed) continue; let r = G.negotiate(S, +id, { salary: c.minSal, years: 1, role: 'Role player' }); if (r.counter) r = G.acceptCounter(S, +id); if (r.ok) { S.decision = null; window.__NBA_UI.go(); return true; } } return false; });
      if (signed) { await trainLoop(); continue; }
      btn = null; if (!btn) { await page.click('text=Retire from basketball'); await page.waitForSelector('text=retires'); break; }
    }
    await btn.click();
    await trainLoop();
  }
  await page.waitForSelector('text=retires');
  await shot('09-retired');
  await page.click('text=📋 Career').catch(() => {});
  await shot('10-career-modal');
  await page.reload();
  const resume = await page.$('text=Saved career found');
  console.log('save/resume banner:', resume ? 'shown' : 'MISSING');
  if (resume) { await page.click('text=Continue'); await page.waitForSelector('text=retires'); console.log('resume OK'); }
  await shot('11-resumed');
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch(async (e) => { console.error('TEST FAILED', e.message.split('\n')[0]); if (PG_DBG) { try { console.error(await PG_DBG.evaluate(() => JSON.stringify({ stage: window.__NBA_UI.state.stage, idx: window.__NBA_UI.state.matchIdx, pend: window.__NBA_UI.state.dec && window.__NBA_UI.state.dec.pending && window.__NBA_UI.state.dec.pending.id, text: document.querySelector('#app').innerText.slice(0, 260) }))); } catch (x) { /* ignore */ } } process.exit(1); });
