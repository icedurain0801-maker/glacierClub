'use strict';

const http = require('node:http');
const { ServiceError } = require('./errors');
const { authenticate, sanitize } = require('./security');

function sendJson(res, status, payload) {
  const body = JSON.stringify(sanitize(payload));
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store' });
  res.end(body);
}

async function readJson(req, limit = 65536) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > limit) throw new ServiceError('REQUEST_TOO_LARGE', 'Request body is too large', 413);
  }
  if (!body) return {};
  try { return JSON.parse(body); } catch { throw new ServiceError('INVALID_JSON', 'Request body must be valid JSON', 400); }
}

function createHttpServer({ service, internalToken, readiness }) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://login-session.internal');
      if (req.method === 'GET' && url.pathname === '/health') {
        const status = typeof readiness === 'function' ? readiness() : { ready: Boolean(internalToken) };
        return sendJson(res, status.ready ? 200 : 503, status);
      }
      authenticate(req, internalToken);
      const body = req.method === 'POST' || req.method === 'PUT' ? await readJson(req) : {};
      const query = Object.fromEntries(url.searchParams);
      const input = { ...query, ...body };

      if (req.method === 'PUT' && url.pathname === '/internal/v1/accounts/binding') return sendJson(res, 200, { data: service.bindAccount(input) });
      if (req.method === 'POST' && url.pathname === '/internal/v1/login/start') return sendJson(res, 200, { data: await service.startLogin(input) });
      if (req.method === 'GET' && url.pathname === '/internal/v1/login/status') return sendJson(res, 200, { data: service.getStatus(input) });
      if (req.method === 'GET' && url.pathname === '/internal/v1/challenges/current') return sendJson(res, 200, { data: service.getChallenge(input) });
      if (req.method === 'POST' && url.pathname === '/internal/v1/challenges/submit') return sendJson(res, 200, { data: await service.submitChallenge(input) });
      if (req.method === 'POST' && url.pathname === '/internal/v1/challenges/poll') return sendJson(res, 200, { data: await service.pollChallenge(input) });
      if (req.method === 'GET' && url.pathname === '/internal/v1/sessions/reference') return sendJson(res, 200, { data: service.getSessionReference(input) });
      if (req.method === 'POST' && url.pathname === '/internal/v1/sessions/reference/exchange') return sendJson(res, 200, { data: service.issueSessionReferenceExchange(input) });
      if (req.method === 'POST' && url.pathname === '/internal/v1/sessions/exchange') return sendJson(res, 200, { data: service.exchangeSessionReference(input) });
      if (req.method === 'POST' && url.pathname === '/internal/v1/sessions/result/claim') return sendJson(res, 200, { data: service.claimAuthResult(input) });
      if (req.method === 'POST' && url.pathname === '/internal/v1/sessions/revoke') return sendJson(res, 200, { data: service.revoke(input) });
      if (req.method === 'POST' && url.pathname === '/internal/v1/credentials/resolve') return sendJson(res, 200, { data: await service.resolveCredential(input) });
      throw new ServiceError('ROUTE_NOT_FOUND', 'Route was not found', 404);
    } catch (error) {
      const status = error instanceof ServiceError ? error.status : 500;
      const code = error instanceof ServiceError ? error.code : 'INTERNAL_ERROR';
      sendJson(res, status, { error: { code, message: status === 500 ? 'Internal server error' : error.message, details: error.details } });
    }
  });
}

module.exports = { createHttpServer, readJson, sendJson };
