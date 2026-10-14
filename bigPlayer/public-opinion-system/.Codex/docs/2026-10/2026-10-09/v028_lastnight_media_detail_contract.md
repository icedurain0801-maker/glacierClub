# 无文本详情块证据与保真合同

Status: IMPLEMENTATION_IN_PROGRESS / NOT_FROZEN / NOT_EXECUTED

经理真实只读shape：六条均data object、详情ID匹配、content非空array、无text；三条type1/data string，三条type5/data string。type5 mediaPresent=false只是旧诊断映射未识别，不证明无媒体。没有重复HTTP诊断。

本仓库client/shared/SDK/aiCompanion排node_modules/vendor的扫描未找到内容块type5定义；circle activity参数type5不是内容块枚举。已消息请技术核查/经理提供已有正式客户端/API定义，未知5仍失败关闭。

新增lastNightDetailBlockContract：严格ID匹配与非空原始详情blocks，type1按原Connector注释明确media，仅安全HTTPS媒体字符串，保真clone完整provider详情，不造正文，AItextAvailable=false/明确需已批准媒体分析。unknown5、空媒介、错误ID拒绝。两项开发测试通过。未接生产adapter/旧writer仍要求detail_enriched，因此当前不申请生产放行、不把合同当全链修复。完整16/02消费者仍继续，未DDL/push/改原544。
