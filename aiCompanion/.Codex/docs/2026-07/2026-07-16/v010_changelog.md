# v010 changelog

## 背景
- C 端英雄卡片中，薇珀的角色职业图标展示错误。
- 原因是 `角色职业` 行导入了多张图，第一张是横向合集图，真正应该展示的是后续拆出的单个职业图标。

## 本次修改
- `server/src/services/heroCardService.js`
  - 新增职业图标筛选逻辑：当职业行存在多图时，优先选择接近方形、尺寸符合图标特征的单图。
  - 保留兜底：没有可识别尺寸或只有一张图时，仍使用原来的第一张图，避免其他旧数据断图。
- `server/test/heroCardService.test.js`
  - 增加薇珀真实素材顺序的回归断言，确认 `/kb-images/1/69/1344_2.png` 被选为职业图标。

## 验证
- `node test/heroCardService.test.js`
- `node test/chatService.test.js`
- 使用真实库数据构建薇珀英雄卡，返回 `careerIconUrl: /kb-images/1/69/1344_2.png`。
