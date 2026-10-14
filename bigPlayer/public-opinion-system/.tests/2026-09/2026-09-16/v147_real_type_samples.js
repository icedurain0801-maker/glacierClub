const { loadRuntimeEnv } = require('../../../server/src/runtimeEnv');
loadRuntimeEnv();
const { Repository } = require('../../../server/src/db/repository');

(async () => {
  const repo = new Repository();
  try {
    const rows = await repo.query(`SELECT c.id,c.external_id,c.community_id,g.region_code,c.published_at,c.is_deleted,
      JSON_UNQUOTE(JSON_EXTRACT(c.raw_payload,'$.type')) AS raw_type,
      CHAR_LENGTH(TRIM(COALESCE(c.title,''))) AS title_length,a.sentiment,a.severity
      FROM po_contents c JOIN po_sources s ON s.id=c.source_id JOIN po_games g ON g.id=c.game_id
      LEFT JOIN po_analyses a ON a.content_id=c.id
      WHERE s.platform='bigplayer_h5' AND c.content_type='post'`);
    for (const [name, predicate] of [
      ['type1_any_title', row => row.raw_type === '1'],
      ['type0_any_title', row => row.raw_type === '0'],
      ['type1_with_title', row => row.raw_type === '1' && row.title_length > 0],
      ['type0_without_title', row => row.raw_type === '0' && row.title_length === 0]
    ]) {
      const samples = rows.filter(predicate);
      const eligible = samples.filter(row => !row.is_deleted && row.published_at && (row.sentiment === 'negative' || row.severity === 'attention'));
      console.log(JSON.stringify({ name, total: samples.length, eligible: eligible.length, topLevelTypeCounts: rows.reduce((counts, row) => { counts[row.raw_type ?? 'missing'] = (counts[row.raw_type ?? 'missing'] || 0) + 1; return counts; }, {}) }));
      for (const sample of eligible.slice(0, 20)) {
        const published = new Date(sample.published_at.replace(' ', 'T') + 'Z');
        const from = published.toISOString(); const to = new Date(published.getTime() + 1000).toISOString();
        const overview = await repo.getOverview({ regionCode: sample.region_code, communityId: sample.community_id, platform: 'bigplayer_h5', from, to });
        const modes = [['negative', overview.hotNegative], ['attention', overview.hotAttention]].filter(([, items]) => items.some(item => item.id === sample.id)).map(([mode]) => mode);
        if (!modes.length) continue;
        const query = new URLSearchParams({ regionCode: sample.region_code, communityId: sample.community_id, platform: 'bigplayer_h5', publishedFrom: from, publishedTo: to });
        console.log(JSON.stringify({ name, sample, modes, url: `https://lfy3001.dev.q1op.com/admin/PublicOpinion/index.html?${query}` }));
        break;
      }
    }
    console.log(JSON.stringify({ knownCandidate: rows.filter(row => String(row.external_id) === '918490') }));
  } finally { await repo.pool.end(); }
})().catch(() => { console.error('READ_ONLY_SAMPLE_QUERY_FAILED'); process.exitCode = 1; });
