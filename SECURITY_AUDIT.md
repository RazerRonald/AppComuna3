# Auditoría de Seguridad — JAL Comuna 3 Manrique

> Auditor: revisión senior de seguridad de aplicación · Fecha: 2026-07-16
> Alcance: código del repositorio (frontend SPA + funciones serverless + reglas Firestore). No se ejecutaron exploits reales ni se enviaron datos fuera del entorno.

---

## Fase 1 — RECON (Inventario)

### Stack
- **Frontend:** SPA en JavaScript vanilla (patrón MVC: `models/`, `views/`, `controllers/`), sin framework ni bundler. Módulos ES6 nativos.
- **Backend/BaaS:** Firebase — Authentication (Email/Password) + Cloud Firestore. SDK Firebase 10.12.2 cargado por CDN (gstatic, ESM).
- **Funciones serverless:** Vercel Functions en `/api` (Node.js, `module.exports = handler`).
- **Almacenamiento de documentos:** Google Drive API v3 vía OAuth 2.0 (GIS + gapi) — cartas barriales.
- **Hosting/CDN:** Vercel (`vercel.json`). Bootstrap 5.3.3 y Bootstrap Icons por CDN (con SRI).
- **UI libs vendorizadas:** PizZip + docxtemplater (generación de .docx).

### Superficie de red / endpoints
| Endpoint | Método | Auth | Función |
|---|---|---|---|
| `/api/admin-users` | PATCH, DELETE | Bearer idToken Firebase + verificación rol `edil` | Alta/edición/borrado de usuarios (Auth + perfil Firestore) vía service account |
| `/api/noticias-media` | GET | Ninguna (público) | Proxy/caché de imágenes de noticias desde Drive |
| Firestore (SDK directo) | R/W | Firebase Auth + Security Rules | `noticias`, `eventos`, `info_carta_inicial`, `info_carta_documentos`, `users`, `solicitudes_acceso` |
| Google Drive API | R/W | OAuth usuario (edil) | Subida/compartición de cartas |

### Autenticación y sesiones
- Firebase Auth Email/Password. Sesión en memoria (`_sesionActual` en `AuthModel`) + persistencia por defecto del SDK.
- Autorización por rol (`estudiante` | `edil`) leído del documento `users/{uid}` en Firestore.
- Endpoint admin re-valida el idToken con Identity Toolkit `accounts:lookup` y comprueba el rol en Firestore antes de operar.
- Firma JWT RS256 con service account para obtener token `cloud-platform` (server-side).

### Colecciones Firestore (modelo de datos)
- `users` — perfiles + rol.
- `noticias`, `eventos` — contenido público (lectura abierta, escritura edil).
- `info_carta_inicial` — trámites de carta barrial (estudiante crea; edil resuelve).
- `info_carta_documentos` — **colección privada** con enlaces reales de Drive (solo edil).
- `solicitudes_acceso` — solicitudes públicas de acceso (creación **sin autenticar**).

### Uploads
- No hay subida de archivos por parte de usuarios no confiables: el estudiante solo envía **datos de formulario**. El .docx lo genera y sube el **edil** con su propia sesión OAuth de Drive. Validación de tipo/tamaño (`.pdf`/`.docx`, 10 MB) definida en `DRIVE_CONFIG` (lado cliente). Permisos públicos de Drive se retiran tras subir (`_quitarPermisosPublicos`).

### Postura defensiva ya presente (positivo)
- Reglas Firestore robustas: whitelisting de campos (`hasOnly`/`hasAll`), validación de tipos, `diff().affectedKeys()` para restringir campos editables, separación de datos privados.
- Escape HTML (`_esc`) aplicado en las vistas que renderizan datos dinámicos (incluida la que muestra datos enviados por el público).
- Cabeceras de seguridad parciales en `vercel.json` (`X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP).
- Endpoint admin: whitelisting de campos de perfil, sin CORS comodín, `Cache-Control: no-store`.
- SRI en los `<script>`/`<link>` de Bootstrap por CDN.
- Secretos reales fuera del repo (`.env` en `.gitignore`; `.env.example` solo con placeholders).

---

## Fase 2/3 — Análisis y Reporte de hallazgos

> Severidad: 🔴 Crítica · 🟠 Alta · 🟡 Media · ⚪ Baja/Informativa
> PoC estrictamente conceptual.

---

### 🔴 F1 — Contraseña de usuario = número de documento (predecible + enviada en texto plano)
- **OWASP:** A07:2021 Identification & Authentication Failures
- **Ubicación:** [SolicitudAccesoController.js:138](js/controllers/SolicitudAccesoController.js#L138) (`const password = solicitud.numero_documento;`); envío en [SolicitudAccesoController.js:116-135](js/controllers/SolicitudAccesoController.js#L116); mínimo 6 en [admin-users.js:502](api/admin-users.js#L502).
- **Riesgo:** Al aprobar una solicitud, la cuenta del estudiante se crea con contraseña **igual a su número de documento**, un dato semipúblico y enumerable (aparece en registros, se comparte con terceros, y viaja en la propia solicitud). No hay cambio de contraseña forzado en el primer acceso. Además, la credencial se compone en un correo de Gmail **en texto plano** (usuario + "contraseña: {numero_documento}"). Un atacante que conozca correo + documento de una persona (combinación frecuentemente conocida) obtiene acceso directo a su cuenta.
- **PoC conceptual:** Conocido `email` y `numero_documento` de un estudiante → `signInWithEmailAndPassword(email, numero_documento)` autentica sin más. La contraseña es adivinable sin fuerza bruta.
- **Fix:**
  1. Generar contraseña **aleatoria** (p. ej. 16+ chars, `crypto`) al crear la cuenta.
  2. Forzar restablecimiento: enviar enlace de "restablecer contraseña" de Firebase en vez de una clave, o marcar `mustChangePassword` y exigir cambio en el primer login.
  3. No incluir contraseñas en el cuerpo del correo/URL.

---

### 🟠 F2 — Escritura pública sin autenticar ni rate-limiting en `solicitudes_acceso`
- **OWASP:** A04:2021 Insecure Design / A05 Security Misconfiguration
- **Ubicación:** [firestore.rules:653-655](firestore.rules#L653) (`allow create: if request.auth == null && solicitudAccesoCreacionValida(...)`); modelo [SolicitudAccesoModel.js:32](js/models/SolicitudAccesoModel.js#L32).
- **Riesgo:** Cualquier persona en Internet puede crear documentos en `solicitudes_acceso` sin autenticación. No existe rate-limiting, CAPTCHA ni Firebase App Check. Permite: (a) **abuso/DoS económico** (escrituras ilimitadas → costo Firestore y ruido en el panel del edil), y (b) **almacenamiento masivo de PII** (correo, nombre, tipo/número de documento, ciudad) provista por terceros no verificados, con implicaciones de privacidad.
- **PoC conceptual:** Script que llama repetidamente `addDoc(solicitudes_acceso, {...datos válidos...})` con datos aleatorios genera miles de solicitudes pendientes.
- **Fix:**
  1. Habilitar **Firebase App Check** (reCAPTCHA Enterprise) y exigirlo en Firestore (mitiga F2 y F3).
  2. Añadir rate-limiting/deduplicación (p. ej. rechazar duplicados por documento/correo en ventana temporal; considerar mover la creación a una función serverless con throttling).
  3. Minimizar PII almacenada mientras la solicitud está pendiente.

---

### 🟠 F3 — El flujo de aprobación por edil es evitable (auto-registro de perfil estudiante)
- **OWASP:** A01:2021 Broken Access Control (bypass de lógica de negocio)
- **Ubicación:** [firestore.rules:542-547](firestore.rules#L542) (`usuarioAutoCreadoEstudianteValido`) usada en `allow create` de `users` [firestore.rules:666-670](firestore.rules#L666).
- **Riesgo:** La premisa del sistema es que el acceso se otorga **solo tras aprobación de un edil**. Sin embargo, como el proveedor Email/Password está habilitado, cualquiera puede crear una cuenta de Firebase Auth directamente contra Identity Toolkit `signUp` con la API key web (pública), y luego, ya autenticado, **auto-crear su propio documento** `users/{uid}` con `rol: 'estudiante'` gracias a esta regla. Con ello obtiene acceso de estudiante (crear trámites `info_carta_inicial`, consumir tiempo del edil y recursos de Drive) **saltándose por completo** la cola de `solicitudes_acceso`.
- **PoC conceptual:** `signUp(email,pass)` (REST Identity Toolkit, API key pública) → autenticado → `setDoc(users/{uid}, {rol:'estudiante', ...datos propios...})` cumple `usuarioAutoCreadoEstudianteValido` → login válido.
- **Nota:** El impacto sobre datos ajenos es limitado (las reglas aíslan por `uid`); el daño principal es la creación no autorizada de cuentas y el bypass del control de acceso previsto.
- **Fix:**
  1. Habilitar **App Check** (ver F2) para que la API key no baste para `signUp`/escritura.
  2. Reevaluar si `usuarioAutoCreadoEstudianteValido` debe existir: si todo alta la hace el edil o el flujo de solicitudes, eliminar la rama de auto-creación y permitir `create` de `users` **solo** vía `usuarioCreadoPorEdilValido`.
  3. Considerar deshabilitar el registro público en Firebase Auth si no se usa self-service.

---

### 🟡 F4 — Política de contraseñas débil (mínimo 6, sin complejidad)
- **OWASP:** A07:2021
- **Ubicación:** [AuthController.js:304](js/controllers/AuthController.js#L304), [AuthController.js:192](js/controllers/AuthController.js#L192), [admin-users.js:502](api/admin-users.js#L502).
- **Riesgo:** Mínimo de 6 caracteres, sin requisitos de complejidad ni verificación contra contraseñas comprometidas. Facilita fuerza bruta/credential stuffing (agravado por F1).
- **PoC conceptual:** Contraseñas tipo `123456` son aceptadas.
- **Fix:** Elevar mínimo a 10-12, exigir mezcla básica, y/o activar la **protección de contraseñas** de Firebase Auth (política de contraseñas y detección de credenciales filtradas).

---

### 🟡 F5 — Faltan cabeceras Content-Security-Policy y HSTS
- **OWASP:** A05:2021 Security Misconfiguration
- **Ubicación:** [vercel.json:1-30](vercel.json#L1).
- **Riesgo:** Dado el uso intensivo de `innerHTML` en las vistas, una **CSP** es la defensa en profundidad clave frente a un eventual fallo de escape (XSS). También falta **Strict-Transport-Security** (HSTS) para forzar HTTPS y prevenir downgrade.
- **Fix:** Añadir `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` y una CSP (empezar en `report-only`) que permita solo los orígenes CDN necesarios (jsdelivr, gstatic, googleapis, accounts.google.com) y `script-src` sin `unsafe-inline` donde sea posible.

---

### 🟡 F6 — Ausencia de Firebase App Check (API key sin protección de abuso)
- **OWASP:** A05:2021 / A04:2021
- **Ubicación:** No hay `initializeAppCheck` en el proyecto ([firebase.config.js](js/config/firebase.config.js)); confirmado por búsqueda global.
- **Riesgo:** La API key web es pública por diseño, pero **sin App Check** cualquier cliente automatizado puede ejercer Auth y Firestore dentro de lo que permitan las reglas. Es el habilitador transversal de **F2** y **F3** y de enumeración/abuso general.
- **Fix:** Habilitar App Check (reCAPTCHA Enterprise para web) y exigirlo en Firestore y en Authentication.

---

### ⚪ F7 — Posible inyección CSS en `background-image: url('...')` (media de noticia)
- **OWASP:** A03:2021 Injection (impacto bajo)
- **Ubicación:** [PublicoView.js:689](js/views/PublicoView.js#L689) y [PublicoView.js:727](js/views/PublicoView.js#L727).
- **Riesgo:** `_esc` convierte `'` en `&#39;`; dentro de un atributo `style="..."` el parser HTML **decodifica** la entidad a `'` antes de que el motor CSS interprete `url('...')`, de modo que una comilla simple en `media_url` podría cerrar el `url()` e inyectar CSS. El valor proviene de Drive y está controlado por el edil (no por usuarios anónimos) y validado por reglas, por lo que el impacto real es bajo, pero es un patrón frágil.
- **Fix:** No interpolar URLs en CSS inline; asignar vía `element.style.backgroundImage = \`url("${CSS.escape ...}")\`` con `encodeURI`, o validar que la URL empiece por `https://`/`/api/` y no contenga comillas antes de renderizar.

---

### ⚪ F8 — Dependencias de terceros: SDK Firebase desactualizado / sin fijar, libs vendorizadas
- **OWASP:** A06:2021 Vulnerable & Outdated Components
- **Ubicación:** imports `https://www.gstatic.com/firebasejs/10.12.2/...` en múltiples módulos; `js/vendor/docxtemplater.js`, `js/vendor/pizzip.min.js`.
- **Riesgo:** Firebase 10.12.2 no es la última versión; conviene actualizar y monitorear CVEs de docxtemplater/pizzip vendorizados. `npm audit`/`pip audit` no aplican: **no hay dependencias de producción** (el único `package.json` con dependencias es `tests/responsive/`, herramientas de desarrollo no desplegadas).
- **Fix:** Actualizar el SDK a la última 10.x/11.x, fijar y revisar versiones de las libs vendorizadas, y documentar un proceso de actualización.

---

### ⚪ F9 — PII/credenciales en query string de la URL de Gmail
- **OWASP:** A04 / privacidad
- **Ubicación:** [SolicitudAccesoController.js:127-134](js/controllers/SolicitudAccesoController.js#L127).
- **Riesgo:** La URL de composición de Gmail incluye correo, y (por F1) la contraseña en el cuerpo. Aunque es una URL local del navegador del edil, refuerza el antipatrón de manejar credenciales en claro. Se resuelve al implementar F1.

---

## Resumen priorizado

| # | Severidad | Hallazgo | OWASP | Corrección principal |
|---|---|---|---|---|
| F1 | 🔴 Crítica | Contraseña = número de documento (predecible, en claro) | A07 | Password aleatoria + reset forzado |
| F2 | 🟠 Alta | Escritura pública sin auth ni rate-limit en `solicitudes_acceso` | A04/A05 | App Check + throttling |
| F3 | 🟠 Alta | Bypass del flujo de aprobación (auto-registro estudiante) | A01 | App Check + retirar auto-create en reglas |
| F4 | 🟡 Media | Política de contraseñas débil (min 6) | A07 | Política robusta / protección Firebase |
| F5 | 🟡 Media | Faltan CSP y HSTS | A05 | Añadir cabeceras |
| F6 | 🟡 Media | Sin Firebase App Check | A05/A04 | Habilitar App Check |
| F7 | ⚪ Baja | Inyección CSS en `url()` inline | A03 | Evitar URL en CSS inline |
| F8 | ⚪ Baja | SDK Firebase desactualizado / libs vendorizadas | A06 | Actualizar y fijar versiones |
| F9 | ⚪ Baja | Credenciales en URL de Gmail | A04 | Resuelto con F1 |

### Notas sobre acciones que requieren infraestructura (ACCIÓN MANUAL)
- **F6 / F2 / F3:** habilitar App Check y ajustar la política de registro son cambios en la **consola de Firebase/Google Cloud**, no solo en código.
- **F1:** si ya existen cuentas creadas con la contraseña = documento, deberán **rotarse** (forzar reset a los usuarios existentes).
- **F4:** la política de contraseñas de Firebase se activa en consola.

---

## Fase 4 — Estado: PENDIENTE DE APROBACIÓN

Este reporte corresponde a las Fases 1-3. **No he modificado código todavía.** Tras tu OK procederé con la Fase 4:
1. Crear rama `security/audit-fixes`.
2. Corregir por severidad en **commits separados** (los que sean de código: F1, F4 server/cliente, F5, F7, y endurecimiento de reglas para F3).
3. Marcar como **ACCIÓN MANUAL** lo que requiera consola/infra o rotación de secretos (App Check, política Firebase, rotación de contraseñas existentes).
