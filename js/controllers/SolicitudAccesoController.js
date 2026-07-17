/**
 * @fileoverview Orquesta solicitudes publicas y su revision por ediles.
 *
 * @module controllers/SolicitudAccesoController
 */

import SolicitudAccesoModel from '../models/SolicitudAccesoModel.js';
import AuthController from './AuthController.js';
import {
  ESTADOS_SOLICITUD_ACCESO,
  ROLES,
  TIPOS_DOCUMENTO,
} from '../config/collections.js';
import { i18n } from '../config/i18n.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SolicitudAccesoController = {
  /** Registra una solicitud publica para unicamente el rol estudiante. */
  async crear(datos, { onLoading, onSuccess, onError }) {
    const solicitud = this._normalizar(datos);
    const error = this._validar(solicitud);
    if (error) {
      onError(error);
      return;
    }

    onLoading(true);
    try {
      const id = await SolicitudAccesoModel.crear(solicitud);
      onSuccess(id);
    } catch (err) {
      console.error('[SolicitudAccesoController.crear]', err);
      onError(this._mapearError(err));
    } finally {
      onLoading(false);
    }
  },

  /** Suscribe el listado exclusivo para ediles. */
  suscribir(onSuccess, onError) {
    return SolicitudAccesoModel.suscribir(
      onSuccess,
      (err) => {
        console.error('[SolicitudAccesoController.suscribir]', err);
        onError(this._mapearError(err));
      },
    );
  },

  /**
   * Crea el estudiante con la API de autenticacion existente y luego marca
   * la solicitud como aprobada.
   */
  async aprobar(solicitud, { onLoading, onSuccess, onError }) {
    const sesion = AuthController.getSesion();
    if (!sesion || sesion.rol !== ROLES.EDIL) {
      onError(i18n.auth.accesoDenegado);
      return;
    }

    if (solicitud?.estado !== ESTADOS_SOLICITUD_ACCESO.PENDIENTE) {
      onError(i18n.solicitudAcceso.yaResuelta);
      return;
    }

    onLoading(true);
    try {
      const usuario = await this._crearEstudiante(solicitud);
      await SolicitudAccesoModel.resolver(
        solicitud.id,
        ESTADOS_SOLICITUD_ACCESO.APROBADA,
        sesion.uid,
        usuario.uid,
      );
      // El estudiante establece su propia contrasena mediante el correo oficial
      // de Firebase. La cuenta se creo con una clave aleatoria de un solo uso.
      await this._enviarResetPassword(solicitud.email);
      onSuccess(usuario);
    } catch (err) {
      console.error('[SolicitudAccesoController.aprobar]', err);
      onError(this._mapearError(err));
    } finally {
      onLoading(false);
    }
  },

  /** Rechaza una solicitud sin crear acceso ni modificar usuarios. */
  async rechazar(solicitud, { onLoading, onSuccess, onError }) {
    const sesion = AuthController.getSesion();
    if (!sesion || sesion.rol !== ROLES.EDIL) {
      onError(i18n.auth.accesoDenegado);
      return;
    }

    if (solicitud?.estado !== ESTADOS_SOLICITUD_ACCESO.PENDIENTE) {
      onError(i18n.solicitudAcceso.yaResuelta);
      return;
    }

    onLoading(true);
    try {
      await SolicitudAccesoModel.resolver(
        solicitud.id,
        ESTADOS_SOLICITUD_ACCESO.RECHAZADA,
        sesion.uid,
        null,
      );
      onSuccess();
    } catch (err) {
      console.error('[SolicitudAccesoController.rechazar]', err);
      onError(this._mapearError(err));
    } finally {
      onLoading(false);
    }
  },

  /**
   * Construye una redaccion de Gmail sin enviar el mensaje automaticamente.
   * No incluye contrasena: el estudiante la crea mediante el correo oficial de
   * restablecimiento de Firebase.
   */
  construirGmailUrl(solicitud) {
    const asunto = i18n.solicitudAcceso.correoAsunto;
    const cuerpo = [
      i18n.solicitudAcceso.correoSaludo.replace('{nombre}', solicitud.nombre),
      '',
      i18n.solicitudAcceso.correoMensaje,
      '',
      `${i18n.solicitudAcceso.correoCredencial}: ${solicitud.email}`,
      '',
      i18n.solicitudAcceso.correoInstruccionReset,
    ].join('\n');

    const params = new URLSearchParams({
      view: 'cm',
      fs: '1',
      to: solicitud.email,
      su: asunto,
      body: cuerpo,
    });
    return `https://mail.google.com/mail/?${params.toString()}`;
  },

  /**
   * Genera una contrasena aleatoria de un solo uso (no derivable de datos
   * publicos). El estudiante nunca la usa: la reemplaza al establecer la suya.
   * @private
   */
  _generarPasswordSegura() {
    const buffer = new Uint8Array(18);
    (globalThis.crypto || window.crypto).getRandomValues(buffer);
    const base = btoa(String.fromCharCode(...buffer))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
    return `Jal-${base}`;
  },

  /**
   * Dispara el correo de restablecimiento de forma best-effort: si falla, la
   * cuenta ya existe y el edil puede reenviarlo, por lo que no aborta el flujo.
   * @private
   */
  _enviarResetPassword(email) {
    return new Promise((resolve) => {
      AuthController.enviarCorreoRestablecerPassword(email, {
        onLoading: () => {},
        onSuccess: resolve,
        onError: () => resolve(),
      });
    });
  },

  _crearEstudiante(solicitud) {
    const password = this._generarPasswordSegura();
    return new Promise((resolve, reject) => {
      AuthController.crearEstudiante(
        {
          email: solicitud.email,
          nombre: solicitud.nombre,
          primer_apellido: solicitud.primer_apellido,
          segundo_apellido: solicitud.segundo_apellido,
          tipo_documento: solicitud.tipo_documento,
          numero_documento: solicitud.numero_documento,
          ciudad_documento: solicitud.ciudad_documento,
          password,
          confirmarPassword: password,
        },
        {
          onLoading: () => {},
          onSuccess: resolve,
          onError: (mensaje) => reject(this._crearError('usuario/no-creado', mensaje)),
        },
      );
    });
  },

  _normalizar(datos = {}) {
    return {
      email: String(datos.email || '').trim().toLowerCase(),
      nombre: String(datos.nombre || '').trim().replace(/\s+/g, ' '),
      primer_apellido: String(datos.primer_apellido || '').trim().replace(/\s+/g, ' '),
      segundo_apellido: String(datos.segundo_apellido || '').trim().replace(/\s+/g, ' '),
      tipo_documento: String(datos.tipo_documento || '').trim().toUpperCase(),
      numero_documento: String(datos.numero_documento || '').trim().replace(/\s+/g, ''),
      ciudad_documento: String(datos.ciudad_documento || '').trim().replace(/\s+/g, ' '),
    };
  },

  _validar(datos) {
    if (Object.values(datos).some((valor) => !valor)) {
      return i18n.solicitudAcceso.camposRequeridos;
    }
    if (!EMAIL_RE.test(datos.email) || datos.email.length > 180) {
      return i18n.solicitudAcceso.emailInvalido;
    }
    if ([datos.nombre, datos.primer_apellido, datos.segundo_apellido].some((valor) => valor.length > 80)) {
      return i18n.solicitudAcceso.nombreInvalido;
    }
    if (!TIPOS_DOCUMENTO.includes(datos.tipo_documento)) {
      return i18n.solicitudAcceso.tipoDocumentoInvalido;
    }
    if (datos.numero_documento.length < 6 || datos.numero_documento.length > 30) {
      return i18n.solicitudAcceso.numeroDocumentoInvalido;
    }
    if (datos.ciudad_documento.length > 80) {
      return i18n.solicitudAcceso.ciudadInvalida;
    }
    return '';
  },

  _mapearError(err = {}) {
    if (err.code === 'usuario/no-creado') return err.message;
    if (err.code === 'solicitud/ya-resuelta') return i18n.solicitudAcceso.yaResuelta;
    if (err.code === 'solicitud/no-encontrada') return i18n.solicitudAcceso.noEncontrada;
    if (err.code === 'permission-denied') return i18n.solicitudAcceso.errorPermisos;
    if (err.code === 'unavailable' || err.code === 'network-request-failed') {
      return i18n.auth.errorRed;
    }
    return i18n.solicitudAcceso.errorGenerico;
  },

  _crearError(code, message) {
    const error = new Error(message || code);
    error.code = code;
    return error;
  },
};

export default SolicitudAccesoController;
