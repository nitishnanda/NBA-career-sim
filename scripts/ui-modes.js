// v120 in the real UI: the duel with a real star, GM Mode after retirement, Legacy Mode (play as your son)
const path = require('path');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const errors = [], page = await (await browser.newContext({ viewport: { width: 1000, height: 1400 } })).newPage();
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  page.on('dialog', (d) => d.accept());
  const ok = (name, cond, info) => { console.log(name, cond ? 'OK' : 'MISMATCH', info ? JSON.stringify(info).slice(0, 300) : ''); if (!cond) errors.push(name + ' ' + JSON.stringify(info || '').slice(0, 300)); };
  const text = () => page.evaluate(() => document.body.innerText);
  // confirmBtn asks twice (arm, then 'Tap again to confirm'): click the same button twice
  const clickConfirm = async (re) => { const b = await page.$('button:text-matches("' + re + '", "i")'); if (!b) return; await b.click(); await page.waitForTimeout(150); await b.click(); await page.waitForTimeout(300); };
  await page.goto('file://' + path.resolve(__dirname, '../dist/index.html'));
  // 1. the duel: a pro two seasons in, on the career page
  await page.evaluate(() => { const N = window.NBA, G = N.Game; N.setSeed(4410); const st = G.newCareer({ name: 'Duel Test', pos: 'SF', arch: 'scorer', stars: 4 });
    try { G.auto(st, { onDecision: (s) => { if (s.proSeasons.length >= 2) throw 'stop'; } }); } catch (e) { if (e !== 'stop') throw e; }
    st.autoPlay = false; st.autoDecide = false; st.matchIdx = st.matchLog.length; st.stage = 'season_recap'; st.dec.pending = null; st.decResult = null; st.noSocial = true; window.__NBA_UI.state = st; window.__NBA_UI.go(); });
  await page.waitForTimeout(500); await page.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find((x) => /^career/i.test(x.textContent.trim())); if (b) b.click(); }); await page.waitForTimeout(500);
  let t = await text(); ok('DUEL panel on the career page', /The duel: /i.test(t) && /The debate/i.test(t), t.slice(0, 120));
  const dn = await page.evaluate(() => { const S = window.__NBA_UI.state; const it = S.matchLog.find((x) => window.NBA.Arc.duelNight(S, x) && x.f != null); return it ? window.NBA.Arc.duelNight(S, it) : null; });
  ok('DUEL night line (both scores, H2H)', !dn || (dn.his != null && /\d/.test(String(dn.w))), dn);
  // 2. GM Mode: a retired career takes a job, signs, asks for a trade, plays a season, drafts, moves on
  await page.evaluate(() => { const N = window.NBA, G = N.Game; N.setSeed(9); const st = G.newCareer({ name: 'Front Office', pos: 'SF', arch: 'scorer', stars: 4 }); G.auto(st, { decisions: false });
    st.autoPlay = false; window.__NBA_UI.state = st; window.__NBA_UI.go(); });
  await page.waitForTimeout(600); t = await text(); ok('GM offers on the retired screen', /GM Mode: run a front office/i.test(t) && /Take the job/i.test(t));
  await clickConfirm('^Take the job'); await page.waitForTimeout(400); t = await text();
  ok('GM screen opens', /President of basketball operations/i.test(t) && /Owner patience/i.test(t) && /Free agents/i.test(t), t.slice(0, 160));
  await page.click('button:text-matches("^Sign$", "i") >> nth=-1'); await page.waitForTimeout(300); t = await text(); ok('GM sign a free agent (signed or a cap reason)', /(Signed|mid-level|minimum|roster is full)/i.test(t));
  await page.evaluate(() => { const cb = document.querySelector('table.st input[type=checkbox]'); if (cb) cb.click(); }); await page.waitForTimeout(200);
  await page.selectOption('select', { index: 3 }); await page.waitForTimeout(200);
  await page.evaluate(() => { const cbs = Array.from(document.querySelectorAll('section.panel')).find((s) => /Trade/.test(s.querySelector('h2') ? s.querySelector('h2').textContent : '')).querySelectorAll('input[type=checkbox]'); if (cbs.length) cbs[cbs.length - 1].click(); }); await page.waitForTimeout(200);
  await page.click('button:text-matches("^Ask them$", "i")'); await page.waitForTimeout(200); t = await text(); ok('GM trade quote answers', /(would take it|want a little more|hang up|laughed|Salaries do not match|roster would end up|cannot be moved)/i.test(t));
  await clickConfirm('^Play the .* season'); await page.waitForTimeout(600); t = await text();
  ok('GM season result', /(Missed the playoffs|Made the playoffs|Champions)/.test(t) && /owner expected/i.test(t), t.slice(0, 200));
  const hasDraft = await page.$('button:text-matches("^Pick$", "i")'); if (hasDraft) { await hasDraft.click(); await page.waitForTimeout(300); t = await text(); ok('GM draft pick', /You are taking/.test(t)); }
  await clickConfirm('^On to the offseason'); await page.waitForTimeout(800); t = await text(); ok('GM next offseason', /offseason/i.test(t) && /Free agents/i.test(t));
  const yr = await page.evaluate(() => window.__NBA_UI.state.gm.seasons.length); ok('GM season recorded', yr === 1, { yr });
  await clickConfirm('^Step down'); await page.waitForTimeout(400); t = await text(); ok('GM step down back to retirement', /You ran the /i.test(t) && /retires/i.test(t));
  // 3. Legacy Mode: start the son's career from the retired screen
  await clickConfirm('^Start the next generation'); await page.waitForTimeout(1500); t = await text();
  const lg = await page.evaluate(() => { const S = window.__NBA_UI.state; return { stage: S.stage, gen: S.legacy && S.legacy.gen, parent: S.legacy && S.legacy.parent.name, year: S.league.year, name: S.player.name }; });
  ok('LEGACY son starts in the same league, years later', lg.stage === 'scouting' && lg.gen === 2 && lg.parent === 'Front Office' && lg.year > 2040, lg);
  ok('LEGACY scouting callout', /Front Office's son/.test(t), t.slice(0, 200));
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close(); process.exit(errors.length ? 1 : 0);
})();
