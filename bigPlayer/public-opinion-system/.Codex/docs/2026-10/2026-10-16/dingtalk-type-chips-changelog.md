# 推送类型多选标签

Status: 已发布并完成浏览器验收
日期：2026-10-16

将钉钉配置的紧急告警、关注级、优质内容三项原生复选框外观改为红、橙、金色多选标签。选中为浅底色及圆形勾标记，未选中为白底灰边；整块可点击，支持空格键切换、焦点提示、禁用态和减少动画偏好。保留原checkbox、name、value与checked查询，保存与配置读取契约不变。

文件：`../admin/PublicOpinion/assets/baas-dingtalk.js`、`../admin/PublicOpinion/sources.html`。仅追加局部样式、修改模板和缓存版本。现役前端增量运行包 `C:/ProgramData/PublicOpinion/frontend3001/releases/release-20261016-push-type-chips-r1`，47文件manifest、语法和空白校验通过，实际3001响应200及新版本确认。

浏览器在本机现役域名X-Clash详情验证原紧急告警选中状态正确回显；点击关注级、优质内容后3项同时选中，视觉呈现红橙金标签；空格及点击恢复原来的仅紧急告警选择。未保存配置，未更改群或真实推送类型。截图 `.tests/2026-10/2026-10-16/dingtalk-type-chips.png` 展示3项选中外观。

只重启前端3001，原包与XML备份保留。验收覆盖本机现役域名，未另行更新BaaS静态托管版本。
