# v154 Windows 常驻服务阶段 A 工件验证

## 范围

仅验证安装/回滚工件和恢复 skill 的静态合同；未安装 Windows 服务、未写机器环境变量、未禁用或删除旧任务、未重启 Worker、未触发采集或回填。

## 结果

| 项目 | 结果 |
|---|---|
| `PublicOpinionApi.xml` XML 解析 | PASS |
| `PublicOpinionWorker.xml` XML 解析 | PASS |
| `install-services.cmd /dry-run` | PASS，未改系统 |
| `export-legacy-tasks.cmd` 默认模式与 `/dry-run` | PASS，只打印预览，不创建目录、不查询任务、不写 XML |
| `export-legacy-tasks.cmd` 非法参数 | PASS，退出码 `2`，输出目录不存在 |
| `disable-legacy-tasks.cmd` 默认模式 | PASS，未禁用任务 |
| `rollback-services.cmd` 默认模式 | PASS，未改服务或任务 |
| 系统 `skill-creator/scripts/quick_validate.py` | PASS：使用 `python -X utf8` 对恢复 skill 目录执行，输出 `Skill is valid!`；默认 GBK 首次读取失败，未修改系统脚本 |
| Server 全量回归 | PASS，`414/414` |
| Worker 全量回归 | PASS，`221/221`；同步修正一处仅依赖 SQL 参数固定下标的旧测试桩 |

## 阶段 A 结论

工件可供项目经理后续高影响门禁审查。阶段 B 安装前必须替换绝对路径占位、确认低权限服务账户和敏感配置注入方式，并先导出旧任务 XML；新服务稳定通过后才允许显式执行旧任务禁用。
