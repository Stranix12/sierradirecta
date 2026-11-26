import express,{type Request,type Response,type NextFunction} from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import {randomBytes,randomUUID,createHash,timingSafeEqual} from 'node:crypto';
import {mkdir,writeFile,unlink} from 'node:fs/promises';
import path from 'node:path';
import {z} from 'zod';
import {Prisma,type User} from '@prisma/client';
import {db} from './db.js';
import {HttpError,requireThat,csvCell,states} from './domain.js';
import {audit,createOrder,transition,orderScope,orderInclude} from './orders.js';
import {listNotifications,notificationSummary,syncStockAlerts} from './notifications.js';
import {aiStatus} from './ai-provider.js';
import {extractHarvest,confirmHarvest,extractPurchase,proposePurchase,confirmPurchase} from './ai-workflows.js';
type Authed=Request & {user:User,csrf:string};
const text=z.string().trim().min(1).max(200);
const id=z.string().uuid();const date=z.iso.datetime();
const money=z.coerce.number().positive().max(99999999).refine(v=>Math.abs(v*100-Math.round(v*100))<0.000001,'Máximo dos decimales');
const reason=z.string().trim().min(3).max(500);
const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
const publicUser=(u:User)=>({id:u.id,name:u.name,email:u.email,role:u.role,associationId:u.associationId,organization:u.organization,contact:u.contact,active:u.active});
const asyncRoute=(fn:(req:Authed,res:Response)=>Promise<unknown>)=>(req:Request,res:Response,next:NextFunction)=>{Promise.resolve(fn(req as Authed,res)).catch(next);};
export const app=express();app.disable('x-powered-by');app.use(helmet());app.use(express.json({limit:'100kb'}));app.use(cookieParser());
if(process.env.RENDER==='true')app.set('trust proxy',1);
app.use('/api',(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
app.use('/api',async(req0,_res,next)=>{const req=req0 as Authed;try{
 const raw=req.cookies.sid;
 if(raw){const s=await db.session.findUnique({where:{id:hash(raw)},include:{user:true}});if(s&&s.expires>new Date()&&s.user.active){req.user=s.user;req.csrf=s.csrf;}}
 next();}catch(e){next(e);}});
app.use('/api',(req0,_res,next)=>{const req=req0 as Authed;try{
 if(!['GET','HEAD','OPTIONS'].includes(req.method)){
  const origin=req.get('origin');const allowed=process.env.ORIGIN||'http://127.0.0.1:4310';
  requireThat(origin===allowed,403,'Origen no permitido.');
  if(req.user){const supplied=Buffer.from(req.get('x-csrf-token')||'');const expected=Buffer.from(req.csrf);requireThat(supplied.length===expected.length&&timingSafeEqual(supplied,expected),403,'Sesión de formulario no válida.');}
 }
 next();}catch(e){next(e);}});
const auth=(req0:Request,_res:Response,next:NextFunction)=>{if(!(req0 as Authed).user)return next(new HttpError(401,'Inicie sesión para continuar.'));next();};
const roles=(...allowed:string[])=>(req0:Request,_res:Response,next:NextFunction)=>{if(!allowed.includes((req0 as Authed).user?.role))return next(new HttpError(403,'No tiene permiso.'));next();};
const loginLimit=rateLimit({windowMs:15*60*1000,limit:30,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Demasiados intentos; vuelva a intentar más tarde.'}});
async function session(res:Response,u:User){const token=randomBytes(32).toString('hex');const csrf=randomBytes(24).toString('hex');await db.session.create({data:{id:hash(token),csrf,userId:u.id,expires:new Date(Date.now()+8*3600000)}});res.cookie('sid',token,{httpOnly:true,sameSite:'strict',secure:process.env.ORIGIN?.startsWith('https:'),maxAge:8*3600000,path:'/'});return {user:publicUser(u),csrf};}
app.get('/api/health',asyncRoute(async(_q,r)=>{await db.$queryRaw`SELECT 1`;r.json({ok:true});}));
app.get('/api/me',asyncRoute(async(q,r)=>r.json({user:q.user?publicUser(q.user):null,csrf:q.csrf||null,demo:process.env.DEMO_MODE==='true'})));
app.post('/api/login',loginLimit,asyncRoute(async(q,r)=>{const b=z.object({email:z.email(),password:z.string().min(1).max(100)}).parse(q.body);const u=await db.user.findUnique({where:{email:b.email.toLowerCase()}});requireThat(u&&u.active&&await bcrypt.compare(b.password,u.password),401,'Correo o contraseña incorrectos.');r.json(await session(r,u));}));
app.post('/api/register',loginLimit,asyncRoute(async(q,r)=>{const b=z.object({name:text,email:z.email(),password:z.string().min(10).max(72),organization:text,contact:text}).strict().parse(q.body);const u=await db.user.create({data:{...b,email:b.email.toLowerCase(),password:await bcrypt.hash(b.password,12),role:'comprador'}});r.status(201).json(await session(r,u));}));
app.post('/api/logout',auth,asyncRoute(async(q,r)=>{await db.session.deleteMany({where:{id:hash(q.cookies.sid)}});r.clearCookie('sid',{path:'/'}).json({ok:true});}));
const aiMinute=rateLimit({windowMs:60000,limit:6,keyGenerator:q=>(q as Authed).user.id,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Espera un minuto antes de volver a interpretar.'}});
const aiDay=rateLimit({windowMs:86400000,limit:30,keyGenerator:q=>(q as Authed).user.id,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Llegaste al límite diario de interpretación. Puedes continuar manualmente.'}});
const aiText=z.object({text:z.string().trim().min(5).max(1500)}).strict();
app.get('/api/assistance/status',auth,roles('lider','comprador'),(_q,r)=>r.json(aiStatus()));
app.post('/api/assistance/harvest/interpret',auth,roles('lider'),aiMinute,aiDay,asyncRoute(async(q,r)=>r.json(await extractHarvest(q.user,aiText.parse(q.body).text))));
app.post('/api/assistance/purchase/interpret',auth,roles('comprador'),aiMinute,aiDay,asyncRoute(async(q,r)=>r.json(await extractPurchase(q.user,aiText.parse(q.body).text))));
app.post('/api/assistance/harvest/confirm',auth,roles('lider'),asyncRoute(async(q,r)=>{const b=z.object({draftId:id,fields:z.unknown(),confirmed:z.literal(true)}).strict().parse(q.body);r.status(201).json(await confirmHarvest(q.user,b.draftId,b.fields));}));
app.post('/api/assistance/purchase/propose',auth,roles('comprador'),asyncRoute(async(q,r)=>{const b=z.object({draftId:id,fields:z.unknown()}).strict().parse(q.body);r.json(await proposePurchase(q.user,b.draftId,b.fields));}));
app.post('/api/assistance/purchase/confirm',auth,roles('comprador'),asyncRoute(async(q,r)=>{const b=z.object({draftId:id,confirmation:z.unknown()}).strict().parse(q.body);r.status(201).json(await confirmPurchase(q.user,b.draftId,b.confirmation));}));
app.get('/api/lookups',asyncRoute(async(q,r)=>{const [associations,products,categories,markets,producers]=await Promise.all([db.association.findMany(),db.product.findMany({include:{category:true}}),db.category.findMany(),db.market.findMany(),q.user&&['lider','admin'].includes(q.user.role)?db.producer.findMany({where:q.user.role==='lider'?{associationId:q.user.associationId||'none'}:{}}):[]]);r.json({associations,products,categories,markets,producers});}));
app.get('/api/lots',asyncRoute(async(q,r)=>{
 const b=z.object({lotId:id.optional(),q:z.string().max(100).optional(),associationId:id.optional(),categoryId:id.optional(),locality:z.string().max(100).optional(),date:z.iso.date().optional(),mine:z.enum(['true']).optional(),page:z.coerce.number().int().min(1).default(1)}).parse(q.query);
 const where:Prisma.LotWhereInput={...(b.lotId?{id:b.lotId}:{}),...(!b.mine?{active:true,product:{active:true},producer:{active:true}}:{}),...(b.associationId?{associationId:b.associationId}:{}),...(b.categoryId?{product:{categoryId:b.categoryId,active:true}}:{}),...(b.q?{OR:[{product:{name:{contains:b.q,mode:'insensitive'}}},{variety:{contains:b.q,mode:'insensitive'}}]}:{}),...(b.locality?{association:{locality:{contains:b.locality,mode:'insensitive'}}}:{}),...(b.date?{available:{lte:new Date(b.date)}}:{})};
 if(b.mine){requireThat(q.user&&q.user.role==='lider',403,'Vista privada.');where.associationId=q.user.associationId||'none';}
 const [lots,total]=await Promise.all([db.lot.findMany({where,include:{association:true,product:{include:{category:true}}},orderBy:{created:'desc'},take:12,skip:(b.page-1)*12}),db.lot.count({where})]);r.json({items:lots.map(l=>({...l,availableKg:l.stock.minus(l.reserved).toString()})),total,page:b.page});
}));
const lotSchema=z.object({producerId:id,productId:id,variety:text,description:z.string().max(1000).default(''),stock:money,price:money,harvest:date,available:date,active:z.boolean().default(true),reason:reason.optional()});
app.post('/api/lots',auth,roles('lider'),asyncRoute(async(q,r)=>{const b=lotSchema.parse(q.body);requireThat(q.user.associationId,400,'El líder necesita asociación.');requireThat(new Date(b.harvest)<=new Date(b.available),400,'La cosecha no puede ser posterior a la disponibilidad.');const producer=await db.producer.findFirst({where:{id:b.producerId,associationId:q.user.associationId,active:true}});const product=await db.product.findFirst({where:{id:b.productId,active:true}});requireThat(producer&&product,400,'Productor o producto no válido.');const {reason:_reason,...data}=b;const lot=await db.$transaction(async tx=>{const l=await tx.lot.create({data:{...data,associationId:q.user.associationId!}});await audit(tx,q.user.id,'lote',l.id,'crear','Publicación',l);await syncStockAlerts(tx,l.id);return l;});r.status(201).json(lot);}));
app.patch('/api/lots/:id',auth,roles('lider'),asyncRoute(async(q,r)=>{const b=lotSchema.extend({stock:z.coerce.number().nonnegative().max(99999999).refine(v=>Math.abs(v*100-Math.round(v*100))<0.000001,'Máximo dos decimales')}).parse(q.body);requireThat(b.reason,400,'Indique motivo del cambio.');requireThat(new Date(b.harvest)<=new Date(b.available),400,'Fechas inválidas.');const lot=await db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM "Lot" WHERE id=${String(q.params.id)} FOR UPDATE`;const l=await tx.lot.findFirst({where:{id:String(q.params.id),associationId:q.user.associationId||'none'}});requireThat(l,404,'Lote no encontrado.');requireThat(new Prisma.Decimal(b.stock).gte(l.reserved),409,'La existencia no puede ser inferior a la reserva.');requireThat(b.producerId===l.producerId&&b.productId===l.productId,400,'El origen del lote no se puede sustituir.');const {reason:why,...data}=b;const updated=await tx.lot.update({where:{id:l.id},data});await audit(tx,q.user.id,'lote',l.id,'editar',why!,{before:l,after:updated});await syncStockAlerts(tx,l.id);return updated;});r.json(lot);}));
app.get('/api/references',asyncRoute(async(_q,r)=>r.json(await db.reference.findMany({include:{product:true,market:true},orderBy:{date:'desc'},take:200}))));
app.post('/api/references',auth,roles('precios','admin'),asyncRoute(async(q,r)=>{const b=z.object({productId:id,marketId:id,source:text,date,unit:text,kgPerUnit:z.coerce.number().positive().max(1000000),originalMin:money,originalMax:money}).parse(q.body);requireThat(b.originalMin<=b.originalMax,400,'El mínimo supera el máximo.');requireThat(new Date(b.date)<=new Date(),400,'La referencia no puede ser futura.');const result=await db.$transaction(async tx=>{const ref=await tx.reference.create({data:{...b,min:new Prisma.Decimal(b.originalMin).div(b.kgPerUnit),max:new Prisma.Decimal(b.originalMax).div(b.kgPerUnit)}});await audit(tx,q.user.id,'referencia',ref.id,'crear','Carga manual',ref);return ref;});r.status(201).json(result);}));
const orderSchema=z.object({key:z.string().min(8).max(100),address:text,deliveryDate:date,institution:z.string().max(200).default(''),responsible:z.string().max(200).default(''),pae:z.boolean().default(false),items:z.array(z.object({lotId:id,quantity:money})).min(1).max(30)});
app.post('/api/orders',auth,asyncRoute(async(q,r)=>{const b=orderSchema.parse(q.body);requireThat(new Date(b.deliveryDate)>=new Date(new Date().toISOString().slice(0,10)),400,'Fecha de entrega pasada.');requireThat(!b.pae||(b.institution&&b.responsible),400,'Complete institución y responsable.');r.status(201).json(await createOrder(q.user,b));}));
app.get('/api/orders',auth,roles('comprador','lider','admin'),asyncRoute(async(q,r)=>r.json(await db.order.findMany({where:orderScope(q.user),include:orderInclude,orderBy:{created:'desc'},take:200}))));
app.get('/api/orders/:id',auth,roles('comprador','lider','admin'),asyncRoute(async(q,r)=>{const o=await db.order.findFirst({where:{id:String(q.params.id),...orderScope(q.user)},include:orderInclude});requireThat(o,404,'Pedido no encontrado.');r.json(o);}));
app.post('/api/orders/:id/state',auth,asyncRoute(async(q,r)=>{const b=z.object({status:z.enum(states as [string,...string[]]),reason:z.string().max(500).default('')}).parse(q.body);r.json(await transition(q.user,String(q.params.id),b.status,b.reason));}));
app.post('/api/orders/:id/incidents',auth,roles('comprador','lider','admin'),asyncRoute(async(q,r)=>{const b=z.object({reason}).parse(q.body);const o=await db.order.findFirst({where:{id:String(q.params.id),...orderScope(q.user)}});requireThat(o,404,'Pedido no encontrado.');requireThat(['salió del campo','listo para entrega','entregado'].includes(o.status),409,'Use el flujo de cancelación o rechazo.');const result=await db.$transaction(async tx=>{const i=await tx.incident.create({data:{orderId:o.id,actorId:q.user.id,reason:b.reason}});await audit(tx,q.user.id,'incidencia',i.id,'crear',b.reason,i);return i;});r.status(201).json(result);}));
app.get('/api/notifications',auth,asyncRoute(async(q,r)=>r.json(await listNotifications(q.user,q.query))));
app.get('/api/notifications/summary',auth,asyncRoute(async(q,r)=>r.json(await notificationSummary(q.user))));
app.post('/api/notifications/:id/read',auth,asyncRoute(async(q,r)=>{const result=await db.notification.updateMany({where:{id:String(q.params.id),userId:q.user.id},data:{read:true}});requireThat(result.count,404,'Notificación no encontrada.');r.json({ok:true});}));
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1,fields:1}});
app.post('/api/orders/:id/attachments',auth,roles('comprador','lider','admin'),upload.single('file'),asyncRoute(async(q,r)=>{
 const o=await db.order.findFirst({where:{id:String(q.params.id),...orderScope(q.user)}});requireThat(o,404,'Pedido no encontrado.');const f=q.file;requireThat(f,400,'Seleccione un archivo.');const ext=path.extname(f.originalname).toLowerCase();
 const isPdf=f.buffer.subarray(0,5).toString()==='%PDF-';const isPng=f.buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));const isJpg=f.buffer[0]===255&&f.buffer[1]===216&&f.buffer[2]===255;
 const mime=isPdf&&ext==='.pdf'?'application/pdf':isPng&&ext==='.png'?'image/png':isJpg&&['.jpg','.jpeg'].includes(ext)?'image/jpeg':null;requireThat(mime,400,'Contenido o extensión de archivo no válido.');
 const kind=z.enum(['orden','comprobante','recepción']).parse(q.body.kind);
 if(process.env.ATTACHMENT_STORAGE==='database'){
  const a=await db.attachment.create({data:{orderId:o.id,name:path.basename(f.originalname).slice(0,200),mime,path:'database',kind,size:f.size,actorId:q.user.id,content:{create:{bytes:new Uint8Array(f.buffer)}}}});
  r.status(201).json({id:a.id,name:a.name});return;
 }
 const dir=path.resolve(process.env.UPLOAD_DIR||'.local/uploads');await mkdir(dir,{recursive:true});const filename=randomUUID()+ext;const target=path.join(dir,filename);await writeFile(target,f.buffer);
 try{const a=await db.attachment.create({data:{orderId:o.id,name:path.basename(f.originalname).slice(0,200),mime,path:filename,kind,size:f.size,actorId:q.user.id}});r.status(201).json({id:a.id,name:a.name});}catch(e){await unlink(target);throw e;}
}));
app.get('/api/attachments/:id',auth,roles('comprador','lider','admin'),asyncRoute(async(q,r)=>{const a=await db.attachment.findFirst({where:{id:String(q.params.id),order:orderScope(q.user)}});requireThat(a,404,'Archivo no encontrado.');r.set('Content-Type',a.mime);if(a.path==='database'){const content=await db.attachmentContent.findUnique({where:{attachmentId:a.id}});requireThat(content,404,'Archivo no encontrado.');r.attachment(a.name).type(a.mime).send(Buffer.from(content.bytes));return;}r.download(path.resolve(process.env.UPLOAD_DIR||'.local/uploads',a.path),a.name,{dotfiles:'allow'});}));
app.get('/api/reports',auth,roles('admin','lider','comprador'),asyncRoute(async(q,r)=>{
 const b=z.object({from:z.iso.date().optional(),to:z.iso.date().optional(),status:z.string().optional(),associationId:id.optional(),format:z.enum(['csv']).optional()}).parse(q.query);
 const where:Prisma.OrderWhereInput={AND:[orderScope(q.user),...(b.associationId?[{associationId:b.associationId}]:[]),...(b.status?[{status:b.status}]:[]),{created:{...(b.from?{gte:new Date(b.from)}:{}),...(b.to?{lt:new Date(new Date(b.to).getTime()+86400000)}:{})}}]};
 const orders=await db.order.findMany({where,include:{items:true,association:true},orderBy:{created:'desc'}});const rows=orders.map(o=>({id:o.id,association:o.association.name,status:o.status,date:o.created.toISOString(),kg:o.items.reduce((s,i)=>s.add(i.quantity),new Prisma.Decimal(0)).toString(),total:o.items.reduce((s,i)=>s.add(i.quantity.mul(i.price)),new Prisma.Decimal(0)).toFixed(2)}));
 if(b.format==='csv'){r.set('Content-Type','text/csv; charset=utf-8').attachment('sierradirecta-pedidos.csv').send('\uFEFF'+[['Pedido','Asociación','Estado','Fecha','kg','USD'],...rows.map(o=>Object.values(o))].map(row=>row.map(csvCell).join(',')).join('\r\n'));return;}
 const lots=await db.lot.count({where:q.user.role==='lider'?{associationId:q.user.associationId||'none'}:q.user.role==='admin'?{}:{id:{in:orders.flatMap(o=>o.items.map(i=>i.lotId))}}});
 r.json({rows,lots,deliveredKg:rows.filter(o=>o.status==='entregado').reduce((s,o)=>s.add(o.kg),new Prisma.Decimal(0)).toString()});
}));
const schemas={
 associations:z.object({name:text,locality:text,representative:text}),
 producers:z.object({name:text,community:text,associationId:id,active:z.boolean().default(true)}),
 categories:z.object({name:text}),
 products:z.object({name:text,categoryId:id,active:z.boolean().default(true)}),
 markets:z.object({name:text}),
 users:z.object({name:text,email:z.email(),role:z.enum(['admin','lider','comprador','precios']),associationId:id.nullable(),organization:z.string().max(200).default(''),contact:z.string().max(200).default(''),active:z.boolean(),password:z.string().min(10).max(72).optional()})
};
const models={associations:'association',producers:'producer',categories:'category',products:'product',markets:'market',users:'user'} as const;
app.get('/api/manage/:entity',auth,asyncRoute(async(q,r)=>{const entity=z.enum(['associations','producers','categories','products','markets','users']).parse(q.params.entity);requireThat(q.user.role==='admin'||(entity==='producers'&&q.user.role==='lider'),403,'No tiene permiso.');const rows=await (db[models[entity]] as any).findMany({where:entity==='producers'&&q.user.role==='lider'?{associationId:q.user.associationId||'none'}:{}});r.json(entity==='users'?rows.map(publicUser):rows);}));
for(const method of ['post','patch'] as const)app[method]('/api/manage/:entity'+(method==='patch'?'/:id':''),auth,asyncRoute(async(q,r)=>{
 const entity=z.enum(['associations','producers','categories','products','markets','users']).parse(q.params.entity);requireThat(q.user.role==='admin'||(entity==='producers'&&q.user.role==='lider'),403,'No tiene permiso.');
 const why=reason.parse(q.body.reason);const data:any=schemas[entity].parse(q.body);
 if(entity==='producers'&&q.user.role==='lider')requireThat(data.associationId===q.user.associationId,403,'Asociación no autorizada.');
 if(entity==='users'){
  if(data.role==='lider')requireThat(data.associationId,400,'El líder necesita asociación.');
  if(method==='post')requireThat(data.password,400,'Defina una contraseña inicial.');
  if(String(q.params.id)===q.user.id)requireThat(data.active&&data.role==='admin',400,'No puede desactivar su propio acceso administrativo.');
  if(data.password)data.password=await bcrypt.hash(data.password,12);data.email=data.email.toLowerCase();
 }
 const row=await db.$transaction(async tx=>{const model=(tx[models[entity]] as any);let before=null;
  if(method==='patch'){before=await model.findUnique({where:{id:String(q.params.id)}});requireThat(before,404,'Registro no encontrado.');if(entity==='producers'){requireThat(q.user.role==='admin'||before.associationId===q.user.associationId,403,'Asociación no autorizada.');requireThat(data.associationId===before.associationId,400,'No se puede transferir un productor con este formulario.');}}
  const result=method==='post'?await model.create({data}):await model.update({where:{id:String(q.params.id)},data});
  if(entity==='producers'||entity==='products'){const lots=await tx.lot.findMany({where:entity==='producers'?{producerId:result.id}:{productId:result.id},select:{id:true},orderBy:{id:'asc'}});for(const lot of lots)await syncStockAlerts(tx,lot.id);}
  await audit(tx,q.user.id,entity,result.id,method,why,{before:entity==='users'&&before?publicUser(before):before,after:entity==='users'?publicUser(result):result});return result;});
 r.json(entity==='users'?publicUser(row):row);
}));
app.get('/api/audit',auth,roles('admin'),asyncRoute(async(_q,r)=>r.json(await db.audit.findMany({orderBy:{created:'desc'},take:200}))));
app.use('/api',(_q,_r,next)=>next(new HttpError(404,'Ruta no encontrada.')));
app.use(express.static(path.resolve('dist'),{setHeaders:(r,p)=>{if(p.endsWith('sw.js')||p.endsWith('index.html'))r.setHeader('Cache-Control','no-cache');}}));
app.get('/{*path}',(_q,r)=>r.sendFile(path.resolve('dist/index.html')));
app.use((e:any,_q:Request,r:Response,_next:NextFunction)=>{if(e instanceof z.ZodError)return r.status(400).json({error:e.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; ')});if(e.code==='P2002')return r.status(409).json({error:'Ya existe un registro con esos datos.'});if(e.code==='P2003')return r.status(400).json({error:'Referencia relacionada no válida.'});if(e.code==='LIMIT_FILE_SIZE')return r.status(400).json({error:'El archivo supera 5 MB.'});const status=e instanceof HttpError?e.status:500;if(status===500)console.error(e);r.status(status).json({error:status===500?'Error interno. Intente nuevamente.':e.message});});
