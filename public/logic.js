export const CATEGORIES=['电容','电阻','电感','二极管','三极管','MOS管','晶振','IC','连接器','其他'];
const nonSolderPatterns=[
  {pattern:/(?:螺丝|螺钉|螺母|垫片|螺栓|隔离柱|铜柱|支柱|screw|bolt|nut|washer|standoff|spacer)/i,reason:'机械紧固件'},
  {pattern:/(?:test[\s_-]*point|测试[\s_-]*点|测试点|testpoint)/i,reason:'测试点'},
  {pattern:/(?:fiducial|基准点|定位点|安装孔|机械孔|螺纹孔|mount(?:ing)?[\s_-]*hole|tooling[\s_-]*hole)/i,reason:'工艺/机械标记'},
  {pattern:/(?:no[\s_-]*mount|do[\s_-]*not[\s_-]*populate|(?:^|[^a-z0-9])dnp(?:[^a-z0-9]|$)|不贴|不装)/i,reason:'BOM标记为不装'}
];
export function nonSolderBomItem(row={}) {
  const text=Object.values(row).filter(v=>v!==undefined&&v!==null).join(' ');
  const hit=nonSolderPatterns.find(x=>x.pattern.test(text));
  return hit?{excluded:true,reason:hit.reason}: {excluded:false,reason:''};
}
export function lcscSearchUrl(sku) {
  return `https://so.szlcsc.com/global.html?k=${encodeURIComponent(String(sku||'').trim())}`;
}
export function officialPartLink(part={}) {
  const saved=String(part.datasheetUrl||'').trim();
  if(saved)return {url:saved,label:'已保存的官方资料'};
  const sku=String(part.sku||'').trim();if(!sku)return null;
  let maker=String(part.manufacturer||'').trim();
  if(!maker){
    if(/^STM32/i.test(sku))maker='STMicroelectronics';
    else if(/^ESP(?:32|8266)/i.test(sku))maker='Espressif';
    else if(/^NRF\d/i.test(sku))maker='Nordic';
    else if(/^(?:PIC|MCP|ATMEGA|ATTINY|SAMD)\w/i.test(sku))maker='Microchip';
    else if(/^(?:TPS|BQ|TMS|MSP430|CC\d{4}|DRV\d)\w/i.test(sku))maker='Texas Instruments';
    else if(/^(?:AD\d|LTC\d|MAX\d)/i.test(sku))maker='Analog Devices';
    else if(/^(?:LPC|MCX|MIMX|MK\d)/i.test(sku))maker='NXP';
  }
  const key=maker.toLowerCase(),q=encodeURIComponent(sku);
  const vendors=[
    [/texas instruments|德州仪器|(^|\W)ti(\W|$)/i,'TI',`https://www.ti.com/sitesearch/en-us/docs/universalsearch.tsp?searchTerm=${q}`],
    [/stmicroelectronics|意法半导体|(^|\W)st(\W|$)/i,'ST',`https://www.st.com/content/st_com/en/search.html#q=${q}`],
    [/nxp|恩智浦|freescale|飞思卡尔/i,'NXP',`https://www.nxp.com/search?keyword=${q}`],
    [/analog devices|(^|\W)adi(\W|$)|亚德诺|maxim|美信/i,'ADI',`https://www.analog.com/en/search.html?q=${q}`],
    [/microchip|微芯|atmel|爱特梅尔/i,'Microchip',`https://www.microchip.com/en-us/search?searchQuery=${q}`],
    [/infineon|英飞凌|cypress|赛普拉斯/i,'Infineon',`https://www.infineon.com/cms/en/search.html#!term=${q}`],
    [/renesas|瑞萨/i,'Renesas',`https://www.renesas.com/us/en/search?keywords=${q}`],
    [/nexperia|安世/i,'Nexperia',`https://www.nexperia.com/search?q=${q}`],
    [/nordic|北欧半导体/i,'Nordic',`https://www.nordicsemi.com/Search?query=${q}`],
    [/espressif|乐鑫/i,'乐鑫',`https://www.espressif.com/en/search/node?keys=${q}`],
    [/onsemi|on semiconductor|安森美/i,'onsemi',`https://www.onsemi.com/search-results?query=${q}`],
    [/silicon labs|silicon laboratories|芯科/i,'Silicon Labs',`https://www.silabs.com/search#q=${q}`]
  ];
  const found=vendors.find(([pattern])=>pattern.test(key));
  return found?{url:found[2],label:`${found[1]} 厂商官方资料`}:null;
}
export function parseDelimited(text) {
  text=String(text).replace(/^\uFEFF/,'');
  // Only separators outside quoted cells count, including when the first record is multiline.
  const separators=new Set();let inQuotes=false,atFieldStart=true;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(ch==='"'&&(inQuotes||atFieldStart)){if(inQuotes&&text[i+1]==='"')i++;else inQuotes=!inQuotes;atFieldStart=false;}
    else if(!inQuotes){if(ch==='\r'||ch==='\n')break;if(ch==='\t'||ch===','||ch===';'){separators.add(ch);atFieldStart=true;}else atFieldStart=false;}
  }
  const delimiter=separators.has('\t')?'\t':separators.has(',')?',':separators.has(';')?';':',';
  let rows=[],row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else if(quoted||field==='')quoted=!quoted;else field+=ch;}else if(ch===delimiter&&!quoted){row.push(field);field='';}else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(x=>x.trim()))rows.push(row);row=[];field='';}else field+=ch;}
  if(quoted)throw new Error('CSV引号未闭合，请检查文件');row.push(field);if(row.some(x=>x.trim()))rows.push(row);return rows;
}
const norm=s=>String(s||'').toLowerCase().replace(/[μµ]/g,'u').replace(/ω/g,'ohm').replace(/[\s_%/（）()\-]/g,'');
const closeEnough=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=Math.max(Math.abs(a),Math.abs(b),1e-30)*1e-9;
export function parseElectricalValue(input,hint=''){
  const text=String(input||'').replace(/[μµ]/g,'u').replace(/Ω/gi,'ohm').trim();if(!text)return null;let m,kind='',base=NaN;
  if((m=text.match(/(?:^|[^A-Za-z0-9.])(\d+(?:\.\d+)?)\s*([pnumkM]?)\s*([FfHh])\b/))){const scale={p:1e-12,n:1e-9,u:1e-6,m:1e-3,k:1e3,M:1e6}[m[2]]??1;kind=m[3].toUpperCase()==='F'?'C':'L';base=Number(m[1])*scale;}
  else if((m=text.match(/(?:^|[^A-Za-z0-9.])(\d+(?:\.\d+)?)\s*([kKmM]?)\s*(?:ohm|R\b)/i))){const u=m[2];kind='R';base=Number(m[1])*(u==='k'||u==='K'?1e3:u==='M'?1e6:u==='m'?1e-3:1);}
  else if((m=text.match(/(?:^|[^A-Za-z0-9])(\d+)([RrKkMm])(\d+)(?:[^A-Za-z0-9]|$)/))){kind='R';const u=m[2];base=Number(`${m[1]}.${m[3]}`)*(u==='k'||u==='K'?1e3:u==='M'?1e6:u==='m'?1e-3:1);}
  else if((m=text.match(/(?:^|[^A-Za-z0-9.])[Rr](\d+)(?:[^A-Za-z0-9]|$)/))){kind='R';base=Number('0.'+m[1]);}
  else if((m=text.match(/(?:^|[^A-Za-z0-9.])(\d+(?:\.\d+)?)\s*([mkM]?)\s*[Rr](?:[^A-Za-z0-9]|$)/))){kind='R';base=Number(m[1])*(m[2]==='k'||m[2]==='K'?1e3:m[2]==='M'?1e6:m[2]==='m'?1e-3:1);}
  else if(hint==='R'&&(m=text.match(/(?:^|[^A-Za-z0-9.])(\d+(?:\.\d+)?)\s*([kKmM])(?:[^A-Za-z0-9]|$)/))){kind='R';base=Number(m[1])*(m[2].toLowerCase()==='k'?1e3:m[2]==='M'?1e6:1e-3);}
  return kind&&Number.isFinite(base)?{kind,base,source:m[0].trim()}:null;
}
export function parseVoltage(input){const m=String(input||'').match(/(?:^|\s|[/,;])(\d+(?:\.\d+)?)\s*(m|k)?v\b/i);if(!m)return null;return Number(m[1])*(m[2]?.toLowerCase()==='k'?1000:m[2]?.toLowerCase()==='m'?0.001:1);}
export function parseTolerance(input){const m=String(input||'').match(/(?:±|\+\/-)?\s*(0\.01|0\.05|0\.1|0\.5|1|2|5|10|20)\s*%/);return m?Number(m[1]):null;}
export function normalizeAbsoluteTolerance(input){
 const m=normalizeOcrLabelText(input).trim().match(/^±[ \t]*(\d+(?:\.\d+)?|\.\d+)[ \t]*([pPnNuUµmMkK]?)[ \t]*([FfHh])$/);
 return m?`±${Number(m[1])}${/[PNUK]/.test(m[2])?m[2].toLowerCase():m[2].replace('u','µ')}${m[3].toUpperCase()}`:'';
}
export function formatTolerance(input){const text=String(input??'').trim(),m=text.match(/^(?:±\s*)?(\d+(?:\.\d+)?)\s*%?$/);return m?`±${m[1]}%`:text;}
const toleranceIdentity=input=>{
 const absolute=normalizeAbsoluteTolerance(input), parsed=absolute&&parseElectricalValue(absolute);
 if(parsed)return `${parsed.kind}:${Number(parsed.base.toPrecision(12))}`;
 const m=formatTolerance(input).match(/^±(\d+(?:\.\d+)?)%$/);
 return m?`%:${Number(m[1])}`:'';
};
const dielectric=input=>(String(input||'').toUpperCase().match(/\b(C0G|NP0|X7R|X5R|Y5V|Z5U)\b/)||[])[1]?.replace('NP0','C0G')||'';
function requirements(row={}){const category=row.category||row.draft?.category||'', identity=toleranceIdentity(row.tolerance);const absolute=identity&&!identity.startsWith('%:')?parseElectricalValue(normalizeAbsoluteTolerance(row.tolerance)):null;return {category,value:parseElectricalValue(row.value||row.name||row.sku,category==='电阻'?'R':''),package:norm(row.package),voltage:parseVoltage(row.voltage||row.value),tolerance:identity?.startsWith('%:')?Number(identity.slice(2)):row.tolerance?null:parseTolerance(row.value),absolute,dielectric:dielectric(row.dielectric||row.value)};}
export function compareBomPart(row,part){
  const a=requirements(row),b=requirements(part),conflicts=[],unknowns=[],differences=[];const exactSku=Boolean(row.sku&&norm(row.sku)===norm(part.sku));const exactGeneratedIdentity=!row.sku&&[row.draft?.sku,row.value,row.name].map(norm).filter(Boolean).some(token=>[part.sku,part.name,part.value].map(norm).includes(token));
  if(a.category&&b.category&&a.category!==b.category)conflicts.push(`类别不同：BOM ${a.category}，库存 ${b.category}`);
  if(a.value&&b.value&&(a.value.kind!==b.value.kind||!closeEnough(a.value.base,b.value.base)))conflicts.push(`标称值不同：BOM ${row.value||a.value.source}，库存 ${part.value||b.value.source}`);else if(a.value&&!b.value)unknowns.push('库存未填写可比较的标称值');
  if(a.package&&b.package&&a.package!==b.package)conflicts.push(`封装不同：BOM ${row.package}，库存 ${part.package}`);else if(a.package&&!b.package)unknowns.push('库存未填写封装');
  if(a.voltage!=null){if(b.voltage==null)unknowns.push('库存未填写耐压');else if(b.voltage<a.voltage)conflicts.push(`耐压不足：BOM ${a.voltage}V，库存 ${b.voltage}V`);else if(b.voltage>a.voltage)differences.push(`库存耐压 ${b.voltage}V，高于 BOM ${a.voltage}V`);}else if(a.category==='电容'&&!exactSku)unknowns.push('BOM 未注明耐压');
  if(a.absolute||b.absolute){
    if(!a.absolute||!b.absolute||a.absolute.kind!==b.absolute.kind){if(a.absolute||a.tolerance!=null||!exactSku)unknowns.push('绝对误差与百分比精度不可直接比较，请核对');}
    else if(!closeEnough(a.absolute.base,b.absolute.base)&&b.absolute.base>a.absolute.base)conflicts.push(`误差不满足：BOM ${formatTolerance(row.tolerance)}，库存 ${formatTolerance(part.tolerance)}`);
  }else if(a.tolerance!=null){if(b.tolerance==null)unknowns.push('库存未填写精度');else if(b.tolerance>a.tolerance)conflicts.push(`精度不满足：BOM ±${a.tolerance}%，库存 ±${b.tolerance}%`);else if(b.tolerance<a.tolerance)differences.push(`库存精度 ±${b.tolerance}%，优于 BOM ±${a.tolerance}%`);}else if(['电容','电阻'].includes(a.category)&&!exactSku)unknowns.push('BOM 未注明精度');
  if(a.dielectric){if(!b.dielectric)unknowns.push('库存未填写介质');else if(a.dielectric!==b.dielectric)conflicts.push(`介质不同：BOM ${a.dielectric}，库存 ${b.dielectric}`);}else if(a.category==='电容'&&!exactSku)unknowns.push('BOM 未注明介质');
  if(['MOS管','IC'].includes(a.category)&&!exactSku)unknowns.push('MOS/IC 只能按明确型号自动确认');
  return {exactSku,exactGeneratedIdentity,conflicts,unknowns,differences,safeAuto:(exactSku||exactGeneratedIdentity)&&!conflicts.length||Boolean(a.value&&a.package&&!conflicts.length&&!unknowns.length)};
}
export function matchesPartQuery(part,stock,locationName,query){const q=String(query||'').trim();if(!q)return true;const text=[...Object.values(part),locationName,stock?.bin].join(' ').toLowerCase();if(text.includes(q.toLowerCase()))return true;const parsed=parseElectricalValue(q,part.category==='电阻'?'R':'');if(!parsed)return false;const candidate=parseElectricalValue(part.value||part.name||part.sku,part.category==='电阻'?'R':'');return Boolean(candidate&&parsed.kind===candidate.kind&&closeEnough(parsed.base,candidate.base));}
export function guessColumns(headers) {
  const find=aliases=>headers.findIndex(h=>aliases.includes(norm(h)));
  const findLoose=(aliases)=>{const exact=find(aliases);if(exact>=0)return exact;return headers.findIndex(h=>aliases.some(alias=>{const value=norm(h);return alias.length>=3&&value.includes(alias);}));};
  return {
    sku:findLoose(['sku','mpn','manufacturerpartnumber','manufacturerpart','partnumber','partno','pno','型号','料号','编号','编号型号','制造商料号','物料编码','物料号','器件型号']),
    qty:findLoose(['quantity','qty','qtyperboard','quantityperpcb','数量','用量','单板用量','每板用量','数量板','用量每板','pcs']),
    value:findLoose(['value','comment','值','参数','名称','物料名称','规格','物料描述','描述']),
    package:findLoose(['footprint','package','封装','pcb封装','封装规格']),
    reference:findLoose(['reference','designator','designators','位号','refs','参考标号','位号列表']),
    loss:findLoose(['loss','损耗','手动损耗','损耗数量']),
    voltage:findLoose(['voltage','ratedvoltage','耐压','额定电压','工作电压']),
    tolerance:findLoose(['tolerance','accuracy','精度','误差']),
    dielectric:findLoose(['dielectric','material','介质','材质'])
  };
}
const slug=s=>String(s||'').trim().toUpperCase().replace(/[μµ]/g,'U').replace(/Ω/g,'OHM').replace(/[^A-Z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,55);
const partPrefix={电容:'C',电阻:'R',二极管:'D',电感:'L',三极管:'Q',MOS管:'Q',晶振:'Y',IC:'U',连接器:'J',其他:'X'};
function compactNumber(n){
  const s=Number(n).toPrecision(12).replace(/(?:\.0+|(?<=\d)0+)$/,'').replace(/\.$/,'');
  return s;
}
function engineeringValue(parsed){
  if(!parsed||!Number.isFinite(parsed.base))return '';
  if(parsed.kind==='R'){
    const a=Math.abs(parsed.base), scale=a>=1e6?1e6:a>=1e3?1e3:1, unit=a>=1e6?'M':a>=1e3?'K':'R', n=parsed.base/scale;
    if(n<1&&scale===1)return `0R${String(n).split('.')[1]||'0'}`;
    const s=compactNumber(n); return s.includes('.')?s.replace('.',unit):`${s}${unit}`;
  }
  const a=Math.abs(parsed.base), scale=a>=1?1:a>=1e-3?1e-3:a>=1e-6?1e-6:a>=1e-9?1e-9:1e-12;
  const unit=parsed.kind==='C'?'F':'H', prefix=scale===1?'':scale===1e-3?'M':scale===1e-6?'U':scale===1e-9?'N':'P', s=compactNumber(parsed.base/scale);
  return `${s}${prefix}${unit}`;
}
function partToken(value,category,name=''){
  const parsed=parseElectricalValue(value,category==='电阻'?'R':'');
  if(parsed)return engineeringValue(parsed);
  const raw=String(name||value||'PART').normalize('NFKC').replace(/[μµ]/g,'U').replace(/Ω/g,'OHM');
  return raw.toUpperCase().replace(/[^0-9A-Z\u4E00-\u9FFF]+/g,'-').replace(/^-+|-+$/g,'').slice(0,55)||'PART';
}
export function generatePartSku(part={}){
  const category=String(part.category||'其他'), prefix=partPrefix[category]||'X';
  const valueToken=partToken(part.value,category,part.name);
  const packageToken=String(part.package||'UNKNOWN').normalize('NFKC').toUpperCase().replace(/[^0-9A-Z\u4E00-\u9FFF]+/g,'-').replace(/^-+|-+$/g,'').slice(0,30)||'UNKNOWN';
  const tolerance=formatTolerance(part.tolerance), absolute=normalizeAbsoluteTolerance(tolerance);
  const toleranceToken=absolute?`ABS${absolute.slice(1).replace('µ','u')}`:/^±\d+(?:\.\d+)?%$/.test(tolerance)?tolerance.slice(1):'NA';
  return `${prefix}-${valueToken}-${packageToken}-${toleranceToken}`.slice(0,280);
}

function inferCategory(value,sku,packageName='') {
  const text=`${value} ${sku}`.toUpperCase();
  if(/(?:F$|UF|NF|PF|CAP|电容)/i.test(text))return '电容';
  if(/(?:OHM|Ω|RES|电阻)/i.test(text))return '电阻';
  if(/(?:H$|UH|NH|MH|IND|电感)/i.test(text))return '电感';
  if(/(?:DIODE|TVS|ESD|LED|SCHOTTKY|二极管)/i.test(text)||/^D\d/.test(text))return '二极管';
  if(/(?:MOS|FET|2N700|AO340|IRL|MOS管)/i.test(text))return 'MOS管';
  if(/(?:BJT|BC8|2N[234]|三极管)/i.test(text)||/^Q\d/.test(text))return '三极管';
  if(/(?:CONN|HEADER|USB|JACK|连接器)/i.test(text)||/^J\d/.test(text))return '连接器';
  if(/(?:IC|MCU|STM|ESP|CH\d|TPS|AMS|LDO|DRIVER|SENSOR|FLASH|EEPROM)/i.test(text)||/^U\d/.test(text))return 'IC';
  return '其他';
}
export function inferBomPart(row,index=0) {
  const value=String(row.value||'').trim(), packageName=String(row.package||'').trim(), rawSku=String(row.sku||'').trim();
  const category=inferCategory(value,rawSku,packageName);
  const mount=/(?:DIP|THT|TH_|AXIAL|RADIAL|插件|THROUGH)/i.test(packageName)?'插件':'贴片';
  const sku=rawSku||`BOM-${category}-${slug(value||row.reference||`PART-${index+1}`)}${packageName?`-${slug(packageName)}`:''}`;
  const name=rawSku||value||row.reference||`BOM 自动元件 ${index+1}`;
  const tolerance=String(row.tolerance||'').replace(/[^\d.]/g,'')||(String(value).match(/(?:±|\+\/-)?\s*(0\.1|0\.5|1|2|5|10|20)\s*%/)||[])[1]||'';
  const voltage=String(row.voltage||'').trim()||(String(value).match(/\b\d+(?:\.\d+)?\s*[kKmM]?V\b/i)||[])[0]||'';
  const dielectricValue=String(row.dielectric||'').trim()||dielectric(value);
  return {sku,name,category,mount,package:packageName,value,tolerance,voltage,dielectric:dielectricValue,minStock:0,watch:false,description:`BOM 导入自动建档${row.reference?`；位号：${row.reference}`:''}${row.value&&row.value!==name?`；原始值：${row.value}`:''}`};
}
export function rowsToBom(table,mapping,options={}) {
  if(mapping.sku<0&&mapping.value<0)throw new Error('请指定型号列或参数列');if(mapping.qty<0)throw new Error('请指定每板用量列');
  const autoExclude=options.autoExclude!==false;
  return table.slice(1).map((row,i)=>{const result={key:String(i),sku:String(row[mapping.sku]??'').trim(),value:String(row[mapping.value]??'').trim(),package:String(row[mapping.package]??'').trim(),reference:String(row[mapping.reference]??'').trim(),voltage:String(row[mapping.voltage]??'').trim(),tolerance:String(row[mapping.tolerance]??'').trim(),dielectric:String(row[mapping.dielectric]??'').trim(),perBoard:Number(row[mapping.qty]),loss:row[mapping.loss]===undefined||row[mapping.loss]===''?0:Number(row[mapping.loss]),stockId:'',autoCreate:false,forceInclude:false,excluded:false,excludeReason:'',originalRow:row};const exclusion=nonSolderBomItem({...result,raw:row.join(' ')});result.excluded=autoExclude&&exclusion.excluded;result.excludeReason=exclusion.reason;result.draft=inferBomPart(result,i);return result;});
}
export function matchStocks(row,state,locationId) {
  const identity=[row.sku,row.value,row.name,row.draft?.sku,row.draft?.name].map(norm).filter(Boolean);
  let parts=state.parts.filter(p=>identity.some(token=>[p.sku,p.name,p.value].map(norm).includes(token)));const wanted=requirements(row);
  if(!parts.length&&wanted.value&&wanted.package)parts=state.parts.filter(p=>{const have=requirements(p);return have.value&&have.value.kind===wanted.value.kind&&closeEnough(have.value.base,wanted.value.base)&&have.package===wanted.package;});
  if(!parts.length&&wanted.value)parts=state.parts.filter(p=>{const have=requirements(p);return have.value&&have.value.kind===wanted.value.kind&&closeEnough(have.value.base,wanted.value.base);});
  return state.stocks.filter(st=>parts.some(p=>p.id===st.partId)&&(!locationId||st.locationId===locationId));
}
export function matchDetails(row,state,locationId){return matchStocks(row,state,locationId).map(stock=>{const part=state.parts.find(p=>p.id===stock.partId);return {stock,part,...compareBomPart(row,part)};});}
export function bomPlan(rows,state,kind,boards,rate) {
  const errors=[];const needs=new Map();
  if(!Number.isSafeInteger(boards)||boards<1)errors.push('板数须为正整数');if(!Number.isFinite(rate)||rate<0||rate>100)errors.push('损耗率须在0～100%之间');
  const ignored=[];const lines=[];rows.forEach((row,i)=>{if(row.excluded&&!row.forceInclude){ignored.push({...row,rowIndex:i});return;}let stock=state.stocks.find(x=>x.id===row.stockId);if(!stock&&kind==='入库'&&row.stockId?.startsWith('new:')&&state.parts.some(p=>p.id===row.stockId.slice(4)))stock={id:row.stockId,partId:row.stockId.slice(4),qty:0};if(!stock&&kind==='入库'&&row.autoCreate&&row.draft)stock={id:`draft:${row.key}`,partId:'',qty:0,draft:row.draft};const base=row.perBoard*boards;const loss=kind==='出库'?Math.ceil(base*rate/100)+row.loss:0;const total=base+loss;
     if(!stock)errors.push(`第${i+1}行${kind==='入库'?'将自动建档':'未找到库存，请先入库'}：${row.draft?.name||row.sku||row.value||'未命名'}`);if(!Number.isSafeInteger(row.perBoard)||row.perBoard<1||!Number.isSafeInteger(row.loss)||row.loss<0||!Number.isSafeInteger(total)||total>1e9)errors.push(`第${i+1}行数量无效`);
     if(stock&&!stock.draft&&!String(stock.id).startsWith('new:')){const selected=state.parts.find(p=>p.id===stock.partId),check=selected?compareBomPart(row,selected):null;if(check?.conflicts.length)errors.push(`第${i+1}行匹配冲突：${check.conflicts.join('；')}`);}
     if(stock)needs.set(stock.id,(needs.get(stock.id)||0)+total);lines.push({...row,rowIndex:i,stock,base,loss,total});});
  if(kind==='出库')for(const [sid,qty] of needs){const st=state.stocks.find(x=>x.id===sid);if(st&&st.qty<qty)errors.push(`${state.parts.find(p=>p.id===st.partId)?.sku} 同库位合计需 ${qty}，库存仅 ${st.qty}`);}
  return {lines,ignored,errors:[...new Set(errors)],total:lines.reduce((sum,l)=>sum+l.total,0)};
}
export function projectAnalysis(project,state,boards=1,rate=0){
  const target=Math.max(1,Number(boards)||1),lossRate=Math.max(0,Number(rate)||0),lines=(project?.rows||[]).map(row=>{const part=state.parts.find(p=>p.id===row.partId);const physical=state.stocks.filter(s=>s.partId===row.partId).reduce((n,s)=>n+s.qty,0);const reservedOther=(state.reservations||[]).filter(r=>r.partId===row.partId&&r.projectId!==project.id).reduce((n,r)=>n+r.qty,0);const reservedHere=(state.reservations||[]).filter(r=>r.partId===row.partId&&r.projectId===project.id).reduce((n,r)=>n+r.qty,0);const available=Math.max(0,physical-reservedOther),base=row.perBoard*target,loss=Math.ceil(base*lossRate/100)+(row.loss||0),required=base+loss,shortage=Math.max(0,required-available);const perWithLoss=row.perBoard*(1+lossRate/100),maxBoards=Math.max(0,Math.floor((available-(row.loss||0))/Math.max(perWithLoss,1e-12)));const pickups=state.stocks.filter(s=>s.partId===row.partId&&s.qty>0).map(s=>({stockId:s.id,locationId:s.locationId,bin:s.bin,qty:s.qty}));return {partId:row.partId,part,perBoard:row.perBoard,reference:row.reference,physical,reservedOther,reservedHere,available,required,loss,shortage,maxBoards,pickups};});
  const maxBoards=lines.length?Math.min(...lines.map(x=>x.maxBoards)):0;return {lines,maxBoards,bottlenecks:lines.filter(x=>x.maxBoards===maxBoards),shortages:lines.filter(x=>x.shortage>0),complete:lines.every(x=>!x.shortage),target};
}
export function projectDiff(project,previous,state){const before=new Map((previous?.rows||[]).map(r=>[r.partId,r])),after=new Map((project?.rows||[]).map(r=>[r.partId,r])),changes=[],added=[...after].filter(([id])=>!before.has(id)),removed=[...before].filter(([id])=>!after.has(id)),used=new Set();for(const [oldId,oldRow] of removed){const replacement=added.find(([newId,newRow])=>!used.has(newId)&&oldRow.reference&&norm(oldRow.reference)===norm(newRow.reference));if(replacement){const [newId,newRow]=replacement;used.add(newId);changes.push({kind:'更换型号',partId:newId,label:`${state.parts.find(p=>p.id===oldId)?.sku||oldId} → ${state.parts.find(p=>p.id===newId)?.sku||newId}`,detail:`位号 ${newRow.reference}`});}else changes.push({kind:'删除',partId:oldId,label:state.parts.find(p=>p.id===oldId)?.sku||oldId,detail:`原每板 ${oldRow.perBoard}`});}for(const [partId,row] of added)if(!used.has(partId))changes.push({kind:'新增',partId,label:state.parts.find(p=>p.id===partId)?.sku||partId,detail:`每板 ${row.perBoard}`});for(const [partId,row] of after){const old=before.get(partId);if(old&&old.perBoard!==row.perBoard)changes.push({kind:'数量变化',partId,label:state.parts.find(p=>p.id===partId)?.sku||partId,detail:`每板 ${old.perBoard} → ${row.perBoard}`});}return changes;}
function latestTierPrice(state,partId,qty){const prices=(state.observations||[]).filter(o=>o.partId===partId&&(['立创商城','LCSC 国际报价'].includes(o.source))&&o.kind!=='purchase'&&Number.isFinite(o.price)&&Number(o.quantityTier)>0).sort((a,b)=>Date.parse(b.asOf)-Date.parse(a.asOf));const newest=prices[0]?.asOf;if(!newest)return null;const tiers=prices.filter(o=>o.asOf===newest).map(o=>({...o,tier:Number(String(o.quantityTier).match(/\d+/)?.[0]||1)})).filter(o=>o.tier<=qty).sort((a,b)=>b.tier-a.tier);return tiers[0]||null;}
export function projectCostEstimate(project,state,boards=1,rate=0){const analysis=projectAnalysis(project,state,boards,rate),quote=new Map(),actual=new Map(),unknownQuote=[],unknownActual=[];for(const line of analysis.lines){const current=latestTierPrice(state,line.partId,line.required),history=(state.observations||[]).filter(o=>o.partId===line.partId&&o.kind==='purchase'&&Number.isFinite(o.price)).sort((a,b)=>Date.parse(b.asOf)-Date.parse(a.asOf))[0];if(current)quote.set(current.currency,(quote.get(current.currency)||0)+current.price*line.required);else unknownQuote.push(line.partId);if(history)actual.set(history.currency,(actual.get(history.currency)||0)+history.price*line.required);else unknownActual.push(line.partId);}return {quote:[...quote].map(([currency,total])=>({currency,total})),actual:[...actual].map(([currency,total])=>({currency,total})),unknownQuote,unknownActual};}
export function procurementSuggestions(state,project=null,boards=1,rate=0){const projectNeeds=new Map();if(project)for(const line of projectAnalysis(project,state,boards,rate).lines)if(line.shortage)projectNeeds.set(line.partId,line.shortage);return state.parts.map(part=>{const physical=state.stocks.filter(s=>s.partId===part.id).reduce((n,s)=>n+s.qty,0),reserved=(state.reservations||[]).filter(r=>r.partId===part.id).reduce((n,r)=>n+r.qty,0),available=Math.max(0,physical-reserved),safety=Math.max(0,(part.minStock||0)-available),projectShortage=projectNeeds.get(part.id)||0,required=Math.max(safety,projectShortage),outstanding=(state.procurementItems||[]).filter(x=>x.partId===part.id&&!['received','cancelled'].includes(x.status)).reduce((n,x)=>n+Math.max(0,(x.orderedQty||0)-(x.receivedQty||0)),0),raw=Math.max(0,required-outstanding),existing=(state.procurementItems||[]).find(x=>x.partId===part.id&&!['received','cancelled'].includes(x.status)),moq=existing?.moq||1,pack=existing?.packMultiple||1,suggested=raw?Math.max(moq,Math.ceil(raw/pack)*pack):0,quote=latestTierPrice(state,part.id,Math.max(1,suggested));return {part,physical,reserved,available,safety,projectShortage,required,outstanding,suggested,quote};}).filter(x=>x.required||x.outstanding);}
const E6=[1,1.5,2.2,3.3,4.7,6.8];
const E24=[1,1.1,1.2,1.3,1.5,1.6,1.8,2,2.2,2.4,2.7,3,3.3,3.6,3.9,4.3,4.7,5.1,5.6,6.2,6.8,7.5,8.2,9.1];
const E96=[1,1.02,1.05,1.07,1.1,1.13,1.15,1.18,1.21,1.24,1.27,1.3,1.33,1.37,1.4,1.43,1.47,1.5,1.54,1.58,1.62,1.65,1.69,1.74,1.78,1.82,1.87,1.91,1.96,2,2.05,2.1,2.15,2.21,2.26,2.32,2.37,2.43,2.49,2.55,2.61,2.67,2.74,2.8,2.87,2.94,3.01,3.09,3.16,3.24,3.32,3.4,3.48,3.57,3.65,3.74,3.83,3.92,4.02,4.12,4.22,4.32,4.42,4.53,4.64,4.75,4.87,4.99,5.11,5.23,5.36,5.49,5.62,5.76,5.9,6.04,6.19,6.34,6.49,6.65,6.81,6.98,7.15,7.32,7.5,7.68,7.87,8.06,8.25,8.45,8.66,8.87,9.09,9.31,9.53,9.76];
const nearestSeries=(list,x)=>list.reduce((best,v)=>Math.abs(v-x)<Math.abs(best-x)?v:best,list[0]);
export function electricalSeriesMatch(base){
  if(!Number.isFinite(base)||base<=0)return null;
  const decade=Math.pow(10,Math.floor(Math.log10(base)+1e-9)),x=base/decade,out={normalized:x};
  for(const [name,list] of Object.entries({E6,E24,E96})){const hit=nearestSeries(list,x);out[name.toLowerCase()]={value:hit,deviation:Math.abs(hit-x)/x};}
  return out;
}
export function labelValueSeriesWarning(label={}){
  const parsed=parseElectricalValue(label.value||'',label.category==='电阻'?'R':'');
  if(!parsed||!['R','C','L'].includes(parsed.kind))return '';
  // Current-sense values below 1 ohm (0R2, R005, 200mR) are not part of E24/E96 decades.
  if(parsed.kind==='R'&&parsed.base<1)return '';
  const match=electricalSeriesMatch(parsed.base);if(!match)return '';
  const tol=Number(label.tolerance),strict=Number.isFinite(tol)&&tol>0&&tol<=1;
  const series=strict?'E96':'E24',limit=strict?0.015:0.02,near=match[series.toLowerCase()];
  if(!near||near.deviation<=limit)return '';
  return `标称值 ${label.value} 不在常用 ${series} 系列（最接近 ${near.value} 倍档位，偏差 ${(near.deviation*100).toFixed(1)}%），可能是识别错误，请对照原图`;
}
const FIELD_LABEL_PATTERNS={
  value:/(?:阻值|电阻值|容量|容值|电感值|Resistance|Capacitance|Inductance|Value)\s*[:：=#]?/i,
  package:/(?:封装|Package|Footprint)\s*[:：=#]?/i,
  tolerance:/(?:精度|误差|Tolerance|Tol)\s*[:：=#]?/i,
  qty:/(?:数量|数目|Q\s*T\s*Y|Quantity)\s*[:：=#]?/i,
  sku:/(?:M\s*P\s*N|P\s*\/\s*N|Part\s*(?:No\.?|Number)|型号|料号)\s*[:：=#]?/i
};
export function labelFieldConfidence(label={},text=''){
  const s=String(text||label.description||''),has=key=>FIELD_LABEL_PATTERNS[key].test(s);
  const build=(score,reasons)=>{const clamped=Math.max(0,Math.min(1,Number(score.toFixed(2))));return {score:clamped,level:clamped>=0.8?'high':clamped>=0.5?'medium':'low',reasons};};
  const out={};
  {let score=0;const reasons=[];if(has('value')){score+=0.35;reasons.push('有明确参数字段名');}if(label.value){score+=0.25;reasons.push('已解析出带单位的数值');}
   const parsed=parseElectricalValue(label.value||'',label.category==='电阻'?'R':'');if(parsed){const m=electricalSeriesMatch(parsed.base),tol=Number(label.tolerance),key=Number.isFinite(tol)&&tol>0&&tol<=1?'e96':'e24';
     if(m&&m[key]&&m[key].deviation<=(key==='e96'?0.015:0.02)){score+=0.25;reasons.push(`符合 ${key.toUpperCase()} 常用系列`);}else{score-=0.15;reasons.push('与常用系列存在偏差，可能是误读');}}
   out.value=build(score,reasons);}
  {let score=0;const reasons=[];if(label.package){score+=has('package')?0.55:0.35;reasons.push(has('package')?'有封装字段名':'仅从文字中匹配到封装');if(/^(?:0201|0402|0603|0805|1206|1210|1812|2010|2512|SOT|SOIC|SOP|LQFP|QFN|DIP|SMA|SMB)/i.test(label.package)){score+=0.35;reasons.push('封装在常见白名单内');}}
   out.package=build(score,reasons);}
  {let score=0;const reasons=[];if(label.qty){if(has('qty')){score+=0.6;reasons.push('有数量字段名');}if(/pcs|pieces|个|颗|只/i.test(s)){score+=0.25;reasons.push('带数量单位');}score+=0.1;}out.qty=build(score,reasons);}
  {let score=0;const reasons=[];if(label.sku){if(has('sku')){score+=0.7;reasons.push('有型号字段名');}else{score+=0.45;reasons.push('仅按型号形态匹配，未看到字段名');}if(/^[A-Z0-9][A-Z0-9._/+\-]{4,}$/i.test(String(label.sku))){score+=0.2;reasons.push('型号长度与字符集合理');}}out.sku=build(score,reasons);}
  return out;
}
export function normalizeOcrLabelText(text) {
 return String(text||'').normalize('NFKC').replace(/\r/g,'').replace(/[．。·•⋅]/g,'.').replace(/[％﹪]/g,'%').replace(/[，]/g,',').replace(/[：]/g,':')
   .replace(/Q\s*['’]?\s*T\s*Y/gi,'QTY').replace(/T\s*O\s*L/gi,'TOL')
   .replace(/(\d)[ \t]*[.][ \t]*(\d)/g,'$1.$2').replace(/(\d)[ \t]+(?=%)/g,'$1').replace(/μ/g,'µ')
   .replace(/(\d)[ \t]*([pnuµmkM])[ \t]*([fFhH])\b/gi,(_,n,p,u)=>n+(/[PNU]/.test(p)?p.toLowerCase():p)+u.toUpperCase())
   // Only treat 土/士 as ± before a numeric tolerance, never in brand or supplier text.
   .replace(/(?:(?<![\u3400-\u9fff])[土士]|±|\+[ \t]*(?:\/[ \t]*)?[-−])[ \t]*(?=(?:\d+(?:\.\d+)?|\.\d+)[ \t]*(?:%|[pnuµmk]?[fh](?![a-z0-9])))/gi,'±')
   // Join fully split R/K codes only with an explicit tolerance after the fractional digit.
   .replace(/(?<![A-Za-z0-9.])([1-9]\d{0,2}|0)[ \t]+([RrKkMm])[ \t]+(\d)(?=[ \t]*±[ \t]*\d+(?:\.\d+)?[ \t]*%)/g,'$1$2$3')
   // Letter O between digits or before an ohm/percent marker is a misread zero, e.g. 11OK -> 110K.
   .replace(/(?<=\d)[Oo](?=[\d]|[KkMm]?[ \t]*(?:Ω|ω|±|%))/g,'0')
   .replace(/(\d)[ \t]+(?=[kKmM](?:Ω|ohm)?\b)/g,'$1')
   .replace(/(?<![A-Za-z0-9.])(\d+)[ \t]*([RrKkMm])[ \t]*(\d{1,2})(?![A-Za-z0-9.%])/g,(all,n,unit,tail)=>{
     // Do not turn separate columns such as 10K 50pcs into 10K50.
     return all.includes(unit+tail)?n+unit+tail:all;
   })
   .replace(/(\d)[ \t]*([kKMm])[ \t]+(?=Ω|ω|ohms?|欧姆)/gi,'$1$2')
   .replace(/数[ \t]*\n?[ \t]*量(?=[ \t]*[:.=#\n\d])/g,'数量')
   .replace(/(?:\b(?:QTY|Quantity)\b|数量)[ \t]*\.[ \t]*(?=(?:\n[ \t]*)?\d)/gi,word=>word.replace('.',':'))
   .replace(/型[ \t]*\n[ \t]*号(?=[ \t]*[:=#])/g,'型号')
   // Zero-ohm parts print "0R"; OCR often turns the zero into the letter O.
   .replace(/(?<![A-Za-z0-9])OR(?=[ \t]*[±%])/g,'0R').replace(/(?<![A-Za-z0-9])OΩ/g,'0Ω')
   .replace(/(\d)[ \t]*,[ \t]*(?=\d{3}(?!\d))/g,'$1,')
   .replace(/(?<=\d)[ \t]*p[ \t]*c[ \t]*s?\.?(?![A-Za-z])/gi,' pcs');
}
export function extractLabel(text) {
 const source=String(text||''),s=normalizeOcrLabelText(source),warnings=[];
 const keys={sku:'M\\s*P\\s*N|P\\s*\\/\\s*N|Part\\s*(?:No\\.?|Number)|型号|料号',value:'阻值|电阻值|容量|容值|电感值|Resistance|Capacitance|Inductance|Value',package:'封装|Package|Footprint',tolerance:'精度|误差|Tolerance|Tol',qty:'数量|数目|Q\\s*T\\s*Y|Quantity',manufacturer:'品牌|制造商|厂家|厂商|Brand|Manufacturer|MFR',lotCode:'批次号?|批号|生产批次|Lot(?:\\s*(?:No\\.?|Number))?|Batch(?:\\s*(?:No\\.?|Number))?',voltage:'耐压|额定电压|Voltage',power:'功率|Power',dielectric:'介质|Dielectric',supplier:'供应商|卖家|店铺|Supplier|Seller'};
 const all=Object.entries(keys).map(([k,v])=>`(?<${k}>${v})`).join('|'),re=new RegExp(`(?<![A-Za-z\\u4e00-\\u9fff])(?:${all})(?=[\\s:：=#]|(?<=[\\u4e00-\\u9fff]))\\s*[:：=#]?\\s*`,'gi'),marks=[...s.matchAll(re)],tagged={};
 for(let i=0;i<marks.length;i++){const m=marks[i],key=Object.keys(m.groups).find(k=>m.groups[k]!==undefined);let v=s.slice(m.index+m[0].length,marks[i+1]?.index??s.length).split(/[\n;；|，]/)[0].replace(/[,\s]+$/,'').trim();if(v)(tagged[key]??=[]).push(v);}
 const choose=(key,values,normal=v=>v.trim())=>{const list=[...new Set(values.map(normal).filter(Boolean))];if(list.length>1){warnings.push(`${key}出现多个值：${list.join(' / ')}，请对照单个料袋填写`);return '';}return list[0]||'';};
 const scan=(pattern,input=s)=>[...input.matchAll(pattern)].map(m=>m[1]);
 const taggedOne=(key,label)=>choose(label,tagged[key]||[]);
 // Supplier labels often print the MPN and human-readable specifications on the same line.
 const modelToken=/^[A-Z0-9][A-Z0-9._/+\-]*[A-Z0-9](?=[ \t]+\S)/i;
 const leadingModel=text=>{const token=text.match(modelToken)?.[0]||'';return /[a-z]/i.test(token)&&/\d/.test(token)?token:'';};
 const hasExplicitSpec=text=>/^\d+(?:\.\d+)?[ \t]*(?:[RrKkMm]\d+|[kKMm]?(?:Ω|ω|ohms?|欧姆)|[pnuµmkM]?[FfHh]|[Rr]|[kKM])(?=$|[ \t±+])/i.test(text);
 let sku=choose('型号',tagged.sku||[],v=>{const model=leadingModel(v);return model&&hasExplicitSpec(v.slice(model.length).trim())?model:v.replace(/\s+/g,'');});
 if(!sku)sku=choose('型号',s.split('\n').map(x=>x.trim()).filter(x=>/^[A-Z]{2,}\d[A-Z0-9._/+\-]{2,40}$/i.test(x)&&!/^(QTY|LOT|DATE|BATCH)/i.test(x)));
 const excluded=new Set(['manufacturer','lotCode','supplier','sku']);
 let coreSource='',cursor=0;
 for(let i=0;i<marks.length;i++){
   const m=marks[i],key=Object.keys(m.groups).find(k=>m.groups[k]!==undefined);
   if(!excluded.has(key))continue;
   const start=m.index+m[0].length,tail=s.slice(start,marks[i+1]?.index??s.length),stop=tail.search(/[\n,;]/),segment=stop<0?tail:tail.slice(0,stop);
   const model=key==='sku'?leadingModel(segment):'';
   const suffix=model?segment.slice(model.length).trim():'';
   // Preserve only a clearly separated electrical specification after the model token.
   coreSource+=s.slice(cursor,m.index)+(hasExplicitSpec(suffix)?' '+suffix+' ':' ');
   cursor=start+segment.length;
 }
 coreSource+=s.slice(cursor);
 // Absolute tolerance such as "±0.25pF" must not be read as a second capacitance.
 const absTolRegex=/±[ \t]*(?:\d+(?:\.\d+)?|\.\d+)[ \t]*[pnuµmk]?[fh](?![A-Za-z0-9])/gi;
 const absTolerances=choose('绝对误差',[...coreSource.matchAll(absTolRegex)].map(m=>m[0]),normalizeAbsoluteTolerance);
 const coreValueSource=coreSource.replace(absTolRegex,' ');
 const isCrystal=/晶振|谐振器|crystal/i.test(s)||/\b\d+(?:\.\d+)?[ \t]*MHZ\b/i.test(s);
 const packageSource=coreValueSource.replace(/(?<![\d.])([0128])[ \t]+([0124568])[ \t]+([0125])[ \t]+([0123568])(?![\d.])/g,'$1$2$3$4');
 const pkgFromText=scan(/(?:^|[^0-9A-Z])(0201|0402|0603|0805|1206|1210|1812|2010|2512)(?=[A-Z])/gi,s)[0]||'';
 let pkg=choose('封装',scan(isCrystal?/(?:^|[^A-Za-z0-9])(2016|2520|3225|5032|1612|1608|SOT[- ]?\d+(?:-\d+)?|SOP[- ]?\d+|QFN[- ]?\d+)(?![A-Za-z0-9])/gi:/(?:^|[^A-Za-z0-9])(0201|0402|0603|0805|1206|1210|1812|2010|2512|SOT[- ]?\d+(?:-\d+)?|SOIC[- ]?\d+|SOP[- ]?\d+|LQFP[- ]?\d+|QFN[- ]?\d+|DIP[- ]?\d+|SMA|SMB)(?![A-Za-z0-9])/gi,packageSource),v=>v.replace(/\s+/g,'').trim().toUpperCase());
 if(!pkg)pkg=pkgFromText.toUpperCase();
 // Units or an explicit parameter label are required; bare 104/472 and colour bands are not guessed.
 const crystalFreq=isCrystal?scan(/(?:^|[^A-Za-z0-9.])(\d+(?:\.\d+)?[ \t]*(?:M|K|G)?[ \t]*HZ)(?![A-Za-z])/gi,s).map(v=>v.replace(/\s+/g,'').replace(/hz$/i,'Hz'))[0]:'';
 const pickValues=input=>{
   const out=[];
   // 10K OHM, 10 kOhms, 100 nF, 4.7uH, 2 mΩ
   for(const m of input.matchAll(/(?<![A-Za-z0-9.])(\d+(?:\.\d+)?)\s*([pnuµmkM]?)\s*(?:Ω|ω|ohms?|欧姆|[FfHh])(?![A-Za-z0-9])/gi))out.push(m[0].replace(/\s+/g,''));
   // R005, R010 milliohm/ohm notation
   for(const m of input.matchAll(/(?<![A-Za-z0-9.])[Rr]\d{3}(?![A-Za-z0-9-])/g))out.push(m[0]);
   // 200mR, 10R, 0.5R
   for(const m of input.matchAll(/(?<![A-Za-z0-9.])\d+(?:\.\d+)?\s*[mkM]?[Rr](?![A-Za-z0-9])/g))out.push(m[0].replace(/\s+/g,''));
   // 0R2, 4R7, 10K5
   for(const m of input.matchAll(/(?<![A-Za-z0-9.])\d+[RrKkMm]\d+(?![A-Za-z0-9])/g))out.push(m[0]);
   // bare prefix such as 10K on Chinese labels
   for(const m of input.matchAll(/(?<![A-Za-z0-9.])\d+(?:\.\d+)?[kKM](?![A-Za-z0-9])/g))out.push(m[0]);
   return out;
 };
 // Supplier headers often list every available value (14NH 1.6NH 1.8NH ...); the real part is the package + tolerance line.
 const preferredValue=isCrystal?'':(()=>{
   const scored=coreSource.split('\n').map(line=>{
     const bare=line.replace(absTolRegex,' ');
     const vals=[...new Set(pickValues(bare))].filter(Boolean);
     let score=0;
     if(vals.length>=3)score-=4;
     if(/(?:0201|0402|0603|0805|1206|1210|1812|2010|2512|SOT[- ]?\d+|SOP[- ]?\d+|QFN[- ]?\d+|LQFP[- ]?\d+)/i.test(line))score+=2;
     if(/[±土]\s*\d|\d\s*%/.test(line))score+=2;
     if(/数量|QTY/i.test(line))score+=1;
     if(/型号|品牌|批次|柜号|条码|ID[:：]/i.test(line))score-=1;
     return {vals,score};
   }).filter(x=>x.vals.length===1&&x.score>=2).sort((a,b)=>b.score-a.score);
   if(!scored.length)return '';
   if(scored.length>1&&scored[0].score===scored[1].score)return '';
   return scored[0].vals[0]||'';
 })();
 let candidates=isCrystal?(crystalFreq?[crystalFreq]:[]):(preferredValue?[preferredValue]:pickValues(coreValueSource));
 // A bare number can be a printed resistor code, not a resistance in ohms.
 const electrical=v=>{v=v.replace(/欧姆|ohms?/gi,'Ω').replace(/ω/g,'Ω').replace(/\s+/g,'').replace(/([PNU])([FH])$/g,(_,a,b)=>a.toLowerCase()+b).replace(/µ/g,'u');const p=parseElectricalValue(v,'R');if(!p)return '';
   if(p.kind!=='R')return v.replace(/u/g,'µ');
   const n=x=>Number(Number(x).toPrecision(6)),b=p.base;
   if(b===0)return '0Ω';
   return b>=1e6?`${n(b/1e6)}MΩ`:b>=1e3?`${n(b/1e3)}kΩ`:b>=1?`${n(b)}Ω`:b>=1e-3?`${n(b*1e3)}mΩ`:`${n(b*1e6)}µΩ`;};
 let value=choose('标称值',candidates,isCrystal?(v=>v):electrical);if((tagged.value||[]).some(v=>!electrical(v)))warnings.push('标称值缺少可靠单位或编码含义，请手工核对');
 const explicitValue=(tagged.value||[]).length?choose('标称值',tagged.value,isCrystal?(v=>v):electrical):'';
 if(explicitValue&&value&&explicitValue!==value){warnings.push(`标签上出现两个不同标称值：${value} 与 ${explicitValue}，请对照原图确认`);value='';}
 else if(explicitValue&&!value)value=explicitValue;
 if(value&&/[0-9][Oo](?=[0-9]|[KkMm]?[ \t]*(?:Ω|ω|±|土|士|%))/.test(source))warnings.push('已把字母 O 按数字 0 处理（例如 11OK → 110K），请对照原标签核对阻值');
 const tol=choose('精度',[...scan(/(?:±|\+\/-)?\s*(\d+(?:\.\d+)?)\s*%/g,coreSource),...(tagged.tolerance||[]).filter(v=>/^\d+(?:\.\d+)?$/.test(v))],v=>{const m=v.match(/^(?:±|\+\/-)?\s*(\d+(?:\.\d+)?)(?:\s*%|$)/);return m&&Number(m[1])<=100?m[1]:'';});
 const qtyValues=[...(tagged.qty||[]).map(v=>v.split(/[ \t]+(?=(?:条[ \t]*码|柜号|盘号|订单号|barcode)\s*[:=#])/i)[0].trim()),...scan(/(?:^|[^\d.])(\d[\d,]*(?:\.\d+)?\s*(?:pcs|pieces|个|颗|只))(?![A-Za-z])/gi,coreSource)];
 const parseQty=v=>{const m=v.match(/^((?:\d{1,3}(?:,\d{3})+|\d+))(?:[ \t]*(?:pcs|pieces|个|颗|只))?[ \t]*$/i);if(!m)return '';const n=Number(m[1].replace(/,/g,''));return Number.isSafeInteger(n)&&n>0&&n<=1e9?String(n):'';};
 let qty=choose('数量',qtyValues,parseQty),qtySource=qty?'explicit':'';
 if(!qty&&!qtyValues.length&&!marks.some(m=>m.groups.qty!==undefined)&&value&&pkg){
   // Repacking labels print the count immediately below the actual specification. Do not substitute an isolated lot number.
   const lines=s.split('\n').map(x=>x.trim()).filter(Boolean), found=new Set();
   const countLine=/^(?:[1-9]\d{0,4}|[1-9]\d?,\d{3})$/;
   const packagePattern=new RegExp(`(?:^|[^A-Za-z0-9.])${pkg.replace(/[^A-Za-z0-9]/g,'\\$&')}(?![A-Za-z0-9])`,'i');
   for(let i=1;i<lines.length;i++){
     const spec=lines[i-1],count=lines[i];
     if(!countLine.test(count)||!packagePattern.test(spec))continue;
     const hasValue=isCrystal?spec.replace(/[ \t]+/g,'').toLowerCase().includes(value.toLowerCase()):pickValues(spec.replace(absTolRegex,' ')).some(v=>electrical(v)===value);
     // Only offer an unlabeled count as a suggestion, never as confirmed stock.
     if(hasValue&&!countLine.test(lines[i+1]||''))found.add(parseQty(count));
   }
   qty=choose('数量',[...found]);if(qty)qtySource='layout';
 }
 if(qtyValues.length&&!qty)warnings.push('数量无法确定，请填写本次实际入库个数；不会按包数或盘数猜测');
 const voltage=choose('耐压',tagged.voltage||scan(/(?:^|[^A-Za-z0-9.])(\d+(?:\.\d+)?\s*[vV])(?![A-Za-z])/g),v=>/^\d+(?:\.\d+)?\s*V$/i.test(v)?v.replace(/\s/g,'').toUpperCase():'');
 const power=choose('功率',tagged.power||scan(/(?:^|[^A-Za-z0-9.])(\d+(?:[./]\d+)?\s*[mµu]?W)(?![A-Za-z])/g));
 const material=choose('介质',tagged.dielectric||scan(/\b(C0G|NP0|X7R|X5R|Y5V|Z5U)\b/gi),v=>v.toUpperCase().replace('NP0','C0G'));
 const modelName=sku||s.match(/(?:^|[\s\n])([A-Z]{2,}\d[A-Z0-9._/+\-]{1,20})(?=[\s\n]|$)/)?.[1]||'';
 const isDiode=/^(?:SS|1N|BAT|BAV|MBR|US|1SS|SBR|SMAJ|ESD)\d/i.test(modelName)||/\b(?:SS34|SS14|SS54|1N4148|1N4007|BAT54|MBR\d{3,4}|SMAJ\d+)\b/i.test(s);
 const isMos=/^(?:AO|IRF|IRL|AON|NTM|CS|CJ|SI)\d/i.test(modelName)&&/\b(?:SOT-?23|SOT-?223|DFN|TO-?252|SOP-?8)\b/i.test(s);
 const isConnector=/\b(?:XH|PH|ZH|SH|GH|MX)\d*(?:\.\d+)?-\d+P\b|\b(?:USB|TYPE-?C|DC-?00\d|HDR)\b|排针|排母|连接器|端子|插座/i.test(s);
 const parsed=parseElectricalValue(value,'R');
 let category=isCrystal?'晶振':isDiode?'二极管':isMos?'MOS管':isConnector?'连接器':parsed?{R:'电阻',C:'电容',L:'电感'}[parsed.kind]:/电阻|resistor/i.test(s)?'电阻':/电容|capacitor/i.test(s)?'电容':/电感|inductor/i.test(s)?'电感':sku?'IC':'其他';
 if(!value&&category!=='IC')warnings.push('未确定阻值/容量等标称值，请核对原图');if(!qty)warnings.push('未确定数量，请填写本次实际个数');
 const loadCap=isCrystal?scan(/(?:^|[^A-Za-z0-9.])(\d+(?:\.\d+)?[ \t]*[Pp][Ff])(?![A-Za-z])/g,s).map(v=>v.replace(/\s+/g,'').toUpperCase())[0]:'';
 const stability=isCrystal?scan(/(?:^|[^A-Za-z0-9.])([±]?[ \t]*\d+(?:\.\d+)?[ \t]*[Pp][Pp][Mm])(?![A-Za-z])/g,s).map(v=>v.replace(/[ \t]+/g,'').toUpperCase())[0]:'';
 if(absTolerances)warnings.push(`标签标注的误差是绝对值 ${absTolerances}，不是百分比；已与容值/感值分开，请核对`);
 if(isCrystal&&(loadCap||stability))warnings.push(`晶振附加参数：${[loadCap?`负载电容 ${loadCap}`:'',stability?`频差 ${stability}`:''].filter(Boolean).join('，')}；请写入备注或辅助资料`);
 const fieldWarnings=[];if(['电阻','电容','电感','晶振'].includes(category)){if(!value)fieldWarnings.push(category==='晶振'?'频率':'阻值/容量');if(category!=='晶振'&&!tol&&!absTolerances)fieldWarnings.push('精度');if(!pkg)fieldWarnings.push('封装');}
 if(fieldWarnings.length)warnings.push(`关键字段未可靠识别：${fieldWarnings.join('、')}；请在确认前手工填写`);
 // A stated absolute tolerance already explains uncommon values such as 8pF.
 const seriesWarning=absTolerances?'':labelValueSeriesWarning({value,category,tolerance:tol});
 if(seriesWarning)warnings.push(seriesWarning);
 const autoNote=isCrystal?[loadCap?`负载电容 ${loadCap}`:'',stability?`频差 ${stability}`:''].filter(Boolean).join('；'):'';
 const result={sku,name:sku||[value,category!=='其他'?category:''].filter(Boolean).join(' '),package:pkg,value,tolerance:tol,absTolerance:absTolerances,loadCapacitance:loadCap,stability,note:autoNote,voltage,power,dielectric:material,qty,qtySource,manufacturer:taggedOne('manufacturer','品牌'),lotCode:taggedOne('lotCode','批次'),supplier:taggedOne('supplier','供应商'),category,mount:/DIP|轴向|径向|插件/i.test(pkg+' '+s)?'插件':'贴片',description:source,warnings:[...new Set(warnings)],fieldWarnings};
 result.confidence=labelFieldConfidence(result,s);
 return result;
}
export function extractPhotoLabel(text){
 const p=extractLabel(text);
 // Free-form metadata is not reliable enough to create automatic identity fields from photos.
 p.manufacturer='';p.lotCode='';p.supplier='';
 if(['电阻','电容','电感'].includes(p.category)){p.sku='';p.name=[p.value,p.category].filter(Boolean).join(' ');}
 else if(!/(?:型号|料号|MPN|P\/N|Part No)\s*[:：]/i.test(text)){p.sku='';p.name='';if(p.category==='IC')p.category='其他';}
 p.warnings=p.warnings.filter(x=>!/^品牌|^批次|^供应商/.test(x));
 return p;
}
// Cross-check the readings from both on-device models; disagreement is surfaced, never silently averaged.
export function ocrCrossCheck(texts=[]){
 const parsed=texts.map(t=>extractPhotoLabel(String(t||'')));
 const uniq=list=>[...new Set(list.filter(Boolean))];
 const values=uniq(parsed.map(p=>p.value)),qtys=uniq(parsed.map(p=>p.qty));
 const conflicts=[];
 if(values.length>1)conflicts.push(`两个模型读出的标称值不同：${values.join(' / ')}，请对照标签选择`);
 if(qtys.length>1)conflicts.push(`两个模型读出的数量不同：${qtys.map(v=>v+' 个').join(' / ')}，请按实际余量填写`);
 return conflicts;
}
// Two on-device models read the same crop; keep the reading that fills the most fields.
export function bestPhotoOcrText(candidates=[],icMode=false){
 const keys=icMode?['sku','package','qty']:['value','package','tolerance','qty'];
 return candidates.map((input,index)=>{
   const text=String(input||''),p=extractPhotoLabel(text);
   const score=keys.reduce((n,k)=>n+Number(Boolean(k==='tolerance'?p.tolerance||p.absTolerance:p[k])),0);
   return {text,score,index};
 }).sort((a,b)=>b.score-a.score||a.index-b.index)[0]?.text||'';
}
// Fill missing passive-component fields only from readings that identify the same specification.
export function mergePhotoPassiveFields(primary,alternates=[]){
 const out={...primary,warnings:[...primary.warnings],fieldWarnings:[...primary.fieldWarnings]};
 if(!['电容','电感'].includes(out.category)||!out.value||!out.package)return out;
 const nominal=parseElectricalValue(out.value),same=alternates.map(extractPhotoLabel).filter(p=>{
   const v=parseElectricalValue(p.value);
   return p.category===out.category&&p.package===out.package&&nominal&&v&&v.kind===nominal.kind&&closeEnough(v.base,nominal.base);
 });
 const quantities=new Set([out.qty,...same.map(p=>p.qty)].filter(Boolean));
 const qtyConflict=[out,...same].some(p=>p.warnings.some(w=>w.startsWith('数量出现多个值')));
 if(quantities.size>1||qtyConflict){out.qty='';out.qtySource='';if(quantities.size>1)out.warnings.push(`数量出现多个值：${[...quantities].join(' / ')}，请核对实物数量`);else out.warnings.push('数量出现多个值，请核对实物数量');}
 else{const reads=[out,...same],p=reads.find(x=>x.qty&&x.qtySource==='explicit')||reads.find(x=>x.qty);if(p){out.qty=p.qty;out.qtySource=p.qtySource;}}
 const tolerances=new Map();
 for(const p of [out,...same])for(const [key,text] of [['tolerance',p.tolerance],['absTolerance',p.absTolerance]]){
   const id=toleranceIdentity(text);if(id&&!tolerances.has(id))tolerances.set(id,{key,text});
 }
 if(tolerances.size>1){out.tolerance='';out.absTolerance='';out.warnings.push(`误差出现多个值：${[...tolerances.values()].map(x=>formatTolerance(x.text)).join(' / ')}，请核对标签`);if(!out.fieldWarnings.includes('精度'))out.fieldWarnings.push('精度');}
 else if(tolerances.size===1){const {key,text}=tolerances.values().next().value;out[key]=text;out.fieldWarnings=out.fieldWarnings.filter(x=>x!=='精度');}
 out.warnings=out.warnings.filter(w=>!(out.qty&&w.startsWith('未确定数量'))&&!w.startsWith('关键字段未可靠识别：'));
 if(out.fieldWarnings.length)out.warnings.push(`关键字段未可靠识别：${out.fieldWarnings.join('、')}；请在确认前手工填写`);
 return out;
}
// Prefer the enhanced reading only when it adds key fields without losing or changing the first reading.
export function choosePhotoOcrText(first,second,icMode=false){
 const a=extractPhotoLabel(first),b=extractPhotoLabel(second);
 const keys=['value','qty','package','tolerance','absTolerance','sku','voltage','power','dielectric'];
 const same=(key,x,y)=>{
   if(key==='tolerance'||key==='absTolerance')return toleranceIdentity(x)===toleranceIdentity(y);
   if(key!=='value')return x===y;
   const p=parseElectricalValue(x,'R'),q=parseElectricalValue(y,'R');
   return p&&q?p.kind===q.kind&&closeEnough(p.base,q.base):x===y;
 };
 const useful=[icMode?'sku':'value','qty','package'];
 return useful.some(k=>!a[k]&&b[k])&&keys.every(k=>!a[k]||b[k]&&same(k,a[k],b[k]))?second:first;
}
export function labelPartConflicts(label,existing){
 const explicitSku=label.labelSku??label.sku;
 const skuMismatch=explicitSku&&String(explicitSku).trim().toUpperCase()!==String(existing.sku||'').trim().toUpperCase();
 const errors=[];for(const key of ['category','mount','package','tolerance','voltage','power','dielectric','manufacturer']){if(!String(label[key]||'').trim()||label[key]==='其他')continue;const a=norm(label[key]),b=norm(existing[key]);if(a!==b)errors.push(`${{category:'分类',mount:'贴装方式',package:'封装',tolerance:'精度',voltage:'耐压',power:'功率',dielectric:'介质',manufacturer:'品牌'}[key]}：标签 ${label[key]}，已有 ${existing[key]||'未填写'}`);}
 if(label.value){const a=parseElectricalValue(label.value,label.category==='电阻'?'R':''),b=parseElectricalValue(existing.value,existing.category==='电阻'?'R':'');if(!(a&&b&&a.kind===b.kind&&closeEnough(a.base,b.base))&&norm(label.value)!==norm(existing.value))errors.push(`标称值：标签 ${label.value}，已有 ${existing.value||'未填写'}`);}
 if(skuMismatch)errors.push(`型号：标签 ${explicitSku}，已有 ${existing.sku||'未填写'}`);
 return errors;
}
export function labelSuggestedSku(p){
 if(p.sku?.trim())return p.sku.trim();
 return generatePartSku(p);
}

export function collectAlerts(state) {
  const alerts=[];
  for(const p of state.parts){const qty=state.stocks.filter(s=>s.partId===p.id).reduce((n,s)=>n+s.qty,0);if(p.minStock>qty)alerts.push({kind:'stock',partId:p.id,title:`${p.sku} 低于安全库存`,body:`现有 ${qty}，安全库存 ${p.minStock}；建议补充 ${p.minStock-qty} 个。`,level:'warning'});}
  const groups=new Map();
  for(const o of state.observations){if(!state.parts.some(p=>p.id===o.partId&&(p.watch||state.stocks.some(st=>st.partId===p.id))))continue;const key=JSON.stringify([o.partId,o.source,o.currency,o.quantityTier,o.kind]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(o);}
  for(const records of groups.values()){
    records.reverse().sort((a,b)=>Date.parse(b.asOf)-Date.parse(a.asOf)||Date.parse(b.recordedAt)-Date.parse(a.recordedAt));const latest=records[0];const p=state.parts.find(x=>x.id===latest.partId);
    const status=records.find(o=>o.lifecycle);if(status&&['nrnd','eol','obsolete'].includes(status.lifecycle))alerts.push({kind:'lifecycle',partId:p.id,title:`${p.sku} · ${{nrnd:'不推荐新设计',eol:'生命周期结束通知',obsolete:'已停产'}[status.lifecycle]}`,body:status.notice||'请打开原始来源核对替代方案与最后采购日期。',level:'danger',source:status.source,url:status.sourceUrl,asOf:status.asOf,stale:Date.now()-Date.parse(status.asOf)>30*86400000});
    const priced=records.filter(o=>Number.isFinite(o.price)&&o.price>0);if(priced.length>1){const [a,b]=priced;const increase=(a.price/b.price-1)*100;if(increase>=state.settings.priceThreshold)alerts.push({kind:'price',partId:p.id,title:`${p.sku} 单价上涨 ${increase.toFixed(1)}%`,body:`${a.currency} ${b.price} → ${a.price} / 个 · 数量档 ${a.quantityTier}${a.kind==='manual'?' · 手动记录，仅供采购参考':''}`,level:'warning',source:a.source,url:a.sourceUrl,asOf:a.asOf,stale:Date.now()-Date.parse(a.asOf)>30*86400000});}
  }return alerts;
}
export function toCsv(rows) {return '\uFEFF'+rows.map(row=>row.map(value=>{let s=String(value??'');if(/^(?:[\t\r\n]|[\s\uFEFF]*[=+@\-＝＋＠－])/.test(s)&&!/^[-+]\d+(\.\d+)?$/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}).join(',')).join('\r\n');}
