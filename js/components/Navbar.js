/**
 * @fileoverview Navbar — Componente de barra de navegación dinámica según rol.
 * Renderiza diferentes navbars según el estado de sesión:
 * - Sin sesión: links públicos + botón de login
 * - Estudiante: + Mi Trámite + dropdown de perfil
 * - Edil: + Panel Admin + Publicar + dropdown de perfil
 *
 * @module components/Navbar
 */

import { i18n } from '../config/i18n.js';
import { ROLES } from '../config/collections.js';

/**
 * @typedef {Object} NavbarConfig
 * @property {import('../models/AuthModel.js').SesionUsuario|null} sesion - Sesión activa o null
 * @property {string} rutaActual - Hash de la ruta activa (para marcar active)
 * @property {function(): void} onLogout - Callback para cerrar sesión
 */

const Navbar = {
  /**
   * Renderiza la navbar en el elemento #app-navbar según el rol de la sesión.
   *
   * @param {NavbarConfig} config
   * @returns {void}
   */
  render({ sesion, rutaActual = '', onLogout }) {
    const container = document.getElementById('app-navbar');
    if (!container) return;

    container.innerHTML = this._buildHTML(sesion, rutaActual, onLogout);
    this._bindEvents(sesion, onLogout);
    this._marcarActivo(rutaActual);
  },

  /**
   * Construye el HTML completo de la navbar.
   *
   * @private
   * @param {Object|null} sesion
   * @param {string}      rutaActual
   * @returns {string} HTML de la navbar
   */
  _buildHTML(sesion, rutaActual) {
    const linksPublicos = `
      <li class="nav-item">
        <a class="nav-link" href="#/inicio" id="nav-inicio" aria-label="Inicio">
          <i class="bi bi-house-door me-1"></i>${i18n.nav.inicio}
        </a>
      </li>
      <li class="nav-item">
        <a class="nav-link" href="#/noticias" id="nav-noticias" aria-label="Noticias">
          <i class="bi bi-newspaper me-1"></i>${i18n.nav.noticias}
        </a>
      </li>
      <li class="nav-item">
        <a class="nav-link" href="#/eventos" id="nav-eventos" aria-label="Eventos">
          <i class="bi bi-calendar-event me-1"></i>${i18n.nav.eventos}
        </a>
      </li>
      <li class="nav-item">
        <a class="nav-link" href="#/contacto" id="nav-contacto" aria-label="Contacto">
          <i class="bi bi-person-lines-fill me-1"></i>${i18n.nav.contacto}
        </a>
      </li>
    `;

    let linksExtra   = '';
    let accionDerecha = '';

    if (!sesion) {
      // ─── Sin sesión ────────────────────────────────────────────────
      accionDerecha = `
        <a href="#/login" class="btn-nav-login nav-link" id="nav-login" aria-label="Iniciar sesión">
          <i class="bi bi-box-arrow-in-right me-1"></i>${i18n.nav.iniciarSesion}
        </a>
      `;
    } else if (sesion.rol === ROLES.ESTUDIANTE) {
      // ─── Estudiante ───────────────────────────────────────────────
      linksExtra = `
        <li class="nav-item">
          <a class="nav-link" href="#/tramite" id="nav-tramite" aria-label="Mi trámite">
            <i class="bi bi-file-earmark-text me-1"></i>${i18n.nav.miTramite}
          </a>
        </li>
      `;
      accionDerecha = this._buildDropdownPerfil(sesion, 'estudiante');
    } else if (sesion.rol === ROLES.EDIL) {
      // ─── Edil ─────────────────────────────────────────────────────
      linksExtra = `
        <li class="nav-item">
          <a class="nav-link" href="#/admin" id="nav-admin" aria-label="Panel de administración">
            <i class="bi bi-speedometer2 me-1"></i>${i18n.nav.panelAdmin}
          </a>
        </li>
        <li class="nav-item">
          <a class="nav-link" href="#/publicar" id="nav-publicar" aria-label="Publicar noticia">
            <i class="bi bi-plus-circle me-1"></i>${i18n.nav.publicar}
          </a>
        </li>
      `;
      accionDerecha = this._buildDropdownPerfil(sesion, 'edil');
    }

    return `
      <nav class="navbar navbar-jal navbar-expand-lg" aria-label="Navegación principal">
        <div class="container">
          <!-- Brand -->
          <a class="navbar-brand" href="#/inicio" aria-label="${i18n.app.nombreCompleto}">
            <i class="bi bi-building-fill-check"></i>
            JAL Manrique
            <span class="brand-badge">C3</span>
          </a>

          <!-- Toggler móvil -->
          <button class="navbar-toggler border-0"
                  type="button"
                  data-bs-toggle="collapse"
                  data-bs-target="#navbarMain"
                  aria-controls="navbarMain"
                  aria-expanded="false"
                  aria-label="Alternar navegación">
            <span class="navbar-toggler-icon"></span>
          </button>

          <!-- Links -->
          <div class="collapse navbar-collapse" id="navbarMain">
            <ul class="navbar-nav me-auto mb-2 mb-lg-0">
              ${linksPublicos}
              ${linksExtra}
            </ul>

            <!-- Acción derecha -->
            <div class="d-flex align-items-center gap-2 mt-2 mt-lg-0">
              ${accionDerecha}
            </div>
          </div>
        </div>
      </nav>
    `;
  },

  /**
   * Construye el dropdown de perfil para usuarios autenticados.
   *
   * @private
   * @param {Object} sesion
   * @param {'edil'|'estudiante'} tipo
   * @returns {string} HTML del dropdown
   */
  _buildDropdownPerfil(sesion, tipo) {
    const badgeClass  = tipo === 'edil' ? 'role-badge-edil' : 'role-badge-estudiante';
    const badgeTexto  = tipo === 'edil' ? 'Edil' : 'Estudiante';
    const iniciales   = this._obtenerIniciales(sesion.nombre);

    return `
      <div class="dropdown">
        <button class="btn d-flex align-items-center gap-2 text-white border-0 p-0"
                type="button"
                id="dropdownPerfil"
                data-bs-toggle="dropdown"
                aria-expanded="false"
                aria-label="Menú de perfil">
          <div style="
            width:34px;height:34px;border-radius:50%;
            background:linear-gradient(135deg,var(--color-primary),var(--color-primary-light));
            display:flex;align-items:center;justify-content:center;
            font-size:0.75rem;font-weight:700;color:white;flex-shrink:0;
          ">${iniciales}</div>
          <div class="d-none d-lg-flex flex-column align-items-start">
            <span style="font-size:0.8rem;font-weight:600;color:white;line-height:1.2;">${sesion.nombre}</span>
            <span class="role-badge ${badgeClass}">${badgeTexto}</span>
          </div>
          <i class="bi bi-chevron-down text-white-50" style="font-size:0.7rem;"></i>
        </button>

        <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="dropdownPerfil">
          <li>
            <span class="dropdown-item-text text-white-50" style="font-size:0.75rem;padding:0.4rem 1rem;">
              ${sesion.email}
            </span>
          </li>
          <li><hr class="dropdown-divider" style="border-color:rgba(255,255,255,.1);margin:0.25rem 0;"></li>
          ${tipo === 'edil' ? `
          <li>
            <a class="dropdown-item" href="#/admin" id="dropdown-admin">
              <i class="bi bi-speedometer2 me-2"></i>${i18n.nav.panelAdmin}
            </a>
          </li>` : `
          <li>
            <a class="dropdown-item" href="#/tramite" id="dropdown-tramite">
              <i class="bi bi-file-earmark-text me-2"></i>${i18n.nav.miTramite}
            </a>
          </li>`}
          <li><hr class="dropdown-divider" style="border-color:rgba(255,255,255,.1);margin:0.25rem 0;"></li>
          <li>
            <button class="dropdown-item text-danger-emphasis" id="btn-logout-nav" type="button">
              <i class="bi bi-box-arrow-right me-2"></i>${i18n.nav.cerrarSesion}
            </button>
          </li>
        </ul>
      </div>
    `;
  },

  /**
   * Obtiene las iniciales de un nombre completo.
   *
   * @private
   * @param {string} nombre
   * @returns {string} 1 o 2 caracteres de iniciales
   */
  _obtenerIniciales(nombre) {
    if (!nombre) return '?';
    const partes = nombre.trim().split(' ').filter(Boolean);
    if (partes.length === 1) return partes[0][0].toUpperCase();
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
  },

  /**
   * Registra los event listeners de la navbar (logout, etc.).
   *
   * @private
   * @param {Object|null}  sesion
   * @param {function}     onLogout
   */
  _bindEvents(sesion, onLogout) {
    const btnLogout = document.getElementById('btn-logout-nav');
    if (btnLogout && onLogout) {
      btnLogout.addEventListener('click', () => onLogout());
    }
  },

  /**
   * Marca el link activo según la ruta actual.
   *
   * @private
   * @param {string} rutaActual - Hash actual (ej: '#/noticias')
   */
  _marcarActivo(rutaActual) {
    // Remover activos anteriores
    document.querySelectorAll('.navbar-jal .nav-link').forEach((el) => {
      el.classList.remove('active');
      el.removeAttribute('aria-current');
    });

    // Mapa de rutas a IDs de link
    const mapaRutas = {
      '#/inicio':    'nav-inicio',
      '#/noticias':  'nav-noticias',
      '#/eventos':   'nav-eventos',
      '#/contacto':  'nav-contacto',
      '#/tramite':   'nav-tramite',
      '#/admin':     'nav-admin',
      '#/publicar':  'nav-publicar',
    };

    // Buscar match parcial (para sub-rutas como #/noticias/abc123)
    let idActivo = null;
    for (const [ruta, id] of Object.entries(mapaRutas)) {
      if (rutaActual === ruta || rutaActual.startsWith(ruta + '/')) {
        idActivo = id;
        break;
      }
    }

    if (idActivo) {
      const el = document.getElementById(idActivo);
      if (el) {
        el.classList.add('active');
        el.setAttribute('aria-current', 'page');
      }
    }
  },

  /**
   * Actualiza solo el marcado activo sin re-renderizar la navbar completa.
   * Útil cuando el router cambia de ruta sin cambio de sesión.
   *
   * @param {string} rutaActual
   */
  actualizarActivo(rutaActual) {
    this._marcarActivo(rutaActual);
  },
};

export default Navbar;
