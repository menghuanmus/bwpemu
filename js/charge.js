// ================================================================
//  js/charge.js — 蓄力系统
//  手牌蓄力、准心模式选择式神、蓄力管理面板（完成使用/取消）
//  依赖: CardDB, card-deck (手牌状态), game-core (卡槽), chat (广播)
// ================================================================

const Charge = (() => {
  let overlay, dialog;
  let _currentSlot = null;       // 当前管理的式神卡槽

  // ================================================================
  //  初始化 DOM
  // ================================================================
  function init() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'charge-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="charge-dialog">
        <div class="charge-dialog__header">
          <span class="charge-dialog__title">⚡ 蓄力管理</span>
          <button type="button" class="charge-dialog__close" title="关闭">✕</button>
        </div>
        <div class="charge-dialog__body" id="charge-body"></div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('.charge-dialog__close').addEventListener('click', closePanel);
  }

  // ================================================================
  //  辅助函数
  // ================================================================

  /** 获取己方战场上的式神卡槽（有名字的） */
  function getOwnShikigamiSlots(playerId) {
    const zone = document.querySelector(`.player-zone[data-player="${playerId}"]`);
    if (!zone) return [];
    return Array.from(zone.querySelectorAll('.card-slot')).filter(s => {
      const name = (s.querySelector('.card-name') || {}).value || '';
      return name.trim() && s.dataset.slotType !== 'summon';
    });
  }

  /** 根据式神名找到己方卡槽 */
  function findSlotByName(playerId, shikigamiName) {
    const slots = getOwnShikigamiSlots(playerId);
    return slots.find(s => {
      const name = (s.querySelector('.card-name') || {}).value || '';
      return name.trim() === shikigamiName.trim();
    }) || null;
  }

  /** 获取卡牌所属式神名 */
  function getCardOwnerName(card) {
    if (!card || !card.name) return null;
    const db = CardDB.lookup(card.name);
    if (!db) return null;
    if (db.type === 'shikigami') return db.name;
    if (db.owner) return db.owner;
    return null;
  }

  /** 在某玩家手牌中查找同名卡牌 */
  function findCardInHand(playerId, cardName) {
    const state = getPlayerCardState(playerId);
    if (!state || !state.hand) return null;
    return state.hand.find(c => c && c.name && c.name.trim() === cardName.trim()) || null;
  }

  /** 更新式神卡槽的蓄力指示器 + 光点 */
  function updateIndicator(slot) {
    // 移除旧指示器和光点
    const existingIndicator = slot.querySelector('.charge-indicator');
    if (existingIndicator) existingIndicator.remove();
    slot.querySelectorAll('.charge-dot').forEach(d => d.remove());

    const cards = slot._chargedCards || [];
    if (cards.length === 0) {
      slot.classList.remove('charging');
      return;
    }

    slot.classList.add('charging');

    // 创建 N 个金色环绕光点（每张蓄力牌一个），错开相位
    for (let i = 0; i < cards.length; i++) {
      const dot = document.createElement('div');
      dot.className = 'charge-dot';
      dot.style.animationDelay = (i * (4 / cards.length)) + 's';
      slot.appendChild(dot);
    }

    // 创建蓄力指示器（使用 button 确保点击可靠）
    const indicator = document.createElement('button');
    indicator.type = 'button';
    indicator.className = 'charge-indicator';
    indicator.textContent = '⚡ 蓄力中 ×' + cards.length;

    indicator.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      openPanel(slot);
    });

    slot.appendChild(indicator);
  }

  /** 广播蓄力消息 */
  function broadcastCharge(playerId, shikigamiName, cardName) {
    const playerName = (typeof getPlayerName === 'function') ? getPlayerName(playerId) : ('玩家' + playerId);
    // 广播版：不暴露牌名
    broadcastSystemMsg('【系统】' + playerName + '使「' + shikigamiName + '」蓄力了一张牌');
    // 本地详细版
    if (typeof addSystemChatMessage === 'function') {
      addSystemChatMessage('【系统】' + playerName + '使「' + shikigamiName + '」蓄力了「' + cardName + '」（此信息仅你可见）');
    }
  }

  // ================================================================
  //  蓄力核心操作
  // ================================================================

  /** 将一张手牌放入式神蓄力 */
  function addChargeToSlot(slot, card, playerId, animFrom) {
    if (!slot._chargedCards) slot._chargedCards = [];

    // 从手牌移除
    const state = getPlayerCardState(playerId);
    if (state && state.hand) {
      const idx = state.hand.findIndex(c => c && c.id === card.id);
      if (idx >= 0) state.hand.splice(idx, 1);
    }

    // 加入蓄力列表
    slot._chargedCards.push({
      cardId: card.id,
      cardName: card.name,
      cardData: JSON.parse(JSON.stringify(card)),
      chargedBy: playerId,
    });

    const shikigamiName = (slot.querySelector('.card-name') || {}).value || '未知式神';
    broadcastCharge(playerId, shikigamiName, card.name);

    // 卡牌飞行动画：从来源位置飞到式神卡槽
    if (animFrom && typeof CardFlight !== 'undefined') {
      const fromCoord = CardFlight._centerOf(animFrom);
      const toCoord = CardFlight._centerOf(slot);
      CardFlight.fly(fromCoord, toCoord, { duration: 0.5, arcHeight: 60 });
      // 广播动画给对手
      CardFlight._broadcastAnim({
        action: 'fly-single',
        playerId: playerId,
        fromType: null,
        fromCoord: fromCoord,
        toType: null,
        toCoord: toCoord,
        opts: { duration: 0.5, arcHeight: 60 }
      });
    }

    updateIndicator(slot);
    if (typeof updateDeckButtons === 'function') updateDeckButtons(playerId);
    if (typeof refreshOpenListDialog === 'function') refreshOpenListDialog(playerId);
    if (typeof reapplyChargeToggle === 'function') reapplyChargeToggle();
    if (typeof syncSlotToPeer === 'function') syncSlotToPeer(slot);
    if (typeof syncDeckStateForce === 'function') syncDeckStateForce(playerId);
  }

  // ================================================================
  //  入口 A：手牌中的蓄力按钮
  // ================================================================

  function startFromHand(playerId, card) {
    const slots = getOwnShikigamiSlots(playerId);
    if (slots.length === 0) {
      broadcastSystemMsg('【系统】没有可用的式神来蓄力');
      return;
    }

    const ownerName = getCardOwnerName(card);

    if (ownerName) {
      // 有 owner，直接找对应式神
      const slot = findSlotByName(playerId, ownerName);
      if (slot) {
        // 动画来源：手牌按钮
        const handBtn = (typeof CardFlight !== 'undefined') ? CardFlight.getPlayerBtn(playerId, 'hand') : null;
        addChargeToSlot(slot, card, playerId, handBtn);
      } else {
        broadcastSystemMsg('【系统】战场上找不到所属式神「' + ownerName + '」');
      }
    } else {
      // 没有 owner（中立牌等），弹出式神选择
      _promptSelectShikigami(playerId, card, slots);
    }
  }

  /** 选择式神弹窗（中立牌使用，包含双方式神） */
  function _promptSelectShikigami(playerId, card, ownSlots) {
    // 获取双方所有式神
    const opponentId = playerId === '1' ? '2' : '1';
    const oppSlots = getOwnShikigamiSlots(opponentId);
    
    // 构建列表：己方 + 分割线 + 对方
    const slotItems = [];
    ownSlots.forEach(s => {
      const name = (s.querySelector('.card-name') || {}).value || '未知';
      slotItems.push({ name, slot: s, isOwn: true });
    });
    if (oppSlots.length > 0) {
      slotItems.push({ name: '── 对方式神 ──', slot: null, isDivider: true });
      oppSlots.forEach(s => {
        const name = (s.querySelector('.card-name') || {}).value || '未知';
        slotItems.push({ name, slot: s, isOwn: false });
      });
    }

    const selectOverlay = document.createElement('div');
    selectOverlay.className = 'charge-overlay';
    selectOverlay.style.display = 'flex';
    selectOverlay.innerHTML = `
      <div class="charge-dialog" style="width:320px;">
        <div class="charge-dialog__header">
          <span class="charge-dialog__title">🎯 选择蓄力式神</span>
          <button type="button" class="charge-dialog__close" title="关闭">✕</button>
        </div>
        <div class="charge-dialog__body" style="display:flex;flex-direction:column;gap:8px;">
          ${slotItems.map(item => {
            if (item.isDivider) {
              return '<div style="text-align:center;color:#908060;font-size:12px;padding:4px 0;border-top:1px solid rgba(200,160,60,0.2);">' + item.name + '</div>';
            }
            const label = item.isOwn ? item.name : item.name;
            return '<button type="button" class="charge-btn charge-btn--complete" data-slot-player="' + item.slot.dataset.slotPlayer + '" data-slot-name="' + escapeHTML(item.name) + '" style="width:100%;text-align:center;">' + escapeHTML(label) + '</button>';
          }).join('')}
        </div>
      </div>
    `;
    document.body.appendChild(selectOverlay);

    const closeIt = () => {
      selectOverlay.remove();
    };

    selectOverlay.querySelector('.charge-dialog__close').addEventListener('click', closeIt);
    selectOverlay.querySelectorAll('.charge-btn--complete').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.slotName;
        const slotPlayer = btn.dataset.slotPlayer;
        // 根据式神名和所属玩家找卡槽
        const slot = findSlotByName(slotPlayer, name);
        if (slot) {
          const handBtn = (typeof CardFlight !== 'undefined') ? CardFlight.getPlayerBtn(playerId, 'hand') : null;
          addChargeToSlot(slot, card, playerId, handBtn);
        }
        closeIt();
      });
    });
  }

  // ================================================================
  //  入口 B：中心栏机制按钮 → 共享瞄准系统（dice.js handleTargetClick 调用）
  // ================================================================

  function chargeByName(slot, playerId, cardName) {
    if (!cardName) return;
    // 凭空创建一张牌（不依赖手牌）
    const card = createCard(cardName);
    // 动画来源：己方战场中心
    const fieldCenter = (typeof CardFlight !== 'undefined')
      ? (document.querySelector('.player-zone[data-player="' + playerId + '"] .field-layout') || document.querySelector('.player-zone[data-player="' + playerId + '"]'))
      : null;
    addChargeToSlot(slot, card, playerId, fieldCenter);
  }

  // ================================================================
  //  蓄力管理面板
  // ================================================================

  function openPanel(slot) {
    init();
    _currentSlot = slot;
    try {
      renderPanel();
    } catch(e) {
      console.error('[Charge] renderPanel error:', e);
    }
    overlay.hidden = false;
    overlay.style.display = 'flex';
  }

  function closePanel() {
    overlay.hidden = true;
    overlay.style.display = 'none';
    _currentSlot = null;
  }

  function renderPanel() {
    const body = document.getElementById('charge-body');
    if (!body) return;

    const slot = _currentSlot;
    if (!slot) {
      body.innerHTML = '<div class="charge-empty">没有蓄力中的牌</div>';
      return;
    }

    const cards = slot._chargedCards || [];
    if (cards.length === 0) {
      body.innerHTML = '<div class="charge-empty">没有蓄力中的牌</div>';
      return;
    }

    const slotPlayerId = slot.dataset.slotPlayer;
    // 获取当前查看者的 playerId
    const viewerId = (typeof getViewerPlayerId === 'function') ? getViewerPlayerId() : (localPlayerId || '1');

    body.innerHTML = cards.map((charged, idx) => {
      const chargedBy = charged.chargedBy || slotPlayerId;
      const isPlaceholder = charged.cardId === -1 || chargedBy === '?';
      const isMyCharge = !isPlaceholder && String(chargedBy) === String(viewerId);

      const displayName = isMyCharge ? escapeHTML(charged.cardName || '(未知)') : '未知（仅使用者可操作）';
      const nameClass = isMyCharge ? 'charge-card-name' : 'charge-card-name charge-card-name--unknown';

      const actionsHTML = isMyCharge ? `
          <div class="charge-card-actions-area">
            <button type="button" class="charge-btn charge-btn--complete" data-action="complete" data-idx="${idx}">⚡ 完成使用</button>
            <button type="button" class="charge-btn charge-btn--cancel" data-action="cancel" data-idx="${idx}">✕ 取消蓄力</button>
            <button type="button" class="charge-btn charge-btn--return" data-action="return" data-idx="${idx}">↩ 退回手牌</button>
          </div>` : `
          <div class="charge-card-actions-area">
            <div style="color:#908060;font-size:12px;text-align:center;">不可操作</div>
          </div>`;

      return `
        <div class="charge-card-entry" data-charge-idx="${idx}">
          <div class="charge-card-name-area">
            <div class="${nameClass}" data-card-name="${displayName}">${displayName}</div>
          </div>
          ${actionsHTML}
        </div>
      `;
    }).join('');

    bindPanelEvents(body, slot, cards, slotPlayerId);
  }

  function bindPanelEvents(body, slot, cards, slotPlayerId) {
    const viewerId = (typeof getViewerPlayerId === 'function') ? getViewerPlayerId() : (localPlayerId || '1');

    body.querySelectorAll('[data-action="complete"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        const charged = (slot._chargedCards || [])[idx];
        if (!charged) return;
        const chargeOwner = charged.chargedBy || slotPlayerId;
        if (String(chargeOwner) !== String(viewerId)) return;
        completeCharge(slot, idx, chargeOwner);
        closePanel();
      });
    });

    body.querySelectorAll('[data-action="cancel"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        const charged = (slot._chargedCards || [])[idx];
        if (!charged) return;
        const chargeOwner = charged.chargedBy || slotPlayerId;
        if (String(chargeOwner) !== String(viewerId)) return;
        cancelCharge(slot, idx, chargeOwner);
        closePanel();
      });
    });

    body.querySelectorAll('[data-action="return"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        const charged = (slot._chargedCards || [])[idx];
        if (!charged) return;
        const chargeOwner = charged.chargedBy || slotPlayerId;
        if (String(chargeOwner) !== String(viewerId)) return;
        returnToHand(slot, idx, chargeOwner);
        closePanel();
      });
    });
  }

  // ================================================================
  //  完成蓄力
  // ================================================================

  function completeCharge(slot, idx, playerId) {
    const cards = slot._chargedCards || [];
    if (idx < 0 || idx >= cards.length) return;

    const charged = cards[idx];
    cards.splice(idx, 1);

    // 将牌放回手牌，然后走标准使用流程（removeFromHand 会广播使用消息、处理形态/觉醒/幻境等）
    const state = getPlayerCardState(playerId);
    if (state && state.hand) {
      const tempCard = JSON.parse(JSON.stringify(charged.cardData || { name: charged.cardName }));
      tempCard.id = charged.cardId;
      state.hand.push(tempCard);
      // 设置标记，让 removeFromHand 知道这是蓄力完成
      window._chargeCompleting = true;
      try {
        if (typeof removeFromHand === 'function') {
          removeFromHand(playerId, charged.cardId, 'use');
        }
      } finally {
        window._chargeCompleting = false;
      }
    }

    updateAfterChargeAction(slot, playerId);
  }

  // ================================================================
  //  取消蓄力
  // ================================================================

  function cancelCharge(slot, idx, playerId) {
    const cards = slot._chargedCards || [];
    if (idx < 0 || idx >= cards.length) return;

    const charged = cards[idx];
    cards.splice(idx, 1);

    const playerName = (typeof getPlayerName === 'function') ? getPlayerName(playerId) : ('玩家' + playerId);

    broadcastSystemMsg('【系统】' + playerName + '取消了一张蓄力牌');
    if (typeof addSystemChatMessage === 'function') {
      addSystemChatMessage('【系统】' + playerName + '取消了蓄力「' + charged.cardName + '」（此信息仅你可见）');
    }

    updateAfterChargeAction(slot, playerId);
  }

  // ================================================================
  //  退回手牌
  // ================================================================

  function returnToHand(slot, idx, playerId) {
    const cards = slot._chargedCards || [];
    if (idx < 0 || idx >= cards.length) return;

    const charged = cards[idx];
    cards.splice(idx, 1);

    const state = getPlayerCardState(playerId);
    if (state && state.hand) {
      const card = JSON.parse(JSON.stringify(charged.cardData || { name: charged.cardName }));
      card.id = charged.cardId;
      state.hand.push(card);
    }

    const playerName = (typeof getPlayerName === 'function') ? getPlayerName(playerId) : ('玩家' + playerId);
    broadcastSystemMsg('【系统】' + playerName + '退回了一张蓄力牌');
    if (typeof addSystemChatMessage === 'function') {
      addSystemChatMessage('【系统】' + playerName + '退回了蓄力「' + charged.cardName + '」到手牌（此信息仅你可见）');
    }

    updateAfterChargeAction(slot, playerId);
    if (typeof syncDeckStateForce === 'function') syncDeckStateForce(playerId);
  }

  /** 蓄力操作后的统一清理 */
  function updateAfterChargeAction(slot, playerId) {
    updateIndicator(slot);
    if (typeof updateDeckButtons === 'function') updateDeckButtons(playerId);
    if (typeof refreshOpenListDialog === 'function') refreshOpenListDialog(playerId);
    if (typeof syncSlotToPeer === 'function') syncSlotToPeer(slot);
  }

  // ================================================================
  //  气绝处理（由 game-core / dice 调用）
  // ================================================================

  function handleSlotKO(slot, skipSync) {
    const cards = slot._chargedCards || [];
    if (cards.length === 0) return;

    const playerId = slot.dataset.slotPlayer;
    const removedCount = cards.length;
    slot._chargedCards = [];

    if (removedCount > 0) {
      const playerName = (typeof getPlayerName === 'function') ? getPlayerName(playerId) : ('玩家' + playerId);
      const shikigamiName = (slot.querySelector('.card-name') || {}).value || '未知式神';
      broadcastSystemMsg('【系统】' + playerName + '的「' + shikigamiName + '」气绝了，蓄力中的 ' + removedCount + ' 张牌随之消散');
    }

    updateIndicator(slot);
    if (!skipSync && typeof syncSlotToPeer === 'function') syncSlotToPeer(slot);
  }

  // ================================================================
  //  公开 API
  // ================================================================

  return {
    startFromHand,
    chargeByName,
    openPanel,
    closePanel,
    updateIndicator,
    handleSlotKO,
    findSlotByName,
    addChargeToSlot,
    returnToHand,
  };
})();