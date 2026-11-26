import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('accesibilidad automática y teclado del acceso',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Explorar catálogo',exact:true}).click();await page.locator('.lot-card').first().waitFor();
 const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
 expect(results.violations.map(v=>({id:v.id,help:v.help,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);
 await page.getByRole('button',{name:'Ingresar',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByLabel('Correo electrónico').focus();await page.keyboard.press('Tab');await expect(page.getByLabel('Contraseña',{exact:true})).toBeFocused();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
});
