# 已处理记录显示处理人和时间

Status: candidate-tested

告警列表对 handling_status=processed 的记录显示处理人和处理时间；待处理和无需处理不显示。后端新增 handled_by_name，处理接口写入当前登录显示名，历史无名称记录显示“未知处理人”。新增迁移 migrations/034_content_handling_actor.sql。

验证：node --check 通过；handlingStatusFilter.test.js 2/2通过；git diff --check通过。浏览器隔离验收待执行。未切换现役、未推Git、未发布BaaS。
