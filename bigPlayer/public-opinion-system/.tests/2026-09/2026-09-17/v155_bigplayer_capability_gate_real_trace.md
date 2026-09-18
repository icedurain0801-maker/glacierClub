# v155 BigPlayer 新建源能力检测真实链路取证

- 日期：2026-09-17
- 采集源：`8c690d6e-12ea-4ad3-b434-d941276c4906`（BigPlayer社区001 / X-Clash）
- 入口：`https://lfy3001.dev.q1op.com/admin/PublicOpinion/sources.html?regionCode=overseas&communityId=8b1f0000000000000000000000100016&platform=bigplayer_h5&sourceId=8c690d6e-12ea-4ad3-b434-d941276c4906`

## 真实探测

直接对外网 3001 代理执行只读范围外的能力检测请求（该接口本身会持久化检测结果，按本单授权执行）：

```text
POST /api/public-opinion/sources/8c690d6e-12ea-4ad3-b434-d941276c4906/check-capabilities
HTTP 200
X-Kong-Upstream-Latency: 5037ms
{"data":{"installed":true,"authorized":true,"reason":null,"capabilities":{"posts":"configured","comments":"configured"}},"meta":{}}
```

页面在检测前及检测后刷新均显示：

- 帖子：已配置，未测试
- 评论（含评论内回复）：已配置，未测试
- 开始同步按钮：禁用
- 禁用原因：`请先检测帖子同步能力`

## 结论

真实外网响应仍为旧的 `configured` 状态，未达到本单要求的 `full/authorized_scope/supported`；因此同步门禁正确保持禁用，但无法证明外网已加载本次服务端 `detectCapabilities` 修复。该结果作为失败路径交独立测试负责人，不宣称 PASS，不执行部署或系统变更。
