'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const test = require('node:test');
const {
  encodeField,
  encodeRow,
  listSchema,
  tableManifest,
  objectManifest,
  snapshotManifest
} = require('../src/db/snapshotManifest');

const col = (column_name, column_type) => ({ column_name, column_type });
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

function streamRows(rows) {
  const statements = [];
  return {
    statements,
    destroyed: false,
    destroy() { this.destroyed = true; },
    query(options) {
      statements.push(options);
      return { stream: () => Readable.from(rows.map(row => [...row]), { objectMode: true }) };
    }
  };
}

function schemaConnection({
  rows = [[1, 'alpha']],
  ddl = 'CREATE TABLE `items` (`id` int PRIMARY KEY, `body` varchar(30)) ENGINE=InnoDB',
  objects = {},
  clientCharset = 'utf8mb4',
  connectionCharset = 'utf8mb4',
  resultsCharset = 'utf8mb4',
  maxPacketBytes = 16 * 1024 * 1024
} = {}) {
  const tables = [{ table_name: 'items', table_type: 'BASE TABLE', engine: 'InnoDB' }];
  const columns = [
    { table_name: 'items', column_name: 'id', column_type: 'int', data_type: 'int', ordinal_position: 1 },
    { table_name: 'items', column_name: 'body', column_type: 'varchar(30)', data_type: 'varchar', ordinal_position: 2 }
  ];
  const primary = [{ table_name: 'items', column_name: 'id', seq_in_index: 1 }];
  const queries = [];
  const sessionCharsets = {
    client_charset: clientCharset,
    connection_charset: connectionCharset,
    results_charset: resultsCharset
  };
  const mysqlConnection = streamRows(rows);
  const connection = {
    queries,
    connection: mysqlConnection,
    async query(sql) {
      queries.push(sql);
      if (sql === 'SET NAMES utf8mb4') {
        sessionCharsets.client_charset = 'utf8mb4';
        sessionCharsets.connection_charset = 'utf8mb4';
        sessionCharsets.results_charset = 'utf8mb4';
        return [[], []];
      }
      if (sql.startsWith('SET SESSION ')) return [[], []];
      if (sql === 'SELECT DATABASE() AS schema_name, @@character_set_client AS client_charset, @@character_set_connection AS connection_charset, @@character_set_results AS results_charset, @@max_allowed_packet AS max_packet_bytes') {
        return [[{ schema_name: 'po_fixture', ...sessionCharsets, max_packet_bytes: maxPacketBytes }]];
      }
      if (sql.includes('FROM information_schema.schemata')) return [[{ charset_name: 'utf8mb4', collation_name: 'utf8mb4_general_ci' }]];
      if (sql.includes('FROM information_schema.tables')) return [tables];
      if (sql.includes('FROM information_schema.columns')) return [columns];
      if (sql.includes('FROM information_schema.statistics')) return [primary];
      if (sql === 'SHOW CREATE TABLE `items`') return [[{ 'Create Table': ddl }]];
      if (sql.includes('FROM information_schema.triggers')) return [objects.triggers || []];
      if (sql.includes('FROM information_schema.routines')) {
        const kind = /routine_type='(PROCEDURE|FUNCTION)'/.exec(sql)?.[1];
        return [(objects.routines || []).filter(item => item.routine_type === kind)];
      }
      if (sql.includes('FROM information_schema.events')) return [objects.events || []];
      if (objects.show && Object.hasOwn(objects.show, sql)) return [[objects.show[sql]]];
      throw new Error(`unexpected SQL: ${sql}`);
    }
  };
  return { connection, mysqlConnection };
}

test('编码明确区分 NULL、空串、Unicode、列顺序和字段边界', () => {
  const body = col('body', 'varchar(30)');
  assert.notDeepEqual(encodeField(body, null), encodeField(body, ''));
  assert.notDeepEqual(encodeField(body, ''), encodeField(body, '汉字🙂'));
  assert.notDeepEqual(encodeRow([col('a', 'varchar(30)'), col('b', 'varchar(30)')], ['ab', 'c']),
    encodeRow([col('a', 'varchar(30)'), col('b', 'varchar(30)')], ['a', 'bc']));
  assert.notDeepEqual(encodeRow([col('a', 'varchar(30)'), col('b', 'varchar(30)')], ['a', 'b']),
    encodeRow([col('b', 'varchar(30)'), col('a', 'varchar(30)')], ['b', 'a']));
  assert.throws(() => encodeRow([body], []), /row|column/i);
});

test('二进制与 BIT 保留原始字节；数值、时间和 JSON 不被浮点/时区隐式转换', () => {
  const blob = col('payload', 'varbinary(8)');
  assert.notDeepEqual(encodeField(blob, Buffer.from([0, 255, 0])), encodeField(blob, Buffer.from([0, 254, 0])));
  assert.notDeepEqual(encodeField(blob, Buffer.from([255])), encodeField(blob, Buffer.from([239, 191, 189])));
  const bit = col('flags', 'bit(8)');
  assert.doesNotThrow(() => encodeField(bit, Buffer.from([0x80])));
  assert.notDeepEqual(encodeField(bit, Buffer.from([0x80])), encodeField(bit, Buffer.from([0x01])));
  const decimal = col('amount', 'decimal(20,6)');
  assert.notDeepEqual(encodeField(decimal, '9007199254740993.000001'), encodeField(decimal, '9007199254740992.000001'));
  assert.throws(() => encodeField(col('id', 'bigint'), Number.MAX_SAFE_INTEGER + 1), /MANIFEST_UNSUPPORTED_FIELD_VALUE/);
  const datetime = col('created_at', 'datetime(3)');
  assert.notDeepEqual(encodeField(datetime, '2026-10-08 00:00:00.001'), encodeField(datetime, '2026-10-08 00:00:00.002'));
  assert.throws(() => encodeField(datetime, new Date('2026-10-08T00:00:00.001Z')), /date|unsupported|string/i);
  const json = col('payload_json', 'longtext');
  assert.notDeepEqual(encodeField(json, '{"a":1,"b":2}'), encodeField(json, '{"b":2,"a":1}'));
});

test('listSchema 读取完整表、列及主键元数据', async () => {
  const { connection } = schemaConnection();
  const schema = await listSchema(connection);
  assert.equal(schema.tables.length, 1);
  assert.deepEqual(schema.columns.map(item => item.column_name), ['id', 'body']);
  assert.deepEqual(schema.primary.map(item => item.column_name), ['id']);
  assert.equal(connection.queries.filter(sql => sql.includes('information_schema')).length, 4);
});

test('results 字符集为 latin1 时拒绝清单，完整扫描先执行 SET NAMES utf8mb4', async () => {
  const fixture = schemaConnection({ resultsCharset: 'latin1' });
  await assert.rejects(listSchema(fixture.connection), /MANIFEST_CONNECTION_CONFIG/);
  assert.equal(fixture.mysqlConnection.statements.length, 0);

  const full = schemaConnection({ resultsCharset: 'latin1' });
  const result = await snapshotManifest(full.connection, full.mysqlConnection);
  assert.equal(result.format, 'po-snapshot-manifest-v1');
  assert.equal(full.connection.queries[0], 'SET NAMES utf8mb4');
  assert.ok(full.connection.queries.indexOf('SET NAMES utf8mb4') <
    full.connection.queries.findIndex(sql => sql.startsWith('SELECT DATABASE()')));
});

test('max_allowed_packet 超过 64MiB 或无效时在表元数据与行扫描前拒绝', async () => {
  for (const maxPacketBytes of [64 * 1024 * 1024 + 1, 0, -1, 'invalid', 1.5]) {
    const fixture = schemaConnection({ maxPacketBytes });
    await assert.rejects(
      snapshotManifest(fixture.connection, fixture.mysqlConnection),
      /MANIFEST_PACKET_LIMIT/
    );
    assert.equal(fixture.mysqlConnection.statements.length, 0);
    assert.equal(fixture.connection.queries.some(sql => sql.includes('FROM information_schema.tables')), false);
  }
  const permitted = schemaConnection({ maxPacketBytes: 64 * 1024 * 1024 });
  assert.equal((await listSchema(permitted.connection)).tables.length, 1);
});

test('复合主键稳定排序、定长分块和首末键不可逆摘要', async () => {
  const columns = [col('a', 'int'), col('b', 'varchar(10)'), col('body', 'text')];
  const rows = [[1, 'a', 'x'], [1, 'b', 'y'], [2, 'a', 'z'], [2, 'b', 'w'], [3, 'a', 'q']];
  const mysqlConnection = streamRows(rows);
  const connection = { connection: mysqlConnection };
  const result = await tableManifest(connection, mysqlConnection, 'items', columns, ['a', 'b'], { chunkSize: 2, maxRows: 5 });
  assert.equal(result.count, 5);
  assert.deepEqual(result.chunks.map(chunk => chunk.rows), [2, 2, 1]);
  assert.equal(mysqlConnection.statements.length, 1);
  assert.match(mysqlConnection.statements[0].sql, /ORDER BY `a`,`b`/);
  assert.equal(mysqlConnection.statements[0].rowsAsArray, true);
  for (const chunk of result.chunks) {
    assert.match(chunk.firstKeyHash, /^[a-f0-9]{64}$/);
    assert.match(chunk.lastKeyHash, /^[a-f0-9]{64}$/);
    assert.match(chunk.sha256, /^[a-f0-9]{64}$/);
    assert.equal(JSON.stringify(chunk).includes('body'), false);
  }
  assert.notEqual(result.chunks[0].firstKeyHash, digest(Buffer.from('1a')));
});

test('空表与块边界可重复，单行变更在相同行数下改变摘要', async () => {
  const columns = [col('id', 'int'), col('body', 'varchar(30)')];
  const read = rows => {
    const raw = streamRows(rows);
    return tableManifest({ connection: raw }, raw, 'items', columns, ['id'], { chunkSize: 2 });
  };
  const empty = await read([]);
  assert.equal(empty.count, 0);
  assert.deepEqual(empty.chunks, []);
  const two = await read([[1, 'a'], [2, 'b']]);
  const three = await read([[1, 'a'], [2, 'b'], [3, 'c']]);
  assert.deepEqual(two.chunks.map(chunk => chunk.rows), [2]);
  assert.deepEqual(three.chunks.map(chunk => chunk.rows), [2, 1]);
  assert.deepEqual(three, await read([[1, 'a'], [2, 'b'], [3, 'c']]));
  assert.notDeepEqual(three, await read([[1, 'a'], [2, 'changed'], [3, 'c']]));
});

test('超行数预算与缺失/不存在主键必须失败关闭', async () => {
  const columns = [col('id', 'int'), col('body', 'varchar(30)')];
  const read = (rows, primary, options) => {
    const raw = streamRows(rows);
    return tableManifest({ connection: raw }, raw, 'items', columns, primary, options);
  };
  await assert.rejects(read([[1, 'a']], [], {}), /MANIFEST_PRIMARY_KEY_REQUIRED/);
  await assert.rejects(read([[1, 'a']], ['missing'], {}), /MANIFEST_PRIMARY_METADATA_MISMATCH/);
  await assert.rejects(read([[1, 'a'], [2, 'b']], ['id'], { maxRows: 1 }), /budget/i);
});

test('字段、行、分块字节预算严格执行，超限时销毁原始连接', async () => {
  const columns = [col('id', 'int'), col('body', 'varchar(30)')];
  const read = (rows, options) => {
    const raw = streamRows(rows);
    return { raw, pending: tableManifest({ connection: raw }, raw, 'items', columns, ['id'], options) };
  };
  const field = read([[1, '12345']], { maxFieldBytes: 4, maxRowBytes: 64, maxChunkBytes: 64 });
  await assert.rejects(field.pending, /MANIFEST_FIELD_BUDGET_EXCEEDED/);
  assert.equal(field.raw.destroyed, true);

  const rowBytes = encodeRow(columns, [1, 'a']).length;
  const row = read([[1, 'a']], { maxFieldBytes: 1, maxRowBytes: rowBytes - 1, maxChunkBytes: rowBytes });
  await assert.rejects(row.pending, /MANIFEST_ROW_BYTE_BUDGET_EXCEEDED/);
  assert.equal(row.raw.destroyed, true);

  const chunk = read([[1, 'a'], [2, 'b']], {
    chunkSize: 100,
    maxFieldBytes: 1,
    maxRowBytes: rowBytes,
    maxChunkBytes: rowBytes + 1
  });
  const result = await chunk.pending;
  assert.deepEqual(result.chunks.map(item => item.rows), [1, 1]);
  assert.ok(result.chunks.every(item => item.bytes <= rowBytes + 1));

  const exhausted = read([[1, 'a'], [2, 'b']], {
    chunkSize: 100,
    maxFieldBytes: 1,
    maxRowBytes: rowBytes,
    maxChunkBytes: rowBytes + 1,
    maxChunks: 1
  });
  await assert.rejects(exhausted.pending, /MANIFEST_CHUNK_BUDGET_EXCEEDED/);
  assert.equal(exhausted.raw.destroyed, true);
});

test('单连接契约：元数据连接和流连接不一致时拒绝扫描', async () => {
  const raw = streamRows([[1, 'a']]);
  const another = streamRows([[1, 'a']]);
  await assert.rejects(tableManifest({ connection: raw }, another, 'items', [col('id', 'int')], ['id']), /MANIFEST_SINGLE_CONNECTION_REQUIRED/);
  assert.equal(raw.statements.length, 0);
  assert.equal(another.statements.length, 0);
});

test('对象定义包括表及各类可执行对象，缺失定义必须失败', async () => {
  const objects = {
    triggers: [{ name: 'trg_items' }],
    routines: [{ name: 'proc_items', routine_type: 'PROCEDURE' }, { name: 'fn_items', routine_type: 'FUNCTION' }],
    events: [{ name: 'evt_items' }],
    show: {
      'SHOW CREATE TRIGGER `trg_items`': { 'SQL Original Statement': 'CREATE TRIGGER trg_items BEFORE INSERT ON items FOR EACH ROW SET @x = 1' },
      'SHOW CREATE PROCEDURE `proc_items`': { 'Create Procedure': 'CREATE PROCEDURE proc_items() SELECT 1' },
      'SHOW CREATE FUNCTION `fn_items`': { 'Create Function': 'CREATE FUNCTION fn_items() RETURNS INT RETURN 1' },
      'SHOW CREATE EVENT `evt_items`': { 'Create Event': 'CREATE EVENT evt_items ON SCHEDULE EVERY 1 DAY DO SELECT 1' }
    }
  };
  const { connection } = schemaConnection({ objects });
  const schema = await listSchema(connection);
  const manifest = await objectManifest(connection, schema);
  assert.deepEqual(manifest.map(item => item.type), ['EVENT', 'FUNCTION', 'PROCEDURE', 'SCHEMA', 'TABLE', 'TRIGGER']);
  assert.ok(manifest.every(item => /^[a-f0-9]{64}$/.test(item.sha256)));
  const broken = schemaConnection({ objects: { ...objects, show: { ...objects.show, 'SHOW CREATE EVENT `evt_items`': {} } } });
  await assert.rejects(objectManifest(broken.connection, await listSchema(broken.connection)), /definition|missing/i);
});

test('空表 AUTO_INCREMENT 高水位不同必须产生不同对象摘要', async () => {
  const ddl = nextId => `CREATE TABLE \`items\` (\`id\` int NOT NULL AUTO_INCREMENT, PRIMARY KEY (\`id\`)) ENGINE=InnoDB AUTO_INCREMENT=${nextId} DEFAULT CHARSET=utf8mb4`;
  const source = schemaConnection({ rows: [], ddl: ddl(10) });
  const restored = schemaConnection({ rows: [], ddl: ddl(11) });
  const first = await snapshotManifest(source.connection, source.mysqlConnection);
  const second = await snapshotManifest(restored.connection, restored.mysqlConnection);
  assert.equal(first.tables[0].count, 0);
  assert.equal(second.tables[0].count, 0);
  assert.deepEqual(first.tables, second.tables, '空表行摘要不能替代自增序列高水位核对');
  assert.notEqual(
    first.objects.find(object => object.type === 'TABLE').sha256,
    second.objects.find(object => object.type === 'TABLE').sha256
  );
});

test('全量清单逐项可比较：相同行数的数据差异与 DDL 差异均能定位', async () => {
  const source = schemaConnection({ rows: [[1, 'alpha'], [2, 'beta']] });
  const identical = schemaConnection({ rows: [[1, 'alpha'], [2, 'beta']] });
  const changedRow = schemaConnection({ rows: [[1, 'alpha'], [2, 'gamma']] });
  const changedDdl = schemaConnection({ rows: [[1, 'alpha'], [2, 'beta']], ddl: 'CREATE TABLE `items` (`id` int PRIMARY KEY, `body` varchar(31)) ENGINE=InnoDB' });
  const run = input => snapshotManifest(input.connection, input.mysqlConnection, { chunkSize: 1 });
  const first = await run(source);
  assert.deepEqual(first, await run(identical));
  const dataDiff = await run(changedRow);
  assert.equal(first.tables[0].count, dataDiff.tables[0].count);
  assert.notDeepEqual(first.tables[0].chunks, dataDiff.tables[0].chunks);
  const ddlDiff = await run(changedDdl);
  assert.deepEqual(first.tables, ddlDiff.tables);
  assert.notDeepEqual(first.objects, ddlDiff.objects);
});
