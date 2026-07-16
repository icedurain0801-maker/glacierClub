# v007 changelog

## 背景
- 英雄详情卡中“角色职业”取错字段，前端把 Excel 里的职业说明文案误当成职业本身展示，出现“能承受更多伤害”这类错误内容。

## 本次修改
- `server/src/services/heroCardService.js`
  - 在详情字段收集阶段补充提取 `careerIconUrl`。
  - 英雄卡 payload 新增 `careerIconUrl` 字段，供 C 端卡片直接消费。
- `web/js/chat.js`
  - 英雄卡头部改为优先展示职业图标。
  - 仅在没有职业图标时才回退展示职业文本，避免把说明文案错误显示成职业。
- `web/css/style.css`
  - 新增职业图标标签样式，保持头部信息紧凑。
- `server/test/heroCardService.test.js`
  - 重写为 UTF-8 测试用例，并补充职业图标字段断言。

## 验证
- `node server/test/heroCardService.test.js`
- `node --check server/src/services/heroCardService.js`
- `node --check web/js/chat.js`

## 运行状态
- 已重启后端服务，`http://localhost:3100/api/ping` 返回正常。
