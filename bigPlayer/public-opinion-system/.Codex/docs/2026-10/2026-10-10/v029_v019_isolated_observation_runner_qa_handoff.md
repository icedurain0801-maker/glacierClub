# v019 隔离侦察执行器 QA 交接

## 当前交接与独立限定签收

独立QA已完成：`.tests/2026-10/2026-10-10/v032_v019_isolated_runner_qqqk9o_independent_qa.md`，结论 `ISOLATED_SYNTHETIC_CONTROLLER_PASS / FULL_RUNTIME_NO_GO / CUTOVER_HOLD`。两轮冻结guard14/14、独立负测12/12，24种嵌套symbol均拒且getter=0，前后bytes/SHA一致。独立负测原件根 `.temp/v019-qa-qqqk9o-negative.raw.json` SHA `3872823099e6308e05f06ca7ae204753e275e92dfa765e2c2b0506b9eee4484f` 已负责人实测核对。只签可信fixture合成控制器，真实身份/授权/transport/抓取不在签收内；unknown仍9请求probe-only无feeds。以下待签措辞保留为原交接历史，不覆盖此限定签收。

当前为 Qqqk9O：仓库根 `.temp/overseas-v019-isolated-candidate-Qqqk9O/manifest.json` SHA256 `bea226b2f9c315d177d2fa15425dc6d24e55cd70fa3c4129f0b2f07e1549ee60`；runner `4643937d53ba51a116b0f63757a763370311284140eea151b88b952348119a95`；test `b6ef2aa4ffff074fa9f32d16df8118a1a4521d82c203a3cceae971b9b7798d10`；guard `2f801b5051c08b93dadfff9322f7cca4090c23234a915b57fd95eef0844208d9`。

开发原件 `.temp/overseas-v019-isolated-qa-hiqTEQ/result.json` SHA256 `c4d0297d1349098f1d84a75a00355204fc24a938f6c30db5fb5bc77ef32d9ddd`，实际 DEV_TEST_EVIDENCE、exitCode=0、14/14、unchanged=true。命令仍为冻结guard下的 `node --require ./scripts/v019-offline-network-guard.cjs --test server/test/overseasV019IsolatedRunner.test.js`。未代签独立PASS。

QHBPyb已被独立QA v031退回，以下其交接为历史。缺陷已用新回归复现：嵌套symbol被Object.entries静默丢弃。修复dataSnapshot先取得descriptors，再Reflect.ownKeys检查全部descriptor，复制前拒accessor和symbol；新增六类位置×数据/accessor×可枚举/不可枚举共24组合，getter零调用。请独立QA在新冻结复跑v031原12负测目的及14项测试，核前后hash。旧冻结/原件不改；Proxy信任边界及unknown仅9请求probe-only无feeds保持，生产NO_GO/HOLD。v104不混验。

## 历史 QHBPyb 交接（独立 QA NO_PASS，已被上述候选取代）

Status: QA_PENDING / DEV_TEST_EVIDENCE / REAL_HTTP_NO_GO / FULL_RUNTIME_NO_GO / CUTOVER_HOLD

最新冻结：仓库根 `.temp/overseas-v019-isolated-candidate-QHBPyb/`。manifest SHA256 `F482137315F5D184BA80D92DA224A10982FC94E0A4F42A4E8342B4694C5AB363`；runner `AAB0824BD787BCB80552ECF1CE482D8F6DB05342CC67F8ACDDF77BF7AEAD2797`；test `A86950642EC7B6B24116F0D8CD57FAC3686EF8D42322B2848EAD74CA4B428D22`；guard `2F801B5051C08B93DADFFF9322F7CCA4090C23234A915B57FD95EEF0844208D9`。

开发原件：仓库根 `.temp/overseas-v019-isolated-qa-qwaVrv/result.json`，SHA256 `68527E11E57D95441B0FDF6887D75C00D93DAA23A7A26FA2793718B27882DEA9`，实际 `kind=DEV_TEST_EVIDENCE`。冻结副本在 guard 下执行 `node --require ./scripts/v019-offline-network-guard.cjs --test server/test/overseasV019IsolatedRunner.test.js`：13/13、exitCode=0、unchanged=true。这是开发验证，不能替代独立 QA PASS。

本轮修复 ZlQ9KK 的入口解构先执行 transport getter 缺陷：`run(input)` 先核普通数据对象和全部自有属性描述符，拒 accessor 后才从 descriptor.value 捕获允许字段，拒 symbol/未知键/继承对象；source/account/fixture/timeouts 递归数据快照拒嵌套 accessor、函数、非普通对象及循环。新增所有顶层 accessor、嵌套身份 accessor、symbol/继承字段负测，getter 调用为零。既有内部 data-only transport、单调真实时钟、总 timer、transport/JSON 唯一 deadline、comment 精确路径、token/report 脱敏和预算回归保持。

请测试负责人独立复跑原 negative-probes 的断言目的及冻结 13 项测试，核对 manifest、原件和前后 hash，重点确认拒绝前 getter 零调用。仅可信数据输入；Object 反射仍可能触发 Proxy trap，不保证恶意 JS/Proxy 无副作用沙箱。网络 guard 仅防可信测试误联网。unknown 的 9 次模拟请求只 probe、不 feeds；fixture SRC-A/board/lang/account 不证明真实 site/account HMAC、授权或采集。不得执行真实 HTTP/token/provider/AI/SQL/DDL/服务切换/账号刷新或国内入口。旧冻结和原件完整保留。

## 历史 ZlQ9KK 交接（独立 QA NO_PASS，已被上述候选取代）

当前冻结：统一根 `.temp/overseas-v019-isolated-candidate-ZlQ9KK/`。manifest SHA256 `B088B6122E341F547EA8451FC1DE94F5AC016F1189B7D1E678C31A4717F64F9D`；runner `4827173F38ED39EE869C252342129310EDF9EBAECA6556C86A34321CFDF6E9A6`；test `F158AC6810C7319AFA5B79875329E8A2A89304991392FD6E3923C0B2CD23302F`；网络 guard `2F801B5051C08B93DADFFF9322F7CCA4090C23234A915B57FD95EEF0844208D9`。

开发原件：统一根 `.temp/overseas-v019-isolated-qa-JCsRch/result.json`，SHA256 `E489DAD21A1F34E440B7C515DE2FD993445FBCB38097DF9CADAD5A5F730ABE82`，实际 `kind=DEV_TEST_EVIDENCE`。执行冻结副本的 `node --require ./scripts/v019-offline-network-guard.cjs --test server/test/overseasV019IsolatedRunner.test.js`，10/10、exit0、冻结前后 unchanged=true。没有执行真实HTTP/token/SQL/AI/服务或国内入口。

本轮移除公开 callback factory 和调用方 transport：仅接受冻结的数据型 fixture 字段，拒 getter、函数、未知字段；transport 内部创建，不签发外部能力。内部捕获单调真实时钟，批次总timer独立取消；transport与JSON共用一个absolute deadline，参数仅能收紧。评论路径仅单层数字ID，须与query postId相等，编码/额外层级拒绝。unknown在明确allowAuthProbe时只执行exchange/context/board模拟，完成后仍不准feeds；disabled/unauthorized拒绝。

请QA优先复跑原负例和本轮10项测试：任意handler/伪品牌不得被调用，fixture getter/json函数拒绝；now恒0仍真实截止；分段延迟不能叠加两个timeout；评论路径/unknown barrier保持；token/report/JSON局部回归不倒退。网络guard是可信测试的事故预防，不是恶意JS沙箱。SRC-A、board/lang和account是合成身份，不能当真实授权；真实transport/凭据签发合同仍未实现。旧y201tO/mdmmhK/EJxUjH/5QYDGL等包原样保留，不能沿用旧PASS。

## 历史交接（旧候选已退回，以下不是当前放行结论）

Status: QA_PENDING / DEV_TEST_EVIDENCE / REAL_HTTP_NO_GO / FULL_RUNTIME_NO_GO / CUTOVER_HOLD

历史冻结目录 y201tO、mdmmhK 均保留不覆盖。当前冻结目录：`.temp/overseas-v019-isolated-candidate-EJxUjH/`；manifest SHA256 `653F771E98CAEBA9940DB1DE632EEE51C40889E45F97B0A00BFDEDE85007C5EC`；runner SHA `4EE419A76C3AF6B191716B890AC0D4CF87E307DB56BED67AD1D40504FB77BC5D`；test SHA `717B676E5D541EDE0C516348CF9454CC2C2B4906FC9E5D533491187EB46C4E1A`。

开发 QA 原件：统一根 `.temp/overseas-v019-isolated-qa-4ylHvr/result.json`，SHA256 `D0405CDA990E2C15DB35409FEAC4B942201A8D2CFEE07949AAED706F0C6955BD`；exitCode=0、冻结文件前后 unchanged=true。该历史原件实际 JSON `kind` 为 `OFFLINE_SYNTHETIC_QA_EVIDENCE`，`guard` 字段仍是旧版 `syntheticOnly/networkAccess` 元数据；文档此前将其标成 `DEV_TEST_EVIDENCE` 仅表示来源为开发执行，不改变原件字段，也不等测试负责人独立 PASS。后续新证据统一使用 `kind=DEV_TEST_EVIDENCE`，并记录模块私有 WeakSet guard。

请独立复核冻结 manifest、runner/test hash、开发 QA 原件和 `node --test server/test/overseasV019IsolatedRunner.test.js` 的 5/5 合成测试。重点核：模块私有 transport 品牌不可伪造、root/site token 内存复用、report 全路径/ID 脱敏、response.json deadline、调用方只能收紧硬上限、逐 endpoint query/path allowlist、24/8 预算、stop/no-retry/no-redirect/no-fallback、context/board barrier、冻结文件 unchanged。不得执行真实 HTTP、token exchange、AI、provider、DB、SQL、服务或国内入口。

QA 通过只能证明合成控制器安全边界；真实侦察仍需单独批准和完整上游合同，第二源继续停止。
