// ================================================================
//  js/show-hand.js — 展示机制
//  目标选择由 dice.js 瞄准模式完成（点牌手头像/点式神卡槽），
//  本模块负责数量弹窗与展示执行/取消。
//  依赖: CardDB, card-deck (playerHandShows, refreshOpenListDialog)
// ================================================================

const ShowHand = (() => {
  let overlay = null;
  let ctx = null; // { type: 'player' | 'shikigami', playerId, shikigamiName }

  /** 初始化数量弹窗 DOM（一次性） */
  function init() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'showhand-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="showhand-dialog">
        <div class="showhand-dialog__header">
          <span class="showhand-dialog__title" id="showhand-title">👁 展示</span>
          <button type="button" class="showhand-dialog__close" title="关闭">✕</button>
        </div>
        <div class="showhand-dialog__body">
          <div class="showhand-qty-label">展示几张手牌？</div>
          <div class="showhand-qty-row">
            <button type="button" class="showhand-qty-btn" id="showhand-minus">−</button>
            <input type="number" class="showhand-qty-input" id="showhand-qty" value="1" min="1" max="99">
            <button type="button" class="showhand-qty-btn" id="showhand-plus">＋</button>
          </div>
          <div class="showhand-dialog__actions">
            <button type="button" class="showhand-btn showhand-btn--cancel" id="showhand-cancel">取消</button>
            <button type="button" class="showhand-btn showhand-btn--confirm" id="showhand-confirm">✅ 确定</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.showhand-dialog__close').addEventListener('click', close);
    overlay.querySelector('#showhand-cancel').addEventListener('click', close);
    overlay.querySelector('#showhand-confirm').addEventListener('click', confirm);
    overlay.querySelector('#showhand-minus').addEventListener('click', () => step(-1));
    overlay.querySelector('#showhand-plus').addEventListener('click', () => step(1));
    const qty = overlay.querySelector('#showhand-qty');
    qty.addEventListener('input', () => {
      let v = parseInt(qty.value, 10);
      if (isNaN(v) || v < 1) v = 1;
      qty.value = v;
    });
    qty.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirm(); });
  }

  /** 手牌所属式神名 */
  function cardOwnerName(card) {
    if (!card || !card.name) return null;
    const db = CardDB.lookup(card.name);
    if (!db) return null;
    return db.owner || null;
  }

  /** 数量步进（不限制上限，玩家输入多少就是多少，结算时才算） */
  function step(delta) {
    const qty = overlay.querySelector('#showhand-qty');
    let v = parseInt(qty.value, 10) || 1;
    v = Math.max(1, Math.min(99, v + delta));
    qty.value = v;
  }

  /** 打开数量弹窗（由 dice.js 在选完目标后调用） */
  function openPrompt(type, playerId, shikigamiName) {
    init();
    ctx = { type, playerId, shikigamiName: shikigamiName || '' };
    const tgtName = getPlayerName(playerId);
    const title = overlay.querySelector('#showhand-title');
    title.textContent = ctx.type === 'shikigami'
      ? `👁 展示 — ${tgtName}的「${ctx.shikigamiName}」手牌`
      : `👁 展示 — ${tgtName}的随机手牌`;
    overlay.querySelector('#showhand-qty').value = 1;
    overlay.hidden = false;
    overlay.style.display = 'flex';
    overlay.querySelector('#showhand-qty').focus();
  }

  /** 确定展示：结算时才算能展示哪些牌、实际展示多少、多少无效 */
  function confirm() {
    if (!ctx) return;
    const state = getPlayerCardState(ctx.playerId);
    const hand = (state.hand || []).filter(c => c && typeof c === 'object');
    const shownSet = playerHandShows[ctx.playerId] || new Set();
    // 只展示符合条件的「未被展示」的牌，已展示的不重复展示
    let pool = hand.filter(c => !shownSet.has(c.id));
    if (ctx.type === 'shikigami') pool = pool.filter(c => cardOwnerName(c) === ctx.shikigamiName);

    const requested = parseInt(overlay.querySelector('#showhand-qty').value, 10);
    let want = requested;
    if (isNaN(want) || want < 1) want = 1;
    const n = Math.min(want, pool.length);        // 实际展示数
    const invalid = want - n;                     // 无效数（无符合条件/已展示）
    const picked = shuffleCards(pool.slice()).slice(0, n);

    if (n > 0) {
      if (!playerHandShows[ctx.playerId]) playerHandShows[ctx.playerId] = new Set();
      picked.forEach(c => playerHandShows[ctx.playerId].add(c.id));
      if (typeof isConnected === 'function' && isConnected() && typeof sendToPeer === 'function') {
        sendToPeer({ type: 'hand-shown', playerId: ctx.playerId, cardIds: [...playerHandShows[ctx.playerId]] });
      }
      if (typeof refreshOpenListDialog === 'function') refreshOpenListDialog(ctx.playerId);
    }

    const opPid = (typeof localPlayerId !== 'undefined' && localPlayerId && localPlayerId !== '0') ? localPlayerId : '1';
    const opName = getPlayerName(opPid);
    const tgtName = getPlayerName(ctx.playerId);
    const isHelp = String(opPid) !== String(ctx.playerId);
    const loc = ctx.type === 'shikigami' ? `${tgtName}的「${ctx.shikigamiName}」` : tgtName;
    // 提示里写明：实际展示多少、多少无效
    let msg;
    if (invalid === 0) {
      msg = isHelp ? `【系统】${opName}展示了${loc}的${n}张手牌` : `【系统】${opName}展示了${n}张手牌`;
    } else if (n > 0) {
      msg = isHelp
        ? `【系统】${opName}展示了${loc}的${n}张手牌，另有${invalid}张无效（已被展示或无符合条件）`
        : `【系统】${opName}展示了${n}张手牌，另有${invalid}张无效（已被展示或无符合条件）`;
    } else {
      msg = isHelp
        ? `【系统】${opName}未能展示${loc}的手牌：${invalid}张全部无效（均已被展示或无符合条件）`
        : `【系统】${opName}未能展示手牌：${invalid}张全部无效（均已被展示或无符合条件）`;
    }
    broadcastSystemMsg(msg);
    close();
  }

  function close() {
    if (overlay) { overlay.hidden = true; overlay.style.display = 'none'; }
    ctx = null;
  }

  return { openPrompt, close };
})();
