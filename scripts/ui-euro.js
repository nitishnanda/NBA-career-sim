// the EuroLeague and G League pages: tables, leaders, awards, club rosters with stats, crests; the club page as the Team tab; the pre-season camp
const path = require('path');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const errors = [], page = await (await browser.newContext({ viewport: { width: 1100, height: 1400 } })).newPage();
  page.on('pageerror', (e) => { errors.push('PAGEERROR ' + e.message); console.log(String(e.stack).split('\n').slice(0, 4).join(' | ')); });
  await page.goto('file://' + path.resolve(__dirname, '../dist/index.html'));
  await page.evaluate(() => { const N = window.NBA, G = N.Game; N.setSeed(5); const st = G.newCareer({ name: 'Euro Kid', pos: 'SF', arch: 'scorer', stars: 5, origin: 'spain' }); G.chooseClub(st, G.intlOptions(st).find((x) => x.tier === 'euroleague').id); window.__NBA_UI.state = st; window.__NBA_UI.go(); });
  await page.waitForSelector('text=Pre-season training camp'); const camp = await page.$$('button:text("Train with him")'); const okC = camp.length >= 2; console.log('EURO camp options', okC ? 'OK ' + camp.length : 'MISMATCH'); if (!okC) errors.push('camp');
  await camp[0].click(); await page.waitForTimeout(300); const cd = await page.evaluate(() => document.body.innerText); if (!/Training camp done/i.test(cd)) errors.push('camp not done');
  await page.click('button:text-is("Choose") >> nth=0'); await page.click('text=Play the season →'); await page.waitForTimeout(800);
  await page.click('nav button:has-text("League"), button:has-text("Around the league")').catch(() => {});
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find((x) => /league/i.test(x.textContent) && /around|league/i.test(x.textContent)); if (b) b.click(); }); await page.waitForTimeout(400);
  let t = await page.evaluate(() => document.body.innerText);
  const okL = /EUROLEAGUE/i.test(t) && /Regular season standings/i.test(t) && /Champions/i.test(t) && /Awards/i.test(t) && /Points/i.test(t) && /Real Madrid/.test(t) && /Panathinaikos|Olympiacos/.test(t); console.log('EURO league page', okL ? 'OK' : 'MISMATCH'); if (!okL) errors.push('league ' + t.slice(0, 300));
  await page.click('a.tl >> nth=0'); await page.waitForTimeout(300); t = await page.evaluate(() => document.body.innerText);
  const okT = /Roster and/i.test(t) && /PIR/.test(t); console.log('EURO club page', okT ? 'OK' : 'MISMATCH'); if (!okT) errors.push('club ' + t.slice(0, 200));
  await page.click('button:text("← EuroLeague")'); await page.click('button:text-is("G League")'); await page.waitForTimeout(300); t = await page.evaluate(() => document.body.innerText);
  const okG = /G League/i.test(t) && /Eastern Conference/i.test(t) && /Western Conference/i.test(t) && /affiliate/i.test(t); console.log('G LEAGUE page', okG ? 'OK' : 'MISMATCH'); if (!okG) errors.push('gl ' + t.slice(0, 200));
  await page.click('button:text-is("NBA")'); await page.waitForTimeout(300); t = await page.evaluate(() => document.body.innerText); const okN = /euroleague/i.test(t) && !/Regular season standings/i.test(t); console.log('NBA tab back', okN ? 'OK' : 'MISMATCH');
  const crests = await page.evaluate(() => document.querySelectorAll('.logo svg').length); console.log('crests drawn', crests);
  await browser.close(); console.log(errors.length ? 'errors: ' + JSON.stringify(errors).slice(0, 500) : 'errors: none'); process.exit(errors.length ? 1 : 0);
})();
