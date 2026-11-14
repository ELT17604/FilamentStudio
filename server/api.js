import {validate} from '../public/model.js';

const encoder=new TextEncoder();
const b64=x=>BufferCode(new Uint8Array(x));
function BufferCode(bytes){return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
const bytes=s=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
const reply=(data,status=200,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});
const error=(message,status,headers)=>reply({error:message},status,headers);
async function hmac(secret,value){
 const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return b64(await crypto.subtle.sign('HMAC',key,encoder.encode(value)));
}
function equal(a,b){
 let mismatch=a.length^b.length;
 for(let i=0;i<Math.max(a.length,b.length);i++)mismatch|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);
 return mismatch===0;
}
async function readJson(req,max){
 if(!req.body||Number(req.headers.get('Content-Length'))>max)throw Error('请求内容超过限制');
 const reader=req.body.getReader(),chunks=[];
 let size=0;
 while(true){
  const result=await reader.read();
  if(result.done)break;
  size+=result.value.length;
  if(size>max){await reader.cancel();throw Error('请求内容超过限制');}
  chunks.push(result.value);
 }
 return JSON.parse(await new Blob(chunks).text());
}
const onlyIf=old=>old?{etagMatches:old.etag}:new Headers({'If-None-Match':'*'});
async function throttle(bucket,key,max,period){
 const time=Date.now();
 const boundary=(Math.floor(time/period)+1)*period;
 for(let i=0;i<7;i++){
  const old=await bucket.get('limits/'+key);
  const last=old?await old.json():null;
  const count=last?.boundary===boundary?last.count:0;
  if(count>=max)return Math.ceil((boundary-time)/1000);
  if(await bucket.put('limits/'+key,JSON.stringify({count:count+1,boundary}),{onlyIf:onlyIf(old)}))return 0;
 }
 return 3;
}
const limited=n=>error('请求过于频繁，请稍后再试',429,{'Retry-After':String(n)});
const cookie=(value,max)=>'__Host-filament='+value+'; Max-Age='+max+'; Path=/; Secure; HttpOnly; SameSite=Strict';
async function account(req,env,accounts){
 try{
  const raw=req.headers.get('Cookie')?.match(/(?:^|;\s*)__Host-filament=([^;]+)/)?.[1];
  if(!raw||raw.length>500)return null;
  const [payload,sig,rest]=raw.split('.');
  const session=JSON.parse(new TextDecoder().decode(bytes(payload)));
  const user=accounts.find(x=>x.id===session.id);
  if(rest||!user||!Number.isFinite(session.exp)||session.exp<Date.now())return null;
  return sig&&equal(sig,await hmac(env.SESSION_SECRET,payload+'|'+user.name+'|'+user.password))?user:null;
 }catch{return null;}
}
async function api(req,env,path){
 const method=req.method,bucket=env.BUCKET;
 const accounts=Object.keys(env).filter(k=>/^user[1-9]\d{0,2}$/.test(k)).map(id=>({id,name:env[id],password:env['pw'+id.slice(4)]})).filter(a=>a.name&&/^pbkdf2\$100000\$[\w-]{22}\$[\w-]{43}$/.test(a.password||''));
 if(!bucket||typeof env.SESSION_SECRET!=='string'||env.SESSION_SECRET.length<32||!accounts.length)return error('云同步尚未配置，仍可使用设备本地库存',503);
 if(path==='/api/login'&&method==='POST'){
  const wait=await throttle(bucket,'login-global',60,60000)||await throttle(bucket,'login-'+(await hmac(env.SESSION_SECRET,req.headers.get('CF-Connecting-IP')||'unknown')).slice(0,2),8,600000);
  if(wait)return limited(wait);
  let input;
  try{input=await readJson(req,2048);if(typeof input.username!=='string'||typeof input.password!=='string'||!input.password)throw Error();}catch{return error('登录数据无效',400);}
  const user=accounts.find(x=>x.name===input.username);
  const [,,salt,digest]=(user||accounts[0]).password.split('$');
  const key=await crypto.subtle.importKey('raw',encoder.encode(input.password),'PBKDF2',false,['deriveBits']);
  const derived=b64(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:bytes(salt),iterations:100000},key,256));
  if(!equal(derived,digest)||!user)return error('用户名或密码错误',401);
  const age=604800,payload=b64(encoder.encode(JSON.stringify({id:user.id,exp:Date.now()+age*1000})));
  return reply({id:user.id,name:user.name},200,{'Set-Cookie':cookie(payload+'.'+await hmac(env.SESSION_SECRET,payload+'|'+user.name+'|'+user.password),age)});
 }
 if(path==='/api/logout'&&method==='POST')return reply({ok:true},200,{'Set-Cookie':cookie('',0)});
 const user=await account(req,env,accounts);
 if(!user)return error('请登录云同步',401);
 if(path==='/api/session'&&method==='GET')return reply({id:user.id,name:user.name});
 if(path!=='/api/inventory'||!['GET','PUT'].includes(method))return error('接口不存在',404);
 if(req.headers.get('X-Inventory-Account')!==user.id)return error('此浏览器中的云账号已切换，请重新登录',401);
 const wait=await throttle(bucket,user.id+'-'+method,method==='PUT'?20:120,60000);
 if(wait)return limited(wait);
 const key='inventory/'+user.id+'.json';
 if(method==='GET'){
  const old=await bucket.get(key);
  return old?new Response(old.body,{headers:{'Content-Type':'application/json','Cache-Control':'no-store',ETag:old.httpEtag}}):reply({data:null},200,{ETag:'"empty"'});
 }
 const tag=req.headers.get('If-Match'),operation=req.headers.get('X-Operation-Id');
 if(!tag)return error('请先读取版本',428);
 if(!/^[a-f0-9-]{36}$/.test(operation||''))return error('操作标识无效',400);
 let data;
 try{data=validate(await readJson(req,8*1024*1024));}catch(e){return error(e.message,400);}
 const old=await bucket.get(key);
 if(old?.customMetadata?.operation===operation)return reply({ok:true},200,{ETag:old.httpEtag});
 if((old?.httpEtag||'"empty"')!==tag)return error('云端库存已更新，请处理冲突',409);
 const revision=Number(old?.customMetadata?.revision||0)+1;
 if(old){
  await bucket.put('recovery/'+user.id+'/'+((revision-1)%10)+'.json',await old.text(),{httpMetadata:{contentType:'application/json'}});
 }
 const saved=await bucket.put(key,JSON.stringify({data,revision,operation,savedAt:new Date().toISOString()}),{onlyIf:onlyIf(old),customMetadata:{revision:String(revision),operation},httpMetadata:{contentType:'application/json'}});
 return saved?reply({ok:true,revision},200,{ETag:saved.httpEtag}):error('云端库存已更新，请处理冲突',409);
}
export async function handleApi(request,env){
 const path=new URL(request.url).pathname;
 try{
  if(request.method!=='GET'&&request.headers.get('Origin')!==new URL(request.url).origin)return error('请求来源无效',403);
  return await api(request,env,path);
 }catch(e){
  console.error('Filament API failed',e.name);
  return error('云同步暂不可用',503);
 }
}
