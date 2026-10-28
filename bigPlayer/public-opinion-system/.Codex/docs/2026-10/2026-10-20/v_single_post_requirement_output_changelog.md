# 单帖指定抓取按需提取与报告格式

Status: implemented, tested, local services updated

## 行为

- “抓取指定内容”在抓取全部可见评论及回复后，进入独立提取流程，不再执行完整情感、议题、风险分析或全帖总结。
- 纯评论ID/发布人平台ID要求直接读取实际元数据，保留全部已抓取记录，无AI调用；长ID以字符串保存。游戏ID等正文信息和带筛选条件的要求，仅进行按需AI提取，返回值必须能核对正文连续依据或原始元数据，禁止将发布人ID当游戏ID。
- 前端指定抓取仅展示抓取/提取进度、抓取数、输出数、格式及提取结果。隐藏情感占比、议题、活跃发言人等完整分析模块。保留详细分析模式及原有进度条。
- “下载Excel”改为“输出报告”。要求明确Excel/XLSX时输出真实xlsx，Word/DOCX时输出docx，HTML或未指定时输出独立HTML。输出包含全部结果，不受页面分页限制；保留可见范围和部分抓取说明。
- 兼容旧的已完成指定ID任务：输出全部已抓取的ID，不再受旧AI match标记限制，无需重新抓取或分析。
- 新增 `GET /single-post/:id/report`，沿用管理员、任务归属和社区权限；旧 `/excel` 保持兼容。

## 文件

- `shared/singlePostOutput.js`：共享输出格式、元数据提取判断、报告表格契约。
- `worker/src/singlePostExtraction.js`、`singlePostRunner.js`：按需提取分支、结果校验。
- `server/src/services/singlePostReport.js`、`singlePostExcel.js`、`server/src/app.js`：HTML/Word/Excel输出与鉴权路由。
- `../admin/PublicOpinion/single-post-analysis.html`、`assets/single-post-analysis.js`：指定抓取展示、提取进度和报告下载。

## 验证

- `node --test server/test/singlePostExtraction.test.js server/test/singlePostAnalysis.test.js server/test/singlePostHttp.test.js`：24项通过，覆盖零AI的207条ID、长ID、旧任务全部输出、正文提取证据、格式、安全转义及任务归属。
- `.tests/2026-10/2026-10-20/single-post-output-browser.cjs`：隔离浏览器验证207条分页、完整Excel导出、默认HTML导出、指定抓取不显示完整分析模块、无JS异常。
- 现役API模块的隔离HTTP测试通过；现役前端文件运行隔离浏览器测试通过。语法与空白检查通过。

## 本机发布

- API：`release-20261020-keyword-min2-ecosystem-api-r1`。
- Worker：`release-20261020-facebook-resume-worker-r3`。
- Frontend：`release-20261020-facebook-resume-front-r1`。
- 切换前确认单帖queued/running任务和running抓取任务均为0，备份后更新相关文件并正常停止/启动API与Worker；两服务及前端均Running。
- 备份：`E:/CodexData/public-opinion/audit/single-post-requirements-1792497220314`。冻结与最终hash清单：仓库根 `.temp/single-post-requirements-20261020/manifest.json`。
- 本机3001三项静态资源200且hash一致，health200，未登录报告请求401符合鉴权预期。前端JS版本更新至`20261020-requirement-r2`。
- 未提交BaaS静态托管、未推送Git、未新增真实采集或AI任务；浏览器结果和格式验证使用隔离数据。Word完成OOXML包结构及文本断言，未以真实Word客户端另行打开验收。
