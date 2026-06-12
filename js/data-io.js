// ================================================================
//  js/data-io.js — 数据导入导出
//  上传自定义卡牌（可视化表单）、保存/加载对局状态 (JSON)
//  依赖: CardDB, network.js, game-core.js, card-deck.js
// ================================================================

    // 上传卡牌可视化窗口
    const uploadCardOverlay = document.getElementById('upload-card-overlay');
    const uploadCardFields = document.getElementById('upload-card-fields');
    let uploadCardSelectedType = 'shikigami';

    // 类型按钮切换
    document.querySelectorAll('.upload-type-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.upload-type-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        uploadCardSelectedType = this.dataset.type;
        _renderUploadFields();
      });
    });

    const UPLOAD_FIELD_DEFS = {
      shikigami: [
        { id: 'name', label: '名称', placeholder: '例：桃花妖', required: true },
        { id: 'faction', label: '派系', placeholder: '红莲 / 紫岩 / 青岚 / 苍叶 / 无相' },
        { id: 'attack', label: '攻击', placeholder: '例：2', type: 'number' },
        { id: 'hp', label: '生命', placeholder: '例：5', type: 'number' },
        { id: 'ability', label: '基础能力', placeholder: '例：进场时抽1张牌', textarea: true },
        { id: 'derivative', label: '衍生物', type: 'checkbox' },
      ],
      summon: [
        { id: 'name', label: '名称', placeholder: '例：召唤·桃花', required: true },
        { id: 'owner', label: '所属式神', placeholder: '例：桃花妖' },
        { id: 'faction', label: '派系', placeholder: '红莲 / 紫岩 / 青岚 / 苍叶 / 无相' },
        { id: 'attack', label: '攻击', placeholder: '例：1', type: 'number' },
        { id: 'hp', label: '生命', placeholder: '例：2', type: 'number' },
        { id: 'ability', label: '能力', placeholder: '例：回合结束时消失', textarea: true },
        { id: 'derivative', label: '衍生物（通常为是）', type: 'checkbox', default: true },
      ],
      spell: [
        { id: 'name', label: '名称', placeholder: '例：凤火', required: true },
        { id: 'owner', label: '所属式神', placeholder: '例：凤凰火' },
        { id: 'level', label: '等级', placeholder: '1-3', type: 'number', default: '1' },
        { id: 'awakened', label: '觉醒牌', type: 'checkbox' },
        { id: 'atkBonus', label: '增加攻击', placeholder: '非觉醒牌填0', type: 'number', default: '0' },
        { id: 'hpBonus', label: '增加生命', placeholder: '非觉醒牌填0', type: 'number', default: '0' },
        { id: 'effect', label: '卡牌效果', placeholder: '例：对一名敌方式神造成3点伤害', textarea: true },
        { id: 'derivative', label: '衍生物', type: 'checkbox' },
      ],
      battle: [
        { id: 'name', label: '名称', placeholder: '例：尘刀', required: true },
        { id: 'owner', label: '所属式神', placeholder: '例：兵俑' },
        { id: 'level', label: '等级', placeholder: '1-3', type: 'number', default: '1' },
        { id: 'awakened', label: '觉醒牌', type: 'checkbox' },
        { id: 'atkBonus', label: '增加攻击', placeholder: '例：2', type: 'number', default: '0' },
        { id: 'atkPenalty', label: '减少攻击', placeholder: '例：0', type: 'number', default: '0' },
        { id: 'shieldBonus', label: '增加护盾', placeholder: '例：0', type: 'number', default: '0' },
        { id: 'shieldPenalty', label: '减少护盾', placeholder: '例：0', type: 'number', default: '0' },
        { id: 'effect', label: '卡牌效果', placeholder: '例：本次战斗中+2攻击', textarea: true },
        { id: 'derivative', label: '衍生物', type: 'checkbox' },
      ],
      form: [
        { id: 'name', label: '名称', placeholder: '例：桃花仙', required: true },
        { id: 'owner', label: '所属式神', placeholder: '例：桃花妖' },
        { id: 'level', label: '等级', placeholder: '1-3', type: 'number', default: '1' },
        { id: 'awakened', label: '觉醒牌', type: 'checkbox' },
        { id: 'attack', label: '攻击', placeholder: '例：3', type: 'number' },
        { id: 'hp', label: '生命', placeholder: '例：6', type: 'number' },
        { id: 'effect', label: '卡牌效果', placeholder: '例：进场时恢复生命', textarea: true },
        { id: 'derivative', label: '衍生物', type: 'checkbox' },
      ],
      realm: [
        { id: 'name', label: '名称', placeholder: '例：蓬莱之境', required: true },
        { id: 'owner', label: '所属式神', placeholder: '例：（选填）' },
        { id: 'level', label: '等级', placeholder: '1-3', type: 'number', default: '1' },
        { id: 'awakened', label: '觉醒牌', type: 'checkbox' },
        { id: 'durability', label: '耐久', placeholder: '例：4', type: 'number' },
        { id: 'effect', label: '卡牌效果', placeholder: '例：回合开始时抽1张牌', textarea: true },
        { id: 'derivative', label: '衍生物', type: 'checkbox' },
      ],
      curse: [
        { id: 'name', label: '名称', placeholder: '例：友切', required: true },
        { id: 'owner', label: '所属式神', placeholder: '例：鬼切' },
        { id: 'effect', label: '灵咒效果', placeholder: '例：结附式神获得+1攻击', textarea: true },
      ],
    };

    function _renderUploadFields() {
      const type = uploadCardSelectedType;
      const defs = UPLOAD_FIELD_DEFS[type] || [];
      uploadCardFields.innerHTML = defs.map(f => {
        if (f.type === 'checkbox') {
          const checked = f.default ? ' checked' : '';
          return `<label class="upload-field upload-field--check"><input type="checkbox" id="uf-${f.id}"${checked}> ${f.label}</label>`;
        }
        if (f.textarea) {
          return `<label class="upload-field">${f.label}：<textarea id="uf-${f.id}" placeholder="${f.placeholder || ''}" rows="2"></textarea></label>`;
        }
        const inputType = f.type === 'number' ? 'number' : 'text';
        const val = f.default ? ` value="${f.default}"` : '';
        return `<label class="upload-field">${f.label}：<input type="${inputType}" id="uf-${f.id}" placeholder="${f.placeholder || ''}"${val}></label>`;
      }).join('');
    }

    document.getElementById('upload-card-cancel').addEventListener('click', () => {
      uploadCardOverlay.hidden = true;
    });

    document.getElementById('upload-card-confirm').addEventListener('click', () => {
      const type = uploadCardSelectedType;
      const defs = UPLOAD_FIELD_DEFS[type] || [];
      const card = { type, _custom: true };
      let hasRequired = true;
      defs.forEach(f => {
        const el = document.getElementById('uf-' + f.id);
        if (!el) return;
        let val;
        if (f.type === 'checkbox') {
          val = el.checked;
        } else {
          val = el.value.trim();
        }
        if (f.required && !val) { hasRequired = false; }
        if (f.type === 'number' && val !== '') {
          val = parseInt(val, 10) || 0;
        }
        card[f.id] = val;
      });
      if (!hasRequired || !card.name) {
        alert('请至少填写卡牌名称');
        return;
      }
      if (CardDB.addCustom(card)) {
        broadcastSystemMsg('【系统】成功上传卡牌：「' + card.name + '」');
        uploadCardOverlay.hidden = true;
      } else {
        alert('上传失败，请检查数据');
      }
    });

    function _handleUploadCards() {
      _renderUploadFields();
      uploadCardOverlay.hidden = false;
    }

    function _handleSaveGame() {
      const p1deck = getPlayerCardState('1').deck;
      const p1hand = getPlayerCardState('1').hand;
      const p2deck = getPlayerCardState('2').deck;
      const p2hand = getPlayerCardState('2').hand;
      // 序列化揭示卡牌ID（Set → Array，确保 JSON 可序列化）
      const p1revealed = playerRevealedCards['1'] ? [...playerRevealedCards['1']] : [];
      const p2revealed = playerRevealedCards['2'] ? [...playerRevealedCards['2']] : [];
      // 序列化商店牌库存（仅保存有库存变化的牌）
      const p1shopStocks = {};
      const p2shopStocks = {};
      if (playerCardStocks['1']) {
        for (const [name, s] of Object.entries(playerCardStocks['1'])) {
          const defStock = typeof getCardDefaultStock === 'function' ? getCardDefaultStock(name) : null;
          if (defStock === null || s !== defStock) p1shopStocks[name] = s;
        }
      }
      if (playerCardStocks['2']) {
        for (const [name, s] of Object.entries(playerCardStocks['2'])) {
          const defStock = typeof getCardDefaultStock === 'function' ? getCardDefaultStock(name) : null;
          if (defStock === null || s !== defStock) p2shopStocks[name] = s;
        }
      }
      const p1shop = playerShops['1'] || {};
      const p2shop = playerShops['2'] || {};
      const state = {
        version: APP_VERSION,
        time: new Date().toISOString(),
        player1: {
          name: getPlayerInfo('1').name,
          hp: getPlayerInfo('1').hp,
          avatar: _getAvatarSrc('1'),
          fire: playerFire['1'],
          effects: getEffectsState('1'),
          deck: p1deck,
          hand: p1hand,
          revealedCards: p1revealed,
          bounty: playerBounty['1'] || 0,
          bountyActive: (typeof bountyActive !== 'undefined') ? (bountyActive['1'] || false) : false,
          nightfallActive: (typeof nightfallActive !== 'undefined') ? (nightfallActive['1'] || false) : false,
          nightfallValue: (() => { const el = document.querySelector('.player-zone[data-player="1"] .nightfall-input'); return el ? el.value : '0'; })(),
          shopLevel: p1shop.level || 1,
          shopUpgradeProgress: p1shop.upgradeProgress || 0,
          shopSlotCount: p1shop.slotCount,
          shopStocks: p1shopStocks,
          oracleActive: oracleActive['1'] || false,
          oracleHands: (oracleHands['1'] || []).map(c => ({ id: c.id, name: c.name, curses: c.curses || [] })),
          slots: [],
        },
        player2: {
          name: getPlayerInfo('2').name,
          hp: getPlayerInfo('2').hp,
          avatar: _getAvatarSrc('2'),
          fire: playerFire['2'],
          effects: getEffectsState('2'),
          deck: p2deck,
          hand: p2hand,
          revealedCards: p2revealed,
          bounty: playerBounty['2'] || 0,
          bountyActive: (typeof bountyActive !== 'undefined') ? (bountyActive['2'] || false) : false,
          nightfallActive: (typeof nightfallActive !== 'undefined') ? (nightfallActive['2'] || false) : false,
          nightfallValue: (() => { const el = document.querySelector('.player-zone[data-player="2"] .nightfall-input'); return el ? el.value : '0'; })(),
          shopLevel: p2shop.level || 1,
          shopUpgradeProgress: p2shop.upgradeProgress || 0,
          shopSlotCount: p2shop.slotCount,
          shopStocks: p2shopStocks,
          oracleActive: oracleActive['2'] || false,
          oracleHands: (oracleHands['2'] || []).map(c => ({ id: c.id, name: c.name, curses: c.curses || [] })),
          slots: [],
        },
      };
      ['1', '2'].forEach(pid => {
        const zone = document.querySelector(`.player-zone[data-player="${pid}"]`);
        zone.querySelectorAll('.card-slot').forEach(slot => {
          state['player' + pid].slots.push(getSlotState(slot));
        });
      });
      const json = JSON.stringify(state, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '百闻牌对局_' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      URL.revokeObjectURL(url);
      broadcastSystemMsg('【系统】对局已保存到文件');
    }

    function _handleLoadGame() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.addEventListener('change', () => {
        const file = input.files[0];
        if (!file) return;
        const importerName = localPlayerId ? getPlayerName(localPlayerId) : '玩家';
        broadcastSystemMsg('【系统】' + importerName + '正在导入对局，请稍候…');
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const state = JSON.parse(e.target.result);
            _restoreGameState(state);
            broadcastSystemMsg('【系统】对局已导入');
          } catch (err) {
            broadcastSystemMsg('【系统】导入失败：文件格式错误');
          }
        };
        reader.readAsText(file);
      });
      input.click();
    }

    function _getAvatarSrc(playerId) {
      const avatar = document.querySelector(`.player-avatar[data-avatar-player="${playerId}"]`);
      if (!avatar) return '';
      const img = avatar.querySelector('img');
      return img ? img.src : '';
    }

    /** 兼容旧存档：确保每张卡牌有 id、curses、name 字段，过滤 null，保留食物牌数据 */
    function _normalizeSavedCard(c) {
      if (!c || typeof c !== 'object') return { id: ++cardIdCounter, name: '', curses: [] };
      return {
        id: (typeof c.id === 'number' && c.id > 0) ? c.id : ++cardIdCounter,
        name: typeof c.name === 'string' ? c.name : '',
        curses: Array.isArray(c.curses) ? c.curses.filter(cur => cur && typeof cur === 'object') : [],
        _food: c._food || false,
        _foodType: c._foodType || '',
        _foodLevel: typeof c._foodLevel === 'number' ? c._foodLevel : 0,
        _foodEffects: Array.isArray(c._foodEffects) ? c._foodEffects : [],
        _foodIngredients: c._foodIngredients || '',
        _stack: typeof c._stack === 'number' ? c._stack : 0,
        _maxStack: typeof c._maxStack === 'number' ? c._maxStack : 0,
      };
    }

    function _restoreGameState(state) {
      slotSyncSuppress = true;
      try {
        ['1', '2'].forEach(pid => {
          const p = state['player' + pid];
          if (!p) return;
          const zone = document.querySelector(`.player-zone[data-player="${pid}"]`);
          if (!zone) return;
          if (p.name) { const ni = zone.querySelector('.player-name-input'); if (ni) ni.value = p.name; }
          if (p.hp) { const hi = zone.querySelector('.player-hp-input'); if (hi) hi.value = p.hp; }
          if (p.avatar) setAvatarImage(pid, p.avatar);
          if (p.fire !== undefined) { playerFire[pid] = p.fire; applyRemoteFireState(pid, p.fire); }
          if (p.effects) applyRemoteEffectsState(pid, p.effects);
          if (p.bounty !== undefined) { playerBounty[pid] = p.bounty; }
          // 恢复赏金图标显示
          if (p.bountyActive) {
            try {
              if (typeof applyRemoteBountyToggle === 'function') {
                applyRemoteBountyToggle(pid, true);
                if (typeof applyRemoteBounty === 'function') applyRemoteBounty(pid, playerBounty[pid] || 0);
              }
            } catch(e) { console.warn('[Load] 赏金恢复失败:', e); }
          }
          // 恢复入夜图标显示及数值
          if (p.nightfallActive) {
            try {
              if (typeof applyRemoteNightfall === 'function') {
                applyRemoteNightfall(pid, true, p.nightfallValue || '0');
              } else if (typeof _toggleNightfall === 'function') {
                _toggleNightfall(pid, true);
                const nInp = document.querySelector(`.player-zone[data-player="${pid}"] .nightfall-input`);
                if (nInp && p.nightfallValue !== undefined) nInp.value = p.nightfallValue;
              }
            } catch(e) { console.warn('[Load] 入夜恢复失败:', e); }
          }
          // 恢复商店状态
          if (p.shopLevel !== undefined) {
            const shop = (typeof getShop === 'function') ? getShop(pid) : null;
            if (shop) {
              shop.level = p.shopLevel || 1;
              shop.upgradeProgress = p.shopUpgradeProgress || 0;
              shop.upgradeNeeded = shop.level === 1 ? 5 : 10;
              shop.refreshCost = 1;
              if (p.shopSlotCount != null) shop.slotCount = p.shopSlotCount;
            }
          }
          if (p.shopStocks && typeof setCardStock === 'function') {
            for (const [name, s] of Object.entries(p.shopStocks)) {
              setCardStock(pid, name, s);
            }
          }
          // 恢复启悟状态
          if (p.oracleActive !== undefined && typeof oracleActive !== 'undefined') {
            oracleActive[pid] = p.oracleActive;
            const btn = document.getElementById('btn-oracle-zone-' + pid);
            if (btn) {
              if (p.oracleActive) {
                btn.hidden = false;
              } else {
                btn.hidden = true;
              }
            }
          }
          if (Array.isArray(p.oracleHands) && typeof oracleHands !== 'undefined') {
            oracleHands[pid] = p.oracleHands.map(c => ({
              id: c.id, name: c.name, curses: c.curses || [],
            }));
          }
          if (Array.isArray(p.deck)) {
            const normalized = p.deck.map(c => _normalizeSavedCard(c)).filter(c => c && typeof c === 'object');
            getPlayerCardState(pid).deck = normalized;
          }
          if (Array.isArray(p.hand)) {
            const normalized = p.hand.map(c => _normalizeSavedCard(c)).filter(c => c && typeof c === 'object');
            getPlayerCardState(pid).hand = normalized;
          }
          // 恢复揭示卡牌ID（Array → Set）
          if (Array.isArray(p.revealedCards)) {
            playerRevealedCards[pid] = new Set(p.revealedCards.filter(id => typeof id === 'number'));
          }
          if (p.slots) {
            p.slots.forEach((s, i) => {
              const slot = getSlotByIndex(pid, i);
              if (slot) setSlotState(slot, s);
            });
          }
          updateDeckButtons(pid);
        });
        // 更新卡牌ID计数器，避免后续生成卡牌ID冲突
        if (typeof updateCardIdCounter === 'function') updateCardIdCounter();
      } catch(e) {
        console.error('[LoadGame] 恢复对局状态出错:', e);
        broadcastSystemMsg('【系统】导入对局时发生错误，部分数据可能未恢复');
      }
      slotSyncSuppress = false;

      // 联机状态下，将恢复的全部状态同步给对方和观众
      if (peerConn && peerConn.open) {
        // 先同步揭示卡牌数据（静默存储）
        ['1', '2'].forEach(pid => {
          if (playerRevealedCards[pid] && playerRevealedCards[pid].size) {
            sendToPeer({ type: 'revealed-cards', playerId: pid, cardIds: [...playerRevealedCards[pid]] });
          }
        });
        ['1', '2'].forEach(pid => {
          // 玩家信息
          const info = getPlayerInfo(pid);
          sendToPeer({ type: 'player-info', playerId: pid, name: info.name, hp: info.hp });
          // 效果面板
          sendToPeer({ type: 'effects-update', playerId: pid, effects: getEffectsState(pid) });
          // 牌库/手牌（完整数据）
          const cards = getPlayerCardState(pid);
          sendToPeer({ type: 'deck-update', playerId: pid, deckCount: cards.deck.length, handCount: cards.hand.length, deckData: cards.deck, handData: cards.hand });
          // 鬼火
          sendToPeer({ type: 'fire-update', playerId: pid, count: playerFire[pid] });
          // 赏金
          if ((playerBounty[pid] || 0) > 0) {
            sendToPeer({ type: 'bounty-update', playerId: pid, amount: playerBounty[pid] });
          }
          // 赏金图标
          const bzone = document.querySelector(`.player-zone[data-player="${pid}"]`);
          if (bzone && bzone.querySelector('.bounty-indicator')) {
            sendToPeer({ type: 'bounty-toggle', playerId: pid, active: true });
          }
          // 入夜图标
          if (typeof nightfallActive !== 'undefined' && nightfallActive[pid]) {
            const nval = bzone ? (bzone.querySelector('.nightfall-input')?.value || '0') : '0';
            sendToPeer({ type: 'nightfall-toggle', playerId: pid, active: true, value: nval });
          }
          // 启悟状态
          if (typeof oracleActive !== 'undefined' && oracleActive[pid]) {
            const oh = (typeof oracleHands !== 'undefined' && oracleHands[pid]) ? oracleHands[pid] : [];
            sendToPeer({ type: 'oracle-update', playerId: pid, active: true, cards: oh.map(c => ({ id: c.id, name: c.name, curses: c.curses || [] })) });
          }
          // 商店状态
          if (typeof syncShopToPeer === 'function') {
            syncShopToPeer(pid);
          }
          // 卡牌槽（逐个同步）
          document.querySelectorAll(`.player-zone[data-player="${pid}"] .card-slot`).forEach(slot => {
            syncSlotToPeer(slot);
          });
          // 头像
          const avatarSrc = _getAvatarSrc(pid);
          if (avatarSrc) sendToPeer({ type: 'avatar-update', playerId: pid, imageSrc: avatarSrc });
        });
      }
    }

    cardTextInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && cardTextInput.rows <= 2) {
        e.preventDefault();
        confirmCardTextDialog();
      }
      if (e.key === 'Escape') closeCardTextDialog();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !cardListOverlay.hidden) closeCardListDialog();
      if (e.key === 'Escape' && cursePanelTarget) closeCursePanel();
    });

    // ---- 初始化卡牌数据库与浮窗 ----
    CardDB.init().then(() => {
      console.log('[CardDB] 初始化完成，共 ' + CardDB.size() + ' 张卡牌');
      CardTooltip.init();
    }).catch(() => {
      // 网络失败也初始化 tooltip（用空库 + 本地自定义卡牌）
      CardTooltip.init();
    });

    updateAllDeckButtons();
