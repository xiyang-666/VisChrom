import test from 'node:test';
import assert from 'node:assert/strict';
import { hexToLab,labToHex,distance,normalizeColors,percentageLabels,setColorPercentage,sanitizeState,defaultState,evaluate,generate,extractColors,confusionWarnings,colorName } from '../public/color-engine.js';

function seeded(seed=7){return()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};}
test('OKLab conversions preserve black, white and chromatic sRGB colors',()=>{
  for(const hex of ['#000000','#FFFFFF','#FF0000','#00FF00','#0000FF','#4B6754','#BD8B73'])assert.equal(labToHex(hexToLab(hex)),hex);
  assert.ok(Math.abs(hexToLab('#FFFFFF')[0]-1)<.00001);
  assert.ok(distance('#000000','#FFFFFF')>.99);
});
test('multicolor weights normalize, merge duplicate colors and reject invalid input',()=>{
  const colors=normalizeColors([{hex:'#ff0000',weight:30},{hex:'#FF0000',weight:10},{hex:'#0000FF',weight:60},{hex:'bad',weight:50},{hex:'#00FF00',weight:-1}]);
  assert.deepEqual(colors,[{hex:'#FF0000',weight:40},{hex:'#0000FF',weight:60}]);
  assert.deepEqual(normalizeColors([{hex:'#FF0000',weight:0}]),[]);
});
test('displayed percentages always add to 100',()=>{
  for(const weights of [[1,1,1],[1,1,1,1,1],[99,1,1]])assert.equal(percentageLabels(weights.map((weight,i)=>({hex:['#112233','#223344','#334455','#445566','#556677'][i],weight}))).reduce((a,b)=>a+b),100);
});
test('editing an area percentage preserves the requested share and other color ratios',()=>{
  const colors=[{hex:'#FF0000',weight:60},{hex:'#00FF00',weight:20},{hex:'#0000FF',weight:20}];
  assert.deepEqual(setColorPercentage(colors,0,50).map(c=>c.weight),[50,25,25]);
  assert.equal(setColorPercentage(colors,0,100)[0].weight,99);
  assert.equal(setColorPercentage([colors[0]],0,50)[0].weight,100);
  assert.ok(normalizeColors([{hex:'#FF0000',weight:1e308},{hex:'#0000FF',weight:1e308}]).every(c=>Number.isFinite(c.weight)));
});
test('backup validation rejects bad versions and sanitizes colors and arbitrary content',()=>{
  assert.throws(()=>sanitizeState({version:99,outfit:[]}));
  const raw=defaultState();raw.profile.skin='<script>';raw.outfit[0].colors.push({hex:'bad',weight:10});raw.style='evil';raw.vision='evil';raw.favorites=[{id:'x',style:'constructor',outfit:raw.outfit}];
  const safe=sanitizeState(raw);assert.equal(safe.profile.skin,null);assert.equal(safe.style,'balanced');assert.equal(safe.vision,'none');assert.equal(safe.outfit[0].colors.length,2);assert.equal(safe.favorites[0].style,'balanced');
});
test('missing colors do not produce an invented rating',()=>{
  assert.equal(evaluate([]).score,null);
  assert.equal(evaluate([{role:'top',colors:[{hex:'#FFFFFF',weight:100}]}]).score,null);
});
test('personal dimension is omitted and remaining weights normalized when profile absent',()=>{
  const state=defaultState(),result=evaluate(state.outfit,{});
  assert.equal(result.dimensions.length,3);assert.ok(Math.abs(result.dimensions.reduce((s,d)=>s+d.weight,0)-1)<1e-10);
  const personalized=evaluate(state.outfit,{skin:'#4B6754',hair:'#352825'});
  assert.equal(personalized.dimensions.length,4);assert.ok(personalized.hints.some(h=>h.includes('肤色')));
});
test('minor colors and their areas influence rating instead of collapsing to dominant color',()=>{
  const a=defaultState().outfit,b=structuredClone(a),c=structuredClone(a);
  a[0].colors=[{hex:'#4B6754',weight:100}];
  b[0].colors=[{hex:'#4B6754',weight:80},{hex:'#FF00FF',weight:20}];
  c[0].colors=[{hex:'#4B6754',weight:20},{hex:'#FF00FF',weight:80}];
  const sa=evaluate(a),sb=evaluate(b),sc=evaluate(c);
  assert.notDeepEqual(sa.dimensions,sb.dimensions);assert.notDeepEqual(sb.dimensions,sc.dimensions);assert.ok(sb.hints.some(h=>h.includes('面积占比')));
});
test('generation preserves every locked pattern color and percentage and never mutates input',()=>{
  const s=defaultState(),before=structuredClone(s);
  s.outfit[0].colors=[{hex:'#D7534F',weight:60},{hex:'#4B6754',weight:30},{hex:'#FFFFFF',weight:10}];
  const copy=structuredClone(s),proposals=generate(s.outfit,s.profile,'balanced',seeded());
  assert.equal(proposals.length,3);
  for(const p of proposals){assert.deepEqual(p.outfit[0],s.outfit[0]);assert.ok(p.outfit.every(i=>i.colors.length));assert.ok(p.score>=0&&p.score<=100);}
  assert.deepEqual(s,copy);assert.notDeepEqual(s,before);
});
test('fully locked outfit returns no proposals, empty slots can still be completed',()=>{
  const s=defaultState();s.outfit.forEach(i=>i.locked=true);assert.deepEqual(generate(s.outfit),[]);
  s.outfit[1].colors=[];assert.equal(generate(s.outfit,{},'balanced',seeded()).length,3);
});
test('random proposals have distinct palettes and all styles produce bounded scores',()=>{
  for(const style of ['soft','balanced','bold']) {
    const s=defaultState();s.outfit.forEach(i=>i.locked=false);
    const p=generate(s.outfit,{},style,seeded());assert.equal(new Set(p.map(x=>JSON.stringify(x.outfit))).size,3);
    for(const x of p)assert.ok(x.score>=0&&x.score<=100);
  }
});
test('pixel extraction returns actual region proportions for multicolor fabric',()=>{
  const pixels=[];for(let i=0;i<100;i++)pixels.push(...(i<75?[255,0,0,255]:[0,0,255,255]));
  const colors=extractColors(Uint8ClampedArray.from(pixels),3);
  assert.equal(colors.length,2);assert.equal(colors[0].hex,'#FF0000');assert.equal(colors[1].hex,'#0000FF');assert.equal(colors[0].weight,75);assert.equal(colors[1].weight,25);
});
test('transparent pixels are excluded and one-color input stays one color',()=>{
  assert.deepEqual(extractColors(Uint8ClampedArray.from([0,0,0,0])),[]);
  assert.deepEqual(extractColors(Uint8ClampedArray.from([255,255,255,255,0,0,0,0]),5),[{hex:'#FFFFFF',weight:100}]);
});
test('accessibility warnings never mutate colors or change appearance score',()=>{
  const s=defaultState(),copy=structuredClone(s),score=evaluate(s.outfit).score;
  for(const type of ['protan','deutan','unknown'])assert.ok(Array.isArray(confusionWarnings(s.outfit,type)));
  assert.deepEqual(s,copy);assert.equal(evaluate(s.outfit).score,score);assert.equal(colorName('#FFFFFF'),'白色');
});
