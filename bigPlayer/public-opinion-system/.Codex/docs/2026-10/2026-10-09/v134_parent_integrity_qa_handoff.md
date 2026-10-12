# v134 集合与五SHA完整性隔离交QA

Status: ISOLATED_PARENT_INTEGRITY_PASS

冻结仓库根 `.temp/overseas-qa-scheduled-stage-PaZt5i`；manifest SHA `16dd601d61313e7cb185ab335c6f80b0b404640734f9f8f2f391caf7f5a5c637`，690文件。开发前后verify实际采集 `.temp/PaZt5i-dev-preverify.raw.txt`、`PaZt5i-dev-postverify.raw.txt`，SHA均 `6a73cff94a2f79fb7aafada3250664cd6eaf57f1606ecadf4f8a86f9f956819d`。

冻结开发 `node scripts/overseas-isolated-mariadb.js --isolated-parent-integrity` exit0/15检查PASS；原件 `.temp/overseas-real-db-3HHDg7/result.json`，SHA `19208cdd00beac94acc77e8d80ec975eacc141452188facdb064d88a9c0e124a`。serverStopped/portReleased true。员工只读复审通过无阻断缺陷。

本项新增范围只有：缺child membership、额外合成child、terminal links/taskSet/completionSet/schema/contract SHA事前逐字段篡改拒绝，每项父收尾五表零写且还原后正常终态。缺membership不等物理删除child；五SHA不等terminal全字段；不包含祖先/动态竞争/非空membership/全部失败/cursor anchor/恢复/真实HTTP/AI/通知。四辅助不放行、生产HOLD国内不动。QA仅新mode，独立前后verify+raw/SHA，不重复旧矩阵。

独立 QA v136报告已接收并重算三原件hash：前后raw均 `eb3e83127ccbd05a46b23e9c96fbc218e915cf914c424709fc4b5147414d269d`；BHYW5b/result `e38ae1857ae1231897dc2826e2384c3714929e5ea8213447f4e5365a81415a8c`，报告一致。自有owner停止释放。仅本15检查局部PASS，v135祖先补丁不在此QA闭包。
