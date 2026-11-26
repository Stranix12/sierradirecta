type Callbacks={onText:(text:string)=>void;onError:(message:string)=>void;onListening:(active:boolean)=>void};
export function speechError(code:string){
 const messages:Record<string,string>={
  'not-allowed':'El micrófono está bloqueado. Permite el micrófono para este sitio desde los permisos del navegador y vuelve a intentar.',
  'audio-capture':'No se detectó un micrófono disponible. Revisa que esté conectado y habilitado en el sistema.',
  'no-speech':'No se detectó voz. Acerca el micrófono y vuelve a iniciar el dictado.',
  'network':'El servicio de dictado del navegador no pudo conectarse. Esto puede ocurrir en Brave aunque tengas internet. Prueba el dictado en Google Chrome o escribe la solicitud.',
  'service-not-allowed':'Este navegador no permite utilizar su servicio de reconocimiento de voz. Prueba en Google Chrome o escribe la solicitud.',
  'language-not-supported':'El servicio de voz no admite el español configurado. Prueba en Google Chrome o escribe la solicitud.',
  'aborted':'El navegador interrumpió el dictado. Puedes iniciarlo de nuevo; el texto reconocido se conserva.'
 };
 return messages[code]||'El servicio de voz del navegador no pudo completar el dictado. Puedes volver a intentarlo o escribir; el texto se conserva.';
}
// El navegador controla su servicio de voz. Nunca se reinicia ni envía texto automáticamente.
export function createDictation(Speech:new()=>any,cb:Callbacks){
 const r=new Speech();let closed=false,stopping=false,received=false;const accepted=new Set<number>();
 let timer:ReturnType<typeof setTimeout>|undefined;
 const finish=()=>{if(closed)return;closed=true;clearTimeout(timer);cb.onListening(false);};
 r.lang='es-EC';r.interimResults=false;r.continuous=true;
 r.onstart=()=>{if(!closed){clearTimeout(timer);cb.onListening(true);}};
 r.onresult=(event:any)=>{
  if(closed)return;
  const parts:string[]=[];
  for(let i=event.resultIndex??0;i<event.results.length;i++){
   const result=event.results[i];
   if(result.isFinal===false||accepted.has(i))continue;
   const text=result[0]?.transcript?.trim();if(text){accepted.add(i);parts.push(text);received=true;}
  }
  if(parts.length)cb.onText(parts.join(' '));
 };
 r.onerror=(event:any)=>{if(closed)return;if(!(stopping&&event.error==='aborted'))cb.onError(speechError(event.error));finish();};
 r.onend=()=>{if(!closed&&!received&&!stopping)cb.onError('El dictado terminó sin texto. Revisa el micrófono; si ocurre inmediatamente en Brave, prueba en Google Chrome.');finish();};
 return {
  start(){
   if(closed)return;cb.onListening(true);
   timer=setTimeout(()=>{if(closed)return;cb.onError('El servicio de voz no respondió. Prueba en Google Chrome o escribe la solicitud.');finish();r.abort();},12000);
   try{r.start();}catch(e){cb.onError(speechError(e instanceof Error&&e.name==='NotAllowedError'?'not-allowed':'start-failed'));finish();}
  },
  stop(){if(closed)return;stopping=true;clearTimeout(timer);try{r.stop();timer=setTimeout(finish,2000);}catch{finish();}},
  abort(){if(closed)return;stopping=true;finish();r.onresult=null;r.onerror=null;r.onend=null;r.onstart=null;r.abort();}
 };
}
