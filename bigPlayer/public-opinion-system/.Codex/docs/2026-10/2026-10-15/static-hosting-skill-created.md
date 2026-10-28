# 静态托管发布skill封装

Status: 已安装，格式和引用校验通过。

- 技能：`public-opinion-static-hosting-push`。
- 安装路径：`C:/Users/Administrator/.codex/skills/public-opinion-static-hosting-push/SKILL.md`。
- 触发：用户明确说“推送静态托管”“推到静态托管”或发布舆情前端到BaaS。
- 流程：冻结最新授权前端 → 真实DNS/TLS/SSO及全部页面接口 → 冻结包浏览器测试 → 独立环境及普通用户首次登录 → 包/hash校验 → 按授权和项目规则提交审批 → 正式入口复验。
- 写接口使用隔离数据/外部依赖模拟，真实只读接口需检查契约；无关后台接口和未授权真实业务写操作不扩展进发布任务。
- 不读hosts的无Cookie网络测试只算补充，不能替代独立浏览器/其他用户首次SSO；缺验证或失败均阻断上传。
- 发布状态必须区分准备好、待审批、已上线待复验、已上线并验证。
- 不自动push Git、不发后端、不改权限、不补发告警。
- 支持文件：`references/project-and-tools.md`、`references/release-evidence.md`、`agents/openai.yaml`。
- 验证：使用 skill-creator 的 `python -X utf8 .../quick_validate.py <skill-path>`，输出 `Skill is valid!`；引用文件存在，中文文件统一UTF-8，自动匹配保持默认启用。

本次只创建个人skill及本记录，没有触发托管上传、部署或Git提交/推送。流程验收是指令审查与格式验证，不代表已经执行一次完整独立用户部署演练。
