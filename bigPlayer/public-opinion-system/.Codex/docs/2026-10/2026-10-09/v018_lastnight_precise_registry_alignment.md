# 海外精准站点登记对齐

Status: QA_PENDING / NOT_DEPLOYED。

经理实证：language2 config site-8483…、registry legacy-8483…，URL完全同enabled1；9/16只有config尚未登记。Store在schemaREADY后alignment失败，0HTTP/0Store，非权限问题。

独立脚本lastnight-precise-alignment --approved-plan：inspect-alignment生成绑定配置原文/registry全字段的hash（仅SELECT与锁，ROLLBACK，无数据写）；apply-alignment按该hash同名账号锁+source/account行锁+无active run/lease+config CAS，保留原legacy行全部auth/capabilities/url字段，只对齐language2 config ID，新增9/16登记，不修改历史run/checkpoint，不DDL。所有URL沿严格已确认合同；其他config字段原样保留。

总deadline15秒/SQL8秒，commit前后原配置/登记证据AES-GCM加密exclusive fsync；提交ACK未知单列，不能盲重跑。后置严格三站siteId/url/enabled一致，legacy整行不变。无shared Worker/SDK/token交换，无国内修改。旧包新源码变更后不执行，待新冻结QA后经理inspect→绑定hash→apply串行，配置验收后新唯一输出继续首次Store。

按经理补充收敛：实际配置CAS/保legacy/补两行复用既有lastNightSiteAlignment.apply，不再另写apply算法。独立wrapper持有原事务，将既有commit延迟到原文配置一致/完整登记后置校验和加密证据完成；补deadline/同名锁/commit未知，历史ID读取仅用于既有安全plan，不写历史。中间fTTYh1撤回未交付。

为避免旧日任务main的shared Worker依赖进入静态闭包，SiteAlignment改依赖纯scope/AlignmentContract；plan合同与旧planner做等价fixture验证，apply/rollback业务逻辑未改。最终受影响9/9 PASS（既有apply/rollback4、精准wrapper3、清单2）；语法/限定空白通过。

最终冻结：根 `.temp/bigplayer-recovery-20261009/lastnight-runtime-60JPM6`，含inspect-alignment/apply-alignment未批准模板，执行命令 `node scripts/lastnight-precise-alignment.js --approved-plan <绝对json>`。QA后经理先inspect绑定输出planHash，再apply同账号/identity和该hash；不读secret、不发上游。历史实证run仅NULL、checkpoint NULL/legacy，保持全部原ID。

| 文件 | SHA256 |
|---|---|
| scripts/lastnight-precise-alignment.js | 0813ed87020aa05fa86bf45b8925c7f1b81e6b304e971d29bbb291840fdcedb3 |
| worker/src/lastNightPreciseAlignment.js | 6621ebaa94c4806575da1b9ae9cfbfab902b509a8b57144c2dba495a3c6723b8 |
| worker/src/lastNightSiteAlignment.js | ee9013c1f041fd655e9ab93729f1d195e21f9af19078c7b9be7c1a045480c10f |
| worker/src/lastNightAlignmentContract.js | f896475a30462ab64a753965bb476e2add59e78144fcc850d0c5bcb56b25cbd0 |

当前未部署/未现场数据修正；配置验收后由经理新唯一Store输出继续。真实AI、完整日分页/slot/02仍未完成。
