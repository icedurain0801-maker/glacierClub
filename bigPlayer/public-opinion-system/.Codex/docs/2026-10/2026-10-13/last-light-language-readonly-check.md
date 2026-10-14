# Last Light 多语言采集只读检查

Status: 已确认同类语言范围错误；本次仅检查，未发布或补采

## 结论

Last Light（source 081a16d2-5545-4afd-9c65-e04777e4540b）三个启用地址 languageId 分别为 2/9/16，但 lang 均为 en-US。实际 Windows 定时任务仍指向独立运行包 overseas-release-20261012-configured-schedule-r1；该包连接器只读取 lang，没有 q1LanguageResolver。X-Clash 的共享 Worker/API 发布未覆盖此独立包。

## 证据

- 官方映射 2=en-US、9=ko-KR、16=ja-jp。
- 独立定时运行包 transport 确实附加 languageId 查询参数，但 Content-Language 仍来自 lang。实测仅附加查询参数无法区分列表语种。
- 最新父任务 c6384755-a7c1-57bb-a826-0dfad6ee2596 三个子任务各关联 35 条内容，排序后内容 ID 的 SHA256 完全相同；只有英语首站新增 13 条，其余均新增 0。
- 使用独立包的连接器和 community session、当前有效凭据，只读 GET 复现其请求流程：三个站点各获取 20 条样本，实际请求头全部 en-US，20 个帖子 ID 及顺序完全相同。
- 10/12 当前有效入库有 15 条帖子，正文无日语假名或韩文字母；此文字特征仅作辅助证据，主要结论依据任务 ID 集合及真实请求。

检测脚本 `.tests/2026-10/2026-10-13/last-light-language-readonly.cjs`；结果 `.tests/2026-10/2026-10-13/last-light-language-readonly.json`。

第一次采样使用旧包 CredentialContext 无法解析当前凭据，未发出内容请求；改用当前凭据读取模块与正式 env 后采样通过。未打印凭据，未调用登录交换/保存授权，未触发同步，未写业务库或修改运行配置。

## 修复边界

若继续修复，需要将官方 languageId 解析器接入该独立采集包，并验证其授权、网络预算及三语言请求。共享 Worker 有明确 Last Light 排除范围，不应为补采而绕过此边界。采样成功、任务状态成功不能替代各语言范围差异和入库验收。
