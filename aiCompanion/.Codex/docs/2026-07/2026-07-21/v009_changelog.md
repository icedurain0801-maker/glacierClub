# v009 变更记录

## 变更内容

- 修正英雄卡阵营/职业图标选择规则：
  - 阵营图标优先选择英雄档案图片命名中的 `row=4` 行。
  - 职业图标优先选择英雄档案图片命名中的 `row=5` 行。
- 当图片尺寸暂时无法读取时，仍允许根据图片文件名里的行列号完成选择，避免退回第一张图导致阵营、职业图标混用。
- 补充回归测试，覆盖同一组图片中“阵营取 `*_4_6_*`、职业取 `*_5_6_*`”的场景。

## 验证

- `node server/test/heroCardService.test.js`
- `node server/test/heroCardService.regression.test.js`
- `node server/test/heroCardService.spriteCrop.test.js`
- `node server/test/chatService.test.js`
- `Invoke-WebRequest http://127.0.0.1:3100/api/ping`
- Playwright 打开 `http://127.0.0.1:8080/chat.html?versionId=1`，查询“介绍一下麦克斯”，截图确认英雄卡正常显示，阵营“游猎”使用 `/kb-images/1/75/10_4_6_1.png`，职业使用 `/kb-images/1/75/10_5_6_1.png`。
