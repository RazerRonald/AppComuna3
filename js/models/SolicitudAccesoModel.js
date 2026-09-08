/**
 * @fileoverview Persistencia de solicitudes publicas de acceso estudiantil.
 * No toca el DOM ni crea usuarios de Firebase Auth.
 *
 * @module models/SolicitudAccesoModel
 */

import { db } from '../config/firebase.config.js';
import {
  COL_SOLICITUDES_ACCESO,
  ESTADOS_SOLICITUD_ACCESO,
  ROLES,
} from '../config/collections.js';
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const SolicitudAccesoModel = {
  /**
   * Registra una solicitud publica. El estado y el rol no provienen de la UI.
   *
   * @param {Object} datos
   * @returns {Promise<string>} ID de la solicitud creada.
   */
  async crear(datos) {
    const solicitudRef = await addDoc(collection(db, COL_SOLICITUDES_ACCESO), {
      email: datos.email,
      nombre: datos.nombre,
      primer_apellido: datos.primer_apellido,
      segundo_apellido: datos.segundo_apellido,
      tipo_documento: datos.tipo_documento,
      numero_documento: datos.numero_documento,
      ciudad_documento: datos.ciudad_documento,
      rol: ROLES.ESTUDIANTE,
      estado: ESTADOS_SOLICITUD_ACCESO.PENDIENTE,
      fecha_solicitud: serverTimestamp(),
      fecha_respuesta: null,
      uid_edil_respuesta: null,
      uid_usuario_creado: null,
    });

    return solicitudRef.id;
  },

  /**
   * Suscribe las solicitudes para la vista exclusiva de ediles.
   *
   * @param {function(Object[]): void} onSuccess
   * @param {function(Error): void} onError
   * @returns {function}
   */
  suscribir(onSuccess, onError = () => {}) {
    const solicitudesQuery = query(
      collection(db, COL_SOLICITUDES_ACCESO),
      orderBy('fecha_solicitud', 'desc'),
    );

    return onSnapshot(
      solicitudesQuery,
      (snap) => onSuccess(snap.docs.map((item) => ({
        id: item.id,
        ...item.data(),
      }))),
      onError,
    );
  },

  /**
   * Resuelve una solicitud pendiente mediante una transaccion para impedir
   * que dos sesiones de Edil cambien su resultado al mismo tiempo.
   *
   * @param {string} solicitudId
   * @param {'Aprobada'|'Rechazada'} estado
   * @param {string} uidEdil
   * @param {string|null} uidUsuarioCreado
   * @returns {Promise<void>}
   */
  async resolver(solicitudId, estado, uidEdil, uidUsuarioCreado = null) {
    const solicitudRef = doc(db, COL_SOLICITUDES_ACCESO, solicitudId);

    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(solicitudRef);
      if (!snap.exists()) {
        throw this._crearError('solicitud/no-encontrada');
      }

      if (snap.data().estado !== ESTADOS_SOLICITUD_ACCESO.PENDIENTE) {
        throw this._crearError('solicitud/ya-resuelta');
      }

      transaction.update(solicitudRef, {
        estado,
        fecha_respuesta: serverTimestamp(),
        uid_edil_respuesta: uidEdil,
        uid_usuario_creado: uidUsuarioCreado,
      });
    });
  },

  _crearError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
  },
};

export default SolicitudAccesoModel;
