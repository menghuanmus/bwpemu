// ================================================================
//  js/stack-manage.js — 堆叠管理窗口（P1）
//
//  · 打开方式：手牌列表里的「− 堆叠：n/max +」点数字 / 「设置堆叠」模式下的「堆叠」按钮
//  · 上半 = 这一叠（层数 ± / 本叠上限 / 取消这叠的堆叠）
//  · 下半 = 本局条目表（每人一份；值 0 = 墓碑，表示「已删除 → 该牌名回到普通牌」）
//
//  依赖（都挂在 window 上，来自 card-deck.js）：
//    getStackRule / setStackRule / removeStackRule / addStackRule /
//    getStackRulesSnapshot / getCardMaxStack / refreshStackLimits
//  以及全局：getPlayerName / broadcastSystemMsg / syncDeckStateForce /
//           refreshOpenListDialog / Undo.noteSync
// ================================================================
(function () {
  'use strict';

  const MIN_LIMIT = 1;
  const MAX_LIMIT = 999;
  const DEFAULT_NEW_LIMIT = 3;

  let ov = null;      // overlay 根节点（只建一次）
  let els = {};       // 常用子节点
  let ctx = null;     // { playerId, card, canEdit, onChanged }
  let _selfOp = false;  // 自己发起的本局条目改动（下面已手动 _render，不用再刷一次）

  /** 牌面显示名（分化牌加「协战*」前缀；消息里用原始名） */
  function _display(name) {
    return (window.Bond && Bond.displayName) ? Bond.displayName(name) : String(name || '');
  }

  function _el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function _num(v, min, max, dflt) {
    const n = parseInt(v, 10);
    if (Number.isNaN(n)) return dflt;
    return Math.min(Math.max(n, min), max);
  }

  /** 当前生效上限（本叠手动 > 本局条目 > 卡牌数据） */
  function _limitOf(pid, card) {
    return (typeof window.getCardMaxStack === 'function') ? window.getCardMaxStack(pid, card) : 0;
  }

  /**
   * 对外用：这张牌现在显示多少上限（0 = 不显示堆叠）
   * · 自己的牌：按本地的「本叠手动 > 本局条目 > 卡牌数据」算
   * · 对手/观众的牌：优先用对方同步过来的 _maxStack 标记（本地不一定有对方的条目表）
   */
  function limitOf(playerId, card, canEdit) {
    if (!card) return 0;
    const own = (canEdit != null) ? !!canEdit : _isOwn(playerId);
    // 不是自己的牌（对手 / 观众）：一律以对方同步过来的「牌身标记」为准。
    // 标记里 0 是明确含义（对方把这一叠/本局这条删了，不堆叠），
    // 不能用本地的本局条目表去猜——否则对手删过堆叠的牌会显示成还能堆叠。
    if (!own) {
      const stamped = parseInt(card._maxStack, 10);
      if (!Number.isNaN(stamped)) return stamped > 0 ? Math.min(stamped, MAX_LIMIT) : 0;
    }
    const v = _limitOf(playerId, card);
    return v > 0 ? v : (card._maxStack || 0);
  }

  function _isOwn(pid) {
    if (typeof isViewingOwnCards === 'function') return isViewingOwnCards(pid);
    return true;
  }

  /** 广播 + 进撤销 + 同步（列表刷新按需；层数微调不整表重绘，见 PRD §4.3） */
  function _commit(pid, message, opts) {
    const o = opts || {};
    if (message && typeof broadcastSystemMsg === 'function') broadcastSystemMsg('【系统】' + message);
    if (typeof Undo !== 'undefined' && Undo.noteSync) Undo.noteSync();
    if (typeof syncDeckStateForce === 'function') syncDeckStateForce(pid);
    else if (typeof syncDeckState === 'function') syncDeckState(pid);
    if (o.listRefresh && typeof refreshOpenListDialog === 'function') refreshOpenListDialog(pid);
    if (!o.listRefresh && ctx && typeof ctx.onChanged === 'function') ctx.onChanged();
  }

  /** 本局条目改动后强制刷新列表（不依赖内部刷新路径，保证桌上的每张同名牌都跟着变） */
  function _reloadList(playerId) {
    if (typeof refreshOpenListDialog === 'function') refreshOpenListDialog(playerId);
    if (typeof updateDeckButtons === 'function') updateDeckButtons(playerId);
  }

  // ================================================================
  //  行内控件：− 堆叠：n/max +（自己可点；对手/观众只读）
  // ================================================================
  function buildInline(playerId, card, canEdit, onChanged) {
    const wrap = _el('span', 'stack-inline');
    const name = card && card.name ? card.name : '';

    function limit() { return limitOf(playerId, card, canEdit); }
    function cur() { return card._stack || 1; }

    let minusBtn = null, plusBtn = null;

    function adjust(delta) {
      const lim = limit();
      if (lim <= 0) return;
      const n = cur();
      const next = Math.min(Math.max(n + delta, MIN_LIMIT), lim);
      if (next === n) return;
      card._stack = next;
      card._maxStack = lim;
      _commit(playerId, getPlayerName(playerId) + '把「' + name + '」的堆叠层数改为 ' + next + '/' + lim);
      refresh();
      if (typeof window.StackManage.refreshCard === 'function') window.StackManage.refreshCard(playerId, card);
    }

    if (canEdit) {
      minusBtn = _el('button', 'stack-inline__btn', '−');
      minusBtn.type = 'button';
      minusBtn.title = '层数 -1';
      minusBtn.addEventListener('click', (e) => { e.stopPropagation(); adjust(-1); });
      wrap.appendChild(minusBtn);
    }

    const label = _el('span', canEdit ? 'stack-inline__label stack-inline__label--click' : 'stack-inline__label stack-inline__ro');
    if (canEdit) {
      label.title = '点击打开堆叠管理';
      label.addEventListener('click', (e) => {
        e.stopPropagation();
        open(playerId, card, { canEdit: canEdit, onChanged: onChanged });
      });
    }
    wrap.appendChild(label);

    if (canEdit) {
      plusBtn = _el('button', 'stack-inline__btn', '+');
      plusBtn.type = 'button';
      plusBtn.title = '层数 +1';
      plusBtn.addEventListener('click', (e) => { e.stopPropagation(); adjust(1); });
      wrap.appendChild(plusBtn);
    }

    /** 只更新这一行的数字与按钮状态（不整表重绘） */
    function refresh() {
      const lim = limit();
      const n = cur();
      label.textContent = '堆叠：' + n + '/' + lim;
      if (minusBtn) minusBtn.disabled = (lim <= 0) || (n <= MIN_LIMIT);
      if (plusBtn) plusBtn.disabled = (lim <= 0) || (n >= lim);
    }
    refresh();
    wrap.__stackRefresh = refresh;   // 供调用方只更新这一行（PRD §4.3：不整表重绘）
    return wrap;
  }

  // ================================================================
  //  管理窗口 DOM（只创建一次、只绑一次事件）
  // ================================================================
  function _build() {
    if (ov) return ov;

    ov = _el('div', 'stack-overlay');
    ov.id = 'stack-manage-overlay';
    ov.hidden = true;

    const dlg = _el('div', 'stack-dialog');
    dlg.setAttribute('role', 'dialog');
    dlg.setAttribute('aria-labelledby', 'stack-manage-title');

    // ---- 头部 ----
    const head = _el('div', 'stack-dialog__head');
    const title = _el('span', 'stack-dialog__title');
    title.id = 'stack-manage-title';
    const closeBtn = _el('button', 'stack-dialog__close', '✕');
    closeBtn.type = 'button';
    closeBtn.title = '关闭';
    closeBtn.addEventListener('click', close);
    head.appendChild(title);
    head.appendChild(closeBtn);

    // ---- 上半：这一叠 ----
    const body = _el('div', 'stack-dialog__body');

    const secTop = _el('div', 'stack-sec');
    const topTitle = _el('div', 'stack-sec__title', '这一叠');
    secTop.appendChild(topTitle);

    const roTip = _el('div', 'stack-readonly-tip', '你没有权限修改这一叠（只有牌主能改）');
    roTip.hidden = true;
    secTop.appendChild(roTip);

    // 当前没有堆叠能力：提示 + 「开启堆叠」（默认上限 3）
    const noStackBox = _el('div', 'stack-nostack');
    noStackBox.appendChild(_el('div', 'stack-nostack__text', '此牌当前无堆叠'));
    const noStackNote = _el('div', 'stack-nostack__note');
    noStackNote.hidden = true;
    noStackBox.appendChild(noStackNote);
    const enableStackBtn = _el('button', 'stack-btn stack-btn--primary', '开启堆叠');
    enableStackBtn.type = 'button';
    enableStackBtn.title = '开启后这一叠可以堆叠，上限默认 3（可在下面改）';
    enableStackBtn.addEventListener('click', _enableStack);
    noStackBox.appendChild(enableStackBtn);
    secTop.appendChild(noStackBox);

    // 有堆叠时显示的这三行
    const normalBox = _el('div', 'stack-normal');

    // 层数行
    const rowLayer = _el('div', 'stack-row');
    rowLayer.appendChild(_el('span', 'stack-row__label', '层数'));
    const step = _el('div', 'stack-step');
    const minusBtn = _el('button', 'stack-step__btn', '−');
    minusBtn.type = 'button';
    minusBtn.addEventListener('click', () => _adjustLayer(-1));
    const numSpan = _el('span', 'stack-step__num', '1');
    const ofSpan = _el('span', 'stack-step__of', '/ 0');
    const plusBtn = _el('button', 'stack-step__btn', '+');
    plusBtn.type = 'button';
    plusBtn.addEventListener('click', () => _adjustLayer(1));
    step.appendChild(minusBtn);
    step.appendChild(numSpan);
    step.appendChild(ofSpan);
    step.appendChild(plusBtn);
    rowLayer.appendChild(step);
    normalBox.appendChild(rowLayer);

    // 本叠上限行
    const rowOwn = _el('div', 'stack-row');
    rowOwn.appendChild(_el('span', 'stack-row__label', '本叠上限'));
    const ownInput = document.createElement('input');
    ownInput.type = 'number';
    ownInput.className = 'stack-num';
    ownInput.min = String(MIN_LIMIT);
    ownInput.max = String(MAX_LIMIT);
    ownInput.title = '只影响这一叠（1~999）';
    ownInput.addEventListener('change', () => _setOwnLimit(ownInput.value));
    const ownHint = _el('span', 'stack-hint');
    rowOwn.appendChild(ownInput);
    rowOwn.appendChild(ownHint);
    normalBox.appendChild(rowOwn);

    // 跟随本局堆叠设置（勾上 = 上限听本局的；取消勾选 = 只看本叠上限，不受本局影响）
    const rowFollow = _el('div', 'stack-row');
    const followLabel = _el('label', 'stack-follow');
    const followChk = document.createElement('input');
    followChk.type = 'checkbox';
    followChk.id = 'stack-follow-chk';
    followChk.addEventListener('change', () => _setFollow(followChk.checked));
    followLabel.appendChild(followChk);
    followLabel.appendChild(_el('span', 'stack-follow__text', '跟随本局堆叠设置'));
    const followNote = _el('span', 'stack-hint');
    rowFollow.appendChild(followLabel);
    rowFollow.appendChild(followNote);
    normalBox.appendChild(rowFollow);

    // 取消这叠的堆叠
    const rowCancel = _el('div', 'stack-row');
    const cancelBtn = _el('button', 'stack-btn stack-btn--danger', '取消这叠的堆叠');
    cancelBtn.type = 'button';
    cancelBtn.title = '这一叠变回普通牌（只保留 1 张，其它层数丢弃）';
    cancelBtn.addEventListener('click', _cancelOwn);
    rowCancel.appendChild(cancelBtn);
    normalBox.appendChild(rowCancel);
    secTop.appendChild(normalBox);

    body.appendChild(secTop);

    // ---- 分割线 ----
    body.appendChild(_el('div', 'stack-sec__divider'));

    // ---- 下半：本局条目表 ----
    const secBottom = _el('div', 'stack-sec');
    secBottom.appendChild(_el('div', 'stack-sec__title', '本局堆叠设置'));
    secBottom.appendChild(_el('div', 'stack-sec__note', '以下设置对「你本局所有同名牌」生效。'));

    const entries = _el('div', 'stack-entries');
    secBottom.appendChild(entries);

    // 新增行
    const addRow = _el('div', 'stack-addrow');
    const addBtn = _el('button', 'stack-btn stack-btn--primary', '新增堆叠');
    addBtn.type = 'button';
    addBtn.addEventListener('click', () => _addEntry());
    const addInput = document.createElement('input');
    addInput.type = 'text';
    addInput.className = 'stack-addrow__input';
    addInput.placeholder = '输入卡牌名';
    addInput.maxLength = 30;
    addInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); _addEntry(); }
    });
    addRow.appendChild(addBtn);
    addRow.appendChild(addInput);
    secBottom.appendChild(addRow);

    body.appendChild(secBottom);

    // ---- 底部 ----
    const foot = _el('div', 'stack-dialog__foot');
    const footClose = _el('button', 'stack-btn stack-btn--ghost', '关闭');
    footClose.type = 'button';
    footClose.addEventListener('click', close);
    foot.appendChild(footClose);

    dlg.appendChild(head);
    dlg.appendChild(body);
    dlg.appendChild(foot);
    ov.appendChild(dlg);
    document.body.appendChild(ov);

    els = { title, roTip, noStackBox, noStackNote, enableStackBtn, normalBox, minusBtn, numSpan, ofSpan, plusBtn, ownInput, ownHint, followChk, followNote, cancelBtn, entries, addBtn, addInput, footClose };
    return ov;
  }

  // ================================================================
  //  渲染
  // ================================================================
  function open(playerId, card, opts) {
    if (!card) return;
    const o = opts || {};
    ctx = {
      playerId,
      card,
      canEdit: (o.canEdit != null) ? !!o.canEdit : _isOwn(playerId),
      onChanged: o.onChanged || null,
    };
    _build();
    _resolveCard();
    _render();
    ov.hidden = false;
  }

  function close() {
    if (ov) ov.hidden = true;
    ctx = null;
  }

  function isOpenFor(playerId, card) {
    if (!ov || ov.hidden || !ctx) return false;
    if (String(ctx.playerId) !== String(playerId)) return false;
    if (ctx.card === card) return true;
    return !!(card && ctx.card && card.id === ctx.card.id);
  }

  /** 外部（行内 ± / 其它模块）改了这张牌 → 若窗口正开着它，刷新显示 */
  function refreshCard(playerId, card) {
    if (!isOpenFor(playerId, card)) return;
    _resolveCard();
    _render();
  }

  /** 外部（撤销 / 读档 / 收到同步 / 重算）改了规则表或层数 → 若窗口开着就刷新 */
  function refreshOpen() {
    if (_selfOp) return;                    // 自己发起的改动已在下面手动刷新
    if (!ov || ov.hidden || !ctx) return;
    _resolveCard();
    _render();
  }

  /** 撤销/读档会把卡牌换成新对象 → 按 id 重新找到当前这张牌 */
  function _resolveCard() {
    if (!ctx || !ctx.card) return;
    const id = ctx.card.id;
    if (typeof getPlayerCardState !== 'function') return;
    const st = getPlayerCardState(ctx.playerId);
    if (!st) return;
    const find = (arr) => (arr || []).find(c => c && c.id === id);
    let found = find(st.hand) || find(st.deck) || find(st.grave);
    if (!found && typeof oracleHands !== 'undefined' && Array.isArray(oracleHands[ctx.playerId])) {
      found = find(oracleHands[ctx.playerId]);
    }
    if (found) ctx.card = found;
  }

  /** 包一层：标记「这是我自己发起的规则改动」 */
  function _asSelfOp(fn) {
    _selfOp = true;
    try { return fn(); } finally { _selfOp = false; }
  }

  function _render() {
    if (!ctx) return;
    const { playerId, card, canEdit } = ctx;
    const name = card.name || '(未命名)';
    els.title.textContent = '堆叠管理 · ' + _display(name);
    els.roTip.hidden = canEdit;
    _renderUpper();
    _renderEntries();
  }

  function _renderUpper() {
    if (!ctx) return;
    const { playerId, card, canEdit } = ctx;
    const lim = limitOf(playerId, card, canEdit);
    const n = card._stack || 1;

    // 没有堆叠能力：只显示提示 + 「开启堆叠」
    const noStack = lim <= 0;
    els.noStackBox.hidden = !noStack;
    els.normalBox.hidden = noStack;
    els.enableStackBtn.disabled = !canEdit;
    if (noStack) {
      // 本局已有条目（或这一叠被单独取消过）→ 说清原因，别让玩家以为是坏的
      const rule = (typeof window.getStackRule === 'function') ? window.getStackRule(playerId, card.name) : null;
      let note = '';
      if (card._maxStackManual) {
        note = rule > 0
          ? '（这一叠被单独取消过、不跟随本局；点「开启堆叠」可恢复）'
          : '（这一叠被单独取消过）';
      } else if (rule === 0) {
        note = '（本局设置里已把「' + (card.name || '') + '」删掉：这一叠回到普通牌）';
      }
      els.noStackNote.textContent = note;
      els.noStackNote.hidden = !note;
      return;
    }
    els.numSpan.textContent = String(n);
    els.ofSpan.textContent = '/ ' + (lim > 0 ? lim : '—');
    els.minusBtn.disabled = !canEdit || lim <= 0 || n <= MIN_LIMIT;
    els.plusBtn.disabled = !canEdit || lim <= 0 || n >= lim;
    els.minusBtn.title = els.plusBtn.title = '层数最低 1、最高为本叠上限';

    // 本叠上限：显示当前生效值（跟随本局时灰置）
    const follow = !card._maxStackManual;
    els.followChk.checked = follow;
    els.followChk.disabled = !canEdit;
    els.followNote.textContent = follow
      ? '（正在跟随：随着本局设置改变）'
      : '（无视本局设置：只看本叠上限）';
    els.ownInput.disabled = !canEdit || follow;
    els.ownInput.value = (lim > 0 ? String(lim) : '');
    els.ownInput.placeholder = '1~999';
    els.ownInput.title = follow ? '正在跟随本局设置，取消勾选后才能单独设上限' : '只影响这一叠（1~999）';
    els.cancelBtn.disabled = !canEdit;

    // 提示：本局条目
    const rule = (typeof window.getStackRule === 'function') ? window.getStackRule(playerId, card.name) : null;
    let txt = '本局条目：按卡牌数据';
    let warn = false;
    if (rule === 0) { txt = '本局条目：已删除（该牌名回到普通牌）'; warn = true; }
    else if (rule > 0) { txt = '本局条目：' + rule; }
    els.ownHint.textContent = txt;
    els.ownHint.classList.toggle('stack-hint--warn', warn);
  }

  function _renderEntries() {
    if (!ctx) return;
    const { playerId, canEdit } = ctx;
    const snap = (typeof window.getStackRulesSnapshot === 'function') ? window.getStackRulesSnapshot(playerId) : {};
    const names = Object.keys(snap).filter(n => snap[n] > 0);
    names.sort((a, b) => String(a).localeCompare(String(b), 'zh'));

    els.entries.innerHTML = '';
    if (!names.length) {
      els.entries.appendChild(_el('div', 'stack-entries__empty', '本局还没有任何堆叠设置'));
    }
    names.forEach(n => {
      const row = _el('div', 'stack-entry');
      const nm = _el('span', 'stack-entry__name', _display(n));
      nm.title = n;
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.className = 'stack-entry__limit';
      inp.min = String(MIN_LIMIT);
      inp.max = String(MAX_LIMIT);
      inp.value = String(snap[n]);
      inp.dataset.ruleName = n;
      inp.disabled = !canEdit;
      inp.title = '清空 = 删掉这条（该牌名回到普通牌）';
      // 直接绑定（不靠事件冒泡：外部/脚本派发的 change 不一定带 bubbles）
      inp.addEventListener('change', () => _setEntryLimit(n, inp.value));
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); _setEntryLimit(n, inp.value); }
      });
      const del = _el('button', 'stack-entry__del', '删除');
      del.type = 'button';
      del.dataset.ruleName = n;
      del.disabled = !canEdit;
      del.title = '删掉这条 = 该牌名回到普通牌（不再堆叠；之后导卡组/读档也不会自己加回）';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        _deleteEntry(n);
      });
      row.appendChild(nm);
      row.appendChild(inp);
      row.appendChild(del);
      els.entries.appendChild(row);
    });

    els.addInput.disabled = !canEdit;
    els.addBtn.disabled = !canEdit;
    if (els.addInput.disabled) els.addInput.value = '';
  }

  // ================================================================
  //  操作：上半（这一叠）
  // ================================================================
  function _adjustLayer(delta) {
    if (!ctx || !ctx.canEdit) return;
    const { playerId, card } = ctx;
    const lim = limitOf(playerId, card, ctx.canEdit);
    if (lim <= 0) return;
    const n = card._stack || 1;
    const next = Math.min(Math.max(n + delta, MIN_LIMIT), lim);
    if (next === n) return;
    card._stack = next;
    card._maxStack = lim;
    _commit(playerId, getPlayerName(playerId) + '把「' + (card.name || '') + '」的堆叠层数改为 ' + next + '/' + lim);
    _renderUpper();
  }

  function _setOwnLimit(raw) {
    if (!ctx || !ctx.canEdit) return;
    const { playerId, card } = ctx;
    const txt = String(raw == null ? '' : raw).trim();
    if (!txt) { _renderUpper(); return; }          // 清空 → 不改（用「取消这叠的堆叠」来取消）
    const v = _num(txt, MIN_LIMIT, MAX_LIMIT, null);
    if (v === null) { _renderUpper(); return; }
    card._maxStackManual = true;                   // 改了本叠上限 = 不再跟随本局
    card._maxStack = v;
    if ((card._stack || 1) > v) card._stack = v;   // 改小 → 本叠层数压到新上限
    _commit(playerId,
      getPlayerName(playerId) + '把「' + (card.name || '') + '」这一叠的堆叠上限设为 ' + v,
      { listRefresh: true });
    if (!ctx) return;                              // 列表重绘可能已关窗（理论上不会）
    _render();
  }

  /** 勾选/取消「跟随本局堆叠设置」 */
  function _setFollow(follow) {
    if (!ctx || !ctx.canEdit) return;
    const { playerId, card } = ctx;
    const name = card.name || '';
    const who = getPlayerName(playerId);
    if (follow) {
      // 跟随：去掉手动标记 → 按「本局条目 / 卡牌数据」重算
      card._maxStackManual = false;
      broadcastSystemMsg('【系统】' + who + '让「' + name + '」这一叠跟随本局堆叠设置');
      window.refreshStackLimits(playerId, true);   // 重算 + 同步 + 进撤销 + 刷新列表
    } else {
      // 不跟随：把当前生效的上限固定为本叠上限，之后本局改动不再影响它
      const cur = limitOf(playerId, card, true);
      const keep = (cur > 0) ? cur : (card._maxStack || DEFAULT_NEW_LIMIT);
      card._maxStackManual = true;
      card._maxStack = keep;
      if ((card._stack || 1) > keep) card._stack = keep;
      broadcastSystemMsg('【系统】' + who + '让「' + name + '」不再跟随本局堆叠设置（本叠上限 ' + keep + '）');
      _commit(playerId, null, { listRefresh: true });
    }
    if (!ctx) return;
    _render();
  }

  function _cancelOwn() {
    if (!ctx || !ctx.canEdit) return;
    const { playerId, card } = ctx;
    card._maxStackManual = true;
    card._maxStack = 0;
    card._stack = 1;
    _commit(playerId,
      getPlayerName(playerId) + '取消了「' + (card.name || '') + '」这一叠的堆叠（只保留 1 张）',
      { listRefresh: true });
    if (!ctx) return;
    _render();
  }

  /** 开启堆叠：本局有设置就跟着本局走，否则本叠上限默认 3（手动） */
  function _enableStack() {
    if (!ctx || !ctx.canEdit) return;
    const { playerId, card } = ctx;
    const name = card.name || '';
    const who = getPlayerName(playerId);
    const rule = (typeof window.getStackRule === 'function') ? window.getStackRule(playerId, card.name) : null;
    if (!card._stack) card._stack = 1;
    if (rule !== null && rule > 0) {
      card._maxStackManual = false;                       // 跟随本局
      broadcastSystemMsg('【系统】' + who + '为「' + name + '」开启了堆叠（跟随本局设置：上限 ' + rule + '）');
      window.refreshStackLimits(playerId, true);
    } else {
      card._maxStackManual = true;                        // 本局没设置 → 单独给这一叠开
      card._maxStack = DEFAULT_NEW_LIMIT;
      broadcastSystemMsg('【系统】' + who + '为「' + name + '」开启了堆叠（上限 ' + DEFAULT_NEW_LIMIT + '）');
      _commit(playerId, null, { listRefresh: true });
    }
    if (!ctx) return;
    _render();
  }

  // ================================================================
  //  操作：下半（本局条目表）
  // ================================================================
  function _setEntryLimit(name, raw) {
    if (!ctx || !ctx.canEdit || !name) return;
    const { playerId } = ctx;
    const txt = String(raw == null ? '' : raw).trim();
    if (!txt) { _deleteEntry(name); return; }        // 清空 = 删除该条
    const v = _num(txt, MIN_LIMIT, MAX_LIMIT, MIN_LIMIT);
    if (window.getStackRule(playerId, name) === v) { _renderEntries(); return; }
    if (typeof broadcastSystemMsg === 'function') {
      broadcastSystemMsg('【系统】' + getPlayerName(playerId) + '把「' + name + '」的本局堆叠上限设为 ' + v);
    }
    _asSelfOp(function () { window.setStackRule(playerId, name, v); });   // 内部会重算 + 同步 + 刷新列表
    _reloadList(playerId);
    _render();
  }

  function _deleteEntry(name) {
    if (!ctx || !ctx.canEdit || !name) return;
    const { playerId } = ctx;
    if (typeof broadcastSystemMsg === 'function') {
      broadcastSystemMsg('【系统】' + getPlayerName(playerId) + '删除了「' + name + '」的本局堆叠设置（该牌名回到普通牌，不再堆叠）');
    }
    _asSelfOp(function () { window.removeStackRule(playerId, name); });   // 内部会重算 + 同步 + 刷新列表
    _reloadList(playerId);
    _render();
  }

  function _addEntry() {
    if (!ctx || !ctx.canEdit) return;
    const { playerId } = ctx;
    const name = String(els.addInput.value || '').trim();
    if (!name) {
      if (typeof broadcastSystemMsg === 'function') broadcastSystemMsg('【系统】请先输入卡牌名');
      return;
    }
    const exist = (typeof window.getStackRule === 'function') ? window.getStackRule(playerId, name) : null;
    if (exist !== null && exist > 0) {
      if (typeof broadcastSystemMsg === 'function') broadcastSystemMsg('【系统】「' + name + '」已经在堆叠列表里了');
      return;
    }
    if (typeof broadcastSystemMsg === 'function') {
      broadcastSystemMsg('【系统】' + getPlayerName(playerId) + '为「' + name + '」新增了本局堆叠（上限 ' + DEFAULT_NEW_LIMIT + '）');
    }
    _asSelfOp(function () { window.addStackRule(playerId, name, DEFAULT_NEW_LIMIT); });
    els.addInput.value = '';
    _reloadList(playerId);
    _render();
  }

  // ================================================================
  //  对外
  // ================================================================
  window.StackManage = {
    open,
    close,
    isOpenFor,
    refreshCard,
    refreshOpen,
    buildInline,
    limitOf,
    /* 调试/测试用 */
    _debug: function () {
      return { open: !!(ov && !ov.hidden), ctx: ctx ? { playerId: ctx.playerId, name: ctx.card && ctx.card.name, canEdit: ctx.canEdit } : null };
    },
    _minLimit: MIN_LIMIT,
    _maxLimit: MAX_LIMIT,
  };

  // 点背景不关闭（与协战窗一致：只能点 ✕ / 关闭）
  // Esc：不关本窗，但要拦住事件，避免把后面的手牌/牌库弹窗一起关掉
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!ov || ov.hidden) return;
    e.stopPropagation();
    e.preventDefault();
  }, true);
})();
