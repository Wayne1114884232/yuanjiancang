// Shared preview rules: no network calls and no stock changes.
export function labelTextChoices(text){
 const lines=String(text||'').slice(0,6000).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 return [...new Set(lines.flatMap(line=>[line,...line.split(/\s+|[，,;；:：=]/)]).filter(x=>x.length&&x.length<=160))].slice(0,100);
}
export function selectedLabelValue(text,field){
 const s=String(text||'').trim();if(!s)throw Error('请先选择或填写文字');
 if(['sku','package','manufacturer','lotCode','supplier','value'].includes(field))return s;
 if(field==='qty'){const m=s.match(/^(\d[\d,]*)\s*(?:pcs|个|颗|只)?$/i),n=Number(m?.[1].replace(/,/g,''));if(!m||!Number.isSafeInteger(n)||n<1||n>1e9)throw Error('数量须为明确的整数个数，请修改选中文字');return String(n);}
 if(field==='tolerance'){const m=s.match(/^(?:±)?\s*(\d+(?:\.\d+)?)\s*%?$/);if(!m||Number(m[1])>100)throw Error('精度应为百分数，例如 1%');return m[1];}
 throw Error('不支持填入此字段');
}
export function sortPickupStocks(state,stocks,preferred=''){
 const label=s=>`${state.locations.find(l=>l.id===s.locationId)?.name||''}/${s.bin||''}`;
 return stocks.slice().sort((a,b)=>(b.locationId===preferred)-(a.locationId===preferred)||label(a).localeCompare(label(b),'zh-CN',{numeric:true})||a.id.localeCompare(b.id));
}
export function projectPickPlan(state,analysis,preferred=''){
 const result=[];
 for(const line of analysis.lines){let left=Math.min(line.required,line.available);for(const st of sortPickupStocks(state,state.stocks.filter(s=>s.partId===line.partId&&s.qty>0),preferred)){const qty=Math.min(left,st.qty);if(qty)result.push({stockId:st.id,partId:st.partId,sku:line.part.sku,locationId:st.locationId,bin:st.bin,qty,stockQty:st.qty,reference:line.reference});left-=qty;if(!left)break;}}
 return sortPickupStocks(state,result,preferred);
}
export function batchPreview(state,rows){
 const balances=new Map(state.stocks.map(s=>[s.id,s.qty]));
 const totals=new Map(state.parts.map(p=>[p.id,state.stocks.filter(s=>s.partId===p.id).reduce((n,s)=>n+s.qty,0)]));
 const reserved=new Map(state.parts.map(p=>[p.id,(state.reservations||[]).filter(r=>r.partId===p.id).reduce((n,r)=>n+r.qty,0)]));
 return rows.map(row=>{const stock=state.stocks.find(s=>s.id===row.stockId),before=balances.get(row.stockId);let error='',after=before,delta=0;
  const valid=(n,min=0)=>Number.isSafeInteger(Number(n))&&Number(n)>=min&&Number(n)<=1e9&&n!==''&&n!==null&&n!==undefined;
  if(!stock)error='库位已不存在';
  else if(!['入库','出库','损耗','盘点'].includes(row.kind))error='不支持的记账类型';
  else if(!valid(row.qty,row.kind==='盘点'?0:1)||!valid(row.boards??1,1)||!valid(row.loss??0))error='数量必须是有效整数';
  else if(row.kind==='盘点'&&Number(row.snapshotQty)!==before)error='盘点基准变化，请重新盘点';
  else{const qty=Number(row.qty),base=row.kind==='出库'?qty*Number(row.boards??1):qty;delta=row.kind==='入库'?qty:row.kind==='盘点'?qty-before:-(base+(row.kind==='出库'?Number(row.loss??0):0));after=before+delta;
   if(!Number.isSafeInteger(after)||after<0||after>1e9)error='库存不足或数量超出范围';
   else if(delta===0)error='数量未变化，无需调整';
   else if(totals.get(stock.partId)+delta<reserved.get(stock.partId))error='扣减后会占用项目预留';
  }
  if(!error){balances.set(stock.id,after);totals.set(stock.partId,totals.get(stock.partId)+delta);}
  return {row,stock,before,after,error};
 });
}
export function quoteSelection(observations,partId,quantity){
 const groups=new Map();
 for(const o of observations){if(o.partId!==partId||!(o.price>0)||!(Number(o.quantityTier)>0))continue;
  const key=JSON.stringify([o.source,o.currency,o.kind]);const group=groups.get(key)||[];group.push(o);groups.set(key,group);}
 return [...groups.values()].map(group=>{
  const newest=Math.max(...group.map(o=>Date.parse(o.asOf)||0));
  return group.filter(o=>(Date.parse(o.asOf)||0)===newest&&Number(o.quantityTier)<=quantity).sort((a,b)=>Number(b.quantityTier)-Number(a.quantityTier))[0];
 }).filter(Boolean);
}
