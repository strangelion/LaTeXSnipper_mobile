// Password-based AES-GCM encryption for WebDAV history packages.

const ENCRYPTED_SCHEMA = 'latexsnipper.share.encrypted.v1';
const ITERATIONS = 210000;

const enc = new TextEncoder();
const dec = new TextDecoder();

function toBase64(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(text) {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function deriveKey(passphrase, salt) {
  if (!passphrase || passphrase.length < 8) {
    throw new Error('Encryption password must be at least 8 characters');
  }
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptJson(payload, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const plain = enc.encode(JSON.stringify(payload));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
  return {
    schema: ENCRYPTED_SCHEMA,
    version: 1,
    kdf: 'PBKDF2-SHA256',
    iterations: ITERATIONS,
    cipher: 'AES-256-GCM',
    salt: toBase64(salt),
    iv: toBase64(iv),
    payload: toBase64(cipher),
  };
}

export async function decryptJson(envelope, passphrase) {
  const data = typeof envelope === 'string' ? JSON.parse(envelope) : envelope;
  if (!data || data.schema !== ENCRYPTED_SCHEMA) {
    throw new Error('Unsupported encrypted package');
  }
  const salt = fromBase64(data.salt);
  const iv = fromBase64(data.iv);
  const cipher = fromBase64(data.payload);
  const key = await deriveKey(passphrase, salt);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  return JSON.parse(dec.decode(plain));
}
