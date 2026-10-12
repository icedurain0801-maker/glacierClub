# Site16 page2 可执行前向恢复候选

Status: FROZEN / QA_PENDING / NOT_EXECUTED

候选：仓库根 `.temp/bigplayer-recovery-20261009/lastnight-forward-x5YQo8`。
manifest SHA256：`744f5bfb421854977a81fe850ca6f8a11337188b36a0f0b021a232df12db7a47`。
CLI SHA256：`fc3636f062d2d16625711997c27e9e7fc6dd8fdd07417820ef1d646807f72c9a`。
旧inventory544不变，forwardFiles新增5（CLI、执行器、失败合同、builder、测试），通过verifyForward对绝对路径源码字节核验，不复制源码；源码变化即令候选失效。

运行：`node scripts/lastnight-forward-resume.js --approved-plan <绝对路径>`。先inspect-forward-resume，经理批准snapshotHash再execute-forward-resume。模板approved=false，默认不执行。初始绑定原page1 encrypted journal SHA、epoch1537 resume_committed journal SHA和经理已有site16-page2-failure-postcheck.json SHA；不读取不存在的旧item诊断。配置/账号/三站registry/完整checkpoint原文及owner/epoch、无active run/checkpoint在账号锁事务内复核。snapshotHash相同才epoch+1持久接棒。

任何HTTP前fsync公开诊断合同；仅原offset20/pageIndex2 merged列表一次、20条详情上限，详情ID限本页返回，manual redirect/strict TLS；禁止refresh、首页、site9与其他平台。normalize前fsync每项hash ID、固定类型/status/code白名单。detail不完整停止，不假完整不落页。

详情拒绝后复查同owner/live、原cp不变、无active run，生成认证forward_page_precommit_failed（httpExecuted=true/pageCommitAttempted=false）。下一次仍绑定原page1 SHA和该新终态SHA，可逐epoch前向续原cursor；仅forward_resume_committed不能作为失败重试证据。owner或page COMMIT未知没有可续终态，须独立对账，禁止盲重试。

8项开发测试通过：inspect零HTTP/零写、snapshot漂移、竞争锁/run/cp、owner COMMIT未知、HTTP路径拒绝、详情诊断落盘顺序、两次详情失败连续认证续与旧owner拒绝、诊断脱敏/双SHA合同。当前测试尚未覆盖真实CLI加密文件端到端和第三次详情成功写页，交QA必须标为未覆盖，不声称全链PASS。未DB/真实HTTP/DDL/push/安装日调度；16完整consumer和02仍原单待完成。
