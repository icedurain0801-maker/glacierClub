# AI 陪伴机器人 · 子项目1（多版本+鉴权地基）

游戏陪伴机器人的 B 端后台地基。版本 = 游戏×地区多租户，账号全局、按版本授权。

## 运行后端
```
cd aiCompanion/server
cp .env.example .env   # 填 MySQL 连接
npm install
npm run migrate        # 建库建表 + 超管(admin/Admin123!) + 示例版本
npm start              # http://localhost:3100
npm test               # 集成测试（需已迁移）
```

## 运行前端
```
cd aiCompanion/web
python -m http.server 8090
# 访问 http://localhost:8090 ，用 admin / Admin123! 登录
```
前端默认连 `http://localhost:3100`，如需改：浏览器 localStorage 设 `apiBase`。

## 本子项目范围
- 已实现：登录、右上角版本切换、版本管理、用户权限管理、多版本数据隔离中间件。
- 占位：会话/知识库/机器人管理（子项目 2/3 实现）。
