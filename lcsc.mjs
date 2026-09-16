const DETAIL_ENDPOINT='https://wmsc.lcsc.com/ftps/wm/product/detail';

export function normalizeLcscCode(value='') {
  const text=String(value).trim().toUpperCase();
  if(!text)return '';
  const code=text.startsWith('C')?text:`C${text}`;
  if(!/^C\d+$/.test(code))throw new Error('立创商城编号格式应为 C 加数字，例如 C17976');
  return code;
}

export function lcscSearchUrl(code) {
  return `https://so.szlcsc.com/global.html?k=${encodeURIComponent(normalizeLcscCode(code))}`;
}

export function parseLcscDetail(payload,expectedCode='') {
  if(!payload||payload.code!==200||!payload.result||typeof payload.result!=='object')return null;
  const result=payload.result;
  const productCode=normalizeLcscCode(result.productCode||expectedCode);
  if(!productCode||(expectedCode&&productCode!==normalizeLcscCode(expectedCode)))return null;
  const prices=Array.isArray(result.productPriceList)?result.productPriceList.flatMap(row=>{
    const ladder=Number(row?.ladder),price=Number(row?.usdPrice);
    return Number.isSafeInteger(ladder)&&ladder>0&&Number.isFinite(price)&&price>0?[{quantityTier:String(ladder),price}]:[];
  }):[];
  return {
    productCode,source:'LCSC 国际报价',currency:'USD',sourceUrl:`${DETAIL_ENDPOINT}?productCode=${encodeURIComponent(productCode)}`,
    productModel:String(result.productModel||'').trim().slice(0,300),
    stockNumber:Number.isSafeInteger(Number(result.stockNumber))?Number(result.stockNumber):null,
    prices,
    datasheetUrl:/^https?:\/\//i.test(String(result.pdfUrl||''))?String(result.pdfUrl):''
  };
}

export async function fetchLcscDetail(code) {
  const productCode=normalizeLcscCode(code);
  const response=await fetch(`${DETAIL_ENDPOINT}?productCode=${encodeURIComponent(productCode)}`,{
    headers:{'User-Agent':'Mozilla/5.0 ComponentHub/1.6',Accept:'application/json',Referer:'https://jlcpcb.com/'},
    signal:AbortSignal.timeout(12000)
  });
  if(!response.ok)throw new Error(`立创价格接口返回 HTTP ${response.status}`);
  const parsed=parseLcscDetail(await response.json(),productCode);
  if(!parsed)throw new Error(`立创商城未返回 ${productCode} 的有效数据`);
  return parsed;
}
