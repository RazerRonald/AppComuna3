/**
 * @fileoverview Toast — Componente de notificaciones tipo toast de Bootstrap.
 * Reutilizable, configurable por tipo y mensaje.
 * Solo renderiza HTML e interactúa con Bootstrap Toast API.
 *
 * @module components/Toast
 */

import { i18n } from '../config/i18n.js';

/**
 * @typedef {'success'|'error'|'warning'|'info'} ToastTipo
 */

/** Mapa de iconos por tipo de toast */
const ICONOS = {
  success: 'bi-check-circle-fill',
  error:   'bi-x-circle-fill',
  warning: 'bi-exclamation-triangle-fill',
  info:    'bi-info-circle-fill',
};

/** Mapa de títulos por tipo de toast */
const TITULOS = {
  success: i18n.toast.exito,
  error:   i18n.toast.error,
  warning: i18n.toast.advertencia,
  info:    i18n.toast.info,
};

/** Mapa de colores de icono por tipo */
const COLORES_ICONO = {
  success: 'text-success',
  error:   'text-danger',
  warning: 'text-warning',
  info:    'text-info',
};

const Toast = {
  /**
   * Muestra un toast de notificación al usuario.
   *
   * @param {Object}    opciones
   * @param {string}    opciones.mensaje         - Texto del cuerpo del toast
   * @param {ToastTipo} [opciones.tipo='info']   - Tipo de toast
   * @param {string}    [opciones.titulo]        - Título personalizado (opcional)
   * @param {number}    [opciones.duracion=4000] - Duración en ms antes de cerrar
   * @returns {void}
   */
  mostrar({ mensaje, tipo = 'info', titulo, duracion = 4000 }) {
    const container = document.getElementById('toast-container');
    if (!container) {
      console.warn('[Toast] No se encontró #toast-container');
      return;
    }

    const id        = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const icono     = ICONOS[tipo]      || ICONOS.info;
    const tituloFin = titulo            || TITULOS[tipo] || TITULOS.info;
    const colorIcon = COLORES_ICONO[tipo] || 'text-info';

    const toastEl = document.createElement('div');
    toastEl.id              = id;
    toastEl.className       = `toast toast-jal toast-${tipo} align-items-start`;
    toastEl.setAttribute('role',        'alert');
    toastEl.setAttribute('aria-live',   'assertive');
    toastEl.setAttribute('aria-atomic', 'true');

    toastEl.innerHTML = `
      <div class="toast-header">
        <i class="bi ${icono} ${colorIcon} me-2 fs-5"></i>
        <strong class="me-auto">${tituloFin}</strong>
        <button type="button"
                class="btn-close btn-close-sm ms-2"
                data-bs-dismiss="toast"
                aria-label="Cerrar"
                id="${id}-close">
        </button>
      </div>
      <div class="toast-body">${mensaje}</div>
    `;

    container.appendChild(toastEl);

    // Inicializar con Bootstrap Toast API
    const bsToast = new window.bootstrap.Toast(toastEl, {
      autohide: true,
      delay:    duracion,
    });

    bsToast.show();

    // Limpiar el DOM al ocultar
    toastEl.addEventListener('hidden.bs.toast', () => {
      toastEl.remove();
    });
  },

  /**
   * Shorthand para toast de éxito.
   *
   * @param {string} mensaje
   * @param {string} [titulo]
   * @returns {void}
   */
  exito(mensaje, titulo) {
    this.mostrar({ mensaje, tipo: 'success', titulo });
  },

  /**
   * Shorthand para toast de error.
   *
   * @param {string} mensaje
   * @param {string} [titulo]
   * @returns {void}
   */
  error(mensaje, titulo) {
    this.mostrar({ mensaje, tipo: 'error', titulo });
  },

  /**
   * Shorthand para toast de advertencia.
   *
   * @param {string} mensaje
   * @param {string} [titulo]
   * @returns {void}
   */
  advertencia(mensaje, titulo) {
    this.mostrar({ mensaje, tipo: 'warning', titulo });
  },

  /**
   * Shorthand para toast informativo.
   *
   * @param {string} mensaje
   * @param {string} [titulo]
   * @returns {void}
   */
  info(mensaje, titulo) {
    this.mostrar({ mensaje, tipo: 'info', titulo });
  },
};

export default Toast;
