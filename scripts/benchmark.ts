import 'dotenv/config';
import {chromium} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
const url=new URL(process.env.DATABASE_URL!);url.pathname='/sierradirecta_test';process.env.DATABASE_URL=url.toString();process.env.ORIGIN='http://127.0.0.1:4312';
const {db}=await import('../server/db.js');const {app}=await import('../server/app.js');
const server=app.listen(4312,'127.0.0.1');
const browser=await chromium.launch();
try{
 const category=await db.category.upsert({where:{name:'Carga de rendimiento'},update:{},create:{name:'Carga de rendimiento'}});
 let product=await db.product.findFirst({where:{categoryId:category.id}});if(!product)product=await db.product.create({data:{name:'Papa benchmark',categoryId:category.id}});
 for(let i=0;i<20;i++){
  let association=await db.association.findFirst({where:{name:'Benchmark '+i}});if(!association)association=await db.association.create({data:{name:'Benchmark '+i,locality:'Localidad de prueba',representative:'Ficticio'}});
  let producer=await db.producer.findFirst({where:{associationId:association.id}});if(!producer)producer=await db.producer.create({data:{name:'Productor ficticio',community:'Prueba',associationId:association.id}});
  const count=await db.lot.count({where:{associationId:association.id}});
  if(count<250)await db.lot.createMany({data:Array.from({length:250-count},()=>({id:randomUUID(),associationId:association!.id,producerId:producer!.id,productId:product!.id,variety:'Prueba',description:'Carga sintética aislada',stock:100,price:1,harvest:new Date('2026-01-01'),available:new Date('2026-01-02')}))});
 }
 const durations:number[]=[];const uiDurations:number[]=[];const clients=await Promise.all(Array.from({length:20},async()=>{
  const context=await browser.newContext({serviceWorkers:'block'});const page=await context.newPage();const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:50,downloadThroughput:625000,uploadThroughput:625000});return {context,page};
 }));
 await Promise.all(clients.map(async({page})=>{const start=performance.now();await page.goto('http://127.0.0.1:4312');await page.locator('.lot-card').first().waitFor();uiDurations.push(performance.now()-start);}));
 uiDurations.sort((a,b)=>a-b);const uiP95=uiDurations[Math.ceil(uiDurations.length*.95)-1];
 const initialBytes=await Promise.all(clients.map(({page})=>page.evaluate(()=>[...performance.getEntriesByType('navigation'),...performance.getEntriesByType('resource')].reduce((sum,e)=>sum+((e as PerformanceResourceTiming).transferSize||0),0))));
 await Promise.all(clients.map(async({page})=>{for(let i=0;i<5;i++){const ms=await page.evaluate(async()=>{const start=performance.now();const r=await fetch('/api/lots?q=Papa');if(!r.ok)throw Error('Consulta fallida');await r.json();return performance.now()-start;});durations.push(ms);}}));
 durations.sort((a,b)=>a-b);const p95=durations[Math.ceil(durations.length*.95)-1];
 const resources=await clients[0].page.evaluate(()=>performance.getEntriesByType('resource').map(e=>({url:e.name,bytes:(e as PerformanceResourceTiming).transferSize})));
 const result={date:new Date().toISOString(),database:'sierradirecta_test',lots:await db.lot.count(),associations:20,concurrency:20,requests:durations.length,network:'CDP: 5 Mbps por cliente, 50 ms latencia, navegador Chromium local',operation:'Carga simultánea sin caché de 20 catálogos completos hasta primera tarjeta visible; después 100 consultas JSON',uiP95ms:uiP95,uiSamples:uiDurations,initialBytesMax:Math.max(...initialBytes),apiP95ms:p95,minms:durations[0],maxms:durations.at(-1),targetMs:3000,passed:uiP95<=3000&&Math.max(...initialBytes)<=1500000,firstClientResources:resources,note:'Ensayo sintético local de interfaz y API; no mide el servidor del profesor ni sustituye conectividad rural real.'};
 await mkdir('docs/evidencias',{recursive:true});await writeFile('docs/evidencias/rendimiento.json',JSON.stringify(result,null,2));console.log(JSON.stringify({...result,firstClientResources:undefined},null,2));
 if(!result.passed)process.exitCode=1;
}finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));await db.$disconnect();}
