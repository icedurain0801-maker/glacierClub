---
status: candidate_pending_independent_qa
scope: bigplayer_dedup_overlap_only
---

# BigPlayer 重叠 Feed 去重变更记录

## 范围

- 用纯内存 fixture 模拟 merged feed 与分类 feed 返回同一 `externalId/contentType`。
- 唯一身份按 `source/external/contentType` 收敛为一条内容。
- 统计 `inserted/changed/duplicate`，重复内容只创建一次 AI job。

## 排除范围

- 不修改生产 DB、真实 Run、其他平台或生产配置。

## 验证

- DEDUP-01 定向测试断言 1 条内容、`inserted=1/changed=0/duplicate=1` 和单个 AI job。
