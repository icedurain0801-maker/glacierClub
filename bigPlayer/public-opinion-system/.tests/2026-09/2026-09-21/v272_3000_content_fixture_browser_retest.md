# 3000 内容页 fixture 独立浏览器复测

- 验收时间：2026-09-21（浏览器 tab 52）
- 环境：`http://127.0.0.1:3000` 免登录验收实例
- 页面：`/admin/PublicOpinion/content.html?regionCode=domestic&communityId=00000000-0000-0000-0000-000000000101&platform=bigplayer_h5&publishedFrom=2026-09-20T00%3A00%3A00%2B08%3A00&publishedTo=2026-09-21T00%3A00%3A00%2B08%3A00&contentType=post&contentMode=post`
- 结论：`PASS`

| 检查项 | 结果 |
|---|---|
| 四项统计 | PASS：帖子 2、评论 2、负面待处理 2、关注级 1 |
| 内容列表 | PASS：第 1/1 页，共 4 条 |
| 筛选控件 | PASS：帖子/评论、情感、分析状态、分析等级、内容类型均可见且正常加载 |
| 错误状态 | PASS：未出现 `fixture not found` 或“加载失败” |

未执行生产 sync、未写入或修改生产数据。
