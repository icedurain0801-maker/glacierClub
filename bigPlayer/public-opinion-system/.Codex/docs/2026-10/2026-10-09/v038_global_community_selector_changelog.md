# 全舆情页面六社区选择器

Status: candidate / pending-independent-QA

共享 scope 在真实社区列表进入 state 前按地区六名称白名单过滤排序，保留真实 id 与权限对象，不造社区；隐藏 URL/session 与控件值回退到可用名单项，popstate 同步 replace URL。六页缓存引用统一 v148。

只读已确认：国内超能世界国服版、圣魂纷争、我要当老祖；海外 X-Clash、Last Light、Hero Clash 均 enabled。数据库、采集、Worker、调度、算法、历史数据未修改。

待验证：六页深链/session/地区切换/空态/权限及独立真实浏览器验收。仅前端改动，与海外业务候选分开交付。
