import JSZip from './lib/jszip.cjs';
import {parseDelimited} from './public/logic.js';
import {assert} from './domain.mjs';
const unescapeXml=text=>String(text||'').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_,key)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[key]??String.fromCodePoint(key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):parseInt(key.slice(1),10))));
const attr=(tag,name)=>unescapeXml(new RegExp(`\\b${name}=["']([^"']*)["']`).exec(tag)?.[1]||'');
const texts=xml=>[...xml.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)].map(m=>unescapeXml(m[1])).join('');
function decodeText(bytes) {try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{return new TextDecoder('gb18030').decode(bytes);}}
export async function readSpreadsheet(bytes,name) {
  const ext=String(name).toLowerCase().split('.').at(-1);
  if(['csv','tsv','txt'].includes(ext)) {const rows=parseDelimited(decodeText(bytes));assert(rows.length<=1001,'最多导入1000行元件');return rows;}
  assert(ext==='xlsx','支持 .xlsx、.csv、.tsv；旧版 .xls 请先另存为 .xlsx 或 CSV');
  const zip=await JSZip.loadAsync(bytes);const entries=Object.values(zip.files);assert(entries.length<2000&&entries.reduce((sum,f)=>sum+(f._data?.uncompressedSize||0),0)<30e6,'Excel文件解压后过大');
  const read=async name=>zip.file(name)?await zip.file(name).async('string'):'';
  const stringsXml=await read('xl/sharedStrings.xml');const strings=[...stringsXml.matchAll(/<(?:\w+:)?si(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?si>/g)].map(m=>texts(m[1]));
  const workbook=await read('xl/workbook.xml');const first=workbook.match(/<sheet\s[^>]*>/)?.[0];assert(first,'Excel中找不到工作表');const rid=attr(first,'r:id');const rels=await read('xl/_rels/workbook.xml.rels');const rel=[...rels.matchAll(/<Relationship\s[^>]*\/?\s*>/g)].map(m=>m[0]).find(x=>attr(x,'Id')===rid);assert(rel,'无法读取Excel工作表关联');const target=attr(rel,'Target');assert(target&&!target.includes('..'),'Excel工作表路径无效');const sheet=await read(target.startsWith('/')?target.slice(1):'xl/'+target);
  assert(!/<(?:\w+:)?f(?:\s|>)/.test(sheet),'BOM工作表中包含公式，请复制并粘贴为数值，或导出CSV后上传');
  const rows=[];
  for(const m of sheet.matchAll(/<(?:\w+:)?row(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?row>/g)) {
    const row=[];for(const c of m[1].matchAll(/<(?:\w+:)?c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
      const ref=attr(c[1],'r');const letters=ref.match(/^[A-Z]+/)?.[0];if(!letters)continue;const idx=[...letters].reduce((sum,ch)=>sum*26+ch.charCodeAt(0)-64,0)-1;assert(idx<100,'BOM最多支持100列');const type=attr(c[1],'t');const inner=c[2]||'';const raw=inner.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/)?.[1]||'';row[idx]=type==='s'?(strings[Number(raw)]??''):type==='inlineStr'?texts(inner):unescapeXml(raw);
    }if(row.some(x=>String(x||'').trim()))rows.push(Array.from({length:row.length},(_,i)=>row[i]??''));assert(rows.length<=1001,'最多导入1000行元件');
  }assert(rows.length>1,'第一个工作表需要包含表头和至少一行元件');return rows;
}
