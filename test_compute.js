// Headless test of compute() with mocked browser globals
const fs=require('fs');
const {portalData}=require('./gen');
const pd=portalData();

// minimal browser mocks (compute() & top-level code shouldn't need real DOM)
global.window={};
global.document={getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],
  addEventListener:()=>{},documentElement:{setAttribute:()=>{},getAttribute:()=>'dark'},createElement:()=>({})};
global.localStorage={getItem:()=>null,setItem:()=>{}};
global.getComputedStyle=()=>({getPropertyValue:()=>''});
global.Chart={register:()=>{},defaults:{plugins:{},font:{}}};
global.requestAnimationFrame=()=>{};

// inject data globals then the logic source
const DIM=pd.DIM, FACTS=pd.FACTS, INV=pd.INV, WORK=pd.WORK, GAP=pd.GAP;
const PIMG={}, LOGO_FULL='', LOGO_MARK='';
let src=fs.readFileSync('./portal_logic.js','utf8');
// expose compute + live vars by appending a getter
src+='\nglobalThis.__compute=compute;globalThis.__state=()=>({products,totals,revTrend,npTrend,grossMargin,netMargin,regions,nodes,stockouts,depts,pipeline,ecom,turnTrend,otdTrend,otifTrend,DBhr});\nglobalThis.__FILTER=FILTER;';
const run=new Function('DIM','FACTS','INV','WORK','GAP','PIMG','LOGO_FULL','LOGO_MARK',src);
run(DIM,FACTS,INV,WORK,GAP,PIMG,LOGO_FULL,LOGO_MARK);

function show(tag){
  globalThis.__compute();
  const s=globalThis.__state();
  console.log('\n=== '+tag+' ===');
  console.log('SKUs in view:',s.products.length,
    '| Rev $'+(s.totals.rev/1000).toFixed(2)+'B  Net $'+(s.totals.np/1000).toFixed(2)+'B  Units '+(s.totals.units/1e9).toFixed(2)+'B',
    '| YoY rev '+s.totals.yoyRev+'%');
  console.log('revTrend[0],[11]:',s.revTrend[0],s.revTrend[11],' netMargin[11]:',s.netMargin[11]);
  console.log('regions(fill):',s.regions.map(r=>r.n+':'+r.v).join(', '));
  console.log('top product by rev:',[...s.products].sort((a,b)=>b.rev-a.rev)[0].n,
    ' share '+[...s.products].sort((a,b)=>b.rev-a.rev)[0].share+'%');
  console.log('ecom GMV $'+(s.ecom.gmv/1e9).toFixed(2)+'B aov '+s.ecom.aov+' abandon '+s.ecom.abandon+'%');
  console.log('depts total:',s.depts.reduce((a,b)=>a+b.v,0),' turnover[11]:',s.turnTrend[11],
    ' otd[11]:',s.otdTrend[11],' otif[11]:',s.otifTrend[11]);
  console.log('hrKpis:',JSON.stringify(s.DBhr.hrKpis),' stockouts:',s.stockouts.length);
}

const F=globalThis.__FILTER;
show('NO FILTER (all)');
F.years.add(2); show('Year=2026');                 // year index 2
F.years.clear(); F.regions.add(6); show('Region=Levant & Egypt');
F.regions.clear(); F.channels.add(2); show('Channel=E-commerce');
F.channels.clear(); F.cats.add('Beverages'); show('Category=Beverages');
F.cats.clear(); F.brands.add('Pepsi'); show('Brand=Pepsi');
F.brands.clear(); F.prods.add(0); show('Product=Pepsi (idx0)');
F.years.add(2); F.regions.add(6); F.channels.add(2); show('Combo: 2026 + Levant + E-com');
