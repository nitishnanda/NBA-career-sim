const path = require('path');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const mobile = process.env.MOBILE === '1';
  const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1000, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
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
  await page.waitForSelector('text=Choose my college', { timeout: 15000 });
  const szS = await page.evaluate(() => ({ ht: window.__NBA_UI.state.player.ht, wt: window.__NBA_UI.state.player.wt, ws: window.__NBA_UI.state.player.ws, line: (document.body.innerText.match(/C · [^\n]*lb[^\n]*/) || [''])[0] }));
  const okSz = sz0.sliders === 3 && szS.ht === 86 && szS.wt === Math.round(249 + 2.5 * (86 - 82.8)) + 10 && szS.ws === 86 + 5 + 3 && /7'2"/.test(szS.line) && /7'10" wingspan/.test(szS.line);
  console.log('SIZE scouting', okSz ? 'OK' : 'MISMATCH', JSON.stringify(szS)); if (!okSz) errors.push('SIZE scouting ' + JSON.stringify(szS));
  await shot('02-scouting');
  await page.click('text=Choose my college');
  await shot('03-college-pick');
  await page.click('.opt >> nth=0');
  await page.click('text=Play the season');
  await page.waitForSelector('text=Declare for the NBA Draft');
  await shot('04-college-decision');
  await page.click('text=Declare for the NBA Draft');
  await page.waitForSelector('text=Start my NBA career', { timeout: 30000 });
  await shot('05-draft-night');
  await page.click('text=Start my NBA career');
  const trainLoop = async () => {
    await page.click('text=Auto-allocate');
    await page.click('text=Confirm & advance the offseason');
    await page.click('text=Continue →');
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
  const scopeTo = (lbl) => page.evaluate((t) => { const b = Array.from(document.querySelectorAll('.seg2 button')).find((x) => x.textContent === t); if (b) b.click(); }, lbl);
  for (let i = 0; i < 40; i++) {
    console.log('season', i); await page.click('text=/Tip off the .* season/');
    await page.waitForSelector('text=Sim next game');
    if (i === 0) {
      await shot('06b-opening-night');
      for (let k = 0; k < 3; k++) await page.click('button:has-text("Sim next game")');
      await shot('06c-three-games'); await shotCheck('3 games');
      if (mobile) { await page.click('.mtabs button:has-text("Plan")'); await page.click('.popt:has-text("Scoring")'); await page.waitForSelector('.popt.on:has-text("Scoring")'); await page.click('.mtabs button:has-text("Box")'); } else { await page.click('.gplan button:has-text("Scoring")'); await page.waitForSelector('.gplan button.on:has-text("Scoring")'); } await page.click('button:has-text("Sim next game")'); await shotCheck('after a game-plan switch');
      await page.click('button:has-text("Instant")');
      await page.click('button:has-text("Sim to All-Star")');
      await shot('06d-all-star'); await shotCheck('All-Star break');
      await page.click('nav button:has-text("Around the league")'); await shot('06f-league');
      await page.click('.tlink >> nth=3'); await page.waitForSelector('text=Roster and stats'); await shot('06j-league-team'); await page.selectOption('.tsel', { index: 10 }); await page.waitForSelector('text=Roster and stats'); await page.click('button:has-text("← League")'); await page.waitForSelector('.tlink');
      await page.click('nav button:has-text("Team")'); await shot('06i-team');
      await page.click('nav button:has-text("Career")'); await shot('06g-career');
      await page.click('nav button:has-text("Season")');
      await page.click('button:has-text("Sim to playoffs")');
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
      await page.click('button:has-text("Instant")'); await page.click('button:has-text("Sim to All-Star")'); await page.click('button:has-text("Sim to playoffs")'); while (await page.$('button:has-text("Sim next playoff game")')) await page.click('button:has-text("Sim next playoff game")'); await page.click('button:has-text("Season recap")'); }
    else { const sk = await page.$('button:has-text("Skip to recap")'); if (sk) await sk.click(); else await page.click('button:has-text("Season recap")'); }
    await page.waitForSelector('text=Offseason decisions');
    if (i === 0) await shot('07-recap');
    await page.click('text=Offseason decisions');
    if (i === 0) await shot('08-decision');
    const retire = await page.$('text=No team has an offer');
    if (retire || i >= 5) { await page.click('text=Retire from basketball'); await page.click('text=Tap again to confirm'); break; }
    const tr = i === 2 ? await page.$('button:has-text("Request trade")') : null; if (i === 2) await shot('08b-trade-options');
    const btn = tr || (await page.$('button:has-text("Stay")')) || (await page.$('button:has-text("Re-sign")'));
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
})().catch((e) => { console.error('TEST FAILED', e.message); process.exit(1); });
