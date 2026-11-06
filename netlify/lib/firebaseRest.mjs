import { createSign } from 'node:crypto';

const PROJECT_ID = 'ragnar-training';
const API_KEY = 'AIzaSyAtzIf6JGLQuDVYc6poZAOMgmjEzbEaZk0';
const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
let cachedToken = null;
let cachedUntil = 0;

function credentials() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON no configurada');
  const account = JSON.parse(raw);
  if (account.project_id !== PROJECT_ID || !account.client_email || !account.private_key) {
    throw new Error('Cuenta de servicio de Firebase inválida para Ragnar');
  }
  return account;
}

async function googleToken() {
  if (cachedToken && Date.now() < cachedUntil) return cachedToken;
  const account = credentials();
  const now = Math.floor(Date.now() / 1000);
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const unsigned = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({
    iss: account.client_email,
    scope: SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3500
  });
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const assertion = unsigned + '.' + signer.sign(account.private_key.replace(/\\n/g, '\n')).toString('base64url');
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) throw new Error('OAuth Firebase: ' + response.status);
  cachedToken = result.access_token;
  cachedUntil = Date.now() + Math.max(60, (result.expires_in || 3600) - 120) * 1000;
  return cachedToken;
}

export async function verifyFirebaseUser(idToken) {
  if (!idToken || idToken.length > 5000) return null;
  const response = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + API_KEY, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken })
  });
  if (!response.ok) return null;
  const json = await response.json();
  return json.users?.[0]?.localId || null;
}

const docUrl = (path) => 'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID + '/databases/(default)/documents/' + path;

export function decodeValue(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([key, value]) => [key, decodeValue(value)]));
  return null;
}
export const decodeDoc = (json) => Object.fromEntries(Object.entries(json.fields || {}).map(([key, value]) => [key, decodeValue(value)]));

export async function getFirestoreDoc(path) {
  const response = await fetch(docUrl(path), { headers: { authorization: 'Bearer ' + await googleToken() } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Firestore GET ' + response.status);
  return decodeDoc(await response.json());
}

const string = (s) => ({ stringValue: String(s || '') });
const boolean = (b) => ({ booleanValue: Boolean(b) });
export async function createFirestoreDoc(collectionName, id, fields) {
  const query = new URLSearchParams({ documentId: id });
  const response = await fetch(docUrl(collectionName) + '?' + query, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + await googleToken(), 'content-type': 'application/json' },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(fields).map(([key, val]) => [key, typeof val === 'boolean' ? boolean(val) : string(val)])) })
  });
  if (response.status === 409) return false;
  if (!response.ok) throw new Error('Firestore CREATE ' + response.status);
  return true;
}

export async function sendFcmToken(token, title, body, eventKey) {
  const response = await fetch('https://fcm.googleapis.com/v1/projects/' + PROJECT_ID + '/messages:send', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + await googleToken(), 'content-type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        data: { title, body, url: '/', eventKey },
        webpush: { headers: { TTL: '3600', Urgency: 'high' } }
      }
    })
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error('FCM ' + response.status + ': ' + error.slice(0, 120));
  }
  return true;
}
