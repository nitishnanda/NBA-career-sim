// the road through Europe in the real UI: create a Serbian player, pick a club, play seasons, move clubs, declare; and a UK player who takes the US road
const path = require('path');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const errors = [], ctx = await browser.newContext({ viewport: { width: 1000, height: 1100 } }), page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  await page.goto('file://' + path.resolve(__dirname, '../dist/index.html'));
  // the create screen offers the countries
  await page.waitForSelector('text=Where are you from?');
  const opts = await page.evaluate(() => Array.from(document.querySelectorAll('select option')).map((o) => o.textContent).filter((t) => /EuroLeague|United States/.test(t)));
  const okC = opts.length >= 12 && opts.some((t) => /United Kingdom/.test(t)) && opts.some((t) => /Serbia/.test(t)); console.log('INTL create options', okC ? 'OK ' + opts.length : 'MISMATCH'); if (!okC) errors.push('options ' + JSON.stringify(opts));
  await page.selectOption('select:has(option:text-matches("United States"))', 'serbia'); await page.waitForTimeout(200);
  await page.fill('input[placeholder="Your name"]', 'Nikola Test'); await page.selectOption('select:has(option[value="comfortable"])', 'comfortable'); await page.click('text=Get scouted →');
  await page.waitForSelector('text=Next: choose your club →', { timeout: 15000 }); await page.click('text=Next: choose your club →');
  await page.waitForSelector('text=Choose your first club');
  const body1 = await page.evaluate(() => document.body.textContent); const okP = /Serbia|Mega Basket|FMP Beograd/.test(body1) && /American road/.test(body1); console.log('INTL club pick', okP ? 'OK' : 'MISMATCH'); if (!okP) errors.push('pick ' + body1.slice(0, 200));
  await page.click('.opt >> nth=0'); await page.waitForSelector('text=Choose a plan first');
  for (let yr = 1; yr <= 2; yr++) {
    await page.click('button:text-is("Choose") >> nth=1'); await page.click('text=Play the season →'); await page.waitForSelector('text=Declare for the NBA Draft');
    const t = await page.evaluate(() => document.body.textContent); const okD = /Draft stock/.test(t) && /Career in Europe/.test(t) && /PPG/.test(t); console.log('INTL season ' + yr, okD ? 'OK' : 'MISMATCH'); if (!okD) errors.push('decision ' + yr);
    if (yr === 1) { const hasMove = await page.$('text=Clubs interested in you'); if (hasMove) { await page.click('.wkcard button:text("Sign") >> nth=0'); } else { await page.click('text=/^Stay with/'); }
      await page.waitForSelector('text=/Training|Upgrade|points/i', { timeout: 8000 }).catch(() => {}); await page.evaluate(() => { const U = window.__NBA_UI, st = U.state; const G = window.NBA.Game; G.train(st, G.autoAlloc(st.player, G.trainingInfo(st).points)); U.go(); }); await page.waitForSelector('text=Choose a plan first'); }
  }
  await page.click('text=Declare for the NBA Draft'); await page.waitForTimeout(500);
  const stg = await page.evaluate(() => window.__NBA_UI.state.stage); const okS = stg === 'combine'; console.log('INTL declare -> combine', okS ? 'OK' : 'MISMATCH ' + stg); if (!okS) errors.push('stage ' + stg);
  // a UK player takes the US road
  await page.evaluate(() => { const N = window.NBA, G = N.Game; N.setSeed(5); const st = G.newCareer({ name: 'Brit Test', pos: 'SG', arch: 'scorer', stars: 4, origin: 'uk', family: 'wealthy' }); st.stage = 'intl_pick'; window.__NBA_UI.state = st; window.__NBA_UI.go(); });
  await page.waitForSelector('text=Or take the American road'); await page.click('text=Go to the US instead'); await page.waitForTimeout(500);
  const us = await page.evaluate(() => ({ stage: window.__NBA_UI.state.stage, intl: window.__NBA_UI.state.origin.intl })); const okU = us.stage === 'hs' && us.intl === false; console.log('INTL UK -> US road', okU ? 'OK' : 'MISMATCH'); if (!okU) errors.push('us ' + JSON.stringify(us));
  await browser.close(); console.log(errors.length ? 'errors: ' + JSON.stringify(errors).slice(0, 500) : 'errors: none'); process.exit(errors.length ? 1 : 0);
})();
