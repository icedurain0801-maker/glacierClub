'use strict';
const ECOSYSTEM_POLICY = '游戏生态风险优先规则：正文或本条附图明确宣传、招揽代充，或第三方账号、金币、皮肤、道具交易及游戏升级服务，属于严重破坏游戏生态，判L3，emergency=ecosystem_abuse。不能作为spam_ad噪声过滤，不要求先发生资损或投诉。官方充值、官方商城、普通咨询、禁止交易或劝阻交易的提醒不属于该风险。';
function ecosystemEvidence(text, quote) {
  if (typeof quote !== 'string' || !quote.trim() || !String(text).includes(quote)) return false;
  const value = quote.replace(/\\n/g, '\n').replace(/\s+/g, ' ');
  if (/(?:禁止|严禁|不要|勿|拒绝|警惕|抵制|远离|不提供|不支持).{0,25}(?:代充|交易|买卖|卖号)|\b(?:do not|don't|avoid|beware|prohibit(?:ed)?|no)\b.{0,40}(?:trad(?:e|ing)|top.?up|buy|sell)/i.test(value)) return false;
  if (/(?:官方|官网|游戏内).{0,20}(?:充值|商城|商店)|\bofficial\b.{0,30}(?:store|shop|top.?up)/i.test(value)) return false;
  const directOffer = /(?:代充|三方充值|第三方充值).{0,30}(?:服务|优惠|折扣|联系|出售|提供|接单|加我|低价)|(?:提供|承接|接单|低价|专业).{0,20}代充|(?:出售|售卖|收购|买卖|交易|售).{0,16}(?:账号|帐号|金币|皮肤|道具)|(?:账号|帐号|金币|皮肤|道具).{0,16}(?:出售|售卖|收购|买卖|交易)|\b(?:buy\s*(?:&|and|\/)?\s*sell|selling|for sale|cashout)\b.{0,100}(?:accounts?|coins?|skins?|items?|cash)|\b(?:venta|compra)\s*(?:y|and|&)\s*(?:venta|compra)\b|\b(?:venta|compra)\s+de\s+(?:coins?|cuentas?|items?|skins?)\b|\b(?:top[ -]?up|account\s+(?:selling|buying)|trade|cashout)\b|\bfull game upgrade package\b|\b(?:paquete completo de mejora de juegos|servicio de mejora para|play upgrades? for)\b|\b(?:third.party|discount(?:ed)?|cheap)\b.{0,30}\btop[ -]?up\b/i.test(value);
  if (directOffer) return true;
  const upgradeOffer = /\b(?:gaming\s+)?upgrade\s*(?:&|and|\+)?\s*premium\s+services?\b/i.test(value)
    && /(?:telegram|whatsapp|discord|wechat|line|联系|加我|私聊|dm|@[a-z0-9_.-]{3,})/i.test(value);
  if (upgradeOffer) return true;
  return /(?:账号|帐号|account).{0,60}(?:升级|资源|upgrade|付费|paid).{0,60}(?:服务|支持|service).{0,100}(?:联系方式|联系|telegram|whatsapp|discord|wechat|line|dm|@)/i.test(value)
    || /(?:升级|付费服务|付费支持|资源支持|账号恢复).{0,120}(?:telegram|whatsapp|discord|wechat|line|联系方式|联系|dm|@)/i.test(value);
}
function sourceQuote(text, quote) {
  if (typeof quote !== 'string' || !quote.trim()) return null;
  if (text.includes(quote)) return quote;
  const compact = value => value.replace(/\\n/g, '\n').replace(/\s+/g, ' ');
  const target = compact(quote), spans = []; let normalized = '';
  for (let i = 0; i < text.length; i++) { const literal = text[i] === '\\' && text[i + 1] === 'n'; const end = i + (literal ? 2 : 1); const char = literal || /\s/.test(text[i]) ? ' ' : text[i]; if (char === ' ' && normalized.endsWith(' ')) spans[spans.length - 1][1] = end; else { normalized += char; spans.push([i, end]); } if (literal) i++; }
  const index = normalized.indexOf(target); return index < 0 ? null : text.slice(spans[index][0], spans[index + target.length - 1][1]);
}
module.exports = { ECOSYSTEM_POLICY, ecosystemEvidence, sourceQuote };
