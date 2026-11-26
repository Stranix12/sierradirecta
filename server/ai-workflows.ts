import {z} from 'zod';
import {Prisma,type User} from '@prisma/client';
import {createHash} from 'node:crypto';
import {db} from './db.js';
import {requireThat} from './domain.js';
import {audit,createOrder} from './orders.js';
import {syncStockAlerts} from './notifications.js';
import {localDate,harvestExtraction,purchaseExtraction,interpret} from './ai-provider.js';
const uuid=z.string().uuid();const name=z.string().trim().min(1).max(200);
const money=z.number().positive().max(99999999).refine(v=>Math.abs(v*100-Math.round(v*100))<0.000001,'Máximo dos decimales');
const date=z.iso.date();const noon=(s:string)=>new Date(s+'T12:00:00Z');
const json=(v:unknown)=>JSON.parse(JSON.stringify(v));
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
const match=(s:string|null,rows:{id:string,name:string}[])=>{if(!s)return '';const exact=rows.filter(r=>normalize(r.name)===normalize(s));if(exact.length===1)return exact[0].id;const partial=rows.filter(r=>normalize(r.name).split(/\s+/).includes(normalize(s)));return partial.length===1?partial[0].id:'';};
export function toKg(quantity:number|null,unit:string|null,kgPerUnit:number|null){
 if(!quantity||!unit)return null;const u=normalize(unit);const multiplier=['kg','kilo','kilos','kilogramo','kilogramos'].includes(u)?1:kgPerUnit;
 if(!multiplier)return null;const kg=new Prisma.Decimal(quantity).mul(multiplier);if(kg.gt(99999999)||kg.decimalPlaces()>2)return null;return Number(kg);
}
export const harvestFields=z.object({producerId:uuid,productId:uuid,variety:name,description:z.string().max(1000),stock:money,price:money,harvest:date,available:date}).strict();
export const purchaseFields=z.object({items:z.array(z.object({productId:uuid,variety:z.string().max(160),quantity:money}).strict()).min(1).max(10),deliveryDate:date,locality:z.string().max(160)}).strict();
const requireLeader=(u:User)=>requireThat(u.role==='lider'&&u.associationId,403,'Solo el líder puede preparar cosechas de su asociación.');
const requireBuyer=(u:User)=>requireThat(u.role==='comprador',403,'Solo el comprador puede preparar compras.');
async function draft(user:User,kind:string,data:unknown){return db.aiDraft.create({data:{userId:user.id,kind,data:json(data),expires:new Date(Date.now()+30*60000)}});}
export async function extractHarvest(user:User,text:string){requireLeader(user);const data=await interpret(text,'cosecha',harvestExtraction);return prepareHarvest(user,data);}
export async function prepareHarvest(user:User,raw:unknown){
 requireLeader(user);const data=harvestExtraction.parse(raw);if(data.action==='aclarar')return {kind:'clarification',message:data.message};
 const [products,producers]=await Promise.all([db.product.findMany({where:{active:true},select:{id:true,name:true}}),db.producer.findMany({where:{associationId:user.associationId!,active:true},select:{id:true,name:true}})]);
 const fields={productId:match(data.product,products),producerId:match(data.producer,producers),variety:data.variety||'',description:'',stock:toKg(data.quantity,data.unit,data.kgPerUnit)??'',price:data.pricePerKg??'',harvest:data.harvest||'',available:data.available||''};
 const d=await draft(user,'cosecha',{fields});await audit(db,user.id,'ia',d.id,'interpretar','Borrador de cosecha',{kind:'cosecha'});
 return {kind:'harvest',draftId:d.id,expires:d.expires,fields,products,producers,message:data.message,notes:['Revisa todos los campos antes de publicar.',...(!fields.stock?['Indica la cantidad en kg. No se supuso el peso de sacos o quintales.']:[]),...(!fields.productId||!fields.producerId?['Selecciona producto y productor: no se resolvió una coincidencia única.']:[])]};
}
export async function confirmHarvest(user:User,draftId:string,raw:unknown){
 requireLeader(user);const b=harvestFields.parse(raw);requireThat(b.harvest<=b.available,400,'La cosecha no puede ser posterior a la disponibilidad.');const hash=digest(b);
 return db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "AiDraft" WHERE id=${draftId} FOR UPDATE`;
  const d=await tx.aiDraft.findFirst({where:{id:draftId,userId:user.id,kind:'cosecha'}});requireThat(d,404,'Borrador no encontrado.');
  if(d.result){requireThat(d.confirmHash===hash,409,'Este borrador ya se confirmó con otros datos.');return d.result;}
  requireThat(d.expires>new Date(),409,'El borrador venció. Interpreta nuevamente el texto.');
  const producer=await tx.producer.findFirst({where:{id:b.producerId,associationId:user.associationId!,active:true}}),product=await tx.product.findFirst({where:{id:b.productId,active:true}});requireThat(producer&&product,400,'Producto o productor no válido para tu asociación.');
  const lot=await tx.lot.create({data:{...b,harvest:noon(b.harvest),available:noon(b.available),associationId:user.associationId!}});
  await audit(tx,user.id,'lote',lot.id,'crear','Publicación asistida por IA confirmada por el líder',{...lot,origin:'IA',draftId});await syncStockAlerts(tx,lot.id);
  const refs=await tx.reference.findMany({where:{productId:b.productId,date:{gte:new Date(Date.now()-7*86400000),lte:new Date()}},orderBy:{date:'desc'},take:1});
  if(refs.length&&(new Prisma.Decimal(b.price).lt(refs[0].min)||new Prisma.Decimal(b.price).gt(refs[0].max)))await tx.notification.create({data:{userId:user.id,lotId:lot.id,key:`precio-ia:${lot.id}`,category:'precios',priority:'media',message:`La oferta de ${product.name} está fuera del rango de referencia de ${refs[0].min}–${refs[0].max} USD/kg. Es una referencia, no un precio obligatorio.`}});
  const result={lotId:lot.id,message:'Cosecha publicada tras tu confirmación.'};await tx.aiDraft.update({where:{id:d.id},data:{result,confirmHash:hash}});return result;
 });
}
export async function extractPurchase(user:User,text:string){
 requireBuyer(user);const data=await interpret(text,'compra',purchaseExtraction);if(data.action==='aclarar')return {kind:'clarification',message:data.message};
 const products=await db.product.findMany({where:{active:true},select:{id:true,name:true}});
 const fields={items:data.items.map(i=>({productId:match(i.product,products),variety:i.variety||'',quantity:toKg(i.quantity,i.unit,i.kgPerUnit)??''})),deliveryDate:data.deliveryDate||'',locality:data.locality||''};
 if(!fields.items.length)fields.items.push({productId:'',variety:'',quantity:''});
 const d=await draft(user,'solicitud',{fields});await audit(db,user.id,'ia',d.id,'interpretar','Borrador de solicitud de compra',{kind:'compra'});
 return {kind:'purchase',draftId:d.id,expires:d.expires,fields,products,message:data.message};
}
type Offer={id:string,associationId:string,association:{name:string,locality:string},productId:string,product:{name:string},variety:string,stock:Prisma.Decimal,reserved:Prisma.Decimal,price:Prisma.Decimal};
export function allocate(items:z.infer<typeof purchaseFields>['items'],lots:Offer[]){
 const fits=(lot:Offer,item:typeof items[number])=>lot.productId===item.productId&&(!item.variety||normalize(lot.variety)===normalize(item.variety));
 const choose=(pool:Offer[])=>{
  const used=new Map<string,Prisma.Decimal>();const selected:{lot:Offer,quantity:Prisma.Decimal}[]=[];const missing:{productId:string,variety:string,kg:string}[]=[];
  for(const item of items){let needed=new Prisma.Decimal(item.quantity);for(const l of pool.filter(l=>fits(l,item)).sort((a,b)=>a.price.comparedTo(b.price)||a.associationId.localeCompare(b.associationId)||a.id.localeCompare(b.id))){const available=l.stock.minus(l.reserved).minus(used.get(l.id)||0);const q=Prisma.Decimal.min(available,needed);if(q.gt(0)){selected.push({lot:l,quantity:q});used.set(l.id,(used.get(l.id)||new Prisma.Decimal(0)).add(q));needed=needed.minus(q);}if(needed.isZero())break;}if(needed.gt(0))missing.push({productId:item.productId,variety:item.variety,kg:needed.toFixed(2)});}
  return {selected,missing,total:selected.reduce((sum,x)=>sum.add(x.quantity.mul(x.lot.price)),new Prisma.Decimal(0))};
 };
 const singles=[...new Set(lots.map(l=>l.associationId))].map(id=>choose(lots.filter(l=>l.associationId===id))).filter(p=>!p.missing.length).sort((a,b)=>a.total.comparedTo(b.total));
 return singles[0]||choose(lots);
}
export async function proposePurchase(user:User,sourceId:string,raw:unknown){
 requireBuyer(user);const b=purchaseFields.parse(raw);requireThat(b.deliveryDate>=localDate()&&noon(b.deliveryDate).getTime()<Date.now()+366*86400000,400,'Elige una entrega desde hoy y dentro de un año.');
 requireThat(new Set(b.items.map(i=>i.productId)).size===b.items.length,400,'Usa una sola fila por producto y reúne sus cantidades.');
 const source=await db.aiDraft.findFirst({where:{id:sourceId,userId:user.id,kind:'solicitud',expires:{gt:new Date()}}});requireThat(source,404,'Solicitud vencida o no encontrada. Interpreta nuevamente.');
 const lots=await db.lot.findMany({where:{active:true,product:{active:true},producer:{active:true},productId:{in:b.items.map(i=>i.productId)},available:{lte:noon(b.deliveryDate)},...(b.locality?{association:{locality:{contains:b.locality,mode:'insensitive'}}}:{})},include:{association:true,product:true},take:2001});requireThat(lots.length<=2000,400,'Demasiadas ofertas; limita la localidad o los productos.');
 const plan=allocate(b.items,lots);const products=await db.product.findMany({where:{id:{in:b.items.map(i=>i.productId)},active:true}});requireThat(products.length===b.items.length,400,'Selecciona productos activos.');
 if(plan.missing.length)return {kind:'insufficient',missing:plan.missing.map(m=>({...m,product:products.find(p=>p.id===m.productId)!.name})),message:'No hay existencias suficientes para completar la solicitud. Reduce la cantidad o cambia fecha, variedad o localidad. No se crearon pedidos.'};
 const groups=[...new Set(plan.selected.map(s=>s.lot.associationId))].map(associationId=>{const rows=plan.selected.filter(s=>s.lot.associationId===associationId);return {associationId,association:rows[0].lot.association.name,locality:rows[0].lot.association.locality,items:rows.map(s=>({lotId:s.lot.id,product:s.lot.product.name,variety:s.lot.variety,quantity:Number(s.quantity),price:s.lot.price.toFixed(2)})),total:rows.reduce((sum,s)=>sum.add(s.quantity.mul(s.lot.price)),new Prisma.Decimal(0)).toFixed(2)};});
 requireThat(plan.selected.length<=30,400,'La propuesta supera 30 lotes. Divide la solicitud.');
 const data={groups,deliveryDate:b.deliveryDate,total:plan.total.toFixed(2)};const d=await draft(user,'propuesta',data);
 return {kind:'proposal',draftId:d.id,expires:d.expires,...data,message:groups.length===1?'Una asociación cubre toda la solicitud.':'Se propone un pedido independiente por asociación. Cada líder lo aceptará o rechazará por separado.',basis:'Primero se intenta una sola asociación; entre opciones completas se elige el menor importe de productos. Si no alcanza, se combinan lotes por precio. No incluye transporte ni calcula distancias. La localidad filtra el origen; no garantiza cobertura de entrega.'};
}
export const purchaseConfirmation=z.object({address:name,institution:z.string().max(200).default(''),responsible:z.string().max(200).default(''),pae:z.boolean().default(false),confirmed:z.literal(true)}).strict();
export async function confirmPurchase(user:User,draftId:string,raw:unknown){
 requireBuyer(user);const b=purchaseConfirmation.parse(raw);requireThat(!b.pae||(b.institution.trim()&&b.responsible.trim()),400,'Completa institución y responsable.');const hash=digest(b);
 return db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "AiDraft" WHERE id=${draftId} FOR UPDATE`;
  const d=await tx.aiDraft.findFirst({where:{id:draftId,userId:user.id,kind:'propuesta'}});requireThat(d,404,'Propuesta no encontrada.');
  if(d.result){requireThat(d.confirmHash===hash,409,'Ya se confirmó con otros datos.');return d.result;}
  requireThat(d.expires>new Date(),409,'La propuesta venció. Busca ofertas nuevamente.');
  const data=d.data as any;requireThat(data.deliveryDate>=localDate(),409,'La fecha de entrega ya pasó. Genera una nueva propuesta.');
  const items=data.groups.flatMap((g:any)=>g.items);for(const item of [...items].sort((a:any,b:any)=>a.lotId.localeCompare(b.lotId))){
   await tx.$queryRaw`SELECT id FROM "Lot" WHERE id=${item.lotId} FOR UPDATE`;
   const lot=await tx.lot.findUnique({where:{id:item.lotId},include:{product:true,producer:true}});requireThat(lot&&lot.active&&lot.product.active&&lot.producer.active&&lot.stock.minus(lot.reserved).gte(item.quantity),409,'Cambió la disponibilidad. Busca ofertas nuevamente; no se creó ningún pedido.');
   requireThat(lot.price.equals(item.price)&&lot.available<=noon(data.deliveryDate),409,'Cambió el precio o la fecha de disponibilidad. Revisa una nueva propuesta.');
  }
  const orders=[];for(const g of data.groups){const order=await createOrder(user,{key:`ia:${d.id}:${g.associationId}`,address:b.address,deliveryDate:noon(data.deliveryDate).toISOString(),institution:b.institution,responsible:b.responsible,pae:b.pae,items:g.items.map((i:any)=>({lotId:i.lotId,quantity:i.quantity}))},tx);orders.push({id:order.id,association:g.association,status:order.status});}
  const result={orders,message:'Solicitudes enviadas. El inventario se reservará cuando cada líder acepte.'};await tx.aiDraft.update({where:{id:d.id},data:{result,confirmHash:hash}});await audit(tx,user.id,'ia',d.id,'confirmar','Compra asistida confirmada',{orderIds:orders.map(o=>o.id)});return result;
 },{maxWait:15000,timeout:20000});
}
