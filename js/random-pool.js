// ================================================================
//  js/random-pool.js — 随机池（🎰）
//  两处使用：
//    ① 对局内骰子栏（数字 / 随机池 两种模式）—— 改动只在本局生效
//    ② 大厅 DIY → 其他 → 随机池 —— 改动写进账号卡库（由 my-lib 保存）
//  依赖：CardDB.getPlayerPools（读数）、CSS: css/random-pool.css
//  导出：window.RandomPool
// ================================================================

window.RandomPool = (function () {
  'use strict';

  var MAX_ITEMS = 100;     // 单个池子最多 100 条随机项
  var MAX_TEXT = 100;      // 每条随机项最多 100 字
  var MAX_WEIGHT = 1000;   // 单条权重上限
  var MAX_NAME = 40;       // 池子名称上限（与卡库一致）
  var ICON = '🎰';

  // ================================================================
  //  工具
  // ================================================================
  function esc(s) {
    var d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
  }

  /** 权重归一化：认不出数字 / 负数 → 0；超过上限 → 1000 */
  function clampWeight(v) {
    var n = parseInt(v, 10);
    if (!isFinite(n) || n < 0) return 0;
    return Math.min(MAX_WEIGHT, n);
  }

  function weightTotal(items) {
    var t = 0;
    (Array.isArray(items) ? items : []).forEach(function (it) { t += clampWeight(it && it.weight); });
    return t;
  }

  /** 概率文案：整数不带小数，否则保留 1 位 */
  function fmtPct(w, total) {
    if (!total || total <= 0) return '0%';
    var p = clampWeight(w) / total * 100;
    var r = Math.round(p * 10) / 10;
    return (Math.abs(r - Math.round(r)) < 0.05 ? String(Math.round(r)) : r.toFixed(1)) + '%';
  }

  // ================================================================
  //  数据（本局副本 / 服务器卡库）
  // ================================================================
  var localPools = null;   // 本局编辑过的副本；null = 直接跟随服务器卡库

  function normalizePool(p) {
    var items = Array.isArray(p && p.items) ? p.items.map(function (it) {
      return { text: String((it && it.text) || '').slice(0, MAX_TEXT), weight: clampWeight(it && it.weight) };
    }) : [];
    return {
      type: 'pool',
      name: String((p && p.name) || '').slice(0, MAX_NAME),
      effect: String((p && p.effect) || ''),
      items: items,
      // 抽取不放回：骰中的那条权重归零
      noReplace: !!(p && p.noReplace),
      author: (p && p.author) || ''
    };
  }

  function fromCardDB() {
    if (typeof CardDB === 'undefined' || typeof CardDB.getPlayerPools !== 'function') return [];
    var pid = (typeof localPlayerId !== 'undefined' && localPlayerId) ? localPlayerId : '1';
    try {
      return (CardDB.getPlayerPools(pid) || []).map(normalizePool);
    } catch (e) {
      return [];
    }
  }

  function getPools() {
    return localPools || fromCardDB();
  }

  /**
   * 把本局副本同步给服务端（断线重连/刷新后才能恢复：尤其是「抽取不放回」的消耗）
   * 传 null = 回到卡库版本（新开一局）
   */
  function syncToServer() {
    try {
      if (typeof sendToPeer !== 'function') return;
      if (typeof localPlayerId === 'undefined' || !localPlayerId) return;
      sendToPeer({ type: 'pool-state', playerId: localPlayerId, pools: localPools });
    } catch (e) { /* 未联机时忽略 */ }
  }

  /** 从房间状态恢复本局副本（null = 跟随卡库；数组 = 本局改过） */
  function setLocal(pools) {
    if (pools === undefined) return;
    if (Array.isArray(pools)) {
      localPools = pools.map(normalizePool);
    } else {
      localPools = null;
    }
  }

  function ensureLocal() {
    if (!localPools) localPools = fromCardDB();
    return localPools;
  }

  function findPool(name) {
    var list = getPools();
    for (var i = 0; i < list.length; i++) {
      if (list[i].name === name) return list[i];
    }
    return null;
  }

  function upsertPool(pool) {
    var arr = ensureLocal();
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].name === pool.name) { arr[i] = pool; syncToServer(); return; }
    }
    arr.push(pool);
    syncToServer();
  }

  function removePool(name) {
    var arr = ensureLocal();
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].name === name) { arr.splice(i, 1); syncToServer(); return true; }
    }
    return false;
  }

  /** 新开一局：丢掉本局改动，回到服务器版本 */
  function resetLocal() {
    localPools = null;
    syncToServer();
  }

  // ================================================================
  //  抽取
  // ================================================================
  function pickIndex(items) {
    var total = weightTotal(items);
    if (!items || !items.length || total <= 0) return -1;
    var r = Math.random() * total;
    for (var i = 0; i < items.length; i++) {
      var w = clampWeight(items[i].weight);
      if (w <= 0) continue;
      r -= w;
      if (r < 0) return i;
    }
    for (var j = items.length - 1; j >= 0; j--) {
      if (clampWeight(items[j].weight) > 0) return j;
    }
    return -1;
  }

  /**
   * 抽一次。返回 {ok:true, pool, item, index, weight, total, pct, itemsBefore, consumed} 或 {ok:false, msg}
   * 只做计算，不播报；「抽取不放回」的池子会把这条权重归零（写在本局副本里）
   */
  function roll(name) {
    var pool = findPool(name);
    if (!pool) return { ok: false, msg: '找不到这个随机池，可能已经被删掉了' };
    var items = pool.items || [];
    if (!items.length) return { ok: false, msg: '这个池子还没有随机项，点骰子旁的池名，编辑它加几条' };
    var total = weightTotal(items);
    if (total <= 0) {
      return {
        ok: false,
        msg: pool.noReplace
          ? '该随机池属于抽取不放回，所有随机项已全部抽取完毕。若需继续，请修改权重或新增随机项。'
          : '该随机池所有随机项权重均为 0，请修改再使用。'
      };
    }
    var idx = pickIndex(items);
    if (idx < 0) return { ok: false, msg: '抽取失败，请检查权重' };
    // 抽取前的快照：消息/悬浮窗要展示「当时」的整池，而不是被清零后的
    var before = items.map(function (it) { return { text: it.text, weight: clampWeight(it.weight) }; });
    var res = {
      ok: true,
      pool: pool,
      item: items[idx],
      index: idx,
      weight: clampWeight(items[idx].weight),
      total: total,
      pct: fmtPct(items[idx].weight, total),
      itemsBefore: before,
      consumed: false
    };
    // 抽取不放回：骰中的那条权重归零（只改本局副本，不动「我的卡库」）
    if (pool.noReplace) {
      var arr = ensureLocal();
      var local = null;
      for (var k = 0; k < arr.length; k++) { if (arr[k].name === name) { local = arr[k]; break; } }
      if (local && local.items && local.items[idx]) {
        local.items[idx].weight = 0;
        res.pool = local;
        res.consumed = true;
        // 消耗也要进房间状态，否则断线重连/刷新会回到完整池子
        syncToServer();
      }
    }
    return res;
  }

  // ================================================================
  //  随机项列表（DIY 与对局共用的子组件）
  // ================================================================
  function rowHTML(it) {
    var w = clampWeight(it && it.weight);
    return '<div class="rp-row' + (w === 0 ? ' rp-row--zero' : '') + '">' +
      '<span class="rp-no">1</span>' +
      '<input type="text" class="rp-txt" maxlength="' + MAX_TEXT + '" placeholder="示例：抽一张牌" value="' + esc(it && it.text) + '">' +
      '<span class="rp-wlab">权重</span>' +
      '<input type="number" class="rp-w" min="0" max="' + MAX_WEIGHT + '" inputmode="numeric" value="' + w + '">' +
      '<div class="rp-prob"><span class="rp-pct">0%</span><span class="rp-track"><i class="rp-fill"></i></span></div>' +
      '<button type="button" class="rp-del" title="删除这条">🗑</button>' +
      '</div>';
  }

  function itemsHTML(items) {
    var list = Array.isArray(items) ? items : [];
    var rows = list.map(rowHTML).join('');
    return '<div class="rp-block">' +
      '<div class="rp-thead"><span>#</span><span>随机项</span><span>权重</span><span>概率</span><span></span></div>' +
      '<div class="rp-items" data-rp-items>' + (rows || '<div class="rp-empty">还没有随机项，点下面的「＋ 添加随机项」</div>') + '</div>' +
      '<button type="button" class="rp-add" data-rp-add>＋ 添加随机项</button>' +
      '<div class="rp-sum" data-rp-sum><b>0</b> 条随机项 · 合计权重 <b>0</b></div>' +
      '</div>';
  }

  /** 重算序号 / 概率 / 合计（root 内第一个 .rp-block） */
  function recalc(root) {
    if (!root) return;
    var block = root.classList && root.classList.contains('rp-block') ? root : root.querySelector('.rp-block');
    if (!block) return;
    var itemsEl = block.querySelector('[data-rp-items]');
    if (!itemsEl) return;
    var rows = Array.prototype.slice.call(itemsEl.querySelectorAll('.rp-row'));
    var weights = rows.map(function (r) { return clampWeight(r.querySelector('.rp-w').value); });
    var total = weights.reduce(function (a, b) { return a + b; }, 0);
    rows.forEach(function (r, i) {
      var w = weights[i];
      var pctEl = r.querySelector('.rp-pct');
      var fillEl = r.querySelector('.rp-fill');
      var noEl = r.querySelector('.rp-no');
      if (pctEl) pctEl.textContent = fmtPct(w, total);
      if (fillEl) fillEl.style.width = (total > 0 ? (w / total * 100) : 0) + '%';
      if (noEl) noEl.textContent = String(i + 1);
      r.classList.toggle('rp-row--zero', w === 0);
    });
    var sumEl = block.querySelector('[data-rp-sum]');
    if (sumEl) sumEl.innerHTML = '<b>' + rows.length + '</b> 条随机项 · 合计权重 <b>' + total + '</b>';
  }

  function addRow(root) {
    var block = root.querySelector('.rp-block');
    if (!block) return;
    var itemsEl = block.querySelector('[data-rp-items]');
    if (!itemsEl) return;
    if (itemsEl.querySelectorAll('.rp-row').length >= MAX_ITEMS) {
      alert('一个随机池最多 ' + MAX_ITEMS + ' 条随机项');
      return;
    }
    var empty = itemsEl.querySelector('.rp-empty');
    if (empty) empty.remove();
    itemsEl.insertAdjacentHTML('beforeend', rowHTML({ text: '', weight: 1 }));
    var rows = itemsEl.querySelectorAll('.rp-row');
    var last = rows[rows.length - 1];
    if (last) {
      var input = last.querySelector('.rp-txt');
      if (input) input.focus();
    }
    recalc(root);
  }

  /**
   * 绑定返回值列表的交互（同一容器只绑一次）
   * @param {Element} root 包含 .rp-block 的容器（弹窗根节点）
   * @param {Function} onChange 任意变化后回调
   */
  function bindItems(root, onChange) {
    if (!root) return;
    recalc(root);
    if (root.dataset && root.dataset.rpBound === '1') return;   // 禁止重复绑定
    if (root.dataset) root.dataset.rpBound = '1';

    root.addEventListener('click', function (e) {
      var addBtn = e.target.closest && e.target.closest('[data-rp-add]');
      if (addBtn) { e.preventDefault(); addRow(root); if (onChange) onChange(); return; }
      var delBtn = e.target.closest && e.target.closest('.rp-del');
      if (delBtn) {
        e.preventDefault();
        var row = delBtn.closest('.rp-row');
        var itemsEl = root.querySelector('[data-rp-items]');
        if (row && row.parentNode) row.parentNode.removeChild(row);
        if (itemsEl && !itemsEl.querySelector('.rp-row')) {
          itemsEl.innerHTML = '<div class="rp-empty">还没有随机项，点下面的「＋ 添加随机项」</div>';
        }
        recalc(root);
        if (onChange) onChange();
      }
    });

    root.addEventListener('input', function (e) {
      if (e.target.classList && (e.target.classList.contains('rp-w') || e.target.classList.contains('rp-txt'))) {
        recalc(root);
        if (onChange) onChange();
      }
    });

    // 权重失焦：纠正到 0~1000
    root.addEventListener('blur', function (e) {
      if (e.target.classList && e.target.classList.contains('rp-w')) {
        var fixed = clampWeight(e.target.value);
        if (String(fixed) !== String(e.target.value)) e.target.value = fixed;
        recalc(root);
      }
    }, true);
  }

  /** 读出当前列表 */
  function readItems(root) {
    var out = [];
    if (!root) return out;
    var block = root.classList && root.classList.contains('rp-block') ? root : root.querySelector('.rp-block');
    if (!block) return out;
    var rows = block.querySelectorAll('.rp-row');
    for (var i = 0; i < rows.length; i++) {
      var txt = rows[i].querySelector('.rp-txt');
      var wEl = rows[i].querySelector('.rp-w');
      out.push({
        text: String(txt ? txt.value : '').slice(0, MAX_TEXT),
        weight: clampWeight(wEl ? wEl.value : 0)
      });
    }
    return out;
  }

  /** 勾选项：抽取不放回（对局编辑器与 DIY 共用） */
  function checkHTML(checked) {
    return '<label class="rp-check">' +
      '<input type="checkbox" data-rp-noreplace' + (checked ? ' checked' : '') + '>' +
      '<span class="rp-check__box"></span>' +
      '<span class="rp-check__text">抽取不放回' +
        '<span class="rp-check__hint">随机项被抽到后权重变成 0，本次对局不会再抽到它</span>' +
      '</span>' +
    '</label>';
  }

  /** 读勾选状态 */
  function readNoReplace(root) {
    var el = (root && root.querySelector) ? root.querySelector('[data-rp-noreplace]') : null;
    return !!(el && el.checked);
  }

  /** 只校验返回值列表（DIY 里名字重复由调用方自己查） */
  function validateItems(items) {
    var list = Array.isArray(items) ? items : [];
    if (list.length > MAX_ITEMS) return '一个随机池最多 ' + MAX_ITEMS + ' 条随机项';
    for (var i = 0; i < list.length; i++) {
      var t = String(list[i].text || '').trim();
      if (!t) return '第 ' + (i + 1) + ' 条随机项是空的，填上或删掉它';
      if (t.length > MAX_TEXT) return '第 ' + (i + 1) + ' 条随机项超过 ' + MAX_TEXT + ' 字';
    }
    return '';
  }

  /** 校验整个池子，返回错误文案（空串 = 通过） */
  function validatePool(pool, selfName) {
    var name = String((pool && pool.name) || '').trim();
    if (!name) return '请填写随机池名称';
    if (name.length > MAX_NAME) return '名称最多 ' + MAX_NAME + ' 个字';
    var dup = getPools().some(function (p) { return p.name === name && p.name !== selfName; });
    if (dup) return '已经有一个叫「' + name + '」的随机池了，换个名字';
    return validateItems((pool && pool.items) || []);
  }

  // ================================================================
  //  随机池下拉（选择 / 管理）
  // ================================================================
  var popEl = null;
  var popDocHandler = null;

  function closePicker() {
    if (popEl && popEl.parentNode) popEl.parentNode.removeChild(popEl);
    popEl = null;
    if (popDocHandler) {
      document.removeEventListener('pointerdown', popDocHandler, true);
      popDocHandler = null;
    }
  }

  function _positionPop(pop, anchor) {
    var r = anchor.getBoundingClientRect();
    // 手机：和骰子面板同宽、左边缘对齐（面板是自己带内边距的一整块）
    var panel = (anchor.closest && anchor.closest('.mobile-sub-panel')) || null;
    if (panel && window.matchMedia('(max-width: 768px)').matches) {
      var pRect = panel.getBoundingClientRect();
      pop.style.width = Math.round(pRect.width) + 'px';
      pop.style.left = Math.round(pRect.left) + 'px';
      var hMobile = pop.getBoundingClientRect().height;
      var topM = r.bottom + 6;
      if (topM + hMobile > window.innerHeight - 8) topM = Math.max(8, pRect.top - hMobile - 8);
      pop.style.top = Math.round(topM) + 'px';
      return;
    }
    var pr = pop.getBoundingClientRect();
    var left = Math.min(Math.max(8, r.left), window.innerWidth - pr.width - 8);
    var top = r.bottom + 6;
    if (top + pr.height > window.innerHeight - 8) {
      top = Math.max(8, r.top - pr.height - 6);
    }
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }

  function _popItemHTML(p, cur) {
    var total = weightTotal(p.items);
    var n = (p.items ? p.items.length : 0);
    return '<div class="rp-pop__item' + (p.name === cur ? ' is-on' : '') + '" data-rp-pick="' + esc(p.name) + '">' +
      '<span class="rp-pop__ico">' + ICON + '</span>' +
      '<span class="rp-pop__body"><b>' + esc(p.name) + '</b><i>' + n + ' 条随机项 · 权重 ' + total + (p.noReplace ? ' · 不放回' : '') + '</i></span>' +
      '<span class="rp-pop__acts">' +
        '<button type="button" class="rp-pop__act" data-rp-edit="' + esc(p.name) + '" title="编辑">✏️</button>' +
        '<button type="button" class="rp-pop__act rp-pop__act--del" data-rp-del="' + esc(p.name) + '" title="删除">🗑</button>' +
      '</span>' +
      '<span class="rp-pop__tick">✓</span>' +
      '</div>';
  }

  /**
   * 打开随机池下拉
   * @param {Element} anchor 定位用的按钮
   * @param {{current?:string, inGame?:boolean, onPick?:Function, onChange?:Function}} opts
   */
  function openPicker(anchor, opts) {
    opts = opts || {};
    closePicker();
    if (!anchor) return;
    var pools = getPools();
    var cur = opts.current || '';
    // 手机（面板顶部已有「数字 / 随机池」切换）→ 不再重复「骰子」标题与「我的随机池」分隔线，
    // 直接一行标题，避免列表上方出现大段空白
    var sheet = !opts.numberModeRow;
    var pop = document.createElement('div');
    pop.className = 'rp-pop' + (sheet ? ' rp-pop--sheet' : '');
    pop.innerHTML =
      (sheet
        ? '<div class="rp-pop__head rp-pop__head--sheet">' +
            '<span class="rp-pop__title">' + ICON + ' 我的随机池</span>' +
            '<button type="button" class="rp-pop__x" data-rp-close title="关闭">✕</button>' +
          '</div>'
        : '<div class="rp-pop__head">' +
            '<span class="rp-pop__title">骰子</span>' +
            '<button type="button" class="rp-pop__x" data-rp-close title="关闭">✕</button>' +
          '</div>' +
          '<div class="rp-pop__opt' + (opts.numberModeActive ? ' is-on' : '') + '" data-rp-number>' +
            '<span class="rp-pop__ico">🎲</span>' +
            '<span class="rp-pop__body"><b>数字区间</b><i>在「最小值 ~ 最大值」之间随机</i></span>' +
            '<span class="rp-pop__tick">✓</span>' +
          '</div>' +
          '<div class="rp-pop__divider"><span>我的随机池</span></div>') +
      (pools.length
        ? '<div class="rp-pop__list">' + pools.map(function (p) { return _popItemHTML(p, cur); }).join('') + '</div>'
        : '<div class="rp-pop__empty">还没有随机池。<br>建一个，写几条随机项，以后点一下就能抽。</div>') +
      '<button type="button" class="rp-pop__new" data-rp-new>＋ 新建随机池</button>';
    document.body.appendChild(pop);
    popEl = pop;
    _positionPop(pop, anchor);

    pop.addEventListener('click', function (e) {
      if (e.target.closest('[data-rp-close]')) { e.stopPropagation(); closePicker(); return; }
      var numEl = e.target.closest('[data-rp-number]');
      if (numEl) {
        e.stopPropagation();
        closePicker();
        if (opts.onNumberMode) opts.onNumberMode();
        return;
      }
      var newBtn = e.target.closest('[data-rp-new]');
      if (newBtn) {
        e.stopPropagation();
        openEditor(null, {
          inGame: opts.inGame,
          onSaved: function (pool) {
            if (opts.onChange) opts.onChange();
            if (opts.onPick) opts.onPick(pool.name);
            closePicker();
          }
        });
        return;
      }
      var editBtn = e.target.closest('[data-rp-edit]');
      if (editBtn) {
        e.stopPropagation();
        var editName = editBtn.dataset.rpEdit;
        openEditor(editName, {
          inGame: opts.inGame,
          onSaved: function (pool) {
            // 改名的正好是当前选中的池：把选中跟到新名字（否则会丢掉选中）
            if (cur && cur === editName && pool.name !== editName) {
              cur = pool.name;
              opts.current = pool.name;
              if (opts.onPick) opts.onPick(pool.name);
            }
            if (opts.onChange) opts.onChange();
            if (cur && !findPool(cur)) cur = pool.name;
            closePicker();
            openPicker(anchor, opts);
          }
        });
        return;
      }
      var delBtn = e.target.closest('[data-rp-del]');
      if (delBtn) {
        e.stopPropagation();
        var nm = delBtn.dataset.rpDel;
        var tip = opts.inGame
          ? '确定删除随机池「' + nm + '」？\n（本次对局的改动不会保存到「我的卡库」）'
          : '确定删除随机池「' + nm + '」？';
        if (!window.confirm(tip)) return;
        removePool(nm);
        if (opts.onChange) opts.onChange();
        closePicker();
        openPicker(anchor, opts);
        return;
      }
      var pickEl = e.target.closest('[data-rp-pick]');
      if (pickEl) {
        var name = pickEl.dataset.rpPick;
        closePicker();
        if (opts.onPick) opts.onPick(name);
      }
    });

    // 点空白处关闭
    popDocHandler = function (ev) {
      if (popEl && !popEl.contains(ev.target) && ev.target !== anchor && !anchor.contains(ev.target)) closePicker();
    };
    setTimeout(function () { document.addEventListener('pointerdown', popDocHandler, true); }, 0);
  }

  // ================================================================
  //  编辑弹窗
  // ================================================================
  var editorEl = null;

  function closeEditor() {
    if (editorEl && editorEl.parentNode) editorEl.parentNode.removeChild(editorEl);
    editorEl = null;
  }

  /**
   * 打开编辑窗
   * @param {string|null} name 传 null = 新建
   * @param {{inGame?:boolean, onSaved?:Function}} opts
   */
  function openEditor(name, opts) {
    opts = opts || {};
    closeEditor();
    var isNew = !name;
    var src = name ? findPool(name) : null;
    var pool = src ? normalizePool(src) : { type: 'pool', name: '', effect: '', items: [{ text: '', weight: 1 }] };

    var overlay = document.createElement('div');
    overlay.className = 'rp-overlay';
    overlay.innerHTML =
      '<div class="rp-modal">' +
        '<div class="rp-head">' +
          '<span class="rp-title">' + ICON + ' 随机池' + (isNew ? ' · 新建' : ' · ' + esc(pool.name)) + '</span>' +
          '<button type="button" class="rp-close" data-rp-close>✕</button>' +
        '</div>' +
        '<div class="rp-body">' +
          (opts.inGame ? '<div class="rp-strip">🎲 <b>此页面改动只在本次对局生效</b>，不会改动「DIY」里保存的版本。</div>' : '') +
          '<div class="rp-two">' +
            '<label class="rp-field"><span>名称</span><input type="text" id="rp-name" maxlength="' + MAX_NAME + '" placeholder="比如：酒馆事件" value="' + esc(pool.name) + '"></label>' +
            '<label class="rp-field"><span>备注</span><input type="text" id="rp-note" maxlength="300" placeholder="选填" value="' + esc(pool.effect) + '"></label>' +
          '</div>' +
          checkHTML(pool.noReplace) +
          itemsHTML(pool.items) +
          '<div class="rp-err" id="rp-err"></div>' +
        '</div>' +
        '<div class="rp-foot">' +
          '<button type="button" class="rp-btn" data-rp-close>取消</button>' +
          '<button type="button" class="rp-btn rp-btn--go" data-rp-save>保存</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    editorEl = overlay;
    bindItems(overlay, null);

    overlay.addEventListener('click', function (e) {
      if (e.target.closest('[data-rp-close]')) { closeEditor(); return; }
      if (e.target.closest('[data-rp-save]')) {
        var nameInput = overlay.querySelector('#rp-name');
        var noteInput = overlay.querySelector('#rp-note');
        var next = {
          type: 'pool',
          name: String(nameInput ? nameInput.value : '').trim(),
          effect: String(noteInput ? noteInput.value : '').trim(),
          items: readItems(overlay),
          noReplace: readNoReplace(overlay),
          author: pool.author || ''
        };
        var err = validatePool(next, isNew ? '' : name);
        if (err) {
          var errEl = overlay.querySelector('#rp-err');
          if (errEl) errEl.textContent = err;
          return;
        }
        upsertPool(next);
        // 改过名字：把旧名字那条删掉，否则列表里会多出一个旧副本
        if (!isNew && name && name !== next.name) removePool(name);
        closeEditor();
        if (opts.onSaved) opts.onSaved(next);
      }
    });

    var first = overlay.querySelector('#rp-name');
    if (first) setTimeout(function () { first.focus(); }, 30);
  }

  // ================================================================
  //  投掷结果浮层
  // ================================================================
  function playResult(d) {
    if (!d) return;
    var old = document.getElementById('rp-result');
    if (old) old.parentNode.removeChild(old);
    var el = document.createElement('div');
    el.className = 'rp-result';
    el.id = 'rp-result';
    var text = String(d.text || '');
    el.innerHTML =
      '<div class="rp-result__tag">' + ICON + ' ' + esc(d.poolName || '随机池') + '</div>' +
      '<div class="rp-result__text' + (text.length > 12 ? ' is-long' : '') + '">' + esc(text) + '</div>' +
      '<div class="rp-result__meta">权重 ' + (d.weight + ' / ' + d.total) + ' · ' + esc(d.pct || '') + '</div>';
    document.body.appendChild(el);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { el.classList.add('is-in'); });
    });
    setTimeout(function () { el.classList.remove('is-in'); }, 1700);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 2200);
  }

  // ================================================================
  //  初始化
  // ================================================================
  function init() {
    // 出牌/开局重新拉卡库后，本局改动仍然保留（本局范围优先）
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (editorEl) { closeEditor(); return; }
        if (popEl) { closePicker(); }
      }
    });
  }

  init();

  return {
    MAX_ITEMS: MAX_ITEMS,
    MAX_TEXT: MAX_TEXT,
    MAX_WEIGHT: MAX_WEIGHT,
    MAX_NAME: MAX_NAME,
    ICON: ICON,
    esc: esc,
    clampWeight: clampWeight,
    weightTotal: weightTotal,
    fmtPct: fmtPct,
    getPools: getPools,
    setLocal: setLocal,
    syncToServer: syncToServer,
    findPool: findPool,
    upsertPool: upsertPool,
    removePool: removePool,
    resetLocal: resetLocal,
    normalizePool: normalizePool,
    pickIndex: pickIndex,
    roll: roll,
    itemsHTML: itemsHTML,
    checkHTML: checkHTML,
    readNoReplace: readNoReplace,
    bindItems: bindItems,
    readItems: readItems,
    recalc: recalc,
    validatePool: validatePool,
    validateItems: validateItems,
    openPicker: openPicker,
    closePicker: closePicker,
    openEditor: openEditor,
    closeEditor: closeEditor,
    playResult: playResult
  };
})();
