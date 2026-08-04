// 用当前 .env 配置的 embedding 模型重新生成全量向量。
// 场景：切换 embedding 模型后，旧向量空间与新模型不互通，必须统一 re-embed。
// 用法：node scripts/reEmbed.js [versionId=1] [batchSize=20]
require('dotenv').config();

const embedding = require('../src/services/embedding');
const vectorStore = require('../src/services/vectorStore');
const db = require('../src/config/db');

const versionId = parseInt(process.argv[2], 10) || 1;
const batchSize = parseInt(process.argv[3], 10) || 20;

async function main() {
  // 获取需要重新嵌入的条目内容。source 优先取 kb_entry_locales (zh-CN) 避免重复同 content，
  // 再回退 knowledge_entries.content（后者含 excel 原始全文，可能含有非 zh 数据行）。
  // 策略：用 kb_entry_locales 的好处是已按 locale 切分好"能读的文本行"。
  const [rows] = await db.query(
    `SELECT e.id as entry_id, COALESCE(l.content, e.content) as content
       FROM knowledge_entries e
  LEFT JOIN kb_entry_locales l ON l.entry_id = e.id AND l.version_id = e.version_id AND l.locale = 'zh-CN'
      WHERE e.version_id = ?
      ORDER BY e.id`,
    [versionId]
  );

  if (!rows.length) {
    console.log('no rows to embed');
    await db.end();
    return;
  }

  console.log(`re-embedding ${rows.length} entries for version_id=${versionId}, batch=${batchSize}, model=${require('../src/config/kb').embedding.model}`);

  await vectorStore.loadAll();

  let processed = 0;
  let replaced = 0;
  const total = rows.length;

  for (let i = 0; i < total; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const texts = batch.map(r => String(r.content || '').slice(0, 8000));

    let vectors;
    try {
      vectors = await embedding.embedBatch(texts);
    } catch (err) {
      console.error(`\n[reEmbed] embedBatch failed at offset ${i}: ${err.message}`);
      // 继续处理下一个 batch 而非整体失败
      continue;
    }

    for (let k = 0; k < batch.length; k++) {
      const vec = vectors[k];
      if (!vec || !vec.length) continue;

      const entryId = batch[k].entry_id;

      // 替换旧向量（如果存在），否则插入
      await db.query(
        'DELETE FROM kb_vectors WHERE version_id=? AND entry_id=?',
        [versionId, entryId]
      );
      await db.query(
        'INSERT INTO kb_vectors (version_id, entry_id, embedding, dim) VALUES (?, ?, ?, ?)',
        [versionId, entryId, JSON.stringify(vec), vec.length]
      );

      // 同步到内存 vectorStore
      vectorStore.removeEntry(versionId, entryId);
      vectorStore.add(versionId, entryId, new Float32Array(vec));

      replaced++;
    }

    processed += batch.length;
    if (processed % 50 === 0 || processed === total) {
      const pct = ((processed / total) * 100).toFixed(1);
      console.log(`  progress: ${processed}/${total} (${pct}%)`);
    }

    // 小间隔避免压死网关限速
    if (i + batchSize < total) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  console.log(`\ndone: ${replaced}/${total} entries re-embedded`);
  await db.end();
}

main().catch(err => {
  console.error(err.stack || err.message);
  process.exitCode = 1;
}).finally(() => process.exit(process.exitCode || 0));
