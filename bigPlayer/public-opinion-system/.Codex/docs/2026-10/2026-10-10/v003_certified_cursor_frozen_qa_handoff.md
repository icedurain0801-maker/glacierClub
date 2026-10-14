# 隔离认证游标冻结交 QA

Status: ISOLATED_CERTIFIED_CURSOR_READER_PASS

冻结仓库根 `.temp/overseas-qa-scheduled-stage-cqz5uX`，693 files；manifest SHA `2355726ad866ecb8184cfeafee6100f6a07b0a6dfc557089f64ae6b2bae92515`。前后开发verify实际raw `.temp/cqz5uX-dev-preverify.raw.txt` / postverify，SHA均 `96e82072c3d8ae0480e7d0cfeebbf3e6fa514848f81f6397446196f45bcf3dd6`。

三个新mode开发PASS：

| Mode | result.json目录 | result SHA | stdout raw SHA |
|---|---|---|---|
| certified-cursor | m3gRN3 | fe7407e4f6122f6738db09a00744868870ebb4cc49ecbf89d4eeb2f9f58a90e6 | ac9bc5d188912f9b574196eaa2a8e1244f526d85a31e016e471c600cec0ff23d |
| certified-cursor-ack-unknown | CqO2Ja | b65560acd9a5ee93c40c418071bd454a2274241038e94b698ff909ff7c27d8be | 96a2d5eb86be4a4aca978e4d7fc443dc24a814d81334545f26e65c16e0e62594 |
| certified-cursor-partial | gj8rB6 | dfc0108b97397fdca6ebe7bed15fe7d344412d574d0d1b4f1201484f74b10823 | 500c5fe832d8cea7b0b640a68c1c0151f24fb12cc2c6cb5a5cf8ceb4d3358bd0 |

目录均在仓库根 `.temp/overseas-real-db-<目录>/result.json`；stdout在 `.temp/cqz5uX-dev--isolated-<mode>.raw.txt`。共享祖先/父锁提取改动必要回归：comment-chain YMF9Nd SHA `8ad7a6c5da13f888db95fde3bee1acbb8b29648eed7feb339c1edcff3c9b5bdd`、historical-chain 0wom58 SHA `af3c394a2ff299140719f51400036afcbf35cb31327070410499645bf921c633`。五mode均exit0、owner停止释放；不是重跑充进度。离线旧anchor/admission/batch11测试PASS。

局部范围：空品牌reader→认证初始anchor→同品牌admit；anchor后未知cursor漂移零写。原成功父事务内封本批完整证据指纹、成功ACK才私有注册；RR快照/RC当前认证读取、身份八字段、cursor tuple、parent/child/terminal五SHA、manifest/task/CP漂移拒绝且12表零写；未知ACK/partial不注册。无关同source合成audit和未来裸CP不影响认证。复审所见跨批次audit污染已修为原children UUID精确集合；当前batch membership全行入指纹。

QA顺序：前verify→三个certified mode→必要comment-chain/historical-chain回归→后verify，保存执行时raw与每result路径/hash。只自有13316/serverId20261036/po_overseas_fixture、每连接核PID/datadir/schema、启动先核空闲、owner停止释放。不得3306、真实HTTP/AI/通知、受限恢复proof、第二consumer，国内不动。

原配置下一槽未到期且本批未等待，`realNextSlotExecuted=false`。非null成功cursor经真正下一槽anchor/admit、历史祖先UPDATE竞争、完整terminal字段矩阵、translation预算、真实持久排空交付仍未完成；不得把初始空reader准入和成功后reader读取称下一槽闭环。生产FULL_RUNTIME_NO_GO/CUTOVER_HOLD。

已核收独立QA `.tests/2026-10/2026-10-10/v004_certified_cursor_independent_qa.md`。开发负责人重算7份运行时raw及5份result共12份SHA，均与报告一致；五owner停止释放且productionTouched=false。独立result：5NFq3R `c21e93f30952ec37f4e1074fbd1d7042f121dbbe8f0662ea57e5fba6660af7b2`；R4R7mS `ef60f01b902b02b4174b332949e51450185d0e4737a3eb7b3750efde82fa9493`；7AQ4Px `785dcab324e270ca6118cc819bbfb16c14e4c111def40427390cb2ecd15e747c`；iLDIfE `513d5352c5ba1b752f163770403d9df7fb723e120a31657bb6758f88cb7d64c9`；s8BGCD `a1df0b624c0704a06e55b14558c1d0651291fdd4b417ef79aeaaefc32163c367`。局部PASS回报项目经理，下一槽及生产边界不变。
