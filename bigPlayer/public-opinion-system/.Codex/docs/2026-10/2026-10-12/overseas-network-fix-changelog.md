# 海外采集网络出口与断点恢复

Status: 已发布；三个海外站点真实采集及外网页面验收通过

海外域名解析的三个地址直连443均超时。本机已有Clash配置但进程未运行，系统代理关闭。复用现有配置建立只监听127.0.0.1:17897的专用出口，不修改系统代理、共享env、国内API或Worker。三个语言站点真实GET授权与原失败页均HTTP200、业务码0。

修改 `worker/src/overseasProductionDaily.js`：海外任务使用专用出口、临时网络失败最多三次尝试、错误原因按安全代码记录。新增 `worker/src/overseasProxyTransport.js`：Windows curl通过stdin接收授权头，避免Token写入argv、磁盘和日志；限制HTTPS海外域名及GET，保持证书验证、15秒请求上限、响应大小限制与取消。新增 `worker/test/overseasProxyTransport.test.js` 验证重试、取消、绑定及嵌套超时分类。

7项测试通过：新增传输5项、既有任务时区及断点恢复2项；语法和空白检查通过。基于现役海外专用运行包提取必要修改，仅collector、transport、启动cmd变化；405文件hash清单保留。运行包为 `C:/ProgramData/PublicOpinion/overseas-daily/releases/overseas-daily-release-20261012-network-fix`。定时任务 `BigPlayer Last Night Overseas Daily 02` 已切换启动命令，保留原XML及旧包。PowerShell更新任务返回未指定错误，使用schtasks更新后读取任务Action验证成功。

专用proxy配置位于ProgramData私有运行目录，复用已有节点配置并关闭TUN、DNS监听、LAN访问和控制端口。ensure-proxy.ps1检查端口进程归属并自动启动，任务启动前调用。共享Worker、API、前端未重启。

真实恢复原任务 `c1e3aaba-e517-5449-ae81-de6991ffa971`，沿用已提交页游标；旧单页抽样记录不伪装为全量完成。内容进入已有入库和分析队列。第一次恢复已完成legacy站点7页；另一次短暂翻页失败后续跑，第二次恢复已完成第二站点7页，第三站点进行中。未删除数据或迁移数据库。

临时证据、任务备份及脚本保存在仓库根 `.temp/sync-auth-persistence-fix-20261010/`。最终结果待下文补充。

## 最终验收

原父任务和三个子站点均为completed，error_code为空；本次日任务累计observations/stored为59，父任务新增8（包含修复前已经入库的8条，不能宣称修复后新增59）。三个子任务表中stored各16，父任务按receipt累计观察计算，因此统计不能简单相加。完成标记已落盘，游标不会从头重置。

外网Edge只读验收PASS：四个任务GET均HTTP200、completed且无错误码，页面无JS异常，无写请求。证据为 `overseas-network-acceptance.json`、`overseas-network-fixed.png`。恢复验收不代表旧抽样历史记录变成全量完成；旧样本仍保留OVERSEAS_SAMPLE_INCOMPLETE。网络仍依赖现有代理节点可用性，有限重试和已提交游标保护后续恢复。
