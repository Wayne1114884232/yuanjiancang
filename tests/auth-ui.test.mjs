import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {TeamEngine,emptyDocument} from '../team-engine.mjs';
import * as logic from '../public/logic.js';
const elements=new Map(),listeners={};
const attr=(text,key)=>new RegExp('(?:^|\\s)'+key+'="([^"]*)"').exec(text)?.[1]||'';
class Element{constructor(id,tag='div'){this.id=id;this.tagName=tag.toUpperCase();this.dataset={};this.value='';this.open=false;this.disabled=false;this.isConnected=true;this.hidden=false;this._html='';this.children=[];this.classList={toggle(){},add(){},remove(){}};}set innerHTML(html){this._html=html;for(const m of html.matchAll(/<(\w+)\b([^>]*\sid="[^"]+"[^>]*)>/g)){const el=new Element(attr(m[2],'id'),m[1]);el.type=attr(m[2],'type');el.value=attr(m[2],'value');const content=new RegExp('<'+m[1]+'\\b[^>]*id="'+el.id+'"[^>]*>([\\s\\S]*?)</'+m[1]+'>').exec(html)?.[1]||'';el._html=content;if(m[1]==='select'){const opts=[...content.matchAll(/<option([^>]*)>([\s\S]*?)<\/option>/g)],sel=opts.find(x=>/\bselected\b/.test(x[1]))||opts[0];el.value=sel?attr(sel[1],'value')||sel[2]:'';}elements.set(el.id,el);}}get innerHTML(){return this._html;}querySelector(q){if(q==='[type="submit"]')return this.submit||(this.submit=new Element('submit','button'));return document.querySelector(q);}addEventListener(){}showModal(){this.open=true;}close(){this.open=false;}scrollIntoView(){}focus(){}select(){}append(){}remove(){}setAttribute(){}prepend(){}insertAdjacentHTML(_,s){this._html+=s;}getBoundingClientRect(){return {left:0,right:1000,top:0,bottom:1000};}}
for(const name of ['sidebar','sidebarClose','sidebarBackdrop','navigation','viewTitle','workspaceName','workspaceRole','demoSwitch','demoBanner','offlineBanner','page','saveState','connectionStatus','dialog','dialogBody','dialogTitle','menuBtn','toast'])elements.set(name,new Element(name));
const document={querySelector:q=>q.startsWith('#')?elements.get(q.slice(1))||null:null,querySelectorAll:()=>[],addEventListener:(e,f)=>(listeners[e]??=[]).push(f),hidden:false,activeElement:null,body:new Element('body'),createElement:()=>new Element('created')};
const localStorage={};for(const [key,fn] of Object.entries({setItem(k,v){this[k]=String(v)},getItem(k){return this[k]??null},removeItem(k){delete this[k]}}))Object.defineProperty(localStorage,key,{value:fn});
class FormData{constructor(form){this.entries=Object.entries(form.values||{});}get(k){return this.entries.find(x=>x[0]===k)?.[1]||null;}getAll(k){return this.entries.filter(x=>x[0]===k).map(x=>x[1]);}[Symbol.iterator](){return this.entries[Symbol.iterator]();}}
const store=new TeamEngine(emptyDocument());let key='',network=true,httpDown=false;
const context=vm.createContext({...logic,document,FormData,URL,URLSearchParams,Blob,File,Image:class{},AbortController,crypto,console,location:{hostname:'localhost',hash:'',pathname:'/',origin:'http://localhost:4187'},history:{replaceState(){}},sessionStorage:localStorage,localStorage,window:{addEventListener(){},scrollTo(){},isSecureContext:false},navigator:{userAgent:'UI Simulation'},setTimeout(){},clearTimeout(){},setInterval(){},fetch:async(url,opts={})=>{if(!network)throw Error('offline');if(httpDown)return {ok:false,status:502,text:async()=>'<h1>Starting service</h1>'};let data,status=200;const b=opts.body?JSON.parse(opts.body):{},lid=opts.headers?.['X-Workspace'];try{if(url==='/api/auth/register'){const r=await store.register(b.username,b.password,b.device);key=r.key;data=r;}else if(url==='/api/auth/login'){const r=await store.login(b.username,b.password,b.device);key=r.key;data=r;}else if(url==='/api/auth/me')data=store.me(key);else if(url==='/api/auth/logout')data=store.logout(key);else if(url==='/api/state')data={...store.state(key,lid),local:true};else if(url==='/api/team')data=store.team(key,lid);else if(url==='/api/team/action')data=store.teamAction(key,lid,b);else if(url==='/api/action')data=store.action(key,lid,b);else if(url==='/api/approve')data=store.approve(key,lid,b.id,b.decision);else throw Error('Unexpected route '+url);}catch(e){status=e.status||400;data={error:e.message};}return {ok:status<400,status,json:async()=>data,text:async()=>JSON.stringify(data)};}});
let source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8').replace(/^import[^\n]*\n/,'').replace(/initialize\(\);\s*$/,'');vm.runInContext(source,context);const run=s=>vm.runInContext(s,context);
async function submit(kind,values){const f=new Element('test-form','form');f.dataset.teamForm=kind;f.values=values;const ev={target:f,preventDefault(){}};for(const fn of listeners.submit||[])await fn(ev);}
try{
 await run('initialize()');assert.match(elements.get('page').innerHTML,/注册新账号/);
 assert.equal(document.body.dataset.auth,'true');assert.doesNotMatch(elements.get('page').innerHTML,/<select|修改服务器地址|云端版/);
 await run("handleAction({dataset:{act:'team-auth-switch',mode:'register'}})");
 assert.match(elements.get('page').innerHTML,/确认密码/);assert.match(elements.get('page').innerHTML,/autocomplete="new-password"/);
 await submit('account',{mode:'register',username:'x',password:'test-password',confirmPassword:'test-password'});
 assert.equal(run('T.user'),null);assert.match(elements.get('authError').textContent,/3～40/);
 await submit('account',{mode:'register',username:'ui_alice',password:'test-password-987',confirmPassword:'different'});
 assert.equal(run('T.user'),null);assert.match(elements.get('authError').textContent,/不一致/);
 await submit('account',{mode:'register',username:'ui_alice',password:'short',confirmPassword:'short'});
 assert.equal(run('T.user'),null);assert.match(elements.get('authError').textContent,/8～128/);
 await run("handleAction({dataset:{act:'team-auth-password',id:'authPassword'},setAttribute(){}})");assert.equal(elements.get('authPassword').type,'text');
 await run("handleAction({dataset:{act:'team-auth-password',id:'authPassword'},setAttribute(){}})");assert.equal(elements.get('authPassword').type,'password');
 network=false;await submit('account',{mode:'register',username:'ui_alice',password:'test-password-987',confirmPassword:'test-password-987'});network=true;
 assert.equal(run('T.user'),null);assert.equal(run('authBusy'),false);assert.match(elements.get('authError').textContent,/连接/);
 
 await submit('account',{mode:'register',username:'ui_alice',password:'test-password-987',confirmPassword:'test-password-987'});assert.equal(run('T.user.username'),'ui_alice');assert.equal(document.body.dataset.auth,'false');const aliceKey=key,personal=run('space');assert.match(elements.get('navigation').innerHTML,/成员与协作/);
 await run('teamLoad()');await submit('create',{name:'实验室UI'});const shared=run('space');assert.notEqual(shared,personal);assert.equal(run('S.parts.length'),0);
 await submit('price-settings',{priceThreshold:'15'});assert.equal(run('S.settings.priceThreshold'),15);
 await run("mutate({type:'part.save',part:{sku:'R1',name:'10K',category:'电阻',mount:'贴片',value:'10k',minStock:0},locationId:S.locations[0].id,qty:40})");
 for(const name of ['dashboard','inventory','bom','projects','procurement','settings','team']){await run('teamLoad()');run(`setView('${name}')`);assert.ok(elements.get('page').innerHTML.length>200,name);}
 await run('teamLoad()');await submit('invite',{role:'member',days:'7',locationMode:'全部地点',projectMode:'全部项目'});const invite=/class="invite-code" readonly value="([^"]+)"/.exec(elements.get('dialogBody').innerHTML)?.[1];assert.ok(invite);
 await run("handleAction({dataset:{act:'team-logout'}})");assert.equal(Object.keys(localStorage).some(k=>k.startsWith('team-v2-')),false);
 await run("showAuthScreen('','register')");
 await submit('account',{mode:'register',username:'ui_alice',password:'test-password-987',confirmPassword:'test-password-987'});
 assert.equal(run('T.user'),null);assert.match(elements.get('authError').textContent,/已存在/);
 await run("handleAction({dataset:{act:'team-auth-switch',mode:'login'}})");
 await submit('account',{mode:'login',username:'ui_alice',password:'wrong-password'});
 assert.equal(run('T.user'),null);assert.match(elements.get('authError').textContent,/账号或密码/);
 await submit('account',{mode:'login',username:'ui_alice',password:'test-password-987'});
 assert.equal(run('T.user.username'),'ui_alice');await run("handleAction({dataset:{act:'team-logout'}})");
 await submit('account',{mode:'register',username:'ui_bob',password:'test-password-123',confirmPassword:'test-password-123'});assert.equal(run('S.parts.length'),0);await run('teamLoad()');await submit('join',{code:invite});assert.equal(run('space'),shared);assert.equal(run('currentRole'),'member');
 run("bom={...bom,stage:2,kind:'出库',boards:3,lossRate:0,locationId:S.locations[0].id,rows:[{stockId:S.stocks[0].id,perBoard:2,loss:1}]} ");await run("mutate({type:'bom.post',kind:'出库',boards:bom.boards,locationId:bom.locationId,rows:bom.rows})");assert.equal(run('S.stocks[0].qty'),33);
 run('inventorySelected.add(S.stocks[0].id);bulkStockOutForm()');const f=new Element('bulkStockOutForm','form');f.values={note:'UI全选测试'};for(const fn of listeners.submit)await fn({target:f,preventDefault(){}});assert.equal(run('S.stocks[0].qty'),0);
 run("saveDrafts([{id:'draft'}])");await run(`switchWorkspace(T.workspaces.find(w=>w.id!=='${shared}').id)`);assert.equal(run('drafts().length'),0);assert.equal(run('bom.stage'),0);await run(`switchWorkspace('${shared}')`);assert.equal(run('drafts().length'),1);
 network=false;await run('initialize()');assert.equal(run('online'),false);assert.equal(run('S.stocks[0].qty'),0);network=true;httpDown=true;await run('initialize()');assert.equal(run('online'),false);assert.equal(run('T.user.username'),'ui_bob');assert.equal(run('drafts().length'),1);httpDown=false;await run('load()');
 const ownerKey=(await store.login('ui_alice','test-password-987','复核电脑')).key;const bobId=store.me(key).user.id;store.teamAction(ownerKey,shared,{type:'member.save',userId:bobId,role:'readonly',locations:null,projects:null,revision:store.me(ownerKey).revision});await run('(async()=>{await refreshIdentity();await load()})()');assert.equal(run('currentRole'),'readonly');assert.equal(run('drafts().length'),0);
 await assert.rejects(run("mutate({type:'stock.post',kind:'入库',stockId:S.stocks[0].id,qty:1})"));assert.equal(store.state(ownerKey,shared).state.stocks[0].qty,0);
 console.log('Cloud UI flow passed (including HTML 502 cold-start snapshot preservation): register/create/invite/join/switch/cache isolation/offline restore/permission update/BOM final issue/bulk final issue. DOM simulation only.');
}finally{}
