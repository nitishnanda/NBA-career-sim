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
  const shot = (n) => page.screenshot({ path: process.env.SHOTS + '/' + (mobile ? 'm-' : '') + n + '.png', fullPage: n !== '06c-three-games' && n !== '06b-opening-night' });
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
    await page.click('text=/Tip off the .* season/');
    await page.waitForSelector('text=Next match');
    if (i === 0) {
      await shot('06b-opening-night');
      for (let k = 0; k < 3; k++) await page.click('text=Next match');
      await shot('06c-three-games');
      await page.click('text=Finish regular season');
      await shot('06d-reg-season-done');
      const po = await page.$('text=Next playoff game');
      if (po) { await po.click(); await po.click().catch(() => {}); await shot('06e-playoffs'); }
      const sk = await page.$('text=Skip to recap'); if (sk) await sk.click(); else await page.click('text=See the season recap');
    } else if (i === 1) { await page.click('text=Finish regular season'); while (await page.$('text=/Next playoff game/')) await page.click('text=/Next playoff game/'); await page.click('text=See the season recap'); }
    else { const sk = await page.$('text=Skip to recap'); if (sk) await sk.click(); else await page.click('text=See the season recap'); }
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
