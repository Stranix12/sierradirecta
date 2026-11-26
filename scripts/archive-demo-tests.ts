import 'dotenv/config';
import {db} from '../server/db.js';
import {syncStockAlerts} from '../server/notifications.js';
const admin=await db.user.findUniqueOrThrow({where:{email:'admin@sierra.test'}});
const lots=await db.lot.findMany({where:{variety:{startsWith:'E2E-'},active:true}});
for(const lot of lots)await db.$transaction(async tx=>{await tx.lot.update({where:{id:lot.id},data:{active:false}});await syncStockAlerts(tx,lot.id);await tx.audit.create({data:{actorId:admin.id,entity:'lote',entityId:lot.id,action:'desactivar',reason:'Ocultar oferta de prueba E2E para exposición; conservar pedidos y trazabilidad',data:{active:false}}});});
console.log(`${lots.length} ofertas E2E desactivadas; pedidos conservados.`);await db.$disconnect();
