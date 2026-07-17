# v003 脚本测试功能变更说明

## 变更概述

本次在机器人管理后台新增“脚本测试”功能，用于模拟真实游戏玩家和 AI 机器人进行多轮对话，支持按场景类型、提问模式、主题补充和对话轮数发起测试。

## 本次交付

1. 后端新增脚本测试服务 `server/src/services/chatSimulation.js`
2. 后端新增管理接口 `GET /api/simulations/meta`、`POST /api/simulations/chat`
3. 后台新增“脚本测试”页面 `web/js/pages/simulations.js`
4. 新增命令行脚本 `npm run test:simulator`
5. 新增基础测试 `npm run test:simulation`

## 功能说明

- 支持按“新手入门 / 阵容搭配 / 资源养成 / 活动奖励 / 付费性价比 / 连续追问压测”六类脚本发起模拟
- 支持选择“独立问题 / 连续追问”两种提问模式
- 连续追问模式会基于上一轮问答继续追问，适合验证机器人在多轮上下文里的稳定性和一致性
- 支持自定义主题补充，例如角色名、活动名、游戏名
- 支持控制对话轮数，默认 4 轮，最大 12 轮
- 所有模拟消息走真实聊天链路，结果会写入 `chat_sessions`、`chat_messages`、`chat_message_scores`
- 执行完成后可直接在“会话管理”和“对话质量评分”模块查看对应数据

## 使用方式

### 后台页面

进入后台后选择“脚本测试”，配置场景、提问模式、轮数和主题后点击“开始模拟”即可。

### 命令行

```bash
npm run test:simulator -- --scenario=mixed_pressure --mode=continuous --turns=4 --topic=新服开局
```

可选参数：

- `--scenario`：场景 key
- `--mode`：提问模式，`independent` / `continuous`
- `--turns`：轮数
- `--topic`：主题补充
- `--version`：指定版本 ID

## 影响范围

- 后端路由注册：`server/src/app.js`
- 后端服务层：`server/src/services/chatSimulation.js`
- 后端路由层：`server/src/routes/simulations.js`
- 后台菜单与页面入口：`web/admin.html`、`web/js/app.js`
- 页面样式：`web/css/style.css`

## 风险说明

- 脚本测试走真实模型和知识库链路，执行时间与当前模型响应速度、评分速度直接相关
- 若当前 LLM / 检索配置异常，模拟会同步失败，便于直接暴露真实问题
