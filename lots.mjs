import {randomUUID} from 'node:crypto';
const check=(ok,message)=>{if(!ok)throw Error(message);};
const qty=n=>Number.isSafeInteger(n)&&n>=0&&n<=1e9;
const text=x=>String(x??'').trim().slice(0,300);

// Old balances have no reliable per-lot allocation. Preserve them explicitly as
// an opening balance, never reconstruct fictitious historical receipt quantities.
export function migrateLots(s){
  if(s.lots!==undefined){check(Array.isArray(s.lots)&&Array.isArray(s.lotMovements),'批次账本格式无效');return;}
  check(!(s.orders||[]).some(o=>o.lotTracked),'备份缺少批次账本，不能降级为历史库存');
  s.lots=s.stocks.filter(x=>x.qty>0).map(st=>({id:st.id,stockId:st.id,rootLotId:st.id,lotCode:'历史库存（批次未追溯）',supplier:'',receivedAt:s.updatedAt||s.createdAt,recordedAt:s.updatedAt||s.createdAt,unitPrice:null,purchaseDate:'',qty:st.qty,openingQty:st.qty,legacy:true}));s.lotMovements=[];

}
function newLot(s,stockId,order,metadata={}){
  const id=randomUUID(),lot={id,stockId,rootLotId:metadata.rootLotId||id,lotCode:text(metadata.lotCode||order.lotCode)||'未标批次',supplier:text(metadata.supplier??order.supplier),receivedAt:metadata.receivedAt||order.time,recordedAt:order.recordedAt,unitPrice:metadata.unitPrice??order.unitPrice??null,purchaseDate:metadata.purchaseDate??order.purchaseDate??'',qty:0,openingQty:0,receiptOrderId:metadata.receiptOrderId||order.id};
  s.lots.push(lot);return lot;
}
function move(s,order,lot,delta){check(qty(lot.qty+delta),'批次剩余数量不足或超出范围');lot.qty+=delta;s.lotMovements.push({id:randomUUID(),lotId:lot.id,stockId:lot.stockId,orderId:order.id,delta,time:order.recordedAt});}
function take(s,order,line){
  const requested=String(line.lotCode||'').trim();
  const list=s.lots.filter(x=>x.stockId===line.stockId&&x.qty>0&&(!line.lotId||x.id===line.lotId)&&(!requested||x.lotCode===requested)).sort((a,b)=>a.receivedAt.localeCompare(b.receivedAt)||a.recordedAt.localeCompare(b.recordedAt)||a.id.localeCompare(b.id));
  let left=-line.delta;check(list.reduce((n,l)=>n+l.qty,0)>=left,'所选批次剩余数量不足，请重新选择批次');const taken=[];
  for(const lot of list){const n=Math.min(left,lot.qty);if(n){move(s,order,lot,-n);taken.push({lot,qty:n});left-=n;}if(!left)break;}return taken;
}
export function recordLots(s,order,{reverseOrderId='',receivedLots=[]}={}){
  migrateLots(s);
  if(reverseOrderId){
    const old=s.orders.find(o=>o.id===reverseOrderId);
    if(old?.lotTracked){
      for(const m of s.lotMovements.filter(m=>m.orderId===old.id)){const lot=s.lots.find(l=>l.id===m.lotId);check(lot,'原批次已不存在');move(s,order,lot,-m.delta);}
      order.lotTracked=true;return;
    }
  }
  const taken=[];
  for(const line of order.lines.filter(l=>l.delta<0))taken.push(...take(s,order,line));
  for(const line of order.lines.filter(l=>l.delta>0)){
    if(order.type==='调拨'){
      const target=s.stocks.find(x=>x.id===line.stockId);let left=line.delta;
      for(const entry of taken.filter(x=>s.stocks.find(st=>st.id===x.lot.stockId)?.partId===target.partId)){const n=Math.min(left,entry.qty);if(n){move(s,order,newLot(s,line.stockId,order,entry.lot),n);left-=n;entry.qty-=n;}}
      check(left===0,'调拨批次数量不平衡');
    }else if(receivedLots.length){
      check(order.lines.length===1&&receivedLots.reduce((n,x)=>n+x.qty,0)===line.delta,'接收批次数量不平衡');
      for(const entry of receivedLots)move(s,order,newLot(s,line.stockId,order,entry),entry.qty);
    }else move(s,order,newLot(s,line.stockId,order,line),line.delta);
  }
  order.lotTracked=true;
}
export function validateLots(s){
  migrateLots(s);const ids=new Set(),balances=new Map();
  check(s.lots.length<=200000&&s.lotMovements.length<=1000000,'批次账本过大');
  for(const lot of s.lots){check(typeof lot.id==='string'&&!ids.has(lot.id)&&s.stocks.some(st=>st.id===lot.stockId),'批次编号或库位无效');ids.add(lot.id);check(qty(lot.qty)&&qty(lot.openingQty),'批次数量无效');check(typeof lot.lotCode==='string'&&lot.lotCode.length<=300&&Number.isFinite(Date.parse(lot.receivedAt))&&Number.isFinite(Date.parse(lot.recordedAt)),'批次资料无效');check(lot.unitPrice===null||Number.isFinite(lot.unitPrice)&&lot.unitPrice>=0&&lot.unitPrice<=1e9,'批次单价无效');balances.set(lot.id,lot.openingQty);}
  const movements=new Set(),byOrder=new Map();
  for(const m of s.lotMovements){const lot=s.lots.find(l=>l.id===m.lotId);check(typeof m.id==='string'&&!movements.has(m.id)&&lot?.stockId===m.stockId&&s.orders.some(o=>o.id===m.orderId&&o.lotTracked),'批次流水关联无效');movements.add(m.id);check(Number.isSafeInteger(m.delta)&&m.delta!==0,'批次流水数量无效');const n=balances.get(m.lotId)+m.delta;check(qty(n),'批次流水结余无效');balances.set(m.lotId,n);const key=JSON.stringify([m.orderId,m.stockId]);byOrder.set(key,(byOrder.get(key)||0)+m.delta);}
  for(const lot of s.lots)check(balances.get(lot.id)===lot.qty,'批次剩余数量与批次流水不一致');
  for(const st of s.stocks)check(s.lots.filter(l=>l.stockId===st.id).reduce((n,l)=>n+l.qty,0)===st.qty,'批次剩余数量与库存不一致');
  for(const o of s.orders.filter(o=>o.lotTracked)){const expected=new Map();for(const l of o.lines)expected.set(l.stockId,(expected.get(l.stockId)||0)+l.delta);for(const [st,n] of expected){const k=JSON.stringify([o.id,st]);check((byOrder.get(k)||0)===n,'批次分配与单据不一致');byOrder.delete(k);}}
  check([...byOrder.values()].every(x=>x===0),'批次流水包含多余分配');
}
