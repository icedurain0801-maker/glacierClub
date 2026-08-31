'use strict';

const crypto = require('node:crypto');
const { ServiceError } = require('./errors');

const SENSITIVE_KEYS = /^(password|cookie|cookies|token|accessToken|refreshToken|authorization|secret|credentials?)$/i;

function maskPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length < 7) return '***';
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !SENSITIVE_KEYS.test(key))
    .map(([key, child]) => [key, key.toLowerCase().includes('phone') ? maskPhone(child) : sanitize(child)]));
}

function authenticate(req, expectedToken) {
  if (!expectedToken) throw new ServiceError('INTERNAL_AUTH_NOT_CONFIGURED', 'Internal authentication is not configured', 503);
  const header = req.headers.authorization || '';
  const supplied = header.startsWith('Bearer ') ? header.slice(7) : '';
  const left = Buffer.from(supplied);
  const right = Buffer.from(expectedToken);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    throw new ServiceError('UNAUTHORIZED', 'Internal authentication failed', 401);
  }
}

module.exports = { authenticate, maskPhone, sanitize };
