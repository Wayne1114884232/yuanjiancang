import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,applyAction,validateBackup} from '../domain.mjs';
import {projectAnalysis} from '../public/logic.js';
import {labelTextChoices,selectedLabelValue,projectPickPlan} from '../public/workflows.js';
const part={sku:'STM32G431CBT6',name:'STM32G431CBT6',category:'IC',mount:'贴片',package:'LQFP-48'};
function receive(){const s=emptyState();return applyAction(s,{type:'label.receive',part,qty:100,locationId:s.locations[0].id,lotCode:'LOT-A',time:'2026-01-01T09:00:00+08:00'}).state;}
test('receipt date is separate from immutable system registration time and survives backup',()=>{
 const s=receive(),o=s.orders[0],e=s.events[0];assert.equal(o.time,'2026-01-01T01:00:00.000Z');assert.ok(Date.parse(o.recordedAt)>Date.parse(o.time));assert.equal(o.recordedAt,e.recordedAt);assert.equal(e.time,o.time);assert.equal(validateBackup(s).orders[0].recordedAt,o.recordedAt);
 const old=structuredClone(s);delete old.orders[0].recordedAt;delete old.events[0].recordedAt;assert.equal(validateBackup(old).orders[0].recordedAt,undefined);
 const damaged=structuredClone(s);damaged.orders[0].recordedAt='invalid';assert.throws(()=>validateBackup(damaged),/登记时间/);
});
test('invalid, unzoned and future receipt dates reject the entire receipt',()=>{
 const s=emptyState(),before=structuredClone(s);
 for(const time of ['tomorrow','2026-01-01T09:00','2099-01-01T00:00:00Z','1960-01-01T00:00:00Z'])assert.throws(()=>applyAction(s,{type:'label.receive',part,qty:100,locationId:s.locations[0].id,time}),/时间/);
 assert.deepEqual(s,before);
});
test('manual, initial stock, BOM and procurement receipt dates all retain system time',()=>{
 let s=receive();const time='2026-01-02T00:00:00Z',st=s.stocks[0];
 for(const a of [{type:'stock.post',kind:'入库',stockId:st.id,qty:1},{type:'bom.post',kind:'入库',boards:1,rows:[{stockId:st.id,perBoard:2}]},{type:'part.save',part:{...part,sku:'NEW'},locationId:st.locationId,qty:1}]){s=applyAction(s,{...a,time}).state;assert.equal(s.orders.at(-1).time,'2026-01-02T00:00:00.000Z');assert.ok(s.orders.at(-1).recordedAt);}
 s=applyAction(s,{type:'procurement.save',item:{partId:st.partId,orderedQty:10,requiredQty:10}}).state;
 s=applyAction(s,{type:'procurement.receive',itemId:s.procurementItems[0].id,qty:5,locationId:st.locationId,time}).state;assert.equal(s.orders.at(-1).time,'2026-01-02T00:00:00.000Z');validateBackup(s);
});
test('backdating does not change ledger order or undo dependency protection',()=>{
 let s=receive();s=applyAction(s,{type:'stock.post',kind:'出库',stockId:s.stocks[0].id,qty:10,time:'2025-01-01T00:00:00Z'}).state;
 assert.throws(()=>applyAction(s,{type:'order.undo',orderId:s.orders[0].id}),/后续/);assert.equal(s.stocks[0].qty,90);validateBackup(s);
 s=applyAction(s,{type:'order.undo',orderId:s.orders[1].id}).state;assert.equal(s.stocks[0].qty,100);validateBackup(s);
});
test('OCR selectable text preserves complete model suffixes, tokens and explicit quantities',()=>{
 const choices=labelTextChoices('MPN: STM32G431CBT6\nQTY: 1,000 pcs\nLOT:2026-A\nLQFP-48');assert.ok(choices.includes('STM32G431CBT6'));assert.ok(choices.includes('MPN: STM32G431CBT6'));assert.equal(selectedLabelValue('STM32G431CBT6/TR','sku'),'STM32G431CBT6/TR');assert.equal(selectedLabelValue('1,000 pcs','qty'),'1000');assert.equal(selectedLabelValue('±1%','tolerance'),'1');
 for(const v of ['2包','-1','1.5','QTY 100'])assert.throws(()=>selectedLabelValue(v,'qty'));
 assert.throws(()=>selectedLabelValue('LOT 100','tolerance'));assert.ok(labelTextChoices('A\n'.repeat(1000)).length<=100);
});
test('project picking splits quantities by location, and actual issue uses identical bins',()=>{
 let s=receive(),st=s.stocks[0];s=applyAction(s,{type:'stock.post',kind:'入库',partId:st.partId,locationId:st.locationId,bin:'A2',qty:50}).state;
 s=applyAction(s,{type:'project.save',project:{name:'Control',rows:[{partId:st.partId,perBoard:30}]}}).state;
 const p=s.projects[0],a=projectAnalysis(p,s,4),plan=projectPickPlan(s,a);assert.equal(plan.reduce((n,x)=>n+x.qty,0),120);
 const out=applyAction(s,{type:'project.issue',projectId:p.id,boards:4});assert.deepEqual(new Map(out.order.lines.map(x=>[x.stockId,-x.delta])),new Map(plan.map(x=>[x.stockId,x.qty])));assert.equal(s.stocks[0].qty,100);
});
test('shortage picking never consumes quantities reserved for another project',()=>{
 const s=receive(),pid=s.parts[0].id;s.reservations=[{partId:pid,projectId:'other',qty:60}];const a=projectAnalysis({id:'new',rows:[{partId:pid,perBoard:10,loss:0}]},s,6),plan=projectPickPlan(s,a);assert.equal(plan.reduce((n,x)=>n+x.qty,0),40);assert.equal(a.shortages[0].shortage,20);
});
