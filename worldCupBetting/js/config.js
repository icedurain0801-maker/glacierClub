// 全局 API 地址配置
// 部署到 Vercel 时用相对路径 '/api'，由 vercel.json 的 rewrites 反代到腾讯云后端
// 本地开发若直连后端，可临时改成 'http://localhost:3000/api'
window.WC_CONFIG = {
  API_BASE: '/api',
};
