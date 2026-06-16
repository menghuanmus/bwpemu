// ================================================================
//  js/card-deck.js — 牌库与手牌系统 (JS-5)
//  牌库管理、手牌操作、抽牌/弃置/使用、牌库分组视图、占卜系统、随机灵咒
//  依赖: CardDB, network.js, game-core.js (createEffectItem等)
// ================================================================

    //  JS-5：牌库/手牌系统
    // ================================================================
    let cardIdCounter = 0;

    /** 根据当前所有卡牌更新 cardIdCounter，避免导入后ID冲突 */
    function updateCardIdCounter() {
      let maxId = 0;
      ['1', '2'].forEach(pid => {
        const st = getPlayerCardState(pid);
        [st.deck, st.hand, st.grave || []].forEach(arr => {
          (arr || []).forEach(c => { if (c && typeof c.id === 'number' && c.id > maxId) maxId = c.id; });
        });
      });
      cardIdCounter = Math.max(cardIdCounter, maxId);
    }

    const playerCards = {
      '1': { deck: [], hand: [], grave: [] },
      '2': { deck: [], hand: [], grave: [] },
    };

    // 玩家通过占卜揭示的对方卡牌ID（仅本地追踪，不同步）
    // { viewerPlayerId: Set of card ids }
    const playerRevealedCards = {
      '1': new Set(),
      '2': new Set(),
    };

    // 玩家通过命运抉择揭示的对方卡牌ID
    const playerFateRevealedCards = {
      '1': new Set(),
      '2': new Set(),
    };

    /** 获取当前查看者ID */
    function getViewerPlayerId() {
      if (typeof isSpectator !== 'undefined' && isSpectator) return '0';
      if (typeof localPlayerId !== 'undefined' && localPlayerId && localPlayerId !== '0') {
        return localPlayerId;
      }
      return '1';
    }

    /** 当前查看的牌库/手牌是否属于自己 */
    function isViewingOwnCards(playerId) {
      if (typeof isSoloMode !== 'undefined' && isSoloMode) return true;
      return String(playerId) === String(getViewerPlayerId());
    }

    const cardTextOverlay = document.getElementById('card-text-dialog-overlay');
    const cardTextTitle = document.getElementById('card-text-dialog-title');
    const cardTextInput = document.getElementById('card-text-dialog-input');
    const cardListOverlay = document.getElementById('card-list-dialog-overlay');
    const cardListTitle = document.getElementById('card-list-dialog-title');
    const cardListBody = document.getElementById('card-list-dialog-body');
    const cardListBreakdownBtn = document.getElementById('card-list-breakdown-btn');
    const deckBreakdownPanel = document.getElementById('deck-breakdown-panel');
    const deckBreakdownTitle = document.getElementById('deck-breakdown-title');
    const deckBreakdownBody = document.getElementById('deck-breakdown-body');
    const deckBreakdownClose = document.getElementById('deck-breakdown-close');

    let cardTextContext = null;
    let cardListContext = null;

    function getPlayerZone(playerId) {
      return document.querySelector(`.player-zone[data-player="${playerId}"]`);
    }

    function getPlayerCardState(playerId) {
      return playerCards[playerId];
    }

    function createCard(name) {
      return { id: ++cardIdCounter, name: name.trim(), curses: [] };
    }

    function shuffleCards(cards) {
      for (let i = cards.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [cards[i], cards[j]] = [cards[j], cards[i]];
      }
      return cards;
    }

    function parseCardLines(text) {
      return text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    }

    function updateDeckButtons(playerId) {
      const zone = getPlayerZone(playerId);
      if (!zone) return;
      const spec = (typeof isSpectator !== 'undefined' && isSpectator);
      const own = (typeof isMyZone === 'function') ? isMyZone(playerId) : true;
      const { deck, hand } = getPlayerCardState(playerId);
      const drawBtn = zone.querySelector('.btn-deck[data-action="draw"]');
      const handBtn = zone.querySelector('.btn-deck[data-action="hand"]');
      const deckBtn = zone.querySelector('.btn-deck[data-action="deck"]');
      const shuffleBtn = zone.querySelector('.btn-deck[data-action="shuffle-deck"]');
      const addHandBtn = zone.querySelector('.btn-deck[data-action="add-hand"]');
      const addDeckBtn = zone.querySelector('.btn-deck[data-action="add-deck"]');
      const importBtn = zone.querySelector('.btn-deck[data-action="import-deck"]');
      // 非己方区域：禁用所有操作按钮，仅保留查看
      const lockActions = spec || !own;
      if (drawBtn)     drawBtn.disabled     = lockActions || deck.length === 0;
      if (shuffleBtn)  shuffleBtn.disabled  = lockActions || deck.length === 0;
      if (addHandBtn)  addHandBtn.disabled  = lockActions;
      if (addDeckBtn)  addDeckBtn.disabled  = lockActions;
      if (importBtn)   importBtn.disabled   = lockActions;
      // 启悟区按钮也锁定
      const oracleBtn = zone.querySelector('.btn-deck--oracle');
      if (oracleBtn && lockActions) oracleBtn.disabled = true;
      if (handBtn) {
        handBtn.textContent = hand.length ? `手牌（${hand.length}）` : '手牌';
      }
      if (deckBtn) {
        deckBtn.textContent = deck.length ? `牌库（${deck.length}）` : '牌库';
      }
    }

    function updateAllDeckButtons() {
      updateDeckButtons('1');
      updateDeckButtons('2');
    }

    function openCardTextDialog({ title, placeholder, multiline, onConfirm }) {
      cardTextContext = { onConfirm };
      cardTextTitle.textContent = title;
      cardTextInput.value = '';
      cardTextInput.placeholder = placeholder;
      cardTextInput.rows = multiline ? 6 : 2;
      cardTextOverlay.hidden = false;
      document.getElementById('card-text-dialog-quantity').value = '1';
      cardTextInput.focus();
    }

    function closeCardTextDialog() {
      cardTextOverlay.hidden = true;
      cardTextContext = null;
      cardTextInput.value = '';
    }

    function confirmCardTextDialog() {
      if (!cardTextContext) return;
      const value = cardTextInput.value;
      const qtyEl = document.getElementById('card-text-dialog-quantity');
      let qty = parseInt(qtyEl ? qtyEl.value : '1', 10);
      if (isNaN(qty) || qty < 1) qty = 1;
      cardTextContext.onConfirm(value, qty);
      closeCardTextDialog();
    }

    function renderHandList(playerId) {
      try {
      let { hand } = getPlayerCardState(playerId);
      hand = (hand || []).filter(c => c && typeof c === 'object');
      getPlayerCardState(playerId).hand = hand;
      cardListBody.innerHTML = '';
      document.getElementById('deck-summary-header').hidden = true; // 隐藏牌库汇总
      if (!hand || !hand.length) {
        const empty = document.createElement('div');
        empty.className = 'card-list-empty';
        empty.textContent = '手牌为空';
        cardListBody.appendChild(empty);
        return;
      }
      const ownCards = isViewingOwnCards(playerId);
      hand.forEach((card, idx) => {
        if (!card || typeof card !== 'object') return;
        const item = document.createElement('div');
        item.className = 'card-list-item';
        const info = document.createElement('div');
        info.className = 'card-list-item__info';
        // 查看对手手牌：隐藏灵咒数据
        if (ownCards && card.curses && card.curses.length) {
          info.dataset.cardCurses = JSON.stringify(card.curses);
        }
        const name = document.createElement('span');
        name.className = 'card-list-item__name';
        if (ownCards) {
          name.textContent = card.name || '(未命名)';
          // 食材牌/佳肴：存储数据供浮窗显示
          if (card._food) {
            name.dataset.food = JSON.stringify(card);
          }
        } else {
          name.textContent = '未知';
          name.style.color = 'var(--text-muted, #888)';
        }
        info.appendChild(name);
        // 堆叠层数显示
        if (ownCards && card._stack && card._maxStack) {
          const stackSpan = document.createElement('span');
          stackSpan.style.cssText = 'font-size:11px;color:#c0a860;margin-left:4px;white-space:nowrap;';
          stackSpan.textContent = '堆叠：' + card._stack + '/' + card._maxStack;
          info.appendChild(stackSpan);
        }
        // 灵咒标签（仅自己可见）
        if (ownCards && card.curses && card.curses.length) {
          const curseTags = document.createElement('div');
          curseTags.className = 'card-list-item__curses';
          card.curses.forEach(c => {
            const tag = document.createElement('span');
            tag.className = 'card-list-curse-tag';
            tag.dataset.curseName = c.name;
            tag.textContent = '⛓️' + c.name + '×' + c.layers;
            tag.addEventListener('click', (e) => { e.stopPropagation(); openCursePanel(_curseTargetForCard(playerId, card, '手牌中的')); });
            curseTags.appendChild(tag);
          });
          info.appendChild(curseTags);
        }
        item.appendChild(info);
        // 操作按钮（仅自己可见）
        if (ownCards) {
        const actions = document.createElement('div');
        actions.className = 'card-list-item__actions';
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'btn-card-curse-add';
        addBtn.textContent = '➕';
        addBtn.title = '添加灵咒';
        addBtn.addEventListener('click', (e) => { e.stopPropagation(); openCursePanel(_curseTargetForCard(playerId, card, '手牌中的')); });
        actions.appendChild(addBtn);
        const useBtn = document.createElement('button');
        useBtn.type = 'button';
        useBtn.className = 'btn-card-action btn-card-use';
        useBtn.textContent = '使用';
        useBtn.addEventListener('click', () => removeFromHand(playerId, card.id, 'use'));
        const renyinBtn = document.createElement('button');
        renyinBtn.type = 'button';
        renyinBtn.className = 'btn-card-action btn-card-renyin';
        renyinBtn.textContent = '连引';
        renyinBtn.title = '连引使用：设置搜索条件，从牌库连引其他卡牌';
        renyinBtn.hidden = true; // 默认隐藏，由左下角「连引使用」按钮切换
        renyinBtn.dataset.renyinBtn = 'true';
        renyinBtn.addEventListener('click', () => {
          if (typeof Renyin !== 'undefined') {
            Renyin.open(playerId, card);
          } else {
            broadcastSystemMsg('【系统】连引模块未加载');
          }
        });
        const discardBtn = document.createElement('button');
        discardBtn.type = 'button';
        discardBtn.className = 'btn-card-action btn-card-discard';
        discardBtn.textContent = '弃置';
        discardBtn.addEventListener('click', () => removeFromHand(playerId, card.id, 'discard'));
        actions.appendChild(useBtn);
        actions.appendChild(renyinBtn);
        actions.appendChild(discardBtn);
        // 置入牌库按钮
        const toDeckBtn = document.createElement('button');
        toDeckBtn.type = 'button';
        toDeckBtn.className = 'btn-card-action btn-card-to-deck';
        toDeckBtn.textContent = '置入牌库';
        toDeckBtn.addEventListener('click', () => moveToDeckFromHand(playerId, card.id));
        actions.appendChild(toDeckBtn);
        // 启悟机制激活时，显示"置入启悟"按钮
        if (typeof oracleActive !== 'undefined' && oracleActive[playerId] && typeof moveToOracle === 'function') {
          const oracleMoveBtn = document.createElement('button');
          oracleMoveBtn.type = 'button';
          oracleMoveBtn.className = 'btn-card-move-oracle';
          oracleMoveBtn.textContent = '置入启悟';
          oracleMoveBtn.addEventListener('click', () => moveToOracle(playerId, card.id));
          actions.appendChild(oracleMoveBtn);
        }
        item.appendChild(actions);
        } // end if (ownCards)
        cardListBody.appendChild(item);
      });
      } catch(e) {
        console.error('[RenderHand] 渲染手牌失败:', e);
        cardListBody.innerHTML = '<div class="card-list-empty">手牌渲染出错，请查看控制台</div>';
      }
    }

    function renderDeckList(playerId) {
      try {
      let { deck } = getPlayerCardState(playerId);
      // 过滤无效卡牌数据
      deck = (deck || []).filter(c => c && typeof c === 'object');
      getPlayerCardState(playerId).deck = deck;
      cardListBody.innerHTML = '';
      if (!deck.length) {
        const empty = document.createElement('div');
        empty.className = 'card-list-empty';
        empty.textContent = '牌库为空';
        cardListBody.appendChild(empty);
        document.getElementById('deck-summary-header').hidden = true;
        return;
      }

      const total = deck.length;
      const cursedCount = deck.filter(c => c.curses && c.curses.length).length;
      const viewerId = getViewerPlayerId();
      const revealedSet = playerRevealedCards[viewerId] || new Set();

      // 顶栏：总数 + 灵咒提示
      const summaryEl = document.getElementById('deck-summary-header');
      summaryEl.hidden = false;
      summaryEl.innerHTML = `<span class="deck-summary__total">📚 牌库（共${total}张）</span>`;
      if (cursedCount > 0) {
        summaryEl.innerHTML += `<span class="deck-summary__curse-hint">⚠ 牌库中有灵咒结附（${cursedCount}张）</span>`;
      }

      // ===== 统一按顺序排列（己方/对方均如此）=====
      const section = document.createElement('div');
      section.className = 'deck-group';
      const sectionHeader = document.createElement('div');
      sectionHeader.className = 'deck-group__header';
      sectionHeader.textContent = `▼ 牌库顺序（${total}）`;
      section.appendChild(sectionHeader);

      deck.forEach((card, idx) => {
        if (!card || typeof card !== 'object') return;
        const row = document.createElement('div');
        row.className = 'deck-group__row';

        const posSpan = document.createElement('span');
        posSpan.className = 'deck-group__count';
        posSpan.textContent = `#${idx + 1}`;
        posSpan.style.minWidth = '2.5em';
        row.appendChild(posSpan);

        const nameSpan = document.createElement('span');
        const isRevealed = revealedSet.has(card.id);
        const isFateRevealed = (playerFateRevealedCards[viewerId] && playerFateRevealedCards[viewerId].has(card.id));
        if (isRevealed || isFateRevealed) {
          nameSpan.className = 'deck-group__name';
          const labels = [];
          if (isRevealed) labels.push('已占卜');
          if (isFateRevealed) labels.push('已命运抉择');
          nameSpan.textContent = card.name + '（' + labels.join('，') + '）';
          nameSpan.style.cursor = 'help';
          // 食材牌/佳肴：存储数据供浮窗显示
          if (card._food) {
            nameSpan.dataset.food = JSON.stringify(card);
          }
          // 已揭示的灵咒标签
          if (card.curses && card.curses.length) {
            const curseSpan = document.createElement('span');
            curseSpan.className = 'breakdown-card-row__curses';
            curseSpan.style.marginLeft = '6px';
            card.curses.forEach(c => {
              const tag = document.createElement('span');
              tag.className = 'breakdown-card-row__curse-tag';
              tag.textContent = '⛓️' + c.name + '×' + c.layers;
              curseSpan.appendChild(tag);
            });
            row.appendChild(curseSpan);
          }
        } else {
          nameSpan.className = 'deck-group__name';
          nameSpan.textContent = '未知';
          nameSpan.style.color = 'var(--text-muted, #888)';
        }
        row.appendChild(nameSpan);

        // 弃牌按钮（仅自己牌库可见）
        if (isViewingOwnCards(playerId)) {
          const discardBtn = document.createElement('button');
          discardBtn.type = 'button';
          discardBtn.className = 'btn-card-action btn-card-discard';
          discardBtn.textContent = '弃牌';
          discardBtn.style.cssText = 'font-size:10px;padding:2px 6px;flex-shrink:0;';
          discardBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            discardFromDeckById(playerId, card.id);
          });
          row.appendChild(discardBtn);
        }

        section.appendChild(row);
      });
      cardListBody.appendChild(section);
      } catch(e) {
        console.error('[RenderDeck] 渲染牌库失败:', e);
        cardListBody.innerHTML = '<div class="card-list-empty">牌库渲染出错，请查看控制台</div>';
      }
    }

    // ---- 手牌/牌库弹窗拖拽 ----
    let cardListDragOffset = { x: 0, y: 0 };
    let cardListDragStart = null;
    const cardListDialogEl = cardListOverlay.querySelector('.speak-dialog');

    cardListTitle.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      cardListDragStart = { x: e.clientX - cardListDragOffset.x, y: e.clientY - cardListDragOffset.y };
      cardListDialogEl.style.cursor = 'grabbing';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!cardListDragStart || cardListOverlay.hidden) return;
      cardListDragOffset.x = e.clientX - cardListDragStart.x;
      cardListDragOffset.y = e.clientY - cardListDragStart.y;
      const tx = `translate(${cardListDragOffset.x}px, ${cardListDragOffset.y}px)`;
      cardListDialogEl.style.transform = tx;
      cardListDialogEl.style.transition = 'none';
      // 牌表侧窗跟随移动
      if (deckBreakdownPanel && !deckBreakdownPanel.hidden) {
        deckBreakdownPanel.style.transform = tx;
        deckBreakdownPanel.style.transition = 'none';
      }
    });

    document.addEventListener('mouseup', () => {
      if (!cardListDragStart) return;
      cardListDragStart = null;
      cardListDialogEl.style.cursor = '';
      if (deckBreakdownPanel) deckBreakdownPanel.style.cursor = '';
    });

    function openCardListDialog({ title, playerId, type }) {
      cardListContext = { playerId, type };
      // 重置连引按钮状态
      renyinBtnsVisible = false;
      const toggleBtn = document.getElementById('card-list-renyin-toggle');
      if (toggleBtn) {
        toggleBtn.hidden = (type !== 'hand' || !isViewingOwnCards(playerId));
        toggleBtn.textContent = '🔗 连引使用';
        toggleBtn.style.background = 'linear-gradient(180deg,#4a3a6a,#3a2a5a)';
        toggleBtn.style.color = '#c0b0e0';
      }
      cardListTitle.textContent = title;
      // 先清除牌库汇总（防止切换视图时残留）
      document.getElementById('deck-summary-header').hidden = true;
      document.getElementById('deck-summary-header').innerHTML = '';
      if (type === 'hand') renderHandList(playerId);
      else renderDeckList(playerId);
      // 牌表按钮：仅自己牌库可见（查看对手牌库时隐藏）
      cardListBreakdownBtn.hidden = (type !== 'deck' || !isViewingOwnCards(playerId));
      cardListBreakdownBtn.textContent = '📋 查看牌表';
      // 初始手牌按钮：仅在自己手牌弹窗中显示
      const initialHandBtn = document.getElementById('card-list-initial-hand-btn');
      if (initialHandBtn) {
        initialHandBtn.hidden = (type !== 'hand' || !isViewingOwnCards(playerId) || !getPlayerCardState(playerId).deck.length);
      }
      deckBreakdownPanel.hidden = true;
      // 重置拖拽偏移
      cardListDragOffset = { x: 0, y: 0 };
      cardListDialogEl.style.transform = '';
      cardListDialogEl.style.transition = '';
      if (deckBreakdownPanel) {
        deckBreakdownPanel.style.transform = '';
        deckBreakdownPanel.style.transition = '';
      }
      cardListOverlay.hidden = false;
    }

    function closeCardListDialog() {
      cardListOverlay.hidden = true;
      cardListContext = null;
      cardListBody.innerHTML = '';
      document.getElementById('deck-summary-header').hidden = true;
      document.getElementById('deck-summary-header').innerHTML = '';
      deckBreakdownPanel.hidden = true;
      deckBreakdownBody.innerHTML = '';
    }

    function refreshOpenListDialog(playerId) {
      if (!cardListContext || cardListContext.playerId !== playerId) return;
      if (cardListContext.type === 'hand') renderHandList(playerId);
      else { renderDeckList(playerId); refreshDeckBreakdown(playerId); }
    }

    function drawCard(playerId) {
      const state = getPlayerCardState(playerId);
      if (!state.deck.length) {
        broadcastSystemMsg(`【系统】${getPlayerName(playerId)}试图抽牌，但牌库已空`);
        return;
      }
      const card = state.deck.shift();
      pushCardToHand(playerId, card);
      updateDeckButtons(playerId);
      refreshOpenListDialog(playerId);
      syncDeckState(playerId);
      broadcastSystemMsg(`【系统】${getPlayerName(playerId)}抽了一张牌`);
      // 飞行动画：牌库 → 手牌
      if (typeof CardFlight !== 'undefined') {
        CardFlight.flyAndBroadcast(playerId, 'deck', 'hand');
      }
    }

    function removeFromHand(playerId, cardId, action) {
      // 观众禁止任何手牌操作
      if (typeof isSpectator !== 'undefined' && isSpectator) return;
      const state = getPlayerCardState(playerId);
      const index = state.hand.findIndex(card => card.id === cardId);
      if (index === -1) return;
      const card = state.hand[index];
      state.hand.splice(index, 1);

      // 加入墓地（使用/弃置都进墓地）
      if (!state.grave) state.grave = [];
      state.grave.push(card);

      updateDeckButtons(playerId);
      refreshOpenListDialog(playerId);
      syncDeckState(playerId);
      const verb = action === 'use' ? '使用了' : '弃置了';

      // 使用幻境牌时，自动添加到幻境/效果面板
      if (action === 'use') {
        const stackInfo = (card._maxStack > 0) ? `（${card._stack || 1}/${card._maxStack}）` : '';
        const curseInfo = (card.curses && card.curses.length) ? '（结附灵咒：' + card.curses.map(c => c.name + '×' + c.layers).join('、') + '）' : '';
        const mainMsg = `【系统】${getPlayerName(playerId)}${verb}「${card.name}」${stackInfo}${curseInfo}`;
        if (typeof startMessageGroup === 'function') {
          startMessageGroup(mainMsg);
        } else {
          broadcastSystemMsg(mainMsg);
        }

        const dbCard = CardDB.lookup(card.name);
        let animTarget = null;

        // 1) 形态牌：自动结附到所属式神
        if (dbCard && dbCard.type === 'form' && dbCard.owner) {
          const zone = getPlayerZone(playerId);
          if (zone) {
            const slots = zone.querySelectorAll('.card-slot');
            for (const slot of slots) {
              if (slot.querySelector('.card-name')?.value === dbCard.owner) {
                const oldForm = slot._formName || '';
                slot._formName = dbCard.name;
                slot._formAtk = dbCard.attack || 0;
                slot._formHp = dbCard.hp || 0;
                slot._formAbility = dbCard.effect || '';
                if (typeof recordPermBase === 'function') recordPermBase(slot);
                const curAtk = parseInt(slot.querySelector('.card-attack')?.value, 10) || 0;
                const oldFullAtk = typeof calcFullAtk === 'function' ? calcFullAtk(slot) : curAtk;
                const manualAtk = curAtk - oldFullAtk;
                const newFullAtk = (typeof calcFullAtk === 'function' ? calcFullAtk(slot) : 0) + manualAtk;
                const newFullHp = typeof calcFullHp === 'function' ? calcFullHp(slot) : 0;
                if (slot.querySelector('.card-attack')) slot.querySelector('.card-attack').value = newFullAtk || '';
                if (slot.querySelector('.card-hp')) slot.querySelector('.card-hp').value = newFullHp || '';
                syncSlotToPeer(slot);
                const replaceMsg = oldForm ? `（替换了原有形态「${oldForm}」）` : '';
                broadcastSystemMsg(`【系统】${getPlayerName(playerId)}为「${dbCard.owner}」结附了形态「${dbCard.name}」${replaceMsg}`);
                animTarget = slot;
                break;
              }
            }
          }
        }

        // 2) 幻境牌：创建幻境条目
        if (dbCard && dbCard.type === 'realm') {
          const zone = getPlayerZone(playerId);
          if (zone) {
            const panel = zone.querySelector('.effects-panel');
            const item = createEffectItem();
            item.querySelector('.effect-name').value = dbCard.name;
            item.querySelector('.effect-value').value = String(dbCard.durability);
            panel.appendChild(item);
            syncEffectsState(playerId);
            broadcastSystemMsg(`${getPlayerName(playerId)}展开了幻境「${dbCard.name}」（耐久${dbCard.durability}）`);
            animTarget = item;
          }
        }

        // 3) 觉醒牌：自动设置觉醒标记和永久属性
        if (dbCard && dbCard.awakened && (dbCard.type === 'spell' || dbCard.type === '法术')) {
          const zone = getPlayerZone(playerId);
          if (zone) {
            const slots = zone.querySelectorAll('.card-slot');
            for (const slot of slots) {
              const slotName = slot.querySelector('.card-name')?.value;
              if (slotName === dbCard.owner) {
                slot.classList.add('awakened');
                if (typeof recordPermBase === 'function') recordPermBase(slot);
                const oldAtk = typeof calcPermAtk === 'function' ? calcPermAtk(slot) : 0;
                const oldHp = typeof calcPermHp === 'function' ? calcPermHp(slot) : 0;
                if (!slot._permAtkMods) slot._permAtkMods = [];
                if (!slot._permHpMods) slot._permHpMods = [];
                slot._permAtkMods.push({ source: dbCard.name, value: dbCard.atkBonus || 0, layers: 1 });
                slot._permHpMods.push({ source: dbCard.name, value: dbCard.hpBonus || 0, layers: 1 });
                if (typeof applyPermStats === 'function') applyPermStats(slot, oldAtk, oldHp);
                syncSlotToPeer(slot);
                broadcastSystemMsg(`【系统】${getPlayerName(playerId)}为「${slotName}」使用了觉醒「${dbCard.name}」`);
                if (!animTarget) animTarget = slot;
                break;
              }
            }
          }
        }

        // 4) 使用牌动画：飞行→翻转→预展示（如果有目标则追加飞行到目标阶段）
        if (typeof CardFlight !== 'undefined') {
          CardFlight.playUseCardAnim(playerId, card, { targetEl: animTarget });
        }
        // 若卡牌有灵咒，转移到战场同名卡牌槽
        if (card.curses && card.curses.length) {
          const zone = getPlayerZone(playerId);
          if (zone) {
            const slots = zone.querySelectorAll('.card-slot');
            for (const slot of slots) {
              const slotName = slot.querySelector('.card-name').value;
              if (slotName === card.name) {
                const slotCurses = getSlotCurses(slot);
                card.curses.forEach(sc => {
                  const exist = slotCurses.find(c => c.name === sc.name);
                  if (exist) { exist.layers += sc.layers; }
                  else { slotCurses.push({ name: sc.name, layers: sc.layers }); }
                });
                setSlotCurses(slot, slotCurses);
                syncSlotToPeer(slot);
                break;
              }
            }
          }
        }

        // 【集成效果引擎】打出卡牌时触发 on_play 效果
        if (typeof onCardPlayed === 'function') {
          // 尝试找到归属的式神卡牌槽
          let ownerSlot = null;
          if (dbCard && dbCard.owner) {
            const zone = getPlayerZone(playerId);
            if (zone) {
              const slots = zone.querySelectorAll('.card-slot');
              for (const slot of slots) {
                if (slot.querySelector('.card-name')?.value === dbCard.owner) {
                  ownerSlot = slot;
                  break;
                }
              }
            }
          }
          onCardPlayed(card.name, playerId, ownerSlot);
          // 效果可能修改手牌（如杀念获得新牌），刷新弹窗
          refreshOpenListDialog(playerId);
        }

        // 【消息分组】结束：渲染可展开的消息组
        if (typeof endMessageGroup === 'function') {
          endMessageGroup();
        }
      } else {
        // 弃置：普通消息，不分组
        broadcastSystemMsg(`【系统】${getPlayerName(playerId)}${verb}「${card.name}」`);
        // 弃牌动画：P1向下、P2向上飞150px
        if (typeof CardFlight !== 'undefined') {
          const handBtn = CardFlight.getPlayerBtn(playerId, 'hand');
          if (handBtn) {
            const r = handBtn.getBoundingClientRect();
            const tgtY = playerId === '2' ? r.top - 150 : r.bottom + 150;
            CardFlight.fly(handBtn, { x: r.left + r.width / 2, y: tgtY }, { arcHeight: 20, duration: 0.45 });
            // 联机广播弃牌动画
            if (typeof CardFlight._broadcastAnim === 'function') {
              CardFlight._broadcastAnim({ action: 'fly-single', playerId, fromType: 'hand', toCoord: { x: r.left + r.width / 2, y: tgtY }, opts: { arcHeight: 20, duration: 0.45 } });
            }
          }
        }
      }
    }

    function insertCardAtRandomPosition(deck, card) {
      const index = Math.floor(Math.random() * (deck.length + 1));
      deck.splice(index, 0, card);
    }

    /** 将手牌中的某张牌放回牌库随机位置 */
    function moveToDeckFromHand(playerId, cardId) {
      if (typeof isSpectator !== 'undefined' && isSpectator) return;
      if (typeof isMyZone === 'function' && !isMyZone(playerId)) return;
      const state = getPlayerCardState(playerId);
      const index = state.hand.findIndex(card => card.id === cardId);
      if (index === -1) return;
      const [card] = state.hand.splice(index, 1);
      insertCardAtRandomPosition(state.deck, card);
      updateDeckButtons(playerId);
      refreshOpenListDialog(playerId);
      syncDeckState(playerId);
      broadcastSystemMsg(`【系统】${getPlayerName(playerId)}将「${card.name}」从手牌放回了牌库`);
      // 飞行动画：手牌 → 牌库
      if (typeof CardFlight !== 'undefined') {
        CardFlight.flyAndBroadcast(playerId, 'hand', 'deck');
      }
    }

    /** 从牌库弃置一张牌（按ID），带动画 */
    function discardFromDeckById(playerId, cardId) {
      if (typeof isSpectator !== 'undefined' && isSpectator) return;
      if (typeof isMyZone === 'function' && !isMyZone(playerId)) return;
      const state = getPlayerCardState(playerId);
      const idx = state.deck.findIndex(c => c && c.id === cardId);
      if (idx === -1) return;
      const [card] = state.deck.splice(idx, 1);
      if (!state.grave) state.grave = [];
      state.grave.push(card);
      updateDeckButtons(playerId);
      refreshOpenListDialog(playerId);
      syncDeckState(playerId);
      broadcastSystemMsg(`【系统】${getPlayerName(playerId)}从牌库弃置了「${card.name}」`);
      // 弃牌动画：从牌库按钮飞出
      _playDiscardAnim(playerId);
    }

    /** 从牌库弃置一张牌（按牌名，用于牌表），带动画 */
    function discardFromDeckByName(playerId, cardName) {
      if (typeof isSpectator !== 'undefined' && isSpectator) return;
      if (typeof isMyZone === 'function' && !isMyZone(playerId)) return;
      const state = getPlayerCardState(playerId);
      const idx = state.deck.findIndex(c => c && c.name === cardName);
      if (idx === -1) return;
      const [card] = state.deck.splice(idx, 1);
      if (!state.grave) state.grave = [];
      state.grave.push(card);
      updateDeckButtons(playerId);
      refreshOpenListDialog(playerId);
      syncDeckState(playerId);
      broadcastSystemMsg(`【系统】${getPlayerName(playerId)}从牌库弃置了「${cardName}」`);
      _playDiscardAnim(playerId);
    }

    /** 弃牌动画：卡牌从牌库按钮飞出 */
    function _playDiscardAnim(playerId) {
      if (typeof CardFlight === 'undefined') return;
      const deckBtn = CardFlight.getPlayerBtn(playerId, 'deck');
      if (!deckBtn) return;
      const r = deckBtn.getBoundingClientRect();
      const tgtY = playerId === '2' ? r.top - 150 : r.bottom + 150;
      CardFlight.fly(deckBtn, { x: r.left + r.width / 2, y: tgtY }, { arcHeight: 20, duration: 0.45 });
      // 联机广播
      if (typeof CardFlight._broadcastAnim === 'function') {
        CardFlight._broadcastAnim({ action: 'fly-single', playerId, fromType: 'deck', toCoord: { x: r.left + r.width / 2, y: tgtY }, opts: { arcHeight: 20, duration: 0.45 } });
      }
    }

    function shuffleDeck(playerId) {
      const state = getPlayerCardState(playerId);
      if (!state.deck.length) {
        broadcastSystemMsg(`【系统】${getPlayerName(playerId)}试图洗牌，但牌库为空`);
        return;
      }
      shuffleCards(state.deck);
      updateDeckButtons(playerId);
      refreshOpenListDialog(playerId);
      syncDeckState(playerId);
      broadcastSystemMsg(`【系统】${getPlayerName(playerId)}洗了牌库`);
      // 洗牌动画
      if (typeof CardFlight !== 'undefined') {
        CardFlight.shuffleDeckAnim(playerId);
      }
    }

    // ---- 占卜系统 ----
    let divineContext = null; // { playerId, topGroup:[], bottomGroup:[], restDeck:[], x }
    let divineTempOpId = null; // 操作者ID（辅助对方时）

    const divineOverlay = document.getElementById('divine-dialog-overlay');
    const divineXRow = document.getElementById('divine-x-row');
    const divineXInput = document.getElementById('divine-x-input');
    const divineMain = document.getElementById('divine-main');
    const divineTopList = document.getElementById('divine-top-list');
    const divineBottomList = document.getElementById('divine-bottom-list');
    const divineActions = document.getElementById('divine-actions');
    const divineTitle = document.getElementById('divine-dialog-title');

    /** 步骤1：弹出占卜X输入框 */
    function openDivineXPrompt(playerId, operatorId) {
      const state = getPlayerCardState(playerId);
      if (!state.deck.length) {
        broadcastSystemMsg(`【系统】${getPlayerName(playerId)}试图占卜，但牌库为空`);
        return;
      }
      // 存储操作者信息
      divineTempOpId = operatorId || playerId;
      divineXRow.hidden = false;
      divineMain.hidden = true;
      divineActions.hidden = true;
      divineTitle.textContent = `🔮 占卜 — ${getPlayerName(playerId)}`;
      divineXInput.max = state.deck.length;
      divineXInput.value = Math.min(3, state.deck.length);
      divineOverlay.hidden = false;
      divineXInput.focus();
      divineXInput.select();
      // 绑定一次性事件
      document.getElementById('divine-x-confirm').onclick = () => {
        const x = parseInt(divineXInput.value, 10);
        if (isNaN(x) || x < 1) { divineXInput.value = 1; return; }
        const clampedX = Math.min(x, state.deck.length);
        startDivine(playerId, clampedX);
      };
      // Enter 键确认，Esc 取消
      divineXInput.onkeydown = (e) => {
        if (e.key === 'Enter') document.getElementById('divine-x-confirm').click();
        if (e.key === 'Escape') closeDivineDialog(true);
      };
    }

    /** 步骤2：取牌库顶X张副本，展示占卜操作界面（不修改真实牌库，确认后才应用） */
    function startDivine(playerId, x) {
      const state = getPlayerCardState(playerId);
      if (!state.deck.length || x < 1) { closeDivineDialog(false); return; }
      const clampedX = Math.min(x, state.deck.length);
      // 复制顶部X张（深拷贝，避免引用问题）
      const divineCards = state.deck.slice(0, clampedX).map(c => ({
        id: c.id,
        name: c.name,
        curses: c.curses ? c.curses.map(cur => ({ name: cur.name, layers: cur.layers })) : [],
      }));
      // 标记这些牌为"已占卜揭示"（自己的牌库占卜后也能看到）
      const viewerId = getViewerPlayerId();
      if (!playerRevealedCards[viewerId]) playerRevealedCards[viewerId] = new Set();
      divineCards.forEach(c => playerRevealedCards[viewerId].add(c.id));
      // 静默同步给对方（用于存档完整性）
      if (!isSoloMode && peerConn && peerConn.open && typeof sendToPeer === 'function') {
        sendToPeer({ type: 'revealed-cards', playerId: viewerId, cardIds: [...playerRevealedCards[viewerId]] });
      }
      divineContext = {
        playerId,
        topGroup: divineCards,
        bottomGroup: [],
        x: clampedX,
        operatorId: divineTempOpId || playerId,
      };
      divineTempOpId = null;
      // UI切换
      divineXRow.hidden = true;
      divineMain.hidden = false;
      divineActions.hidden = false;
      divineTitle.textContent = `🔮 占卜 ${clampedX} — ${getPlayerName(playerId)}`;
      renderDivineLists();
      const opId = divineContext.operatorId;
      const isHelp = opId !== playerId;
      const tgtName = getPlayerName(playerId);
      const opName = getPlayerName(opId);
      const startMsg = isHelp
        ? `【系统】${opName}为${tgtName}开始占卜${clampedX}..`
        : `【系统】${tgtName}进行了占卜${clampedX}`;
      broadcastSystemMsg(startMsg);
    }

    // ---- 拖拽状态 ----
    let dragData = null; // { cardId, sourceGroup }

    /** 渲染顶部/底部两组卡牌 */
    function renderDivineLists() {
      if (!divineContext) return;
      const { topGroup, bottomGroup } = divineContext;
      // 顶部组
      divineTopList.innerHTML = '';
      topGroup.forEach((card, index) => {
        divineTopList.appendChild(createDivineCardItem(card, index, 'top'));
      });
      // 底部组
      divineBottomList.innerHTML = '';
      bottomGroup.forEach((card, index) => {
        divineBottomList.appendChild(createDivineCardItem(card, index, 'bottom'));
      });
    }

    /** 创建单个占卜卡牌条目（纯拖拽排序，无按钮） */
    function createDivineCardItem(card, index, group) {
      const item = document.createElement('div');
      item.className = 'divine-card-item';
      item.draggable = true;
      item.dataset.cardId = card.id;
      item.dataset.group = group;

      // ---- 拖拽事件 ----
      item.addEventListener('dragstart', (e) => {
        dragData = { cardId: card.id, sourceGroup: group };
        item.classList.add('divine-card-item--dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', JSON.stringify(dragData));
      });
      item.addEventListener('dragend', () => {
        item.classList.remove('divine-card-item--dragging');
        dragData = null;
        document.querySelectorAll('.divine-card-item--drag-over, .divine-card-item--drag-before, .divine-card-item--drag-after').forEach(el => {
          el.classList.remove('divine-card-item--drag-over', 'divine-card-item--drag-before', 'divine-card-item--drag-after');
        });
      });
      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        item.parentElement.querySelectorAll('.divine-card-item--drag-over, .divine-card-item--drag-before, .divine-card-item--drag-after').forEach(el => {
          el.classList.remove('divine-card-item--drag-over', 'divine-card-item--drag-before', 'divine-card-item--drag-after');
        });
        const rect = item.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY < midY) {
          item.classList.add('divine-card-item--drag-before');
        } else {
          item.classList.add('divine-card-item--drag-after');
        }
      });
      item.addEventListener('dragleave', (e) => {
        item.classList.remove('divine-card-item--drag-before', 'divine-card-item--drag-after');
      });
      item.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        item.classList.remove('divine-card-item--drag-before', 'divine-card-item--drag-after');
        if (!dragData) return;
        const { cardId: srcId, sourceGroup: srcGroup } = dragData;
        if (srcId === card.id) return;
        const rect = item.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const insertBefore = e.clientY < midY;
        handleDivineDrop(srcId, srcGroup, group, card.id, insertBefore);
      });

      // 拖拽手柄图标
      const handle = document.createElement('span');
      handle.className = 'divine-card-item__handle';
      handle.textContent = '⋮⋮';
      handle.draggable = false;
      item.appendChild(handle);

      // 卡牌名称
      const nameEl = document.createElement('span');
      nameEl.className = 'divine-card-item__name';
      nameEl.textContent = card.name;
      nameEl.draggable = false;
      item.appendChild(nameEl);

      // 灵咒标签（占卜揭示了灵咒归属）
      if (card.curses && card.curses.length) {
        const cursesEl = document.createElement('span');
        cursesEl.className = 'divine-card-item__curses';
        cursesEl.draggable = false;
        card.curses.forEach(c => {
          const tag = document.createElement('span');
          tag.className = 'divine-curse-tag';
          tag.textContent = '⛓️' + c.name + '×' + c.layers;
          cursesEl.appendChild(tag);
        });
        item.appendChild(cursesEl);
      }

      return item;
    }

    /** 处理拖拽放置：将 srcId 从 srcGroup 移到 dstGroup，插入到 targetId 之前或之后 */
    function handleDivineDrop(srcId, srcGroup, dstGroup, targetId, insertBefore) {
      if (!divineContext) return;
      const srcArr = srcGroup === 'top' ? divineContext.topGroup : divineContext.bottomGroup;
      const dstArr = dstGroup === 'top' ? divineContext.topGroup : divineContext.bottomGroup;
      const srcIdx = srcArr.findIndex(c => c.id === srcId);
      if (srcIdx === -1) return;
      const [card] = srcArr.splice(srcIdx, 1);
      // 如果同组且目标在源之后（且源已被移除），需要调整索引
      let targetIdx = dstArr.findIndex(c => c.id === targetId);
      if (targetIdx === -1) { dstArr.push(card); renderDivineLists(); return; }
      if (srcGroup === dstGroup && srcIdx < targetIdx) {
        targetIdx -= 1; // 源移除后目标索引左移
      }
      const insertIdx = insertBefore ? targetIdx : targetIdx + 1;
      dstArr.splice(insertIdx, 0, card);
      renderDivineLists();
    }

    /** 为空的拖放区域绑定事件（允许拖到空白处追加到末尾） */
    function setupDivineDropZone(listEl, group) {
      listEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        listEl.classList.add('divine-section__body--drag-over');
      });
      listEl.addEventListener('dragleave', (e) => {
        if (e.target === listEl) listEl.classList.remove('divine-section__body--drag-over');
      });
      listEl.addEventListener('drop', (e) => {
        e.preventDefault();
        listEl.classList.remove('divine-section__body--drag-over');
        if (!dragData) return;
        // 只有当直接拖到空白区域（不是某个item上）时才追加到末尾
        if (e.target === listEl || e.target.classList.contains('divine-section__body')) {
          const { cardId: srcId, sourceGroup: srcGroup } = dragData;
          if (srcGroup === group) return; // 同组拖到空白区，无变化
          handleDivineDropToEnd(srcId, srcGroup, group);
        }
      });
    }

    function handleDivineDropToEnd(srcId, srcGroup, dstGroup) {
      if (!divineContext || srcGroup === dstGroup) return;
      const srcArr = srcGroup === 'top' ? divineContext.topGroup : divineContext.bottomGroup;
      const dstArr = dstGroup === 'top' ? divineContext.topGroup : divineContext.bottomGroup;
      const srcIdx = srcArr.findIndex(c => c.id === srcId);
      if (srcIdx === -1) return;
      const [card] = srcArr.splice(srcIdx, 1);
      dstArr.push(card);
      renderDivineLists();
    }

    // 初始化两个拖放区域（允许跨组拖拽到空白处）
    setupDivineDropZone(divineTopList, 'top');
    setupDivineDropZone(divineBottomList, 'bottom');

    /** 确认占卜：将两组卡牌应用到真实牌库 */
    function confirmDivine() {
      if (!divineContext) return;
      const { playerId, topGroup, bottomGroup, x } = divineContext;
      const state = getPlayerCardState(playerId);
      // 从真实牌库中找到并移除占卜的X张牌（按id匹配）
      const divineIds = new Set();
      topGroup.forEach(c => divineIds.add(c.id));
      bottomGroup.forEach(c => divineIds.add(c.id));
      const remaining = state.deck.filter(c => !divineIds.has(c.id));
      // 重建牌库：顶部组（新顺序） + 剩余牌库 + 底部组（新顺序）
      // 同时把灵咒变更同步回真实卡牌
      const mergedTop = topGroup.map(tc => {
        const real = state.deck.find(rc => rc.id === tc.id);
        if (real) { real.curses = tc.curses; return real; }
        return tc;
      });
      const mergedBottom = bottomGroup.map(bc => {
        const real = state.deck.find(rc => rc.id === bc.id);
        if (real) { real.curses = bc.curses; return real; }
        return bc;
      });
      state.deck = [...mergedTop, ...remaining, ...mergedBottom];
      const savedOpId = divineContext.operatorId || playerId;
      const savedX = divineContext.x;
      divineContext = null;
      closeDivineDialog(false);
      updateDeckButtons(playerId);
      refreshOpenListDialog(playerId);
      syncDeckState(playerId);
      const topNames = topGroup.map(c => c.name).join('、') || '（无）';
      const bottomNames = bottomGroup.map(c => c.name).join('、') || '（无）';
      const topCount = topGroup.length;
      const bottomCount = bottomGroup.length;
      const playerName = getPlayerName(playerId);
      const opId = savedOpId;
      const isHelp = opId !== playerId;
      const opName = getPlayerName(opId);
      const xVal = savedX;

      // 操作者和牌主自己看到详细信息（牌名）
      const prefix = isHelp ? `【系统】${opName}完成了对${playerName}的占卜${xVal}` : `【系统】${playerName}完成了占卜`;
      addSystemChatMessage(`${prefix} —— 牌库顶：[${topNames}]，牌库底：[${bottomNames}]`);

      // 其他人（对手/观众）看到摘要信息（只有数量，不知道牌名）
      if (!isSoloMode && peerConn && peerConn.open && typeof sendToPeer === 'function') {
        const topWord = topCount > 0 ? `${topCount}张` : '0张';
        const bottomWord = bottomCount > 0 ? `${bottomCount}张` : '0张';
        const summaryPrefix = isHelp ? `【系统】${opName}完成了对${playerName}的占卜${xVal}` : `【系统】${playerName}完成了占卜${xVal}`;
        const summaryMsg = `${summaryPrefix}，将${topWord}牌放在了牌库顶，将${bottomWord}牌放在了牌库底`;
        sendToPeer({ type: 'sysmsg', text: summaryMsg });
      }
    }

    /** 关闭占卜对话框（cancel=true 时清除已揭示卡牌） */
    function closeDivineDialog(cancel) {
      if (divineContext) {
        const playerName = getPlayerName(divineContext.playerId);
        // 取消占卜时移除本次揭示的卡牌ID
        if (cancel) {
          const viewerId = getViewerPlayerId();
          const allDivined = [...(divineContext.topGroup || []), ...(divineContext.bottomGroup || [])];
          allDivined.forEach(c => {
            if (playerRevealedCards[viewerId]) playerRevealedCards[viewerId].delete(c.id);
          });
        }
        divineContext = null;
        if (cancel) broadcastSystemMsg(`【系统】${playerName}取消了占卜`);
      }
      divineOverlay.hidden = true;
      divineXRow.hidden = false;
      divineMain.hidden = true;
      divineActions.hidden = true;
      // 清空弹窗内容，下次打开是干净的
      divineTopList.innerHTML = '';
      divineBottomList.innerHTML = '';
      divineXInput.value = '3';
    }

    // 绑定占卜对话框按钮事件
    document.getElementById('divine-confirm').addEventListener('click', confirmDivine);
    document.getElementById('divine-cancel').addEventListener('click', () => closeDivineDialog(true));

    // 不再通过点击遮罩关闭（与其他弹窗行为一致）

    // Esc 关闭
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !divineOverlay.hidden) {
        if (!divineMain.hidden) closeDivineDialog(true);
      }
    });

    function importDeck(playerId, text) {
      const names = parseCardLines(text);
      if (!names.length) return;
      const cards = shuffleCards(names.map(name => createCard(name)));
      getPlayerCardState(playerId).deck.push(...cards);
      updateDeckButtons(playerId);
      refreshOpenListDialog(playerId);
      syncDeckState(playerId);
      broadcastSystemMsg(`【系统】${getPlayerName(playerId)}导入了卡组（${cards.length}张）`);
    }

    function addToHand(playerId, text, qty) {
      const name = text.trim();
      if (!name) return;
      const count = Math.max(1, qty || 1);
      for (let i = 0; i < count; i++) {
        pushCardToHand(playerId, createCard(name));
      }
      updateDeckButtons(playerId);
      refreshOpenListDialog(playerId);
      syncDeckState(playerId);
      broadcastSystemMsg(`【系统】${getPlayerName(playerId)}将${count}张「${name}」置入了手牌`);
      // 飞行动画
      if (typeof CardFlight !== 'undefined') {
        const addBtn = CardFlight.getPlayerBtn(playerId, 'addHand');
        const handBtn = CardFlight.getPlayerBtn(playerId, 'hand');
        if (addBtn) {
          const r = addBtn.getBoundingClientRect();
          const srcY = playerId === '2' ? r.top - 150 : r.bottom + 150;
          CardFlight.flySeqAndBroadcast(playerId, count, 'addHand', { x: r.left + r.width / 2, y: srcY }, 'hand', { interval: 0.18, arcHeight: 60 });
        }
      }
    }

    /** 将卡牌置入手牌，自动处理最大堆叠 */
    function pushCardToHand(playerId, card, fromShop) {
      if (!card || !card.name) return;
      const state = getPlayerCardState(playerId);
      const db = (typeof CardDB !== 'undefined') ? CardDB.lookup(card.name) : null;
      const maxStack = (db && db.maxStack) ? db.maxStack : 0;

      if (maxStack > 0) {
        // 从商店购买时，卡牌本身可能已有层数
        const incomingStack = card._stack || 1;
        let remaining = incomingStack;

        // 先尝试填充手牌中已有的同名牌堆叠
        const existing = state.hand.filter(hc => hc.name === card.name && (hc._stack || 0) < maxStack);
        for (const hc of existing) {
          if (remaining <= 0) break;
          const space = maxStack - (hc._stack || 1);
          const add = Math.min(remaining, space);
          hc._stack = (hc._stack || 1) + add;
          hc._maxStack = maxStack;
          remaining -= add;
        }

        // 剩余的创建新堆叠
        while (remaining > 0) {
          const stack = Math.min(remaining, maxStack);
          const newCard = createCard(card.name);
          newCard._stack = stack;
          newCard._maxStack = maxStack;
          newCard._shop = card._shop || false;
          state.hand.push(newCard);
          remaining -= stack;
        }
      } else {
        // 无堆叠：直接加入
        state.hand.push(card);
      }
    }

    function addToDeck(playerId, text, qty) {
      const name = text.trim();
      if (!name) return;
      const count = Math.max(1, qty || 1);
      const deck = getPlayerCardState(playerId).deck;
      for (let i = 0; i < count; i++) {
        insertCardAtRandomPosition(deck, createCard(name));
      }
      updateDeckButtons(playerId);
      refreshOpenListDialog(playerId);
      syncDeckState(playerId);
      broadcastSystemMsg(`【系统】${getPlayerName(playerId)}将${count}张「${name}」置入了牌库`);
      // 飞行动画
      if (typeof CardFlight !== 'undefined') {
        const addDeckBtn = CardFlight.getPlayerBtn(playerId, 'addDeck');
        const deckBtn = CardFlight.getPlayerBtn(playerId, 'deck');
        if (addDeckBtn) {
          const r = addDeckBtn.getBoundingClientRect();
          const srcY = playerId === '2' ? r.top - 150 : r.bottom + 150;
          CardFlight.flySeqAndBroadcast(playerId, count, 'addDeck', { x: r.left + r.width / 2, y: srcY }, 'deck', { interval: 0.18, arcHeight: 60 });
        }
      }
    }

    function handleDeckAction(playerId, action) {
      const playerName = getPlayerName(playerId);
      switch (action) {
        case 'draw':
          drawCard(playerId);
          break;
        case 'hand':
          try { openCardListDialog({ title: `${playerName} 的手牌`, playerId, type: 'hand' }); }
          catch (e) { console.error('[DeckAction] 打开手牌失败:', e); }
          break;
        case 'add-hand':
          openCardTextDialog({
            title: `${playerName} 置入手牌`,
            placeholder: '输入卡牌名称…',
            multiline: false,
            onConfirm: (text, qty) => addToHand(playerId, text, qty),
          });
          break;
        case 'import-deck':
          openCardTextDialog({
            title: `${playerName} 导入卡组`,
            placeholder: '每行一张牌，例如：\nXXX\nAAA\nCCC\nSSS',
            multiline: true,
            onConfirm: (text) => importDeck(playerId, text),
          });
          break;
        case 'deck':
          try { openCardListDialog({ title: `${playerName} 的牌库`, playerId, type: 'deck' }); }
          catch (e) { console.error('[DeckAction] 打开牌库失败:', e); }
          break;
        case 'add-deck':
          openCardTextDialog({
            title: `${playerName} 置入牌库`,
            placeholder: '输入卡牌名称…',
            multiline: false,
            onConfirm: (text, qty) => addToDeck(playerId, text, qty),
          });
          break;
        case 'shuffle-deck':
          shuffleDeck(playerId);
          break;
        case 'divine':
          openDivineXPrompt(playerId);
          break;
        default:
          break;
      }
    }

    document.querySelectorAll('.player-zone').forEach(zone => {
      const playerId = zone.dataset.player;
      zone.querySelectorAll('.btn-deck').forEach(btn => {
        btn.addEventListener('click', () => handleDeckAction(playerId, btn.dataset.action));
      });
    });

    document.getElementById('card-text-dialog-cancel').addEventListener('click', closeCardTextDialog);
    document.getElementById('card-text-dialog-confirm').addEventListener('click', confirmCardTextDialog);
    document.getElementById('card-list-dialog-close').addEventListener('click', closeCardListDialog);

    // 连引使用切换按钮
    const renyinToggleBtn = document.getElementById('card-list-renyin-toggle');
    let renyinBtnsVisible = false;
    if (renyinToggleBtn) {
      // 初始样式
      renyinToggleBtn.style.background = 'linear-gradient(180deg,#4a3a6a,#3a2a5a)';
      renyinToggleBtn.style.color = '#c0b0e0';
      renyinToggleBtn.addEventListener('click', () => {
        renyinBtnsVisible = !renyinBtnsVisible;
        document.querySelectorAll('[data-renyin-btn]').forEach(btn => {
          btn.hidden = !renyinBtnsVisible;
        });
        renyinToggleBtn.textContent = renyinBtnsVisible ? '🔗 连引使用 ✓' : '🔗 连引使用';
        if (renyinBtnsVisible) {
          renyinToggleBtn.style.background = 'linear-gradient(180deg,#7a5ac8,#5a3aa8)';
          renyinToggleBtn.style.color = '#e8d8ff';
          renyinToggleBtn.style.borderColor = 'rgba(180,140,240,0.7)';
        } else {
          renyinToggleBtn.style.background = 'linear-gradient(180deg,#4a3a6a,#3a2a5a)';
          renyinToggleBtn.style.color = '#c0b0e0';
          renyinToggleBtn.style.borderColor = 'rgba(140,120,180,0.4)';
        }
      });
    }

    // 随机结附灵咒
    let curseRandomRepeat = false; // false=优先不重复, true=全随机
    document.getElementById('btn-curse-toggle').addEventListener('click', function() {
      curseRandomRepeat = !curseRandomRepeat;
      this.textContent = curseRandomRepeat ? '🔁 全随机' : '🔄 优先不重复';
    });

    document.getElementById('btn-curse-random').addEventListener('click', () => {
      if (!cardListContext) return;
      const name = document.getElementById('curse-random-input').value.trim();
      if (!name) return;
      const { playerId, type } = cardListContext;
      const state = getPlayerCardState(playerId);
      const cards = type === 'hand' ? state.hand : state.deck;
      if (!cards.length) return;
      let pool;
      if (curseRandomRepeat) {
        pool = cards;
      } else {
        const without = cards.filter(c => !(c.curses || []).some(cur => cur.name === name));
        pool = without.length ? without : cards;
      }
      const target = pool[Math.floor(Math.random() * pool.length)];
      if (!target.curses) target.curses = [];
      const existing = target.curses.find(c => c.name === name);
      if (existing) { existing.layers += 1; }
      else { target.curses.push({ name, layers: 1 }); }
      refreshOpenListDialog(playerId);
      syncDeckState(playerId);
      const loc = type === 'hand' ? '手牌中的' : '牌库中的';
      broadcastSystemMsg('【系统】' + getPlayerName(playerId) + '为' + loc + '一张牌随机结附了灵咒「' + name + '」×1');
    });

    // ================================================================
    //  牌表侧窗：按所属式神分组展示牌库内容
    // ================================================================
    function renderDeckBreakdown(playerId) {
      const state = getPlayerCardState(playerId);
      const deck = (state.deck || []).filter(c => c && typeof c === 'object');
      const viewerId = getViewerPlayerId();
      const revealedSet = playerRevealedCards[viewerId] || new Set();
      deckBreakdownBody.innerHTML = '';

      if (!deck.length) {
        deckBreakdownBody.innerHTML = '<div class="breakdown-empty">牌库为空</div>';
        return;
      }

      deckBreakdownTitle.textContent = `📋 牌表（${deck.length}张）`;

      // 按所属式神分组：{ owner: { cards: [{name, count, cardRef}] } }
      const ownerMap = new Map();
      deck.forEach(card => {
        const db = CardDB.lookup(card.name);
        const owner = (db && db.owner) ? db.owner : '无归属';
        if (!ownerMap.has(owner)) ownerMap.set(owner, new Map());
        const nameMap = ownerMap.get(owner);
        const existing = nameMap.get(card.name);
        if (existing) {
          existing.count += 1;
          existing.cards.push(card);
        } else {
          nameMap.set(card.name, { count: 1, cards: [card], name: card.name });
        }
      });

      // 排序：按式神名
      const sortedOwners = [...ownerMap.keys()].sort((a, b) => a.localeCompare(b, 'zh'));

      sortedOwners.forEach(owner => {
        const group = document.createElement('div');
        group.className = 'breakdown-owner-group';

        const header = document.createElement('div');
        header.className = 'breakdown-owner-group__header';
        const totalInGroup = [...ownerMap.get(owner).values()].reduce((s, e) => s + e.count, 0);
        header.textContent = `▼ ${owner}（${totalInGroup}）`;
        group.appendChild(header);

        const nameMap = ownerMap.get(owner);
        const sortedNames = [...nameMap.keys()].sort((a, b) => a.localeCompare(b, 'zh'));

        sortedNames.forEach(name => {
          const entry = nameMap.get(name);
          const sampleCard = entry.cards[0];
          const isRevealed = revealedSet.has(sampleCard.id);
          const row = document.createElement('div');
          row.className = 'breakdown-card-row';

          const nameSpan = document.createElement('span');
          nameSpan.className = 'breakdown-card-row__name';
          // 自己的牌表全部可见；对手的牌表仅揭示牌可见
          const showName = isViewingOwnCards(playerId) || isRevealed;
          nameSpan.textContent = showName ? name : '未知';
          if (!showName) {
            nameSpan.style.color = 'var(--text-muted, #888)';
            nameSpan.style.cursor = 'default';
          }
          // 食材牌/佳肴：存储数据供浮窗显示
          if (showName && sampleCard._food) {
            nameSpan.dataset.food = JSON.stringify(sampleCard);
          }
          row.appendChild(nameSpan);

          // 数量
          if (entry.count > 1) {
            const countSpan = document.createElement('span');
            countSpan.className = 'breakdown-card-row__count';
            countSpan.textContent = '×' + entry.count;
            row.appendChild(countSpan);
          }

          // 已揭示时显示灵咒
          if (isRevealed && sampleCard.curses && sampleCard.curses.length) {
            const cursesSpan = document.createElement('span');
            cursesSpan.className = 'breakdown-card-row__curses';
            sampleCard.curses.forEach(c => {
              const tag = document.createElement('span');
              tag.className = 'breakdown-card-row__curse-tag';
              tag.textContent = '⛓️' + c.name + '×' + c.layers;
              cursesSpan.appendChild(tag);
            });
            row.appendChild(cursesSpan);
          }

          // 弃牌按钮（仅自己牌表可见）
          if (isViewingOwnCards(playerId)) {
            const discardBtn = document.createElement('button');
            discardBtn.type = 'button';
            discardBtn.className = 'btn-card-action btn-card-discard';
            discardBtn.textContent = '弃牌';
            discardBtn.style.cssText = 'font-size:10px;padding:2px 6px;flex-shrink:0;';
            discardBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              discardFromDeckByName(playerId, name);
            });
            row.appendChild(discardBtn);
          }

          group.appendChild(row);
        });

        deckBreakdownBody.appendChild(group);
      });
    }

    function refreshDeckBreakdown(playerId) {
      if (deckBreakdownPanel.hidden) return;
      if (!cardListContext || cardListContext.playerId !== playerId) return;
      if (cardListContext.type !== 'deck') return;
      renderDeckBreakdown(playerId);
    }

    // 牌表按钮：切换侧窗
    cardListBreakdownBtn.addEventListener('click', () => {
      if (!cardListContext || cardListContext.type !== 'deck') return;
      const wasHidden = deckBreakdownPanel.hidden;
      deckBreakdownPanel.hidden = !wasHidden;
      if (!wasHidden) {
        deckBreakdownBody.innerHTML = '';
      } else {
        // 应用当前拖拽偏移，让牌表出现在牌库旁边
        if (cardListDragOffset.x !== 0 || cardListDragOffset.y !== 0) {
          deckBreakdownPanel.style.transform = `translate(${cardListDragOffset.x}px, ${cardListDragOffset.y}px)`;
          deckBreakdownPanel.style.transition = 'none';
        }
        renderDeckBreakdown(cardListContext.playerId);
      }
      cardListBreakdownBtn.textContent = deckBreakdownPanel.hidden ? '📋 查看牌表' : '📋 隐藏牌表';
    });

    deckBreakdownClose.addEventListener('click', () => {
      deckBreakdownPanel.hidden = true;
      deckBreakdownBody.innerHTML = '';
      cardListBreakdownBtn.textContent = '📋 查看牌表';
    });

    // ================================================================
    //  烹饪系统 (Cooking)
    // ================================================================
    const FOOD_TYPES = ['山珍', '海味', '时蔬'];
    const FOOD_LEVEL_SUFFIX = { 1: '良', 2: '优', 3: '极' };
    const FOOD_EFFECTS = {
      '山珍': { 1: '+1力量', 2: '+2力量', 3: '+3力量' },
      '海味': { 1: '+1生命', 2: '+2生命', 3: '+3生命' },
      '时蔬': { 1: ['昂扬'], 2: ['昂扬', '贯通'], 3: ['昂扬', '贯通', '迅捷'] },
    };
    const FOOD_TYPE_ICONS = { '山珍': '🍄', '海味': '🐟', '时蔬': '🥬', '佳肴': '🍲' };

    /** 判断是否为食材牌（不含佳肴） */
    function isFoodCard(card) {
      return card && card._food && card._foodType !== '佳肴';
    }

    /** 判断是否为佳肴 */
    function isFeastCard(card) {
      return card && card._food && card._foodType === '佳肴';
    }

    /** 判断任意食物牌（食材或佳肴） */
    function isAnyFoodCard(card) {
      return card && card._food;
    }

    /** 根据式神等级生成一张随机食材牌 */
    function generateFoodCard(level) {
      const lv = (level >= 1 && level <= 3) ? level : 1;
      const type = FOOD_TYPES[Math.floor(Math.random() * FOOD_TYPES.length)];
      const suffix = FOOD_LEVEL_SUFFIX[lv] || '良';
      const name = type + '·' + suffix;
      let effectDesc;
      if (type === '时蔬') {
        const pool = FOOD_EFFECTS[type][lv] || FOOD_EFFECTS[type][1];
        effectDesc = pool[Math.floor(Math.random() * pool.length)];
      } else {
        effectDesc = FOOD_EFFECTS[type][lv] || FOOD_EFFECTS[type][1];
      }
      return {
        id: ++cardIdCounter,
        name: name,
        curses: [],
        _food: true,
        _foodType: type,
        _foodLevel: lv,
        _foodEffects: [effectDesc],
      };
    }

    /** 确定式神等级：从卡牌槽左上角 .card-level 读取 */
    function getShikigamiLevel(slot) {
      if (!slot) return 1;
      const levelInput = slot.querySelector('.card-level');
      if (levelInput) {
        const val = parseInt(levelInput.value, 10);
        if (val >= 1 && val <= 3) return val;
      }
      return 1;
    }

    /** 将3张食材牌合成为1张佳肴 */
    function synthesizeFood(playerId, cards) {
      const allEffects = [];
      cards.forEach(c => {
        if (c._foodEffects) allEffects.push(...c._foodEffects);
      });
      const nameCounts = new Map();
      cards.forEach(c => { nameCounts.set(c.name, (nameCounts.get(c.name) || 0) + 1); });
      const ingredients = [...nameCounts.entries()].map(([n, cnt]) => cnt > 1 ? `${n}×${cnt}` : n).join('、');
      return {
        id: ++cardIdCounter,
        name: '佳肴',
        curses: [],
        _food: true,
        _foodType: '佳肴',
        _foodLevel: 0,
        _foodEffects: allEffects,
        _foodIngredients: ingredients,
      };
    }

    /** 执行烹饪：选择式神 → 获得食材牌 → 可能的佳肴合成 */
    function performCooking(slot) {
      const playerId = slot.dataset.slotPlayer;
      if (!playerId) return;
      const cardName = (slot.querySelector('.card-name')?.value || '').trim();
      if (!cardName) return;
      const playerName = getPlayerName(playerId);
      const isMyOp = (typeof isMyZone === 'function') ? isMyZone(playerId) : true;

      // 烹饪特效动画（本地）
      if (typeof DamageEffects !== 'undefined' && DamageEffects.playCookEffect) {
        DamageEffects.playCookEffect(slot);
      }
      // 同步烹饪动画到对手/观众
      if (!isSoloMode && peerConn && peerConn.open && typeof sendToPeer === 'function') {
        sendToPeer({ type: 'cook-effect', playerId: slot.dataset.slotPlayer, slotIndex: slot.dataset.slotIndex });
      }

      // 确定式神等级（从卡牌槽左上角 .card-level 读取）
      const level = getShikigamiLevel(slot);

      // 生成食材牌
      const foodCard = generateFoodCard(level);
      pushCardToHand(playerId, foodCard);
      updateDeckButtons(playerId);
      refreshOpenListDialog(playerId);

      // 联机同步：需要跨玩家强制同步
      if (typeof syncDeckStateForce === 'function') {
        syncDeckStateForce(playerId);
      } else {
        syncDeckState(playerId);
      }

      // 系统消息：自己看到详细，对手看到摘要
      const detailMsg = `【系统】${playerName}使「${cardName}」进行了一次烹饪，获得了「${foodCard.name}」`;
      const summaryMsg = `【系统】${playerName}使「${cardName}」进行了一次烹饪，获得了一张${level}级食材牌`;
      if (isMyOp) {
        // 我为自己烹饪：我看到详细，对手看到摘要
        addSystemChatMessage(detailMsg);
        if (!isSoloMode && peerConn && peerConn.open && typeof sendToPeer === 'function') {
          sendToPeer({ type: 'sysmsg', text: summaryMsg });
        }
      } else {
        // 我为对手烹饪：双方都看到摘要
        broadcastSystemMsg(summaryMsg);
      }

      // 检查手中是否有≥3张食材牌（不含佳肴），有则合成
      const foodCards = state.hand.filter(c => isFoodCard(c));
      if (foodCards.length >= 3) {
        const shuffled = [...foodCards].sort(() => Math.random() - 0.5);
        const selected = shuffled.slice(0, 3);
        // 安全移除：逐张匹配，双重验证 isFoodCard 防止误删
        selected.forEach(card => {
          const idx = state.hand.findIndex(hc => hc.id === card.id && isFoodCard(hc));
          if (idx !== -1) state.hand.splice(idx, 1);
        });
        const feast = synthesizeFood(playerId, selected);
        pushCardToHand(playerId, feast);
        updateDeckButtons(playerId);
        refreshOpenListDialog(playerId);
        if (typeof syncDeckStateForce === 'function') {
          syncDeckStateForce(playerId);
        } else {
          syncDeckState(playerId);
        }
        // 仅合成方注册佳肴到CardDB并可查看效果
        const detailFeast = `【系统】${playerName}将3张食材牌合成为「佳肴」`;
        const summaryFeast = `【系统】${playerName}将3张食材牌合成为佳肴（不可查看）`;
        if (isMyOp) {
          // 注册佳肴到CardDB，使「佳肴」可悬浮查看
          if (typeof CardDB !== 'undefined' && typeof CardDB.addCustom === 'function') {
            const ingredientText = feast._foodIngredients ? '由' + feast._foodIngredients + '合成' : '';
            const feastDef = {
              type: 'curse', name: '佳肴', owner: '中立',
              effect: ingredientText + '\n' + feast._foodEffects.join('\n'),
              _food: true, _foodType: '佳肴', _foodLevel: 0,
              _foodEffects: feast._foodEffects, _foodIngredients: feast._foodIngredients,
            };
            CardDB.addCustom(feastDef);
            // 同步佳肴定义给对方，使对方也能悬浮查看正确效果
            if (!isSoloMode && peerConn && peerConn.open && typeof sendToPeer === 'function') {
              sendToPeer({ type: 'food-card-register', card: feastDef });
            }
          }
          addSystemChatMessage(detailFeast);
          if (!isSoloMode && peerConn && peerConn.open && typeof sendToPeer === 'function') {
            sendToPeer({ type: 'sysmsg', text: summaryFeast });
          }
        } else {
          broadcastSystemMsg(summaryFeast);
        }
      }
    }
    const dropdownToggle = document.getElementById('btn-dropdown-toggle');
    const dropdownMenu = document.getElementById('dropdown-other-menu');

    dropdownToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      // 互斥：关闭另一个下拉
      const mechanicMenu = document.getElementById('dropdown-mechanic-menu');
      if (mechanicMenu) mechanicMenu.hidden = true;
      dropdownMenu.hidden = !dropdownMenu.hidden;
    });

    document.addEventListener('click', () => {
      dropdownMenu.hidden = true;
    });

    dropdownMenu.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      if (!action) return;
      dropdownMenu.hidden = true;
      switch (action) {
        case 'upload-cards':
          _handleUploadCards();
          break;
        case 'save-game':
          _handleSaveGame();
          break;
        case 'load-game':
          _handleLoadGame();
          break;
        case 'shikigami-book':
          openShikigamiBook();
          break;
        case 'effect-builder':
          if (typeof EffectBuilder !== 'undefined') {
            EffectBuilder.open();
          } else {
            broadcastSystemMsg('【系统】效果编辑器尚未就绪，请稍后再试。');
          }
          break;
        case 'debug-panel':
          if (typeof DebugPanel !== 'undefined') {
            DebugPanel.toggle();
          }
          break;
      }
    });

    // ================================================================
    //  命运抉择系统
    // ================================================================
    const fateOverlay = document.getElementById('fate-dialog-overlay');
    const fateSlotTop = document.getElementById('fate-slot-top');
    const fateSlotBottom = document.getElementById('fate-slot-bottom');
    const fateBtnStart = document.getElementById('fate-btn-start');
    const fateBtnSwap = document.getElementById('fate-btn-swap');
    const fateBtnConfirm = document.getElementById('fate-dialog-confirm');
    const fateBtnCancel = document.getElementById('fate-dialog-cancel');

    let fateContext = null;

    function openFateDialog(playerId) {
      if (typeof isSpectator !== 'undefined' && isSpectator) return;
      const state = getPlayerCardState(playerId);
      if (state.deck.length < 2) {
        broadcastSystemMsg(`【系统】${getPlayerName(playerId)}牌库不足2张，无法进行命运抉择`);
        return;
      }
      const opId = (typeof localPlayerId !== 'undefined' && localPlayerId && localPlayerId !== '0') ? localPlayerId : '1';
      document.getElementById('fate-dialog-title').textContent = `🔀 命运抉择 - ${getPlayerName(playerId)}`;
      fateContext = { playerId, operatorId: opId, topCard: null, bottomCard: null, swapped: false };
      fateSlotTop.innerHTML = '<span class="fate-slot-placeholder">牌库顶</span>';
      fateSlotBottom.innerHTML = '<span class="fate-slot-placeholder">牌库底</span>';
      fateBtnStart.hidden = false;
      fateBtnSwap.hidden = true;
      fateBtnCancel.hidden = false;
      fateOverlay.hidden = false;
    }

    function closeFateDialog(cancel) {
      if (cancel && fateContext && fateContext.topCard) {
        broadcastSystemMsg(`【系统】${getPlayerName(fateContext.playerId)}取消了命运抉择..`);
      }
      fateOverlay.hidden = true;
      fateContext = null;
    }

    function startFate() {
      if (!fateContext) return;
      const { playerId } = fateContext;
      const state = getPlayerCardState(playerId);
      if (state.deck.length < 2) return;
      const topCard = state.deck[0];
      const bottomCard = state.deck[state.deck.length - 1];
      fateContext.topCard = topCard;
      fateContext.bottomCard = bottomCard;
      fateContext.swapped = false;

      // 为对手操作时，先揭示再渲染（仅命运抉择揭示，不混入占卜集）
      const opId = fateContext.operatorId || playerId;
      if (opId !== playerId) {
        if (!playerFateRevealedCards[opId]) playerFateRevealedCards[opId] = new Set();
        playerFateRevealedCards[opId].add(topCard.id);
        playerFateRevealedCards[opId].add(bottomCard.id);
      }

      _renderFateSlots(fateContext, playerId);
      fateBtnStart.hidden = true;
      fateBtnSwap.hidden = false;
      fateBtnCancel.hidden = true;

      const tgtName = getPlayerName(playerId);
      const opName = getPlayerName(opId);
      const msg = opId !== playerId
        ? `【系统】${opName}正在为${tgtName}命运抉择...`
        : `【系统】${tgtName}正在命运抉择...`;
      broadcastSystemMsg(msg);
    }

    function _renderFateSlots(ctx, playerId) {
      const own = isViewingOwnCards(playerId);
      _renderFateCardSlot(fateSlotTop, '牌库顶', ctx.topCard, own);
      _renderFateCardSlot(fateSlotBottom, '牌库底', ctx.bottomCard, own);
    }

    function _renderFateCardSlot(slotEl, title, card, own) {
      // 命运抉择揭示：操作者即使不是牌主也能看到
      const opId = fateContext ? (fateContext.operatorId || fateContext.playerId) : null;
      const viewerId = getViewerPlayerId();
      const isFateRevealed = opId && playerFateRevealedCards[viewerId] && playerFateRevealedCards[viewerId].has(card.id);
      const canSee = own || isFateRevealed;

      if (!canSee) {
        slotEl.innerHTML = `<div class="fate-card-title">${title}</div><div class="fate-card-name" style="color:#888">未知</div>`;
        return;
      }
      const db = (typeof CardDB !== 'undefined') ? CardDB.lookup(card.name) : null;
      const typeNames = { shikigami:'式神', summon:'召唤物', spell:'法术', battle:'战斗', form:'形态', realm:'幻境', curse:'灵咒', bond:'协战' };

      let html = `<div class="fate-card-title">${title}</div>`;

      // 等级菱形
      if (db && db.level) {
        html += `<span class="fate-mini-level"><span>${db.level}</span></span>`;
      }

      // 名称
      html += `<div class="fate-card-name">${card.name}</div>`;

      // 效果描述
      const eff = db ? (db.effect || db.ability || '') : '';
      if (eff) html += `<div class="fate-card-effect">${eff}</div>`;

      // 灵咒
      if (card.curses && card.curses.length) {
        html += '<div class="fate-card-curses">';
        card.curses.forEach(c => {
          html += `<span class="fate-curse-tag">⛓️${c.name}×${c.layers}</span>`;
        });
        html += '</div>';
      }

      // 底部
      if (db) {
        const typeCN = typeNames[db.type] || db.type;
        html += `<div class="fate-card-footer">${db.owner || '中立'} - ${typeCN}</div>`;
      } else {
        html += '<div class="fate-card-footer">未录入数据</div>';
      }

      // 左右下角属性
      if (db) {
        let bl = '', br = '', blColor = '', brColor = '';
        switch (db.type) {
          case 'battle': case 'bond':
            if (db.atkBonus > 0) { bl = '+' + db.atkBonus; blColor = '#50c8b4'; }
            if (db.atkPenalty > 0) { bl = '-' + db.atkPenalty; blColor = '#ff6e6e'; }
            if (db.shieldBonus > 0) { br = '+' + db.shieldBonus; brColor = '#64d264'; }
            if (db.shieldPenalty > 0) { br = '-' + db.shieldPenalty; brColor = '#ff6e6e'; }
            break;
          case 'spell':
            if (db.atkBonus > 0) { bl = '+' + db.atkBonus; blColor = '#50c8b4'; }
            if (db.hpBonus > 0) { br = '+' + db.hpBonus; brColor = '#64d264'; }
            break;
          case 'realm':
            if (db.durability > 0) { br = '' + db.durability; brColor = '#c8a0f0'; }
            break;
          case 'form':
            if (db.attack != null) { bl = '' + db.attack; blColor = '#50c8b4'; }
            if (db.hp != null) { br = '' + db.hp; brColor = '#ff8282'; }
            break;
          case 'shikigami': case 'summon':
            if (db.attack != null) { bl = '' + db.attack; blColor = '#50c8b4'; }
            if (db.hp != null) { br = '' + db.hp; brColor = '#ff8282'; }
            break;
        }
        if (bl) html += `<span class="fate-stat fate-stat--bl" style="color:${blColor};border-color:${blColor}">${bl}</span>`;
        if (br) html += `<span class="fate-stat fate-stat--br" style="color:${brColor};border-color:${brColor}">${br}</span>`;
      }

      slotEl.innerHTML = html;

      // 自适应缩字：效果描述超出时缩小字号
      if (eff) {
        const effEl = slotEl.querySelector('.fate-card-effect');
        if (effEl) {
          let s = 15;
          effEl.style.fontSize = s + 'px';
          requestAnimationFrame(() => {
            while (effEl.scrollHeight > effEl.clientHeight + 2 && s > 9) {
              s -= 1;
              effEl.style.fontSize = s + 'px';
            }
          });
        }
      }
    }

    function swapFateCards() {
      if (!fateContext) return;
      fateContext.swapped = !fateContext.swapped;
      const tmp = fateContext.topCard;
      fateContext.topCard = fateContext.bottomCard;
      fateContext.bottomCard = tmp;
      if (typeof gsap !== 'undefined') {
        const topEl = fateSlotTop;
        const bottomEl = fateSlotBottom;
        const topY = topEl.getBoundingClientRect().top;
        const bottomY = bottomEl.getBoundingClientRect().top;
        const delta = bottomY - topY;
        const tl = gsap.timeline();
        tl.to(topEl, { y: delta, duration: 0.35, ease: 'power2.inOut' }, 0);
        tl.to(bottomEl, { y: -delta, duration: 0.35, ease: 'power2.inOut' }, 0);
        tl.call(() => {
          _renderFateSlots(fateContext, fateContext.playerId);
          gsap.set([topEl, bottomEl], { y: 0 });
        });
      }
    }

    function confirmFate() {
      if (!fateContext) return;
      const { playerId, swapped } = fateContext;
      const state = getPlayerCardState(playerId);
      if (swapped && state.deck.length >= 2) {
        const top = state.deck.shift();
        const bottom = state.deck.pop();
        state.deck.unshift(bottom);
        state.deck.push(top);
      }
      updateDeckButtons(playerId);
      refreshOpenListDialog(playerId);
      syncDeckState(playerId);
      const opId = fateContext.operatorId || playerId;
      const isHelp = opId !== playerId;
      const tgtName = getPlayerName(playerId);
      const opName = getPlayerName(opId);
      const msg = isHelp
        ? `【系统】${opName}完成了对${tgtName}的命运抉择`
        : `【系统】${tgtName}完成了命运抉择`;
      broadcastSystemMsg(msg);
      closeFateDialog();
    }

    fateBtnStart.addEventListener('click', startFate);
    fateBtnSwap.addEventListener('click', swapFateCards);
    fateBtnConfirm.addEventListener('click', confirmFate);
    fateBtnCancel.addEventListener('click', () => closeFateDialog(true));

    // Esc 关闭命运抉择
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && fateOverlay && !fateOverlay.hidden) {
        closeFateDialog(true);
      }
    });

    // ================================================================
    //  初始手牌系统
    const initialHandOverlay = document.getElementById('initial-hand-overlay');
    const initialHandCountInput = document.getElementById('initial-hand-count-input');
    const initialHandDrawBtn = document.getElementById('initial-hand-draw-btn');
    const initialHandCardsBody = document.getElementById('initial-hand-cards-body');
    const initialHandCancelBtn = document.getElementById('initial-hand-cancel');
    const initialHandConfirmBtn = document.getElementById('initial-hand-confirm');
    const initialHandDrawHint = document.getElementById('initial-hand-draw-hint');

    /** 初始手牌上下文 */
    let initialHandContext = null; // { playerId, drawnCards: [], rejectedIndices: Set }

    /** 打开初始手牌弹窗 */
    function openInitialHandDialog(playerId) {
      const state = getPlayerCardState(playerId);
      if (!state.deck.length) {
        broadcastSystemMsg(`【系统】${getPlayerName(playerId)}的牌库为空，无法抽取初始手牌`);
        return;
      }
      initialHandContext = {
        playerId,
        drawnCards: [],
        rejectedIndices: new Set(),
      };
      initialHandCountInput.value = Math.min(3, state.deck.length);
      initialHandCountInput.max = state.deck.length;
      initialHandCardsBody.innerHTML = '';
      initialHandDrawHint.hidden = true;
      initialHandOverlay.hidden = false;
      initialHandCountInput.focus();
      initialHandCountInput.select();

      // 绑定标题拖拽
      const dialogEl = initialHandOverlay.querySelector('.speak-dialog');
      let dragStart = null;
      let dragOffset = { x: 0, y: 0 };
      const titleEl = document.getElementById('initial-hand-title');
      titleEl.style.cursor = 'grab';
      titleEl.onmousedown = function(e) {
        if (e.target.closest('button')) return;
        dragStart = { x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y };
        dialogEl.style.cursor = 'grabbing';
        e.preventDefault();
      };
      document.addEventListener('mousemove', function onMove(e) {
        if (!dragStart || initialHandOverlay.hidden) return;
        dragOffset.x = e.clientX - dragStart.x;
        dragOffset.y = e.clientY - dragStart.y;
        dialogEl.style.transform = `translate(${dragOffset.x}px, ${dragOffset.y}px)`;
        dialogEl.style.transition = 'none';
      });
      document.addEventListener('mouseup', function onUp() {
        if (!dragStart) return;
        dragStart = null;
        dialogEl.style.cursor = '';
      });
    }

    /** 关闭初始手牌弹窗 */
    function closeInitialHandDialog() {
      initialHandOverlay.hidden = true;
      initialHandContext = null;
      initialHandCardsBody.innerHTML = '';
      initialHandDrawHint.hidden = true;
      // 重置拖拽
      const dialogEl = initialHandOverlay.querySelector('.speak-dialog');
      if (dialogEl) {
        dialogEl.style.transform = '';
        dialogEl.style.transition = '';
        dialogEl.style.cursor = '';
      }
      document.getElementById('initial-hand-title').style.cursor = '';
    }

    /** 从牌库随机抽取 count 张牌（不改变牌库，返回副本） */
    function drawInitialCards(playerId, count) {
      const state = getPlayerCardState(playerId);
      const deck = state.deck.filter(c => c && typeof c === 'object');
      if (!deck.length) return [];
      const clamped = Math.min(count, deck.length);
      // 随机抽取 clamped 张（不改变牌库顺序）
      const indices = [...Array(deck.length).keys()];
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      const selected = indices.slice(0, clamped).map(i => ({
        id: deck[i].id,
        name: deck[i].name,
        curses: deck[i].curses ? deck[i].curses.map(c => ({ name: c.name, layers: c.layers })) : [],
      }));
      return selected;
    }

    /** 渲染初始手牌卡牌列表 */
    function renderInitialHandCards() {
      if (!initialHandContext) return;
      const { drawnCards, rejectedIndices } = initialHandContext;
      initialHandCardsBody.innerHTML = '';

      if (!drawnCards.length) {
        return;
      }

      drawnCards.forEach((card, idx) => {
        const item = document.createElement('div');
        item.className = 'initial-hand-card';
        if (rejectedIndices.has(idx)) {
          item.classList.add('initial-hand-card--rejected');
        }
        item.dataset.displayIndex = idx;

        const indexSpan = document.createElement('span');
        indexSpan.className = 'initial-hand-card__index';
        indexSpan.textContent = `#${idx + 1}`;
        item.appendChild(indexSpan);

        const nameSpan = document.createElement('span');
        nameSpan.className = 'initial-hand-card__name card-list-item__name';
        nameSpan.textContent = card.name || '(未命名)';
        item.appendChild(nameSpan);

        // X 标记覆盖层
        if (rejectedIndices.has(idx)) {
          const xMark = document.createElement('span');
          xMark.className = 'initial-hand-card__x-mark';
          xMark.textContent = '✕';
          item.appendChild(xMark);
        }

        // 点击切换 X 标记（基于数组索引，彻底避免 ID 碰撞）
        item.addEventListener('click', () => {
          if (rejectedIndices.has(idx)) {
            rejectedIndices.delete(idx);
          } else {
            rejectedIndices.add(idx);
          }
          renderInitialHandCards();
        });

        initialHandCardsBody.appendChild(item);
      });
    }

    /** 抽取按钮：从牌库随机抽牌展示 */
    initialHandDrawBtn.addEventListener('click', () => {
      if (!initialHandContext) return;
      const count = parseInt(initialHandCountInput.value, 10);
      if (isNaN(count) || count < 1) {
        initialHandCountInput.value = 1;
        return;
      }
      const state = getPlayerCardState(initialHandContext.playerId);
      const clamped = Math.min(count, state.deck.length);
      if (clamped < 1) return;
      initialHandCountInput.value = clamped;
      initialHandContext.drawnCards = drawInitialCards(initialHandContext.playerId, clamped);
      initialHandContext.rejectedIndices = new Set();
      initialHandDrawHint.hidden = false;
      broadcastSystemMsg(`【系统】${getPlayerName(initialHandContext.playerId)}观看了初始手牌...正在选择需要替换的卡牌..`);
      renderInitialHandCards();
    });

    /** 确定按钮：替换X牌，抽入手牌，发系统消息 */
    initialHandConfirmBtn.addEventListener('click', () => {
      if (!initialHandContext) return;
      const { playerId, drawnCards, rejectedIndices } = initialHandContext;
      if (!drawnCards.length) {
        closeInitialHandDialog();
        return;
      }
      const state = getPlayerCardState(playerId);
      const playerName = getPlayerName(playerId);

      // === 第1步：从牌库中找到每张展示牌的原件，移除并收集 ===
      // drawnCards 是 drawInitialCards 返回的独立副本（仅 id/name/curses），
      // 这里通过 id 在真实牌库 state.deck 中定位原件。
      const drawnOriginals = []; // 与 drawnCards 一一对应的牌库原件
      for (const drawn of drawnCards) {
        const idx = state.deck.findIndex(c => c && c.id === drawn.id);
        if (idx !== -1) {
          const [original] = state.deck.splice(idx, 1);
          drawnOriginals.push(original);
        } else {
          // 防御：原件已不在牌库（极端情况），用副本占位
          drawnOriginals.push(null);
        }
      }

      // === 第2步：按 X 标记拆分原件 ===
      const keptOriginals = [];    // 保留的牌库原件
      const rejectedOriginals = []; // 画X的牌库原件（将退回牌库）
      const keptNames = [];
      const rejectedNames = [];

      drawnOriginals.forEach((orig, idx) => {
        const displayCard = drawnCards[idx];
        if (!displayCard) return;
        if (rejectedIndices.has(idx)) {
          rejectedNames.push(displayCard.name);
          if (orig) rejectedOriginals.push(orig);
        } else {
          keptNames.push(displayCard.name);
          if (orig) keptOriginals.push(orig);
        }
      });

      // === 第3步：为每张画X的牌从剩余牌库随机换一张 ===
      // 此时 state.deck 已排除所有展示牌（含将被退回的X牌），从中选取替换
      const replacementNames = [];
      const replacementCards = [];
      if (rejectedOriginals.length > 0) {
        const pool = state.deck.filter(c => c && typeof c === 'object');
        const shuffled = [...pool].sort(() => Math.random() - 0.5);

        for (let i = 0; i < rejectedOriginals.length && i < shuffled.length; i++) {
          const replacement = shuffled[i];
          replacementNames.push(replacement.name);
          const realIdx = state.deck.findIndex(c => c && c.id === replacement.id);
          if (realIdx !== -1) {
            const [removed] = state.deck.splice(realIdx, 1);
            replacementCards.push(removed);
          }
        }
      }

      // 画X的牌原件退回牌库（交换而非丢弃，在替换选取之后放回）
      rejectedOriginals.forEach(orig => {
        state.deck.push(orig);
      });

      // === 第4步：所有保留原件 + 替换牌 → 抽入手牌 ===
      const allCardsToHand = [...keptOriginals, ...replacementCards];
      allCardsToHand.forEach(card => {
        if (card) pushCardToHand(playerId, card);
      });

      // === 第5步：更新UI ===
      updateDeckButtons(playerId);
      refreshOpenListDialog(playerId);
      syncDeckState(playerId);

      // 飞行动画：N张牌依次从牌库飞入手牌
      if (typeof CardFlight !== 'undefined') {
        CardFlight.flySeqAndBroadcast(playerId, allCardsToHand.length, 'deck', null, 'hand', { interval: 0.18, arcHeight: 60 });
      }

      // === 第6步：系统消息 ===
      const totalCount = drawnCards.length;

      // 自己看到详细消息
      let detailMsg = `【系统】${playerName}抽取了${totalCount}张初始手牌`;
      if (keptNames.length > 0) {
        detailMsg += ` —— 保留：「${keptNames.join('」、「')}」`;
      }
      if (rejectedNames.length > 0) {
        detailMsg += ` —— 放弃：「${rejectedNames.join('」、「')}」`;
        if (replacementNames.length > 0) {
          detailMsg += `，替换为：「${replacementNames.join('」、「')}」`;
        }
      }
      detailMsg += '（此消息仅自己可见）';

      // 对手只看到摘要
      const summaryMsg = `【系统】${playerName}抽了${totalCount}张初始手牌`;

      // 本地显示详细信息
      addSystemChatMessage(detailMsg);

      // 发送给对手：仅摘要
      if (!isSoloMode && peerConn && peerConn.open && typeof sendToPeer === 'function') {
        sendToPeer({ type: 'sysmsg', text: summaryMsg });
      }

      closeInitialHandDialog();
    });

    /** 取消按钮 */
    initialHandCancelBtn.addEventListener('click', closeInitialHandDialog);

    // Esc 关闭
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && initialHandOverlay && !initialHandOverlay.hidden) {
        closeInitialHandDialog();
      }
    });

    // 点击遮罩关闭
    initialHandOverlay.addEventListener('click', (e) => {
      if (e.target === initialHandOverlay) {
        closeInitialHandDialog();
      }
    });

    /** "初始手牌"按钮点击事件 */
    document.getElementById('card-list-initial-hand-btn').addEventListener('click', () => {
      if (!cardListContext || cardListContext.type !== 'hand') return;
      openInitialHandDialog(cardListContext.playerId);
    });

    // 输入框回车触发抽取
    initialHandCountInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        initialHandDrawBtn.click();
      }
    });
