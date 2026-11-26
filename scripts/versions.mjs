import {chromium,firefox} from '@playwright/test';
import {writeFileSync,readFileSync} from 'node:fs';
const browsers={};for(const [name,type,options] of [['chromium',chromium,{}],['firefox',firefox,{}],['chrome',chromium,{channel:'chrome'}]]){const b=await type.launch(options);browsers[name]=b.version();await b.close();}
const result={date:new Date().toISOString(),node:process.version,browsers,edge:'No instalado; sin prueba',dependencies:JSON.parse(readFileSync('package.json','utf8')).dependencies};writeFileSync('docs/evidencias/versiones.json',JSON.stringify(result,null,2));console.log(JSON.stringify({node:result.node,browsers},null,2));
