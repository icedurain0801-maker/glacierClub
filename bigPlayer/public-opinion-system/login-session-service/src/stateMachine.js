'use strict';

const { ServiceError } = require('./errors');

const STATES = Object.freeze({
  PENDING: 'pending_verification',
  VERIFYING: 'verifying',
  ACTIVE: 'active',
  MANUAL: 'manual_verification',
  INVALID: 'invalid_credentials',
  EXPIRED: 'session_expired',
  RELOGIN: 'relogin',
  REVOKED: 'revoked'
});

const TRANSITIONS = new Map([
  [STATES.PENDING, new Set([STATES.VERIFYING, STATES.REVOKED])],
  [STATES.VERIFYING, new Set([STATES.ACTIVE, STATES.MANUAL, STATES.INVALID, STATES.EXPIRED])],
  [STATES.MANUAL, new Set([STATES.VERIFYING, STATES.ACTIVE, STATES.EXPIRED, STATES.REVOKED])],
  [STATES.ACTIVE, new Set([STATES.EXPIRED, STATES.REVOKED])],
  [STATES.EXPIRED, new Set([STATES.RELOGIN, STATES.VERIFYING, STATES.REVOKED])],
  [STATES.RELOGIN, new Set([STATES.ACTIVE, STATES.MANUAL, STATES.INVALID, STATES.EXPIRED])],
  [STATES.INVALID, new Set([STATES.VERIFYING, STATES.REVOKED])],
  [STATES.REVOKED, new Set([STATES.VERIFYING])]
]);

function transition(record, nextState, now = Date.now()) {
  if (record.status !== nextState && !TRANSITIONS.get(record.status)?.has(nextState)) {
    throw new ServiceError('INVALID_STATE_TRANSITION', `Cannot transition from ${record.status} to ${nextState}`, 409);
  }
  record.status = nextState;
  record.updatedAt = new Date(now).toISOString();
  return record;
}

module.exports = { STATES, transition };
