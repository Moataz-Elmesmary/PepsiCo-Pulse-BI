/* ============================================================================
   PepsiCo Pulse BI — application logic (live aggregation + filters + render)
   Depends on injected globals: DIM, FACTS, INV, WORK, GAP, LOGO_*, PIMG
   ========================================================================== */

const M_EN=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const M_AR=["ينا","فبر","مار","أبر","ماي","يون","يول","أغس","سبت","أكت","نوف","ديس"];
let M=M_EN;
const PRODUCTS=DIM.products, REGIONS=DIM.regions, CHANNELS=DIM.channels, YEARS=DIM.years;
const CATS=[...new Set(PRODUCTS.map(p=>p.c))];
const BRANDS=[...new Set(PRODUCTS.map(p=>p.brand))];
const ECOM_CH=CHANNELS.findIndex(c=>/commerce/i.test(c.n));
const NETCONV=0.43;

/* live vars reassigned every compute() */
let products,totals,revTrend,npTrend,cogsTrend,grossMargin,netMargin,
    otdTrend,otifTrend,turnTrend,regions,nodes,stockouts,depts,pipeline,ecom,DBhr;

/* ---------------- filter state (empty set = ALL) ---------------- */
const FILTER={years:new Set(),regions:new Set(),channels:new Set(),
              cats:new Set(),brands:new Set(),prods:new Set()};
function anyFilter(){return FILTER.years.size||FILTER.regions.size||FILTER.channels.size||
  FILTER.cats.size||FILTER.brands.size||FILTER.prods.size;}

function priceOf(p,c){return PRODUCTS[p].price*CHANNELS[c].pf;}
function costOf(p,y){return PRODUCTS[p].cost*(1+0.03*y);}
function hsh(s){let h=0;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;return h;}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}

/* ---------------- core aggregation ---------------- */
function compute(){
  const F=FACTS,n=F.fU.length;
  let tU=0,tRev=0,tCogs=0,ecomRev=0,ecomU=0;
  const pAgg=PRODUCTS.map(()=>({u:0,rev:0,cogs:0}));
  const pYr=PRODUCTS.map(()=>YEARS.map(()=>0));     // product x year rev (ignores year filter)
  const yrRev=YEARS.map(()=>0);                     // rev by year (ignores year filter)
  const mRev=Array(12).fill(0),mCogs=Array(12).fill(0),mU=Array(12).fill(0);
  const regRev=REGIONS.map(()=>0),chRev=CHANNELS.map(()=>0),catRev={};

  for(let i=0;i<n;i++){
    const p=F.fP[i],c=F.fC[i],y=F.fY[i],m=F.fM[i],u=F.fU[i],P=PRODUCTS[p];
    const passNoYear=(!FILTER.regions.size||FILTER.regions.has(F.fR[i]))
      &&(!FILTER.channels.size||FILTER.channels.has(c))
      &&(!FILTER.prods.size||FILTER.prods.has(p))
      &&(!FILTER.cats.size||FILTER.cats.has(P.c))
      &&(!FILTER.brands.size||FILTER.brands.has(P.brand));
    if(passNoYear){const rv=u*priceOf(p,c);yrRev[y]+=rv;pYr[p][y]+=rv;}
    if(FILTER.years.size&&!FILTER.years.has(y))continue;
    if(!passNoYear)continue;
    const rev=u*priceOf(p,c),cogs=u*costOf(p,y);
    tU+=u;tRev+=rev;tCogs+=cogs;
    const a=pAgg[p];a.u+=u;a.rev+=rev;a.cogs+=cogs;
    mRev[m]+=rev;mCogs[m]+=cogs;mU[m]+=u;
    regRev[F.fR[i]]+=rev;chRev[c]+=rev;catRev[P.c]=(catRev[P.c]||0)+rev;
    if(c===ECOM_CH){ecomRev+=rev;ecomU+=u;}
  }

  /* comparison years for YoY */
  const selY=FILTER.years.size?[...FILTER.years]:YEARS.map((_,i)=>i);
  const curY=Math.max(...selY), prevY=curY-1>=0?curY-1:null;
  const yoy=(cur,prev)=> (prev!=null&&prev>=0&&yrRev[prev])? null:0; // placeholder replaced below
  function yoyOf(arr){return (prevY!=null&&arr[prevY])?((arr[curY]/arr[prevY]-1)*100):0;}

  /* inventory aggregation respecting region/cat/brand/product filters */
  function invPass(r){
    if(FILTER.regions.size){const ri=REGIONS.findIndex(x=>x.n===r.region);if(!FILTER.regions.has(ri))return false;}
    const P=PRODUCTS[r.p];
    if(FILTER.prods.size&&!FILTER.prods.has(r.p))return false;
    if(FILTER.cats.size&&!FILTER.cats.has(P.c))return false;
    if(FILTER.brands.size&&!FILTER.brands.has(P.brand))return false;
    return true;
  }
  const invRows=INV.filter(invPass);
  const stockByP=PRODUCTS.map(()=>0),oosByP=PRODUCTS.map(()=>[]);
  invRows.forEach(r=>{stockByP[r.p]+=r.onHand;oosByP[r.p].push(r.oos);});

  /* products[] in $M */
  products=PRODUCTS.map((P,p)=>{
    const a=pAgg[p],revM=a.rev/1e6,cogsM=a.cogs/1e6,np=(a.rev-a.cogs)*NETCONV/1e6;
    const oosArr=oosByP[p],oos=oosArr.length?+(oosArr.reduce((s,x)=>s+x,0)/oosArr.length).toFixed(1):0;
    return {n:P.n,c:P.c,brand:P.brand,units:a.u,rev:+revM.toFixed(1),cogs:+cogsM.toFixed(1),
      np:+np.toFixed(1),stock:stockByP[p],oos,
      yoy:+yoyOf(pYr[p]).toFixed(1),
      otd:clamp(Math.round(92+ (hsh(P.n)%70)/10),88,99),
      band:'linear-gradient('+P.color+','+P.color+')',
      share:tRev?+(a.rev/tRev*100).toFixed(1):0};
  }).filter(p=>p.units>0);

  totals={rev:tRev/1e6,cogs:tCogs/1e6,np:(tRev-tCogs)*NETCONV/1e6,units:tU,
    yoyRev:+yoyOf(yrRev).toFixed(1),
    yoyNp:+yoyOf(yrRev).toFixed(1),
    yoyUnits:+(yoyOf(yrRev)*0.55).toFixed(1)};

  revTrend=mRev.map(v=>+(v/1e6).toFixed(1));
  cogsTrend=mCogs.map(v=>+(v/1e6).toFixed(1));
  npTrend=mRev.map((v,i)=>+((v-mCogs[i])*NETCONV/1e6).toFixed(1));
  grossMargin=mRev.map((v,i)=>v?+((1-mCogs[i]/v)*100).toFixed(1):0);
  netMargin=mRev.map((v,i)=>v?+(((v-mCogs[i])*NETCONV/v)*100).toFixed(1):0);

  /* regions fill rate (100 - avg oos), nodes by location onHand */
  const selRegIdx=FILTER.regions.size?[...FILTER.regions]:REGIONS.map((_,i)=>i);
  regions=selRegIdx.map(ri=>{
    const rs=invRows.filter(r=>r.region===REGIONS[ri].n);
    const avgOos=rs.length?rs.reduce((s,r)=>s+r.oos,0)/rs.length:0;
    return {n:REGIONS[ri].n,v:+clamp(REGIONS[ri].svc-avgOos*1.5,80,99).toFixed(1)};
  });
  const nodeMap={};
  invRows.forEach(r=>{const k=r.loc+' ('+r.node+')';nodeMap[k]=(nodeMap[k]||0)+r.onHand;});
  nodes=Object.entries(nodeMap).map(([n,v])=>({n,v})).sort((a,b)=>b.v-a.v).slice(0,8);

  stockouts=invRows.filter(r=>r.status==='Critical'||r.status==='Low'||r.daysCover<20)
    .sort((a,b)=>a.daysCover-b.daysCover).slice(0,12)
    .map(r=>({p:PRODUCTS[r.p].n+' · '+r.loc,h:r.onHand,d:r.daysCover,
      s:r.daysCover<8?'crit':r.daysCover<15?'warn':'watch'}));
  if(!stockouts.length)stockouts=[{p:'—',h:0,d:0,s:'watch'}];

  /* e-commerce funnel from ecom revenue */
  const aov=+ (14+ (tRev?ecomRev/Math.max(ecomU,1):0)*1.2).toFixed(1);
  const aovUse=clamp(aov,12,32);
  const purchase=Math.max(1,Math.round(ecomRev/aovUse));
  const conv=3.1,visits=Math.round(purchase/(conv/100)),views=Math.round(visits*0.82),
    cart=Math.round(visits*0.14),checkout=Math.round(cart*0.52);
  ecom={visits,views,cart,checkout,purchase,aov:+aovUse.toFixed(1),gmv:ecomRev,
    abandon:+((1-purchase/Math.max(cart,1))*100).toFixed(1),conv,returns:2.4};

  /* ---- workforce (year + region/area filters; ignores product/channel) ---- */
  const selYears=FILTER.years.size?[...FILTER.years]:YEARS.map((_,i)=>i);
  const curWY=Math.max(...selYears);
  const wkLatest=WORK.filter(w=>w.y===curWY);
  const deptMap={};wkLatest.filter(w=>w.m===11).forEach(w=>{deptMap[w.dept]=(deptMap[w.dept]||0)+w.headcount;});
  depts=Object.entries(deptMap).map(([n,v])=>({n,v}));
  if(!depts.length)depts=[{n:'—',v:0}];

  /* turnover trend = monthly resign/headcount averaged across selected years */
  turnTrend=Array(12).fill(0).map((_,m)=>{
    const rows=WORK.filter(w=>selYears.includes(w.y)&&w.m===m);
    if(!rows.length)return 0;
    const res=rows.reduce((s,w)=>s+w.resignV+w.resignI,0),hc=rows.reduce((s,w)=>s+w.headcount,0);
    return hc?+((res/hc)*100).toFixed(2):0;
  });

  /* otd / otif trends from selected regions service bias */
  const svc=regions.length?regions.reduce((s,r)=>s+r.v,0)/regions.length:94;
  const wave=[-1.4,-1.1,-.6,-.2,.1,.4,.6,.5,.7,.9,1.1,1.3];
  otdTrend=wave.map((w,i)=>+clamp(svc+ w + i*0.12,85,99.5).toFixed(1));
  otifTrend=otdTrend.map(v=>+clamp(v-1.4,84,99).toFixed(1));

  /* hiring pipeline from total hires in latest year */
  const hiresTot=wkLatest.reduce((s,w)=>s+w.hires,0);
  pipeline=[['Applied',1],['Screened',.46],['Interviewed',.24],['Offer',.12],['Hired',.085]]
    .map(([n,r])=>({n,v:Math.round(hiresTot/0.085*r)}));

  /* ---- HR detail ---- */
  const selAreas=FILTER.regions.size?[...FILTER.regions].map(i=>REGIONS[i].n):REGIONS.map(r=>r.n);
  const gapRows=GAP.filter(g=>selAreas.includes(g.area));
  const gapByPosMap={};
  gapRows.forEach(g=>{const o=gapByPosMap[g.pos]||(gapByPosMap[g.pos]={n:g.pos,cat:g.cat,plan:0,actual:0,gap:0});
    o.plan+=g.plan;o.actual+=g.actual;o.gap+=g.gap;});
  const gapByPos=Object.values(gapByPosMap);
  const turnoverByPos=DIM.positions.map(p=>({n:p[0],rate:+ (1.2+(hsh(p[0])%55)/10).toFixed(1)}))
    .sort((a,b)=>b.rate-a.rate);
  const timeToFill=DIM.positions.map(p=>({n:p[0],days:18+hsh(p[0]+'t')%42})).sort((a,b)=>b.days-a.days);
  const resignReasons=[['Compensation',31],['Career growth',22],['Work-life balance',16],
    ['Management',11],['Relocation',8],['Retirement',6],['Other',6]].map(x=>({n:x[0],v:x[1]}));
  const recruiters=['Sara','Omar','Lina','Karim','Maya','Hassan']
    .map(n=>{const t=20+hsh(n)%18;return {n,target:t,achieved:clamp(t+ (hsh(n+'a')%14)-6,6,40)};});
  const months=selYears.length?M:M;
  const joiners=Array(12).fill(0),leavers=Array(12).fill(0);
  WORK.filter(w=>w.y===curWY).forEach(w=>{joiners[w.m]+=w.hires;leavers[w.m]+=w.resignV+w.resignI;});
  const noticePipelineByArea=selAreas.map(area=>{
    const rs=gapRows.filter(g=>g.area===area);
    return {area,pipeline:rs.reduce((s,g)=>s+g.pipeline,0),notice:rs.reduce((s,g)=>s+g.notice,0)};
  });
  const totalGap=gapByPos.reduce((s,p)=>s+p.gap,0);
  const totPlan=gapByPos.reduce((s,p)=>s+p.plan,0),totAct=gapByPos.reduce((s,p)=>s+p.actual,0);
  const nj=joiners.reduce((a,b)=>a+b,0),nl=leavers.reduce((a,b)=>a+b,0);
  DBhr={gapMatrix:gapRows,positions:DIM.positions.map(p=>({n:p[0],cat:p[1]})),areas:selAreas,
    gapByPos,turnoverByPos,timeToFill,resignReasons,recruiters,
    movement:{months,joiners,leavers},noticePipelineByArea,
    hrKpis:{netMovement:nj-nl,avgTimeToFill:Math.round(timeToFill.reduce((s,t)=>s+t.days,0)/timeToFill.length),
      totalGap:Math.abs(totalGap),pctFilled:totPlan?+(totAct/totPlan*100).toFixed(1):100,
      openReqs:Math.abs(Math.min(0,totalGap))}};
}

/* ============================================================================
   THEME / LANG
   ========================================================================== */
function safe(fn){try{fn()}catch(e){}}
function toggleTheme(){
  const h=document.documentElement,t=h.getAttribute('data-theme')==='dark'?'light':'dark';
  h.setAttribute('data-theme',t);safe(()=>localStorage.setItem('pulse-theme',t));
  document.getElementById('themeBtn').textContent=t==='dark'?'🌙':'☀️';
  const lt=document.getElementById('loginTheme');if(lt)lt.firstChild.textContent=t==='dark'?'🌙 ':'☀️ ';
  if(appReady)renderPanel(current,true);
}
let LANG='en';
function toggleLang(){setLang(LANG==='en'?'ar':'en');}
function setLang(l){
  LANG=l;M=l==='en'?M_EN:M_AR;const h=document.documentElement;
  h.setAttribute('lang',l);h.setAttribute('dir',l==='ar'?'rtl':'ltr');
  safe(()=>localStorage.setItem('pulse-lang',l));
  document.getElementById('langLabel').textContent=l==='en'?'عربي':'EN';
  const gs=document.getElementById('globalSearch');if(gs)gs.placeholder=l==='en'?'Search metric or product…':'ابحث عن مؤشر أو منتج…';
  const ai=document.getElementById('assistInput');if(ai)ai.placeholder=l==='en'?'Type your question…':'اكتب سؤالك…';
  const li=document.getElementById('lookupInput');if(li)li.placeholder=l==='en'?'e.g. Pepsi, revenue, stock…':'مثال: بيبسي، الإيراد، المخزون…';
  setTitle(current);
  if(appReady){buildFilterBar();buildChips();renderPanel(current,true);}
}

/* ============================================================================
   ENTRY / NAV
   ========================================================================== */
let appReady=false,current='overview';const built={};
function doLogin(){
  const u=(document.getElementById('u').value||'').trim().toLowerCase();
  const p=document.getElementById('p').value||'',err=document.getElementById('loginErr');
  if(u==='moataz'&&p==='moataz'){
    err.textContent='';const ld=document.getElementById('loader');ld.classList.add('show');
    document.getElementById('loaderTxt').textContent=(LANG==='en'?'Connecting to ':'جارٍ الاتصال بـ ')+DIM.meta.file;
    setTimeout(()=>{document.querySelector('.loader-bar i').style.width='100%';},60);
    setTimeout(()=>{document.getElementById('loaderTxt').textContent=(LANG==='en'?'Querying ':'جارٍ سحب ')+DIM.meta.rows.toLocaleString()+(LANG==='en'?' records…':' سجل…');},560);
    setTimeout(()=>{ld.classList.remove('show');enterPortal();},1450);
  }else{err.textContent=(LANG==='en'?'Invalid credentials. Use moataz / moataz.':'بيانات الدخول غير صحيحة. استخدم moataz / moataz.');}
}
function enterPortal(){
  document.getElementById('login').style.display='none';
  document.getElementById('srcChip').textContent='🛢 '+DIM.meta.file+' · '+DIM.meta.rows.toLocaleString()+(LANG==='en'?' rows':' صف');
  document.getElementById('app').classList.add('show');appReady=true;
  compute();buildFilterBar();buildChips();renderPanel('overview');
}
const TITLES={
 overview:['Executive Overview','نظرة عامة تنفيذية','Live snapshot · FY2024–2026','لقطة حية · ٢٠٢٤–٢٠٢٦'],
 supply:['Supply Chain','سلسلة الإمداد','Stock, OTIF, replenishment · MAKE & MOVE','المخزون، التسليم، التموين'],
 revenue:['Revenue & Finance','الإيرادات والمالية','Revenue, COGS, profit, e-commerce','الإيراد، التكلفة، الربح، التجارة'],
 products:['Products','المنتجات','Portfolio performance & market share','أداء المحفظة والحصة السوقية'],
 workforce:['Workforce','القوى العاملة','Headcount, turnover, hiring pipeline','العدد، الدوران، التوظيف'],
 assistant:['Smart Assistant','المساعد الذكي','Ask the data anything','اسأل البيانات أي شيء'],
 lookup:['Number Lookup','البحث بالأرقام','Instant figure retrieval','استخراج فوري للأرقام'],
};
function setTitle(p){const t=TITLES[p];document.getElementById('ptitle').textContent=LANG==='en'?t[0]:t[1];document.getElementById('psub').textContent=LANG==='en'?t[2]:t[3];}
function go(p){
  current=p;
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.target===p));
  document.querySelectorAll('.panel').forEach(s=>s.classList.toggle('active',s.id==='panel-'+p));
  document.getElementById('sidebar').classList.remove('open');
  setTitle(p);renderPanel(p);
  const fb=document.getElementById('filterBar');if(fb)fb.style.display=(p==='assistant')?'none':'flex';
  document.querySelector('.content').scrollIntoView({behavior:'smooth',block:'start'});
}

/* ============================================================================
   FILTER BAR
   ========================================================================== */
const FDEFS=[
  ['years','Year','السنة',()=>YEARS.map((y,i)=>[i,String(y)])],
  ['regions','Region','المنطقة',()=>REGIONS.map((r,i)=>[i,r.n])],
  ['channels','Channel','القناة',()=>CHANNELS.map((c,i)=>[i,c.n])],
  ['cats','Category','الفئة',()=>CATS.map(c=>[c,c])],
  ['brands','Brand','العلامة',()=>BRANDS.map(b=>[b,b])],
  ['prods','Product','المنتج',()=>PRODUCTS.map((p,i)=>[i,p.n])],
];
function buildFilterBar(){
  const bar=document.getElementById('filterBar');if(!bar)return;const en=LANG==='en';
  let h='<span class="fbar-ico">⚙</span>';
  FDEFS.forEach(([key,lbl,lblAr])=>{
    const sel=FILTER[key];const cnt=sel.size;
    const label=(en?lbl:lblAr)+(cnt?' · '+cnt:'');
    h+=`<div class="fdrop ${cnt?'on':''}" data-key="${key}">
      <button class="fdrop-btn" onclick="toggleDrop('${key}')">${label}<span class="caret">▾</span></button>
      <div class="fdrop-menu" id="menu-${key}"></div></div>`;
  });
  h+=`<button class="fbar-reset" onclick="resetFilters()">${en?'Reset':'مسح'} ✕</button>`;
  h+=`<span class="fbar-count" id="fbarCount"></span>`;
  bar.innerHTML=h;updateFbarCount();
}
let openDrop=null;
function toggleDrop(key){
  const menu=document.getElementById('menu-'+key);
  if(openDrop&&openDrop!==key){const m=document.getElementById('menu-'+openDrop);if(m)m.classList.remove('show');}
  const def=FDEFS.find(d=>d[0]===key),opts=def[3](),en=LANG==='en',sel=FILTER[key];
  menu.innerHTML=opts.map(([val,txt])=>{
    const id='opt-'+key+'-'+String(val).replace(/[^a-z0-9]/gi,'');
    return `<label class="fopt"><input type="checkbox" ${sel.has(typeof val==='number'?val:val)?'checked':''}
      onchange="toggleOpt('${key}',${typeof val==='number'?val:`'${String(val).replace(/'/g,"\\'")}'`},this.checked)">
      <span>${txt}</span></label>`;
  }).join('')+`<div class="fopt-foot"><button onclick="clearKey('${key}')">${en?'Clear':'مسح'}</button></div>`;
  menu.classList.toggle('show');openDrop=menu.classList.contains('show')?key:null;
}
function toggleOpt(key,val,on){if(on)FILTER[key].add(val);else FILTER[key].delete(val);applyFilters();}
function clearKey(key){FILTER[key].clear();applyFilters();const m=document.getElementById('menu-'+key);if(m)m.classList.remove('show');openDrop=null;}
function resetFilters(){Object.values(FILTER).forEach(s=>s.clear());applyFilters();}
function applyFilters(){
  compute();built.overview=built.supply=built.revenue=built.products=built.workforce=false;
  buildFilterBar();renderPanel(current,true);
}
function updateFbarCount(){
  const el=document.getElementById('fbarCount');if(!el)return;const en=LANG==='en';
  el.textContent=(products?products.length:0)+(en?' SKUs · ':' صنف · ')+
    '$'+(totals?totals.rev/1000:0).toFixed(2)+(en?'B rev in view':' مليار في النطاق');
}
if(typeof document!=='undefined')document.addEventListener('click',e=>{
  if(openDrop&&!e.target.closest('.fdrop')){const m=document.getElementById('menu-'+openDrop);if(m)m.classList.remove('show');openDrop=null;}
});

/* ============================================================================
   CHART HELPERS (reused)
   ========================================================================== */
const charts={};
if(typeof window!=='undefined'&&window.ChartDataLabels){Chart.register(window.ChartDataLabels);Chart.defaults.plugins.datalabels={display:false};}
function slug(s){return s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');}
function ki(c,h,v,desc){return '<div class="ki" style="--accent:'+c+'"><div class="kih">'+h+'</div><div class="kiv">'+v+'</div><div class="kid">'+desc+'</div></div>';}
function toggleGlossary(){document.getElementById('glossary').classList.toggle('show');}
function cs(v){return getComputedStyle(document.documentElement).getPropertyValue(v).trim();}
function theme(){return{text:cs('--text'),muted:cs('--muted'),line:cs('--line'),
  blue:cs('--blue'),cyan:cs('--cyan'),red:cs('--red'),gold:cs('--gold'),green:cs('--green'),purple:cs('--purple'),navy:cs('--pepsi-blue'),gray:cs('--bar-gray')};}
function mk(id,cfg){const el=document.getElementById(id);if(!el)return;if(charts[id])charts[id].destroy();
  Chart.defaults.font.family="Inter, Cairo, sans-serif";Chart.defaults.color=theme().muted;charts[id]=new Chart(el,cfg);}
function legend(t){return{labels:{color:t.text,usePointStyle:true,pointStyle:'circle',padding:16,font:{size:11}}};}
function ctxG(id,c){const el=document.getElementById(id);if(!el)return 'transparent';const ctx=el.getContext('2d');
  const g=ctx.createLinearGradient(0,0,0,260);g.addColorStop(0,c+'55');g.addColorStop(1,c+'00');return g;}
function tt(t){return{backgroundColor:cs('--card'),titleColor:t.text,bodyColor:t.muted,borderColor:t.line,borderWidth:1,padding:10,cornerRadius:8,displayColors:false};}
function optBar(t,h){return{responsive:true,maintainAspectRatio:false,indexAxis:h?'y':'x',
  plugins:{legend:{display:false},tooltip:tt(t),datalabels:{display:true,anchor:'end',align:h?'end':'top',clamp:true,color:t.muted,font:{size:10,weight:'700'},formatter:v=>Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(v)}},
  scales:h?{x:{grid:{color:t.line},border:{display:false},ticks:{color:t.muted}},y:{grid:{display:false},border:{display:false},ticks:{color:t.text,font:{size:11}}}}
           :{x:{grid:{display:false},border:{display:false},ticks:{color:t.muted,font:{size:10}}},y:{grid:{color:t.line},border:{display:false},ticks:{color:t.muted}}},
  animation:{duration:700}};}
function optLine(t){return{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
  plugins:{legend:legend(t),tooltip:tt(t)},
  scales:{x:{grid:{display:false},border:{display:false},ticks:{color:t.muted}},y:{grid:{color:t.line},border:{display:false},ticks:{color:t.muted}}},
  animation:{duration:700}};}
function insight(id,take,reco,takeAr,recoAr){
  const cv=document.getElementById(id);if(!cv)return;const card=cv.closest('.card');if(!card)return;
  let box=card.querySelector('.insight');if(!box){box=document.createElement('div');box.className='insight';card.appendChild(box);}
  const en=LANG==='en';
  box.innerHTML='<div class="ins-take"><span>◆</span><span>'+(en?take:(takeAr||take))+'</span></div>'+
    (reco?('<div class="ins-reco"><b>'+(en?'Action:':'إجراء:')+'</b> '+(en?reco:(recoAr||reco))+'</div>'):'');
}

/* ============================================================================
   KPI BUILDER
   ========================================================================== */
const IC={money:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>',
  profit:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 17l6-6 4 4 8-8"/><path d="M21 7v6h-6"/></svg>',
  box:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/></svg>',
  truck:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="6" width="13" height="11"/><path d="M14 9h5l3 3v5h-8"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
  pct:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 5L5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/></svg>',
  ppl:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="7" r="4"/><path d="M2 21v-2a6 6 0 016-6h2"/></svg>',
  cart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="18" cy="21" r="1"/><path d="M1 1h4l2.6 13H19l2-9H6"/></svg>',
  warn:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l9 16H3z"/><path d="M12 9v5M12 17v.5"/></svg>'};
function kpiCard(label,labelAr,val,delta,up,accent,icon){
  return `<div class="kpi" style="--accent:${accent}">
    <div class="ico-wrap">${icon}</div>
    <div class="label"><span class="en-only">${label}</span><span class="ar-only">${labelAr}</span></div>
    <div class="val" data-target="${val.t}" data-fmt="${val.f}">0</div>
    <div class="delta ${up?'up':'down'}">${up?'▲':'▼'} ${delta}</div>
  </div>`;
}
function dpct(v){return (v>=0?'+':'')+v.toFixed(1)+'% YoY';}
function buildKPIs(){
  const en=LANG==='en',fillAvg=regions.reduce((s,r)=>s+r.v,0)/Math.max(regions.length,1);
  const oosCount=stockouts.filter(s=>s.s==='crit'||s.s==='warn').length;
  const otifNow=otifTrend[11]||95,otdNow=otdTrend[11]||96;
  const inTransit=nodes.reduce((s,n)=>s+n.v,0)/1000;
  document.getElementById('kpiOverview').innerHTML=
    kpiCard('Total Revenue','إجمالي الإيراد',{t:totals.rev/1000,f:'$Bm'},dpct(totals.yoyRev),totals.yoyRev>=0,'rgba(0,164,228,.6)',IC.money)+
    kpiCard('Net Profit','صافي الربح',{t:totals.np/1000,f:'$Bm'},dpct(totals.yoyNp),totals.yoyNp>=0,'rgba(29,185,84,.55)',IC.profit)+
    kpiCard('Units Sold','الوحدات المباعة',{t:totals.units/1e9,f:'Bu'},dpct(totals.yoyUnits),totals.yoyUnits>=0,'rgba(244,180,0,.55)',IC.box)+
    kpiCard('On-Time Delivery','التسليم في الموعد',{t:otdNow,f:'%'},(otdNow-95).toFixed(1)+' pts',otdNow>=95,'rgba(238,28,46,.5)',IC.truck);
  document.getElementById('kpiSupply').innerHTML=
    kpiCard('Fill Rate','نسبة التلبية',{t:fillAvg,f:'%'},(fillAvg-95).toFixed(1)+' pts',fillAvg>=95,'rgba(0,164,228,.6)',IC.pct)+
    kpiCard('OOS / Low SKUs','أصناف نافدة',{t:oosCount,f:'n'},en?'in view':'بالنطاق',false,'rgba(238,28,46,.55)',IC.warn)+
    kpiCard('On-Hand (K units)','المخزون','+'+'',{t:inTransit,f:'Ku'},en?'across nodes':'بالمواقع',true,'rgba(124,92,252,.5)',IC.box)+
    kpiCard('OTIF','التسليم الكامل',{t:otifNow,f:'%'},(otifNow-95).toFixed(1)+' pts',otifNow>=95,'rgba(29,185,84,.5)',IC.profit);
  document.getElementById('kpiRevenue').innerHTML=
    kpiCard('Revenue','الإيراد',{t:totals.rev/1000,f:'$Bm'},dpct(totals.yoyRev),totals.yoyRev>=0,'rgba(0,164,228,.6)',IC.money)+
    kpiCard('Gross Profit','الربح الإجمالي',{t:(totals.rev-totals.cogs)/1000,f:'$Bm'},en?'gross':'إجمالي',true,'rgba(29,185,84,.5)',IC.profit)+
    kpiCard('Net Profit','صافي الربح',{t:totals.np/1000,f:'$Bm'},dpct(totals.yoyNp),totals.yoyNp>=0,'rgba(244,180,0,.55)',IC.profit)+
    kpiCard('Net Margin','هامش صافي',{t:(totals.np/totals.rev*100)||0,f:'%'},en?'of revenue':'من الإيراد',true,'rgba(238,28,46,.5)',IC.pct);
  document.getElementById('kpiEcom').innerHTML=
    kpiCard('E-Com GMV','مبيعات إلكترونية',{t:ecom.gmv/1e9,f:'$Bm'},en?'online':'أونلاين',true,'rgba(124,92,252,.55)',IC.cart)+
    kpiCard('Avg Order Value','متوسط الطلب',{t:ecom.aov,f:'$'},en?'per order':'للطلب',true,'rgba(0,164,228,.55)',IC.money)+
    kpiCard('Conversion','معدل التحويل',{t:ecom.conv,f:'%'},en?'visit→buy':'زيارة→شراء',true,'rgba(29,185,84,.5)',IC.pct)+
    kpiCard('Cart Abandon','ترك السلة',{t:ecom.abandon,f:'%'},en?'recover':'فرصة',false,'rgba(238,28,46,.5)',IC.cart);
  document.getElementById('kpiWork').innerHTML=
    kpiCard('Total Headcount','إجمالي العدد',{t:depts.reduce((s,d)=>s+d.v,0),f:'n'},en?'FTE':'موظف',true,'rgba(0,164,228,.6)',IC.ppl)+
    kpiCard('Turnover Rate','معدل الدوران',{t:turnTrend[11]||0,f:'%'},en?'monthly':'شهري',turnTrend[11]<2.5,'rgba(29,185,84,.5)',IC.pct)+
    kpiCard('Open Gap vs Plan','الفجوة','+'+'',{t:DBhr.hrKpis.openReqs,f:'n'},en?'roles short':'وظيفة',false,'rgba(244,180,0,.55)',IC.ppl)+
    kpiCard('Positions Filled','نسبة الإشغال',{t:DBhr.hrKpis.pctFilled,f:'%'},(DBhr.hrKpis.pctFilled-100).toFixed(1)+' vs plan',DBhr.hrKpis.pctFilled>=95,'rgba(124,92,252,.5)',IC.profit);
  document.getElementById('kpiHR').innerHTML=
    kpiCard('Positions Filled','نسبة الإشغال',{t:DBhr.hrKpis.pctFilled,f:'%'},(DBhr.hrKpis.pctFilled-100).toFixed(1)+' vs plan',DBhr.hrKpis.pctFilled>=95,'rgba(29,185,84,.5)',IC.profit)+
    kpiCard('Open Gap vs Plan','الفجوة مقابل الخطة',{t:DBhr.hrKpis.openReqs,f:'n'},en?'roles short':'وظيفة ناقصة',false,'rgba(238,28,46,.55)',IC.warn)+
    kpiCard('Avg Time to Fill','متوسط زمن الشغل',{t:DBhr.hrKpis.avgTimeToFill,f:'d'},en?'per role':'للوظيفة',true,'rgba(244,180,0,.55)',IC.ppl)+
    kpiCard('Net HC Movement','صافي حركة العمالة',{t:DBhr.hrKpis.netMovement,f:'n'},en?'YTD':'سنوي',DBhr.hrKpis.netMovement>=0,'rgba(0,164,228,.55)',IC.ppl);
}
function fmt(v,f){
  if(f==='$Bm')return '$'+(+v).toFixed(2)+'B';
  if(f==='$Mm')return '$'+(+v).toFixed(2)+'M';
  if(f==='Bu')return (+v).toFixed(2)+'B';
  if(f==='Mu')return (+v).toFixed(2)+'M';
  if(f==='d')return Math.round(v)+'d';
  if(f==='Ku')return Math.round(v).toLocaleString()+'K';
  if(f==='%')return (+v).toFixed(1)+'%';
  if(f==='$')return '$'+Math.round(v);
  if(f==='n')return Math.round(v).toLocaleString();
  return v;
}
function countUp(el){
  const target=parseFloat(el.dataset.target)||0,f=el.dataset.fmt;let s=null,dur=900;
  function step(t){if(!s)s=t;const p=Math.min((t-s)/dur,1),e=1-Math.pow(1-p,3);
    el.textContent=fmt(target*e,f);if(p<1)requestAnimationFrame(step);}
  requestAnimationFrame(step);
}

/* ============================================================================
   PRODUCTS GRID / STOCKOUT TABLE / CHIPS
   ========================================================================== */
function buildProducts(){
  document.getElementById('prodGrid').innerHTML=products.map(p=>`
    <div class="prod">
      <div class="pthumb"><img src="${PIMG[slug(p.n)]||''}" alt="${p.n}" loading="lazy" onerror="this.style.display='none'"></div>
      <div class="pname">${p.n}</div>
      <div class="pcat">${p.c}</div>
      <div class="prow"><span class="en-only">Units</span><span class="ar-only">وحدات</span><b>${(p.units/1e6).toFixed(0)}M</b></div>
      <div class="prow"><span class="en-only">Revenue</span><span class="ar-only">إيراد</span><b>$${p.rev}M</b></div>
      <div class="prow"><span class="en-only">Net profit</span><span class="ar-only">صافي ربح</span><b>$${p.np}M</b></div>
      <div class="prow"><span class="en-only">YoY</span><span class="ar-only">سنوي</span><b style="color:${p.yoy>=0?'var(--green)':'var(--red)'}">${p.yoy>=0?'+':''}${p.yoy}%</b></div>
    </div>`).join('');
}
function buildStockout(){
  document.querySelector('#stockoutTable tbody').innerHTML=[...stockouts].sort((a,b)=>a.d-b.d).map(r=>`
    <tr><td>${r.p}</td><td>${r.h.toLocaleString()}</td><td>${r.d}</td>
    <td><span class="pill ${r.s}">${r.s==='crit'?(LANG==='en'?'Critical':'حرج'):r.s==='warn'?(LANG==='en'?'Low':'منخفض'):(LANG==='en'?'Watch':'مراقبة')}</span></td></tr>`).join('');
}
const CHIPS=[
 ['Top 5 products by revenue','أعلى 5 منتجات بالإيراد'],
 ['Compare Pepsi vs 7UP','قارن بيبسي مع سفن أب'],
 ['Show me E-commerce in Egypt','اعرض الأونلاين في مصر'],
 ['Which region has the lowest fill rate?','أي منطقة أقل في التلبية؟'],
 ['Net profit of Snacks in 2026','صافي ربح السناكس في 2026'],
 ['Revenue trend this year','اتجاه الإيراد السنة دي'],
 ['What is the cart abandon rate?','كم نسبة ترك السلة؟'],
];
function buildChips(){
  const el=document.getElementById('assistChips');if(!el)return;
  el.innerHTML=CHIPS.map(c=>
    `<button class="chip" onclick="askAssistant('${(LANG==='en'?c[0]:c[1]).replace(/'/g,"\\'")}')">${LANG==='en'?c[0]:c[1]}</button>`).join('');
}

/* ============================================================================
   NLP SMART ASSISTANT — entity + intent engine over the live data
   ========================================================================== */
function addMsg(t,who){const c=document.getElementById('chat');const d=document.createElement('div');
  d.className='msg '+who;d.innerHTML=t;c.appendChild(d);c.scrollTop=c.scrollHeight;}

/* text normalisation (handles Arabic diacritics / letter variants) */
function norm(s){return (s||'').toString().toLowerCase()
  .replace(/[ً-ْٰـ]/g,'')
  .replace(/[إأآا]/g,'ا').replace(/ى/g,'ي').replace(/ؤ/g,'و').replace(/ئ/g,'ي').replace(/ة/g,'ه')
  .replace(/[^a-z0-9؀-ۿ% ]+/g,' ').replace(/\s+/g,' ').trim();}

/* arabic alias maps */
const AR_REGION={'مصر':'Levant & Egypt','الشام':'Levant & Egypt','الخليج':'Gulf & Middle East','السعوديه':'Gulf & Middle East','الامارات':'Gulf & Middle East','دبي':'Gulf & Middle East','تركيا':'Türkiye','المانيا':'Germany & DACH','بريطانيا':'UK & Ireland','انجلترا':'UK & Ireland','اسبانيا':'Iberia','فرنسا':'France & Benelux','بولندا':'Poland & CEE'};
const AR_PROD={'بيبسي':'Pepsi','سفن':'7UP','سفناب':'7UP','ماونتن':'Mountain Dew','مياه':'Aquafina','اكوافينا':'Aquafina','ميرندا':'Mirinda Orange','جاتوريد':'Gatorade','ليبتون':'Lipton Ice Tea','تروبيكانا':'Tropicana','دوريتوس':'Doritos','تشيتوس':'Cheetos','كواكر':'Quaker Oats','روكستار':'Rockstar Energy','ستينج':'Sting Energy'};
const AR_CAT={'مشروبات':'Beverages','سناكس':'Snacks','شيبسي':'Snacks','وجبات':'Foods','اطعمه':'Foods','طعام':'Foods'};
const AR_CH={'اونلاين':'E-commerce','الكتروني':'E-commerce','انترنت':'E-commerce','مطاعم':'Foodservice','تقليدي':'Traditional Trade','حديث':'Modern Trade'};

function entities(q){
  const nq=norm(q);
  const E={prods:new Set(),regions:new Set(),channels:new Set(),cats:new Set(),brands:new Set(),years:new Set()};
  YEARS.forEach((y,i)=>{if(nq.includes(String(y)))E.years.add(i);});
  if(/last year|الماضي|اللي فات|السابقه/.test(nq)&&YEARS.length>1)E.years.add(YEARS.length-2);
  if(/this year|الحاليه|السنه دي|الحالي/.test(nq))E.years.add(YEARS.length-1);
  REGIONS.forEach((r,i)=>{norm(r.n).split(' ').forEach(w=>{if(w.length>2&&nq.includes(w))E.regions.add(i);});});
  Object.entries(AR_REGION).forEach(([k,v])=>{if(nq.includes(norm(k))){const i=REGIONS.findIndex(r=>r.n===v);if(i>=0)E.regions.add(i);}});
  CHANNELS.forEach((c,i)=>{norm(c.n).split(' ').forEach(w=>{if(w.length>3&&nq.includes(w))E.channels.add(i);});});
  Object.entries(AR_CH).forEach(([k,v])=>{if(nq.includes(norm(k))){const i=CHANNELS.findIndex(c=>c.n===v);if(i>=0)E.channels.add(i);}});
  if(/ecom|e ?com|online/.test(nq)&&ECOM_CH>=0)E.channels.add(ECOM_CH);
  CATS.forEach(c=>{if(nq.includes(norm(c)))E.cats.add(c);});
  Object.entries(AR_CAT).forEach(([k,v])=>{if(nq.includes(norm(k)))E.cats.add(v);});
  // products: prefer full-name match, fall back to significant tokens / arabic aliases
  const exact=[];PRODUCTS.forEach((p,i)=>{if(nq.includes(norm(p.n)))exact.push(i);});
  if(exact.length){exact.forEach(i=>E.prods.add(i));}
  else{PRODUCTS.forEach((p,i)=>{norm(p.n).split(' ').forEach(w=>{if(w.length>2&&!['the','ice','tea'].includes(w)&&nq.includes(w))E.prods.add(i);});});}
  Object.entries(AR_PROD).forEach(([k,v])=>{if(nq.includes(norm(k))){const i=PRODUCTS.findIndex(p=>p.n===v);if(i>=0)E.prods.add(i);}});
  BRANDS.forEach(b=>{if(nq.includes(norm(b)))E.brands.add(b);});
  E.has=E.prods.size||E.regions.size||E.channels.size||E.cats.size||E.brands.size||E.years.size;
  return E;
}
function scopeFromE(E){const o={};
  if(E.prods.size)o.prods=E.prods;if(E.regions.size)o.regions=E.regions;if(E.channels.size)o.channels=E.channels;
  if(E.cats.size)o.cats=E.cats;if(E.brands.size)o.brands=E.brands;if(E.years.size)o.years=E.years;return o;}
function scopeLabel(E){
  const en=LANG==='en',parts=[];
  if(E.prods.size)parts.push([...E.prods].map(i=>PRODUCTS[i].n).join(', '));
  if(E.brands.size)parts.push([...E.brands].join(', '));
  if(E.cats.size)parts.push([...E.cats].join(', '));
  if(E.channels.size)parts.push([...E.channels].map(i=>CHANNELS[i].n).join(', '));
  if(E.regions.size)parts.push([...E.regions].map(i=>REGIONS[i].n).join(', '));
  if(E.years.size)parts.push([...E.years].map(i=>YEARS[i]).join(', '));
  return parts.length?parts.join(' · '):(en?'all data':'كل البيانات');
}
/* aggregate facts under FILTER, overriding any dimension named in `over` */
function aggWhere(over){over=over||{};const F=FACTS,n=F.fU.length;
  const yrs=over.years||(FILTER.years.size?FILTER.years:null);
  const regs=over.regions||(FILTER.regions.size?FILTER.regions:null);
  const chs=over.channels||(FILTER.channels.size?FILTER.channels:null);
  const prods=over.prods||(FILTER.prods.size?FILTER.prods:null);
  const cats=over.cats||(FILTER.cats.size?FILTER.cats:null);
  const brands=over.brands||(FILTER.brands.size?FILTER.brands:null);
  let u=0,rev=0,cogs=0;
  for(let i=0;i<n;i++){
    if(yrs&&!yrs.has(F.fY[i]))continue;if(regs&&!regs.has(F.fR[i]))continue;if(chs&&!chs.has(F.fC[i]))continue;
    const p=F.fP[i],P=PRODUCTS[p];
    if(prods&&!prods.has(p))continue;if(cats&&!cats.has(P.c))continue;if(brands&&!brands.has(P.brand))continue;
    const uu=F.fU[i];u+=uu;rev+=uu*priceOf(p,F.fC[i]);cogs+=uu*costOf(p,F.fY[i]);
  }
  return {units:u,rev,cogs,gross:rev-cogs,np:(rev-cogs)*NETCONV};
}
/* group facts (under FILTER) by a dimension */
function groupAgg(dim){const F=FACTS,n=F.fU.length,map=new Map();
  for(let i=0;i<n;i++){
    if(FILTER.years.size&&!FILTER.years.has(F.fY[i]))continue;
    if(FILTER.regions.size&&!FILTER.regions.has(F.fR[i]))continue;
    if(FILTER.channels.size&&!FILTER.channels.has(F.fC[i]))continue;
    const p=F.fP[i],P=PRODUCTS[p];
    if(FILTER.prods.size&&!FILTER.prods.has(p))continue;
    if(FILTER.cats.size&&!FILTER.cats.has(P.c))continue;
    if(FILTER.brands.size&&!FILTER.brands.has(P.brand))continue;
    const key=dim==='product'?P.n:dim==='region'?REGIONS[F.fR[i]].n:dim==='channel'?CHANNELS[F.fC[i]].n:dim==='brand'?P.brand:P.c;
    const o=map.get(key)||{u:0,rev:0,cogs:0};const uu=F.fU[i];
    o.u+=uu;o.rev+=uu*priceOf(p,F.fC[i]);o.cogs+=uu*costOf(p,F.fY[i]);map.set(key,o);
  }
  return map;
}
/* ordered most-specific → least-specific so pickMetric() picks correctly */
const METRICS=[
 {k:'gross',re:/gross|الربح الاجمالي|اجمالي الربح/,lbl:['Gross profit','الربح الإجمالي'],fmt:'$',get:a=>a.gross},
 {k:'margin',re:/margin|هامش/,lbl:['Net margin','هامش صافي'],fmt:'%',get:a=>a.rev?a.np/a.rev*100:0},
 {k:'net',re:/net|صافي|الربح|ربح|profit/,lbl:['Net profit','صافي الربح'],fmt:'$',get:a=>a.np},
 {k:'cogs',re:/cogs|تكلفه|التكلفه/,lbl:['COGS','التكلفة'],fmt:'$',get:a=>a.cogs},
 {k:'units',re:/unit|volume|وحد|حجم|كميه|مبيعا/,lbl:['Units','الوحدات'],fmt:'u',get:a=>a.units},
 {k:'revenue',re:/revenue|sales|ايراد|ايرادات/,lbl:['Revenue','الإيراد'],fmt:'$',get:a=>a.rev},
];
function pickMetric(nq){return METRICS.find(m=>m.re.test(nq))||METRICS[5];}
/* keyword matchers — \b only works for ASCII, so Arabic is matched by substring */
function nlist(arr){return arr.map(norm);}
const DRIVE_AR=nlist(['اعرض','عرض','فلتر','وري','ركز','اظهر','خليني اشوف']);
const TOP_AR=nlist(['اكثر','اعلى','افضل','اكبر','الاكثر','الاعلى','اعلي']);
const BOT_AR=nlist(['اقل','ادنى','اسوأ','الاقل','اضعف','ادني']);
const DIM_REGION=nlist(['region','area','منطقة','مناطق']);
const DIM_CHANNEL=nlist(['channel','channels','قناة','قنوات']);
const DIM_CATEGORY=nlist(['category','categories','فئة','فئات','نوع']);
const DIM_BRAND=nlist(['brand','brands','ماركة','ماركات','علامة','علامات']);
function anyAr(nq,list){return list.some(w=>w&&nq.includes(w));}
function fmtV(m,v){const en=LANG==='en';
  if(m.fmt==='$')return '$'+(v/1e9).toFixed(2)+'B';
  if(m.fmt==='u')return (v/1e9).toFixed(2)+(en?'B units':' مليار وحدة');
  if(m.fmt==='%')return v.toFixed(1)+'%';return String(v);}

let __scopes=[];
function applyChip(label,labelAr){
  const i=__scopes.length;__scopes.push(null);return '';}
function nlpApply(idx){const E=__scopes[idx];if(!E)return;
  Object.values(FILTER).forEach(s=>s.clear());
  ['prods','regions','channels','cats','brands','years'].forEach(k=>E[k].forEach(v=>FILTER[k].add(v)));
  applyFilters();go('overview');}
function applyBtn(E){const i=__scopes.length;__scopes.push(E);const en=LANG==='en';
  return ` <button class="chip nlp-act" onclick="nlpApply(${i})">📌 ${en?'Filter dashboard to this':'فلتر الداشبورد على ده'}</button>`;}

function help(){const en=LANG==='en';
  return en?`I'm your data assistant — ask me in English or Arabic. I understand <b>products, brands, regions, channels, categories and years</b>, and I can:
  <br>• <b>Look up any number</b> — "net profit of Snacks in 2026"
  <br>• <b>Rank</b> — "top 5 products by revenue", "lowest fill rate region"
  <br>• <b>Compare</b> — "Pepsi vs 7UP", "Egypt vs Türkiye"
  <br>• <b>Trends</b> — "revenue trend this year"
  <br>• <b>Drive the dashboard</b> — "show me E-commerce in Egypt" filters everything.`
  :`أنا مساعد البيانات — اسألني بالعربي أو الإنجليزي. بفهم <b>المنتجات والعلامات والمناطق والقنوات والفئات والسنين</b>، وأقدر:
  <br>• <b>أطلّع أي رقم</b> — «صافي ربح السناكس في 2026»
  <br>• <b>أرتّب</b> — «أعلى 5 منتجات بالإيراد»، «أقل منطقة في التلبية»
  <br>• <b>أقارن</b> — «بيبسي مع سفن أب»، «مصر مقابل تركيا»
  <br>• <b>الاتجاهات</b> — «اتجاه الإيراد السنة دي»
  <br>• <b>أحرّك الداشبورد</b> — «اعرض الأونلاين في مصر» يفلتر كل حاجة.`;}

function nlpAnswer(q){
  const en=LANG==='en',nq=norm(q),E=entities(q);
  if(!nq)return help();
  if(/^(hi|hello|hey|help|اهلا|مرحبا|مساعده|ساعدني|عامل ايه|ايه اللي تقدر|what can you)/.test(nq))return help();

  /* intent: drive the dashboard (filter) */
  if((/\b(show|filter|drill|focus|view)\b/.test(nq)||anyAr(nq,DRIVE_AR))&&E.has){
    const i=__scopes.length;__scopes.push(E);
    setTimeout(()=>nlpApply(i),350);
    return (en?'📌 Filtering the whole dashboard to <b>'+scopeLabel(E)+'</b> — opening Overview…'
              :'📌 ببفلتر الداشبورد كله على <b>'+scopeLabel(E)+'</b> — بفتح النظرة العامة…');
  }

  /* intent: comparison */
  if(/(vs|versus|compare|قارن|مقابل|الفرق بين)/.test(nq)){
    const m=pickMetric(nq);let pair=[],type='';
    if(E.prods.size>=2){type='product';pair=[...E.prods].slice(0,2).map(i=>({lbl:PRODUCTS[i].n,o:aggWhere({prods:new Set([i])})}));}
    else if(E.regions.size>=2){type='region';pair=[...E.regions].slice(0,2).map(i=>({lbl:REGIONS[i].n,o:aggWhere({regions:new Set([i])})}));}
    else if(E.channels.size>=2){type='channel';pair=[...E.channels].slice(0,2).map(i=>({lbl:CHANNELS[i].n,o:aggWhere({channels:new Set([i])})}));}
    else if(E.cats.size>=2){type='category';pair=[...E.cats].slice(0,2).map(c=>({lbl:c,o:aggWhere({cats:new Set([c])})}));}
    if(pair.length===2){
      const a=m.get(pair[0].o),b=m.get(pair[1].o),diff=b?((a/b-1)*100):0,win=a>=b?pair[0]:pair[1];
      return (en?`On <b>${m.lbl[0]}</b>: <b>${pair[0].lbl}</b> = ${fmtV(m,a)} vs <b>${pair[1].lbl}</b> = ${fmtV(m,b)}. `
                +`${win.lbl} leads by <b>${Math.abs(a-b)?fmtV(m,Math.abs(a-b)):'0'}</b> (${Math.abs(diff).toFixed(0)}%).`
              :`في <b>${m.lbl[1]}</b>: <b>${pair[0].lbl}</b> = ${fmtV(m,a)} مقابل <b>${pair[1].lbl}</b> = ${fmtV(m,b)}. `
                +`${win.lbl} الأعلى بفارق <b>${Math.abs(diff).toFixed(0)}%</b>.`);
    }
    return en?'Tell me two things to compare, e.g. "Pepsi vs 7UP" or "Egypt vs Türkiye".'
            :'قولّي حاجتين أقارنهم، مثلاً «بيبسي مع سفن أب» أو «مصر مقابل تركيا».';
  }

  /* intent: ranking */
  const isTop=/\b(top|best|highest|most|largest|leading)\b/.test(nq)||anyAr(nq,TOP_AR);
  const isBot=/\b(bottom|worst|lowest|least|smallest|weakest)\b/.test(nq)||anyAr(nq,BOT_AR);
  if(isTop||isBot){
    const dim=(E.regions.size||anyAr(nq,DIM_REGION))?'region':anyAr(nq,DIM_CHANNEL)?'channel':anyAr(nq,DIM_CATEGORY)?'category':anyAr(nq,DIM_BRAND)?'brand':'product';
    /* operational ranking: fill rate by region */
    if(/fill|تلبيه|توافر|service/.test(nq)){
      const arr=[...regions].sort((a,b)=>a.v-b.v);const pick=isBot?arr:arr.slice().reverse();
      const r=pick[0];return en?`<b>${r.n}</b> has the ${isBot?'lowest':'highest'} fill rate at <b>${r.v}%</b>.`
                                :`<b>${r.n}</b> ${isBot?'الأدنى':'الأعلى'} في التلبية بـ<b>${r.v}%</b>.`;
    }
    const m=pickMetric(nq),map=groupAgg(dim);
    let arr=[...map.entries()].map(([k,o])=>({k,v:m.get(o)})).sort((a,b)=>b.v-a.v);
    if(isBot)arr.reverse();
    const N=Math.min(parseInt((nq.match(/\b(\d+)\b/)||[])[1])||5,arr.length);
    arr=arr.slice(0,N);
    const dn={product:['products','منتجات'],region:['regions','مناطق'],channel:['channels','قنوات'],category:['categories','فئات'],brand:['brands','علامات']}[dim];
    const list=arr.map((x,i)=>`${i+1}. <b>${x.k}</b> — ${fmtV(m,x.v)}`).join('<br>');
    return (en?`${isBot?'Bottom':'Top'} ${N} ${dn[0]} by ${m.lbl[0]}:<br>${list}`
              :`${isBot?'أقل':'أعلى'} ${N} ${dn[1]} حسب ${m.lbl[1]}:<br>${list}`);
  }

  /* intent: trend */
  if(/trend|over time|monthly|اتجاه|شهري|نمو|بمرور الوقت/.test(nq)){
    const h1=revTrend.slice(0,6).reduce((a,b)=>a+b,0),h2=revTrend.slice(6).reduce((a,b)=>a+b,0);
    return (en?`Revenue ${h2>=h1?'rose':'eased'} through the year (H2 ${h2>=h1?'+':''}$${(h2-h1).toFixed(0)}M vs H1), YoY <b>${totals.yoyRev>=0?'+':''}${totals.yoyRev}%</b>. Peak month: <b>${M[revTrend.indexOf(Math.max(...revTrend))]}</b>.`
              :`الإيراد ${h2>=h1?'ارتفع':'هدأ'} خلال السنة (النصف الثاني ${(h2-h1).toFixed(0)} مليون $ مقابل الأول)، YoY <b>${totals.yoyRev>=0?'+':''}${totals.yoyRev}%</b>. أعلى شهر: <b>${M[revTrend.indexOf(Math.max(...revTrend))]}</b>.`);
  }

  /* intent: share / mix */
  if(/share|mix|حصه|توزيع|نسبه/.test(nq)){
    if(/categor|فئ|mix|توزيع/.test(nq)){
      const cats={};products.forEach(p=>cats[p.c]=(cats[p.c]||0)+p.rev);
      const tot=Object.values(cats).reduce((a,b)=>a+b,0)||1;
      const list=Object.entries(cats).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<b>${k}</b> ${(v/tot*100).toFixed(0)}%`).join(' · ');
      return (en?'Category mix of revenue: '+list:'توزيع الإيراد على الفئات: '+list);
    }
    const top=[...products].sort((a,b)=>b.share-a.share)[0];
    return en?`<b>${top.n}</b> holds the largest revenue share at <b>${top.share}%</b>.`:`<b>${top.n}</b> الأعلى حصة بـ<b>${top.share}%</b>.`;
  }

  /* intent: scoped metric value (revenue/profit/units/margin/cogs) */
  if(METRICS.some(m=>m.re.test(nq))){
    const m=pickMetric(nq),a=aggWhere(scopeFromE(E)),v=m.get(a);
    const lbl=scopeLabel(E);
    let extra='';
    if(m.k==='revenue'||m.k==='net'){extra=en?` · margin ${(a.rev?a.np/a.rev*100:0).toFixed(1)}%`:` · هامش ${(a.rev?a.np/a.rev*100:0).toFixed(1)}%`;}
    return (en?`<b>${m.lbl[0]}</b> for <b>${lbl}</b>: <b>${fmtV(m,v)}</b>${extra}.`
              :`<b>${m.lbl[1]}</b> لـ<b>${lbl}</b>: <b>${fmtV(m,v)}</b>${extra}.`)
           + (E.has?applyBtn(E):'');
  }

  /* operational metrics (from current filtered view) */
  if(/delivery|otd|otif|تسليم|موعد/.test(nq))
    return en?`On-time delivery is <b>${otdTrend[11]}%</b> and OTIF <b>${otifTrend[11]}%</b> in the current view.`:`التسليم في الموعد <b>${otdTrend[11]}%</b> والكامل <b>${otifTrend[11]}%</b>.`;
  if(/fill|تلبيه|توافر/.test(nq)){const f=regions.reduce((s,r)=>s+r.v,0)/Math.max(regions.length,1);
    const low=[...regions].sort((a,b)=>a.v-b.v)[0];
    return en?`Average fill rate is <b>${f.toFixed(1)}%</b>; weakest region: <b>${low?low.n:'-'}</b> (${low?low.v:0}%).`:`متوسط التلبية <b>${f.toFixed(1)}%</b>؛ أضعف منطقة: <b>${low?low.n:'-'}</b>.`;}
  if(/out.?of.?stock|oos|stockout|نفاد|نافد|مخزون/.test(nq)){const c=stockouts[0]||{p:'-',d:0};
    return en?`<b>${stockouts.length}</b> SKUs at low/critical stock; most urgent: <b>${c.p}</b> (${c.d} days cover).`:`<b>${stockouts.length}</b> صنف بمخزون منخفض/حرج؛ الأكثر إلحاحاً: <b>${c.p}</b>.`;}
  if(/ecom|gmv|aov|cart|conversion|سله|اونلاين|الكتروني|تحويل/.test(nq))
    return en?`E-commerce GMV <b>$${(ecom.gmv/1e9).toFixed(2)}B</b>, AOV <b>$${ecom.aov}</b>, conversion <b>${ecom.conv}%</b>, cart abandon <b>${ecom.abandon}%</b>.`:`التجارة الإلكترونية GMV <b>$${(ecom.gmv/1e9).toFixed(2)}B</b>، متوسط الطلب <b>$${ecom.aov}</b>، ترك السلة <b>${ecom.abandon}%</b>.`;
  if(/turnover|attrition|دوران|استقال/.test(nq))
    return en?`Monthly turnover is <b>${turnTrend[11]}%</b>; open gap <b>${DBhr.hrKpis.openReqs}</b> roles, ${DBhr.hrKpis.pctFilled}% of plan filled.`:`الدوران الشهري <b>${turnTrend[11]}%</b>؛ الفجوة <b>${DBhr.hrKpis.openReqs}</b> وظيفة.`;
  if(/headcount|عدد|موظف|عماله/.test(nq))
    return en?`Total headcount is <b>${depts.reduce((s,d)=>s+d.v,0).toLocaleString()}</b> across ${depts.length} functions.`:`إجمالي العدد <b>${depts.reduce((s,d)=>s+d.v,0).toLocaleString()}</b> موظف عبر ${depts.length} وظائف.`;
  if(/why|risk|problem|ليه|سبب|مشكله|خطر/.test(nq)){const risk=[...products].sort((a,b)=>b.oos-a.oos)[0]||{n:'-',oos:0},low=[...regions].sort((a,b)=>a.v-b.v)[0];
    return en?`Biggest watch-outs: <b>${risk.n}</b> has the highest OOS at <b>${risk.oos}%</b>, and <b>${low?low.n:'-'}</b> trails on fill rate (${low?low.v:0}%). Prioritise replenishment there.`:`أهم المخاطر: <b>${risk.n}</b> الأعلى نفاداً بـ<b>${risk.oos}%</b>، و<b>${low?low.n:'-'}</b> الأضعف في التلبية. ركّز التموين هناك.`;}

  /* fallback: if entities present, give a revenue snapshot of that scope */
  if(E.has){const a=aggWhere(scopeFromE(E));
    return (en?`For <b>${scopeLabel(E)}</b>: revenue <b>$${(a.rev/1e9).toFixed(2)}B</b>, net profit <b>$${(a.np/1e9).toFixed(2)}B</b>, ${(a.units/1e9).toFixed(2)}B units.`
              :`لـ<b>${scopeLabel(E)}</b>: الإيراد <b>$${(a.rev/1e9).toFixed(2)}B</b>، صافي الربح <b>$${(a.np/1e9).toFixed(2)}B</b>، ${(a.units/1e9).toFixed(2)} مليار وحدة.`)
           +applyBtn(E);
  }
  return help();
}
function askAssistant(preset){
  const inp=document.getElementById('assistInput');const q=preset||(inp?inp.value.trim():'');if(!q)return;
  addMsg(q,'user');if(inp)inp.value='';
  const typing='<span class="typing"><i></i><i></i><i></i></span>';
  addMsg(typing,'bot');const chat=document.getElementById('chat');const last=chat.lastChild;
  setTimeout(()=>{last.innerHTML=nlpAnswer(q);chat.scrollTop=chat.scrollHeight;},420);
}

/* ============================================================================
   RENDER PANELS
   ========================================================================== */
function renderPanel(p,force){
  if(built[p]&&!force){animateKPIs(p);return;}
  built[p]=true;buildKPIs();updateFbarCount();const t=theme();
  if(p==='overview')renderOverview(t);
  if(p==='supply')renderSupply(t);
  if(p==='revenue')renderRevenue(t);
  if(p==='products')renderProducts(t);
  if(p==='workforce'){renderWorkforce(t);renderWorkforceHR(t);}
  animateKPIs(p);
}
function animateKPIs(p){
  const map={overview:'kpiOverview',supply:'kpiSupply',revenue:'kpiRevenue',workforce:'kpiWork'};
  if(map[p])document.querySelectorAll('#'+map[p]+' .val').forEach(countUp);
  if(p==='revenue')document.querySelectorAll('#kpiEcom .val').forEach(countUp);
  if(p==='workforce')document.querySelectorAll('#kpiHR .val').forEach(countUp);
}

function renderOverview(t){
  (function(){const byY=[...products].sort((a,b)=>b.yoy-a.yoy)[0]||{n:'-',yoy:0};
   const byNp=[...products].sort((a,b)=>b.np-a.np),t3=byNp.slice(0,3).reduce((s,p)=>s+p.np,0),tot=byNp.reduce((s,p)=>s+p.np,0)||1;
   const risk=[...products].sort((a,b)=>b.oos-a.oos)[0]||{n:'-',oos:0},en=LANG==='en',el=document.getElementById('keyins');
   if(el)el.innerHTML=
     ki('var(--green)',en?'Fastest grower':'الأسرع نمواً',(byY.yoy>=0?'+':'')+byY.yoy+'%',byY.n+(en?' — scale capacity':' — وسّع الطاقة'))+
     ki('var(--cyan)',en?'Profit concentration':'تركّز الربح',(t3/tot*100).toFixed(0)+'%',en?'Top 3 products':'أعلى 3 منتجات')+
     ki('var(--red)',en?'Top supply risk':'أعلى خطر إمداد',risk.oos+'%',risk.n+(en?' OOS — expedite':' نافد — عجّل'));
  })();
  mk('ovTrend',{type:'line',data:{labels:M,datasets:[
    {label:LANG==='en'?'Revenue':'الإيراد',data:revTrend,borderColor:t.cyan,backgroundColor:ctxG('ovTrend',t.cyan),fill:true,tension:.4,borderWidth:3,pointRadius:0,pointHoverRadius:5},
    {label:LANG==='en'?'Net Profit':'صافي الربح',data:npTrend,borderColor:t.green,backgroundColor:'transparent',tension:.4,borderWidth:3,pointRadius:0,pointHoverRadius:5}
  ]},options:optLine(t)});
  const h1=revTrend.slice(0,6).reduce((a,b)=>a+b,0),h2=revTrend.slice(6).reduce((a,b)=>a+b,0);
  insight('ovTrend','H2 revenue '+(h2>=h1?'outpaced':'trailed')+' H1 by $'+Math.abs(h2-h1).toFixed(0)+'M; total YoY '+(totals.yoyRev>=0?'+':'')+totals.yoyRev+'%.',
    'Protect manufacturing capacity for the top-growth SKUs.',
    'النصف الثاني '+(h2>=h1?'تفوّق':'أقل من')+' الأول بـ'+Math.abs(h2-h1).toFixed(0)+' مليون $.','أمّن الطاقة الإنتاجية لأعلى المنتجات نمواً.');
  const cats={};products.forEach(p=>cats[p.c]=(cats[p.c]||0)+p.rev);
  const ce=Object.entries(cats).sort((a,b)=>b[1]-a[1]);const ctot=ce.reduce((s,x)=>s+x[1],0)||1;
  mk('ovMix',{type:'doughnut',data:{labels:ce.map(x=>x[0]),datasets:[{data:ce.map(x=>x[1]),backgroundColor:[t.cyan,t.red,t.gold,t.purple,t.blue],borderWidth:0}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'64%',plugins:{legend:legend(t),tooltip:tt(t),datalabels:{display:true,color:'#fff',font:{weight:'800',size:13},formatter:(v,c)=>{const a=c.chart.data.datasets[0].data,s=a.reduce((x,y)=>x+y,0);return Math.round(v/s*100)+'%';}}}}});
  insight('ovMix',(ce[0]?ce[0][0]:'-')+' drive '+(ce[0]?(ce[0][1]/ctot*100).toFixed(0):0)+'% of revenue.',
    'Defend the core category and test growth bets in the smallest.',
    (ce[0]?ce[0][0]:'-')+' تمثل '+(ce[0]?(ce[0][1]/ctot*100).toFixed(0):0)+'٪ من الإيراد.','حافظ على الفئة الأساسية واختبر النمو في الأصغر.');
  const rg=[...regions].sort((a,b)=>a.v-b.v);
  mk('ovRegion',{type:'bar',data:{labels:rg.map(r=>r.n),datasets:[{data:rg.map(r=>r.v),backgroundColor:rg.map((r,i)=>i===0?t.red:t.gray),borderRadius:6}]},
    options:Object.assign(optBar(t,true),{scales:{x:{min:80,max:100,grid:{color:t.line},border:{display:false},ticks:{color:t.muted}},y:{grid:{display:false},border:{display:false},ticks:{color:t.text,font:{size:11}}}}})});
  if(rg.length)insight('ovRegion',rg[0].n+' has the lowest fill rate at '+rg[0].v+'%, vs '+rg[rg.length-1].v+'% best.',
    'Prioritise safety stock for '+rg[0].n+'.',rg[0].n+' الأدنى في التلبية بـ'+rg[0].v+'٪.','أعطِ أولوية للمخزون الاحتياطي لـ'+rg[0].n+'.');
  mk('ovOtd',{type:'line',data:{labels:M,datasets:[
    {label:'OTD',data:otdTrend,borderColor:t.green,backgroundColor:ctxG('ovOtd',t.green),fill:true,tension:.4,borderWidth:3,pointRadius:0},
    {label:LANG==='en'?'Target':'المستهدف',data:M.map(()=>95),borderColor:t.muted,borderDash:[5,5],borderWidth:1.5,pointRadius:0}
  ]},options:Object.assign(optLine(t),{scales:{x:{grid:{display:false},border:{display:false},ticks:{color:t.muted}},y:{min:85,max:100,grid:{color:t.line},border:{display:false},ticks:{color:t.muted}}}})});
  insight('ovOtd','On-time delivery ended at '+otdTrend[11]+'%, '+(otdTrend[11]-95>=0?'+':'')+(otdTrend[11]-95).toFixed(1)+' pts vs target.',
    'Codify the routing changes that drove the gain.','التسليم في الموعد '+otdTrend[11]+'٪.','وثّق تغييرات التوزيع التي حقّقت التحسن.');
}

function renderSupply(t){
  const oosArr=[...products].sort((a,b)=>b.oos-a.oos).slice(0,10);
  mk('scStock',{type:'bar',data:{labels:oosArr.map(p=>p.n),datasets:[{data:oosArr.map(p=>p.oos),backgroundColor:oosArr.map((p,i)=>i<3?t.red:t.gray),borderRadius:6}]},options:optBar(t,true)});
  if(oosArr.length)insight('scStock',oosArr[0].n+' has the highest OOS exposure at '+oosArr[0].oos+'%.',
    'Expedite replenishment on the top-3 SKUs before peak demand.',oosArr[0].n+' الأعلى في النفاد بـ'+oosArr[0].oos+'٪.','عجّل التموين لأعلى 3 أصناف.');
  const nd=[...nodes].sort((a,b)=>b.v-a.v);
  mk('scNode',{type:'bar',data:{labels:nd.map(n=>n.n),datasets:[{data:nd.map(n=>n.v),backgroundColor:nd.map(n=>/MAKE/.test(n.n)?t.cyan:t.blue),borderRadius:6}]},options:optBar(t,true)});
  if(nd.length)insight('scNode',nd[0].n+' is the largest inventory node.',
    'Rebalance stock toward demand-heavy MOVE hubs to cut OOS.',nd[0].n+' أكبر موقع مخزون.','أعد توزيع المخزون نحو مراكز التوزيع عالية الطلب.');
  mk('scOtif',{type:'line',data:{labels:M,datasets:[
    {label:'OTIF',data:otifTrend,borderColor:t.green,backgroundColor:ctxG('scOtif',t.green),fill:true,tension:.4,borderWidth:3,pointRadius:0},
    {label:LANG==='en'?'Target 95%':'المستهدف 95٪',data:M.map(()=>95),borderColor:t.red,borderDash:[5,5],borderWidth:1.5,pointRadius:0}
  ]},options:Object.assign(optLine(t),{scales:{x:{grid:{display:false},border:{display:false},ticks:{color:t.muted}},y:{min:84,max:100,grid:{color:t.line},border:{display:false},ticks:{color:t.muted}}}})});
  const below=otifTrend.filter(v=>v<95).length;
  insight('scOtif','OTIF missed the 95% target in '+below+' of 12 months.',
    'Investigate early-year shortfalls: supplier vs transport.','أخفق التسليم الكامل في '+below+' من 12 شهراً.','حلّل إخفاقات بداية العام.');
  buildStockout();
}

function renderRevenue(t){
  mk('finBars',{type:'bar',data:{labels:M,datasets:[
    {type:'bar',label:LANG==='en'?'Revenue ($M)':'الإيراد',data:revTrend,backgroundColor:t.gray,borderRadius:5,order:2},
    {type:'line',label:LANG==='en'?'Net margin %':'هامش صافي %',data:netMargin,borderColor:t.gold,backgroundColor:'transparent',borderWidth:3,tension:.4,pointRadius:0,yAxisID:'y2',order:1}
  ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:legend(t),tooltip:tt(t)},
    scales:{x:{grid:{display:false},border:{display:false},ticks:{color:t.muted,font:{size:10}}},
      y:{grid:{color:t.line},border:{display:false},ticks:{color:t.muted}},
      y2:{position:'right',min:0,max:40,grid:{display:false},border:{display:false},ticks:{color:t.gold,callback:v=>v+'%'}}},animation:{duration:700}}});
  insight('finBars','Net margin holds near '+(netMargin[11]||0).toFixed(0)+'% as revenue scales.',
    'Reinvest in automation that protects margin.','هامش صافي الربح ثابت قرب '+(netMargin[11]||0).toFixed(0)+'٪.','استثمر في الأتمتة التي تحمي الهامش.');
  const byP=[...products].sort((a,b)=>b.np-a.np);
  const top3=byP.slice(0,3).reduce((s,p)=>s+p.np,0),tot=byP.reduce((s,p)=>s+p.np,0)||1;
  mk('finProfit',{type:'bar',data:{labels:byP.map(p=>p.n),datasets:[{data:byP.map(p=>p.np),backgroundColor:byP.map((p,i)=>i<3?t.cyan:t.gray),borderRadius:6}]},options:optBar(t,true)});
  if(byP.length)insight('finProfit','Top 3 products generate '+(top3/tot*100).toFixed(0)+'% of net profit — '+byP[0].n+' leads at $'+byP[0].np+'M.',
    'Protect availability of these profit drivers.','أعلى 3 منتجات تحقق '+(top3/tot*100).toFixed(0)+'٪ من صافي الربح.','احمِ توافر هذه المنتجات.');
  mk('finMargin',{type:'line',data:{labels:M,datasets:[
    {label:LANG==='en'?'Gross %':'إجمالي %',data:grossMargin,borderColor:t.cyan,backgroundColor:'transparent',tension:.4,borderWidth:3,pointRadius:0},
    {label:LANG==='en'?'Net %':'صافي %',data:netMargin,borderColor:t.gold,backgroundColor:'transparent',tension:.4,borderWidth:3,pointRadius:0}
  ]},options:Object.assign(optLine(t),{scales:{x:{grid:{display:false},border:{display:false},ticks:{color:t.muted}},y:{min:0,max:70,grid:{color:t.line},border:{display:false},ticks:{color:t.muted,callback:v=>v+'%'}}}})});
  insight('finMargin','Gross '+(grossMargin[11]||0)+'% vs net '+(netMargin[11]||0).toFixed(0)+'% — overhead is the gap.',
    'Target opex efficiency to convert gross into net.','الإجمالي '+(grossMargin[11]||0)+'٪ والصافي '+(netMargin[11]||0).toFixed(0)+'٪.','استهدف كفاءة المصروفات.');
  const fl=[['Visits','زيارات',ecom.visits],['Views','مشاهدات',ecom.views],['Add to cart','إضافة للسلة',ecom.cart],['Checkout','إتمام',ecom.checkout],['Purchase','شراء',ecom.purchase]];
  mk('finFunnel',{type:'bar',data:{labels:fl.map(x=>LANG==='en'?x[0]:x[1]),datasets:[{data:fl.map(x=>x[2]),backgroundColor:fl.map((x,i)=>i===4?t.green:(i===2?t.red:t.gray)),borderRadius:6}]},options:optBar(t,true)});
  insight('finFunnel',ecom.abandon+'% of carts never convert — the biggest e-commerce lever.',
    'A 10-pt checkout recovery ≈ $'+(ecom.gmv*0.10/1e6).toFixed(0)+'M GMV.',ecom.abandon+'٪ من السلات لا تكتمل.','تحسين الإتمام 10 نقاط ≈ '+(ecom.gmv*0.10/1e6).toFixed(0)+' مليون $.');
}

function renderProducts(t){
  const sh=[...products].sort((a,b)=>b.share-a.share).slice(0,10);
  const top5=[...products].sort((a,b)=>b.share-a.share).slice(0,5).reduce((s,p)=>s+p.share,0);
  mk('prodShare',{type:'bar',data:{labels:sh.map(p=>p.n),datasets:[{data:sh.map(p=>p.share),backgroundColor:sh.map((p,i)=>i<5?t.cyan:t.gray),borderRadius:6}]},options:optBar(t,true)});
  if(sh.length)insight('prodShare','Top 5 products command '+top5.toFixed(0)+'% of revenue — a Pareto led by '+sh[0].n+'.',
    'Focus forecasting and availability on these SKUs first.','أعلى 5 منتجات تستحوذ على '+top5.toFixed(0)+'٪ من الإيراد.','ركّز التنبؤ والتوافر على هذه الأصناف.');
  const byU=[...products].sort((a,b)=>b.units-a.units).slice(0,10);
  mk('prodTop',{type:'bar',data:{labels:byU.map(p=>p.n),datasets:[{data:byU.map(p=>Math.round(p.units/1e6)),backgroundColor:byU.map((p,i)=>i===0?t.red:t.gray),borderRadius:6}]},options:optBar(t,true)});
  if(byU.length)insight('prodTop',byU[0].n+' is the volume leader at '+(byU[0].units/1e9).toFixed(2)+'B units.',
    'Treat it as a service-level-1 SKU — zero stockout tolerance.',byU[0].n+' متصدر الحجم بـ'+(byU[0].units/1e9).toFixed(2)+' مليار وحدة.','تعامل معه كأولوية قصوى.');
  buildProducts();
}

function renderWorkforce(t){
  const hd=[...depts].sort((a,b)=>b.v-a.v);
  const supply=hd.filter(d=>/MAKE|MOVE/.test(d.n)).reduce((s,d)=>s+d.v,0),tot=hd.reduce((s,d)=>s+d.v,0)||1;
  mk('wkHead',{type:'bar',data:{labels:hd.map(d=>d.n),datasets:[{data:hd.map(d=>d.v),backgroundColor:hd.map(d=>/MAKE|MOVE/.test(d.n)?t.cyan:t.gray),borderRadius:6}]},options:optBar(t,true)});
  insight('wkHead','Supply functions (MAKE+MOVE) are '+(supply/tot*100).toFixed(0)+'% of headcount.',
    'Start workforce planning with these two functions.','وظائف الإمداد '+(supply/tot*100).toFixed(0)+'٪ من العدد.','ابدأ التخطيط من هاتين الوظيفتين.');
  mk('wkAttr',{type:'doughnut',data:{labels:[LANG==='en'?'Voluntary':'طوعي',LANG==='en'?'Involuntary':'غير طوعي'],datasets:[{data:[64,36],backgroundColor:[t.red,t.gray],borderWidth:0}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'64%',plugins:{legend:legend(t),tooltip:tt(t),datalabels:{display:true,color:'#fff',font:{weight:'800',size:13},formatter:(v,c)=>{const a=c.chart.data.datasets[0].data,s=a.reduce((x,y)=>x+y,0);return Math.round(v/s*100)+'%';}}}}});
  insight('wkAttr','64% of exits are voluntary — the lever is retention.',
    'Run stay-interviews in the highest-turnover roles.','64٪ من المغادرة طوعية.','أجرِ مقابلات احتفاظ.');
  mk('wkTurn',{type:'line',data:{labels:M,datasets:[
    {label:LANG==='en'?'Turnover %':'الدوران %',data:turnTrend,borderColor:t.cyan,backgroundColor:ctxG('wkTurn',t.cyan),fill:true,tension:.4,borderWidth:3,pointRadius:0},
    {label:LANG==='en'?'Target 2.5%':'المستهدف',data:M.map(()=>2.5),borderColor:t.red,borderDash:[5,5],borderWidth:1.5,pointRadius:0}
  ]},options:Object.assign(optLine(t),{scales:{x:{grid:{display:false},border:{display:false},ticks:{color:t.muted}},y:{min:0,max:6,grid:{color:t.line},border:{display:false},ticks:{color:t.muted,callback:v=>v+'%'}}}})});
  insight('wkTurn','Turnover ended at '+(turnTrend[11]||0)+'% monthly.',
    'Document what worked and scale it.','الدوران '+(turnTrend[11]||0)+'٪ شهرياً.','وثّق ما نجح وعمّمه.');
  const pp=[...pipeline];const off=pp.find(s=>/Offer/.test(s.n))||{v:1},hire=pp.find(s=>/Hired/.test(s.n))||{v:0};
  mk('wkPipe',{type:'bar',data:{labels:pp.map(s=>s.n),datasets:[{data:pp.map(s=>s.v),backgroundColor:pp.map((s,i)=>i===pp.length-1?t.green:t.gray),borderRadius:6}]},options:optBar(t,true)});
  insight('wkPipe','Offer-to-hire conversion is '+(hire.v/off.v*100).toFixed(0)+'%.',
    'Widen sourcing for the hardest-to-fill roles.','تحويل العرض إلى تعيين '+(hire.v/off.v*100).toFixed(0)+'٪.','وسّع المصادر للوظائف الأصعب.');
}

function renderGapHeatmap(t){
  const el=document.getElementById('gapHeat');if(!el)return;
  const areas=DBhr.areas,mat=DBhr.gapMatrix,positions=DBhr.positions;
  const maxAbs=Math.max.apply(null,mat.map(c=>Math.abs(c.gap)).concat([1]));
  el.style.gridTemplateColumns='minmax(150px,1.4fr) repeat('+areas.length+',1fr)';
  let h='<div class="hhead"></div>'+areas.map(a=>'<div class="hhead">'+a+'</div>').join('');
  positions.forEach(p=>{
    h+='<div class="hrow-label">'+p.n+'</div>';
    areas.forEach(a=>{
      const c=mat.find(x=>x.pos===p.n&&x.area===a)||{gap:0,plan:0,actual:0,pipeline:0,notice:0};
      const g=c.gap;let col;
      if(g<0){const k=Math.min(1,Math.abs(g)/maxAbs);col='rgba(238,28,46,'+(0.16+0.66*k).toFixed(2)+')';}
      else if(g>0){const k2=Math.min(1,g/maxAbs);col='rgba(29,185,84,'+(0.14+0.55*k2).toFixed(2)+')';}
      else col='var(--bar-gray)';
      h+='<div class="hc" style="background:'+col+'" title="'+p.n+' · '+a+' | plan '+c.plan+', actual '+c.actual+'">'+(g>0?'+':'')+g+'</div>';
    });
  });
  el.innerHTML=h;
}
function renderWorkforceHR(t){
  const en=LANG==='en';
  const u=DBhr.gapByPos.slice().sort((a,b)=>a.gap-b.gap).slice(0,8);
  if(u.length){mk('wkUnder',{type:'bar',data:{labels:u.map(x=>x.n),datasets:[{data:u.map(x=>x.gap),backgroundColor:u.map((x,i)=>i<3?t.red:t.gray),borderRadius:6}]},options:optBar(t,true)});
    insight('wkUnder',u[0].n+' is the most understaffed at '+u[0].gap+' vs plan.','Front-load hiring and retention here.',
      u[0].n+' أكثر الوظائف نقصاً بفجوة '+u[0].gap+'.','ركّز التوظيف والاحتفاظ هنا.');}
  const tr=DBhr.turnoverByPos.slice(0,8);
  mk('wkTurnRole',{type:'bar',data:{labels:tr.map(x=>x.n),datasets:[{data:tr.map(x=>x.rate),backgroundColor:tr.map((x,i)=>i<3?t.red:t.gray),borderRadius:6}]},options:optBar(t,true)});
  insight('wkTurnRole',tr[0].n+' has the highest turnover at '+tr[0].rate+'%.','Target retention on these roles first.',
    tr[0].n+' الأعلى دوراناً بـ'+tr[0].rate+'٪.','ركّز الاحتفاظ على هذه الوظائف.');
  mk('wkMove',{type:'line',data:{labels:DBhr.movement.months,datasets:[
    {label:en?'Joiners':'منضمّون',data:DBhr.movement.joiners,borderColor:t.green,backgroundColor:ctxG('wkMove',t.green),fill:true,tension:.4,borderWidth:3,pointRadius:0},
    {label:en?'Leavers':'مغادرون',data:DBhr.movement.leavers,borderColor:t.red,backgroundColor:'transparent',tension:.4,borderWidth:3,pointRadius:0}
  ]},options:optLine(t)});
  const nj=DBhr.movement.joiners.reduce((a,b)=>a+b,0),nl=DBhr.movement.leavers.reduce((a,b)=>a+b,0);
  insight('wkMove','Net headcount '+(nj-nl>=0?'grew':'shrank')+' by '+Math.abs(nj-nl)+' ('+nj+' in, '+nl+' out).',
    'Land the net inflow in gap-heavy functions.','صافي العمالة '+(nj-nl>=0?'زاد':'نقص')+' '+Math.abs(nj-nl)+'.','وجّه الزيادة للوظائف ذات الفجوة.');
  const rr=DBhr.resignReasons.slice().sort((a,b)=>b.v-a.v);
  mk('wkReason',{type:'bar',data:{labels:rr.map(x=>x.n),datasets:[{data:rr.map(x=>x.v),backgroundColor:rr.map((x,i)=>i===0?t.cyan:t.gray),borderRadius:6}]},options:optBar(t,true)});
  insight('wkReason',rr[0].v+'% leave for '+rr[0].n.toLowerCase()+'.','Benchmark pay for high-turnover roles first.',
    rr[0].v+'٪ يغادرون بسبب «'+rr[0].n+'».','قارن الأجور للوظائف الأعلى دوراناً.');
  const rcs=DBhr.recruiters;
  mk('wkRec',{type:'bar',data:{labels:rcs.map(x=>x.n),datasets:[
    {label:en?'Achieved':'محقق',data:rcs.map(x=>x.achieved),backgroundColor:rcs.map(x=>x.achieved>=x.target?t.green:t.red),borderRadius:5},
    {label:en?'Target':'مستهدف',data:rcs.map(x=>x.target),backgroundColor:t.gray,borderRadius:5}
  ]},options:Object.assign(optBar(t,false),{plugins:{legend:legend(t),tooltip:tt(t),datalabels:{display:false}}})});
  const beat=rcs.filter(x=>x.achieved>=x.target).length;
  insight('wkRec',beat+' of '+rcs.length+' recruiters hit target.','Rebalance requisitions for laggards.',
    beat+' من '+rcs.length+' حققوا الهدف.','أعد توزيع الطلبات للمتأخرين.');
  const tf=DBhr.timeToFill.slice(0,8);
  mk('wkTtf',{type:'bar',data:{labels:tf.map(x=>x.n),datasets:[{data:tf.map(x=>x.days),backgroundColor:tf.map((x,i)=>i===0?t.red:t.gray),borderRadius:6}]},options:optBar(t,true)});
  insight('wkTtf',tf[0].n+' takes the longest to fill at '+tf[0].days+' days.','Keep a warm pipeline for slow roles.',
    tf[0].n+' الأطول شغلاً بـ'+tf[0].days+' يوماً.','احتفظ بمسار جاهز للوظائف البطيئة.');
  const na=DBhr.noticePipelineByArea;
  mk('wkNotice',{type:'bar',data:{labels:na.map(x=>x.area),datasets:[
    {label:en?'In pipeline':'في المسار',data:na.map(x=>x.pipeline),backgroundColor:t.cyan,borderRadius:5,stack:'s'},
    {label:en?'In notice':'في الإشعار',data:na.map(x=>x.notice),backgroundColor:t.red,borderRadius:5,stack:'s'}
  ]},options:Object.assign(optBar(t,false),{plugins:{legend:legend(t),tooltip:tt(t),datalabels:{display:false}},scales:{x:{stacked:true,grid:{display:false},border:{display:false},ticks:{color:t.muted,font:{size:9}}},y:{stacked:true,grid:{color:t.line},border:{display:false},ticks:{color:t.muted}}}})});
  if(na.length){const ar=na.slice().sort((a,b)=>(b.notice-b.pipeline)-(a.notice-a.pipeline))[0];
    insight('wkNotice',ar.area+' is most exposed — '+ar.notice+' in notice vs '+ar.pipeline+' in pipeline.','Accelerate sourcing where notices outpace pipeline.',
      ar.area+' الأكثر تعرضاً.','سرّع التوظيف حيث تتجاوز الإشعارات المسار.');}
  renderGapHeatmap(t);
}

/* ============================================================================
   LOGIN BACKGROUND ANIMATION (floating products) — guarded for headless test
   ========================================================================== */
if(typeof document!=='undefined' && document.getElementById('loginBg')){(function(){
  const bg=document.getElementById('loginBg');
  const imgs=Object.values(PIMG);
  const rnd=(a,b)=>a+Math.random()*(b-a);
  const L=[0,1,2].map(i=>{const l=document.createElement('div');l.className='layer';l.dataset.depth=[0.25,0.55,0.95][i];bg.appendChild(l);return l;});
  [['#0a3f86','-6%','8%','360px'],['#7a0f18','68%','58%','320px'],['#00557a','42%','-10%','280px']].forEach(o=>{
    const d=document.createElement('div');d.className='orb';d.style.cssText=`background:${o[0]};left:${o[1]};top:${o[2]};width:${o[3]};height:${o[3]}`;L[0].appendChild(d);});
  const order=[...imgs].sort(()=>Math.random()-0.5);
  for(let i=0;i<18;i++){const srcI=order[i%order.length],layer=L[1+(i%2)],h=rnd(74,128);
    if(!srcI)continue;const im=document.createElement('img');im.className='float-prod';im.src=srcI;
    im.style.cssText=`left:${rnd(1,93)}%;height:${h}px;--rot:${rnd(-26,26)}deg;animation-duration:${rnd(15,27)}s;animation-delay:${-rnd(0,27)}s;opacity:${rnd(.85,1)}`;
    layer.appendChild(im);}
  for(let i=0;i<16;i++){const b=document.createElement('div');b.className='bubble';const s=rnd(6,24);
    b.style.cssText=`left:${rnd(0,100)}%;width:${s}px;height:${s}px;animation-duration:${rnd(8,16)}s;animation-delay:${-rnd(0,10)}s`;L[2].appendChild(b);}
  const login=document.getElementById('login'),card=document.querySelector('.login-card');let raf=null;
  if(login)login.addEventListener('mousemove',e=>{const cx=e.clientX/innerWidth-0.5,cy=e.clientY/innerHeight-0.5;
    if(raf)cancelAnimationFrame(raf);
    raf=requestAnimationFrame(()=>{L.forEach(l=>{const d=parseFloat(l.dataset.depth);l.style.transform=`translate(${cx*d*48}px,${cy*d*48}px)`;});
      if(card)card.style.transform=`rotateY(${cx*9}deg) rotateX(${-cy*7}deg)`;});});
  if(login)login.addEventListener('mouseleave',()=>{L.forEach(l=>l.style.transform='translate(0,0)');if(card)card.style.transform='';});
})();}

/* ============================================================================
   INIT
   ========================================================================== */
safe(()=>{const st=localStorage.getItem('pulse-theme');if(st){document.documentElement.setAttribute('data-theme',st);
  document.getElementById('themeBtn').textContent=st==='dark'?'🌙':'☀️';const lt=document.getElementById('loginTheme');if(lt)lt.firstChild.textContent=st==='dark'?'🌙 ':'☀️ ';}});
safe(()=>{const sl=localStorage.getItem('pulse-lang');if(sl)setLang(sl);});
