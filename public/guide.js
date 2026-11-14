export const guideUrl='https://cdn1.bambulab.com/filament/filament-guide/bcv8wbl4hj/filament-guide-en.pdf';
export const amsUrl='https://store.bblcdn.com/s3/default/02bc9c24b207476a9608a314b8039509/AMS_2_Pro-EN.pdf';
// Product, forced-air oven °C, duration h, dry before use, AMS feed, nozzle, sealed storage.
const rows={
 'PLA':['PLA',55,'8',false,true,'任意尺寸与材质',false],
 'PLA CF':['PLA-CF',55,'8',false,true,'0.6 mm 优先；0.4 / 0.8 mm 可用，硬化钢',true],
 'PETG HF':['PETG HF',65,'8',true,true,'任意尺寸与材质',false],
 'PETG CF':['PETG-CF',65,'8',false,true,'0.6 mm 优先；0.4 / 0.8 mm 可用，硬化钢',true],
 'ABS':['ABS',80,'8',false,true,'任意尺寸与材质',false],
 'ABS GF':['ABS-GF',80,'8',false,true,'0.6 mm 优先；0.4 / 0.8 mm 可用，硬化钢',false],
 'ASA':['ASA',80,'8',false,true,'任意尺寸与材质',false],
 'ASA CF':['ASA-CF',80,'8',false,true,'0.4 / 0.6 / 0.8 mm，硬化钢',false],
 'PC':['PC',70,'8',true,true,'任意尺寸与材质',false],
 'TPU 95A HF':['TPU 95A HF',55,'8',true,false,'0.4 / 0.6 / 0.8 mm',true],
 'PET CF':['PET-CF',80,'8–12',true,false,'0.6 mm 优先；0.4 / 0.8 mm 可用，硬化钢',true],
 'PAHT CF':['PAHT-CF',80,'8–12',true,true,'0.6 mm 优先；0.4 / 0.8 mm 可用，硬化钢',true],
 'PA6 CF':['PA6-CF',80,'8–12',true,false,'0.6 mm 优先；0.4 / 0.8 mm 可用，硬化钢',true],
 'PA6 GF':['PA6-GF',80,'8–12',true,true,'0.6 mm 优先；0.4 / 0.8 mm 可用，硬化钢',true],
 'PPA CF':['PPA-CF','100–140','8–12',true,false,'0.6 mm 优先；0.4 / 0.8 mm 可用，硬化钢',true],
 'PPS CF':['PPS-CF','100–140','8–12',true,false,'0.6 mm 优先；0.4 / 0.8 mm 可用，硬化钢',true]
};
// In the same order as the comparison table in the selected Bambu PDF.
const nozzleTemp={
 'PLA':'190–230','PETG HF':'230–260','ABS':'240–280','ABS GF':'240–280','ASA':'240–280','ASA CF':'250–290',
 'PC':'260–290','TPU 95A HF':'220–240','PLA CF':'210–240','PETG CF':'240–270','PET CF':'260–300',
 'PAHT CF':'260–300','PA6 CF':'260–300','PA6 GF':'260–290','PPA CF':'280–310','PPS CF':'310–340'
};
const exactPla=['PLA','PLA BASIC','PLA MATTE'];
const relatives={PLA:'PLA',PETG:'PETG HF',ABS:'ABS',ASA:'ASA',TPU:'TPU 95A HF',PA:'PAHT CF',PC:'PC',PET:'PET CF',PPA:'PPA CF',PPS:'PPS CF'};
const norm=x=>String(x||'').toUpperCase().trim().replace(/[-_]+/g,' ').replace(/\s+/g,' ');
export function materialGuide(s){
 const brand=/^(bambu\s*lab|bambulab|拓竹)$/i.test(String(s.brand).trim());
 const material=norm(s.material);
 const key=exactPla.includes(material)?'PLA':material;
 const direct=Object.hasOwn(rows,key);
 const category=direct?key:relatives[s.family];
 const row=rows[category];
 if(!row)return null;
 const [name,temperature,hours,required,feed,nozzle,sealed]=row;
 const official=brand&&direct;
 return {name,temperature,hours,required,feed,nozzle,sealed,nozzleTemp:nozzleTemp[category],official,amsLimited:official&&(parseInt(temperature,10)>65||['PLA CF','PETG CF'].includes(key)),amsExcluded:official&&['TPU 95A HF','PET CF','PPA CF','PPS CF'].includes(key)};
}
export function moistureSensitive(s){
 const family=norm(s.family),material=norm(s.material);
 return ['PA','PPA','TPU','TPE','PC','PETG','PVA','BVOH'].includes(family)||
  /^(PA[0-9]|PAHT|NYLON|PPA|TPU|TPE|PC|PETG|PVA|BVOH|PET CF)(?:\b|[0-9])/.test(material)||
  Boolean(materialGuide(s)?.required);
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
 if(g?.official&&g.required&&!s.lastDry)return 'Bambu 指南要求使用前烘干，尚无完成记录';
 if(s.status==='未开封')return '';
 const humidity=storageHumidity(d,s.location);
 if(humidity===70&&moistureSensitive(s))return '外挂按 70% RH 估算。该材料易吸湿，建议改用密封存放并在打印前检查';
 const reference=s.lastDry||s.opened;
 if(!reference)return '缺少开封或烘干日期，请检查耗材状态';
 const days=Math.max(1,Math.round(d.settings.dryDays*(g?.required ? 0.5 : 1)*(humidity===10?3:1)));
 if(time-Date.parse(reference)>=days*86400000)return '距开封或上次烘干已达到 '+days+' 天的检查周期';
 return '';
}
