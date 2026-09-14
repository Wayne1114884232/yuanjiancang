import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeLcscCode,parseLcscDetail,lcscSearchUrl} from '../lcsc.mjs';
import {emptyState,applyAction} from '../domain.mjs';

test('normalizes and validates LCSC part numbers',()=>{
  assert.equal(normalizeLcscCode('17976'),'C17976');
  assert.equal(normalizeLcscCode(' c17976 '),'C17976');
  assert.throws(()=>normalizeLcscCode('STM32G431'),/C 加数字/);
  assert.equal(lcscSearchUrl('C17976'),'https://so.szlcsc.com/global.html?k=C17976');
});

test('parses only valid positive USD price tiers from LCSC response',()=>{
  const detail=parseLcscDetail({code:200,result:{productCode:'C17976',productModel:'1206W4F680JT5E',stockNumber:102700,pdfUrl:'https://datasheet.lcsc.com/a.pdf',productPriceList:[{ladder:50,usdPrice:.0159},{ladder:500,usdPrice:.0134},{ladder:0,usdPrice:1},{ladder:1000,usdPrice:0}]}});
  assert.deepEqual(detail,{productCode:'C17976',productModel:'1206W4F680JT5E',stockNumber:102700,prices:[{quantityTier:'50',price:.0159},{quantityTier:'500',price:.0134}],datasheetUrl:'https://datasheet.lcsc.com/a.pdf'});
  assert.equal(parseLcscDetail({code:404,result:null},'C17976'),null);
});

test('component records keep a validated LCSC code for automatic price checks',()=>{
  const state=emptyState();
  const result=applyAction(state,{type:'part.save',requestId:'lcsc-test-request',part:{sku:'R-68R-1206',name:'68Ω 电阻',category:'电阻',mount:'贴片',package:'1206',minStock:0,watch:true,lcscCode:'c17976'},locationId:state.locations[0].id,bin:'A-01',qty:0});
  assert.equal(result.state.parts[0].lcscCode,'C17976');
  assert.equal(result.state.settings.lcscEnabled,true);
});

test('price-only IC watch can be added without creating a physical stock bin',()=>{
  const state=emptyState();
  const result=applyAction(state,{type:'part.save',skipStock:true,requestId:'price-watch-only-test',part:{sku:'STM32G431CBT6',name:'STM32G431CBT6',category:'IC',mount:'贴片',package:'LQFP-48',minStock:0,watch:true,lcscCode:'C529313'}});
  assert.equal(result.state.parts.length,1);
  assert.equal(result.state.parts[0].watch,true);
  assert.equal(result.state.parts[0].lcscCode,'C529313');
  assert.equal(result.state.stocks.length,0);
});
