/**
 * @fileoverview Autenticacion compartida para Google Drive API.
 *
 * Mantiene un unico token OAuth en memoria para que las operaciones de Drive
 * no pidan consentimiento de Google en cada guardado.
 *
 * @module models/DriveAuthModel
 */

import { DRIVE_CONFIG } from '../config/firebase.config.js';

let _gapiTokenClient = null;
let _gapiIniciado = false;
let _gapiInitPromise = null;
let _tokenExpiraEn = 0;

const TOKEN_MARGIN_MS = 60 * 1000;
const TOKEN_WARNING_MS = 5 * 60 * 1000;
const DEFAULT_TOKEN_MS = 50 * 60 * 1000;
const EVENTO_ESTADO = 'jal:drive-auth-change';

const DriveAuthModel = {
  async inicializarDrive() {
    if (_gapiIniciado) return;
    if (_gapiInitPromise) return _gapiInitPromise;

    _gapiInitPromise = new Promise((resolve, reject) => {
      const esperarGapi = () => {
        if (typeof window.gapi === 'undefined' || !window.google?.accounts?.oauth2) {
          setTimeout(esperarGapi, 200);
          return;
        }

        window.gapi.load('client', async () => {
          try {
            await window.gapi.client.init({
              apiKey: DRIVE_CONFIG.API_KEY,
              discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
            });

            _gapiTokenClient = window.google.accounts.oauth2.initTokenClient({
              client_id: DRIVE_CONFIG.CLIENT_ID,
              scope: DRIVE_CONFIG.SCOPES,
              callback: () => {},
            });

            _gapiIniciado = true;
            resolve();
          } catch (err) {
            _gapiInitPromise = null;
            reject(err);
          }
        });
      };

      esperarGapi();
    });

    return _gapiInitPromise;
  },

  async solicitarToken({ forceConsent = false, forceRefresh = false } = {}) {
    if (!_gapiTokenClient) {
      await this.inicializarDrive();
    }

    if (!forceConsent && !forceRefresh && this._hayTokenVigente()) return this.getToken();

    if (forceConsent) {
      return this._pedirAccessToken('consent');
    }

    // Intento silencioso primero: con prompt vacio Google reutiliza el
    // consentimiento previo y la sesion activa del usuario, devolviendo el
    // token sin mostrar ningun dialogo (incluso tras recargar la pagina).
    // Solo si Google indica que se necesita interaccion se recae al flujo
    // con consentimiento explicito (el comportamiento anterior).
    try {
      return await this._pedirAccessToken('');
    } catch (err) {
      if (this._requiereInteraccion(err)) {
        return this._pedirAccessToken('consent');
      }
      throw err;
    }
  },

  /**
   * Lanza una solicitud de token con el prompt indicado y resuelve cuando
   * Google responde. Conserva el codigo de error OAuth para decidir reintentos.
   * @private
   * @param {string} prompt - '' (silencioso), 'consent' o 'select_account'.
   */
  _pedirAccessToken(prompt) {
    return new Promise((resolve, reject) => {
      _gapiTokenClient.callback = (resp) => {
        if (resp.error) {
          const error = new Error(`Error OAuth: ${resp.error}`);
          error.oauthError = resp.error;
          reject(error);
          return;
        }

        if (resp.access_token && window.gapi?.client?.setToken) {
          window.gapi.client.setToken(resp);
        }

        this._guardarExpiracion(resp);
        resolve(resp);
      };

      _gapiTokenClient.requestAccessToken({ prompt });
    });
  },

  /**
   * Indica si el fallo de un intento silencioso amerita mostrar el dialogo de
   * consentimiento. Excluye cancelaciones del usuario para no reabrir el
   * dialogo en bucle.
   * @private
   */
  _requiereInteraccion(err) {
    const codigo = String(err?.oauthError || '').toLowerCase();
    if (!codigo) return false;
    if (codigo.includes('access_denied') || codigo.includes('closed') || codigo.includes('cancel')) {
      return false;
    }
    return codigo.includes('interaction_required')
      || codigo.includes('consent_required')
      || codigo.includes('login_required')
      || codigo.includes('account_selection_required')
      || codigo.includes('required');
  },

  getToken() {
    return window.gapi?.client?.getToken?.() || null;
  },

  getAccessToken() {
    return this.getToken()?.access_token || '';
  },

  getEstadoConexion({ margenMs = TOKEN_WARNING_MS } = {}) {
    const token = this.getToken();
    if (!token?.access_token) {
      return {
        estado: 'sin_token',
        requiereConexion: true,
        expiraEn: null,
        msRestantes: 0,
      };
    }

    if (!_tokenExpiraEn) {
      return {
        estado: 'vigente',
        requiereConexion: false,
        expiraEn: null,
        msRestantes: null,
      };
    }

    const msRestantes = _tokenExpiraEn - Date.now();
    if (msRestantes <= 0) {
      return {
        estado: 'vencido',
        requiereConexion: true,
        expiraEn: _tokenExpiraEn,
        msRestantes,
      };
    }

    if (msRestantes <= margenMs) {
      return {
        estado: 'por_vencer',
        requiereConexion: true,
        expiraEn: _tokenExpiraEn,
        msRestantes,
      };
    }

    return {
      estado: 'vigente',
      requiereConexion: false,
      expiraEn: _tokenExpiraEn,
      msRestantes,
    };
  },

  onEstadoCambio(callback) {
    const handler = (event) => callback(event.detail || this.getEstadoConexion());
    window.addEventListener(EVENTO_ESTADO, handler);
    return () => window.removeEventListener(EVENTO_ESTADO, handler);
  },

  _hayTokenVigente() {
    const token = this.getToken();
    if (!token?.access_token) return false;
    if (!_tokenExpiraEn) return true;
    return Date.now() < _tokenExpiraEn - TOKEN_MARGIN_MS;
  },

  _guardarExpiracion(resp) {
    const expiresIn = Number(resp?.expires_in || 0);
    _tokenExpiraEn = Date.now() + (expiresIn > 0 ? expiresIn * 1000 : DEFAULT_TOKEN_MS);
    this._notificarCambio();
  },

  _notificarCambio() {
    window.dispatchEvent(new CustomEvent(EVENTO_ESTADO, {
      detail: this.getEstadoConexion(),
    }));
  },
};

export default DriveAuthModel;
