# 多社区采集调度优化

Status: released

## 规则与实现

- 初始队列和运行中新增任务共用公平执行池。全局默认3个执行槽；同账号等待队列不占槽、同时仅执行一个站点，完成后接续下一站。账号数据库锁、扫描租约、任务租约及写入 fencing 保留。
- 现役 Worker 显式配置 WORKER_SOURCE_CONCURRENCY=3；新增账号/社区无需增加服务。
- BigPlayer 请求层按主机和凭据摘要分组，最多3路、同凭据串行、最小500ms间隔，并尊重429 Retry-After；摘要不输出凭据。现有单请求超时、采集断点及独立分析队列保留。
- 队列轮询包含 scheduled、scheduled_catchup、scheduled_site、manual，不再只接续手动任务。
- 成功领取任务时清除 SYNC_ACCOUNT_BUSY 与旧重试时间。前端排队用“等待账号空闲，自动接续采集”，运行中不展示遗留忙碌提示。
- 运行列表根据子任务最早开始时间显示父任务开始时间；不再以创建时间冒充开始时间，解决14点误显示22点。父任务显示状态随已启动子任务变为同步中；不绕过底层批次结束与审计流程。

## 文件

- shared/fairCollectionPool.js、shared/collectionRequestGate.js
- worker/src/worker.js
- server/src/connectors/bigPlayerH5Connector.js、server/src/db/repository.js
- ../admin/PublicOpinion/assets/collection-runs.js
- worker/test/fairCollectionPool.test.js

## 验证

- 模拟15社区45站点：真实runOnce入口与独立执行池测试均通过，全局最大3，无账号重叠；新增入队共享限额。
- 异常释放执行槽、同凭据串行、Retry-After等待、取消请求测试通过。
- 现役冻结运行包也执行45站点隔离回归，最大并发3、冲突0。
- 子站批次、租约丢失定向回归3项通过；语法及定向空白检查通过。
- 扩大worker回归共98项时96项通过、2项失败：deep without light_escalation trigger 的旧紧急告警预期；runOnce prefers queued run 的旧测试缺少必填窗口。本次不修改等级策略或削弱窗口约束，这两项尚未修复，不宣称全量通过。
- 可见Edge浏览器验证X-Clash和Last Light运行列表：父批次显示14点与同步中，等待任务显示中文说明，无页面JS错误。截图与记录在 .tests/2026-10/2026-10-15/fair-collection*。
- 发布后等待扫描租约自然过期；14:53 UTC+8，新Worker恢复扫描，Last Light原排队站点转running，error_code清空；两个社区分别持有自己的账号锁。
- 最终只读复核：三个服务均Running；Last Light该父批次已completed，原排队站点已completed_authorized_scope、error_code为空，记录抓取11条及评论38条；X-Clash仍持有自己的账号锁，尚未确认整轮完成。

## 运行边界

- 本次为基于当前现役包的定向叠加，未覆盖工作区其他尚未发布的采集/授权改动。旧运行包保留用于回退，未新增服务。
- 全局执行池/请求额度作用于统一Worker；跨进程准入仍依赖数据库扫描租约。未来增加实例时必须继续使用相同租约，禁止独立绕过共享调度。
- 15社区测试为模拟验收，不代表已用15个真实社区压测平台吞吐量。
- 历史混合时区数据未批量转换；本次列表使用真实开始时间，创建/提交时间的全面规范另需按写入来源核对。
