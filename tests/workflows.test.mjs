import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {applyAction,emptyState,demoState,validateBackup} from '../domain.mjs';
import {TeamEngine,emptyDocument} from '../team-engine.mjs';
import {batchPreview,quoteSelection} from '../public/workflows.js';
import {parseLcscDetail} from '../lcsc.mjs';
test('project imports zero-stock parts without orders; repeated rows share one part; exclude items',()=>{
 const s=emptyState(),row={autoPart:{sku:'CAP-X',value:'100nF',package:'0603',category:'电容',name:'电容'},perBoard:2};
 const result=applyAction(s,{type:'project.save',locationId:s.locations[0].id,project:{name:'新板',rows:[row,row,{excluded:true,autoPart:{sku:'SCREW'},perBoard:1}]}});
 assert.equal(result.state.parts.length,1);assert.equal(result.state.stocks[0].qty,0);assert.equal(result.state.orders.length,0);assert.equal(result.state.events.length,0);assert.equal(result.state.projects[0].rows[0].perBoard,4);assert.doesNotThrow(()=>validateBackup(result.state));
 const before=structuredClone(result.state);assert.throws(()=>applyAction(before,{type:'project.save',project:{name:'冲突板',rows:[{...row,autoPart:{...row.autoPart,voltage:'50V'}}]}}),/不一致/);assert.deepEqual(result.state,before);
});
test('bad project row rolls back newly created parts',()=>{const s=emptyState(),before=structuredClone(s);assert.throws(()=>applyAction(s,{type:'project.save',project:{name:'fail',rows:[{autoPart:{sku:'R1',name:'R1',category:'电阻'},perBoard:1},{autoPart:{sku:'R2',name:'R2'},perBoard:0}]}}));assert.deepEqual(s,before);});
test('mixed batch rolls back on short stock and stale inventory count; preview aggregates duplicates',()=>{
 const s=demoState(),st=s.stocks[0],before=structuredClone(s),row={kind:'出库',stockId:st.id,qty:st.qty};
 assert.throws(()=>applyAction(s,{type:'stock.batch',rows:[row,{...row,qty:1}]}),/库存不足/);assert.deepEqual(s,before);
 assert.match(batchPreview(s,[row,{...row,qty:1}])[1].error,/不足/);
 assert.throws(()=>applyAction(s,{type:'stock.batch',rows:[{...row,kind:'盘点',qty:1,snapshotQty:0}]}),/基准/);
 const r=applyAction(s,{type:'stock.batch',rows:[{...row,qty:2},{...row,kind:'损耗',qty:3}]});assert.equal(r.state.stocks[0].qty,st.qty-5);assert.equal(r.state.rev,s.rev+1);assert.equal(r.orders.length,2);assert.doesNotThrow(()=>validateBackup(r.state));
});
test('batch permissions, approval and duplicate retry preserve final counts',async()=>{
 const e=new TeamEngine(emptyDocument()),a=await e.register('owner','password-123','A'),b=await e.register('member','password-123','B'),lid=a.workspaces[0].id;
 const team=(actor,type,data={})=>e.teamAction(actor.key,lid,{type,...data,revision:e.me(actor.key).revision});
 const action=(actor,type,data={})=>e.action(actor.key,lid,{type,...data,rev:e.state(actor.key,lid).state.rev,requestId:randomUUID()});
 const inv=team(a,'invite.create',{role:'admin',days:1});e.teamAction(b.key,b.workspaces[0].id,{type:'invite.join',code:inv.code,revision:e.me(b.key).revision});
 let s=e.state(a.key,lid).state;action(a,'part.save',{part:{sku:'R1',name:'R1',category:'电阻',mount:'贴片'},locationId:s.locations[0].id,qty:10});s=e.state(a.key,lid).state;
 team(a,'policy.save',{approvals:true});const req={type:'stock.batch',rows:[{kind:'损耗',stockId:s.stocks[0].id,qty:2}],rev:s.rev,requestId:randomUUID()};const pending=e.action(a.key,lid,req);assert.equal(pending.pending,true);assert.equal(pending.state.stocks[0].qty,10);assert.equal(e.action(a.key,lid,req).duplicate,true);assert.equal(e.team(a.key,lid).approvals.length,1);
 e.approve(b.key,lid,pending.approvalId,'approve');assert.equal(e.state(a.key,lid).state.stocks[0].qty,8);
 team(a,'policy.save',{approvals:false});team(a,'member.save',{userId:b.user.id,role:'member',locations:[s.locations[1].id],projects:null});assert.throws(()=>action(b,'stock.batch',{rows:[{kind:'出库',stockId:s.stocks[0].id,qty:1}]}),/权限/);
});
test('password change verifies original; recovery codes hashed, replaced, single use; sessions revoked',async()=>{
 const e=new TeamEngine(emptyDocument()),a=await e.register('alice','password-123','A'),other=await e.login('alice','password-123','B');
 await assert.rejects(e.passwordChange(a.key,{currentPassword:'wrong',password:'password-456'}));
 const r=await e.recoveryCreate(a.key,'password-123');assert.ok(r.code.length>=40);assert.equal(JSON.stringify(e.document).includes(r.code),false);assert.equal(e.me(a.key).user.recoveryReady,true);
 await e.passwordChange(a.key,{currentPassword:'password-123',password:'password-456',revokeOthers:true});assert.throws(()=>e.me(other.key));assert.ok(e.me(a.key));
 const latest=await e.recoveryCreate(a.key,'password-456');await assert.rejects(e.recover('alice',r.code,'password-789'));
 await e.recover('alice',latest.code,'password-789');assert.throws(()=>e.me(a.key));await assert.rejects(e.recover('alice',latest.code,'password-000'));assert.ok((await e.login('alice','password-789','C')).key);
});
test('quote selection separates currencies and never chooses a tier above planned quantity',()=>{
 const observation=(currency,tier,price)=>({partId:'p',source:'vendor',kind:'feed',currency,quantityTier:String(tier),price,asOf:'2026-09-16T00:00:00Z'});
 const data=[observation('USD',1,1),observation('USD',100,0.5),observation('CNY',1,7),observation('CNY',100,4)];
 assert.deepEqual(quoteSelection(data,'p',50).map(x=>x.price),[1,7]);assert.deepEqual(quoteSelection(data,'p',100).map(x=>x.price),[0.5,4]);assert.deepEqual(quoteSelection([data[1]],'p',5),[]);
 assert.deepEqual(quoteSelection([data[0],{...data[1],asOf:'2026-09-17T00:00:00Z'}],'p',5),[],'a newer quote with only bulk tiers must not expose an older small-order quote as current');
 const p=parseLcscDetail({code:200,result:{productCode:'C1',productPriceList:[{ladder:1,usdPrice:0.1}]}},'C1');assert.equal(p.currency,'USD');assert.match(p.source,/国际/);assert.equal(parseLcscDetail({code:200,result:{productCode:'C2'}},'C1'),null);
});
