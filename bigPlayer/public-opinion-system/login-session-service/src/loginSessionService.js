'use strict';

const { ServiceError } = require('./errors');
const { maskPhone } = require('./security');
const { STATES, transition } = require('./stateMachine');

function requireBinding(input = {}) {
  const binding = { sourceId: input.sourceId, accountId: input.accountId, platform: input.platform };
  if (!binding.sourceId || !binding.accountId || !binding.platform) {
    throw new ServiceError('BINDING_REQUIRED', 'sourceId, accountId and platform are required', 400);
  }
  return binding;
}

function publicChallenge(challenge) {
  return {
    id: challenge.id,
    type: challenge.type,
    status: challenge.status,
    createdAt: challenge.createdAt,
    expiresAt: challenge.expiresAt,
    displayRef: challenge.displayRef,
    instruction: challenge.instruction,
    allowsTextSubmission: challenge.allowsTextSubmission,
    requiresPolling: challenge.requiresPolling
  };
}

function publicSession(record) {
  return {
    sourceId: record.sourceId,
    accountId: record.accountId,
    platform: record.platform,
    status: record.status,
    credentialConfigured: Boolean(record.credentialRef),
    maskedPhone: record.maskedPhone || null,
    sessionRef: record.sessionRef || null,
    sessionCreatedAt: record.sessionCreatedAt || null,
    sessionExpiresAt: record.sessionExpiresAt || null,
    failureCode: record.failureCode || null,
    challengeId: record.challengeId || null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

class LoginSessionService {
  constructor({ sessionStore, challengeStore, exchangeStore, adapters, sessionTtlMs = 3600000, now = () => Date.now(), credentialResolver = null }) {
    this.sessionStore = sessionStore;
    this.challengeStore = challengeStore;
    this.exchangeStore = exchangeStore;
    this.adapters = adapters;
    this.sessionTtlMs = sessionTtlMs;
    this.now = now;
    this.credentialResolver = credentialResolver;
  }

  resolveCredential(input) {
    if (!this.credentialResolver) throw new ServiceError('CREDENTIAL_RESOLVER_NOT_CONFIGURED', 'Credential resolver is not configured', 503);
    return this.credentialResolver(input);
  }

  adapterFor(platform) {
    const adapter = this.adapters[platform];
    if (!adapter) throw new ServiceError('CAPABILITY_UNSUPPORTED', `No login adapter exists for ${platform}`, 400);
    return adapter;
  }

  bindAccount(input) {
    const binding = requireBinding(input);
    if (!input.credentialRef) throw new ServiceError('CREDENTIAL_REF_REQUIRED', 'credentialRef is required', 400);
    const record = this.sessionStore.createBinding({
      ...binding,
      credentialRef: input.credentialRef,
      maskedPhone: input.phone ? maskPhone(input.phone) : input.maskedPhone
    });
    return publicSession(record);
  }

  getStatus(input) {
    const record = this.sessionStore.requireBinding(requireBinding(input));
    if (record.status === STATES.ACTIVE && record.sessionExpiresAt && this.now() >= Date.parse(record.sessionExpiresAt)) {
      transition(record, STATES.EXPIRED, this.now());
      this.sessionStore.revoke(record);
      record.failureCode = 'SESSION_EXPIRED';
    }
    return publicSession(record);
  }

  async startLogin(input) {
    const binding = requireBinding(input);
    const record = this.sessionStore.requireBinding(binding);
    const adapter = this.adapterFor(binding.platform);

    if (input.scenario === 'relogin') {
      if (record.status === STATES.ACTIVE) transition(record, STATES.EXPIRED, this.now());
      if (record.status !== STATES.EXPIRED) {
        record.status = STATES.EXPIRED;
        record.updatedAt = new Date(this.now()).toISOString();
      }
      this.sessionStore.revoke(record);
      transition(record, STATES.VERIFYING, this.now());
    } else if ([STATES.ACTIVE, STATES.MANUAL, STATES.EXPIRED, STATES.RELOGIN, STATES.INVALID, STATES.REVOKED].includes(record.status)) {
      if (record.status === STATES.ACTIVE || record.status === STATES.MANUAL) {
        this.exchangeStore.clearResult(binding);
        this.sessionStore.revoke(record);
      }
      record.status = STATES.VERIFYING;
      record.challengeId = null;
      record.failureCode = null;
      record.updatedAt = new Date(this.now()).toISOString();
    } else {
      transition(record, STATES.VERIFYING, this.now());
    }
    const credentials = this.credentialResolver && binding.platform === 'bigplayer_h5' ? await this.credentialResolver({ ...binding, credentialType: 'account_password', credentialRef: record.credentialRef }) : null;
    const result = await adapter.login({ scenario: input.scenario, credentialRef: record.credentialRef, ...(credentials ? { ...binding, credentials } : {}) });
    try {
      return this.applyLoginResult(record, binding, result);
    } catch (error) {
      this.exchangeStore.clearResult(binding);
      this.sessionStore.revoke(record);
      record.status = STATES.EXPIRED;
      record.failureCode = error.code || 'LOGIN_FAILED';
      record.updatedAt = new Date(this.now()).toISOString();
      throw error;
    }
  }

  applyLoginResult(record, binding, result) {
    if (result.kind === 'success') {
      this.completeApprovedLogin(record, binding, result);
      return publicSession(record);
    }
    if (result.kind === 'failure') {
      const state = result.code === 'INVALID_CREDENTIALS' ? STATES.INVALID : STATES.EXPIRED;
      transition(record, state, this.now());
      this.sessionStore.revoke(record);
      record.failureCode = result.code;
      return publicSession(record);
    }
    if (result.kind === 'challenge') {
      transition(record, STATES.MANUAL, this.now());
      const challenge = this.challengeStore.create(binding, result.challenge);
      record.challengeId = challenge.id;
      return { ...publicSession(record), challenge: publicChallenge(challenge) };
    }
    throw new ServiceError('ADAPTER_RESULT_INVALID', 'Login adapter returned an invalid result', 502);
  }

  completeApprovedLogin(record, binding, result) {
    const token = result.apiToken || result.accessToken;
    if (record.platform === 'bigplayer_h5' && typeof token !== 'string') {
      throw new ServiceError('ADAPTER_RESULT_INVALID', 'BigPlayer login did not return an authorization token', 502);
    }
    if (token) this.exchangeStore.storeResult(binding, { ...result, apiToken: token });
    transition(record, STATES.ACTIVE, this.now());
    this.sessionStore.issueSession(record, this.sessionTtlMs);
  }

  getChallenge(input) {
    const binding = requireBinding(input);
    this.sessionStore.requireBinding(binding);
    return publicChallenge(this.challengeStore.require(input.challengeId, binding));
  }

  async submitChallenge(input) {
    const binding = requireBinding(input);
    const record = this.sessionStore.requireBinding(binding);
    const challenge = this.challengeStore.require(input.challengeId, binding);
    if (!challenge.allowsTextSubmission) throw new ServiceError('CHALLENGE_SUBMISSION_UNSUPPORTED', 'This challenge must be polled', 409);
    if (typeof input.answer !== 'string' || !input.answer) throw new ServiceError('CHALLENGE_ANSWER_REQUIRED', 'Challenge answer is required', 400);
    const result = await this.adapterFor(binding.platform).submitChallenge({ challenge, adapterChallengeRef: challenge.adapterChallengeRef, answer: input.answer });
    this.challengeStore.consume(input.challengeId, binding);
    if (!result.approved) {
      await this.adapterFor(binding.platform).disposeChallenge({ challenge, adapterChallengeRef: challenge.adapterChallengeRef }).catch(() => {});
      challenge.status = 'rejected';
      transition(record, STATES.EXPIRED, this.now());
      record.failureCode = 'CHALLENGE_REJECTED';
      return { ...publicSession(record), challenge: publicChallenge(challenge) };
    }
    challenge.status = 'approved';
    this.completeApprovedLogin(record, binding, result);
    return { ...publicSession(record), challenge: publicChallenge(challenge) };
  }

  async pollChallenge(input) {
    const binding = requireBinding(input);
    const record = this.sessionStore.requireBinding(binding);
    const challenge = this.challengeStore.require(input.challengeId, binding);
    if (!challenge.requiresPolling) throw new ServiceError('CHALLENGE_POLL_UNSUPPORTED', 'This challenge requires text submission', 409);
    const result = await this.adapterFor(binding.platform).pollChallenge({ challenge, adapterChallengeRef: challenge.adapterChallengeRef, approved: input.approved });
    if (!result.approved) return { ...publicSession(record), challenge: publicChallenge(challenge) };
    this.challengeStore.consume(input.challengeId, binding);
    challenge.status = 'approved';
    this.completeApprovedLogin(record, binding, result);
    return { ...publicSession(record), challenge: publicChallenge(challenge) };
  }

  getSessionReference(input) {
    const record = this.sessionStore.requireBinding(requireBinding(input));
    const status = this.getStatus(input);
    if (status.status !== STATES.ACTIVE || !record.sessionRef) {
      throw new ServiceError('SESSION_NOT_ACTIVE', 'No active session is available', 409);
    }
    return { sourceId: record.sourceId, accountId: record.accountId, platform: record.platform, sessionRef: record.sessionRef, expiresAt: record.sessionExpiresAt };
  }

  issueSessionReferenceExchange(input) {
    const reference = this.getSessionReference(input);
    const exchange = this.exchangeStore.issue(reference);
    return { exchangeToken: exchange.token, expiresAt: exchange.expiresAt };
  }

  exchangeSessionReference(input) {
    if (typeof input.exchangeToken !== 'string' || !input.exchangeToken) throw new ServiceError('EXCHANGE_TOKEN_REQUIRED', 'Exchange token is required', 400);
    return this.exchangeStore.consume(input.exchangeToken);
  }

  claimAuthResult(input) {
    const binding = requireBinding(input);
    this.sessionStore.requireBinding(binding);
    return this.exchangeStore.claimResult(binding);
  }

  revoke(input) {
    const binding = requireBinding(input);
    const record = this.sessionStore.requireBinding(binding);
    this.exchangeStore.clearResult(binding);
    this.sessionStore.revoke(record);
    record.challengeId = null;
    record.failureCode = null;
    record.status = STATES.REVOKED;
    record.updatedAt = new Date(this.now()).toISOString();
    return publicSession(record);
  }
}

module.exports = { LoginSessionService, publicChallenge, publicSession, requireBinding };
