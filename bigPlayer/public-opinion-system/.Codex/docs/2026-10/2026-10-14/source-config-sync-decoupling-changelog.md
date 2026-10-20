# 采集源配置详情与同步状态解耦

Status: 已发布并完成可见浏览器验证

用户确认：配置详情只读取来源配置、账号与授权信息；同步状态单独加载，失败不影响配置查看/编辑。

## 修改

- `server/src/app.js`：`sourceWithAccount` 的配置模式不调用检查点接口且不输出 checkpoints。列表模式保留原有统计。新增 `GET /sources/:id/sync-status`，按社区/游戏/平台及路径来源ID校验后查询默认账号的完整状态汇总，复用全局鉴权与资源权限校验。
- `../admin/PublicOpinion/assets/sources.js`：配置渲染完成后后台请求独立同步状态，提供加载/失败/重试提示，只更新同步描述与暂停/继续按钮，不重新渲染配置输入。清空详情合并时的缓存检查点；使用来源ID、详情请求序号和同步请求序号丢弃过期结果。配置重绘后重新加载状态。
- `../admin/PublicOpinion/sources.html`：更新脚本缓存版本。
- `server/test/sourceDetailRoute.test.js`：增加有账号的配置请求不查询检查点、独立状态完整汇总、越界社区/冲突来源拒绝，以及同步查询失败不影响配置的隔离HTTP回归。

## 发布

从当时最新现役运行包克隆 API 与前端，逐片段打补丁，保留并行开发成果。只重启 API/前端，未修改数据库、账号授权、采集任务或 Worker。发布清单见 source-config-sync-release-manifest.json。

## 验证

- 9项来源详情、汇总与授权隔离HTTP测试通过。
- 修改JS语法及限定路径空白检查通过，API/前端健康检查均200。
- 使用既有SSO测试环境启动可见 Edge，访问用户来源深链；隔离挂起同步接口，确认配置立即可编辑；模拟503确认失败提示；真实接口重试确认恢复同步汇总，填写的名称保持不变；实际点击关闭通过。
- 真实配置响应无 checkpoints；浏览器无脚本错误，未发送来源写请求。
- 证据：`.tests/2026-10/2026-10-14/config-sync-browser.json`、`config-sync-isolated-failure.png`、`config-sync-loaded.png`。

未执行真实保存、授权检测、同步或取消任务，以免影响正在采集的来源。既有采集失败状态如实展示，本次不改变采集规则。
