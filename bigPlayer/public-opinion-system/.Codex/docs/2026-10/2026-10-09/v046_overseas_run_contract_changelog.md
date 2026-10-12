# 海外run合同证据持久化候选

Status: implemented / isolated-validation-pending / production-NO_GO

- 新增RunContractJournal，明确create前向合同、read恢复及verify完整性接口；规范JSON、哈希、wx/fsync/原子发布，不覆盖同run/epoch证据。
- 绑定run/source/account/game/community/site/board/URL/window/owner/epoch/manifest；拒绝凭据URL、缺失/篡改/非规范内容及错误目录。
- 隔离证据目录必须由调用方预先在仓库根.temp下建立，不创建业务.temp。恢复缺证失败，不自动生成历史证明；checksum不是QA签名或生产授权。
- PageStore合同owner与请求owner精确一致。当前仍待主链生产接管及历史证明，不能以文件存在视为完整海外成功。
