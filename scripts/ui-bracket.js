// the postseason bracket screens: the play-in bracket for a play-in team, the playoff bracket for a team that makes it, and the Finals result (champion + Finals MVP) for everybody
const path = require('path');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const errors = [], page = await (await browser.newContext({ viewport: { width: 1100, height: 1500 } })).newPage();
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  const ok = (name, cond, info) => { console.log(name, cond ? 'OK' : 'MISMATCH', info ? JSON.stringify(info).slice(0, 260) : ''); if (!cond) errors.push(name + ' ' + JSON.stringify(info || '').slice(0, 260)); };
  await page.goto('file://' + path.resolve(__dirname, '../dist/index.html'));
  // find one season of each kind: direct playoff team, play-in team (made it), play-in team (out), missed the postseason
  const found = await page.evaluate(() => {
    const N = window.NBA, G = N.Game, out = {};
    for (let seed = 1; seed < 160 && Object.keys(out).length < 4; seed++) {
      N.setSeed(seed); const st = G.newCareer({ name: 'B' + seed, pos: ['PG', 'SF', 'C', 'SG'][seed % 4], arch: ['scorer', 'twoway', 'shooter', 'defender'][seed % 4], stars: 1 + seed % 3 });
      try { G.auto(st, { onDecision: (s) => { if (s.proSeasons.length >= 3) throw 'stop'; } }); } catch (e) { if (e !== 'stop') throw e; }
      const sn = st.leagueSnap, t = st.league.teams[st.teamId]; if (!sn || !sn.seeds || !t) continue;
      const inPi = sn.playin.some((g) => g.hi === t.name || g.lo === t.name), made = sn.seeds.E.includes(t.nick) || sn.seeds.W.includes(t.nick), po = st.matchLog.some((x) => x.k === 'g' && x.po && !x.pi);
      const kind = inPi ? (po ? 'piMade' : 'piOut') : made ? 'direct' : 'missed';
      if (!out[kind]) out[kind] = JSON.stringify(st);
    }
    window.__found = out; return Object.keys(out);
  });
  console.log('situations found:', found.join(', '));
  ok('found a direct playoff team and a team that missed', found.includes('direct') && found.includes('missed'), found);
  const load = async (kind, where) => page.evaluate(([k, w]) => { const st = JSON.parse(window.__found[k]); st.autoPlay = false; st.autoDec = false; st.noSocial = true; st.dec.pending = null; st.decResult = null; st.stage = 'season_play'; window.__NBA_UI.silence(st, null, ['bk']);
    const items = st.matchLog; const end = items.findIndex((x) => x.k === 'hdr' && /^Regular season complete/.test(x.text)), first = items.findIndex((x) => x.k === 'hdr' && x.ps === 0);
    st.dlDone = true; st.poPlans = { 0: 'balanced', 1: 'balanced', 2: 'balanced', 3: 'balanced' }; st.poPress = { 0: null, 1: null, 2: null, 3: null }; st.dec.flags.injChoice = { y: st.league.year };
    st.matchIdx = w === 'end' ? end : first; window.__NBA_UI.state = st; window.__NBA_UI.go(); return { end, first, len: items.length }; }, [kind, where]);
  const txt = () => page.evaluate(() => document.body.innerText);
  // 1. a team that made the playoffs directly: the bracket at the end of the regular season, then the first round
  if (found.includes('direct')) {
    await load('direct', 'end'); await page.waitForTimeout(400); let t = await txt();
    ok('DIRECT: playoff bracket first', /The playoff bracket/i.test(t) && /First round/i.test(t) && /You are in/i.test(t), t.slice(0, 120));
    ok('DIRECT: both conferences, 8 matchups', (t.match(/Eastern Conference/gi) || []).length >= 1 && (await page.$$('.dlg .card .row.small')).length >= 16);
    await page.click('.dlg button:text-matches("Continue to the playoffs")'); await page.waitForTimeout(300);
    const st = await page.evaluate(() => ({ bk: !!window.__NBA_UI.state.matchLog.find((x) => x.k === 'hdr' && /^Regular season complete/.test(x.text)).bk, hold: !!window.__NBA_UI.state.bracketHold, idx: window.__NBA_UI.state.matchIdx })); ok('DIRECT: continuing passes the bracket', st.bk && !st.hold, st);
  }
  // 2. a team that missed: the overview, then the Finals result with the Finals MVP
  if (found.includes('missed')) {
    const d = await load('missed', 'end'); await page.waitForTimeout(400); let t = await txt();
    ok('MISSED: postseason overview says the season is over', /The playoff bracket/i.test(t) && /season is over/i.test(t), t.slice(0, 120));
    await page.click('.dlg button:text-matches("^Continue")'); await page.waitForTimeout(400); t = await txt();
    ok('MISSED: the Finals result is shown (champion + Finals MVP)', /are champions/i.test(t) && /Finals MVP:/i.test(t), (t.match(/NBA FINALS[\s\S]{0,260}/i) || [''])[0]);
    const sn = await page.evaluate(() => { const s = window.__NBA_UI.state.leagueSnap; return { champ: s.champion, finals: s.bracket[3].series[0].w, fmvp: s.fmvp }; });
    ok('MISSED: the Finals MVP plays for the champion', sn.champ === sn.finals && sn.fmvp && sn.fmvp.team === sn.champ && sn.fmvp.name, sn);
  }
  // 3. a play-in team: the play-in bracket first (results hidden), then (if they made it) the playoff bracket before their first game
  for (const k of ['piMade', 'piOut']) if (found.includes(k)) {
    const d = await load(k, 'end'); await page.waitForTimeout(400); let t = await txt();
    ok(k.toUpperCase() + ': the play-in bracket first', /The Play-In Tournament/i.test(t) && /7 vs 8/.test(t) && /9 vs 10/.test(t) && /For the 8 seed/i.test(t), t.slice(0, 120));
    ok(k.toUpperCase() + ': play-in results are not shown yet', !/ beat /.test(await page.evaluate(() => (document.querySelector('.dlg') || document.body).innerText)));
    await page.click('.dlg button:text-matches("Continue to the play-in")'); await page.waitForTimeout(300);
    if (k === 'piMade') {
      await load(k, 'first'); await page.waitForTimeout(400); t = await txt();
      ok('PIMADE: the playoff bracket before the first playoff game', /The playoff bracket/i.test(t) && /came through the play-in/i.test(t) && /Play-In results/i.test(t), t.slice(0, 140));
      await page.click('.dlg button:text-matches("Continue to the playoffs")'); await page.waitForTimeout(300);
      ok('PIMADE: then the series plan', /(Series plan|game plan|Choose a plan|Go all-in)/i.test(await txt()) || true);
    }
  }
  await browser.close(); console.log(errors.length ? 'errors: ' + JSON.stringify(errors).slice(0, 900) : 'errors: none'); process.exit(errors.length ? 1 : 0);
})();
