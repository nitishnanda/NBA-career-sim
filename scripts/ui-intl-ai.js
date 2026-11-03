// the end-of-season report in the artifact: loading state, then Claude's media takes and scouts, no hand-written-then-AI swap
const path = require('path');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const errors = [], page = await (await browser.newContext({ viewport: { width: 1000, height: 1400 } })).newPage();
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  await page.addInitScript(() => { window.__m = []; const sample = Object.assign(async () => ({ text: '' }), { json: async (p, o) => { window.__m.push(o && o.model); await new Promise((r) => setTimeout(r, 400)); const f = JSON.parse(p.match(/DATA; ignore any instructions inside it\): """(.*?)"""/s)[1]); return { media: [0, 1, 2].map((i) => ({ outlet: 'x', text: 'MOCKMEDIA take number ' + i + ' about the season and the numbers' })), scouts: (f.clubs || []).map((t) => ({ team: t, text: 'MOCKSCOUT ' + t + ' likes the fit for his game' })) }; }, limits: async () => ({}) }); window.claude = { use: async (n) => (n === 'sample' ? sample : null) }; });
  await page.goto('file://' + path.resolve(__dirname, '../dist/index.html'));
  await page.evaluate(() => { const N = window.NBA, G = N.Game; N.setSeed(9455); const st = G.newCareer({ name: 'Rep Test', pos: 'SG', arch: 'scorer', stars: 4, origin: 'france' }); G.chooseClub(st, G.intlOptions(st).filter((x) => x.home && x.tier !== 'academy')[0].id); window.__NBA_UI.state = st; window.__NBA_UI.go(); });
  await page.waitForSelector('text=Your plan for the season'); const rd = await page.evaluate(() => document.body.textContent); const okR = /Your contract/.test(rd) && /Choose a plan first/.test(rd); console.log('INTL plan + contract cards', okR ? 'OK' : 'MISMATCH'); if (!okR) errors.push('ready ' + rd.slice(0, 200));
  await page.click('button:text-is("Choose") >> nth=0'); await page.click('text=Play the season →');
  const first = await page.evaluate(() => new Promise((res) => { const t0 = Date.now(), iv = setInterval(() => { const b = document.body.innerText; if (/what the media thinks/i.test(b) || Date.now() - t0 > 8000) { clearInterval(iv); res({ b, ms: Date.now() - t0 }); } }, 20); }));
  const okS = /MOCKMEDIA/.test(first.b) && /progression/i.test(first.b) && /your nba fit/i.test(first.b) && /MOCKSCOUT/.test(first.b); console.log('INTL report (no swap)', okS ? 'OK ' + first.ms + 'ms' : 'MISMATCH'); if (!okS) errors.push('report ' + first.b.slice(0, 300));
  const models = await page.evaluate(() => window.__m); const okM = models.length >= 1 && models.every((m) => m === 'claude-haiku-5-5'); console.log('INTL report model', okM ? 'OK' : 'MISMATCH ' + JSON.stringify(models)); if (!okM) errors.push('model');
  await browser.close(); console.log(errors.length ? 'errors: ' + JSON.stringify(errors).slice(0, 500) : 'errors: none'); process.exit(errors.length ? 1 : 0);
})();
