// ================================================================
//  js/shop.js — 商店与赏金系统
//  赏金图标、商店弹窗、商品刷新、购买
//  依赖: network.js, game-core.js, card-deck.js
// ================================================================

    //  赏金与商店系统
    // ================================================================
    const playerBounty = { '1': 0, '2': 0 };

    // 每个玩家独立的商店状态
    const DEFAULT_SLOT_COUNT = 3;
    const playerShops = {
      '1': { level: 1, products: [], upgradeProgress: 0, upgradeNeeded: 5, refreshCost: 1, refreshPriority: [], slotCount: DEFAULT_SLOT_COUNT },
      '2': { level: 1, products: [], upgradeProgress: 0, upgradeNeeded: 5, refreshCost: 1, refreshPriority: [], slotCount: DEFAULT_SLOT_COUNT },
    };

    /** 添加卡牌到优先刷新队列（如醉仙引效果） */
    function addShopPriority(playerId, cardName) {
      const shop = getShop(playerId);
      if (!shop.refreshPriority) shop.refreshPriority = [];
      shop.refreshPriority.push(cardName);
    }

    /** 取出优先刷新队列的前 maxCount 张（默认全部），未取出的保留在队列中 */
    function popShopPriority(playerId, maxCount) {
      const shop = getShop(playerId);
      if (!shop.refreshPriority) shop.refreshPriority = [];
      const q = shop.refreshPriority;
      if (maxCount != null && q.length > maxCount) {
        const taken = q.splice(0, maxCount);
        return taken;
      }
      // 全部取出并清空
      const all = [...q];
      shop.refreshPriority = [];
      return all;
    }

    /** 获取当前打开商店的玩家ID */
    let _activeShopPlayer = null;

    function getShop(playerId) {
      if (!playerShops[playerId]) {
        playerShops[playerId] = { level: 1, products: [], upgradeProgress: 0, upgradeNeeded: 5, refreshCost: 1, refreshPriority: [], slotCount: DEFAULT_SLOT_COUNT };
      }
      if (playerShops[playerId].slotCount == null) playerShops[playerId].slotCount = DEFAULT_SLOT_COUNT;
      return playerShops[playerId];
    }

    /** 获取/设置商店栏位数（供效果系统调用） */
    function getShopSlotCount(playerId) {
      return getShop(playerId).slotCount;
    }
    function setShopSlotCount(playerId, count) {
      const shop = getShop(playerId);
      shop.slotCount = Math.max(1, count); // 最少1个栏位
    }

    /** 更新赏金输入框显示 */
    function updateBountyInput(playerId) {
      const zone = document.querySelector(`.player-zone[data-player="${playerId}"]`);
      if (!zone) return;
      const input = zone.querySelector('.bounty-input');
      if (input) input.value = playerBounty[playerId] || 0;
    }

    // 商店卡牌库存（每个玩家独立，key: playerId, value: { cardName: remainingStock }）
    const playerCardStocks = { '1': {}, '2': {} };

    // 默认库存只初始化一次：之后玩家删除/添加均以实际库存为准，不再自动补全
    const stockInitialized = { '1': false, '2': false };

    // 玩家自定义商品定义（名字 -> { level }），刷新时用来重建卡牌定义
    const customShopDefs = { '1': {}, '2': {} };

    function ensureStocksInitialized(playerId) {
      if (stockInitialized[playerId]) return;
      stockInitialized[playerId] = true;
      for (const c of getShopCardPool()) {
        if (!(c.name in (playerCardStocks[playerId] || {}))) {
          setCardStock(playerId, c.name, getCardDefaultStock(c.name));
        }
      }
    }

    function getCardStock(playerId, cardName, defaultStock) {
      if (!playerCardStocks[playerId]) playerCardStocks[playerId] = {};
      if (!(cardName in playerCardStocks[playerId])) {
        playerCardStocks[playerId][cardName] = defaultStock;
      }
      return playerCardStocks[playerId][cardName];
    }

    function setCardStock(playerId, cardName, stock) {
      if (!playerCardStocks[playerId]) playerCardStocks[playerId] = {};
      playerCardStocks[playerId][cardName] = stock;
    }

    /** 从CardDB获取所有商店牌（含_shop标记 + 额外指定的中立牌） */
    function getShopCardPool() {
      if (typeof CardDB === 'undefined' || !CardDB.isReady()) return [];
      const all = CardDB.getAll();
      const cards = [];
      // 额外可售但非商店标记的牌
      const extraNames = ['生命精华'];
      for (const card of all) {
        if (card._shop || card.owner === '商店' || extraNames.includes(card.name)) cards.push(card);
      }
      // 去重（防止同名被加入两次）
      const seen = new Set();
      return cards.filter(c => { if (seen.has(c.name)) return false; seen.add(c.name); return true; });
    }

    /** 每张商店牌的预设参数 */
    function getCardPrice(cardName) {
      const map = {
        '离火疾行符':2, '丹青律令':3, '胧月三闪':3, '潮时纸鸢':3,
        '九节灵笛':2, '生命精华':2, '瞬华凝露':4, '共鸣回廊':4,
        '渊鸣鼓':4, '六环破界杖':3, '预制好的佳肴':4,
        '疾斩赤扇':6, '醉仙引':5, '宿命罗盘':6, '射日长弓':7, '玄甲':6,
      };
      return map[cardName] || 2;
    }
    function getCardDefaultStock(cardName) {
      const inf = ['离火疾行符','胧月三闪','潮时纸鸢','六环破界杖','预制好的佳肴','醉仙引','射日长弓'];
      const one = ['疾斩赤扇','宿命罗盘','玄甲'];
      if (inf.includes(cardName)) return Infinity;
      if (one.includes(cardName)) return 1;
      return 2; // 丹青律令, 九节灵笛, 生命精华, 瞬华凝露, 共鸣回廊, 渊鸣鼓
    }

    // DOM引用
    const shopOverlay = document.getElementById('shop-dialog-overlay');
    const shopLevelEl = document.getElementById('shop-level');
    const shopBountyDisplay = document.getElementById('shop-bounty-display');
    const shopProductsEl = document.getElementById('shop-products');
    const shopExtrasEl = document.getElementById('shop-extras');
    const shopUpgradeHint = document.getElementById('shop-upgrade-hint');
    const shopRefreshBtn = document.getElementById('shop-refresh-btn');
    const shopCloseBtn = document.getElementById('shop-dialog-close');
    const shopFreeRefreshBtn = document.getElementById('shop-free-refresh-btn');
    const shopInvBtn = document.getElementById('shop-inv-btn');
    const shopAddBtn = document.getElementById('shop-add-btn');
    const shopInventoryEl = document.getElementById('shop-inventory');
    const shopPriorityInput = document.getElementById('shop-priority-input');
    const shopPriorityBtn = document.getElementById('shop-priority-btn');
    let _shopInvOpen = false;

    /** 刷新库存按钮文字（手机端无图标；供 constants.js 布局切换时调用） */
    function _refreshShopInvBtnText() {
      if (!shopInvBtn) return;
      const isMobile = (typeof window.matchMedia === 'function') && window.matchMedia('(max-width: 768px)').matches;
      if (_shopInvOpen) {
        shopInvBtn.textContent = isMobile ? '查看商品' : '🛒 查看商品';
      } else {
        shopInvBtn.textContent = isMobile ? '查看库存' : '📦 查看库存';
      }
    }

    /** 切换赏金图标 */
    function _toggleBounty(playerId, show) {
      const zone = document.querySelector(`.player-zone[data-player="${playerId}"]`);
      if (!zone) return;
      const fieldLayout = zone.querySelector('.field-layout');
      if (!fieldLayout) return;

      if (show) {
        if (fieldLayout.querySelector('.bounty-indicator')) return;
        const container = document.createElement('div');
        container.className = 'bounty-indicator';

        // 钱袋图标
        const icon = document.createElement('span');
        icon.className = 'bounty-icon';
        icon.textContent = '💰';
        icon.title = '点击打开商店';
        icon.addEventListener('click', () => openShop(playerId));
        // 单个金币
        const coin = document.createElement('span');
        coin.className = 'bounty-coin';
        coin.textContent = '🪙';
        icon.appendChild(coin);
        container.appendChild(icon);

        // 输入框（钱袋中心）
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'bounty-input';
        input.value = playerBounty[playerId] || 0;
        input.min = '0';
        input.max = '999';
        input.addEventListener('change', () => {
          const val = parseInt(input.value, 10) || 0;
          playerBounty[playerId] = val;
          syncBountyToPeer(playerId);
        });
        // 阻止点击冒泡到钱袋，避免误开商店
        input.addEventListener('click', (e) => { e.stopPropagation(); });
        icon.appendChild(input);

        const fieldRow = fieldLayout.querySelector('.field-row');
        if (fieldRow) {
          fieldLayout.insertBefore(container, fieldRow);
        } else {
          fieldLayout.appendChild(container);
        }

        // 钱币洒出特效（类似入夜）
        _playBountyEffect(container, 'in');
      } else {
        const existing = fieldLayout.querySelector('.bounty-indicator');
        if (existing) {
          _playBountyEffect(existing, 'out', () => existing.remove());
        }
      }
    }

    /** 赏金钱币洒出动画 */
    function _playBountyEffect(target, dir, onComplete) {
      if (typeof gsap === 'undefined') {
        if (onComplete) onComplete();
        return;
      }
      const origPos = target.style.position;
      target.style.position = 'relative';

      // 冲击环
      const ring = document.createElement('div');
      ring.className = 'nightfall-ring';
      ring.style.borderColor = 'rgba(255,200,60,0.7)';
      ring.style.boxShadow = '0 0 12px rgba(255,180,40,0.5)';
      target.appendChild(ring);

      // 金币粒子
      const coins = [];
      for (let i = 0; i < 14; i++) {
        const coin = document.createElement('div');
        coin.className = 'nightfall-star';
        coin.style.background = '#ffd700';
        coin.style.boxShadow = '0 0 8px #ffb800, 0 0 16px rgba(255,180,0,0.6)';
        coin.style.width = (5 + Math.random() * 6) + 'px';
        coin.style.height = coin.style.width;
        coin.style.borderRadius = '50%';
        coin.style.left = (25 + Math.random() * 50) + '%';
        coin.style.top = (15 + Math.random() * 70) + '%';
        target.appendChild(coin);
        coins.push(coin);
      }

      if (dir === 'in') {
        gsap.fromTo(ring, { opacity: 1, scale: 0.3 }, { opacity: 0, scale: 3.5, duration: 0.55, ease: 'power2.out', onComplete: () => ring.remove() });
        coins.forEach((c, i) => {
          gsap.fromTo(c, { opacity: 0, scale: 0, y: 0 }, {
            opacity: 1, scale: 1.8,
            x: (Math.random() - 0.5) * 60,
            y: -20 - Math.random() * 50,
            duration: 0.45 + Math.random() * 0.35,
            ease: 'power2.out',
            onComplete: () => gsap.to(c, { opacity: 0, scale: 0.2, y: '+=30', duration: 0.35, onComplete: () => c.remove() })
          });
        });
        gsap.fromTo(target, { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(1.5)' });
      } else {
        gsap.fromTo(ring, { opacity: 1, scale: 3.5 }, { opacity: 0, scale: 0.3, duration: 0.4, ease: 'power2.in', onComplete: () => ring.remove() });
        coins.forEach((c, i) => {
          gsap.fromTo(c, { opacity: 1, scale: 1.8, x: (Math.random() - 0.5) * 60, y: -20 - Math.random() * 50 }, {
            opacity: 0, scale: 0, y: 0,
            duration: 0.35 + Math.random() * 0.25,
            ease: 'power2.in',
            onComplete: () => c.remove()
          });
        });
        gsap.to(target, { scale: 0.4, opacity: 0, duration: 0.3, ease: 'power2.in', onComplete });
      }
    }

    function syncBountyToPeer(playerId) {
      if (!window._gameSocket || !window._gameSocket.connected || typeof sendToPeer !== 'function') return;
      sendToPeer({ type: 'bounty-update', playerId, amount: playerBounty[playerId] || 0 });
      updateBountyInput(playerId);
    }

    function applyRemoteBounty(playerId, amount) {
      playerBounty[playerId] = amount || 0;
      updateBountyInput(playerId);
    }

    function applyRemoteBountyToggle(playerId, active) {
      bountyActive[playerId] = active;
      _toggleBounty(playerId, active);
    }

    /** 初始化商店 */
    function initShop(playerId, level) {
      const shop = getShop(playerId);
      shop.level = level || 1;
      shop.refreshCost = 1; // 所有等级刷新均1赏金
      shop.upgradeProgress = 0;
      shop.upgradeNeeded = shop.level === 1 ? 5 : 10;
      shop.refreshPriority = [];
      ensureStocksInitialized(playerId);   // 默认库存只填这一次
      generateShopProducts(playerId);
    }

    /** 随机生成商品（优先队列必出，不重复，过滤已售罄，栏位数由 shop.slotCount 决定） */
    function generateShopProducts(playerId) {
      const shop = getShop(playerId);
      const maxSlots = shop.slotCount || DEFAULT_SLOT_COUNT;
      const pool = getShopCardPool();
      const maxLevel = shop.level;
      const stocks = playerCardStocks[playerId] || {};
      const available = pool.filter(c => {
        if (c.level > maxLevel) return false;
        const stock = c.name in stocks ? stocks[c.name] : 0;
        return stock > 0;
      });

      // 补充：玩家通过「＋ 添加商品」加入的自定义商品（不在标准池里），刷新时随机刷出。
      // 注意：必须排除标准池内的牌，否则会把高等级牌误加进低级商店（且效果为空）。
      const poolNames = new Set(pool.map(c => c.name));
      for (const sName of Object.keys(stocks)) {
        if (stocks[sName] > 0 && !poolNames.has(sName)) {
          const cur = shop.products.find(p => p.cardDef.name === sName);
          if (cur) {
            available.push(cur.cardDef);
          } else {
            // 重建卡牌定义：优先查卡牌库（带真实效果），等级用玩家添加时填的
            const db2 = (typeof CardDB !== 'undefined' && CardDB.isReady()) ? CardDB.lookup(sName) : null;
            const cdef = (customShopDefs[playerId] && customShopDefs[playerId][sName]) || {};
            const lvl = (cdef.level === 1 || cdef.level === 2 || cdef.level === 3) ? cdef.level : (db2 ? (db2.level || 1) : 1);
            if (db2) {
              available.push(Object.assign({}, db2, { level: lvl, _shop: true }));
            } else {
              available.push({ name: sName, type: 'spell', owner: '商店', level: lvl, effect: '' });
            }
          }
        }
      }

      const selected = [];
      const usedNames = new Set();
      // 先填充优先队列（最多取 maxSlots 张，多余的继续排队）
      const priority = popShopPriority(playerId, maxSlots);
      for (const pName of priority) {
        const card = available.find(c => c.name === pName);
        if (card && !usedNames.has(card.name)) {
          usedNames.add(card.name);
          const stock = getCardStock(playerId, card.name, getCardDefaultStock(card.name));
          selected.push({ cardDef: card, stock, price: getCardPrice(card.name), bought: false });
        }
      }
      // 剩余栏位随机填充
      const shuffled = [...available].sort(() => Math.random() - 0.5);
      for (const card of shuffled) {
        if (selected.length >= maxSlots) break;
        if (usedNames.has(card.name)) continue;
        usedNames.add(card.name);
        const stock = getCardStock(playerId, card.name, getCardDefaultStock(card.name));
        selected.push({ cardDef: card, stock, price: getCardPrice(card.name), bought: false });
      }
      shop.products = selected;
    }

    /** 打开商店（只能打开自己的，观众仅可查看） */
    function openShop(playerId) {
      // 非单人模式下，不能打开对方商店
      if (typeof localPlayerId !== 'undefined' && typeof isSoloMode !== 'undefined' && !isSoloMode && playerId !== localPlayerId) {
        if (typeof addSystemChatMessage === 'function') addSystemChatMessage('【系统】不能打开对方的商店');
        return;
      }
      _activeShopPlayer = playerId;
      _shopInvOpen = false;
      _refreshShopInvBtnText();
      const titleEl = document.getElementById('shop-dialog-title');
      if (titleEl) titleEl.textContent = '神秘商店';
      if (shopInventoryEl) shopInventoryEl.hidden = true;
      if (shopProductsEl) shopProductsEl.style.display = '';
      if (shopPriorityInput) shopPriorityInput.value = '';
      const shop = getShop(playerId);
      if (!shop.products.length && typeof CardDB !== 'undefined' && CardDB.isReady()) {
        initShop(playerId, 1);
      }
      renderShop(playerId);
      shopOverlay.hidden = false;
      // 观众模式：禁用购买、刷新按钮（保留库存查看）
      if (typeof isSpectator !== 'undefined' && isSpectator) {
        const btns = shopOverlay.querySelectorAll('button:not(.shop-dialog__close)');
        btns.forEach(b => {
          if (b !== shopInvBtn) { b.disabled = true; b.title = '观战模式下不可操作'; }
        });
      }
    }

    /** 渲染商店 */
    function renderShop(playerId) {
      const shop = getShop(playerId);
      shopLevelEl.textContent = 'Lv.' + shop.level;
      shopBountyDisplay.textContent = '💰 ' + (playerBounty[playerId] || 0);
      if (shop.level >= 3) {
        shopUpgradeHint.textContent = '已满级';
      } else {
        shopUpgradeHint.textContent = '升级进度 ' + shop.upgradeProgress + '/' + shop.upgradeNeeded + '💰';
      }
      shopRefreshBtn.textContent = '🔄 刷新 1💰';
      shopRefreshBtn.disabled = (playerBounty[playerId] || 0) < 1;

      // 渲染4个商品
      shopProductsEl.innerHTML = '';
      shop.products.forEach((prod, idx) => {
        const el = document.createElement('div');
        el.className = 'shop-product';

        // 库存
        const stockEl = document.createElement('span');
        stockEl.className = 'shop-product__stock';
        if (prod.stock === Infinity) {
          stockEl.textContent = '无限';
          stockEl.classList.add('shop-product__stock--unlimited');
        } else {
          stockEl.textContent = '剩' + prod.stock;
        }

        // 卡牌名
        const nameEl = document.createElement('div');
        nameEl.className = 'shop-product__name';
        nameEl.textContent = prod.cardDef.name;

        // 名字列：名字在上、库存在下
        const nameCol = document.createElement('div');
        nameCol.className = 'shop-product__name-col';
        nameCol.appendChild(nameEl);
        nameCol.appendChild(stockEl);
        el.appendChild(nameCol);

        // 效果：数值括号 + 文字效果（战斗牌拼攻防、形态牌拼攻击生命、幻境牌拼耐久）
        const effectEl = document.createElement('div');
        effectEl.className = 'shop-product__effect';
        const db2 = (typeof CardDB !== 'undefined' && CardDB.isReady()) ? CardDB.lookup(prod.cardDef.name) : null;
        let statPrefix = '';
        if (db2) {
          if (db2.type === 'battle') {
            const parts = [];
            if (db2.atkBonus) parts.push('攻击+' + db2.atkBonus);
            if (db2.atkPenalty) parts.push('攻击-' + db2.atkPenalty);
            if (db2.shieldBonus) parts.push('护盾+' + db2.shieldBonus);
            if (db2.shieldPenalty) parts.push('护盾-' + db2.shieldPenalty);
            if (parts.length) statPrefix = '（' + parts.join('，') + '）';
          } else if (db2.type === 'form') {
            statPrefix = '（攻击' + (db2.attack || 0) + '，生命' + (db2.hp || 0) + '）';
          } else if (db2.type === 'realm') {
            statPrefix = '（耐久' + (db2.durability || 0) + '）';
          }
        }
        let effectText = prod.cardDef.effect || '';
        if (!effectText && db2) effectText = db2.effect || db2.ability || '';
        if (statPrefix || effectText) {
          effectText = statPrefix + effectText;
        } else {
          effectText = '未录入数据';
        }
        if (prod.cardDef.name === '生命精华' && prod.cardDef.maxStack) {
          effectText += ' 当前层数：2/' + prod.cardDef.maxStack;
        }
        effectEl.textContent = effectText;
        el.appendChild(effectEl);

        // 购买按钮
        const buyBtn = document.createElement('button');
        buyBtn.className = 'shop-product__price-btn';
        if (prod.bought || (prod.stock !== Infinity && prod.stock <= 0)) {
          buyBtn.textContent = '已售罄';
          buyBtn.className += ' shop-product__price-btn--bought';
          buyBtn.disabled = true;
        } else {
          buyBtn.textContent = prod.price + '💰';
          buyBtn.addEventListener('click', () => buyProduct(playerId, idx));
        }
        el.appendChild(buyBtn);

        shopProductsEl.appendChild(el);
      });

      // 额外栏位（默认隐藏）
      shopExtrasEl.hidden = true;
      shopExtrasEl.innerHTML = '';

      // 库存视图打开时同步刷新
      if (_shopInvOpen) renderInventory(playerId);
    }

    /** 渲染库存视图（名字 + 剩余库存 + 删除按钮） */
    function renderInventory(playerId) {
      if (!shopInventoryEl) return;
      const stocks = playerCardStocks[playerId] || {};
      const entries = Object.entries(stocks);
      shopInventoryEl.innerHTML = '';
      if (entries.length === 0) {
        shopInventoryEl.innerHTML = '<div class="shop-inv-empty">库存为空，点「＋ 商品」添加</div>';
        return;
      }
      entries.forEach(function(entry) {
        const name = entry[0];
        const stock = entry[1];
        const row = document.createElement('div');
        row.className = 'shop-inv-row';
        const nameEl = document.createElement('span');
        nameEl.className = 'shop-inv-row__name';
        nameEl.textContent = name;
        const stockEl = document.createElement('span');
        stockEl.className = 'shop-inv-row__stock' + (stock === Infinity ? ' shop-inv-row__stock--unlimited' : '');
        stockEl.textContent = stock === Infinity ? '无限' : '剩' + stock;
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'shop-inv-row__del';
        delBtn.textContent = '🗑 删除';
        if (typeof isSpectator !== 'undefined' && isSpectator) delBtn.disabled = true;
        delBtn.addEventListener('click', function() { removeInventoryItem(playerId, name); });
        row.appendChild(nameEl); row.appendChild(stockEl); row.appendChild(delBtn);
        shopInventoryEl.appendChild(row);
      });
    }

    /** 删除库存商品：该商品全部数量删除（含无限库存），同时从货架移除同名商品 */
    function removeInventoryItem(playerId, cardName) {
      if (typeof isSpectator !== 'undefined' && isSpectator) return;
      const stocks = playerCardStocks[playerId] || {};
      if (!(cardName in stocks)) return;
      delete stocks[cardName];
      if (customShopDefs[playerId]) delete customShopDefs[playerId][cardName];
      const shop = getShop(playerId);
      shop.products = shop.products.filter(function(p) { return p.cardDef.name !== cardName; });
      syncShopToPeer(playerId);
      renderShop(playerId);
      renderInventory(playerId);
      broadcastSystemMsg('【系统】' + getPlayerName(playerId) + '从商店库存删除了「' + cardName + '」');
    }

    /** 添加库存商品：同名累加，不同名新加。只入库存，不直接上架，刷新时随机刷出 */
    function addInventoryItem(playerId, cardName, qty, level) {
      if (typeof isSpectator !== 'undefined' && isSpectator) return;
      if (!playerCardStocks[playerId]) playerCardStocks[playerId] = {};
      const stocks = playerCardStocks[playerId];
      const prev = stocks[cardName];
      if (prev != null) {
        stocks[cardName] = (prev === Infinity) ? Infinity : (prev + qty);
      } else {
        stocks[cardName] = qty;
      }
      const lvl = (level === 1 || level === 2 || level === 3) ? level : 1;
      if (!customShopDefs[playerId]) customShopDefs[playerId] = {};
      customShopDefs[playerId][cardName] = { level: lvl };
      syncShopToPeer(playerId);
      renderShop(playerId);
      renderInventory(playerId);
      broadcastSystemMsg('【系统】' + getPlayerName(playerId) + '向商店库存添加了「' + cardName + '」×' + qty + '（' + lvl + '级），刷新商店时可随机刷出');
    }

    /** 购买商品（观众不可操作） */
    function buyProduct(playerId, productIdx) {
      if (typeof isSpectator !== 'undefined' && isSpectator) return;
      const shop = getShop(playerId);
      const prod = shop.products[productIdx];
      if (!prod || prod.bought) return;
      const cost = prod.price;
      if ((playerBounty[playerId] || 0) < cost) return;
      if (prod.stock !== Infinity && prod.stock <= 0) return;

      playerBounty[playerId] -= cost;
      // 扣库存（有限库存才减）
      if (prod.stock !== Infinity) {
        prod.stock -= 1;
        setCardStock(playerId, prod.cardDef.name, prod.stock);
      }
      // 每个栏位只能买一次，刷新后重置
      prod.bought = true;

      const card = createCard(prod.cardDef.name);
      card._shop = true;
      if (typeof pushCardToHand === 'function') {
        // 生命精华在商店中初始为2层
        card._stack = prod.cardDef.name === '生命精华' ? 2 : 1;
        const db = (typeof CardDB !== 'undefined') ? CardDB.lookup(prod.cardDef.name) : null;
        if (db && db.maxStack) { card._maxStack = db.maxStack; }
        pushCardToHand(playerId, card);
      } else {
        const state = getPlayerCardState(playerId);
        state.hand.push(card);
      }
      updateDeckButtons(playerId);
      refreshOpenListDialog(playerId);
      syncDeckStateForce(playerId);

      // 升级进度（溢出累计到下一级）
      _addUpgradeProgress(playerId, cost);

      // 购买消息：自己看到详细，对手看到摘要
      const detailBuy = '【系统】' + getPlayerName(playerId) + '在商店购买了「' + prod.cardDef.name + '」';
      const summaryBuy = '【系统】' + getPlayerName(playerId) + '在商店购买了一张牌';
      const isMyOp = (typeof isMyZone === 'function') ? isMyZone(playerId) : true;
      if (isMyOp) {
        addSystemChatMessage(detailBuy);
        if (!isSoloMode && isConnected() && typeof sendToPeer === 'function') {
          sendToPeer({ type: 'sysmsg', text: summaryBuy });
        }
      } else {
        broadcastSystemMsg(summaryBuy);
      }
      syncBountyToPeer(playerId);
      syncShopToPeer(playerId);
      updateBountyInput(playerId);
      renderShop(playerId);
    }

    /** 增加升级进度，处理溢出升级 */
    function _addUpgradeProgress(playerId, amount) {
      const shop = getShop(playerId);
      if (shop.level >= 3) return;
      shop.upgradeProgress += amount;
      while (shop.upgradeProgress >= shop.upgradeNeeded && shop.level < 3) {
        shop.upgradeProgress -= shop.upgradeNeeded;
        shop.level += 1;
        shop.refreshCost = 1;
        shop.upgradeNeeded = 10; // Lv2→3 需要10
        broadcastSystemMsg('【系统】' + getPlayerName(playerId) + '的商店升级至 Lv.' + shop.level + '！');
      }
    }

    /** 刷新商店商品（观众不可操作） */
    function refreshShop(playerId) {
      if (typeof isSpectator !== 'undefined' && isSpectator) return;
      const cost = 1; // 所有等级刷新均1赏金
      if ((playerBounty[playerId] || 0) < cost) return;
      playerBounty[playerId] -= cost;
      generateShopProducts(playerId);
      // 刷新消耗也计入升级进度
      _addUpgradeProgress(playerId, cost);
      const detailRefresh = '【系统】' + getPlayerName(playerId) + '刷新了商店';
      const isMyOp2 = (typeof isMyZone === 'function') ? isMyZone(playerId) : true;
      if (isMyOp2) {
        addSystemChatMessage(detailRefresh);
        if (!isSoloMode && isConnected() && typeof sendToPeer === 'function') {
          sendToPeer({ type: 'sysmsg', text: detailRefresh });
        }
      } else {
        broadcastSystemMsg(detailRefresh);
      }
      syncBountyToPeer(playerId);
      syncShopToPeer(playerId);
      updateBountyInput(playerId);
      renderShop(playerId);
    }

    function syncShopToPeer(playerId) {
      if (!window._gameSocket || !window._gameSocket.connected || typeof sendToPeer !== 'function') return;
      const shop = getShop(playerId);
      const stocks = {};
      if (playerCardStocks[playerId]) {
        for (const [name, s] of Object.entries(playerCardStocks[playerId])) {
          stocks[name] = s;
        }
      }
      sendToPeer({
        type: 'shop-update',
        playerId: playerId,
        level: shop.level,
        products: shop.products.map(p => ({
          name: p.cardDef.name, stock: p.stock, price: p.price, bought: p.bought,
        })),
        upgradeProgress: shop.upgradeProgress,
        upgradeNeeded: shop.upgradeNeeded,
        refreshCost: shop.refreshCost,
        slotCount: shop.slotCount,
        cardStocks: stocks,
        customDefs: customShopDefs[playerId] || {},
      });
    }

    function applyRemoteShop(data) {
      if (!data.playerId) return;
      const shop = getShop(data.playerId);
      shop.level = data.level || 1;
      shop.upgradeProgress = data.upgradeProgress || 0;
      shop.upgradeNeeded = data.upgradeNeeded || 5;
      shop.refreshCost = data.refreshCost || 1;
      if (data.slotCount != null) shop.slotCount = data.slotCount;
      if (data.cardStocks) {
        for (const [name, s] of Object.entries(data.cardStocks)) {
          setCardStock(data.playerId, name, s);
        }
        stockInitialized[data.playerId] = true;   // 远端状态为准，不再补全默认库存
      }
      if (data.customDefs) {
        customShopDefs[data.playerId] = data.customDefs;
      }
      if (Array.isArray(data.products)) {
        shop.products = data.products.map(p => {
          const pool = getShopCardPool();
          const def = pool.find(c => c.name === p.name) || { name: p.name, type: 'spell', owner: '商店', level: 1, effect: '' };
          return { cardDef: def, stock: p.stock, price: p.price, bought: p.bought };
        });
      }
      if (!shopOverlay.hidden && _activeShopPlayer === data.playerId) {
        renderShop(data.playerId);
      }
    }

    // 事件绑定
    shopCloseBtn.addEventListener('click', () => {
      shopOverlay.hidden = true;
    });

    shopRefreshBtn.addEventListener('click', () => {
      if (_activeShopPlayer) refreshShop(_activeShopPlayer);
    });

    shopFreeRefreshBtn.addEventListener('click', () => {
      if (!_activeShopPlayer) return;
      if (typeof isSpectator !== 'undefined' && isSpectator) return;
      generateShopProducts(_activeShopPlayer);
      syncShopToPeer(_activeShopPlayer);
      renderShop(_activeShopPlayer);
      broadcastSystemMsg('【系统】' + getPlayerName(_activeShopPlayer) + '免费刷新了商店');
    });

    // 库存视图切换
    if (shopInvBtn) shopInvBtn.addEventListener('click', () => {
      if (!_activeShopPlayer) return;
      _shopInvOpen = !_shopInvOpen;
      _refreshShopInvBtnText();
      const titleEl = document.getElementById('shop-dialog-title');
      if (titleEl) titleEl.textContent = _shopInvOpen ? '神秘商店（库存）' : '神秘商店';
      if (shopInventoryEl) shopInventoryEl.hidden = !_shopInvOpen;
      if (shopProductsEl) shopProductsEl.style.display = _shopInvOpen ? 'none' : '';
      if (_shopInvOpen) renderInventory(_activeShopPlayer);
    });

    // 优先刷新队列
    if (shopPriorityBtn) shopPriorityBtn.addEventListener('click', () => {
      if (!_activeShopPlayer) return;
      if (typeof isSpectator !== 'undefined' && isSpectator) return;
      if (!shopPriorityInput) return;
      const pName = shopPriorityInput.value.trim();
      if (!pName) { shopPriorityInput.focus(); return; }
      const stocks = playerCardStocks[_activeShopPlayer] || {};
      if (!(pName in stocks) || stocks[pName] <= 0) {
        if (typeof addSystemChatMessage === 'function') addSystemChatMessage('【系统】库存里没有这张牌');
        return;
      }
      addShopPriority(_activeShopPlayer, pName);
      shopPriorityInput.value = '';
      if (typeof addSystemChatMessage === 'function') addSystemChatMessage('【系统】已将「' + pName + '」加入优先刷新队列，下次刷新必出');
    });

    // 添加新商品
    if (shopAddBtn) shopAddBtn.addEventListener('click', () => {
      if (!_activeShopPlayer) return;
      if (typeof isSpectator !== 'undefined' && isSpectator) return;
      if (typeof openCardTextDialog === 'function') {
        openCardTextDialog({
          title: '添加新商品',
          placeholder: '输入商品（牌）名字',
          showLevel: true,
          onConfirm: function(name, qty, level) {
            const n = (name || '').trim();
            if (!n) return;
            addInventoryItem(_activeShopPlayer, n, qty, level);
          },
        });
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !shopOverlay.hidden) {
        shopOverlay.hidden = true;
      }
    });

    // 商店在首次打开时自动初始化（CardDB异步加载完成后）
