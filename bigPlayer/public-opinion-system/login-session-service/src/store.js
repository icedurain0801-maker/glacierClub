'use strict';

const { randomUUID } = require('node:crypto');
const { ServiceError } = require('./errors');
const { STATES } = require('./stateMachine');

class MemorySessionStore {
  constructor({ now = () => Date.now() } = {}) { this.now = now; this.records = new Map(); }

  createBinding({ sourceId, accountId, platform, credentialRef, maskedPhone }) {
    const existing = this.records.get(accountId);
    if (existing && (existing.sourceId !== sourceId || existing.platform !== platform)) {
      throw new ServiceError('ACCOUNT_BINDING_CONFLICT', 'Account is already bound to another source or platform', 409);
    }
    const timestamp = new Date(this.now()).toISOString();
    const record = existing || { sourceId, accountId, platform, status: STATES.PENDING, createdAt: timestamp };
    Object.assign(record, { credentialRef: credentialRef || null, maskedPhone: maskedPhone || null, updatedAt: timestamp });
    this.records.set(accountId, record);
    return record;
  }

  requireBinding(binding) {
    const record = this.records.get(binding.accountId);
    if (!record) throw new ServiceError('ACCOUNT_NOT_FOUND', 'Account binding was not found', 404);
    if (record.sourceId !== binding.sourceId || record.platform !== binding.platform) {
      throw new ServiceError('ACCOUNT_SCOPE_MISMATCH', 'Source, account and platform binding does not match', 403);
    }
    return record;
  }

  issueSession(record, ttlMs) {
    record.sessionRef = `sess_${randomUUID()}`;
    record.sessionCreatedAt = new Date(this.now()).toISOString();
    record.sessionExpiresAt = new Date(this.now() + ttlMs).toISOString();
    delete record.failureCode;
    delete record.challengeId;
    return record;
  }

  revoke(record) {
    delete record.sessionRef;
    delete record.sessionCreatedAt;
    delete record.sessionExpiresAt;
  }
}

class MemoryChallengeStore {
  constructor({ now = () => Date.now(), ttlMs = 300000 } = {}) { this.now = now; this.ttlMs = ttlMs; this.records = new Map(); }

  create(binding, descriptor) {
    const now = this.now();
    const challenge = {
      id: `chl_${randomUUID()}`,
      ...binding,
      type: descriptor.type,
      status: 'pending',
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + this.ttlMs).toISOString(),
      displayRef: descriptor.displayRef || null,
      instruction: descriptor.instruction,
      allowsTextSubmission: Boolean(descriptor.allowsTextSubmission),
      requiresPolling: Boolean(descriptor.requiresPolling),
      adapterChallengeRef: descriptor.adapterChallengeRef || null,
      expectedAnswer: descriptor.expectedAnswer,
      consumed: false
    };
    this.records.set(challenge.id, challenge);
    return challenge;
  }

  require(id, binding) {
    const challenge = this.records.get(id);
    if (!challenge) throw new ServiceError('CHALLENGE_NOT_FOUND', 'Challenge was not found', 404);
    if (challenge.sourceId !== binding.sourceId || challenge.accountId !== binding.accountId || challenge.platform !== binding.platform) {
      throw new ServiceError('ACCOUNT_SCOPE_MISMATCH', 'Challenge belongs to another account', 403);
    }
    if (challenge.consumed) throw new ServiceError('CHALLENGE_ALREADY_USED', 'Challenge has already been submitted', 409);
    if (this.now() >= Date.parse(challenge.expiresAt)) {
      challenge.status = 'expired';
      challenge.consumed = true;
      throw new ServiceError('CHALLENGE_EXPIRED', 'Challenge has expired', 410);
    }
    return challenge;
  }

  consume(id, binding) {
    const challenge = this.require(id, binding);
    challenge.consumed = true;
    return challenge;
  }
}

class MemoryExchangeStore {
  constructor({ now = () => Date.now(), ttlMs = 30000 } = {}) { this.now = now; this.ttlMs = ttlMs; this.records = new Map(); this.results = new Map(); }

  issue(value) {
    const token = `xchg_${randomUUID()}`;
    this.records.set(token, { value, expiresAt: this.now() + this.ttlMs, consumed: false });
    return { token, expiresAt: new Date(this.now() + this.ttlMs).toISOString() };
  }

  consume(token) {
    const record = this.records.get(token);
    if (!record || record.consumed) throw new ServiceError('EXCHANGE_INVALID', 'Exchange token is invalid or already used', 409);
    if (this.now() >= record.expiresAt) {
      this.records.delete(token);
      throw new ServiceError('EXCHANGE_EXPIRED', 'Exchange token has expired', 410);
    }
    record.consumed = true;
    this.records.delete(token);
    return record.value;
  }

  resultKey(binding) { return `${binding.sourceId}:${binding.accountId}:${binding.platform}`; }

  storeResult(binding, result) {
    const apiToken = result?.apiToken || result?.accessToken;
    if (typeof apiToken !== 'string' || !apiToken) throw new ServiceError('AUTH_RESULT_INVALID', 'Login result did not include an API token', 502);
    this.results.set(this.resultKey(binding), {
      apiToken,
      expiresAt: result.expiresAt || null,
      validUntil: this.now() + this.ttlMs
    });
  }

  claimResult(binding) {
    const key = this.resultKey(binding);
    const record = this.results.get(key);
    if (!record) throw new ServiceError('AUTH_RESULT_NOT_FOUND', 'Login result is missing or already claimed', 409);
    this.results.delete(key);
    if (this.now() >= record.validUntil) throw new ServiceError('AUTH_RESULT_EXPIRED', 'Login result has expired', 410);
    return { apiToken: record.apiToken, expiresAt: record.expiresAt };
  }

  clearResult(binding) { this.results.delete(this.resultKey(binding)); }
}

module.exports = { MemoryChallengeStore, MemoryExchangeStore, MemorySessionStore };
