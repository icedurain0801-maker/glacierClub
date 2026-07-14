// imageExtractor 单元测试:验证 drawing anchor 解析能精确定位图片所属行。
// 运行: node test/imageExtractor.test.js
require('dotenv').config();
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const imageExtractor = require('../src/services/imageExtractor');

async function main() {
  let passed = 0;
  const test = async (name, fn) => { await fn(); console.log(`  ✓ ${name}`); passed++; };

  const samplePath = path.join(__dirname, 'fixtures', 'sample_with_images.xlsx');
  if (!fs.existsSync(samplePath)) {
    require('./fixtures/generateWithImages');
  }

  try {
    let result;
    await test('extract() 返回按行分组的图片', async () => {
      result = await imageExtractor.extract(samplePath);
      // rowIndex 是从 1 开始的数据行号(表头之后第1行=1)
      // 数据行: 1=亚瑟(无图) 2=妲己(1图,0-based anchor row=2) 3=后羿(2图) 4=庄周(无图)
      assert.ok(result instanceof Map, 'extract 应返回 Map');
    });

    await test('无图行不在结果里', async () => {
      assert.strictEqual(result.has(1), false, '亚瑟行(rowIndex=1)应无图片');
      assert.strictEqual(result.has(4), false, '庄周行(rowIndex=4)应无图片');
    });

    await test('单图行返回1张', async () => {
      const imgs = result.get(2);
      assert.ok(imgs, '妲己行(rowIndex=2)应有图片');
      assert.strictEqual(imgs.length, 1);
      assert.ok(Buffer.isBuffer(imgs[0].buffer));
      assert.strictEqual(imgs[0].ext, 'png');
    });

    await test('多图行返回2张', async () => {
      const imgs = result.get(3);
      assert.ok(imgs, '后羿行(rowIndex=3)应有图片');
      assert.strictEqual(imgs.length, 2);
    });

    await test('物理文件名与逻辑顺序不一致时仍正确解析第一个sheet', async () => {
      const reorderedPath = path.join(__dirname, 'fixtures', 'sample_reordered_sheet.xlsx');
      if (!fs.existsSync(reorderedPath)) {
        require('./fixtures/generateReorderedSheet');
      }
      const reorderedResult = await imageExtractor.extract(reorderedPath);
      // 逻辑第一个 sheet 是"英雄表"(物理文件 sheet2.xml),图锚定在数据行1(亚瑟)
      assert.strictEqual(reorderedResult.size, 1, '应该找到1行有图片(从逻辑第一个sheet,而非硬编码的sheet1.xml)');
      assert.ok(reorderedResult.has(1), '亚瑟行(rowIndex=1)应有图片');
    });

    console.log(`\n${passed} 个测试全部通过`);
  } catch (err) {
    console.error('\n✗ 测试失败：', err.stack || err.message);
    process.exitCode = 1;
  }
}

main();
