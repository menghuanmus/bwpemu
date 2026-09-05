// ================================================================
//  js/data-io.js — 数据导入导出
//  保存/加载对局状态 (JSON)（在用）
//
//  【已废弃 2026-09-05】「上传自定义卡牌（可视化表单）」部分不再使用，
//  后续开发绕过、不修改、不联动。新的 DIY 卡牌管理请使用「玩家自定义卡库」。
//
//  依赖: CardDB, network.js, game-core.js, card-deck.js
// ================================================================

    // ═══「上传卡牌可视化窗口」已整体删除（2026-09-05），DIY 管理走大厅「DIY」面板 ═══

    function _handleSaveGame() {
      const p1deck = getPlayerCardState('1').deck;
      const p1hand = getPlayerCardState('1').hand;
      const p1grave = getPlayerCardState('1').grave || [];
      const p2deck = getPlayerCardState('2').deck;
      const p2hand = getPlayerCardState('2').hand;
      const p2grave = getPlayerCardState('2').grave || [];
      // 序列化揭示卡牌ID（Set → Array，确保 JSON 可序列化）
      const p1revealed = playerRevealedCards['1'] ? [...playerRevealedCards['1']] : [];
      const p2revealed = playerRevealedCards['2'] ? [...playerRevealedCards['2']] : [];
      const p1fateRevealed = (typeof playerFateRevealedCards !== 'undefined' && playerFateRevealedCards['1']) ? [...playerFateRevealedCards['1']] : [];
      const p2fateRevealed = (typeof playerFateRevealedCards !== 'undefined' && playerFateRevealedCards['2']) ? [...playerFateRevealedCards['2']] : [];
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
          grave: p1grave,
          revealedCards: p1revealed,
          fateRevealedCards: p1fateRevealed,
          bounty: playerBounty['1'] || 0,
          bountyActive: (typeof bountyActive !== 'undefined') ? (bountyActive['1'] || false) : false,
          nightfallActive: (typeof nightfallActive !== 'undefined') ? (nightfallActive['1'] || false) : false,
          nightfallValue: (() => { const el = document.querySelector('.player-zone[data-player="1"] .nightfall-input'); return el ? el.value : '0'; })(),
          shopLevel: p1shop.level || 1,
          shopUpgradeProgress: p1shop.upgradeProgress || 0,
          shopSlotCount: p1shop.slotCount,
          shopStocks: p1shopStocks,
          oracleActive: oracleActive['1'] || false,
          oracleHands: (oracleHands['1'] || []).map(c => ({ id: c.id, name: c.name, curses: c.curses || [], _stack: c._stack, _maxStack: c._maxStack })),
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
          grave: p2grave,
          revealedCards: p2revealed,
          fateRevealedCards: p2fateRevealed,
          bounty: playerBounty['2'] || 0,
          bountyActive: (typeof bountyActive !== 'undefined') ? (bountyActive['2'] || false) : false,
          nightfallActive: (typeof nightfallActive !== 'undefined') ? (nightfallActive['2'] || false) : false,
          nightfallValue: (() => { const el = document.querySelector('.player-zone[data-player="2"] .nightfall-input'); return el ? el.value : '0'; })(),
          shopLevel: p2shop.level || 1,
          shopUpgradeProgress: p2shop.upgradeProgress || 0,
          shopSlotCount: p2shop.slotCount,
          shopStocks: p2shopStocks,
          oracleActive: oracleActive['2'] || false,
          oracleHands: (oracleHands['2'] || []).map(c => ({ id: c.id, name: c.name, curses: c.curses || [], _stack: c._stack, _maxStack: c._maxStack })),
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
            // 存档库存为准，不再自动补全默认库存
            if (typeof stockInitialized !== 'undefined') stockInitialized[pid] = true;
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
              _stack: c._stack, _maxStack: c._maxStack,
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
          if (Array.isArray(p.grave)) {
            const normalized = p.grave.map(c => _normalizeSavedCard(c)).filter(c => c && typeof c === 'object');
            getPlayerCardState(pid).grave = normalized;
          }
          // 恢复揭示卡牌ID（Array → Set）
          if (Array.isArray(p.revealedCards)) {
            playerRevealedCards[pid] = new Set(p.revealedCards.filter(id => typeof id === 'number'));
          }
          // 恢复命运抉择揭示
          if (Array.isArray(p.fateRevealedCards) && typeof playerFateRevealedCards !== 'undefined') {
            playerFateRevealedCards[pid] = new Set(p.fateRevealedCards.filter(id => typeof id === 'number'));
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

      // 联机状态下，将完整状态通过 import-state 发送给服务端
      // （服务端接受任意玩家导入的完整对局状态，不进行所有权校验）
      if (typeof isConnected === 'function' && isConnected()) {
        var fullState = {
          slots: { '1': [], '2': [] },
          playerCards: { '1': { deck: [], hand: [], grave: [] }, '2': { deck: [], hand: [], grave: [] } },
          playerInfo: { '1': {}, '2': {} },
          playerFire: { '1': 0, '2': 0 },
          effects: { '1': [], '2': [] },
          bounty: { '1': { active: false, amount: 0 }, '2': { active: false, amount: 0 } },
          nightfall: { '1': { active: false, value: '0' }, '2': { active: false, value: '0' } },
          oracle: { '1': { active: false, cards: [] }, '2': { active: false, cards: [] } },
          shop: { '1': null, '2': null },
          avatars: { '1': '', '2': '' },
          revealedCards: { '1': [], '2': [] },
        };
        ['1', '2'].forEach(function(pid) {
          // 卡牌槽
          document.querySelectorAll('.player-zone[data-player="' + pid + '"] .card-slot').forEach(function(slot, i) {
            fullState.slots[pid][i] = getSlotState(slot);
          });
          // 牌库手牌
          var cards = getPlayerCardState(pid);
          fullState.playerCards[pid] = { deck: cards.deck, hand: cards.hand, grave: cards.grave || [] };
          // 玩家信息
          fullState.playerInfo[pid] = getPlayerInfo(pid);
          // 鬼火
          fullState.playerFire[pid] = playerFire[pid] || 0;
          // 效果
          fullState.effects[pid] = getEffectsState(pid);
          // 头像
          fullState.avatars[pid] = _getAvatarSrc(pid);
          // 赏金
          if (typeof playerBounty !== 'undefined') {
            var bountyEl = document.querySelector('.player-zone[data-player="' + pid + '"] .bounty-input');
            var amount = bountyEl ? parseInt(bountyEl.value, 10) || 0 : (playerBounty[pid] || 0);
            var active = (typeof bountyActive !== 'undefined') ? !!(bountyActive[pid]) : (amount > 0);
            fullState.bounty[pid] = { active: active, amount: amount };
          }
          // 入夜
          if (typeof nightfallActive !== 'undefined') {
            var nfEl = document.querySelector('.player-zone[data-player="' + pid + '"] .nightfall-input');
            fullState.nightfall[pid] = {
              active: !!(nightfallActive[pid]),
              value: nfEl ? nfEl.value : '0'
            };
          }
        });
        // 坟场入口开关状态一并导入
        fullState.graveTargets = (typeof window.getGraveTargetsState === 'function') ? window.getGraveTargetsState() : { '1': false, '2': false };
        // 通过 Socket.IO 直接发送（不经过 sendToPeer，避免所有权校验）
        if (window._gameSocket && window._gameSocket.connected) {
          window._gameSocket.emit('import-state', fullState);
        }
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
