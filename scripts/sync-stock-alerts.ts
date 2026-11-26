import 'dotenv/config';
import {db} from '../server/db.js';
import {syncStockAlerts} from '../server/notifications.js';
const lots=await db.lot.findMany({where:{OR:[{active:true},{id:{in:(await db.notification.findMany({where:{category:'inventario',resolved:false},select:{lotId:true}})).flatMap(n=>n.lotId?[n.lotId]:[])}}]},select:{id:true}});
for(const lot of lots)await db.$transaction(tx=>syncStockAlerts(tx,lot.id));
console.log(`Inventario revisado: ${lots.length} lotes. Alertas sincronizadas sin duplicados.`);
await db.$disconnect();
