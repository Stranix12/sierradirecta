import {spawn,spawnSync} from 'node:child_process';
import {mkdirSync,openSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'));
const check=await fetch('http://127.0.0.1:4310/api/health').then(r=>r.ok).catch(()=>false);
if(check){console.log('SierraDirecta ya está disponible: http://127.0.0.1:4310');process.exit(0);}
const db=spawnSync(process.execPath,['scripts/database.mjs','start'],{stdio:'inherit',windowsHide:true});if(db.status)process.exit(db.status);
mkdirSync('.local',{recursive:true});const log=openSync('.local/server.log','a');
const child=spawn(process.execPath,['--import','tsx','server/index.ts'],{detached:true,stdio:['ignore',log,log],windowsHide:true});child.unref();writeFileSync('.local/server.pid',String(child.pid));
for(let i=0;i<30;i++){if(await fetch('http://127.0.0.1:4310/api/health').then(r=>r.ok).catch(()=>false)){console.log('SierraDirecta: http://127.0.0.1:4310');process.exit(0);}await new Promise(r=>setTimeout(r,500));}
console.error('No arrancó; consulte .local/server.log');process.exit(1);
/* global fetch, setTimeout */
