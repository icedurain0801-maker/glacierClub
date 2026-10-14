# v137 祖先锁原语与非空父回归交QA

Status: ISOLATED_ANCESTOR_LOCKS_PARENT_REGRESSION_PASS

最终冻结 `.temp/overseas-qa-scheduled-stage-cA52qM`，manifest SHA `fbc7cbf7d5736a24fd88c953d93824fb511c7a59bacf806ee1b3a476cfc66845`，692文件。前后verify原始 `.temp/cA52qM-dev-preverify.raw.txt`、`cA52qM-dev-postverify.raw.txt` SHA均 `667de346ba91f47f14d552399078731353c0064889f1f17f2fdd568ef18667f7`。

冻结开发原语5项 `.temp/overseas-real-db-bU10Mk/result.json` SHA `5283cca5ce571461493d4fedae1f615478655130b1ac1e5422fc280207456926`；非空父回归 `.temp/overseas-real-db-LtMQLX/result.json` SHA `07e152dcf196e8c43f558966448320ec48f3a0ef903c1825edc9e17f066b796e`。exit0，停止释放true。

复审修复NULL depth/is_deleted被Number转0缺陷，加真实SQL负测。READ COMMITTED下仅锁已有membership，不宣称gap lock阻止插入。旧LlOjkA冻结/原件保留为修复前历史，不交QA。

原语实际范围：深度2未link历史祖先闭包，RR旧快照后current删除拒绝，排序锁持有barrier下distinct writer超时、释放后成功，发现至锁之间引用漂移拒绝，两个NULL拒绝。父聚合新增同原语+READ COMMITTED，回归两post/空comments。不证明parent完整comment祖先链、membership动态插入、恢复/epoch2或真实抓取。

生产持久策略/现役热加载/切共享入口影响国内仍未交付，具体最小切换依赖与排空/回退方案见v133；禁止以60sec配置承诺时长。cursor anchor/全失败/translation字段矩阵仍未完成。整体FULL_RUNTIME_NO_GO/CUTOVER_HOLD。

## 独立 QA 接收

v139报告已读取，开发重算四原件SHA一致：前后verify均 `002c3024c4d2c4d629c412c34850cead35d92cc61393453039bbe2be17c08e71`；tmyZXL/result `2a8b57be8a9e1e07406b90b0dce2535e0b19a279595b5c620bb023b3712e0d4b`；Hx0WEb/result `857f54f282b0047a06c7d4ffa23df8395d61b75ee175651a787983297068bbd5`。独立范围仅五锁原语与两post/空comments父回归，实例停止释放。不升级完整祖先链/membership动态插入/真实运行，整体HOLD。

报告“每站两个post”与夹具每站一个、总计两个的口径不符，需QA修正文案；原始结果PASS与hash不受文案更正影响。
