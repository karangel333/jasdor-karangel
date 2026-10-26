import {getStore} from '@netlify/blobs';
import {timingSafeEqual} from 'node:crypto';
const reply=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'},body:JSON.stringify(body)});
function authorized(e){const secret=process.env.JASDOR_ADMIN_TOKEN;const token=(e.headers.authorization||e.headers.Authorization||'').replace(/^Bearer\s+/i,'');if(!secret||!token)return false;const a=Buffer.from(token),b=Buffer.from(secret);return a.length===b.length&&timingSafeEqual(a,b)}
export async function handler(event){
 try{
  if(!['GET','PUT'].includes(event.httpMethod))return reply(405,{error:'Metode tidak diizinkan'});
  const cabang=String(event.queryStringParameters?.cabang||'').trim();
  if(!cabang||cabang.length>180)return reply(400,{error:'Cabang tidak valid'});
  if(!process.env.JASDOR_ADMIN_TOKEN)return reply(503,{error:'Konfigurasi admin belum aktif'});
  const store=getStore('jasdor-menu-cabang'); const key='cabang-'+Buffer.from(cabang).toString('base64url');
  if(event.httpMethod==='GET'){
   const saved=await store.get(key,{type:'json'});
   return reply(200,{cabang,active:Array.isArray(saved?.active)?saved.active:[],updatedAt:saved?.updatedAt||null});
  }
  if(!authorized(event))return reply(401,{error:'Akses admin ditolak'});
  let data;try{data=JSON.parse(event.body||'{}')}catch{return reply(400,{error:'JSON tidak valid'})}
  if(!Array.isArray(data.active)||data.active.length>500||data.active.some(n=>typeof n!=='string'||n.length>130))return reply(400,{error:'Daftar menu tidak valid'});
  const active=[...new Set(data.active)].sort();
  await store.setJSON(key,{active,updatedAt:new Date().toISOString()});
  return reply(200,{ok:true,cabang,active,updatedAt:new Date().toISOString()});
 }catch(err){console.error(err);return reply(500,{error:'Gagal membaca/menyimpan menu cabang'})}
}
