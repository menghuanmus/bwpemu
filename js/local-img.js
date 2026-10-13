// ================================================================
//  js/local-img.js — 设备本地图库（IndexedDB）
//  用途：临时预设里的图在本机留一份（防止对局目录被清理后图失效）；
//        预设拖到战场使用时，会自动上传到当前对局目录换成短 URL。
//  引用格式：local-img://<id> —— 存在预设数据里；图片数据本身存 IndexedDB。
//  设计：全量内存缓存（读图同步，随取随用）+ 异步落盘（IndexedDB）；
//        IndexedDB 不可用时自动降级为「本次会话内存」。
//  数据量参考：单图 ≈50KB（400px JPEG），日常几十张，内存占用可忽略。
// ================================================================

var LocalImg = (function () {
  var DB_NAME = 'bwpemu-local-img';
  var DB_VERSION = 1;
  var STORE_IMG = 'imgs';     // { id, dataUrl, ts }
  var STORE_URL = 'urlmap';   // { url, id }
  var REF_PREFIX = 'local-img://';
  var KEEP_MAPPED_MS = 24 * 60 * 60 * 1000;   // 有 URL 映射但未被预设引用的图，保留 24 小时再清

  var memImgs = {};   // id -> dataUrl
  var memTs = {};     // id -> 时间戳
  var memUrls = {};   // url -> id
  var _db = null;
  var _ready = false;
  var _pendingOps = [];   // DB 打开前排队的落盘操作
  var _readyCbs = [];     // ready 回调

  function isRef(s) { return typeof s === 'string' && s.indexOf(REF_PREFIX) === 0; }
  function idOf(s) { return isRef(s) ? s.slice(REF_PREFIX.length) : ''; }
  function makeRef(id) { return REF_PREFIX + id; }
  function _genId() { return 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  /** 落盘（DB 未就绪时排队，就绪后统一执行） */
  function _persist(fn) {
    if (_db) {
      try { fn(_db); } catch (e) { console.warn('[LocalImg] 落盘异常:', e); }
    } else {
      _pendingOps.push(fn);
    }
  }

  function openDb() {
    try {
      if (typeof indexedDB === 'undefined') { console.warn('[LocalImg] 无 IndexedDB，降级为会话内存'); _markReady(); return; }
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_IMG)) db.createObjectStore(STORE_IMG, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(STORE_URL)) db.createObjectStore(STORE_URL, { keyPath: 'url' });
      };
      req.onsuccess = function (e) { _db = e.target.result; _loadAll(); };
      req.onerror = function () { console.warn('[LocalImg] 打开失败:', req.error); _markReady(); };
    } catch (e) { console.warn('[LocalImg] 初始化异常:', e); _markReady(); }
  }

  function _loadAll() {
    try {
      var tx = _db.transaction([STORE_IMG, STORE_URL], 'readonly');
      var r1 = tx.objectStore(STORE_IMG).getAll();
      var r2 = tx.objectStore(STORE_URL).getAll();
      tx.oncomplete = function () {
        (r1.result || []).forEach(function (row) {
          if (row && row.id && row.dataUrl) { memImgs[row.id] = row.dataUrl; memTs[row.id] = row.ts || 0; }
        });
        (r2.result || []).forEach(function (row) { if (row && row.url && row.id) memUrls[row.url] = row.id; });
        _markReady();
      };
      tx.onerror = function () { console.warn('[LocalImg] 读取失败:', tx.error); _markReady(); };
    } catch (e) { _markReady(); }
  }

  function _markReady() {
    _ready = true;
    var ops = _pendingOps; _pendingOps = [];
    ops.forEach(function (fn) { try { fn(_db); } catch (e) { /* 忽略 */ } });
    var cbs = _readyCbs; _readyCbs = [];
    cbs.forEach(function (fn) { try { fn(); } catch (e) { /* 忽略 */ } });
  }

  /** 本地图库就绪（读盘完成）后回调；已就绪则立即执行 */
  function onReady(fn) {
    if (_ready) { try { fn(); } catch (e) { /* 忽略 */ } return; }
    _readyCbs.push(fn);
  }

  /** 存一张图（同步立即可用；异步落盘）。url 可选：记录「该网络图 = 本机这份副本」的映射 */
  function put(dataUrl, url) {
    if (!dataUrl || typeof dataUrl !== 'string') return '';
    var id = _genId();
    memImgs[id] = dataUrl;
    memTs[id] = Date.now();
    if (url) memUrls[url] = id;
    _persist(function (db) {
      var tx = db.transaction([STORE_IMG, STORE_URL], 'readwrite');
      tx.objectStore(STORE_IMG).put({ id: id, dataUrl: dataUrl, ts: memTs[id] });
      if (url) tx.objectStore(STORE_URL).put({ url: url, id: id });
    });
    return makeRef(id);
  }

  /** 给本地库里已有的图补一条 URL 映射（不复制数据） */
  function mapUrl(url, ref) {
    var id = idOf(ref);
    if (!url || !id || !memImgs[id]) return;
    memUrls[url] = id;
    _persist(function (db) {
      db.transaction([STORE_URL], 'readwrite').objectStore(STORE_URL).put({ url: url, id: id });
    });
  }

  /** local 引用 → 可直接显示的 dataURL；非 local 引用返回 null */
  function srcOf(ref) {
    var id = idOf(ref);
    return id ? (memImgs[id] || null) : null;
  }

  /** 网络图 URL → 本机副本的 local 引用（没有副本返回 ''） */
  function refForUrl(url) {
    if (!url) return '';
    var id = memUrls[url];
    return (id && memImgs[id]) ? makeRef(id) : '';
  }

  /** 解析成可直接使用的地址：local → dataURL；其它原样返回 */
  function resolve(src) {
    if (!src) return '';
    if (!isRef(src)) return src;
    return memImgs[idOf(src)] || '';
  }

  /** 垃圾回收：删掉「未被预设引用」且「没有 URL 映射（或映射已超 24 小时）」的本地图 */
  function gc(usedRefs) {
    if (!_ready) return;   // 读盘还没完成，先不动
    var used = {};
    (usedRefs || []).forEach(function (r) { var id = idOf(r); if (id) used[id] = 1; });
    var mapped = {};
    Object.keys(memUrls).forEach(function (u) { if (memUrls[u]) mapped[memUrls[u]] = 1; });
    var now = Date.now();
    var doomed = [];
    Object.keys(memImgs).forEach(function (id) {
      if (used[id]) return;
      if (mapped[id] && (now - (memTs[id] || 0)) < KEEP_MAPPED_MS) return;
      doomed.push(id);
    });
    if (!doomed.length) return;
    doomed.forEach(function (id) { delete memImgs[id]; delete memTs[id]; });
    var doomedUrls = [];
    Object.keys(memUrls).forEach(function (u) {
      if (doomed.indexOf(memUrls[u]) !== -1) { doomedUrls.push(u); delete memUrls[u]; }
    });
    _persist(function (db) {
      var tx = db.transaction([STORE_IMG, STORE_URL], 'readwrite');
      doomed.forEach(function (id) { tx.objectStore(STORE_IMG).delete(id); });
      doomedUrls.forEach(function (u) { tx.objectStore(STORE_URL).delete(u); });
    });
    console.log('[LocalImg] 已清理本地图 ' + doomed.length + ' 张');
  }

  /** 统计（调试用） */
  function stats() {
    var n = 0, bytes = 0;
    Object.keys(memImgs).forEach(function (id) { n++; bytes += memImgs[id].length; });
    return { count: n, approxBytes: bytes };
  }

  openDb();

  return {
    isRef: isRef, makeRef: makeRef,
    isPersistent: function () { return !!_db; },
    put: put, mapUrl: mapUrl,
    srcOf: srcOf, refForUrl: refForUrl, resolve: resolve,
    gc: gc, onReady: onReady, stats: stats
  };
})();
