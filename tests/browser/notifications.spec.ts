import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
const password=readFileSync('.local/demo-access.txt','utf8').match(/Contraseña común: (.+)/)![1].trim();
async function nav(page:Page,name:string){const menu=page.getByRole('button',{name:'Abrir navegación'});if(await menu.isVisible())await menu.click();await page.getByRole('navigation').getByRole('button',{name,exact:true}).click();}
test('líder recibe pedidos, conserva avisos, filtra y vuelve a portada',async({page,playwright},info)=>{
 await page.goto('/');await expect(page.getByRole('heading',{name:'Del campo a tu mesa, sin intermediarios'})).toBeVisible();
 await page.getByRole('button',{name:'Ingresar',exact:true}).click();await page.getByLabel('Correo electrónico').fill('lider@sierra.test');await page.getByLabel('Contraseña',{exact:true}).fill(password);await page.getByRole('button',{name:'Confirmar',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 await nav(page,'Catálogo');await expect(page.locator('.lot-card').first()).toBeVisible();await expect(page.getByRole('button',{name:'Solicitar',exact:true})).toHaveCount(0);
 const base='http://127.0.0.1:4310';const me=await (await page.request.get('/api/me')).json();const headers={origin:base,'x-csrf-token':me.csrf};
 const lookup=await (await page.request.get('/api/lookups')).json();const producer=lookup.producers.find((p:any)=>p.associationId===me.user.associationId);
 const variety='E2E-AVISOS-'+info.project.name+'-'+Date.now();const lotBody={producerId:producer.id,productId:lookup.products[0].id,variety,description:'Verificación de avisos',stock:5,price:1,harvest:'2026-01-01T12:00:00Z',available:'2026-01-02T12:00:00Z',active:true};
 const created=await page.request.post('/api/lots',{headers,data:lotBody});expect(created.status()).toBe(201);const lot=await created.json();
 const buyer=await playwright.request.newContext({baseURL:base,extraHTTPHeaders:{origin:base}});
 try{
  const auth=await (await buyer.post('/api/login',{data:{email:'comprador@sierra.test',password}})).json();
  await nav(page,'Notificaciones');await expect(page.locator('.notification').filter({hasText:variety})).toBeVisible();
  const response=await buyer.post('/api/orders',{headers:{'x-csrf-token':auth.csrf},data:{key:crypto.randomUUID(),address:'Prueba notificaciones',deliveryDate:new Date(Date.now()+86400000*2).toISOString(),items:[{lotId:lot.id,quantity:5}]}});expect(response.status()).toBe(201);const order=await response.json();const short=order.id.slice(0,8);
  // Arrival must become visible while staying on the page, without reload or navigation.
  const notice=page.locator('.notification').filter({hasText:'Nuevo pedido por revisar #'+short});await expect(notice).toBeVisible({timeout:15000});await expect(notice).toContainText('Importancia alta');
  await nav(page,'Notificaciones');await nav(page,'Notificaciones');await expect(notice).toBeVisible();
  await notice.getByRole('button',{name:'Marcar leída',exact:true}).click();await expect(notice).toContainText('Leída');
  await page.getByRole('combobox',{name:'Lectura',exact:true}).selectOption('true');await expect(notice).toBeVisible();await page.getByRole('combobox',{name:'Lectura',exact:true}).selectOption('false');await expect(notice).toHaveCount(0);await page.getByRole('button',{name:'Limpiar filtros'}).click();await expect(notice).toBeVisible();
  await page.getByRole('combobox',{name:'Importancia',exact:true}).selectOption('alta');await expect(notice).toBeVisible();await page.getByRole('combobox',{name:'Categoría',exact:true}).selectOption('inventario');await expect(notice).toHaveCount(0);await page.getByRole('button',{name:'Limpiar filtros'}).click();
  await page.getByLabel('Desde',{exact:true}).fill('2099-01-01');await expect(page.getByText('No hay notificaciones con estos filtros.')).toBeVisible();await page.getByRole('button',{name:'Limpiar filtros'}).click();
  await notice.getByRole('button',{name:'Ver pedido'}).click();await expect(page.locator('.order-detail')).toContainText('#'+short);await expect(page.locator('.order-card')).toHaveCount(0);await expect(page.locator('.buyer-orders')).toHaveCount(0);expect(await page.evaluate(()=>scrollY)).toBe(0);await page.getByRole('button',{name:'Aceptar completo'}).click();await expect(page.locator('.order-detail .badge').first()).toHaveText('aceptado');
  await nav(page,'Notificaciones');await page.getByRole('combobox',{name:'Categoría',exact:true}).selectOption('inventario');await expect(page.getByRole('combobox',{name:'Categoría',exact:true})).toHaveValue('inventario');await expect(page.locator('.notification').filter({hasText:'Nuevo pedido por revisar'})).toHaveCount(0);const stock=page.locator('.notification').filter({hasText:variety});await expect(stock).toContainText('Sin disponibilidad');await expect(stock).toContainText('Importancia alta');
  for(const width of [360,768,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
  const a11y=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(a11y.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);
  if(info.project.name==='chromium')await page.screenshot({path:'docs/evidencias/notificaciones-escritorio.png',fullPage:true,animations:'disabled'});
  await page.setViewportSize({width:390,height:844});if(info.project.name==='chromium')await page.screenshot({path:'docs/evidencias/notificaciones-movil.png',fullPage:true,animations:'disabled'});
  await stock.getByRole('button',{name:'Ver cosecha'}).click();await expect(page.locator('.lot-card')).toHaveCount(1);await expect(page.locator('.lot-card')).toContainText(variety);
  expect((await page.request.post('/api/orders/'+order.id+'/state',{headers,data:{status:'cancelado',reason:'Fin de verificación'}})).ok()).toBe(true);
  expect((await page.request.patch('/api/lots/'+lot.id,{headers,data:{...lotBody,active:false,reason:'Ocultar oferta de prueba'}})).ok()).toBe(true);
  const menu=page.getByRole('button',{name:'Abrir navegación'});if(await menu.isVisible())await menu.click();await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();await expect(page.getByRole('heading',{name:'Del campo a tu mesa, sin intermediarios'})).toBeVisible();await expect(page.getByRole('button',{name:'Explorar catálogo',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:/Notificaciones:/})).toHaveCount(0);await expect(page.getByRole('alert')).toHaveCount(0);if(info.project.name==='chromium'){await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'docs/evidencias/portada.png',fullPage:true,animations:'disabled'});}
 }finally{await buyer.dispose();}
});
