// Record animated GIF demos of the portal via Chrome DevTools Protocol + ffmpeg.
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const FFMPEG = require('ffmpeg-static');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9223;
const FILE = 'file:///' + path.resolve('PepsiCo_Pulse_BI.html').replace(/\\/g, '/');
const OUT = path.resolve('docs/gifs');
const TMP = path.resolve('.frames');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const VW = 1366, VH = 800, FPS = 9;

(async () => {
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--remote-allow-origins=*',
    '--window-size=' + VW + ',' + VH, '--user-data-dir=' + path.resolve('.chrome-tmp2'), 'about:blank'
  ], { stdio: 'ignore' });

  let ver;
  for (let i = 0; i < 60; i++) { try { ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(250); } }
  if (!ver) { console.error('Chrome failed'); chrome.kill(); process.exit(1); }

  const tgt = await (await fetch(`http://127.0.0.1:${PORT}/json/new?` + encodeURIComponent(FILE), { method: 'PUT' })).json();
  const ws = new WebSocket(tgt.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let id = 0; const waiters = new Map();
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m.result); waiters.delete(m.id); } });
  const send = (method, params = {}) => new Promise(res => { const i = ++id; waiters.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalJS = expr => send('Runtime.evaluate', { expression: expr, awaitPromise: true });

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: FILE });
  await sleep(2600);

  let fi = 0;
  async function shot() {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(TMP, 'f_' + String(fi++).padStart(4, '0') + '.png'), Buffer.from(r.data, 'base64'));
  }
  function freshTmp() { fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP, { recursive: true }); fi = 0; }
  function encode(name, width, maxc) {
    width = width || 1040; maxc = maxc || 0;
    const pal = maxc ? `palettegen=max_colors=${maxc}:stats_mode=diff` : 'palettegen=stats_mode=diff';
    execFileSync(FFMPEG, ['-y', '-framerate', String(FPS), '-i', path.join(TMP, 'f_%04d.png'),
      '-vf', `scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]${pal}[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4`,
      path.join(OUT, name + '.gif')], { stdio: 'ignore' });
    const kb = (fs.statSync(path.join(OUT, name + '.gif')).size / 1024).toFixed(0);
    console.log('  ' + name + '.gif (' + fi + ' frames, ' + kb + ' KB)');
  }
  async function scene(name, plan) {
    freshTmp();
    for (const s of plan) { if (s.do) await evalJS(s.do); for (let k = 0; k < s.hold; k++) { await sleep(s.ms || 110); await shot(); } }
    encode(name);
  }

  // Scene 0 - the animated login screen (floating products + parallax)
  freshTmp();
  for (let k = 0; k < 26; k++) {
    const x = 150 + (k / 26) * 1200, y = 400 + Math.sin(k / 3) * 220;
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await sleep(120); await shot();
  }
  encode('demo-login', 820, 128);   // smaller + fewer colours: lighter file for the README

  // Scene 1 - tour across the five dashboards
  await scene('demo-tour', [
    { do: "enterPortal()", hold: 3, ms: 300 },
    { do: "go('overview')", hold: 13 },
    { do: "go('supply')", hold: 12 },
    { do: "go('revenue')", hold: 12 },
    { do: "go('products')", hold: 12 },
    { do: "go('workforce')", hold: 14 },
    { do: "go('overview')", hold: 6 },
  ]);

  // Scene 2 - live slicing on the Overview (visibly reshapes KPIs + the donut)
  await scene('demo-filters', [
    { do: "resetFilters();go('overview')", hold: 8 },
    { do: "toggleDrop('channels')", hold: 7 },
    { do: "toggleOpt('channels',3,true)", hold: 13 },     // Foodservice -> beverages mix jumps
    { do: "toggleDrop('regions')", hold: 7 },
    { do: "toggleOpt('regions',3,true)", hold: 13 },      // Germany & DACH -> snacks rise
    { do: "resetFilters()", hold: 9 },
  ]);

  // Scene 3 - the NLP assistant answering, then driving the dashboard
  await scene('demo-assistant', [
    { do: "resetFilters();go('assistant')", hold: 5 },
    { do: "askAssistant('top 5 products by revenue')", hold: 12 },
    { do: "askAssistant('compare Pepsi vs 7UP')", hold: 12 },
    { do: "askAssistant('show me E-commerce in Egypt')", hold: 16 },
  ]);

  fs.rmSync(TMP, { recursive: true, force: true });
  ws.close(); chrome.kill();
  console.log('Done -> docs/gifs/');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
