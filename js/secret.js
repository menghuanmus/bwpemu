// ================================================================
//  js/secret.js — 秘密选择（🔒）
//  写一条只有自己看得见的笔记，挂在一个式神或牌手身上。
//  · 对手 / 观众只知道「他封了一份秘密」，既看不到内容，也看不到点了谁
//  · 自己可以随时「展示给所有人」（内容进系统消息）或「丢弃」
//  依赖: chat.js(broadcastSystemMsg / addSystemChatMessage)、network.js(sendToPeer)
//  导出: window.Secret
// ================================================================
window.Secret = (function () {
  'use strict';

  var MAX_TEXT = 100;
  var ICON = '🔒';

  var items = [];          // 自己的秘密：[{id, target:{player,slot,isPlayer,name}, text, at}]
  var remoteCount = {};    // 对方（或观众看到的人）各有几份：{ '1': 2, '2': 0 }
  var seq = 0;

  // ================================================================
  //  基础工具
  // ================================================================
  function esc(s) {
    var d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
  }

  function myId() {
    return (typeof localPlayerId !== 'undefined' && localPlayerId) ? String(localPlayerId) : '1';
  }

  function isSpectatorNow() {
    return (typeof isSpectator !== 'undefined' && isSpectator);
  }

  function playerName(pid) {
    if (typeof getPlayerName === 'function') return getPlayerName(pid);
    return pid === '1' ? '玩家一' : '玩家二';
  }

  function currentRoomTag() {
    if (typeof lastRoomCode !== 'undefined' && lastRoomCode) return String(lastRoomCode);
    if (typeof isSoloMode !== 'undefined' && isSoloMode) return 'solo';
    return 'local';
  }

  function accountName() {
    if (typeof window._gameUsername !== 'undefined' && window._gameUsername) return window._gameUsername;
    if (typeof window._gameNickname !== 'undefined' && window._gameNickname) return window._gameNickname;
    return 'anon';
  }

  function storeKey() { return 'bwpemu_secret_' + currentRoomTag() + '_' + accountName(); }

  function genId() {
    seq += 1;
    return 'sk_' + Date.now().toString(36) + '_' + seq;
  }

  // ================================================================
  //  本地存储
  // ================================================================
  function load() {
    items = [];
    try {
      var raw = localStorage.getItem(storeKey());
      if (!raw) return;
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return;
      items = arr.filter(function (it) {
        return it && it.id && it.target && typeof it.text === 'string';
      }).map(function (it) {
        return {
          id: String(it.id),
          target: {
            player: String((it.target && it.target.player) || myId()),
            slot: (it.target && it.target.slot != null) ? Number(it.target.slot) : -1,
            isPlayer: !!(it.target && it.target.isPlayer),
            name: String((it.target && it.target.name) || '')
          },
          text: String(it.text).slice(0, MAX_TEXT),
          at: Number(it.at) || Date.now()
        };
      });
    } catch (e) { items = []; }
  }

  function save() {
    try {
      if (!items.length) localStorage.removeItem(storeKey());
      else localStorage.setItem(storeKey(), JSON.stringify(items));
    } catch (e) { /* 存储满/隐私模式：忽略 */ }
  }

  // ================================================================
  //  同步（内容发给服务端保存，服务端只向对手/观众广播数量）
  // ================================================================
  function pushState() {
    if (typeof sendToPeer !== 'function') return;
    try {
      sendToPeer({ type: 'secret-state', playerId: myId(), items: items });
    } catch (e) { /* 未联机忽略 */ }
  }

  /** 规范化一条（本地存储与服务端下发共用） */
  function normItem(it) {
    return {
      id: String(it.id),
      target: {
        player: String((it.target && it.target.player) || ''),
        slot: (it.target && it.target.slot != null) ? Number(it.target.slot) : -1,
        isPlayer: !!(it.target && it.target.isPlayer),
        name: String((it.target && it.target.name) || '')
      },
      text: String(it.text || '').slice(0, MAX_TEXT),
      at: Number(it.at) || Date.now()
    };
  }

  /** 从房间状态恢复自己的完整数据（重连/刷新/换设备） */
  function setItems(arr) {
    if (!Array.isArray(arr)) return;
    items = arr.filter(function (it) { return it && it.id; }).map(normItem);
    save();
    renderAll();
  }

  /** 别人的秘密只剩数量 */
  function setRemoteCount(pid, n) {
    remoteCount[String(pid)] = Math.max(0, Number(n) || 0);
    renderOne(String(pid));
  }

  /** 收到别人的秘密状态（只知道有几份；兼容旧的 ids 数组） */
  function applyState(owner, countOrIds) {
    if (!owner) return;
    var pid = String(owner);
    if (pid === myId()) return;      // 自己的以本地为准
    var n = Array.isArray(countOrIds) ? countOrIds.length : (Number(countOrIds) || 0);
    remoteCount[pid] = Math.max(0, n);
    renderOne(pid);
  }

  /** 收到「已展示」通知：对面那份要消失（服务端给了精确数量就直接对齐） */
  function applyReveal(owner, count) {
    if (!owner) return;
    var pid = String(owner);
    if (pid === myId()) return;
    if (count != null && !isNaN(Number(count))) remoteCount[pid] = Math.max(0, Number(count));
    else remoteCount[pid] = Math.max(0, (remoteCount[pid] || 0) - 1);
    renderOne(pid);
  }

  // ================================================================
  //  渲染：每个玩家的「幻境/效果」面板里一个置顶入口（数量 0 时隐藏）
  // ================================================================
  function ensurePin(playerId) {
    var zone = document.querySelector('.player-zone[data-player="' + playerId + '"]');
    if (!zone) return null;
    var panel = zone.querySelector('.effects-panel');
    if (!panel) return null;
    var pin = panel.querySelector('.secret-pin');
    if (pin) return pin;
    pin = document.createElement('button');
    pin.type = 'button';
    pin.className = 'secret-pin';
    pin.dataset.secretPin = playerId;
    pin.innerHTML =
      '<span class="secret-pin__ico">' + ICON + '</span>' +
      '<span class="secret-pin__label">秘密选择</span>' +
      '<span class="secret-pin__num">0</span>' +
      '<span class="secret-pin__go">›</span>';
    pin.addEventListener('click', function (e) {
      e.stopPropagation();
      e.preventDefault();
      if (String(playerId) === String(myId())) openList();
      else showToast('对方封存了秘密选择，内容保密');
    });
    // 置顶：插在面板最前面（幻境条目之上）
    panel.insertBefore(pin, panel.firstChild);
    return pin;
  }

  function renderOne(playerId) {
    var pin = ensurePin(playerId);
    if (!pin) return;
    var mine = String(playerId) === String(myId());
    var count = mine ? items.length : (remoteCount[playerId] || 0);
    pin.hidden = count <= 0;
    pin.classList.toggle('secret-pin--other', !mine);
    pin.querySelector('.secret-pin__num').textContent = String(count);
    pin.title = mine ? '点击查看 / 展示 / 丢弃你的秘密选择' : '对方封存了秘密选择，内容保密';
    if (overlay && overlay.dataset.secretList === '1' && mine) refreshList();
  }

  function renderAll() {
    ['1', '2'].forEach(renderOne);
  }

  // ================================================================
  //  小提示（轻量 toast）
  // ================================================================
  var toastEl = null;
  var toastTimer = null;
  function showToast(text) {
    if (typeof showActionToast === 'function') { showActionToast(text); return; }
    if (toastEl) toastEl.remove();
    toastEl = document.createElement('div');
    toastEl.className = 'secret-toast';
    toastEl.textContent = text;
    document.body.appendChild(toastEl);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { if (toastEl) { toastEl.remove(); toastEl = null; } }, 2000);
  }

  // ================================================================
  //  创建弹窗
  // ================================================================
  var overlay = null;

  function closeDialog() {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
    document.removeEventListener('keydown', onEsc, true);
  }

  function onEsc(e) {
    if (e.key === 'Escape') closeDialog();
  }

  /** 收集可选目标：双方牌手 + 双方有名字的式神 */
  function collectTargets() {
    var list = [];
    var me = myId();
    ['1', '2'].forEach(function (pid) {
      var zone = document.querySelector('.player-zone[data-player="' + pid + '"]');
      var mine = String(pid) === String(me);
      list.push({
        group: mine ? 'own' : 'opp',
        player: pid,
        slot: -1,
        isPlayer: true,
        name: playerName(pid) || (pid === '1' ? '玩家一' : '玩家二')
      });
      if (!zone) return;
      Array.prototype.forEach.call(zone.querySelectorAll('.card-slot'), function (slot) {
        if (slot.dataset.slotType === 'summon') return;
        var nameEl = slot.querySelector('.card-name');
        var nm = (nameEl && nameEl.value ? nameEl.value : '').trim();
        if (!nm && !slot.classList.contains('has-image')) return;
        list.push({
          group: mine ? 'own' : 'opp',
          player: pid,
          slot: Number(slot.dataset.slotIndex),
          isPlayer: false,
          name: nm || '未命名式神'
        });
      });
    });
    return list;
  }

  function openCreate(opts) {
    opts = opts || {};
    if (isSpectatorNow()) { showToast('观众不能进行秘密选择'); return; }
    closeDialog();
    var targets = collectTargets();
    var selected = opts.preselect || null;

    overlay = document.createElement('div');
    overlay.className = 'secret-overlay';
    overlay.innerHTML =
      '<div class="secret-modal">' +
        '<div class="secret-head">' +
          '<span class="secret-title">' + ICON + ' 秘密选择</span>' +
          '<button type="button" class="secret-close" data-secret-close title="关闭">✕</button>' +
        '</div>' +
        '<div class="secret-body">' +
          '<div class="secret-label">选择对象<span class="secret-label__opt">可不选</span></div>' +
          '<div class="secret-targets" data-secret-targets></div>' +
          '<div class="secret-label">秘密内容（≤' + MAX_TEXT + ' 字）<span class="secret-count" data-secret-count>0/' + MAX_TEXT + '</span></div>' +
          '<textarea class="secret-text" data-secret-text maxlength="' + MAX_TEXT + '" rows="4" placeholder="写下你的秘密…"></textarea>' +
          '<div class="secret-hint">保存在幻境/效果区置顶，仅你可点开查看。</div>' +
          '<div class="secret-err" data-secret-err></div>' +
        '</div>' +
        '<div class="secret-foot">' +
          '<button type="button" class="secret-btn secret-btn--go" data-secret-save>' + ICON + ' 选择完成</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    document.addEventListener('keydown', onEsc, true);

    // 目标按钮（再次点击可以取消选中 → 代表“不选目标”）
    var wrap = overlay.querySelector('[data-secret-targets]');
    var own = targets.filter(function (t) { return t.group === 'own'; });
    var opp = targets.filter(function (t) { return t.group === 'opp'; });
    function addRow(title, arr) {
      if (!arr.length) return;
      var row = document.createElement('div');
      row.className = 'secret-target-row';
      var lab = document.createElement('span');
      lab.className = 'secret-target-row__label';
      lab.textContent = title;
      row.appendChild(lab);
      arr.forEach(function (t) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'secret-target';
        b.textContent = t.name;
        b.dataset.player = t.player;
        b.dataset.slot = String(t.slot);
        if (selected && selected.player === t.player && Number(selected.slot) === Number(t.slot)) b.classList.add('is-on');
        b.addEventListener('click', function () {
          if (b.classList.contains('is-on')) {
            b.classList.remove('is-on');
            selected = null;
            return;
          }
          wrap.querySelectorAll('.secret-target').forEach(function (x) { x.classList.remove('is-on'); });
          b.classList.add('is-on');
          selected = t;
        });
        row.appendChild(b);
      });
      wrap.appendChild(row);
    }
    addRow('己方', own);
    addRow('对方', opp);
    if (!own.length && !opp.length) {
      wrap.innerHTML = '<div class="secret-empty">场上还没有可以选择的式神，先放几个式神或直接选牌手（也可以不选）。</div>';
    }

    var ta = overlay.querySelector('[data-secret-text]');
    var cnt = overlay.querySelector('[data-secret-count]');
    var errEl = overlay.querySelector('[data-secret-err]');
    ta.addEventListener('input', function () {
      cnt.textContent = String(ta.value.length) + '/' + MAX_TEXT;
      errEl.textContent = '';
    });
    setTimeout(function () { ta.focus(); }, 30);

    overlay.addEventListener('click', function (e) {
      if (e.target.closest('[data-secret-close]')) { closeDialog(); return; }
      if (e.target.closest('[data-secret-save]')) {
        var text = String(ta.value || '').trim();
        // 内容不是必填，可以为空
        addItem(selected, text);
        closeDialog();
        // 锁飞向幻境区的置顶（提醒玩家已经选好了）
        flyLockToPin();
        // 从列表里进来的 → 完成后回到列表
        if (opts.backToList) openList();
      }
    });
  }

  // ================================================================
  //  增删
  // ================================================================
  function addItem(target, text) {
    var t = target || { player: '', slot: -1, isPlayer: false, name: '' };
    var it = {
      id: genId(),
      target: {
        player: String(t.player || ''),
        slot: Number(t.slot == null ? -1 : t.slot),
        isPlayer: !!t.isPlayer,
        name: String(t.name || '')
      },
      text: String(text).slice(0, MAX_TEXT),
      at: Date.now()
    };
    items.push(it);
    save();
    renderAll();
    pushState();
    // 广播（不含内容、不含目标）
    if (typeof broadcastSystemMsg === 'function') {
      broadcastSystemMsg('【系统】' + playerName(myId()) + ' 进行了一次秘密选择');
    }
    return it;
  }

  function removeItem(id) {
    var idx = -1;
    for (var i = 0; i < items.length; i++) { if (items[i].id === id) { idx = i; break; } }
    if (idx < 0) return null;
    var it = items.splice(idx, 1)[0];
    save();
    renderAll();
    pushState();
    return it;
  }

  function findItem(id) {
    for (var i = 0; i < items.length; i++) { if (items[i].id === id) return items[i]; }
    return null;
  }

  // ================================================================
  //  列表弹窗（所有秘密集中在这里：展示 / 丢弃）
  // ================================================================
  function timeText(ts) {
    try {
      var d = new Date(ts);
      return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    } catch (e) { return ''; }
  }

  function openList() {
    if (isSpectatorNow()) { showToast('观众不能查看秘密选择'); return; }
    closeDialog();
    overlay = document.createElement('div');
    overlay.className = 'secret-overlay';
    overlay.dataset.secretList = '1';
    overlay.innerHTML =
      '<div class="secret-modal secret-modal--list">' +
        '<div class="secret-head">' +
          '<span class="secret-title">' + ICON + ' 秘密选择</span>' +
          '<span class="secret-head__count" data-secret-count-head></span>' +
          '<button type="button" class="secret-close" data-secret-close title="关闭">✕</button>' +
        '</div>' +
        '<div class="secret-body" data-secret-list></div>' +
        '<div class="secret-foot">' +
          '<button type="button" class="secret-btn secret-btn--new" data-secret-new>＋ 新建秘密</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    document.addEventListener('keydown', onEsc, true);
    refreshList();

    overlay.addEventListener('click', function (e) {
      if (e.target.closest('[data-secret-close]')) { closeDialog(); return; }
      if (e.target.closest('[data-secret-new]')) { closeDialog(); openCreate({ backToList: true }); return; }
      var rev = e.target.closest('[data-secret-reveal]');
      if (rev) {
        revealItem(rev.dataset.secretReveal);
        return;
      }
      var del = e.target.closest('[data-secret-discard]');
      if (del) {
        discardItem(del.dataset.secretDiscard);
      }
    });
  }

  /** 重画列表内容（展示/丢弃后不关窗，就地刷新） */
  function refreshList() {
    if (!overlay || overlay.dataset.secretList !== '1') return;
    var head = overlay.querySelector('[data-secret-count-head]');
    if (head) head.textContent = items.length ? items.length + ' 份未揭晓' : '暂无';
    var box = overlay.querySelector('[data-secret-list]');
    if (!box) return;
    if (!items.length) {
      box.innerHTML = '<div class="secret-empty">还没有秘密选择。<br>点下面「＋ 新建秘密」封一份只有你能看见的笔记。</div>';
      return;
    }
    box.innerHTML = items.map(function (it) {
      var tn = (it.target && it.target.name) ? it.target.name : '未选择目标';
      var none = (it.target && it.target.name) ? '' : ' is-none';
      return '<div class="secret-row">' +
        '<div class="secret-row__top">' +
          '<span class="secret-row__target' + none + '">' + ICON + ' ' + esc(tn) + '</span>' +
          '<span class="secret-row__time">' + esc(timeText(it.at)) + '</span>' +
        '</div>' +
        '<div class="secret-row__text' + (it.text ? '' : ' is-empty') + '">' + esc(it.text || '未填写效果') + '</div>' +
        '<div class="secret-row__acts">' +
          '<button type="button" class="secret-mini" data-secret-discard="' + esc(it.id) + '">🗑 丢弃</button>' +
          '<button type="button" class="secret-mini secret-mini--go" data-secret-reveal="' + esc(it.id) + '">👁 展示</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  /** 丢弃：移除 + 广播收回 */
  function discardItem(id) {
    var it = removeItem(id);
    if (!it) return;
    if (typeof broadcastSystemMsg === 'function') {
      broadcastSystemMsg('【系统】' + playerName(myId()) + ' 收回了一份秘密选择');
    }
  }

  /** 展示：内容进系统消息（所有人都能看到），然后移除 */
  function revealItem(id) {
    var it = findItem(id);
    if (!it) return;
    var targetName = (it.target && it.target.name) ? it.target.name : '未选择目标';
    var effectText = it.text || '未填写内容';
    removeItem(id);
    // 用户要求：点展示时关掉秘密选择列表弹窗，直接看展示动画
    closeDialog();
    // 系统消息：所有人可见（broadcastSystemMsg 会同步给对方/观众）
    // targetInfo 带上 player/slot/isPlayer，对方和观众也能播「锁飞向目标」
    if (typeof broadcastSystemMsg === 'function') {
      broadcastSystemMsg(
        '【系统】' + playerName(myId()) + ' 展示了秘密选择：目标-' + targetName + '，效果-' + effectText,
        null,
        { secret: true, secretInfo: { owner: playerName(myId()), target: targetName, text: it.text, targetInfo: it.target } }
      );
    }
    // 让对方把对应的灰锁去掉
    if (typeof sendToPeer === 'function') {
      try { sendToPeer({ type: 'secret-reveal', owner: myId(), id: id }); } catch (e) { /* 忽略 */ }
    }
  }

  // ================================================================
  //  动画 A：选择完成后，一把锁飞向幻境区的置顶（提醒「已经选好了」）
  //  手机端幻境面板是收起的，落到信息条那个 🏞 开关按钮上
  // ================================================================
  function _pinAnchor() {
    var zone = document.querySelector('.player-zone[data-player="' + myId() + '"]') ||
      document.querySelector('.player-zone[data-player="1"]');
    if (!zone) return null;
    var pin = zone.querySelector('.secret-pin');
    if (pin && pin.getClientRects().length && pin.getBoundingClientRect().width > 0) return pin;
    var realmBtn = zone.querySelector('.btn-mobile-realm');
    if (realmBtn && realmBtn.getClientRects().length) return realmBtn;
    return zone.querySelector('.player-id-area') || zone;
  }

  function flyLockToPin() {
    var anchor = _pinAnchor();
    if (!anchor) return;
    var r = anchor.getBoundingClientRect();
    var tx = r.left + r.width / 2;
    var ty = r.top + r.height / 2;
    var sx = window.innerWidth / 2;
    var sy = window.innerHeight / 2;

    var lock = document.createElement('div');
    lock.className = 'secret-fly';
    lock.textContent = ICON;
    lock.style.left = sx + 'px';
    lock.style.top = sy + 'px';
    document.body.appendChild(lock);

    // 强制一帧初始状态，再设终点让它过渡过去
    void lock.offsetWidth;
    lock.style.transform = 'translate(-50%,-50%) translate(' + (tx - sx) + 'px,' + (ty - sy) + 'px) scale(0.35)';
    lock.style.opacity = '0.1';

    setTimeout(function () {
      if (lock.parentNode) lock.remove();
      // 落点闪一下
      anchor.classList.add('secret-pin--ping');
      setTimeout(function () { anchor.classList.remove('secret-pin--ping'); }, 600);
    }, 640);
  }

  // ================================================================
  //  动画 B：展示秘密时，锁打开 → 弹一张卡 → 2 秒后消失
  //          有目标时，再飞一把解开的锁到该式神 / 牌手身上
  // ================================================================
  var revealTimer = null;
  var unlockTimer = null;

  /** 找目标的屏幕锚点：牌手 → 名字/头像区；式神 → 对应卡槽 */
  function _targetAnchor(t) {
    if (!t) return null;
    var pid = String(t.player || '');
    if (pid !== '1' && pid !== '2') return null;
    var zone = document.querySelector('.player-zone[data-player="' + pid + '"]');
    if (!zone) return null;
    if (t.isPlayer || Number(t.slot) < 0) {
      var idArea = zone.querySelector('.player-id-area') || zone.querySelector('.player-avatar');
      if (idArea && idArea.getClientRects().length) return idArea;
      return zone;
    }
    var slot = zone.querySelector('.card-slot[data-slot-index="' + Number(t.slot) + '"]');
    if (slot && slot.getClientRects().length) return slot;
    return zone;
  }

  /** 一把解开的锁从卡片飞到目标身上，然后消失（落点闪一下） */
  function flyUnlockToTarget(targetInfo, originEl) {
    var anchor = _targetAnchor(targetInfo);
    if (!anchor) return false;
    var r = anchor.getBoundingClientRect();
    if (!r.width && !r.height) return false;

    var o = originEl ? originEl.getBoundingClientRect() : null;
    var sx, sy;
    if (o && o.width) { sx = o.left + o.width / 2; sy = o.top + o.height * 0.5; }
    else { sx = window.innerWidth / 2; sy = window.innerHeight / 2; }
    var tx = r.left + r.width / 2;
    var ty = r.top + r.height / 2;
    // 目标滚出屏幕（手机端常见）→ 终点收到视口内，保证能看见锁飞出去
    var pad = 36;
    tx = Math.min(Math.max(tx, pad), window.innerWidth - pad);
    ty = Math.min(Math.max(ty, pad), window.innerHeight - pad);

    var lock = document.createElement('div');
    lock.className = 'secret-unlock-fly';
    lock.textContent = '🔓';
    lock.style.left = sx + 'px';
    lock.style.top = sy + 'px';
    document.body.appendChild(lock);

    // 强制一帧初始状态，再设终点（不用 rAF：后台标签页 rAF 会冻结）
    void lock.offsetWidth;
    lock.style.transform = 'translate(-50%,-50%) translate(' + (tx - sx) + 'px,' + (ty - sy) + 'px) rotate(16deg) scale(1.45)';
    lock.style.opacity = '0';

    unlockTimer = setTimeout(function () {
      if (lock.parentNode) lock.remove();
      anchor.classList.add('secret-target-ping');
      setTimeout(function () { anchor.classList.remove('secret-target-ping'); }, 640);
    }, 620);
    return true;
  }

  function playRevealAnim(info) {
    info = info || {};
    var old = document.getElementById('secret-reveal-card');
    if (old) old.remove();
    if (revealTimer) { clearTimeout(revealTimer); revealTimer = null; }
    if (unlockTimer) { clearTimeout(unlockTimer); unlockTimer = null; }
    // 把上一次还在飞的锁清掉，避免连播时叠加
    Array.prototype.forEach.call(document.querySelectorAll('.secret-unlock-fly'), function (n) { n.remove(); });

    // 文案越长字越小，保证「近似正方形」不会撑成竖长条
    var textLen = String(info.text || '').length;
    var sizeCls = textLen > 60 ? ' is-long' : (textLen > 22 ? ' is-medium' : '');
    var hasTarget = !!(info.target && info.target !== '未选择目标' && info.target !== '未填写内容');

    var el = document.createElement('div');
    el.className = 'secret-reveal-card' + sizeCls;
    el.id = 'secret-reveal-card';
    el.innerHTML =
      '<div class="secret-reveal-card__head">' +
        '<span class="secret-reveal-card__lock">🔓</span>' +
        '<span class="secret-reveal-card__who">' + esc(info.owner || '') + ' 的秘密选择</span>' +
      '</div>' +
      '<div class="secret-reveal-card__body">' +
        '<span class="secret-reveal-card__target' + (hasTarget ? '' : ' is-none') + '">' +
          (hasTarget ? '目标 · ' : '') + esc(info.target || '未选择目标') +
        '</span>' +
        '<div class="secret-reveal-card__text' + (info.text ? '' : ' is-empty') + '">' + esc(info.text || '未填写内容') + '</div>' +
      '</div>' +
      '<div class="secret-reveal-card__foot">' +
        '<i class="secret-reveal-card__rule"></i>' +
        '<span class="secret-reveal-card__mark">🔓</span>' +
        '<i class="secret-reveal-card__rule"></i>' +
      '</div>';
    document.body.appendChild(el);

    // 停留 2 秒后淡出（入场交给 CSS animation，不依赖 rAF）
    // 用户要求：弹窗「消失时」才把打开的锁飞向目标式神 / 牌手
    revealTimer = setTimeout(function () {
      el.classList.add('is-out');
      if (info.targetInfo) flyUnlockToTarget(info.targetInfo, el);
      setTimeout(function () { if (el.parentNode) el.remove(); }, 340);
    }, 2200);
  }

  // ================================================================
  //  初始化 / 重置
  // ================================================================
  function resetAll() {
    items = [];
    remoteCount = {};
    try { localStorage.removeItem(storeKey()); } catch (e) { /* 忽略 */ }
    renderAll();
    pushState();
  }

  function bindEntry() {
    var btn = document.getElementById('btn-secret-choice');
    if (!btn || btn.dataset.secretBound) return;
    btn.dataset.secretBound = '1';
    btn.addEventListener('click', function () {
      var menu = document.getElementById('dropdown-mechanic-menu');
      if (menu) menu.hidden = true;
      openCreate();
    });
  }

  function init() {
    load();
    renderAll();
    bindEntry();
  }

  /** 进房/重连后重新按当前房间号加载（页面刚刷新时还不知道房间号） */
  function reload() {
    load();
    renderAll();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { init(); });
  else init();
  window.addEventListener('load', function () { bindEntry(); renderAll(); });

  return {
    MAX_TEXT: MAX_TEXT,
    openCreate: openCreate,
    openList: openList,
    addItem: addItem,
    removeItem: removeItem,
    revealItem: revealItem,
    discardItem: discardItem,
    items: function () { return items.slice(); },
    remoteCount: function (pid) { return remoteCount[String(pid)] || 0; },
    applyState: applyState,
    applyReveal: applyReveal,
    pushState: pushState,
    setItems: setItems,
    setRemoteCount: setRemoteCount,
    reload: reload,
    renderAll: renderAll,
    fly: flyLockToPin,
    playRevealAnim: playRevealAnim,
    flyUnlockToTarget: flyUnlockToTarget,
    _pinAnchorForTest: _pinAnchor,
    _targetAnchorForTest: _targetAnchor,
    resetAll: resetAll
  };
})();
