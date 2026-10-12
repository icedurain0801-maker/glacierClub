# 抓取任务记录时间列修复

Status: tested, pending deployment

境外 X-Clash 的长状态错误信息导致自动表格布局将状态列撑到约 3418px，后续时间、统计和操作列被挤出可视区域。接口时间字段完整。

- 新增 `../admin/PublicOpinion/assets/collection-runs-layout.css`：状态说明最大宽度 240px，长单词允许换行，不裁剪完整错误信息；抓取 ID 单行省略。
- `../admin/PublicOpinion/collection-runs.html` 引入独立样式。
- 手机布局覆盖桌面表格最小宽度，继续使用原有卡片布局。
- 未修改接口、数据、权限、API 服务或 Worker。

验证：`.tests/2026-10/2026-10-12/collection-runs-layout.cjs` 使用已登录的真实 Edge，证书校验开启。境内、境外 × 1920/1440/375 共六项布局检查通过；只读 sync-runs 接口 200 且开始时间完整；展开/收起详情、刷新通过；无页面脚本错误。1440px 下保留表格内部横向滚动，1920px 全部列直接可见。

发布：复制当前现役前端 release 后仅补丁上述 HTML 和新 CSS，重新生成并验证 manifest，保留回滚 XML；仅重启 PublicOpinionFrontend3001。正式地址复测结果见 `collection-runs-layout-live.json`（发布后生成）。
