# 网络前合同门禁修复

Status: implemented / verification-pending / production-NO_GO

- 主链在授权、feed发现及每页transport之前核不可变合同、site/window/owner/epoch及外部证据验证；无验证器失败关闭，不再先网络后取合同。
- 可选resolver对明确国内或非BigPlayer分支返回原source/deps，不额外查询；缺region BigPlayer仍需可信JOIN，不默认国内。尚未全局启用resolver。
- 本修复改变已冻结候选源码，v049/v055不再代表当前工作树；须另锁下一manifest，QA以其既有锁定版本结论为准。
- 不改现役/生产配置、不发真实请求；主链run生命周期、完整drain与当前观察提交恢复仍未完成。
