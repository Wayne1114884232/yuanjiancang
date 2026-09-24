import {openPreviewStore} from './preview-store.mjs';
import http from 'node:http';
import {VERSION,releaseInfo} from './release.mjs';
import {PREVIEW_VERSION,previewReleaseInfo} from './owner-preview-release.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {check} from './team-engine.mjs';
import {openCloudStore} from './cloud-store.mjs';
import {LiveUpdates} from './live-updates.mjs';
import {validateBackup} from './domain.mjs';
import {readSpreadsheet} from './spreadsheet.mjs';
import {fetchLcscDetail,lcscSearchUrl} from './lcsc.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),publicDir=path.join(root,'public'),dataDir=path.resolve(process.env.COMPONENT_DATA_DIR||path.join(root,'data'));
const preview=process.env.OWNER_PREVIEW==='true';
const appVersion=preview?PREVIEW_VERSION:VERSION;
const ownerConfig=JSON.parse(fs.readFileSync(new URL('./owner-config.json',import.meta.url),'utf8'));
const store=preview?openPreviewStore(path.join(dataDir,'owner-preview'),ownerConfig.username):await openCloudStore();
const live=new LiveUpdates(store),execute=promisify(execFile),port=Number(process.env.PORT||4188),host=process.env.HOST||'0.0.0.0';
const publicUrl=process.env.PUBLIC_URL||process.env.RENDER_EXTERNAL_URL||'';
if(publicUrl)check(new URL(publicUrl).protocol==='https:','公网地址必须使用 HTTPS');
const ownerBinding=await store.configureOwner(ownerConfig.username);if(!ownerBinding.configured)console.warn('APP 所有者未绑定，代发恢复码已禁用。');
const limits=new Map();
const cookie=req=>(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('hub_team_session='))?.slice(17)||'';
function sessionHeader(req,key){const secure=Boolean(publicUrl)||req.socket.encrypted||(process.env.TRUST_PROXY==='true'&&req.headers['x-forwarded-proto']==='https');return {'Set-Cookie':`hub_team_session=${key}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${key?2592000:0}${secure?'; Secure':''}`};}
function json(res,status,data,headers={}){if(res.headersSent)return;res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...headers});res.end(JSON.stringify(data));}
async function body(req,max=24000000){let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;check(size<=max,'上传内容过大',413);chunks.push(chunk);}try{const x=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');check(x&&typeof x==='object'&&!Array.isArray(x),'请求应为对象');return x;}catch{throw new Error('请求格式不正确');}}
function rate(req,bucket,max){const key=(process.env.TRUST_PROXY==='true'?String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',').at(-1).trim():(req.socket.remoteAddress||''))+bucket,old=limits.get(key),time=Date.now();const item=old&&time-old.at<60000?old:{at:time,count:0};item.count++;limits.set(key,item);if(limits.size>10000)for(const [k,v] of limits)if(time-v.at>60000)limits.delete(k);check(item.count<=max,'操作过于频繁，请稍后再试',429);}
const server=http.createServer(async(req,res)=>{try{
  const u=new URL(req.url,`http://${req.headers.host||'localhost'}`);
  if(u.pathname.startsWith('/api/')){
    check(!req.headers.origin||(publicUrl?[new URL(publicUrl).origin]:[`${u.protocol}//${req.headers.host}`,`https://${req.headers.host}`]).includes(req.headers.origin),'拒绝来自其他网站的请求',403);
    check(req.headers['sec-fetch-site']!=='cross-site','拒绝跨网站请求',403);
    const route=u.pathname.slice(5),method=req.method,key=cookie(req);
    if(route==='health'&&method==='GET')return json(res,200,{app:'component-hub-team',version:appVersion,mode:'cloud-multiplayer',storage:preview?'isolated-preview-file':'postgresql',channel:preview?'owner-preview':'stable',appOwnerConfigured:ownerBinding.configured});
    if(route==='auth/recover'&&method==='POST'){rate(req,'recover',5);const b=await body(req,4000);return json(res,200,await store.recover(b.username,b.code,b.password));}
    if(['auth/login','auth/register'].includes(route)&&method==='POST'){rate(req,'account',12);const b=await body(req,4000);const r=route==='auth/register'?await store.register(b.username,b.password,b.device||req.headers['user-agent']):await store.login(b.username,b.password,b.device||req.headers['user-agent']);const {key:sessionKey,...data}=r;return json(res,200,data,sessionHeader(req,sessionKey));}
    if(route==='share'&&method==='POST'){rate(req,'share',60);const b=await body(req,1000);return json(res,200,await store.share(b.key));}
    if(route==='version'&&method==='GET'&&preview)check((await store.me(key)).user.appOwner,'仅限 APP 所有者',403);
    if(route==='version'&&method==='GET')return json(res,200,preview?previewReleaseInfo():releaseInfo());
    const me=await store.me(key);
    if(route==='owner/recovery'&&method==='POST'){rate(req,'owner-recovery',5);return json(res,200,await store.ownerRecoveryCreate(key,await body(req,4000)));}
    if(route==='owner/recovery-log'&&method==='GET')return json(res,200,await store.ownerRecoveryLog(key));
    if(route==='auth/password'&&method==='POST'){rate(req,'password',5);return json(res,200,await store.passwordChange(key,await body(req,4000)));}
    if(route==='auth/recovery'&&method==='POST'){rate(req,'recovery',5);const b=await body(req,4000);return json(res,200,await store.recoveryCreate(key,b.password));}
    if(route==='auth/me'&&method==='GET')return json(res,200,me);
    if(route==='auth/logout'&&method==='POST'){await store.logout(key);return json(res,200,{ok:true},sessionHeader(req,''));}
    const lid=req.headers['x-workspace']||(route==='events'?u.searchParams.get('workspace'):null)||me.workspaces[0]?.id;
    const state=()=>store.state(key,lid);
    if(route==='state'&&method==='GET')return json(res,200,{...await state(),local:false,remoteAccess:true,cloud:true});
    if(route==='team'&&method==='GET')return json(res,200,await store.team(key,lid));
    if(route==='team/action'&&method==='POST')return json(res,200,await store.teamAction(key,lid,await body(req,100000)));
    if(route==='action'&&method==='POST'){const b=await body(req);const result=await store.action(key,lid,b);return json(res,result.pending?202:200,result);}
    if(route==='approve'&&method==='POST'){const b=await body(req,4000);return json(res,200,await store.approve(key,lid,b.id,b.decision));}
    if(route==='transfer'&&method==='POST')return json(res,200,await store.transfer(key,lid,await body(req,100000)));
    if(route==='backup'&&method==='GET')return json(res,200,await store.backup(key,lid,u.searchParams.get('id')),{'Content-Disposition':'attachment; filename="component-library-backup.json"'});
    if(route==='restore/validate'&&method==='POST'){await store.backup(key,lid);const s=validateBackup(await body(req));return json(res,200,{parts:s.parts.length,stocks:s.stocks.length,locations:s.locations.length,orders:s.orders.length});}
    if(route==='restore'&&method==='POST'){const b=await body(req);const r=await store.action(key,lid,{type:'library.restore',backup:b.backup,rev:b.rev,requestId:b.requestId});return json(res,r.pending?202:200,r);}
    if(route==='legacy/preview'&&method==='POST'){const current=await state();check(current.role==='owner','只有所有者可以迁移',403);const data=await body(req),clean=validateBackup(data);return json(res,200,{parts:clean.parts.length,stocks:clean.stocks.length,orders:clean.orders.length,quantity:clean.stocks.reduce((n,x)=>n+x.qty,0)});}
    if(route==='legacy/import'&&method==='POST'){const b=await body(req),source=validateBackup(b.backup),digest=createHash('sha256').update(JSON.stringify(source)).digest('hex');return json(res,200,await store.importLegacy(key,lid,source,digest));}
    if(route==='connection'&&method==='GET'){await state();return json(res,200,{addresses:[{name:'云端 HTTPS',url:publicUrl||'http://'+req.headers.host+'/'}],cloud:true});}
    if(route==='events'&&method==='GET'){await state();return live.add(req,res,key,lid);}
    if(route==='bom/parse'&&method==='POST'){check((await state()).role!=='readonly','只读成员不能导入BOM',403);const b=await body(req),bytes=Buffer.from(b.content||'','base64');check(bytes.length<=6000000,'BOM文件最多6MB');return json(res,200,{rows:await readSpreadsheet(bytes,b.name)});}
    if(route==='ocr'&&method==='POST'){check((await state()).role!=='readonly','只读成员不能识别入库',403);rate(req,'ocr',10);const b=await body(req);const ext={'image/png':'.png','image/jpeg':'.jpg','image/bmp':'.bmp','image/webp':'.webp'}[b.mime];check(ext,'图片格式不支持');const bytes=Buffer.from(b.content||'','base64');check(bytes.length>0&&bytes.length<=12000000,'图片须小于12MB');const tempDir=fs.mkdtempSync(path.join(os.tmpdir(),'hub-ocr-')),tmp=path.join(tempDir,'label'+ext);fs.writeFileSync(tmp,bytes);try{if(process.platform!=='win32'){const r=await execute('tesseract',[tmp,'stdout','-l','eng+chi_sim','--oem','1','--psm','11'],{env:{...process.env,OMP_THREAD_LIMIT:'1'},timeout:30000,maxBuffer:2000000});await state();return json(res,200,{text:r.stdout,language:'eng+chi_sim',engine:'Tesseract sparse-label'});}const r=await execute('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/ocr.ps1'),'-ImagePath',tmp],{windowsHide:true,encoding:'utf8',timeout:45000,maxBuffer:2000000});await state();return json(res,200,JSON.parse(r.stdout.replace(/^\uFEFF/,'').trim()));}finally{fs.rmSync(tmp,{force:true});fs.rmdirSync(tempDir);}}
    if(route==='lcsc/refresh'&&method==='POST'){
      rate(req,'lcsc',3);const source=await store.backup(key,lid),tracked=source.parts.filter(x=>(x.watch||source.stocks.some(s=>s.partId===x.id))&&x.lcscCode);
      check(tracked.length>0&&tracked.length<=500,'请填写元件的立创编号，每次最多500种');const items=[],errors=[],asOf=new Date().toISOString();
      for(let i=0;i<tracked.length;i+=5){const rows=tracked.slice(i,i+5),results=await Promise.allSettled(rows.map(p=>fetchLcscDetail(p.lcscCode)));
       results.forEach((r,j)=>{if(r.status==='rejected'||!r.value.prices.length){errors.push(rows[j].lcscCode);return;}for(const tier of r.value.prices)items.push({sku:rows[j].sku,source:r.value.source,sourceUrl:r.value.sourceUrl,asOf,price:tier.price,currency:r.value.currency,quantityTier:tier.quantityTier,notice:'国际接口美元阶梯价；不代表国内人民币成交价'});});}
      const report={at:asOf,failedCodes:errors,checked:tracked.length};
      if(!items.length){const result=await store.priceStatus(key,lid,report);return json(res,200,{...result,checked:tracked.length,matched:0,failed:errors.length});}
      const result=await store.feedCommit(key,lid,source.rev,{items,report});return json(res,200,{...result,checked:tracked.length,failed:errors.length});
    }
    if(route==='feed/refresh'&&method==='POST')throw new Error('请使用立创价格刷新；本版本尚未配置自定义厂商消息源');
    return json(res,404,{error:'接口不存在'});
  }
  if(preview&&u.pathname.startsWith('/downloads/'))check((await store.me(cookie(req))).user.appOwner,'仅限 APP 所有者',403);
  if(preview&&u.pathname==='/downloads/component-hub.apk')u.pathname='/downloads/component-hub-owner-preview.apk';
  check(['GET','HEAD'].includes(req.method),'不支持的请求方式',405);const rel=decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname),file=path.resolve(publicDir,'.'+rel);check(file.startsWith(publicDir+path.sep),'路径无效',404);check(fs.existsSync(file)&&fs.statSync(file).isFile(),'文件不存在',404);
  const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.apk':'application/vnd.android.package-archive'};
  const downloadHeaders=path.extname(file)==='.apk'?{'Content-Length':fs.statSync(file).size,'Content-Disposition':'attachment; filename="component-hub-'+appVersion+'.apk"','Cache-Control':'no-store'}:{};
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",...downloadHeaders});if(req.method==='HEAD')return res.end();fs.createReadStream(file).pipe(res);
}catch(e){const dbFailure=e.code&&typeof e.code==='string';json(res,dbFailure?503:(e.status||400),{error:dbFailure?'云数据库暂时不可用，请稍后刷新核对。未显示成功的操作请勿反复更换编号提交。':(e.message||'请求失败')});}});
server.listen(port,host,()=>console.log('元件仓 '+appVersion+' listening on '+port));
server.on('error',e=>{console.error('服务启动失败：'+(e.code||'UNKNOWN'));process.exitCode=1;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{live.close();server.closeAllConnections();server.close(async()=>{await store.close();process.exit(0);});});
