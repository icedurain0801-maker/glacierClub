'use strict';
// Trusted offline protocol peer. No server/socket is opened.
const { Duplex } = require('node:stream');
const path = require('node:path'), crypto = require('node:crypto');
const contract = require('./overseas-v019-profile-adapter-contract');
const base = path.dirname(require.resolve('mysql2/package.json'));
const P = require(path.join(base, 'lib/packets'));
const C = require(path.join(base, 'lib/constants/client'));
const auth = require(path.join(base, 'lib/auth_41'));
const mysql = require('mysql2');
const controls = { SET_ISOLATION: 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ', START_READ_ONLY: 'START TRANSACTION READ ONLY', ROLLBACK: 'ROLLBACK' };
function fixtureRows() {
  const stamp = new Date().toISOString().replace('T', ' ').replace('Z', '');
  const source = contract.sourceId, game = 'isolated-game', community = 'isolated-community', account = 'isolated-account';
  return {
    R1: [{ port: 3306, server_id: 1, version: '10.4.14-MariaDB', database_name: 'public_opinion', now_utc: stamp }],
    R2: [{ id: source, game_id: game, community_id: community, platform: 'bigplayer_h5', enabled: 1, auth_status: 'authorized', auth_expire_at: null, default_account_id: account, schedule_version: '1', updated_at: stamp, board_id: '100017' }],
    R3: [{ id: account, source_id: source, game_id: game, community_id: community, platform: 'bigplayer_h5', enabled: 1, auth_status: 'authorized', auth_expire_at: null, updated_at: stamp }],
    R4: [{ id: 'isolated-credential', source_id: source, account_id: account, credential_type: 'api_token', status: 'active', expire_at: null, last_checked_at: stamp, updated_at: stamp, has_cipher: 1, has_ref: 0 }],
    R5: [1, 2, 3].map(n => ({ id: 'isolated-registry-' + n, source_id: source, site_id: 'isolated-site-' + n, url_hash: crypto.createHash('sha256').update('isolated-url-' + n).digest('hex'), enabled: 1, auth_status: n === 1 ? 'authorized' : 'unknown', last_checked_at: stamp, updated_at: stamp })),
    R6: [{ id: game, region_code: 'overseas', enabled: 1 }], R7: [{ id: community, game_id: game, status: 'enabled' }]
  };
}
function columnType(name) {
  if (name.endsWith('_at') || name === 'now_utc') return 12;
  if (['enabled', 'has_cipher', 'has_ref'].includes(name)) return 1;
  if (['port', 'server_id', 'schedule_version'].includes(name)) return 8;
  if (name === 'board_id') return 251;
  return 253;
}
function createMemoryPeer(fault, credentials = {}) {
  const trace = [], rows = fixtureRows(), seed1 = Buffer.alloc(8, 1), seed2 = Buffer.alloc(12, 2);
  const expectedUser = credentials.DB_USER ?? 'isolated-db-user';
  const expectedPassword = credentials.DB_PASSWORD ?? 'isolated-db-password';
  const flags = C.LONG_PASSWORD | C.PROTOCOL_41 | C.SECURE_CONNECTION | C.PLUGIN_AUTH | C.CONNECT_WITH_DB;
  const timers = new Set(); let pending = Buffer.alloc(0), authenticated = false, authConsumed = false, peer;
  function send(p, seq) { if (peer.destroyed) return; p.writeHeader(seq); peer.push(p.buffer); }
  function later(fn, ms = 0) { const t = setTimeout(() => { timers.delete(t); if (!peer.destroyed) fn(); }, ms); timers.add(t); }
  peer = new Duplex({
    read() {},
    write(chunk, encoding, cb) {
      pending = Buffer.concat([pending, chunk]);
      try {
        while (pending.length >= 4 && pending.length >= pending.readUIntLE(0, 3) + 4) {
          const size = pending.readUIntLE(0, 3) + 4, buffer = pending.subarray(0, size); pending = pending.subarray(size);
          if (!authenticated) {
            const packet = new P.Packet(buffer[3], buffer, 0, buffer.length);
            const response = P.HandshakeResponse.fromPacket(packet, flags);
            authConsumed = response.user === expectedUser && response.database === 'public_opinion' && response.authToken.equals(auth.calculateToken(expectedPassword, seed1, seed2));
            authenticated = true; trace.push('AUTH_RESPONSE');
            later(() => send(authConsumed ? P.OK.toPacket({ serverStatus: 2 }, 'utf8') : P.Error.toPacket({ code: 1045, message: 'isolated-secret-error' }, 'utf8'), 2));
          } else if (buffer[4] === 1) {
            trace.push('COM_QUIT'); if (fault.at !== 'END' || !fault.hang) later(() => { peer.push(null); peer.end(); peer.destroy(); }, fault.delayMs || 0);
          } else if (buffer[4] === 3) {
            const sql = buffer.subarray(5).toString('utf8');
            const values = { R1: [], R2: [contract.sourceId], R3: [contract.sourceId], R4: [contract.sourceId, 'isolated-account', 'api_token'], R5: [contract.sourceId], R6: ['isolated-game'], R7: ['isolated-community'] };
            const key = Object.keys({ ...contract.sqlContract, ...controls }).find(k => mysql.format(contract.sqlContract[k] || controls[k], values[k] || []) === sql);
            if (!key) throw Error('ISOLATED_SQL_REJECTED'); trace.push(key);
            if (fault.at === key && fault.hang) continue;
            later(() => {
              if (fault.at === key && fault.error) { send(P.Error.toPacket({ code: 1045, message: 'isolated-secret-error' }, 'utf8'), 1); return; }
              if (!(key in rows)) { send(P.OK.toPacket({ serverStatus: 2 }, 'utf8'), 1); return; }
              if (key === 'R4' && Object.hasOwn(fault, 'expireInMs')) rows.R4[0].expire_at = new Date(Date.now() + fault.expireInMs).toISOString().replace('T', ' ').replace('Z', '');
              let fields = contract.schemaContract[key].split(' ').map(name => ({ catalog: 'def', schema: 'public_opinion', table: 'isolated', orgTable: 'isolated', name, orgName: name, characterSet: 45, columnLength: 128, columnType: columnType(name), flags: 0, decimals: 3 }));
              if (fault.at === key && fault.fieldFault === 'type') fields[0].columnType = 252;
              if (fault.at === key && fault.fieldFault === 'duplicate') fields[1].name = fields[0].name;
              if (fault.at === key && fault.fieldFault === 'extra') fields.push({ ...fields[0], name: 'secret_cipher' });
              if (fault.at === key && fault.rowPatch) Object.assign(rows[key][0], fault.rowPatch);
              if (fault.at === key && Object.hasOwn(fault, 'rowCount')) rows[key] = Array.from({ length: fault.rowCount }, () => ({ ...rows[key][0] }));
              const batchRows = rows[key];
              let seq = 1; send(P.ResultSetHeader.toPacket(fields.length), seq++);
              for (const field of fields) { if (peer.destroyed) return; send(P.ColumnDefinition.toPacket(field), seq++); }
              if (peer.destroyed) return;
              send(P.EOF.toPacket(0, 2), seq++);
              for (const row of batchRows) { if (peer.destroyed) return; send(P.TextRow.toPacket(fields.map(f => row[f.name]), 'utf8'), seq++); }
              if (peer.destroyed) return;
              send(P.EOF.toPacket(0, 2), seq++);
            }, fault.at === key ? fault.delayMs || 0 : 0);
          } else throw Error('ISOLATED_COMMAND_REJECTED');
        }
        cb();
      } catch { cb(Error('ISOLATED_PROTOCOL_FAILED')); }
    },
    destroy(err, cb) { for (const t of timers) clearTimeout(t); timers.clear(); pending = Buffer.alloc(0); for (const k of Object.keys(rows)) delete rows[k]; cb(err); }
  });
  if (fault.at !== 'CONNECT' || !fault.hang) later(() => send(new P.Handshake({ protocolVersion: 10, serverVersion: '10.4.14-MariaDB', capabilityFlags: flags, connectionId: 1, authPluginData1: seed1, authPluginData2: seed2, characterSet: 45, statusFlags: 2 }).toPacket(0), 0), fault.at === 'CONNECT' ? fault.delayMs || 0 : 0);
  return { stream: peer, evidence: () => ({ trace: [...trace], authConsumed, destroyed: peer.destroyed }) };
}
module.exports = { createMemoryPeer, columnType, controls };
