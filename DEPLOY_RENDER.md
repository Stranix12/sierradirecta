# SierraDirecta: copia para hosting

Esta copia se despliega de forma independiente del proyecto y la base locales de presentación.

## Render

- Web Service, repositorio Stranix12/sierradirecta, rama main.
- Runtime Node, plan Free. Root Directory vacío.
- Build: `npm ci --include=dev && npm run db:generate && npm run build`
- Start: `npm run start:hosting`
- Health check: `/api/health`

Variables privadas en Render:

| Nombre | Valor |
| --- | --- |
| DATABASE_URL | Cadena PostgreSQL de Neon, con SSL; nunca la base local |
| ATTACHMENT_STORAGE | database |
| DEMO_MODE | true |
| SEED_DEMO | true |
| DEMO_PASSWORD | Contraseña nueva de al menos 16 caracteres para las cuentas de demostración |
| GEMINI_API_KEY | Opcional, clave privada de Gemini |
| GEMINI_MODEL | gemini-3.5-flash-lite |

ORIGIN se obtiene de RENDER_EXTERNAL_URL automáticamente; si se configura un dominio propio, establecer ORIGIN con su URL HTTPS exacta, sin barra final. El seed crea datos ficticios solo si no existen usuarios. Después del primer arranque correcto, desactivar SEED_DEMO y retirar DEMO_PASSWORD. No restablece contraseñas de usuarios existentes.

Los adjuntos de hasta 5 MB se guardan en una tabla separada de PostgreSQL, con los mismos permisos por pedido. No dependen del disco temporal de Render. Esta solución es para la demostración: vigilar el almacenamiento de Neon; para uso masivo conviene almacenamiento de objetos. No subir .env, credenciales, respaldos, documentos académicos con datos personales ni la base local a GitHub.

Antes de compartir el enlace: verificar salud, inicio de sesión, pedido comprador → líder, transición «salió del campo», adjuntos tras reinicio e IA si se configuró la clave. La publicación no se considera comprobada hasta completar estas pruebas en el dominio real. El plan gratuito puede suspender el servicio por inactividad y tardar en responder al primer acceso.
