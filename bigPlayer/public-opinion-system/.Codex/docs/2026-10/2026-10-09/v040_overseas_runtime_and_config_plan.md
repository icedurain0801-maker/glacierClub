# 海外候选运行与第二源配置修复计划

Status: partial-candidate / production-NO_GO / configuration-not-executed

## 当前消费者

PID19584 从 `C:/ProgramData/PublicOpinion/releases/worker-release-taptap-20260921-v055-formal1/worker/src/worker.js` 运行。没有发现独立海外 daily Node 进程，但这不证明共享 Worker 不会消费海外任务。主链 sourceAllowlist 只限制 scheduler，不限制队列初读、补读、marker、legacy due、poll；仅账号锁或相同 run claim 不足以建立新旧消费者排他。

本候选是依赖 adapter，不启动消费者或定时器。真实运行前需只读核现役消费范围、队列和租约；经理安排同一范围排他接线，双方 scope 一致。不得将独立海外候选与当前共享消费者直接并跑，不停或重启 PID19584。

## Schema 门禁

只读实际库：po_contents 无 board_id/board_name/board_key；po_sync_runs 无 board_id/site_url_snapshot。现候选主链入库与新调度合同依赖这些列，因此 adapter runtime schema 判定不就绪，生产失败关闭。

推荐另做海外限定旧 schema 事务适配（复用现行算法，验证所有已有 board marker，保留 raw scope）；不直接运行迁移，不修改国内事务算法。只读历史枚举已避开缺失 run board 列，但完整真实入库适配和站点快照承载仍未完成。

## 第二源精确配置计划（不可执行）

- sourceId：8c690d6e-12ea-4ad3-b434-d941276c4906。
- default accountId：a80c93e9-51b9-478a-998a-e63772d323ff。
- config.boardId：旧值 absent；新值未确认，绝不默认 100017。
- 当前三个 config siteId：site-b65999d6b3a837e58e02efae1e531d42、site-245a01037038ff32930961262a10604d、site-444d2357e4b5fcab201568f5eebcaf23。
- registry 唯一旧值：legacy-b65999d6b3a837e58e02efae1e531d42。首 URL 哈希一致但 ID 不同；可评估 config 首项沿用 legacy ID，再仅新增另外两项 registry，保留全部旧引用，不更新历史 run/checkpoint/content。
- 历史引用只读：25 runs（site null）；1113 checkpoints（site null）+4848 checkpoints（legacy site）；12318 contents。内容站点归属不能仅由当前 config 推断。
- board 发现：自身 Token GET /api/club/v1/auth/user/context HTTP401，无刷新/登录/采集/写库，不能确定实际 board，也不证明账号永久无权。

后续计划必须先取得实际可访问 board/game/community 证据和精确 before/after URL/字段哈希，再评估 config 首 ID 保留及新增 registry。回滚仅恢复本次字段与新增 registry（须确认新增行无引用），绝不删除历史。当前没有可执行 after board，故配置修复未获执行条件。

## 未完成验收

完整源候选静态可独立复跑；真实手动请求→入库→AI/翻译、第二源修复、唯一消费者和下一实际定时槽位均未闭合。全部海外源仍最终范围，不能把第一源部分候选称全链成功。
