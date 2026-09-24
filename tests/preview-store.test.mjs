import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {openPreviewStore} from '../preview-store.mjs';

test('preview rejects non-owner identities before creating any inventory',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hub-preview-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 let calls=0;const s=openPreviewStore(dir,'owner',async()=>{calls++;return {id:'remote',username:'owner',appOwner:false};});
 await assert.rejects(s.login('other','test-password','test'),/所有者/);assert.equal(calls,0);
 await assert.rejects(s.login('owner','test-password','test'),/验证/);assert.equal(fs.existsSync(path.join(dir,'owner-preview.json')),false);
 await assert.rejects(s.register('owner','test-password','test'),/正式版/);
});
test('preview owner inventory and session persist independently across store restart',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hub-preview-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const verify=async()=>({id:'remote-owner',username:'owner',appOwner:true});let s=openPreviewStore(dir,'owner',verify);
 const login=await s.login('owner','not-stored-password','test'),lid=login.workspaces[0].id;
 assert.equal(login.user.appOwner,true);assert.equal(login.workspaces[0].name,'所有者测试库存');
 const state=(await s.state(login.key,lid)).state;
 const action={type:'part.save',part:{sku:'PREVIEW-R',name:'4.7k',category:'电阻',mount:'贴片'},locationId:state.locations[0].id,qty:100,rev:state.rev,requestId:randomUUID()};
 await s.action(login.key,lid,action);await s.close();
 const saved=fs.readFileSync(path.join(dir,'owner-preview.json'),'utf8');assert.equal(saved.includes('not-stored-password'),false);assert.equal(saved.includes(login.key),false);
 s=openPreviewStore(dir,'owner',verify);assert.equal((await s.state(login.key,lid)).state.stocks[0].qty,100);
 assert.equal((await s.action(login.key,lid,action)).duplicate,true);
 assert.equal((await s.backup(login.key,lid)).stocks[0].qty,100);
 const second=await s.login('owner','not-stored-password','phone');assert.equal(second.workspaces[0].id,lid);
 await assert.rejects(s.state('invalid',lid),/登录/);await s.logout(login.key);await assert.rejects(s.me(login.key),/登录/);
 assert.equal((await s.me(second.key)).user.appOwner,true);await s.close();
});
