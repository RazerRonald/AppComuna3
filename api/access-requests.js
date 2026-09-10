const { json, body, edil, failure, problem } = require('../server/http');
const { config, verifyCaptcha, clientIp, submit } = require('../server/public-access');
async function sendReset(email) {
  const key = process.env.FIREBASE_WEB_API_KEY;
  if (!key) throw new Error('Missing reset configuration');
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(key)}`, {
    method: 'POST', signal: AbortSignal.timeout(10000), headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestType: 'PASSWORD_RESET', email }),
  });
  if (!response.ok) throw new Error('Reset request failed');
}
module.exports = async function handler(req, res) {
  let stage = 'request';
  try {
    stage = 'turnstile-config';
    if (req.method === 'GET') return json(res, 200, { siteKey: config().siteKey });
    if (!['POST', 'PATCH'].includes(req.method)) { res.setHeader('Allow', 'GET, POST, PATCH'); throw problem('method-not-allowed', 'Metodo no permitido.', 405); }
    stage = 'request-body';
    const input = await body(req);
    if (req.method === 'POST') {
      stage = 'turnstile-config';
      const settings = config(); const ip = clientIp(req);
      stage = 'turnstile-verify';
      await verifyCaptcha(input.captchaToken, ip, settings);
      // Load Firebase only after Turnstile succeeds. Keeping this import inside
      // the handler also turns initialization failures into a controlled JSON
      // response instead of crashing the Vercel Function at module load time.
      stage = 'firebase-load';
      const { services } = require('../server/firebase');
      stage = 'firebase-init';
      const { db } = services();
      stage = 'firestore-submit';
      return json(res, 202, await submit({ db, input: input.datos, ip, secret: settings.secret }));
    }
    stage = 'firebase-load';
    const { services } = require('../server/firebase');
    const { accessService } = require('../server/access');
    stage = 'firebase-init';
    const deps = services(); const actor = await edil(req, deps); const service = accessService({ ...deps, sendReset });
    if (input.action === 'approve') return json(res, 200, await service.approve(input.id, actor));
    if (input.action === 'reject') return json(res, 200, await service.reject(input.id, actor));
    if (input.action === 'email') return json(res, 200, await service.sendEmail(input.id));
    throw problem('invalid-action', 'Accion invalida.', 400);
  } catch (error) {
    console.error('[access-requests]', stage, error.code || error.name || 'internal');
    failure(res, error);
  }
};
