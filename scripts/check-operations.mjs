import 'dotenv/config';
import {readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import pg from 'pg';
const base='http://127.0.0.1:4310',password=readFileSync('.local/demo-access.txt','utf8').match(/Contraseña común: (.+)/)[1].trim();
const login=await fetch(base+'/api/login',{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify({email:'comprador@sierra.test',password})});
if(!login.ok)throw Error('Acceso de verificación fallido');
const session=await login.json(),cookie=login.headers.get('set-cookie').split(';')[0];const headers={origin:base,cookie,'x-csrf-token':session.csrf,connection:'close'};
const orders=await (await fetch(base+'/api/orders',{headers})).json();
if(!Array.isArray(orders))throw Error('No se pudieron consultar pedidos');
const snapshot=async()=>{const response=await fetch(base+'/api/orders',{headers});if(!response.ok)throw Error('Sesión no persistida');return JSON.stringify(await response.json());};
const before=await snapshot();const pid=Number(readFileSync('.local/server.pid','utf8'));
const command=execFileSync('powershell.exe',['-NoProfile','-Command',`(Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}").CommandLine`],{encoding:'utf8',windowsHide:true});
if(!command.includes('server/index.ts'))throw Error('El PID no corresponde al servidor esperado');
process.kill(pid);execFileSync(process.execPath,['scripts/start.mjs'],{stdio:'pipe',windowsHide:true});
const after=await snapshot();if(before!==after)throw Error('Los pedidos cambiaron tras reiniciar');
const start=performance.now();execFileSync(process.execPath,['scripts/database.mjs','backup'],{stdio:'pipe',windowsHide:true});const restored=execFileSync(process.execPath,['scripts/database.mjs','restore'],{encoding:'utf8',windowsHide:true});
const name=restored.match(/sierradirecta_restore_\d+/)[0];const original=new pg.Client({connectionString:process.env.DATABASE_URL});const url=new URL(process.env.DATABASE_URL);url.pathname='/'+name;const copy=new pg.Client({connectionString:url.toString()});await original.connect();await copy.connect();
const counts={};for(const table of ['Order','OrderItem','Lot','Attachment','AiDraft','Audit']){const a=await original.query(`SELECT count(*)::int n FROM "${table}"`),b=await copy.query(`SELECT count(*)::int n FROM "${table}"`);counts[table]=a.rows[0].n;if(a.rows[0].n!==b.rows[0].n)throw Error('Conteo restaurado diferente: '+table);}
const hash=f=>createHash('sha256').update(readFileSync(f)).digest('hex');const upload=path.resolve(process.env.UPLOAD_DIR||'.local/uploads');let files=0;for(const file of existsSync(upload)?readdirSync(upload):[]){const target=path.resolve('.local/restored-files',name,file);if(!existsSync(target)||hash(path.join(upload,file))!==hash(target))throw Error('Adjunto restaurado diferente');files++;}
await original.end();await copy.end();
const result={date:new Date().toISOString(),restartPreservedOrdersAndSession:before===after,backupRestored:true,restoreDatabase:name,counts,filesVerifiedSHA256:files,backupAndRestoreMs:performance.now()-start,note:'Ensayo local en base y carpeta separadas. No demuestra respaldo diario ni RPO/RTO del servidor.'};writeFileSync('docs/evidencias/operaciones.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
/* global fetch, performance */
