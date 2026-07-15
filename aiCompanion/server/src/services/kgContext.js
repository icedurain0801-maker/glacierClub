// 图谱上下文:query 实体识别(别名表内存缓存) → 一跳关系事实 → 拼「图谱事实」块。
// 缓存按 versionId 懒加载，ingest 完成/B 端别名写操作后 invalidate。
const db = require('../config/db');

const FACT_LIMIT = 20;          // 单次注入的最大事实条数
const PROPS_VAL_MAX = 60;       // props 单值截断长度
const PROPS_KEY_MAX = 6;        // 每实体最多带几个属性

// versionId -> [{alias, entityId}] 按 alias 长度降序(最长优先匹配)
const cache = new Map();

async function loadAliases(versionId) {
  const [rows] = await db.query(
    'SELECT alias, entity_id FROM kb_entity_aliases WHERE version_id=?',
    [versionId]
  );
  const list = rows
    .map(r => ({ alias: r.alias, entityId: r.entity_id }))
    .sort((a, b) => b.alias.length - a.alias.length);
  cache.set(versionId, list);
  return list;
}

function invalidate(versionId) {
  cache.delete(versionId);
}

// 实体识别：别名长度降序做 indexOf 扫描，命中后遮蔽已匹配区间，防止子串重复命中。
// 千级实体 × 几十字 query，O(N×L) 足够，不引 AC 自动机。
async function linkEntities(versionId, query) {
  const q = String(query || '');
  if (!q) return [];
  let list = cache.get(versionId);
  if (!list) list = await loadAliases(versionId);
  if (list.length === 0) return [];

  const masked = new Array(q.length).fill(false);
  const hit = new Map();  // entityId -> alias(命中的第一个)
  for (const { alias, entityId } of list) {
    if (alias.length === 0 || alias.length > q.length) continue;
    let from = 0;
    while (from <= q.length - alias.length) {
      const idx = q.indexOf(alias, from);
      if (idx < 0) break;
      // 区间内任一字符已被更长别名占用则跳过
      let free = true;
      for (let i = idx; i < idx + alias.length; i++) {
        if (masked[i]) { free = false; break; }
      }
      if (free) {
        for (let i = idx; i < idx + alias.length; i++) masked[i] = true;
        if (!hit.has(entityId)) hit.set(entityId, alias);
      }
      from = idx + alias.length;
    }
  }
  return [...hit.entries()].map(([entityId, alias]) => ({ entityId, alias }));
}

// props_json 摘要：跳过过长的值，最多取 PROPS_KEY_MAX 个键
function summarizeProps(propsJson) {
  let props;
  try { props = typeof propsJson === 'string' ? JSON.parse(propsJson) : propsJson; } catch { return ''; }
  if (!props || typeof props !== 'object') return '';
  const parts = [];
  for (const [k, v] of Object.entries(props)) {
    const val = String(v ?? '').trim();
    if (!val || val.length > PROPS_VAL_MAX) continue;
    parts.push(`${k}:${val}`);
    if (parts.length >= PROPS_KEY_MAX) break;
  }
  return parts.join(' / ');
}

// 一跳事实：出边 + 入边 + 实体属性摘要
async function getFacts(versionId, entityIds, limit = FACT_LIMIT) {
  if (!entityIds || entityIds.length === 0) return [];
  const ph = entityIds.map(() => '?').join(',');

  // 实体属性
  const [ents] = await db.query(
    `SELECT id, name, props_json FROM kb_entities WHERE version_id=? AND id IN (${ph})`,
    [versionId, ...entityIds]
  );

  // 出边+入边一跳关系
  const [rels] = await db.query(
    `SELECT r.relation, ef.id AS from_id, ef.name AS from_name, et.id AS to_id, et.name AS to_name
       FROM kb_relations r
       JOIN kb_entities ef ON ef.id = r.from_entity_id
       JOIN kb_entities et ON et.id = r.to_entity_id
      WHERE r.version_id=? AND (r.from_entity_id IN (${ph}) OR r.to_entity_id IN (${ph}))
      LIMIT ?`,
    [versionId, ...entityIds, ...entityIds, limit]
  );

  const facts = [];
  for (const r of rels) {
    facts.push({
      type: 'fact',
      entityId: entityIds.includes(r.from_id) ? r.from_id : r.to_id,
      text: `${r.from_name} —${r.relation}→ ${r.to_name}`,
    });
  }
  for (const e of ents) {
    const summary = summarizeProps(e.props_json);
    if (summary) facts.push({ type: 'fact', entityId: e.id, text: `${e.name} 属性: ${summary}` });
  }
  return facts.slice(0, limit);
}

// 拼成 prompt 里的「图谱事实」块
function toFactBlock(facts) {
  if (!facts || facts.length === 0) return '';
  const items = facts.map(f => `- ${f.text}`).join('\n');
  return `\n\n【图谱事实】以下是知识图谱中与本次提问相关的结构化事实，可直接采信:\n${items}`;
}

module.exports = { linkEntities, getFacts, toFactBlock, invalidate, loadAliases, FACT_LIMIT };
