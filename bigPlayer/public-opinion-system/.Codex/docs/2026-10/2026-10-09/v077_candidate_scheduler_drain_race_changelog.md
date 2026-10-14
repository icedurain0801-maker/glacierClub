# 候选 scheduler drain 等待竞态修复

Status: isolated-candidate / developer-verified / independent-QA-pending / runtime-NO_GO

复现：schema 只读查询等待期间 request drain，原 seam 仍启动 runJob；在途 scheduler 未持独立 ticket。新增两项 deferred 测试均在修复前失败。

修复：runOnce 仅透传显式候选 drainController；schema await 后重查 drain，写阶段开始前独立 admit，在途 runJob finally release。默认无 controller 路径不改，现役 main 不接入。

边界：此批不解决 manual 清 marker 与 durable queued run 非原子的问题；不构成全入口排空、可靠无丢单或真实切换 GO。不改现役进程、生产配置和数据，不真实 HTTP，不删除旧实现。

文件：worker/src/worker.js、worker/test/workerUnifiedSchedulerSeam.test.js。员工只读复审确认 scheduler 阻断关闭，manual durable 阻断保留。联合 5 文件 48/48；新冻结候选9的11文件78/78，637份文件SHA校验一致，git diff --check通过。独立QA尚待执行，见v078 manifest及v079交接。
