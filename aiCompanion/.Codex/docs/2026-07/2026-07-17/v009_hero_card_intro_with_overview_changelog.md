# v009 英雄卡片前置文案补充评价

## 变更时间
- 2026-07-17

## 变更内容
- 调整英雄卡片回复的前置文案生成逻辑。
- 当用户问题包含“咋样 / 怎么样 / 如何 / 评价 / 值不值得练 / 好用吗”等评价意图时，不再只返回固定说明文案。
- 保持英雄卡片结构不变，在卡片上方补充一段简短的英雄评价摘要。

## 涉及文件
- `server/src/services/heroCardService.js`
- `server/test/heroCardService.test.js`

## 处理结果
- 类似“索尼克咋样”“评价一下索尼克”会返回：
  - 英雄档案说明
  - 简短评价摘要
  - herocard 卡片
- 技能类、台词类查询仍保留原有更贴近字段的问题描述。

## 验证
- `node --check server/src/services/heroCardService.js`
- 本地脚本校验 `buildHeroCardLeadText('索尼克咋样')` 已包含“整体评价”
- `http://127.0.0.1:3100/api/ping` 返回正常
