'use strict';
const crypto = require('node:crypto');
function imageUrls(media) {
  if (typeof media === 'string') { try { media = JSON.parse(media); } catch { media = []; } }
  return [...new Set((Array.isArray(media) ? media : []).filter(value => typeof value === 'string').filter(value => {
    try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443') && ['fbcdn.net','fbsbx.com'].some(host => u.hostname === host || u.hostname.endsWith('.'+host)); } catch { return false; }
  }))];
}
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const mediaHash = media => digest(imageUrls(media).map(value => { const u = new URL(value); return u.origin + u.pathname; }));
function evidenceText(content, evidence = content.facebookMediaEvidence) {
  if (!evidence || evidence.version !== 'facebook-image-v1' || evidence.status !== 'complete' || evidence.mediaHash !== mediaHash(content.media) || evidence.images?.length !== imageUrls(content.media).length) return '';
  return evidence.images.map((image,index) => `【本条附图${index+1}识别证据；不是玩家原文】\n图片文字：${image.text}\n可见画面：${image.description}`).join('\n');
}
function facebookWindow(now = Date.now()) {
  const end = new Date(now); const start = new Date(Math.floor((end.getTime()+8*3600000)/86400000)*86400000-8*3600000-86400000);
  return { publishedFrom:start, publishedTo:end };
}
module.exports = { imageUrls, mediaHash, evidenceText, facebookWindow };
