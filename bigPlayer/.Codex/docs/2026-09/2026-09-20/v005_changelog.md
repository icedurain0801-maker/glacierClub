# v005 变更记录

- 新增国内 C 端福利任务页面 `client/domestic/home/WelfareTask.html`。
- 页面复刻 `search-results.html` 的 375×667 内容尺寸与 C 端视觉体系，外层不使用圆角矩形和阴影。
- 福利任务页包含等级经验进度、每日任务、每周任务、等级说明、获取记录提示、帮助弹层和任务跳转原型交互。
- 在 C 端首页模块新增“福利任务”页签，跳转路径为 `client/domestic/home/WelfareTask.html`。
- 国内 C 端页面的共享导航数据脚本增加版本参数，避免缓存旧目录。
