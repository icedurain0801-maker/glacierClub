# BigPlayer 采集源配置 source not found：项目经理待办

状态：已接收，开发定位中；不宣称已修复。

依据：defect-source-not-found-in-configuration.md。截图为管理已有来源的保存配置/检测界面，后端 check-auth、check-capabilities 会先按 sourceId 查找来源，找不到即返回404；该阶段尚未验证账号，不应提示密码错误。

| 待办 | 负责人 | 状态 |
|---|---|---|
| 实际页面版本、API目标、失败请求及sourceId；DB存在/删除/归属核查 | 开发员工，由特邀开发总监拆分审查 | 已完成：新增草稿被发往 /sources/undefined/check-auth |
| 创建/编辑ID接线、动作准入和过期状态提示最小修复 | 特邀开发总监 | v065独立隔离功能验收PASS |
| 新增→保存→检测实际本机映射全链路验收 | 测试总监 | 冻结代码隔离验收完成；真实映射/生产写流程未验 |

边界：保留非敏感输入；密码不写入日志、URL或浏览器持久存储。不得自动重建来源、重复创建或删除数据；不触发真实账号认证、不重启无关服务。风险归一化与海外采集任务独立。

根因已实证：bindH5CredentialMode忽略新增态，新增无id草稿切换账密后错误渲染为管理页，检测动作请求 /sources/undefined/check-auth。这早于后端账密验证；现有来源ID均为UUID，我要当老祖没有BigPlayer来源，不能挪用境外同名来源。v063仅改sources.js与资源版本v210，尚未部署；候选可防无id动作、重复创建、旧回包关闭新草稿并保持非敏感输入。独立QA仍必须验证实际映射流程。

v064独立QA保留原已通过8项和malformed 201防重复POST，但整体FAIL：已保存来源的PATCH迟到成功回包会直接关闭之后新开的创建草稿。已退开发为save成功/失败回包增加requestSerial/source/scope/lifecycle保护；重冻结后只复验该竞态及必要关联。VM验证不能替代真实浏览器验收，生产仍未写入。

开发报告最小修复已完成本地生命周期11/11、source-status 24/24通过，员工定向复审进行中，尚未提交新的冻结manifest或独立QA。保护条件包含requestSerial、sourceId、scope epoch与当前scope归属；TapTap关键词在请求前冻结。经理已要求QA等候新候选后仅定向复验迟到save成功/失败与必要关联，不重跑已通过场景。

v065独立QA定向复验15/15 PASS：迟到200/404不关闭或覆盖新草稿；serial/source/epoch/community/region变化的迟到回包均无副作用；正常保存仍只发一次PATCH。TapTap保存使用发起时原community和关键词快照，允许在途原请求完成但不读取新草稿DOM。此结论为 PASS_ISOLATED_CANDIDATE_FUNCTION，不覆盖真实浏览器、生产接口、生产创建/保存/检测或静态资源切换；生产继续HOLD。
