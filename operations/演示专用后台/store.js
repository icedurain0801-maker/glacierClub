/*!
 * 演示专用后台 —— 共享数据层
 * 自动切换：本地(localhost / file://) 走 localStorage；部署到 chat.q1.com 走 Glacier BaaS。
 * 两个页面(upload.html / records.html)共用同一份记录。
 *
 * 记录结构：{ id, group, plan, fileName, fileUrl, mime, size, uploadedBy, uploadedAt }
 *   uploadedAt 为毫秒时间戳，records 页按它升序排 top3。
 *   plan 为所属方案（默认「方案一」）。
 */
(function (global) {
  'use strict';

  var COLLECTION = 'demo_uploads';
  var LS_KEY = 'demo_uploads_records';
  var APP_KEY = 'pk_e784f4a682534f7493ad4a767f8ce2b1';
  var BAAS_URL = 'https://chat.q1.com/baas';

  // 判定是否处于 BaaS 环境：有 SDK 且部署在 chat.q1.com 上
  var isBaaS = (typeof global.GlacierBaaS !== 'undefined') &&
    /(^|\.)q1\.com$/i.test(global.location.hostname);

  var app = null;
  function getApp() {
    if (app) return app;
    app = global.GlacierBaaS.init({ appKey: APP_KEY, baseUrl: BAAS_URL });
    return app;
  }

  // 从 BaaS 用户对象里取展示名（SDK 返回 {end_user_id, display_name, is_anonymous}）
  function userName(u) {
    if (!u) return '已登录';
    return u.display_name || u.name || u.nickname || u.end_user_id || u.id || '已登录';
  }

  // ---------- localStorage 实现 ----------
  function lsAll() {
    try { return JSON.parse(global.localStorage.getItem(LS_KEY) || '[]'); }
    catch (e) { return []; }
  }
  function lsSave(list) {
    global.localStorage.setItem(LS_KEY, JSON.stringify(list));
  }

  // ---------- IndexedDB 文件存储（本地模式）----------
  // localStorage 仅 ~5MB，存 base64 视频必爆配额。改用 IndexedDB 存原始 Blob（容量 GB 级），
  // 记录里只保留 'idb:<key>' 引用，打开时用 resolveUrl() 还原成 objectURL。
  var IDB_NAME = 'demo_uploads_files';
  var IDB_STORE = 'files';
  var _idbPromise = null;
  function idb() {
    if (_idbPromise) return _idbPromise;
    _idbPromise = new Promise(function (resolve, reject) {
      if (!global.indexedDB) { reject(new Error('浏览器不支持 IndexedDB')); return; }
      var req = global.indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('IndexedDB 打开失败')); };
    });
    return _idbPromise;
  }
  function idbPut(key, blob) {
    return idb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(blob, key);
        tx.oncomplete = function () { resolve(key); };
        tx.onerror = function () { reject(tx.error || new Error('文件写入失败')); };
      });
    });
  }
  function idbGet(key) {
    return idb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, 'readonly');
        var r = tx.objectStore(IDB_STORE).get(key);
        r.onsuccess = function () { resolve(r.result || null); };
        r.onerror = function () { reject(r.error || new Error('文件读取失败')); };
      });
    });
  }
  function idbDel(key) {
    return idb().then(function (db) {
      return new Promise(function (resolve) {
        var tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE)['delete'](key);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { resolve(false); };
      });
    }).catch(function () { return false; });
  }

  // 按「组」标注名次：每个组可有多个文件；名次按该组「首次上传时间」排（组内所有文件共享组名次）。
  // 给每行加 groupFirstAt(该组最早时间) 与 groupRank(该组名次)，并按 名次升序→组内时间升序→文件名 排序。
  function annotateGroups(list) {
    list = (list || []).slice();
    var firstAt = {};
    list.forEach(function (r) {
      var t = r.uploadedAt || 0;
      if (firstAt[r.group] === undefined || t < firstAt[r.group]) firstAt[r.group] = t;
    });
    // 名次按组首次时间升序；同毫秒并列时用组名做稳定 tiebreak（第1组 < 第2组…）
    var groups = Object.keys(firstAt).sort(function (a, b) {
      if (firstAt[a] !== firstAt[b]) return firstAt[a] - firstAt[b];
      return a.localeCompare(b);
    });
    var rankOf = {};
    groups.forEach(function (g, i) { rankOf[g] = i + 1; });
    list.forEach(function (r) { r.groupFirstAt = firstAt[r.group]; r.groupRank = rankOf[r.group]; });
    list.sort(function (a, b) {
      if (a.groupRank !== b.groupRank) return a.groupRank - b.groupRank;
      var ta = a.uploadedAt || 0, tb = b.uploadedAt || 0;
      if (ta !== tb) return ta - tb;
      return String(a.fileName || '').localeCompare(String(b.fileName || ''));
    });
    return list;
  }

  var LOGIN_KEY = 'demo_uploads_login';   // 本地登录态（sessionStorage）

  var Store = {
    mode: isBaaS ? 'baas' : 'local',

    // 是否需要页面级登录门控。
    //   云端：冰川静态托管已在外层套了钉钉 OAuth 登录壳（进得来就是登录过的钉钉用户），
    //         页面无需再做登录，也不该调 SDK 的 auth.sso()（该托管未注入 GLACIER_SSO_ENDPOINT）。
    //   本地：无登录壳，用 sessionStorage 模拟一个登录态，保留登录流程供本地调试。
    requiresLogin: !isBaaS,

    // 当前登录用户名（同步）。
    //   云端：读 BaaS 已缓存的 currentUser；无则返回占位（平台登录壳已把关，不阻塞使用）。
    //   本地：读 sessionStorage 里的模拟登录态。
    currentUser: function () {
      if (isBaaS) {
        var a = getApp();
        var cur = a.auth.currentUser && a.auth.currentUser();
        return cur ? userName(cur) : '已登录用户';
      }
      try { return global.sessionStorage.getItem(LOGIN_KEY) || null; } catch (e) { return null; }
    },

    // 拉取当前登录用户信息（云端向 /v1/auth/me 换取，平台登录壳的 cookie 有效即成功）。
    //   仅用于展示用户名，失败不阻塞（返回占位名）。本地写入模拟登录态。
    login: function () {
      if (isBaaS) {
        var a = getApp();
        var cur = a.auth.currentUser && a.auth.currentUser();
        if (cur) return Promise.resolve(userName(cur));
        return a.auth.me().then(function (m) {
          if (m) { try { a._user = m; } catch (e) {} }
          return userName(m);
        }).catch(function () { return '已登录用户'; });
      }
      var name = '本地演示用户';
      try { global.sessionStorage.setItem(LOGIN_KEY, name); } catch (e) {}
      return Promise.resolve(name);
    },

    // 退出登录（云端调 auth.logout，清本地 token；本地清除模拟登录态）。
    logout: function () {
      if (isBaaS) {
        var a = getApp();
        try { return Promise.resolve(a.auth.logout && a.auth.logout()); } catch (e) { return Promise.resolve(); }
      }
      try { global.sessionStorage.removeItem(LOGIN_KEY); } catch (e) {}
      return Promise.resolve();
    },

    // 确保已登录：已有用户名直接返回，否则拉取。
    ensureLogin: function () {
      var cur = Store.currentUser();
      if (cur) return Promise.resolve(cur);
      return Store.login();
    },

    // 是否有权进入管理后台。
    //   本地模式：数据只在本机浏览器，天然私有 → 直接放行；
    //   云端模式：必须是本 app 的 owner/admin（服务端强制，无法绕过）→ 只有你能看。
    // 需已登录；未登录会先触发登录。返回 Promise<boolean>。
    isAdmin: function () {
      if (!isBaaS) return Promise.resolve(true);
      return Store.ensureLogin().then(function () {
        return getApp().admin.isAdmin();
      }).catch(function () { return false; });
    },

    // 确保 demo_uploads 集合为共享读（app-shared），否则云端模式下各组只能看到自己上传的、排行榜失效。
    // 仅本 app 管理员(owner/admin)有权限设置；非管理员或已配置好时静默跳过，绝不阻断上传/查看流程。
    ensureShared: function () {
      if (!isBaaS) return Promise.resolve(false);
      if (Store._sharedTried) return Store._sharedTried;
      var a = getApp();
      Store._sharedTried = a.admin.isAdmin().then(function (yes) {
        if (!yes) return false;
        return a.admin.setCollectionAcl([{ collection: COLLECTION, acl: 'app-shared' }])
          .then(function () { return true; });
      }).catch(function () { return false; });
      return Store._sharedTried;
    },

    // 上传文件 → 返回 { fileUrl, mime, size, name }
    // 本地：把原始 Blob 存进 IndexedDB，fileUrl 记为 'idb:<key>' 引用（不塞 base64，避免 localStorage 配额爆掉）。
    uploadFile: function (file) {
      if (!isBaaS) {
        var key = 'f_' + Date.now() + '_' + Math.floor(Math.random() * 1e9);
        return idbPut(key, file).then(function () {
          return { fileUrl: 'idb:' + key, mime: file.type || '', size: file.size, name: file.name };
        });
      }
      return getApp().files.upload(file).then(function (res) {
        return { fileUrl: res.url, mime: res.mime || file.type || '', size: res.size || file.size, name: res.name || file.name };
      });
    },

    // 把记录里的 fileUrl 还原成可打开/预览的 URL：
    //   'idb:<key>' → 从 IndexedDB 取 Blob 生成 objectURL；其它(http/dataURL) 原样返回。
    // 返回 Promise<string|null>。调用方用完 objectURL 应适时 URL.revokeObjectURL。
    resolveUrl: function (fileUrl) {
      if (!fileUrl) return Promise.resolve(null);
      if (fileUrl.indexOf('idb:') !== 0) return Promise.resolve(fileUrl);
      var key = fileUrl.slice(4);
      return idbGet(key).then(function (blob) {
        return blob ? global.URL.createObjectURL(blob) : null;
      });
    },

    // 整轮替换某组内容：每个组可有多个文件；每一轮上传都会「先删掉该组上一轮的全部文件，再写入本轮这些」。
    //   名次锚定该组「首次上传时间」（若该组之前传过，沿用最早时间，名次不变；否则用本轮时间）。
    // 参数：group, plan, uploadedBy, files:[{fileName,fileUrl,mime,size}]
    // 返回 { records:[...], replaced:true|false }（replaced 表示覆盖了旧一轮）
    replaceGroupBatch: function (group, plan, uploadedBy, files) {
      var now = Date.now();
      plan = plan || Store.PLANS[0];
      files = files || [];

      function build(firstAt) {
        return files.map(function (f, i) {
          return {
            id: 'r_' + now + '_' + i + '_' + Math.floor(Math.random() * 1e6),
            group: group,
            plan: plan,
            fileName: f.fileName,
            fileUrl: f.fileUrl,
            mime: f.mime || '',
            size: f.size || 0,
            uploadedBy: uploadedBy || '',
            uploadedAt: firstAt,   // 组内所有文件共享该组首次时间（用于名次）
            updatedAt: now
          };
        });
      }

      if (!isBaaS) {
        var list = lsAll();
        var old = list.filter(function (r) { return r.group === group; });
        var replaced = old.length > 0;
        // 该组首次时间：沿用最早的旧记录时间，否则用现在
        var firstAt = now;
        old.forEach(function (r) { if ((r.uploadedAt || now) < firstAt) firstAt = r.uploadedAt || now; });
        // 删旧组的 IndexedDB Blob
        old.forEach(function (r) { if (r.fileUrl && r.fileUrl.indexOf('idb:') === 0) idbDel(r.fileUrl.slice(4)); });
        var kept = list.filter(function (r) { return r.group !== group; });
        var fresh = build(firstAt);
        lsSave(kept.concat(fresh));
        return Promise.resolve({ records: fresh, replaced: replaced });
      }

      // 云端：查该组旧记录 → 删除 → 批量新建
      var col = getApp().collection(COLLECTION);
      return col.where({ group: group }).orderBy('uploadedAt', true).find().then(function (existing) {
        existing = existing || [];
        var replaced = existing.length > 0;
        var firstAt = now;
        existing.forEach(function (r) { var t = r.uploadedAt || 0; if (t && t < firstAt) firstAt = t; });
        var dels = existing.filter(function (r) { return r.id; })
          .map(function (r) { return col.remove(r.id).catch(function () {}); });
        return Promise.all(dels).then(function () {
          var fresh = build(firstAt);
          var creates = fresh.map(function (doc) {
            var payload = {};
            for (var k in doc) if (k !== 'id') payload[k] = doc[k];
            return col.create(payload).then(function (r) { doc.id = (r && r.id) || doc.id; return doc; });
          });
          return Promise.all(creates).then(function (recs) { return { records: recs, replaced: replaced }; });
        });
      });
    },

    // 删除一条上传记录（管理后台用）。传整条 record（需要 id + fileUrl）。
    //   本地：从 localStorage 移除该 id，并删掉对应 IndexedDB Blob；
    //   云端：删集合文档（远端 OSS 对象不主动删，仅删记录，与 SDK files.remove 语义一致）。
    // 返回 Promise<boolean>。
    removeRecord: function (rec) {
      if (!rec || !rec.id) return Promise.reject(new Error('缺少记录 id'));
      if (!isBaaS) {
        var list = lsAll();
        var next = list.filter(function (r) { return r.id !== rec.id; });
        lsSave(next);
        // 顺手清理本地 Blob，释放空间
        if (rec.fileUrl && rec.fileUrl.indexOf('idb:') === 0) idbDel(rec.fileUrl.slice(4));
        return Promise.resolve(true);
      }
      return getApp().collection(COLLECTION).remove(rec.id).then(function () { return true; });
    },

    // 读取全部记录（每组可多个文件；按 组名次→组内时间 排序，并标注 groupRank/groupFirstAt）
    listRecords: function () {
      if (!isBaaS) {
        return Promise.resolve(annotateGroups(lsAll()));
      }
      return getApp().collection(COLLECTION).where({}).orderBy('uploadedAt', false).find()
        .then(function (rows) {
          rows = (rows || []).map(function (d) {
            return {
              id: d.id,
              group: d.group,
              plan: d.plan || Store.PLANS[0],
              fileName: d.fileName,
              fileUrl: d.fileUrl,
              mime: d.mime || '',
              size: d.size || 0,
              uploadedBy: d.uploadedBy || '',
              updatedAt: d.updatedAt || 0,
              uploadedAt: d.uploadedAt || (d.created_at ? new Date(d.created_at).getTime() : 0)
            };
          });
          return annotateGroups(rows);
        });
    },

    // 实时监听记录变化：每当有新上传，回调收到最新（升序）列表。返回取消监听的函数。
    // 本地模式：storage 事件（跨标签页即时）+ 轮询兜底（同标签页/保险）。
    // 云端模式：collection.subscribe 实时推送 + 轮询兜底。
    watch: function (cb, opts) {
      opts = opts || {};
      var interval = opts.interval || 3000;
      var stopped = false;
      var lastSig = null;

      function pull() {
        if (stopped) return;
        Store.listRecords().then(function (rows) {
          if (stopped) return;
          // 只有内容真的变了才回调，避免无谓重渲染
          var sig = rows.length + '|' + rows.map(function (r) {
            return (r.id || '') + ':' + (r.uploadedAt || 0);
          }).join(',');
          if (sig !== lastSig) { lastSig = sig; cb(rows); }
        }).catch(function () { /* 忽略单次失败，下个 tick 再试 */ });
      }

      pull(); // 立即拉一次

      var timer = global.setInterval(pull, interval);

      var onStorage = null;
      var unsub = null;
      if (!isBaaS) {
        onStorage = function (e) { if (e.key === LS_KEY) pull(); };
        global.addEventListener('storage', onStorage);
      } else {
        try { unsub = getApp().collection(COLLECTION).subscribe(function () { pull(); }); }
        catch (e) { /* 实时 WS 不可用时，靠轮询兜底 */ }
      }

      return function () {
        stopped = true;
        global.clearInterval(timer);
        if (onStorage) global.removeEventListener('storage', onStorage);
        if (typeof unsub === 'function') { try { unsub(); } catch (e) {} }
      };
    }
  };

  // 固定 10 个组别
  Store.GROUPS = ['第1组', '第2组', '第3组', '第4组', '第5组',
                  '第6组', '第7组', '第8组', '第9组', '第10组'];

  // 方案（默认第一个）
  Store.PLANS = ['方案一：中秋「团圆宴」限时活动', '方案二：新角色「霜吟·雪无痕」设计'];

  global.DemoStore = Store;
})(window);
