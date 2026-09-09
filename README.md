# AppComuna3

Aplicativo web de la JAL Comuna 3 para publicar noticias/eventos y gestionar cartas de labor social de estudiantes.

## Componentes principales

- Frontend estatico: `index.html`, `css/main.css`, `js/`.
- Firebase Auth: inicio de sesion de estudiantes y Ediles.
- Firestore: usuarios, noticias, eventos y solicitudes de cartas.
- Google Drive API: almacenamiento privado de cartas y contenido multimedia de noticias.
- Vercel API: proxy de imagenes de noticias en `api/noticias-media.js`.

## Configuracion manual

### Firebase Auth

En Firebase Console > Authentication > Settings > Authorized domains:

- Agregar el dominio de Vercel.
- Mantener los dominios locales que uses para pruebas.

### Google Cloud OAuth

En Google Cloud Console > OAuth Client:

- Agregar el dominio de Vercel en Authorized JavaScript origins.
- Mantener los origenes locales exactos si haces pruebas locales, por ejemplo `http://localhost:5500` y `http://127.0.0.1:5500`.
- Si el navegador bloquea la ventana de Google, permitir ventanas emergentes para el sitio.

### Google Drive

Los IDs de carpetas se configuran en `js/config/firebase.config.js`:

- `DRIVE_CONFIG.FOLDER_ID`: carpeta privada de tramites estudiantiles.
- `DRIVE_CONFIG.CONTENT_FOLDER_ID`: carpeta independiente de contenido de noticias.
- `DRIVE_CONFIG.TRAMITES_SHARE_EMAIL`: correo que recibe acceso a carpetas privadas de tramites.

Recomendacion actual:

- Carpeta de tramites: restringida.
- Carpeta `ContenidoJAL`: restringida.
- Archivos multimedia de cada noticia: publicos como lector, porque los consume el proxy/las vistas publicas.

### Vercel

Configurar variables de entorno en Vercel > Project Settings > Environment Variables:

```env
FIREBASE_PROJECT_ID=jal3-fd8a2
FIREBASE_WEB_API_KEY=tu_api_key_web_de_firebase
FIREBASE_SERVICE_ACCOUNT={"client_email":"...","private_key":"-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"}
```

Nota: `FIREBASE_WEB_API_KEY` la usa el proxy desde servidor. Si se restringe solo por HTTP referrer, el proxy puede fallar.

`FIREBASE_SERVICE_ACCOUNT` solo se usa en servidor para que `/api/admin-users` pueda actualizar correo y contrasena de usuarios en Firebase Auth y sincronizar el perfil en Firestore. Alternativamente se pueden configurar `GOOGLE_CLIENT_EMAIL` y `GOOGLE_PRIVATE_KEY`.

### Firestore Rules

`firestore.rules` no se despliega por Vercel. Si cambian reglas, publicarlas aparte desde Firebase Console o Firebase CLI.

## Flujos operativos

### Noticias

1. El Edil crea una noticia con titulo, contenido y una imagen/video.
2. Firestore guarda titulo, cuerpo y metadatos.
3. Drive guarda el archivo en la carpeta de la noticia dentro de `ContenidoJAL`.
4. Las imagenes publicas se sirven mediante `/api/noticias-media?id=...&v=...`.
5. Si se reemplaza la imagen, cambia la version `v` para evitar cache vieja.

### Eventos

1. El Edil crea evento con titulo, lugar, descripcion, fecha de inicio y fecha de fin.
2. Firestore valida que la fecha de fin sea posterior a la inicial.
3. La vista publica permite buscar eventos y agregarlos a calendario.

### Cartas de estudiantes

1. El estudiante solicita una carta barrial.
2. Firestore registra la solicitud como pendiente.
3. El Edil revisa, rechaza la carta inicial o expide la carta.
4. Para carta expedida, el estudiante puede solicitar carta de finalizacion.
5. El Edil expide la finalizacion; el estudiante solo ve el aviso para recogerla.
6. Las cartas se guardan en Drive dentro de una subcarpeta por estudiante.

### Gestion de usuarios por Edil

1. El Edil entra al Panel Admin y abre `Gestionar Usuarios`.
2. El formulario crea cuentas de estudiantes o ediles en Firebase Auth usando una instancia secundaria, para no cambiar la sesion activa del Edil.
3. Firestore guarda `users/{uid}` con `rol`, `nombre`, `primer_apellido`, `segundo_apellido`, `tipo_documento`, `numero_documento` y `ciudad_documento`.
4. La tabla de usuarios permite editar perfiles y ver el total de estudiantes registrados.
5. Si se cambia correo o contrasena, la app llama `/api/admin-users`; este endpoint requiere credenciales de servicio en Vercel.

## Checklist antes de despliegue final

- Publicar `firestore.rules` si fueron modificadas.
- Confirmar dominio de Vercel en Firebase Auth.
- Confirmar dominio de Vercel en Google OAuth.
- Confirmar variables de entorno de Vercel.
- Probar conexion Drive con usuario Edil.
- Crear, editar y eliminar una noticia con imagen.
- Reemplazar imagen de una noticia y confirmar que cambia en la vista publica.
- Crear, editar y eliminar un evento.
- Buscar noticias y eventos desde vista publica y perfil Edil.
- Solicitar carta inicial como estudiante.
- Rechazar una carta inicial como Edil.
- Expedir carta inicial como Edil.
- Solicitar y expedir carta de finalizacion.
- Confirmar que el estudiante no puede ver enlaces de cartas aprobadas.
- Crear un usuario estudiante desde Panel Admin y confirmar que el Edil no pierde la sesion.
- Crear un usuario Edil desde Panel Admin.
- Editar datos de perfil de un estudiante.
- Confirmar que la ciudad de expedicion del documento se ve en perfil y se usa en solicitudes de carta.
- Intentar modificar desde DevTools los datos personales de una solicitud; Firestore debe rechazar valores que no coincidan con `users/{uid}`.
- Editar correo o contrasena de un usuario con `/api/admin-users` configurado.

## Recuperacion de cuentas y proteccion de solicitudes

Para trabajar localmente con las APIs, usar `npm run dev` y abrir
`http://127.0.0.1:3000`. Este servidor carga las variables de `.env` si existe
y ejecuta los mismos handlers de Vercel. `JAL_DEV_PORT` permite cambiar el puerto.
Live Server y otros servidores exclusivamente estaticos no ejecutan `/api/*`:
pueden devolver HTML, incluso con estado 200, donde el formulario espera JSON.
La interfaz detecta esa respuesta y muestra indisponibilidad, sin aceptar un envio.
El servidor local usa la configuracion Firebase de la aplicacion; para pruebas
aisladas usar las suites con emuladores descritas mas abajo.

Los endpoints administrativos ahora usan Firebase Admin SDK y un registro privado
de operaciones en Firestore. Las credenciales de servicio existentes siguen siendo
compatibles. La cuenta de servicio necesita permisos para gestionar usuarios de
Firebase Auth y leer/escribir Firestore. Todas las ediciones de perfil pasan por
`/api/admin-users`; la creacion manual de usuarios por un Edil conserva su flujo.

Las solicitudes publicas pasan por `/api/access-requests`. Ya no se admite escritura
directa desde el navegador. Se valida Turnstile en el servidor, incluyendo dominio
y accion, y se limita a 5 intentos validos por IP/hora y 200 diarios para el proyecto.
Los duplicados por correo o documento reciben la misma confirmacion sin crear otra
solicitud. Las solicitudes antiguas se comprueban tambien, sin migracion obligatoria.

Para activar estos cambios en un despliegue:

1. Crear un widget Turnstile para los dominios autorizados y configurar
   `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` y `TURNSTILE_HOSTNAMES` en Vercel.
   Las vistas previas necesitan su propio dominio autorizado o un dominio de prueba
   estable. No usar claves de prueba en produccion.
2. Confirmar `FIREBASE_SERVICE_ACCOUNT` (o sus dos variables alternativas),
   `FIREBASE_PROJECT_ID` y `FIREBASE_WEB_API_KEY`.
3. Desplegar primero el backend y frontend nuevos, comprobar la configuracion y
   publicar inmediatamente las reglas de este cambio con Firebase CLI o consola.
   Durante el intervalo las reglas anteriores siguen admitiendo el flujo viejo:
   la proteccion no se considera activa hasta publicar las reglas nuevas. Las
   pestañas antiguas deben recargarse. Coordinar en una ventana de mantenimiento.
4. Validar solicitud, aprobacion, recuperacion, correo y edicion de perfil con
   cuentas de prueba propias del entorno. Firebase Rules no se publica con Vercel.
5. Opcional: habilitar TTL sobre `expiresAt` en `access_limits` para retirar los
   contadores vencidos. El vencimiento de la cuota no depende del proceso TTL.

Si falta Turnstile, el formulario muestra indisponibilidad y no acepta envios sin
proteccion. El resto del sitio sigue disponible. Las claves nunca se guardan en Git.
Si el sitio tiene otro proxy delante de Vercel, comprobar la IP recibida para evitar
que varios visitantes compartan una cuota inesperadamente.

### Recuperacion operativa

- **Reintentar acceso:** retoma la cuenta reservada, inicialmente deshabilitada,
  sin generar otro UID. El perfil y la aprobacion se guardan juntos antes de activar
  la cuenta. Una solicitud en proceso no puede rechazarse.
- **Reenviar correo de contrasena:** solo envia el restablecimiento; no crea otra
  cuenta. Hay un minuto de espera entre intentos. "Enviado" confirma la aceptacion
  de la solicitud por Firebase, no la entrega en la bandeja del destinatario.
- **Recuperar actualizacion:** en el formulario de edicion, retoma exactamente los
  datos de la operacion pendiente. Un cambio nuevo o una eliminacion se bloquea
  mientras exista una actualizacion incompleta. Las contrasenas no se guardan en
  el registro: si no se confirmaron, deben ingresarse nuevamente.
- Tras una interrupcion abrupta, esperar dos minutos para recuperar. Los handlers
  tienen un maximo de 60 segundos y la reserva dura 120 segundos. No aumentar el
  tiempo de ejecucion de Vercel sin ajustar y probar esta relacion.
- No borrar manualmente `access_operations` o `user_operations` pendientes: son la
  evidencia necesaria para recuperar resultados inciertos. Los historiales
  completados contienen datos personales; aplicar la politica de retencion del
  proyecto. `access_duplicates` contiene hashes y referencias, no correos en claro.

### Pruebas aisladas

Requiere Node 24, Java 21+ y Chromium de Playwright:

```powershell
npm ci
npx playwright install chromium
npm test
npx firebase emulators:start --only auth,firestore --project demo-jal-audit --config firebase.test.json
# En otra terminal, con los emuladores activos:
npm run test:integration
npm run test:web
npm audit --omit=dev
```

La suite web sirve el proyecto en `127.0.0.1:5501`, sustituye la configuracion de
Firebase exclusivamente en el servidor de pruebas, conecta las instancias primaria
y secundaria a emuladores y bloquea accesos del navegador a datos de produccion.
CAPTCHA, Google OAuth y envio de correo se simulan solo en las pruebas. Las capturas
y los resultados se guardan en `reports/audit/`. No se prueba subida real a Drive,
entrega real de correo ni configuracion de Vercel con estas suites.
