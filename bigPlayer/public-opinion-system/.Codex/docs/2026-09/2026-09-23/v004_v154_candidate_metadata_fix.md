# v154 候选证据包修复记录

- candidateId：`v154-reputation-trend-mobile-fix-20260923`
- 范围：修复独立 QA 发现的候选元数据路径与哈希不一致；未修改业务页面逻辑。
- 修复：统一 `checksums.sha256` 为候选根相对路径；更新 release manifest SHA；补齐顶层 `manifest.json`；补充 QA 工作目录、启动命令和预期静态根目录。
- 验证：JSON parse PASS；逐条 checksum `32/32` PASS；`node scripts/windows-services/verify-frontend3001-release.js .temp/candidates/v154-reputation-trend-mobile-fix-20260923/release` 输出 `PASS: verified frontend3001 release (31 files)`。
- 边界：未访问 3001、未切换服务、未写生产、未触碰 v306d。
- 状态：`READY_FOR_QA`，等待测试负责人最终盲测/回归。
