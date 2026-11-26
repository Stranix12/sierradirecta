import {ClipboardList,Users} from 'lucide-react';
type Row=Record<string,any>;
const money=(n:number)=>n.toLocaleString('es-EC',{minimumFractionDigits:2,maximumFractionDigits:2});
export function OrdersList({orders,role,filters,onFilter,onOpen}:{orders:Row[],role:string,filters:Row,onFilter:(filters:Row)=>void,onOpen:(order:Row)=>void}){
 const grouped=['lider','admin'].includes(role);
 const buyers=[...new Map(orders.map(o=>[o.buyerId,o.buyer])).entries()].sort((a,b)=>(a[1]?.name||'').localeCompare(b[1]?.name||'','es'));
 const visible=orders.filter(o=>(!filters.status||o.status===filters.status)&&(!filters.buyerId||o.buyerId===filters.buyerId));
 const groups=grouped?buyers.map(([id,buyer])=>({id,buyer,orders:visible.filter(o=>o.buyerId===id)})).filter(g=>g.orders.length):[{id:'own',buyer:null,orders:visible}];
 return <>
  <div className="filters"><label>Estado de pedidos<select aria-label="Estado de pedidos" value={filters.status||''} onChange={e=>onFilter({...filters,status:e.target.value})}><option value="">Todos los estados</option>{['pendiente','aceptado','en preparación','salió del campo','listo para entrega','entregado','rechazado','cancelado'].map(s=><option key={s}>{s}</option>)}</select></label>
   {grouped&&<label>Comprador<select aria-label="Filtrar comprador" value={filters.buyerId||''} onChange={e=>onFilter({...filters,buyerId:e.target.value})}><option value="">Todos los compradores</option>{buyers.map(([id,b])=><option key={id} value={id}>{b?.name||'Comprador'} · {b?.email||id.slice(0,8)}</option>)}</select></label>}
   <button className="secondary" onClick={()=>onFilter({})}>Limpiar filtros</button>
  </div>
  <p className="order-list-summary">{visible.length} pedido(s){grouped?` · ${groups.length} comprador(es)`:''}. Los más recientes aparecen primero dentro de cada grupo.</p>
  {orders.length>=200&&<p>Se muestran los 200 pedidos más recientes. Para consultar el histórico completo, utiliza Reportes.</p>}
  {groups.map(g=><section className="buyer-orders" key={g.id} data-buyer-id={g.id}>
   {grouped&&<header className="buyer-heading"><Users size={24}/><div><h2>{g.buyer?.name||'Comprador'}</h2><p>{[g.buyer?.organization,g.buyer?.email].filter(Boolean).join(' · ')}</p></div><span className="badge">{g.orders.length} pedido(s)</span></header>}
   <div className="order-list">{g.orders.map(o=><button className="order-card" key={o.id} onClick={()=>onOpen(o)}><span className="order-icon"><ClipboardList/></span><span><strong>Pedido #{o.id.slice(0,8)}</strong><small>{o.association.name} · {o.items.length} lote(s)</small></span><span className="badge">{o.status}</span><span><strong>${money(o.items.reduce((s:number,i:Row)=>s+Number(i.price)*Number(i.quantity),0))}</strong><small>Entrega: {new Date(o.deliveryDate).toLocaleDateString('es-EC',{timeZone:'America/Guayaquil'})}</small></span></button>)}</div>
  </section>)}
  {visible.length===0&&<div className="empty">{orders.length?'No hay pedidos con estos filtros.':'Aún no tienes pedidos.'}</div>}
 </>;
}
