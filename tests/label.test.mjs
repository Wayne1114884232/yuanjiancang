import test from 'node:test';
import assert from 'node:assert/strict';
import {extractLabel,extractPhotoLabel,bestPhotoOcrText,ocrCrossCheck,choosePhotoOcrText,mergePhotoPassiveFields,formatTolerance,labelSuggestedSku,labelPartConflicts,normalizeOcrLabelText} from '../public/logic.js';
import {emptyState,applyAction,validateBackup} from '../domain.mjs';
import {TeamEngine,emptyDocument} from '../team-engine.mjs';
import {randomUUID} from 'node:crypto';

test('milliohm parts and overseas bag formats parse without inventing values',()=>{
 const ohms=extractPhotoLabel('型号:RTT025R200FTE 0R2±1% 1W\n封装:2512\n数量:100');
 assert.deepEqual([ohms.value,ohms.tolerance,ohms.package,ohms.qty],['200mΩ','1','2512','100']);
 assert.equal(extractPhotoLabel('R005 1% 2W 1206\nQTY:50').value,'5mΩ');
 assert.equal(extractPhotoLabel('200mR ±1% 2512 1W').value,'200mΩ');
 assert.equal(extractPhotoLabel('2mΩ ±5% 0805').value,'2mΩ');
 const dk=extractPhotoLabel('RC0402FR-0710KL\nRES 10K OHM 1% 1/16W 0402\nQTY:100');
 assert.deepEqual([dk.category,dk.value,dk.package,dk.qty],['电阻','10kΩ','0402','100']);
 const mouser=extractPhotoLabel('10 kOhms 1% 100 mW 0402\nQTY 100');
 assert.deepEqual([mouser.value,mouser.package,mouser.qty],['10kΩ','0402','100']);
 const lcsc=extractPhotoLabel('C25804\n0402WGF1002TCE\n10KΩ ±1% 1/16W');
 assert.deepEqual([lcsc.value,lcsc.package],['10kΩ','0402']);
});
test('variant lists on supplier headers do not become the part value',()=>{
 const ind=extractPhotoLabel('欧贝顿旗舰店\n0201贴片高频层电感 14NH 1.5N!\n1.6NH 1.8NH 2NH 2.2NH\nR9-4-20\n0201 1.8NH±0.3NH\n100');
 assert.deepEqual([ind.category,ind.value,ind.absTolerance,ind.package,ind.qty],['电感','1.8nH','±0.3nH','0201','100']);
 assert.ok(!ind.warnings.some(w=>/出现多个值/.test(w)));
 const cap=extractPhotoLabel('0.201 8PF 50V ±0.25PF C0G\n0201 8PF 50V ±0.25PF\n100');
 assert.deepEqual([cap.value,cap.absTolerance,cap.package],['8pF','±0.25pF','0201']);
});
test('diode, MOS and connector bags are classified from model and package',()=>{
 assert.deepEqual([extractPhotoLabel('SS34 SMA 3A 40V\n3000pcs').category,extractPhotoLabel('SS34 SMA 3A 40V\n3000pcs').package],['二极管','SMA']);
 assert.equal(extractPhotoLabel('AO3400 SOT-23\nQTY:3000').category,'MOS管');
 assert.equal(extractPhotoLabel('XH2.54-4P 4Pin\n数量:100').category,'连接器');
});
test('zero-ohm, absolute tolerance and crystal labels are separated into the right fields',()=>{
 const zero=extractPhotoLabel('型号:0402WGF0000TCE OR±1%\n封装:0402\n数量:50');
 assert.deepEqual([zero.category,zero.value,zero.tolerance,zero.package,zero.qty],['电阻','0Ω','1','0402','50']);
 const cap=extractPhotoLabel('0.201 8PF 50V ±0.25PF C0G NPO材质\n0201 8PF 50V ±0.25PF\n100');
 assert.deepEqual([cap.category,cap.value,cap.absTolerance,cap.package,cap.qty],['电容','8pF','±0.25pF','0201','100']);
 assert.ok(!cap.warnings.some(w=>/出现多个值/.test(w)));
 const ind=extractPhotoLabel('0402 10nH ±0.1nH 200mA\n数量:100');
 assert.deepEqual([ind.category,ind.value,ind.absTolerance,ind.qty],['电感','10nH','±0.1nH','100']);
 const xtal=extractPhotoLabel('2016贴片 无源晶振石英晶体谐振器\nR29-5-28\n2016 26MHZ 10PF 10PPM\n10');
 assert.deepEqual([xtal.category,xtal.value,xtal.package,xtal.qty],['晶振','26MHz','2016','10']);
 assert.equal(xtal.loadCapacitance,'10PF');assert.equal(xtal.stability,'10PPM');
 assert.equal(labelSuggestedSku({category:'晶振',value:'26MHz',package:'2016'}),'Y-26MHZ-2016-NA');
});
test('capacitor absolute tolerance keeps its unit and count does not become a lot number',()=>{
 for(const glyph of ['土','±','+ / −','＋－']){
   const p=extractPhotoLabel(`0201 8PF 50V ${glyph} .25 P F\n100\n12345678 26-10-13 18:08:23`);
   assert.deepEqual([p.category,p.value,p.absTolerance,p.qty,p.qtySource],['电容','8pF','±0.25pF','100','layout']);
 }
 assert.equal(extractPhotoLabel('0201 8pF ±0.25pF\n100\n200').qty,'');
 assert.equal(extractPhotoLabel('0201 8pF ±0.25pF\n100\nQTY:2盘').qty,'');
 assert.equal(extractPhotoLabel('0201 8pF ±0.25pF\nQTY:100').qtySource,'explicit');
 assert.equal(formatTolerance('±0.25pF'),'±0.25pF');
 assert.notEqual(labelSuggestedSku({category:'电容',value:'8pF',package:'0201',tolerance:'±0.25pF'}),labelSuggestedSku({category:'电容',value:'8pF',package:'0201',tolerance:'0.25'}));
});

test('matching passive OCR readings supplement missing fields without resolving conflicts by guessing',()=>{
 const raw='0201 8PF 50V 土0.25PF', first=extractPhotoLabel(raw);
 const second='0201 8PF 50V\n数量:100';
 assert.deepEqual(bestPhotoOcrText([raw,'0201 8PF 50V\n生产标签信息更长但缺少误差']),raw);
 let p=mergePhotoPassiveFields(first,[second]);
 assert.deepEqual([p.value,p.absTolerance,p.qty,p.qtySource],['8pF','±0.25pF','100','explicit']);
 p=mergePhotoPassiveFields(extractPhotoLabel(second),[raw]);
 assert.equal(p.absTolerance,'±0.25pF');
 p=mergePhotoPassiveFields(first,[second,'0201 8PF ±0.3PF\n数量:200']);
 assert.equal(p.qty,'');assert.equal(p.absTolerance,'');
 assert.match(p.warnings.join(' '),/数量出现多个值.*误差出现多个值/);
 assert.equal(mergePhotoPassiveFields(first,['0201 10PF\n数量:100']).qty,'');
 const ind=extractPhotoLabel('0201 1.8NH±0.3NH\n100');
 assert.deepEqual([ind.category,ind.value,ind.absTolerance,ind.qty],['电感','1.8nH','±0.3nH','100']);
});

test('photo crystal and capacitor can be received and persisted by the inventory domain',()=>{
 for(const [raw,expected] of [['2016 26MHZ 10PF 10PPM\n10',['晶振','26MHz','2016','',10]],['0201 8PF 50V 土0.25PF\n数量:100',['电容','8pF','0201','±0.25pF',100]]]){
   const s=emptyState(),p=extractPhotoLabel(raw);
   const part={...p,sku:labelSuggestedSku(p),name:p.name||[p.value,p.category].join(' '),tolerance:p.tolerance||p.absTolerance};
   const {state,order}=applyAction(s,{type:'label.receive',part,qty:Number(p.qty),locationId:s.locations[0].id,labelText:raw,note:p.note});
   const saved=validateBackup(state).parts[0];
   assert.deepEqual([saved.category,saved.value,saved.package,saved.tolerance,state.stocks[0].qty],expected);
   if(p.category==='晶振'){
     assert.match(order.note,/负载电容 10PF.*频差 10PPM/);
     assert.throws(()=>applyAction(s,{type:'label.receive',part:{...part,value:'26'},qty:10,locationId:s.locations[0].id}),/晶振请填写有效频率/);
   }
 }
});

test('OCR plus-minus misread as the character tu keeps the resistance and category',()=>{
 const p=extractPhotoLabel('型号:0402WGF4702TCE 47K土1%\n封装: 0402\n数量: 50');
 assert.deepEqual([p.value,p.tolerance,p.package,p.qty,p.category],['47kΩ','1','0402','50','电阻']);
 const alt=extractPhotoLabel('47K＋－1% 0402\n数量:50');
 assert.deepEqual([alt.value,alt.tolerance],['47kΩ','1']);
});
test('supplier resistor OCR treats 土 and 士 as tolerance signs without changing brand names',()=>{
 const label=value=>`ITI\nA5861 7\n柜号:13\n型号:0402WGF4701TCE ${value}\n封装:0402\n品牌: UNI-ROYAL (厚声集团)\n数量:100`;
 for(const value of ['4.7K土1%','4.7K士1%','4K7土1%','4K7士1%','4.7 K 士 1 %','4 K 7士1%','4K7±1%','4．7Ｋ士１％']){
   const raw=label(value),p=extractPhotoLabel(raw);
   assert.deepEqual([p.category,p.value,p.tolerance,p.package,p.qty],['电阻','4.7kΩ','1','0402','100'],value);
   assert.equal(p.description,raw);
   assert.equal(extractLabel(raw).sku,'0402WGF4701TCE');
 }
 for(const value of ['4K7','4.7K'])assert.equal(extractPhotoLabel(label(value)).value,'4.7kΩ');
 assert.deepEqual(ocrCrossCheck([label('4K7土1%'),label('4.7K士1%')]),[]);
 assert.match(ocrCrossCheck([label('4K7土1%'),label('47K士1%')]).join(),/标称值不同/);
 assert.match(normalizeOcrLabelText('品牌：厚土 / 新士 / 土星 / 士兰'),/厚土 \/ 新士 \/ 土星 \/ 士兰/);
 assert.equal(extractPhotoLabel('封装:0603\n10K 50pcs').value,'10kΩ');
 assert.equal(extractPhotoLabel('0201 8PF 士0.25PF').absTolerance,'±0.25pF');
 assert.equal(extractPhotoLabel('型号:0402WGF1103TCE 11OK士1%').value,'110kΩ');
 assert.equal(extractPhotoLabel('型号:0402WGF0000TCE OR士1%').value,'0Ω');
});

test('cross-check reports disagreement instead of silently averaging',()=>{
 assert.deepEqual(ocrCrossCheck(['47K±1% 0402 数量:50','47K±1% 0402 数量:50']),[]);
 assert.match(ocrCrossCheck(['47K±1% 数量:50','4.7K±1% 数量:50']).join(),/标称值不同/);
 assert.match(ocrCrossCheck(['47K±1% 数量:50','47K±1% 数量:100']).join(),/数量不同/);
});
test('dual OCR readings choose the one that fills the most label fields',()=>{
 const partial='型号:0402WGF1103TCE\n封装:0402\n批次:153942';
 const full='0402WGF1103TCE 110K±1% 0402 数量:50';
 assert.equal(bestPhotoOcrText([partial,full]),full);
 assert.equal(bestPhotoOcrText([full,partial]),full);
 assert.equal(bestPhotoOcrText(['','']),'');
 assert.equal(bestPhotoOcrText([],false),'');
});
test('letter O misread as zero is corrected only inside a numeric value and disclosed',()=>{
 const p=extractPhotoLabel('11OK±1% 封装:0402 数量:50');
 assert.deepEqual([p.value,p.tolerance,p.qty,p.package],['110kΩ','1','50','0402']);
 assert.ok(p.warnings.some(w=>/字母 O/.test(w)));
 assert.equal(extractPhotoLabel('LOGO 封装:0402').value,'');
 assert.equal(extractPhotoLabel('11OK±1%').warnings.some(w=>/字母 O/.test(w)),true);
});
test('edited OCR text parses split headings and separates quantity from explicit barcode metadata',()=>{
 const raw='A58663\n型\n号:0402WGF1103TCE\n110K±1%\n装:0402\n数\n量. 50 条码:12345678';
 const p=extractPhotoLabel(raw);
 assert.deepEqual([p.value,p.tolerance,p.package,p.qty],['110kΩ','1','0402','50']);
 assert.equal(extractPhotoLabel('数量:50 12345678').qty,'');
 assert.equal(extractPhotoLabel('数量:1,2').qty,'');
 assert.equal(extractPhotoLabel('数量:2盘 条码:12345678').qty,'');
});
test('enhanced OCR fills missing fields without overriding conflicting readings',()=>{
 const first='73K2 ±1% 封装:0402',better=first+'\n数量:50';
 assert.equal(choosePhotoOcrText(first,better),better);
 assert.equal(choosePhotoOcrText(first,'10K ±1% 封装:0402\n数量:50'),first);
 assert.equal(choosePhotoOcrText(first,'数量:50'),first);
 assert.equal(choosePhotoOcrText('',better),better);
 const cap='0.1uF 封装:0603',capRetry='100nF 封装:0603\n数量:100';
 assert.equal(choosePhotoOcrText(cap,capRetry),capRetry);
 assert.equal(choosePhotoOcrText(better,first),better);
});
test('generic Taobao resistor label parses value precision quantity package brand and lot without an MPN',()=>{
 const p=extractLabel('阻值4.7K，精度1%，数量100，封装0402，品牌xxx，批次xxx');
 for(const [key,value] of Object.entries({value:'4.7kΩ',tolerance:'1',qty:'100',package:'0402',manufacturer:'xxx',lotCode:'xxx',category:'电阻',sku:''}))assert.equal(p[key],value,key);
 assert.ok(labelSuggestedSku(p));assert.equal(p.warnings.length,0);
});
test('capacitor and English supplier labels preserve explicit parameters and quantity',()=>{
 const p=extractLabel('贴片电容\n容量:0.1uF\n封装:0603\n耐压:50V\n精度:10%\n介质:X7R\n品牌:风华\n数量:100颗\n批号:20260923-A');
 assert.equal(p.category,'电容');assert.equal(p.value,'0.1µF');assert.equal(p.voltage,'50V');assert.equal(p.dielectric,'X7R');assert.equal(p.manufacturer,'风华');assert.equal(p.lotCode,'20260923-A');assert.equal(p.qty,'100');
 const eng=extractLabel('MPN: RC0402FR-074K7L\nValue:4K7\nTolerance:1%\nPackage:0402\nBrand:YAGEO\nQTY:1,000\nLOT:AB-231\nPower:1/16W');assert.equal(eng.sku,'RC0402FR-074K7L');assert.equal(eng.value,'4.7kΩ');assert.equal(eng.qty,'1000');assert.equal(eng.manufacturer,'YAGEO');assert.equal(eng.power,'1/16W');
});
test('bare K notation is accepted but package, batch, price and ambiguous counts are not invented into values',()=>{
 assert.equal(extractLabel('4.7K 0402 1% 100pcs').value,'4.7kΩ');assert.equal(extractLabel('4K7 0402 1%').value,'4.7kΩ');
 for(const text of ['0402 1% 批次20260923','电容 104 0603','数量2包 品牌未知','QTY:1.5','批次100','价格100元'])assert.equal(extractLabel(text).qty,'',text);
 const p=extractLabel('阻值4.7K 数量100\n阻值10K 数量200');assert.equal(p.value,'');assert.equal(p.qty,'');assert.ok(p.warnings.length>0);
 assert.equal(extractLabel('无法识别').package,'');assert.equal(extractLabel('无法识别').category,'其他');
});
test('English field names cannot split manufacturer or model values; explicit different models cannot merge',()=>{
 const p=extractLabel('Brand: Lotus\nMPN: APower123\nLOT: BatchMaker\nQTY: 100');
 assert.equal(p.manufacturer,'Lotus');assert.equal(p.sku,'APower123');assert.equal(p.lotCode,'BatchMaker');
 assert.equal(extractLabel('品牌测试品牌 批次A').manufacturer,'测试品牌');
 const ocr=extractLabel('Value: 4 ． 7K\nTolerance: 1 ％\nPackage: 0402\nQ TY: 100');assert.equal(ocr.value,'4.7kΩ');assert.equal(ocr.qty,'100');
 assert.match(labelPartConflicts({sku:'APower123'},{sku:'APower456'}).join(''),/型号/);
 assert.deepEqual(labelPartConflicts({sku:'generated-id',labelSku:''},{sku:'my-internal-id'}),[]);
 let s=emptyState();s=applyAction(s,{type:'part.save',part:{sku:'IC-A',name:'A',category:'IC',mount:'贴片'},locationId:s.locations[0].id,qty:0}).state;
 assert.throws(()=>applyAction(s,{type:'label.receive',partId:s.parts[0].id,part:{sku:'IC-B'},locationId:s.locations[0].id,qty:100}),/型号/);
 assert.equal(s.stocks[0].qty,0);
});
test('OCR spacing and full-width punctuation are repaired for the three critical fields',()=>{
 const p=extractLabel('阻值 4 ． 7 K\n精度 1 ％\n封装 0 4 0 2\n数量 100');
 assert.equal(normalizeOcrLabelText('4 ． 7 K 1 ％'),'4.7K 1%');
 assert.equal(p.value,'4.7kΩ');assert.equal(p.tolerance,'1');assert.equal(p.package,'0402');assert.equal(p.qty,'100');
 assert.equal(extractLabel('Value. 4 · 7K\nTolerance. 1 ％\nPackage. 0402\nQTY:100').value,'4.7kΩ');
});
test('resistor photo text accepts printed R notation and split piece units without merging columns',()=>{
 for(const [raw,value,qty] of [
   ['封装:0805\n阻值: 220R\nQTY. 1, 000 P C S.','220Ω','1000'],
   ['封装:0603\n4 K7\n数量: 250 PC','4.7kΩ','250'],
   ['0603 10K 50pcs','10kΩ','50'],
   ['0805 0R 100 P C','0Ω','100'],
   ['0402 4.7 k Ω 100颗','4.7kΩ','100']
 ]){const p=extractPhotoLabel(raw);assert.equal(p.value,value,raw);assert.equal(p.qty,qty,raw);}
 for(const raw of ['阻值:472\n封装:0603','封装:0603\n批次: 472'])assert.equal(extractPhotoLabel(raw).value,'',raw);
 assert.equal(extractPhotoLabel('封装:0603\n数量: 2盘').qty,'');
});
test('supplier model lines preserve written resistor or capacitor specs, not barcode and lot numbers',()=>{
 const r=extractPhotoLabel('柜号:8 2/5\nA71820 5588594\n型号:0402WGF7322TCE 73K2±1%\n品牌:UNI-ROYAL\n封装:0402\nB-15-02-30 批次:153942\n数 量. 50');
 assert.deepEqual([r.category,r.value,r.tolerance,r.package,r.qty],['电阻','73.2kΩ','1','0402','50']);
 const c=extractPhotoLabel('型号:CL05B104KB5NNNC 100nF ±10% 50V X7R\n封装:0402\n数量:\n1,000 PCS');
 assert.deepEqual([c.category,c.value,c.tolerance,c.package,c.voltage,c.dielectric,c.qty],['电容','100nF','10','0402','50V','X7R','1000']);
 const blank=extractPhotoLabel('型号:0402WGF7322TCE\n封装:0402\n批次:153942\n柜号:8 2/5\n5588594');
 assert.deepEqual([blank.value,blank.qty],['','']);
 const conflict=extractPhotoLabel('型号:0402WGF7322TCE 73K2±1%\n阻值:10K\n数量:50\n数量:100');
 assert.deepEqual([conflict.value,conflict.qty],['','']);
});
test('photo parameters take precedence over unreliable identity metadata and packed headings',()=>{
 const p=extractPhotoLabel('封装:0402 4.7K ±1% 100pcs\nBrand: noise\nLOT: 0805\nSupplier: unknown');
 assert.equal(p.value,'4.7kΩ');assert.equal(p.package,'0402');assert.equal(p.tolerance,'1');assert.equal(p.qty,'100');
 for(const key of ['sku','manufacturer','lotCode','supplier'])assert.equal(p[key],'');
 const q=extractPhotoLabel('电容 0.1uF ±10% 0603 50V X7R\n批号0805');assert.equal(q.value,'0.1µF');assert.equal(q.package,'0603');assert.equal(q.tolerance,'10');
 assert.equal(extractPhotoLabel('MPN: STM32G431CBT6\nPackage: LQFP-48').sku,'STM32G431CBT6');
 const conflict=extractPhotoLabel('4.7K 0402 1%\n10K 0603 5%');assert.equal(conflict.value,'');assert.equal(conflict.package,'');assert.equal(conflict.tolerance,'');
 const metadataFirst=extractLabel('品牌风华 阻值4.7K 精度1% 封装0402');assert.equal(metadataFirst.value,'4.7kΩ');
});
test('label stock posting is atomic, does not require LCSC, and keeps each receiving lot in ledger and backup',()=>{
 let s=emptyState();const p=extractLabel('阻值4.7K 精度1% 数量100 封装0402 品牌xxx 批次A');p.sku=labelSuggestedSku(p);
 const action={type:'label.receive',part:p,qty:100,locationId:s.locations[0].id,bin:'A1',lotCode:p.lotCode,supplier:'淘宝店',labelText:p.description};
 const before=structuredClone(s);assert.throws(()=>applyAction(s,{...action,qty:1.5}));assert.deepEqual(s,before);
 const one=applyAction(s,action);s=one.state;assert.equal(s.parts[0].manufacturer,'xxx');assert.equal(s.parts[0].lcscCode,'');assert.equal(s.stocks[0].qty,100);assert.equal(s.orders[0].lotCode,'A');
 s=applyAction(s,{...action,partId:one.partId,qty:30,lotCode:'B'}).state;assert.equal(s.stocks[0].qty,130);assert.deepEqual(s.orders.map(o=>o.lotCode),['A','B']);assert.deepEqual(s.events.map(e=>e.lotCode),['A','B']);assert.equal(validateBackup(s).orders[1].lotCode,'B');assert.equal(s.parts[0].lotCode,undefined);
 assert.throws(()=>applyAction(s,{...action,partId:one.partId,part:{...p,manufacturer:'另一品牌'}}),/品牌/);assert.equal(s.stocks[0].qty,130);
 assert.equal(labelPartConflicts({...p,value:'4K7'},s.parts[0]).length,0);
});
test('label posting enforces library/location permissions and stable request replay',async()=>{
 const e=new TeamEngine(emptyDocument()),a=await e.register('label_owner','password-123','A'),b=await e.register('label_user','password-123','B'),lid=a.workspaces[0].id;
 const inv=e.teamAction(a.key,lid,{type:'invite.create',role:'member',locations:[e.state(a.key,lid).state.locations[1].id],days:1,revision:e.me(a.key).revision});e.teamAction(b.key,b.workspaces[0].id,{type:'invite.join',code:inv.code,revision:e.me(b.key).revision});
 const s=e.state(a.key,lid).state,p=extractLabel('4.7K 0402 1%');p.sku=labelSuggestedSku(p);
 const req={type:'label.receive',part:p,qty:100,locationId:s.locations[0].id,lotCode:'X',rev:s.rev,requestId:randomUUID()};
 assert.throws(()=>e.action(b.key,lid,req),/权限/);assert.equal(e.state(a.key,lid).state.parts.length,0);
 const shared={...req,locationId:s.locations[1].id};
 assert.throws(()=>e.action(b.key,lid,{...shared,part:{...p,critical:true}}),/标记关键元件需要管理员权限/);
 e.action(a.key,lid,req);assert.equal(e.action(a.key,lid,req).duplicate,true);assert.equal(e.state(a.key,lid).state.stocks[0].qty,100);
});
