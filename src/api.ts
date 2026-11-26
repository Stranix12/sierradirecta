let csrf='';
export function setCsrf(value:string){csrf=value;}
export async function api(url:string,method='GET',body?:unknown):Promise<any>{
 const form=body instanceof FormData;let res:Response;
 try{res=await fetch('/api'+url,{method,credentials:'same-origin',headers:{...(!form&&body?{'Content-Type':'application/json'}:{}),...(method!=='GET'?{'x-csrf-token':csrf}:{})},body:body?form?body:JSON.stringify(body):undefined});}
 catch{throw new Error(['127.0.0.1','localhost'].includes(window.location.hostname)?'No se pudo conectar con SierraDirecta. Abre Iniciar.cmd en la carpeta del proyecto y vuelve a intentar.':'No se pudo conectar con SierraDirecta. Revisa tu conexión y vuelve a intentar.');}
 const data=await res.json();if(!res.ok)throw new Error(data.error||'No se pudo completar la operación.');return data;
}
