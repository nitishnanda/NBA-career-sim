const path = require('path');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const mobile = process.env.MOBILE === '1';
  const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 800 } : { width: 1000, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
  page.on('dialog', (d) => d.accept());
  const shot = (n) => page.screenshot({ path: process.env.SHOTS + '/' + n + '.png', fullPage: true });
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
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
    await page.click('text=/Sim the .* season/');
    await page.waitForSelector('text=Offseason decisions');
    if (i === 0) await shot('07-recap');
    await page.click('text=Offseason decisions');
    if (i === 0) await shot('08-decision');
    const retire = await page.$('text=No team has an offer');
    if (retire || i >= 5) { await page.click('text=Retire from basketball'); break; }
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
