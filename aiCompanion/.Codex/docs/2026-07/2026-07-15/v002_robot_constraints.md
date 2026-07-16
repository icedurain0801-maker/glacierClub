# 2026-07-15 机器人全局约束接入

## 本次目标

- 将 C 端机器人的统一回答约束收敛到单一 markdown 文件
- 让所有版本机器人在回答时都遵守这份全局约束
- 新建一个项目专用 skill，后续只要说“更新一下机器人约束”，就先询问要写回哪些 C 端修改，再更新同一份约束文件

## 产出物

- 全局约束文件：`server/prompts/c-end-robot-constraints.md`
- skill：`C:\Users\Administrator\AppData\Roaming\Code\User\project manage\.agents\skills\robot-constraints-updater\SKILL.md`

## 落地说明

- 后端在 `server/src/services/chatService.js` 中读取约束文件里 `PROMPT_RULES_START / PROMPT_RULES_END` 之间的内容，并拼入所有版本共用的 system prompt。
- 各版本独立人设继续保留，但优先级低于这份全局约束。
- 维护记录仍放在同一份 markdown 中，避免全局约束和维护痕迹分散到多处。
