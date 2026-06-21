/**
 * @fileoverview EventoController — Orquesta operaciones de eventos.
 * Recibe eventos de las vistas, llama a EventoModel y devuelve resultados.
 * No toca Firebase directamente; no renderiza HTML.
 *
 * @module controllers/EventoController
 */

import EventoModel from '../models/EventoModel.js';
import AuthModel   from '../models/AuthModel.js';
import { i18n }    from '../config/i18n.js';

const EventoController = {
  /**
   * Obtiene todos los eventos (pasados y futuros) ordenados de más reciente a
   * más antiguo. Usado en las vistas públicas para no ocultar eventos pasados.
   *
   * @param {Object}   callbacks
   * @param {function} callbacks.onLoading
   * @param {function} callbacks.onSuccess - (Evento[])
   * @param {function} callbacks.onError   - (string)
   * @returns {Promise<void>}
   */
  async listarRecientes({ onLoading, onSuccess, onError }) {
    onLoading(true);
    try {
      const eventos = await EventoModel.getRecientes();
      onSuccess(eventos);
    } catch (err) {
      console.error('[EventoController.listarRecientes]', err);
      onError(i18n.app.errorGenerico);
    } finally {
      onLoading(false);
    }
  },

  /**
   * Obtiene todos los eventos (para panel admin).
   *
   * @param {Object}   callbacks
   * @param {function} callbacks.onLoading
   * @param {function} callbacks.onSuccess - (Evento[])
   * @param {function} callbacks.onError   - (string)
   * @returns {Promise<void>}
   */
  async listarTodos({ onLoading, onSuccess, onError }) {
    onLoading(true);
    try {
      const eventos = await EventoModel.getAll();
      onSuccess(eventos);
    } catch (err) {
      console.error('[EventoController.listarTodos]', err);
      onError(i18n.app.errorGenerico);
    } finally {
      onLoading(false);
    }
  },

  /**
   * Crea un nuevo evento. Solo permite usuarios con sesión activa (Edil).
   *
   * @param {Object}   datos               - Datos del formulario
   * @param {string}   datos.titulo        - Título del evento
   * @param {string}   datos.descripcion   - Descripción
   * @param {string}   datos.fecha         - Fecha en formato datetime-local (ISO)
   * @param {string}   datos.lugar         - Lugar del evento
   * @param {Object}   callbacks
   * @param {function} callbacks.onLoading
   * @param {function} callbacks.onSuccess - (string) ID del documento creado
   * @param {function} callbacks.onError   - (string) Mensaje de error
   * @returns {Promise<void>}
   */
  async crear(datos, { onLoading, onSuccess, onError }) {
    if (!this._validarCampos(datos)) {
      onError(i18n.eventos.camposRequeridos);
      return;
    }
    if (!this._rangoFechasValido(datos)) {
      onError(i18n.eventos.finAntesDeInicio);
      return;
    }

    const sesion = AuthModel.getSesion();
    if (!sesion) {
      onError(i18n.auth.accesoDenegado);
      return;
    }

    onLoading(true);
    try {
      const id = await EventoModel.create({
        titulo:      datos.titulo.trim(),
        descripcion: datos.descripcion.trim(),
        fecha:       datos.fecha,
        fecha_fin:   datos.fecha_fin,
        lugar:       datos.lugar.trim(),
        autorId:     sesion.uid,
      });
      onSuccess(id);
    } catch (err) {
      console.error('[EventoController.crear]', err);
      onError(i18n.eventos.errorGuardar);
    } finally {
      onLoading(false);
    }
  },

  /**
   * Actualiza un evento existente.
   *
   * @param {string}   id     - ID del documento en Firestore
   * @param {Object}   datos  - Campos a actualizar
   * @param {Object}   callbacks
   * @param {function} callbacks.onLoading
   * @param {function} callbacks.onSuccess
   * @param {function} callbacks.onError
   * @returns {Promise<void>}
   */
  async actualizar(id, datos, { onLoading, onSuccess, onError }) {
    if (!this._validarCampos(datos)) {
      onError(i18n.eventos.camposRequeridos);
      return;
    }
    if (!this._rangoFechasValido(datos)) {
      onError(i18n.eventos.finAntesDeInicio);
      return;
    }

    onLoading(true);
    try {
      await EventoModel.update(id, {
        titulo:      datos.titulo.trim(),
        descripcion: datos.descripcion.trim(),
        fecha:       datos.fecha,
        fecha_fin:   datos.fecha_fin,
        lugar:       datos.lugar.trim(),
      });
      onSuccess();
    } catch (err) {
      console.error('[EventoController.actualizar]', err);
      onError(i18n.eventos.errorGuardar);
    } finally {
      onLoading(false);
    }
  },

  /**
   * Elimina un evento de Firestore.
   *
   * @param {string}   id     - ID del documento a eliminar
   * @param {Object}   callbacks
   * @param {function} callbacks.onLoading
   * @param {function} callbacks.onSuccess
   * @param {function} callbacks.onError
   * @returns {Promise<void>}
   */
  async eliminar(id, { onLoading, onSuccess, onError }) {
    onLoading(true);
    try {
      await EventoModel.delete(id);
      onSuccess();
    } catch (err) {
      console.error('[EventoController.eliminar]', err);
      onError(i18n.eventos.errorEliminar);
    } finally {
      onLoading(false);
    }
  },

  /**
   * Suscribe un listener en tiempo real a la colección de eventos.
   *
   * @param {function(import('../models/EventoModel.js').Evento[]): void} callback
   * @returns {function} Función unsubscribe
   */
  suscribirTiempoReal(callback) {
    return EventoModel.onSnapshot(callback);
  },

  // ─── Privado ─────────────────────────────────────────────────────────
  /**
   * Valida que los campos obligatorios del evento no estén vacíos.
   *
   * @private
   * @param {Object} datos
   * @returns {boolean}
   */
  _validarCampos(datos) {
    return Boolean(
      datos?.titulo?.trim() &&
      datos?.descripcion?.trim() &&
      datos?.fecha &&
      datos?.fecha_fin &&
      datos?.lugar?.trim()
    );
  },

  /**
   * Valida que la fecha y hora de fin sea posterior a la de inicio.
   *
   * @private
   * @param {Object} datos
   * @returns {boolean}
   */
  _rangoFechasValido(datos) {
    const inicio = new Date(datos.fecha).getTime();
    const fin    = new Date(datos.fecha_fin).getTime();
    if (Number.isNaN(inicio) || Number.isNaN(fin)) return false;
    return fin > inicio;
  },
};

export default EventoController;
