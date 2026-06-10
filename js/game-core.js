// ================================================================
//  js/game-core.js — 游戏核心逻辑 (JS-2)
//  卡牌槽初始化与渲染、拖拽交换、倒计时/能量/气绝/灵咒系统、战场自适应布局
//  依赖: network.js (syncSlotToPeer等), CardDB
// ================================================================

    //  JS-2：游戏核心逻辑 —— 卡牌槽初始化与渲染
    // ================================================================
    const imageInput = document.getElementById('image-input');
    const avatarInput = document.getElementById('avatar-input');
    let activeSlotForImage = null;
    let activeAvatarPlayer = null;
    let draggedSlot = null;
    let pointerOrigin = null;
    const DRAG_THRESHOLD = 8;

    const CARD_INNER_HTML = `
      <div class="card-art"><span class="placeholder-hint">点击添加图片</span></div>
      <label class="card-badge card-badge--level" title="等级">
        <input type="text" class="card-level" placeholder="级" aria-label="等级">
      </label>
      <label class="card-badge card-badge--attack" title="攻击">
        <input type="text" class="card-attack" placeholder="攻" aria-label="攻击">
      </label>
      <label class="card-badge card-badge--hp" title="生命">
        <input type="text" class="card-hp" placeholder="命" aria-label="生命">
      </label>
      <label class="card-badge card-badge--name" title="卡牌名称">
        <input type="text" class="card-name" placeholder="名称" maxlength="12" aria-label="卡牌名称">
      </label>
    `;

    document.querySelectorAll('.card-slot').forEach(slot => {
      slot.innerHTML = CARD_INNER_HTML;
    });

    /* 为每个卡牌槽分配索引（0-4），方便联机同步定位 */
    document.querySelectorAll('.player-zone').forEach(zone => {
      const playerId = zone.dataset.player;
      zone.querySelectorAll('.card-slot').forEach((slot, index) => {
        slot.dataset.slotIndex = index;
        slot.dataset.slotPlayer = playerId;
      });
    });

    // ---- JS-1.4：状态同步 —— 卡牌槽 ----
    function getSlotByIndex(playerId, slotIndex) {
      const zone = document.querySelector(`.player-zone[data-player="${playerId}"]`);
      if (!zone) return null;
      return zone.querySelectorAll('.card-slot')[slotIndex] || null;
    }

    /* 卡牌槽同步：防重入标志 */
    let slotSyncSuppress = false;

    /* 同步单个卡牌槽状态到对方 */
    function syncSlotToPeer(slot) {
      if (slotSyncSuppress || !peerConn || !peerConn.open) return;
      const playerId = slot.dataset.slotPlayer;
      const slotIndex = parseInt(slot.dataset.slotIndex, 10);
      const state = getSlotState(slot);
      sendToPeer({
        type: 'slot-update',
        playerId,
        slotIndex,
        state,
      });
    }

    /* 应用远程卡牌槽更新 */
    function applyRemoteSlotUpdate(playerId, slotIndex, state) {
      slotSyncSuppress = true;
      const slot = getSlotByIndex(playerId, slotIndex);
      if (slot) {
        setSlotState(slot, state);
      }
      slotSyncSuppress = false;
    }

    // ---- JS-1.5：状态同步 —— 牌库/手牌 ----

    /* 发送牌库/手牌计数给对方 */
    function syncDeckState(playerId) {
      if (!peerConn || !peerConn.open) return;
      if (!isMyZone(playerId)) return;
      const { deck, hand } = getPlayerCardState(playerId);
      try {
        sendToPeer({
          type: 'deck-update',
          playerId,
          deckCount: deck.length,
          handCount: hand.length,
          deckData: deck.filter(c => c && typeof c === 'object'),
          handData: hand.filter(c => c && typeof c === 'object'),
        });
      } catch(e) {
        console.error('[SyncDeck] 发送失败:', e);
      }
    }

    /* 接收对方的牌库/手牌计数，更新本地按钮 */
    function applyRemoteDeckState(playerId, deckCount, handCount, deckData, handData) {
      try {
        const state = getPlayerCardState(playerId);
        if (Array.isArray(deckData) && deckData.length) {
          state.deck = deckData.filter(c => c && typeof c === 'object');
        }
        if (Array.isArray(handData) && handData.length) {
          state.hand = handData.filter(c => c && typeof c === 'object');
        }
        updateDeckButtons(playerId);
      } catch(e) {
        console.error('[RemoteDeck] 更新失败:', e);
      }
    }

    // ---- JS-1.6：状态同步 —— 效果面板 ----

    function getEffectsState(playerId) {
      const zone = document.querySelector(`.player-zone[data-player="${playerId}"]`);
      if (!zone) return [];
      const items = zone.querySelectorAll('.effect-item');
      return Array.from(items).map(item => ({
        name: item.querySelector('.effect-name').value,
        value: item.querySelector('.effect-value').value,
      }));
    }

    function syncEffectsState(playerId) {
      if (!peerConn || !peerConn.open) return;
      sendToPeer({
        type: 'effects-update',
        playerId,
        effects: getEffectsState(playerId),
      });
    }

    function applyRemoteEffectsState(playerId, effects) {
      const zone = document.querySelector(`.player-zone[data-player="${playerId}"]`);
      if (!zone) return;
      const panel = zone.querySelector('.effects-panel');
      panel.innerHTML = '';
      effects.forEach(eff => {
        const item = createEffectItem();
        item.querySelector('.effect-name').value = eff.name;
        item.querySelector('.effect-value').value = eff.value;
        panel.appendChild(item);
      });
    }

    // ---- JS-1.7：状态同步 —— 玩家名称/生命值 ----

    function getPlayerInfo(playerId) {
      const zone = document.querySelector(`.player-zone[data-player="${playerId}"]`);
      if (!zone) return { name: '', hp: '' };
      const nameInput = zone.querySelector('.player-name-input');
      const hpInput = zone.querySelector('.player-hp-input');
      return {
        name: nameInput ? nameInput.value : '',
        hp: hpInput ? hpInput.value : '',
      };
    }

    function syncPlayerInfo(playerId) {
      if (!peerConn || !peerConn.open) return;
      const info = getPlayerInfo(playerId);
      sendToPeer({
        type: 'player-info',
        playerId,
        name: info.name,
        hp: info.hp,
      });
    }

    function applyRemotePlayerInfo(playerId, name, hp) {
      const zone = document.querySelector(`.player-zone[data-player="${playerId}"]`);
      if (!zone) return;
      const nameInput = zone.querySelector('.player-name-input');
      const hpInput = zone.querySelector('.player-hp-input');
      if (nameInput) nameInput.value = name;
      if (hpInput) hpInput.value = hp;
    }

    function createEffectItem() {
      const item = document.createElement('div');
      item.className = 'effect-item';
      item.innerHTML = `
        <input type="text" class="effect-name" placeholder="名称/描述">
        <input type="text" class="effect-value" placeholder="数值">
        <button type="button" class="btn-remove-effect">移除</button>
      `;
      item.querySelector('.btn-remove-effect').addEventListener('click', () => {
        const playerId = item.closest('.player-zone').dataset.player;
        const name = item.querySelector('.effect-name').value || '未命名';
        item.remove();
        syncEffectsState(playerId);
        broadcastSystemMsg(`【系统】${getPlayerName(playerId)}移除了幻境/效果「${name}」`);
      });
      return item;
    }

    document.querySelectorAll('.btn-add-effect').forEach(btn => {
      btn.addEventListener('click', () => {
        const zone = btn.closest('.player-zone');
        const panel = zone.querySelector('.effects-panel');
        panel.appendChild(createEffectItem());
        syncEffectsState(zone.dataset.player);
        broadcastSystemMsg(`【系统】${getPlayerName(zone.dataset.player)}添加了幻境/效果`);
      });
    });

    function getCardArt(slot) {
      return slot.querySelector('.card-art');
    }

    function setSlotImage(slot, src) {
      const art = getCardArt(slot);
      let img = art.querySelector('img');
      if (!img) {
        img = document.createElement('img');
        img.alt = '卡牌';
        art.appendChild(img);
      }
      img.src = src;
      slot.classList.add('has-image');
    }

    function clearSlotImage(slot) {
      const img = getCardArt(slot).querySelector('img');
      if (img) img.remove();
      slot.classList.remove('has-image');
    }

    function getSlotImageSrc(slot) {
      const img = getCardArt(slot).querySelector('img');
      return img ? img.src : null;
    }

    function getSlotState(slot) {
      const cdBadge = slot.querySelector('.card-badge--countdown');
      const enBadge = slot.querySelector('.card-badge--energy');
      return {
        imageSrc: getSlotImageSrc(slot),
        level: slot.querySelector('.card-level').value,
        attack: slot.querySelector('.card-attack').value,
        hp: slot.querySelector('.card-hp').value,
        name: slot.querySelector('.card-name').value,
        countdown: cdBadge ? (cdBadge.querySelector('input').value || '') : '',
        energy: enBadge ? (enBadge.querySelector('input').value || '') : '',
        ko: slot.querySelector('.ko-overlay') ? (slot.querySelector('.ko-circle input').value || '1') : '',
        curses: getSlotCurses(slot),
      };
    }

    function setSlotState(slot, state) {
      if (state.imageSrc) setSlotImage(slot, state.imageSrc);
      else clearSlotImage(slot);
      slot.querySelector('.card-level').value = state.level;
      slot.querySelector('.card-attack').value = state.attack;
      slot.querySelector('.card-hp').value = state.hp;
      slot.querySelector('.card-name').value = state.name;
      // 倒计时 / 能量 徽章
      updateSlotCountdownBadge(slot, state.countdown || '');
      updateSlotEnergyBadge(slot, state.energy || '');
      updateKoOverlay(slot, state.ko || '');
      // 灵咒
      setSlotCurses(slot, state.curses || []);
      // 所有字段就绪后再同步（若被 suppress 则跳过）
      if (!slotSyncSuppress) syncSlotToPeer(slot);
    }

    imageInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      const slot = activeSlotForImage;
      imageInput.value = '';
      activeSlotForImage = null;
      if (!file || !slot) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        setSlotImage(slot, ev.target.result);
        syncSlotToPeer(slot);
      };
      reader.readAsDataURL(file);
    });

    /* 头像系统 */
    avatarInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      const playerId = activeAvatarPlayer;
      avatarInput.value = '';
      activeAvatarPlayer = null;
      if (!file || !playerId) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        setAvatarImage(playerId, ev.target.result);
        if (peerConn && peerConn.open) {
          sendToPeer({ type: 'avatar-update', playerId, imageSrc: ev.target.result });
        }
      };
      reader.readAsDataURL(file);
    });

    function setAvatarImage(playerId, src) {
      const avatar = document.querySelector(`.player-avatar[data-avatar-player="${playerId}"]`);
      if (!avatar) return;
      let img = avatar.querySelector('img');
      if (!img) {
        img = document.createElement('img');
        img.alt = '头像';
        avatar.appendChild(img);
      }
      img.src = src;
      avatar.classList.add('has-avatar');
    }

    document.querySelectorAll('.player-avatar').forEach(av => {
      av.addEventListener('click', () => {
        if (!isMyElement(av)) return;
        activeAvatarPlayer = av.dataset.avatarPlayer;
        avatarInput.click();
      });
    });

    /* 交换卡牌槽内容 */
    function swapSlotContents(a, b) {
      const stateA = getSlotState(a);
      const stateB = getSlotState(b);
      slotSyncSuppress = true;
      setSlotState(a, stateB);
      setSlotState(b, stateA);
      slotSyncSuppress = false;
      syncSlotToPeer(a);
      syncSlotToPeer(b);
    }

    // ---- 倒计时 / 能量 / 气绝 徽章渲染 ----
    const ICON_CD = '<span class="badge-icon">⏳</span>';
    const ICON_EN = '<span class="badge-icon">🏮</span>';

    function createCountdownBadge(value) {
      const div = document.createElement('div');
      div.className = 'card-badge card-badge--countdown';
      div.innerHTML = ICON_CD + '<input type="text" value="' + (value || '1') + '" placeholder="" aria-label="倒计时">';
      div.querySelector('input').addEventListener('change', () => {
        const slot = div.closest('.card-slot');
        if (slot) syncSlotToPeer(slot);
      });
      return div;
    }

    function createEnergyBadge(value) {
      const div = document.createElement('div');
      div.className = 'card-badge card-badge--energy';
      div.innerHTML = ICON_EN + '<input type="text" value="' + (value || '1') + '" placeholder="" aria-label="能量">';
      div.querySelector('input').addEventListener('change', () => {
        const slot = div.closest('.card-slot');
        if (slot) syncSlotToPeer(slot);
      });
      return div;
    }

    function updateSlotCountdownBadge(slot, value) {
      const existing = slot.querySelector('.card-badge--countdown');
      if (value) {
        if (existing) {
          existing.querySelector('input').value = value;
        } else {
          slot.appendChild(createCountdownBadge(value));
        }
      } else {
        if (existing) existing.remove();
      }
    }

    function updateSlotEnergyBadge(slot, value) {
      const existing = slot.querySelector('.card-badge--energy');
      if (value) {
        if (existing) {
          existing.querySelector('input').value = value;
        } else {
          slot.appendChild(createEnergyBadge(value));
        }
      } else {
        if (existing) existing.remove();
      }
    }

    function removeCountdownBadge(slot) {
      const b = slot.querySelector('.card-badge--countdown');
      if (b) b.remove();
    }

    function removeEnergyBadge(slot) {
      const b = slot.querySelector('.card-badge--energy');
      if (b) b.remove();
    }

    // ---- 灵咒系统 JS ----
    function getSlotCurses(slot) {
      const container = slot.querySelector('.card-curses');
      if (!container) return [];
      const badges = container.querySelectorAll('.curse-badge');
      return Array.from(badges).map(b => {
        const nameEl = b.querySelector('.curse-badge__name');
        const layersEl = b.querySelector('.curse-badge__layers');
        const name = nameEl ? nameEl.textContent : '';
        const layers = layersEl ? (parseInt(layersEl.textContent.replace('×',''), 10) || 1) : 1;
        return { name, layers };
      });
    }

    function setSlotCurses(slot, curses) {
      const existing = slot.querySelector('.card-curses');
      if (existing) existing.remove();
      if (!curses || !curses.length) return;
      const container = document.createElement('div');
      container.className = 'card-curses';
      curses.forEach(c => {
        const badge = document.createElement('span');
        badge.className = 'curse-badge';
        badge.innerHTML = '<span class="curse-badge__name">' + escapeHTML(c.name) + '</span><span class="curse-badge__layers">×' + c.layers + '</span>';
        badge.addEventListener('click', (e) => { e.stopPropagation(); openCursePanel(_curseTargetForSlot(slot)); });
        container.appendChild(badge);
      });
      slot.appendChild(container);
    }

    // ---- 灵咒管理面板（通用：卡牌槽 / 手牌 / 牌库） ----
    let cursePanelTarget = null;

    /** 为战场卡牌槽创建灵咒操作对象 */
    function _curseTargetForSlot(slot) {
      return {
        _slot: slot,
        getCurses: () => getSlotCurses(slot),
        setCurses: (curses) => { setSlotCurses(slot, curses); syncSlotToPeer(slot); },
        getLabel: () => slot.querySelector('.card-name').value || '未命名',
        getPlayerId: () => slot.dataset.slotPlayer,
        isReadOnly: () => !isMyElement(slot),
      };
    }

    /** 为手牌/牌库卡牌创建灵咒操作对象 */
    function _curseTargetForCard(playerId, card, location) {
      return {
        getCurses: () => card.curses || [],
        setCurses: (curses) => {
          card.curses = curses;
          refreshOpenListDialog(playerId);
          syncDeckState(playerId);
        },
        getLabel: () => card.name,
        getLocation: () => location || '',
        getPlayerId: () => playerId,
        isReadOnly: () => !isMyZone(playerId),
      };
    }

    function openCursePanel(target) {
      if (target.isReadOnly()) return;
      cursePanelTarget = target;
      let overlay = document.getElementById('curse-panel-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'curse-panel-overlay';
        overlay.hidden = true;
        overlay.innerHTML = '<div class="curse-panel">'
          + '<h3>⛓️ 灵咒管理</h3>'
          + '<div class="curse-panel__add">'
          + '<input class="inp-name" placeholder="灵咒名称" maxlength="12">'
          + '<input class="inp-layers" type="number" value="1" min="1" max="99">'
          + '<button class="btn-add-curse">添加</button>'
          + '</div>'
          + '<div class="curse-panel__list"></div>'
          + '<button class="curse-panel__close">关闭</button>'
          + '</div>';
        document.body.appendChild(overlay);
        overlay.querySelector('.btn-add-curse').addEventListener('click', () => _cursePanelAdd());
        overlay.querySelector('.inp-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') _cursePanelAdd(); });
        overlay.querySelector('.curse-panel__close').addEventListener('click', closeCursePanel);
      }
      overlay.hidden = false;
      _refreshCursePanel();
      overlay.querySelector('.inp-name').focus();
    }

    function _cursePanelAdd() {
      if (!cursePanelTarget) return;
      const overlay = document.getElementById('curse-panel-overlay');
      const name = overlay.querySelector('.inp-name').value.trim();
      if (!name) return;
      const layers = Math.max(1, parseInt(overlay.querySelector('.inp-layers').value, 10) || 1);
      const curses = cursePanelTarget.getCurses();
      const existing = curses.find(c => c.name === name);
      if (existing) { existing.layers += layers; }
      else { curses.push({ name, layers }); }
      cursePanelTarget.setCurses(curses);
      const targetLoc = cursePanelTarget.getLocation ? cursePanelTarget.getLocation() : '';
      const targetLabel = cursePanelTarget.getLabel();
      if (targetLoc.includes('牌库')) {
        broadcastSystemMsg('【系统】' + getPlayerName(cursePanelTarget.getPlayerId()) + '为' + targetLoc + '一张牌结附了灵咒「' + name + '」×' + layers);
      } else {
        broadcastSystemMsg('【系统】' + getPlayerName(cursePanelTarget.getPlayerId()) + '为' + targetLoc + '「' + targetLabel + '」结附了灵咒「' + name + '」×' + layers);
      }
      overlay.querySelector('.inp-name').value = '';
      overlay.querySelector('.inp-layers').value = '1';
      _refreshCursePanel();
      overlay.querySelector('.inp-name').focus();
    }

    function closeCursePanel() {
      const overlay = document.getElementById('curse-panel-overlay');
      if (overlay) overlay.hidden = true;
      cursePanelTarget = null;
    }

    function _refreshCursePanel() {
      const overlay = document.getElementById('curse-panel-overlay');
      if (!overlay || !cursePanelTarget) return;
      overlay.querySelector('.curse-panel h3').textContent = '⛓️ 灵咒管理 — ' + cursePanelTarget.getLabel();
      const list = overlay.querySelector('.curse-panel__list');
      list.innerHTML = '';
      cursePanelTarget.getCurses().forEach((c, i) => {
        const item = document.createElement('div');
        item.className = 'curse-panel__item';
        item.innerHTML = '<span class="curse-panel__item-name">' + escapeHTML(c.name) + '</span>'
          + '<div class="curse-panel__item-actions">'
          + '<button class="btn-layer-minus">−</button>'
          + '<span class="curse-panel__item-layers">' + c.layers + '</span>'
          + '<button class="btn-layer-plus">+</button>'
          + '<button class="btn-curse-remove" style="margin-left:6px;background:#6a2a2a;border-color:#a04040;">✕</button>'
          + '</div>';
        item.querySelector('.btn-layer-minus').addEventListener('click', () => _changeCurseLayers(i, -1));
        item.querySelector('.btn-layer-plus').addEventListener('click', () => _changeCurseLayers(i, 1));
        item.querySelector('.btn-curse-remove').addEventListener('click', () => _removeCurse(i));
        list.appendChild(item);
      });
    }

    function _changeCurseLayers(index, delta) {
      if (!cursePanelTarget) return;
      const curses = cursePanelTarget.getCurses();
      curses[index].layers = Math.max(0, curses[index].layers + delta);
      if (curses[index].layers <= 0) curses.splice(index, 1);
      cursePanelTarget.setCurses(curses);
      _refreshCursePanel();
    }

    function _removeCurse(index) {
      if (!cursePanelTarget) return;
      const curses = cursePanelTarget.getCurses();
      const removed = curses[index];
      curses.splice(index, 1);
      cursePanelTarget.setCurses(curses);
      if (removed) {
        broadcastSystemMsg('【系统】' + getPlayerName(cursePanelTarget.getPlayerId()) + '移除了「' + cursePanelTarget.getLabel() + '」的灵咒「' + removed.name + '」');
      }
      _refreshCursePanel();
    }

    function openImagePicker(slot) {
      activeSlotForImage = slot;
      imageInput.click();
    }

    function isInteractiveTarget(el) {
      return el.closest('.card-badge, input, label, button');
    }

    function getSlotUnderPoint(x, y) {
      const el = document.elementFromPoint(x, y);
      return el ? el.closest('.card-slot') : null;
    }

    function clearDragHighlights() {
      document.querySelectorAll('.card-slot').forEach(s => s.classList.remove('drag-over', 'dragging'));
    }

    // ---- JS-2.1：卡牌拖拽系统 ----
    function initCardSlots() {
      document.querySelectorAll('.card-slot').forEach(slot => {
        slot.addEventListener('pointerdown', (e) => {
          if (e.button !== 0 || isInteractiveTarget(e.target) || e.target.closest('.curse-badge')) return;
          pointerOrigin = { x: e.clientX, y: e.clientY, slot };
          slot.setPointerCapture(e.pointerId);
        });

        slot.addEventListener('pointermove', (e) => {
          if (!pointerOrigin || pointerOrigin.slot !== slot) return;

          if (!draggedSlot) {
            const dx = e.clientX - pointerOrigin.x;
            const dy = e.clientY - pointerOrigin.y;
            if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
            draggedSlot = slot;
            slot.classList.add('dragging');
          }

          document.querySelectorAll('.card-slot').forEach(s => s.classList.remove('drag-over'));
          const hover = getSlotUnderPoint(e.clientX, e.clientY);
          if (hover && hover !== draggedSlot) {
            hover.classList.add('drag-over');
          }
        });

        slot.addEventListener('pointerup', (e) => {
          if (!pointerOrigin || pointerOrigin.slot !== slot) return;

          try {
            slot.releasePointerCapture(e.pointerId);
          } catch (_) { /* already released */ }

          if (draggedSlot) {
            const target = getSlotUnderPoint(e.clientX, e.clientY);
            if (target && target !== draggedSlot) {
              swapSlotContents(draggedSlot, target);
            }
            draggedSlot = null;
            clearDragHighlights();
          } else if (!isInteractiveTarget(e.target) && !isTargeting && !slot.querySelector('.ko-overlay') && !e.target.closest('.curse-badge')) {
            openImagePicker(slot);
          }

          pointerOrigin = null;
        });

        slot.addEventListener('pointercancel', () => {
          pointerOrigin = null;
          draggedSlot = null;
          clearDragHighlights();
        });
      });
    }

    initCardSlots();

    /* 鬼火加减按钮（0~5个火焰图标） */
    document.querySelectorAll('.player-fire-area').forEach(area => {
      const playerId = area.closest('.player-zone').dataset.player;
      const iconsRow = area.querySelector('.fire-icons-row');
      const minusBtn = area.querySelector('.fire-minus');
      const plusBtn = area.querySelector('.fire-plus');

      function render() {
        const count = playerFire[playerId];
        iconsRow.innerHTML = Array.from({ length: 5 }, (_, i) =>
          `<span class="fire-icon" style="visibility:${i >= count ? 'hidden' : 'visible'}">🔥</span>`
        ).join('');
      }

      minusBtn.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (playerFire[playerId] > 0) { playerFire[playerId]--; render(); syncFireState(playerId); }
      });

      plusBtn.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (playerFire[playerId] < 5) { playerFire[playerId]++; render(); syncFireState(playerId); }
      });

      render();
    });

    /* 卡牌徽章输入框变化 → 同步到对方（change 事件在失焦时触发） */
    document.addEventListener('change', (e) => {
      // 卡牌徽章
      if (e.target.closest('.card-badge')) {
        const slot = e.target.closest('.card-slot');
        if (slot) syncSlotToPeer(slot);
        return;
      }
      // 效果面板输入
      if (e.target.closest('.effect-item')) {
        const zone = e.target.closest('.player-zone');
        if (zone) syncEffectsState(zone.dataset.player);
        return;
      }
      // 玩家名称 / 生命值
      if (e.target.classList.contains('player-name-input') || e.target.classList.contains('player-hp-input')) {
        const zone = e.target.closest('.player-zone');
        if (zone) syncPlayerInfo(zone.dataset.player);
      }
    });

    // ---- JS-2.2：战场动态布局（自适应窗口大小）----
    const BATTLE_WIDTH_RATIO = 158 / 148;
    const BATTLE_HEIGHT_RATIO = 221 / 207;
    const PREP_ASPECT = 207 / 148;
    const MIN_FIELD_GAP = 18;
    const MIN_CARD_W = 84;
    const MAX_CARD_W = 158;
    const layoutRoot = document.documentElement;
    const gameBoard = document.querySelector('.game-board');
    const chatSidebar = document.querySelector('.chat-sidebar');

    function measureZoneCenterWidth() {
      const zoneCenter = document.querySelector('.zone-center');
      if (!zoneCenter) return 0;
      const style = getComputedStyle(zoneCenter);
      return zoneCenter.clientWidth
        - parseFloat(style.paddingLeft)
        - parseFloat(style.paddingRight);
    }

    function updateBattlefieldLayout() {
      const effectsEl = document.querySelector('.zone-effects');
      const available = measureZoneCenterWidth();
      if (!available || !effectsEl || !chatSidebar) return;

      const effectsWidth = effectsEl.getBoundingClientRect().width;
      const chatWidth = chatSidebar.getBoundingClientRect().width;
      const boardWidth = gameBoard.getBoundingClientRect().width;
      const battlefieldWidth = boardWidth - effectsWidth - chatWidth
        - parseFloat(getComputedStyle(gameBoard).gap || '0')
        - parseFloat(getComputedStyle(gameBoard).paddingLeft)
        - parseFloat(getComputedStyle(gameBoard).paddingRight);

      layoutRoot.style.setProperty('--effects-panel-width', `${Math.round(effectsWidth)}px`);
      layoutRoot.style.setProperty('--chat-panel-width', `${Math.round(chatWidth)}px`);
      layoutRoot.style.setProperty('--battlefield-width', `${Math.round(Math.max(available, battlefieldWidth))}px`);

      // 5 张牌 + 6 段等距空白：边距、准备区间隙、战斗区两侧、准备区内部
      const denom = 4 + BATTLE_WIDTH_RATIO;
      let cardW = Math.min(MAX_CARD_W, (available - MIN_FIELD_GAP * 6) / denom);
      cardW = Math.max(MIN_CARD_W, cardW);
      let gap = (available - denom * cardW) / 6;

      if (gap < MIN_FIELD_GAP && cardW > MIN_CARD_W) {
        cardW = Math.max(MIN_CARD_W, (available - MIN_FIELD_GAP * 6) / denom);
        gap = (available - denom * cardW) / 6;
      }

      gap = Math.max(0, gap);

      const battleW = cardW * BATTLE_WIDTH_RATIO;
      const cardH = cardW * PREP_ASPECT;
      const battleH = cardH * BATTLE_HEIGHT_RATIO;

      layoutRoot.style.setProperty('--field-gap', `${gap.toFixed(1)}px`);
      layoutRoot.style.setProperty('--card-w-prep', `${cardW.toFixed(1)}px`);
      layoutRoot.style.setProperty('--card-h-prep', `${cardH.toFixed(1)}px`);
      layoutRoot.style.setProperty('--card-w-battle', `${battleW.toFixed(1)}px`);
      layoutRoot.style.setProperty('--card-h-battle', `${battleH.toFixed(1)}px`);
    }

    let layoutFrame = null;
    function scheduleBattlefieldLayout() {
      if (layoutFrame) cancelAnimationFrame(layoutFrame);
      layoutFrame = requestAnimationFrame(() => {
        layoutFrame = null;
        updateBattlefieldLayout();
      });
    }

    window.addEventListener('resize', scheduleBattlefieldLayout);
    if (typeof ResizeObserver !== 'undefined') {
      const layoutObserver = new ResizeObserver(scheduleBattlefieldLayout);
      layoutObserver.observe(gameBoard);
      layoutObserver.observe(chatSidebar);
      document.querySelectorAll('.zone-effects, .zone-center').forEach(el => layoutObserver.observe(el));
    }
    scheduleBattlefieldLayout();

    // ================================================================
