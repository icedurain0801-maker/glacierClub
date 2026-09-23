# v008 共享Scope下拉可读性

日期：2026-09-16
Status: superseded_by_page_only_scope

- v148已由测试负责人真实浏览器PASS后开始修改，避免污染验收版本。
- 仅修改六页共用public-opinion.css，限定地区/社区/平台select；白色输入框、深色选中文字、空值提示和disabled中灰，强制light色系及原生箭头，防止页内浅色文字覆盖，去除disabled透明度影响。
- 保持尺寸、位置、边框及hover/focus已有交互样式，不改任何Scope JS、选值、跨页同步或查询逻辑；不push、不发版。
- 必要开发自测后直接交六页真实浏览器状态验收。
- 六页CSS缓存版本150，其他脚本版本及业务逻辑不变；diff检查通过。
- 真实Playwright开发自测1/1通过，六页×桌面1440x900/移动375x812×正常/hover/focus/disabled；正常选中文字#1f2937与白色背景对比14.68:1，禁用文字#667085对比>=4.5，原生箭头light模式可见，选值/尺寸保持、Console无error/warn。
- disabled仅在测试浏览器DOM置disabled后恢复原值，不派发选择事件、不写服务器、不Mock业务API；正式脚本public-opinion-system/.tests/2026-09/2026-09-16/v149_scope_contrast_browser.test.js，截图同日期目录v149_*。
- 用户撤销六页共享范围，已精确移除本次共享CSS规则并恢复其他五页缓存标记；public-opinion.css无git差异，保留此前各页已有业务改动。
- 新唯一范围仅抓取任务记录页：collection-runs.html加载assets/collection-runs-scope.css?v=151，页级规则仅.command-bar [data-po-scope] select，其他页面不引用、不改统一组件JS或共享CSS。此前六页开发自测不作为新范围验收结论，已停止旧交测并重新按页级范围验证。
