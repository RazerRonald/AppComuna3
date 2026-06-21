/**
 * @fileoverview AuthModel — Lógica de autenticación y gestión de roles.
 * Habla ÚNICAMENTE con Firebase Auth y Firestore.
 * No toca el DOM.
 *
 * @module models/AuthModel
 */

import { auth, db }                            from '../config/firebase.config.js';
import { COL_USERS, ROLES }                    from '../config/collections.js';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

/**
 * @typedef {Object} SesionUsuario
 * @property {string} uid     - UID único de Firebase Auth
 * @property {string} email   - Correo electrónico
 * @property {string} nombre  - Nombre completo del usuario
 * @property {string} rol     - Rol del usuario: 'edil' | 'estudiante' | 'publico'
 */

/**
 * Objeto de sesión en memoria (nunca en localStorage ni sessionStorage).
 * @type {SesionUsuario|null}
 */
let _sesionActual = null;

const AuthModel = {
  /**
   * Inicia sesión con correo y contraseña usando Firebase Auth.
   * Después de autenticar, lee el documento `users/{uid}` de Firestore
   * para obtener el rol y construye el objeto de sesión.
   *
   * @param {string} email    - Correo electrónico del usuario
   * @param {string} password - Contraseña del usuario
   * @returns {Promise<SesionUsuario>} El objeto de sesión construido
   * @throws {Error} Si las credenciales son incorrectas o hay error de red
   */
  async login(email, password) {
    const credencial = await signInWithEmailAndPassword(auth, email, password);
    const { uid }    = credencial.user;

    // Leer perfil desde Firestore
    const perfilSnap = await getDoc(doc(db, COL_USERS, uid));

    let nombre = email.split('@')[0];
    let rol    = ROLES.ESTUDIANTE; // rol por defecto si no existe el doc

    if (perfilSnap.exists()) {
      const data = perfilSnap.data();
      nombre     = data.nombre  || nombre;
      rol        = data.rol     || ROLES.ESTUDIANTE;
    } else {
      // Si no existe el documento del usuario, crear uno con rol estudiante
      await setDoc(doc(db, COL_USERS, uid), {
        uid,
        email,
        nombre,
        rol:          ROLES.ESTUDIANTE,
        creadoEn:     serverTimestamp(),
      });
    }

    _sesionActual = { uid, email, nombre, rol };
    return _sesionActual;
  },

  /**
   * Cierra la sesión activa en Firebase Auth y limpia el objeto de sesión
   * en memoria.
   *
   * @returns {Promise<void>}
   */
  async logout() {
    await signOut(auth);
    _sesionActual = null;
  },

  /**
   * Retorna el objeto de sesión actualmente en memoria.
   *
   * @returns {SesionUsuario|null} El usuario activo o null si no hay sesión
   */
  getSesion() {
    return _sesionActual;
  },

  /**
   * Establece manualmente el objeto de sesión (usado internamente por el
   * listener de onAuthStateChanged al restaurar la sesión).
   *
   * @param {SesionUsuario|null} sesion
   */
  setSesion(sesion) {
    _sesionActual = sesion;
  },

  /**
   * Verifica si el usuario tiene el rol especificado.
   *
   * @param {string} rol - Rol a verificar (usar constantes de ROLES)
   * @returns {boolean}
   */
  tieneRol(rol) {
    return _sesionActual?.rol === rol;
  },

  /**
   * Indica si hay una sesión activa.
   *
   * @returns {boolean}
   */
  estaAutenticado() {
    return _sesionActual !== null;
  },

  /**
   * Suscribe un callback al estado de autenticación de Firebase.
   * Útil para restaurar la sesión al recargar la página.
   * Al recibir un usuario, consulta Firestore para obtener su rol y
   * reconstruye el objeto _sesionActual.
   *
   * @param {function(SesionUsuario|null): void} callback
   * @returns {function} Función para cancelar la suscripción (unsubscribe)
   */
  onAuthChange(callback) {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        _sesionActual = null;
        callback(null);
        return;
      }

      try {
        const perfilSnap = await getDoc(doc(db, COL_USERS, firebaseUser.uid));
        let nombre = firebaseUser.email.split('@')[0];
        let rol    = ROLES.ESTUDIANTE;

        if (perfilSnap.exists()) {
          const data = perfilSnap.data();
          nombre     = data.nombre || nombre;
          rol        = data.rol    || ROLES.ESTUDIANTE;
        }

        _sesionActual = {
          uid:   firebaseUser.uid,
          email: firebaseUser.email,
          nombre,
          rol,
        };

        callback(_sesionActual);
      } catch (err) {
        console.error('[AuthModel.onAuthChange]', err);
        _sesionActual = null;
        callback(null);
      }
    });
  },

  /**
   * Obtiene el perfil completo del usuario desde Firestore.
   *
   * @param {string} uid - UID del usuario
   * @returns {Promise<Object|null>} Datos del perfil o null
   */
  async getPerfil(uid) {
    try {
      const snap = await getDoc(doc(db, COL_USERS, uid));
      return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    } catch (err) {
      console.error('[AuthModel.getPerfil]', err);
      return null;
    }
  },
};

export default AuthModel;
