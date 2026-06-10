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

    /** 获取当前查看者ID */
    function getViewerPlayerId() {
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
      const { deck, hand } = getPlayerCardState(playerId);
      const drawBtn = zone.querySelector('.btn-deck[data-action="draw"]');
      const handBtn = zone.querySelector('.btn-deck[data-action="hand"]');
      const deckBtn = zone.querySelector('.btn-deck[data-action="deck"]');
      const shuffleBtn = zone.querySelector('.btn-deck[data-action="shuffle-deck"]');
      if (drawBtn) {
        drawBtn.disabled = deck.length === 0;
      }
      if (shuffleBtn) {
        shuffleBtn.disabled = deck.length === 0;
      }
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
      cardTextContext.onConfirm(value);
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
        const discardBtn = document.createElement('button');
        discardBtn.type = 'button';
        discardBtn.className = 'btn-card-action btn-card-discard';
        discardBtn.textContent = '弃置';
        discardBtn.addEventListener('click', () => removeFromHand(playerId, card.id, 'discard'));
        actions.appendChild(useBtn);
        actions.appendChild(discardBtn);
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
        if (isRevealed) {
          nameSpan.className = 'deck-group__name';
          nameSpan.textContent = card.name + '（已占卜）';
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
      cardListTitle.textContent = title;
      if (type === 'hand') renderHandList(playerId);
      else renderDeckList(playerId);
      // 牌表按钮：仅自己牌库可见（查看对手牌库时隐藏）
      cardListBreakdownBtn.hidden = (type !== 'deck' || !isViewingOwnCards(playerId));
      cardListBreakdownBtn.textContent = '📋 查看牌表';
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
      state.hand.push(card);
      updateDeckButtons(playerId);
      refreshOpenListDialog(playerId);
      syncDeckState(playerId);
      broadcastSystemMsg(`【系统】${getPlayerName(playerId)}抽了一张牌`);
    }

    function removeFromHand(playerId, cardId, action) {
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
        // 【消息分组】开始：后续所有效果消息都归入这条主消息下
        const mainMsg = `【系统】${getPlayerName(playerId)}${verb}「${card.name}」`;
        if (typeof startMessageGroup === 'function') {
          startMessageGroup(mainMsg);
        } else {
          broadcastSystemMsg(mainMsg);
        }

        const dbCard = CardDB.lookup(card.name);
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
          }
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
      }
    }

    function insertCardAtRandomPosition(deck, card) {
      const index = Math.floor(Math.random() * (deck.length + 1));
      deck.splice(index, 0, card);
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
    }

    // ---- 占卜系统 ----
    let divineContext = null; // { playerId, topGroup:[], bottomGroup:[], restDeck:[], x }

    const divineOverlay = document.getElementById('divine-dialog-overlay');
    const divineXRow = document.getElementById('divine-x-row');
    const divineXInput = document.getElementById('divine-x-input');
    const divineMain = document.getElementById('divine-main');
    const divineTopList = document.getElementById('divine-top-list');
    const divineBottomList = document.getElementById('divine-bottom-list');
    const divineActions = document.getElementById('divine-actions');
    const divineTitle = document.getElementById('divine-dialog-title');

    /** 步骤1：弹出占卜X输入框 */
    function openDivineXPrompt(playerId) {
      const state = getPlayerCardState(playerId);
      if (!state.deck.length) {
        broadcastSystemMsg(`【系统】${getPlayerName(playerId)}试图占卜，但牌库为空`);
        return;
      }
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
        topGroup: divineCards,          // 默认全部留在顶部
        bottomGroup: [],                // 暂无移到底部
        x: clampedX,
      };
      // UI切换
      divineXRow.hidden = true;
      divineMain.hidden = false;
      divineActions.hidden = false;
      divineTitle.textContent = `🔮 占卜 ${clampedX} — ${getPlayerName(playerId)}`;
      renderDivineLists();
      broadcastSystemMsg(`【系统】${getPlayerName(playerId)}进行了占卜${clampedX}`);
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
      // 占卜者自己看到详细信息（牌名）
      addSystemChatMessage(`【系统】${playerName}完成了占卜 —— 牌库顶：[${topNames}]，牌库底：[${bottomNames}]`);
      // 对手看到摘要信息（只有数量，不知道牌名）
      if (!isSoloMode && peerConn && peerConn.open && typeof sendToPeer === 'function') {
        const topWord = topCount > 0 ? `${topCount}张` : '0张';
        const bottomWord = bottomCount > 0 ? `${bottomCount}张` : '0张';
        const summaryMsg = `【系统】${playerName}完成了占卜${x}，将${topWord}牌放在了牌库顶，将${bottomWord}牌放在了牌库底`;
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

    function addToHand(playerId, text) {
      const name = text.trim();
      if (!name) return;
      getPlayerCardState(playerId).hand.push(createCard(name));
      updateDeckButtons(playerId);
      refreshOpenListDialog(playerId);
      syncDeckState(playerId);
      broadcastSystemMsg(`【系统】${getPlayerName(playerId)}将「${name}」置入了手牌`);
    }

    function addToDeck(playerId, text) {
      const name = text.trim();
      if (!name) return;
      const deck = getPlayerCardState(playerId).deck;
      insertCardAtRandomPosition(deck, createCard(name));
      updateDeckButtons(playerId);
      refreshOpenListDialog(playerId);
      syncDeckState(playerId);
      broadcastSystemMsg(`【系统】${getPlayerName(playerId)}将「${name}」置入了牌库`);
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
            onConfirm: (text) => addToHand(playerId, text),
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
            onConfirm: (text) => addToDeck(playerId, text),
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
      if (type === 'hand') {
        broadcastSystemMsg('【系统】' + getPlayerName(playerId) + '为' + loc + '「' + target.name + '」随机结附了灵咒「' + name + '」×1');
      } else {
        broadcastSystemMsg('【系统】' + getPlayerName(playerId) + '为' + loc + '一张牌随机结附了灵咒「' + name + '」×1');
      }
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

      // 烹饪特效动画
      if (typeof DamageEffects !== 'undefined' && DamageEffects.playCookEffect) {
        DamageEffects.playCookEffect(slot);
      }

      // 确定式神等级（从卡牌槽左上角 .card-level 读取）
      const level = getShikigamiLevel(slot);

      // 生成食材牌
      const foodCard = generateFoodCard(level);
      const state = getPlayerCardState(playerId);
      state.hand.push(foodCard);
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
        state.hand.push(feast);
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
