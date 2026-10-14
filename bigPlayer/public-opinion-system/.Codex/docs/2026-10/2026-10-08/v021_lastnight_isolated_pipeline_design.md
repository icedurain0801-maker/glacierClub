# Last Night 海外独立链路设计

Status: approved-direction-incremental-implementation
Date: 2026-10-08

## 边界

独立海外进程使用独立 MariaDB 433xx 实例、datadir、账号和专属表。共享 3306 只允许受控只读读取固定 Last Night source、账号及凭据；不调用共享 `runSource`、统一调度、`Q1AnalysisRunner` 或 `lastNightSiteAlignment`，不在共享表执行 029/030，不启停共享服务。实例启动需资源、端口、身份、时限和清理门禁。后台最终通过海外专属只读 API 查询独立库；未接通前不称最终完成。

## 流程

1. 只读核对 source/game/community/board/account、三站配置和现存 legacy URL。只在独立库记录三个不可变站点 URL 快照与映射；不改共享配置或历史身份。认证遵守账号密码优先、登录失败不回退 Token；无账号密码才允许 Token。若登录或刷新需写共享状态，失败关闭。
2. 海外专属调度取得独立库租约，固定 source 与半开时间窗，为三站分别记录 Run。复用现有 `BigPlayerH5Connector` 的 board、同源、分页和评论解析；以独立事务写页游标、内容唯一键、Run 证据及 AI outbox。窗口边界不完整时 Run 不得成功终态。
3. 独立 AI consumer 从海外 outbox 领取任务，调用未修改的 `AiAnalyzer.analyzeBatch`，分别保存 light/deep 结果。升级策略复用现有阈值与关键词规则，不能无声改变算法。

## 分段验收

第一段是假 connector、内存隔离 store 的三站分页/评论、重复运行幂等、outbox/fake AI 和共享仓储零写；第二段是全新 433xx 独立库真实事务、租约、唯一键与进程清理；第三段才是受控真实登录/API、入库、异步 AI 和后台只读检索。每段冻结 SHA 交独立 QA。任何共享写入、实例身份不符、认证回退或国内进程/哈希漂移都 `NO_GO`。
