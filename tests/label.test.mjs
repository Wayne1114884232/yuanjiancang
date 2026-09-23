import test from 'node:test';
import assert from 'node:assert/strict';
import {extractLabel,labelSuggestedSku,labelPartConflicts} from '../public/logic.js';
import {emptyState,applyAction,validateBackup} from '../domain.mjs';
import {TeamEngine,emptyDocument} from '../team-engine.mjs';
import {randomUUID} from 'node:crypto';

test('generic Taobao resistor label parses value precision quantity package brand and lot without an MPN',()=>{
 const p=extractLabel('阻值4.7K，精度1%，数量100，封装0402，品牌xxx，批次xxx');
 for(const [key,value] of Object.entries({value:'4.7kΩ',tolerance:'1',qty:'100',package:'0402',manufacturer:'xxx',lotCode:'xxx',category:'电阻',sku:''}))assert.equal(p[key],value,key);
 assert.ok(labelSuggestedSku(p));assert.equal(p.warnings.length,0);
});
test('capacitor and English supplier labels preserve explicit parameters and quantity',()=>{
 const p=extractLabel('贴片电容\n容量:0.1uF\n封装:0603\n耐压:50V\n精度:10%\n介质:X7R\n品牌:风华\n数量:100颗\n批号:20260923-A');
 assert.equal(p.category,'电容');assert.equal(p.value,'0.1µF');assert.equal(p.voltage,'50V');assert.equal(p.dielectric,'X7R');assert.equal(p.manufacturer,'风华');assert.equal(p.lotCode,'20260923-A');assert.equal(p.qty,'100');
 const eng=extractLabel('MPN: RC0402FR-074K7L\nValue:4K7\nTolerance:1%\nPackage:0402\nBrand:YAGEO\nQTY:1,000\nLOT:AB-231\nPower:1/16W');assert.equal(eng.sku,'RC0402FR-074K7L');assert.equal(eng.value,'4.7kΩ');assert.equal(eng.qty,'1000');assert.equal(eng.manufacturer,'YAGEO');assert.equal(eng.power,'1/16W');
});
test('bare K notation is accepted but package, batch, price and ambiguous counts are not invented into values',()=>{
 assert.equal(extractLabel('4.7K 0402 1% 100pcs').value,'4.7kΩ');assert.equal(extractLabel('4K7 0402 1%').value,'4.7kΩ');
 for(const text of ['0402 1% 批次20260923','电容 104 0603','数量2包 品牌未知','QTY:1.5','批次100','价格100元'])assert.equal(extractLabel(text).qty,'',text);
 const p=extractLabel('阻值4.7K 数量100\n阻值10K 数量200');assert.equal(p.value,'');assert.equal(p.qty,'');assert.ok(p.warnings.length>0);
 assert.equal(extractLabel('无法识别').package,'');assert.equal(extractLabel('无法识别').category,'其他');
});
test('English field names cannot split manufacturer or model values; explicit different models cannot merge',()=>{
 const p=extractLabel('Brand: Lotus\nMPN: APower123\nLOT: BatchMaker\nQTY: 100');
 assert.equal(p.manufacturer,'Lotus');assert.equal(p.sku,'APower123');assert.equal(p.lotCode,'BatchMaker');
 assert.equal(extractLabel('品牌测试品牌 批次A').manufacturer,'测试品牌');
 const ocr=extractLabel('Value: 4 ． 7K\nTolerance: 1 ％\nPackage: 0402\nQ TY: 100');assert.equal(ocr.value,'4.7kΩ');assert.equal(ocr.qty,'100');
 assert.match(labelPartConflicts({sku:'APower123'},{sku:'APower456'}).join(''),/型号/);
 assert.deepEqual(labelPartConflicts({sku:'generated-id',labelSku:''},{sku:'my-internal-id'}),[]);
 let s=emptyState();s=applyAction(s,{type:'part.save',part:{sku:'IC-A',name:'A',category:'IC',mount:'贴片'},locationId:s.locations[0].id,qty:0}).state;
 assert.throws(()=>applyAction(s,{type:'label.receive',partId:s.parts[0].id,part:{sku:'IC-B'},locationId:s.locations[0].id,qty:100}),/型号/);
 assert.equal(s.stocks[0].qty,0);
});
test('label stock posting is atomic, does not require LCSC, and keeps each receiving lot in ledger and backup',()=>{
 let s=emptyState();const p=extractLabel('阻值4.7K 精度1% 数量100 封装0402 品牌xxx 批次A');p.sku=labelSuggestedSku(p);
 const action={type:'label.receive',part:p,qty:100,locationId:s.locations[0].id,bin:'A1',lotCode:p.lotCode,supplier:'淘宝店',labelText:p.description};
 const before=structuredClone(s);assert.throws(()=>applyAction(s,{...action,qty:1.5}));assert.deepEqual(s,before);
 const one=applyAction(s,action);s=one.state;assert.equal(s.parts[0].manufacturer,'xxx');assert.equal(s.parts[0].lcscCode,'');assert.equal(s.stocks[0].qty,100);assert.equal(s.orders[0].lotCode,'A');
 s=applyAction(s,{...action,partId:one.partId,qty:30,lotCode:'B'}).state;assert.equal(s.stocks[0].qty,130);assert.deepEqual(s.orders.map(o=>o.lotCode),['A','B']);assert.deepEqual(s.events.map(e=>e.lotCode),['A','B']);assert.equal(validateBackup(s).orders[1].lotCode,'B');assert.equal(s.parts[0].lotCode,undefined);
 assert.throws(()=>applyAction(s,{...action,partId:one.partId,part:{...p,manufacturer:'另一品牌'}}),/品牌/);assert.equal(s.stocks[0].qty,130);
 assert.equal(labelPartConflicts({...p,value:'4K7'},s.parts[0]).length,0);
});
test('label posting enforces library/location permissions and stable request replay',async()=>{
 const e=new TeamEngine(emptyDocument()),a=await e.register('label_owner','password-123','A'),b=await e.register('label_user','password-123','B'),lid=a.workspaces[0].id;
 const inv=e.teamAction(a.key,lid,{type:'invite.create',role:'member',locations:[e.state(a.key,lid).state.locations[1].id],days:1,revision:e.me(a.key).revision});e.teamAction(b.key,b.workspaces[0].id,{type:'invite.join',code:inv.code,revision:e.me(b.key).revision});
 const s=e.state(a.key,lid).state,p=extractLabel('4.7K 0402 1%');p.sku=labelSuggestedSku(p);
 const req={type:'label.receive',part:p,qty:100,locationId:s.locations[0].id,lotCode:'X',rev:s.rev,requestId:randomUUID()};
 assert.throws(()=>e.action(b.key,lid,req),/权限/);assert.equal(e.state(a.key,lid).state.parts.length,0);
 e.action(a.key,lid,req);assert.equal(e.action(a.key,lid,req).duplicate,true);assert.equal(e.state(a.key,lid).state.stocks[0].qty,100);
});
