# 所有页面增加境外社区

Status: live（已获用户确认并切换，浏览器验收待连接恢复）

用户要求所有页面的境外社区选择器展示 TitanWarEA、TitanWarSA、히어로 클래시、マジックカード、HeroClashS、X-ヒーロー、X-HeroSA、X-HeroEA、주공을 지켜라、主公、走れ！、KingdomGo。目录核对“主公、走れ！”为完整的单一社区名，本次共新增11个，保留原有X-Clash、Last Light、Hero Clash，共14个。

只调整 `../admin/PublicOpinion/assets/scope.js` 的可见名单和6页资源版本。不创建社区、不修改数据、账号、权限或采集开关，不包含未发布的Token续期等工作区改动。境内仍不显示圣魂纷争。

最小候选基于现役 `release-20261019-hide-shfz-r1`，路径：`E:/CodexData/public-opinion/frontend3001/releases/release-20261019-overseas-communities-r1`。

验证：读取真实社区目录，14个名称均匹配唯一ID、状态enabled；其余未指定社区保持隐藏；6页资源版本一致，脚本语法、空白及47文件清单校验通过。记录：`.tests/2026-10/2026-10-19/overseas-communities-candidate.json`。浏览器工具仍只有MCP Apps，无可控制浏览器，实际页面验收待完成。

用户已弹窗确认，现役已切换至 release-20261019-overseas-communities-r1，健康检查通过。本机及外网6页共12次HTTP检查均200且资源版本正确，外网共用名单与本机一致。实测记录：`.tests/2026-10/2026-10-19/overseas-communities-live.json`。浏览器工具重试仍仅MCP Apps且无页签，不能宣称浏览器验收通过。不推Git、不发布BaaS。
