'use strict';

const { BaseLoginAdapter } = require('./baseAdapter');
const { ServiceError } = require('../errors');

const CHALLENGES = {
  sms_code: { type: 'sms_code', instruction: 'Enter the SMS verification code', allowsTextSubmission: true, expectedAnswer: '123456' },
  image_captcha: { type: 'image_captcha', instruction: 'Enter the characters shown in the image', allowsTextSubmission: true, expectedAnswer: 'ABCD', displayRef: 'mock://captcha/image' },
  qr_code: { type: 'qr_code', instruction: 'Scan the QR code with the platform app', requiresPolling: true, displayRef: 'mock://qr/login' },
  device_confirmation: { type: 'device_confirmation', instruction: 'Approve this login on the trusted device', requiresPolling: true }
};

class MockSocialLoginAdapter extends BaseLoginAdapter {
  constructor() { super('mock'); }

  async login({ scenario = 'success' } = {}) {
    if (scenario === 'success') return { kind: 'success' };
    if (scenario === 'invalid_credentials') return { kind: 'failure', code: 'INVALID_CREDENTIALS' };
    if (scenario === 'session_expired') return { kind: 'failure', code: 'SESSION_EXPIRED' };
    if (scenario === 'relogin') return { kind: 'success' };
    if (CHALLENGES[scenario]) return { kind: 'challenge', challenge: CHALLENGES[scenario] };
    throw new ServiceError('MOCK_SCENARIO_UNSUPPORTED', 'Unsupported mock login scenario', 400);
  }

  async submitChallenge({ challenge, answer }) {
    return { approved: answer === challenge.expectedAnswer };
  }

  async pollChallenge({ approved = false }) { return { approved: approved === true }; }
}

module.exports = { MockSocialLoginAdapter };
