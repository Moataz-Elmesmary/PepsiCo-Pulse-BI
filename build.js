// Assemble the final self-contained portal HTML from the original assets + new engine.
const fs=require('fs');
const {portalData}=require('./gen');
const pd=portalData();

const ORIG='pulse-bi-portal_5.html';
const OUT='PepsiCo_Pulse_BI.html';
const src=fs.readFileSync(ORIG,'utf8');

// ---- extract CSS ----
const css=src.slice(src.indexOf('<style>')+7, src.indexOf('</style>'));

// ---- extract body inner (between <body> and the app <script>) ----
const bodyStart=src.indexOf('<body>')+6;
const scriptStart=src.indexOf('<script>', src.indexOf('</style>'));
let body=src.slice(bodyStart, scriptStart);

// ---- extract image assets (each on its own line in the original) ----
const logoLine=(src.match(/const LOGO_FULL="[\s\S]*?\}\)\(\);/)||[''])[0];
const pimgLine=(src.match(/const PIMG=\{[\s\S]*?\};/)||[''])[0];
if(!logoLine||!pimgLine){console.error('!! could not extract image assets');process.exit(1);}

// ---- remove the "Number Lookup" feature (nav button, panel, search hook) ----
body=body.replace(/\s*<button class="nav-btn" data-target="lookup"[\s\S]*?<\/button>/,'');
body=body.replace(/\s*<section class="panel" id="panel-lookup">[\s\S]*?<\/section>/,'');
// repoint the top-bar global search to the smart assistant
body=body.replace(/onkeydown="if\(event\.key==='Enter'\)\{go\('lookup'\)[\s\S]*?\}"/,
  `onkeydown="if(event.key==='Enter'){go('assistant');askAssistant(this.value);this.value='';}"`);

// ---- inject the filter bar just before the content area ----
body=body.replace('<div class="content">',
  '<div class="filter-bar" id="filterBar"></div>\n    <div class="content">');

// ---- extra CSS for the filter bar ----
const filterCSS=`
/* ---------- FILTER BAR ---------- */
.filter-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 22px;
  background:var(--panel);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:25;
  backdrop-filter:blur(8px)}
.fbar-ico{font-size:1rem;opacity:.7}
.fdrop{position:relative}
.fdrop-btn{display:flex;align-items:center;gap:7px;padding:8px 14px;border-radius:30px;cursor:pointer;
  background:var(--card2);border:1px solid var(--line);color:var(--text);font-size:.82rem;font-weight:600;
  font-family:inherit;transition:.15s}
.fdrop-btn:hover{border-color:var(--cyan)}
.fdrop.on .fdrop-btn{background:linear-gradient(135deg,var(--blue),var(--cyan));color:#fff;border-color:transparent;
  box-shadow:0 6px 16px -6px var(--cyan)}
.fdrop-btn .caret{font-size:.7rem;opacity:.8}
.fdrop-menu{position:absolute;top:calc(100% + 8px);inset-inline-start:0;min-width:210px;max-height:320px;overflow:auto;
  background:var(--card);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);
  padding:8px;z-index:60;display:none;animation:fpop .14s ease}
.fdrop-menu.show{display:block}
@keyframes fpop{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
.fopt{display:flex;align-items:center;gap:9px;padding:8px 10px;border-radius:9px;cursor:pointer;
  font-size:.82rem;color:var(--text)}
.fopt:hover{background:var(--card2)}
.fopt input{width:15px;height:15px;accent-color:var(--cyan);cursor:pointer}
.fopt-foot{border-top:1px solid var(--line);margin-top:6px;padding-top:6px;text-align:end}
.fopt-foot button{background:none;border:none;color:var(--muted);font-size:.74rem;cursor:pointer;font-family:inherit}
.fopt-foot button:hover{color:var(--red)}
.fbar-reset{margin-inline-start:4px;padding:8px 14px;border-radius:30px;cursor:pointer;font-family:inherit;
  background:none;border:1px dashed var(--line);color:var(--muted);font-size:.8rem;font-weight:600;transition:.15s}
.fbar-reset:hover{color:var(--red);border-color:var(--red)}
.fbar-count{margin-inline-start:auto;color:var(--muted);font-size:.78rem;font-weight:600;white-space:nowrap}
html[dir="rtl"] .fdrop-menu{inset-inline-start:auto;inset-inline-end:0}
@media(max-width:720px){.fbar-count{display:none}.filter-bar{padding:10px 14px}}
/* ---------- ASSISTANT extras ---------- */
.typing{display:inline-flex;gap:5px;align-items:center;padding:2px 0}
.typing i{width:7px;height:7px;border-radius:50%;background:var(--cyan);opacity:.5;animation:tdot 1s infinite}
.typing i:nth-child(2){animation-delay:.18s}.typing i:nth-child(3){animation-delay:.36s}
@keyframes tdot{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-5px);opacity:1}}
.msg .nlp-act{margin-top:8px;cursor:pointer;border:none;background:linear-gradient(135deg,var(--blue),var(--cyan));
  color:#fff;font-weight:700;padding:6px 13px;border-radius:30px;font-family:inherit;font-size:.78rem;display:inline-block}
.msg .nlp-act:hover{filter:brightness(1.08)}
.msg.bot{line-height:1.7}
`;

// ---- application JS (data globals + logic) ----
const logic=fs.readFileSync('portal_logic.js','utf8');
const dataJS=
  `const DIM=${JSON.stringify(pd.DIM)};\n`+
  `const FACTS=${JSON.stringify(pd.FACTS)};\n`+
  `const INV=${JSON.stringify(pd.INV)};\n`+
  `const WORK=${JSON.stringify(pd.WORK)};\n`+
  `const GAP=${JSON.stringify(pd.GAP)};\n`;

// ---- final document ----
const html=`<!DOCTYPE html>
<html lang="en" dir="ltr" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PepsiCo BI · Supply Chain & Commercial Intelligence</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/chartjs-plugin-datalabels/2.2.0/chartjs-plugin-datalabels.min.js"></script>
<style>
${css}
${filterCSS}
</style>
</head>
<body>
${body}
<script>
/* ===== image assets (reused from original export) ===== */
${pimgLine}
${logoLine}
/* ===== DATA (generated · multi-year EMEA facts) ===== */
${dataJS}
/* ===== APPLICATION LOGIC ===== */
${logic}
</script>
</body>
</html>`;

fs.writeFileSync(OUT, html);
fs.writeFileSync('index.html', html);   // identical copy used as the hosted entry (GitHub Pages)
const kb=(Buffer.byteLength(html)/1024).toFixed(0);
console.log('Wrote '+OUT+' + index.html  ('+kb+' KB)');
console.log('  CSS chars:',css.length,' body chars:',body.length,
  ' logo:',(logoLine.length/1024).toFixed(0)+'KB',' pimg:',(pimgLine.length/1024).toFixed(0)+'KB',
  ' data:',(dataJS.length/1024).toFixed(0)+'KB');
