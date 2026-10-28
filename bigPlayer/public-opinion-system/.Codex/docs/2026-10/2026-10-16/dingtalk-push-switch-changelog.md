# 钉钉推送滑块开关

Status: 已发布并完成浏览器验收
日期：2026-10-16

将采集源管理抽屉的“开启推送”复选框改成40×22蓝灰滑块，保留原字段ID、change事件、状态读取和保存逻辑。开启为蓝色、关闭为灰色，保留说明文案，支持键盘空格、焦点提示、禁用态和减少动画偏好。仍需点击“保存推送设置”才持久化。

修改文件：`../admin/PublicOpinion/assets/baas-dingtalk.js`、`../admin/PublicOpinion/sources.html`。后者追加范围限定样式及脚本缓存版本，不覆盖工作区已有其他修改。

发布仅在现役前端包上增量替换上述内容，运行包为 `C:/ProgramData/PublicOpinion/frontend3001/releases/release-20261016-push-switch-r1`。47文件manifest校验、JavaScript语法及空白检查通过，3001实际响应200并包含新版本，脚本hash与工作区一致。只重启PublicOpinionFrontend3001，原包及XML保留。

浏览器在https://club-opinion.q1.com的X-Clash采集源详情读取到原开启状态；点击关闭后开关Value=0、群配置收起、轨道变灰；空格重新开启后Value=1、原类型与群展开、轨道变蓝。测试未点击保存，未改实际业务配置。截图：`.tests/2026-10/2026-10-16/dingtalk-push-switch.png`。

验收覆盖本机现役域名，不代表另行更新BaaS静态托管版本。
