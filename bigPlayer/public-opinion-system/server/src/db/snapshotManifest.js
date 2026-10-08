'use strict';

// Measurement only. The caller holds and monitors a separate global read-lock
// connection throughout the source/dump/source pass. This connection is
// destroyed when a row stream must be cancelled.
const crypto = require('node:crypto');

const FORMAT = 'po-snapshot-manifest-v1';
const NULL_FIELD = Buffer.from('N;');
const FIELD_END = Buffer.from(';');
const DEFAULTS = Object.freeze({
  chunkSize: 10000,
  maxRows: 10000000,
  maxFieldBytes: 32 * 1024 * 1024,
  maxRowBytes: 64 * 1024 * 1024,
  maxChunkBytes: 64 * 1024 * 1024,
  maxChunks: 100000
});
const BINARY_TYPES = new Set([
  'bit', 'binary', 'varbinary', 'tinyblob', 'blob', 'mediumblob', 'longblob',
  'geometry', 'point', 'linestring', 'polygon', 'multipoint',
  'multilinestring', 'multipolygon', 'geometrycollection', 'vector'
]);
const NUMBER_TYPES = /^(?:tinyint|smallint|mediumint|int|integer|bigint|decimal|numeric|float|double|real|year)\b/i;
const DATE_TYPES = /^(?:date|datetime|timestamp|time)\b/i;
const MAX_SERVER_PACKET_BYTES = 64 * 1024 * 1024;

function failure(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

async function querySafe(connection, sql) {
  try { return await connection.query(sql); }
  catch (_error) { throw failure('MANIFEST_QUERY_FAILED'); }
}

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
function q(identifier) {
  if (typeof identifier !== 'string' || !identifier || identifier.includes('\0')) throw failure('MANIFEST_INVALID_IDENTIFIER');
  return `\`${identifier.replace(/`/g, '``')}\``;
}
function limits(options) {
  const merged = { ...DEFAULTS, ...options };
  for (const key of Object.keys(DEFAULTS)) {
    if (!Number.isSafeInteger(merged[key]) || merged[key] < 1) throw failure('MANIFEST_INVALID_BUDGET');
  }
  return merged;
}

function fieldTag(column) {
  const type = String(column.data_type || column.column_type).toLowerCase().split('(')[0];
  if (BINARY_TYPES.has(type)) return 'B';
  if (NUMBER_TYPES.test(type)) return 'D';
  if (DATE_TYPES.test(type)) return 'T';
  return 'S';
}
function compileColumn(column) {
  if (!column || typeof column.column_name !== 'string' || typeof column.column_type !== 'string') {
    throw failure('MANIFEST_INVALID_COLUMN_METADATA');
  }
  const name = Buffer.from(column.column_name, 'utf8');
  const typeText = column.column_type.toLowerCase();
  const type = Buffer.from(typeText, 'utf8');
  return {
    header: Buffer.from(`F${name.length}:${column.column_name}${type.length}:${typeText}:`, 'utf8'),
    tag: fieldTag(column)
  };
}
function fieldParts(column, value, compiled = compileColumn(column)) {
  const { header, tag } = compiled;
  if (value == null) return [header, NULL_FIELD];
  let bytes;
  if (Buffer.isBuffer(value)) bytes = value;
  else if (typeof value === 'string') bytes = Buffer.from(value, 'utf8');
  else if (typeof value === 'bigint') bytes = Buffer.from(value.toString(), 'ascii');
  else if (typeof value === 'number' && Number.isSafeInteger(value)) bytes = Buffer.from(String(value), 'ascii');
  else throw failure('MANIFEST_UNSUPPORTED_FIELD_VALUE');
  return [header, Buffer.from(`${tag}${bytes.length}:`, 'ascii'), bytes, FIELD_END];
}
function encodeField(column, value) {
  return Buffer.concat(fieldParts(column, value));
}
function encodeRow(columns, row) {
  if (!Array.isArray(row) || row.length !== columns.length) throw failure('MANIFEST_ROW_COLUMN_MISMATCH');
  return Buffer.concat([Buffer.from('R'), ...columns.flatMap((column, index) => fieldParts(column, row[index]))]);
}

// Normalize a qualified database identifier, but never rewrite SQL literals
// or comments. SHOW CREATE uses backticks when sql_quote_show_create=1.
function normalizeSchemaQualifiers(sql, schemaName) {
  let output = '';
  for (let index = 0; index < sql.length;) {
    const char = sql[index];
    if (char === "'" || char === '"') {
      const quote = char;
      const start = index++;
      while (index < sql.length) {
        if (sql[index] === '\\') { index += 2; continue; }
        if (sql[index] === quote) {
          if (sql[index + 1] === quote) { index += 2; continue; }
          index += 1; break;
        }
        index += 1;
      }
      output += sql.slice(start, index);
      continue;
    }
    if (char === '#' || (char === '-' && sql[index + 1] === '-' && /\s/.test(sql[index + 2] || ''))) {
      const end = sql.indexOf('\n', index);
      const next = end < 0 ? sql.length : end + 1;
      output += sql.slice(index, next);
      index = next;
      continue;
    }
    if (char === '/' && sql[index + 1] === '*') {
      const end = sql.indexOf('*/', index + 2);
      const next = end < 0 ? sql.length : end + 2;
      output += sql.slice(index, next);
      index = next;
      continue;
    }
    if (char === '`') {
      const start = index++;
      let identifier = '';
      let closed = false;
      while (index < sql.length) {
        if (sql[index] === '`') {
          if (sql[index + 1] === '`') { identifier += '`'; index += 2; continue; }
          index += 1; closed = true; break;
        }
        identifier += sql[index++];
      }
      if (!closed) throw failure('MANIFEST_INVALID_DEFINITION');
      const token = sql.slice(start, index);
      const next = sql.slice(index).match(/^\s*\./);
      output += identifier === schemaName && next ? '`__PO_SCHEMA__`' : token;
      continue;
    }
    output += char;
    index += 1;
  }
  return output;
}
function normalizeDdl(ddl, schemaName) {
  if (typeof ddl !== 'string' || !ddl.trim()) throw failure('MANIFEST_MISSING_DEFINITION');
  return normalizeSchemaQualifiers(ddl.replace(/\r\n/g, '\n'), schemaName);
}

async function listSchema(connection) {
  const [[database]] = await querySafe(connection, 'SELECT DATABASE() AS schema_name, @@character_set_client AS client_charset, @@character_set_connection AS connection_charset, @@character_set_results AS results_charset, @@max_allowed_packet AS max_packet_bytes');
  if (!database || !database.schema_name ||
    [database.client_charset, database.connection_charset, database.results_charset]
      .some(charset => String(charset).toLowerCase() !== 'utf8mb4')) {
    throw failure('MANIFEST_CONNECTION_CONFIG');
  }
  const maxPacketBytes = Number(database.max_packet_bytes);
  if (!Number.isSafeInteger(maxPacketBytes) || maxPacketBytes < 1 || maxPacketBytes > MAX_SERVER_PACKET_BYTES) {
    throw failure('MANIFEST_PACKET_LIMIT');
  }
  const [[defaults]] = await querySafe(connection, 'SELECT DEFAULT_CHARACTER_SET_NAME AS charset_name, DEFAULT_COLLATION_NAME AS collation_name FROM information_schema.schemata WHERE schema_name=DATABASE()');
  if (!defaults) throw failure('MANIFEST_SCHEMA_NOT_FOUND');
  const [tables] = await querySafe(connection, 'SELECT table_name,table_type,engine FROM information_schema.tables WHERE table_schema=DATABASE() ORDER BY table_name');
  const [columns] = await querySafe(connection, 'SELECT table_name,column_name,column_type,data_type,ordinal_position,extra FROM information_schema.columns WHERE table_schema=DATABASE() ORDER BY table_name,ordinal_position');
  const [primary] = await querySafe(connection, "SELECT table_name,column_name,seq_in_index FROM information_schema.statistics WHERE table_schema=DATABASE() AND index_name='PRIMARY' ORDER BY table_name,seq_in_index");
  return { schemaName: database.schema_name, defaults, tables, columns, primary };
}

function streamTable(connection, sql, columns, primary, config) {
  return new Promise((resolve, reject) => {
    const raw = connection.connection;
    if (!raw || typeof raw.query !== 'function') { reject(failure('MANIFEST_PROMISE_CONNECTION_REQUIRED')); return; }
    const indexes = primary.map(name => columns.findIndex(column => column.column_name === name));
    if (indexes.some(index => index < 0)) { reject(failure('MANIFEST_PRIMARY_METADATA_MISMATCH')); return; }
    let compiled;
    try { compiled = columns.map(compileColumn); }
    catch (error) { reject(error); return; }
    const chunks = [];
    const tableHash = crypto.createHash('sha256').update(`${FORMAT}:table:`);
    let chunkHash = crypto.createHash('sha256').update(`${FORMAT}:chunk:`);
    let count = 0;
    let chunkRows = 0;
    let chunkBytes = 0;
    let firstKeyHash = null;
    let lastKeyHash = null;
    let settled = false;
    function finishChunk() {
      if (!chunkRows) return;
      if (chunks.length >= config.maxChunks) throw failure('MANIFEST_CHUNK_BUDGET_EXCEEDED');
      const chunk = {
        number: chunks.length + 1, rows: chunkRows, bytes: chunkBytes,
        firstKeyHash, lastKeyHash, sha256: chunkHash.digest('hex')
      };
      chunks.push(chunk);
      tableHash.update(JSON.stringify(chunk));
      chunkHash = crypto.createHash('sha256').update(`${FORMAT}:chunk:`);
      chunkRows = 0;
      chunkBytes = 0;
      firstKeyHash = null;
      lastKeyHash = null;
    }
    let stream;
    try {
      stream = raw.query({ sql, rowsAsArray: true, typeCast: false }).stream({ highWaterMark: 1 });
    } catch (_error) { reject(failure('MANIFEST_STREAM_START_FAILED')); return; }
    stream.on('data', row => {
      try {
        if (!Array.isArray(row) || row.length !== columns.length) throw failure('MANIFEST_ROW_COLUMN_MISMATCH');
        if (count >= config.maxRows) throw failure('MANIFEST_ROW_BUDGET_EXCEEDED');
        const parts = columns.map((column, index) => fieldParts(column, row[index], compiled[index]));
        let rowBytes = 1;
        for (const field of parts) {
          if (field.length === 4 && field[2].length > config.maxFieldBytes) throw failure('MANIFEST_FIELD_BUDGET_EXCEEDED');
          rowBytes += field.reduce((total, part) => total + part.length, 0);
        }
        if (rowBytes > config.maxRowBytes) throw failure('MANIFEST_ROW_BYTE_BUDGET_EXCEEDED');
        if (rowBytes > config.maxChunkBytes) throw failure('MANIFEST_CHUNK_BYTE_BUDGET_EXCEEDED');
        if (chunkRows && (chunkRows >= config.chunkSize || chunkBytes + rowBytes > config.maxChunkBytes)) finishChunk();
        const keyHash = crypto.createHash('sha256').update(`${FORMAT}:key:`);
        for (const index of indexes) for (const part of parts[index]) keyHash.update(part);
        const keyDigest = keyHash.digest('hex');
        if (firstKeyHash == null) firstKeyHash = keyDigest;
        lastKeyHash = keyDigest;
        chunkHash.update('R');
        for (const field of parts) for (const part of field) chunkHash.update(part);
        chunkRows += 1;
        chunkBytes += rowBytes;
        count += 1;
        if (chunkRows === config.chunkSize || chunkBytes === config.maxChunkBytes) finishChunk();
      } catch (error) {
        stream.destroy(error && error.code ? error : failure('MANIFEST_ROW_ENCODING_FAILED'));
        raw.destroy();
      }
    });
    stream.once('error', error => {
      if (!settled) {
        settled = true;
        reject(error && error.code && String(error.code).startsWith('MANIFEST_') ? error : failure('MANIFEST_STREAM_FAILED'));
      }
    });
    stream.once('end', () => {
      if (settled) return;
      try {
        finishChunk();
        tableHash.update(`rows:${count}:chunks:${chunks.length}`);
        settled = true;
        resolve({ count, chunks, digest: tableHash.digest('hex') });
      } catch (error) {
        settled = true;
        raw.destroy();
        reject(error && error.code ? error : failure('MANIFEST_DIGEST_FAILED'));
      }
    });
  });
}

async function tableManifest(connection, mysqlConnection, table, columns, primary, options = {}) {
  if (!connection || !connection.connection || (mysqlConnection && mysqlConnection !== connection.connection)) {
    throw failure('MANIFEST_SINGLE_CONNECTION_REQUIRED');
  }
  const config = limits(options);
  if (!primary.length) throw failure('MANIFEST_PRIMARY_KEY_REQUIRED');
  if (!columns.length) throw failure('MANIFEST_COLUMNS_REQUIRED');
  const sql = `SELECT ${columns.map(column => q(column.column_name)).join(',')} FROM ${q(table)} FORCE INDEX(PRIMARY) ORDER BY ${primary.map(q).join(',')}`;
  return streamTable(connection, sql, columns, primary, config);
}

function definitionDigest(row, definitionKey, objectNameKey, schemaName, kind) {
  if (!row || typeof row !== 'object') throw failure('MANIFEST_MISSING_DEFINITION');
  const definition = normalizeDdl(row[definitionKey], schemaName);
  const metadata = {};
  for (const key of Object.keys(row).sort()) {
    if (key === definitionKey || key === objectNameKey || key === 'Created') continue;
    if (row[key] == null) throw failure('MANIFEST_INCOMPLETE_OBJECT_METADATA');
    metadata[key] = String(row[key]);
  }
  return sha256(Buffer.from(JSON.stringify({ definition, metadata }), 'utf8'));
}
async function objectManifest(connection, schema) {
  const objects = [{ type: 'SCHEMA', name: '__database__', sha256: sha256(JSON.stringify(schema.defaults)) }];
  for (const row of schema.tables) {
    const name = row.table_name;
    if (row.table_type === 'BASE TABLE') {
      const [[ddl]] = await querySafe(connection, `SHOW CREATE TABLE ${q(name)}`);
      objects.push({
        type: 'TABLE', name, engine: row.engine,
        sha256: definitionDigest(ddl, 'Create Table', 'Table', schema.schemaName, 'TABLE')
      });
    } else if (row.table_type === 'VIEW') {
      const [[ddl]] = await querySafe(connection, `SHOW CREATE VIEW ${q(name)}`);
      objects.push({
        type: 'VIEW', name,
        sha256: definitionDigest(ddl, 'Create View', 'View', schema.schemaName, 'VIEW')
      });
    } else throw failure('MANIFEST_UNSUPPORTED_OBJECT_TYPE');
  }
  for (const [kind, column, definitionKey] of [
    ['TRIGGER', 'trigger_name', 'SQL Original Statement'],
    ['PROCEDURE', 'routine_name', 'Create Procedure'],
    ['FUNCTION', 'routine_name', 'Create Function'],
    ['EVENT', 'event_name', 'Create Event']
  ]) {
    let sql;
    if (kind === 'TRIGGER') sql = `SELECT ${column} AS name FROM information_schema.triggers WHERE trigger_schema=DATABASE() ORDER BY ${column}`;
    else if (kind === 'EVENT') sql = `SELECT ${column} AS name FROM information_schema.events WHERE event_schema=DATABASE() ORDER BY ${column}`;
    else sql = `SELECT ${column} AS name FROM information_schema.routines WHERE routine_schema=DATABASE() AND routine_type='${kind}' ORDER BY ${column}`;
    const [rows] = await querySafe(connection, sql);
    for (const { name } of rows) {
      const [[ddl]] = await querySafe(connection, `SHOW CREATE ${kind} ${q(name)}`);
      objects.push({
        type: kind, name,
        sha256: definitionDigest(ddl, definitionKey, kind.charAt(0) + kind.slice(1).toLowerCase(), schema.schemaName, kind)
      });
    }
  }
  return objects.sort((a, b) => {
    const left = `${a.type}\0${a.name}`;
    const right = `${b.type}\0${b.name}`;
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

async function snapshotManifest(connection, mysqlConnection, options = {}) {
  if (!connection || !connection.connection || (mysqlConnection && mysqlConnection !== connection.connection)) {
    throw failure('MANIFEST_SINGLE_CONNECTION_REQUIRED');
  }
  limits(options);
  await querySafe(connection, 'SET NAMES utf8mb4');
  await querySafe(connection, "SET SESSION time_zone = '+00:00'");
  await querySafe(connection, 'SET SESSION sql_quote_show_create = 1');
  const schema = await listSchema(connection);
  const objects = await objectManifest(connection, schema);
  const tables = [];
  for (const row of schema.tables.filter(item => item.table_type === 'BASE TABLE')) {
    const name = row.table_name;
    const columns = schema.columns.filter(column => column.table_name === name);
    const primary = schema.primary.filter(column => column.table_name === name).map(column => column.column_name);
    tables.push({ name, primary, ...(await tableManifest(connection, connection.connection, name, columns, primary, options)) });
  }
  return { format: FORMAT, objects, tables };
}

module.exports = { encodeField, encodeRow, listSchema, tableManifest, objectManifest, snapshotManifest };
