/* ============================================================================
   Shared NLP lexicon - normalisation, bilingual gazetteer, delexicalizer and
   feature extractor. Used IDENTICALLY by the trainer (Node) and the in-browser
   runtime, so training and inference can never drift apart.
   ========================================================================== */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.NLPLEX = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  // ---- text normalisation (Arabic diacritics/letter variants + lowercase) ----
  function norm(s) {
    return (s || '').toString().toLowerCase()
      .replace(/[ً-ْٰـ]/g, '')
      .replace(/[إأآا]/g, 'ا').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/ة/g, 'ه')
      .replace(/[^a-z0-9؀-ۿ% ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // ---- metric vocabulary (key -> surface synonyms, EN + AR) ----
  const METRIC_SYN = {
    revenue:   ['revenue', 'sales', 'total revenue', 'turnover revenue', 'money', 'income', 'earnings', 'revenues', 'top line', 'الايراد', 'الايرادات', 'المبيعات', 'ايراد', 'مبيعات', 'فلوس', 'الدخل'],
    net:       ['net profit', 'profit', 'net income', 'bottom line', 'صافي الربح', 'صافي ربح', 'الربح', 'ربح', 'الارباح'],
    gross:     ['gross profit', 'gross margin profit', 'الربح الاجمالي', 'اجمالي الربح'],
    margin:    ['margin', 'net margin', 'profit margin', 'الهامش', 'هامش الربح', 'هامش صافي', 'هامش'],
    cogs:      ['cogs', 'cost of goods', 'cost', 'costs', 'التكلفه', 'تكلفه', 'تكلفه البضاعه'],
    units:     ['units', 'volume', 'units sold', 'quantity', 'الوحدات', 'الكميه', 'وحدات', 'الحجم', 'كميه'],
    otd:       ['on time delivery', 'on-time delivery', 'otd', 'delivery', 'التسليم في الموعد', 'التسليم', 'تسليم'],
    otif:      ['otif', 'on time in full', 'التسليم الكامل', 'الكامل في الموعد'],
    fill:      ['fill rate', 'availability', 'service level', 'نسبه التلبيه', 'التلبيه', 'التوافر', 'تلبيه'],
    turnover:  ['turnover', 'attrition', 'churn rate', 'معدل الدوران', 'الدوران', 'دوران', 'الاستقالات'],
    headcount: ['headcount', 'employees', 'staff', 'workforce size', 'عدد الموظفين', 'العماله', 'الموظفين', 'عدد العمال'],
    oos:       ['out of stock', 'oos', 'stockout', 'stockouts', 'النفاد', 'نفاد المخزون', 'نافد', 'المخزون'],
    ecom:      ['e commerce', 'ecommerce', 'online sales', 'gmv', 'online', 'المبيعات الالكترونيه', 'الاونلاين', 'التجاره الالكترونيه', 'الكتروني'],
    aov:       ['average order value', 'aov', 'order value', 'متوسط قيمه الطلب', 'متوسط الطلب', 'قيمه الطلب'],
    abandon:   ['cart abandonment', 'abandon rate', 'cart abandon', 'ترك السله', 'هجر السله', 'التخلي عن السله'],
    conversion:['conversion rate', 'conversion', 'cvr', 'معدل التحويل', 'التحويل'],
  };

  // ---- channel extra aliases (besides the live names) ----
  const CH_ALIAS = { 'E-commerce': ['online', 'ecommerce', 'e commerce', 'اونلاين', 'الكتروني', 'انترنت'],
    'Foodservice': ['food service', 'horeca', 'restaurants', 'مطاعم'],
    'Modern Trade': ['modern trade', 'supermarket', 'retail', 'حديث'],
    'Traditional Trade': ['traditional trade', 'wholesale', 'تقليدي'] };
  const CAT_ALIAS = { 'Beverages': ['drinks', 'مشروبات'], 'Snacks': ['chips', 'سناكس', 'شيبسي'], 'Foods': ['food', 'وجبات', 'اطعمه', 'طعام'] };
  const REG_ALIAS = { 'Levant & Egypt': ['egypt', 'levant', 'مصر', 'الشام'], 'Gulf & Middle East': ['gulf', 'middle east', 'ksa', 'uae', 'dubai', 'الخليج', 'السعوديه', 'الامارات', 'دبي'],
    'Türkiye': ['turkey', 'turkiye', 'تركيا'], 'Germany & DACH': ['germany', 'dach', 'المانيا'], 'UK & Ireland': ['uk', 'britain', 'ireland', 'بريطانيا', 'انجلترا'],
    'Iberia': ['spain', 'iberia', 'اسبانيا'], 'France & Benelux': ['france', 'benelux', 'فرنسا'], 'Poland & CEE': ['poland', 'cee', 'بولندا'] };
  const PROD_ALIAS = { 'Pepsi': ['بيبسي'], '7UP': ['سفن', 'سفن اب', 'سفناب'], 'Mountain Dew': ['ماونتن', 'ماونتن ديو'], 'Aquafina': ['اكوافينا', 'مياه'],
    'Mirinda Orange': ['ميرندا', 'ميراندا'], 'Gatorade': ['جاتوريد'], 'Lipton Ice Tea': ['ليبتون'], 'Tropicana': ['تروبيكانا'],
    'Doritos': ['دوريتوس'], 'Cheetos': ['تشيتوس', 'شيتوس'], 'Quaker Oats': ['كواكر', 'شوفان'], 'Rockstar Energy': ['روكستار'], 'Sting Energy': ['ستينج', 'ستينق'] };

  const YEAR_REL = { 'this year': 'CUR', 'current year': 'CUR', 'السنه دي': 'CUR', 'السنه الحاليه': 'CUR', 'هذا العام': 'CUR',
    'last year': 'PREV', 'previous year': 'PREV', 'السنه اللي فاتت': 'PREV', 'العام الماضي': 'PREV', 'السنه الماضيه': 'PREV' };

  const PH = { metric: 'slotmetric', product: 'slotproduct', region: 'slotregion', channel: 'slotchannel',
    category: 'slotcategory', brand: 'slotbrand', year: 'slotyear', num: 'slotnum' };

  // ---- edit distance (capped) for typo-tolerant single-token matches ----
  function lev(a, b) {
    const m = a.length, n = b.length; if (Math.abs(m - n) > 2) return 9;
    let prev = Array.from({ length: n + 1 }, (_, i) => i);
    for (let i = 1; i <= m; i++) {
      let cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }

  /* Build a tagger bound to a concrete entity configuration.
     cfg = { products:[name], regions:[name], channels:[name], cats:[name], brands:[name], years:[int] } */
  function makeTagger(cfg) {
    const dict = new Map();           // surface(norm) -> {type,value,w}
    const fuzzy = [];                 // single-token surfaces for typo matching
    const add = (surface, type, value) => {
      const s = norm(surface); if (!s) return;
      const w = s.split(' ').length;
      if (!dict.has(s)) dict.set(s, { type, value, w });
      if (w === 1 && s.length >= 4) fuzzy.push({ s, type, value });
    };
    // metrics
    for (const k in METRIC_SYN) METRIC_SYN[k].forEach(s => add(s, 'metric', k));
    // entities (live names + aliases)
    cfg.products.forEach((n, i) => { add(n, 'product', i); (PROD_ALIAS[n] || []).forEach(a => add(a, 'product', i)); });
    cfg.regions.forEach((n, i) => { add(n, 'region', i); (REG_ALIAS[n] || []).forEach(a => add(a, 'region', i)); });
    cfg.channels.forEach((n, i) => { add(n, 'channel', i); (CH_ALIAS[n] || []).forEach(a => add(a, 'channel', i)); });
    cfg.cats.forEach(n => { add(n, 'category', n); (CAT_ALIAS[n] || []).forEach(a => add(a, 'category', n)); });
    cfg.brands.forEach(n => add(n, 'brand', n));
    cfg.years.forEach((y, i) => add(String(y), 'year', i));
    for (const k in YEAR_REL) add(k, 'yearrel', YEAR_REL[k]);
    let maxW = 1; dict.forEach(v => { if (v.w > maxW) maxW = v.w; });

    function tag(text) {
      const toks = norm(text).split(' ').filter(Boolean);
      const out = [], slots = { metric: [], products: [], regions: [], channels: [], cats: [], brands: [], years: [], yearrel: [], nums: [] };
      let i = 0;
      while (i < toks.length) {
        let matched = false;
        for (let w = Math.min(maxW, toks.length - i); w >= 1 && !matched; w--) {
          const gram = toks.slice(i, i + w).join(' ');
          const hit = dict.get(gram);
          if (hit) { place(hit); i += w; matched = true; }
        }
        if (matched) continue;
        const t = toks[i];
        if (/^\d+$/.test(t)) {                       // bare number
          if (t.length === 4 && /^20\d\d$/.test(t)) { out.push(PH.year); }   // unknown year -> still a year slot shape
          else { out.push(PH.num); slots.nums.push(parseInt(t)); }
          i++; continue;
        }
        // typo-tolerant single token
        let fz = null;
        if (t.length >= 4) for (const f of fuzzy) { if (lev(t, f.s) <= 1) { fz = f; break; } }
        if (fz) { place(fz); i++; continue; }
        out.push(t); i++;
      }
      function place(hit) {
        if (hit.type === 'metric') { out.push(PH.metric); slots.metric.push(hit.value); }
        else if (hit.type === 'product') { out.push(PH.product); slots.products.push(hit.value); }
        else if (hit.type === 'region') { out.push(PH.region); slots.regions.push(hit.value); }
        else if (hit.type === 'channel') { out.push(PH.channel); slots.channels.push(hit.value); }
        else if (hit.type === 'category') { out.push(PH.category); slots.cats.push(hit.value); }
        else if (hit.type === 'brand') { out.push(PH.brand); slots.brands.push(hit.value); }
        else if (hit.type === 'year') { out.push(PH.year); slots.years.push(hit.value); }
        else if (hit.type === 'yearrel') { out.push(PH.year); slots.yearrel.push(hit.value); }
      }
      return { toks: out, slots };
    }

    // feature extraction: word uni/bi-grams over delexicalised tokens
    // + char 3/4-grams of non-placeholder tokens (catches cue-word typos/variants)
    const PHSET = new Set(Object.values(PH));
    function features(text) {
      const { toks, slots } = tag(text);
      const f = [];
      for (let i = 0; i < toks.length; i++) {
        f.push('w:' + toks[i]);
        if (i + 1 < toks.length) f.push('b:' + toks[i] + '_' + toks[i + 1]);
        if (!PHSET.has(toks[i])) {
          const t = '^' + toks[i] + '$';
          for (let n = 3; n <= 4; n++) for (let j = 0; j + n <= t.length; j++) f.push('c:' + t.slice(j, j + n));
        }
      }
      f.push('#len:' + Math.min(toks.length, 9));
      return { feats: f, slots, toks };
    }

    return { tag, features, cfg };
  }

  return { norm, makeTagger, METRIC_SYN, PH,
    ALIAS: { CH_ALIAS, CAT_ALIAS, REG_ALIAS, PROD_ALIAS, YEAR_REL } };
});
