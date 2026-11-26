import {app} from './app.js';
const port=Number(process.env.PORT||4310);
const host=process.env.RENDER==='true'?'0.0.0.0':'127.0.0.1';
if(process.env.RENDER==='true'&&!process.env.ORIGIN)process.env.ORIGIN=process.env.RENDER_EXTERNAL_URL;
if(process.env.RENDER==='true'&&!process.env.ORIGIN?.startsWith('https://'))throw Error('Configure ORIGIN con la URL HTTPS del servicio.');
app.listen(port,host,()=>console.log(`SierraDirecta escuchando en puerto ${port}`));
