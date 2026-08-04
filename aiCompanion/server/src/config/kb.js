// 知识库子系统配置。集中在此，方便测试替换。
const path = require('path');

module.exports = {
  chunkSize: 5 * 1024 * 1024,           // 前端分片大小(仅供前端参考)
  uploadTmpDir: path.resolve(__dirname, '..', '..', process.env.KB_UPLOAD_TMP_DIR || 'uploads/tmp'),
  kbImagesDir: path.resolve(__dirname, '..', '..', process.env.KB_IMAGES_DIR || 'uploads/kb-images'),
  botAvatarDir: path.resolve(__dirname, '..', '..', process.env.BOT_AVATAR_DIR || 'uploads/bot-avatars'),
  webDir:         path.resolve(__dirname, '..', '..', '..', 'web'),
  chatMediaDir: path.resolve(__dirname, '..', '..', process.env.CHAT_MEDIA_DIR || 'uploads/chat-media'),
  batchSize: 50,                        // 每批 embedding 请求条数
  workerIntervalMs: parseInt(process.env.KB_WORKER_INTERVAL, 10) || 2000,
  searchDefaultTopK: 10,
  searchMaxTopK: 50,
  ragMinRefScore: parseFloat(process.env.RAG_MIN_REF_SCORE || '0.42'),
  ragWeakRefScore: parseFloat(process.env.RAG_WEAK_REF_SCORE || '0.35'),

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
    mediaAnalysisModel: process.env.MEDIA_ANALYSIS_MODEL || process.env.LLM_MODEL || 'qwen-plus',
    // 真多模态主对话用的小图模型(必须是网关上能真正解析 image_url 的模型,
    // 比如 gemini-3.6-flash;claude-sonnet-* 在本网关会被剽除 image_url)
    visionModel: process.env.LLM_VISION_MODEL || 'gemini-3.6-flash',
    retries: 3,
    retryBaseMs: 500,
    maxMessageBytes: 4 * 1024,
    maxPromptBytes: 8 * 1024,
  },

  chatMedia: {
    imageMaxBytes: parseInt(process.env.CHAT_MEDIA_IMAGE_MAX_BYTES, 10) || 10 * 1024 * 1024,
    videoMaxBytes: parseInt(process.env.CHAT_MEDIA_VIDEO_MAX_BYTES, 10) || 25 * 1024 * 1024,
    previewMaxBytes: parseInt(process.env.CHAT_MEDIA_PREVIEW_MAX_BYTES, 10) || 2 * 1024 * 1024,
    maxUploadBytes: parseInt(process.env.CHAT_MEDIA_MAX_UPLOAD_BYTES, 10) || 25 * 1024 * 1024,
    // 主对话内联图片(真多模态)用的小图,sharp 缩图后塞进 user message 的 image_url
    inlineImageMaxEdge: parseInt(process.env.CHAT_MEDIA_INLINE_IMAGE_MAX_EDGE, 10) || 512,
    inlineImageQuality: parseInt(process.env.CHAT_MEDIA_INLINE_IMAGE_QUALITY, 10) || 80,
    inlineImageMaxBytes: parseInt(process.env.CHAT_MEDIA_INLINE_IMAGE_MAX_BYTES, 10) || 200 * 1024,
  },

  liveTools: {
    enabled: process.env.LIVE_TOOLS_ENABLED !== 'false',
    weatherEnabled: process.env.WEATHER_ENABLED !== 'false',
    webSearchEnabled: process.env.WEB_SEARCH_ENABLED !== 'false',
    requestTimeoutMs: parseInt(process.env.LIVE_TOOLS_TIMEOUT_MS, 10) || 12000,
    weatherApiUrl: process.env.WEATHER_API_URL || 'https://api.open-meteo.com/v1/forecast',
    weatherGeocodeUrl: process.env.WEATHER_GEOCODE_URL || 'https://geocoding-api.open-meteo.com/v1/search',
    ipGeoUrl: process.env.IP_GEO_URL || 'https://ipwho.is/',
    webSearchUrl: process.env.WEB_SEARCH_URL || 'https://www.sogou.com/web',
    webSearchTopK: parseInt(process.env.WEB_SEARCH_TOP_K, 10) || 5,
  },
};
