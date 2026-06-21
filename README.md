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
- Mantener `http://localhost` si haces pruebas locales.
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
```

Nota: `FIREBASE_WEB_API_KEY` la usa el proxy desde servidor. Si se restringe solo por HTTP referrer, el proxy puede fallar.

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

