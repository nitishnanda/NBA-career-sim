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
  await shot('01-create');
  await page.click('text=Get scouted');
  await page.waitForSelector('text=Choose my college', { timeout: 15000 });
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
  for (let i = 0; i < 40; i++) {
    console.log('season', i); await page.click('text=/Tip off the .* season/');
    await page.waitForSelector('text=Sim next game');
    if (i === 0) {
      await shot('06b-opening-night');
      for (let k = 0; k < 3; k++) await page.click('button:has-text("Sim next game")');
      await shot('06c-three-games');
      await page.click('button:has-text("Instant")');
      await page.click('button:has-text("Sim to All-Star")');
      await shot('06d-all-star');
      await page.click('nav button:has-text("Around the league")'); await shot('06f-league');
      await page.click('nav button:has-text("Career")'); await shot('06g-career');
      await page.click('nav button:has-text("Season")');
      await page.click('button:has-text("Sim to playoffs")');
      await shot('06h-reg-season-done');
      const po = await page.$('button:has-text("Sim next playoff game")');
      if (po) { await po.click(); await shot('06e-playoffs'); }
      const sk = await page.$('button:has-text("Skip to recap")'); if (sk) await sk.click(); else await page.click('button:has-text("Season recap")');
    } else if (i === 1) {
      await page.click('button:has-text("Instant")'); for (let k = 0; k < 3; k++) await page.click('button:has-text("Sim 10")');
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
    const btn = (await page.$('button:has-text("Stay")')) || (await page.$('button:has-text("Re-sign")'));
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
