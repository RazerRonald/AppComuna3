# Correcciones de auditoria y evidencia de pruebas

Fecha: 2026-09-08 (America/Bogota).
Base: `main` en `30c1c47`. Rama de trabajo: `codex/audit-recovery-abuse`.

## Estado

Los cuatro hallazgos tienen implementacion y pruebas locales. Esta entrega
incluye el codigo y las pruebas; el despliegue requiere configuracion adicional.
No se modificaron datos de produccion durante las pruebas. Para activar la proteccion se necesitan las variables de Turnstile,
las credenciales de servicio existentes, el despliegue de la aplicacion y la
publicacion separada de las reglas Firestore. Ver el procedimiento en README.md.

| Hallazgo | Correccion | Evidencia |
|---|---|---|
| 1. Cuenta creada sin aprobacion registrada | Reserva persistente en servidor, UID estable, cuenta inicialmente deshabilitada, transaccion conjunta de perfil/aprobacion, activacion posterior y reintento | Aprobaciones simultaneas, rechazo concurrente, perdida de respuesta Auth, fallo Firestore y fallo de activacion |
| 2. Abuso del formulario publico | Endpoint con validacion de Turnstile, dominio y accion; cuotas persistentes por IP y global; deduplicacion por correo/documento; bloqueo de escritura directa | CAPTCHA ausente/invalido/caducado, dominios/acciones incorrectos, cuotas y duplicados concurrentes/antiguos, denegacion de reglas |
| 3. Exito falso del envio de correo | Resultado independiente del alta, estado de correo y boton de reenvio con espera minima | Envio fallido conserva la cuenta, muestra advertencia y permite reenviar; usa el correo actual de Auth |
| 4. Auth y perfil desincronizados | Registro privado de intencion, exclusion de operaciones concurrentes, reintento de los mismos datos y boton de recuperacion; restauracion ante rechazos definitivos | Fallo Firestore tras cambio Auth, respuesta perdida, expiracion de reserva, bloqueo de otra edicion/eliminacion y recuperacion desde la UI |

## Resultados ejecutados

- `npm test`: **9/9** pruebas de validacion, CAPTCHA, IP, limites del cuerpo HTTP,
  respuestas JSON y servidor local.
- `npm run test:integration`: **22/22** pruebas con Firebase Auth y Firestore
  emulados; incluye permisos reales de reglas y autenticacion de endpoints.
- `npm run test:web`: **190/190** combinaciones de 19 rutas por 10 anchos:
  320, 375, 390, 414, 768, 820, 1024, 1280, 1440 y 1920 px.
  Sin desbordamiento horizontal, sin errores de ejecucion de pagina y sin
  solicitudes del navegador a los endpoints de datos de produccion bloqueados.
  Se esperan las transiciones entre anchos; se comprobo visualmente el formulario
  movil y se probo abrir/cerrar el menu lateral. No fue necesario modificarlo.
- Flujos funcionales: solicitud publica; CAPTCHA caducado e invalido; aprobacion;
  fallo y reenvio de correo; alta manual sin perder la sesion del Edil;
  edicion/eliminacion de usuario; recuperacion desde el modal; CRUD de noticias y
  eventos; registro y consulta de carta; cambio de contrasena; denegacion de rutas
  administrativas a estudiantes.
- Sintaxis e imports locales revisados sin errores; `git diff --check` correcto.
- `npm audit --omit=dev`: **0 vulnerabilidades** reportadas. Se fijo `uuid` 11.1.1
  mediante override porque una dependencia indirecta traia una version afectada.
- `npm audit` completo: **7 alertas moderadas** en herramientas de desarrollo
  indirectas de Firebase CLI (OpenTelemetry, csv-parse, qs y stream-json y sus
  dependientes). El arreglo automatico propone, entre otras cosas, una degradacion
  mayor de Firebase CLI; no se aplico ese cambio incompatible. No son dependencias
  de ejecucion de la aplicacion.

Las capturas y el JSON detallado estan en `reports/audit/` (ignorado por Git).
Las suites reproducibles quedan en `tests/security/`, `tests/integration/` y
`tests/web/`. Se amplio tambien el inventario de rutas de la suite responsive
anterior; su ejecucion con cuentas de produccion no fue necesaria ni se realizo.

### Seguimiento: HTML en lugar de JSON

Se corrigio la lectura de configuracion del CAPTCHA y de las respuestas de
solicitudes: se valida el tipo de contenido, el JSON y el contrato de exito. Una
pagina HTML con estado 200 ya no puede confundirse con un envio correcto. Los
errores se presentan con mensajes controlados. La prueba de navegador
`node tests/web/captcha-response.cjs` reproduce HTML 200, HTML 404 y JSON 503, sin
excepciones de pagina. Se incorporo `npm run dev` para ejecutar frontend y APIs
localmente; los servidores exclusivamente estaticos no sirven las funciones.

## Limites y decisiones

- Auth y Firestore son servicios independientes: puede existir un intervalo de
  inconsistencia si uno falla. El registro persistente permite terminar la misma
  operacion y la interfaz no declara exito completo cuando queda pendiente.
- Las contrasenas no se guardan en el registro de recuperacion. Si el cambio no
  se confirmo, se pide ingresarlas nuevamente. Un fallo de correo tampoco se
  interpreta como un fallo al crear la cuenta.
- Las reservas duran 120 segundos y los handlers tienen un maximo de 60 segundos.
  La recuperacion tras una caida espera el vencimiento para evitar dos trabajadores
  activos; no se permite sustituir los datos de una operacion pendiente.
- La entrega real en bandeja, Turnstile real, OAuth y subidas a Google Drive no
  se probaron. En el navegador se simularon esos proveedores; Auth, Firestore,
  reglas, vistas, controladores, modelos y endpoints se ejecutaron localmente.
- No se verificaron variables, permisos IAM ni reglas activas de produccion.
  Sin las claves de Turnstile el formulario nuevo falla cerrado; debe configurarse
  antes de publicarlo. No existe un modo sin CAPTCHA habilitable en produccion.
- Las pestañas de versiones anteriores deben recargarse al desplegar las reglas
  nuevas. Coordinar frontend, backend y reglas en una ventana de mantenimiento.
- La creacion manual de cuentas por Edil conserva la instancia secundaria de
  Firebase; las ediciones y eliminaciones pasan por el servidor para respetar las
  operaciones pendientes. Noticias, eventos y cartas conservan sus reglas.

## Referencias de implementacion

- [Firebase Admin: gestion de usuarios y cuentas deshabilitadas](https://firebase.google.com/docs/auth/admin/manage-users)
- [Turnstile: validacion obligatoria en servidor](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- [Vercel: cabeceras de peticion](https://vercel.com/docs/headers/request-headers)
- [Vercel: Node.js 24](https://vercel.com/changelog/node-js-24-lts-is-now-generally-available-for-builds-and-functions)
