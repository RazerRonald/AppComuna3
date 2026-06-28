const crypto = require('crypto');

const DEFAULT_FIREBASE_PROJECT_ID = 'jal3-fd8a2';
const DEFAULT_FIREBASE_WEB_API_KEY = 'AIzaSyD_1bLYxGLrIngn6K2rexgHg4EijOAeOig';
const FIRESTORE_DATABASE = '(default)';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CLOUD_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const TIPOS_DOCUMENTO = ['CC', 'CE', 'PPT', 'PA'];
const ROLES = ['estudiante', 'edil'];

let cachedAccessToken = null;
let cachedAccessTokenExp = 0;

function getConfig() {
  return {
    projectId: process.env.FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_PROJECT_ID,
    apiKey: process.env.FIREBASE_WEB_API_KEY || DEFAULT_FIREBASE_WEB_API_KEY,
    clientEmail: process.env.GOOGLE_CLIENT_EMAIL || '',
    privateKey: normalizarPrivateKey(process.env.GOOGLE_PRIVATE_KEY || ''),
    serviceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT || '',
  };
}

function normalizarPrivateKey(value) {
  return String(value || '').replace(/\\n/g, '\n').trim();
}

function getServiceAccount() {
  const config = getConfig();
  if (config.serviceAccountJson) {
    try {
      const parsed = JSON.parse(config.serviceAccountJson);
      return {
        clientEmail: parsed.client_email || '',
        privateKey: normalizarPrivateKey(parsed.private_key || ''),
      };
    } catch (_) {
      return { clientEmail: '', privateKey: '' };
    }
  }

  return {
    clientEmail: config.clientEmail,
    privateKey: config.privateKey,
  };
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function sendError(res, status, code, message) {
  sendJson(res, status, { code, error: message || code });
}

function getBearerToken(req) {
  const header = String(req.headers.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function validarUid(uid) {
  return /^[A-Za-z0-9_-]{1,128}$/.test(String(uid || ''));
}

function normalizarPerfil(perfil = {}, uid) {
  return {
    uid,
    email: String(perfil.email || '').trim().toLowerCase(),
    nombre: String(perfil.nombre || '').trim().replace(/\s+/g, ' '),
    primer_apellido: String(perfil.primer_apellido || '').trim().replace(/\s+/g, ' '),
    segundo_apellido: String(perfil.segundo_apellido || '').trim().replace(/\s+/g, ' '),
    tipo_documento: String(perfil.tipo_documento || '').trim().toUpperCase(),
    numero_documento: String(perfil.numero_documento || '').trim().replace(/\s+/g, ''),
    rol: perfil.rol === 'edil' ? 'edil' : 'estudiante',
  };
}

function validarPerfil(perfil) {
  const requeridos = [
    'email',
    'nombre',
    'primer_apellido',
    'segundo_apellido',
    'tipo_documento',
    'numero_documento',
    'rol',
  ];

  if (requeridos.some((campo) => !perfil[campo])) {
    return 'Campos de perfil incompletos';
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(perfil.email)) {
    return 'Correo invalido';
  }

  if (!TIPOS_DOCUMENTO.includes(perfil.tipo_documento)) {
    return 'Tipo de documento invalido';
  }

  if (perfil.numero_documento.length < 4 || perfil.numero_documento.length > 30) {
    return 'Numero de documento invalido';
  }

  if (!ROLES.includes(perfil.rol)) {
    return 'Rol invalido';
  }

  return '';
}

function buildNombreCompleto(perfil) {
  return [
    perfil.nombre,
    perfil.primer_apellido,
    perfil.segundo_apellido,
  ].filter(Boolean).join(' ').trim();
}

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function firmarJwtServiceAccount() {
  const { clientEmail, privateKey } = getServiceAccount();
  if (!clientEmail || !privateKey) {
    const err = new Error('Faltan credenciales de servicio');
    err.code = 'api/admin-config-missing';
    err.statusCode = 500;
    throw err;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: clientEmail,
    scope: CLOUD_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${payload}`;
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(unsigned)
    .sign(privateKey, 'base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

  return `${unsigned}.${signature}`;
}

async function getAccessToken() {
  if (cachedAccessToken && Date.now() < cachedAccessTokenExp - 60000) {
    return cachedAccessToken;
  }

  const assertion = firmarJwtServiceAccount();
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload.access_token) {
    const err = new Error(payload.error_description || payload.error || 'No se pudo obtener token de servicio');
    err.code = 'api/admin-config-missing';
    err.statusCode = 500;
    throw err;
  }

  cachedAccessToken = payload.access_token;
  cachedAccessTokenExp = Date.now() + Number(payload.expires_in || 3600) * 1000;
  return cachedAccessToken;
}

async function lookupFirebaseUser(idToken) {
  const { apiKey } = getConfig();
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    },
  );
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload.users?.[0]?.localId) {
    const err = new Error('Token de Firebase invalido');
    err.code = 'auth/unauthorized';
    err.statusCode = 401;
    throw err;
  }

  return payload.users[0];
}

function firestoreDocUrl(projectId, collection, id) {
  return [
    'https://firestore.googleapis.com/v1/projects',
    encodeURIComponent(projectId),
    'databases',
    encodeURIComponent(FIRESTORE_DATABASE),
    'documents',
    encodeURIComponent(collection),
    encodeURIComponent(id),
  ].join('/');
}

function firestoreString(doc, field) {
  return doc?.fields?.[field]?.stringValue || '';
}

async function getUserProfile(uid, accessToken) {
  const { projectId } = getConfig();
  const response = await fetch(firestoreDocUrl(projectId, 'users', uid), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const err = new Error(payload.error?.message || 'No se pudo leer el perfil');
    err.code = response.status === 404 ? 'profile/not-found' : 'permission-denied';
    err.statusCode = response.status;
    throw err;
  }

  return payload;
}

function toFirestoreFields(data) {
  const fields = {};
  Object.entries(data).forEach(([key, value]) => {
    if (value instanceof Date) {
      fields[key] = { timestampValue: value.toISOString() };
    } else {
      fields[key] = { stringValue: String(value ?? '') };
    }
  });
  return fields;
}

async function patchUserProfile(uid, perfil, callerUid, accessToken) {
  const { projectId } = getConfig();
  const data = {
    ...perfil,
    actualizadoPor: callerUid,
    actualizadoEn: new Date(),
  };
  const params = new URLSearchParams();
  Object.keys(data).forEach((field) => params.append('updateMask.fieldPaths', field));

  const response = await fetch(`${firestoreDocUrl(projectId, 'users', uid)}?${params.toString()}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ fields: toFirestoreFields(data) }),
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const err = new Error(payload.error?.message || 'No se pudo actualizar el perfil');
    err.code = 'permission-denied';
    err.statusCode = response.status;
    throw err;
  }

  return payload;
}

async function updateAuthUser(uid, perfil, password, accessToken) {
  const { projectId } = getConfig();
  const body = {
    localId: uid,
    email: perfil.email,
    displayName: buildNombreCompleto(perfil),
  };

  if (password) body.password = password;

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/accounts:update`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(body),
    },
  );
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const err = new Error(payload.error?.message || 'No se pudo actualizar Firebase Auth');
    err.code = payload.error?.message || 'auth/update-failed';
    err.statusCode = response.status;
    throw err;
  }
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Allow', 'PATCH, OPTIONS');
    res.end();
    return;
  }

  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH, OPTIONS');
    sendError(res, 405, 'method-not-allowed', 'Metodo no permitido');
    return;
  }

  try {
    const idToken = getBearerToken(req);
    if (!idToken) {
      sendError(res, 401, 'auth/unauthorized', 'No autenticado');
      return;
    }

    const body = await readBody(req);
    const uid = String(body.uid || '').trim();
    if (!validarUid(uid)) {
      sendError(res, 400, 'invalid-uid', 'UID invalido');
      return;
    }

    const perfil = normalizarPerfil(body.perfil || {}, uid);
    const errorPerfil = validarPerfil(perfil);
    if (errorPerfil) {
      sendError(res, 400, 'invalid-profile', errorPerfil);
      return;
    }

    const password = body.password ? String(body.password) : '';
    if (password && password.length < 6) {
      sendError(res, 400, 'WEAK_PASSWORD', 'La contrasena debe tener al menos 6 caracteres');
      return;
    }

    const caller = await lookupFirebaseUser(idToken);
    const accessToken = await getAccessToken();
    const callerProfile = await getUserProfile(caller.localId, accessToken);

    if (firestoreString(callerProfile, 'rol') !== 'edil') {
      sendError(res, 403, 'auth/unauthorized', 'No tienes permisos de Edil');
      return;
    }

    if (caller.localId === uid && perfil.rol !== 'edil') {
      sendError(res, 400, 'auth/no-self-demote', 'No puedes quitar tu propio rol Edil');
      return;
    }

    await updateAuthUser(uid, perfil, password, accessToken);
    await patchUserProfile(uid, perfil, caller.localId, accessToken);

    sendJson(res, 200, {
      ok: true,
      usuario: perfil,
    });
  } catch (err) {
    console.error('[api/admin-users]', err);
    sendError(res, err.statusCode || 500, err.code || 'api/admin-error', err.message);
  }
};
