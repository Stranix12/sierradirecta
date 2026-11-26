import {Prisma,type User} from '@prisma/client';
import {z} from 'zod';
import {db} from './db.js';
import {requireThat} from './domain.js';

export const LOW_STOCK_KG=10;
// Called in the same transaction as inventory changes, with a per-lot lock.
export async function syncStockAlerts(tx:Prisma.TransactionClient,lotId:string){
 await tx.$queryRaw`SELECT id FROM "Lot" WHERE id=${lotId} FOR UPDATE`;
 const lot=await tx.lot.findUniqueOrThrow({where:{id:lotId},include:{product:true,producer:true}});
 const available=lot.stock.minus(lot.reserved);
 if(!lot.active||!lot.product.active||!lot.producer.active||available.gt(LOW_STOCK_KG)){
  await tx.notification.updateMany({where:{lotId,category:'inventario',resolved:false},data:{resolved:true}});return;
 }
 const priority=available.lte(0)?'alta':'media';
 const message=`${available.lte(0)?'Sin disponibilidad':'Poca existencia'}: ${lot.product.name} · ${lot.variety}. ${available.toFixed(2)} kg disponibles de ${lot.stock.toFixed(2)} kg físicos (${lot.reserved.toFixed(2)} kg reservados).`;
 const leaders=await tx.user.findMany({where:{role:'lider',active:true,associationId:lot.associationId},select:{id:true}});
 for(const leader of leaders){
  const key=`stock:${lot.id}:${leader.id}`;
  const previous=await tx.notification.findUnique({where:{key}});
  if(!previous)await tx.notification.create({data:{key,userId:leader.id,lotId,category:'inventario',priority,message}});
  else await tx.notification.update({where:{key},data:{message,priority,resolved:false,...(previous.resolved||previous.priority!==priority?{read:false,created:new Date()}: {})}});
 }
}

const query=z.object({category:z.enum(['pedidos','inventario','precios']).optional(),priority:z.enum(['alta','media','baja']).optional(),read:z.enum(['true','false']).optional(),from:z.iso.date().optional(),to:z.iso.date().optional(),page:z.coerce.number().int().min(1).max(100000).default(1)}).strict();
export async function listNotifications(user:User,input:unknown){
 const b=query.parse(input);requireThat(!b.from||!b.to||b.from<=b.to,400,'La fecha inicial no puede superar la final.');
 const where:Prisma.NotificationWhereInput={userId:user.id,...(b.category?{category:b.category}:{}),...(b.priority?{priority:b.priority}:{}),...(b.read?{read:b.read==='true'}:{}),...((b.from||b.to)?{created:{...(b.from?{gte:new Date(b.from+'T00:00:00-05:00')}:{}),...(b.to?{lt:new Date(new Date(b.to+'T00:00:00-05:00').getTime()+86400000)}:{})}}:{})};
 const [items,total]=await db.$transaction([db.notification.findMany({where,orderBy:[{created:'desc'},{id:'desc'}],take:25,skip:(b.page-1)*25}),db.notification.count({where})]);
 return {items,total,page:b.page};
}
export async function notificationSummary(user:User){
 const own={userId:user.id,resolved:false};
 const [unread,important,pendingOrders,lowStock,latest]=await Promise.all([
  db.notification.count({where:{...own,read:false}}),
  db.notification.count({where:{...own,read:false,priority:'alta'}}),
  ['lider','comprador','admin'].includes(user.role)?db.order.count({where:{status:'pendiente',...(user.role==='lider'?{associationId:user.associationId||'none'}:user.role==='comprador'?{buyerId:user.id}:{})}}):0,
  db.notification.count({where:{...own,category:'inventario'}}),
  db.notification.findFirst({where:{...own,read:false},orderBy:[{created:'desc'},{id:'desc'}],select:{id:true,created:true}})
 ]);
 return {unread,important,pendingOrders,lowStock,latest:latest?`${latest.id}:${latest.created.toISOString()}`:null};
}
