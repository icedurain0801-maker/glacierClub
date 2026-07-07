// 包裹 async 路由处理器，把 rejected promise 转发给 Express 错误中间件。
// Express 4 不会自动捕获 async handler 的异常，必须显式 .catch(next)。
module.exports = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
