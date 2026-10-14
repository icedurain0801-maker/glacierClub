# v002 变更记录

## 变更范围

- 修复 BigPlayer H5 详情弹窗站点地址 textarea 被说明文字挤压到约 0px 宽的问题。
- 站点地址字段改为标签、输入区、说明纵向布局，textarea 保持 100% 宽度和至少 96px 高度，支持滚动/resize。
- 增加“添加站点”和“删除最后一项”按钮，仅操作 textarea 行内容，不改变 API、Worker 或其他平台。
- 保留旧 `baseUrl` 展示兼容，以及既有非法 URL、凭据 URL、hash URL 和重复 URL 前置校验。

## 修改文件

- `../admin/PublicOpinion/assets/sources.js`
- `../admin/PublicOpinion/public-opinion.css`
- `server/test/publicOpinionSourcesMultisite.contract.test.js`

## 验证

- `node --test server/test/publicOpinionSourcesMultisite.contract.test.js`：2 passed，0 failed。
- `node --check ../admin/PublicOpinion/assets/sources.js`：通过。
- `git diff --check`：通过。
- 本地 3001 真实浏览器：textarea 可见且可输入 3 条 URL；添加/删除按钮可用；重复 URL 提示“站点地址重复”；非法协议提示“站点地址必须是安全的 http(s) 链接”。
- 本地桌面页面无横向溢出（`scrollWidth=clientWidth=1280`）。未保存配置、未触发授权/能力检测、未执行真实抓取、未部署生产。

## 边界

- 本次仅处理前端表单布局和行编辑交互；当前工作区改动尚未同步到外网验收域名，需 QA 使用包含本次资产的静态目录重新验收。
