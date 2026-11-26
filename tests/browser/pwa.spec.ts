import {test,expect} from '@playwright/test';
test('PWA sin conexión conserva shell público y excluye API de caché',async({page,context})=>{
 await page.goto('/');await page.getByRole('button',{name:'Explorar catálogo',exact:true}).click();await expect(page.locator('.lot-card').first()).toBeVisible();
 await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.getByRole('button',{name:'Explorar catálogo',exact:true}).click();await expect(page.locator('.lot-card').first()).toBeVisible();
 await page.evaluate(async()=>{await fetch('/api/me');await fetch('/api/orders');});
 const keys=await page.evaluate(async()=>{const names=await caches.keys();return (await Promise.all(names.map(async n=>(await (await caches.open(n)).keys()).map(r=>new URL(r.url).pathname)))).flat();});
 expect(keys).toContain('/');expect(keys.some(k=>k.startsWith('/api/'))).toBe(false);
 await context.setOffline(true);await page.reload();await expect(page.getByText(/Sin conexión/).first()).toBeVisible();expect(await page.locator('#root').innerText()).not.toBe('');
 await context.setOffline(false);await page.reload();await page.getByRole('button',{name:'Explorar catálogo',exact:true}).click();await expect(page.locator('.lot-card').first()).toBeVisible();
});
