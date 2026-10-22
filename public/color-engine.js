// Pure, deterministic color and recommendation functions. No DOM or network.
export const ROLES = [{ id: 'top', name: '上衣' }, { id: 'bottom', name: '下装' }, { id: 'shoes', name: '鞋履' }, { id: 'accent', name: '配饰' }];
export const STYLES = { soft: '柔和日常', balanced: '自然平衡', bold: '鲜明对比' };
export const SWATCHES = ['#F6F1E7','#DDD2BC','#C4B19A','#AF8D70','#8B6548','#5B3E30','#352825','#E3B8A0','#BD8B73','#93664F','#674735','#3D2B22','#E7CCD0','#C78D99','#A44B58','#7C3040','#EBA279','#C97249','#A65B36','#E5C987','#B69A54','#887648','#D2D8BD','#ABB79A','#798B70','#4B6754','#294C3E','#CDDAD7','#8BAAA9','#547D81','#355B68','#C5D2E2','#97AEC7','#6285AA','#3D5D83','#233B59','#D2C9DE','#AE9DBF','#806F9B','#594A70','#FFFFFF','#E9E9E7','#BCBFBE','#878C8B','#535957','#252A29','#151818','#D7534F','#E7AF42','#557E46','#3F78B0','#8656A8'];
export const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
export function validHex(value) { return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value); }
export function canonicalHex(value) { return validHex(value) ? value.toUpperCase() : '#808080'; }
export function hexToRgb(hex) { const h = canonicalHex(hex); return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255); }
export function rgbToHex(rgb) { return '#' + rgb.map(x => Math.round(clamp(x) * 255).toString(16).padStart(2, '0')).join('').toUpperCase(); }
const linear = x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4;
const encoded = x => x <= .0031308 ? 12.92 * x : 1.055 * Math.max(0, x) ** (1 / 2.4) - .055;
export function hexToLab(hex) {
  const [r, g, b] = hexToRgb(hex).map(linear);
  const l = Math.cbrt(.4122214708*r + .5363325363*g + .0514459929*b);
  const m = Math.cbrt(.2119034982*r + .6806995451*g + .1073969566*b);
  const s = Math.cbrt(.0883024619*r + .2817188376*g + .6299787005*b);
  return [.2104542553*l + .793617785*m - .0040720468*s, 1.9779984951*l - 2.428592205*m + .4505937099*s, .0259040371*l + .7827717662*m - .808675766*s];
}
export function labToHex([L, a, b]) {
  const l = (L + .3963377774*a + .2158037573*b) ** 3;
  const m = (L - .1055613458*a - .0638541728*b) ** 3;
  const s = (L - .0894841775*a - 1.291485548*b) ** 3;
  return rgbToHex([4.0767416621*l - 3.3077115913*m + .2309699292*s, -1.2684380046*l + 2.6097574011*m - .3413193965*s, -.0041960863*l - .7034186147*m + 1.707614701*s].map(encoded));
}
export function lch(hex) { const [L,a,b] = hexToLab(hex); return { L, C: Math.hypot(a,b), h: (Math.atan2(b,a)*180/Math.PI+360)%360 }; }
export function fromLch(L,C,h) { return labToHex([clamp(L,.12,.98), Math.max(C,0)*Math.cos(h*Math.PI/180), Math.max(C,0)*Math.sin(h*Math.PI/180)]); }
export function distance(a,b) { const x=hexToLab(a), y=hexToLab(b); return Math.hypot(...x.map((v,i)=>v-y[i])); }
export function hueDistance(a,b) { return Math.abs(((a-b+540)%360)-180); }
export function colorName(hex) {
  const { L,C,h }=lch(hex);
  if (L < .22) return '近黑色';
  if (C < .025) return L>.96?'白色':L>.82?'浅灰色':L>.55?'灰色':'深灰色';
  let base = h<28||h>=355?'红':h<62?'橙':h<105?'黄':h<155?'绿':h<205?'青绿':h<245?'青蓝':h<285?'蓝':h<325?'紫':'紫红';
  if (h>=30&&h<85&&L<.7) base='棕';
  if (h>=45&&h<105&&L>.78&&C<.09) return '米色';
  if ((h<30||h>340)&&L>.72) return '粉色';
  return `${L<.48?'深':L>.78?'浅':C<.07?'灰调':''}${base}色`;
}
export function describeColor(hex) { const c=lch(hex); return `${colorName(hex)} · ${c.L>.75?'偏亮':c.L<.45?'偏暗':'中等明度'} · ${c.C<.07?'柔和':c.C>.17?'鲜明':'适中饱和度'}`; }
export function ink(hex) { const rgb=hexToRgb(hex).map(linear); return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]>.35?'#202D29':'#FFFFFF'; }

export function normalizeColors(colors) {
  if (!Array.isArray(colors)) return [];
  const merged=new Map();
  for (const c of colors.slice(0,12)) {
    if (!c||!validHex(c.hex)) continue;
    const inputWeight=Number(c.weight);
    if (!Number.isFinite(inputWeight)||inputWeight<=0) continue;
    const weight=Math.min(inputWeight,1e6);
    const hex=canonicalHex(c.hex);
    merged.set(hex,(merged.get(hex)||0)+weight);
  }
  const entries=[...merged].slice(0,5), sum=entries.reduce((s,[,w])=>s+w,0);
  return entries.map(([hex,weight])=>({ hex, weight:weight/sum*100 }));
}
export function percentageLabels(colors) {
  const normalized=normalizeColors(colors), values=normalized.map(c=>Math.floor(c.weight));
  const order=normalized.map((c,i)=>({i,rest:c.weight-values[i]})).sort((a,b)=>b.rest-a.rest);
  for(let n=100-values.reduce((a,b)=>a+b,0),i=0;n>0&&order.length;n--,i++) values[order[i%order.length].i]++;
  return values;
}
export function setColorPercentage(colors,index,percentage) {
  const normalized=normalizeColors(colors);
  if(!normalized[index]||!Number.isFinite(percentage))return normalized;
  if(normalized.length===1)return [{...normalized[0],weight:100}];
  const target=clamp(percentage,1,99),others=100-normalized[index].weight;
  return normalized.map((c,i)=>({...c,weight:i===index?target:c.weight/others*(100-target)}));
}
export function sanitizeOutfit(items) {
  return ROLES.map(role=>{
    const item=Array.isArray(items)?items.find(x=>x?.role===role.id):null;
    return { role:role.id, locked:!!item?.locked, colors:normalizeColors(item?.colors) };
  });
}
export function defaultState() {
  return { version:1, profile:{ skin:null, hair:null }, style:'balanced', vision:'none', patterns:false,
    outfit:[{role:'top',locked:true,colors:[{hex:'#4B6754',weight:75},{hex:'#DDD2BC',weight:25}]},{role:'bottom',locked:false,colors:[{hex:'#DDD2BC',weight:100}]},{role:'shoes',locked:false,colors:[{hex:'#5B3E30',weight:100}]},{role:'accent',locked:false,colors:[{hex:'#B69A54',weight:100}]}], favorites:[] };
}
export function sanitizeState(raw) {
  if (!raw||typeof raw!=='object'||raw.version!==1||!Array.isArray(raw.outfit)) throw new Error('不是受支持的 VisChrom 备份文件');
  return { version:1, profile:{skin:validHex(raw.profile?.skin)?canonicalHex(raw.profile.skin):null,hair:validHex(raw.profile?.hair)?canonicalHex(raw.profile.hair):null},
    style:Object.hasOwn(STYLES,raw.style)?raw.style:'balanced', vision:['none','protan','deutan','unknown'].includes(raw.vision)?raw.vision:'none', patterns:!!raw.patterns,
    outfit:sanitizeOutfit(raw.outfit), favorites:(Array.isArray(raw.favorites)?raw.favorites:[]).slice(0,30).filter(f=>Array.isArray(f?.outfit)).map((f,i)=>({id:typeof f.id==='string'?f.id.slice(0,80):`saved-${i}`,date:typeof f.date==='string'?f.date.slice(0,40):'',style:Object.hasOwn(STYLES,f.style)?f.style:'balanced',outfit:sanitizeOutfit(f.outfit)})) };
}

function harmony(a,b,style) {
  const x=lch(a), y=lch(b);
  if (Math.min(x.C,y.C)<.045) return 90;
  const d=hueDistance(x.h,y.h), targets=style==='soft'?[0,30]:style==='bold'?[0,30,150,180]:[0,30,120,180];
  return clamp(98-Math.min(...targets.map(t=>Math.abs(d-t)))*.75,35,98);
}
function pairAverage(a,b,fn) { let total=0; for(const x of a)for(const y of b)total+=x.weight*y.weight/10000*fn(x.hex,y.hex); return total; }
function meanLightness(colors) { return colors.reduce((s,c)=>s+lch(c.hex).L*c.weight/100,0); }
const AREAS={top:.42,bottom:.36,shoes:.14,accent:.08};
export function evaluate(outfit,profile={},style='balanced') {
  style=Object.hasOwn(STYLES,style)?style:'balanced';
  const items=sanitizeOutfit(outfit).filter(i=>i.colors.length), hints=[];
  if (items.length<2) return {score:null,dimensions:[],hints:['至少设置两个单品的颜色，才能比较配色关系。'],coverage:`已设置 ${items.length}/4 个单品`,strength:'等待更多颜色'};
  let weighted=0, mass=0;
  // Include all cross-item colors AND patterned colors within each garment.
  for(let i=0;i<items.length;i++) {
    for(let j=i+1;j<items.length;j++) {const w=AREAS[items[i].role]*AREAS[items[j].role];weighted+=w*pairAverage(items[i].colors,items[j].colors,(a,b)=>harmony(a,b,style));mass+=w;}
    const item=items[i];
    for(let a=0;a<item.colors.length;a++)for(let b=a+1;b<item.colors.length;b++) {const w=AREAS[item.role]**2*item.colors[a].weight*item.colors[b].weight/10000;weighted+=w*harmony(item.colors[a].hex,item.colors[b].hex,style);mass+=w;}
  }
  const all=items.flatMap(i=>i.colors.map(c=>({...c,area:c.weight/100*AREAS[i.role]}))), area=all.reduce((s,c)=>s+c.area,0);
  const mean=all.reduce((s,c)=>s+lch(c.hex).L*c.area/area,0);
  const spread=Math.sqrt(all.reduce((s,c)=>s+(lch(c.hex).L-mean)**2*c.area/area,0));
  const targetSpread={soft:.15,balanced:.22,bold:.29}[style];
  const light=clamp(96-Math.abs(spread-targetSpread)*170,40,98);
  const chroma=all.reduce((s,c)=>s+lch(c.hex).C*c.area/area,0);
  const brightArea=all.filter(c=>lch(c.hex).C>.16).reduce((s,c)=>s+c.area/area,0);
  const balance=clamp(95-Math.abs(chroma-({soft:.055,balanced:.085,bold:.14}[style]))*200-Math.max(0,brightArea-(style==='bold'?.75:.35))*35,35,98);
  const dimensions=[{name:'颜色关系',value:weighted/mass,weight:.35},{name:'明暗层次',value:light,weight:.30},{name:'饱和度与面积',value:balance,weight:.20}];
  const top=items.find(i=>i.role==='top');
  const references=[['肤色',profile.skin],['发色',profile.hair]].filter(([,hex])=>validHex(hex));
  if(top&&references.length) {
    let personal=0;
    for(const [label,hex]of references) {
      const gap=top.colors.reduce((s,c)=>s+Math.abs(lch(c.hex).L-lch(hex).L)*c.weight/100,0);
      personal+=clamp(92-Math.max(0,.15-gap)*150,55,96);
      if(gap<.12)hints.push(`上衣与${label}明度接近。若想突出肩颈层次，可加入较亮或较暗的领口色；偏爱同色感也可保留。`);
    }
    dimensions.push({name:'近脸颜色层次',value:personal/references.length,weight:.15});
  }
  const topBottom=items.filter(i=>['top','bottom'].includes(i.role));
  if(topBottom.length===2&&Math.abs(meanLightness(topBottom[0].colors)-meanLightness(topBottom[1].colors))<.1)hints.push('上衣与下装明度接近。想要更明显的分层，可以只调整其中一件的明暗。');
  if(brightArea>.55&&style!=='bold')hints.push('鲜明颜色占比较高。减少一种鲜明颜色的面积，或选择“鲜明对比”风格。');
  if(items.some(i=>i.colors.length>1))hints.push('已将每件单品的所有颜色及其面积占比纳入计算；配饰可以呼应衣物中的小面积颜色。');
  if(!hints.length)hints.push('目前各项颜色关系比较均衡，可以保持主色，只调整小面积配饰尝试变化。');
  const sum=dimensions.reduce((s,d)=>s+d.weight,0);
  const score=Math.round(dimensions.reduce((s,d)=>s+d.value*d.weight/sum,0));
  const best=[...dimensions].sort((a,b)=>b.value-a.value)[0];
  return {score,dimensions:dimensions.map(d=>({...d,value:Math.round(d.value),weight:d.weight/sum})),hints,coverage:`已设置 ${items.length}/4 个单品 · ${references.length?'含已设置的个人颜色':'未使用肤色、发色'}`,strength:`${best.name}是这套配色的优势。`};
}

// Full-severity Machado-style linear RGB approximations; only a rough confusion aid.
const CVD={protan:[[.152286,1.052583,-.204868],[.114503,.786281,.099216],[-.003882,-.048116,1.051998]],deutan:[[.367322,.860646,-.227968],[.280085,.672501,.047413],[-.011820,.042940,.968881]]};
export function simulate(hex,type) { if(!CVD[type])return canonicalHex(hex);const rgb=hexToRgb(hex).map(linear);return rgbToHex(CVD[type].map(row=>encoded(clamp(row.reduce((s,v,i)=>s+v*rgb[i],0))))); }
export function confusionWarnings(outfit,type) {
  if(type==='none')return [];
  const types=type==='unknown'?['protan','deutan']:[type];
  const colors=sanitizeOutfit(outfit).flatMap(item=>item.colors.map((c,index)=>({...c,label:`${ROLES.find(r=>r.id===item.role).name} ${index+1}号`}))), warnings=[];
  for(let i=0;i<colors.length;i++)for(let j=i+1;j<colors.length;j++) {
    const a=colors[i],b=colors[j],actual=distance(a.hex,b.hex);
    if(actual>.06&&types.some(t=>distance(simulate(a.hex,t),simulate(b.hex,t))<.065))warnings.push(`${a.label}（${colorName(a.hex)}）与${b.label}（${colorName(b.hex)}）可能较难区分，请参考编号和纹理。`);
  }
  return warnings.slice(0,4);
}
function signature(outfit) { return outfit.map(i=>i.colors.map(c=>`${c.hex}:${Math.round(c.weight)}`).join(',')).join('|'); }
export function generate(outfit,profile={},style='balanced',rng=Math.random,count=3) {
  const base=sanitizeOutfit(outfit);
  if(base.every(i=>i.locked&&i.colors.length)) return [];
  const locked=base.filter(i=>i.locked&&i.colors.length), seeds=locked.flatMap(i=>i.colors.map(c=>c.hex));
  const candidates=[],seen=new Set([signature(base)]);
  for(let attempt=0;attempt<160;attempt++) {
    const anchor=seeds.length?seeds[Math.floor(rng()*seeds.length)]:SWATCHES[Math.floor(rng()*SWATCHES.length)];
    const ref=lch(anchor), h=ref.C<.025?rng()*360:ref.h;
    const offsets=style==='soft'?[0,20,-20]:style==='bold'?[0,150,180,210]:[0,30,180];
    const palette=base.map((item,index)=> {
      if(item.locked&&item.colors.length)return structuredClone(item);
      const neutral=rng()<(style==='bold'?.28:.5);
      const L=({top:[.45,.82],bottom:[.30,.86],shoes:[.25,.72],accent:[.40,.85]}[item.role]);
      const light=L[0]+rng()*(L[1]-L[0]);
      const C=neutral?.012+rng()*.025:({soft:.045,balanced:.075,bold:.12}[style]||.075)+rng()*.045;
      let hex=fromLch(light,C,h+offsets[(attempt+index)%offsets.length]);
      if(item.role==='accent'&&seeds.length&&attempt%3===0)hex=seeds[attempt%seeds.length];
      return {...item,colors:[{hex,weight:100}]};
    });
    const key=signature(palette);
    if(!seen.has(key)){seen.add(key);candidates.push({outfit:palette,...evaluate(palette,profile,style)});}
  }
  candidates.sort((a,b)=>b.score-a.score);
  const selected=[];
  for(const candidate of candidates) {
    const distinct=selected.every(s=>base.reduce((sum,item,i)=>sum+(item.locked&&item.colors.length?0:distance(candidate.outfit[i].colors[0].hex,s.outfit[i].colors[0].hex)),0)>.13);
    if(distinct)selected.push(candidate);
    if(selected.length>=count)break;
  }
  return selected;
}

// K-means over sampled pixels in OKLab; weights represent the selected region only.
export function extractColors(rgba,maxColors=3) {
  const points=[],stride=Math.max(1,Math.floor(rgba.length/4/7000));
  for(let i=0;i<rgba.length;i+=4*stride)if(rgba[i+3]>=128)points.push(hexToLab(rgbToHex([rgba[i]/255,rgba[i+1]/255,rgba[i+2]/255])));
  if(!points.length)return [];
  const squared=(a,b)=>a.reduce((s,v,i)=>s+(v-b[i])**2,0);
  const mean=points.reduce((sum,p)=>sum.map((v,i)=>v+p[i]/points.length),[0,0,0]);
  let centers=[points.reduce((a,b)=>squared(a,mean)<squared(b,mean)?a:b)];
  for(let k=1;k<clamp(Math.round(maxColors),1,5);k++) {
    const far=points.reduce((best,p)=>Math.min(...centers.map(c=>squared(p,c)))>Math.min(...centers.map(c=>squared(best,c)))?p:best,points[0]);
    if(Math.min(...centers.map(c=>squared(far,c)))<.0016)break;
    centers.push([...far]);
  }
  let counts=[];
  for(let iter=0;iter<10;iter++) {
    const sums=centers.map(()=>[0,0,0]);counts=centers.map(()=>0);
    for(const p of points){let ix=0,best=Infinity;centers.forEach((c,i)=>{const d=squared(p,c);if(d<best){best=d;ix=i;}});counts[ix]++;p.forEach((v,j)=>sums[ix][j]+=v);}
    centers=centers.map((c,i)=>counts[i]?sums[i].map(v=>v/counts[i]):c);
  }
  return normalizeColors(centers.map((c,i)=>({hex:labToHex(c),weight:counts[i]})).filter(c=>c.weight/points.length>=.015).sort((a,b)=>b.weight-a.weight));
}
