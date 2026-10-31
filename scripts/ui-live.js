// the live game in the real page: watch a game with the clock running, skip ten minutes, run it to the end and check the live box score and score against the log;
// then a clutch game: the call comes inside the game (never as a screen before it), and the ending matches what the call made of the game
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
    const N = window.NBA, G = N.Game, Dc = N.Decisions; N.setSeed(33);
    const st = G.newCareer({ name: 'Live Test', pos: 'SF', arch: 'scorer', stars: 4 });
    G.chooseCollege(st, G.collegeOptions(st)[0].id); G.playCollege(st); G.declare(st); G.runCombine(st, true); G.enterDraft(st); G.startPro(st);
    G.train(st, G.autoAlloc(st.player, G.trainingInfo(st).points)); if (st.stage === 'promise') G.choosePromise(st, 'none'); if (st.stage === 'agent') G.chooseAgent(st, 'friend'); if (st.stage === 'camp') Dc.autoResolve(st); st.stage = 'pro_ready';
    st.noPress = true; window.__NBA_UI.state = st; window.__NBA_UI.go();
  });
  await page.click('text=/Tip off the .* season/'); await page.waitForSelector('text=Sim next game');
  await page.check('label:has-text("Watch games live") input'); await page.waitForSelector('button:has-text("Watch next game live")');
  const ck = (name, ok, extra) => { console.log(name, ok ? 'OK' : 'MISMATCH', extra ? JSON.stringify(extra) : ''); if (!ok) errors.push(name + ' ' + JSON.stringify(extra || '')); };
  let decs = 0;
  const finish = async () => {   // run the live game fast, take the call if one comes up, stop at the final
    await page.evaluate(() => { const A = window.__NBA_UI.live; A.speed = 4000; });
    for (let k = 0; k < 40; k++) {
      if (await page.$('button:has-text("Continue →")')) return 'done';
      if (await page.$('.dlg-back')) { const h1 = await page.textContent('.dlg-back h1'); if (/Last possession|Game 7/.test(h1)) return 'call'; decs++; await page.click('.dlg-back .wkcard button >> nth=' + (decs % 2)); await page.waitForTimeout(80); continue; }
      await page.waitForTimeout(250);
    }
    return 'stuck';
  };
  const compare = () => page.evaluate(() => { const A = window.__NBA_UI.live, it = window.__NBA_UI.state.matchLog[A.idx], b = A.box; const keys = ['pt', 'fga', 'fgm', 'tpa', 'tpm', 'fta', 'ftm', 'rb', 'or', 'as', 'st', 'bk', 'to', 'pf']; return { diff: keys.filter((k) => (b[k] || 0) !== (it[k] || 0)), score: A.sc.join('-') + ' vs ' + it.f + '-' + it.a, shown: document.querySelector('.lvscore').textContent + '-' + document.querySelectorAll('.lvscore')[1].textContent, ok: A.sc[0] === it.f && A.sc[1] === it.a }; });
  // ---- 1. a normal game: skip ten minutes, then to the end
  await page.click('button:has-text("Watch next game live")'); await page.waitForSelector('.lvscore');
  { const h1 = await page.textContent('.dlg-back h1'); ck('LIVE opening decision pop-up', /Tip-off/.test(h1) && (await page.$$('.dlg-back .wkcard')).length === 3, { h1 }); await page.screenshot({ path: (process.env.SHOTS || '/tmp') + '/live-pop-' + (mobile ? 'm' : 'd') + '.png' }); await page.click('.dlg-back .wkcard button >> nth=0'); await page.waitForSelector('button:has-text("Pause")'); }
  await page.click('button:has-text("Pause")');
  const t0 = await page.evaluate(() => window.__NBA_UI.live.t); await page.click('button:has-text("Skip 10 min")'); const t1 = await page.evaluate(() => window.__NBA_UI.live.t);
  const feedRows = await page.evaluate(() => document.querySelectorAll('.lvrow').length);
  await page.screenshot({ path: (process.env.SHOTS || '/tmp') + '/live-' + (mobile ? 'm' : 'd') + '.png', fullPage: true });
  ck('LIVE skip 10 min', Math.abs(t1 - t0 - 600) < 1 && feedRows > 3, { t0, t1, feedRows });
  await page.click('button:has-text("Play")');
  const r1 = await finish(); ck('LIVE reaches the final', r1 === 'done', { r1 });
  { const c = await compare(); ck('LIVE box and score match the log', c.diff.length === 0 && c.ok, c); }
  ck('LIVE several decisions in one game', decs >= 2, { decs });
  const labelsLate = await page.evaluate(() => document.querySelector('.lvclock').textContent); ck('LIVE final clock', /Final/.test(labelsLate), { labelsLate });
  const idx0 = await page.evaluate(() => window.__NBA_UI.live.idx); await page.click('button:has-text("Continue →")'); await page.waitForSelector('button:has-text("Watch next game live")');
  { const s = await page.evaluate(() => ({ mi: window.__NBA_UI.state.matchIdx, live: !!window.__NBA_UI.live })); ck('LIVE continue advances the season', s.mi === idx0 + 1 && !s.live, s); }
  // ---- 2. a clutch game: the call is inside the game
  const found = await page.evaluate(() => { const S = window.__NBA_UI.state, L = S.matchLog; let i = L.findIndex((x, k) => k > S.matchIdx && x.k === 'g' && x.cl && !x.cd); if (i < 0) { i = L.findIndex((x, k) => k > S.matchIdx && x.k === 'g' && !x.dnp && Math.abs(x.f - x.a) <= 6 && !x.cl && !x.inj); if (i < 0) return null; L[i].cl = 1; } S.matchIdx = i; S.dec.pending = null; window.__NBA_UI.render(); return { i, forced: !L[i].pc }; });
  ck('LIVE clutch game found', !!found, found);
  if (found) {
    await page.waitForSelector('button:has-text("Watch next game live")');
    const noScreen = await page.evaluate(() => !/Clutch time/i.test(document.body.innerText)); ck('LIVE no clutch screen before the game', noScreen);
    await page.click('button:has-text("Watch next game live")'); await page.waitForSelector('.lvscore');
    const r2 = await finish(); ck('LIVE stops for the call', r2 === 'call', { r2 });
    if (r2 === 'call') {
      const pre = await page.evaluate(() => { const A = window.__NBA_UI.live; return { clock: document.querySelector('.lvclock').textContent, diff: A.sc[1] - A.sc[0], state: A.state, text: document.querySelector('.dlg-back .card.suspense h2').textContent }; });
      ck('LIVE call is a last possession', /Q4 0:/.test(pre.clock) && pre.diff >= 0 && pre.diff <= 3 && pre.state === 'call', pre);
      await page.click('.dlg-back .wkcard button:has-text("Do it") >> nth=0'); const r3 = await finish(); ck('LIVE reaches the final after the call', r3 === 'done', { r3 });
      const c = await compare(); ck('LIVE clutch box and score match the log', c.diff.length === 0 && c.ok, c);
      const cd = await page.evaluate(() => { const S = window.__NBA_UI.state; return S.matchLog[window.__NBA_UI.live.idx].cd; }); ck('LIVE clutch marked done', cd === 1, { cd });
      await page.click('button:has-text("Continue →")');
    }
  }
  // ---- 3. not watching live: a clutch game just plays out, no call, no screen
  await page.evaluate(() => { const S = window.__NBA_UI.state; S.liveMode = false; const L = S.matchLog; const i = L.findIndex((x, k) => k >= S.matchIdx && x.k === 'g' && !x.dnp && !x.inj); L[i].cl = 1; L[i].cd = 0; S.dec.pending = null; S.matchIdx = i; window.__NBA_UI.render(); window.__i3 = i; });
  await page.waitForSelector('button:has-text("Sim next game")');
  const simmed = await page.evaluate(() => !/Clutch time|Game 7/i.test(document.body.innerText)); ck('LIVE off: no clutch screen', simmed);
  await page.click('button:has-text("Sim next game")');
  { const r = await page.evaluate(() => { const S = window.__NBA_UI.state; return { mi: S.matchIdx === window.__i3 + 1, cd: S.matchLog[window.__i3].cd, pend: !!(S.dec.pending && S.dec.pending.id === 'clutch') }; }); ck('LIVE off: the game plays out', r.mi && r.cd === 1 && !r.pend, r); }
  // ---- 4. hurt: the season screen says so
  await page.evaluate(() => { const S = window.__NBA_UI.state, L = S.matchLog; let i = L.findIndex((x, k) => k > S.matchIdx + 1 && x.k === 'g' && !x.po && !x.dnp && !x.cl); S.liveMode = false; S.matchIdx = i; for (let k = i; k < i + 4; k++) { if (L[k].k === 'g') { L[k].dnp = 'Missed 4 games with injuries.'; L[k].ib = 1; } } S.dec.pending = null; L[i].pc = 0; window.__NBA_UI.render(); });
  await page.waitForSelector('text=You are hurt');
  { const t = await page.evaluate(() => document.querySelector('.callout.inj').textContent); ck('INJURY banner on the season screen', /hurt: a lingering injury/.test(t) && /Out \d+ more game/.test(t) && /Back for game/.test(t), { t }); }
  console.log('errors:', errors.length ? errors : 'none'); await browser.close(); process.exit(errors.length ? 1 : 0);
})();
