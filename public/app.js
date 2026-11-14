import {fresh,allPlaces,active,validate,formatDate,storagePlaces,unopenedId,unopenedPlace} from './model.js';
import {guideUrl,amsUrl,materialGuide,dryingReminder,moistureSensitive,storageHumidity} from './guide.js';
const $=s=>document.querySelector(s);
const h=(s='')=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const id=()=>crypto.randomUUID(),now=()=>new Date().toISOString();
const main=$('#app'),panel=$('#panel');
const families={PLA:['PLA-BASIC','PLA-MATTE','PLA-SILK','PLA-TOUGH','PLA-CF','PLA-GLOW','PLA-TRANSLUCENT','PLA-AERO'],PETG:['PETG-BASIC','PETG-HF','PETG-MATTE','PETG-CF','PETG-TRANSLUCENT'],ABS:['ABS','ABS-GF'],ASA:['ASA','ASA-CF'],TPU:['TPU','TPU 95A HF','TPU FOR AMS'],PA:['PA6','PA6-CF','PA6-GF','PAHT-CF'],PC:['PC','PC-CF'],PET:['PET','PET-CF'],PPA:['PPA-CF'],PPS:['PPS-CF'],其他:['PP','PVA','BVOH','HIPS','Support for PLA','Support for PLA/PETG','Support for ABS','Support for PA/PET']};
const builtBrands=['Bambu Lab','eSUN','Polymaker','SUNLU','Overture','ELEGOO','Creality','Prusament'];
const labels={home:['home','首页'],stock:['inventory_2','库存'],places:['shelves','位置'],stats:['bar_chart','统计'],settings:['settings','设置']};
const icons={home:'M3 10 12 3l9 7v11h-6v-7H9v7H3z',inventory_2:'M4 8h16v12H4z M3 4h18v4H3z M9 12h6',shelves:'M4 4h16v16H4z M4 12h16 M12 4v16',bar_chart:'M4 20h16 M6 16v-5 M12 16V6 M18 16v-8',settings:'M19 12a7 7 0 1 1-14 0 7 7 0 1 1 14 0z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2',unopened:'M4 7l8-4 8 4v10l-8 4-8-4z M4 7l8 4 8-4 M12 11v10 M8 5l8 4',storage:'M4 5h16v14H4z M4 10h16 M10 14h4'};
const draw=k=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+icons[k]+'"/></svg>';
const rememberPlace=(d,k)=>{
 if(k===unopenedId&&!d.places.some(p=>p.id===k))d.places.push({...unopenedPlace});
};
const events={purchase:'新增',edit:'编辑',move:'移动',adjust:'余量调整',print:'打印消耗',loss:'损耗',audit:'盘点校正',dry:'烘干完成',archive:'归档',restore:'恢复'};
const statusList=['未开封','已开封','使用中','烘干中','已耗尽','已归档','已删除'];
const btn=(text,action,key='',klass='')=>'<button type="button" class="'+klass+'" data-action="'+action+'" data-key="'+h(key)+'">'+text+'</button>';
const select=(title,key,options)=>'<label>'+title+'<select name="'+key+'">'+options+'</select></label>';
const option=(v,l=v,current)=>'<option value="'+h(v)+'" '+(v===current?'selected':'')+'>'+h(l)+'</option>';
const opts=(array,current)=>array.map(v=>option(v,v,current)).join('');
const field=(title,key,v='',type='text',attr='')=>'<label>'+title+'<input name="'+key+'" type="'+type+'" value="'+h(v)+'" '+attr+'></label>';
const actions=(...v)=>'<div class="actions">'+v.join('')+'</div>';
const head=(title,desc,ops='')=>'<header class="heading"><div><h1>'+title+'</h1><p class="muted">'+desc+'</p></div>'+ops+'</header>';
const sec=(title,ops='')=>'<div class="sect"><h2>'+title+'</h2>'+ops+'</div>';
const empty=(title,desc='',ops='')=>'<section class="empty-state"><h3>'+title+'</h3><p class="muted">'+desc+'</p>'+ops+'</section>';
const reel=(s)=>'<div aria-hidden="true" class="reel '+(s?'':'empty')+'"'+(s?' style="--c:'+h(s.color)+'"':'')+'></div>';
const grams=n=>n>=1000?(n/1000).toFixed(2).replace(/\.?0+$/,'')+' kg':n+' g';
const pct=s=>Math.round(s.remaining/s.weight*100);
const date=x=>x?new Date(x).toLocaleString('zh-CN',{hour12:false}):'尚未记录';
const localTime=()=>{const t=new Date();return formatDate()+'T'+[t.getHours(),t.getMinutes()].map(x=>String(x).padStart(2,'0')).join(':');};
let db, account=null, state, timer, camera, query='', material='', stockStatus='', selectedPlace='', message='', conflict, busy=false, install, backupData;
let toastTimer;
let placementWarning;
const placeName=k=>allPlaces(state.data).find(x=>x.id===k)?.name||'未分配';
const locations=(value='')=>option('','未分配',value)+allPlaces(state.data).map(p=>option(p.id,p.name,value)).join('');
const spool=(d,k)=>{const s=d.spools.find(x=>x.id===k);if(!s)throw Error('卷盘已不存在');return s;};
const name=s=>s.name||s.material;
const activeRolls=()=>state.data.spools.filter(active);
const alertFor=s=>dryingReminder(s,state.data);
function toast(txt){$('#toast').textContent=txt;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').textContent='',4200);}
function showError(e){const el=$('#form-error');if(panel.open&&el)el.textContent=e.message;else toast(e.message);}
function log(d,s,type,before='',after='',note=''){d.events.push({id:id(),spool:s.id,type,before,after,note,at:now()});}
function transact(key,fn){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('inventory','readwrite'),os=tx.objectStore('inventory'),r=os.get(key);let next,failure;
  r.onsuccess=()=>{try{const v=r.result||{data:fresh(),revision:0,synced:0,tag:null};next=fn(v)||v;os.put(next,key);}catch(e){failure=e;tx.abort();}};
  tx.oncomplete=()=>resolve(next);tx.onabort=()=>reject(failure||tx.error||Error('库存保存失败'));
 });
}
const key=()=>account?.id||'local';
async function load(key){return transact(key,v=>v);}
async function save(change,ok='已保存'){
 state=await transact(key(),v=>{change(v.data);validate(v.data);v.revision++;return v;});
 panel.close();render();toast(ok);queue();
}
function sheet(title,body){stopCamera();if(!panel.open)panel.showModal();panel.innerHTML=sec(title,btn('关闭','close'))+body;}
function form(title,kind,body,key='',label='保存'){sheet(title,'<form class="forms" data-kind="'+kind+'" data-key="'+h(key)+'">'+body+'<p class="wide alert" role="alert" id="form-error"></p><div class="wide actions">'+btn('取消','close')+'<button class="primary">'+label+'</button></div></form>');}
function card(s){
 return '<article class="card spool stack"><div class="row">'+reel(s)+'<div><h3>'+h(name(s))+'</h3><small>'+h(s.brand)+' · '+h(s.colorName||s.color)+'</small></div><small>'+h(s.status)+'</small></div><small>'+h(placeName(s.location))+'</small><div class="track" role="progressbar" aria-label="余量" aria-valuenow="'+pct(s)+'"><i style="width:'+pct(s)+'%"></i></div><div class="row"><strong>'+grams(s.remaining)+'</strong><small>'+h(s.confidence||'估算')+' · '+pct(s)+'%</small></div>'+actions(btn('详情','detail',s.id),btn('调余量','amount',s.id))+'</article>';
}
function ams(dev){
 const slots=allPlaces(state.data).filter(p=>Array.from({length:dev.slots},(_,i)=>dev.id+'-'+(i+1)).includes(p.id));
 return '<article class="hero"><small>耗材装载 · 按 10% RH 估算 · '+slots.filter(p=>state.data.spools.some(s=>s.location===p.id)).length+'/'+dev.slots+'</small><h2>'+h(dev.name)+'</h2><div class="slots">'+slots.map((p,i)=>{const s=state.data.spools.find(x=>x.location===p.id);return btn('<small>槽位 '+(i+1)+'</small>'+reel(s)+'<strong>'+h(s?.material||'空槽位')+'</strong>'+(s?'<small>'+pct(s)+'% · '+h(s.brand)+'</small>':''),s?'detail':'load',s?.id||p.id,'slot');}).join('')+'</div></article>';
}
const grid=rows=>'<div class="grid">'+rows.join('')+'</div>';
const metric=(l,n)=>'<article class="metric"><small>'+l+'</small><strong>'+n+'</strong></article>';
function home(){
 const list=activeRolls(),warnings=list.filter(s=>alertFor(s)||pct(s)<=state.data.settings.low);
 return head('耗材工作室','查看卷盘、装载位置和烘干记录。',btn('＋ 新增耗材','new','','primary'))+
 state.data.devices.slice(0,1).map(ams).join('')+
 '<div class="metrics">'+metric('在库卷盘',list.length)+metric('剩余净重',grams(list.reduce((t,s)=>t+s.remaining,0)))+metric('待关注卷盘',warnings.length)+'</div>'+
 actions(btn('库存盘点','audit'),btn('提醒中心','alerts'),btn('库存总结','summary'))+
 sec('最近录入','<a href="#stock">查看库存 →</a>')+(list.length?grid(list.slice().reverse().slice(0,3).map(card)):empty('还没有库存','新增第一卷耗材，或从设置中恢复 JSON 备份。',btn('新增第一卷','new','','primary')));
}
function stock(){
 const list=state.data.spools.filter(s=>(stockStatus?s.status===stockStatus:!['已归档','已删除'].includes(s.status))&&(!material||s.family===material)&&(!selectedPlace||selectedPlace===s.location)&&(!query||[name(s),s.brand,s.material,s.colorName,s.color].join(' ').toLowerCase().includes(query.toLowerCase())));
 return head('库存','当前筛选 '+list.length+' 卷',btn('＋ 新增','new','','primary'))+
 '<div class="filters">'+field('搜索','search',query,'search','placeholder="品牌、材料或颜色"')+select('材料大类','filter-material',option('','全部材料',material)+opts([...new Set(state.data.spools.map(s=>s.family))],material))+select('状态','filter-status',option('','当前卷盘',stockStatus)+opts(statusList,stockStatus))+select('位置','filter-place',option('','所有位置',selectedPlace)+allPlaces(state.data).map(p=>option(p.id,p.name,selectedPlace)).join(''))+'</div><div id="stock-results">'+(list.length?grid(list.slice().reverse().map(card)):empty('暂无符合条件的卷盘'))+'</div>';
}
function places(){
 const places=storagePlaces(state.data);
 return head('位置','查看 AMS 槽位、外挂料架和储存区。',actions(btn('新增 AMS','device'),btn('新增位置','place','','primary')))+
 state.data.devices.map(ams).join('')+sec('存储位置')+grid(places.map(p=>{
  const isUnopened=p.id===unopenedId,rh=storageHumidity(state.data,p.id);
  return '<section class="card stack storage-card '+(isUnopened?'unopened':'')+'"><div class="place-icon">'+draw(isUnopened?'unopened':'storage')+'</div><h3>'+h(p.name)+'</h3><small>'+state.data.spools.filter(s=>s.location===p.id).length+' 卷 · '+(p.capacity?'容量 '+p.capacity+' 卷':'不限容量')+'</small>'+
  (rh!==null?'<small>按 '+rh+'% RH 估算</small>':'')+actions(btn('查看卷盘','filter-place',p.id))+'</section>';
 }));
}
function summary(){
 const s=activeRolls(),sum=s.reduce((a,b)=>a+b.remaining,0);
 const used=state.data.events.filter(x=>x.type==='print'&&Date.now()-Date.parse(x.at)<30*86400000);
 return '当前在库 '+s.length+' 卷，净余量 '+grams(sum)+'。\n未开封 '+s.filter(x=>x.status==='未开封').length+' 卷。\n近 30 天打印消耗 '+(used.length?grams(used.reduce((n,e)=>n+e.before-e.after,0)):'数据不足')+'。\n待关注烘干 '+s.filter(x=>alertFor(x)).length+' 卷。';
}
function stats(){
 const list=activeRolls(),table=Object.entries(list.reduce((acc,s)=>{acc[s.family]??=[0,0];acc[s.family][0]++;acc[s.family][1]+=s.remaining;return acc;},Object.create(null)));
 return head('库存统计','按本机卷盘和历史记录计算。',btn('生成总结','summary','','primary'))+grid([['材料分布',table.map(([k,v])=>'<div class="item row"><strong>'+h(k)+'</strong><small>'+v[0]+' 卷 · '+grams(v[1])+'</small></div>').join('')||'<p class="muted">暂无数据</p>'],['库存概况','<p style="white-space:pre-line">'+h(summary())+'</p>']].map(([h2,contents])=>'<article class="card stack"><h2>'+h2+'</h2>'+contents+'</article>'));
}
function settings(){
 return head('设置','管理云同步、备份和应用安装。')+grid([
 '<section class="card stack"><h2>云同步'+(account?' · '+h(account.name):'')+'</h2><p class="muted" id="sync-state">'+h(message||'登录后可在设备之间同步库存。')+'</p>'+actions(btn('登录 / 更新会话','login','','primary'),...(account?[btn('立即同步','sync'),btn('导入本地库存','adopt'),btn('退出账号','logout')]:[]),...(conflict?[btn('处理冲突','conflict')]:[]))+'</section>',
 '<section class="card stack"><h2>备份与恢复</h2><p class="muted">完整 JSON 包含卷盘、位置、设备及历史。</p>'+actions(btn('导出 JSON','backup','','primary'),btn('恢复备份','restore'),btn('导出库存 CSV','csv'),...(state.recovery?[btn('导出替换前快照','recovery')]:[]))+'</section>',
 '<section class="card stack"><h2>设备与安装</h2><p class="muted">业务数据保存在 IndexedDB。'+(navigator.serviceWorker?.controller?'离线资源已启用。':'离线资源尚未就绪。')+'</p>'+actions(btn('安装到主屏幕','install'),btn('请求持久存储','persist'))+'</section>',
 '<section class="card stack"><h2>提醒规则</h2><p class="muted">低余量 ≤ '+state.data.settings.low+'% · 普通存储烘干检查 '+state.data.settings.dryDays+' 天</p>'+actions(btn('编辑规则','rules'),btn('提醒中心','alerts'))+'<a href="https://cdn1.bambulab.com/filament/filament-guide/bcv8wbl4hj/filament-guide-en.pdf" target="_blank" rel="noreferrer">Bambu Lab Filament Guide ↗</a></section>'
 ]);
}
function render(){
 if(!state)return;
 const [route,ref]=location.hash.slice(1).split('/');
 const p=route==='guide'?'stock':Object.hasOwn(labels,route)?route:'home';
 $('#nav').innerHTML=Object.entries(labels).map(([k,[icon,title]])=>'<a href="#'+k+'" '+(k===p?'aria-current="page"':'')+'><span aria-hidden="true">'+draw(icon)+'</span>'+title+'</a>').join('');
 const selected=route==='guide'&&state.data.spools.find(x=>x.id===ref);
 main.innerHTML=selected?guidePage(selected):({home,stock,places,stats,settings}[p])();
}
const optionsDamp=value=>option('no','未标记',value?'yes':'no')+option('yes','发现受潮迹象',value?'yes':'no');
function edit(s,copy=false){
 const x=s||{family:'PETG',material:'PETG-MATTE',brand:'Bambu Lab',weight:1000,color:'#85bba6',bought:formatDate(),status:'未开封',rfid:'未知'};
 const brands=[...new Set([...builtBrands,...state.data.spools.map(s=>s.brand)])];
 const dict=[...new Set([...(families[x.family]||[]),...state.data.spools.filter(s=>s.family===x.family).map(s=>s.material)])];
 form(s&&!copy?'编辑耗材':'新增耗材','spool',
 field('品牌','brand',x.brand,'text','required list="brands"')+'<datalist id="brands">'+opts(brands)+'</datalist>'+
 select('材料大类','family',opts(Object.keys(families),x.family))+field('材料系列','material',x.material,'text','required list="materials"')+'<datalist id="materials">'+opts(dict)+'</datalist>'+
 field('颜色名称','colorName',x.colorName)+field('颜色','color',x.color,'color')+field('HEX 色值','hex',x.color,'text','pattern="#[0-9a-fA-F]{6}" required')+
 '<div class="wide">'+actions(btn('摄像头取色','camera'),btn('相册取色','album'))+'<input id="album" type="file" accept="image/*" hidden><div id="photo-preview"></div></div>'+
 field('初始净重量（g）','weight',x.weight,'number','min="1" max="100000" required')+field('购买日期','bought',copy?formatDate():x.bought,'date','max="'+formatDate()+'" required')+
 select('位置','location',locations(!s||copy?unopenedId:x.location))+(s&&!copy?'':field('购买卷数','qty',1,'number','min="1" max="100" required'))+
 '<details class="wide"><summary>规格、采购与标签</summary><div class="forms">'+field('卷盘名称','name',x.name)+field('SKU','sku',x.sku)+field('批次','lot',x.lot)+field('开封日期','opened',copy?'':x.opened,'date','max="'+formatDate()+'"')+field('空盘重量（g）','tare',x.tare,'number','min="0"')+field('单卷价格（¥）','price',x.price,'number','min="0" step=".01"')+select('状态','status',opts(statusList.slice(0,5),copy?'未开封':x.status))+select('标签','rfid',opts(['未知','无标签','Bambu 官方 RFID','第三方 RFID/NFC','第三方二维码'],x.rfid))+field('标签名称 / UID','label',x.label)+field('备注','note',x.note)+select('受潮迹象','damp',optionsDamp(x.damp))+'</div></details>',s&&!copy?s.id:'','保存卷盘');
}
function detail(s){
 const rows=state.data.events.filter(e=>e.spool===s.id).slice().reverse();
 const current=['已归档','已删除'].includes(s.status);
 sheet(h(name(s)),'<div class="stack"><div class="row">'+reel(s)+'<div><h3>'+h(s.brand)+' · '+h(s.material)+'</h3><p class="muted">'+h(s.colorName||s.color)+' · '+h(s.status)+'</p></div><strong>'+grams(s.remaining)+'</strong></div><p>'+h(placeName(s.location))+' · 购买 '+h(s.bought)+' · '+h(s.rfid)+'</p><p class="muted">上次烘干 '+h(date(s.lastDry))+' · 上次盘点 '+h(date(s.lastAudit))+'</p>'+
 (current?actions(btn('恢复在库','recover',s.id,'primary')):actions(btn('调余量','amount',s.id,'primary'),btn('移动 / 交换','move',s.id),btn('记烘干','dry',s.id),btn('编辑','edit',s.id),btn('复制','duplicate',s.id),btn('归档','archive',s.id),btn('移到回收站','trash',s.id)))+
 '<a class="guide-link" href="#guide/'+encodeURIComponent(s.id)+'">材料指南与烘干参数 <span aria-hidden="true">↗</span></a>'+(alertFor(s)?'<p class="alert">'+h(alertFor(s))+'</p>':'')+(s.note?'<p>'+h(s.note)+'</p>':'')+'<details><summary>操作历史 · '+rows.length+'</summary>'+rows.slice(0,100).map(e=>'<div class="item"><strong>'+h(events[e.type]||e.type)+'</strong><p class="muted">'+h(date(e.at))+(typeof e.before==='number'?' · '+e.before+' g → '+e.after+' g':'')+(e.note?' · '+h(e.note):'')+'</p></div>').join('')+'</details></div>');
}
function guidePage(s){
 const g=materialGuide(s);
 const reference='<div class="actions"><a class="guide-link" target="_blank" rel="noopener noreferrer" href="'+guideUrl+'">Bambu Filament Guide ↗</a><a class="guide-link" target="_blank" rel="noopener noreferrer" href="'+amsUrl+'">AMS 2 Pro 规格 ↗</a></div>';
 const info=g?'<div class="metrics">'+metric('热风循环烘箱',h(g.temperature)+' °C')+metric('烘干时间',h(g.hours)+' 小时')+metric('使用前烘干',g.required?'要求':'可选')+'</div>'+
 grid(['<article class="card stack"><h2>喷嘴与供料</h2><p>'+h(g.nozzle)+'</p><p>指南中的 AMS 供料 '+(g.feed?'支持':'不支持')+'。请核对具体 AMS 和打印机型号。</p></article>','<article class="card stack"><h2>保存方式</h2><p>'+(g.sealed?'指南标注密封并放入干燥剂。':'指南未将密封加干燥剂列为该条目的必要条件。')+'</p><p>上次烘干 '+h(date(s.lastDry))+'</p></article>'])+
 '<article class="card stack"><h2>AMS 2 Pro 烘干</h2><p>设备上限 65 °C。'+(g.amsExcluded?'规格表未将该材料列为支持烘干。':g.amsLimited?'Bambu 指南中的烘箱条件与设备能力有差异，AMS 2 Pro 可能无法彻底烘干。':'请按设备所显示的材料预设和厂商说明操作。')+'</p></article>':
 empty('暂无匹配参数','请查阅该品牌和产品的技术资料，确认设备与卷盘的温度限制。');
 return '<a class="back-link" href="#stock">← 返回库存</a>'+head(h(s.material)+' 材料指南',h(s.brand)+' · '+h(name(s)),actions(btn('卷盘详情','guide-details',s.id),btn('记录烘干','dry',s.id,'primary')))+
 (g?'<section class="guide-intro"><h2>'+h(g.name)+'</h2><p>'+(g.official?'已匹配 Bambu 指南条目。':'同类材料参考。请以实际品牌和系列的技术资料为准。')+'</p></section>':'')+
 info+'<article class="card stack guide-sources"><h2>提醒与资料来源</h2><p>'+h(alertFor(s)||'当前无烘干提醒。')+'</p><p class="muted">复查周期由应用设置决定。真空与 AMS 按 10% RH 估算，外挂按 70% RH 估算。</p>'+reference+'</article>';
}
function drySheet(s){
 const g=materialGuide(s);
 const reference=g?'<p class="muted">'+(g.official?'官方烘箱参考':'同类烘箱参考')+' · '+h(g.name)+' '+h(g.temperature)+' °C / '+h(g.hours)+' 小时。</p>':'<p class="muted">请按该产品厂商给出的烘干条件填写。</p>';
 const fixed=g?.official&&typeof g.temperature==='number'&&!g.hours.includes('–');
 form('记录烘干完成','dry','<div class="wide stack">'+reference+(fixed?actions(btn('套用热风烘箱参数','guide-prefill',s.id)):'')+'<p id="dry-device-note" class="muted" hidden>AMS 2 Pro 最高 65 °C。请使用设备针对该材料的预设。</p></div>'+
 field('完成时间','at',localTime(),'datetime-local','required')+field('设备','dryer','','text','list="dry-devices"')+'<datalist id="dry-devices">'+opts(['AMS 2 Pro','AMS HT','热风循环烘箱'])+'</datalist>'+
 field('时长（分钟）','minutes','','number','min="1"')+field('实际设定温度（°C）','temperature','','number','min="0"')+field('备注','note'),s.id);
}

function amount(s){form('调整 '+h(name(s))+' 余量','amount','<div class="wide actions">'+[100,75,50,25,10,0].map(p=>btn(p+'%','preset',Math.round(s.weight*p/100))).join('')+'</div>'+field('余量滑块','slider',s.remaining,'range','min="0" max="'+s.weight+'"')+field('净余量（g）','grams',s.remaining,'number','min="0" max="'+s.weight+'" required')+select('确定方式','confidence',opts(['估算','称重'],s.confidence))+select('原因','reason',[['adjust','手动调整'],['print','打印消耗'],['loss','损耗'],['audit','盘点校正']].map(([k,v])=>option(k,v)).join(''))+field('含盘总重（可选 g）','gross','','number','min="0"')+field('空盘重量（g）','tare',s.tare,'number','min="0"')+field('备注','note'),s.id);}
function moveForm(s){form('移动 '+h(name(s)),'move',select('目标位置','location',locations(s.location))+select('目标单卷槽位被占用','swap',opts(['停止并提示','交换位置'])),s.id,'确认移动');}
class ExternalPlacementWarning extends Error {}
function move(d,s,to,swap=false,allowExternal=false){
 if(to!==s.location&&to==='external'&&moistureSensitive(s)&&!allowExternal)throw new ExternalPlacementWarning();

 if(s.location===to)return;
 const p=allPlaces(d).find(x=>x.id===to);
 if(to&&!p)throw Error('位置已不存在');
 const other=p?.capacity===1&&d.spools.find(x=>x.id!==s.id&&x.location===to);
 if(other){
  if(!swap)throw Error('目标槽位已占用，需明确选择交换');
  if(s.location==='external'&&moistureSensitive(other)&&!allowExternal)throw new ExternalPlacementWarning();
  log(d,other,'move',other.location,s.location);other.location=s.location;
 }
 rememberPlace(d,to);log(d,s,'move',s.location,to);s.location=to;
}
function download(value,name,type){const url=URL.createObjectURL(new Blob([value],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
async function digest(data){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(data)))),b=>b.toString(16).padStart(2,'0')).join('');}
async function exportData(data){download(JSON.stringify({app:'Filament Studio',schemaVersion:1,data,sha256:await digest(data),savedAt:now()},null,2),'FilamentStudio_Backup_'+formatDate()+'.json','application/json');}
function merge(current,extra){
 const next=structuredClone(current);
 for(const k of ['spools','events','devices','places']){
  const ids=new Set(next[k].map(x=>x.id));for(const x of extra[k])if(!ids.has(x.id))next[k].push(x);
 }
 return validate(next);
}
function syncStatus(text){
 message=text;
 if($('#sync-state'))$('#sync-state').textContent=text;
}
async function api(path,method='GET',data,headers={}){
 const r=await fetch('./api/'+path,{method,cache:'no-store',headers:{...(path==='inventory'&&account?{'X-Inventory-Account':account.id}:{}),...headers,...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});
 const json=await r.json();
 if(!r.ok)throw Object.assign(Error(json.error),{status:r.status,retry:+r.headers.get('Retry-After')||0});
 return {json,tag:r.headers.get('ETag')};
}
function queue(ms=2000){clearTimeout(timer);if(account&&!conflict)timer=setTimeout(sync,ms);}
async function attach(user){
 account=user;conflict=null;
 if(user)localStorage.setItem('filament-account',JSON.stringify(user));else localStorage.removeItem('filament-account');
 state=await load(key());render();
}
async function sync(manual=false){
 if(!account||busy||conflict){if(manual&&conflict)showConflict();return;}
 if(!navigator.onLine){syncStatus('当前离线，修改已保存在本机。');return;}
 const k=key();busy=true;
 try{
  const cached=await load(k),remote=await api('inventory');
  const dirty=cached.revision!==cached.synced;
  if(cached.pending&&remote.json.operation===cached.pending.id){
   state=await transact(k,v=>{v.tag=remote.tag;v.synced=cached.pending.localRevision;delete v.pending;return v;});
   queue();
  }else if(remote.json.data&&remote.tag!==cached.tag){
   if(dirty){conflict=remote;syncStatus('本机和云端已分别修改，请处理版本冲突。');render();if(manual)showConflict();return;}
   validate(remote.json.data);
   state=await transact(k,v=>{if(v.revision!==cached.revision)throw Error('本机库存刚刚变化，重新检查同步');return {...v,data:remote.json.data,tag:remote.tag,synced:v.revision};});render();
  }else if(dirty){
   const pending=cached.pending?.localRevision===cached.revision?cached.pending:{id:id(),localRevision:cached.revision};
   await transact(k,v=>({...v,pending}));
   const result=await api('inventory','PUT',cached.data,{'If-Match':remote.tag,'X-Operation-Id':pending.id});
   state=await transact(k,v=>{delete v.pending;return {...v,tag:result.tag,synced:cached.revision};});
   if(state.synced!==state.revision)queue();
  }else if(!cached.tag){
   state=await transact(k,v=>({...v,tag:remote.tag}));
  }
  syncStatus('已同步 · '+new Date().toLocaleTimeString('zh-CN'));
 }catch(e){
  syncStatus(e.message);
  if(e.status===409)queue(1000);
  else if(e.retry)queue(e.retry*1000);
  else if(!e.status||e.status>=500)queue(30000);
  if(manual)toast(e.message);
 }finally{busy=false;}
}
function showConflict(){sheet('库存同步冲突','<div class="stack"><p>本机 '+state.data.spools.length+' 卷，云端 '+conflict.json.data.spools.length+' 卷。合并时同 ID 以本机为准，槽位冲突会中止。</p>'+actions(btn('导出本机备份','backup'),btn('合并版本','resolve','merge','primary'),btn('采用云端','resolve','remote'),btn('采用本机','resolve','local'))+'<p class="alert" id="form-error"></p></div>');}
async function resolve(mode){
 if(busy||!conflict)return;
 busy=true;
 const k=key(),saved=conflict,local=await load(k);
 try{
  const next=mode==='remote'?validate(saved.json.data):mode==='merge'?merge(local.data,saved.json.data):local.data;
  const tag=mode==='remote'?saved.tag:(await api('inventory','PUT',next,{'If-Match':saved.tag,'X-Operation-Id':id()})).tag;
  state=await transact(k,v=>{
   if(v.revision!==local.revision)throw Error('本机库存同时变更，请重新处理');
   return {...v,data:next,recovery:mode==='local'?v.recovery:v.data,revision:v.revision+1,synced:v.revision+1,tag,pending:null};
  });
  conflict=null;panel.close();syncStatus('版本冲突已处理');render();
 }catch(e){
  if(e.status===409){conflict=null;panel.close();queue();render();}
  throw e;
 }finally{busy=false;}
}
function stopCamera(){camera?.getTracks().forEach(t=>t.stop());camera=null;}
function pick(source,x=.5,y=.5){
 const w=source.videoWidth||source.naturalWidth,height=source.videoHeight||source.naturalHeight;
 if(!w||!height)return;
 const canvas=document.createElement('canvas');canvas.width=canvas.height=7;
 const ctx=canvas.getContext('2d');
 ctx.drawImage(source,Math.max(0,Math.min(w-7,w*x-3)),Math.max(0,Math.min(height-7,height*y-3)),7,7,0,0,7,7);
 const data=ctx.getImageData(0,0,7,7).data;
 const rgb=[0,1,2].map(ch=>Math.round(Array.from({length:49},(_,i)=>data[i*4+ch]).reduce((n,x)=>n+x,0)/49).toString(16).padStart(2,'0')).join('');
 $('[name=color]').value=$('[name=hex]').value='#'+rgb;toast('已取色 #'+rgb);
}
function confirm(title,text,action,key){sheet(title,'<div class="stack"><p>'+text+'</p>'+actions(btn('取消','close'),btn('确认','confirm-'+action,key,'primary'))+'<p class="alert" id="form-error"></p></div>');}
const acts={
 'cancel-external':()=>restorePlacementForm(),
 'confirm-external':async()=>{
  const pending=placementWarning;
  if(!pending)return;
  restorePlacementForm();
  try{await submit(pending,true);}catch(e){showError(e);}
 },
 close:()=>panel.close(),new:()=>edit(),detail:k=>detail(spool(state.data,k)),edit:k=>edit(spool(state.data,k)),duplicate:k=>edit(spool(state.data,k),true),amount:k=>amount(spool(state.data,k)),move:k=>moveForm(spool(state.data,k)),
 preset:k=>{$('[name=slider]').value=$('[name=grams]').value=k;$('[name=gross]').value='';},
 load:k=>{
  const list=activeRolls().filter(s=>s.location!==k);
  if(!list.length)return sheet('装入 AMS',empty('暂无可装入卷盘','先新增一卷库存。',btn('新增耗材','new','','primary')));
  form('装入 '+h(placeName(k)),'load',select('选择卷盘','spool',list.map(s=>option(s.id,name(s)+' · '+s.brand)).join('')),k,'装入');
 },
 device:()=>form('新增 AMS','device',field('设备名称','name','','text','required')+field('槽位数量','slots',4,'number','min="1" max="16" required')),
 place:()=>form('新增位置','place',field('位置名称','name','','text','required')+field('容量（0 为不限）','capacity',0,'number','min="0" max="10000" required')),
 'filter-place':k=>{query='';material='';stockStatus='';selectedPlace=k;if(location.hash==='#stock')render();else location.hash='stock';},
 'guide-details':k=>detail(spool(state.data,k)),
 'guide-prefill':k=>{const g=materialGuide(spool(state.data,k));if(!g?.official)return;$('[name=dryer]').value='热风循环烘箱';$('[name=temperature]').value=parseInt(g.temperature,10);$('[name=minutes]').value=parseInt(g.hours,10)*60;},
 dry:k=>drySheet(spool(state.data,k)),
 audit:()=>sheet('库存盘点',activeRolls().length?actions(btn('批量确认已盘点','audit-all'))+activeRolls().map(s=>'<div class="row item"><div><strong>'+h(name(s))+'</strong><p class="muted">'+h(placeName(s.location))+' · '+grams(s.remaining)+'</p></div>'+btn('盘点','audit-single',s.id)+'</div>').join(''):empty('没有待盘点卷盘')),
 'audit-all':()=>confirm('确认盘点','将所有在库卷盘标记为已核对。','audit-all'),
 'confirm-audit-all':()=>save(d=>{for(const s of d.spools.filter(active)){s.lastAudit=now();log(d,s,'audit',s.remaining,s.remaining);}},'已核对在库卷盘'),
 'audit-single':k=>form('核对 '+h(name(spool(state.data,k))),'audit',field('当前余量（g）','grams',spool(state.data,k).remaining,'number','min="0" required')+select('当前位置','location',locations(spool(state.data,k).location)),k,'确认盘点'),
 alerts:()=>{
  const rows=activeRolls().map(s=>[s,[alertFor(s),pct(s)<=state.data.settings.low?'余量偏低':''].filter(Boolean).join(' · ')]).filter(([,v])=>v);
  sheet('提醒中心',rows.map(([s,v])=>'<div class="row item"><div><strong>'+h(name(s))+'</strong><p class="muted">'+h(v)+'</p></div>'+btn('查看','detail',s.id)+'</div>').join('')||empty('当前没有待处理提醒'));
 },
 rules:()=>form('提醒规则','rules',field('低余量阈值（%）','low',state.data.settings.low,'number','min="0" max="100" required')+field('普通存储烘干检查（天）','dryDays',state.data.settings.dryDays,'number','min="1" max="3650" required')),
 archive:k=>confirm('归档卷盘','将卷盘移出当前库存并保留历史。','archive',k),
 trash:k=>confirm('移到回收站','可通过库存中的「已删除」筛选恢复。','trash',k),
 'confirm-archive':k=>setStatus(k,'已归档'),'confirm-trash':k=>setStatus(k,'已删除'),
 recover:k=>save(d=>{const s=spool(d,k);log(d,s,'restore',s.status,'已开封');s.status=s.remaining?'已开封':'已耗尽';},'已恢复'),
 summary:()=>sheet('库存总结','<textarea id="summary" rows="7" readonly>'+h(summary())+'</textarea>'+actions(btn('复制总结','copy-summary'),btn('导出库存 CSV','csv'))),
 'copy-summary':async()=>{const t=$('#summary');try{await navigator.clipboard.writeText(t.value);toast('已复制');}catch{t.select();toast('文本已选中，可用系统菜单复制');}},
 backup:()=>exportData(state.data),recovery:()=>exportData(state.recovery),
 csv:()=>{
  const cell=v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';
  const rows=[['品牌','材料','颜色','购买日期','净余量 g','位置','状态'],...state.data.spools.filter(s=>s.status!=='已删除').map(s=>[s.brand,s.material,s.colorName||s.color,s.bought,s.remaining,placeName(s.location),s.status])];
  download('\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n'),'FilamentStudio_Inventory_'+formatDate()+'.csv','text/csv;charset=utf-8');
 },
 restore:()=>{backupData=null;sheet('恢复库存','<label>选择备份文件<input type="file" id="restore-file" accept=".json,application/json"></label><p role="alert" class="alert" id="form-error"></p><div id="import-actions"></div>');},
 'merge-backup':()=>save(d=>Object.assign(d,merge(d,backupData)),'已合并备份'),
 'replace-backup':()=>confirm('替换设备库存','替换前会在本机保留快照。','backup'),
 'confirm-backup':async()=>{state=await transact(key(),v=>({...v,recovery:v.data,data:backupData,revision:v.revision+1}));panel.close();render();queue();toast('已恢复备份');},
 login:()=>form('登录云同步','login',field('用户名','username',account?.name,'text','autocomplete="username" required')+field('密码','password','','password','autocomplete="current-password" required')+'<p class="wide muted">账号库存与本地库存分别保存。你可以在登录后导入本地库存。</p>','','登录'),
 logout:async()=>{if(busy)throw Error('请等待同步完成');await api('logout','POST');await attach(null);syncStatus('已退出云同步。');},
 sync:()=>sync(true),conflict:showConflict,resolve,
 adopt:()=>confirm('导入本地库存','将未登录时保存的库存并入当前账号。','adopt'),
 'confirm-adopt':async()=>{const previous=await load('local');if(!previous.data.spools.length)throw Error('此设备无可导入的本地卷盘');await save(d=>Object.assign(d,merge(d,previous.data)),'已导入本地库存');},
 persist:async()=>toast(await navigator.storage?.persist?.()?'已获得浏览器持久存储权限':'浏览器未授予持久存储权限'),
 install:async()=>{
  if(matchMedia('(display-mode:standalone)').matches||navigator.standalone)return toast('当前已在独立窗口运行');
  if(install){await install.prompt();install=null;return;}
  sheet('添加到主屏幕','<p>'+(/iPhone|iPad|iPod/.test(navigator.userAgent)?'在 Safari 分享菜单中选择「添加到主屏幕」。':'在 Chrome 浏览器菜单选择「安装应用」或「添加到主屏幕」。')+'</p>');
 },
 camera:async()=>{
  if(!navigator.mediaDevices?.getUserMedia)return toast('摄像头不可用，可用相册取色');
  stopCamera();
  const preview=$('#photo-preview');
  try{
   const media=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
   if(!panel.open||!preview.isConnected){media.getTracks().forEach(t=>t.stop());return;}
   camera=media;preview.innerHTML='<video autoplay muted playsinline></video>'+actions(btn('取中心色','capture'),btn('停止摄像头','stop-camera'));
   $('video').srcObject=media;
  }catch{toast('摄像头不可用，可从相册取色');}
 },
 capture:()=>pick($('video')),'stop-camera':()=>{stopCamera();$('#photo-preview').replaceChildren();},
 album:()=>$('#album').click()
};
function setStatus(k,status){return save(d=>{const s=spool(d,k);log(d,s,'archive',s.status,status);s.location='';s.status=status;},status);}
function restorePlacementForm(){
 if(!placementWarning)return;
 const form=placementWarning;
 placementWarning=null;
 panel.querySelector('.placement-warning')?.remove();
 for(const child of Array.from(panel.children))child.hidden=false;
 form.querySelector('button:not([type])').focus();
}
function warnExternal(form){
 placementWarning=form;
 for(const child of Array.from(panel.children))child.hidden=true;
 const confirmation=document.createElement('section');
 confirmation.className='stack placement-warning';
 confirmation.innerHTML='<h2>确认放到外挂</h2><p>这次操作会把易吸湿耗材放到外挂料架。外挂按 70% RH 估算，长时间存放可能增加受潮风险。</p>'+actions(btn('返回修改','cancel-external'),btn('确认放到外挂','confirm-external','','primary'));
 panel.prepend(confirmation);
 confirmation.querySelector('button').focus();
}
async function submit(form,allowExternal=false){
 const {kind,key:k}=form.dataset, f=new FormData(form),v=n=>String(f.get(n)||'').trim(),n=k=>Number(v(k));
 if(kind==='login'){
  if(busy)throw Error('请等待正在进行的同步');
  busy=true;
  try{const r=await api('login','POST',{username:v('username'),password:String(f.get('password')||'')});await attach(r.json);panel.close();}
  finally{busy=false;}
  await sync();return;
 }
 await save(d=>{
  if(kind==='spool'){
   const weight=n('weight'),qty=k?1:n('qty');
   if(!v('brand')||!v('material')||!Number.isInteger(qty)||qty<1||qty>100)throw Error('请检查品牌、材料和卷数');
   if(v('opened')&&v('opened')<v('bought'))throw Error('开封时间早于购买日期');
   for(let i=0;i<qty;i++){
    const s=k?spool(d,k):{id:id(),remaining:weight,created:now(),confidence:'估算',location:''};
    if(weight<s.remaining)throw Error('初始净重量不能低于当前余量');
    const m=v('material');
    Object.assign(s,Object.fromEntries(['family','brand','colorName','bought','name','sku','lot','opened','tare','price','status','rfid','label','note'].map(a=>[a,v(a)])),{weight,color:v('hex'),material:m.toUpperCase()==='PLA-SIL'?'PLA-SILK':m,modified:now()});
    if(s.status==='未开封'&&s.opened)s.status='已开封';
    s.damp=v('damp')==='yes';
   if(s.status==='已耗尽')s.remaining=0;
    if(!k)d.spools.push(s);
    move(d,s,v('location'),false,allowExternal);
    log(d,s,k?'edit':'purchase');
   }
  }
  if(kind==='amount'||kind==='audit'){
   const s=spool(d,k),old=s.remaining;
   if(v('gross')&&!v('tare'))throw Error('需要空盘重量才能从总重计算净余量');
   const value=v('gross')?n('gross')-n('tare'):n('grams');
   const reason=kind==='audit'?'audit':v('reason');
   if(value<0||value>s.weight||(['print','loss'].includes(reason)&&value>old))throw Error('净余量不符合有效范围');
   s.remaining=value;
   if(!value)s.status='已耗尽';else if(s.status==='已耗尽')s.status='已开封';
   if(v('confidence'))s.confidence=v('gross')?'称重':v('confidence');
   if(v('tare'))s.tare=v('tare');
   if(reason==='audit')s.lastAudit=now();
   if(kind==='audit')move(d,s,v('location'),false,allowExternal);
   log(d,s,reason,old,value,v('note'));
  }
  if(kind==='move')move(d,spool(d,k),v('location'),v('swap')==='交换位置',allowExternal);
  if(kind==='load')move(d,spool(d,v('spool')),k);
  if(kind==='device')d.devices.push({id:id(),name:v('name'),slots:n('slots')});
  if(kind==='place')d.places.push({id:id(),name:v('name'),capacity:n('capacity')});
  if(kind==='dry'){
   if(/ams\s*2\s*pro/i.test(v('dryer'))&&n('temperature')>65)throw Error('AMS 2 Pro 的最高烘干温度为 65 °C，请核对设备和实际记录');
   const s=spool(d,k),t=new Date(v('at'));
   if(t>Date.now()+60000)throw Error('完成时间晚于当前时间');
   const at=t.toISOString();
   if(!s.lastDry||s.lastDry<=at){s.lastDry=at;s.damp=false;}
   if(s.status==='烘干中')s.status='已开封';
   const note=[at,v('dryer'),v('minutes')?v('minutes')+' 分钟':'',v('temperature')?v('temperature')+' °C':'',v('note')].filter(Boolean).join(' · ');
   log(d,s,'dry','',at,note);
  }
  if(kind==='rules')d.settings={low:n('low'),dryDays:n('dryDays')};
 });
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(e.target.closest('.guide-link'))panel.close();if(b&&acts[b.dataset.action])Promise.resolve().then(()=>acts[b.dataset.action](b.dataset.key)).catch(showError);});
document.addEventListener('submit',e=>{
 e.preventDefault();
 const button=e.target.querySelector('button:not([type])');if(button?.disabled)return;if(button)button.disabled=true;
 submit(e.target).catch(e2=>{if(e2 instanceof ExternalPlacementWarning)warnExternal(e.target);else showError(e2);}).finally(()=>{if(button)button.disabled=false;});
});
document.addEventListener('input',e=>{
 const input=e.target;
 if(input.name==='search'){query=input.value;const temp=document.createElement('template');temp.innerHTML=stock();$('#stock-results').replaceChildren(...temp.content.querySelector('#stock-results').childNodes);$('.heading p').textContent=temp.content.querySelector('.heading p').textContent;}
 if(input.name==='slider'){$('[name=grams]').value=input.value;$('[name=gross]').value='';}
 if(input.name==='grams'&&$('[name=slider]'))$('[name=slider]').value=input.value;
 if(input.name==='color')$('[name=hex]').value=input.value;
});
document.addEventListener('change',async e=>{
 const input=e.target;
 try{
  if(input.name==='filter-status'){stockStatus=input.value;render();}
  if(input.name==='filter-material'){material=input.value;render();}
  if(input.name==='filter-place'){selectedPlace=input.value;render();}
  if(input.name==='dryer'&&$('#dry-device-note'))$('#dry-device-note').hidden=!/ams\s*2\s*pro/i.test(input.value);
  if(input.name==='family'){
   const list=[...new Set([...(families[input.value]||[]),...state.data.spools.filter(s=>s.family===input.value).map(s=>s.material)])];
   $('#materials').innerHTML=opts(list);$('[name=material]').value=list[0]||'';
  }
  if(input.id==='album'&&input.files[0]){
   stopCamera();const photo=new Image(),url=URL.createObjectURL(input.files[0]);
   try{photo.src=url;await photo.decode();photo.alt='点选要提取的颜色';$('#photo-preview').replaceChildren(photo);photo.onclick=e=>pick(photo,e.offsetX/photo.width,e.offsetY/photo.height);pick(photo);}
   finally{URL.revokeObjectURL(url);}
  }
  if(input.id==='restore-file'&&input.files[0]){
   backupData=null;$('#import-actions').replaceChildren();
   const x=JSON.parse(await input.files[0].text());
   if(x.app!=='Filament Studio'||x.schemaVersion!==1||x.sha256!==await digest(x.data))throw Error('文件格式、版本或校验不匹配');
   backupData=validate(x.data);
   $('#import-actions').innerHTML='<p>当前 '+state.data.spools.length+' 卷 · 备份 '+backupData.spools.length+' 卷</p>'+actions(btn('合并并保留现有记录','merge-backup','','primary'),btn('替换库存','replace-backup'));
  }
 }catch(error){showError(error);}
});
panel.addEventListener('close',()=>{stopCamera();placementWarning=null;});
panel.addEventListener('cancel',e=>{if(placementWarning){e.preventDefault();restorePlacementForm();}});
window.addEventListener('hashchange',render);
window.addEventListener('online',()=>queue(30));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)queue(30);});
setInterval(()=>{if(!document.hidden&&navigator.onLine&&!panel.open)sync();},60000);
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();install=e;});
if(navigator.serviceWorker){navigator.serviceWorker.register('./sw.js').catch(()=>{});navigator.serviceWorker.addEventListener('controllerchange',render);}
const opening=indexedDB.open('filament-studio',2);
opening.onupgradeneeded=()=>{if(!opening.result.objectStoreNames.contains('inventory'))opening.result.createObjectStore('inventory');};
opening.onerror=()=>{main.textContent='浏览器无法打开库存数据库。';};
opening.onsuccess=async()=>{
 try{
  db=opening.result;
  const prior=JSON.parse(localStorage.getItem('filament-account')||'null');
  await attach(prior&&/^user[1-9]\d{0,2}$/.test(prior.id)?prior:null);
  try{const session=await api('session');if(session.json.id!==account?.id)await attach(session.json);await sync();}
  catch(e){syncStatus(e.status===401&&account?'会话已过期，仍可使用该账号的离线库存。':e.status===401?'登录后可同步跨设备库存。':e.message);}
 }catch(e){main.textContent=e.message;}
};
