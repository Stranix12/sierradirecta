import {spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,writeFileSync,readFileSync,cpSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {randomBytes} from 'node:crypto';
import 'dotenv/config';
const root=resolve('.local'); mkdirSync(root,{recursive:true});
const bin=process.env.PG_BIN || join(root,'pgsql','bin');
const exe=n=>join(bin,n+(process.platform==='win32'?'.exe':''));
const run=(n,args,extra={})=>{const p=spawnSync(exe(n),args,{encoding:'utf8',windowsHide:true,...extra});if(p.status!==0)throw Error(p.stderr||p.stdout||p.error?.message);return p.stdout;};
const data=join(root,'pgdata'); const port='55439';
const action=process.argv[2]||'start';
if(action==='start'){
 if(!existsSync(join(data,'PG_VERSION'))){
  const password=randomBytes(24).toString('hex'); writeFileSync(join(root,'db-pass'),password);
  run('initdb',['-D',data,'-U','sierra','--pwfile='+join(root,'db-pass'),'--auth=scram-sha-256','--encoding=UTF8','--locale=C']);
  writeFileSync(join(data,'postgresql.auto.conf'),`listen_addresses = '127.0.0.1'\nport = ${port}\n`);
  writeFileSync('.env',`DATABASE_URL="postgresql://sierra:${password}@127.0.0.1:${port}/sierradirecta"\nPORT=4310\nORIGIN=http://127.0.0.1:4310\nUPLOAD_DIR=.local/uploads\nDEMO_MODE=true\n`);
 }
 const status=spawnSync(exe('pg_ctl'),['-D',data,'status'],{windowsHide:true});
 if(status.status!==0)run('pg_ctl',['-D',data,'-l',join(root,'postgres.log'),'start','-w'],{stdio:'ignore'});
 const password=readFileSync(join(root,'db-pass'),'utf8');
 const env={...process.env,PGPASSWORD:password};
 for(const name of ['sierradirecta','sierradirecta_test']){
  const found=run('psql',['-h','127.0.0.1','-p',port,'-U','sierra','-d','postgres','-tAc',`SELECT 1 FROM pg_database WHERE datname='${name}'`],{env});
  if(!found.trim())run('createdb',['-h','127.0.0.1','-p',port,'-U','sierra',name],{env});
 }
 console.log('PostgreSQL aislado disponible en 127.0.0.1:'+port);
}else if(action==='stop'){run('pg_ctl',['-D',data,'stop','-m','fast']);}
else{
 const u=new URL(process.env.DATABASE_URL);const args=['-h',u.hostname,'-p',u.port,'-U',u.username];const env={...process.env,PGPASSWORD:decodeURIComponent(u.password)};
 const file=join(root,'backup.dump');
 if(action==='backup'){run('pg_dump',[...args,'-d',u.pathname.slice(1),'-Fc','-f',file],{env});const upload=resolve(process.env.UPLOAD_DIR||'.local/uploads');const folder=join(root,'backups',String(Date.now()));mkdirSync(folder,{recursive:true});cpSync(file,join(folder,'database.dump'));if(existsSync(upload))cpSync(upload,join(folder,'uploads'),{recursive:true});writeFileSync(join(root,'last-backup.json'),JSON.stringify({folder,date:new Date().toISOString()}));console.log('Backup DB y adjuntos: '+folder);}
 else if(action==='restore'){
  const name='sierradirecta_restore_'+Date.now();const backup=JSON.parse(readFileSync(join(root,'last-backup.json'),'utf8'));run('createdb',[...args,name],{env});run('pg_restore',[...args,'-d',name,'--no-owner',join(backup.folder,'database.dump')],{env});if(existsSync(join(backup.folder,'uploads')))cpSync(join(backup.folder,'uploads'),join(root,'restored-files',name),{recursive:true});console.log('Restauración aislada: '+name);console.log(run('psql',[...args,'-d',name,'-tAc','SELECT count(*) FROM "Order"'],{env}));
 }
}
