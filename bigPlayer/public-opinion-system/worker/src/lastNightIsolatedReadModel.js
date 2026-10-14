'use strict';

const path = require('node:path');
const { SOURCE_ID, BOARD_ID } = require('./lastNightOverseasDailyJob');

const IDENTITY_SQL = `SELECT @@port AS port,@@server_id AS serverId,@@datadir AS datadir,
  VERSION() AS version,DATABASE() AS db,CURRENT_USER() AS dbUser`;
const CONTENTS_SQL = `SELECT id,site_id,content_type,external_id,title,body,author_name,
  DATE_FORMAT(published_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS published_at,source_url
  FROM ln_contents WHERE source_id=? AND board_id=? AND site_id=?
  AND published_at>=? AND published_at<?
  AND (? IS NULL OR published_at<? OR (published_at=? AND id<?))
  ORDER BY published_at DESC,id DESC LIMIT ?`;
const ANALYSIS_SQL = `SELECT r.profile,r.version,r.content_fingerprint,r.model_name,
  r.result_json,r.completed_at FROM ln_analysis_results r
  JOIN ln_contents c ON c.id=r.content_id AND c.fingerprint=r.content_fingerprint
  WHERE r.content_id=? AND r.profile=? AND c.source_id=? AND c.board_id=? AND c.site_id=?
  ORDER BY r.completed_at DESC LIMIT 1`;

function fail(code) { const error = new Error(code); error.code = code; throw error; }
const utcSql = value => new Date(value).toISOString().replace('T', ' ').replace('Z', '');
const uuid = value => /^[a-f0-9-]{36}$/i.test(value || '');
const zoned = value => typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
function projectAnalysis(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('LAST_NIGHT_READ_MODEL_RESULT_CORRUPT');
  const result = {};
  for (const key of ['sentiment', 'severity', 'summary', 'reason', 'qualityReason']) {
    if (typeof value[key] === 'string') result[key] = value[key].slice(0, 2000);
  }
  for (const key of ['negativeScore', 'confidence', 'qualityScore']) {
    if (Number.isFinite(value[key])) result[key] = value[key];
  }
  for (const key of ['needsDeep', 'recommendHome', 'recommendPin', 'recommendFeature']) {
    if (typeof value[key] === 'boolean') result[key] = value[key];
  }
  if (Array.isArray(value.topics)) result.topics = value.topics.filter(item =>
    typeof item === 'string').slice(0, 3).map(item => item.slice(0, 100));
  return result;
}

function grantsAreReadOnly(rows, user) {
  const expected = new Set(['LN_LAST_NIGHT.LN_CONTENTS', 'LN_LAST_NIGHT.LN_ANALYSIS_RESULTS']);
  const seen = new Set();
  for (const row of rows || []) {
    const grant = String(Object.values(row)[0] || '').toUpperCase();
    const match = /^GRANT (.+?) ON (.+?) TO ((?:'[^']+'@'[^']+')|(?:`[^`]+`@`[^`]+`))(.*)$/.exec(grant);
    if (!match || match[3].replace(/['`]/g, '') !== user.toUpperCase() ||
      !/^(?:| IDENTIFIED BY PASSWORD '\*[0-9A-F]+')$/.test(match[4])) return false;
    const scope = match[2].replace(/[`']/g, '');
    if (scope === '*.*' && match[1] === 'USAGE') continue;
    if (match[1] !== 'SELECT' || !expected.has(scope) || seen.has(scope)) return false;
    seen.add(scope);
  }
  return seen.size === expected.size;
}

class LastNightIsolatedReadModel {
  constructor({ pool, identity, siteIds } = {}) {
    if (!pool?.getConnection || identity?.host !== '127.0.0.1' ||
      !Number.isInteger(identity.port) || identity.port < 43300 || identity.port > 43399 ||
      !Number.isInteger(identity.serverId) || !path.isAbsolute(identity.datadir || '') ||
      identity.database !== 'ln_last_night' || !identity.version ||
      !/^po_lastnight_reader_[a-z0-9_]+@(127\.0\.0\.1|localhost)$/.test(identity.user || '') ||
      !Array.isArray(siteIds) || siteIds.length !== 3 || new Set(siteIds).size !== 3) {
      fail('LAST_NIGHT_READ_MODEL_CONFIG_INVALID');
    }
    this.pool = pool;
    this.identity = identity;
    this.siteIds = new Set(siteIds);
  }

  async connection() {
    const conn = await this.pool.getConnection();
    try {
      const [[row]] = await conn.query(IDENTITY_SQL);
      if (Number(row?.port) !== this.identity.port || Number(row?.serverId) !== this.identity.serverId ||
        path.resolve(row?.datadir || '').toLowerCase() !== path.resolve(this.identity.datadir).toLowerCase() ||
        row?.version !== this.identity.version || row?.db !== this.identity.database ||
        row?.dbUser !== this.identity.user) fail('LAST_NIGHT_READ_MODEL_IDENTITY_MISMATCH');
      const [grants] = await conn.query('SHOW GRANTS');
      if (!grantsAreReadOnly(grants, this.identity.user)) fail('LAST_NIGHT_READ_MODEL_GRANTS_UNSAFE');
      await conn.query("SET SESSION time_zone='+00:00'");
      return conn;
    } catch (error) { conn.release(); throw error; }
  }

  async listContents({ siteId, publishedFrom, publishedTo, limit = 50, cursor = null } = {}) {
    const from = Date.parse(publishedFrom), to = Date.parse(publishedTo);
    if (!this.siteIds.has(siteId) || !zoned(publishedFrom) || !zoned(publishedTo) ||
      !Number.isFinite(from) || !Number.isFinite(to) ||
      from >= to || to - from > 7 * 86400000 ||
      !Number.isInteger(limit) || limit < 1 || limit > 100 ||
      (cursor != null && (!uuid(cursor.id) || !zoned(cursor.publishedAt) ||
        !Number.isFinite(Date.parse(cursor.publishedAt)) ||
        Date.parse(cursor.publishedAt) < from || Date.parse(cursor.publishedAt) >= to))) {
      fail('LAST_NIGHT_READ_MODEL_QUERY_INVALID');
    }
    const conn = await this.connection();
    try {
      const [rows] = await conn.query(CONTENTS_SQL,
        [SOURCE_ID, BOARD_ID, siteId, utcSql(publishedFrom), utcSql(publishedTo),
          cursor && utcSql(cursor.publishedAt), cursor && utcSql(cursor.publishedAt),
          cursor && utcSql(cursor.publishedAt), cursor && cursor.id, limit + 1]);
      const items = rows.slice(0, limit);
      const last = items.at(-1);
      return { items, nextCursor: rows.length > limit ? {
        publishedAt: last.published_at, id: last.id } : null };
    } finally { conn.release(); }
  }

  async getAnalysis(contentId, siteId, profile = 'light') {
    if (!uuid(contentId) || !this.siteIds.has(siteId) || !['light', 'deep'].includes(profile)) {
      fail('LAST_NIGHT_READ_MODEL_QUERY_INVALID');
    }
    const conn = await this.connection();
    try {
      const [rows] = await conn.query(ANALYSIS_SQL, [contentId, profile, SOURCE_ID, BOARD_ID, siteId]);
      if (!rows[0]) return null;
      let result;
      try { result = JSON.parse(rows[0].result_json); }
      catch { fail('LAST_NIGHT_READ_MODEL_RESULT_CORRUPT'); }
      const { result_json, ...metadata } = rows[0];
      return { ...metadata, result: projectAnalysis(result) };
    } finally { conn.release(); }
  }
}

module.exports = { LastNightIsolatedReadModel, grantsAreReadOnly,
  IDENTITY_SQL, CONTENTS_SQL, ANALYSIS_SQL };
