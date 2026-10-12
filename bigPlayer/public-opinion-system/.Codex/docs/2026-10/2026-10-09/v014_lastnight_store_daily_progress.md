# 海外 Store 与日执行剩余链路

Status: IMPLEMENTING / NOT_RELEASED。

真实 jlvSA4 metadata context/board 均200 code0；collect12HTTP、9窗口内帖子、9详情补全、0fallback、hasMore=true、零Store。原direct合同有效；不重复上游探测。

新增海外专用 ProtectedStore：复用现有 Repository _upsertContentPageAttempt 的 pinned事务，精确source/account/board现有行FOR UPDATE；保护原内容与本feed membership，commit前后调用持久证据接口，需加密落盘；事务总时限+每SQL时限，未知commit单列，不声称回滚。新增内容不删除；原内容CAS恢复遇整行变化或AI已运行/完成拒绝，membership保留，不冒充完全历史回退。

队列只新增/changed exact IDs及fingerprint，force:false，失败返回已排队与剩余精确IDs。AI只观测现有消费者的exact job/content/fingerprint/version/level/analyzed_at全部匹配，未完成明确单列，不启动新消费者或改算法。

上述为候选模块，尚未CLI接线、测试与独立QA，不可现场Store。三站日采集、持久slot、02入口仍独立未完成。无DDL/现场DB/外部请求/国内任务变更。

员工审核后增补：Store拒重复externalId/越界feed，总deadline覆盖取连接及journal挂起；journal AES-GCM加密、exclusive写+fsync，不保存明文原行。CAS取得同名账号锁并锁job，任何已有job都拒回退正文；只称局部内容恢复，保留新历史。队列锁content/job同事务复用现有enqueue，running/lease和stale completed拒绝不改，保留剩余IDs，不声称重新分析已完成。观测join限定light/version/fingerprint，空集合不算AI完成，deep覆盖后保守未证明完成。

新增独立DailySlot候选：复用既有scheduleSlotAtomic，但在同一事务commit之前验证固定父+三子并原子running/独立owner，避免shared Worker可见queued抢占窗口；持久source+scheduled_at唯一slot，显式北京时间02:00。窄化窗口拒绝而非假全日。仍需schema/账号锁/续租/分页/checkpoint接线QA，不可作为02正式入口。三站固定direct合同上游HTTP可能同形，报告只称三个registry身份，不声称三语言隔离，内容跨site去重。

技术核查提醒已知现役run缺六列：DailySlot必须先精确schema SELECT，缺列报告具体字段且零写；不现场运行adapter，不做029/030迁移。Store也先核contents board_key/board_id等实际列，缺列先于锁/HTTP/写失败关闭。仓库算法复用和26/26 fixture仅证明本地候选，不证明现役schema可用。

剩余：Store queue事务总时限/补偿总时限及真实SQL集成负例仍需收口；stale completed明确拒绝、精准恢复/重入队CLI尚未完成；AI只观测不称已完成；daily已知schema差异需兼容最小方案，分页/续租/checkpoint/02真实入口未实现。本轮不能放行现场Store或daily。
