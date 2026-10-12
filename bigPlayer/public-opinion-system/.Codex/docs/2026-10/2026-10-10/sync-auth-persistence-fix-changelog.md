# 保存、授权与同步凭据闭环修复

Status: 已上线；真实授权、同步及最终只读页面验收全部通过

## 根因与范围

用户点击开始同步报 internal server error，历史任务错误 CREDENTIAL_NOT_FOUND。API 账密授权取得 Token 后仅返回内存使用结果，未加密保存账号 api_token；Repository 手动同步准入及现役 Worker 都要求该账号 Token，因此“已授权”仍不能同步。

本轮采用既有 Token 同步合同：成功账密登录在共享 CredentialContext 中验证账号与来源绑定，使用 AES-256-GCM 和账号/类型/平台 AAD 加密保存领取的 API Token。失败、过期结果或加密配置缺失不保存、不宣称授权成功。不同社区使用自己的 source/account/board/URL 参数，无新增社区专属硬编码。

修改文件：

- `server/src/services/credentialContext.js`：新增 saveApiAuthorization，绑定校验、有效期检查、加密及保存结果检查。
- `server/src/connectors/bigPlayerH5Connector.js`：账密授权成功调用共享保存，覆盖来源授权、能力检测、开始同步的授权探测。
- `server/src/db/repository.js`：upsertAccountCredential 增加可选 replaceExpireAt，仅新领取授权显式替换旧有效期；避免旧过期时间被 COALESCE 保留。
- `server/src/app.js`：同步凭据错误提供安全中文修复提示。
- `../admin/PublicOpinion/assets/sources.js`：明确 4xx 失败不读取旧任务冒充成功；仅结果未知时打开同来源活跃任务，文案明确本次提交未确认，禁止自动重试。
- `../admin/PublicOpinion/sources.html`：资源版本 v214。

保留 Repository Token 准入、账号/来源归属、社区/来源启停、有效期、队列/检查点和调度锁规则。现役 Worker 继续读取加密 Token，无需切换 Worker，不影响其他任务。

## 自测

222 项隔离测试通过：新多社区链路7、Repository153、授权契约6、草稿11、来源状态24、候选登录路由8、连接器13。

多社区链路使用三个不同 community/game/board/account，执行候选真实 app.handler 创建、授权、能力检测、真实 Repository 同步 SQL 构造及现役 Worker checkAuthorization、listQ1Posts。DB 和外部接口模拟，护栏无拒绝，不读取生产 env 或真实业务库。

Edge 浏览器4种场景通过：成功入队、凭据401、超时后旧失败任务、超时后现有活跃任务。均单POST，失败不误报成功；派生 Token 不改变账密表单回显。无真实网络请求。

API395文件与前端33文件 manifest 校验通过；仅6个运行文件改变，基于现役 release 提取必要函数，不带工作区其他改动。

## 部署与验收计划

候选：仓库根 `.temp/sync-auth-persistence-fix-20261010/`，含候选、candidate.json、apply-runtime.ps1、浏览器证据。
API基线 release-20261010-capability-probe-fix，目标 release-20261010-sync-auth-persistence-fix；前端基线 release-20261010-capability-v213，目标 release-20261010-sync-auth-v214。

切换脚本检查基线、校验候选、备份XML、授予LocalService RX，依次重启API4320和前端3001并检查健康；失败自动恢复旧配置与旧包。Worker、登录服务、分析服务不切换、不重启；不迁移数据库、不修改凭据配置。

等待用户本轮授权后通过 sync-auth-runtime-acceptance.cjs --approved-one-sync 进行一次账密授权并保存授权Token，再外网点击一次增量同步，监测执行终态和安全计数。首次增量可能按既有策略回补近7天；采集内容入库后会进入系统原有分析和通知规则，不能承诺“只采集不分析”。不新增真实社区、不重复提交。

## 边界

隔离多社区自测证明已有 BigPlayer 平台通用参数链路成立，当前来源真实授权与同步验收通过。有效账密、合法站点参数、平台可访问范围是必要条件；验证码、外部平台停机、权限不足必须真实反馈，不能保证任意参数都授权成功。其他平台或新协议接入仍须按各平台合同处理。

## 实际验收与登录补修

用户回复“确认”后，API和前端切换成功并健康。三层页面、8项静态资源和候选哈希通过。首次真实 check-auth 返回 HTTP200、unauthorized、LOGIN_FRAME_NOT_FOUND，耗时2431ms；尚未发出同步POST。

只读浏览器核对：页面load时导航尚可能未就绪，稍后可显示“我的”；点击后“去登录”正常显示。登录自动化在load后立即判断入口，存在渲染时序缺陷。补修 login-session-service/src/adapters/bigPlayerH5Playwright.js 的入口等待，限定最多10秒，再按现有流程查登录Frame。不更换账号、不绕过验证码、不扫描任意其他网站。

登录补修候选 `.temp/sync-auth-persistence-fix-20261010/login-release`，相对现役 login-session-4311-20260921-2330h 仅一个运行文件变化、manifest通过。新增延迟渲染隔离测试通过。既有service测试首次18/19：旧mock缺isVisible，补齐真实Locator方法后再跑；业务没有为mock降级。准备apply-login-runtime.ps1，备份XML、切换登录服务、健康失败回滚；此服务切换超出前次确认范围，等待单独确认及一次重新授权后继续原定单次同步。

登录补修回归最终19/19通过，候选延迟渲染测试1/1通过，护栏拒绝为空。单独切换登录服务弹窗已发出，当前等待用户确认，未重启登录服务、未再次授权、未提交同步。

用户确认切换登录服务后，login-session-20261010-entry-ready 启动健康通过。重新授权 HTTP200、authorized、reason=null，14874ms；来源 GET 确认 hasToken=true、hasAccountPassword=true。一次同步POST返回503、UNIFIED_SCHEDULER_SCHEMA_NOT_READY，15224ms，无runId。

只读 Repository schema 检查所有基础表结构就绪；迁移027/028已应用，029未应用。po_sync_runs 的 site_url_snapshot、last_request_at 和 po_sync_runs_site_request_idx 均不存在。准备仅迁移029的脚本 apply-migration029.cjs：执行前保存SHOW CREATE TABLE，10秒锁等待限额，补两个可空字段和普通索引，核对定义后记录迁移，再检查调度准入。不会执行全量migrate、删除数据或变更既有唯一索引；DDL不可事务回滚，失败可能留下部分新增字段，保留可空字段比删除更安全。等待用户数据库迁移及一次补充同步验收确认。

用户确认029迁移后，迁移已完成并通过调度schema检查。补充同步返回ER_BAD_FIELD_ERROR：po_sync_runs缺community_id，事务回滚。现役Repository无条件写入030新增的版块元数据列，但未部署030且schema检查未要求030。为保留旧数据库合同，新增任务写入兼容：只从固定白名单追加实际存在的可选元数据列。单站与多站写入仍保留source/account/window及调度锁准入。api-compat-release相对现役仅Repository写入段变化；无/全/部分版块列三种候选真实SQL隔离测试3/3，manifest395文件通过。准备仅API切换脚本apply-api-compat.ps1，备份使用独立before-write-compat.xml，等待本轮切换及同步重验确认，不执行030或内容索引变更。

用户确认API写入兼容包后已切换健康。外网单次同步POST HTTP200，入队耗时27754ms，runId=57f95ed6-722e-4278-a225-2d1a023705b8。Worker终态completed_authorized_scope，errorCode=null，执行2026-10-10 18:16:05至18:16:32（数据库UTC10:16），新增260条，帖子读取计数260，评论计数280，任务汇总discovered972/stored970（口径不同，不合并宣称新增）。
浏览器严格验收因控制台错误停止，追加只读复现确认最新任务API拒收前端withScope附带regionCode/communityId，GET400导致进度恢复提示。补修app.js仅最新任务GET：允许固定范围参数，resolveCanonicalScope后校验source绑定，拒绝越界及未知参数。候选api-final-release仅app.js变化，395文件manifest通过；范围匹配/越界/非法参数隔离测试1/1。等待本轮只API切换弹窗确认，后续仅GET页面验收，绝不再次POST同步。

## 最终交付与验收

用户确认最后API切换后，API4320已切换至 `C:/ProgramData/PublicOpinion/releases/release-20261010-sync-status-scope` 并健康。前端3001现役为 `C:/ProgramData/PublicOpinion/frontend3001/releases/release-20261010-sync-auth-v214`；登录4311现役为 `C:/ProgramData/PublicOpinion/login-session-service/candidate-staging/login-session-20261010-entry-ready`。四项服务状态均为Running；Worker未切换、未重启。

最终 `sync-final-readonly-acceptance.cjs` PASS：本机、LAN、外网页面及各8项静态资源HTTP200，资源哈希匹配；浏览器控制台错误、HTTP失败、写请求均为空，账密模式正确，刷新后同步进度正常恢复。最后验收未再次授权、未提交同步、未触发采集。

真实任务 `57f95ed6-722e-4278-a225-2d1a023705b8` 已于北京时间2026-10-10 18:16:05至18:16:32完成，终态 `completed_authorized_scope`，errorCode为空，新增入库260条。授权成功且Token已加密保存。029迁移已完成；未执行030迁移，未删除数据或修改内容唯一索引。旧包和服务配置备份保留可回滚。

验证累计246项隔离测试及4种隔离浏览器场景通过，真实授权/同步与最终只读浏览器验收通过。证据保存在仓库根 `.temp/sync-auth-persistence-fix-20261010/runtime-acceptance.json` 和 `external-sync-fixed.png`。后续已有BigPlayer协议社区使用各自有效URL、版块与账号参数，走统一保存、授权和同步链路，无需逐社区增加硬编码；外部验证码及权限限制仍按实际结果处理。
