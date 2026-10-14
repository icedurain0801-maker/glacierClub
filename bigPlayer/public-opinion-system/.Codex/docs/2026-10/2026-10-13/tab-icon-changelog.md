# 舆情系统页签图标

新增 ../admin/PublicOpinion/opinion-favicon-v2.svg：蓝底、青色折线和白色坐标轴，适配小尺寸页签。七个HTML页面统一引用新图标，补齐permissions.html原先缺少的favicon；新文件名避免旧缓存。

从现役前端版本复制后仅替换图标引用，保留权限布局和其他改动，启用release-20261013-tab-icon-r1。无需修改API或数据库。

可见Edge验证权限、概览、内容页图标引用正确，新SVG响应200。证据 .tests/2026-10/2026-10-13/tab-icon-browser.json。未提交、未推送Git。
