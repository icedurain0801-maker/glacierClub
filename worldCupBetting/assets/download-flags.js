#!/usr/bin/env node
/**
 * 国旗预下载脚本
 * 用法：node assets/download-flags.js
 * 来源：flagcdn.com（公共域 / 免费）
 *
 * 当需要新增队伍或刷新国旗版本时运行。
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// ISO alpha-2 代码清单（覆盖 2026 世界杯 48 强 + 常见队 + 子区代码）
const CODES = [
  // 12 组 48 队（ISO alpha-2）
  'mx', 'za', 'kr', 'cz',
  'ca', 'ba', 'qa', 'ch',
  'br', 'ma', 'ht', 'gb-sct',
  'us', 'py', 'au', 'tr',
  'de', 'cw', 'ci', 'ec',
  'nl', 'jp', 'se', 'tn',
  'be', 'eg', 'ir', 'nz',
  'es', 'cv', 'sa', 'uy',
  'fr', 'sn', 'iq', 'no',
  'ar', 'dz', 'at', 'jo',
  'pt', 'cd', 'uz', 'co',
  'gb-eng', 'hr', 'gh', 'pa',
  // 常用扩展
  'it', 'gb', 'ru', 'ua', 'pl', 'dk', 'ng', 'cm', 'jm',
];

const DEST = path.resolve(__dirname, 'flags');
if (!fs.existsSync(DEST)) fs.mkdirSync(DEST, { recursive: true });

function downloadOne(code) {
  return new Promise((resolve, reject) => {
    const url = `https://flagcdn.com/${code}.svg`;
    const out = path.join(DEST, `${code}.svg`);
    const file = fs.createWriteStream(out);
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        fs.unlinkSync(out);
        return reject(new Error(`${code} -> ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve(code)));
    }).on('error', reject);
  });
}

(async () => {
  let ok = 0, fail = 0;
  for (const code of CODES) {
    try { await downloadOne(code); ok++; process.stdout.write('.'); }
    catch (e) { fail++; console.error('\nFAIL', code, e.message); }
  }
  console.log(`\nDone: ${ok} ok, ${fail} fail, saved to ${DEST}`);
})();
