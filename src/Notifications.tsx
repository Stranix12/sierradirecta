import {useEffect,useRef,useState} from 'react';
import {Bell,ClipboardList,PackageCheck,RefreshCw} from 'lucide-react';
import {api} from './api';

const empty={unread:0,important:0,pendingOrders:0,lowStock:0,latest:null as string|null};
export function useNotifications(userId?:string){
 const [summary,setSummary]=useState({...empty,userId:''}),[error,setError]=useState('');
 const [revision,setRevision]=useState(0);
 useEffect(()=>{
  if(!userId)return;
  let active=true,running=false;
  async function load(){
   if(running||!navigator.onLine)return;running=true;
   try{const result=await api('/notifications/summary');if(active){setSummary({...result,userId});setError('');}}
   catch{if(active)setError('No pudimos actualizar los avisos. Se reintentará automáticamente.');}
   finally{running=false;}
  }
  void load();const timer=window.setInterval(()=>void load(),10000);
  window.addEventListener('focus',load);window.addEventListener('online',load);
  return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',load);window.removeEventListener('online',load);};
 },[userId,revision]);
 return {summary:userId&&summary.userId===userId?summary:empty,error:userId?error:'',refresh:()=>setRevision(n=>n+1)};
}

type Notice={id:string,message:string,category:string,priority:string,created:string,read:boolean,resolved:boolean,orderId:string|null,lotId:string|null};
type Result={items:Notice[],total:number,page:number};
const initial={category:'',priority:'',read:'',from:'',to:'',page:'1'};
const stamp=(s:string)=>new Date(s).toLocaleString('es-EC',{timeZone:'America/Guayaquil',dateStyle:'medium',timeStyle:'short'});
export function Notifications({onOpen,onChange}:{onOpen:(n:Notice)=>void,onChange:()=>void}){
 const [filters,setFilters]=useState(initial),[result,setResult]=useState<Result|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[revision,setRevision]=useState(0);
 const sequence=useRef(0);
 const query=new URLSearchParams(Object.entries(filters).filter(([,v])=>v!=='')).toString();
 useEffect(()=>{
  let active=true,running=false;const token=++sequence.current;
  async function load(background=false){
   if(running)return;running=true;if(!background)setLoading(true);
   try{const data=await api('/notifications?'+query);if(active&&token===sequence.current){setResult(data);setError('');}}
   catch(e:any){if(active)setError(e.message);}finally{running=false;if(active)setLoading(false);}
  }
  void load();const timer=setInterval(()=>void load(true),10000);
  return()=>{active=false;clearInterval(timer);};
 },[query,revision]);
 function filter(key:string,value:string){setFilters(f=>({...f,[key]:value,page:'1'}));}
 async function mark(items:Notice[]){
  setSaving(true);setError('');
  try{await Promise.all(items.filter(n=>!n.read).map(n=>api('/notifications/'+n.id+'/read','POST')));onChange();setRevision(n=>n+1);}
  catch(e:any){setError(e.message);}finally{setSaving(false);}
 }
 return <section className="notification-center" aria-label="Centro de notificaciones">
  <div className="info-banner"><Bell/><div><strong>Pedidos y cosechas, en un solo lugar</strong><p>Se actualiza cada 10 segundos. Los avisos leídos permanecen en el historial. Poca existencia: 10 kg disponibles o menos, descontando reservas.</p></div></div>
  <div className="filters">
   <label>Categoría<select value={filters.category} onChange={e=>filter('category',e.target.value)}><option value="">Todas</option><option value="pedidos">Pedidos</option><option value="inventario">Inventario</option><option value="precios">Precios</option></select></label>
   <label>Importancia<select value={filters.priority} onChange={e=>filter('priority',e.target.value)}><option value="">Todas</option><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option></select></label>
   <label>Lectura<select value={filters.read} onChange={e=>filter('read',e.target.value)}><option value="">Todas</option><option value="false">Sin leer</option><option value="true">Leídas</option></select></label>
   <label>Desde<input type="date" value={filters.from} onChange={e=>filter('from',e.target.value)}/></label>
   <label>Hasta<input type="date" value={filters.to} onChange={e=>filter('to',e.target.value)}/></label>
   <button className="secondary" onClick={()=>setFilters(initial)}>Limpiar filtros</button>
  </div>
  <div className="notification-tools"><span>{result?.total??0} notificaciones · Hora de Ecuador</span><div><button className="secondary" disabled={loading} onClick={()=>{setRevision(n=>n+1);onChange();}}><RefreshCw size={16}/>Actualizar</button><button className="secondary" disabled={saving||loading||!result?.items.some(n=>!n.read)} onClick={()=>void mark(result?.items||[])}>Marcar página como leída</button></div></div>
  {error&&<div className="alert error" role="alert">{error}</div>}
  {loading&&<p role="status">Actualizando notificaciones…</p>}
  <div className="records" aria-busy={loading}>{result?.items.map(n=><article className={'record notification '+(!n.read?'unread':'')} key={n.id}>
   {n.category==='inventario'?<PackageCheck/>:<ClipboardList/>}
   <div><div className="notification-tags"><span className="badge">{n.category==='inventario'?'Inventario':n.category==='precios'?'Precios':'Pedidos'}</span><span className={'priority '+n.priority}>Importancia {n.priority}</span><span>{n.read?'Leída':'Sin leer'}</span>{n.resolved&&<span>Resuelta</span>}</div><strong>{n.message}</strong><small>{stamp(n.created)}</small></div>
   <div className="notification-actions">{(n.orderId||n.lotId)&&<button className="secondary" onClick={()=>onOpen(n)}>{n.orderId?'Ver pedido':'Ver cosecha'}</button>}{!n.read&&<button className="text-button" disabled={saving} onClick={()=>void mark([n])}>Marcar leída</button>}</div>
  </article>)}</div>
  {!loading&&result?.items.length===0&&<div className="empty">No hay notificaciones con estos filtros.</div>}
  <div className="pagination"><button className="secondary" disabled={loading||Number(filters.page)<=1} onClick={()=>setFilters(f=>({...f,page:String(Number(f.page)-1)}))}>Anterior</button><span>Página {filters.page}</span><button className="secondary" disabled={loading||Number(filters.page)*25>=(result?.total||0)} onClick={()=>setFilters(f=>({...f,page:String(Number(f.page)+1)}))}>Siguiente</button></div>
 </section>;
}
