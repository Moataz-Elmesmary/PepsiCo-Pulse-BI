// Export the generated dataset to CSV files (open directly in Excel).
const fs=require('fs');
const G=require('./gen');
const dir='data_export';
if(!fs.existsSync(dir))fs.mkdirSync(dir);
const q=v=>{const s=String(v);return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
const write=(name,rows)=>{fs.writeFileSync(dir+'/'+name,rows.map(r=>r.map(q).join(',')).join('\r\n'));
  console.log('  '+name+'  ('+(rows.length-1)+' rows)');};

const {YEARS,PRODUCTS,REGIONS,CHANNELS,facts,INV,WORK,LOCATIONS,GAP}=G;
const F=facts;

// 1) Sales monthly fact (the grain the dashboard aggregates)
const sales=[['Year','Month','Product','Brand','Category','Region','Channel',
  'Units','UnitPrice','Revenue','COGS','GrossProfit','NetProfit']];
for(let i=0;i<F.fU.length;i++){
  const p=PRODUCTS[F.fP[i]], price=+(p[3]*CHANNELS[F.fC[i]][2]).toFixed(3),
    cost=+(p[4]*(1+0.03*F.fY[i])).toFixed(3), u=F.fU[i],
    rev=+(u*price).toFixed(2), cogs=+(u*cost).toFixed(2), gp=+(rev-cogs).toFixed(2), np=+(gp*0.43).toFixed(2);
  sales.push([YEARS[F.fY[i]],F.fM[i]+1,p[0],p[1],p[2],REGIONS[F.fR[i]][0],CHANNELS[F.fC[i]][0],
    u,price,rev,cogs,gp,np]);
}
write('Sales_Monthly.csv',sales);

// 2) Dim_Products
write('Dim_Products.csv',[['Product','Brand','Category','UnitPrice','UnitCost'],
  ...PRODUCTS.map(p=>[p[0],p[1],p[2],p[3],p[4]])]);

// 3) Dim_Locations
write('Dim_Locations.csv',[['Location','Node','Region'],
  ...LOCATIONS.map(l=>[l[0],l[1],l[2]])]);

// 4) Inventory snapshot
write('Inventory_Snapshot.csv',[['Product','Category','Location','Node','Region',
  'OnHand','ReorderPoint','InTransit','AvgDailyOut','DaysCover','OOS_Percent','Status'],
  ...INV.map(r=>[PRODUCTS[r.p][0],PRODUCTS[r.p][2],r.loc,r.node,r.region,
    r.onHand,r.reorder,r.inTransit,r.avgDailyOut,r.daysCover,r.oos,r.status])]);

// 5) Workforce monthly
write('Workforce_Monthly.csv',[['Year','Month','Department','Headcount','PlanHeadcount',
  'Hires','Resignations_Voluntary','Resignations_Involuntary'],
  ...WORK.map(w=>[YEARS[w.y],w.m+1,w.dept,w.headcount,w.plan,w.hires,w.resignV,w.resignI])]);

// 6) HC gap (position x area)
write('HC_Gap_PositionArea.csv',[['Position','Function','Area','PlanHeadcount','ActualHeadcount',
  'Gap','InPipeline','InNotice'],
  ...GAP.map(g=>[g.pos,g.cat,g.area,g.plan,g.actual,g.gap,g.pipeline,g.notice])]);

console.log('CSV export complete -> '+dir+'/');
