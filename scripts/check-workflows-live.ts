import 'dotenv/config';
import {writeFileSync} from 'node:fs';
import {db} from '../server/db.js';
import {extractHarvest,extractPurchase,proposePurchase} from '../server/ai-workflows.js';
const checks:any[]=[];
try{
 const leader=await db.user.findUniqueOrThrow({where:{email:'lider@sierra.test'}}),buyer=await db.user.findUniqueOrThrow({where:{email:'comprador@sierra.test'}});
 const producer=await db.producer.findFirstOrThrow({where:{associationId:leader.associationId!,active:true}});
 const day=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
 for(const kind of ['cosecha','compra']){const start=Date.now();try{
  const result=kind==='cosecha'?await extractHarvest(leader,`Tengo 100 kg de papa chola del productor ${producer.name}, cosechados hoy, disponibles el ${day}. Precio 0.80 dólares por kg.`):await extractPurchase(buyer,`Necesito 2 kg de papa para el ${day}.`);
  let proposal:any;if(kind==='compra'&&result.kind==='purchase')proposal=await proposePurchase(buyer,result.draftId!,result.fields);
  checks.push({kind,ok:result.kind===(kind==='cosecha'?'harvest':'purchase'),resultKind:result.kind,fieldsReady:result.kind!=='clarification'&&!!result.fields,proposalKind:proposal?.kind,elapsedMs:Date.now()-start});
 }catch(e:any){checks.push({kind,ok:false,error:e.message,elapsedMs:Date.now()-start});}}
 writeFileSync('docs/evidencias/ia-cosechas-compras-real.json',JSON.stringify({date:new Date().toISOString(),provider:'Gemini API real',noPublicationOrOrders:true,checks},null,2));console.log(JSON.stringify(checks));
}finally{await db.$disconnect();}
