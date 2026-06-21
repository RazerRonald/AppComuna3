/**
 * @fileoverview NoticiaController — Orquesta operaciones de noticias.
 * Recibe eventos de las vistas, llama a NoticiaModel y devuelve resultados.
 * No toca Firebase directamente; no renderiza HTML.
 *
 * @module controllers/NoticiaController
 */

import NoticiaModel from '../models/NoticiaModel.js';
import NoticiaMediaModel from '../models/NoticiaMediaModel.js';
import AuthModel    from '../models/AuthModel.js';
import { i18n }     from '../config/i18n.js';

const NoticiaController = {
  /**
   * Obtiene todas las noticias para mostrar en la vista pública o admin.
   *
   * @param {Object}   callbacks
   * @param {function} callbacks.onLoading - (bool) Indicador de carga
   * @param {function} callbacks.onSuccess - (Noticia[]) Noticias cargadas
   * @param {function} callbacks.onError   - (string) Mensaje de error
   * @param {number}   [limite=50]         - Número máximo de noticias
   * @returns {Promise<void>}
   */
  async listar({ onLoading, onSuccess, onError }, limite = 50) {
    onLoading(true);
    try {
      const noticias = await NoticiaModel.getAll(limite);
      onSuccess(noticias);
    } catch (err) {
      console.error('[NoticiaController.listar]', err);
      onError(i18n.app.errorGenerico);
    } finally {
      onLoading(false);
    }
  },

  /**
   * Obtiene el detalle de una noticia por su ID.
   *
   * @param {string}   id        - ID de la noticia en Firestore
   * @param {Object}   callbacks
   * @param {function} callbacks.onLoading
   * @param {function} callbacks.onSuccess - (Noticia) Noticia encontrada
   * @param {function} callbacks.onError   - (string) Error o 'no encontrada'
   * @returns {Promise<void>}
   */
  async obtenerDetalle(id, { onLoading, onSuccess, onError }) {
    onLoading(true);
    try {
      const noticia = await NoticiaModel.getById(id);
      if (!noticia) {
        onError('Noticia no encontrada.');
        return;
      }
      onSuccess(noticia);
    } catch (err) {
      console.error('[NoticiaController.obtenerDetalle]', err);
      onError(i18n.app.errorGenerico);
    } finally {
      onLoading(false);
    }
  },

  /**
   * Crea una nueva noticia. Solo permite usuarios con rol Edil.
   *
   * @param {Object}   datos             - Datos del formulario
   * @param {string}   datos.titulo      - Título de la noticia
   * @param {string}   datos.cuerpo      - Contenido de la noticia
   * @param {File}     datos.mediaFile   - Imagen o video de la noticia
   * @param {Object}   callbacks
   * @param {function} callbacks.onLoading
   * @param {function} callbacks.onSuccess - (string) ID del documento creado
   * @param {function} callbacks.onError   - (string) Mensaje de error
   * @returns {Promise<void>}
   */
  async crear(datos, { onLoading, onSuccess, onError }) {
    if (!this._validarCampos(datos)) {
      onError(i18n.noticias.camposRequeridos);
      return;
    }

    if (!datos.mediaFile) {
      onError(i18n.noticias.archivoRequerido);
      return;
    }

    const sesion = AuthModel.getSesion();
    if (!sesion) {
      onError(i18n.auth.accesoDenegado);
      return;
    }

    onLoading(true);
    let noticiaId = null;
    let mediaDriveId = null;
    try {
      noticiaId = await NoticiaModel.create({
        titulo:     datos.titulo.trim(),
        cuerpo:     datos.cuerpo.trim(),
        autorId:    sesion.uid,
      });

      const media = await NoticiaMediaModel.subirContenidoNoticia(datos.mediaFile, {
        id: noticiaId,
        titulo: datos.titulo.trim(),
      });
      mediaDriveId = media.media_drive_id;

      await NoticiaModel.updateMedia(noticiaId, media);
      onSuccess(noticiaId);
    } catch (err) {
      console.error('[NoticiaController.crear]', err);
      if (noticiaId) {
        await this._rollbackCrearNoticia(noticiaId, mediaDriveId);
      }
      onError(err?.message || i18n.noticias.errorGuardar);
    } finally {
      onLoading(false);
    }
  },

  /**
   * Actualiza una noticia existente.
   *
   * @param {string}   id                - ID del documento en Firestore
   * @param {Object}   datos             - Campos a actualizar
   * @param {Object}   callbacks
   * @param {function} callbacks.onLoading
   * @param {function} callbacks.onSuccess
   * @param {function} callbacks.onError
   * @returns {Promise<void>}
   */
  async actualizar(id, datos, { onLoading, onSuccess, onError }) {
    if (!this._validarCampos(datos)) {
      onError(i18n.noticias.camposRequeridos);
      return;
    }

    onLoading(true);
    try {
      const noticiaActual = await NoticiaModel.getById(id);
      await NoticiaModel.update(id, {
        titulo:     datos.titulo.trim(),
        cuerpo:     datos.cuerpo.trim(),
      });

      if (datos.mediaFile) {
        const media = await NoticiaMediaModel.subirContenidoNoticia(datos.mediaFile, {
          ...noticiaActual,
          id,
          titulo: datos.titulo.trim(),
        });
        await NoticiaModel.updateMedia(id, media);
      }

      onSuccess();
    } catch (err) {
      console.error('[NoticiaController.actualizar]', err);
      onError(err?.message || i18n.noticias.errorGuardar);
    } finally {
      onLoading(false);
    }
  },

  /**
   * Elimina una noticia de Firestore.
   *
   * @param {string}   id       - ID del documento a eliminar
   * @param {Object}   callbacks
   * @param {function} callbacks.onLoading
   * @param {function} callbacks.onSuccess
   * @param {function} callbacks.onError
   * @returns {Promise<void>}
   */
  async eliminar(id, { onLoading, onSuccess, onError }) {
    onLoading(true);
    try {
      const noticia = await NoticiaModel.getById(id);
      await NoticiaModel.delete(id);
      if (noticia?.media_drive_id) {
        try {
          await NoticiaMediaModel.eliminarArchivo(noticia.media_drive_id);
        } catch (mediaErr) {
          console.warn('[NoticiaController.eliminar] No se pudo eliminar el archivo de Drive', mediaErr);
        }
      }
      onSuccess();
    } catch (err) {
      console.error('[NoticiaController.eliminar]', err);
      onError(i18n.noticias.errorEliminar);
    } finally {
      onLoading(false);
    }
  },

  /**
   * Suscribe un listener en tiempo real a la colección de noticias.
   *
   * @param {function(import('../models/NoticiaModel.js').Noticia[]): void} callback
   * @returns {function} Función unsubscribe
   */
  suscribirTiempoReal(callback) {
    return NoticiaModel.onSnapshot(callback);
  },

  // ─── Privado: validación de formulario ───────────────────────────────
  /**
   * Valida que los campos obligatorios de una noticia no estén vacíos.
   *
   * @private
   * @param {Object} datos
   * @returns {boolean}
   */
  _validarCampos(datos) {
    return Boolean(datos?.titulo?.trim() && datos?.cuerpo?.trim());
  },

  /**
   * Limpia una noticia creada si falla la subida/registro del archivo.
   *
   * @private
   */
  async _rollbackCrearNoticia(noticiaId, mediaDriveId) {
    try {
      if (mediaDriveId) {
        await NoticiaMediaModel.eliminarArchivo(mediaDriveId);
      }
      await NoticiaModel.delete(noticiaId);
    } catch (err) {
      console.warn('[NoticiaController._rollbackCrearNoticia] No se pudo revertir la noticia incompleta', err);
    }
  },
};

export default NoticiaController;
