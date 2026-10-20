# 告警列表无标题展示

Status: live-verified

只修改alerts.js的renderRisk：标题为空或空白时不生成标题行，直接显示正文；有标题正常保留。候选以当前现役最小覆盖，不夹带未发布处理人字段。
JS语法检查、实际renderRisk函数的三种合成输入、浏览器DOM展示验证通过；前端47文件运行包校验通过。已确认并切换现役、未推Git、未发布BaaS。

现役release-20261019-no-title-r1，健康检查和47文件运行包校验通过。真实Last Light告警11条，标题占位0、标题行0，直接显示正文。截图：.tests/2026-10/2026-10-19/no-title-live.png。
