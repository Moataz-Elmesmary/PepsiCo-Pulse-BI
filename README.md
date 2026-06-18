# PepsiCo Pulse BI - Supply Chain & Commercial Intelligence

**A boardroom-grade analytics portal for an EMEA beverages-and-snacks operation** - five interactive dashboards, three years of transactional data, and an assistant you can talk to, all living inside one HTML file you open with a double-click.

<p align="center">
  <a href="https://moataz-elmesmary.github.io/PepsiCo-Pulse-BI/"><b>▶ Open the live demo</b></a> &nbsp;·&nbsp; sign in with <code>moataz</code> / <code>moataz</code>
</p>

<p align="center">
  <img src="docs/gifs/demo-filters.gif" alt="Live cross-filtering" width="880">
  <br><em>Scope the whole portal to one region + one channel - every KPI, chart and insight re-derives on the spot.</em>
</p>

---

## See it in motion

**The sign-in experience** (animated brand scene, parallax, EN/AR, dark &amp; light):

<p align="center"><img src="docs/gifs/demo-login.gif" alt="Animated login" width="820"></p>

**A tour of the five dashboards** (Overview, Supply Chain, Revenue &amp; Finance, Products, Workforce):

<p align="center"><img src="docs/gifs/demo-tour.gif" alt="Dashboard tour" width="880"></p>

**Talk to your data.** Ask in English or Arabic; it answers from the live numbers and can reshape the dashboard for you (*"show me E-commerce in Egypt"* filters every page):

<p align="center"><img src="docs/gifs/demo-assistant.gif" alt="NLP assistant" width="880"></p>

---

## What's inside

- **Five dashboards, a different audience each** - an executive snapshot, a supply-chain control tower, a finance & e-commerce view, a product-portfolio page, and a deep workforce / HR analytics screen.
- **Everything cross-filters.** Pick any mix of Year, Region, Channel, Category, Brand or Product and the page re-derives itself from the raw rows - these are computed views, not pictures of pre-canned numbers.
- **An assistant that understands the business.** Type a question and it pulls out the products, regions, channels and time periods you mentioned (in either language), then looks a figure up, ranks, compares, reads a trend, or applies the matching filter for you.
- **Genuinely bilingual.** The entire interface mirrors into Arabic with full right-to-left layout; dark and light themes included.
- **Three years of believable data.** 2024-2026 with category seasonality, channel and regional mix, promotions, and ~12.5% year-over-year growth - all reproducible from a single seeded generator.

> 🔐 Demo login: **`moataz` / `moataz`**

---

## 📑 Table of contents

1. [Quick start](#-quick-start)
2. [The dashboards (with screenshots)](#-the-dashboards)
3. [The Smart Assistant (NLP)](#-the-smart-assistant-nlp)
4. [Where the data comes from & how it was built](#-the-data--methodology)
5. [How it works (architecture)](#-architecture)
6. [Project structure](#-project-structure)
7. [Build & regenerate](#-build--regenerate)
9. [Tech stack](#-tech-stack)

---

## 🚀 Quick start

```bash
# just open it - no install needed
start PepsiCo_Pulse_BI.html      # Windows
# or double-click the file in any modern browser
```

Log in with **`moataz` / `moataz`**. An internet connection is used on first load to fetch the chart library and fonts from a CDN; an offline build is possible (see [`README_PUBLISH.md`](README_PUBLISH.md)).

---

## 📊 The dashboards

### 1) Executive Overview
The C-level snapshot: headline KPIs (Revenue, Net Profit, Units, On-Time Delivery) with **live YoY deltas**, an AI-style "key insights" strip, revenue-vs-profit trend, category mix, supply health by region, and on-time-delivery vs target.

![Executive Overview](docs/screenshots/02-overview.png)

### 2) Supply Chain
Out-of-stock exposure by SKU, inventory by node (MAKE plants vs MOVE distribution centres), OTIF trend vs the 95% target, and a live replenishment watch-list table.

![Supply Chain](docs/screenshots/03-supply-chain.png)

### 3) Revenue & Finance
Revenue with an overlaid net-margin line, net profit by product (Pareto), gross-vs-net margin trends, and a full **e-commerce conversion funnel** (visits → views → cart → checkout → purchase) with abandonment economics.

![Revenue & Finance](docs/screenshots/04-revenue-finance.png)

### 4) Products
Market share, top sellers by volume, and a visual **product portfolio** grid with per-SKU units, revenue, net profit and YoY - every product image included.

![Products](docs/screenshots/05-products.png)

### 5) Workforce
The deepest page: headcount by function, attrition split, turnover trend, hiring pipeline, a **position × area headcount-gap heatmap**, understaffed roles, turnover by role, joiners vs leavers, resignation reasons, recruiter performance, time-to-fill, and notice-vs-pipeline exposure.

![Workforce](docs/screenshots/06-workforce.png)

### Slicers in action
Filters cross-cut everything. Below, the whole portal is scoped to **E-commerce · 2026** - KPIs, trends, regional fill rates and insights all recompute live:

![Filtered view](docs/screenshots/08-overview-filtered.png)

---

## 🤖 The Smart Assistant: a trained NLU model

The assistant is a real **machine-learning pipeline**, not a pile of `if` statements. It runs **entirely in the browser** over the live (filtered) data, with no API calls, and understands both English and Arabic.

**How it works (intent + slots):**

1. **Normalise** the text (Arabic diacritics and letter variants, lowercasing).
2. **Delexicalise + slot-fill** with a bilingual gazetteer and typo-tolerant matching (edit distance): products, brands, regions, channels, categories, metrics and years are tagged and replaced with placeholders. This is the standard, robust approach for a closed business domain.
3. **Classify the intent** with a trained softmax (multinomial logistic-regression) model over word and character n-gram features.
4. **Route** to the answer, computed live from the data, picking up any scope the slots captured.

**Model card**

| | |
|---|---|
| Task | 7-way intent classification (`value`, `rank`, `compare`, `trend`, `share`, `filter`, `smalltalk`) |
| Training data | **21,120** generated, augmented, bilingual examples (paraphrase templates + synonyms + injected typos) |
| Features | ~3,900 delexicalised word/char n-grams |
| Held-out test accuracy | **99.8%** (per-intent F1 all ≥ 0.99) |
| Generalisation check | **100%** on a separate set of hand-written paraphrases not in the templates |
| Model size | ~190 KB sparse weights, embedded in the page |
| Training | `node nlp/train.js` (pure JS, no dependencies); metrics saved to `nlp/metrics.json` |

> The classifier decides the *shape* of the question; the gazetteer decides *what* it is about. Training and inference share one lexicon (`nlp/lexicon.js`), so they can never drift apart.

**What it can do:**

| Intent | Example (EN) | Example (AR) |
|---|---|---|
| Look up any figure, scoped | `net profit of Snacks in 2026` | `صافي ربح بيبسي في مصر` |
| Rank top/bottom by any dimension | `top 5 products by revenue` | `أعلى 3 قنوات بالإيراد` |
| Compare two entities | `compare Pepsi vs 7UP` | `قارن مصر مقابل تركيا` |
| Describe a trend | `revenue trend this year` | `اتجاه الإيراد السنة دي` |
| Drive the dashboard | `show me E-commerce in Egypt` | `اعرض الأونلاين في مصر` |

![Smart Assistant](docs/screenshots/07-smart-assistant.png)

Answers include one-click **"Filter dashboard to this"** actions, so a question can instantly become a global filter.

---

## 🧬 The data & methodology

> **Short version:** the data is **synthetic but realistic** - generated by a small, deterministic Node script (`gen.js`) that models a PepsiCo-EMEA operation, then embedded directly into the HTML and aggregated live in the browser. It is reproducible (seeded RNG) and also exported to CSV for inspection.

### Dimensions modelled
| Dimension | Members |
|---|---|
| **Years** | 2024, 2025, 2026 (3 full years) |
| **Products** | 20 SKUs across **Beverages, Snacks, Foods** (incl. energy drinks) - each with unit price, unit cost, base volume and brand |
| **Regions** | 8 EMEA clusters (UK & Ireland, Iberia, France & Benelux, Germany & DACH, Poland & CEE, Türkiye, Levant & Egypt, Gulf & Middle East) |
| **Channels** | Modern Trade, Traditional Trade, E-commerce, Foodservice |
| **Nodes / Locations** | MAKE (plants) & MOVE (distribution centres) - 16 sites |

### The sales fact table
The core fact is generated at the grain **(year × month × product × region × channel) → units sold** = **23,040 rows**. From each row, money is derived deterministically:

```
Revenue      = units × unitPrice × channelPriceFactor
COGS         = units × unitCost  × (1 + 3% × yearIndex)     # cost inflation
GrossProfit  = Revenue − COGS
NetProfit    = GrossProfit × 0.43                            # net conversion
```

### What makes it "realistic"
- **Seasonality** per category - beverages peak in summer, snacks in Q4, foods in winter (monthly multiplier curves).
- **Compound YoY growth** (~12.5%) built from region growth bias + channel bias (e-commerce grows fastest) + per-SKU drift.
- **Monthly noise** (±14%) and occasional **promo spikes** (×1.15-1.5) so trends look organic, not flat.
- **Channel price factors** (e-commerce/foodservice price higher, wholesale lower) and **per-year cost inflation**.
- Companion datasets generated the same way: **inventory snapshot** (on-hand, reorder point, in-transit, days-cover, OOS%, status), **workforce monthly** (headcount, hires, voluntary/involuntary resignations, plan), and a **position × area headcount-gap** matrix.

### Reproducibility & inspection
- The generator uses a **seeded RNG (mulberry32)** so running it again produces the identical dataset.
- The full dataset is exported to CSV in [`data_export/`](data_export/) - `Sales_Monthly.csv`, `Dim_Products.csv`, `Dim_Locations.csv`, `Inventory_Snapshot.csv`, `Workforce_Monthly.csv`, `HC_Gap_PositionArea.csv` - so you can open every number in Excel.

> ⚠️ This is **sample/portfolio data**, not real PepsiCo figures.

---

## 🏗 Architecture

```
gen.js ──────────────┐
 (data model)        │   build.js merges everything
portal_logic.js ─────┼─────────────────────────────►  PepsiCo_Pulse_BI.html
 (engine + UI + NLP) │                                  (single self-contained file)
brand assets (CSS, images, logos) ┘
```

- **Single-file delivery.** `build.js` injects the generated data + application logic + reused styling/imagery into one portable `.html` (~2.3 MB).
- **Live aggregation engine.** A `compute()` function rebuilds *all* metrics (totals, monthly trends, per-product, per-region, margins, e-commerce funnel, workforce) from the raw fact table on every filter change - this is what makes the slicers real.
- **Global filter store** drives a re-render of the active dashboard via Chart.js.
- **In-browser NLP** normalises Arabic/English text (handles diacritics & letter variants), extracts entities, and answers from the same live aggregates.
- **Validated headlessly** - `render_smoke.js` mounts the app with a mocked DOM and exercises every page, filter and NLP query (0 errors), and the screenshots in this README are captured automatically by `screenshot.js` via the Chrome DevTools Protocol.

---

## 📁 Project structure

| Path | Description |
|---|---|
| **`PepsiCo_Pulse_BI.html`** | **The product - open or deploy this.** |
| `gen.js` | Deterministic data generator (dimensions, seasonality, affinities, facts) |
| `portal_logic.js` | App logic: aggregation engine, filters, charts, NLP assistant |
| `nlp/lexicon.js` | Shared normaliser + bilingual gazetteer + delexicaliser (train and runtime) |
| `nlp/train.js` | Trains the intent classifier and exports `nlp_model.json` + `metrics.json` |
| `nlp/nlp_model.json` | The trained model (embedded into the page at build) |
| `build.js` | Assembles the final single-file HTML (data + model + logic + assets) |
| `export_csv.js` | Exports the dataset to CSV |
| `data_export/` | The generated dataset as CSV (open in Excel) |
| `test_compute.js` / `render_smoke.js` | Validation (aggregation correctness, full render, NLP accuracy) |
| `screenshot.js` / `gifs.js` | Auto-capture the README screenshots and GIF demos |
| `docs/` | Screenshots and GIFs used in this README |
| `README_PUBLISH.md` | Deployment guide (Arabic) |

---

## 🔧 Build & regenerate

```bash
node gen.js          # print a sanity check of the generated numbers
node nlp/train.js    # train the intent model -> nlp/nlp_model.json + metrics.json
node build.js        # rebuild PepsiCo_Pulse_BI.html (data + model + logic)
node export_csv.js   # refresh the CSVs in data_export/

# tests
node test_compute.js   # aggregation numbers under each filter
node render_smoke.js   # render every page + NLP intent accuracy (expect 0 errors)
node screenshot.js     # regenerate docs/screenshots/*.png
node gifs.js           # regenerate docs/gifs/*.gif
```

Want **more data**? Add rows to `PRODUCTS` / `REGIONS` / `CHANNELS` (or change `YEARS`) in `gen.js` and re-run `node build.js`.

---

## 🛠 Tech stack

- **Vanilla JavaScript** (no framework) for the engine, filter store and assistant.
- A **from-scratch softmax intent classifier** trained in pure Node (no ML libraries), running in-browser.
- **[Chart.js](https://www.chartjs.org/) 4** + datalabels plugin for visualisation.
- **Node.js** for the offline data-generation, model-training and build pipeline.
- Pure CSS (custom properties, dark/light themes, RTL).

---

<p align="center"><sub>Sample · not affiliated with PepsiCo .</sub></p>
