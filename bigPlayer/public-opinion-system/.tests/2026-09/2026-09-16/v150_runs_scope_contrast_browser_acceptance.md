# v150 抓取任务记录 Scope 下拉可读性浏览器验收

- 验收时间：2026-09-16
- 验收角色：测试负责人
- 验收范围：仅 `admin/PublicOpinion/collection-runs.html` 及其页面级样式 `assets/collection-runs-scope.css?v=151`
- 验收环境：已授权的 `https://lfy3001.dev.q1op.com` 真实页面；浏览器只读操作，未执行采集、保存、删除或其他写操作。
- 结论：**PASS（页面级范围）**

## 验收结果

| 项目 | 结果 | 实测证据 |
| --- | --- | --- |
| 正常态 | PASS | 平台、地区、社区 3 个 Scope 控件：白底 `rgb(255,255,255)`、深色文字 `rgb(31,41,55)`、不透明度 `1`、`color-scheme: light`、`appearance: auto`。 |
| Hover / Focus | PASS | 三个控件 hover、focus 后文字均维持 `rgb(31,41,55)`；选值、宽高未变化。 |
| Disabled | PASS | 仅在浏览器 DOM 临时设置 `disabled` 后验证，文字为 `rgb(102,112,133)`、白底、不透明度 `1`，选值与尺寸不变；已恢复原状态。 |
| 移动端（375 × 812） | PASS | 三个控件白底深色字，尺寸分别为 130×34、201×34、339×34，均可见。 |
| Scope 社区切换 | PASS | 从 `00000000-0000-0000-0000-000000000101` 切到 `8b1f0000000000000000000000000021` 后，URL、当前选值与运行列表（`共 0 条`）一致。 |
| Scope 地区切换 | PASS | 切到境外后 URL 为 `regionCode=overseas&communityId=8b1f0000000000000000000000100013&platform=bigplayer_h5`，当前选值与列表同步。 |
| 跨页 Scope 继承 | PASS | 从境外 Scope 跳转 `index.html` 再返回，平台、地区、社区依次保持 `bigplayer_h5`、`overseas`、`8b1f0000000000000000000000100013`。 |
| 非范围页隔离 | PASS | `index.html`、`content.html`、`alerts.html`、`sources.html`、`keywords.html` 的 `link[href*="collection-runs-scope.css"]` 数量均为 0。 |
| 浏览器错误/警告 | PASS | 页面错误与控制台 error/warning 均为 0。 |
| 自动化补验 | PASS | 开发仅修复测试脚本的基于 `__dirname` 的输入/截图路径后，从 `public-opinion-system` 约定入口执行 `node --test .tests\\2026-09\\2026-09-16\\v150_runs_scope_browser.test.js`：1/1 PASS、0 failed，耗时约 7.9 秒。 |

## 说明

1. 本报告不对已撤销的“六页共享 CSS”范围作任何 PASS 结论；本轮仅认可 `collection-runs.html` 的页面级修复。
2. 初版 `v150_runs_scope_browser.test.js` 的相对路径在当前工作区命令入口解析错误。开发已仅修复该测试脚本的路径计算，并完成上述自动化补验；未改动业务 HTML、CSS 或 JS。
