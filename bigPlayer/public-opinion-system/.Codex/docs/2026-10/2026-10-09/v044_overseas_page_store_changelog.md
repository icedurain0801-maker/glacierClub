# 海外新主链当前数据库存储候选

Status: implemented / isolated-validation-pending / production-NO_GO

- 新增 overseasBigPlayerPageStore：不引用旧LastNight执行框架，复用当前Repository正文/父链/计数/游标事务；国内原调用不变。
- 必须验证外部不可变run合同，每页含空页校验run/source/account/game/community/site/window/owner/epoch；站点配置及registry变化拒绝。
- 无board列时仅机械移除已知INSERT board字段，使用当前有效身份字段；零DDL/历史重键。已有root/parent/context/readback全部验证真实raw标记，缺历史证据需显式验证回调，冲突不可覆盖。
- 同页及存量跨externalId fingerprint碰撞拒绝；内容raw只存稳定scope，不把run/manifest写入导致重跑伪变更。页和beforeCommit入队钩子共用连接，失败回滚；commit回执不确定销毁连接并失败关闭。
- 当前尚未接入真实消费者。历史多站点证明、AI/翻译精确入队、完整端到端、第二源配置及共享接管仍未验收。
- 海外adapter显式传入合同验证器时才提供pageStore，不替换共享repo，不改变缺列生产门禁。验证器缺失时无存储能力，不能隐式批准。
- 本地审查补强：续租SQL必须仍live且epoch一致，checkpoint须expectedCursor CAS；读回checkpoint移到同连接提交前，避免小连接池死锁和已提交后读错导致误重试。
- 再补checkpoint live、根帖类型/非删除、父子深度及同根图校验，拒绝自引用、回复直接挂根与删除祖先。
