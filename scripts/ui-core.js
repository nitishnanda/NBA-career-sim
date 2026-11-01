// v102 in the real UI: build your team / national team / mentor (offseason), summer program (training), load management + captain + contract year (preseason), series moments + recaps, history watch, badges
const path = require('path');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const errors = [], page = await (await browser.newContext({ viewport: { width: 1000, height: 1400 } })).newPage();
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  const ok = (name, cond, info) => { console.log(name, cond ? 'OK' : 'MISMATCH', info ? JSON.stringify(info).slice(0, 300) : ''); if (!cond) errors.push(name + ' ' + JSON.stringify(info || '').slice(0, 300)); };
  await page.goto('file://' + path.resolve(__dirname, '../dist/index.html'));
  // a star 6 years in (age ~25-26), stopped at the offseason
  await page.evaluate(() => {
    const N = window.NBA, G = N.Game; N.setSeed(4410); const st = G.newCareer({ name: 'Core Test', pos: 'SF', arch: 'generational', stars: 5 });
    try { G.auto(st, { onDecision: (s) => { if (s.proSeasons.length >= 6) throw 'stop'; } }); } catch (e) { if (e !== 'stop') throw e; }
    st.autoPlay = false; st.autoDecide = false; st.matchIdx = st.matchLog.length; st.stage = 'decision'; st.decision = null; st.noSocial = true;
    window.__NBA_UI.state = st; window.__NBA_UI.go();
  });
  await page.waitForTimeout(800);
  let t = await page.evaluate(() => document.body.innerText);
  ok('OFFSEASON build your team card', /Build your team/i.test(t) && /Front office/i.test(t), t.slice(0, 200));
  const nRec = await page.$$('button:text-is("Recruit")'); ok('OFFSEASON recruit targets', nRec.length >= 1, { n: nRec.length });
  if (nRec.length) { await nRec[0].click(); await page.waitForTimeout(400); t = await page.evaluate(() => document.body.innerText); ok('OFFSEASON recruit resolves', /(is coming|listened, thanked you|front office shut it down|did not take your call)/.test(t) && /They listen to you: \d+%/.test(t) && /made your move/i.test(t)); }
  // national team: force an event year and a selection
  const nt = await page.evaluate(() => { const st = window.__NBA_UI.state; while ((st.league.year + 1) % 4 !== 0) st.league.year++; const n = window.NBA.Core.nationalTeam(st); window.__NBA_UI.go(); return n && { picked: n.picked, rank: n.rank, team: n.team }; });
  await page.waitForTimeout(400); t = await page.evaluate(() => document.body.innerText);
  if (nt && nt.picked) { ok('OFFSEASON Team USA card', /Team USA wants you/i.test(t), nt); await page.click('button:text-matches("Represent")'); await page.waitForTimeout(300); t = await page.evaluate(() => document.body.innerText); ok('OFFSEASON Olympics result', /Olympics: (Gold|Silver|Bronze|Quarterfinals|Group)/.test(t), t.match(/Team USA at[^\n]*/)); }
  else console.log('national team: not selected', JSON.stringify(nt));
  // training: the summer program
  await page.evaluate(() => { const st = window.__NBA_UI.state; st.stage = 'training'; st.afterTraining = 'pro'; window.__NBA_UI.go(); });
  await page.waitForTimeout(400); t = await page.evaluate(() => document.body.innerText);
  ok('TRAINING summer program card', /Your summer program/i.test(t) && /Work out with/i.test(t));
  const pts0 = await page.evaluate(() => window.NBA.Game.trainingInfo(window.__NBA_UI.state).points);
  await page.click('.wkcard:has-text("skills coach") button'); await page.waitForTimeout(300);
  const pts1 = await page.evaluate(() => window.NBA.Game.trainingInfo(window.__NBA_UI.state).points); t = await page.evaluate(() => document.body.innerText);
  ok('TRAINING skills coach adds a point', pts1 === pts0 + 1 && /skills coach: one extra/i.test(t), { pts0, pts1 });
  // preseason: load management (age 30+), contract year
  await page.evaluate(() => { const st = window.__NBA_UI.state, G = window.NBA.Game; G.train(st, G.autoAlloc(st.player, G.trainingInfo(st).points)); st.player.age = Math.max(31, st.player.age); st.contract.left = 1; st.stage = 'pro_ready'; window.__NBA_UI.go(); });
  await page.waitForTimeout(400); t = await page.evaluate(() => document.body.innerText);
  ok('PRESEASON load management + contract year', /Load management/i.test(t) && /Contract year/i.test(t));
  await page.click('button:text-matches("Light rest")'); const lm = await page.evaluate(() => window.__NBA_UI.state.loadMgmt); ok('PRESEASON load mgmt set', lm === 'light', { lm });
  // the season: notes, the history panel, then a playoff series moment and the recap
  await page.click('button:text-matches("Tip off")'); await page.waitForTimeout(800);
  t = await page.evaluate(() => document.body.innerText); ok('SEASON history watch panel', /History watch/i.test(t) && /all-time|top-50/i.test(t));
  const mo = await page.evaluate(() => { const st = window.__NBA_UI.state, C = window.NBA.Core; const i = st.matchLog.findIndex((x, k) => x.k === 'g' && x.po && !x.pi && !x.dnp && C.momentOf(st, k)); return { i, n: st.matchLog.length, lm: st.proSeasons[st.proSeasons.length - 1].gp }; });
  if (mo.i >= 0) {
    await page.evaluate((i) => { const st = window.__NBA_UI.state; st.matchLog.forEach((x, k) => { if (k < i) { x.pd = x.ppd = x.sd = x.md = x.pcast = x.sij = x.cd = x.ad = x.smd = x.recap = 1; } else { delete x.pp; delete x.pc; x.md = x.pcast = x.sij = x.cd = 1; if (k > i) x.smd = 1; } }); st.dlDone = true; st.poPlans = { 0: 'balanced', 1: 'balanced', 2: 'balanced', 3: 'balanced' }; st.poPress = { 0: null, 1: null, 2: null, 3: null }; st.dec.pending = null; st.dec.flags.injChoice = { y: st.league.year }; st.matchIdx = i; window.__NBA_UI.go(); }, mo.i);
    await page.waitForTimeout(600); t = await page.evaluate(() => document.body.innerText);
    ok('PLAYOFFS series moment pop-up', /(Down 0-2|Win or go home|Close it out|Swing game)/i.test(t) && /Trust the system/i.test(t), t.slice(0, 160));
    await page.click('.wkcard:has-text("Trust the system") button'); await page.waitForTimeout(400); t = await page.evaluate(() => document.body.innerText);
    ok('PLAYOFFS moment result (no spoiler)', /is next/i.test(t) && !/in a win|in a loss/.test(t));
    // play to the end of that series: the recap
    await page.evaluate(() => { const st = window.__NBA_UI.state; st.decResult = null; window.__NBA_UI.go(); });
    let rc = false; for (let k = 0; k < 10 && !rc; k++) { await page.evaluate(() => { const st = window.__NBA_UI.state; st.decResult = null; st.dec.pending = null; window.__NBA_UI.go(); }); const b = await page.$('button:text-matches("^Sim next playoff game")'); if (!b) break; await b.click(); await page.waitForTimeout(250); t = await page.evaluate(() => document.body.innerText); rc = /Series recap/i.test(t); if (!rc) { const it = await page.evaluate(() => { const st = window.__NBA_UI.state; const x = st.matchLog[st.matchIdx]; if (x) { x.smd = 1; x.pd = 1; } const p = st.matchLog[st.matchIdx - 1]; if (p && !p.recap) { p.ppd = p.md = p.pcast = p.sij = 1; } return st.matchIdx; }); } }
    ok('PLAYOFFS series recap', rc, t.slice(0, 200));
  } else console.log('no series moment in this season', JSON.stringify(mo));
  // career page: badges and all-time ranks
  await page.evaluate(() => { const st = window.__NBA_UI.state; st.decResult = null; st.dec.pending = null; st.matchIdx = st.matchLog.length; st.stage = 'season_recap'; window.__NBA_UI.go(); });
  const cr = await page.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find((x) => /career/i.test(x.textContent)); if (b) b.click(); return !!b; }); await page.waitForTimeout(500);
  t = await page.evaluate(() => document.body.innerText); ok('CAREER badges + history', /Badges/i.test(t) && /History watch/i.test(t), { cr });
  await browser.close(); console.log(errors.length ? 'errors: ' + JSON.stringify(errors).slice(0, 800) : 'errors: none'); process.exit(errors.length ? 1 : 0);
})();
