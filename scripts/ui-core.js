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
    st.autoPlay = false; st.autoDecide = false; st.matchIdx = st.matchLog.length; st.stage = 'decision'; st.decision = null; st.noSocial = true; st.dec.pending = null;
    window.__NBA_UI.state = st; window.__NBA_UI.go();
  });
  await page.waitForTimeout(800);
  let t = await page.evaluate(() => document.body.innerText);
  ok('OFFSEASON build your team card', /Build your team/i.test(t) && /Front office/i.test(t), t.slice(0, 200));
  { const exp = await page.evaluate(() => !!(window.__NBA_UI.state.decision || {}).expiring); ok('OFFSEASON coach card (hidden in free agency)', exp ? /Free-agent meetings/i.test(t) : /The coach/i.test(t) && /fire him/i.test(t), { exp }); }
  const lot = await page.evaluate(() => { const st = window.__NBA_UI.state, L = st.league, t = L.teams[st.teamId]; L.teams.forEach((x) => { if (x.id !== t.id) x.wins = Math.max(x.wins, 30); }); t.wins = 18; st.dec.flags.coachYear = L.year; st.dec.pending = null; window.__NBA_UI.go(); return true; });
  await page.waitForTimeout(300); t = await page.evaluate(() => document.body.innerText); ok('OFFSEASON lottery card', /Lottery night/i.test(t) && /for the #1 pick/.test(t));
  await page.click('button:text-matches("Watch the lottery")'); await page.waitForTimeout(300); t = await page.evaluate(() => document.body.innerText); ok('OFFSEASON lottery drawn + prospects', /Push for him/i.test(t));
  await page.click('button:text-is("Push for him") >> nth=-1'); await page.waitForTimeout(300); t = await page.evaluate(() => document.body.innerText); ok('OFFSEASON lobby resolves', /(front office listened|draft their own board|will be gone before your pick)/.test(t));
  const nRec = await page.$$('button:text-is("Recruit")'); ok('OFFSEASON recruit targets', nRec.length >= 1, { n: nRec.length });
  if (nRec.length) { await nRec[0].click(); await page.waitForTimeout(400); t = await page.evaluate(() => document.body.innerText); ok('OFFSEASON recruit resolves', /(is coming|listened, thanked you|front office shut it down|did not take your call)/.test(t) && /They listen to you: \d+%/.test(t) && /made your move/i.test(t)); }
  // national team: force an event year and a selection
  const nt = await page.evaluate(() => { const st = window.__NBA_UI.state; while ((st.league.year + 1) % 4 !== 0) st.league.year++; const n = window.NBA.Core.nationalTeam(st); window.__NBA_UI.go(); return n && { picked: n.picked, rank: n.rank, team: n.team }; });
  await page.waitForTimeout(400); await page.click('button:text-matches("League & teammates")'); await page.waitForTimeout(300); t = await page.evaluate(() => document.body.innerText);
  ok('OFFSEASON tabs: league storylines', /Around the league this summer|Nothing here/i.test(t));
  if (nt && nt.picked) { ok('OFFSEASON Team USA card', /Team USA wants you/i.test(t), nt); await page.click('button:text-matches("Represent")'); await page.waitForTimeout(300); t = await page.evaluate(() => document.body.innerText); ok('OFFSEASON Olympics result', /Olympics: (Gold|Silver|Bronze|Quarterfinals|Group)/.test(t), t.match(/Team USA at[^\n]*/)); }
  else console.log('national team: not selected', JSON.stringify(nt));
  await page.click('button:text-matches("Life & money")'); await page.waitForTimeout(300); t = await page.evaluate(() => document.body.innerText); ok('OFFSEASON tabs: life & money', /Incentives|Nothing here|Someone special|The wedding|Your city|Give back|An investment|Take care of home|A new baby/i.test(t));
  await page.click('button:text-matches("Team moves")'); await page.waitForTimeout(200); t = await page.evaluate(() => document.body.innerText); ok('OFFSEASON agent card', /Your agent/i.test(t));
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
  ok('PRESEASON jersey card', /Pick your number/i.test(t));
  await page.fill('input[type=number]', '77'); await page.click('button:text-is("Wear it")'); await page.waitForTimeout(300);
  let jn = await page.evaluate(() => window.__NBA_UI.state.jersey); if (!jn) { const b = await page.$('button:text-matches("Buy it from")'); if (b) { await b.click(); await page.waitForTimeout(200); } jn = await page.evaluate(() => window.__NBA_UI.state.jersey); if (!jn) { await page.fill('input[type=number]', '98'); await page.click('button:text-is("Wear it")'); await page.waitForTimeout(200); jn = await page.evaluate(() => window.__NBA_UI.state.jersey); } }
  ok('PRESEASON jersey picked', !!jn, jn);
  await page.click('button:text-matches("Light rest")'); const lm = await page.evaluate(() => window.__NBA_UI.state.loadMgmt); ok('PRESEASON load mgmt set', lm === 'light', { lm });
  // the season: notes, the history panel, then a playoff series moment and the recap
  await page.click('button:text-matches("Tip off")'); await page.waitForTimeout(800);
  { const fb = await page.evaluate(() => { const st = window.__NBA_UI.state; st.matchIdx = 6; st.matchLog.slice(0, 6).forEach((x) => { x.pd = x.ppd = x.sd = x.md = x.pcast = x.sij = x.cd = 1; }); st.dec.pending = null; st.decResult = null; window.__NBA_UI.go(); const d = document.querySelector('details.wbox'); if (d) d.open = true; return d ? d.innerText : null; });
    ok('SEASON full box (teammates + quarters + story)', fb && /Q1/.test(fb) && /Your teammates/i.test(fb) && /📖/.test(fb), (fb || '').slice(0, 160)); await page.evaluate(() => { const st = window.__NBA_UI.state; st.matchIdx = 0; window.__NBA_UI.go(); }); }
  { const lw = await page.evaluate(() => { const st = window.__NBA_UI.state; st.matchIdx = 14; st.matchLog.slice(0, 14).forEach((x) => { x.pd = x.ppd = x.sd = x.md = x.pcast = x.sij = x.cd = x.h_me20 = x.h_me62 = 1; }); st.dec.pending = null; st.decResult = null; window.__NBA_UI.go(); const cb = document.querySelector('.panel input[type=checkbox]'); return { t: document.body.innerText, quiet: Array.from(document.querySelectorAll('label')).some((l) => /Quiet mode/.test(l.textContent) && l.querySelector('input').checked) }; });
    ok('SEASON league wire', /League wire/i.test(lw.t) && /lead the (East|West)/.test(lw.t) && /You are \d+(st|nd|rd|th) in the/.test(lw.t), (lw.t.match(/LEAGUE WIRE[\s\S]{0,300}/i) || [lw.t.slice(0, 80)])[0]); ok('SEASON quiet mode is the default', lw.quiet); await page.evaluate(() => { const st = window.__NBA_UI.state; st.matchIdx = 0; window.__NBA_UI.go(); }); }
  t = await page.evaluate(() => document.body.innerText); ok('SEASON history watch panel', /History watch/i.test(t) && /all-time|top-50/i.test(t));
  const mo = await page.evaluate(() => { const st = window.__NBA_UI.state, C = window.NBA.Core; const i = st.matchLog.findIndex((x, k) => x.k === 'g' && x.po && !x.pi && !x.dnp && C.momentOf(st, k)); return { i, n: st.matchLog.length, lm: st.proSeasons[st.proSeasons.length - 1].gp }; });
  if (mo.i >= 0) {
    await page.evaluate((i) => { const st = window.__NBA_UI.state; window.__NBA_UI.silence(st, i); st.matchLog.slice(i).forEach((x, k) => { delete x.pp; delete x.pc; x.md = x.pcast = x.sij = x.cd = 1; if (k > 0) x.smd = 1; }); st.dlDone = true; st.poPlans = { 0: 'balanced', 1: 'balanced', 2: 'balanced', 3: 'balanced' }; st.poPress = { 0: null, 1: null, 2: null, 3: null }; st.dec.pending = null; st.dec.flags.injChoice = { y: st.league.year }; st.matchIdx = i; window.__NBA_UI.go(); }, mo.i);
    await page.waitForTimeout(600); t = await page.evaluate(() => document.body.innerText);
    ok('PLAYOFFS series moment pop-up', /(Down 0-2|Win or go home|Close it out|Swing game)/i.test(t) && /Trust the system/i.test(t), t.slice(0, 160));
    await page.click('.wkcard:has-text("Trust the system") button'); await page.waitForTimeout(400); t = await page.evaluate(() => document.body.innerText);
    ok('PLAYOFFS moment result (no spoiler)', /is next/i.test(t) && !/in a win|in a loss/.test(t));
    // play to the end of that series: the recap
    await page.evaluate(() => { const st = window.__NBA_UI.state; st.decResult = null; window.__NBA_UI.go(); });
    let rc = false; for (let k = 0; k < 10 && !rc; k++) { await page.evaluate(() => { const st = window.__NBA_UI.state; st.decResult = null; st.dec.pending = null; window.__NBA_UI.go(); }); const b = await page.$('button:text-matches("^Sim next playoff game")'); if (!b) break; await b.click(); await page.waitForTimeout(250); t = await page.evaluate(() => document.body.innerText); rc = /Series recap/i.test(t); if (!rc) { const it = await page.evaluate(() => { const st = window.__NBA_UI.state; const x = st.matchLog[st.matchIdx]; if (x) { x.smd = 1; x.pd = 1; } const p = st.matchLog[st.matchIdx - 1]; if (p && !p.recap) { p.ppd = p.md = p.pcast = p.sij = 1; } return st.matchIdx; }); } }
    ok('PLAYOFFS series recap', rc, t.slice(0, 200));
    { const bt = await page.evaluate(() => { const d = Array.from(document.querySelectorAll('details.panel')).find((x) => /Around the playoffs/.test(x.textContent)); return d ? d.innerText : null; }); ok('PLAYOFFS around the playoffs panel', !!bt && /advance/.test(bt), (bt || '').slice(0, 140)); }
  } else console.log('no series moment in this season', JSON.stringify(mo));
  { await page.evaluate(() => { const st = window.__NBA_UI.state; st.decResult = null; st.dec.pending = null; st.stage = 'season_recap'; window.__NBA_UI.go(); }); await page.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find((x) => /^team/i.test(x.textContent.trim())); if (b) b.click(); }); await page.waitForTimeout(400); const tm = await page.evaluate(() => document.body.innerText); console.log('TEAMDBG', tm.slice(0, 200).replace(/\n/g, ' | ')); ok('TEAM page teammates card (personalities)', /Your teammates/i.test(tm) && /(Leader|Hothead|Joker|Grinder|Diva|Quiet|Old head)/.test(tm)); }
  // career page: badges and all-time ranks
  await page.evaluate(() => { const st = window.__NBA_UI.state; st.decResult = null; st.dec.pending = null; st.matchIdx = st.matchLog.length; st.stage = 'season_recap'; window.__NBA_UI.go(); });
  const cr = await page.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find((x) => /career/i.test(x.textContent)); if (b) b.click(); return !!b; }); await page.waitForTimeout(500);
  t = await page.evaluate(() => document.body.innerText); ok('CAREER badges + history', /Badges/i.test(t) && /History watch/i.test(t), { cr });
  { const rc = await page.evaluate(() => { const st = window.__NBA_UI.state, r = st.proSeasons[st.proSeasons.length - 1]; if (!r.awards.includes('NBA Champion')) r.awards.push('NBA Champion'); st.stage = 'season_recap'; window.__NBA_UI.go(); return document.body.innerText; });
    ok('RECAP champion card + parade', /NBA CHAMPIONS/i.test(rc) && /This is for the city/i.test(rc)); await page.click('button:text-matches("This is for the city")'); await page.waitForTimeout(200); const t2 = await page.evaluate(() => document.body.innerText); ok('RECAP parade resolves', /🎉/.test(t2)); }
  { const t3 = await page.evaluate(() => { const st = window.__NBA_UI.state; st.stage = 'season_play'; st.matchIdx = 3; st.decResult = null; st.dec.pending = null; window.__NBA_UI.go(); return document.body.innerText; }); ok('SEASON inbox panel', /Inbox/i.test(t3) && /Quiet mode/i.test(t3));
    const ib = await page.evaluate(() => { const st = window.__NBA_UI.state; st.inboxMode = true; st.inbox = [{ pd: { id: 'starinjury', ctx: { star: { name: 'Test Star' } }, step: 0, log: [] }, at: 2 }]; window.__NBA_UI.go(); return document.body.innerText; }); ok('SEASON inbox item listed', /Breaking news: Test Star/i.test(ib)); }
  { await page.evaluate(() => { const st = window.__NBA_UI.state; st.inbox = []; st.stage = 'season_recap'; window.__NBA_UI.go(); }); await page.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find((x) => /career/i.test(x.textContent)); if (b) b.click(); }); await page.waitForTimeout(400); const t4 = await page.evaluate(() => document.body.innerText); ok('CAREER save slots card', /Save slots/i.test(t4)); }
  { const w1 = await page.evaluate(() => { const o = Storage.prototype.setItem; Storage.prototype.setItem = function () { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }; window.__origSet = o; window.__NBA_UI.go(); return !!document.getElementById('savewarn') && /not being saved/.test(document.getElementById('savewarn').textContent); });
    ok('STORAGE full: a visible warning instead of a silent failure', w1);
    const w2 = await page.evaluate(() => { Storage.prototype.setItem = window.__origSet; window.__NBA_UI.go(); return !document.getElementById('savewarn'); }); ok('STORAGE back: the warning clears itself', w2); }
  await browser.close(); console.log(errors.length ? 'errors: ' + JSON.stringify(errors).slice(0, 800) : 'errors: none'); process.exit(errors.length ? 1 : 0);
})();
