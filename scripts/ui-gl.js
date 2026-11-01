// the G League in the real UI: draft-night assignment, a G League season, the club's verdict, the call-up
const path = require('path');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const errors = [], page = await (await browser.newContext({ viewport: { width: 1000, height: 1200 } })).newPage();
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  await page.goto('file://' + path.resolve(__dirname, '../dist/index.html'));
  await page.evaluate(() => { const N = window.NBA, G = N.Game; N.setSeed(9703); const st = G.newCareer({ name: 'GL Test', pos: 'SF', arch: 'twoway', stars: 2 }); st.autoPlay = true; const o = G.collegeOptions(st); G.chooseCollege(st, o[o.length - 1].id); G.playCollege(st); G.declare(st); G.runCombine(st, true); G.enterDraft(st); st.draft.glOffer = true; st.draft.stashOffer = false; st.autoPlay = false; st.draftSeen = true; window.__NBA_UI.state = st; window.__NBA_UI.go(); });
  await page.waitForSelector('text=G League or the roster?', { timeout: 15000 }); const dt = await page.evaluate(() => document.body.textContent); const okW = /What the .* think/.test(dt) && /two-way/i.test(dt) && /(would keep you on the NBA roster|could find you a roster spot|want you to develop first)/.test(dt); console.log('GL offer shown + tied to the club', okW ? 'OK' : 'MISMATCH'); if (!okW) errors.push('draft card ' + dt.slice(0, 200)); const hasJoin = !!(await page.$('button:text-matches("Join the NBA roster|Push for a roster spot")')); if (!hasJoin) errors.push('no roster/push button');
  await page.click('text=Sign a two-way contract'); await page.waitForTimeout(400);
  await page.evaluate(() => { const U = window.__NBA_UI, st = U.state, G = window.NBA.Game; G.train(st, G.autoAlloc(st.player, G.trainingInfo(st).points)); U.go(); });
  await page.waitForSelector('text=Play the season →'); await page.click('text=Play the season →');
  await page.waitForSelector('text=/What the .* think/'); const t = await page.evaluate(() => document.body.textContent);
  const ok = /G League/.test(t) && /call-up|Call-up/.test(t) && /(want you back|open to it|want you to develop more)/.test(t); console.log('GL decision + verdict', ok ? 'OK' : 'MISMATCH'); if (!ok) errors.push('decision ' + t.slice(0, 300));
  const btn = await page.$('button:text-matches("Join the .* roster|Push for a spot anyway")'); if (!btn) errors.push('no join/push button');
  if (btn) { await btn.click(); await page.waitForTimeout(600); }
  const stg = await page.evaluate(() => window.__NBA_UI.state.stage); console.log('stage after', stg); if (!['training', 'intl_decision'].includes(stg)) errors.push('stage ' + stg);
  await browser.close(); console.log(errors.length ? 'errors: ' + JSON.stringify(errors).slice(0, 500) : 'errors: none'); process.exit(errors.length ? 1 : 0);
})();
