'use strict';

const { BaseLoginAdapter } = require('./baseAdapter');
const { ServiceError } = require('../errors');

class ContractLoginAdapter extends BaseLoginAdapter {
  constructor(platform, { automation = null } = {}) { super(platform); this.automation = automation; }
  readiness() {
    const missingMethods = ['login'].filter(name => typeof this.automation?.[name] !== 'function');
    return missingMethods.length ? { available: false, code: 'AUTOMATION_NOT_CONFIGURED', message: `${this.platform} login automation is not configured` } : { available: true };
  }
  method(name) { const method = this.automation?.[name]; if (typeof method !== 'function') throw new ServiceError('CAPABILITY_UNSUPPORTED', `${this.platform} login automation contract is not configured`, 400); return method.bind(this.automation); }
  normalize(result) {
    if (!result || !['success', 'failure', 'challenge'].includes(result.kind)) throw new ServiceError('ADAPTER_PROTOCOL_UNSUPPORTED', `${this.platform} login automation returned an unsupported result`, 502);
    if (result.kind === 'failure' && typeof result.code !== 'string') throw new ServiceError('ADAPTER_PROTOCOL_INVALID', `${this.platform} failure result must include a code`, 502);
    if (result.kind === 'success' && this.platform === 'bigplayer_h5' && typeof (result.apiToken || result.accessToken) !== 'string') return result;
    if (result.kind === 'challenge' && (!result.challenge || typeof result.challenge !== 'object')) throw new ServiceError('ADAPTER_PROTOCOL_INVALID', `${this.platform} challenge result is malformed`, 502);
    return result;
  }
  async login(input) { return this.normalize(await this.method('login')(input)); }
  async submitChallenge(input) { const result = await this.method('submitChallenge')(input); if (!result || typeof result.approved !== 'boolean') throw new ServiceError('ADAPTER_PROTOCOL_INVALID', `${this.platform} challenge result is malformed`, 502); return result; }
  async pollChallenge(input) { const result = await this.method('pollChallenge')(input); if (!result || typeof result.approved !== 'boolean') throw new ServiceError('ADAPTER_PROTOCOL_INVALID', `${this.platform} poll result is malformed`, 502); return result; }
  async disposeChallenge(input) { if (typeof this.automation?.disposeChallenge === 'function') await this.automation.disposeChallenge(input); }
}
class DouyinLoginAdapter extends ContractLoginAdapter { constructor(options = {}) { super('douyin', options); } }
class XiaohongshuLoginAdapter extends ContractLoginAdapter { constructor(options = {}) { super('xiaohongshu', options); } }
class BigPlayerH5LoginAdapter extends ContractLoginAdapter { constructor(options = {}) { super('bigplayer_h5', options); } }
module.exports = { BigPlayerH5LoginAdapter, ContractLoginAdapter, DouyinLoginAdapter, XiaohongshuLoginAdapter };
