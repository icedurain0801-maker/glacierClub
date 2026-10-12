# 海外新主链完整依赖锁定

Status: implemented / isolated-validation-pending / production-NO_GO

- 新增 `scripts/overseas-candidate-inventory.js`，只读枚举全部 server/worker/shared 源码与实际安装 node_modules 字节、工作区链接、package/lock、指定测试与文档。
- 不只锁修改文件：使用超集闭包覆盖动态 require 和依赖数据，不升级依赖，不读取 env、不连库、不启动消费者。
- 提供前后精确验证，Node 版本、路径、链接或文件字节变化均拒绝；后续候选需附本脚本输出。
- 旧方案删除已按最新指令停止。本轮旧文件删除清单为空，无需恢复。共享 Worker 接管未授权，生产仍失败关闭。
