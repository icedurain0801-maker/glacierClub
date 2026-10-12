# v019 I1/I2 专属身份与受控流冻结交接

Status: I1_FIXTURE_IDENTITY_PASS / I2_INTERNAL_STREAM_PASS / FULL_RUNTIME_NO_GO / CUTOVER_HOLD
Date: 2026-10-10 (Asia/Shanghai)
Owner: 开发负责人

## 独立签收更新

独立报告 `.tests/2026-10/2026-10-10/v034_v019_i1_i2_identity_stream_independent_qa.md` 已签收原冻结 I1 4BXp0C（6/6、自有3/3）与 I2 avtmye（8/8、自有8/8），前后5文件 bytes/hash一致。仅签收 fixture 身份合同及内部合成流；不覆盖后续活动树 reader/临时转换增量，不证明真实 SQL、凭据、provider schema、网络或自然5分钟到期。开发原件仍为 DEV_TEST_EVIDENCE。下文 QA_PENDING 为历史状态，以本节限定签收为准。

## 当前正式交接（取代下方首版开发历史）

员工最终只读复审确认首版两阻断已闭合，未见新明显阻断；仅源码/断言审核，不代独立动态签收。真实身份新鲜度、网络/provider schema和生产运行不在结论内。

本地员工只读审查发现首版缺v2投影hash及真实合成request/token消费，负责人已修：新增非秘密v2 projection/hash与sites-registry一致核验；内部固定GET/精确URL/query/authorization request descriptor，transport实际核本站exchange token与descriptor，不返回秘密对象；token跨站/错值/query未知重复/path额外/section descriptor篡改六类负测整批停止。延迟可abort；报告改为非秘密shape summary hash、elapsed，不hash含token正文。生产入口仍恒拒，Qqqk9O未改。

| 当前阶段 | 新唯一冻结manifest | SHA256 | 开发原件/SHA256 |
|---|---|---|---|
| I1 | 根.temp/v019-contract-identity-4BXp0C/manifest.json | 7d9f359e043abd4bb773b74fd683867d7fc633a0d44456077ac2e48e98942044 | 根.temp/v019-contract-dev-lAmHj1/result.json；5a92726240adce66e35ca8cfd9bb404a7a0f0667d2b425c9f8eccfe8927987e6 |
| I2 | 根.temp/v019-contract-stream-avtmye/manifest.json | f3f7d90f9596a792bac1f389a680e08a8492fd610fa5ed66c480a14d22cd5c64 | 根.temp/v019-contract-dev-P5nBSG/result.json；16b187e21dbffe34dd94fd30a276f89a9b3a39ff37fe79315661b53958b7b6c5 |

当前共用模块SHA `a4de4db80c92ad61286f766cd2ee24c52ee7f2af9d07863d9825359f3ce20499`，两阶段均5文件加manifest、前后verify一致。开发I1 6/6、I2 8/8，exit0、passed=true、unchanged=true，实际kind DEV_TEST_EVIDENCE。流测试已补恰1MiB/+1及恰8MiB/+1、1024小块、触发失败已读字节保留。读取可能收到超限chunk后才拒，未保存越界chunk，不声称从未读取超限字节；独立QA仍待签收。能力自然5min到期未实际等待验证，未来真实network/代理/DNS/连接abort合同未验。

精确命令：在各自冻结cwd运行 `node scripts/v019-observation-contract-freeze.js --verify <本阶段上述SHA>`，再 `--test <同SHA>`；生产/真实secret/SQL/HTTP/child业务调用均禁止，无端口owner。请独立审当前能力、投影、exact request/token、时限/流硬限/脱敏并追加负测。首版NglX6D/eWSenp及中间qyPcEH保留，不以首版6/7测试结论转为当前独立PASS。I3读取/身份/影响决定包见当日v035，尚非可执行真实授权。

## 首版开发历史（未交作完整合同签收）

## 实现与边界

新文件 `scripts/overseas-v019-observation-contract.js` 将身份签发与内部流执行放在同一模块，避免公开resolver/token getter/callback工厂授伪造能力。私有WeakMap存完整fixture绑定，外部只得不可复制空句柄；精确source/account/唯一active api_token元数据/三站config-registry URL与hash/五种版本/manifest/内部plan hash/nonce/单调deadline，dispatch前观察快照完全一致；单次消费。生产签发 `issueProductionIdentity` 恒抛 `REAL_IDENTITY_ISSUANCE_DISABLED`；fixture永远不是生产授权。无真实凭据、SQL、HTTP、env loader、run/恢复proof。

内部9认证-only/24样本两模式，unknown只能明确允许auth-only，sample拒unknown。固定endpoint槽、每站一次synthetic exchange并复用本站内存session；context/board后才feeds，detail/comment/reply使用同站合成样本。串行预算、失败整批abort；request+transport+全部reader.read共享absolute deadline，10s/5min只可收紧。内部ReadableStream按data-onlyfault生成，逐chunk累加，单响应1MiB/全批8MiB超限先拒再保留已读计数，不信Content-Length；UTF8 fatal/JSON校验、identity encoding，未知编码拒绝。取消并release reader，session引用释放。

不输出原身份/URL/query/header/token/body/provider原文；日志仅固定phase/endpoint模板、随机site HMAC/status/字节/摘要/固定errorCode。网络guard仅防可信测试事故，不是Proxy/恶意JS沙箱。同步JSON.parse不能timer抢占，限制为1MiB后检查；JS string不承诺物理擦除。真实Node代理/DNS/连接abort仍未验证，不能把内部stream取消等同真实HTTP abort。

## 分别冻结与开发原件

全部.temp路径相对仓库根 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage`。

| 阶段 | 冻结manifest | SHA256 | 开发原件与SHA |
|---|---|---|---|
| I1 identity | .temp/v019-contract-identity-NglX6D/manifest.json | 6a6ce740108f3e5d4ffde9ac90bc6c431e8439cee5f28378550fde22535eb8e6 | .temp/v019-contract-dev-LLeSP1/result.json；f0946310c92aa1e4cac747823bfb71dd41e064f3cd218862e3f333260469654b |
| I2 stream | .temp/v019-contract-stream-eWSenp/manifest.json | 16ab7147b29f9d4900ce1c6f25d0624ac9966abbc80c80dab6c851ff2c373c32 | .temp/v019-contract-dev-AMx36j/result.json；323f6b39d3858ed004e70352aacb0354efda7c05cf0ca0143a8b01305552cb6d |

共用模块SHA `bbca0f727fcd62265d1aff1de5aaf325b727b919bb6dba7d6f18baea499e2734`；各包5个文件加manifest，只选择自身阶段测试。精确manifest含test/guard/fixture/runner bytes/hash。两开发原件实际DEV_TEST_EVIDENCE、exit0、passed=true、unchanged=true；I1 6/6、I2 7/7。不是独立PASS，未复用Qqqk9O签收。

冻结cwd精确命令：

```text
node scripts/v019-observation-contract-freeze.js --verify <该阶段manifest SHA256>
node scripts/v019-observation-contract-freeze.js --test <该阶段manifest SHA256>
```

runner只固定Node+offline guard/no-isolation/单阶段test、白名单OS env，前后verify；无端口owner，不占13316。测试编排child不等业务fresh-process能力，测试进程child/socket/TLS/fetch禁止。

I1覆盖复制/伪造/生产签发拒绝、17身份替换、各层getter/symbol零调用、函数/循环/继承/数组额外键、unknown模式限制、五版本漂移和单次消费。I2覆盖24/8与timer clamp、transport+body共享deadline、挂起/总timer、实际小块响应超限/跨slot8MiB累计、redirect/HTTP/编码/scope/UTF8/JSON十类错误整批停止及外部callback拒绝。精确等于1MiB/8MiB边界、响应schema更多结构负例及真实网络合同可由独立QA追加检查，不预写已测。

请QA独立审源码与输入/品牌/错误合同，复跑分别冻结的精确命令和自有负测，核前后byte/hash、原件齐后限定签收；任何缺陷另冻结，不改这些包。I3实际身份来源/secret读取/真实transport/HTTP/费用/国内共享影响另门禁。

## 变更记录

员工提出技术建议，负责人审核并唯一落地新专属合同模块、合成fixture、两阶段测试、freeze/verify/证据runner。无Qqqk9O修改、无业务connector/shared/国内变更；生产入口关闭。开发6+7测试通过，旧冻结保留，未commit/push/发版。
