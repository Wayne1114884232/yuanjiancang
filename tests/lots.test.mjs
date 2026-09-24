import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,applyAction,validateBackup} from '../domain.mjs';

test('receipt lots preserve supplier, FIFO default and explicit batch issue',()=>{
  let state=emptyState(), location=state.locations[0];
  state=applyAction(state,{type:'part.save',part:{sku:'R-4K7',name:'4.7K',category:'电阻',mount:'贴片',package:'0402',value:'4.7kΩ',tolerance:'1%'},locationId:location.id,bin:'A-01',qty:100}).state;
  const stock=state.stocks[0];
  state=applyAction(state,{type:'stock.post',kind:'入库',stockId:stock.id,qty:30,lotCode:'TB-202609',supplier:'淘宝'}).state;
  state=applyAction(state,{type:'stock.post',kind:'出库',stockId:stock.id,qty:10,lotCode:'TB-202609'}).state;
  const lot=state.lots.find(x=>x.lotCode==='TB-202609');
  assert.equal(lot.qty,20);assert.equal(lot.supplier,'淘宝');assert.equal(state.stocks[0].qty,120);
  validateBackup(state);
});

test('legacy stock is represented as an unverified opening lot',()=>{
  let state=emptyState(),location=state.locations[0];
  state=applyAction(state,{type:'part.save',part:{sku:'C1',name:'100nF',category:'电容',mount:'贴片'},locationId:location.id,qty:8}).state;
  const backup=structuredClone(state);delete backup.lots;delete backup.lotMovements;for(const o of backup.orders)delete o.lotTracked;
  const restored=validateBackup(backup);assert.equal(restored.lots.length,1);assert.equal(restored.lots[0].legacy,true);assert.match(restored.lots[0].lotCode,/历史库存/);
});
