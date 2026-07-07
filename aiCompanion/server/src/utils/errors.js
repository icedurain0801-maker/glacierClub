// 统一错误响应：res.status(code).json({ error: message })
function fail(res, status, message) {
  return res.status(status).json({ error: message });
}

module.exports = { fail };
