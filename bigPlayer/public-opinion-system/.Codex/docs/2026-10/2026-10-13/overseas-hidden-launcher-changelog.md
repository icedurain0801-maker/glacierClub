# 海外采集任务隐藏启动

Status: 已启用，未提交、未推送 Git

原因：海外任务采用 InteractiveToken 运行，每分钟直接启动 cmd.exe，导致桌面反复出现命令提示符窗口。

修复：新增 scripts/windows-services/run-hidden-command.vbs，通过 wscript.exe //B //Nologo 启动，WScript.Shell.Run 的窗口样式为0，等待子进程结束并回传退出码，保留 Task Scheduler IgnoreNew 行为。仅更换任务启动器，不更改采集频率、授权或数据，不终止正在运行的采集。

现役启动器：C:/ProgramData/PublicOpinion/overseas-daily/launchers/hidden-r1/run-hidden-command.vbs。

验证：隐藏启动隔离 probe.cmd 返回7，启动器正确返回7；现役任务动作已变为 wscript.exe，轮询间隔PT1M，防重复策略IgnoreNew。证据见 .tests/2026-10/2026-10-13/overseas-hidden-launcher.json。

任务切换前备份和隔离探针位于仓库根 .temp/overseas-hidden-launcher/。本次为Windows启动方式修改，无浏览器或HTTP接口改动。
