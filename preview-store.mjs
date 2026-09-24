// Isolated owner testing only. Never reads DATABASE_URL or writes production data.
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {TeamEngine,emptyDocument,check} from './team-engine.mjs';
const origin='https://yuanjiancang.onrender.com';
export async function verifyCloudOwner(username,password){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),70000);let cookie='';
 try{
  const r=await fetch(origin+'/api/auth/login',{method:'POST',redirect:'error',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password,device:'所有者测试身份验证（临时会话）'})});
  cookie=r.headers.get('set-cookie')?.split(';')[0]||'';const data=await r.json();check(r.ok,data.error||'正式账号验证失败',r.status);check(data.user?.appOwner===true,'测试通道仅限 APP 所有者',403);return data.user;
 }finally{clearTimeout(timer);if(cookie)await fetch(origin+'/api/auth/logout',{method:'POST',redirect:'error',headers:{Cookie:cookie},signal:AbortSignal.timeout(10000)}).catch(()=>{});}
}
export function openPreviewStore(directory,ownerUsername,verify=verifyCloudOwner){
 fs.mkdirSync(directory,{recursive:true});const file=path.join(directory,'owner-preview.json');
 let document=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):emptyDocument(),queue=Promise.resolve();
 const run=fn=>{const task=queue.then(async()=>{const engine=new TeamEngine(document),result=await fn(engine);if(engine.changed){const next=engine.read(),temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(next),{flush:true,mode:0o600});fs.renameSync(temp,file);document=next;}return result;});queue=task.catch(()=>{});return task;};
 const store={close:()=>queue,configureOwner:async()=>({configured:true}),login:async(username,password,device)=>{
  check(String(username).trim()===ownerUsername,'测试通道仅限 APP 所有者',403);const profile=await verify(username,password);check(profile.appOwner===true&&profile.username===ownerUsername,'未通过正式版所有者验证',403);
  return run(async engine=>{let user=engine.document.users.find(u=>u.remoteId===profile.id);if(!user){check(!engine.document.users.length,'测试账号身份已变化，请联系维护者',403);await engine.register(ownerUsername,randomBytes(32).toString('hex'),'初始化');engine.transaction(db=>{db.users[0].remoteId=profile.id;db.sessions=[];db.appOwnerId=db.users[0].id;db.appOwnerConfigured=ownerUsername;db.libraries[0].name='所有者测试库存';});user=engine.document.users[0];}return engine.transaction(db=>engine.newSession(db,db.users.find(u=>u.id===user.id),device));});
 },watchStates:batch=>run(engine=>batch.map(w=>{try{const me=engine.me(w.key),s=engine.state(w.key,w.lid);return {revision:me.revision,rev:s.state.rev};}catch{return {revoked:true};}}))};
 for(const name of ['me','state','team','backup','ownerRecoveryLog','logout','action','teamAction','approve','transfer','importLegacy','feedCommit','priceStatus'])store[name]=(...args)=>run(engine=>{engine.ownerAccess(engine.document,args[0]);return engine[name](...args);});
 for(const name of ['register','share','passwordChange','recoveryCreate','recover','ownerRecoveryCreate'])store[name]=async()=>{throw Error('测试环境不办理账号、分享及找回操作，请使用正式版');};
 return store;
}
