'use strict';

const { ServiceError } = require('../errors');

class BaseLoginAdapter {
  constructor(platform) { this.platform = platform; }
  async login() { throw new ServiceError('CAPABILITY_UNSUPPORTED', `${this.platform} login adapter is not configured`, 400); }
  async submitChallenge() { throw new ServiceError('CAPABILITY_UNSUPPORTED', `${this.platform} challenge submission is not configured`, 400); }
  async pollChallenge() { throw new ServiceError('CAPABILITY_UNSUPPORTED', `${this.platform} challenge polling is not configured`, 400); }
}

module.exports = { BaseLoginAdapter };
