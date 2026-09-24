import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,applyAction,validateBackup} from '../domain.mjs';
function fixture(){let s=emptyState();s=applyAction(s,{type:'part.save',part:{sku:'PICK-R',name:'4.7k',category:'电阻',mount:'贴片'},qty:100,locationId:s.locations[0].id}).state;s=applyAction(s,{type:'project.save',project:{name:'测试板',rows:[{partId:s.parts[0].id,perBoard:2}]}}).state;return applyAction(s,{type:'project.pickSave',projectId:s.projects[0].id,boards:3}).state;}
test('saved picking is not stock movement; requires full check and issues exact project quantity',()=>{
 let s=fixture();let p=s.projects[0];assert.equal(s.stocks[0].qty,100);
 const issue={type:'project.issue',projectId:p.id,boards:3,pickSessionId:p.pickSession.id};
 assert.throws(()=>applyAction(s,issue),/全部拣料/);
 s=applyAction(s,{type:'project.pickSave',projectId:p.id,boards:3,sessionId:p.pickSession.id,rows:p.pickSession.rows.map(r=>({...r,checked:true,lotId:s.lots[0].id}))}).state;
 s=applyAction(s,issue).state;assert.equal(s.stocks[0].qty,94);assert.equal(s.lots[0].qty,94);assert.equal(s.projects[0].pickSession.status,'issued');validateBackup(s);
 assert.throws(()=>applyAction(s,issue),/失效|已出库/);
});
test('inventory changes invalidate saved picking and cannot partially issue',()=>{
 let s=fixture();const p=s.projects[0];s=applyAction(s,{type:'stock.post',kind:'出库',stockId:s.stocks[0].id,qty:1}).state;const before=structuredClone(s);
 assert.throws(()=>applyAction(s,{type:'project.pickSave',projectId:p.id,boards:3,sessionId:p.pickSession.id,rows:p.pickSession.rows.map(r=>({...r,checked:true}))}),/重新生成/);assert.deepEqual(s,before);
});
