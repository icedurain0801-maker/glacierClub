const crypto = require('node:crypto');
class DingTalkNotifier {
  constructor(env = process.env) { this.enabled = env.DINGTALK_ENABLED === 'true' || env.DINGTALK_ENABLED === '1'; this.webhook = env.DINGTALK_WEBHOOK || ''; this.secret = env.DINGTALK_SECRET || ''; }
  async notify(alert) {
    if (!this.enabled || !this.webhook) { const error = new Error('DINGTALK_NOT_CONFIGURED'); error.code = 'DINGTALK_NOT_CONFIGURED'; throw error; }
    const timestamp = Date.now(); const sign = this.secret ? crypto.createHmac('sha256', this.secret).update(`${timestamp}\n${this.secret}`).digest('base64') : '';
    const url = new URL(this.webhook); url.searchParams.set('timestamp', timestamp); if (sign) url.searchParams.set('sign', sign);
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ msgtype: 'markdown', markdown: { title: alert.title, text: `### ${alert.title}\n\n${alert.triggerDetail}` } }), signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`DINGTALK_HTTP_${response.status}`);
    return response.json();
  }
}
module.exports = { DingTalkNotifier };
