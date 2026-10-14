---
status: candidate_pending_independent_qa
scope: bigplayer_api_authorization_only
---

# BigPlayer API 授权模块变更记录

## 范围

- 新增账密优先的 API 授权契约：账密存在时仅通过 `LoginSessionClient` 获取临时授权；失败不回退历史 Token。
- 无账密时允许读取配置 Token；两者均无返回 `AUTHORIZATION_MISSING`。
- Q1 API 运行白名单收敛为 `club.q1.com`。
- 账密流程兼容真实 `LoginSessionClient`：先 `startLogin`，再 `claimAuthResult` 获取临时 API token。

## 排除范围

- 未恢复或接线旧 BigPlayer HTML 采集器。
- 未修改 worker 调度、repository、生产配置或数据库。
- 未创建真实 Run、未切换服务、未访问生产 DB。

## 验证

- 定向内存测试覆盖 AUTH-01 至 AUTH-04、HOST-01 至 HOST-02。
- 其余矩阵项仅复用既有定向基线或保持 `NOT_RUN`，不据此宣称端到端通过。
