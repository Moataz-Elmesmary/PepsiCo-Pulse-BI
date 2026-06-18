// Render smoke test: mock a DOM + Chart, run enterPortal + every panel + filters.
// Catches runtime errors in render functions that node --check cannot.
const fs=require('fs');
const {portalData}=require('./gen');
const pd=portalData();

let chartCount=0, errors=[];
function fakeEl(id){
  const el={ id, _html:'', dataset:{}, style:{}, _children:[], value:'', textContent:'',
    firstChild:{textContent:''},
    classList:{add(){},remove(){},toggle(){},contains(){return false}},
    set innerHTML(v){this._html=v;}, get innerHTML(){return this._html;},
    appendChild(c){this._children.push(c);return c;},
    get lastChild(){return this._children[this._children.length-1]||fakeEl('last');},
    querySelector(){return fakeEl('q');}, querySelectorAll(){return [];},
    closest(){return fakeEl('card');},
    addEventListener(){}, removeEventListener(){},
    getContext(){return {createLinearGradient(){return {addColorStop(){}};}};},
    setAttribute(){}, getAttribute(){return 'dark';},
    getBoundingClientRect(){return {width:300,height:200};} };
  return el;
}
const elCache={};
global.window={ChartDataLabels:{},innerWidth:1200,innerHeight:800};
global.innerWidth=1200; global.innerHeight=800;
global.document={
  documentElement:{setAttribute(){},getAttribute(){return 'dark';}},
  getElementById(id){return elCache[id]||(elCache[id]=fakeEl(id));},
  querySelector(){const e=fakeEl('qs');e.scrollIntoView=()=>{};return e;},
  querySelectorAll(){return [];},
  createElement(){return fakeEl('new');},
  addEventListener(){}
};
global.localStorage={getItem(){return null;},setItem(){}};
global.getComputedStyle=()=>({getPropertyValue:()=>'#10224b'});
global.requestAnimationFrame=cb=>{try{cb(16);}catch(e){errors.push('raf:'+e.message);}};
global.cancelAnimationFrame=()=>{};
global.setTimeout=(cb)=>{try{cb();}catch(e){errors.push('timeout:'+e.message);}return 0;};
global.Chart=function(el,cfg){chartCount++;this.destroy=()=>{};};
global.Chart.register=()=>{}; global.Chart.defaults={plugins:{},font:{}};
global.Intl=Intl;

const DIM=pd.DIM,FACTS=pd.FACTS,INV=pd.INV,WORK=pd.WORK,GAP=pd.GAP;
const PIMG={pepsi:'x'},LOGO_FULL='',LOGO_MARK='';
let src=fs.readFileSync('./portal_logic.js','utf8');
src+='\nglobalThis.__api={enterPortal,go,renderPanel,applyFilters,resetFilters,toggleLang,toggleTheme,FILTER,buildFilterBar,toggleDrop,askAssistant,nlpAnswer,nlpApply};';
const run=new Function('DIM','FACTS','INV','WORK','GAP','PIMG','LOGO_FULL','LOGO_MARK',src);
try{ run(DIM,FACTS,INV,WORK,GAP,PIMG,LOGO_FULL,LOGO_MARK); }
catch(e){ console.error('LOAD ERROR:',e.message); process.exit(1); }
const A=globalThis.__api;

function step(name,fn){ try{ fn(); console.log('  ok  '+name); }
  catch(e){ console.error('  ERR '+name+': '+e.message+'\n      '+(e.stack||'').split('\n')[1]); errors.push(name); } }

console.log('Render smoke test:');
step('enterPortal', ()=>A.enterPortal());
['overview','supply','revenue','products','workforce','assistant','lookup'].forEach(p=>
  step('go('+p+')', ()=>A.go(p)));
step('buildFilterBar', ()=>A.buildFilterBar());
step('toggleDrop(regions)', ()=>A.toggleDrop('regions'));
step('filter year=2026', ()=>{A.FILTER.years.add(2);A.applyFilters();});
step('filter region+channel', ()=>{A.FILTER.regions.add(6);A.FILTER.channels.add(2);A.applyFilters();});
step('re-render all panels under filter', ()=>['overview','supply','revenue','products','workforce'].forEach(p=>A.go(p)));
step('reset filters', ()=>A.resetFilters());
step('toggleTheme', ()=>A.toggleTheme());

// ---- NLP assistant: print real answers (strip tags) ----
const strip=s=>String(s).replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim();
const queries=[
  'top 5 products by revenue',
  'compare Pepsi vs 7UP',
  'net profit of Snacks in 2026',
  'which region has the lowest fill rate?',
  'revenue trend this year',
  'what is the cart abandon rate?',
  'صافي ربح بيبسي في مصر',
  'قارن مصر مقابل تركيا',
  'أعلى 3 قنوات بالإيراد',
  'اعرض الأونلاين في مصر',
];
console.log('\nNLP answers:');
queries.forEach(q=>{ try{ console.log('  Q: '+q+'\n   → '+strip(A.nlpAnswer(q)).slice(0,180)); }
  catch(e){ console.error('   NLP ERR ['+q+']: '+e.message); errors.push('nlp:'+q); } });

step('assistant flow (askAssistant)', ()=>A.askAssistant('top 3 regions by net profit'));
step('toggleLang->ar', ()=>A.toggleLang());
step('render under AR', ()=>['overview','workforce'].forEach(p=>A.go(p)));
step('AR NLP', ()=>{const r=A.nlpAnswer('أعلى 5 منتجات بالإيراد');if(!r)throw new Error('empty');});

console.log('\nCharts created:',chartCount,' | Errors:',errors.length);
process.exit(errors.length?1:0);
