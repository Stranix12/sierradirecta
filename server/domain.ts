export const states = ['pendiente','aceptado','en preparación','salió del campo','listo para entrega','entregado','rechazado','cancelado'];
export function canTransition(role:string,current:string,next:string):boolean {
 if(role==='comprador') return (current==='pendiente' && next==='cancelado') || (current==='listo para entrega' && next==='entregado');
 if(role!=='lider') return false;
 return ({pendiente:['aceptado','rechazado'],aceptado:['en preparación','cancelado'],'en preparación':['salió del campo','cancelado'],'salió del campo':['listo para entrega']} as Record<string,string[]>)[current]?.includes(next) ?? false;
}
export function csvCell(value:unknown) {let v=String(value ?? ''); if(/^[\s]*[=+@\-\t\r]/.test(v)) v="'"+v; return '"'+v.replaceAll('"','""')+'"';}
export class HttpError extends Error {constructor(public status:number,message:string){super(message);}}
export function requireThat(condition:unknown,status:number,message:string):asserts condition {if(!condition) throw new HttpError(status,message);}
