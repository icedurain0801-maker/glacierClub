# 能力检测超时修复

Status: 已获本轮用户弹窗授权，已上线并验收通过

## 问题与修复逻辑

账号授权成功后，能力检测先做 accountHealth，再重复登录检测帖子、样本帖子及评论。前端代理 30 秒超时返回非 JSON，页面报“舆情服务返回了无法解析的响应”，能力列表仍显示旧状态。

- `server/src/app.js`：BigPlayer 能力检测仅调用一次真实 detector，用真实探测结果判断授权；其他平台流程保留。
- `server/src/connectors/bigPlayerH5Connector.js`：每次检测独享 Token Promise，复用帖子样本探测评论。空帖子不宣称评论授权；失败保留安全错误码。401 刷新后，后续请求使用替换 Token；不同检测或账号之间不复用缓存，finally 清理。
- `scripts/windows-services/frontend3001-server.js`：保留 30 秒超时，504/502 返回明确 JSON；已开始响应时关闭连接，避免混入错误内容。
- `../admin/PublicOpinion/assets/sources.js`：兼容网关非 JSON 502/504；仅读取一次最新保存状态，不自动重试检测，明确区分最近保存状态与本次未确认结果；迟到响应不覆盖新草稿。
- `../admin/PublicOpinion/sources.html`：资源版本升为 v213。

## 自测

70 项自动测试通过：能力/代理边界 8、来源草稿 11、来源状态 24、候选登录路由 8、连接器 13、授权契约 6。隔离护栏无拒绝；无真实库写入、登录或采集。

Edge 隔离浏览器 4 种场景通过：成功、JSON504、HTML502、刷新迟到后新建草稿。每种仅一个 POST，页面无异常，不自动重试，不误报成功。

API 395 文件及前端 33 文件 manifest 校验通过；语法与空白检查通过。相对现役包只改变上述 5 个运行文件，未打包工作区无关改动。

## 候选与回滚

候选目录：仓库根 `.temp/capability-timeout-fix-20261010/`。文件 `candidate.json` 保存基线和变化文件 SHA256。

API 基线 `release-20261010-login-auth-fix`，目标 `release-20261010-capability-probe-fix`。
前端基线 `release-20261010-login-auth-v212`，目标 `release-20261010-capability-v213`。

`apply-runtime.ps1` 部署前核对现役服务基线，拷贝校验候选，授予 LocalService 读取权限，备份 XML，再依次切换 API4320 与前端3001。健康检查失败自动恢复旧 XML 并启动旧包。保留旧包；不改 Worker、登录服务、数据库结构或生产凭据。

## 上线验收

用户本轮弹窗确认“立即切换并验收”后，API 与前端成功切换目标包，健康检查通过。

外网 Edge 点击指定来源能力检测一次：8257ms、HTTP200、authorized=true，posts/comments 均 authorized_scope，reason=null。页面成功提示“能力检测完成”，按钮恢复可操作；未出现解析错误。保存状态再次 GET 确认两项授权。

本机、局域网、外网均页面200、8个 JS/CSS 资源200，sources.js SHA256 与候选一致，来源详情对象正确。最终浏览器验收 pageerror、console error/warning、requestfailed、未授权写操作均为零。

首轮验收脚本在真实检测已通过后，最终只读 APIRequestContext.get 使用相对 URL 导致 Invalid URL。已改绝对 URL 并通过 --verify-saved-probe 只读重跑确认，没有第二次 POST。真实检测证据为 `.temp/capability-timeout-fix-20261010/real-probe.json`，最终综合报告为同目录 `runtime-acceptance.json`，页面截图 `external-fixed.png`。

此次仅登录、读取探测样本并保存能力状态，不触发采集入队或分析；Worker 与登录服务未重启。

剩余边界：全量采集和分析不在本轮验证范围。后续外部登录、验证码或服务延迟仍可能使检测超时，页面会明确报告未知结果并仅读保存状态，不自动重复授权操作。
