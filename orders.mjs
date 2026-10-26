import { getStore } from '@netlify/blobs';
import { randomUUID, timingSafeEqual } from 'node:crypto';
const json=(statusCode,data)=>({statusCode,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'},body:JSON.stringify(data)});
const limit=(x,n=160)=>String(x??'').trim().slice(0,n);
const auth=(event)=>{
 const secret=process.env.JASDOR_ADMIN_TOKEN;
 const token=(event.headers.authorization||event.headers.Authorization||'').replace(/^Bearer\s+/i,'');
 if(!secret||!token)return false;
 const a=Buffer.from(token), b=Buffer.from(secret);
 return a.length===b.length && timingSafeEqual(a,b);
};
export async function handler(event){
 try{
  const method=event.httpMethod;
  if(!['GET','POST','PATCH'].includes(method))return json(405,{error:'Method tidak diizinkan'});
  if(!process.env.JASDOR_ADMIN_TOKEN)return json(503,{error:'JASDOR_ADMIN_TOKEN belum dipasang di pengaturan Netlify'});
  const store=getStore('jasdor-orders');
  if(method==='POST'){
   if((event.body||'').length>25000)return json(413,{error:'Pesanan terlalu besar'});
   let p;try{p=JSON.parse(event.body||'{}')}catch{return json(400,{error:'JSON tidak valid'})}
   if(!p.nama||!p.lokasi||!Array.isArray(p.items)||!p.items.length||p.items.length>60)return json(400,{error:'Data pesanan tidak lengkap'});
   const items=p.items.map(i=>({nama:limit(i.nama,130),qty:Math.max(1,Math.min(99,Math.floor(Number(i.qty)||1))),harga:Math.max(0,Math.min(10000000,Number(i.harga)||0)),varian:limit(i.varian,180),catatan:limit(i.catatan,250)}));
   if(items.some(i=>!i.nama))return json(400,{error:'Nama produk kosong'});
   const total=items.reduce((s,i)=>s+i.qty*i.harga,0);
   const id=randomUUID();
   const record={id,nomor:limit(p.nomor,80)||id,nama:limit(p.nama,100),lokasi:limit(p.lokasi,130),jam:limit(p.jam,8),items,total,status:'Menunggu konfirmasi',createdAt:new Date().toISOString()};
   await store.setJSON('order-'+id,record);
   return json(201,{ok:true,id});
  }
  if(!auth(event))return json(401,{error:'Kode admin salah'});
  if(method==='PATCH'){
   let p;try{p=JSON.parse(event.body||'{}')}catch{return json(400,{error:'JSON tidak valid'})}
   if(!/^[0-9a-f-]{36}$/i.test(p.id||''))return json(400,{error:'ID tidak valid'});
   if(!['Menunggu konfirmasi','Diproses','Selesai','Dibatalkan'].includes(p.status))return json(400,{error:'Status tidak valid'});
   const record=await store.get('order-'+p.id,{type:'json'});
   if(!record)return json(404,{error:'Pesanan tidak ditemukan'});
   record.status=p.status;record.updatedAt=new Date().toISOString();
   await store.setJSON('order-'+p.id,record);
   return json(200,{ok:true});
  }
  let cursor,results=[];
  do {
   const page=await store.list({prefix:'order-',cursor});
   results.push(...page.blobs);
   cursor=page.cursor;
  }while(cursor && results.length<1500);
  const records=(await Promise.all(results.slice(0,1500).map(async entry=>{
   try{return await store.get(entry.key,{type:'json'})}catch{return null}
  }))).filter(Boolean).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,500);
  return json(200,{orders:records});
 }catch(e){console.error(e);return json(500,{error:'Gagal mengakses penyimpanan order'})}
}
