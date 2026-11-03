// v123 GitHub Pages: your own Claude API key. The Claude API is mocked (page.route), so this checks the wiring, not the model:
// the key is saved and sent only to api.anthropic.com with the browser header, Haiku 5.5 answers the light calls, Opus 5.5 (with the
// server-side fallback) the career verdict, a rejected key says so, and removing the key goes back to the hand-written text.
const path = require('path');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const errors = [], page = await (await browser.newContext({ viewport: { width: 1100, height: 1300 } })).newPage(), reqs = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  const ok = (name, cond, info) => { console.log(name, cond ? 'OK' : 'MISMATCH', info ? JSON.stringify(info).slice(0, 300) : ''); if (!cond) errors.push(name + ' ' + JSON.stringify(info || '').slice(0, 300)); };
  let reject = false;
  await page.route('https://api.anthropic.com/**', async (route) => {
    const r = route.request(), body = JSON.parse(r.postData() || '{}'), hd = r.headers(); reqs.push({ url: r.url(), model: body.model, effort: body.output_config && body.output_config.effort, fb: body.fallbacks, beta: hd['anthropic-beta'], key: hd['x-api-key'], browser: hd['anthropic-dangerous-direct-browser-access'] });
    if (reject) return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }) });
    const text = String((body.messages[0] && body.messages[0].content) || "").indexOf(`Return {"ok": true}`) >= 0 ? '{"ok": true}' : '```json\n{"verdict": "mock"}\n```';
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'msg_mock', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } }) });
  });
  await page.goto('file://' + path.resolve(__dirname, '../dist/index.html'));
  ok('SDK bundled in the GitHub Pages build', await page.evaluate(() => typeof window.AnthropicSDK === 'function'));
  await page.evaluate(() => { const N = window.NBA, G = N.Game; N.setSeed(9); const st = G.newCareer({ name: 'Key Test', pos: 'SF', arch: 'scorer', stars: 4 }); G.auto(st, { decisions: false }); st.autoPlay = false; window.__NBA_UI.state = st; window.__NBA_UI.go(); });
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('button.gear').click()); await page.waitForTimeout(200);
  let t = await page.evaluate(() => document.body.innerText); ok('settings: key section', /AI features \(your Claude API key\)/i.test(t) && /AI features: off/i.test(t));
  await page.fill('.dlg input[type=password]', 'not-a-key'); await page.click('.dlg button:text-matches("^Save key$", "i")'); await page.waitForTimeout(150);
  t = await page.evaluate(() => document.body.innerText); ok('settings: a bad key is refused', /does not look like a Claude API key/i.test(t));
  await page.fill('.dlg input[type=password]', 'sk-ant-test-123'); await page.click('.dlg button:text-matches("^Save key$", "i")'); await page.waitForTimeout(300);
  ok('settings: key saved in this browser', await page.evaluate(() => localStorage.getItem('nbacs-claude-key') === 'sk-ant-test-123'));
  await page.click('.dlg button:text-matches("^Test$", "i")'); await page.waitForTimeout(800);
  t = await page.evaluate(() => document.body.innerText); const tq = reqs.find((r) => r.model === 'claude-haiku-5-5');
  ok('test call: Haiku 5.5 answered', /The key works/i.test(t), t.match(/(✅|⚠️|❌)[^\n]*/) && t.match(/(✅|⚠️|❌)[^\n]*/)[0]);
  ok('test call: key + browser header, low effort, only api.anthropic.com', tq && tq.key === 'sk-ant-test-123' && tq.browser === 'true' && tq.effort === 'low' && reqs.every((r) => r.url.indexOf('https://api.anthropic.com/') === 0), tq);
  // the career verdict (retired screen) is an Opus 5.5 call with the server-side fallback
  await page.click('.dlg button.primary:text-matches("^Done$", "i")'); await page.evaluate(() => { const S = window.__NBA_UI.state; S.reportAI = null; S.reportAITry = 0; window.__NBA_UI.render(); }); await page.waitForTimeout(1500);
  const op = reqs.find((r) => r.model === 'claude-opus-5-5');
  ok('career verdict: Opus 5.5 with fallbacks "default"', !!op && op.fb === 'default' && /server-side-fallback-2026-07-01/.test(op.beta || ''), op || reqs.map((r) => r.model));
  // a rejected key says so
  reject = true; await page.evaluate(() => document.querySelector('button.gear').click()); await page.waitForTimeout(200); await page.click('.dlg button:text-matches("^Test$", "i")'); await page.waitForTimeout(800);
  t = await page.evaluate(() => document.body.innerText); ok('rejected key is reported', /rejected \(401\)/i.test(t), t.match(/(✅|⚠️|❌)[^\n]*/) && t.match(/(✅|⚠️|❌)[^\n]*/)[0]);
  await page.click('.dlg button:text-matches("^Remove key$", "i")'); await page.waitForTimeout(300);
  ok('key removed', await page.evaluate(() => !localStorage.getItem('nbacs-claude-key')));
  console.log('errors:', errors.length ? errors : 'none'); await browser.close(); process.exit(errors.length ? 1 : 0);
})();
