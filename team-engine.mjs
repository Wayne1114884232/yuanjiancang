import {randomUUID,randomBytes,createHash,scrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {emptyState,applyAction,validateBackup,normalizePart,mergeFeed} from './domain.mjs';

const derive=promisify(scrypt),uid=()=>randomUUID(),now=()=>new Date().toISOString();
const digest=x=>createHash('sha256').update(String(x)).digest('hex');
const token=()=>randomBytes(24).toString('hex');
const text=(x,n=200)=>String(x??'').trim().slice(0,n);
export function check(ok,message,status=400){if(!ok)throw Object.assign(new Error(message),{status});}
const manage=m=>['owner','admin'].includes(m.role);
const publicUser=u=>({id:u.id,username:u.username,recoveryReady:Boolean(u.recoveryHash),recoveryCreatedAt:u.recoveryCreatedAt||null});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const int=(n,min,max)=>Number.isSafeInteger(Number(n))&&Number(n)>=min&&Number(n)<=max;
const rank={readonly:0,member:1,admin:2,owner:3};
const globalActions=new Set(['parts.bulkUpdate','location.save','settings.save']);
const allowedActions=new Set(['part.save','parts.bulkUpdate','location.save','settings.save','stock.post','stock.batch','stock.bulkPost','bom.post','project.save','project.reserve','project.release','project.issue','procurement.bulkAdd','procurement.save','procurement.receive','procurement.cancel','usage.record','substitution.save','container.save','container.assign','container.stocktake','finishedGood.post','stock.transfer','order.undo','price.record','library.restore']);

export const emptyDocument=()=>({schema:2,revision:0,users:[],sessions:[],libraries:[],members:[],invites:[],requests:[],shares:[],approvals:[],audit:[],transfers:[],migrations:[],receipts:[]});
export class TeamEngine {
  constructor(document){this.document=structuredClone(document);this.changed=false;}
  read(){return structuredClone(this.document);}
  transaction(fn){const next=this.read(),result=fn(next);check(!result?.then,'事务不能包含异步操作');next.revision++;this.document=next;this.changed=true;return result;}
  auth(db,key){const session=db.sessions.find(x=>x.hash===digest(key||'')&&!x.revokedAt&&Date.parse(x.expiresAt)>Date.now());check(session,'请登录账号',401);const user=db.users.find(x=>x.id===session.userId);check(user,'账号不存在',401);return {user,session};}
  access(db,userId,libraryId){const library=db.libraries.find(x=>x.id===libraryId),member=db.members.find(x=>x.userId===userId&&x.libraryId===libraryId);check(library&&member,'你没有此元件库的访问权限',403);return {library,member};}
  audit(db,lid,actor,action,detail={}){db.audit.push({id:uid(),libraryId:lid,userId:actor.id,username:actor.username,action,detail,at:now()});}
  newLibrary(db,user,name,personal=false){check(text(name),'请填写元件库名称');check(db.libraries.filter(x=>x.ownerId===user.id).length<30,'每个账号最多创建30个库');const library={id:uid(),name:text(name,80),ownerId:user.id,personal,createdAt:now(),policy:{approvals:false},state:emptyState(),backups:[]};db.libraries.push(library);db.members.push({id:uid(),libraryId:library.id,userId:user.id,role:'owner',locations:null,projects:null,createdAt:now()});this.audit(db,library.id,user,'library.create',{name:library.name});return library;}
  workspace(db,l,m){return {id:l.id,name:l.name,ownerId:l.ownerId,personal:l.personal,role:m.role,locations:m.locations,projects:m.projects,policy:l.policy};}
  meFrom(db,user,session){return {user:publicUser(user),sessionId:session.id,revision:db.revision,workspaces:db.members.filter(x=>x.userId===user.id).map(m=>this.workspace(db,db.libraries.find(x=>x.id===m.libraryId),m))};}
  me(key){const db=this.read(),{user,session}=this.auth(db,key);return this.meFrom(db,user,session);}
  async register(name,password,device){name=text(name,40);check(/^[\p{L}\p{N}_.@-]{3,40}$/u.test(name),'账号须为3～40位中英文、数字或 _ . @ -');check(typeof password==='string'&&password.length>=8&&password.length<=128,'密码须为8～128位');const salt=token(),hash=(await derive(password,salt,32)).toString('hex');
    return this.transaction(db=>{check(!db.users.some(x=>x.username.toLowerCase()===name.toLowerCase()),'账号已存在');const user={id:uid(),username:name,password:{salt,hash},createdAt:now()};db.users.push(user);this.newLibrary(db,user,'我的库存',true);return this.newSession(db,user,device);});
  }
  newSession(db,user,device){const key=token(),session={id:uid(),hash:digest(key),userId:user.id,device:text(device||'浏览器',120),createdAt:now(),expiresAt:new Date(Date.now()+30*86400000).toISOString()};db.sessions=db.sessions.filter(x=>Date.parse(x.expiresAt)>Date.now());db.sessions.push(session);return {key,...this.meFrom(db,user,session)};}
  async login(name,password,device){check(typeof password==='string'&&password.length<=128,'账号或密码不正确',401);const db=this.read(),user=db.users.find(x=>x.username.toLowerCase()===text(name,40).toLowerCase());const salt=user?.password.salt||'unused-password-salt',hash=await derive(password,salt,32);check(user&&timingSafeEqual(hash,Buffer.from(user.password.hash,'hex')),'账号或密码不正确',401);return this.transaction(db=>{const latest=db.users.find(x=>x.id===user.id);check(same(latest.password,user.password),'密码已变化，请重新登录',401);return this.newSession(db,latest,device);});}
  async checkPassword(user,password){check(typeof password==='string'&&password.length<=128,'原密码不正确',401);const hash=await derive(password,user.password.salt,32);check(timingSafeEqual(hash,Buffer.from(user.password.hash,'hex')),'原密码不正确',401);}
  async passwordChange(key,input){
    const {user}=this.auth(this.read(),key);await this.checkPassword(user,input.currentPassword);
    check(typeof input.password==='string'&&input.password.length>=8&&input.password.length<=128,'新密码须为8～128位');
    const salt=token(),hash=(await derive(input.password,salt,32)).toString('hex');
    return this.transaction(db=>{const {user:latest,session}=this.auth(db,key);check(same(latest.password,user.password),'密码已变化，请重新登录',409);latest.password={salt,hash};if(input.revokeOthers!==false)for(const d of db.sessions)if(d.userId===latest.id&&d.id!==session.id)d.revokedAt=now();return {ok:true};});
  }
  async recoveryCreate(key,password){
    const {user}=this.auth(this.read(),key);await this.checkPassword(user,password);const code=token();
    return this.transaction(db=>{const {user:latest}=this.auth(db,key);check(same(latest.password,user.password),'密码已变化',409);latest.recoveryHash=digest(code);latest.recoveryCreatedAt=now();return {code,createdAt:latest.recoveryCreatedAt};});
  }
  async recover(name,code,password){
    const db=this.read(),user=db.users.find(x=>x.username.toLowerCase()===text(name,40).toLowerCase());
    const expected=user?.recoveryHash||digest('invalid'),supplied=digest(text(code,200).toLowerCase());
    check(timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(supplied,'hex'))&&user?.recoveryHash,'账号或恢复码不正确，或恢复码已使用',400);
    check(typeof password==='string'&&password.length>=8&&password.length<=128,'新密码须为8～128位');
    const salt=token(),hash=(await derive(password,salt,32)).toString('hex');
    return this.transaction(next=>{const latest=next.users.find(x=>x.id===user.id);check(latest.recoveryHash===user.recoveryHash&&same(latest.password,user.password),'恢复码已失效，请重新核对',400);latest.password={salt,hash};delete latest.recoveryHash;for(const d of next.sessions)if(d.userId===latest.id)d.revokedAt=now();return {ok:true};});
  }
  logout(key){return this.transaction(db=>{const {session}=this.auth(db,key);session.revokedAt=now();return {ok:true};});}
  visibleProject(m,projectId,write=false){if(!projectId||manage(m)||m.projects===null)return true;const entry=m.projects?.find(x=>x.id===projectId);return Boolean(entry&&(!write||entry.role==='member'));}
  locationAllowed(m,id){return manage(m)||m.locations===null||m.locations?.includes(id);}
  viewState(db,l,m){
    const s=structuredClone(l.state),loc=id=>this.locationAllowed(m,id),proj=id=>this.visibleProject(m,id);
    s.locations=s.locations.filter(x=>loc(x.id));s.stocks=s.stocks.filter(x=>loc(x.locationId));const stockIds=new Set(s.stocks.map(x=>x.id));
    s.orders=s.orders.filter(o=>proj(o.projectId)).map(o=>({...o,lines:o.lines.filter(x=>stockIds.has(x.stockId))})).filter(o=>o.lines.length);
    const orders=new Set(s.orders.map(x=>x.id));s.events=s.events.filter(x=>stockIds.has(x.stockId)&&orders.has(x.orderId));
    s.projects=s.projects.filter(x=>proj(x.id));s.reservations=s.reservations.filter(x=>proj(x.projectId));s.procurementItems=s.procurementItems.filter(x=>proj(x.projectId));s.usageRecords=s.usageRecords.filter(x=>proj(x.projectId));s.substitutions=s.substitutions.filter(x=>proj(x.projectId));
    s.containers=s.containers.filter(x=>loc(x.locationId));s.finishedGoods=s.finishedGoods.filter(x=>loc(x.locationId)&&proj(x.projectId));s.finishedGoodLogs=s.finishedGoodLogs.filter(x=>s.finishedGoods.some(f=>f.id===x.finishedGoodId));
    if(!manage(m))s.settings={...s.settings,feedUrl:''};delete s.receipts;
    s.workspaceId=l.id;s.access={role:m.role,locations:m.locations,projects:m.projects,restricted:!manage(m)&&(m.locations!==null||m.projects!==null)};
    return s;
  }
  state(key,lid){const db=this.read(),{user}=this.auth(db,key),{library,member}=this.access(db,user.id,lid);return {state:this.viewState(db,library,member),workspace:this.workspace(db,library,member),revision:db.revision,role:member.role,serverTime:now()};}
  // Authorization covers referenced objects and every affected location before committing a domain clone.
  authorize(db,user,l,m,a){
    check(allowedActions.has(a.type),'操作不受支持');check(m.role!=='readonly','只读成员不能修改库存',403);
    check(!globalActions.has(a.type)||manage(m),'此操作需要管理员权限',403);
    if(a.type==='part.save'&&a.part?.id)check(manage(m),'编辑共享元件资料需要管理员权限',403);
    if(a.type==='library.restore')check(manage(m),'恢复备份需要管理员权限',403);
    const s=l.state,projectIds=new Set();
    if(a.type==='stock.batch'){
      check(Array.isArray(a.rows)&&a.rows.length>0&&a.rows.length<=1000,'批量记录数量无效');
      for(const row of a.rows){check(row.stockId,'批量记录缺少库位');this.authorize(db,user,l,m,{type:'stock.post',stockId:row.stockId,kind:row.kind});}
    }
    const requireProject=id=>{if(!id)return;check(s.projects.some(x=>x.id===id),'项目不存在');check(this.visibleProject(m,id,true),'没有此项目的操作权限',403);projectIds.add(id);};
    requireProject(a.projectId);requireProject(a.project?.id);requireProject(a.project?.previousProjectId);requireProject(a.item?.projectId);for(const x of a.items||[])requireProject(x.projectId);
    if(a.type==='project.save'&&!a.project?.id)check(manage(m)||m.projects===null,'限定项目成员不能新建项目',403);
    const checkLoc=id=>{if(id)check(s.locations.some(x=>x.id===id)&&this.locationAllowed(m,id),'没有此地点的操作权限',403);};
    checkLoc(a.locationId);checkLoc(a.container?.locationId);
    const stock=id=>{if(!id||String(id).startsWith('new:'))return;const x=s.stocks.find(x=>x.id===id);check(x,'库位不存在');checkLoc(x.locationId);};
    stock(a.stockId);for(const row of a.rows||[])if(!(row.excluded&&!row.forceInclude))stock(row.stockId);for(const row of a.counts||[])stock(row.stockId);for(const row of a.updates||[]){stock(row.stockId);checkLoc(row.locationId);}
    if(a.orderId){const o=s.orders.find(x=>x.id===a.orderId);check(o,'记录不存在');check(!o.transferId,'跨库调拨请发起反向调拨，不能只撤销一端');requireProject(o.projectId);o.lines.forEach(x=>stock(x.stockId));}
    if(a.containerId){const c=s.containers.find(x=>x.id===a.containerId);check(c,'元件盒不存在');checkLoc(c.locationId);}
    const itemId=a.itemId||a.item?.id;if(itemId){const item=s.procurementItems.find(x=>x.id===itemId);check(item,'采购项不存在');requireProject(item.projectId);if(item.assigneeId)check(manage(m)||item.assigneeId===user.id,'采购任务仅负责人或管理员可处理',403);}
    if(a.type==='procurement.save'&&!a.item?.id)check(!Number(a.item?.receivedQty),'到货请使用到货确认操作');
    if(a.type==='project.reserve'&&!manage(m)&&m.locations!==null)check(s.stocks.filter(x=>a.projectId&&s.projects.find(p=>p.id===a.projectId)?.rows.some(r=>r.partId===x.partId)&&x.qty>0).every(x=>this.locationAllowed(m,x.locationId)),'此项目跨地点预留，需要有全部相关地点权限',403);
    return projectIds;
  }
  prepare(db,user,l,m,a){this.authorize(db,user,l,m,a);let result;
    if(a.type==='library.restore'){const state=validateBackup(a.backup);delete state.access;delete state.workspaceId;state.rev=l.state.rev+1;state.receipts=[];state.settings.feedEnabled=false;state.settings.lcscEnabled=false;state.updatedAt=now();result={state};}
    else result=applyAction(l.state,a);
    const before=l.state,next=result.state;
    for(const st of next.stocks){const old=before.stocks.find(x=>x.id===st.id);if(!same(old,st))check(this.locationAllowed(m,st.locationId)&&(!old||this.locationAllowed(m,old.locationId)),'操作涉及未授权地点，整单未提交',403);}
    for(const part of next.parts){const reserved=next.reservations.filter(x=>x.partId===part.id).reduce((n,x)=>n+x.qty,0),qty=next.stocks.filter(x=>x.partId===part.id).reduce((n,x)=>n+x.qty,0);check(qty>=reserved,`${part.sku} 扣减后会占用项目预留，请先释放或通过项目领料`);}
    for(const o of next.orders.slice(before.orders.length)){o.actorId=user.id;o.actorName=user.username;}
    for(const r of next.reservations)if(!before.reservations.some(x=>x.id===r.id)){r.ownerId=user.id;r.ownerName=user.username;}
    if(a.type==='procurement.receive'){const item=next.procurementItems.find(x=>x.id===a.itemId);item.lastReceivedBy=user.id;item.lastReceivedName=user.username;item.lastReceivedAt=now();}
    return result;
  }
  sensitive(a){return (a.type==='stock.batch'&&a.rows.some(x=>['损耗','盘点'].includes(x.kind)))||(a.type==='stock.bulkPost'&&a.kind==='损耗')|| a.type==='library.restore'||a.type==='order.undo'||a.type==='container.stocktake'||(['stock.post','finishedGood.post'].includes(a.type)&&['损耗','盘点'].includes(a.kind));}
  fingerprint(a){const payload=structuredClone(a);delete payload.rev;delete payload.requestId;return digest(JSON.stringify(payload));}
  receipt(db,user,lid,a){check(typeof a.requestId==='string'&&a.requestId.length>=10&&a.requestId.length<=100,'请求缺少唯一编号');const prior=db.receipts.find(x=>x.userId===user.id&&x.libraryId===lid&&x.requestId===a.requestId);if(prior)check(prior.fingerprint===this.fingerprint(a),'同一请求编号不能用于不同操作',409);return prior;}
  saveReceipt(db,user,lid,a,result){db.receipts.push({userId:user.id,libraryId:lid,requestId:a.requestId,fingerprint:this.fingerprint(a),result});if(db.receipts.length>10000)db.receipts.splice(0,db.receipts.length-10000);}
  action(key,lid,a){return this.transaction(db=>{const {user}=this.auth(db,key),{library:l,member:m}=this.access(db,user.id,lid);this.authorize(db,user,l,m,a);const prior=this.receipt(db,user,lid,a);if(prior)return {...prior.result,duplicate:true,state:this.viewState(db,l,m)};
    check(a.rev===l.state.rev,'库存已更新，请刷新并核对后重新提交',409);const out=this.prepare(db,user,l,m,a);
    if(l.policy.approvals&&this.sensitive(a)){const preview=out.state.stocks.filter(st=>st.qty!==(l.state.stocks.find(x=>x.id===st.id)?.qty||0)).map(st=>({sku:out.state.parts.find(p=>p.id===st.partId)?.sku,location:out.state.locations.find(x=>x.id===st.locationId)?.name,bin:st.bin,before:l.state.stocks.find(x=>x.id===st.id)?.qty||0,after:st.qty}));const approval={id:uid(),libraryId:lid,userId:user.id,username:user.username,action:structuredClone(a),preview,status:'pending',at:now()};db.approvals.push(approval);const result={pending:true,approvalId:approval.id};this.saveReceipt(db,user,lid,a,result);this.audit(db,lid,user,'approval.request',{approvalId:approval.id,type:a.type});return {...result,state:this.viewState(db,l,m)};}
    this.commitAction(db,user,l,a,out);const result={...out};delete result.state;this.saveReceipt(db,user,lid,a,result);return {...result,state:this.viewState(db,l,m)};
  });}
  backupBefore(l,reason){l.backups.push({id:uid(),createdAt:now(),reason,state:structuredClone(l.state)});l.backups=l.backups.slice(-10);}
  commitAction(db,user,l,a,out){if(a.type==='library.restore')this.backupBefore(l,'恢复前自动备份');l.state=out.state;this.audit(db,l.id,user,a.type,{rev:l.state.rev,orderId:out.order?.id||'',kind:a.kind||''});}
  approve(key,lid,id,decision){return this.transaction(db=>{const {user}=this.auth(db,key),{library:l,member:m}=this.access(db,user.id,lid);check(manage(m),'只有管理员可以审批',403);const p=db.approvals.find(x=>x.id===id&&x.libraryId===lid);check(p?.status==='pending','申请不存在或已经处理');check(p.userId!==user.id,'不能审批自己的申请，请由另一位管理员处理');check(['approve','reject'].includes(decision),'审批结果无效');
    if(decision==='approve'){const actor=db.users.find(x=>x.id===p.userId),access=this.access(db,actor.id,lid);check(l.state.rev===p.action.rev,'申请期间库存已变化，请驳回后重新申请',409);const out=this.prepare(db,actor,l,access.member,p.action);this.commitAction(db,actor,l,p.action,out);p.status='approved';}
    else p.status='rejected';p.reviewedBy=user.id;p.reviewedAt=now();this.audit(db,lid,user,'approval.'+decision,{approvalId:id});return {ok:true,state:this.viewState(db,l,m)};
  });}
  scope(db,l,input){let locations=null,projects=null;
    if(input.locations!==null&&input.locations!==undefined){check(Array.isArray(input.locations),'地点范围无效');locations=[...new Set(input.locations)];check(locations.every(id=>l.state.locations.some(x=>x.id===id)),'地点范围包含不存在的地点');}
    if(input.projects!==null&&input.projects!==undefined){check(Array.isArray(input.projects),'项目范围无效');projects=input.projects.map(x=>({id:x.id,role:x.role}));check(new Set(projects.map(x=>x.id)).size===projects.length&&projects.every(x=>['readonly','member'].includes(x.role)&&l.state.projects.some(p=>p.id===x.id)),'项目范围无效');}
    return {locations,projects};
  }
  team(key,lid){const db=this.read(),{user,session}=this.auth(db,key),{library:l,member:m}=this.access(db,user.id,lid),isManager=manage(m);return {revision:db.revision,workspace:this.workspace(db,l,m),members:db.members.filter(x=>x.libraryId===lid).map(x=>({userId:x.userId,username:db.users.find(u=>u.id===x.userId)?.username,role:x.role,...(isManager?{locations:x.locations,projects:x.projects}: {})})),audit:db.audit.filter(x=>x.libraryId===lid&&(isManager||x.userId===user.id)).slice(-300).reverse(),approvals:db.approvals.filter(x=>x.libraryId===lid&&(isManager||x.userId===user.id)).map(x=>({...x,action:{type:x.action.type,kind:x.action.kind,rev:x.action.rev,stockId:x.action.stockId,qty:x.action.qty,orderId:x.action.orderId,note:x.action.note,backup:x.action.backup?{parts:x.action.backup.parts.length,stocks:x.action.backup.stocks.length}:undefined}})),invites:isManager?db.invites.filter(x=>x.libraryId===lid).map(({hash,...x})=>x):[],shares:isManager?db.shares.filter(x=>x.libraryId===lid).map(({hash,...x})=>x):[],requests:isManager?db.requests.filter(x=>x.libraryId===lid):[],devices:db.sessions.filter(x=>x.userId===user.id&&!x.revokedAt&&Date.parse(x.expiresAt)>Date.now()).map(({hash,...x})=>({...x,current:x.id===session.id})),backups:isManager?l.backups.map(({state,...x})=>({...x,parts:state.parts.length,rev:state.rev})):[],transfers:isManager?db.transfers.filter(x=>x.from===lid||x.to===lid):[]};}
  teamAction(key,lid,a){return this.transaction(db=>{const {user,session}=this.auth(db,key);let access;if(a.type==='invite.join'){const inv=db.invites.find(x=>x.hash===digest(text(a.code).toUpperCase())&&!x.revokedAt&&!x.usedAt&&Date.parse(x.expiresAt)>Date.now());check(inv,'邀请码无效、已使用或已过期');lid=inv.libraryId;access={library:db.libraries.find(x=>x.id===lid),member:null};check(access.library,'元件库不存在');}else access=this.access(db,user.id,lid);const {library:l,member:m}=access;check(a.revision===db.revision,'协作设置已变化，请刷新后重新提交',409);let result={ok:true};
    if(a.type==='library.create'){const created=this.newLibrary(db,user,a.name);return {workspaceId:created.id};}
    if(a.type==='invite.join'){const inv=db.invites.find(x=>x.hash===digest(text(a.code).toUpperCase())&&!x.revokedAt&&!x.usedAt&&Date.parse(x.expiresAt)>Date.now());check(inv,'邀请码无效、已使用或已过期');check(!db.members.some(x=>x.userId===user.id&&x.libraryId===inv.libraryId),'你已加入此库');const inviter=db.members.find(x=>x.userId===inv.createdBy&&x.libraryId===inv.libraryId);check(inviter&&manage(inviter)&&(inv.role!=='admin'||inviter.role==='owner'),'邀请人的权限已失效');const library=db.libraries.find(x=>x.id===inv.libraryId);const scope=this.scope(db,library,inv);db.members.push({id:uid(),libraryId:library.id,userId:user.id,role:inv.role,...scope,createdAt:now()});inv.usedAt=now();inv.usedBy=user.id;this.audit(db,library.id,user,'invite.join',{role:inv.role});return {workspaceId:library.id};}
    if(a.type==='join.request'){const target=db.libraries.find(x=>x.id===text(a.libraryId));check(target,'元件库编号不存在');check(!db.members.some(x=>x.userId===user.id&&x.libraryId===target.id),'你已经是成员');check(!db.requests.some(x=>x.userId===user.id&&x.libraryId===target.id&&x.status==='pending'),'已申请，等待管理员处理');db.requests.push({id:uid(),libraryId:target.id,userId:user.id,username:user.username,message:text(a.message,500),status:'pending',at:now()});return result;}
    if(a.type==='device.revoke'){const d=db.sessions.find(x=>x.id===a.id&&x.userId===user.id);check(d,'设备不存在');d.revokedAt=now();return {...result,loggedOut:d.id===session.id};}
    check(manage(m),'此操作需要管理员权限',403);
    if(a.type==='library.rename'){check(text(a.name),'名称不能为空');l.name=text(a.name,80);}
    else if(a.type==='policy.save'){check(m.role==='owner','只有所有者可修改审批规则',403);if(a.approvals)check(db.members.filter(x=>x.libraryId===lid&&manage(x)).length>=2,'开启审批需要至少两位所有者/管理员');l.policy.approvals=Boolean(a.approvals);}
    else if(a.type==='invite.create'){check(['admin','member','readonly'].includes(a.role),'角色无效');check(a.role!=='admin'||m.role==='owner','只有所有者可以邀请管理员',403);check(int(a.days,1,30),'有效期须为1～30天');const scope=this.scope(db,l,a);const code=randomBytes(10).toString('hex').toUpperCase();db.invites.push({id:uid(),libraryId:lid,hash:digest(code),role:a.role,...scope,createdBy:user.id,createdAt:now(),expiresAt:new Date(Date.now()+Number(a.days)*86400000).toISOString()});result={code};}
    else if(a.type==='invite.revoke'){const inv=db.invites.find(x=>x.id===a.id&&x.libraryId===lid);check(inv,'邀请不存在');inv.revokedAt=now();}
    else if(a.type==='member.save'||a.type==='member.remove'){const target=db.members.find(x=>x.libraryId===lid&&x.userId===a.userId);check(target,'成员不存在');check(target.role!=='owner','不能修改或移除所有者');check(target.userId!==user.id,'请由其他管理员调整你的权限');check(m.role==='owner'||(target.role!=='admin'&&a.role!=='admin'),'只有所有者可以调整管理员',403);
      if(a.type==='member.remove'){db.members=db.members.filter(x=>x!==target);for(const inv of db.invites.filter(x=>x.libraryId===lid&&x.createdBy===target.userId))inv.revokedAt=now();}
      else {check(['admin','member','readonly'].includes(a.role),'角色无效');Object.assign(target,{role:a.role,...this.scope(db,l,a)});}
    }
    else if(a.type==='request.review'){const r=db.requests.find(x=>x.id===a.id&&x.libraryId===lid&&x.status==='pending');check(r,'申请已处理或不存在');check(['approve','reject'].includes(a.decision),'处理结果无效');if(a.decision==='approve'){check(['member','readonly'].includes(a.role),'申请加入可授予出入库或只读权限');check(!db.members.some(x=>x.libraryId===lid&&x.userId===r.userId),'申请人已是成员');db.members.push({id:uid(),libraryId:lid,userId:r.userId,role:a.role,...this.scope(db,l,a),createdAt:now()});}r.status=a.decision==='approve'?'approved':'rejected';r.reviewedBy=user.id;r.reviewedAt=now();}
    else if(a.type==='share.create'){check(int(a.days,1,30),'有效期须为1～30天');const key=token();db.shares.push({id:uid(),libraryId:lid,hash:digest(key),createdBy:user.id,createdAt:now(),expiresAt:new Date(Date.now()+Number(a.days)*86400000).toISOString()});result={shareKey:key};}
    else if(a.type==='share.revoke'){const share=db.shares.find(x=>x.id===a.id&&x.libraryId===lid);check(share,'分享不存在');share.revokedAt=now();}
    else if(a.type==='backup.create'){this.backupBefore(l,'手动库级备份');}
    else if(a.type==='procurement.assign'){const item=l.state.procurementItems.find(x=>x.id===a.itemId);check(item,'采购项不存在');const target=db.members.find(x=>x.libraryId===lid&&x.userId===a.userId&&rank[x.role]>=1);check(target&&this.visibleProject(target,item.projectId,true),'负责人没有此项目的操作权限');item.assigneeId=target.userId;item.assigneeName=db.users.find(x=>x.id===target.userId).username;l.state.rev++;}
    else throw new Error('协作操作不受支持');
    if(l.policy.approvals)check(db.members.filter(x=>x.libraryId===lid&&manage(x)).length>=2,'请先关闭审批，再减少管理员人数');
    this.audit(db,lid,user,a.type,{targetId:a.userId||a.id||a.itemId||'',role:a.role||''});return result;
  });}
  backup(key,lid,id){const db=this.read(),{user}=this.auth(db,key),{library:l,member:m}=this.access(db,user.id,lid);check(manage(m),'完整库备份需要管理员权限',403);const state=id?l.backups.find(x=>x.id===id)?.state:l.state;check(state,'备份不存在');return structuredClone(state);}
  share(key){const db=this.read(),share=db.shares.find(x=>x.hash===digest(key)&&!x.revokedAt&&Date.parse(x.expiresAt)>Date.now());check(share,'分享已过期或已撤销',404);const creator=db.members.find(x=>x.userId===share.createdBy&&x.libraryId===share.libraryId);check(creator&&manage(creator),'分享已失效',404);const l=db.libraries.find(x=>x.id===share.libraryId),s=l.state;return {name:l.name,updatedAt:s.updatedAt||s.createdAt,expiresAt:share.expiresAt,items:s.stocks.map(st=>{const p=s.parts.find(x=>x.id===st.partId);return {sku:p.sku,name:p.name,category:p.category,package:p.package,value:p.value,qty:st.qty};})};}
  importLegacy(key,lid,raw,sourceDigest){return this.transaction(db=>{const {user}=this.auth(db,key),{library:l,member:m}=this.access(db,user.id,lid);check(m.role==='owner','只有库所有者可迁移旧库',403);check(!db.migrations.some(x=>x.digest===sourceDigest),'此份旧库存已迁移，避免重复建库');check(l.state.parts.length===0&&l.state.orders.length===0&&l.state.projects.length===0,'迁移目标必须是空库');const s=validateBackup(raw);s.settings.feedEnabled=false;s.settings.lcscEnabled=false;delete s.workspaceId;delete s.access;s.receipts=[];this.backupBefore(l,'迁移前');l.state=s;l.state.rev++;db.migrations.push({digest:sourceDigest,userId:user.id,libraryId:lid,at:now()});this.audit(db,lid,user,'legacy.import',{parts:s.parts.length,stocks:s.stocks.length});return {state:this.viewState(db,l,m)};});}
  transfer(key,fromId,a){return this.transaction(db=>{const {user}=this.auth(db,key),src=this.access(db,user.id,fromId),dest=this.access(db,user.id,a.toLibraryId);check(src.library.id!==dest.library.id,'请选择另一个元件库');check(manage(src.member)&&manage(dest.member),'跨库调拨需要你在两端都有管理员权限',403);check(!src.library.policy.approvals&&!dest.library.policy.approvals,'启用敏感操作审批的库暂不支持跨库调拨，请由所有者关闭规则后操作');const prior=this.receipt(db,user,fromId,{...a,type:'library.transfer'});if(prior)return {duplicate:true,...prior.result};check(a.rev===src.library.state.rev&&a.toRev===dest.library.state.rev,'两端库存已变化，请重新核对调拨',409);const st=src.library.state.stocks.find(x=>x.id===a.stockId);check(st,'来源库位不存在');check(int(a.qty,1,1e9),'数量须为正整数');const original=src.library.state.parts.find(x=>x.id===st.partId),tid=uid(),note=`跨库调拨 ${tid} ${text(a.note,500)}`;
    const out=this.prepare(db,user,src.library,src.member,{type:'stock.post',stockId:st.id,kind:'出库',qty:Number(a.qty),note,requestId:a.requestId});let targetState=structuredClone(dest.library.state),p=targetState.parts.find(x=>x.sku.toLowerCase()===original.sku.toLowerCase());
    if(p){const keys=['category','mount','package','value','voltage','tolerance','dielectric','manufacturer','lcscCode','power','current','polarity','rdson','vgs'];check(keys.every(k=>(p[k]||'')===(original[k]||'')),'目标库存在同型号但参数不同的元件，请先核对资料，整单未提交');}
    else {p=normalizePart({...original,id:undefined});targetState.parts.push(p);}
    const incoming=applyAction(targetState,{type:'stock.post',kind:'入库',partId:p.id,locationId:a.locationId,bin:a.bin||'',qty:Number(a.qty),note,requestId:a.requestId});out.order.transferId=tid;incoming.order.transferId=tid;incoming.order.actorId=user.id;incoming.order.actorName=user.username;src.library.state=out.state;dest.library.state=incoming.state;const transfer={id:tid,from:fromId,to:dest.library.id,fromName:src.library.name,toName:dest.library.name,sku:original.sku,qty:Number(a.qty),userId:user.id,username:user.username,at:now(),outOrderId:out.order.id,inOrderId:incoming.order.id};db.transfers.push(transfer);this.audit(db,fromId,user,'library.transfer.out',{transferId:tid,qty:transfer.qty});this.audit(db,dest.library.id,user,'library.transfer.in',{transferId:tid,qty:transfer.qty});const result={transfer};this.saveReceipt(db,user,fromId,{...a,type:'library.transfer'},result);return result;
  });}
  priceStatus(key,lid,report){return this.transaction(db=>{const {user}=this.auth(db,key),{library:l,member:m}=this.access(db,user.id,lid);check(manage(m),'需要管理员权限',403);l.state.settings.lcscLastAttempt=report.at;l.state.settings.lcscLastSyncError='本次未获取有效报价：'+report.failedCodes.join('、');l.state.rev++;l.state.updatedAt=now();return {state:this.viewState(db,l,m)};});}
  feedCommit(key,lid,rev,feed){return this.transaction(db=>{const {user}=this.auth(db,key),{library:l,member:m}=this.access(db,user.id,lid);check(manage(m),'行情刷新需要管理员权限',403);check(l.state.rev===rev,'行情读取期间库存已变化，请重新刷新',409);const out=mergeFeed(l.state,feed);l.state=out.state;if(feed.report){l.state.settings.lcscLastSync=feed.report.at;l.state.settings.lcscLastSyncError=feed.report.failedCodes.length?'以下编号获取失败：'+feed.report.failedCodes.join('、'):'';}this.audit(db,lid,user,'feed.refresh',{matched:out.matched});return {...out,state:this.viewState(db,l,m)};});}
}
