// ============================================================================
// PepsiCo Pulse BI — synthetic-but-realistic data generator
// Deterministic (seeded) so the build is reproducible. No external libs.
// Grain of the sales fact: (yearIdx, month0-11, productIdx, regionIdx, channelIdx)
//   -> units. Revenue/COGS are derived from dims at aggregation time.
// ============================================================================

// ---- deterministic RNG (mulberry32) ----
function rng(seed){ return function(){ seed|=0; seed=seed+0x6D2B79F5|0;
  let t=Math.imul(seed^seed>>>15,1|seed); t=t+Math.imul(t^t>>>7,61|t)^t;
  return ((t^t>>>14)>>>0)/4294967296; }; }
const R = rng(20260616);
const jit = (lo,hi)=> lo + R()*(hi-lo);          // uniform jitter

// ---- dimensions ----
const YEARS = [2024, 2025, 2026];

// Products: [name, brand, category, unitPrice($), unitCost($), baseVolume(monthly, units), color]
const PRODUCTS = [
  ["Pepsi",          "Pepsi",     "Beverages", 0.95, 0.46, 11.6e6, "#004B93"],
  ["Pepsi Max",      "Pepsi",     "Beverages", 0.98, 0.46, 8.9e6,  "#111418"],
  ["Diet Pepsi",     "Pepsi",     "Beverages", 0.97, 0.46, 3.0e6,  "#5B8FD6"],
  ["Mountain Dew",   "Mtn Dew",   "Beverages", 1.05, 0.49, 4.6e6,  "#6FAE1E"],
  ["7UP",            "7UP",       "Beverages", 0.92, 0.44, 5.9e6,  "#2EA84F"],
  ["Mirinda Orange", "Mirinda",   "Beverages", 0.90, 0.45, 5.1e6,  "#F58220"],
  ["Gatorade",       "Gatorade",  "Beverages", 1.60, 0.79, 2.2e6,  "#F47B20"],
  ["Aquafina",       "Aquafina",  "Beverages", 0.55, 0.28, 10.8e6, "#1CA7E0"],
  ["Lipton Ice Tea", "Lipton",    "Beverages", 1.10, 0.55, 3.4e6,  "#FFC72C"],
  ["Tropicana",      "Tropicana", "Beverages", 1.85, 0.96, 1.9e6,  "#F6A800"],
  ["Rockstar Energy","Rockstar",  "Beverages", 1.75, 0.80, 1.8e6,  "#E03C31"],
  ["Sting Energy",   "Sting",     "Beverages", 0.85, 0.40, 2.0e6,  "#F2A900"],
  ["Lay's Classic",  "Lay's",     "Snacks",    1.20, 0.52, 6.8e6,  "#FFD300"],
  ["Doritos",        "Doritos",   "Snacks",    1.45, 0.62, 4.4e6,  "#C8102E"],
  ["Cheetos",        "Cheetos",   "Snacks",    1.15, 0.49, 3.6e6,  "#FF7A00"],
  ["Ruffles",        "Ruffles",   "Snacks",    1.35, 0.58, 2.3e6,  "#0072CE"],
  ["SunChips",       "SunChips",  "Snacks",    1.25, 0.56, 1.6e6,  "#8DB600"],
  ["Walkers",        "Walkers",   "Snacks",    1.10, 0.48, 3.1e6,  "#E4002B"],
  ["Quaker Oats",    "Quaker",    "Foods",     2.40, 1.25, 1.4e6,  "#D4001A"],
  ["Quaker Granola", "Quaker",    "Foods",     3.10, 1.62, 0.7e6,  "#9C6114"],
];

// Regions: [name, demandWeight, growthBias, serviceBias(fill-rate baseline)]
const REGIONS = [
  ["UK & Ireland",      1.00, 0.04, 96],
  ["Iberia",            0.78, 0.05, 95],
  ["France & Benelux",  0.92, 0.04, 95],
  ["Germany & DACH",    1.05, 0.05, 97],
  ["Poland & CEE",      0.84, 0.09, 94],
  ["Türkiye",           0.70, 0.11, 92],
  ["Levant & Egypt",    0.66, 0.13, 89],
  ["Gulf & Middle East",0.74, 0.10, 93],
];

// Channels: [name, demandWeight, priceFactor, growthBias]
const CHANNELS = [
  ["Modern Trade",      0.42, 1.00, 0.05],
  ["Traditional Trade", 0.30, 0.97, 0.03],
  ["E-commerce",        0.16, 1.06, 0.24],
  ["Foodservice",       0.12, 1.12, 0.07],
];

// seasonality multipliers by category (index = month 0..11)
const SEASON = {
  Beverages: [0.82,0.84,0.92,1.00,1.10,1.22,1.30,1.28,1.08,0.95,0.86,0.93],
  Snacks:    [0.95,0.92,0.96,1.00,1.02,1.04,1.05,1.03,1.04,1.08,1.18,1.28],
  Foods:     [1.10,1.08,1.02,0.98,0.94,0.90,0.88,0.90,0.98,1.06,1.12,1.14],
};

// ---- generate sales facts ----
// columnar parallel arrays kept tiny: only units stored per row
const fY=[], fM=[], fP=[], fR=[], fC=[], fU=[];
for (let y=0; y<YEARS.length; y++){
  for (let p=0; p<PRODUCTS.length; p++){
    const [ , , cat, , , base ] = PRODUCTS[p];
    const season = SEASON[cat];
    const prodTrend = 1 + jit(-0.03, 0.06);             // each SKU its own drift
    for (let r=0; r<REGIONS.length; r++){
      const [ , rW, rG ] = REGIONS[r];
      for (let c=0; c<CHANNELS.length; c++){
        const [ , cW, , cG ] = CHANNELS[c];
        // compound YoY growth: region + channel + product drift, with noise
        const yearGrow = Math.pow(1 + rG + cG*0.4 + (prodTrend-1), y);
        for (let m=0; m<12; m++){
          let u = base * rW * cW * season[m] * yearGrow;
          u *= 1 + jit(-0.14, 0.14);                    // monthly noise
          // occasional promo spike
          if (R() < 0.06) u *= jit(1.15, 1.5);
          u = Math.round(u);
          if (u <= 0) continue;
          fY.push(y); fM.push(m); fP.push(p); fR.push(r); fC.push(c); fU.push(u);
        }
      }
    }
  }
}

// ---- inventory snapshot (latest year, per product x location) ----
// one plant (MAKE) + one DC (MOVE) per region
const LOCATIONS = [];
REGIONS.forEach((rg,ri)=>{
  const city = ["Manchester","Valencia","Lille","Frankfurt","Warsaw","Istanbul","Cairo","Dubai"][ri];
  LOCATIONS.push([city+" Plant","MAKE",rg[0],ri]);
  LOCATIONS.push([city+" DC","MOVE",rg[0],ri]);
});
const INV=[];
PRODUCTS.forEach((pr,pi)=>{
  LOCATIONS.forEach(loc=>{
    if (R() < 0.45) return; // not every SKU at every node
    const avgDailyOut = Math.round(jit(40,260));
    const reorder = Math.round(avgDailyOut*jit(5,9));
    const onHand = Math.round(avgDailyOut*jit(6,42));
    const inTransit = Math.round(avgDailyOut*jit(2,16));
    const daysCover = +(onHand/avgDailyOut).toFixed(1);
    const oos = +Math.max(0, jit(-0.6,4.2)).toFixed(1);
    const status = daysCover<8?"Critical":daysCover<15?"Low":daysCover>34?"Excess":"Healthy";
    INV.push({p:pi, loc:loc[0], node:loc[1], region:loc[2], onHand, reorder, inTransit, avgDailyOut, daysCover, oos, status});
  });
});

// ---- workforce monthly (multi-year) per department ----
const DEPTS = [
  ["Manufacturing (MAKE)", 1240, 0.018],
  ["Logistics (MOVE)",      860, 0.030],
  ["Sales & Distribution", 1180, 0.022],
  ["Commercial & Marketing",420, 0.014],
  ["Finance & IT",          340, 0.011],
  ["HR & Admin",            180, 0.012],
  ["R&D / Quality",         150, 0.010],
  ["Procurement",           130, 0.013],
];
const WORK=[];
DEPTS.forEach((d,di)=>{
  let hc = d[1];
  for (let y=0; y<YEARS.length; y++){
    for (let m=0; m<12; m++){
      const plan = Math.round(d[1]*(1+0.03*y+0.004*m));
      const resignV = Math.round(hc*d[2]*jit(0.7,1.3));
      const resignI = Math.round(resignV*jit(0.2,0.5));
      const hires = Math.round((resignV+resignI)+jit(-2,8)+ (plan-hc)*0.15);
      hc = Math.max(60, hc + hires - resignV - resignI);
      WORK.push({y, m, dept:d[0], headcount:hc, plan, hires, resignV, resignI});
    }
  }
});

// ---- HR detail: positions x areas gap (latest year snapshot) ----
const POSITIONS = [
  ["Line Operator","MAKE"],["Maintenance Tech","MAKE"],["Quality Inspector","MAKE"],
  ["Forklift Operator","MOVE"],["Truck Driver","MOVE"],["Warehouse Picker","MOVE"],["Dispatcher","MOVE"],
  ["Sales Rep","Commercial"],["Key Account Mgr","Commercial"],["Merchandiser","Commercial"],
  ["Brand Manager","Commercial"],["Financial Analyst","Support"],["IT Specialist","Support"],
];
const AREAS = REGIONS.map(r=>r[0]);
const GAP=[];
POSITIONS.forEach(pos=>{
  AREAS.forEach(area=>{
    if (R()<0.18) return;
    const plan = Math.round(jit(6,60));
    const gap = Math.round(jit(-0.16,0.05)*plan);   // mostly understaffed
    const actual = plan + gap;
    GAP.push({pos:pos[0], cat:pos[1], area, plan, actual, gap,
      pipeline:Math.round(Math.abs(gap)*jit(0.4,1.6)), notice:Math.round(jit(0,4))});
  });
});

// shape for the portal (DIM/FACTS/INV/WORK/GAP)
function portalData(){
  return {
    DIM:{
      products: PRODUCTS.map(p=>({n:p[0],brand:p[1],c:p[2],price:p[3],cost:p[4],color:p[6]})),
      regions:  REGIONS.map(r=>({n:r[0],w:r[1],g:r[2],svc:r[3]})),
      channels: CHANNELS.map(c=>({n:c[0],w:c[1],pf:c[2],g:c[3]})),
      years: YEARS,
      positions: POSITIONS,
      meta:{file:"PepsiCo_EMEA_Sales_Database.xlsx", rows: fU.length}
    },
    FACTS:{fY,fM,fP,fR,fC,fU}, INV, WORK, GAP
  };
}

module.exports = { YEARS, PRODUCTS, REGIONS, CHANNELS, SEASON,
  facts:{fY,fM,fP,fR,fC,fU}, INV, LOCATIONS, DEPTS, WORK, POSITIONS, AREAS, GAP, portalData };

// ---- validation when run directly ----
if (require.main === module){
  const n=fU.length;
  let totU=0, totRev=0, totCogs=0;
  const byYear={}, byCat={}, byReg={}, byCh={};
  for (let i=0;i<n;i++){
    const p=PRODUCTS[fP[i]], price=p[3]*CHANNELS[fC[i]][2], cost=p[4]*(1+0.03*fY[i]);
    const u=fU[i], rev=u*price, cg=u*cost;
    totU+=u; totRev+=rev; totCogs+=cg;
    byYear[YEARS[fY[i]]]=(byYear[YEARS[fY[i]]]||0)+rev;
    byCat[p[2]]=(byCat[p[2]]||0)+rev;
    byReg[REGIONS[fR[i]][0]]=(byReg[REGIONS[fR[i]][0]]||0)+rev;
    byCh[CHANNELS[fC[i]][0]]=(byCh[CHANNELS[fC[i]][0]]||0)+rev;
  }
  const B=x=>(x/1e9).toFixed(2)+"B";
  console.log("Sales fact rows:", n.toLocaleString());
  console.log("Total units:", (totU/1e9).toFixed(2)+"B  Revenue:",B(totRev),
              " COGS:",B(totCogs)," GrossMargin:",((1-totCogs/totRev)*100).toFixed(1)+"%");
  console.log("\nRevenue by year:");
  Object.entries(byYear).forEach(([k,v])=>console.log("  "+k+":",B(v)));
  console.log("YoY 24->25:",((byYear[2025]/byYear[2024]-1)*100).toFixed(1)+"%",
              " 25->26:",((byYear[2026]/byYear[2025]-1)*100).toFixed(1)+"%");
  console.log("\nRevenue by category:");
  Object.entries(byCat).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log("  "+k+":",B(v),"("+(v/totRev*100).toFixed(0)+"%)"));
  console.log("\nRevenue by channel:");
  Object.entries(byCh).forEach(([k,v])=>console.log("  "+k+":",B(v),"("+(v/totRev*100).toFixed(0)+"%)"));
  console.log("\nRevenue by region:");
  Object.entries(byReg).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log("  "+k+":",B(v)));
  console.log("\nInventory rows:",INV.length," Workforce rows:",WORK.length," Gap cells:",GAP.length);
  // est embedded size
  const factJSON=JSON.stringify({fY,fM,fP,fR,fC,fU});
  console.log("\nFACTS JSON size:", (factJSON.length/1024).toFixed(0)+" KB");
}
