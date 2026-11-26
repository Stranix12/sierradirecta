import {db} from '../server/db.js';
import bcrypt from 'bcryptjs';
import {createOrder,transition} from '../server/orders.js';
import {randomBytes} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
export async function seed(){
 if(await db.user.count()){console.log('Base con datos: seed omitido para preservarlos.');return;}
 const pass=process.env.DEMO_PASSWORD||('Sierra-'+randomBytes(8).toString('hex'));const password=await bcrypt.hash(pass,12);
 const a=await db.association.create({data:{name:'Semilla Andina · DEMO',locality:'Latacunga, Cotopaxi',representative:'Representante de demostración'}});
 const b=await db.association.create({data:{name:'Raíces del Páramo · DEMO',locality:'Riobamba, Chimborazo',representative:'Representante de demostración'}});
 const users=[];
 for(const [email,name,role,associationId] of [['admin@sierra.test','Administración','admin',null],['lider@sierra.test','Elena · líder','lider',a.id],['lider2@sierra.test','Luis · líder','lider',b.id],['comprador@sierra.test','Comedor Buen Día','comprador',null],['comprador2@sierra.test','Restaurante El Valle','comprador',null],['precios@sierra.test','Gestión de precios','precios',null]])users.push(await db.user.create({data:{email:email!,name:name!,role:role!,associationId,password,organization:name!,contact:'Contacto ficticio'}}));
 const c=await db.category.create({data:{name:'Cultivos de la Sierra'}});const m=await db.market.create({data:{name:'Mercado de ejemplo (sin cotización oficial)'}});
 const producers=await Promise.all([a,b].map((a,i)=>db.producer.create({data:{name:i?'Productor Demo B':'Productora Demo A',community:'Comunidad de demostración',associationId:a.id}})));
 const now=new Date();now.setUTCHours(0,0,0,0);const yesterday=new Date(now.getTime()-86400000);
 const lots=[];
 for(const [i,name] of ['Papa','Melloco','Habas','Maíz'].entries()){
  const p=await db.product.create({data:{name,categoryId:c.id}});const price=[0.62,1.10,0.95,0.75][i];
  lots.push(await db.lot.create({data:{associationId:i%2?b.id:a.id,producerId:producers[i%2].id,productId:p.id,variety:['Superchola','Rojo','Tierna','Choclo'][i],description:'Cosecha de demostración. Datos ficticios para la práctica académica.',stock:[480,200,120,350][i],price,harvest:yesterday,available:now}}));
  await db.reference.create({data:{productId:p.id,marketId:m.id,source:'Datos sintéticos de demostración; no son precios oficiales',date:i===2?new Date(now.getTime()-10*86400000):now,unit:'kg',kgPerUnit:1,originalMin:price*.8,originalMax:price*1.2,min:price*.8,max:price*1.2}});
 }
 for(let i=0;i<4;i++){
  const o=await createOrder(users[3],{key:'seed-order-'+i,address:'Dirección de demostración, Latacunga',deliveryDate:new Date(now.getTime()+3*86400000).toISOString(),institution:'Escuela de demostración',responsible:'Responsable demo',pae:i===0,items:[{lotId:lots[0].id,quantity:5+i}]});
  if(i>0)await transition(users[1],o.id,'aceptado','');if(i>1)await transition(users[1],o.id,'en preparación','');if(i>2){await transition(users[1],o.id,'salió del campo','');await transition(users[1],o.id,'listo para entrega','');await transition(users[3],o.id,'entregado','');}
 }
 await mkdir('.local',{recursive:true});await writeFile('.local/demo-access.txt',`SOLO DEMOSTRACIÓN LOCAL\nContraseña común: ${pass}\n${users.map(u=>u.email+' — '+u.role).join('\n')}\n`);console.log('Seed completado. Accesos en .local/demo-access.txt (no versionado).');
}
await seed();await db.$disconnect();
