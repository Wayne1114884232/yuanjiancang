import test from 'node:test';
import assert from 'node:assert/strict';
import {generatePartSku} from '../public/logic.js';
import {emptyState,applyAction} from '../domain.mjs';

test('automatic component identifiers use category, value, package and tolerance',()=>{
  assert.equal(generatePartSku({category:'电容',value:'0.1μF',package:'0402',tolerance:'5'}),'C-100NF-0402-5%');
  assert.equal(generatePartSku({category:'电阻',value:'4.7kΩ',package:'0402',tolerance:'1'}),'R-4K7-0402-1%');
  assert.equal(generatePartSku({category:'二极管',name:'1N4148',package:'SOD-123'}),'D-1N4148-SOD-123-NA');
});

test('manual component creation generates and disambiguates missing sku',()=>{
  let state=emptyState();
  const part={name:'4.7kΩ 电阻',category:'电阻',mount:'贴片',package:'0402',value:'4.7kΩ',tolerance:'1'};
  let out=applyAction(state,{type:'part.save',part,locationId:state.locations[0].id,qty:0}); state=out.state;
  out=applyAction(state,{type:'part.save',part,locationId:state.locations[0].id,qty:0}); state=out.state;
  assert.equal(state.parts[0].sku,'R-4K7-0402-1%');
  assert.equal(state.parts[1].sku,'R-4K7-0402-1%-2');
});

test('editing an existing component keeps its historical identifier',()=>{
  let state=emptyState();
  let out=applyAction(state,{type:'part.save',part:{sku:'LEGACY-R',name:'4.7kΩ 电阻',category:'电阻',mount:'贴片',package:'0402',value:'4.7kΩ',tolerance:'1'},locationId:state.locations[0].id,qty:0}); state=out.state;
  const p=state.parts[0];
  out=applyAction(state,{type:'part.save',part:{...p,value:'10kΩ'},locationId:state.locations[0].id,qty:0});
  assert.equal(out.state.parts[0].sku,'LEGACY-R');
});
