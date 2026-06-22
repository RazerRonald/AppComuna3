/**
 * @fileoverview AuthModel — Lógica de autenticación y gestión de roles.
 * Habla ÚNICAMENTE con Firebase Auth y Firestore.
 * No toca el DOM.
 *
 * @module models/AuthModel
 */

import { firebaseConfig, auth, db }            from '../config/firebase.config.js';
import { COL_USERS, ROLES }                    from '../config/collections.js';
import {
  initializeApp,
  deleteApp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  inMemoryPersistence,
  setPersistence,
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
   * Crea una cuenta de estudiante sin cambiar la sesion principal del Edil.
   *
   * @param {Object} datos
   * @param {string} datos.nombre
   * @param {string} datos.email
   * @param {string} datos.password
   * @returns {Promise<SesionUsuario>}
   */
  async crearEstudiantePorEdil({ nombre, email, password }) {
    const sesionEdil = this.getSesion();
    if (!sesionEdil || sesionEdil.rol !== ROLES.EDIL) {
      throw new Error('auth/unauthorized');
    }

    const appName = `student-create-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const secondaryApp = initializeApp(firebaseConfig, appName);
    const secondaryAuth = getAuth(secondaryApp);
    await setPersistence(secondaryAuth, inMemoryPersistence);
    let usuarioCreado = null;
    let perfilCreado = false;

    try {
      const credencial = await createUserWithEmailAndPassword(
        secondaryAuth,
        email,
        password,
      );
      usuarioCreado = credencial.user;

      await setDoc(doc(db, COL_USERS, usuarioCreado.uid), {
        uid:       usuarioCreado.uid,
        email,
        nombre,
        rol:       ROLES.ESTUDIANTE,
        creadoEn:  serverTimestamp(),
        creadoPor: sesionEdil.uid,
      });
      perfilCreado = true;

      return {
        uid: usuarioCreado.uid,
        email,
        nombre,
        rol: ROLES.ESTUDIANTE,
      };
    } catch (err) {
      if (usuarioCreado && !perfilCreado) {
        try {
          await deleteUser(usuarioCreado);
        } catch (deleteErr) {
          console.warn('[AuthModel.crearEstudiantePorEdil] No se pudo revertir usuario Auth incompleto', deleteErr);
        }
      }
      throw err;
    } finally {
      try {
        await signOut(secondaryAuth);
      } catch (_) {}
      try {
        await deleteApp(secondaryApp);
      } catch (_) {}
    }
  },

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

};

export default AuthModel;
