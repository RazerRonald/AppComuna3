/**
 * @fileoverview PerfilView - Vista de perfil autenticado en solo lectura.
 *
 * @module views/PerfilView
 */

import AuthModel from '../models/AuthModel.js';
import { i18n } from '../config/i18n.js';
import { ROLES } from '../config/collections.js';

const PerfilView = {
  render() {
    const root = document.getElementById('app-root');
    const sesion = AuthModel.getSesion();
    if (!root || !sesion) return;

    root.innerHTML = `
      <div class="page-hero">
        <div class="container">
          <nav aria-label="breadcrumb" class="page-hero-breadcrumb mb-2">
            <ol class="breadcrumb mb-0">
              <li class="breadcrumb-item"><a href="#/inicio" class="text-white-50">${i18n.nav.inicio}</a></li>
              <li class="breadcrumb-item active">${i18n.nav.perfil}</li>
            </ol>
          </nav>
          <h1><i class="bi bi-person-circle me-2"></i>${i18n.nav.perfil}</h1>
          <p class="page-hero-sub mb-0">${this._esc(sesion.nombre)}</p>
        </div>
      </div>

      <div class="container py-5">
        <div class="row justify-content-center">
          <div class="col-lg-8">
            <div class="form-jal">
              <div class="d-flex align-items-center gap-3 mb-4">
                <div class="stat-icon ${sesion.rol === ROLES.EDIL ? 'stat-icon-success' : 'stat-icon-primary'}">
                  <i class="bi ${sesion.rol === ROLES.EDIL ? 'bi-person-badge' : 'bi-mortarboard'}"></i>
                </div>
                <div>
                  <h2 class="h5 fw-700 mb-1">${this._esc(sesion.nombre)}</h2>
                  <span class="badge ${sesion.rol === ROLES.EDIL ? 'bg-success-subtle text-success-emphasis' : 'bg-primary-subtle text-primary-emphasis'}">
                    ${sesion.rol === ROLES.EDIL ? 'Edil' : 'Estudiante'}
                  </span>
                </div>
              </div>

              <div class="row g-3">
                ${this._buildDato(i18n.admin.usuariosNombre, sesion.nombre_perfil || sesion.nombre, 'bi-person')}
                ${this._buildDato(i18n.admin.usuariosPrimerApellido, sesion.primer_apellido, 'bi-person')}
                ${this._buildDato(i18n.admin.usuariosSegundoApellido, sesion.segundo_apellido, 'bi-person')}
                ${this._buildDato(i18n.admin.usuariosTipoDocumento, sesion.tipo_documento, 'bi-card-heading')}
                ${this._buildDato(i18n.admin.usuariosNumeroDocumento, sesion.numero_documento, 'bi-123')}
                ${this._buildDato(i18n.admin.usuariosCorreo, sesion.email, 'bi-envelope')}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  _buildDato(label, value, icon) {
    return `
      <div class="col-md-6">
        <div class="border rounded-2 p-3 h-100">
          <div class="text-muted small mb-1">
            <i class="bi ${icon} me-1"></i>${this._esc(label)}
          </div>
          <div class="fw-600">${this._esc(value || '-')}</div>
        </div>
      </div>
    `;
  },

  _esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },
};

export default PerfilView;
