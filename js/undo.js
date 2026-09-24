/* ================================================================
 *  撤销 / 重做  js/undo.js
 *  ----------------------------------------------------------------
 *  · 本地快照（不含卡图）+ 历史数组 + 指针（上限 6 步）
 *  · 打点三层：
 *      ① 消息打点：chat.js 登记「标题 + 明细」（提供人话描述）
 *      ② 同步信号打点：包装 sendToPeer（任何要同步出去的改动 = 一步）
 *      ③ 接收端记账：network.js handlePeerData 收到状态类 op 时也记一步
 *  · 撤销/重做 = 本地还原 + 只补发差异的小消息（带 undoTx 标记）
 *  · 失败（服务端拒收）：本地回滚到撤销前 + 系统消息告知原因
 *  · 参数：打点去抖 1 秒 / 点击节流 1 秒 / 最近打点后 1 秒内不可点
 * ================================================================ */
(function () {
  'use strict';

  var MAX_STEPS = 6;          // 最多可撤步数
  var DEBOUNCE_MS = 1000;     // 打点去抖（等最后一条消息 1 秒后再存快照）
  var THROTTLE_MS = 1000;     // 点击节流
  var DESC_TTL_MS = 3000;     // 描述文本有效期（防止房间提示被误用）
  var FAIL_WINDOW_MS = 1500;  // 等这么久没收到 error-msg 就算发送成功
  var POLL_MS = 5000;         // 第三层：低频指纹兜底

  /* 会改变桌面的状态类 op（接收端记账用） */
  var STATE_OP_TYPES = {
    'slot-update': 1, 'slot-swap': 1, 'deck-update': 1, 'effects-update': 1,
    'player-info': 1, 'fire-update': 1, 'bounty-update': 1, 'bounty-toggle': 1,
    'nightfall-toggle': 1, 'nightfall-value': 1, 'oracle-update': 1, 'shop-update': 1,
    'avatar-update': 1, 'revealed-cards': 1, 'fate-revealed-cards': 1,
    'hand-shown': 1, 'grave-target': 1,
  };

  var history = [];           // [{ snap, title, items }]，history[0] = 基线
  var pointer = 0;
  var suppressCount = 0;
  var dirty = false;
  var debounceTimer = null;
  var pendingTitle = null;
  var pendingItems = [];
  var pendingAt = 0;
  var lastFlushAt = 0;
  var lastClickAt = 0;
  var lastSnap = null;
  var failTimer = null;
  var lastErrorMsg = null;
  var menuTimer = null;

  // ================================================================
  //  基础工具
  // ================================================================
  function isSuppressed() { return suppressCount > 0; }
  function suppress() { suppressCount++; }
  function unsuppress() { suppressCount = Math.max(0, suppressCount - 1); }

  /* 深拷贝（字符串直接共享引用；只克隆普通对象/数组，深度限制 4 层） */
  function cloneValue(v, depth) {
    if (v === null || typeof v !== 'object') return v;
    depth = depth || 0;
    if (Array.isArray(v)) {
      if (depth >= 4) return v.slice();
      return v.map(function (x) { return cloneValue(x, depth + 1); });
    }
    if (depth >= 4) return v;
    var o = {};
    for (var k in v) {
      if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
      o[k] = cloneValue(v[k], depth + 1);
    }
    return o;
  }

  /* 深度比较；ignoreKeys 里的字段不参与比较（卡图不参与撤销） */
  function deepEqual(a, b, ignoreKeys, depth) {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (a === null || b === null || typeof a !== 'object') return a === b;
    depth = depth || 0;
    if (depth > 6) return true;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) {
      if (a.length !== b.length) return false;
      for (var i = 0; i < a.length; i++) {
        if (!deepEqual(a[i], b[i], ignoreKeys, depth + 1)) return false;
      }
      return true;
    }
    var ka = Object.keys(a).filter(function (k) { return !ignoreKeys || ignoreKeys.indexOf(k) === -1; });
    var kb = Object.keys(b).filter(function (k) { return !ignoreKeys || ignoreKeys.indexOf(k) === -1; });
    if (ka.length !== kb.length) return false;
    for (var j = 0; j < ka.length; j++) {
      var k = ka[j];
      if (kb.indexOf(k) === -1) return false;
      if (!deepEqual(a[k], b[k], ignoreKeys, depth + 1)) return false;
    }
    return true;
  }

  function arrOf(setLike) {
    if (!setLike) return [];
    if (Array.isArray(setLike)) return setLike.slice();
    if (typeof setLike.forEach === 'function') { var out = []; setLike.forEach(function (x) { out.push(x); }); return out; }
    return [];
  }

  function eqArr(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) { if (String(a[i]) !== String(b[i])) return false; }
    return true;
  }

  function inputValue(pid, sel) {
    var el = document.querySelector('.player-zone[data-player="' + pid + '"] ' + sel);
    return el ? el.value : '';
  }

  function avatarSrc(pid) {
    var img = document.querySelector('.player-avatar[data-avatar-player="' + pid + '"] img');
    return img ? img.src : '';
  }

  function isSpectatorNow() {
    return (typeof isSpectator !== 'undefined') && !!isSpectator;
  }

  // ================================================================
  //  快照
  // ================================================================
  function snapshotPlayer(pid) {
    var p = {
      name: '', hp: '', avatar: '', fire: 0, effects: [],
      slots: [], deck: [], hand: [], grave: [],
      revealed: [], fateRevealed: [], handShows: [],
      bounty: 0, bountyActive: false,
      nightfallActive: false, nightfallValue: '0',
      oracleActive: false, oracleHands: [],
      shop: null,
    };
    try {
      if (typeof getPlayerInfo === 'function') { var info = getPlayerInfo(pid) || {}; p.name = info.name || ''; p.hp = info.hp || ''; }
      p.avatar = avatarSrc(pid);
      if (typeof playerFire !== 'undefined' && playerFire[pid] != null) p.fire = playerFire[pid];
      if (typeof getEffectsState === 'function') p.effects = cloneValue(getEffectsState(pid), 0);
      if (typeof getPlayerCardState === 'function') {
        var c = getPlayerCardState(pid) || {};
        p.deck = cloneValue(c.deck || [], 0);
        p.hand = cloneValue(c.hand || [], 0);
        p.grave = cloneValue(c.grave || [], 0);
      }
      if (typeof playerRevealedCards !== 'undefined') p.revealed = arrOf(playerRevealedCards[pid]);
      if (typeof playerFateRevealedCards !== 'undefined') p.fateRevealed = arrOf(playerFateRevealedCards[pid]);
      if (typeof playerHandShows !== 'undefined') p.handShows = arrOf(playerHandShows[pid]);
      if (typeof playerBounty !== 'undefined') p.bounty = playerBounty[pid] || 0;
      if (typeof bountyActive !== 'undefined') p.bountyActive = !!bountyActive[pid];
      if (typeof nightfallActive !== 'undefined') p.nightfallActive = !!nightfallActive[pid];
      p.nightfallValue = inputValue(pid, '.nightfall-input') || '0';
      if (typeof oracleActive !== 'undefined') p.oracleActive = !!oracleActive[pid];
      if (typeof oracleHands !== 'undefined' && Array.isArray(oracleHands[pid])) {
        p.oracleHands = oracleHands[pid].map(function (cd) {
          return { id: cd.id, name: cd.name, curses: (cd.curses || []).slice(), _stack: cd._stack, _maxStack: cd._maxStack };
        });
      }
      p.shop = snapshotShop(pid);
      var zone = document.querySelector('.player-zone[data-player="' + pid + '"]');
      if (zone) {
        zone.querySelectorAll('.card-slot').forEach(function (slot) {
          if (typeof getSlotState === 'function') p.slots.push(cloneValue(getSlotState(slot), 0));
        });
      }
    } catch (e) { console.error('[Undo] 读取 ' + pid + ' 状态失败:', e); }
    return p;
  }

  /* 商店：按「发出格式」存档（与 syncShopToPeer 一致） */
  function snapshotShop(pid) {
    try {
      if (typeof getShop !== 'function') return null;
      var shop = getShop(pid);
      if (!shop) return null;
      var stocks = {};
      if (typeof playerCardStocks !== 'undefined' && playerCardStocks && playerCardStocks[pid]) {
        for (var name in playerCardStocks[pid]) {
          var s = playerCardStocks[pid][name];
          stocks[name] = (s === Infinity) ? -1 : s;
        }
      }
      return {
        level: shop.level || 1,
        upgradeProgress: shop.upgradeProgress || 0,
        upgradeNeeded: shop.upgradeNeeded || 5,
        refreshCost: shop.refreshCost || 1,
        slotCount: shop.slotCount,
        refreshPriority: (shop.refreshPriority || []).slice(),
        products: (shop.products || []).map(function (pd) {
          return {
            name: pd.cardDef ? pd.cardDef.name : pd.name,
            stock: (pd.stock === Infinity) ? -1 : pd.stock,
            price: pd.price,
            bought: pd.bought,
          };
        }),
        cardStocks: stocks,
        customDefs: (typeof customShopDefs !== 'undefined' && customShopDefs[pid]) ? cloneValue(customShopDefs[pid], 0) : {},
      };
    } catch (e) { console.error('[Undo] 读取商店失败:', e); return null; }
  }

  function buildSnapshot() {
    var snap = { players: {}, graveTargets: {} };
    ['1', '2'].forEach(function (pid) { snap.players[pid] = snapshotPlayer(pid); });
    try {
      if (typeof window.getGraveTargetsState === 'function') snap.graveTargets = cloneValue(window.getGraveTargetsState(), 0) || {};
    } catch (e) { snap.graveTargets = {}; }
    return snap;
  }

  // ================================================================
  //  还原（本地）
  // ================================================================
  function restorePlayer(pid, p) {
    if (!p) return;
    var zone = document.querySelector('.player-zone[data-player="' + pid + '"]');
    try {
      if (zone && Array.isArray(p.slots) && typeof setSlotState === 'function') {
        var slots = zone.querySelectorAll('.card-slot');
        for (var i = 0; i < slots.length; i++) {
          if (p.slots[i]) setSlotState(slots[i], cloneValue(p.slots[i], 0));
        }
      }
      if (typeof getPlayerCardState === 'function') {
        var c = getPlayerCardState(pid);
        if (c) {
          c.deck = cloneValue(p.deck, 0);
          c.hand = cloneValue(p.hand, 0);
          c.grave = cloneValue(p.grave, 0);
        }
      }
      if (typeof applyRemotePlayerInfo === 'function') applyRemotePlayerInfo(pid, p.name || '', p.hp || '');
      if (p.avatar && typeof setAvatarImage === 'function') setAvatarImage(pid, p.avatar);
      if (typeof applyRemoteEffectsState === 'function') applyRemoteEffectsState(pid, cloneValue(p.effects, 0));
      if (typeof playerFire !== 'undefined' && typeof applyRemoteFireState === 'function') applyRemoteFireState(pid, p.fire | 0);
      if (typeof playerRevealedCards !== 'undefined') playerRevealedCards[pid] = new Set(p.revealed || []);
      if (typeof playerFateRevealedCards !== 'undefined') playerFateRevealedCards[pid] = new Set(p.fateRevealed || []);
      if (typeof playerHandShows !== 'undefined') playerHandShows[pid] = new Set(p.handShows || []);
      if (typeof playerBounty !== 'undefined') playerBounty[pid] = p.bounty || 0;
      if (typeof applyRemoteBounty === 'function') applyRemoteBounty(pid, p.bounty || 0);
      if (typeof applyRemoteBountyToggle === 'function') applyRemoteBountyToggle(pid, !!p.bountyActive);
      if (typeof applyRemoteNightfall === 'function') applyRemoteNightfall(pid, !!p.nightfallActive, p.nightfallValue || '0');
      if (typeof oracleActive !== 'undefined') oracleActive[pid] = !!p.oracleActive;
      if (typeof oracleHands !== 'undefined') oracleHands[pid] = cloneValue(p.oracleHands, 0) || [];
      if (typeof applyRemoteOracle === 'function') {
        applyRemoteOracle({ playerId: pid, active: !!p.oracleActive, cards: cloneValue(p.oracleHands, 0) || [] });
      }
      if (typeof applyRemoteShop === 'function' && p.shop) {
        applyRemoteShop(Object.assign({ playerId: pid }, cloneValue(p.shop, 0)));
      }
      if (typeof updateDeckButtons === 'function') updateDeckButtons(pid);
    } catch (e) { console.error('[Undo] 还原 ' + pid + ' 失败:', e); }
  }

  function applySnapshot(snap) {
    if (!snap) return;
    suppress();
    if (typeof slotSyncSuppress !== 'undefined') slotSyncSuppress = true;
    try {
      ['1', '2'].forEach(function (pid) { restorePlayer(pid, snap.players[pid]); });
      if (typeof window.applyGraveTargets === 'function') window.applyGraveTargets(cloneValue(snap.graveTargets, 0) || {});
      if (typeof updateCardIdCounter === 'function') updateCardIdCounter();
      if (typeof updateAllDeckButtons === 'function') updateAllDeckButtons();
    } catch (e) {
      console.error('[Undo] 还原整桌失败:', e);
    } finally {
      if (typeof slotSyncSuppress !== 'undefined') slotSyncSuppress = false;
      unsuppress();
    }
  }

  // ================================================================
  //  打点
  // ================================================================
  function schedule() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(flush, DEBOUNCE_MS);
  }

  /* ② 同步信号打点：任何要同步出去的改动 = 桌子变了 */
  function noteSync() {
    if (isSuppressed() || isSpectatorNow()) return;
    if (!history.length) return;                 // 还没建立基线
    dirty = true;
    schedule();
  }

  /* ① 消息打点：登记人话描述（title）与明细（items） */
  function noteMessage(title, subs) {
    if (isSuppressed()) return;
    var t = String(title || '').replace(/^【系统】\s*/, '');
    if (!t) return;
    // 撤销/重做自己的播报不算「操作描述」（否则撤销提示会套娃）
    if (/(撤销了上一步操作|重做了操作)/.test(t)) return;
    if (!pendingTitle) pendingTitle = t;
    if (Array.isArray(subs) && subs.length) {
      subs.forEach(function (s) {
        var x = String(s || '').replace(/^【系统】\s*/, '');
        if (x) pendingItems.push(x);
      });
    }
    pendingAt = Date.now();
    if (!dirty) { dirty = true; schedule(); }
  }

  /* ③ 接收端记账：对方的状态类 op 也算一步 */
  function notePeerOp(type) {
    if (isSuppressed() || isSpectatorNow()) return;
    if (!history.length) return;
    if (!STATE_OP_TYPES[type]) return;
    dirty = true;
    schedule();
  }

  /* 对方撤销/重做广播过来的改动：只对齐指纹，不记步（否则会多出「手动调整」幻影步骤） */
  function ackRemoteChange() {
    if (!history.length) return;
    try { lastSnap = buildSnapshot(); } catch (e) { /* ignore */ }
  }

  /* 两份状态的差异 → 人话列表（用于没说改什么的步骤） */
  function describeDiff(prev, next) {
    var out = [];
    if (!prev || !next || !prev.players || !next.players) return out;
    function pname(pid) {
      var b = next.players[pid] || {};
      return b.name || ('玩家' + pid);
    }
    function cnt(x) { return (x || []).length; }
    function val(x) { return (x === undefined || x === null || x === '') ? '空' : String(x); }
    ['1', '2'].forEach(function (pid) {
      var a = prev.players[pid] || {}, b = next.players[pid] || {};
      // ---- 卡牌槽 ----
      var n = Math.max(cnt(a.slots), cnt(b.slots));
      for (var i = 0; i < n; i++) {
        var sa = (a.slots || [])[i], sb = (b.slots || [])[i];
        if (!sa || !sb || deepEqual(sa, sb, ['imageSrc'])) continue;
        var cn = (sb.name || sa.name || ('第' + (i + 1) + '格'));
        var hit = 0;
        if (String(sa.name || '') !== String(sb.name || '')) { out.push('「' + cn + '」→ 「' + val(sb.name) + '」'); hit++; }
        if (String(sa.attack) !== String(sb.attack)) { out.push('「' + cn + '」攻击 ' + val(sa.attack) + ' → ' + val(sb.attack)); hit++; }
        if (String(sa.hp) !== String(sb.hp)) { out.push('「' + cn + '」生命 ' + val(sa.hp) + ' → ' + val(sb.hp)); hit++; }
        if (String(sa.level) !== String(sb.level)) { out.push('「' + cn + '」等级 ' + val(sa.level) + ' → ' + val(sb.level)); hit++; }
        if (String(sa.countdown) !== String(sb.countdown)) { out.push('「' + cn + '」倒计时 ' + val(sa.countdown) + ' → ' + val(sb.countdown)); hit++; }
        if (String(sa.energy) !== String(sb.energy)) { out.push('「' + cn + '」能量 ' + val(sa.energy) + ' → ' + val(sb.energy)); hit++; }
        if (String(sa.ko) !== String(sb.ko) || String(sa.koCountdown) !== String(sb.koCountdown)) { out.push('「' + cn + '」气绝状态变化'); hit++; }
        if (!deepEqual(sa.curses, sb.curses)) { out.push('「' + cn + '」灵咒变化'); hit++; }
        if (!!sa.awakened !== !!sb.awakened) { out.push('「' + cn + '」觉醒 ' + (sb.awakened ? '开启' : '关闭')); hit++; }
        if (String(sa.formName || '') !== String(sb.formName || '')) { out.push('「' + cn + '」形态「' + val(sb.formName) + '」'); hit++; }
        if (cnt(sa.chargedCards) !== cnt(sb.chargedCards)) { out.push('「' + cn + '」蓄力 ' + cnt(sa.chargedCards) + ' → ' + cnt(sb.chargedCards)); hit++; }
        if (!hit) out.push('「' + cn + '」其它属性调整');
      }
      // ---- 牌库 / 手牌 / 坟场 ----
      if (cnt(a.deck) !== cnt(b.deck)) out.push(pname(pid) + ' 牌库 ' + cnt(a.deck) + ' → ' + cnt(b.deck));
      if (cnt(a.hand) !== cnt(b.hand)) out.push(pname(pid) + ' 手牌 ' + cnt(a.hand) + ' → ' + cnt(b.hand));
      if (cnt(a.grave) !== cnt(b.grave)) out.push(pname(pid) + ' 坟场 ' + cnt(a.grave) + ' → ' + cnt(b.grave));
      // ---- 玩家 / 其它 ----
      if (String(a.name || '') !== String(b.name || '')) out.push('玩家名 ' + val(a.name) + ' → ' + val(b.name));
      if (String(a.hp) !== String(b.hp)) out.push(pname(pid) + ' 生命 ' + val(a.hp) + ' → ' + val(b.hp));
      if ((a.fire | 0) !== (b.fire | 0)) out.push(pname(pid) + ' 鬼火 ' + (a.fire | 0) + ' → ' + (b.fire | 0));
      if (!deepEqual(a.effects, b.effects)) out.push(pname(pid) + ' 幻境/效果调整');
      if (!eqArr(a.revealed, b.revealed)) out.push(pname(pid) + ' 占卜标记 ' + cnt(a.revealed) + ' → ' + cnt(b.revealed));
      if (!eqArr(a.handShows, b.handShows)) out.push(pname(pid) + ' 手牌展示 ' + cnt(a.handShows) + ' → ' + cnt(b.handShows));
      if ((a.bounty | 0) !== (b.bounty | 0)) out.push(pname(pid) + ' 赏金 ' + (a.bounty | 0) + ' → ' + (b.bounty | 0));
      if (!!a.bountyActive !== !!b.bountyActive) out.push(pname(pid) + (b.bountyActive ? ' 开启赏金' : ' 关闭赏金'));
      if (!!a.nightfallActive !== !!b.nightfallActive) out.push(pname(pid) + (b.nightfallActive ? ' 开启入夜' : ' 关闭入夜'));
      else if (String(a.nightfallValue) !== String(b.nightfallValue)) out.push(pname(pid) + ' 入夜数值 ' + val(a.nightfallValue) + ' → ' + val(b.nightfallValue));
      if (!!a.oracleActive !== !!b.oracleActive) out.push(pname(pid) + (b.oracleActive ? ' 开启启悟' : ' 关闭启悟'));
      if (!deepEqual(a.oracleHands, b.oracleHands)) out.push(pname(pid) + ' 启悟区调整');
      if (!deepEqual(a.shop, b.shop)) out.push(pname(pid) + ' 商店状态调整');
    });
    var ga = prev.graveTargets || {}, gb = next.graveTargets || {};
    ['1', '2'].forEach(function (pid) {
      if (!!ga[pid] !== !!gb[pid]) out.push((next.players[pid] && next.players[pid].name || ('玩家' + pid)) + (gb[pid] ? ' 打开坟场入口' : ' 关闭坟场入口'));
    });
    return out;
  }

  function flush() {
    debounceTimer = null;
    if (!dirty) return;
    dirty = false;
    var title = null, items = [];
    if (pendingTitle && (Date.now() - pendingAt) <= DESC_TTL_MS) {
      title = pendingTitle;
      items = pendingItems.slice();
    }
    pendingTitle = null; pendingItems = [];
    var snap = buildSnapshot();
    if (!title) {
      // 没有消息的改动：用两份状态的差异说清「改了什么」
      var changed = describeDiff(lastSnap, snap);
      if (changed.length) {
        title = changed[0] + (changed.length > 1 ? ' 等 ' + changed.length + ' 处调整' : '');
        items = changed;
      } else {
        title = '手动调整';
      }
    }
    push({ snap: snap, title: title, items: items });
  }

  function flushNow() {
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
    if (dirty) flush();
  }

  function push(step) {
    if (pointer < history.length - 1) history = history.slice(0, pointer + 1);
    history.push(step);
    while (history.length > MAX_STEPS + 1) history.shift();
    pointer = history.length - 1;
    lastFlushAt = Date.now();
    lastSnap = step.snap;
    updateMenu();
    if (menuTimer) clearTimeout(menuTimer);
    menuTimer = setTimeout(updateMenu, DEBOUNCE_MS + 30);
  }

  // ================================================================
  //  差异比对 + 补发
  // ================================================================
  function pushDiff(from, to, tx) {
    var count = 0;
    if (!from || !to) return 0;
    var mark = { undo: true, undoDesc: tx };

    function send(op) { count++; Object.assign(op, mark); sendToPeer(op); }

    ['1', '2'].forEach(function (pid) {
      var a = from.players[pid] || {}, b = to.players[pid] || {};

      // 卡牌槽（卡图不参与比较；只有当图确实不同才带上图）
      var n = Math.max((a.slots || []).length, (b.slots || []).length);
      for (var i = 0; i < n; i++) {
        var sa = (a.slots || [])[i], sb = (b.slots || [])[i];
        if (!sa || !sb) continue;
        if (deepEqual(sa, sb, ['imageSrc'])) continue;
        var live = null;
        var slot = document.querySelector('.player-zone[data-player="' + pid + '"] .card-slot[data-slot-index="' + i + '"]');
        if (slot && typeof getSlotState === 'function') live = getSlotState(slot);
        var payload = live || cloneValue(sb, 0);
        if (payload && sa.imageSrc === sb.imageSrc) delete payload.imageSrc;
        send({ type: 'slot-update', playerId: pid, slotIndex: i, state: payload });
      }

      // 牌库 / 手牌 / 坟场
      if (!deepEqual(a.deck, b.deck) || !deepEqual(a.hand, b.hand) || !deepEqual(a.grave, b.grave)) {
        send({ type: 'deck-update', playerId: pid, deckCount: (b.deck || []).length, handCount: (b.hand || []).length,
               deckData: cloneValue(b.deck, 0), handData: cloneValue(b.hand, 0), graveData: cloneValue(b.grave, 0) });
      }

      // 玩家信息 / 头像 / 鬼火
      if (a.name !== b.name || String(a.hp) !== String(b.hp)) {
        send({ type: 'player-info', playerId: pid, name: b.name || '', hp: b.hp == null ? '' : String(b.hp) });
      }
      if (a.avatar !== b.avatar && b.avatar) send({ type: 'avatar-update', playerId: pid, imageSrc: b.avatar });
      if ((a.fire | 0) !== (b.fire | 0)) send({ type: 'fire-update', playerId: pid, count: b.fire | 0 });

      // 幻境 / 效果
      if (!deepEqual(a.effects, b.effects)) send({ type: 'effects-update', playerId: pid, effects: cloneValue(b.effects, 0) });

      // 揭示 / 命运揭示 / 手牌展示
      if (!eqArr(a.revealed, b.revealed)) send({ type: 'revealed-cards', playerId: pid, cardIds: (b.revealed || []).slice() });
      if (!eqArr(a.fateRevealed, b.fateRevealed)) send({ type: 'fate-revealed-cards', playerId: pid, cardIds: (b.fateRevealed || []).slice() });
      if (!eqArr(a.handShows, b.handShows)) send({ type: 'hand-shown', playerId: pid, cardIds: (b.handShows || []).slice() });

      // 赏金 / 入夜
      if ((a.bounty | 0) !== (b.bounty | 0)) send({ type: 'bounty-update', playerId: pid, amount: b.bounty | 0 });
      if (!!a.bountyActive !== !!b.bountyActive) send({ type: 'bounty-toggle', playerId: pid, active: !!b.bountyActive });
      if (!!a.nightfallActive !== !!b.nightfallActive || String(a.nightfallValue) !== String(b.nightfallValue)) {
        send({ type: 'nightfall-toggle', playerId: pid, active: !!b.nightfallActive, value: b.nightfallValue || '0' });
      }

      // 启悟
      if (!!a.oracleActive !== !!b.oracleActive || !deepEqual(a.oracleHands, b.oracleHands)) {
        send({ type: 'oracle-update', playerId: pid, active: !!b.oracleActive, cards: cloneValue(b.oracleHands, 0) || [] });
      }

      // 商店
      if (!deepEqual(a.shop, b.shop)) {
        var sp = cloneValue(b.shop, 0);
        if (sp) send(Object.assign({ type: 'shop-update', playerId: pid }, sp));
      }
    });

    // 坟场入口开关
    var ga = from.graveTargets || {}, gb = to.graveTargets || {};
    ['1', '2'].forEach(function (pid) {
      if (!!ga[pid] !== !!gb[pid]) send({ type: 'grave-target', playerId: pid, enabled: !!gb[pid] });
    });

    return count;
  }

  // ================================================================
  //  撤销 / 重做
  // ================================================================
  function canUse() { return !isSpectatorNow(); }

  function blocked() {
    if (Date.now() - lastFlushAt < DEBOUNCE_MS) return true;
    if (Date.now() - lastClickAt < THROTTLE_MS) return true;
    return false;
  }

  function announce(kind, step) {
    var who = '玩家';
    try {
      if (typeof getPlayerName === 'function' && typeof localPlayerId !== 'undefined' && localPlayerId) who = getPlayerName(localPlayerId);
    } catch (e) { /* ignore */ }
    var label = (kind === 'undo') ? '撤销了上一步操作' : '重做了操作';
    var main = '【系统】' + who + ' ' + label + '（' + (step.title || '手动调整') + '）';
    suppress();
    try {
      if (typeof startMessageGroup === 'function') startMessageGroup(main, null);
      if (step.items && step.items.length && typeof broadcastSystemMsg === 'function') {
        step.items.forEach(function (t) { broadcastSystemMsg('【系统】' + t); });
      }
      if (typeof endMessageGroup === 'function') endMessageGroup();
    } catch (e) { console.error('[Undo] 广播提示失败:', e); }
    unsuppress();
    try {
      if (typeof showActionToast === 'function') showActionToast(kind === 'undo' ? '已撤销' : '已重做', step.title || '手动调整');
    } catch (e2) { /* ignore */ }
  }

  function failNotice(reason) {
    suppress();
    try {
      if (typeof broadcastSystemMsg === 'function') {
        broadcastSystemMsg('【系统】撤销失败：服务端拒绝了更新（' + (reason || '未知原因') + '），已保持在撤销前的状态');
      }
    } catch (e) { /* ignore */ }
    unsuppress();
  }

  function run() {
    if (!canUse() || isSuppressed()) return;
    if (blocked()) return;
    flushNow();
    if (pointer <= 0) { toastNoop('没有可撤销的操作'); return; }

    lastClickAt = Date.now();
    lastErrorMsg = null;
    var from = buildSnapshot();
    var labelStep = history[pointer];    // 被撤销的那一步（播报用它的标题与明细）
    pointer--;
    var target = history[pointer];

    var sent = 0;
    suppress();                       // 还原与补发期间静音打点（避免把自己记成新步骤）
    try {
      applySnapshot(target.snap);
      lastSnap = buildSnapshot();
      lastFlushAt = Date.now();
      updateMenu();
      if (menuTimer) clearTimeout(menuTimer);
      menuTimer = setTimeout(updateMenu, DEBOUNCE_MS + 30);
      sent = pushDiff(from, target.snap, 'undo:' + lastClickAt);
    } finally {
      unsuppress();
    }
    announce('undo', labelStep || {});

    if (sent > 0 && typeof sendToPeer === 'function') {
      if (failTimer) clearTimeout(failTimer);
      failTimer = setTimeout(function () {
        if (!lastErrorMsg) return;
        var reason = lastErrorMsg;
        lastErrorMsg = null;
        // 回滚：把指针与本地状态都退回操作前
        pointer++;
        applySnapshot(from);
        lastSnap = buildSnapshot();
        updateMenu();
        failNotice(reason);
      }, FAIL_WINDOW_MS);
    }
  }

  function toastNoop(msg) {
    try { if (typeof showActionToast === 'function') showActionToast(msg, ''); } catch (e) { /* ignore */ }
  }

  /* 服务端拒绝（由 auth.js 的 error-msg 转过来） */
  function noteServerError(msg) {
    lastErrorMsg = String(msg || '未知原因');
  }

  // ================================================================
  //  菜单 / 快捷键 / 重置
  // ================================================================
  function el(id) { return document.getElementById(id); }

  var tickTimer = null;

  function updateMenu() {
    var bu = el('btn-undo');
    var ready = Math.max(0, DEBOUNCE_MS - (Date.now() - lastFlushAt));
    var cool = Math.max(0, THROTTLE_MS - (Date.now() - lastClickAt));
    var wait = Math.max(ready, cool);
    var hasStep = pointer > 0;
    var usable = canUse() && hasStep;          // 有步可撤（但可能还在等窗口）
    var canU = usable && wait <= 0;
    if (bu) {
      bu.disabled = !canU;
      bu.title = canU
        ? ('撤销上一步：' + (history[pointer].title || '手动调整'))
        : (usable ? '请稍候…等这一步记录完成' : '没有可撤销的操作');
      // 置灰期间显示倒计时：撤销（0.2s）→ 可用时恢复：撤销（1.0版）
      var label = (usable && wait > 0) ? ('撤销（' + (wait / 1000).toFixed(1) + 's）') : '撤销（1.0版）';
      if (bu.dataset.undoLabel !== label) {
        bu.dataset.undoLabel = label;
        bu.innerHTML = '<span class="undo-icon">🔙</span> ' + label;
      }
    }
    if (tickTimer) { clearTimeout(tickTimer); tickTimer = null; }
    if (usable && wait > 0) tickTimer = setTimeout(updateMenu, 100);   // 倒计时每 100ms 刷新
  }

  function reset(reason) {
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
    dirty = false; pendingTitle = null; pendingItems = [];
    history = [{ snap: buildSnapshot(), title: '', items: [] }];
    pointer = 0;
    lastSnap = history[0].snap;
    lastFlushAt = 0;
    lastClickAt = 0;
    updateMenu();
    if (reason) console.log('[Undo] 历史已重置：' + reason);
  }

  /* 第三层：低频指纹兜底（回前台 / 每 5 秒） */
  function fingerprintChanged() {
    if (isSuppressed() || isSpectatorNow() || !history.length) return false;
    if (dirty) return false;
    var snap = buildSnapshot();
    var same = deepEqual(snap, lastSnap, ['imageSrc']);
    if (!same) { lastSnap = snap; return true; }
    return false;
  }

  function catchUp() {
    if (!fingerprintChanged()) return;
    dirty = true;                      // 描述由 flush 的差异说明负责
    flush();
  }

  // ================================================================
  //  初始化
  // ================================================================
  function init() {
    /* ② 包装 sendToPeer：任何要同步出去的改动都记一步 */
    if (typeof window.sendToPeer === 'function' && !window.sendToPeer.__undoWrapped) {
      var orig = window.sendToPeer;
      var wrapped = function (data) {
        try { if (data && data.type !== 'chat') noteSync(); } catch (e) { /* ignore */ }
        return orig.apply(this, arguments);
      };
      wrapped.__undoWrapped = true;
      window.sendToPeer = wrapped;
    }

    var bu = el('btn-undo');
    if (bu) bu.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); run(); });

    document.addEventListener('keydown', function (e) {
      if (!canUse() || isSuppressed()) return;
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      if ((e.key || '').toLowerCase() !== 'z') return;
      e.preventDefault();
      run();
    }, true);

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) catchUp();
    });
    setInterval(function () { if (!document.hidden) catchUp(); }, POLL_MS);

    reset('初始化');
    console.log('[Undo] 已加载：上限 ' + MAX_STEPS + ' 步，去抖/节流 ' + DEBOUNCE_MS + 'ms');
  }

  window.Undo = {
    init: init,
    reset: reset,
    noteSync: noteSync,
    noteMessage: noteMessage,
    notePeerOp: notePeerOp,
    noteServerError: noteServerError,
    suppress: suppress,
    unsuppress: unsuppress,
    ackRemoteChange: ackRemoteChange,
    undo: function () { run(); },
    /* 调试 */
    _debug: function () {
      return {
        steps: history.length, pointer: pointer, dirty: dirty,
        lastFlushAt: lastFlushAt, lastError: lastErrorMsg,
        titles: history.map(function (h) { return h.title || '(基线)'; }),
      };
    },
    _flushNow: flushNow,
    _snapshot: buildSnapshot,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
