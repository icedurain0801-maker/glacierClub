# BaaS 托管采集源保存被网关 CORS 拦截
Status: blocked-on-gateway-access
Date: 2026-10-16

## 事实
本机 API 4320 和前端代理 3001 的 OPTIONS 响应允许 PATCH，显式允许 content-type,authorization。外层 lfy3001.dev.q1op.com 网关 OPTIONS 响应仅允许 GET,POST,OPTIONS,PUT,DELETE，缺少 PATCH；Allow-Headers 为 *，不能替代显式授权 Authorization。
采集源保存调用 PATCH /sources/:id/configuration，浏览器会在发送业务请求前拦截。后端运行正常不代表托管跨域链路通过。
浏览器实际打开 chat.q1.com 托管采集源页，本次环境连初始连接也失败；该网关 DNS 为内网地址，局域网访问权限是额外可能限制，不能将其与已确定的 PATCH/Authorization 预检缺陷混为一谈。

## 回归检查修改
scripts/windows-services/test-hosted-api.ps1 不再接受 Authorization 的 * 替代；新增实际方法 GET/POST/PUT/PATCH/DELETE 和请求头矩阵。只发 OPTIONS，不写业务数据。
对当前网关运行，按预期失败：Bearer Authorization must be explicitly permitted。

## 待修复
在该域名对应网关 CORS 规则中，保留原站点授权范围，加入 PATCH，并显式允许 authorization,content-type；核对 OPTIONS 与实际响应一致。需已登录的网关管理页面，用户已表示将打开。目前工具未发现管理页，未更改外部网关。
网关修复后重跑预检脚本，并以浏览器隔离数据验证保存；未完成前不称已修复。
Git 未提交未推送，静态托管未发布，业务配置/Token未修改。
