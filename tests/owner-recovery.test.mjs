import test from 'node:test';
import assert from 'node:assert/strict';
import {TeamEngine,emptyDocument} from '../team-engine.mjs';

test('APP owner is pinned to an existing identity; ordinary library owners cannot reset others',async()=>{
 const e=new TeamEngine(emptyDocument()),owner=await e.register('appowner','owner-password','A'),member=await e.register('member','member-password','B');
 assert.equal(e.me(member.key).workspaces[0].role,'owner');assert.equal(e.me(member.key).user.appOwner,false);
 e.configureOwner('appowner');assert.equal(e.me(owner.key).user.appOwner,true);assert.equal(e.me(member.key).user.appOwner,false);
 const input={username:'member',currentPassword:'owner-password',reason:'本人当面申请',identityConfirmed:true};
 await assert.rejects(e.ownerRecoveryCreate(member.key,{...input,currentPassword:'member-password'}),/APP 所有者/);
 await assert.rejects(e.ownerRecoveryCreate(owner.key,{...input,currentPassword:'wrong'}),/密码/);
 await assert.rejects(e.ownerRecoveryCreate(owner.key,{...input,identityConfirmed:false}),/核实/);
 await assert.rejects(e.ownerRecoveryCreate(owner.key,{...input,username:'unknown'}),/没有找到/);
 assert.throws(()=>e.ownerRecoveryLog(member.key),/APP 所有者/);
 const self=await e.recoveryCreate(member.key,'member-password'),issued=await e.ownerRecoveryCreate(owner.key,input);
 assert.equal(issued.username,'member');assert.equal(issued.code.length,48);assert.equal(JSON.stringify(e.document).includes(issued.code),false);
 assert.ok(Date.parse(issued.expiresAt)-Date.now()<=30*60000);assert.equal(e.me(member.key).user.recoveryReady,true);
 const replacement=await e.ownerRecoveryCreate(owner.key,input);await assert.rejects(e.recover('member',issued.code,'changed-password'),/恢复码/);
 await assert.rejects(e.recover('appowner',replacement.code,'changed-password'),/恢复码/);
 await e.recover('member',replacement.code,'changed-password');assert.throws(()=>e.me(member.key));await assert.rejects(e.recover('member',replacement.code,'another-password'));
 await assert.rejects(e.recover('member',self.code,'another-password'));assert.ok((await e.login('member','changed-password','C')).key);
 const logs=e.ownerRecoveryLog(owner.key).records;assert.equal(logs.filter(x=>x.action==='account.recovery.issue').length,2);assert.equal(logs[0].action,'account.recovery.used');assert.equal(JSON.stringify(logs).includes(replacement.code),false);
 e.configureOwner('member');assert.equal(e.me(owner.key).user.appOwner,true,'configuration cannot silently transfer platform ownership');
});
test('expired assisted code is rejected; a later registration cannot capture a missing configured owner',async()=>{
 const e=new TeamEngine(emptyDocument());e.configureOwner('future');const user=await e.register('future','future-password','A');e.configureOwner('future');assert.equal(e.me(user.key).user.appOwner,false);
 const doc=emptyDocument(),f=new TeamEngine(doc),owner=await f.register('owner','owner-password','A'),target=await f.register('target','target-password','B');f.configureOwner('owner');
 const code=await f.ownerRecoveryCreate(owner.key,{username:'target',currentPassword:'owner-password',identityConfirmed:true,reason:'verified'});
 f.document.users.find(u=>u.id===target.user.id).assistedRecovery.expiresAt=new Date(Date.now()-1).toISOString();await assert.rejects(f.recover('target',code.code,'new-password'),/过期/);
 const next=await f.ownerRecoveryCreate(owner.key,{username:'target',currentPassword:'owner-password',identityConfirmed:true,reason:'verified'});await f.passwordChange(target.key,{currentPassword:'target-password',password:'changed-pass'});await assert.rejects(f.recover('target',next.code,'new-password'));
});
