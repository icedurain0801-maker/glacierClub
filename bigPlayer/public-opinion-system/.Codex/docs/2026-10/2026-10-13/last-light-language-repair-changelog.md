# Last Light 多语言采集修复

Status: 发布完成，真实补采验收通过

## 原因和修复

旧独立采集包只读取 URL 的 `lang`，三个站点均带 `lang=en-US`，忽略实际区分语种的 `languageId`，导致三个子任务返回相同内容。官方配置确定 `2=en-US`、`9=ko-KR`、`16=ja-jp`。

独立包接入已有 `q1LanguageResolver.js`，依据官方公开配置解析 languageId 并设置 Content-Language；配置缓存、超时和错误处理沿用已验证实现，不回退到错误语种。

## 发布

- 旧包：`C:/ProgramData/PublicOpinion/overseas-daily/releases/overseas-release-20261012-configured-schedule-r1`
- 新包：`C:/ProgramData/PublicOpinion/overseas-daily/releases/overseas-release-20261013-language-context-r2`
- 仅四个文件改变：`server/src/connectors/q1LanguageResolver.js`、`server/src/connectors/bigPlayerH5Connector.js`、`shared-exclusion.json`、`worker/last-night-overseas-daily.cmd`。
- 共享排除校验原来绑定过期 Worker 包，本轮更新到实际运行包，保持原有五个文件排除规则及进程校验。
- Windows 任务 `BigPlayer Last Night Overseas Daily 02` 仅改变 action 的运行包路径和工作目录；触发器、principal、settings、隐藏启动均保持一致。
- 不重启共享 Worker/API/前端，不送入共享采集队列，不执行迁移、不删数据。
- task XML 回滚备份：仓库根 `.temp/last-light-language-repair/task-before.xml`；新 XML 同目录 `task-after.xml`。

## 验证

- 新独立包实际连接器 8 项测试和断点/窗口 2 项测试全部通过，包含实际等待 11 秒的语言配置慢响应测试。
- 运行包 406 文件 manifest、JS 语法和依赖闭包校验通过，比较旧包只有上述四文件不同。
- preflight 三站点通过，无网络请求/数据库写入。
- 真实只读样本：英语20条、韩语20条、日语11条，header分别为 en-US/ko-KR/ja-jp，三组 ID 不同，韩语/日语正文有相应文字。
- 证据：`.tests/2026-10/2026-10-13/last-light-language-fixed-probe.json`。

## 真实补采

独立包 `main(['--execute'], {refreshToday:true})`，保留授权、租约、去重和断点规则。窗口北京时间 10/12 00:00 至 10/13 18:21:36。父任务 `0f558029-236b-5fcf-a388-2ff4bc4bb86d`。

首次执行在授权检查阶段返回 `Q1_SITE_AUTH_REJECTED`，无内容写入；同凭据随后只读授权成功，通过原有断点机制重试。后续韩语站语言配置查询达到10秒超时；生产请求包含每次共享 Worker 校验和代理请求，实测校验约3.2秒、公开配置请求约6.5秒。r2 在使用海外站点会话时让语言解析沿用配置的请求上限（最大60秒），常规连接器保持默认10秒，TLS验证及代理单次15秒上限不变。新包重新验证及 preflight 后切换并从原断点继续。

最终父任务及三个子任务均 completed，error_code 全部为空。处理52条，新增37条；英语29条（新增14）、韩语19条（新增19）、日语4条（新增4）。三站内容ID无重叠，19条韩语正文含韩文、4条日语正文含假名。

| 北京日期 | 英语 | 韩语 | 日语 | 合计 |
|---|---:|---:|---:|---:|
| 2026-10-12 | 17 | 6 | 2 | 25 |
| 2026-10-13 | 12 | 13 | 2 | 27 |

验收脚本退出码0，明细位于 `.tests/2026-10/2026-10-13/last-light-language-acceptance.json`。上述时间窗口之外的历史未执行清理或回溯补采；AI未在本次独立采集进程内执行，沿用原有分析/翻译任务机制。

API、前端3001和共享Worker服务均Running，任务action核对为r2，02/08/14/20及原检查触发均保留。没有执行Git提交或推送。

本独立入口原本仅采集帖子/动态，本轮未扩展评论采集。
