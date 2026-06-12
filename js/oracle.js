// ================================================================
//  js/oracle.js — 启悟系统
//  启悟机制切换、启悟手牌区管理、启悟弹窗
//  依赖: network.js, game-core.js, card-deck.js
// ================================================================

    //  启悟系统
    // ================================================================
    /** 每个玩家的启悟激活状态 */
    const oracleActive = { '1': false, '2': false };

    /** 每个玩家的启悟手牌区 */
    const oracleHands = { '1': [], '2': [] };

    // DOM引用
    const oracleOverlay = document.getElementById('oracle-dialog-overlay');
    const oracleDialog = document.getElementById('oracle-dialog');
    const oracleDialogHeader = document.getElementById('oracle-dialog-header');
    const oracleCloseBtn = document.getElementById('oracle-dialog-close');
    const oracleCardInput = document.getElementById('oracle-card-input');
    const oracleBtnAdd = document.getElementById('oracle-btn-add');
    const oracleBtnDraw = document.getElementById('oracle-btn-draw');
    const oracleCardsList = document.getElementById('oracle-cards-list');

    let _activeOraclePlayer = null;

    // 拖拽状态
    let _draggingOracle = false;
    let _dragOX = 0, _dragOY = 0, _dialogOX = 0, _dialogOY = 0;

    /** 获取启悟区按钮元素 */
    function getOracleZoneBtn(playerId) {
      return document.getElementById('btn-oracle-zone-' + playerId);
    }

    /** 切换启悟机制 */
    function toggleOracle(playerId) {
      oracleActive[playerId] = !oracleActive[playerId];
      const active = oracleActive[playerId];
      const btn = getOracleZoneBtn(playerId);
      if (btn) {
        if (active) {
          btn.hidden = false;
          btn.classList.add('oracle-appear');
          // 动画结束后移除appear类
          setTimeout(() => btn.classList.remove('oracle-appear'), 600);
        } else {
          btn.hidden = true;
        }
      }
      // 刷新手牌列表以显示/隐藏"置入启悟区"按钮
      refreshOpenListDialog(playerId);
      // 关闭启悟机制时，若弹窗仍开着则一并关闭
      if (!active && !oracleOverlay.hidden && _activeOraclePlayer === playerId) {
        closeOracleDialog();
      }
      // 系统消息
      const name = (typeof getPlayerName === 'function') ? getPlayerName(playerId) : ('玩家' + playerId);
      const msg = active ? ('【系统】' + name + '开启了启悟机制') : ('【系统】' + name + '关闭了启悟机制');
      broadcastSystemMsg(msg);
      // 同步到对手
      syncOracleToPeer(playerId);
    }

    /** 打开启悟弹窗（仅可查看自己的启悟区，对手启悟区不可见） */
    function openOracleDialog(playerId) {
      // 检查是否有权查看
      const own = (typeof isViewingOwnCards === 'function') ? isViewingOwnCards(playerId) : true;
      const solo = (typeof isSoloMode !== 'undefined') ? isSoloMode : false;
      if (!own && !solo) return;
      _activeOraclePlayer = playerId;
      renderOracleCards(playerId);
      oracleOverlay.hidden = false;
    }

    /** 关闭启悟弹窗 */
    function closeOracleDialog() {
      oracleOverlay.hidden = true;
      _activeOraclePlayer = null;
    }

    /** 渲染启悟手牌列表 */
    function renderOracleCards(playerId) {
      const cards = oracleHands[playerId] || [];
      const own = (typeof isViewingOwnCards === 'function') ? isViewingOwnCards(playerId) : true;
      const solo = (typeof isSoloMode !== 'undefined') ? isSoloMode : false;
      oracleCardsList.innerHTML = '';
      if (!cards.length) return;

      cards.forEach((card, idx) => {
        if (!card || typeof card !== 'object') return;
        const item = document.createElement('div');
        item.className = 'oracle-card-item';

        // 信息区（含卡牌名、灵咒标签）
        const info = document.createElement('div');
        info.className = 'oracle-card-item__info';
        // 存储灵咒数据供浮窗显示
        if ((own || solo) && card.curses && card.curses.length) {
          info.dataset.cardCurses = JSON.stringify(card.curses);
        }

        const nameEl = document.createElement('span');
        nameEl.className = 'oracle-card-item__name card-name';
        if (own || solo) {
          nameEl.textContent = card.name || '(未命名)';
          nameEl.value = card.name || '';
        } else {
          nameEl.textContent = '未知';
          nameEl.style.color = 'var(--text-muted, #888)';
        }
        info.appendChild(nameEl);

        // 灵咒标签（仅自己可见）
        if ((own || solo) && card.curses && card.curses.length) {
          const curseTags = document.createElement('div');
          curseTags.className = 'card-list-item__curses';
          card.curses.forEach(c => {
            const tag = document.createElement('span');
            tag.className = 'card-list-curse-tag';
            tag.dataset.curseName = c.name;
            tag.textContent = '⛓️' + c.name + '×' + c.layers;
            tag.addEventListener('click', (e) => {
              e.stopPropagation();
              if (typeof openCursePanel === 'function' && typeof _curseTargetForCard === 'function') {
                openCursePanel(_curseTargetForCard(playerId, card, '启悟区中的'));
              }
            });
            curseTags.appendChild(tag);
          });
          info.appendChild(curseTags);
        }
        item.appendChild(info);

        // 操作按钮仅自己可见
        if (own || solo) {
        const actions = document.createElement('div');
        actions.className = 'oracle-card-item__actions';

        // 添加灵咒按钮
        const addCurseBtn = document.createElement('button');
        addCurseBtn.type = 'button';
        addCurseBtn.className = 'btn-card-curse-add';
        addCurseBtn.textContent = '➕';
        addCurseBtn.title = '添加灵咒';
        addCurseBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (typeof openCursePanel === 'function' && typeof _curseTargetForCard === 'function') {
            openCursePanel(_curseTargetForCard(playerId, card, '启悟区中的'));
          }
        });
        actions.appendChild(addCurseBtn);

        // 使用按钮
        const useBtn = document.createElement('button');
        useBtn.className = 'oracle-act--use';
        useBtn.textContent = '使用';
        useBtn.addEventListener('click', () => removeFromOracle(playerId, idx, 'use'));
        actions.appendChild(useBtn);

        // 弃置按钮
        const discardBtn = document.createElement('button');
        discardBtn.className = 'oracle-act--discard';
        discardBtn.textContent = '弃置';
        discardBtn.addEventListener('click', () => removeFromOracle(playerId, idx, 'discard'));
        actions.appendChild(discardBtn);

        // 置入手牌区按钮
        const moveBtn = document.createElement('button');
        moveBtn.className = 'oracle-act--move';
        moveBtn.textContent = '置入手牌区';
        moveBtn.addEventListener('click', () => moveToHand(playerId, idx));
        actions.appendChild(moveBtn);

        // 置入牌库按钮
        const deckBtn = document.createElement('button');
        deckBtn.className = 'oracle-act--deck';
        deckBtn.textContent = '置入牌库';
        deckBtn.addEventListener('click', () => moveToDeck(playerId, idx));
        actions.appendChild(deckBtn);

        item.appendChild(actions);
        } // end if own
        oracleCardsList.appendChild(item);
      });
    }

    /** 启悟相关系统消息：仅日月星诫暴露牌名，其余显示"一张牌" */
    function _oracleCardLabel(cardName) {
      const revealed = ['日诫', '月诫', '星诫'];
      const name = cardName || '未知牌';
      return revealed.includes(name) ? ('「' + name + '」') : '一张牌';
    }

    /** 从启悟区移除卡牌（使用/弃置） */
    function removeFromOracle(playerId, idx, reason) {
      const cards = oracleHands[playerId] || [];
      if (idx < 0 || idx >= cards.length) return;
      const card = cards[idx];
      cards.splice(idx, 1);
      const name = (typeof getPlayerName === 'function') ? getPlayerName(playerId) : ('玩家' + playerId);
      const verb = reason === 'use' ? '使用' : '弃置';
      const msg = '【系统】' + name + '从启悟区' + verb + '了「' + (card.name || '未知牌') + '」';
      broadcastSystemMsg(msg);
      renderOracleCards(playerId);
      syncOracleToPeer(playerId);
    }

    /** 从启悟区移动到普通手牌区 */
    function moveToHand(playerId, idx) {
      const cards = oracleHands[playerId] || [];
      if (idx < 0 || idx >= cards.length) return;
      const card = cards.splice(idx, 1)[0];
      const name = (typeof getPlayerName === 'function') ? getPlayerName(playerId) : ('玩家' + playerId);
      const msg = '【系统】' + name + '将' + _oracleCardLabel(card.name) + '从启悟区移入手牌区';
      broadcastSystemMsg(msg);
      // 推入手牌
      if (typeof pushCardToHand === 'function') {
        pushCardToHand(playerId, card);
      } else {
        const state = (typeof getPlayerCardState === 'function') ? getPlayerCardState(playerId) : null;
        if (state) state.hand.push(card);
      }
      renderOracleCards(playerId);
      if (typeof refreshOpenListDialog === 'function') refreshOpenListDialog(playerId);
      if (typeof syncDeckStateForce === 'function') syncDeckStateForce(playerId);
      syncOracleToPeer(playerId);
    }

    /** 从启悟区移动到牌库（随机位置） */
    function moveToDeck(playerId, idx) {
      const cards = oracleHands[playerId] || [];
      if (idx < 0 || idx >= cards.length) return;
      const card = cards.splice(idx, 1)[0];
      const state = (typeof getPlayerCardState === 'function') ? getPlayerCardState(playerId) : null;
      const name = (typeof getPlayerName === 'function') ? getPlayerName(playerId) : ('玩家' + playerId);
      const msg = '【系统】' + name + '将' + _oracleCardLabel(card.name) + '从启悟区置入了牌库';
      broadcastSystemMsg(msg);
      if (state) {
        const pos = Math.floor(Math.random() * (state.deck.length + 1));
        state.deck.splice(pos, 0, card);
      }
      renderOracleCards(playerId);
      if (typeof updateDeckButtons === 'function') updateDeckButtons(playerId);
      if (typeof syncDeckStateForce === 'function') syncDeckStateForce(playerId);
      syncOracleToPeer(playerId);
    }

    /** 从普通手牌区移动到启悟区 */
    function moveToOracle(playerId, cardId) {
      const state = (typeof getPlayerCardState === 'function') ? getPlayerCardState(playerId) : null;
      if (!state) return;
      const hand = state.hand;
      const idx = hand.findIndex(c => c && c.id === cardId);
      if (idx === -1) return;
      const card = hand.splice(idx, 1)[0];
      if (!oracleHands[playerId]) oracleHands[playerId] = [];
      oracleHands[playerId].push(card);
      const name = (typeof getPlayerName === 'function') ? getPlayerName(playerId) : ('玩家' + playerId);
      const msg = '【系统】' + name + '将' + _oracleCardLabel(card.name) + '从手牌区移入启悟区';
      broadcastSystemMsg(msg);
      if (typeof refreshOpenListDialog === 'function') refreshOpenListDialog(playerId);
      if (typeof syncDeckStateForce === 'function') syncDeckStateForce(playerId);
      if (!oracleOverlay.hidden && _activeOraclePlayer === playerId) {
        renderOracleCards(playerId);
      }
      syncOracleToPeer(playerId);
    }

    /** 添加卡牌到启悟区（通过牌名） */
    function addCardToOracle(playerId, cardName) {
      const name = cardName.trim();
      if (!name) return;
      if (!oracleHands[playerId]) oracleHands[playerId] = [];
      const card = (typeof createCard === 'function') ? createCard(name) : { id: Date.now(), name: name, curses: [] };
      oracleHands[playerId].push(card);
      const pname = (typeof getPlayerName === 'function') ? getPlayerName(playerId) : ('玩家' + playerId);
      const msg = '【系统】' + pname + '将' + _oracleCardLabel(name) + '置入了启悟区';
      broadcastSystemMsg(msg);
      renderOracleCards(playerId);
      syncOracleToPeer(playerId);
    }

    /** 从牌库抽牌到启悟区 */
    function drawToOracle(playerId) {
      const state = (typeof getPlayerCardState === 'function') ? getPlayerCardState(playerId) : null;
      if (!state || !state.deck.length) {
        const pname = (typeof getPlayerName === 'function') ? getPlayerName(playerId) : ('玩家' + playerId);
        broadcastSystemMsg('【系统】' + pname + '的牌库已空，无法抽牌到启悟区');
        return;
      }
      const card = state.deck.shift();
      if (!oracleHands[playerId]) oracleHands[playerId] = [];
      oracleHands[playerId].push(card);
      const pname = (typeof getPlayerName === 'function') ? getPlayerName(playerId) : ('玩家' + playerId);
      const msg = '【系统】' + pname + '从牌库抽' + _oracleCardLabel(card.name) + '到了启悟区';
      broadcastSystemMsg(msg);
      if (typeof updateDeckButtons === 'function') updateDeckButtons(playerId);
      renderOracleCards(playerId);
      syncOracleToPeer(playerId);
      if (typeof syncDeckStateForce === 'function') syncDeckStateForce(playerId);
    }

    /** 同步启悟状态到对手 */
    function syncOracleToPeer(playerId) {
      if (!peerConn || !peerConn.open || typeof sendToPeer !== 'function') return;
      sendToPeer({
        type: 'oracle-update',
        playerId: playerId,
        active: oracleActive[playerId] || false,
        cards: (oracleHands[playerId] || []).map(c => ({
          id: c.id, name: c.name, curses: c.curses || [],
        })),
      });
    }

    /** 应用远程启悟状态 */
    function applyRemoteOracle(data) {
      if (!data.playerId) return;
      oracleActive[data.playerId] = data.active || false;
      const btn = getOracleZoneBtn(data.playerId);
      if (btn) {
        if (data.active) {
          btn.hidden = false;
          btn.classList.add('oracle-appear');
          setTimeout(() => btn.classList.remove('oracle-appear'), 600);
        } else {
          btn.hidden = true;
          // 远程关闭启悟时，若弹窗开着则一并关闭
          if (!oracleOverlay.hidden && _activeOraclePlayer === data.playerId) {
            closeOracleDialog();
          }
        }
      }
      if (Array.isArray(data.cards)) {
        oracleHands[data.playerId] = data.cards.map(c => ({
          id: c.id, name: c.name, curses: c.curses || [],
        }));
      }
      // 如果是当前打开的弹窗，刷新显示
      if (!oracleOverlay.hidden && _activeOraclePlayer === data.playerId) {
        renderOracleCards(data.playerId);
      }
    }

    // ---- 拖拽支持 ----
    oracleDialogHeader.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return; // 不拦截关闭按钮
      _draggingOracle = true;
      _dragOX = e.clientX;
      _dragOY = e.clientY;
      _dialogOX = oracleDialog.offsetLeft;
      _dialogOY = oracleDialog.offsetTop;
      oracleDialog.style.transition = 'none';
      oracleDialogHeader.style.cursor = 'grabbing';
    });
    window.addEventListener('pointermove', (e) => {
      if (!_draggingOracle) return;
      const dx = e.clientX - _dragOX;
      const dy = e.clientY - _dragOY;
      let nx = _dialogOX + dx;
      let ny = _dialogOY + dy;
      const maxX = window.innerWidth - oracleDialog.offsetWidth - 10;
      const maxY = window.innerHeight - oracleDialog.offsetHeight - 10;
      nx = Math.max(10, Math.min(nx, maxX));
      ny = Math.max(10, Math.min(ny, maxY));
      oracleDialog.style.left = nx + 'px';
      oracleDialog.style.top = ny + 'px';
    });
    window.addEventListener('pointerup', () => {
      if (!_draggingOracle) return;
      _draggingOracle = false;
      oracleDialog.style.transition = '';
      oracleDialogHeader.style.cursor = '';
    });
    oracleDialogHeader.addEventListener('selectstart', (e) => e.preventDefault());

    // ---- 事件绑定 ----
    oracleCloseBtn.addEventListener('click', closeOracleDialog);

    oracleBtnAdd.addEventListener('click', () => {
      if (_activeOraclePlayer && oracleCardInput.value.trim()) {
        addCardToOracle(_activeOraclePlayer, oracleCardInput.value.trim());
        oracleCardInput.value = '';
      }
    });

    oracleCardInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && _activeOraclePlayer && oracleCardInput.value.trim()) {
        addCardToOracle(_activeOraclePlayer, oracleCardInput.value.trim());
        oracleCardInput.value = '';
      }
    });

    oracleBtnDraw.addEventListener('click', () => {
      if (_activeOraclePlayer) drawToOracle(_activeOraclePlayer);
    });

    // 快速置入三诫按钮
    document.querySelectorAll('.oracle-quick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const cardName = btn.dataset.oracleCard;
        if (_activeOraclePlayer && cardName) {
          addCardToOracle(_activeOraclePlayer, cardName);
        }
      });
    });

    // 两个启悟区按钮（玩家1和玩家2）
    document.querySelectorAll('.btn-deck--oracle[data-action="oracle-zone"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const playerId = btn.id.replace('btn-oracle-zone-', '');
        openOracleDialog(playerId);
      });
    });
