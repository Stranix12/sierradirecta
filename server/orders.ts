import {Prisma, type User} from '@prisma/client';
import {createHash} from 'node:crypto';
import {db} from './db.js';
import {canTransition,requireThat} from './domain.js';
import {syncStockAlerts} from './notifications.js';
type Tx=Prisma.TransactionClient;
export const orderInclude={buyer:{select:{id:true,name:true,organization:true,email:true}},association:true,items:{include:{lot:{include:{product:true,producer:true}}}},events:{orderBy:{created:'asc' as const}},attachments:{select:{id:true,name:true,kind:true,size:true,created:true}},incidents:true};
export function orderScope(user:User):Prisma.OrderWhereInput {return user.role==='admin'?{}:user.role==='lider'?{associationId:user.associationId||'none'}:{buyerId:user.id};}
export async function audit(tx:Tx,actorId:string,entity:string,entityId:string,action:string,reason:string,data:unknown){await tx.audit.create({data:{actorId,entity,entityId,action,reason,data:JSON.parse(JSON.stringify(data))}});}
async function notify(tx:Tx,order:{id:string,buyerId:string,associationId:string},status:string){
 const leaders=await tx.user.findMany({where:{associationId:order.associationId,role:'lider',active:true}});
 for(const id of new Set([order.buyerId,...leaders.map(u=>u.id)])){
  const buyer=id===order.buyerId;
  const message=status==='pendiente'?`${buyer?'Solicitud enviada':'Nuevo pedido por revisar'} #${order.id.slice(0,8)}`:`Pedido #${order.id.slice(0,8)}: ${status}`;
  const priority=(!buyer&&status==='pendiente')||(buyer&&status==='listo para entrega')?'alta':status==='entregado'?'baja':'media';
  await tx.notification.upsert({where:{key:`${order.id}:${status}:${id}`},update:{},create:{userId:id,orderId:order.id,key:`${order.id}:${status}:${id}`,category:'pedidos',priority,message}});
 }
}
export async function createOrder(user:User,input:{key:string,address:string,deliveryDate:string,institution:string,responsible:string,pae:boolean,items:{lotId:string,quantity:number}[]},transaction?:Tx){
 requireThat(user.role==='comprador',403,'Solo compradores pueden solicitar pedidos.');
 const hash=createHash('sha256').update(JSON.stringify({...input,items:[...input.items].sort((a,b)=>a.lotId.localeCompare(b.lotId))})).digest('hex');
 const execute=async (tx:Tx)=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id+input.key}))`;
  const previous=await tx.order.findUnique({where:{buyerId_key:{buyerId:user.id,key:input.key}},include:orderInclude});
  if(previous){requireThat(previous.payloadHash===hash,409,'La clave ya se usó con otra solicitud.');return previous;}
  const ids=input.items.map(i=>i.lotId); requireThat(new Set(ids).size===ids.length,400,'No repita el mismo lote.');
  const lots=await tx.lot.findMany({where:{id:{in:ids},active:true},include:{product:true,producer:true,association:true}});
  requireThat(lots.length===ids.length,400,'Un lote no está disponible.');
  requireThat(new Set(lots.map(l=>l.associationId)).size===1,400,'Seleccione una sola asociación por pedido.');
  const items=input.items.map(i=>{const l=lots.find(l=>l.id===i.lotId)!;requireThat(l.stock.minus(l.reserved).gte(i.quantity)&&l.producer.active&&l.product.active,409,'Disponibilidad insuficiente.');requireThat(new Date(input.deliveryDate)>=l.available,400,'La entrega precede a la disponibilidad.');return {lotId:l.id,quantity:i.quantity,price:l.price,origin:{producer:l.producer.name,community:l.producer.community,association:l.association.name,product:l.product.name,variety:l.variety,harvest:l.harvest.toISOString(),lotId:l.id}};});
  const order=await tx.order.create({data:{buyerId:user.id,associationId:lots[0].associationId,key:input.key,payloadHash:hash,address:input.address,deliveryDate:new Date(input.deliveryDate),institution:input.institution,responsible:input.responsible,pae:input.pae,items:{create:items},events:{create:{actorId:user.id,status:'pendiente'}}},include:orderInclude});
  await notify(tx,order,'pendiente');await audit(tx,user.id,'pedido',order.id,'crear','Solicitud',input);return order;
 };
 return transaction?execute(transaction):db.$transaction(execute);
}
export async function transition(user:User,id:string,next:string,reason:string){
 return db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${id} FOR UPDATE`;
  const order=await tx.order.findFirst({where:{id,...orderScope(user)},include:{items:true}});
  requireThat(order,404,'Pedido no encontrado.');
  requireThat(['lider','comprador'].includes(user.role),403,'Rol sin permiso para esta operación.');
  if(order.status===next){const event=await tx.orderEvent.findFirst({where:{orderId:id,status:next,actorId:user.id}});requireThat(event,403,'Transición no autorizada.');return tx.order.findUnique({where:{id},include:orderInclude});}
  requireThat(canTransition(user.role,order.status,next),409,'Transición no permitida.');
  if(['cancelado','rechazado'].includes(next))requireThat(reason.trim().length>=3,400,'Indique un motivo.');
  for(const item of [...order.items].sort((a,b)=>a.lotId.localeCompare(b.lotId))){
   await tx.$queryRaw`SELECT id FROM "Lot" WHERE id=${item.lotId} FOR UPDATE`;
   const lot=await tx.lot.findUniqueOrThrow({where:{id:item.lotId}});
   if(next==='aceptado'){
    requireThat(lot.active&&lot.stock.minus(lot.reserved).gte(item.quantity),409,'Stock insuficiente; el pedido sigue pendiente.');
    await tx.lot.update({where:{id:lot.id},data:{reserved:{increment:item.quantity}}});
   }else if(next==='cancelado'&&order.status!=='pendiente')await tx.lot.update({where:{id:lot.id},data:{reserved:{decrement:item.quantity}}});
   else if(next==='entregado')await tx.lot.update({where:{id:lot.id},data:{stock:{decrement:item.quantity},reserved:{decrement:item.quantity}}});
   if(next==='aceptado'||next==='entregado'||(next==='cancelado'&&order.status!=='pendiente'))await tx.movement.create({data:{lotId:lot.id,orderId:id,kind:next,quantity:item.quantity}});
   await syncStockAlerts(tx,lot.id);
  }
  await tx.order.update({where:{id},data:{status:next,events:{create:{status:next,actorId:user.id,reason}}}});
  await notify(tx,order,next);await audit(tx,user.id,'pedido',id,'estado',reason||next,{from:order.status,to:next});
  return tx.order.findUnique({where:{id},include:orderInclude});
 },{maxWait:15000,timeout:20000});
}
