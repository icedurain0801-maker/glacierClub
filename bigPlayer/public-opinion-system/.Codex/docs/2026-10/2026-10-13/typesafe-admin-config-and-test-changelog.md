# TypeSafe配置与50条测试页面

日期：2026-10-13。状态：本机API及前端已更新，隔离测试、可见浏览器和现役只读验证通过；真实50条分析等待用户在页面输入密钥。未提交、未推送Git。

## 用户确认范围

仅保存TypeSafe配置并运行超能50条测试，暂不替换自动分析。放弃并移除了本次新增的VBS/PowerShell双击启动器，无计划任务、无临时弹窗配置，也没有写Windows用户密钥变量。

## 入口与行为

SSO站点的「抓取账号管理」页面底部增加「TypeSafe 配置与测试」。管理员填写API Key，点「检测并保存」：调用平台做一次真实小样本判断，成功且结果结构合法才加密保存。检测失败保留旧配置。API Key不回显、不放浏览器存储、URL或代码文件。

「测试超能50条」固定取国服社区最近的帖子25条、评论25条（过滤删除及无文字内容），只读现有数据库；评论不包含父帖标题，不读取图片。后台调用现有Python客户端，3秒单次总超时、至多2次退避重试、并发10。结果单独保存，显示本条原文、现有等级、TypeSafe等级、置信度与人工复核状态。已有等级仅用于对比，不是人工真值；不编造模型未返回的原因。

测试异步执行，刷新/关页面不停止；重复启动、运行中修改配置被拒绝；单条调用失败保留其他结果；服务重启的未结束任务标记中断，提示重新测试，不自动重复扣费执行。

## 文件及运行形态

- `server/src/services/typesafeTestService.js`：固定端点/模型、管理员路由、AES-256-GCM加密持久化、只读取样、后台作业与结果恢复。
- `server/src/integrations/typesafe_bridge.py`：服务内Python桥接，共用根目录`sentiment_evaluator.py`，不复制另套决策算法。
- `server/src/app.js`：仅新增服务初始化和路由接入。
- `../admin/PublicOpinion/assets/typesafe-test.js`、`.css`及`sources.html`：现有页面中的配置面板、进度轮询和结果表。
- `scripts/windows-services/build-api-release.ps1`：将同一Python客户端复制到API包的integrations目录。Python>=3.10/httpx为运行依赖，缺失时关闭失败，不退回旧模型伪造结果。
- `.env.example`：文档化独立测试存储目录与Python位置，不存放API Key。

真实配置及结果目录：`C:/ProgramData/PublicOpinion/typesafe-tests`。密钥使用现有CREDENTIAL_ENC_KEY与固定AAD加密；目录ACL仅SYSTEM/Administrators完全控制、LocalService修改。配置接口和结果接口均要求admin并no-store；免登录查看入口不能配置或运行。

## 更新与验证

从更新时的现役包精确复制并增加本次文件，避免发布工作区其他改动。API及前端切换至各自`release-20261013-typesafe-test-r1`；修改前二次核对XML未被切换；SHA-256包校验通过。只重启PublicOpinionApi/PublicOpinionFrontend3001，不重启Worker。旧运行包和XML备份保留。

- 7项Node隔离测试通过：加密及重建、失败保存保留旧配置、无加密key失败关闭、admin权限、固定范围、50行后台任务及失败保留、重复任务拒绝、重启中断、空样本及返回校验。
- 11项Python客户端测试通过；JS和Python语法检查通过。
- 可见Edge隔离页面：无效Key拒绝、保存清空Key、运行中按钮禁用、刷新恢复50行结果；桌面/移动端截图见同日`.tests/typesafe-admin-browser-*`。这些50条返回使用模拟平台，不代表真实模型判级。
- 现役可见Edge的SSO页面：config200、configured=false、model=jev-latest、autoAnalysisEnabled=false、latest200、keyEchoed=false；证据`typesafe-admin-live-browser.json/png`。
- 未鉴权的真实配置GET401；实际JS资源200。
- 当前真实API Key仍未配置，尚未调用真实50条数据；管理员页面的一次授权检测及每次测试将消耗平台调用用量。

## 重要限制

客户端仍采用用户指定的三问简化规则，不是现役完整R1–R14策略的替换；现用模型、分析结果和告警不变。测试队列仅维护最近一次结果，后续测试会覆盖该测试报告；原业务记录不变。背景任务超过120秒明确失败并保留已有结果。
