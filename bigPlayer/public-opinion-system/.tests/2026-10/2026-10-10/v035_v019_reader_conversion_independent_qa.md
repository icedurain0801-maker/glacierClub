# v019 reader 与 unknown 转换独立 QA

Status: FIXTURE_READER_CONTRACT_PASS / FIXTURE_CONVERSION_PASS / INTEGRATION_NOT_TESTED / FULL_RUNTIME_NO_GO / CUTOVER_HOLD

Date: 2026-10-10 (Asia/Shanghai)

## 冻结与原件

| 阶段 | 冻结根（仓库根 `.temp`） | manifest SHA256 | 文件与执行 |
| --- | --- | --- | --- |
| reader | `v019-contract-reader-Kxx61Q/` | `088b69cb6038b8e3806aa560457fcb963be9beb5b0f50af882be09ae3d7b2026` | 6 文件加 manifest；冻结测试 10/10、exit 0 |
| conversion | `v019-contract-conversion-fnClEp/` | `b056df54d92a729e4e1d0466794412a2c3ce6b4e8e636c70f17e8e0385e0adc3` | 5 文件加 manifest；冻结测试 8/8、exit 0 |

两包分别在冻结 cwd 运行 `node scripts/v019-observation-contract-freeze.js --verify <对应SHA>`、`--test <对应SHA>`、后置同一 `--verify`，均 exit 0；独立逐文件核前后 bytes/SHA 全匹配，无额外文件。共用 observation 模块 23571 bytes / SHA256 `b8c28543bb2e573b09a768ef3ec18859ffd5265010447b0529c6ff4fdc57dedf`，guard 937 bytes / `2f801b5051c08b93dadfff9322f7cca4090c23234a915b57fd95eef0844208d9`，freeze runner 4665 bytes / `04caee3401d43d748c9bf9d1279efea2882b32ac564c89379b7d875ab59199f1`，fixture 1470 bytes / `df90cdaa00d33d6027594b9b4bbfdfa7ae0c0d72b8bab5f092fa86821e5c601e`。reader 专属模块 19954 bytes / `b9e9c0f5f0d47afd8bfb980218c8bab4ee408abc52a453671c9c78598d17c32d`、测试 8251 bytes / `41bd0b357408e8fe3c53e21d900eb886fda628e221d2bbbb86094361352e93a6`；conversion 测试 5098 bytes / `5ee66117c9a5e2e57302ada0a9850b2616e22f190fac6fb9d7dd64bc043fd669`。

开发交接原件均为 `DEV_TEST_EVIDENCE`：reader `.temp/v019-contract-dev-FKu3vv/result.json` SHA256 `51a95de46a0a84d15a435758319e0eb4c457af4b9c67bf240f5bcb302b842827`，conversion `.temp/v019-contract-dev-pCextE/result.json` SHA256 `29f1902888de193f2b141d92c13ff3588746512d890abf45abbf374b505f1049`，不代独立签收。本轮独立执行原件分别为 `.temp/v019-contract-dev-RJlDL1/result.json` SHA256 `7c2b8992cf3e47d2e9e2bf790f5e4a404a9d51caaa041f80cb47670bc91204f6`、`.temp/v019-contract-dev-0nx1xX/result.json` SHA256 `34b83307a58c8ed5a7f9976eb88c76960513150f7ca922c4f432d009b0df5fb3`，runner 固定 kind 仍是 `DEV_TEST_EVIDENCE`；stdout 10/10、8/8，stderr 均空。

## Reader 限定签收

独立审阅 R1-R8/V1 的固定参数化 SELECT、精确参数和扁平列合同；生产 reader 恒拒。自有负测 7/7 组：auth-only 17 SELECT、sample 32 SELECT，短只读事务 rollback 数与 trace 对齐；R1 目标漂移、R2-R7 返回行字段漂移均在对应 SELECT 停止并销毁；R8 密文替换/过期、V1 active credential count、指纹、config、账户期限漂移拒绝。R1/R5/R8/V1 合成超时销毁，trace 最后为 `DESTROY`，无后续 query/rollback/reconnect。私有 handle 不可复制或跨 reader、secret 单次加载，finish 后失效；R8 后短期限自然到期，V1 前停于第 8 SELECT 并销毁。trace/report 不含合成 token、refresh、账号/站点 ID。

合成 R8 会读取整个 envelope（包括模拟 refresh），但私有 runtime secret 能力仅留 apiToken；close/finish 删除模块持有的 secret 句柄及引用，不保证调用方已有引用或 JS 内存物理擦除。此处仅内置 data-only fixture 驱动，不证明真实 SQL schema、mysql2 取消/destroy、锁等待、解密或真实目标实例。

## Conversion 限定签收

自有负测 4/4 组：unknown 只能经明确允许的 auth-only 三站共 9 槽、0 feeds，全部成功后私有单次 proof 可转换；sample 继续 10..24 的 15 槽，不重复 exchange，feedCount 6，原 registry 对象字节不变。proof 复制、观察漂移、重复转换拒绝，六处 context/board 失败没有 proof。认证阶段 30ms 请求上限不能在取样放大；收紧总期限过期后不能转换。认证已读字节跨阶段继承，8 MiB +1 在取样首响应停止并保留失败已读计数；报告不含合成 token、站点 ID、URL 或内容 ID。转换后 `authorized` 只是本批 fixture 的临时状态，不是 registry 更新或真实授权。

独立探针 `.temp/v019-qa-reader-conversion-probes.js` SHA256 `cd9b0412b4c4508b0a2d581c22ef6ccd414dd3c25ecf635dd833b2c85f20f6a8`；原始结果 `.temp/v019-qa-reader-conversion.raw.json` SHA256 `4622f2540515c44b43c8a5b01c28310a5d188c9801d4652399700085cedab696`，exit 0。

## 未签收

reader secret 尚未接入 observation transport，且没有强制逐 HTTP 请求 V1；真实 metadata→审批→R8→三站观察整链为 `INTEGRATION_NOT_TESTED`。真实 provider/context/board、registry 新鲜度、生产身份能力、SQL、secret、HTTP/代理/DNS/连接 abort 和费用/国内影响均未验。只使用可信 fixture/offline guard；Proxy 不是沙箱。未启动服务、占端口或执行刷新、registry 写、DDL/ACL、push，继续 `FULL_RUNTIME_NO_GO / CUTOVER_HOLD`。中间 reader 冻结 mcq6E9/DzIO59 与 I1/I2 旧签收不覆盖本次结论。
