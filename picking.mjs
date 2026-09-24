import {createHash,randomUUID} from 'node:crypto';
import {projectAnalysis} from './public/logic.js';
import {projectPickPlan} from './public/workflows.js';
const check=(ok,msg)=>{if(!ok)throw Error(msg);};
export function pickFingerprint(s,p,boards,rate,locationId){
 const ids=new Set(p.rows.map(x=>x.partId));
 const data={rows:p.rows,boards,rate,locationId,stocks:s.stocks.filter(x=>ids.has(x.partId)),lots:s.lots.filter(x=>s.stocks.some(st=>st.id===x.stockId&&ids.has(st.partId))),reserved:s.reservations.filter(x=>ids.has(x.partId)),parts:s.parts.filter(x=>ids.has(x.id))};
 return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}
export function savePicking(s,a){
 const p=s.projects.find(x=>x.id===a.projectId);check(p,'项目不存在');
 check(Number.isSafeInteger(Number(a.boards))&&Number(a.boards)>0&&Number(a.boards)<=1e9,'板数无效');
 const boards=Number(a.boards),rate=Number(a.lossRate||0),locationId=a.locationId||'';check(Number.isFinite(rate)&&rate>=0&&rate<=100,'损耗率无效');
 const fingerprint=pickFingerprint(s,p,boards,rate,locationId);
 if(a.sessionId){
  const plan=p.pickSession;check(plan?.id===a.sessionId&&plan.status==='picking','拣料单已失效或已出库');check(plan.fingerprint===fingerprint,'库存或预留已变化，请重新生成拣料单');
  check(Array.isArray(a.rows)&&a.rows.length===plan.rows.length,'拣料明细不完整');
  for(const row of plan.rows){const input=a.rows.find(x=>x.stockId===row.stockId);check(input&&typeof input.checked==='boolean','拣料记录无效');const lotId=String(input.lotId||'');if(lotId)check(s.lots.some(l=>l.id===lotId&&l.stockId===row.stockId&&l.qty>=row.qty),'指定批次数量不足');row.checked=input.checked;row.lotId=lotId;}
  plan.updatedAt=new Date().toISOString();return plan;
 }
 const analysis=projectAnalysis(p,s,boards,rate);check(analysis.complete,'当前未齐料，请补齐后生成可领料清单');
 p.pickSession={id:randomUUID(),boards,lossRate:rate,locationId,fingerprint,status:'picking',rows:projectPickPlan(s,analysis,locationId).map(x=>({...x,checked:false,lotId:''})),updatedAt:new Date().toISOString()};return p.pickSession;
}
export function checkedPicking(s,p,a){
 const plan=p.pickSession;check(plan?.id===a.pickSessionId&&plan.status==='picking','拣料单已失效或已出库');
 check(plan.boards===Number(a.boards)&&plan.lossRate===Number(a.lossRate??p.lossRate??0),'板数或损耗率已变化，请重新拣料');
 check(plan.fingerprint===pickFingerprint(s,p,plan.boards,plan.lossRate,plan.locationId),'库存或预留已变化，请重新生成拣料单');
 check(plan.rows.every(x=>x.checked),'请完成全部拣料核对后出库');return plan;
}
