# BigPlayer手动同步时间范围

Status: 已获用户确认并切换API；浏览器验收阻塞，任务未完成

用户要求“开始同步”由增量游标窗口改成北京时间昨天00:00到当前。对应截图及前文均为BigPlayer社区，本次覆盖境内及境外BigPlayer手动增量同步，不改变其他平台、自动调度频率或显式七天历史回溯。

数据库UTC admission_anchor作为任务上限；以固定UTC+8计算昨天零点并保存为UTC窗口下限。第一次与后续同步相同，不因成功游标缩窄窗口，各站点窗口保持一致。入队后窗口冻结，排队或执行不会延长上限。已经入队的旧任务不修改；重复内容沿用既有去重。

工作区修改：server/src/db/repository.js的effectiveBigPlayerWindow；server/test/repository.test.js补充跨零点、跨年、闰日、无游标/新游标、多站点期望。现有调用保留兼容的额外cursor实参，但窗口函数不使用游标。

最小候选：E:/CodexData/public-opinion/releases/release-20261019-manual-yesterday-api-r1，基于现役release-20261015-quality-reason-api-r4-combat-context-r3，只替换repository.js中的该函数。未带入Token续期、处理人等未发布工作区修改；运行包依赖为实体文件，432文件发布清单校验通过。

验证：工作区19项相关隔离测试通过；实际候选包34项断言通过，覆盖数据库事务生成的起止参数；语法及差异空白检查通过。所有测试不联网、不真实写库、不采集、不通知。

构建校验初次拒绝node_modules联接，已改为实体复制后通过；复制进行中曾提前执行候选测试导致缺依赖，复制完成后候选34项断言通过。

浏览器工具仍仅有MCP Apps且无可控页签，尚未完成实际页面验收。没有点击真实“开始同步”，避免创建未授权的采集/推送副作用。

待确认后仅切换API，短暂重启API，旧包保留可回退；不推Git、不发布BaaS、不修改现有任务窗口或重判历史。切换后需复查健康、前端连通与浏览器连接。

用户确认后API已切换，首次健康HTTP200，现役34项断言通过。后续连通检查见manual-window-live.json，不将HTTP检查当作浏览器验收。重置浏览器工具后仍仅MCP Apps空页签，iab不可用；已请用户恢复连接。未触发真实采集。

复查：API鉴权接口返回401（未携带身份的预期结果），后续health在2191ms返回200、database=ok；此前短时健康探测超时原因待确认，不能据此判定浏览器或全链路正常。用户回复重新连接后，getState/listBrowsers仍仅MCP Apps无页签。
