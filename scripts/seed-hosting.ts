import 'dotenv/config';
if(process.env.SEED_DEMO==='true'){
 if(!process.env.DEMO_PASSWORD||process.env.DEMO_PASSWORD.length<16)throw Error('Configure DEMO_PASSWORD de al menos 16 caracteres.');
 const target=new URL(process.env.DATABASE_URL||'');
 if(['127.0.0.1','localhost','::1'].includes(target.hostname))throw Error('El seed de hosting no puede usar la base local.');
 await import('./seed.js');
}
