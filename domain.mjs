import {labelPartConflicts} from './public/logic.js';
import { randomUUID } from 'node:crypto';

export const categories = ['电容','电阻','电感','二极管','三极管','MOS管','IC','连接器','其他'];
export const id = () => randomUUID();
export const now = () => new Date().toISOString();
export const copy = x => structuredClone(x);
export function assert(ok, message) { if (!ok) throw new Error(message); }
export function integer(value, label, min = 0) {
  const n = Number(value); assert(value !== '' && value !== null && value !== undefined && Number.isSafeInteger(n) && n >= min && n <= 1_000_000_000, `${label}必须是 ${min}～10亿之间的整数`); return n;
}
export function decimal(value, label, min = 0, max = 1e9) {
  const n = Number(value); assert(value !== '' && value !== null && Number.isFinite(n) && n >= min && n <= max, `${label}超出有效范围`); return n;
}
export const clean = (v, max = 500) => String(v ?? '').trim().slice(0,max);
export function url(v) { const s = clean(v,2000); if (!s) return ''; let u; try { u = new URL(s); } catch { throw new Error('链接必须是完整的 http 或 https 地址'); } assert(['http:','https:'].includes(u.protocol) && !u.username && !u.password, '链接只支持 http 或 https'); return u.href; }
export function emptyState() { return {schemaVersion:1,rev:0,createdAt:now(),locations:['公司','学校','家'].map(name=>({id:id(),name,note:''})),parts:[],stocks:[],orders:[],events:[],observations:[],projects:[],reservations:[],procurementItems:[],usageRecords:[],substitutions:[],containers:[],finishedGoods:[],finishedGoodLogs:[],settings:{priceThreshold:10,lcscEnabled:true,lcscLastSync:null,lcscLastSyncError:'',feedUrl:'',feedEnabled:false,lastSync:null,lastSyncError:''}}; }
export function normalizePart(raw, existing = {}) {
  const p = {...existing};
  const strings = ['sku','name','manufacturer','lcscCode','package','value','tolerance','voltage','power','current','dielectric','temperature','tcr','type','frequency','rdson','vgs','polarity','function','pins','interface','description','supplier','quantityTier'];
  for (const key of strings) p[key] = clean(raw[key], key==='description'?3000:300);
  assert(p.name, '请填写元件名称或型号'); assert(p.sku, '请填写唯一编号 / 型号');
  assert(categories.includes(raw.category), '请选择有效分类'); p.category=raw.category;
  assert(['贴片','插件'].includes(raw.mount), '请选择贴片或插件'); p.mount=raw.mount;
  if(!p.lcscCode&&/^C\d+$/i.test(p.sku))p.lcscCode=p.sku.toUpperCase();
  if(p.lcscCode){p.lcscCode=p.lcscCode.toUpperCase();assert(/^C\d+$/.test(p.lcscCode),'立创商城编号格式应为 C 加数字，例如 C17976');}
  p.datasheetUrl=url(raw.datasheetUrl); p.purchaseUrl=url(raw.purchaseUrl);
  p.minStock=integer(raw.minStock??0,'安全库存'); p.watch=Boolean(raw.watch);
  p.id = existing.id || id(); p.createdAt=existing.createdAt||now(); p.updatedAt=now(); return p;
}
export function findStock(s, partId, locationId, bin = '') {
  assert(s.parts.some(p=>p.id===partId),'元件不存在'); assert(s.locations.some(l=>l.id===locationId),'地点不存在');
  bin=clean(bin,200); let stock=s.stocks.find(x=>x.partId===partId && x.locationId===locationId && x.bin===bin);
  if (!stock) { stock={id:id(),partId,locationId,bin,qty:0}; s.stocks.push(stock); } return stock;
}
function bomSlug(value) { return clean(value).toUpperCase().replace(/[μµ]/g,'U').replace(/Ω/g,'OHM').replace(/[^A-Z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,55); }
function bomCategory(value, sku, packageName='') {
  const text=`${value||''} ${sku||''}`.toUpperCase();
  if(/(?:F$|UF|NF|PF|CAP|电容)/i.test(text))return '电容'; if(/(?:OHM|Ω|RES|电阻)/i.test(text))return '电阻'; if(/(?:H$|UH|NH|MH|IND|电感)/i.test(text))return '电感';
  if(/(?:DIODE|TVS|ESD|LED|SCHOTTKY|二极管)/i.test(text)||/^D\d/.test(text))return '二极管'; if(/(?:MOS|FET|2N700|AO340|IRL|MOS管)/i.test(text))return 'MOS管'; if(/(?:BJT|BC8|2N[234]|三极管)/i.test(text)||/^Q\d/.test(text))return '三极管';
  if(/(?:CONN|HEADER|USB|JACK|连接器)/i.test(text)||/^J\d/.test(text))return '连接器'; if(/(?:IC|MCU|STM|ESP|CH\d|TPS|AMS|LDO|DRIVER|SENSOR|FLASH|EEPROM)/i.test(text)||/^U\d/.test(text))return 'IC'; return '其他';
}
function normalizeBomDraft(raw={}) {
  const value=clean(raw.value), packageName=clean(raw.package), rawSku=clean(raw.sku), category=categories.includes(raw.category)?raw.category:bomCategory(value,rawSku,packageName), mount=['贴片','插件'].includes(raw.mount)?raw.mount:/(?:DIP|THT|TH_|AXIAL|RADIAL|插件|THROUGH)/i.test(packageName)?'插件':'贴片';
  const sku=rawSku||`BOM-${category}-${bomSlug(value||raw.reference||'PART')}${packageName?`-${bomSlug(packageName)}`:''}`; const name=clean(raw.name)||rawSku||value||clean(raw.reference)||sku;
  const tolerance=clean(raw.tolerance)||((value.match(/(?:±|\+\/\-)?\s*(0\.1|0\.5|1|2|5|10|20)\s*%/)||[])[1]||''); const voltage=clean(raw.voltage)||((value.match(/\b\d+(?:\.\d+)?\s*[kKmM]?V\b/i)||[])[0]||'');
  return normalizePart({...raw,sku,name,category,mount,package:packageName,value,tolerance,voltage,minStock:0,watch:false,description:clean(raw.description)||`BOM 导入自动建档${raw.reference?`；位号：${clean(raw.reference)}`:''}`});
}
function postOrder(s, {type, note='', boards=1, source='手动', lines, requestId, projectId='', procurementItemId='',lotCode='',supplier='',labelText=''}) {
  assert(Array.isArray(lines)&&lines.length>0&&lines.length<=1000,'请选择至少一个元件，单批最多1000行');
  const aggregate=new Map();
  for (const line of lines) { assert(s.stocks.some(x=>x.id===line.stockId),'库位不存在'); assert(Number.isSafeInteger(line.delta),'数量必须为整数'); const a=aggregate.get(line.stockId)||0; aggregate.set(line.stockId,a+line.delta); }
  for (const [stockId,delta] of aggregate) { const st=s.stocks.find(x=>x.id===stockId); const p=s.parts.find(x=>x.id===st.partId); assert(st.qty+delta>=0,`${p.sku} 库存不足：需 ${-delta}，现有 ${st.qty}，整单未提交`); assert(Number.isSafeInteger(st.qty+delta)&&st.qty+delta<=1e9,'库存数量超出范围'); }
  const order={id:id(),time:now(),type,note:clean(note,2000),lotCode:clean(lotCode,300),supplier:clean(supplier,300),labelText:clean(labelText,6000),boards,source:clean(source),lines:copy(lines),requestId:clean(requestId),projectId:clean(projectId),procurementItemId:clean(procurementItemId),undoneBy:null};
  for (const [stockId,delta] of aggregate) {
    if (!delta) continue;
    const stock=s.stocks.find(x=>x.id===stockId); const before=stock.qty; stock.qty+=delta;
    s.events.push({id:id(),orderId:order.id,time:order.time,stockId,partId:stock.partId,locationId:stock.locationId,bin:stock.bin,before,delta,after:stock.qty,type,note:order.note,lotCode:order.lotCode,supplier:order.supplier});
  }
  s.orders.push(order); return order;
}

function partTotal(s,partId){return s.stocks.filter(x=>x.partId===partId).reduce((n,x)=>n+x.qty,0);}
function reservedTotal(s,partId,exceptProjectId=''){return s.reservations.filter(x=>x.partId===partId&&x.projectId!==exceptProjectId).reduce((n,x)=>n+x.qty,0);}
function normalizeProject(s,raw,existing={}){
  const p={...existing,id:existing.id||id(),name:clean(raw.name,120),version:clean(raw.version,80),note:clean(raw.note,2000),status:['active','archived'].includes(raw.status)?raw.status:'active',previousProjectId:clean(raw.previousProjectId),updatedAt:now(),createdAt:existing.createdAt||now()};
  assert(p.name,'请填写项目名称');if(p.previousProjectId)assert(s.projects.some(x=>x.id===p.previousProjectId&&x.id!==p.id),'上一版项目不存在');
  assert(Array.isArray(raw.rows)&&raw.rows.length>0&&raw.rows.length<=1000,'项目BOM必须包含1～1000行');
  const grouped=new Map();for(const row of raw.rows){assert(s.parts.some(x=>x.id===row.partId),'项目BOM包含不存在的元件');const perBoard=integer(row.perBoard,'每板用量',1),loss=integer(row.loss??0,'手动损耗');const prev=grouped.get(row.partId)||{partId:row.partId,perBoard:0,loss:0,reference:'',note:''};prev.perBoard+=perBoard;prev.loss+=loss;prev.reference=[prev.reference,clean(row.reference,500)].filter(Boolean).join(' ');prev.note=[prev.note,clean(row.note,500)].filter(Boolean).join('；');grouped.set(row.partId,prev);}
  p.rows=[...grouped.values()];return p;
}
function releaseProjectReservations(s,projectId){s.reservations=s.reservations.filter(x=>x.projectId!==projectId);}
function allocatePart(s,partId,qty,preferredLocationId=''){
  const stocks=s.stocks.filter(x=>x.partId===partId&&x.qty>0).sort((a,b)=>(b.locationId===preferredLocationId)-(a.locationId===preferredLocationId)||b.qty-a.qty);const lines=[];let left=qty;
  for(const stock of stocks){const take=Math.min(left,stock.qty);if(take){lines.push({stockId:stock.id,delta:-take,base:take,loss:0});left-=take;}if(!left)break;}
  assert(!left,`${s.parts.find(x=>x.id===partId)?.sku||'元件'} 库存不足`);return lines;
}
function validDate(value,label){const v=clean(value,80);if(v)assert(Number.isFinite(Date.parse(v)),`${label}格式无效`);return v;}
export function applyAction(original, action) {
  const s=copy(original); const result={};
  if(action.type==='label.receive') {
    integer(action.qty,'入库数量',1);const p=action.part;assert(p&&typeof p==='object','请核对标签参数');
    if(['电阻','电容','电感'].includes(p.category))assert(clean(p.value)&&clean(p.package),'请填写标称值与封装');
    let stock,partId;
    if(action.partId){const existing=s.parts.find(x=>x.id===action.partId);assert(existing,'所选元件不存在');const conflicts=labelPartConflicts(p,existing);assert(!conflicts.length,'标签参数与已有元件不符：'+conflicts.join('；'));partId=existing.id;stock=findStock(s,partId,action.locationId,action.bin);}
    else{const created=normalizePart(p);assert(!s.parts.some(x=>x.sku.toLowerCase()===created.sku.toLowerCase()),'编号已存在，请选择已有元件核对或修改编号');s.parts.push(created);partId=created.id;stock=findStock(s,partId,action.locationId,action.bin);}
    result.order=postOrder(s,{type:'入库',source:'标签核对入库',note:action.note,lotCode:action.lotCode,supplier:action.supplier,labelText:action.labelText,lines:[{stockId:stock.id,delta:Number(action.qty),base:Number(action.qty),loss:0}],requestId:action.requestId});result.partId=partId;
  } else if(action.type==='stock.batch') {
    assert(Array.isArray(action.rows)&&action.rows.length>0&&action.rows.length<=1000,'请选择1～1000笔记录');
    let next=s;const orders=[];
    for(const row of action.rows){
      assert(['入库','出库','损耗','盘点'].includes(row.kind),'批量记录类型无效');
      const st=next.stocks.find(x=>x.id===row.stockId);assert(st,'库位不存在');
      if(row.kind==='盘点')assert(Number(row.snapshotQty)===st.qty,'盘点基准已变化，请重新核对该库位');
      const out=applyAction(next,{type:'stock.post',stockId:row.stockId,kind:row.kind,qty:row.qty,boards:row.boards??1,loss:row.loss??0,note:row.note||action.note,requestId:action.requestId});next=out.state;orders.push(out.order);
    }
    next.rev=original.rev+1;return {state:next,orders};
  } else if (action.type==='part.save') {
    const existing=action.part.id?s.parts.find(p=>p.id===action.part.id):undefined;
    assert(!action.part.id||existing,'元件不存在');
    const p=normalizePart(action.part,existing); assert(!s.parts.some(x=>x.id!==p.id&&x.sku.toLowerCase()===p.sku.toLowerCase()),'编号 / 型号已存在，请使用原元件入库；不同规格请添加编号后缀');
    if (existing) s.parts[s.parts.findIndex(x=>x.id===p.id)]=p; else s.parts.push(p);
    if (!existing && !action.skipStock) {
      const stock=findStock(s,p.id,action.locationId,action.bin); const qty=integer(action.qty??0,'初始数量');
      if (qty) postOrder(s,{type:'入库',source:'新建元件',note:'初始入库',lines:[{stockId:stock.id,delta:qty,base:qty,loss:0}],requestId:action.requestId});
    } result.partId=p.id;
  } else if(action.type==='parts.bulkUpdate'){
    assert(Array.isArray(action.updates)&&action.updates.length>0&&action.updates.length<=1000,'请选择1～1000条元件');
    for(const update of action.updates){
      const existing=s.parts.find(p=>p.id===update.partId);assert(existing,'批量整理包含不存在的元件');
      const p=normalizePart({...existing,...(update.part||{})},existing);assert(!s.parts.some(x=>x.id!==p.id&&x.sku.toLowerCase()===p.sku.toLowerCase()),`${p.sku} 与现有编号重复`);s.parts[s.parts.findIndex(x=>x.id===p.id)]=p;
      if(update.stockId&&(update.locationId||update.bin!==undefined)){
        const from=s.stocks.find(x=>x.id===update.stockId&&x.partId===p.id);assert(from,'批量整理库位不存在');const locationId=update.locationId||from.locationId;assert(s.locations.some(x=>x.id===locationId),'批量整理地点不存在');const bin=clean(update.bin??from.bin,200);
        if(from.locationId!==locationId||from.bin!==bin){const to=findStock(s,p.id,locationId,bin);if(from.qty)postOrder(s,{type:'调拨',source:'批量整理',note:'批量调整元件库位',lines:[{stockId:from.id,delta:-from.qty},{stockId:to.id,delta:from.qty}],requestId:action.requestId});}
      }
    }result.updated=action.updates.length;
  } else if (action.type==='location.save') {
    const name=clean(action.name,60); assert(name,'请填写地点名称'); assert(!s.locations.some(x=>x.id!==action.id&&x.name===name),'地点名称已存在');
    if (action.id) { const l=s.locations.find(x=>x.id===action.id); assert(l,'地点不存在'); l.name=name; l.note=clean(action.note,300); }
    else s.locations.push({id:id(),name,note:clean(action.note,300)});
  } else if (action.type==='stock.post') {
    assert(['入库','出库','损耗','盘点'].includes(action.kind),'操作类型无效');
    const stock=action.stockId?s.stocks.find(x=>x.id===action.stockId):findStock(s,action.partId,action.locationId,action.bin); assert(stock,'请选择有效库位');
    const qty=integer(action.qty,'数量',action.kind==='盘点'?0:1); const boards=integer(action.boards??1,'板数',1); const loss=action.kind==='出库'?integer(action.loss??0,'额外损耗'):0;
    const base=action.kind==='出库'?qty*boards:qty; integer(base,'总用量');
    const delta=action.kind==='入库'?base:action.kind==='盘点'?qty-stock.qty:-(base+loss);
    assert(delta!==0,'盘点数量与现有库存相同，无需调整');
    result.order=postOrder(s,{type:action.kind,note:action.note,boards,lines:[{stockId:stock.id,delta,base,loss}],requestId:action.requestId});
  } else if (action.type==='stock.bulkPost') {
    assert(['出库','损耗'].includes(action.kind),'批量操作支持出库或损耗'); assert(Array.isArray(action.rows)&&action.rows.length>0&&action.rows.length<=1000,'请选择至少一个库存库位，单批最多1000个');
    const lines=action.rows.map(row=>{const stock=s.stocks.find(x=>x.id===row.stockId);assert(stock,'批量出库包含不存在的库位');const qty=integer(row.qty,'出库数量',1);assert(stock.qty>=qty,`${s.parts.find(p=>p.id===stock.partId)?.sku||'元件'} 库存不足：需 ${qty}，现有 ${stock.qty}，整批未提交`);return {stockId:stock.id,delta:-qty,base:qty,loss:0};});
    result.order=postOrder(s,{type:action.kind,note:action.note,source:action.kind==='损耗'?'批量损耗':'批量出库',lines,requestId:action.requestId});
  } else if (action.type==='bom.post') {
    assert(['入库','出库'].includes(action.kind),'BOM方向无效'); const boards=integer(action.boards,'板数',1); const rate=decimal(action.lossRate??0,'损耗率',0,100);
    assert(Array.isArray(action.rows)&&action.rows.length>0&&action.rows.length<=1000,'BOM必须包含1～1000行');
    const includedRows=action.rows.filter(row=>!(row.excluded&&!row.forceInclude));
    assert(includedRows.length>0,'BOM中没有需要入库或出库的焊接物料；如需处理螺丝、测试点等项目，请先强制纳入');
    const lines=includedRows.map(row=> {
      let stock=row.stockId&&!String(row.stockId).startsWith('new:')?s.stocks.find(x=>x.id===row.stockId):null;
      let partId=row.partId||(!stock&&String(row.stockId||'').startsWith('new:')?String(row.stockId).slice(4):'');
      if(!stock&&!partId&&row.autoPart){
        const draft=normalizeBomDraft(row.autoPart); const existing=s.parts.find(p=>p.sku.toLowerCase()===draft.sku.toLowerCase());
        if(existing)partId=existing.id; else {s.parts.push(draft);partId=draft.id;}
      }
      if(!stock&&partId)stock=findStock(s,partId,action.locationId,row.bin||'');
      assert(stock,'BOM有未匹配元件，无法提交');
      const perBoard=integer(row.perBoard,'每板用量',1); const base=perBoard*boards; integer(base,'BOM总用量'); const loss=action.kind==='出库'?Math.ceil(base*rate/100)+integer(row.loss??0,'手动损耗'):0;
      return {stockId:stock.id,delta:action.kind==='入库'?base:-(base+loss),perBoard,base,loss,reference:clean(row.reference,500)};
    });
    result.order=postOrder(s,{type:action.kind,note:action.note,boards,source:'BOM',lines,requestId:action.requestId});
  } else if(action.type==='project.save'){
    const existing=action.project?.id?s.projects.find(x=>x.id===action.project.id):undefined;assert(!action.project?.id||existing,'项目不存在');const raw=copy(action.project);const rows=raw.rows;
    assert(Array.isArray(rows)&&rows.length>0&&rows.length<=1000,'项目BOM必须包含1～1000行');
    raw.rows=rows.filter(r=>!(r.excluded&&!r.forceInclude)).map(row=>{
      if(row.partId)return row;
      assert(row.autoPart,'项目存在未确认的物料');const draft=normalizeBomDraft(row.autoPart);
      let p=s.parts.find(x=>x.sku.toLowerCase()===draft.sku.toLowerCase());
      if(p){for(const k of ['value','package','voltage','tolerance','dielectric','mount','category'])if(draft[k])assert(String(p[k]||'').toLowerCase()===String(draft[k]).toLowerCase(),draft.sku+' 与现有资料的 '+k+' 不一致，请确认型号或修改编号');}
      else{s.parts.push(draft);p=draft;}
      if(action.locationId)findStock(s,p.id,action.locationId,action.bin||'');
      return {...row,partId:p.id};
    });
    const project=normalizeProject(s,raw,existing);if(existing){s.projects[s.projects.findIndex(x=>x.id===project.id)]=project;releaseProjectReservations(s,project.id);}else s.projects.push(project);result.projectId=project.id;
  } else if(action.type==='project.reserve'){
    const project=s.projects.find(x=>x.id===action.projectId);assert(project,'项目不存在');const boards=integer(action.boards,'预留板数',1),rate=decimal(action.lossRate??0,'损耗率',0,100);const requested=[];
    for(const row of project.rows){const base=row.perBoard*boards,qty=base+Math.ceil(base*rate/100)+row.loss;integer(qty,'预留数量');const available=partTotal(s,row.partId)-reservedTotal(s,row.partId,project.id);assert(available>=qty,`${s.parts.find(x=>x.id===row.partId)?.sku} 可用 ${available}，预留需要 ${qty}`);requested.push({id:id(),projectId:project.id,partId:row.partId,qty,boards,lossRate:rate,createdAt:now()});}
    releaseProjectReservations(s,project.id);s.reservations.push(...requested);project.reservedBoards=boards;project.lossRate=rate;project.updatedAt=now();result.reserved=requested.length;
  } else if(action.type==='project.release'){
    const project=s.projects.find(x=>x.id===action.projectId);assert(project,'项目不存在');releaseProjectReservations(s,project.id);project.reservedBoards=0;project.updatedAt=now();
  } else if(action.type==='project.issue'){
    const project=s.projects.find(x=>x.id===action.projectId);assert(project,'项目不存在');const boards=integer(action.boards,'领料板数',1),rate=decimal(action.lossRate??project.lossRate??0,'损耗率',0,100),all=[];
    for(const row of project.rows){const base=row.perBoard*boards,loss=Math.ceil(base*rate/100)+row.loss,qty=base+loss;assert(partTotal(s,row.partId)-reservedTotal(s,row.partId,project.id)>=qty,`${s.parts.find(x=>x.id===row.partId)?.sku} 可用库存不足`);const allocated=allocatePart(s,row.partId,qty,action.locationId);let remainingLoss=loss;for(const line of allocated){line.loss=Math.min(remainingLoss,-line.delta);line.base=-line.delta-line.loss;remainingLoss-=line.loss;}all.push(...allocated);}
    result.order=postOrder(s,{type:'出库',note:action.note||`${project.name} ${project.version}`.trim(),boards,source:'项目BOM',lines:all,requestId:action.requestId,projectId:project.id});
    for(const row of project.rows){let consume=row.perBoard*boards+Math.ceil(row.perBoard*boards*rate/100)+row.loss;for(const r of s.reservations.filter(x=>x.projectId===project.id&&x.partId===row.partId)){const used=Math.min(consume,r.qty);r.qty-=used;consume-=used;}s.reservations=s.reservations.filter(x=>x.qty>0);}project.updatedAt=now();
  } else if(action.type==='procurement.bulkAdd'){
    assert(Array.isArray(action.items)&&action.items.length>0&&action.items.length<=1000,'采购清单必须包含1～1000项');for(const raw of action.items){assert(s.parts.some(x=>x.id===raw.partId),'采购元件不存在');if(raw.projectId)assert(s.projects.some(x=>x.id===raw.projectId),'采购项目不存在');const qty=integer(raw.requiredQty,'需求数量',1);let item=s.procurementItems.find(x=>x.partId===raw.partId&&x.projectId===clean(raw.projectId)&&!['received','cancelled'].includes(x.status));if(item){item.requiredQty=Math.max(item.requiredQty,qty);item.updatedAt=now();}else{s.procurementItems.push({id:id(),partId:raw.partId,projectId:clean(raw.projectId),needType:raw.projectId?'project':'manual',requiredQty:qty,orderedQty:0,receivedQty:0,moq:1,packMultiple:1,supplier:'立创商城',expectedAt:'',actualUnitPrice:null,currency:'CNY',note:clean(raw.note,1000),status:'needed',createdAt:now(),updatedAt:now()});}}result.updated=action.items.length;
  } else if(action.type==='procurement.save'){
    const raw=action.item||{},existing=raw.id?s.procurementItems.find(x=>x.id===raw.id):undefined;assert(!raw.id||existing,'采购项不存在');assert(s.parts.some(x=>x.id===raw.partId),'采购元件不存在');if(raw.projectId)assert(s.projects.some(x=>x.id===raw.projectId),'采购项目不存在');
    const item={...existing,id:existing?.id||id(),partId:raw.partId,projectId:clean(raw.projectId),needType:['project','safety','manual'].includes(raw.needType)?raw.needType:'manual',requiredQty:integer(raw.requiredQty??0,'需求数量'),orderedQty:integer(raw.orderedQty??0,'下单数量'),receivedQty:existing?.receivedQty??integer(raw.receivedQty??0,'已到货数量'),moq:integer(raw.moq??1,'最小起订量',1),packMultiple:integer(raw.packMultiple??1,'包装倍数',1),supplier:clean(raw.supplier||'立创商城',200),expectedAt:validDate(raw.expectedAt,'预计到货时间'),actualUnitPrice:raw.actualUnitPrice===''||raw.actualUnitPrice==null?null:decimal(raw.actualUnitPrice,'实际采购单价',0),currency:clean(raw.currency||'CNY'),note:clean(raw.note,1000),status:['needed','ordered','partial','received','cancelled'].includes(raw.status)?raw.status:'needed',createdAt:existing?.createdAt||now(),updatedAt:now()};
    assert(item.receivedQty<=item.orderedQty||item.orderedQty===0,'已到货数量不能超过下单数量');if(item.status!=='cancelled'){item.status=item.orderedQty===0?'needed':item.receivedQty>=item.orderedQty?'received':item.receivedQty>0?'partial':'ordered';}if(existing)s.procurementItems[s.procurementItems.findIndex(x=>x.id===item.id)]=item;else s.procurementItems.push(item);result.procurementItemId=item.id;
  } else if(action.type==='procurement.receive'){
    const item=s.procurementItems.find(x=>x.id===action.itemId);assert(item&&item.status!=='cancelled','采购项不存在或已取消');const qty=integer(action.qty,'到货数量',1);assert(item.orderedQty>0&&item.receivedQty+qty<=item.orderedQty,`本次最多可登记 ${Math.max(0,item.orderedQty-item.receivedQty)} 个`);const stock=findStock(s,item.partId,action.locationId,action.bin||'');result.order=postOrder(s,{type:'入库',source:'采购到货',note:action.note||item.note||item.supplier,lines:[{stockId:stock.id,delta:qty,base:qty,loss:0}],requestId:action.requestId,procurementItemId:item.id});item.receivedQty+=qty;item.status=item.receivedQty>=item.orderedQty?'received':'partial';item.updatedAt=now();
    const actual=action.actualUnitPrice===''||action.actualUnitPrice==null?item.actualUnitPrice:decimal(action.actualUnitPrice,'实际采购单价',0);if(actual){item.actualUnitPrice=actual;s.observations.push({id:id(),partId:item.partId,price:actual,currency:item.currency||'CNY',quantityTier:String(qty),source:item.supplier||'实际采购',sourceUrl:'',asOf:now(),recordedAt:now(),kind:'purchase',lifecycle:'',notice:`采购到货 ${qty} 个`});}
  } else if(action.type==='procurement.cancel'){
    const item=s.procurementItems.find(x=>x.id===action.itemId);assert(item,'采购项不存在');item.status='cancelled';item.updatedAt=now();
  } else if(action.type==='usage.record'){
    assert(s.parts.some(x=>x.id===action.partId),'元件不存在');if(action.projectId)assert(s.projects.some(x=>x.id===action.projectId),'项目不存在');const record={id:id(),partId:action.partId,projectId:clean(action.projectId),condition:clean(action.condition,1500),result:clean(action.result,1500),issue:clean(action.issue,1500),createdAt:now()};assert(record.condition||record.result||record.issue,'请填写测试条件、结果或问题');s.usageRecords.push(record);result.usageRecordId=record.id;
  } else if(action.type==='substitution.save'){
    assert(s.parts.some(x=>x.id===action.partId)&&s.parts.some(x=>x.id===action.substitutePartId)&&action.partId!==action.substitutePartId,'请选择两个不同的有效元件');if(action.projectId)assert(s.projects.some(x=>x.id===action.projectId),'项目不存在');const sub={id:id(),partId:action.partId,substitutePartId:action.substitutePartId,status:action.status==='verified'?'verified':'candidate',projectId:clean(action.projectId),conditions:clean(action.conditions,1500),note:clean(action.note,1500),createdAt:now()};assert(sub.status!=='verified'||sub.conditions,'已验证替代料必须填写验证条件');s.substitutions.push(sub);result.substitutionId=sub.id;
  } else if(action.type==='container.save'){
    const raw=action.container||{},existing=raw.id?s.containers.find(x=>x.id===raw.id):undefined;assert(!raw.id||existing,'元件盒不存在');assert(s.locations.some(x=>x.id===raw.locationId),'元件盒地点不存在');const container={...existing,id:existing?.id||id(),name:clean(raw.name,120),locationId:raw.locationId,rows:integer(raw.rows??4,'行数',1),cols:integer(raw.cols??6,'列数',1),note:clean(raw.note,500),createdAt:existing?.createdAt||now(),updatedAt:now()};assert(container.name&&container.rows*container.cols<=200,'请填写元件盒名称，格位总数不能超过200');if(existing)s.containers[s.containers.findIndex(x=>x.id===container.id)]=container;else s.containers.push(container);result.containerId=container.id;
  } else if(action.type==='container.assign'){
    const container=s.containers.find(x=>x.id===action.containerId),stock=s.stocks.find(x=>x.id===action.stockId);assert(container&&stock,'元件盒或库存不存在');const cell=clean(action.cell,30);assert(cell,'请选择格位');const [row,col]=cell.split('-').map(Number);assert(Number.isInteger(row)&&Number.isInteger(col)&&row>=1&&row<=container.rows&&col>=1&&col<=container.cols,'格位无效');const occupied=s.stocks.find(x=>x.containerId===container.id&&x.cell===cell&&x.id!==stock.id&&x.qty>0);assert(!occupied,`格位 ${cell} 已放有其他元件，请先调拨或选择空格`);const bin=`${container.name} · ${cell}`;const to=findStock(s,stock.partId,container.locationId,bin);if(stock.id!==to.id&&stock.qty)result.order=postOrder(s,{type:'调拨',source:'元件盒整理',note:`放入 ${container.name} ${cell}`,lines:[{stockId:stock.id,delta:-stock.qty},{stockId:to.id,delta:stock.qty}],requestId:action.requestId});to.containerId=container.id;to.cell=cell;container.updatedAt=now();result.stockId=to.id;
  } else if(action.type==='container.stocktake'){
    const container=s.containers.find(x=>x.id===action.containerId);assert(container,'元件盒不存在');assert(Array.isArray(action.counts)&&action.counts.length>0&&action.counts.length<=200,'盘点必须包含1～200格');const lines=[];for(const count of action.counts){const stock=s.stocks.find(x=>x.id===count.stockId&&x.containerId===container.id);assert(stock,'盘点格位已变化，请刷新后重试');const qty=integer(count.qty,'实盘数量');const delta=qty-stock.qty;if(delta)lines.push({stockId:stock.id,delta,base:Math.abs(delta),loss:0});}assert(lines.length,'实盘数量与确认库存相同，无需提交');result.order=postOrder(s,{type:'盘点',source:'元件盒连续盘点',note:action.note||container.name,lines,requestId:action.requestId});
  } else if(action.type==='finishedGood.post'){
    assert(['入库','出库','盘点'].includes(action.kind),'板卡操作类型无效');assert(s.locations.some(x=>x.id===action.locationId),'板卡地点不存在');if(action.projectId)assert(s.projects.some(x=>x.id===action.projectId),'项目不存在');const name=clean(action.name,160);assert(name,'请填写板卡或成品名称');const bin=clean(action.bin,200),qty=integer(action.qty,'板卡数量',action.kind==='盘点'?0:1);let item=s.finishedGoods.find(x=>x.name===name&&x.projectId===clean(action.projectId)&&x.locationId===action.locationId&&x.bin===bin);if(!item){item={id:id(),name,projectId:clean(action.projectId),locationId:action.locationId,bin,qty:0,createdAt:now(),updatedAt:now()};s.finishedGoods.push(item);}const before=item.qty,delta=action.kind==='入库'?qty:action.kind==='出库'?-qty:qty-before;assert(before+delta>=0,'板卡库存不足');item.qty+=delta;item.updatedAt=now();s.finishedGoodLogs.push({id:id(),finishedGoodId:item.id,time:now(),kind:action.kind,before,delta,after:item.qty,note:clean(action.note,1000)});result.finishedGoodId=item.id;
  } else if (action.type==='stock.transfer') {
    const from=s.stocks.find(x=>x.id===action.stockId); assert(from,'来源库位不存在'); const to=findStock(s,from.partId,action.locationId,action.bin); assert(from.id!==to.id,'目标地点 / 库位与来源相同'); const qty=integer(action.qty,'调拨数量',1);
    result.order=postOrder(s,{type:'调拨',source:'地点调拨',note:action.note,lines:[{stockId:from.id,delta:-qty},{stockId:to.id,delta:qty}],requestId:action.requestId});
  } else if (action.type==='order.undo') {
    const order=s.orders.find(x=>x.id===action.orderId); assert(order&&!order.undoneBy&&order.type!=='撤销','该记录无法撤销或已撤销');
    const affected=s.events.filter(x=>x.orderId===order.id); const index=s.orders.indexOf(order); const stockIds=new Set(affected.map(x=>x.stockId));
    assert(!s.orders.slice(index+1).some(o=>o.type!=='撤销'&&!o.undoneBy&&o.lines.some(l=>stockIds.has(l.stockId))),'相关库位已有后续操作，请先撤销后续操作或通过盘点修正');
    const reversal=postOrder(s,{type:'撤销',source:'撤销记录',note:`撤销 ${order.source} ${order.type}：${order.note}`,lines:affected.map(e=>({stockId:e.stockId,delta:-e.delta})),requestId:action.requestId}); order.undoneBy=reversal.id; reversal.undoOf=order.id; result.order=reversal;
  } else if (action.type==='price.record') {
    assert(s.parts.some(x=>x.id===action.partId),'元件不存在'); const price=decimal(action.price,'单价',0.0000001); const currency=clean(action.currency||'CNY'); assert(['CNY','USD','EUR','JPY','HKD'].includes(currency),'币种无效');
    const source=clean(action.source,200); assert(source,'请填写供应商 / 价格来源');
    s.observations.push({id:id(),partId:action.partId,price,currency,quantityTier:clean(action.quantityTier||'1'),source,sourceUrl:url(action.sourceUrl),asOf:now(),recordedAt:now(),kind:'manual',lifecycle:'',notice:''});
  } else if (action.type==='settings.save') {
    s.settings.priceThreshold=decimal(action.priceThreshold,'涨价提醒阈值',0.1,1000); s.settings.lcscEnabled=Boolean(action.lcscEnabled); s.settings.feedUrl=url(action.feedUrl);
    if (s.settings.feedUrl) assert(s.settings.feedUrl.startsWith('https://'),'联网数据源必须使用 HTTPS');
    s.settings.feedEnabled=Boolean(action.feedEnabled); assert(!s.settings.feedEnabled||s.settings.feedUrl,'请先填写联网数据源地址');
  } else throw new Error('不支持的操作');
  s.rev++; s.updatedAt=now(); return {state:s,...result};
}

export function validateBackup(raw) {
  assert(raw && raw.schemaVersion===1, '备份版本不支持，请选择元件仓导出的 JSON 文件'); const s=copy(raw);
  for(const key of ['projects','reservations','procurementItems','usageRecords','substitutions','containers','finishedGoods','finishedGoodLogs'])if(!Array.isArray(s[key]))s[key]=[];
  for (const key of ['locations','parts','stocks','orders','events','observations','projects','reservations','procurementItems','usageRecords','substitutions','containers','finishedGoods','finishedGoodLogs']) assert(Array.isArray(s[key])&&s[key].length<=200000,`备份 ${key} 格式无效`);
  const unique=(list,name)=> { const ids=list.map(x=>x.id); assert(ids.every(x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x))&&new Set(ids).size===ids.length,`备份${name}存在重复或无效 ID`); };
  for (const k of ['locations','parts','stocks','orders','events','observations','projects','reservations','procurementItems','usageRecords','substitutions','containers','finishedGoods','finishedGoodLogs']) unique(s[k],k);
  assert(s.locations.length>0,'备份至少需要一个地点');
  for (const l of s.locations) assert(typeof l.name==='string'&&l.name.trim(),'地点名称无效');
  s.parts=s.parts.map(p=>({...normalizePart(p,p),updatedAt:p.updatedAt||p.createdAt||now()})); assert(new Set(s.parts.map(p=>p.sku.toLowerCase())).size===s.parts.length,'备份包含重复元件编号');
  const stockKeys=new Set();
  for (const st of s.stocks) { integer(st.qty,'备份库存'); assert(s.parts.some(p=>p.id===st.partId)&&s.locations.some(l=>l.id===st.locationId),'备份库位关联无效'); assert(typeof st.bin==='string','备份库位格式无效'); const key=JSON.stringify([st.partId,st.locationId,st.bin]); assert(!stockKeys.has(key),'备份包含重复库位');stockKeys.add(key); }
  for (const o of s.orders) { assert(['入库','出库','损耗','盘点','调拨','撤销'].includes(o.type),'流水类型无效'); assert(Array.isArray(o.lines)&&o.lines.length>0,'流水批次无效'); for (const l of o.lines) assert(s.stocks.some(st=>st.id===l.stockId)&&Number.isSafeInteger(l.delta),'流水数量或库位无效'); assert(Number.isFinite(Date.parse(o.time)),'流水时间无效');o.lotCode=clean(o.lotCode,300);o.supplier=clean(o.supplier,300);o.labelText=clean(o.labelText,6000);o.source=clean(o.source);o.note=clean(o.note,2000);if(o.undoneBy)assert(s.orders.some(x=>x.id===o.undoneBy&&x.type==='撤销'&&x.undoOf===o.id),'撤销关联无效'); }
  const ledger=new Map();
  for (const e of s.events) { const st=s.stocks.find(x=>x.id===e.stockId); assert(st&&st.partId===e.partId&&st.locationId===e.locationId&&st.bin===e.bin&&s.orders.some(o=>o.id===e.orderId),'备份流水关联无效');integer(e.before,'流水前数量');integer(e.after,'流水后数量'); assert(Number.isSafeInteger(e.delta)&&e.before+e.delta===e.after,'备份流水数量不平衡'); assert((ledger.get(e.stockId)??0)===e.before,'备份流水不连续');ledger.set(e.stockId,e.after); }
  for (const st of s.stocks) assert((ledger.get(st.id)??0)===st.qty,'备份库存与流水不一致');
  for(const o of s.orders){const expected=new Map();for(const l of o.lines)expected.set(l.stockId,(expected.get(l.stockId)||0)+l.delta);const actual=new Map();for(const e of s.events.filter(x=>x.orderId===o.id))actual.set(e.stockId,(actual.get(e.stockId)||0)+e.delta);assert([...expected].every(([key,n])=>(actual.get(key)||0)===n)&&[...actual.keys()].every(key=>expected.has(key)),'备份批次与流水数量不一致');}
  for (const ob of s.observations) { assert(s.parts.some(p=>p.id===ob.partId),'价格记录关联无效'); if(ob.price!==undefined&&ob.price!==null) decimal(ob.price,'价格记录',0.0000001); url(ob.sourceUrl); assert(Number.isFinite(Date.parse(ob.asOf)),'价格记录日期无效'); }
  for(const project of s.projects){assert(typeof project.name==='string'&&project.name.trim()&&Array.isArray(project.rows)&&project.rows.length,'备份项目无效');for(const row of project.rows){assert(s.parts.some(p=>p.id===row.partId),'备份项目元件关联无效');integer(row.perBoard,'项目每板用量',1);integer(row.loss??0,'项目损耗');}}
  for(const reservation of s.reservations){assert(s.projects.some(p=>p.id===reservation.projectId)&&s.parts.some(p=>p.id===reservation.partId),'备份预留关联无效');integer(reservation.qty,'预留数量',1);}
  for(const item of s.procurementItems){assert(s.parts.some(p=>p.id===item.partId),'备份采购元件关联无效');if(item.projectId)assert(s.projects.some(p=>p.id===item.projectId),'备份采购项目关联无效');integer(item.requiredQty??0,'采购需求');integer(item.orderedQty??0,'采购下单');integer(item.receivedQty??0,'采购到货');}
  for(const record of s.usageRecords){assert(s.parts.some(p=>p.id===record.partId),'备份实测记录关联无效');if(record.projectId)assert(s.projects.some(p=>p.id===record.projectId),'备份实测项目关联无效');}
  for(const sub of s.substitutions)assert(s.parts.some(p=>p.id===sub.partId)&&s.parts.some(p=>p.id===sub.substitutePartId)&&sub.partId!==sub.substitutePartId,'备份替代料关联无效');
  for(const container of s.containers){assert(s.locations.some(l=>l.id===container.locationId),'备份元件盒地点无效');integer(container.rows,'元件盒行数',1);integer(container.cols,'元件盒列数',1);}
  for(const item of s.finishedGoods){assert(s.locations.some(l=>l.id===item.locationId),'备份板卡地点无效');integer(item.qty,'板卡库存');}
  for(const log of s.finishedGoodLogs){assert(s.finishedGoods.some(x=>x.id===log.finishedGoodId)&&Number.isSafeInteger(log.delta),'备份板卡流水无效');}
  assert(s.settings&&typeof s.settings==='object','备份设置无效'); s.settings.lcscEnabled=s.settings.lcscEnabled!==false;s.settings.lcscLastSync=s.settings.lcscLastSync||null;s.settings.lcscLastSyncError=clean(s.settings.lcscLastSyncError,500);s.settings.feedUrl=url(s.settings.feedUrl); assert(!s.settings.feedUrl||s.settings.feedUrl.startsWith('https://'),'数据源须使用HTTPS'); decimal(s.settings.priceThreshold,'阈值',0.1,1000); return s;
}

export function mergeFeed(original, feed) {
  assert(feed&&Array.isArray(feed.items)&&feed.items.length<=5000,'数据源需返回 { items: [...] }，最多5000条'); const s=copy(original);let matched=0;
  for (const item of feed.items) {
    const part=s.parts.find(p=>(p.watch||s.stocks.some(st=>st.partId===p.id))&&p.sku.toLowerCase()===clean(item.sku).toLowerCase()); if(!part)continue;
    const asOf=new Date(item.asOf); assert(Number.isFinite(+asOf)&&+asOf<Date.now()+86400000,'数据源包含无效日期');
    const source=clean(item.source,200); assert(source,'数据源条目必须标注 source'); const sourceUrl=url(item.sourceUrl); assert(sourceUrl,'数据源条目必须提供原始链接');
    const lifecycle=clean(item.lifecycle).toLowerCase(); assert(['','active','nrnd','eol','obsolete'].includes(lifecycle),'生命周期状态无效');
    const price=item.price==null?null:decimal(item.price,'数据源价格',0.0000001); const currency=clean(item.currency||'CNY'); assert(['CNY','USD','EUR','JPY','HKD'].includes(currency),'数据源币种不支持');
    const quantityTier=clean(item.quantityTier||'1');
    if(s.observations.some(o=>o.partId===part.id&&o.source===source&&o.quantityTier===quantityTier&&o.currency===currency&&o.asOf===asOf.toISOString()&&o.price===price&&o.lifecycle===lifecycle))continue;
    s.observations.push({id:id(),partId:part.id,source,sourceUrl,asOf:asOf.toISOString(),recordedAt:now(),price,currency,quantityTier,lifecycle,notice:clean(item.notice,2000),kind:'feed'});matched++;
  }
  s.settings.lastSync=now();s.settings.lastSyncError='';s.rev++;s.updatedAt=now();return {state:s,matched};
}

export function demoState() {
  let s=emptyState();
  const rows=[['C-100N-0603','100nF / 50V','电容','0603','100nF','10','X7R',2400,500,0,'A柜 · 02-03'],['R-10K-0603','10kΩ / 1%','电阻','0603','10kΩ','1','',1200,300,0,'A柜 · 01-08'],['STM32G431CBT6','STM32G431CBT6','IC','LQFP-48','','','',18,25,0,'B柜 · 03-01'],['C-10U-0805','10μF / 25V','电容','0805','10μF','20','X5R',86,100,1,'实验台 · 元件盒 2'],['SS14','SS14 肖特基二极管','二极管','SMA','','','',260,50,2,'书桌 · D-04'],['2N7002','2N7002 N沟道 MOS','MOS管','SOT-23','','','',150,30,0,'B柜 · 01-02'],['L-47U-THT','47μH 插件电感','电感','径向','47μH','10','',35,10,2,'书桌 · L-01'],['BC847B','BC847B NPN','三极管','SOT-23','','','',24,30,1,'实验台 · 元件盒 3']];
  for(const [sku,name,category,pkg,value,tolerance,dielectric,qty,min,loc,bin] of rows) {
    const r=applyAction(s,{type:'part.save',part:{sku,name,category,mount:sku==='L-47U-THT'?'插件':'贴片',package:pkg,value,tolerance,dielectric,minStock:min,watch:category==='IC'||category==='电容',voltage:sku==='C-100N-0603'?'50V':sku==='C-10U-0805'?'25V':'',power:category==='电阻'?'0.1W':'',datasheetUrl:sku==='STM32G431CBT6'?'https://www.st.com/en/microcontrollers-microprocessors/stm32g431cb.html':''},locationId:s.locations[loc].id,bin,qty});s=r.state;
  } s.demo=true;return s;
}
