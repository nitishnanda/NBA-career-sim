// All-Star Weekend in the real page: reaching the break stops the games, the weekend runs step by step (roster, events, game, recap), the season carries on,
// and sim to the playoffs never skips it
const path = require('path');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const mobile = process.env.MOBILE === '1';
  const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1000, height: 900 } });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => { errors.push('PAGEERROR ' + e.message); console.log('PAGEERROR', e.message); }); page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); }); page.on('dialog', (d) => d.accept());
  await page.goto('file://' + path.resolve(__dirname, '../dist/index.html'));
  await page.evaluate(() => {
    const N = window.NBA, G = N.Game, Dc = N.Decisions; N.setSeed(44);
    const st = G.newCareer({ name: 'Star Test', pos: 'SF', arch: 'scorer', stars: 5 });
    G.chooseCollege(st, G.collegeOptions(st)[0].id); G.playCollege(st); G.declare(st); G.runCombine(st, true); G.enterDraft(st); G.startPro(st);
    const a = st.player.attrs; a.three = 88; a.ath = 92;   // shooter and athlete: invited to everything
    G.train(st, G.autoAlloc(st.player, G.trainingInfo(st).points)); if (st.stage === 'promise') G.choosePromise(st, 'none'); if (st.stage === 'agent') G.chooseAgent(st, 'friend'); if (st.stage === 'camp') Dc.autoResolve(st); st.stage = 'pro_ready';
    st.noPress = true; window.__NBA_UI.state = st; window.__NBA_UI.go();
  });
  const ck = (name, ok, extra) => { console.log(name, ok ? 'OK' : 'MISMATCH', extra ? JSON.stringify(extra) : ''); if (!ok) errors.push(name + ' ' + JSON.stringify(extra || '')); };
  await page.click('text=/Tip off the .* season/'); await page.waitForSelector('text=Sim next game');
  // make sure you are an All-Star this year (the selection is the award model's; here the test just guarantees one) and invited to the contests
  await page.evaluate(() => { const S = window.__NBA_UI.state, R = S.asRoster; if (!R.sel) { R.E[4] = { id: 'user', name: S.player.name, pos: S.player.pos, team: S.league.teams[S.teamId].nick, ovr: 80, starter: true, isUser: true }; R.sel = true; R.starter = true; } S.player.attrs.three = 99; S.player.attrs.ath = 99; S.player.age = 24; });
  await page.click('button:has-text("Instant")');
  for (let k = 0; k < 6; k++) {
    if (await page.$('button:has-text("Sim to All-Star")')) await page.click('button:has-text("Sim to All-Star")'); await page.waitForTimeout(400);
    if (await page.$('button:has-text("Start the weekend")')) break;
    if (/The timeline/i.test(await page.textContent('h1'))) { await page.click('.dlg-back .wkcard button >> nth=0'); await page.click('button:text-matches("Back to the season|Play the game|Continue", "i")'); }
    if (/^Injury/i.test(await page.textContent('h1'))) { await page.click('.wkcard button >> nth=0'); await page.click('button:text-matches("Back to the season|Play the game", "i")'); }
  }
  await page.waitForSelector('button:has-text("Start the weekend")');
  const intro = await page.evaluate(() => ({ idx: window.__NBA_UI.state.matchIdx, hdr: window.__NBA_UI.state.matchLog[window.__NBA_UI.state.matchIdx].asw === 1, games: window.__NBA_UI.state.matchLog.slice(0, window.__NBA_UI.state.matchIdx).filter((x) => x.k === 'g').length, starters: (document.body.innerText.match(/★/g) || []).length, h1: document.querySelector('h1').textContent }));
  ck('ASW stops at the break', intro.hdr && intro.games === 52 && intro.starters >= 10 && /All-Star Weekend/.test(intro.h1), intro);
  await page.click('button:has-text("Start the weekend")');
  const seen = [];
  for (let k = 0; k < 12; k++) {
    if (await page.$('button:has-text("Back to the season")')) break;
    if (await page.$('button:has-text("Continue →")')) { await page.click('button:has-text("Continue →")'); continue; }
    const h1 = await page.textContent('h1'); seen.push(h1);
    const n = await page.evaluate(() => document.querySelectorAll('.wkcard').length); if (!n) { errors.push('no options at ' + h1); break; }
    await page.click('.wkcard button >> nth=' + (k % n));
  }
  ck('ASW steps', ['Rising Stars', 'Three-Point Contest', 'Slam Dunk Contest', 'The All-Star Game'].filter((x) => seen.some((s) => s === x)).length >= 3 && seen.includes('The All-Star Game'), seen);
  const recap = await page.evaluate(() => /Weekend recap/i.test(document.body.innerText) && document.querySelectorAll('.jmsg').length >= 3); ck('ASW recap', recap);
  await page.click('button:has-text("Back to the season")'); await page.waitForSelector('text=Sim next game');
  const after = await page.evaluate(() => { const S = window.__NBA_UI.state, f = S.dec.flags.asw; return { done: f.done, idx: S.matchIdx, hdr: S.matchLog[S.matchIdx - 1].asw === 1, awards: (f.res.awards || []), j: S.dec.journal.filter((e) => e.kind === 'asw').length, rec: S.proSeasons[S.proSeasons.length - 1].awards.filter((a) => /Contest|Rising|All-Star Game/.test(a)).length }; });
  ck('ASW done, season carries on', after.done && after.hdr && after.j >= 3 && after.rec === after.awards.length, after);
  await page.click('button:has-text("Sim to playoffs")'); await page.waitForTimeout(500);
  const noAgain = await page.evaluate(() => !/All-Star Weekend/.test(document.querySelector('h1') ? document.querySelector('h1').textContent : '')); ck('ASW not offered twice', noAgain);
  console.log('errors:', errors.length ? errors : 'none'); await browser.close(); process.exit(errors.length ? 1 : 0);
})();
