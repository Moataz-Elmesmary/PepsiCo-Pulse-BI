/* ============================================================================
   Intent-classifier trainer for the Pulse BI assistant.
   - Generates a large, augmented, bilingual (EN/AR) labelled corpus
   - Delexicalises with the SHARED lexicon, builds n-gram features
   - Trains a softmax (multinomial logistic-regression) classifier with SGD
   - Evaluates on a held-out test split (accuracy + per-intent F1 + confusion)
   - Exports a compact sparse model to nlp/nlp_model.json
   No external dependencies.
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const LEX = require('./lexicon');
const G = require('../gen');

// ---- deterministic RNG ----
let _s = 1234567;
const rnd = () => { _s = (_s * 1103515245 + 12345) & 0x7fffffff; return _s / 0x7fffffff; };
const pick = a => a[Math.floor(rnd() * a.length)];
const chance = p => rnd() < p;

// ---- entity config (same entities the dashboard uses) ----
const cfg = {
  products: G.PRODUCTS.map(p => p[0]),
  regions: G.REGIONS.map(r => r[0]),
  channels: G.CHANNELS.map(c => c[0]),
  cats: [...new Set(G.PRODUCTS.map(p => p[2]))],
  brands: [...new Set(G.PRODUCTS.map(p => p[1]))],
  years: G.YEARS,
};
const tagger = LEX.makeTagger(cfg);

// ---- surface pools for filling templates ----
const metricKeys = Object.keys(LEX.METRIC_SYN);
const finMetrics = ['revenue', 'net', 'gross', 'cogs', 'units', 'margin'];
const surf = {
  M: () => pick(LEX.METRIC_SYN[pick(metricKeys)]),
  Mf: () => pick(LEX.METRIC_SYN[pick(finMetrics)]),
  P: () => { const i = Math.floor(rnd() * cfg.products.length); return chance(.3) ? pick(LEX.ALIAS.PROD_ALIAS[cfg.products[i]] || [cfg.products[i]]) : cfg.products[i]; },
  R: () => { const n = pick(cfg.regions); return chance(.35) ? pick(LEX.ALIAS.REG_ALIAS[n] || [n]) : n; },
  C: () => { const n = pick(cfg.channels); return chance(.4) ? pick(LEX.ALIAS.CH_ALIAS[n] || [n]) : n; },
  K: () => { const n = pick(cfg.cats); return chance(.4) ? pick(LEX.ALIAS.CAT_ALIAS[n] || [n]) : n; },
  B: () => pick(cfg.brands),
  Y: () => chance(.25) ? pick(['this year', 'last year', 'السنه دي', 'العام الماضي']) : String(pick(cfg.years)),
  N: () => String(pick([3, 5, 10, 5, 5])),
  DIM: () => pick(['products', 'skus', 'regions', 'markets', 'channels', 'categories', 'brands',
    'منتجات', 'المنتجات', 'مناطق', 'قنوات', 'القنوات', 'فئات', 'الفئات', 'علامات']),
};

// ---- templates per intent ----
const T = {
  value: [
    'what is {M}', "what's the {M}", '{M}', 'how much {M}', 'give me {M}', 'show me {M}', 'tell me {M}',
    '{M} for {P}', '{M} of {P}', '{M} of {P} in {R}', '{M} in {Y}', '{M} for {K} in {Y}',
    'what is {M} for {B}', '{M} for {C} channel', 'how is {M}', 'what was {M} in {R} last year',
    'current {M}', '{M} of {K}', '{M} in {R} {Y}', 'whats {M} for {P} in {C}',
    'كم {M}', 'ايه {M}', '{M}', 'كام {M}', '{M} {P}', '{M} {P} في {R}', '{M} في {Y}',
    'قولي {M} بتاع {P}', '{M} لـ {K} في {Y}', 'عايز اعرف {M}', 'ايه قيمه {M}', '{M} في {R}',
    '{M} للـ {C}', 'كام {M} بتاع {K}', '{M} {B}',
  ],
  rank: [
    'top {N} {DIM} by {M}', 'top {DIM} by {M}', 'best {DIM}', 'best {DIM} by {M}', 'highest {M} {DIM}',
    'which {DIM} has the highest {M}', 'bottom {N} {DIM} by {M}', 'worst {DIM}', 'worst {DIM} by {M}',
    'lowest {M} {DIM}', 'which {DIM} has the lowest {M}', 'least selling {DIM}', 'show top {N} {DIM}',
    'rank {DIM} by {M}', 'leading {DIM}', 'top {DIM}',
    'اعلى {N} {DIM} بـ {M}', 'افضل {DIM}', 'اكثر {DIM} {M}', 'اعلى {DIM} في {M}', 'اقل {DIM} {M}',
    'ادنى {DIM} في {M}', 'اسوأ {DIM}', 'اكبر {DIM}', 'اعلى {N} {DIM}', 'افضل {DIM} حسب {M}', 'اعلى {DIM}',
  ],
  compare: [
    'compare {P} vs {P}', '{P} vs {P}', '{P} versus {P}', 'compare {R} and {R}', '{R} vs {R} {M}',
    'difference between {P} and {P}', '{M} of {P} compared to {P}', 'which is bigger {P} or {P}',
    'compare {C} and {C}', '{K} vs {K}', 'compare {M} for {P} and {P}',
    '{P} or {P} which is better', '{P} or {P} who wins', 'who wins {P} or {P}', '{P} or {P} on {M}',
    '{R} against {R}', '{R} against {R} on {M}', '{P} against {P}', 'is {P} better than {P}',
    '{P} or {P} who has more {M}', 'which is better {P} or {P}', '{M} {P} vs {P}',
    'قارن {P} مع {P}', '{P} مقابل {P}', '{P} ضد {P}', 'الفرق بين {R} و {R}', 'قارن {M} بين {P} و {P}',
    'مين اكبر {P} ولا {P}', 'قارن {C} و {C}', 'الفرق بين {K} و {K}', '{P} او {P} مين احسن',
    '{P} او {P} مين اكبر', 'مين الافضل {P} او {P}', '{R} ضد {R} في {M}', '{P} او {P}',
  ],
  trend: [
    '{M} trend', 'show me the {M} trend', 'how did {M} change over time', '{M} over the year',
    'monthly {M}', '{M} growth this year', 'is {M} going up or down', 'trend of {M} in {R}',
    '{M} by month', 'how is {M} trending', '{M} development over time',
    'how has {M} moved', 'how did {M} move this year', '{M} evolution', 'has {M} improved',
    '{M} performance over time', 'where is {M} heading', '{M} year to date', 'how is {M} doing over time',
    'اتجاه {M}', '{M} على مدار السنه', '{M} شهري', 'نمو {M}', '{M} بيزيد ولا بيقل',
    'اتجاه {M} في {R}', 'تطور {M}', '{M} خلال السنه', 'ازاي {M} اتحرك', '{M} اتغير ازاي', '{M} حسن ولا لا',
  ],
  share: [
    'category mix', 'revenue share by category', '{M} mix', 'market share', 'share of {P}',
    'how is revenue split', 'breakdown by category', 'what is the category split', 'product share',
    'حصه الفئات', 'توزيع الايراد', 'الحصه السوقيه', 'نسبه {P}', 'توزيع المبيعات على الفئات',
    'توزيع الفئات', 'حصه {P}',
  ],
  filter: [
    'show me {C} in {R}', 'filter to {P}', 'drill into {R}', 'focus on {K} in {Y}', 'show {P} in {R}',
    'view {C} channel', 'filter by {B}', 'show me {K} for {Y}', 'let me see {P} in {C}',
    'filter the dashboard to {R}', 'focus on {P}', 'show only {C}', 'drill down into {K}',
    'show me {P}', 'filter to {C} in {R}', 'view {R} only',
    'اعرض {C} في {R}', 'فلتر على {P}', 'ركز على {K}', 'وري {P} في {R}', 'خليني اشوف {C}',
    'اظهر {K} في {Y}', 'اعرض {B}', 'فلتر الداشبورد على {R}', 'اعرض {P}', 'ركز على {P} في {R}',
  ],
  smalltalk: [
    'hi', 'hello', 'hey', 'help', 'what can you do', 'who are you', 'thanks', 'thank you', 'good morning',
    'what is this', 'how do you work', 'menu',
    'اهلا', 'مرحبا', 'مساعده', 'ساعدني', 'ايه اللي تقدر تعمله', 'شكرا', 'مين انت', 'ازيك', 'عامل ايه',
    'ايه ده', 'انت بتشتغل ازاي',
  ],
};
const INTENTS = Object.keys(T);

// ---- light typo injector (non-destructive enough to keep the label valid) ----
function typo(s) {
  const words = s.split(' '); const i = Math.floor(rnd() * words.length); let w = words[i];
  if (w.length < 4) return s;
  const j = 1 + Math.floor(rnd() * (w.length - 2));
  const op = Math.floor(rnd() * 3);
  if (op === 0) w = w.slice(0, j) + w.slice(j + 1);                 // drop
  else if (op === 1) w = w.slice(0, j) + w[j] + w.slice(j);          // duplicate
  else w = w.slice(0, j) + w[j + 1] + w[j] + w.slice(j + 2);         // swap
  words[i] = w; return words.join(' ');
}
function fill(tpl) {
  let s = tpl.replace(/\{(\w+)\}/g, (_, k) => surf[k] ? surf[k]() : k);
  if (chance(.18)) s = pick(['can you ', 'please ', 'i want ', 'show ', 'من فضلك ', 'لو سمحت ', 'عايز ']) + s;
  if (chance(.10)) s = s.replace(/\bthe \b/g, '');
  if (chance(.15)) s = typo(s);
  return s;
}

// ---- build corpus ----
const PER = 110;                      // examples per template
const C = INTENTS.length;
const data = [];
INTENTS.forEach((intent, yi) => {
  T[intent].forEach((tpl, ti) => { for (let k = 0; k < PER; k++) data.push({ text: fill(tpl), y: yi, t: intent + ':' + ti }); });
});
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } };
shuffle(data);

// ---- random held-out test (unseen entity fills, typos & augmentations) ----
const nTest = Math.floor(data.length * 0.15);
const test = data.slice(0, nTest), train = data.slice(nTest);

// ---- featurise; vocab from TRAIN ONLY (no leakage) ----
const counts = new Map();
train.forEach(d => { d.f = tagger.features(d.text).feats; new Set(d.f).forEach(ft => counts.set(ft, (counts.get(ft) || 0) + 1)); });
const vocab = [...counts.entries()].filter(([, c]) => c >= 3).sort((a, b) => b[1] - a[1]).slice(0, 6000).map(e => e[0]);
const fidx = new Map(vocab.map((f, i) => [f, i]));
const F = vocab.length;
const encode = d => { const s = new Set(); d.x = []; (d.f || tagger.features(d.text).feats).forEach(ft => { const i = fidx.get(ft); if (i != null && !s.has(i)) { s.add(i); d.x.push(i); } }); };
train.forEach(encode); test.forEach(encode);
console.log(`corpus: ${data.length}  | features: ${F}  | intents: ${C}  | train ${train.length} / test ${test.length}`);

// ---- softmax model ----
const W = Array.from({ length: C }, () => new Float64Array(F));
const b = new Float64Array(C);
function logits(x) { const z = new Float64Array(C); for (let c = 0; c < C; c++) { let s = b[c]; const Wc = W[c]; for (const i of x) s += Wc[i]; z[c] = s; } return z; }
function softmax(z) { let m = -1e9; for (const v of z) if (v > m) m = v; let s = 0; const p = new Float64Array(C); for (let c = 0; c < C; c++) { p[c] = Math.exp(z[c] - m); s += p[c]; } for (let c = 0; c < C; c++) p[c] /= s; return p; }
function predict(x) { const p = softmax(logits(x)); let a = 0; for (let c = 1; c < C; c++) if (p[c] > p[a]) a = c; return [a, p[a]]; }
function acc(set) { let ok = 0; for (const d of set) if (predict(d.x)[0] === d.y) ok++; return ok / set.length; }

// ---- train (online SGD + L2 + lr decay, keep best on a val slice) ----
const valN = Math.floor(train.length * 0.1), val = train.slice(0, valN), tr = train.slice(valN);
const L2 = 1e-5, EPOCHS = 22; let lr = 0.5, best = -1, bestW = null, bestB = null;
for (let e = 0; e < EPOCHS; e++) {
  for (let i = tr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1));[tr[i], tr[j]] = [tr[j], tr[i]]; }
  for (const d of tr) {
    const p = softmax(logits(d.x));
    for (let c = 0; c < C; c++) {
      const g = p[c] - (c === d.y ? 1 : 0);
      b[c] -= lr * g;
      const Wc = W[c];
      for (const i of d.x) Wc[i] -= lr * (g + L2 * Wc[i]);
    }
  }
  lr *= 0.88;
  const va = acc(val);
  if (va > best) { best = va; bestW = W.map(r => Float64Array.from(r)); bestB = Float64Array.from(b); }
  if (e % 3 === 0 || e === EPOCHS - 1) console.log(`  epoch ${String(e + 1).padStart(2)}  val acc ${(va * 100).toFixed(2)}%`);
}
for (let c = 0; c < C; c++) { W[c] = bestW[c]; b[c] = bestB[c]; }

// ---- evaluate on test ----
const cm = Array.from({ length: C }, () => new Array(C).fill(0));
for (const d of test) cm[d.y][predict(d.x)[0]]++;
let correct = 0; for (let c = 0; c < C; c++) correct += cm[c][c];
const testAcc = correct / test.length;
console.log(`\nTEST accuracy: ${(testAcc * 100).toFixed(2)}%  (best val ${(best * 100).toFixed(2)}%)\n`);
const perIntent = {};
console.log('intent        prec    rec     f1');
for (let c = 0; c < C; c++) {
  let tp = cm[c][c], fp = 0, fn = 0;
  for (let k = 0; k < C; k++) { if (k !== c) { fp += cm[k][c]; fn += cm[c][k]; } }
  const prec = tp / (tp + fp || 1), rec = tp / (tp + fn || 1), f1 = 2 * prec * rec / (prec + rec || 1);
  perIntent[INTENTS[c]] = { precision: +prec.toFixed(3), recall: +rec.toFixed(3), f1: +f1.toFixed(3) };
  console.log(`${INTENTS[c].padEnd(12)}  ${(prec * 100).toFixed(1).padStart(5)}  ${(rec * 100).toFixed(1).padStart(5)}  ${(f1 * 100).toFixed(1).padStart(5)}`);
}

// ---- export compact sparse model ----
const THR = 0.02;
const Wsparse = W.map(Wc => { const o = {}; for (let i = 0; i < F; i++) if (Math.abs(Wc[i]) >= THR) o[i] = +Wc[i].toFixed(3); return o; });
const kept = Wsparse.reduce((s, o) => s + Object.keys(o).length, 0);
const model = { labels: INTENTS, feats: vocab, b: Array.from(b).map(v => +v.toFixed(3)), W: Wsparse,
  meta: { corpus: data.length, features: F, testAccuracy: +testAcc.toFixed(4) } };
fs.writeFileSync(path.join(__dirname, 'nlp_model.json'), JSON.stringify(model));
fs.writeFileSync(path.join(__dirname, 'metrics.json'), JSON.stringify({
  corpus: data.length, features: F, intents: INTENTS, testAccuracy: +testAcc.toFixed(4),
  perIntent, confusion: cm, nonzeroWeights: kept
}, null, 2));
const kb = (fs.statSync(path.join(__dirname, 'nlp_model.json')).size / 1024).toFixed(0);
console.log(`\nexported nlp_model.json (${kb} KB, ${kept} non-zero weights) + metrics.json`);
