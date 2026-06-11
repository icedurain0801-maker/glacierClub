export function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined || v === '') return true;
  if (Array.isArray(v) && v.length === 0) return true;
  if (typeof v === 'object' && Object.keys(v as object).length === 0) return true;
  return false;
}

const EMOJI_RE =
  /(?:[✀-➿]|(?:\ud83c[\udde6-\uddff]){2}|[\ud800-\udbff][\udc00-\udfff]|[#-9]️?⃣|㊙|㊗|〽|〰|Ⓜ|\ud83c[\udd70-\udd71]|\ud83c[\udd7e-\udd7f]|🆎|\ud83c[\udd91-\udd9a]|\ud83c[\udde6-\uddff]|[\ud83c\ud83d][\udd80-\udd99]|\ud83c[\udf00-\udfff]|\ud83d[\udc00-\udeff]|\ud83e[\udd00-\uddff])/;

export function hasEmoji(input: string): boolean {
  return EMOJI_RE.test(input);
}

export const inputEmojiRule = {
  validator: (_: unknown, value: string) => {
    if (value && hasEmoji(value)) return Promise.reject(new Error('不支持输入 emoji'));
    return Promise.resolve();
  },
};

export function queryStringToObject(qs: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(qs));
}

export function disabledRangeTime2(_v: unknown, type: 'start' | 'end') {
  return {};
}

export function formatToUtc(input: string | Date): string {
  if (!input) return '';
  return new Date(input).toISOString();
}

export function html2Text(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

// 精确加减乘除（避免浮点精度问题）
export function accMultiply(a: number, b: number): number {
  const sa = String(a), sb = String(b);
  const da = (sa.split('.')[1] || '').length;
  const db = (sb.split('.')[1] || '').length;
  const m = Math.pow(10, da + db);
  return (Math.round(a * Math.pow(10, da)) * Math.round(b * Math.pow(10, db))) / m;
}

export function accDivision(a: number, b: number): number {
  const sa = String(a), sb = String(b);
  const da = (sa.split('.')[1] || '').length;
  const db = (sb.split('.')[1] || '').length;
  return (Math.round(a * Math.pow(10, da)) / Math.round(b * Math.pow(10, db))) * Math.pow(10, db - da);
}
