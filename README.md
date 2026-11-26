# SierraDirecta

Aplicación web adaptable para comercialización agrícola directa. React/TypeScript, Express, PostgreSQL y Prisma. Construida localmente con Codex a partir del plan y Figma; no desplegada externamente.

## Abrir en este equipo

1. Ejecutar `Iniciar.cmd` o `node scripts/start.mjs` desde esta carpeta.
2. Abrir http://127.0.0.1:4310.
3. Consultar `.local/demo-access.txt` para las cuentas de demostración y su contraseña generada. El archivo es privado, no se incluye en el código compartido.

Usuarios: `lider@sierra.test`, `lider2@sierra.test`, `comprador@sierra.test`, `comprador2@sierra.test`, `precios@sierra.test`, `admin@sierra.test`.

Los datos y precios son ficticios. Los pedidos de pruebas E2E se identifican por su variedad `E2E-...` y permanecen para conservar evidencia. Sus ofertas se desactivaron al terminar las pruebas. `npx tsx scripts/archive-demo-tests.ts` permite volver a ocultarlas después de otro ensayo, sin borrar pedidos. Ninguna operación ejecuta pagos ni contacta instituciones.

## Instalación reproducible en otro equipo

Requiere Node.js 22.23 o una LTS compatible, npm y PostgreSQL 17. Los binarios portátiles locales no forman parte de la entrega. No es necesario cambiar la política de PowerShell: usar `npm.cmd` en Windows si `npm.ps1` está bloqueado.

```text
npm ci
```

Copiar `.env.example` a `.env`, crear una base vacía `sierradirecta` y un usuario propio de PostgreSQL, y configurar `DATABASE_URL`. No apuntar a bases ajenas. Definir `ORIGIN=http://127.0.0.1:4310`. Para datos ficticios de la demo, definir `DEMO_MODE=true`.

```text
npm run db:generate
npm run db:migrate
npm run db:seed
npm run build
npm start
```

En Linux, esos mismos comandos funcionan con PostgreSQL instalado; no usar `Iniciar.cmd`. Para Docker, definir `POSTGRES_PASSWORD` y ejecutar `docker compose up -d db`; ajustar la URL al puerto 55439. Esta alternativa está preparada, pero Docker no estaba instalado en el equipo de validación.

La demo local utiliza un clúster independiente en `.local/pgdata`, puerto 55439, usuario `sierra` y contraseña aleatoria. `npm run db:start` y `npm run db:stop` administran solo ese clúster. El script portable requiere los binarios en `.local/pgsql/bin` o `PG_BIN`. No descarga ni instala PostgreSQL automáticamente.

## Desarrollo

`npm run dev` reinicia la API al editar. `npm run web` abre Vite en 5173; al usar esa vista, definir `ORIGIN=http://127.0.0.1:5173` en la API. La demo normal usa el build y un solo origen en 4310. Después de cambiar la interfaz, ejecutar build y recargar.

## Verificación

Resultados comprobados: `docs/verificacion.md`. Material para presentar: `docs/guion-video.md`, `docs/manual.md`, `docs/matriz-requisitos.md` y `docs/bitacora-codex.md`. La presentación editable de diez diapositivas se entrega en el chat y se puede exportar a PowerPoint desde su visor.

```text
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium firefox
npm run test:e2e
npx tsx scripts/benchmark.ts
npm audit
```

Las pruebas de integración cambian explícitamente a `sierradirecta_test`: crear esa base con el mismo propietario antes de ejecutarlas en otra instalación. Nunca reinician ni vacían la base de demostración. Las E2E usan cuentas y datos de demostración de `.local/demo-access.txt`; crean pedidos reales de prueba en la demo. Chrome debe estar instalado; Edge se prueba solo si se detecta instalado. El benchmark usa 20 contextos Chromium con limitación de 5 Mbps por contexto y 50 ms de latencia sobre 5.000 lotes sintéticos en la base de pruebas.

## Estructura

- `src/`: interfaz y cliente HTTP.
- `server/app.ts`: API, validaciones y permisos.
- `server/orders.ts`: transacciones de pedidos e inventario.
- `server/domain.ts`: matriz de estados y exportación CSV segura.
- `prisma/`: esquema y migraciones con restricciones.
- `scripts/`: seed, arranque, copias y medición.
- `tests/`: lógica, API sobre PostgreSQL y recorridos de navegador.
- `docs/`: decisiones, manuales, matriz, exposición y evidencias.

## Copias de seguridad

`npm run backup` genera un volcado PostgreSQL y copia los adjuntos en `.local/backups/<fecha>`. `npm run restore:test` restaura la última copia en una nueva base con nombre `sierradirecta_restore_<fecha>` y una carpeta de archivos separada. No sobrescribe la demo. Definir `PG_BIN` si las herramientas PostgreSQL no están en `.local/pgsql/bin`.

El procedimiento fue comprobado localmente. No se ha configurado una tarea diaria del servidor ni se ha demostrado un RPO de producción: el calendario de copias y retención deberá establecerse con el docente.

## Límites de la entrega

Aplicación académica local. Sin pagos, licencias comerciales, IA para publicar cosechas, scraping de precios, facturación electrónica, SMS/WhatsApp ni conexión oficial PAE. La fase 2 está en `docs/decisiones.md`. Faltan validación con cinco usuarios reales, condiciones operativas del servidor y comprobación de disponibilidad/HTTPS en ese entorno. No confundir localhost con un sitio accesible desde el teléfono: el servidor está ligado a 127.0.0.1 por diseño.

Los pedidos, referencias y notificaciones tienen límites de consulta (200/200/100) en esta versión; los reportes consultan todo el período y el catálogo está paginado. Para un piloto prolongado debe añadirse paginación a esos historiales.

## Licencias

Inter: SIL Open Font License, copia en `public/fonts/OFL.txt`. Lucide: ISC, distribuido mediante npm. Las dependencias y sus versiones están fijadas en `package-lock.json`. Los iconos de cultivos son emoji del sistema y pueden variar según el dispositivo.

## Avisos y navegación actualizados

Centro de notificaciones con categorías, importancia, lectura, fechas y paginación. Contadores de avisos y solicitudes pendientes con actualización cada 10 segundos. Alertas de disponibilidad por lote (10 kg o menos), historial persistente y enlaces al pedido o cosecha. Página principal pública al salir y catálogo de consulta para roles que no compran. Ver docs/notificaciones.md.

Al actualizar una instalación existente: aplicar db:generate y db:migrate, ejecutar npx tsx scripts/sync-stock-alerts.ts, reconstruir la interfaz y reiniciar la API.

## Organización de pedidos

Los pedidos del líder y del administrador se agrupan por comprador, con filtro combinado de comprador y estado. Ver pedido abre una vista individual y Volver a pedidos conserva los filtros. La identidad del comprador aparece en el detalle y la API solo selecciona los campos necesarios del perfil. El comprador mantiene acceso únicamente a sus propias solicitudes.

## IA para cosechas y compras

Cosecha con IA permite al líder interpretar texto o dictado, revisar y publicar. Compra con IA permite al comprador revisar necesidades, obtener propuestas de una o varias asociaciones y confirmar pedidos separados. Los asistentes antiguos de consultas no se restauran. Véase `docs/ia-flujos.md`.

Verificación del 25 de noviembre de 2026: 64 pruebas de lógica/API y 33 de navegador aprobadas; consultas reales de Gemini y restauración de copia local comprobadas. El servidor del profesor no se ha desplegado.
