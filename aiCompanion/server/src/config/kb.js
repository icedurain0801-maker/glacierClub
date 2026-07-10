// 知识库子系统配置。集中在此，方便测试替换。
const path = require('path');

module.exports = {
  chunkSize: 5 * 1024 * 1024,           // 前端分片大小(仅供前端参考)
  uploadTmpDir: path.resolve(__dirname, '..', '..', process.env.KB_UPLOAD_TMP_DIR || 'uploads/tmp'),
  batchSize: 50,                        // 每批 embedding 请求条数
  workerIntervalMs: parseInt(process.env.KB_WORKER_INTERVAL, 10) || 2000,
  searchDefaultTopK: 10,
  searchMaxTopK: 50,

  embedding: {
    apiUrl: process.env.EMBEDDING_API_URL || '',
    apiKey: process.env.EMBEDDING_API_KEY || '',
    model:  process.env.EMBEDDING_MODEL  || 'text-embedding-v2',
    dim:    parseInt(process.env.EMBEDDING_DIM, 10) || 1536,
    retries: 3,
    retryBaseMs: 500,
  },

  llm: {
    apiUrl: process.env.LLM_API_URL || '',
    apiKey: process.env.LLM_API_KEY || '',
    model:  process.env.LLM_MODEL  || 'qwen-plus',
    retries: 3,
    retryBaseMs: 500,
    maxMessageBytes: 4 * 1024,
    maxPromptBytes: 8 * 1024,
  },
};
