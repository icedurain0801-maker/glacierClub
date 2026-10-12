# 海外网络前具体数据库合同校验

Status: isolated-candidate; production NO_GO

- 新增 `worker/src/overseasBigPlayerNetworkContractVerifier.js`：每次先核冻结 manifest 绑定与 Journal，再以参数化只读 JOIN 验证当前 run/source/account/game/community/site、running 状态、租约 owner/epoch/live、窗口及配置/registry 启用站点。
- 不查询当前数据库缺少的 board/snapshot 列；board/URL 来自不可变合同、当前配置与 registry。URL hash 复用现有 Repository registry 写入算法 SHA256 URL 字节。
- 保留 PageStore/preflight 的 true 返回接口兼容；仅本具体 factory 全校验通过后返回 true。不把返回值当生产授权；任意 callback true 的误接线风险仍需候选 factory 闭合。
- 新网络拒绝 pausing/cancelling；已在途页继续由 PageStore 事务 fence 保护。
- 本模块尚不默认接入 buildDeps，不改变现役消费者。合同首次创建/恢复生命周期、完整 drain、观察提交恢复和第二源修复仍待完成。

主链已接本具体 verifier 和真实文件 Journal，不再用 async true 替代 verifier；DB JOIN和HTTP仍离线fixture。验证具体状态漂移、缺失Journal前零DB查询、SQL只读，以及页提交后下游AI/翻译INSERT仍各一次。初轮12/12 PASS。

本地员工审查后修复：deleted仅缺失/false准入，拒JSON null/异常类型；时间仅接受有效Date、严格SQL UTC或UTC ISO-Z，并round-trip拒rollover/数字/布尔/offset。新增真实缺合同文件测试。v062/候选5-01为该补强前版本，未交QA、不可当最新；v063/候选5-02为补强后冻结候选。v058不修改。
