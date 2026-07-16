const assert = require('assert');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const excelParser = require('../src/services/excelParser');

function buildWorkbook(filePath) {
  const wb = XLSX.utils.book_new();

  const wsTable = XLSX.utils.aoa_to_sheet([
    ['name', 'role'],
    ['Arthur', 'warrior', 'hidden extra text'],
    ['Daji', 'mage'],
  ]);

  const wsLayout = XLSX.utils.aoa_to_sheet([
    ['Hero Profile'],
    ['Required Hero', 'Viper'],
    ['Rarity', 'S+'],
    [],
    ['Skill Notes'],
    ['Ultimate Skill', 'Toxic Field'],
  ]);
  wsLayout['!merges'] = [
    XLSX.utils.decode_range('A1:C1'),
    XLSX.utils.decode_range('A5:C5'),
  ];

  const wsTranspose = XLSX.utils.aoa_to_sheet([
    ['技能icon', 'icon-hero', 'icon-raid', 'icon-command'],
    ['技能名称', 'Hero Skills', 'Decisive Raid', 'Iron Command'],
    ['技能基础效果', 'Boost ally attack', 'Charge the front row', 'Raise team armor'],
    ['一星效果', 'ATK +5%', 'Damage +10%', 'Shield +5%'],
    ['二星效果', 'ATK +10%', 'Damage +20%', 'Shield +10%'],
  ]);

  XLSX.utils.book_append_sheet(wb, wsTable, 'heroes');
  XLSX.utils.book_append_sheet(wb, wsLayout, 'profile');
  XLSX.utils.book_append_sheet(wb, wsTranspose, 'skills');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  XLSX.writeFile(wb, filePath);
}

function main() {
  const filePath = path.join(__dirname, 'fixtures', 'parser_mixed_modes.xlsx');
  buildWorkbook(filePath);

  const parsed = excelParser.open(filePath);
  const rows = [...parsed.iterate()];

  assert.strictEqual(parsed.rowCount, 7);
  assert.strictEqual(parsed.sheets.length, 3);
  assert.strictEqual(parsed.sheets[0].mode, 'table');
  assert.strictEqual(parsed.sheets[1].mode, 'block');
  assert.strictEqual(parsed.sheets[2].mode, 'transpose');
  assert.deepStrictEqual(rows.map(r => r.rowIndex), [1, 2, 3, 4, 5, 6, 7], 'rowIndex should stay globally unique');

  const tableRow = rows.find(r => r.sheetName === 'heroes' && r.excelRow === 2);
  assert.ok(tableRow.content.includes('name: Arthur'), 'table rows should retain labeled values');
  assert.ok(tableRow.content.includes('C: hidden extra text'), 'cells beyond the header row must be retained');
  assert.strictEqual(tableRow.obj.__parseMode, 'table');

  const profileBlock = rows.find(r => r.sheetName === 'profile' && r.obj.__excelRowStart === 1);
  assert.ok(profileBlock, 'layout sheet should be parsed into blocks');
  assert.strictEqual(profileBlock.obj.__parseMode, 'block');
  assert.strictEqual(profileBlock.obj['Required Hero'], 'Viper');
  assert.strictEqual(profileBlock.obj.Rarity, 'S+');
  assert.ok(profileBlock.content.includes('Rows: 1-3'));

  const skillBlock = rows.find(r => r.sheetName === 'profile' && r.obj.__excelRowStart === 5);
  assert.ok(skillBlock.content.includes('Ultimate Skill: Toxic Field'));

  const transposedSkill = rows.find(r => r.sheetName === 'skills' && r.obj['技能名称'] === 'Decisive Raid');
  assert.ok(transposedSkill, 'transpose sheet should emit one row per skill column');
  assert.strictEqual(transposedSkill.obj.__parseMode, 'transpose');
  assert.strictEqual(transposedSkill.primaryCol, '技能名称');
  assert.strictEqual(transposedSkill.obj['技能基础效果'], 'Charge the front row');
  assert.strictEqual(transposedSkill.obj['一星效果'], 'Damage +10%');
  assert.strictEqual(transposedSkill.obj['二星效果'], 'Damage +20%');
  assert.strictEqual(transposedSkill.obj.__excelColLabel, 'C');
  assert.ok(transposedSkill.content.includes('Column: C'));

  console.log('excelParser tests passed');
}

main();
