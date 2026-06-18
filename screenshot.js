// Capture real screenshots of each dashboard page via Chrome DevTools Protocol.
// No external deps — uses Node's global fetch + WebSocket + child_process.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9222;
const FILE = 'file:///' + path.resolve('PepsiCo_Pulse_BI.html').replace(/\\/g, '/');
const OUTDIR = path.resolve('docs/screenshots');
fs.mkdirSync(OUTDIR, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // 1) launch headless chrome
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--remote-allow-origins=*',
    '--window-size=1600,1100', '--force-device-scale-factor=2',
    '--user-data-dir=' + path.resolve('.chrome-tmp'), 'about:blank'
  ], { stdio: 'ignore' });

  // 2) wait for the debugger endpoint
  let ver;
  for (let i = 0; i < 60; i++) {
    try { ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; }
    catch { await sleep(250); }
  }
  if (!ver) { console.error('Chrome did not start'); chrome.kill(); process.exit(1); }

  // 3) open a page target on our file
  const tgt = await (await fetch(`http://127.0.0.1:${PORT}/json/new?` + encodeURIComponent(FILE), { method: 'PUT' })).json();
  const ws = new WebSocket(tgt.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));

  let id = 0; const waiters = new Map(); const evWaiters = [];
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m.result); waiters.delete(m.id); }
    if (m.method) for (let i = evWaiters.length - 1; i >= 0; i--)
      if (evWaiters[i].method === m.method) { evWaiters[i].resolve(m.params); evWaiters.splice(i, 1); }
  });
  const send = (method, params = {}) => new Promise(res => { const i = ++id; waiters.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalJS = async expr => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true })).result;

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 1000, deviceScaleFactor: 2, mobile: false });
  await send('Page.navigate', { url: FILE });
  await sleep(2500); // load + Chart.js from CDN

  async function shot(name) {
    // capture full page height
    const { cssContentSize } = await send('Page.getLayoutMetrics');
    const h = Math.min(Math.ceil(cssContentSize.height), 6000);
    const r = await send('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: 1500, height: h, scale: 1 }
    });
    fs.writeFileSync(path.join(OUTDIR, name + '.png'), Buffer.from(r.data, 'base64'));
    console.log('  saved', name + '.png', '(' + h + 'px)');
  }

  // 4) login screen first
  await shot('01-login');

  // enter the portal (skip the loader) and capture each page
  await evalJS('enterPortal()'); await sleep(1500);
  const pages = [
    ['overview', '02-overview'],
    ['supply', '03-supply-chain'],
    ['revenue', '04-revenue-finance'],
    ['products', '05-products'],
    ['workforce', '06-workforce'],
  ];
  for (const [p, name] of pages) { await evalJS(`go('${p}')`); await sleep(1600); await shot(name); }

  // smart assistant with a live Q&A
  await evalJS("go('assistant')"); await sleep(600);
  await evalJS("askAssistant('top 5 products by revenue')"); await sleep(900);
  await evalJS("askAssistant('compare Pepsi vs 7UP')"); await sleep(900);
  await evalJS("askAssistant('show me E-commerce in Egypt')"); await sleep(700);
  await shot('07-smart-assistant');

  // a filtered view to show slicers in action (E-commerce + Türkiye, 2026)
  await evalJS("resetFilters();FILTER.channels.add(ECOM_CH);FILTER.years.add(YEARS.length-1);applyFilters();go('overview')");
  await sleep(1600); await shot('08-overview-filtered');

  ws.close(); chrome.kill();
  console.log('Done -> docs/screenshots/');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
