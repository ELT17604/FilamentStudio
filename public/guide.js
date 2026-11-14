import {resolveMaterial,normalize} from './material-data.js';
export const guideUrl='https://cms.bblmw.com/Bambu_Filament_Guide_77b0b697ca.pdf';
export const amsUrl='https://store.bblcdn.com/s3/default/02bc9c24b207476a9608a314b8039509/AMS_2_Pro-EN.pdf';
export function materialGuide(spool){
 const profile=resolveMaterial(spool);
 const type=normalize(spool.material),family=normalize(spool.family);
 let air=['未分级','该配方缺少可比实测数据','通风；长时间打印可使用带排风的罩体。',['niosh']];
 if((/^(ABS|HIPS)\b/.test(type)||family==='ABS'&&!type.startsWith('SUPPORT')))air=['较高','超细颗粒与 VOC 均有较高排放记录；关注苯乙烯吸入暴露。','使用带局部排风的封箱。',['niosh','emissions']];
 else if((family==='ASA'||/^ASA\b/.test(type)))air=['VOC 较高','VOC 排放可较高，研究检出苯乙烯。','使用带局部排风的封箱。',['niosh','emissions','voc']];
 else if((family==='PA'||/^(PA\d|PAHT|NYLON|PA\b)/.test(type)))air=['颗粒较高','尼龙研究观察到较高颗粒排放；部分配方可释放己内酰胺。','优先局部排风。',['niosh','emissions','voc']];
 else if(/^(PLA|PETG)\b/.test(type)&&!/ (CF|GF|WOOD|GLOW|METAL|SPARKLE|GALAXY|MARBLE)\b/.test(type))air=type.startsWith('PLA')?['通常低于 ABS','打印仍可释放超细颗粒和 VOC。','保持通风。',['niosh','emissions']]:['有排放记录','PETG 样品检测到 VOC；空气中暴露与打印设置、时间和通风有关。','保持通风。',['niosh','voc']];
 return {...profile,air};
}
export function moistureSensitive(s){
 const family=normalize(s.family),material=normalize(s.material);
 const profile=resolveMaterial(s);
 return ['PA','PPA','TPU','TPE','PC','PETG','PVA','BVOH'].includes(family)||
  /^(PA[0-9]|PAHT|NYLON|PPA|TPU|TPE|PC|PETG|PVA|BVOH|PET CF)(?:\b|[0-9])/.test(material)||
  ((profile.official||profile.brandCategory)&&profile.required);
}
export function storageHumidity(d,location){
 if(location==='external')return 70;
 if(location==='vacuum'||d.devices.some(x=>Array.from({length:x.slots},(_,i)=>x.id+'-'+(i+1)).includes(location)))return 10;
 return null;
}
export function dryingReminder(s,d,time=Date.now()){
 if(s.status==='烘干中')return '';
 if(s.damp)return '已标记受潮，打印前请检查并按该产品参数烘干';
 const g=materialGuide(s);
 if((g.official||g.brandCategory)&&g.required&&(!s.lastDry||(s.opened&&Date.parse(s.opened)>Date.parse(s.lastDry))))return '打印前要求烘干，尚无开封后的完成记录';
 if(s.status==='未开封')return '';
 const humidity=storageHumidity(d,s.location);
 if(humidity===70&&moistureSensitive(s))return '外挂按 70% RH 估算。该材料易吸湿，建议改用密封存放并在打印前检查';
 const reference=s.lastDry||s.opened;
 if(!reference)return '缺少开封或烘干日期，请检查耗材状态';
 const days=Math.max(1,Math.round(d.settings.dryDays*((g.official||g.brandCategory)&&g.required ? 0.5 : 1)*(humidity===10?3:1)));
 if(time-Date.parse(reference)>=days*86400000)return '距开封或上次烘干已达到 '+days+' 天的检查周期';
 return '';
}
