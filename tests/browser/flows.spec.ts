import {test,expect,type Page} from '@playwright/test';
import {readFileSync,mkdirSync} from 'node:fs';
const pass=readFileSync('.local/demo-access.txt','utf8').match(/Contraseña común: (.+)/)![1].trim();
async function login(page:Page,email:string){await page.goto('/');await page.getByRole('button',{name:'Ingresar',exact:true}).click();await page.getByLabel('Correo electrónico').fill(email);await page.getByLabel('Contraseña',{exact:true}).fill(pass);await page.getByRole('button',{name:'Confirmar',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);}
async function nav(page:Page,name:string){const menu=page.getByRole('button',{name:'Abrir navegación'});if(await menu.isVisible())await menu.click();await page.getByRole('navigation').getByRole('button',{name,exact:true}).click();}
async function logout(page:Page){const menu=page.getByRole('button',{name:'Abrir navegación'});if(await menu.isVisible())await menu.click();await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();await expect(page.getByRole('button',{name:'Ingresar',exact:true})).toBeVisible();}
test('catálogo adaptable y sin desbordamientos',async({page},info)=>{
 mkdirSync('docs/evidencias',{recursive:true});
 await page.goto('/');await page.getByRole('button',{name:'Explorar catálogo',exact:true}).click();await expect(page.locator('.lot-card').first()).toBeVisible();
 for(const width of [360,390,768,1024,1440]){
  await page.setViewportSize({width,height:900});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const buttons=await page.locator('main button:visible').evaluateAll(els=>els.map(e=>e.getBoundingClientRect().height));expect(buttons.every(h=>h>=43.9)).toBe(true);
  if(info.project.name==='chromium'&&[360,1440].includes(width))await page.screenshot({path:`docs/evidencias/catalogo-${width}.png`,fullPage:true});
 }
 await nav(page,'Precios de referencia');await expect(page.getByRole('heading',{name:'Decide con información'})).toBeVisible();await expect(page.getByText('Desactualizada').first()).toBeVisible();
});
test('publicación con borrador, pedido, aceptación y recepción reales',async({page},info)=>{
 await page.setViewportSize({width:390,height:844});
 await login(page,'lider@sierra.test');
 await page.getByRole('button',{name:'Publicar cosecha',exact:true}).click();const unique='E2E-'+info.project.name+'-'+Date.now();
 await page.getByLabel('Variedad',{exact:true}).fill(unique);
 await page.getByRole('button',{name:'Volver',exact:true}).click();await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Publicar cosecha',exact:true}).click();await expect(page.getByLabel('Variedad',{exact:true})).toHaveValue(unique);
 await page.getByLabel('Productor',{exact:true}).selectOption({label:'Productora Demo A'});await page.getByLabel('Producto',{exact:true}).selectOption({label:'Papa'});
 await page.getByLabel('Existencia física (kg)').fill('30');await page.getByLabel('Precio de oferta (USD/kg)').fill('1.20');await page.getByRole('button',{name:'Confirmar',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByText(unique,{exact:true})).toBeVisible();
 await logout(page);await login(page,'comprador@sierra.test');
 const card=page.locator('.lot-card').filter({hasText:unique});await card.getByRole('button',{name:'Solicitar',exact:true}).click();await page.getByLabel(/Cantidad en kg/).fill('3');await page.getByRole('button',{name:'Confirmar',exact:true}).click();await page.getByRole('button',{name:'Revisar y solicitar'}).click();await page.getByLabel('Dirección de entrega').fill('Entrega E2E '+unique);const future=new Date(Date.now()+3*86400000).toISOString().slice(0,10);await page.getByLabel('Fecha acordada de entrega').fill(future);await page.getByRole('button',{name:'Confirmar',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.locator('.order-card').first().click();await expect(page.locator('.order-detail')).toContainText('Entrega E2E '+unique);const heading=await page.locator('.order-detail h2').innerText();const short=heading.split('#')[1];await expect(page.locator('.order-detail .badge').first()).toHaveText('pendiente');
 await logout(page);await login(page,'lider@sierra.test');await nav(page,'Pedidos');await page.locator('.order-card').filter({hasText:'#'+short}).click();await page.getByRole('button',{name:'Aceptar completo'}).click();await expect(page.locator('.order-detail .badge').first()).toHaveText('aceptado');await page.getByRole('button',{name:'Iniciar preparación'}).click();await expect(page.getByRole('button',{name:'Marcar listo para entrega'})).toHaveCount(0);await page.getByRole('button',{name:'Marcar salida del campo'}).click();await expect(page.locator('.order-detail .badge').first()).toHaveText('salió del campo');await expect(page.locator('.timeline')).toContainText('salió del campo');await page.getByRole('button',{name:'Marcar listo para entrega'}).click();await expect(page.locator('.order-detail .badge').first()).toHaveText('listo para entrega');
 await logout(page);await login(page,'comprador@sierra.test');await nav(page,'Pedidos');await page.locator('.order-card').filter({hasText:'#'+short}).click();await page.getByRole('button',{name:'Confirmar recepción'}).click();await expect(page.locator('.order-detail .badge').first()).toHaveText('entregado');await expect(page.locator('.trace')).toContainText('Productora Demo A');
 if(info.project.name==='chromium')await page.screenshot({path:'docs/evidencias/pedido-entregado-movil.png',fullPage:true});
 await page.reload({waitUntil:'domcontentloaded'});await nav(page,'Pedidos');await expect(page.locator('.order-card').filter({hasText:'#'+short})).toContainText('entregado');
});
