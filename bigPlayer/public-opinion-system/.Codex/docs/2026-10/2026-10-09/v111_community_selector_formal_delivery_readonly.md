# 六社区选择器正式静态交付缺口只读核查

Status: FORMAL_ENTRY_NOT_EFFECTIVE / DELIVERY_DECISION_REQUIRED
Date: 2026-10-09
Owner: 开发负责人

本单为状态核查，不是实施、发版或重启授权。没有改正式工件/XML/config、没有HTTP写、Worker/DB/采集不触碰；经理v034待办未修改。3000 QA预览PASS不等于3001正式生效。

## 实际服务与静态路径

只读CIM及服务XML确认PublicOpinionFrontend3001 Running，身份NT AUTHORITY/LocalService；Node PID19768入口为 `C:/ProgramData/PublicOpinion/frontend3001/releases/release-20260924123831-boardid-save/frontend3001-server.js`，workingdirectory同release。XML `C:/ProgramData/PublicOpinion/frontend3001/services/PublicOpinionFrontend3001.xml`，配置引用 `C:/ProgramData/PublicOpinion/frontend3001/config/frontend3001.json`。

实际server SHA256 `91686441336af300e30798a9a31eece99cc7b8305e69529a32475a3d1c7c79ba`；静态根为入口同级 `public/`，每次请求lstat+createReadStream，无静态内容内存缓存，无运行期manifest验收；query v147/v148不参与磁盘路径解析。因此只改工作树或改URL版本不会更新正式文件。经理已有正式HTTP200/v147与白名单缺失证据，本轮没有重复浏览器验收。

## 精确7文件映射

候选源共同前缀：`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/bigPlayer/admin/PublicOpinion/`。
正式目标共同前缀：`C:/ProgramData/PublicOpinion/frontend3001/releases/release-20260924123831-boardid-save/public/admin/PublicOpinion/`。

| 两端相对路径 | 当前正式SHA256 | 已QA候选SHA256 |
|---|---|---|
| assets/scope.js | 17869169b9ba9e62ca241e39a231c5e6f09bf3c2e7f3538be1de767c2e7dc2b3 | 0193f49d1a74b5166ffb12d89512567b0635d0e8455ec798931096f337814fb1 |
| index.html | ca26a4db10642ad69a1145fa29ac2313845201a2a6b011d479dc62bf155ea483 | 026cbdc7760df8880440ebd09986f39c7b691d06746f15a5672f3e72fb6c43c1 |
| content.html | 666b1aa28af38ba333b9f407b5c0e3c9a6650c8a5fbc41f5e8c7fcb84a6db07a | f1fb2e0e1982f21302bca4f20b04e21c65403f84471c9a1ad065f5b7b525c79e |
| alerts.html | c0e2ffb32034589e8a5ddca51c9a902363d23a7015ae164f249f56ee83046ec6 | 74127b3c2bf7c52fca94954d2a23ee87195bfb1b1be9c2db0b375fbb8587c004 |
| sources.html | 24a6d5d488238868cae9a1ac00dafd3f6c562ca6536f9bdef4b5b17ee66874e2 | 834373ed004da072711a7bf655f40e5bc5cf21b0a99432f6fff674011eaaee27 |
| collection-runs.html | 38ae7003af76f6ce714436e9d6ef05a13a186ac7444d226620570ca1669e510e | 5a7d42af7a2562630f88af923bf2cebc4964f7a74abe7892b5490bb953936675 |
| keywords.html | f515601515adc2f58f54c5693238e942c1e359f4ccbb2426d7e86dad7170d582 | d4820480f6827c31d3336236fc5dd7868b72ed4ec1c1213de6a7fa702a2a8a43 |

候选7/7与v039 QA清单吻合，正式7/7不同。scope差异为地区白名单/顺序、默认及旧URL/session回退；六HTML的v147→v148引用变化须结合换行差异核对，不将byte差异默认为无关功能变化。不包含assets/sources.js、sidebar、API或Worker发布。

后续逐六HTML归一CRLF/LF后严格比较，6/6唯一正文差异为scope引用v147→v148；scope完整diff已读，未发现本单范围外脚本替换。归一比较不替代字节hash，原始QA锚仍按字节核验。

## 是否可无重启及影响

技术上可：若授权在实际静态根安全替换7文件，下次请求读新字节，无需重启任何进程；已打开页面需刷新，外部代理缓存是否存在仍需正式HTTP资源hash实测。建议若经理选择无重启静态热修，scope先落、六HTML缓存版本后落，逐文件同目录staging+rename，保留精确7旧文件备份/外部hash/补充hotfix记录；不直接truncate在读文件。7文件非整批原子，短暂混用及Windows占用拒绝必须有停止/原件恢复条件。

治理风险：原地热修会改变已有release字节并使 `frontend3001-release-manifest.json`（algorithm/files）不匹配。不得静默重写原清单或称原release验证仍通过；需经理明确是否采用带补充manifest的受控静态热修。替代是以现役release为基准建立完整新frontend工件，仅7前端差异，独立QA/清单后切Frontend XML；此方案保持旧release可回退，但需要单独批准Frontend切换/重启，不能使用泛化Apply把Worker/API带入范围。

无重启热修与新release切换均未执行。任何实施前重新核目标无reparse、7原hash和候选锚、最小权限及精确备份恢复；生效验收必须正式域名与127.0.0.1:3001的7资源hash及六页面两地区真实选项，不用3000结果替代。只UI筛选/状态回退改变API读取scope，不改服务端权限或数据库数据；正式入口未完成，交经理选择路径并取得相应授权。
