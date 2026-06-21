/**
 * @fileoverview app.js — Bootstrap de la aplicación y Router SPA.
 *
 * Responsabilidades:
 * 1. Inicializar la app al cargar la página.
 * 2. Observar el estado de autenticación de Firebase al arrancar.
 * 3. Gestionar el enrutamiento basado en el hash de la URL (#/).
 * 4. Validar permisos de rol antes de renderizar cada vista.
 * 5. Mantener la Navbar actualizada en cada cambio de ruta.
 * 6. Ocultar la pantalla de carga inicial.
 *
 * Para agregar una nueva ruta:
 *   → Solo añadir una entrada al objeto RUTAS (una línea de código).
 *
 * @module app
 */

import AuthController   from './controllers/AuthController.js';
import AuthModel        from './models/AuthModel.js';

import Navbar           from './components/Navbar.js';
import Toast            from './components/Toast.js';
import DriveConnectionBubble from './components/DriveConnectionBubble.js';

import LoginView        from './views/LoginView.js';
import PublicoView      from './views/PublicoView.js';
import EstudianteView   from './views/EstudianteView.js';
import AdminView        from './views/AdminView.js';

import { ROLES }        from './config/collections.js';
import { i18n }         from './config/i18n.js';

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function actualizarFooterYear() {
  const yearEl = document.getElementById('footer-year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
}

// ─── TABLA DE RUTAS ───────────────────────────────────────────────────────
// Estructura: { handler: fn, rolRequerido: string|null }
// rolRequerido: null = público, 'estudiante'/'edil' = autenticado con ese rol
// Para agregar una nueva ruta → añadir una entrada aquí (una línea).
const RUTAS = {
  '#/login':    { handler: () => LoginView.render(),                     rolRequerido: null              },
  '#/inicio':   { handler: () => PublicoView.renderInicio(),             rolRequerido: null              },
  '#/noticias': { handler: () => PublicoView.renderNoticias(),           rolRequerido: null              },
  '#/eventos':  { handler: () => PublicoView.renderEventos(),            rolRequerido: null              },
  '#/contacto': { handler: () => PublicoView.renderContacto(),           rolRequerido: null              },
  '#/tramite':  { handler: () => EstudianteView.renderHistorial(),       rolRequerido: ROLES.ESTUDIANTE  },
  '#/tramite/nueva': { handler: () => EstudianteView.renderFormulario(), rolRequerido: ROLES.ESTUDIANTE  },
  '#/admin':    { handler: () => AdminView.renderDashboard(),            rolRequerido: ROLES.EDIL        },
  '#/publicar': { handler: () => AdminView.renderNoticias(),             rolRequerido: ROLES.EDIL        },
  '#/admin/noticias': { handler: () => AdminView.renderNoticias(),       rolRequerido: ROLES.EDIL        },
  '#/admin/eventos':  { handler: () => AdminView.renderEventos(),        rolRequerido: ROLES.EDIL        },
  '#/admin/tramites': { handler: () => AdminView.renderTramites(),       rolRequerido: ROLES.EDIL        },
};

// ─── VISTA DE ERROR 404 ───────────────────────────────────────────────────
function render404() {
  const root = document.getElementById('app-root');
  if (!root) return;
  root.innerHTML = `
    <div class="access-denied animate-fade-in">
      <div class="denied-icon">🗺️</div>
      <h1 class="h2 fw-800 mb-2">Página no encontrada</h1>
      <p class="text-muted mb-4">La ruta <code>${escHtml(window.location.hash || '#/')}</code> no existe.</p>
      <a href="#/inicio" class="btn-jal-primary">
        <i class="bi bi-house me-2"></i>Ir al Inicio
      </a>
    </div>
  `;
}

// ─── VISTA DE ACCESO DENEGADO ────────────────────────────────────────────
function renderAccesoDenegado() {
  const root = document.getElementById('app-root');
  if (!root) return;
  root.innerHTML = `
    <div class="access-denied animate-fade-in">
      <div class="denied-icon"><i class="bi bi-shield-lock-fill"></i></div>
      <h1 class="h2 fw-800 mb-2">${i18n.auth.accesoDenegado}</h1>
      <p class="text-muted mb-4">No tienes permisos para acceder a esta sección.</p>
      <a href="#/login" class="btn-jal-primary">
        <i class="bi bi-box-arrow-in-right me-2"></i>${i18n.auth.iniciarSesion}
      </a>
    </div>
  `;
}

// ─── ROUTER ───────────────────────────────────────────────────────────────

/**
 * Procesa la ruta actual del hash de la URL y renderiza la vista correcta.
 * Verifica permisos de rol antes de cada renderizado.
 * Soporta sub-rutas dinámicas como #/noticias/:id
 *
 * @returns {Promise<void>}
 */
async function procesarRuta() {
  const hash = window.location.hash || '#/inicio';

  // ─── Resolver ruta exacta o con parámetro ──────────────────────────
  let rutaKey    = hash;
  let params     = {};

  // Soporte para sub-ruta de detalle de noticia: #/noticias/:id
  const matchNoticia = hash.match(/^#\/noticias\/(.+)$/);
  if (matchNoticia) {
    rutaKey         = '#/noticias/:id';
    params.noticiaId = matchNoticia[1];
  }

  // ─── Verificar si la ruta existe ──────────────────────────────────
  const rutaConfig = RUTAS[rutaKey] || RUTAS[hash];

  if (!rutaConfig) {
    // Ruta con parámetro: detalle de noticia
    if (params.noticiaId) {
      actualizarNavbar(hash);
      mostrarApp();
      await PublicoView.renderNoticiaDetalle(params.noticiaId);
      return;
    }
    // Ruta desconocida → 404
    actualizarNavbar(hash);
    mostrarApp();
    render404();
    return;
  }

  const { handler, rolRequerido } = rutaConfig;
  const sesion = AuthModel.getSesion();

  // ─── Verificar permisos ────────────────────────────────────────────
  if (rolRequerido) {
    if (!sesion) {
      // No autenticado → redirigir a login
      Toast.advertencia('Debes iniciar sesión para acceder a esta sección.');
      window.location.hash = '#/login';
      return;
    }

    const tienePermiso = sesion.rol === rolRequerido;

    if (!tienePermiso) {
      actualizarNavbar(hash);
      mostrarApp();
      renderAccesoDenegado();
      return;
    }
  }

  // ─── Si está en login y ya está autenticado → redirigir ───────────
  if (hash === '#/login' && sesion) {
    window.location.hash = AuthController.getRutaPorRol(sesion.rol);
    return;
  }

  // ─── Renderizar vista ─────────────────────────────────────────────
  actualizarNavbar(hash);
  mostrarApp();

  try {
    await handler();
  } catch (err) {
    console.error('[Router] Error al renderizar vista:', err);
    Toast.error(i18n.app.errorGenerico);
  }
}

// ─── NAVBAR ───────────────────────────────────────────────────────────────

/**
 * Re-renderiza la navbar con el estado de sesión actual y la ruta activa.
 *
 * @param {string} rutaActual - Hash actual de la URL
 */
function actualizarNavbar(rutaActual) {
  const sesion = AuthModel.getSesion();
  Navbar.render({
    sesion,
    rutaActual,
    onLogout: async () => {
      await AuthController.logout({
        onSuccess: () => {
          Toast.info(i18n.auth.sesionCerrada);
          window.location.hash = '#/login';
        },
        onError: (msg) => Toast.error(msg),
      });
    },
  });
  DriveConnectionBubble.render({ sesion });
}

// ─── UI HELPERS ───────────────────────────────────────────────────────────

/**
 * Oculta la pantalla de carga y muestra el contenido principal.
 */
function mostrarApp() {
  const loading = document.getElementById('loading-screen');
  const root    = document.getElementById('app-root');
  const footer  = document.getElementById('app-footer');

  if (loading && !loading.classList.contains('d-none')) {
    loading.classList.add('fade-out');
    setTimeout(() => loading.classList.add('d-none'), 400);
  }

  root?.classList.remove('d-none');
  footer?.classList.remove('d-none');
}

// ─── INICIALIZACIÓN ───────────────────────────────────────────────────────

/**
 * Punto de entrada principal de la aplicación.
 * Suscribe el listener de autenticación de Firebase y configura el router.
 */
function iniciarApp() {
  actualizarFooterYear();

  // 1. Observar estado de autenticación (restaura sesión si ya existe)
  const unsubAuth = AuthController.iniciarListener(async (sesion) => {
    // Al cambiar el estado de auth → re-procesar la ruta actual
    await procesarRuta();
  });

  // 2. Escuchar cambios de hash (navegación SPA)
  window.addEventListener('hashchange', async () => {
    // Destruir componentes que puedan tener suscripciones activas
    try { AdminView.destruir(); }   catch (_) { /* view no montada */ }
    try { PublicoView.destruir(); } catch (_) { /* view no montada */ }

    await procesarRuta();
  });

  // 3. Si no hay hash inicial → redirigir a #/inicio
  if (!window.location.hash || window.location.hash === '#') {
    window.location.hash = '#/inicio';
  }

  // 4. Manejar cierre de la app (limpiar listeners)
  window.addEventListener('beforeunload', () => {
    unsubAuth();
    DriveConnectionBubble.destruir();
    try { AdminView.destruir(); }   catch (_) {}
    try { PublicoView.destruir(); } catch (_) {}
  });
}

// ─── ARRANQUE ─────────────────────────────────────────────────────────────
// El listener de Firebase onAuthStateChanged es asíncrono:
// muestra la pantalla de carga hasta que responde la primera vez.
// Esto evita el flash de contenido no autenticado (FOUC).

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciarApp);
} else {
  iniciarApp();
}

// Timeout de seguridad: si Firebase tarda >8s, mostrar la app de todas formas
setTimeout(() => {
  mostrarApp();
  if (!window.location.hash || window.location.hash === '#') {
    window.location.hash = '#/inicio';
  }
}, 8000);
