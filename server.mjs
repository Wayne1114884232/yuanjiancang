import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {TeamStore,check} from './team-store.mjs';
import {validateBackup} from './domain.mjs';
import {readSpreadsheet} from './spreadsheet.mjs';
import {fetchLcscDetail,lcscSearchUrl} from './lcsc.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),publicDir=path.join(root,'public'),dataDir=path.resolve(process.env.COMPONENT_DATA_DIR||path.join(root,'data'));
const store=new TeamStore(dataDir),execute=promisify(execFile),port=Number(process.env.PORT||4187),host=process.env.HOST||'0.0.0.0';
const legacyFile=process.env.LEGACY_INVENTORY_FILE?path.resolve(process.env.LEGACY_INVENTORY_FILE):path.resolve(root,'../元件仓/data/inventory.json');
const VERSION='2.0.0-beta.1',limits=new Map();
const cookie=req=>(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('hub_team_session='))?.slice(17)||'';
const local=req=>['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)&&['127.0.0.1','localhost','[::1]'].includes(new URL(req.url,`http://${req.headers.host}`).hostname)&&!req.headers.forwarded&&!req.headers['x-forwarded-for'];
function sessionHeader(req,key){const secure=req.socket.encrypted||(process.env.TRUST_PROXY==='true'&&req.headers['x-forwarded-proto']==='https');return {'Set-Cookie':`hub_team_session=${key}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${key?2592000:0}${secure?'; Secure':''}`};}
function json(res,status,data,headers={}){if(res.headersSent)return;res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...headers});res.end(JSON.stringify(data));}
async function body(req,max=24000000){let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;check(size<=max,'上传内容过大',413);chunks.push(chunk);}try{const x=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');check(x&&typeof x==='object'&&!Array.isArray(x),'请求应为对象');return x;}catch{throw new Error('请求格式不正确');}}
function rate(req,bucket,max){const key=(req.socket.remoteAddress||'')+bucket,old=limits.get(key),time=Date.now();const item=old&&time-old.at<60000?old:{at:time,count:0};item.count++;limits.set(key,item);if(limits.size>10000)for(const [k,v] of limits)if(time-v.at>60000)limits.delete(k);check(item.count<=max,'操作过于频繁，请稍后再试',429);}
function legacy(){check(fs.existsSync(legacyFile),'未找到旧版库存文件，可使用导入 JSON 备份');const bytes=fs.readFileSync(legacyFile),state=validateBackup(JSON.parse(bytes));return {state,digest:createHash('sha256').update(bytes).digest('hex')};}
const server=http.createServer(async(req,res)=>{try{
  const u=new URL(req.url,`http://${req.headers.host||'localhost'}`);
  if(u.pathname.startsWith('/api/')){
    check(!req.headers.origin||[`${u.protocol}//${req.headers.host}`,`https://${req.headers.host}`].includes(req.headers.origin),'拒绝来自其他网站的请求',403);
    check(req.headers['sec-fetch-site']!=='cross-site','拒绝跨网站请求',403);
    const route=u.pathname.slice(5),method=req.method,key=cookie(req);
    if(route==='health'&&method==='GET')return json(res,200,{app:'component-hub-team',version:VERSION,mode:'local-multiplayer',storage:'sqlite'});
    if(['auth/login','auth/register'].includes(route)&&method==='POST'){rate(req,'account',12);const b=await body(req,4000);const r=route==='auth/register'?await store.register(b.username,b.password,b.device||req.headers['user-agent']):await store.login(b.username,b.password,b.device||req.headers['user-agent']);const {key:sessionKey,...data}=r;return json(res,200,data,sessionHeader(req,sessionKey));}
    if(route==='share'&&method==='POST'){rate(req,'share',60);const b=await body(req,1000);return json(res,200,store.share(b.key));}
    const me=store.me(key);
    if(route==='auth/me'&&method==='GET')return json(res,200,me);
    if(route==='auth/logout'&&method==='POST'){store.logout(key);return json(res,200,{ok:true},sessionHeader(req,''));}
    const lid=req.headers['x-workspace']||(route==='events'?u.searchParams.get('workspace'):null)||me.workspaces[0]?.id;
    const state=()=>store.state(key,lid);
    if(route==='state'&&method==='GET')return json(res,200,{...state(),local:local(req),remoteAccess:!local(req)});
    if(route==='team'&&method==='GET')return json(res,200,store.team(key,lid));
    if(route==='team/action'&&method==='POST')return json(res,200,store.teamAction(key,lid,await body(req,100000)));
    if(route==='action'&&method==='POST'){const b=await body(req);const result=store.action(key,lid,b);return json(res,result.pending?202:200,result);}
    if(route==='approve'&&method==='POST'){const b=await body(req,4000);return json(res,200,store.approve(key,lid,b.id,b.decision));}
    if(route==='transfer'&&method==='POST')return json(res,200,store.transfer(key,lid,await body(req,100000)));
    if(route==='backup'&&method==='GET')return json(res,200,store.backup(key,lid,u.searchParams.get('id')),{'Content-Disposition':'attachment; filename="component-library-backup.json"'});
    if(route==='restore/validate'&&method==='POST'){store.backup(key,lid);const s=validateBackup(await body(req));return json(res,200,{parts:s.parts.length,stocks:s.stocks.length,locations:s.locations.length,orders:s.orders.length});}
    if(route==='restore'&&method==='POST'){const b=await body(req);const r=store.action(key,lid,{type:'library.restore',backup:b.backup,rev:b.rev,requestId:b.requestId});return json(res,r.pending?202:200,r);}
    if(route==='legacy/preview'&&method==='GET'){check(local(req),'迁移本机旧库请在这台电脑的浏览器操作',403);store.backup(key,lid);const {state:s,digest}=legacy();return json(res,200,{digest,parts:s.parts.length,stocks:s.stocks.length,orders:s.orders.length,quantity:s.stocks.reduce((n,x)=>n+x.qty,0)});}
    if(route==='legacy/import'&&method==='POST'){check(local(req),'迁移本机旧库请在这台电脑操作',403);const b=await body(req,2000),source=legacy();check(b.digest===source.digest,'旧库存已变化，请重新预览',409);return json(res,200,store.importLegacy(key,lid,source.state,source.digest));}
    if(route==='connection'&&method==='GET'){state();const addresses=Object.entries(os.networkInterfaces()).flatMap(([name,items])=>items.filter(x=>x.family==='IPv4'&&!x.internal&&!/169\.254\./.test(x.address)&&!/VMware|VirtualBox|vEthernet/i.test(name)).map(x=>({name,url:`http://${x.address}:${port}/`})));return json(res,200,{addresses});}
    if(route==='events'&&method==='GET'){
      let last=JSON.stringify({rev:state().state.rev,revision:store.me(key).revision});res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write(`retry: 3000\ndata: ${last}\n\n`);
      const timer=setInterval(()=>{try{const r=state(),value=JSON.stringify({rev:r.state.rev,revision:r.revision});if(value!==last){res.write(`data: ${value}\n\n`);last=value;}else res.write(': heartbeat\n\n');}catch{res.write('event: revoked\ndata: {}\n\n');res.end();clearInterval(timer);}},1500);req.on('close',()=>clearInterval(timer));return;
    }
    if(route==='bom/parse'&&method==='POST'){check(state().role!=='readonly','只读成员不能导入BOM',403);const b=await body(req),bytes=Buffer.from(b.content||'','base64');check(bytes.length<=6000000,'BOM文件最多6MB');return json(res,200,{rows:await readSpreadsheet(bytes,b.name)});}
    if(route==='ocr'&&method==='POST'){check(state().role!=='readonly','只读成员不能识别入库',403);check(process.platform==='win32','照片识别需要Windows服务端');rate(req,'ocr',10);const b=await body(req);const ext={'image/png':'.png','image/jpeg':'.jpg','image/bmp':'.bmp','image/webp':'.webp'}[b.mime];check(ext,'图片格式不支持');const bytes=Buffer.from(b.content||'','base64');check(bytes.length>0&&bytes.length<=12000000,'图片须小于12MB');const tmp=path.join(dataDir,'ocr-'+randomUUID()+ext);fs.writeFileSync(tmp,bytes);try{const r=await execute('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/ocr.ps1'),'-ImagePath',tmp],{windowsHide:true,encoding:'utf8',timeout:60000,maxBuffer:2000000});state();return json(res,200,JSON.parse(r.stdout.replace(/^\uFEFF/,'').trim()));}finally{fs.rmSync(tmp,{force:true});}}
    if(route==='lcsc/refresh'&&method==='POST'){rate(req,'lcsc',3);const source=store.backup(key,lid),tracked=source.parts.filter(x=>x.watch&&x.lcscCode);check(tracked.length>0&&tracked.length<=500,'请填写关注元件的立创编号，最多500种');const items=[],errors=[],asOf=new Date().toISOString();for(let i=0;i<tracked.length;i+=5){const rows=tracked.slice(i,i+5);const results=await Promise.allSettled(rows.map(p=>fetchLcscDetail(p.lcscCode)));results.forEach((r,j)=>{if(r.status==='rejected'){errors.push(rows[j].lcscCode);return;}for(const tier of r.value.prices)items.push({sku:rows[j].sku,source:'立创商城',sourceUrl:lcscSearchUrl(r.value.productCode),asOf,price:tier.price,currency:'USD',quantityTier:tier.quantityTier,notice:'立创商城接口阶梯报价'});});}check(items.length,'立创报价暂时无法获取，请稍后再试');const result=store.feedCommit(key,lid,source.rev,{items});return json(res,200,{...result,checked:tracked.length,failed:errors.length});}
    if(route==='feed/refresh'&&method==='POST')throw new Error('本地多人测试版请使用立创价格刷新；自定义厂商数据源将在云端接入阶段配置');
    return json(res,404,{error:'接口不存在'});
  }
  check(['GET','HEAD'].includes(req.method),'不支持的请求方式',405);const rel=decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname),file=path.resolve(publicDir,'.'+rel);check(file.startsWith(publicDir+path.sep),'路径无效',404);check(fs.existsSync(file)&&fs.statSync(file).isFile(),'文件不存在',404);
  const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.apk':'application/vnd.android.package-archive'};
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"});if(req.method==='HEAD')return res.end();fs.createReadStream(file).pipe(res);
}catch(e){json(res,e.status||400,{error:e.message||'请求失败'});}});
server.listen(port,host,()=>{fs.writeFileSync(path.join(dataDir,'server.pid'),String(process.pid));console.log(`元件仓多人测试版 ${VERSION} 已启动：http://127.0.0.1:${port}`);if(process.argv.includes('--open')&&process.platform==='win32')execFile('rundll32.exe',['url.dll,FileProtocolHandler',`http://127.0.0.1:${port}`],{windowsHide:true},()=>{});});
server.on('error',e=>{console.error(e.message);process.exitCode=1;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.closeAllConnections();server.close(()=>{store.close();process.exit(0);});});
