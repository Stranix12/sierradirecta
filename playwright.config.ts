import {defineConfig,devices} from '@playwright/test';
import {existsSync} from 'node:fs';
const edge=existsSync('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')||existsSync('C:/Program Files/Microsoft/Edge/Application/msedge.exe');
export default defineConfig({testDir:'tests/browser',timeout:60000,workers:1,reporter:[['list'],['html',{open:'never'}]],use:{baseURL:'http://127.0.0.1:4310',screenshot:'only-on-failure',trace:'retain-on-failure'},projects:[{name:'chromium',use:{...devices['Desktop Chrome']}},{name:'firefox',use:{...devices['Desktop Firefox']}},{name:'chrome',use:{channel:'chrome'}},...(edge?[{name:'edge',use:{channel:'msedge'}}]:[])]});
