import { ROLES, STYLES, SWATCHES, defaultState, sanitizeState, normalizeColors, percentageLabels, setColorPercentage, validHex, canonicalHex, hexToRgb, rgbToHex, colorName, describeColor, ink, evaluate, generate, confusionWarnings, extractColors } from './color-engine.js';

const $=selector=>document.querySelector(selector);
const $$=selector=>[...document.querySelectorAll(selector)];
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STORAGE='vischrom-state-v1';
let state=defaultState(), proposals=[], activeView='studio', toastTimer, colorTarget=null, selectedHex='#4B6754';
let photoCanvas=null, photoSelection=null, extracted=[], photoLoadId=0;
try { const saved=localStorage.getItem(STORAGE); if(saved)state=sanitizeState(JSON.parse(saved)); }
catch { $('#storage-warning').hidden=false;$('#storage-warning').textContent='本地数据无法读取，已载入示例配色。可以从备份恢复；当前修改仍可导出。'; }

function persist() {
  try {localStorage.setItem(STORAGE,JSON.stringify(state));}
  catch {$('#storage-warning').hidden=false;$('#storage-warning').textContent='浏览器无法保存本地数据。当前操作仍有效，请及时导出备份。';}
}
function toast(message) {$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3400);}
function changed() {proposals=[];persist();render();}
function showView(view) {
  activeView=view;
  $$('.view').forEach(el=>el.hidden=el.id!==`view-${view}`);
  $$('.nav-item').forEach(el=>{el.classList.toggle('active',el.dataset.view===view);if(el.dataset.view===view)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
  $('#page-label').textContent={studio:'配色工作室',inspiration:'灵感与收藏',accessibility:'识色与设置'}[view];
  if(view==='inspiration')renderFavorites();
  if(view==='accessibility')renderAccessibility();
  window.scrollTo({top:0,behavior:'instant'});
}
function pattern(index) {
  if(!state.patterns)return '';
  return ['repeating-linear-gradient(45deg,transparent 0 6px,#ffffff55 6px 8px)', 'radial-gradient(#ffffff88 1.3px,transparent 1.8px)', 'repeating-linear-gradient(0deg,transparent 0 6px,#ffffff66 6px 8px)', 'repeating-linear-gradient(135deg,transparent 0 5px,#ffffff66 5px 7px)', 'repeating-linear-gradient(90deg,transparent 0 5px,#ffffff66 5px 7px)'][index%5];
}
function colorStyle(hex,index=0) {return `background-color:${hex};color:${ink(hex)};${state.patterns?`background-image:${pattern(index)};background-size:${index%5===1?'8px 8px':'auto'};`:''}`;}
const roleIcon=role=>`<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">${{top:'<path d="m10 5-7 6 4 6 4-3v13h10V14l4 3 4-6-7-6c-2 4-10 4-12 0Z"/>',bottom:'<path d="M8 5h16l2 23h-8l-2-15-2 15H6Z"/>',shoes:'<path d="m6 11 6 7 8-2 7 5v5H4v-9Z"/><path d="M4 23h23"/>',accent:'<rect x="7" y="12" width="18" height="16" rx="3"/><path d="M12 12V8a4 4 0 0 1 8 0v4"/>'}[role]}</svg>`;

function outfitSVG(outfit,id='main',patterns=state.patterns) {
  const items=ROLES.map(role=>outfit.find(i=>i.role===role.id)||{role:role.id,colors:[]});
  const paths={top:'M102 57 64 75 46 121 76 133 89 109 86 176 207 176 204 109 217 133 247 121 229 75 191 57 174 72 120 72Z',bottom:'M97 187H198L207 286 165 290 148 222 133 290 90 286Z',shoes:'M90 300H131L132 317H77Q72 308 90 300ZM165 300H205Q224 308 219 317H164Z',accent:'M238 203H279Q284 203 285 209L290 252H231L233 209Q234 203 238 203Z'};
  let defs='',shapes='';
  for (const [i,item]of items.entries()) {
    const colors=normalizeColors(item.colors), gradient=`${id}-${item.role}`;
    let offset=0;
    defs+=`<linearGradient id="${gradient}" x1="0" x2="1" y1="0" y2="0">`;
    for(const c of colors){defs+=`<stop offset="${offset}%" stop-color="${c.hex}"/>`;offset+=c.weight;defs+=`<stop offset="${offset}%" stop-color="${c.hex}"/>`;}
    defs+='</linearGradient>';
    if(patterns&&colors.length) {
      defs+=`<clipPath id="clip-${gradient}"><path d="${paths[item.role]}"/></clipPath>`;
      colors.forEach((c,j)=>{const pid=`p-${gradient}-${j}`;defs+=`<pattern id="${pid}" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(${j===3?-45:j===0?45:0})">${j===1?'<circle cx="3" cy="3" r="1.6" fill="#fff" opacity=".45"/>':`<path d="${j===4?'M3 0V10':'M0 3H10'}" stroke="#fff" stroke-width="1.5" opacity=".4"/>`}</pattern>`;});
    }
    shapes+=`<path d="${paths[item.role]}" fill="${colors.length?`url(#${gradient})`:'#e7eadd'}" stroke="#263b321c" stroke-width="1.5"/>`;
    if(patterns&&colors.length){let x=0;const box={top:[46,201],bottom:[90,117],shoes:[73,147],accent:[231,59]}[item.role];colors.forEach((c,j)=>{shapes+=`<rect x="${box[0]+box[1]*x/100}" y="0" width="${box[1]*c.weight/100+.2}" height="340" fill="url(#p-${gradient}-${j})" clip-path="url(#clip-${gradient})"/>`;x+=c.weight;});}
    const labelPos=[[145,125],[148,202],[148,326],[260,269]][i];
    let cumulative=0;const centerColor=colors.find(c=>(cumulative+=c.weight)>=49)||colors[0];
    shapes+=`<text x="${labelPos[0]}" y="${labelPos[1]}" text-anchor="middle" font-size="9" fill="${i===0&&centerColor?ink(centerColor.hex):'#65735e'}">${ROLES[i].name}</text>`;
  }
  return `<svg class="outfit-svg" viewBox="0 0 340 345" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(items.map((i,n)=>`${ROLES[n].name}：${i.colors.map(c=>colorName(c.hex)).join('、')||'未设置'}`).join('；'))}"><defs>${defs}</defs><ellipse cx="163" cy="321" rx="112" ry="13" fill="#dde3d3" opacity=".28"/><circle cx="164" cy="172" r="139" fill="#f2f3e9"/><path d="M126 55q20 25 40 0" fill="none" stroke="#d1d6c8" stroke-width="2"/>${shapes}<path d="M245 202v-9a15 15 0 0 1 30 0v9" fill="none" stroke="#8a957c" stroke-width="3"/></svg>`;
}
function stripHTML(outfit) {
  return `<div class="palette-strip">${outfit.map(item=>`<span style="display:flex;flex:1">${item.colors.length?item.colors.map((c,j)=>`<span title="${esc(describeColor(c.hex))}" style="flex:${c.weight};height:100%;display:grid;place-items:center;${colorStyle(c.hex,j)}">${j+1}</span>`).join(''):'<span style="background:#e7eadd;width:100%"></span>'}</span>`).join('')}</div><div class="palette-legend">${ROLES.map(r=>`<span>${r.name}</span>`).join('')}</div>`;
}
function renderProfile() {
  $('#profile-colors').innerHTML=['skin','hair'].map(key=>{
    const hex=state.profile[key],label=key==='skin'?'肤色':'发色';
    return `<div class="profile-item"><button class="profile-pick" data-profile="${key}" aria-label="选择${label}${hex?'，当前'+colorName(hex):''}"><span class="profile-chip" style="${hex?colorStyle(hex):''}">${hex?'':'＋'}</span><span><strong>${label}</strong><small>${hex?colorName(hex):'点击添加'}</small></span></button>${hex?`<button class="icon-button" data-clear-profile="${key}" aria-label="移除${label}">×</button>`:''}</div>`;
  }).join('');
}
function renderEditor() {
  $('#outfit-editor').innerHTML=state.outfit.map(item=>{
    const role=ROLES.find(r=>r.id===item.role), labels=percentageLabels(item.colors);
    return `<article class="garment-card" data-role="${item.role}"><div class="garment-top"><span class="garment-title">${roleIcon(item.role)}${role.name}</span><button class="lock-button ${item.locked?'locked':''}" data-lock="${item.role}" aria-pressed="${item.locked}" aria-label="${role.name}${item.locked?'已锁定，点击解锁':'未锁定，点击锁定'}">${item.locked?'▣ 已锁定':'□ 可替换'}</button></div><div class="garment-strip">${item.colors.map((c,j)=>`<span style="flex:${c.weight};${colorStyle(c.hex,j)}">${j+1}</span>`).join('')}</div><div class="color-rows">${item.colors.map((c,j)=>`<div class="color-row"><button class="color-edit" data-edit="${item.role}:${j}" aria-label="编辑${role.name}第${j+1}色，${colorName(c.hex)}"><span class="mini-swatch" style="${colorStyle(c.hex,j)}">${j+1}</span><span class="color-label">${colorName(c.hex)}<small>${c.hex}</small></span></button><input class="weight-input" data-weight="${item.role}:${j}" aria-label="${role.name}第${j+1}色面积占比" type="number" min="1" max="100" step="1" value="${labels[j]}" inputmode="numeric"><span class="percent">%</span><button class="icon-button" data-remove="${item.role}:${j}" aria-label="移除${role.name}第${j+1}色">×</button></div>`).join('')||'<div class="empty-garment">添加一个颜色开始</div>'}</div><button class="add-color" data-add="${item.role}" ${item.colors.length>=5?'disabled':''}>＋ ${item.colors.length?'添加拼色 / 花纹色':'选择颜色'}</button></article>`;
  }).join('');
}
function renderScore() {
  const result=evaluate(state.outfit,state.profile,state.style);
  $('#score-card').innerHTML=`<div class="score-heading"><h2>配色参考分</h2><div class="score-value">${result.score??'—'}<small>/ 100</small></div></div><p class="score-caption">${result.coverage}</p>${result.dimensions.map(d=>`<div class="dimension"><span>${d.name}</span><div class="bar-track" aria-hidden="true"><span style="width:${d.value}%"></span></div><span>${d.value}</span></div>`).join('')}<p class="score-strength">${result.strength}</p><ul class="hint-list">${result.hints.map(h=>`<li>${h}</li>`).join('')}</ul><p class="score-disclaimer">按「${STYLES[state.style]}」规则计算，仅供选择参考。不是客观审美结论，不评价版型或外貌。</p>`;
}
function renderRecommendations() {
  $('#recommendations').innerHTML=proposals.map((p,i)=>`<article class="recommendation"><div class="recommendation-head"><strong>方案 ${String(i+1).padStart(2,'0')}</strong><small>配色参考 ${p.score} 分</small></div>${stripHTML(p.outfit)}<div class="recommendation-foot"><p>${p.outfit.filter(x=>x.locked).length?'已保留锁定单品的所有颜色':'探索全新的颜色组合'}</p><button class="button" data-apply="${i}">使用这套</button></div></article>`).join('');
}
function renderFavorites() {
  $('#favorites-grid').innerHTML=state.favorites.length?state.favorites.map((f,i)=>`<article class="card favorite-card"><div class="section-heading"><h2>收藏 ${String(state.favorites.length-i).padStart(2,'0')}</h2><small>${STYLES[f.style]}</small></div>${outfitSVG(f.outfit,'saved-'+i)}${stripHTML(f.outfit)}<div class="favorite-actions"><button class="button" data-load-favorite="${i}">编辑这套</button><button class="button quiet" data-delete-favorite="${i}" aria-label="删除收藏 ${state.favorites.length-i}">删除</button></div></article>`).join(''):'<div class="empty-state"><span aria-hidden="true">♡</span><h2>你的配色灵感，从这里收藏</h2><p>在配色工作室调好颜色后，点击「收藏配色」。</p><button class="button" data-view="studio">开始搭配</button></div>';
}
function renderAccessibility() {
  $('#vision-mode').value=state.vision;$('#patterns').checked=state.patterns;
  const warnings=confusionWarnings(state.outfit,state.vision);
  $('#confusion-report').innerHTML=state.vision==='none'?'':`<div class="notice">${warnings.length?warnings.map(w=>`<p>${w}</p>`).join(''):'当前规则未发现明显易混淆色对。每个人的实际感受不同，请以自己的辨认体验为准。'}</div><p class="footnote">使用近似色觉模拟比较颜色距离；不会改动原始衣物颜色，也不会影响配色分数。</p>`;
}
function render() {
  renderProfile();renderEditor();renderScore();renderRecommendations();renderAccessibility();
  $('#outfit-preview').innerHTML=outfitSVG(state.outfit);
  $('#palette-strip').innerHTML=stripHTML(state.outfit);
  $('#favorite-count').textContent=state.favorites.length;
  $$('input[name=style]').forEach(input=>input.checked=input.value===state.style);
  if(activeView==='inspiration')renderFavorites();
}

function hexToHsv(hex) {
  const [r,g,b]=hexToRgb(hex),max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
  let h=0;if(d)h=(max===r?(g-b)/d+(g<b?6:0):max===g?(b-r)/d+2:(r-g)/d+4)*60;
  return [h,max?d/max*100:0,max*100];
}
function hsvToHex(h,s,v) {s/=100;v/=100;const c=v*s,x=c*(1-Math.abs((h/60)%2-1)),m=v-c;const rgb=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];return rgbToHex(rgb.map(n=>n+m));}
function updatePicker(hex,updateSliders=true) {
  selectedHex=canonicalHex(hex);
  if(updateSliders){const [h,s,v]=hexToHsv(selectedHex);$('#hue').value=Math.round(h);$('#saturation').value=Math.round(s);$('#brightness').value=Math.round(v);}
  $('#hex-value').value=selectedHex;$('#hex-value').setCustomValidity('');$('#native-color').value=selectedHex;
  $('#selected-color-name').textContent=colorName(selectedHex);
  $('#color-field').style.backgroundColor=`hsl(${$('#hue').value} 100% 50%)`;
  $('#color-cursor').style.left=$('#saturation').value+'%';$('#color-cursor').style.top=(100-Number($('#brightness').value))+'%';
  $$('.library-swatch').forEach(el=>el.setAttribute('aria-pressed',el.dataset.hex===selectedHex));
}
function openColor(target) {
  colorTarget=target;
  const isProfile=target.profile,role=ROLES.find(r=>r.id===target.role);
  $('#color-dialog-title').textContent=isProfile?`选择${isProfile==='skin'?'肤色':'发色'}`:`${role.name} · ${target.index==null?'添加颜色':'编辑颜色'}`;
  const initial=isProfile?state.profile[isProfile]:(target.index!=null?state.outfit.find(i=>i.role===target.role).colors[target.index].hex:null);
  updatePicker(initial||(isProfile==='skin'?'#BD8B73':isProfile==='hair'?'#352825':'#4B6754'));
  $('#color-dialog').showModal();
}
$('#swatch-library').innerHTML=SWATCHES.map(hex=>`<button type="button" class="library-swatch" data-hex="${hex}" style="background:${hex}" aria-label="${describeColor(hex)} ${hex}" title="${colorName(hex)} ${hex}" aria-pressed="false"></button>`).join('');
$('#color-form').addEventListener('submit',event=>{
  event.preventDefault();if(!validHex($('#hex-value').value))return;
  const hex=canonicalHex($('#hex-value').value);
  if(colorTarget.profile)state.profile[colorTarget.profile]=hex;
  else {
    const item=state.outfit.find(i=>i.role===colorTarget.role);
    if(colorTarget.index!=null)item.colors[colorTarget.index].hex=hex;
    else if(item.colors.length<5) {item.colors=item.colors.map(c=>({...c,weight:c.weight*.8}));item.colors.push({hex,weight:item.colors.length?20:100});}
    item.colors=normalizeColors(item.colors);item.locked=true;
  }
  $('#color-dialog').close();changed();toast(colorTarget.profile?'个人颜色已更新':'颜色已更新，此单品已锁定');
});
$('#swatch-library').addEventListener('click',e=>{const button=e.target.closest('[data-hex]');if(button)updatePicker(button.dataset.hex);});
['hue','saturation','brightness'].forEach(id=>$('#'+id).addEventListener('input',()=>updatePicker(hsvToHex(Number($('#hue').value),Number($('#saturation').value),Number($('#brightness').value)),false)));
$('#native-color').addEventListener('input',e=>updatePicker(e.target.value));
$('#hex-value').addEventListener('input',e=>{if(validHex(e.target.value))updatePicker(e.target.value);else e.target.setCustomValidity('请输入 # 开头的六位颜色值，例如 #4B6754');});
let fieldPointer=false;
function pickField(event) {const rect=$('#color-field').getBoundingClientRect();$('#saturation').value=Math.max(0,Math.min(100,(event.clientX-rect.left)/rect.width*100));$('#brightness').value=Math.max(0,Math.min(100,100-(event.clientY-rect.top)/rect.height*100));updatePicker(hsvToHex(Number($('#hue').value),Number($('#saturation').value),Number($('#brightness').value)),false);}
$('#color-field').addEventListener('pointerdown',e=>{fieldPointer=true;e.target.setPointerCapture(e.pointerId);pickField(e);});
$('#color-field').addEventListener('pointermove',e=>{if(fieldPointer)pickField(e);});
$('#color-field').addEventListener('pointerup',()=>fieldPointer=false);$('#color-field').addEventListener('pointercancel',()=>fieldPointer=false);

function confirmAction(message,action) {
  $('#confirm-message').textContent=message;
  $('#confirm-ok').onclick=()=>{$('#confirm-dialog').close();action();};
  $('#confirm-cancel').onclick=()=>$('#confirm-dialog').close();
  $('#confirm-dialog').showModal();
}
document.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  const d=button.dataset;
  if(d.view)showView(d.view);
  if(d.close)$('#'+d.close).close();
  if(d.profile)openColor({profile:d.profile});
  if(d.clearProfile){state.profile[d.clearProfile]=null;changed();}
  if(d.add)openColor({role:d.add});
  if(d.edit){const[role,index]=d.edit.split(':');openColor({role,index:Number(index)});}
  if(d.lock){const item=state.outfit.find(i=>i.role===d.lock);if(!item.colors.length){toast('先为这个单品添加颜色，再锁定');return;}item.locked=!item.locked;changed();}
  if(d.remove){const[role,index]=d.remove.split(':');const item=state.outfit.find(i=>i.role===role);item.colors.splice(Number(index),1);item.colors=normalizeColors(item.colors);if(!item.colors.length)item.locked=false;changed();}
  if(d.apply!=null){const p=proposals[Number(d.apply)];state.outfit=structuredClone(p.outfit);changed();toast('已应用这套配色，可以继续微调');}
  if(d.loadFavorite!=null){const f=state.favorites[Number(d.loadFavorite)];state.outfit=structuredClone(f.outfit);state.style=f.style;changed();showView('studio');toast('已载入收藏');}
  if(d.deleteFavorite!=null)confirmAction('删除这套收藏？当前正在编辑的配色会保留。',()=>{state.favorites.splice(Number(d.deleteFavorite),1);changed();toast('收藏已删除');});
});
$('#outfit-editor').addEventListener('change',e=>{
  if(!e.target.dataset.weight)return;
  const[role,index]=e.target.dataset.weight.split(':'),item=state.outfit.find(i=>i.role===role),value=Number(e.target.value);
  if(!Number.isFinite(value)||value<1||value>100){toast('面积占比请输入 1 到 100');renderEditor();return;}
  item.colors=setColorPercentage(item.colors,Number(index),value);item.locked=true;changed();
  if(value===100&&item.colors.length>1)toast('多色单品最多设为 99%，其余颜色保留占比');
});
$$('input[name=style]').forEach(input=>input.addEventListener('change',()=>{state.style=input.value;changed();}));
$('#manual-start').onclick=()=>openColor({role:'top',index:state.outfit[0].colors.length>=5?0:undefined});
$('#reset-outfit').onclick=()=>confirmAction('清空当前四个单品的颜色？个人颜色与收藏会保留。',()=>{state.outfit=ROLES.map(r=>({role:r.id,locked:false,colors:[]}));changed();toast('已清空，点击任意单品添加颜色');});
async function recommend() {
  if(state.outfit.every(i=>i.locked&&i.colors.length)){toast('所有单品都已锁定，请先解锁至少一个单品');return;}
  $('#complete').disabled=true;$('#randomize').disabled=true;
  $('#recommendations').innerHTML='<p class="notice" role="status">正在本机探索配色…</p>';
  await new Promise(resolve=>setTimeout(resolve,25));
  try {proposals=generate(state.outfit,state.profile,state.style);renderRecommendations();if(!proposals.length)toast('暂未找到新方案，请调整颜色或解锁更多单品');}
  finally {$('#complete').disabled=false;$('#randomize').disabled=false;}
}
$('#complete').onclick=recommend;$('#randomize').onclick=recommend;
$('#explore').onclick=()=>{showView('studio');recommend().then(()=>$('#recommendations').scrollIntoView({behavior:'smooth',block:'center'}));};
$('#save-outfit').onclick=()=>{
  if(state.outfit.filter(i=>i.colors.length).length<2){toast('至少添加两个单品再收藏');return;}
  if(state.favorites.length>=30){toast('最多收藏 30 套，请先导出备份或移除旧收藏');return;}
  const key=JSON.stringify(state.outfit.map(i=>i.colors));
  if(state.favorites.some(f=>f.style===state.style&&JSON.stringify(f.outfit.map(i=>i.colors))===key)){toast('这套配色已经收藏过了');return;}
  state.favorites.unshift({id:globalThis.crypto?.randomUUID?.()||String(Date.now()),date:new Date().toISOString(),style:state.style,outfit:structuredClone(state.outfit)});persist();$('#favorite-count').textContent=state.favorites.length;toast('已收藏到本机');
};
$('#vision-mode').onchange=e=>{state.vision=e.target.value;if(state.vision!=='none')state.patterns=true;changed();};
$('#patterns').onchange=e=>{state.patterns=e.target.checked;changed();};

function download(text,name,type) {
  if(window.AndroidBridge?.exportText){window.AndroidBridge.exportText(name,type,text);return;}
  const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
$('#export-data').onclick=()=>download(JSON.stringify(state,null,2),'vischrom-backup.json','application/json');
$('#export-card').onclick=()=>{
  if(!state.outfit.some(i=>i.colors.length)){toast('请先添加颜色');return;}
  let y=130;
  const rows=state.outfit.map(item=>{
    const label=ROLES.find(r=>r.id===item.role).name,pct=percentageLabels(item.colors);let row=`<text x="40" y="${y}" font-size="19" fill="#273b32">${label}</text>`;y+=18;
    item.colors.forEach((c,i)=>{row+=`<rect x="40" y="${y}" width="70" height="32" rx="5" fill="${c.hex}"/><text x="125" y="${y+22}" font-size="15" fill="#273b32">${i+1}. ${colorName(c.hex)} · ${c.hex} · ${pct[i]}%</text>`;y+=44;});
    if(!item.colors.length){row+=`<text x="40" y="${y+20}" fill="#68766c" font-size="15">未设置</text>`;y+=40;}y+=24;return row;
  }).join('');
  download(`<svg xmlns="http://www.w3.org/2000/svg" width="560" height="${y+70}" viewBox="0 0 560 ${y+70}"><rect width="560" height="${y+70}" fill="#f5f5ef"/><text x="40" y="57" font-family="sans-serif" font-size="28" fill="#315847">VisChrom · 我的配色</text><text x="40" y="86" font-size="13" fill="#68766c">${STYLES[state.style]} / 颜色名称为近似描述</text><g font-family="sans-serif">${rows}</g><text x="40" y="${y+30}" font-family="sans-serif" font-size="12" fill="#68766c">只评价配色 · 在本机生成</text></svg>`,'vischrom-palette.svg','image/svg+xml');
};
$('#import-data').onclick=()=>$('#backup-file').click();
$('#backup-file').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;
  if(file.size>1024*1024){toast('备份文件过大，请选择小于 1 MB 的 JSON 备份');return;}
  try {const imported=sanitizeState(JSON.parse(await file.text()));confirmAction(`用备份替换当前设置、配色和 ${state.favorites.length} 套收藏？备份内有 ${imported.favorites.length} 套收藏。`,()=>{state=imported;changed();toast('备份已恢复');});}
  catch {toast('无法读取备份，请选择有效的 VisChrom JSON 文件');}
};
$('#clear-data').onclick=()=>confirmAction('清除个人颜色、当前配色、设置和全部收藏？此操作不可撤销，建议先导出备份。',()=>{state=defaultState();state.outfit=ROLES.map(r=>({role:r.id,colors:[],locked:false}));changed();toast('本机数据已清除');});

// Images remain memory-only. The user explicitly selects the sampled region.
$('#photo-start').onclick=()=>$('#photo-dialog').showModal();
$('#choose-photo').onclick=()=>$('#photo-file').click();$('#take-photo').onclick=()=>$('#camera-file').click();
$('#photo-dialog').addEventListener('close',()=>{photoLoadId++;photoCanvas=null;photoSelection=null;extracted=[];$('#photo-canvas').width=1;$('#photo-canvas').height=1;$('#photo-canvas-wrap').hidden=true;$('#region-controls').hidden=true;$('#photo-placeholder').hidden=false;$('#photo-results').innerHTML='';$('#apply-photo').disabled=true;});
async function loadPhoto(file) {
  if(!file)return;
  if(file.size>20*1024*1024){toast('请选择小于 20 MB 的图片');return;}
  const loadId=++photoLoadId;$('#photo-results').textContent='正在本机解码图片…';$('#apply-photo').disabled=true;extracted=[];
  let bitmap,url;
  try {
    // Native decoding handles orientation. Bound the retained canvas to 1200px.
    if('createImageBitmap'in window)bitmap=await createImageBitmap(file);
    else {url=URL.createObjectURL(file);bitmap=new Image();bitmap.src=url;await bitmap.decode();}
    if(loadId!==photoLoadId){bitmap.close?.();return;}
    const width=bitmap.width||bitmap.naturalWidth,height=bitmap.height||bitmap.naturalHeight;
    if(!width||!height)throw new Error('empty');
    const ratio=Math.min(1,1200/Math.max(width,height));
    photoCanvas=document.createElement('canvas');photoCanvas.width=Math.max(1,Math.round(width*ratio));photoCanvas.height=Math.max(1,Math.round(height*ratio));photoCanvas.getContext('2d',{willReadFrequently:true}).drawImage(bitmap,0,0,photoCanvas.width,photoCanvas.height);bitmap.close?.();
    const canvas=$('#photo-canvas');canvas.width=photoCanvas.width;canvas.height=photoCanvas.height;
    photoSelection={x:0,y:0,w:photoCanvas.width,h:photoCanvas.height};syncRegionControls();drawPhoto();
    $('#photo-canvas-wrap').hidden=false;$('#region-controls').hidden=false;$('#photo-placeholder').hidden=true;
    $('#photo-results').innerHTML='<p class="notice">框选要分析的衣物区域，然后提取颜色。也可直接提取整张图片。</p>';
  } catch {if(loadId!==photoLoadId)return;photoCanvas=null;photoSelection=null;$('#photo-canvas-wrap').hidden=true;$('#region-controls').hidden=true;$('#photo-placeholder').hidden=false;$('#photo-results').innerHTML='<p class="notice warning">无法读取这张图片。请尝试 JPG、PNG 或 WebP；HEIC 支持取决于设备。你也可以直接手动选色。</p>';}
  finally {if(url)URL.revokeObjectURL(url);}
}
['photo-file','camera-file'].forEach(id=>$('#'+id).addEventListener('change',e=>{const file=e.target.files[0];e.target.value='';loadPhoto(file);}));
function drawPhoto() {
  if(!photoCanvas)return;const ctx=$('#photo-canvas').getContext('2d');ctx.clearRect(0,0,photoCanvas.width,photoCanvas.height);ctx.drawImage(photoCanvas,0,0);
  if(photoSelection){const{x,y,w,h}=photoSelection;ctx.fillStyle='#12251a55';ctx.fillRect(0,0,photoCanvas.width,y);ctx.fillRect(0,y+h,photoCanvas.width,photoCanvas.height-y-h);ctx.fillRect(0,y,x,h);ctx.fillRect(x+w,y,photoCanvas.width-x-w,h);ctx.strokeStyle='white';ctx.lineWidth=Math.max(2,photoCanvas.width/220);ctx.strokeRect(x,y,w,h);ctx.setLineDash([8,6]);ctx.strokeStyle='#315847';ctx.strokeRect(x,y,w,h);ctx.setLineDash([]);}
}
function syncRegionControls() {if(!photoCanvas||!photoSelection)return;$('#region-x').value=photoSelection.x/photoCanvas.width*100;$('#region-y').value=photoSelection.y/photoCanvas.height*100;$('#region-w').value=photoSelection.w/photoCanvas.width*100;$('#region-h').value=photoSelection.h/photoCanvas.height*100;}
function invalidateExtraction() {extracted=[];$('#apply-photo').disabled=true;$('#photo-results').innerHTML='<p class="footnote">选区已更新，点击「提取选区颜色」。</p>';}
function pointerPosition(e){const rect=$('#photo-canvas').getBoundingClientRect();return {x:Math.max(0,Math.min(photoCanvas.width-1,(e.clientX-rect.left)/rect.width*photoCanvas.width)),y:Math.max(0,Math.min(photoCanvas.height-1,(e.clientY-rect.top)/rect.height*photoCanvas.height))};}
let photoStart=null;
$('#photo-canvas').addEventListener('pointerdown',e=>{if(!photoCanvas)return;photoStart=pointerPosition(e);e.target.setPointerCapture(e.pointerId);});
$('#photo-canvas').addEventListener('pointermove',e=>{if(!photoStart||!photoCanvas)return;const p=pointerPosition(e);photoSelection={x:Math.min(photoStart.x,p.x),y:Math.min(photoStart.y,p.y),w:Math.max(1,Math.abs(p.x-photoStart.x)),h:Math.max(1,Math.abs(p.y-photoStart.y))};drawPhoto();});
$('#photo-canvas').addEventListener('pointerup',e=>{if(!photoStart||!photoCanvas)return;const p=pointerPosition(e);if(Math.hypot(p.x-photoStart.x,p.y-photoStart.y)<8){const x=Math.max(0,Math.min(photoCanvas.width-1,p.x-6)),y=Math.max(0,Math.min(photoCanvas.height-1,p.y-6));photoSelection={x,y,w:Math.min(12,photoCanvas.width-x),h:Math.min(12,photoCanvas.height-y)};}photoStart=null;syncRegionControls();drawPhoto();runExtraction();});
$('#photo-canvas').addEventListener('pointercancel',()=>photoStart=null);
['region-x','region-y','region-w','region-h'].forEach(id=>$('#'+id).addEventListener('input',()=>{
  if(!photoCanvas)return;const x=Number($('#region-x').value)/100*photoCanvas.width,y=Number($('#region-y').value)/100*photoCanvas.height;
  photoSelection={x,y,w:Math.max(1,Math.min(photoCanvas.width-x,Number($('#region-w').value)/100*photoCanvas.width)),h:Math.max(1,Math.min(photoCanvas.height-y,Number($('#region-h').value)/100*photoCanvas.height))};invalidateExtraction();drawPhoto();
}));
function runExtraction() {
  if(!photoCanvas||!photoSelection)return;
  const s=photoSelection,x=Math.floor(s.x),y=Math.floor(s.y),w=Math.min(photoCanvas.width-x,Math.max(1,Math.floor(s.w))),h=Math.min(photoCanvas.height-y,Math.max(1,Math.floor(s.h)));
  const pixels=photoCanvas.getContext('2d',{willReadFrequently:true}).getImageData(x,y,w,h);
  extracted=extractColors(pixels.data,Number($('#photo-count').value));
  const pct=percentageLabels(extracted);
  $('#photo-results').innerHTML=extracted.length?`<div class="extracted-colors">${extracted.map((c,i)=>`<div class="extracted-color"><span style="${colorStyle(c.hex,i)}">${i+1}</span>${colorName(c.hex)}<small>${c.hex}<br>${pct[i]}%</small></div>`).join('')}</div><p class="footnote">请确认选区没有背景。应用后仍可修改颜色与占比。</p>`:'<p class="notice warning">选区中没有可用颜色，请重新选择。</p>';
  $('#apply-photo').disabled=!extracted.length;
}
$('#extract-region').onclick=runExtraction;$('#photo-count').onchange=()=>{if(photoCanvas)runExtraction();};
$('#apply-photo').onclick=()=>{
  if(!extracted.length)return;const target=$('#photo-target').value;
  if(['skin','hair'].includes(target))state.profile[target]=[...extracted].sort((a,b)=>b.weight-a.weight)[0].hex;
  else {const item=state.outfit.find(i=>i.role===target);item.colors=structuredClone(extracted);item.locked=true;}
  $('#photo-dialog').close();changed();toast('已应用取色结果，请确认实际颜色');
};

async function setupOffline() {
  if(window.AndroidBridge) {$('#offline-status').textContent='本地安装包';$('#offline-detail').textContent='页面与配色算法已随应用打包，无需服务器。';return;}
  if(!('serviceWorker'in navigator)||!window.isSecureContext){$('#offline-status').textContent='本机计算 · 未缓存';$('#offline-detail').textContent='当前地址不能启用离线缓存。请通过 HTTPS 或 localhost 首次打开并完成缓存；普通局域网 HTTP 仅适合在线预览。';return;}
  try {await navigator.serviceWorker.register('./sw.js');await navigator.serviceWorker.ready;$('#offline-status').textContent='离线资源已就绪';$('#offline-detail').textContent='离线资源已缓存。可添加到主屏幕，断网后继续使用；系统清理站点数据后需要重新打开原地址缓存。';}
  catch {$('#offline-status').textContent='本机计算 · 缓存失败';$('#offline-detail').textContent='离线资源缓存失败，当前页面仍可计算。请重新加载后检查，暂时不要依赖离线启动。';}
}
render();showView('studio');setupOffline();
