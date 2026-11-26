import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const password=readFileSync('.local/demo-access.txt','utf8').match(/Contraseña común: (.+)/)![1].trim();
test('pedidos separados por comprador y detalle exclusivo con regreso a filtros',async({page,playwright},info)=>{
 const base='http://127.0.0.1:4310';
 await page.goto('/');await page.getByRole('button',{name:'Ingresar',exact:true}).click();await page.getByLabel('Correo electrónico').fill('lider@sierra.test');await page.getByLabel('Contraseña',{exact:true}).fill(password);await page.getByRole('button',{name:'Confirmar',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 const me=await(await page.request.get('/api/me')).json(),look=await(await page.request.get('/api/lookups')).json();const headers={origin:base,'x-csrf-token':me.csrf};
 const body={producerId:look.producers.find((p:any)=>p.associationId===me.user.associationId).id,productId:look.products[0].id,variety:'E2E-AGRUPADOS-'+info.project.name+'-'+Date.now(),description:'Prueba de separación por comprador',stock:30,price:1,harvest:'2026-01-01T12:00:00Z',available:'2026-01-02T12:00:00Z',active:true};
 const lot=await(await page.request.post('/api/lots',{headers,data:body})).json();const customers:any[]=[];
 try{
  for(const email of ['comprador@sierra.test','comprador2@sierra.test']){
   const client=await playwright.request.newContext({baseURL:base,extraHTTPHeaders:{origin:base}});const auth=await(await client.post('/api/login',{data:{email,password}})).json();
   const response=await client.post('/api/orders',{headers:{'x-csrf-token':auth.csrf},data:{key:crypto.randomUUID(),address:'Entrega agrupada '+email,deliveryDate:new Date(Date.now()+2*86400000).toISOString(),items:[{lotId:lot.id,quantity:1}]}});expect(response.status()).toBe(201);customers.push({client,auth,order:await response.json()});
  }
  await page.getByRole('navigation').getByRole('button',{name:'Pedidos',exact:true}).click();
  for(const c of customers){const group=page.locator('.buyer-orders[data-buyer-id="'+c.auth.user.id+'"]');await expect(group).toContainText(c.auth.user.name);await expect(group).toContainText(c.auth.user.email);await expect(group.locator('.order-card').filter({hasText:c.order.id.slice(0,8)})).toBeVisible();const other=customers.find(x=>x!==c);await expect(group).not.toContainText(other.order.id.slice(0,8));}
  const c=customers[1];await page.getByRole('combobox',{name:'Filtrar comprador'}).selectOption(c.auth.user.id);await page.getByRole('combobox',{name:'Estado de pedidos'}).selectOption('pendiente');await expect(page.locator('.buyer-orders')).toHaveCount(1);
  await page.locator('.order-card').filter({hasText:c.order.id.slice(0,8)}).click();await expect(page.locator('.order-detail')).toContainText(c.order.id.slice(0,8));await expect(page.locator('.order-detail')).toContainText(c.auth.user.email);await expect(page.locator('.order-card')).toHaveCount(0);await expect(page.locator('.buyer-orders')).toHaveCount(0);await expect(page.getByRole('heading',{name:'Detalle del pedido',exact:true})).toBeVisible();expect(await page.evaluate(()=>scrollY)).toBe(0);
  for(const width of [390,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);if(info.project.name==='chromium')await page.screenshot({path:'docs/evidencias/pedido-individual-'+width+'.png',fullPage:true,animations:'disabled'});}
  await page.getByRole('button',{name:'← Volver a pedidos'}).click();await expect(page.getByRole('combobox',{name:'Filtrar comprador'})).toHaveValue(c.auth.user.id);await expect(page.getByRole('combobox',{name:'Estado de pedidos'})).toHaveValue('pendiente');await expect(page.locator('.buyer-orders')).toHaveCount(1);await expect(page.locator('.order-detail')).toHaveCount(0);
  await page.getByRole('button',{name:'Limpiar filtros',exact:true}).click();await expect(page.locator('.buyer-orders')).toHaveCount(2);if(info.project.name==='chromium')await page.screenshot({path:'docs/evidencias/pedidos-por-comprador.png',fullPage:true,animations:'disabled'});
 }finally{
  for(const c of customers){await c.client.post('/api/orders/'+c.order.id+'/state',{headers:{'x-csrf-token':c.auth.csrf},data:{status:'cancelado',reason:'Fin de ensayo de agrupación'}});await c.client.dispose();}
  await page.request.patch('/api/lots/'+lot.id,{headers,data:{...body,active:false,reason:'Ocultar oferta de prueba'}});
 }
});
