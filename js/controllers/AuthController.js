/**
 * @fileoverview AuthController — Orquesta autenticación entre AuthModel y vistas.
 * Recibe eventos del LoginView, llama a AuthModel y actualiza la vista con el resultado.
 * No toca Firebase directamente; no renderiza HTML.
 *
 * @module controllers/AuthController
 */

import AuthModel from '../models/AuthModel.js';
import { ROLES } from '../config/collections.js';
import { i18n }  from '../config/i18n.js';

const AuthController = {
  /**
   * Procesa el intento de inicio de sesión del usuario.
   * Valida los campos, llama al AuthModel y maneja el resultado.
   *
   * @param {string}   email      - Correo electrónico ingresado
   * @param {string}   password   - Contraseña ingresada
   * @param {Object}   callbacks  - Funciones de callback para actualizar la vista
   * @param {function} callbacks.onLoading  - Llamada al iniciar la carga (bool)
   * @param {function} callbacks.onSuccess  - Llamada con { sesion } al autenticar
   * @param {function} callbacks.onError    - Llamada con mensaje de error (string)
   * @returns {Promise<void>}
   */
  async login(email, password, { onLoading, onSuccess, onError }) {
    if (!email?.trim() || !password?.trim()) {
      onError(i18n.auth.errorCredenciales);
      return;
    }

    onLoading(true);

    try {
      const sesion = await AuthModel.login(email.trim(), password);
      onSuccess(sesion);
    } catch (err) {
      console.error('[AuthController.login]', err);
      const mensaje = this._mapearErrorFirebase(err.code);
      onError(mensaje);
    } finally {
      onLoading(false);
    }
  },

  /**
   * Cierra la sesión del usuario y redirige al login.
   *
   * @param {Object}   callbacks
   * @param {function} callbacks.onSuccess - Llamada al cerrar sesión
   * @param {function} callbacks.onError   - Llamada si ocurre un error
   * @returns {Promise<void>}
   */
  async logout({ onSuccess, onError }) {
    try {
      await AuthModel.logout();
      onSuccess();
    } catch (err) {
      console.error('[AuthController.logout]', err);
      onError(i18n.app.errorGenerico);
    }
  },

  /**
   * Inicia el listener de estado de autenticación de Firebase.
   * Debe llamarse al arrancar la app para restaurar sesiones activas.
   *
   * @param {function(import('../models/AuthModel.js').SesionUsuario|null): void} onCambio
   * @returns {function} Función unsubscribe
   */
  iniciarListener(onCambio) {
    return AuthModel.onAuthChange(onCambio);
  },

  /**
   * Retorna la sesión activa en memoria.
   *
   * @returns {import('../models/AuthModel.js').SesionUsuario|null}
   */
  getSesion() {
    return AuthModel.getSesion();
  },

  /**
   * Determina la ruta de redirección según el rol del usuario.
   *
   * @param {string} rol - Rol del usuario (usar constantes ROLES)
   * @returns {string} Hash de la ruta de destino
   */
  getRutaPorRol(rol) {
    switch (rol) {
      case ROLES.EDIL:       return '#/admin';
      case ROLES.ESTUDIANTE: return '#/inicio';
      default:               return '#/inicio';
    }
  },

  // ─── Privado: mapear códigos de error de Firebase a mensajes amigables ─
  /**
   * Mapea códigos de error de Firebase Auth a mensajes en español.
   *
   * @private
   * @param {string} codigo - Código de error de Firebase (ej: 'auth/wrong-password')
   * @returns {string} Mensaje de error legible
   */
  _mapearErrorFirebase(codigo) {
    const mapa = {
      'auth/invalid-credential':     i18n.auth.errorCredenciales,
      'auth/user-not-found':         i18n.auth.errorCredenciales,
      'auth/wrong-password':         i18n.auth.errorCredenciales,
      'auth/invalid-email':          'El formato del correo no es válido.',
      'auth/user-disabled':          'Esta cuenta ha sido desactivada.',
      'auth/too-many-requests':      'Demasiados intentos. Espera unos minutos.',
      'auth/network-request-failed': i18n.auth.errorRed,
    };
    return mapa[codigo] || i18n.auth.errorGenerico;
  },
};

export default AuthController;
