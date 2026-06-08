    // ================================================================
    //  全局常量
    // ================================================================
    const APP_VERSION = 'v0.24';
    const APP_TITLE = '百闻牌模拟器';
    document.title = `${APP_TITLE} ${APP_VERSION}`;
    const roomTitleEl = document.getElementById('room-title');
    if (roomTitleEl) roomTitleEl.textContent = `🎴 ${APP_TITLE} ${APP_VERSION}`;

    // ================================================================
    //  工具函数
    // ================================================================

    /** HTML 转义，防止 XSS */
    function escapeHTML(str) {
      const div = document.createElement('div');
      div.appendChild(document.createTextNode(str));
      return div.innerHTML;
    }

    // ================================================================
    //  卡牌数据库 (CardDB) — data/cards.js 全局变量 + 本地自定义卡牌
    //  数据文件 data/cards.js 通过 <script> 标签在 index.html 中加载，
    //  定义全局变量 CARD_DB_DATA。直接编辑该文件即可增删卡牌。
    // ================================================================
    const CardDB = (() => {
      const _cards = new Map();
      const STORAGE_KEY = 'bwp_custom_cards';

      async function init() {
        // 加载 data/cards.js 中的全局数据（<script> 已同步加载，直接可用）
        if (typeof CARD_DB_DATA !== 'undefined' && Array.isArray(CARD_DB_DATA)) {
          for (const card of CARD_DB_DATA) {
            _cards.set(card.name, card);
          }
          console.log(`[CardDB] ✅ data/cards.js 加载完成，共 ${CARD_DB_DATA.length} 张卡牌`);
        } else {
          console.error('[CardDB] ❌ 未找到 CARD_DB_DATA，请检查 index.html 中是否引用了 data/cards.js');
        }

        // 加载本地自定义卡牌（最后加载，优先级最高）
        _loadCustom();
      }

      function _loadCustom() {
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) {
            const cards = JSON.parse(raw);
            for (const card of cards) {
              card._custom = true;
              _cards.set(card.name, card);
            }
            console.log(`[CardDB] 本地自定义卡牌加载完成，共 ${cards.length} 张`);
          }
        } catch (e) {
          console.warn('[CardDB] 本地自定义卡牌读取失败:', e.message);
        }
      }

      function _saveCustom() {
        const customs = [];
        for (const card of _cards.values()) {
          if (card._custom) customs.push(card);
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(customs));
      }

      /** 查询卡牌：精确匹配 → 前缀匹配 → 包含匹配 */
      function lookup(name) {
        if (!name) return null;
        const key = name.trim();
        if (_cards.has(key)) return _cards.get(key);
        // 前缀匹配（「桃花妖·觉醒」→ 可匹配到「桃花妖」）
        for (const [k, card] of _cards) {
          if (key.startsWith(k) || k.startsWith(key)) return card;
        }
        // 包含匹配
        for (const [k, card] of _cards) {
          if (k.includes(key) || key.includes(k)) return card;
        }
        return null;
      }

      /** 添加自定义卡牌 */
      function addCustom(card) {
        if (!card || !card.name || !card.type) return false;
        card._custom = true;
        if (card.reviewed === undefined) card.reviewed = false;
        _cards.set(card.name, card);
        _saveCustom();
        return true;
      }

      /** 删除自定义卡牌 */
      function removeCustom(name) {
        const card = _cards.get(name);
        if (card && card._custom) {
          _cards.delete(name);
          _saveCustom();
          return true;
        }
        return false;
      }

      /** 导出所有自定义卡牌为 JSON 字符串 */
      function exportCustom() {
        const customs = [];
        for (const card of _cards.values()) {
          if (card._custom) customs.push(card);
        }
        return JSON.stringify(customs, null, 2);
      }

      /** 批量导入自定义卡牌 JSON，返回成功导入数量 */
      function importCustom(jsonStr) {
        const cards = JSON.parse(jsonStr);
        if (!Array.isArray(cards)) throw new Error('格式错误：需要 JSON 数组');
        let count = 0;
        for (const card of cards) {
          if (!card.name || !card.type) continue;
          card._custom = true;
          _cards.set(card.name, card);
          count++;
        }
        _saveCustom();
        return count;
      }

      function isReady() { return _cards.size > 0; }
      function size() { return _cards.size; }
      function getAll() { return [..._cards.values()]; }

      return { init, lookup, addCustom, removeCustom, exportCustom, importCustom, isReady, size, getAll };
    })();

    // ================================================================
    //  卡牌信息浮窗 (CardTooltip) — 鼠标悬浮展示卡牌详情
    // ================================================================
    const CardTooltip = (() => {
      let el = null;
      let timer = null;
      let currentCard = null;
      let currentSlot = null;
      let currentCardCurses = null;
      let hoveredEl = null;
      const DELAY = 300;

      function init() {
        el = document.getElementById('card-tooltip');
        if (!el) { console.error('[Tooltip] ❌ 未找到 #card-tooltip DOM元素！'); return; }

        // 事件委托
        document.addEventListener('mouseover', _onMouseOver, true);
        document.addEventListener('mouseout', _onMouseOut, true);
        console.log('[Tooltip] ✅ 已初始化，监听卡牌名悬浮');
      }

      function _findCardName(target) {
        if (!target) return null;
        // 直接命中
        if (target.classList.contains('card-name')) return target.value;
        if (target.classList.contains('card-list-item__name')) return target.textContent;
        if (target.classList.contains('chat-card-name')) return target.textContent;
        if (target.classList.contains('effect-name')) return target.value;
        // 手牌/牌库灵咒标签
        if (target.classList.contains('card-list-curse-tag')) {
          return target.dataset.curseName || '';
        }
        // 灵咒徽章内的名字
        if (target.classList.contains('curse-badge__name')) return target.textContent;
        if (target.classList.contains('curse-badge')) {
          const nameEl = target.querySelector('.curse-badge__name');
          if (nameEl) return nameEl.textContent;
        }
        // label 包裹的 input
        if (target.classList.contains('card-badge--name')) {
          const input = target.querySelector('.card-name');
          if (input) return input.value;
        }
        // 卡牌槽内任意位置
        const slot = target.closest('.card-slot');
        if (slot) {
          const input = slot.querySelector('.card-name');
          if (input && input.value) return input.value;
        }
        return null;
      }

      function _onMouseOver(e) {
        const target = e.target;
        const name = _findCardName(target);

        if (!name) { hide(); return; }
        const card = CardDB.lookup(name);
        if (!card) { hide(); return; }
        currentCard = card;
        hoveredEl = target;
        // 记录卡牌槽引用（战场，悬停灵咒徽章本身时跳过）
        const isCurseEl = target.closest('.curse-badge, .card-list-curse-tag');
        currentSlot = isCurseEl ? null : (target.closest('.card-slot') || null);
        // 记录手牌/牌库卡牌数据
        const info = target.closest('.card-list-item__info');
        currentCardCurses = (!isCurseEl && info && info.dataset.cardCurses) ? JSON.parse(info.dataset.cardCurses) : null;
        clearTimeout(timer);
        const mx = e.clientX;
        const my = e.clientY;
        timer = setTimeout(() => _show(mx, my), DELAY);
      }

      function _onMouseOut(e) {
        if (e.target === hoveredEl || _findCardName(e.target)) {
          clearTimeout(timer);
          hide();
        }
      }

      function _show(mx, my) {
        if (!currentCard || !el) return;
        _render(currentCard);
        el.hidden = false;
        requestAnimationFrame(() => {
          _position(mx, my);
        });
      }

      function hide() {
        clearTimeout(timer);
        currentCard = null;
        currentSlot = null;
        currentCardCurses = null;
        hoveredEl = null;
        if (el) el.hidden = true;
      }

      function _position(mx, my) {
        const rect = el.getBoundingClientRect();
        let x = mx + 14;
        let y = my - rect.height / 2;
        if (x + rect.width > window.innerWidth - 10) x = mx - rect.width - 14;
        if (y < 10) y = 10;
        if (y + rect.height > window.innerHeight - 10) y = window.innerHeight - rect.height - 10;
        el.style.left = x + 'px';
        el.style.top = y + 'px';
      }

      function _render(card) {
        const typeNames = { shikigami: '式神', summon: '召唤物', spell: '法术', battle: '战斗', form: '形态', realm: '幻境', curse: '灵咒', xiezhan: '协战' };
        const typeCN = typeNames[card.type] || card.type;

        // 类型徽章
        const badge = el.querySelector('.card-tooltip__badge');
        badge.textContent = typeCN;
        badge.className = 'card-tooltip__badge card-tooltip__badge--' + card.type;

        // 卡牌名称
        el.querySelector('.card-tooltip__name').textContent = card.name;

        // 标签：觉醒 / 衍生物
        const tagEl = el.querySelector('.card-tooltip__tag');
        let tags = [];
        if (card.awakened) tags.push('<span class="card-tooltip__tag card-tooltip__tag--awakened">觉醒</span>');
        if (card.derivative) tags.push('<span class="card-tooltip__tag card-tooltip__tag--derivative">衍生物</span>');
        tagEl.innerHTML = tags.join(' ');

        // 属性区
        const statsEl = el.querySelector('.card-tooltip__stats');
        let statsHTML = '';
        // 所属式神（非式神卡牌）
        if (card.owner) statsHTML += `<span class="stat stat--owner">👤 ${card.owner}</span>`;
        switch (card.type) {
          case 'shikigami':
          case 'summon':
            if (card.faction) statsHTML += `<span class="stat stat--faction">🎌 ${card.faction}</span>`;
            statsHTML += `<span class="stat stat--atk">⚔ 攻击:${card.attack}</span>`;
            statsHTML += `<span class="stat stat--hp">❤ 生命:${card.hp}</span>`;
            break;
          case 'spell':
            statsHTML += `<span class="stat">⭐ Lv.${card.level}</span>`;
            if (card.atkBonus > 0) statsHTML += `<span class="stat stat--atk">⚔ +${card.atkBonus}攻击</span>`;
            if (card.hpBonus > 0) statsHTML += `<span class="stat stat--hp">❤ +${card.hpBonus}生命</span>`;
            break;
          case 'battle':
            statsHTML += `<span class="stat">⭐ Lv.${card.level}</span>`;
            if (card.atkBonus > 0) statsHTML += `<span class="stat stat--atk">⚔ +${card.atkBonus}攻击</span>`;
            if (card.atkPenalty > 0) statsHTML += `<span class="stat stat--penalty">⚔ -${card.atkPenalty}攻击</span>`;
            if (card.shieldBonus > 0) statsHTML += `<span class="stat stat--shield">🛡 +${card.shieldBonus}护盾</span>`;
            if (card.shieldPenalty > 0) statsHTML += `<span class="stat stat--penalty">🛡 -${card.shieldPenalty}护盾</span>`;
            break;
          case 'form':
            statsHTML += `<span class="stat">⭐ Lv.${card.level}</span>`;
            statsHTML += `<span class="stat stat--atk">⚔ 攻击:${card.attack}</span>`;
            statsHTML += `<span class="stat stat--hp">❤ 生命:${card.hp}</span>`;
            break;
          case 'realm':
            statsHTML += `<span class="stat">⭐ Lv.${card.level}</span>`;
            statsHTML += `<span class="stat stat--durability">🔮 耐久:${card.durability}</span>`;
            break;
          case 'curse':
            statsHTML += `<span class="stat">📎 结附效果</span>`;
            break;
          case 'xiezhan':
            statsHTML += `<span class="stat">⭐ Lv.${card.level}</span>`;
            if (card.atkBonus > 0) statsHTML += `<span class="stat stat--atk">⚔ +${card.atkBonus}攻击</span>`;
            if (card.atkPenalty > 0) statsHTML += `<span class="stat stat--penalty">⚔ -${card.atkPenalty}攻击</span>`;
            if (card.shieldBonus > 0) statsHTML += `<span class="stat stat--shield">🛡 +${card.shieldBonus}护盾</span>`;
            if (card.shieldPenalty > 0) statsHTML += `<span class="stat stat--penalty">🛡 -${card.shieldPenalty}护盾</span>`;
            break;
        }
        statsEl.innerHTML = statsHTML;

        // 效果/能力描述
        const effectEl = el.querySelector('.card-tooltip__effect');
        const effectText = card.effect || card.ability || '';
        effectEl.textContent = effectText;
        effectEl.style.display = effectText ? '' : 'none';

        // 结附灵咒（从战场卡牌槽或手牌/牌库数据读取）
        let cursesHTML = '';
        let curses = null;
        if (currentSlot && (card.type === 'shikigami' || card.type === 'summon')) {
          curses = getSlotCurses(currentSlot);
        }
        if (!curses || !curses.length) {
          curses = currentCardCurses;
        }
        if (curses && curses.length) {
          cursesHTML = '<div class="card-tooltip__curses">';
          curses.forEach(c => {
            const dbCurse = CardDB.lookup(c.name);
            const eff = dbCurse ? (dbCurse.effect || '') : '';
            cursesHTML += '<div class="card-tooltip__curse-item">';
            cursesHTML += '<div class="card-tooltip__curse-head">⛓️ <span class="curse-name">' + escapeHTML(c.name) + '</span> <span class="curse-layers">×' + c.layers + '</span></div>';
            if (eff) cursesHTML += '<div class="card-tooltip__curse-eff">' + escapeHTML(eff) + '</div>';
            cursesHTML += '</div>';
          });
          cursesHTML += '</div>';
        }
        // 插入或更新灵咒区
        let cursesEl = el.querySelector('.card-tooltip__curses');
        if (cursesHTML) {
          if (!cursesEl) {
            cursesEl = document.createElement('div');
            el.appendChild(cursesEl);
          }
          cursesEl.outerHTML = cursesHTML;
        } else if (cursesEl) {
          cursesEl.remove();
        }
      }

      return { init, hide };
    })();

    // ================================================================
    //  JS-1：PeerJS 联机系统 —— 房间管理
    // ================================================================

    /* P2P 连接配置：多重 STUN/TURN 穿透方案，适应公司网络 */
    const PEER_ICE_CONFIG = {
      iceServers: [
        // STUN 服务器（公网 IP 发现）
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
        // TURN UDP（直连失败时中继）
        { urls: 'turn:openrelay.metered.ca:80',  username: 'openrelayproject', credential: 'openrelayproject' },
        // TURN TCP 端口 80（穿透允许 HTTP 流量的防火墙）
        { urls: 'turn:openrelay.metered.ca:80?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
        // TURN TCP 端口 443（伪装成 HTTPS，公司防火墙几乎不拦截）
        { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
        // TURN over TLS 端口 443（完全加密，最不易被检测/阻断）
        { urls: 'turns:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
      ],
      iceCandidatePoolSize: 2, // 预取候选地址，加快连接
      iceTransportPolicy: 'all', // 允许直连和中继
    };

    const ROOM_OVERLAY = document.getElementById('room-overlay');
    const ROOM_HOME = document.getElementById('room-home');
    const ROOM_WAITING = document.getElementById('room-waiting');
    const ROOM_ID_CODE = document.getElementById('room-id-code');
    const ROOM_JOIN_INPUT = document.getElementById('room-join-input');
    const CONN_STATUS_BAR = document.getElementById('conn-status-bar');
    const CONN_DOT = document.getElementById('conn-dot');
    const CONN_STATUS_TEXT = document.getElementById('conn-status-text');

    let localPlayerId = null;   // '1' 房主 '2' 对手 '0' 观众
    let peer = null;
    let peerConn = null;        // 主游戏连接（对手）
    let specConns = [];          // 观众连接列表（仅房主持有）
    let isHost = false;
    let isSpectator = false;     // 当前是否为观众身份
    let isSoloMode = false;      // 单人模式（无联机/无锁定）
    let lastRoomCode = null;

    // ---- JS-1.1：心跳保活 + 断线重连 ----
    let heartbeatTimer = null;
    let lastPongTime = 0;
    let consecutivePingFails = 0;
    const HEARTBEAT_INTERVAL = 15000;  // 每 15 秒发一次 ping
    const HEARTBEAT_TIMEOUT = 45000;   // 45 秒（3 次连续失败）才触发重连
    let reconnectTimer = null;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 10;
    let joinTimeout = null; // 加入房间超时计时器
    let peerLeft = false;    // 对方已主动退出，不再自动重连

    function clearJoinTimeout() {
      if (joinTimeout) { clearTimeout(joinTimeout); joinTimeout = null; }
    }

    function startHeartbeat() {
      stopHeartbeat();
      lastPongTime = Date.now();
      consecutivePingFails = 0;
      heartbeatTimer = setInterval(() => {
        if (peerConn && peerConn.open) {
          sendToPeer({ type: 'ping' });
          consecutivePingFails += 1;
        }
        // 连续多次超时才触发重连，避免短暂波动
        if (consecutivePingFails >= 3 || Date.now() - lastPongTime > HEARTBEAT_TIMEOUT) {
          console.log('[Peer] 心跳连续失败，尝试重连...');
          stopHeartbeat();
          attemptReconnect();
        }
      }, HEARTBEAT_INTERVAL);
    }

    function stopHeartbeat() {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    }

    function attemptReconnect() {
      if (isSoloMode) return;
      if (peerLeft) return; // 对方已主动退出，不再重连
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        addSystemChatMessage('【系统】重连失败，请刷新页面重新开始。');
        setConnStatus(false, '连接丢失');
        return;
      }
      reconnectAttempts += 1;
      addSystemChatMessage(`【系统】连接断开，正在重连（${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}）…`);
      setConnStatus(false, `重连中(${reconnectAttempts})…`);

      if (peerConn) {
        try { peerConn.close(); } catch (_) {}
        peerConn = null;
      }

      reconnectTimer = setTimeout(() => {
        if (!lastRoomCode) return;
        if (isHost) {
          if (peer) { try { peer.destroy(); } catch (_) {} }
          peer = new Peer(lastRoomCode, { debug: 0, config: PEER_ICE_CONFIG });
          peer.on('open', () => {
            console.log('[Peer] 重连：房间已重新创建');
          });
          peer.on('connection', (conn) => {
            console.log('[Peer] 重连：对手已重新连接');
            peerConn = conn;
            reconnectAttempts = 0;
            consecutivePingFails = 0;
            setupPeerConnection();
            addSystemChatMessage('【系统】重连成功，已恢复连接。');
            setConnStatus(true, '已重连');
          });
          peer.on('error', (err) => {
            console.error('[Peer] 重连错误:', err);
            attemptReconnect();
          });
        } else {
          if (peer) { try { peer.destroy(); } catch (_) {} }
          peer = new Peer(undefined, { debug: 0, config: PEER_ICE_CONFIG });
          peer.on('open', () => {
            const conn = peer.connect(lastRoomCode, { reliable: true });
            peerConn = conn;
            reconnectAttempts = 0;
            consecutivePingFails = 0;
            setupPeerConnection();
            addSystemChatMessage('【系统】重连成功，已恢复连接。');
            setConnStatus(true, '已重连');
          });
          peer.on('error', (err) => {
            console.error('[Peer] 重连错误:', err);
            attemptReconnect();
          });
        }
      }, Math.min(3000 * reconnectAttempts, 15000)); // 3~15 秒递增延迟
    }

    /* 页面可见性变化时检查连接 */
    function handleVisibilityChange() {
      if (isSoloMode) return;
      if (document.hidden) return;
      if (peerLeft) return; // 对方已退出，不重连
      // 页面恢复可见，检查连接状态
      if (localPlayerId && (!peerConn || !peerConn.open)) {
        console.log('[Peer] 页面恢复可见，连接已断开，尝试重连');
        attemptReconnect();
      } else if (peerConn && peerConn.open) {
        // 连接还在，发送 ping 确认
        sendToPeer({ type: 'ping' });
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    /* 生成 6 位房间号（大写字母+数字，易读） */
    function generateRoomCode() {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉易混淆的 0/O/1/I
      let code = '';
      for (let i = 0; i < 6; i += 1) {
        code += chars[Math.floor(Math.random() * chars.length)];
      }
      return code;
    }

    /* 复制房间号到剪贴板 */
    async function copyRoomCode() {
      try {
        await navigator.clipboard.writeText(ROOM_ID_CODE.textContent);
        addSystemChatMessage('【系统】房间号已复制到剪贴板');
      } catch (_) {
        // fallback
        const input = document.createElement('input');
        input.value = ROOM_ID_CODE.textContent;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
    }

    function updateSysChatTitle() {
      const el = document.getElementById('sys-chat-title');
      if (!el) return;
      if (isSoloMode) { el.textContent = '📢 系统信息（单人模式）'; }
      else if (lastRoomCode) { el.textContent = `📢 系统信息（房间号：${lastRoomCode}）`; }
      else { el.textContent = '📢 系统信息'; }
    }

    /* 显示连接状态栏 */
    function setConnStatus(ok, text) {
      CONN_STATUS_BAR.hidden = false;
      CONN_DOT.className = ok ? 'conn-dot conn-dot--ok' : 'conn-dot conn-dot--warn';
      CONN_STATUS_TEXT.textContent = text;
    }

    // ---- JS-1.2：P2P 消息收发 ----
    function sendToPeer(data) {
      if (isSoloMode) return;
      if (peerConn && peerConn.open) {
        peerConn.send(data);
      }
      specConns.forEach(c => { if (c.open) c.send(data); });
    }

    function broadcastToAll(data) {
      sendToPeer(data);
    }

    /* 处理收到的数据（后续任务中扩展） */
    function handlePeerData(data) {
      console.log('[Peer] 收到数据:', data);
      if (!data || typeof data !== 'object') return;

      switch (data.type) {
        case 'slot-update':
          applyRemoteSlotUpdate(data.playerId, data.slotIndex, data.state);
          break;
        case 'deck-update':
          applyRemoteDeckState(data.playerId, data.deckCount, data.handCount);
          break;
        case 'chat':
          addChatMessage(data.playerId, data.text);
          break;
        case 'dice':
          addSystemChatMessage(`【系统】${data.rollerName || '对手'}骰了随机数${data.result}（${data.low}~${data.high}）`);
          break;
        case 'effects-update':
          applyRemoteEffectsState(data.playerId, data.effects);
          break;
        case 'player-info':
          applyRemotePlayerInfo(data.playerId, data.name, data.hp);
          break;
        case 'sysmsg':
          addSystemChatMessage(data.text);
          break;
        case 'avatar-update':
          setAvatarImage(data.playerId, data.imageSrc);
          break;
        case 'spec-name':
          if (data.name) {
            spectatorCustomName = data.name;
            document.getElementById('spectator-name-input').value = data.name;
          }
          break;
        case 'card-damage':
          applyRemoteCardDamage(data.playerId, data.slotIndex, data.dmg);
          break;
        case 'card-heal':
          applyRemoteCardHeal(data.playerId, data.slotIndex, data.amount);
          break;
        case 'player-heal':
          applyRemotePlayerHeal(data.playerId, data.amount);
          break;
        case 'player-damage':
          applyRemotePlayerDamage(data.playerId, data.dmg);
          break;
        case 'fire-update':
          applyRemoteFireState(data.playerId, data.count);
          break;
        default:
          console.log('[Peer] 未知消息类型:', data.type);
      }
    }

    function applyRemoteCardDamage(playerId, slotIndex, dmg) {
      const slot = getSlotByIndex(playerId, slotIndex);
      if (!slot) return;
      const hpInput = slot.querySelector('.card-hp');
      const currentHp = parseInt(hpInput.value, 10) || 0;
      const newHp = Math.max(0, currentHp - dmg);
      hpInput.value = newHp || '';
      const cardName = slot.querySelector('.card-name').value || '未命名卡牌';
      const dealerName = getPlayerName(localPlayerId === '1' ? '2' : '1');
      addSystemChatMessage(`【系统】${dealerName}对「${cardName}」造成了${dmg}点伤害`);
    }

    function applyRemoteCardHeal(playerId, slotIndex, amount) {
      const slot = getSlotByIndex(playerId, slotIndex);
      if (!slot) return;
      const hpInput = slot.querySelector('.card-hp');
      const currentHp = parseInt(hpInput.value, 10) || 0;
      const newHp = currentHp + amount;
      hpInput.value = newHp || '';
      const cardName = slot.querySelector('.card-name').value || '未命名卡牌';
      const healerName = getPlayerName(localPlayerId === '1' ? '2' : '1');
      addSystemChatMessage(`【系统】${healerName}为「${cardName}」恢复了${amount}点生命`);
    }

    function applyRemotePlayerHeal(playerId, amount) {
      const zone = document.querySelector(`.player-zone[data-player="${playerId}"]`);
      if (!zone) return;
      const hpInput = zone.querySelector('.player-hp-input');
      const currentHp = parseInt(hpInput.value, 10) || 0;
      const newHp = currentHp + amount;
      hpInput.value = newHp || '';
      const healerName = getPlayerName(localPlayerId === '1' ? '2' : '1');
      addSystemChatMessage(`【系统】${healerName}为${getPlayerName(playerId)}恢复了${amount}点生命`);
    }

    function applyRemotePlayerDamage(playerId, dmg) {
      const zone = document.querySelector(`.player-zone[data-player="${playerId}"]`);
      if (!zone) return;
      const hpInput = zone.querySelector('.player-hp-input');
      const currentHp = parseInt(hpInput.value, 10) || 0;
      const newHp = Math.max(0, currentHp - dmg);
      hpInput.value = newHp || '';
      const dealerName = getPlayerName(localPlayerId === '1' ? '2' : '1');
      addSystemChatMessage(`【系统】${dealerName}对${getPlayerName(playerId)}造成了${dmg}点伤害`);
    }

    // ---- JS-1.8：鬼火状态存储与同步 ----
    const playerFire = { '1': 2, '2': 2 }; // 初始各 2 鬼火

    function syncFireState(playerId) {
      if (!peerConn || !peerConn.open) return;
      sendToPeer({ type: 'fire-update', playerId, count: playerFire[playerId] });
    }

    function applyRemoteFireState(playerId, count) {
      playerFire[playerId] = Math.max(0, Math.min(5, count));
      const area = document.querySelector(`.player-zone[data-player="${playerId}"] .player-fire-area`);
      if (!area) return;
      const iconsRow = area.querySelector('.fire-icons-row');
      if (iconsRow) {
        iconsRow.innerHTML = Array.from({ length: 5 }, (_, i) =>
          `<span class="fire-icon" style="visibility:${i >= playerFire[playerId] ? 'hidden' : 'visible'}">🔥</span>`
        ).join('');
      }
    }

    // ---- JS-1.3：权限管理 ----
    function isMyZone(playerId) {
      if (isSoloMode) return true;
      if (isSpectator) return false;
      return playerId === localPlayerId;
    }

    function isMyElement(el) {
      if (isSoloMode) return true;
      if (!localPlayerId || isSpectator) {
        const zone = el.closest('.player-zone');
        if (zone) return false;
        return true;
      }
      const zone = el.closest('.player-zone');
      if (!zone) return true;
      return zone.dataset.player === localPlayerId;
    }

    let spectatorNameCounter = 0;

    function applyPermissionLock() {
      if (isSoloMode) {
        // 单人模式：不锁定任何区域，显示标签
        const tagYour = document.getElementById('tag-your');
        const tagOpp = document.getElementById('tag-opp');
        if (tagYour) { tagYour.className = 'zone-owner-tag zone-owner-tag--yours tag-above-bar'; tagYour.hidden = false; }
        if (tagOpp) { tagOpp.className = 'zone-owner-tag zone-owner-tag--opponent tag-below-bar'; tagOpp.hidden = false; }
        return;
      }
      if (!localPlayerId) return;
      const tagYour = document.getElementById('tag-your');
      const tagOpp = document.getElementById('tag-opp');
      const specRow = document.getElementById('spectator-name-row');

      if (isSpectator) {
        document.querySelectorAll('.player-zone').forEach(zone => {
          zone.classList.add('player-zone--locked');
          zone.querySelectorAll('input, textarea, button, select').forEach(el => {
            el.setAttribute('data-locked', 'true');
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.readOnly = true;
            else el.disabled = true;
          });
        });
        // 仅显示观众标签行，隐藏对手标签
        if (tagYour) tagYour.hidden = true;
        if (tagOpp) tagOpp.hidden = true;
        if (specRow) specRow.hidden = false;
        return;
      }

      const opponentId = localPlayerId === '1' ? '2' : '1';
      const opponentZone = document.querySelector(`.player-zone[data-player="${opponentId}"]`);
      if (opponentZone) {
        opponentZone.classList.add('player-zone--locked');
        // 仅禁用牌库按钮，其余卡牌/效果/HP等均可操作
        opponentZone.querySelectorAll('.btn-deck').forEach(el => { el.disabled = true; });
      }
      // 根据玩家身份交换标签位置：P1（上方）→ 你的标签在上，P2（下方）→ 你的标签在下
      if (tagYour && tagOpp) {
        if (localPlayerId === '2') {
          tagYour.className = 'zone-owner-tag zone-owner-tag--yours tag-below-bar';
          tagOpp.className = 'zone-owner-tag zone-owner-tag--opponent tag-above-bar';
        } else {
          tagYour.className = 'zone-owner-tag zone-owner-tag--yours tag-above-bar';
          tagOpp.className = 'zone-owner-tag zone-owner-tag--opponent tag-below-bar';
        }
        tagYour.hidden = false;
        tagOpp.hidden = false;
      }
      if (specRow) specRow.hidden = true;
    }

    function resetPermissionLock() {
      document.querySelectorAll('.player-zone').forEach(zone => {
        zone.classList.remove('player-zone--locked');
        zone.querySelectorAll('.btn-deck').forEach(el => { el.disabled = false; });
      });
      const tagYour = document.getElementById('tag-your');
      const tagOpp = document.getElementById('tag-opp');
      const specRow = document.getElementById('spectator-name-row');
      if (tagYour) tagYour.hidden = true;
      if (tagOpp) tagOpp.hidden = true;
      if (specRow) specRow.hidden = true;
    }

    /* 建立连接后的初始化 */
    function onPeerConnected() {
      ROOM_OVERLAY.hidden = true;
      ROOM_HOME.hidden = false;
      ROOM_WAITING.hidden = true;
      document.getElementById('room-joining').hidden = true;
      setConnStatus(true, isSpectator ? '观战中' : '已连接');
      applyPermissionLock();
      if (isSpectator) {
        addSystemChatMessage('【系统】已进入观战模式');
      } else {
        addSystemChatMessage('【系统】连接成功，游戏开始！');
        syncFullState();
      }
    }

    /* 发送当前所有卡牌槽 + 牌库状态给对方（用于初始同步） */
    function syncFullState() {
      if (!peerConn || !peerConn.open) return;
      // 发送自己所有卡牌槽状态
      document.querySelectorAll(`.player-zone[data-player="${localPlayerId}"] .card-slot`).forEach(slot => {
        syncSlotToPeer(slot);
      });
      // 发送自己牌库/手牌计数
      syncDeckState(localPlayerId);
      // 发送自己效果面板
      syncEffectsState(localPlayerId);
      // 发送自己玩家信息
      syncPlayerInfo(localPlayerId);
      // 发送自己鬼火
      syncFireState(localPlayerId);
    }

    /* 创建房间 */
    function createRoom() {
      peerLeft = false;
      const roomCode = generateRoomCode();
      lastRoomCode = roomCode;
      updateSysChatTitle();
      ROOM_HOME.hidden = true;
      ROOM_WAITING.hidden = false;
      ROOM_ID_CODE.textContent = roomCode;
      CONN_STATUS_BAR.hidden = true;
      isSpectator = false;

      peer = new Peer(roomCode, { debug: 0, config: PEER_ICE_CONFIG });

      peer.on('open', () => {
        console.log('[Peer] 房间已创建:', roomCode);
      });

      peer.on('connection', (conn) => {
        if (!peerConn) {
          // 第一个连接 = 对手
          console.log('[Peer] 对手已连接');
          peerConn = conn;
          isHost = true;
          localPlayerId = '1';
          setupPeerConnection();
        } else {
          // 后续连接 = 观众
          console.log('[Peer] 观众已连接');
          specConns.push(conn);
          setupSpectatorConnection(conn);
          broadcastSystemMsg('【系统】一位观众进入了房间');
        }
      });

      peer.on('error', (err) => {
        console.error('[Peer] 错误:', err);
        if (err.type === 'unavailable-id') { createRoom(); return; }
        ROOM_WAITING.querySelector('.room-status').innerHTML =
          '<span class="dot dot--error"></span>连接出错，请重试';
      });
    }

    /* 设置观众连接（仅房主侧） */
    function setupSpectatorConnection(conn) {
      conn.on('open', () => {
        console.log('[Peer] 观众数据通道已建立');
        setTimeout(() => syncFullStateToConn(conn), 500);
      });
      conn.on('data', (data) => {
        if (!data || typeof data !== 'object') return;
        // 心跳处理
        if (data.type === 'ping') { conn.send({ type: 'pong' }); return; }
        if (data.type === 'pong') return;
        // 观众发言：只转发给对手，不广播回观众自己
        if (data.type === 'chat') {
          addChatMessage('0', data.text);
          if (peerConn && peerConn.open) peerConn.send(data);
          return;
        }
        // 观众改名：转发给对手
        if (data.type === 'spec-name') {
          if (peerConn && peerConn.open) peerConn.send(data);
          return;
        }
      });
      conn.on('close', () => {
        specConns = specConns.filter(c => c !== conn);
        broadcastSystemMsg('【系统】观众离开了房间');
      });
    }

    /* 向指定连接发送完整状态 */
    function syncFullStateToConn(conn) {
      if (!conn || !conn.open) return;
      ['1', '2'].forEach(pid => {
        document.querySelectorAll(`.player-zone[data-player="${pid}"] .card-slot`).forEach(slot => {
          const state = getSlotState(slot);
          conn.send({ type: 'slot-update', playerId: pid, slotIndex: parseInt(slot.dataset.slotIndex, 10), state });
        });
        const cards = getPlayerCardState(pid);
        conn.send({ type: 'deck-update', playerId: pid, deckCount: cards.deck.length, handCount: cards.hand.length });
        conn.send({ type: 'effects-update', playerId: pid, effects: getEffectsState(pid) });
        const info = getPlayerInfo(pid);
        conn.send({ type: 'player-info', playerId: pid, name: info.name, hp: info.hp });
        conn.send({ type: 'fire-update', playerId: pid, count: playerFire[pid] });
      });
    }

    /* 加入房间（玩家） */
    function joinRoom(roomCode) {
      if (!roomCode) return;
      peerLeft = false;
      const code = roomCode.toUpperCase().trim();
      lastRoomCode = code;
      updateSysChatTitle();
      ROOM_JOIN_INPUT.value = '';
      isSpectator = false;
      ROOM_HOME.hidden = true;
      ROOM_WAITING.hidden = true;
      document.getElementById('room-joining').hidden = false;

      peer = new Peer(undefined, { debug: 0, config: PEER_ICE_CONFIG });

      // 连接超时（30 秒）
      joinTimeout = setTimeout(() => {
        if (peerConn && peerConn.open) return;
        document.getElementById('room-joining').hidden = true;
        ROOM_HOME.hidden = false;
        alert('⚠️ 连接超时（30秒）\n\n可能原因：\n1. 公司/校园网封锁了 WebRTC 流量（常见）\n2. 房间号输入有误\n3. 对方已关闭房间\n\n💡 解决方案：\n• 最优：双方都用手机热点（彻底绕过公司网）\n• 备选：一方开热点，另一方连接该热点\n• 确认房间号大小写正确');
        addSystemChatMessage('【系统】连接超时 — 请确认房间号正确且双方网络可互通');
        if (peer) { peer.destroy(); peer = null; }
        peerConn = null; localPlayerId = null; lastRoomCode = null;
        joinTimeout = null;
      }, 30000);

      peer.on('open', () => {
        const conn = peer.connect(code, { reliable: true });
        peerConn = conn;
        isHost = false;
        localPlayerId = '2';
        setupPeerConnection();
      });

      peer.on('error', (err) => {
        clearJoinTimeout();
        document.getElementById('room-joining').hidden = true;
        ROOM_HOME.hidden = false;
        let msg = '连接失败';
        if (err.type === 'peer-unavailable') msg = '房间不存在或对方已关闭房间';
        else if (err.type === 'network') msg = '网络异常，请检查防火墙/网络设置';
        else if (err.type === 'server-error') msg = '信令服务器繁忙，请稍后重试';
        else if (err.type === 'disconnected') msg = '与信令服务器断开连接';
        else msg = '连接失败：' + (err.message || err.type || '未知错误');
        alert('⚠️ ' + msg + '\n\n💡 公司/校园网通常会拦截 P2P 连接。\n请尝试：\n1. 用手机热点替代公司 WiFi\n2. 或用手机数据流量直接访问');
        addSystemChatMessage('【系统】连接失败 — ' + msg);
        if (peer) { peer.destroy(); peer = null; }
        peerConn = null; localPlayerId = null; lastRoomCode = null;
      });
    }

    /* 观众观战 */
    function spectateRoom(roomCode) {
      if (!roomCode) return;
      peerLeft = false;
      const code = roomCode.toUpperCase().trim();
      lastRoomCode = code;
      isSpectator = true;
      localPlayerId = '0';
      spectatorNameCounter += 1;
      ROOM_HOME.hidden = true;
      ROOM_WAITING.hidden = true;
      document.getElementById('room-joining').hidden = false;
      // 预设观众名称
      const specInput = document.getElementById('spectator-name-input');
      if (specInput) { specInput.value = `观众${spectatorNameCounter}`; spectatorCustomName = ''; }

      peer = new Peer(undefined, { debug: 0, config: PEER_ICE_CONFIG });
      peer.on('open', () => {
        const conn = peer.connect(code, { reliable: true });
        peerConn = conn;
        isHost = false;
        setupPeerConnection();
      });
      peer.on('error', (err) => {
        document.getElementById('room-joining').hidden = true;
        ROOM_HOME.hidden = false;
        let msg = '观战连接失败';
        if (err.type === 'peer-unavailable') msg = '房间不存在或对方已关闭';
        else if (err.type === 'network') msg = '网络异常，请检查防火墙/网络设置';
        else msg = '连接失败：' + (err.message || err.type || '未知错误');
        alert('⚠️ ' + msg + '\n\n💡 提示：公司/校园网可能拦截连接，建议用手机热点');
        if (peer) { peer.destroy(); peer = null; }
        peerConn = null; localPlayerId = null; lastRoomCode = null; isSpectator = false;
      });
    }

    /* 取消加入 */
    function cancelJoinRoom() {
      clearJoinTimeout();
      peerLeft = false;
      if (peer) { peer.destroy(); peer = null; }
      peerConn = null;
      localPlayerId = null;
      isSpectator = false;
      lastRoomCode = null;
      document.getElementById('room-joining').hidden = true;
      ROOM_HOME.hidden = false;
    }

    /* 设置 P2P 数据连接 */
    function setupPeerConnection() {
      peerConn.on('open', () => {
        clearJoinTimeout(); // 连接成功，取消加入超时
        console.log('[Peer] 数据通道已建立');
        addSystemChatMessage('【系统】连接已建立' + (peerConn._dc && peerConn._dc._channel ? '（WebRTC 数据通道）' : ''));
        reconnectAttempts = 0;
        startHeartbeat();
        onPeerConnected();
      });

      peerConn.on('data', (data) => {
        // 心跳响应
        if (data && data.type === 'ping') {
          sendToPeer({ type: 'pong' });
          return;
        }
        if (data && data.type === 'pong') {
          lastPongTime = Date.now();
          consecutivePingFails = 0;
          return;
        }
        handlePeerData(data);
        // 房主将对手数据转发给所有观众
        if (isHost && data) {
          specConns.forEach(c => { if (c.open) c.send(data); });
        }
      });

      peerConn.on('close', () => {
        console.log('[Peer] 连接已断开');
        stopHeartbeat();
        if (isSpectator) {
          peerLeft = true;
          setConnStatus(false, '观战已断开');
          addSystemChatMessage('【系统】观战连接已断开，可返回主界面');
        } else if (isHost) {
          setConnStatus(false, '对手已退出');
          addSystemChatMessage('【系统】对手已退出房间，等待重连…');
          // 房主侧：等待对手重新加入
          if (localPlayerId) { attemptReconnect(); }
        } else {
          peerLeft = true; // 房主退出，不再自动重连
          setConnStatus(false, '房主已退出');
          addSystemChatMessage('【系统】房主已退出房间，可返回主界面重新创建或加入');
        }
      });

      peerConn.on('error', (err) => {
        console.error('[Peer] 数据通道错误:', err);
        stopHeartbeat();
        setConnStatus(false, '通信错误');
      });
    }

    /* 按钮事件 */
    document.getElementById('room-btn-create').addEventListener('click', createRoom);
    document.getElementById('room-btn-join').addEventListener('click', () => {
      joinRoom(ROOM_JOIN_INPUT.value);
    });
    document.getElementById('room-btn-spectate').addEventListener('click', () => {
      spectateRoom(ROOM_JOIN_INPUT.value);
    });
    document.getElementById('room-btn-solo').addEventListener('click', startSoloMode);
    document.getElementById('room-btn-copy').addEventListener('click', copyRoomCode);
    document.getElementById('room-btn-join-cancel').addEventListener('click', cancelJoinRoom);
    document.getElementById('room-btn-back').addEventListener('click', () => {
      clearJoinTimeout();
      peerLeft = false;
      stopHeartbeat();
      if (peer) { peer.destroy(); peer = null; }
      peerConn = null;
      specConns = [];
      localPlayerId = null;
      isHost = false;
      isSpectator = false;
      isSoloMode = false;
      lastRoomCode = null;
      reconnectAttempts = 0;
      resetPermissionLock();
      ROOM_HOME.hidden = false;
      ROOM_WAITING.hidden = true;
      document.getElementById('room-joining').hidden = true;
      CONN_STATUS_BAR.hidden = true;
      updateSysChatTitle();
    });

    /* 单人模式 */
    function startSoloMode() {
      peerLeft = false;
      isSoloMode = true;
      isHost = false;
      isSpectator = false;
      localPlayerId = '1';
      peerConn = null;
      specConns = [];
      ROOM_OVERLAY.hidden = true;
      setConnStatus(true, '单人模式');
      updateSysChatTitle();
      resetPermissionLock();
      applyPermissionLock();
      addSystemChatMessage('【系统】单人模式 —— 所有区域均可操作');
    }
    ROOM_JOIN_INPUT.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') joinRoom(ROOM_JOIN_INPUT.value);
    });

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
      sendToPeer({
        type: 'deck-update',
        playerId,
        deckCount: deck.length,
        handCount: hand.length,
      });
    }

    /* 接收对方的牌库/手牌计数，更新本地按钮 */
    function applyRemoteDeckState(playerId, deckCount, handCount) {
      // 用占位数组填到对应长度（只为让 updateDeckButtons 读到正确计数）
      const state = getPlayerCardState(playerId);
      state.deck = new Array(deckCount).fill(null);
      state.hand = new Array(handCount).fill(null);
      updateDeckButtons(playerId);
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
        badge.innerHTML = '<span class="curse-badge__icon">⛓️</span><span class="curse-badge__name">' + escapeHTML(c.name) + '</span><span class="curse-badge__layers">×' + c.layers + '</span>';
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
    //  JS-3：发言系统
    // ================================================================
    const chatSystemLog = document.getElementById('chat-system-log');
    const chatPlayerLog = document.getElementById('chat-player-log');
    const speakOverlay = document.getElementById('speak-dialog-overlay');
    const speakInput = document.getElementById('speak-dialog-input');
    const speakTitle = document.getElementById('speak-dialog-title');
    let activeSpeakPlayer = null;

    function getPlayerName(playerId) {
      if (playerId === '0') return getSpectatorDisplayName();
      const zone = document.querySelector(`.player-zone[data-player="${playerId}"]`);
      const input = zone?.querySelector('.player-name-input');
      const name = input?.value.trim();
      return name || (playerId === '1' ? '玩家一' : '玩家二');
    }

    function addChatMessage(playerId, text) {
      const trimmed = text.trim();
      if (!trimmed) return;

      const bubble = document.createElement('div');
      bubble.className = `chat-bubble chat-bubble--player${playerId}`;
      const speaker = document.createElement('span');
      speaker.className = 'chat-speaker';
      speaker.textContent = `${getPlayerName(playerId)}：`;
      bubble.appendChild(speaker);
      bubble.appendChild(document.createTextNode(trimmed));
      chatPlayerLog.appendChild(bubble);
      chatPlayerLog.scrollTop = chatPlayerLog.scrollHeight;
    }

    function addSystemChatMessage(text) {
      if (!chatSystemLog) return;
      try {
        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble chat-bubble--system';
        // 将「卡牌名」包裹为可悬浮的高亮标签，其余文本做 HTML 转义
        bubble.innerHTML = escapeHTML(text).replace(/「(.+?)」/g, '<span class="chat-card-name">$1</span>');
        chatSystemLog.appendChild(bubble);
        chatSystemLog.scrollTop = chatSystemLog.scrollHeight;
      } catch (e) {
        console.error('[SysMsg] 添加系统消息失败:', e);
      }
    }

    /* 系统消息：本地显示 + 同步给对方（单人模式仅本地） */
    function broadcastSystemMsg(msg) {
      console.log('[SysMsg]', msg);
      addSystemChatMessage(msg);
      if (!isSoloMode && peerConn && peerConn.open) {
        sendToPeer({ type: 'sysmsg', text: msg });
      }
    }

    function openSpeakDialog(playerId) {
      activeSpeakPlayer = playerId;
      speakTitle.textContent = `${getPlayerName(playerId)} 发言`;
      speakInput.value = '';
      speakOverlay.hidden = false;
      speakInput.focus();
    }

    function closeSpeakDialog() {
      speakOverlay.hidden = true;
      activeSpeakPlayer = null;
      speakInput.value = '';
    }

    function confirmSpeak() {
      if (!activeSpeakPlayer) return;
      const text = speakInput.value.trim();
      if (!text) { closeSpeakDialog(); return; }
      addChatMessage(activeSpeakPlayer, text);
      // 联机同步发言
      if (peerConn && peerConn.open) {
        sendToPeer({
          type: 'chat',
          playerId: activeSpeakPlayer,
          text,
        });
      }
      closeSpeakDialog();
    }

    /* 统一发言按钮 */
    document.getElementById('btn-speak-unified').addEventListener('click', () => {
      const speaker = localPlayerId || '1';
      openSpeakDialog(speaker);
    });

    /* 观众名称输入框变化 → 更新 getSpectatorName */
    let spectatorCustomName = '';
    const specNameInput = document.getElementById('spectator-name-input');
    if (specNameInput) {
      specNameInput.addEventListener('input', () => {
        spectatorCustomName = specNameInput.value.trim();
      });
      specNameInput.addEventListener('change', () => {
        const name = specNameInput.value.trim();
        spectatorCustomName = name;
        if (peerConn && peerConn.open && isSpectator) {
          sendToPeer({ type: 'spec-name', name });
        }
      });
    }

    function getSpectatorDisplayName() {
      if (spectatorCustomName) return spectatorCustomName;
      return `观众${spectatorNameCounter || 1}`;
    }

    document.getElementById('speak-dialog-cancel').addEventListener('click', closeSpeakDialog);
    document.getElementById('speak-dialog-confirm').addEventListener('click', confirmSpeak);

    speakInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        confirmSpeak();
      }
      if (e.key === 'Escape') closeSpeakDialog();
    });

    // ================================================================
    //  JS-4：骰子系统
    // ================================================================
    const diceMinInput = document.getElementById('dice-min');
    const diceMaxInput = document.getElementById('dice-max');

    function rollDice() {
      const min = parseInt(diceMinInput.value, 10);
      const max = parseInt(diceMaxInput.value, 10);
      if (Number.isNaN(min) || Number.isNaN(max)) return;
      const low = Math.min(min, max);
      const high = Math.max(min, max);
      const result = Math.floor(Math.random() * (high - low + 1)) + low;
      const rollerName = localPlayerId ? getPlayerName(localPlayerId) : '玩家';
      const msg = `【系统】${rollerName}骰了随机数${result}（${low}~${high}）`;
      broadcastSystemMsg(msg);
    }

    document.getElementById('btn-dice-roll').addEventListener('click', rollDice);

    // ---- JS-4.1：伤害/恢复/倒计时/能量系统（统一瞄准） ----
    const damageValueInput = document.getElementById('damage-value');
    const btnDamage = document.getElementById('btn-damage');
    const btnDamageMode = document.getElementById('btn-damage-mode');
    const btnCountdown = document.getElementById('btn-countdown');
    const btnEnergy = document.getElementById('btn-energy');
    const btnKo = document.getElementById('btn-ko');
    const btnCurse = document.getElementById('btn-curse-target');
    const curseNameInput = document.getElementById('curse-name-input');
    const damageLineSvg = document.getElementById('damage-line-svg');
    const damageLine = document.getElementById('damage-line');
    let isTargeting = false;
    let targetingMode = 'damage'; // 'damage' | 'heal' | 'countdown' | 'energy' | 'ko' | 'curse'
    let targetingOrigin = { x: 0, y: 0 };

    const TARGETING_BTN_MAP = {
      damage:    { btn: () => btnDamage,    activeText: '🎯 选择式神…(Esc取消)', idleText: '🎯 选择目标' },
      heal:      { btn: () => btnDamage,    activeText: '🎯 选择式神…(Esc取消)', idleText: '🎯 选择目标' },
      countdown: { btn: () => btnCountdown, activeText: '⏳ 选择式神…(Esc取消)', idleText: '⏳ 倒计时' },
      energy:    { btn: () => btnEnergy,    activeText: '🏮 选择式神…(Esc取消)', idleText: '🏮 能量' },
      ko:        { btn: () => btnKo,        activeText: '💀 选择式神…(Esc取消)', idleText: '💀 气绝' },
      curse:     { btn: () => btnCurse,     activeText: '⛓️ 选择式神…(Esc取消)', idleText: '⛓️ 灵咒' },
    };

    function getActiveTargetingBtn() {
      return TARGETING_BTN_MAP[targetingMode].btn();
    }

    function getActiveTargetingValue() {
      if (targetingMode === 'damage' || targetingMode === 'heal') {
        const val = parseInt(damageValueInput.value, 10);
        return (Number.isNaN(val) || val <= 0) ? 1 : val;
      }
      return 1; // countdown / energy 默认 1
    }

    function enterTargetingMode(mode) {
      targetingMode = mode || 'damage';
      isTargeting = true;
      const btn = getActiveTargetingBtn();
      btn.classList.add('active');
      btn.textContent = TARGETING_BTN_MAP[targetingMode].activeText;
      document.body.style.cursor = 'crosshair';
      damageLineSvg.style.display = 'block';
      const rect = btn.getBoundingClientRect();
      targetingOrigin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }

    function exitTargetingMode() {
      isTargeting = false;
      const btn = getActiveTargetingBtn();
      btn.classList.remove('active');
      btn.textContent = TARGETING_BTN_MAP[targetingMode].idleText;
      document.body.style.cursor = '';
      damageLineSvg.style.display = 'none';
    }

    btnDamage.addEventListener('click', () => {
      if (isTargeting) { exitTargetingMode(); return; }
      enterTargetingMode(targetingMode === 'heal' ? 'heal' : 'damage');
    });

    /* 伤害/恢复 模式切换 */
    btnDamageMode.addEventListener('click', () => {
      const panel = btnDamageMode.closest('.damage-panel');
      if (targetingMode === 'heal') {
        targetingMode = 'damage';
        btnDamageMode.textContent = '🔄 造成伤害';
        btnDamageMode.classList.remove('is-heal');
        if (panel) panel.classList.remove('is-heal');
      } else {
        targetingMode = 'heal';
        btnDamageMode.textContent = '🔄 恢复生命';
        btnDamageMode.classList.add('is-heal');
        if (panel) panel.classList.add('is-heal');
      }
      // 如果正在瞄准中，更新瞄准按钮文字
      if (isTargeting) {
        btnDamage.textContent = TARGETING_BTN_MAP[targetingMode].activeText;
      }
    });

    btnCountdown.addEventListener('click', () => {
      if (isTargeting) { exitTargetingMode(); return; }
      enterTargetingMode('countdown');
    });

    btnEnergy.addEventListener('click', () => {
      if (isTargeting) { exitTargetingMode(); return; }
      enterTargetingMode('energy');
    });

    btnKo.addEventListener('click', () => {
      if (isTargeting) { exitTargetingMode(); return; }
      enterTargetingMode('ko');
    });

    btnCurse.addEventListener('click', () => {
      if (isTargeting) { exitTargetingMode(); return; }
      const name = curseNameInput.value.trim();
      if (!name) { curseNameInput.focus(); return; }
      enterTargetingMode('curse');
    });

    document.addEventListener('mousemove', (e) => {
      if (!isTargeting) return;
      damageLine.setAttribute('x1', targetingOrigin.x);
      damageLine.setAttribute('y1', targetingOrigin.y);
      damageLine.setAttribute('x2', e.clientX);
      damageLine.setAttribute('y2', e.clientY);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isTargeting) {
        exitTargetingMode();
      }
    });

    document.addEventListener('click', (e) => {
      if (!isTargeting) return;

      // 倒计时 / 能量 / 气绝 / 灵咒 模式
      if (targetingMode === 'countdown' || targetingMode === 'energy' || targetingMode === 'ko' || targetingMode === 'curse') {
        const slot = e.target.closest('.card-slot');
        if (slot) {
          if (targetingMode === 'curse') {
            const name = curseNameInput.value.trim();
            if (name && slot.classList.contains('has-image')) {
              const curses = getSlotCurses(slot);
              const existing = curses.find(c => c.name === name);
              if (existing) { existing.layers += 1; }
              else { curses.push({ name, layers: 1 }); }
              setSlotCurses(slot, curses);
              syncSlotToPeer(slot);
              const cardName = slot.querySelector('.card-name').value || '未命名';
              broadcastSystemMsg('【系统】' + getPlayerName(slot.dataset.slotPlayer) + '为「' + cardName + '」结附了灵咒「' + name + '」×1');
            }
            exitTargetingMode();
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          if (slot.classList.contains('has-image')) {
            if (targetingMode === 'ko') {
            applyKoToCard(slot);
          } else {
            applyToggleBadge(slot, targetingMode);
          }
          exitTargetingMode();
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        exitTargetingMode();
        return;
      }
      }

      // 伤害 / 恢复 模式：需要检查生命值
      const amount = getActiveTargetingValue();

      const avatar = e.target.closest('.player-avatar');
      if (avatar) {
        const playerId = avatar.dataset.avatarPlayer;
        const zone = document.querySelector(`.player-zone[data-player="${playerId}"]`);
        const hpInput = zone?.querySelector('.player-hp-input');
        const hpVal = hpInput?.value.trim();
        if (hpVal && parseInt(hpVal, 10) > 0) {
          if (targetingMode === 'heal') {
            applyHealToPlayer(playerId, amount);
          } else {
            applyDamageToPlayer(playerId, amount);
          }
          exitTargetingMode();
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }

      const slot = e.target.closest('.card-slot');
      if (slot) {
        const hpInput = slot.querySelector('.card-hp');
        const hpVal = hpInput?.value.trim();
        if (hpVal && parseInt(hpVal, 10) > 0) {
          if (targetingMode === 'heal') {
            applyHealToCard(slot, amount);
          } else {
            applyDamageToCard(slot, amount);
          }
          exitTargetingMode();
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }

      exitTargetingMode();
    }, true);

    // ---- 倒计时 / 能量 开关逻辑 ----
    function applyToggleBadge(slot, mode) {
      // 无图片的卡牌不生效
      if (!slot.classList.contains('has-image')) return;
      const hasCountdown = slot.querySelector('.card-badge--countdown');
      const hasEnergy = slot.querySelector('.card-badge--energy');

      if (mode === 'countdown') {
        if (hasCountdown) {
          // 已有倒计时 → 移除（关闭）
          removeCountdownBadge(slot);
        } else {
          // 移除对方徽章（如有），添加倒计时
          removeEnergyBadge(slot);
          slot.appendChild(createCountdownBadge('1'));
        }
      } else { // energy
        if (hasEnergy) {
          // 已有能量 → 移除（关闭）
          removeEnergyBadge(slot);
        } else {
          // 移除对方徽章（如有），添加能量
          removeCountdownBadge(slot);
          slot.appendChild(createEnergyBadge('1'));
        }
      }
      syncSlotToPeer(slot);
      const cardName = slot.querySelector('.card-name').value || '未命名卡牌';
      const userName = localPlayerId ? getPlayerName(localPlayerId) : '玩家';
      const label = mode === 'countdown' ? '倒计时' : '能量';
      broadcastSystemMsg(`【系统】${userName}为「${cardName}」设置了${label}`);
    }

    // ---- 气绝遮罩逻辑 ----
    function createKoOverlay(slot, value) {
      const art = slot.querySelector('.card-art');
      if (!art || art.querySelector('.ko-overlay')) return;
      const overlay = document.createElement('div');
      overlay.className = 'ko-overlay';
      overlay.innerHTML = '<div class="ko-circle"><span class="ko-icon">⏳</span><input type="text" value="' + (value || '1') + '" aria-label="气绝"></div>';
      overlay.querySelector('input').addEventListener('change', () => {
        syncSlotToPeer(slot);
      });
      art.appendChild(overlay);
    }

    function removeKoOverlay(slot) {
      const overlay = slot.querySelector('.ko-overlay');
      if (overlay) overlay.remove();
    }

    function updateKoOverlay(slot, value) {
      if (value) {
        const existing = slot.querySelector('.ko-overlay');
        if (existing) {
          const input = existing.querySelector('input');
          if (input) input.value = value;
        } else {
          createKoOverlay(slot, value);
        }
      } else {
        removeKoOverlay(slot);
      }
    }

    function applyKoToCard(slot) {
      const hadKo = !!slot.querySelector('.ko-overlay');
      if (hadKo) {
        removeKoOverlay(slot);
      } else {
        createKoOverlay(slot, '3');
      }
      syncSlotToPeer(slot);
      const cardName = slot.querySelector('.card-name').value || '未命名卡牌';
      const userName = localPlayerId ? getPlayerName(localPlayerId) : '玩家';
      const verb = hadKo ? '复活了' : '使';
      const suffix = hadKo ? '。' : '进入了气绝。';
      broadcastSystemMsg(`【系统】${userName}${verb}「${cardName}」${suffix}`);
    }

    function applyDamageToPlayer(playerId, dmg) {
      const zone = document.querySelector(`.player-zone[data-player="${playerId}"]`);
      if (!zone) return;
      const hpInput = zone.querySelector('.player-hp-input');
      const currentHp = parseInt(hpInput.value, 10) || 0;
      const newHp = Math.max(0, currentHp - dmg);
      hpInput.value = newHp || '';
      syncPlayerInfo(playerId);
      const dealerName = localPlayerId ? getPlayerName(localPlayerId) : '玩家';
      broadcastSystemMsg(`【系统】${dealerName}对${getPlayerName(playerId)}造成了${dmg}点伤害`);
      // 对方玩家：发送 player-damage 消息
      if (!isMyZone(playerId) && peerConn && peerConn.open) {
        sendToPeer({ type: 'player-damage', playerId, dmg });
      }
    }

    function applyHealToPlayer(playerId, amount) {
      const zone = document.querySelector(`.player-zone[data-player="${playerId}"]`);
      if (!zone) return;
      const hpInput = zone.querySelector('.player-hp-input');
      const currentHp = parseInt(hpInput.value, 10) || 0;
      const newHp = currentHp + amount;
      hpInput.value = newHp || '';
      syncPlayerInfo(playerId);
      const healerName = localPlayerId ? getPlayerName(localPlayerId) : '玩家';
      broadcastSystemMsg(`【系统】${healerName}为${getPlayerName(playerId)}恢复了${amount}点生命`);
      // 对方玩家：发送 player-heal 消息
      if (!isMyZone(playerId) && peerConn && peerConn.open) {
        sendToPeer({ type: 'player-heal', playerId, amount });
      }
    }

    function applyDamageToCard(slot, dmg) {
      const hpInput = slot.querySelector('.card-hp');
      const currentHp = parseInt(hpInput.value, 10) || 0;
      const newHp = Math.max(0, currentHp - dmg);
      hpInput.value = newHp || '';
      const cardName = slot.querySelector('.card-name').value || '未命名卡牌';
      const dealerName = localPlayerId ? getPlayerName(localPlayerId) : '玩家';
      broadcastSystemMsg(`【系统】${dealerName}对「${cardName}」造成了${dmg}点伤害`);
      if (isMyElement(slot)) {
        syncSlotToPeer(slot);
      } else {
        const playerId = slot.dataset.slotPlayer;
        const slotIndex = parseInt(slot.dataset.slotIndex, 10);
        sendToPeer({ type: 'card-damage', playerId, slotIndex, dmg });
      }
    }

    function applyHealToCard(slot, amount) {
      const hpInput = slot.querySelector('.card-hp');
      const currentHp = parseInt(hpInput.value, 10) || 0;
      const newHp = currentHp + amount;
      hpInput.value = newHp || '';
      const cardName = slot.querySelector('.card-name').value || '未命名卡牌';
      const healerName = localPlayerId ? getPlayerName(localPlayerId) : '玩家';
      broadcastSystemMsg(`【系统】${healerName}为「${cardName}」恢复了${amount}点生命`);
      if (isMyElement(slot)) {
        syncSlotToPeer(slot);
      } else {
        const playerId = slot.dataset.slotPlayer;
        const slotIndex = parseInt(slot.dataset.slotIndex, 10);
        sendToPeer({ type: 'card-heal', playerId, slotIndex, amount });
      }
    }

    // ================================================================
    //  JS-5：牌库/手牌系统
    // ================================================================
    let cardIdCounter = 0;
    const playerCards = {
      '1': { deck: [], hand: [] },
      '2': { deck: [], hand: [] },
    };

    const cardTextOverlay = document.getElementById('card-text-dialog-overlay');
    const cardTextTitle = document.getElementById('card-text-dialog-title');
    const cardTextInput = document.getElementById('card-text-dialog-input');
    const cardListOverlay = document.getElementById('card-list-dialog-overlay');
    const cardListTitle = document.getElementById('card-list-dialog-title');
    const cardListBody = document.getElementById('card-list-dialog-body');

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
      const divineBtn = zone.querySelector('.btn-deck[data-action="divine"]');
      if (drawBtn) {
        drawBtn.disabled = deck.length === 0;
      }
      if (shuffleBtn) {
        shuffleBtn.disabled = deck.length === 0;
      }
      if (divineBtn) {
        divineBtn.disabled = deck.length === 0;
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
      const { hand } = getPlayerCardState(playerId);
      cardListBody.innerHTML = '';
      document.getElementById('deck-summary-header').hidden = true; // 隐藏牌库汇总
      if (!hand.length) {
        const empty = document.createElement('div');
        empty.className = 'card-list-empty';
        empty.textContent = '手牌为空';
        cardListBody.appendChild(empty);
        return;
      }
      hand.forEach((card) => {
        const item = document.createElement('div');
        item.className = 'card-list-item';
        // 信息区：名称 + 灵咒标签
        const info = document.createElement('div');
        info.className = 'card-list-item__info';
        if (card.curses && card.curses.length) {
          info.dataset.cardCurses = JSON.stringify(card.curses);
        }
        const name = document.createElement('span');
        name.className = 'card-list-item__name';
        name.textContent = card.name;
        info.appendChild(name);
        // 灵咒标签
        if (card.curses && card.curses.length) {
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
        // 操作按钮
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
        cardListBody.appendChild(item);
      });
    }

    function renderDeckList(playerId) {
      const { deck } = getPlayerCardState(playerId);
      cardListBody.innerHTML = '';
      if (!deck.length) {
        const empty = document.createElement('div');
        empty.className = 'card-list-empty';
        empty.textContent = '牌库为空';
        cardListBody.appendChild(empty);
        return;
      }

      // 统计总览
      const total = deck.length;
      const cursedCount = deck.filter(c => c.curses && c.curses.length).length;

      // 顶栏：总数 + 灵咒提示（渲染到固定区域，不随卡牌列表滚动）
      const summaryEl = document.getElementById('deck-summary-header');
      summaryEl.hidden = false;
      summaryEl.innerHTML = `<span class="deck-summary__total">📚 牌库（共${total}张）</span>`;
      if (cursedCount > 0) {
        summaryEl.innerHTML += `<span class="deck-summary__curse-hint">⚠ 牌库中有灵咒结附（${cursedCount}张）</span>`;
      }

      // 按名称聚合：{ name: { count, cards: [原卡引用], type } }
      const nameMap = new Map();
      deck.forEach(card => {
        const entry = nameMap.get(card.name) || { count: 0, cards: [], type: null };
        entry.count += 1;
        entry.cards.push(card);
        if (!entry.type) {
          const db = CardDB.lookup(card.name);
          entry.type = db ? db.type : 'unknown';
        }
        nameMap.set(card.name, entry);
      });

      // 按类型分组
      const typeOrder = ['shikigami', 'summon', 'spell', 'battle', 'xiezhan', 'form', 'realm', 'curse', 'unknown'];
      const typeNames = { shikigami: '式神', summon: '召唤物', spell: '法术', battle: '战斗', xiezhan: '协战', form: '形态', realm: '幻境', curse: '灵咒', unknown: '其他' };
      const byType = new Map();
      for (const [name, entry] of nameMap) {
        const t = entry.type || 'unknown';
        if (!byType.has(t)) byType.set(t, []);
        byType.get(t).push({ name, count: entry.count, cards: entry.cards });
      }

      // 渲染各类型分组
      for (const type of typeOrder) {
        const entries = byType.get(type);
        if (!entries || !entries.length) continue;
        // 组内按名称排序
        entries.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
        const typeTotal = entries.reduce((sum, e) => sum + e.count, 0);

        const section = document.createElement('div');
        section.className = 'deck-group';

        const sectionHeader = document.createElement('div');
        sectionHeader.className = 'deck-group__header';
        sectionHeader.textContent = `▼ ${typeNames[type] || type}（${typeTotal}）`;
        section.appendChild(sectionHeader);

        entries.forEach(entry => {
          const row = document.createElement('div');
          row.className = 'deck-group__row';

          const nameSpan = document.createElement('span');
          nameSpan.className = 'deck-group__name';
          nameSpan.textContent = entry.name;
          row.appendChild(nameSpan);

          const countSpan = document.createElement('span');
          countSpan.className = 'deck-group__count';
          countSpan.textContent = `×${entry.count}`;
          row.appendChild(countSpan);

          // ➕ 按钮：随机选取该名称的一张牌添加灵咒
          const addBtn = document.createElement('button');
          addBtn.type = 'button';
          addBtn.className = 'btn-card-curse-add';
          addBtn.textContent = '➕';
          addBtn.title = '为牌库中随机一张「' + entry.name + '」添加灵咒';
          addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const pool = entry.cards;
            const target = pool[Math.floor(Math.random() * pool.length)];
            openCursePanel(_curseTargetForCard(playerId, target, '牌库中的'));
          });
          row.appendChild(addBtn);

          section.appendChild(row);
        });

        cardListBody.appendChild(section);
      }
    }

    function openCardListDialog({ title, playerId, type }) {
      cardListContext = { playerId, type };
      cardListTitle.textContent = title;
      if (type === 'hand') renderHandList(playerId);
      else renderDeckList(playerId);
      cardListOverlay.hidden = false;
    }

    function closeCardListDialog() {
      cardListOverlay.hidden = true;
      cardListContext = null;
      cardListBody.innerHTML = '';
    }

    function refreshOpenListDialog(playerId) {
      if (!cardListContext || cardListContext.playerId !== playerId) return;
      if (cardListContext.type === 'hand') renderHandList(playerId);
      else renderDeckList(playerId);
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
      updateDeckButtons(playerId);
      refreshOpenListDialog(playerId);
      syncDeckState(playerId);
      const verb = action === 'use' ? '使用了' : '弃置了';
      broadcastSystemMsg(`【系统】${getPlayerName(playerId)}${verb}「${card.name}」`);

      // 使用幻境牌时，自动添加到幻境/效果面板
      if (action === 'use') {
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
            broadcastSystemMsg(`【系统】${getPlayerName(playerId)}展开了幻境「${dbCard.name}」（耐久${dbCard.durability}）`);
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
      document.getElementById('divine-x-cancel').onclick = () => {
        closeDivineDialog();
      };
      // Enter 键确认
      divineXInput.onkeydown = (e) => {
        if (e.key === 'Enter') document.getElementById('divine-x-confirm').click();
        if (e.key === 'Escape') closeDivineDialog();
      };
    }

    /** 步骤2：取牌库顶X张副本，展示占卜操作界面（不修改真实牌库，确认后才应用） */
    function startDivine(playerId, x) {
      const state = getPlayerCardState(playerId);
      if (!state.deck.length || x < 1) { closeDivineDialog(); return; }
      const clampedX = Math.min(x, state.deck.length);
      // 复制顶部X张（深拷贝，避免引用问题）
      const divineCards = state.deck.slice(0, clampedX).map(c => ({
        id: c.id,
        name: c.name,
        curses: c.curses ? c.curses.map(cur => ({ name: cur.name, layers: cur.layers })) : [],
      }));
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
      closeDivineDialog();
      updateDeckButtons(playerId);
      refreshOpenListDialog(playerId);
      syncDeckState(playerId);
      const topNames = topGroup.map(c => c.name).join('、') || '（无）';
      const bottomNames = bottomGroup.map(c => c.name).join('、') || '（无）';
      broadcastSystemMsg(`【系统】${getPlayerName(playerId)}完成了占卜 —— 牌库顶：[${topNames}]，牌库底：[${bottomNames}]`);
    }

    /** 关闭占卜对话框（取消时仅丢弃上下文，牌库未被修改） */
    function closeDivineDialog() {
      if (divineContext) {
        const playerName = getPlayerName(divineContext.playerId);
        divineContext = null;
        broadcastSystemMsg(`【系统】${playerName}取消了占卜`);
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
    document.getElementById('divine-cancel').addEventListener('click', closeDivineDialog);

    // 不再通过点击遮罩关闭（与其他弹窗行为一致）

    // Esc 关闭
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !divineOverlay.hidden) {
        if (!divineMain.hidden) closeDivineDialog();
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
      if (!isMyZone(playerId)) return; // 权限检查
      const playerName = getPlayerName(playerId);
      switch (action) {
        case 'draw':
          drawCard(playerId);
          break;
        case 'hand':
          openCardListDialog({ title: `${playerName} 的手牌`, playerId, type: 'hand' });
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
          openCardListDialog({ title: `${playerName} 的牌库`, playerId, type: 'deck' });
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

    // 其他 下拉菜单
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
      }
    });

    // ================================================================
    //  式神录 (Shikigami Book)
    // ================================================================
    const shikigamiBookOverlay = document.getElementById('shikigami-book-overlay');
    const shikigamiBookSearch = document.getElementById('shikigami-book-search');
    const shikigamiBookList = document.getElementById('shikigami-book-list');
    const shikigamiBookDetail = document.getElementById('shikigami-book-detail');

    function openShikigamiBook() {
      shikigamiBookOverlay.hidden = false;
      shikigamiBookSearch.value = '';
      shikigamiBookDetail.innerHTML = '<div class="shikigami-book__placeholder">← 点击左侧式神查看详情</div>';
      renderShikigamiList('');
      shikigamiBookSearch.focus();
    }

    function closeShikigamiBook() {
      shikigamiBookOverlay.hidden = true;
      shikigamiBookSearch.value = '';
      shikigamiBookList.innerHTML = '';
    }

    /** 聚合数据：{ 式神名 → { shikigami: cardData, cards: [...], curses: [...] } } */
    function getShikigamiBookData() {
      const allCards = CardDB.getAll();
      // 以式神为键分组
      const map = new Map();
      // 先收集式神
      for (const card of allCards) {
        if (card.type === 'shikigami') {
          map.set(card.name, { shikigami: card, cards: [], curses: [] });
        }
      }
      // 归类其他牌
      for (const card of allCards) {
        if (card.type === 'shikigami') continue;
        if (card.type === 'curse') {
          if (card.owner && map.has(card.owner)) {
            map.get(card.owner).curses.push(card);
          } else {
            // 无归属灵咒
            if (!map.has('__orphan__')) map.set('__orphan__', { shikigami: null, cards: [], curses: [] });
            map.get('__orphan__').curses.push(card);
          }
        } else {
          if (card.owner && map.has(card.owner)) {
            map.get(card.owner).cards.push(card);
          } else {
            if (!map.has('__orphan__')) map.set('__orphan__', { shikigami: null, cards: [], curses: [] });
            map.get('__orphan__').cards.push(card);
          }
        }
      }
      return map;
    }

    /** 渲染左侧式神列表 */
    function renderShikigamiList(filter) {
      const data = getShikigamiBookData();
      shikigamiBookList.innerHTML = '';
      const filterLower = filter.trim().toLowerCase();

      // 按名称排序
      const entries = [...data.entries()].sort((a, b) => {
        const nameA = a[0] === '__orphan__' ? '无归属' : a[0];
        const nameB = b[0] === '__orphan__' ? '无归属' : b[0];
        return nameA.localeCompare(nameB, 'zh');
      });

      let hasResults = false;
      for (const [key, entry] of entries) {
        const displayName = key === '__orphan__' ? '无归属' : key;
        if (filterLower && !displayName.toLowerCase().includes(filterLower)) continue;
        hasResults = true;

        const item = document.createElement('div');
        item.className = 'shikigami-book__item';
        if (key === '__orphan__') item.classList.add('shikigami-book__item--orphan');
        const total = entry.cards.length + entry.curses.length;
        item.textContent = displayName + (total > 0 ? ` (${total})` : '');
        item.addEventListener('click', () => {
          // 高亮当前
          shikigamiBookList.querySelectorAll('.shikigami-book__item--active').forEach(el => el.classList.remove('shikigami-book__item--active'));
          item.classList.add('shikigami-book__item--active');
          renderShikigamiDetail(key, entry);
        });
        shikigamiBookList.appendChild(item);
      }

      if (!hasResults) {
        const empty = document.createElement('div');
        empty.className = 'card-list-empty';
        empty.textContent = '无匹配式神';
        empty.style.padding = '16px 8px';
        shikigamiBookList.appendChild(empty);
      }
    }

    /** 渲染右侧卡牌详情 */
    function renderShikigamiDetail(key, entry) {
      shikigamiBookDetail.innerHTML = '';
      const displayName = key === '__orphan__' ? '无归属' : key;

      // 标题
      const title = document.createElement('div');
      title.className = 'shikigami-book__shikigami-name';
      title.textContent = displayName;
      shikigamiBookDetail.appendChild(title);

      // 式神本体
      if (entry.shikigami) {
        shikigamiBookDetail.appendChild(createBookCardEntry(entry.shikigami));
      }

      // 所属卡牌（排序：按类型再按名称）
      const sortedCards = [...entry.cards].sort((a, b) => {
        const typeOrder = { spell: 0, battle: 1, xiezhan: 2, form: 3, summon: 4, realm: 5 };
        const ta = typeOrder[a.type] ?? 5;
        const tb = typeOrder[b.type] ?? 5;
        if (ta !== tb) return ta - tb;
        return a.name.localeCompare(b.name, 'zh');
      });
      for (const card of sortedCards) {
        shikigamiBookDetail.appendChild(createBookCardEntry(card));
      }

      // 灵咒
      const sortedCurses = [...entry.curses].sort((a, b) => a.name.localeCompare(b.name, 'zh'));
      for (const card of sortedCurses) {
        shikigamiBookDetail.appendChild(createBookCardEntry(card));
      }

      if (!entry.shikigami && sortedCards.length === 0 && sortedCurses.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'card-list-empty';
        empty.textContent = '暂无卡牌';
        shikigamiBookDetail.appendChild(empty);
      }
    }

    /** 创建单张卡牌的条目 */
    function createBookCardEntry(card) {
      const typeNames = { shikigami: '式神', summon: '召唤物', spell: '法术', battle: '战斗', xiezhan: '协战', form: '形态', realm: '幻境', curse: '灵咒' };
      const typeCN = typeNames[card.type] || card.type;

      const entry = document.createElement('div');
      entry.className = 'shikigami-book__card-entry';

      // 头部：名称 + 类型标签 + 附加标签
      const head = document.createElement('div');
      head.className = 'shikigami-book__card-head';

      const nameEl = document.createElement('span');
      nameEl.className = 'shikigami-book__card-name';
      nameEl.textContent = card.name;
      head.appendChild(nameEl);

      const typeEl = document.createElement('span');
      typeEl.className = 'shikigami-book__card-type sbt--' + card.type;
      typeEl.textContent = typeCN;
      head.appendChild(typeEl);

      // 标签
      if (card.awakened || card.derivative) {
        const tags = document.createElement('span');
        tags.className = 'shikigami-book__card-tags';
        if (card.awakened) {
          const t = document.createElement('span');
          t.className = 'shikigami-book__tag sbtag--awakened';
          t.textContent = '觉醒';
          tags.appendChild(t);
        }
        if (card.derivative) {
          const t = document.createElement('span');
          t.className = 'shikigami-book__tag sbtag--derivative';
          t.textContent = '衍生物';
          tags.appendChild(t);
        }
        head.appendChild(tags);
      }

      entry.appendChild(head);

      // 属性
      const stats = document.createElement('div');
      stats.className = 'shikigami-book__card-stats';
      let statsHTML = '';
      switch (card.type) {
        case 'shikigami':
        case 'summon':
          if (card.faction) statsHTML += `<span>🎌 ${card.faction}</span>`;
          statsHTML += `<span>⚔ 攻击:${card.attack}</span>`;
          statsHTML += `<span>❤ 生命:${card.hp}</span>`;
          break;
        case 'spell':
          if (card.level) statsHTML += `<span>⭐ Lv.${card.level}</span>`;
          if (card.atkBonus > 0) statsHTML += `<span>⚔ +${card.atkBonus}</span>`;
          if (card.hpBonus > 0) statsHTML += `<span>❤ +${card.hpBonus}</span>`;
          break;
        case 'battle':
        case 'xiezhan':
          if (card.level) statsHTML += `<span>⭐ Lv.${card.level}</span>`;
          if (card.atkBonus > 0) statsHTML += `<span>⚔ +${card.atkBonus}</span>`;
          if (card.shieldBonus > 0) statsHTML += `<span>🛡 +${card.shieldBonus}</span>`;
          break;
        case 'form':
          if (card.level) statsHTML += `<span>⭐ Lv.${card.level}</span>`;
          statsHTML += `<span>⚔ 攻击:${card.attack}</span>`;
          statsHTML += `<span>❤ 生命:${card.hp}</span>`;
          break;
        case 'realm':
          if (card.level) statsHTML += `<span>⭐ Lv.${card.level}</span>`;
          statsHTML += `<span>🔮 耐久:${card.durability}</span>`;
          break;
      }
      stats.innerHTML = statsHTML;
      entry.appendChild(stats);

      // 效果/能力
      const effectText = card.effect || card.ability || '';
      if (effectText) {
        const effect = document.createElement('div');
        effect.className = 'shikigami-book__card-effect';
        effect.textContent = effectText;
        entry.appendChild(effect);
      }

      return entry;
    }

    // 事件绑定
    document.getElementById('shikigami-book-close').addEventListener('click', closeShikigamiBook);
    shikigamiBookOverlay.addEventListener('click', (e) => {
      if (e.target === shikigamiBookOverlay) closeShikigamiBook();
    });
    shikigamiBookSearch.addEventListener('input', () => {
      renderShikigamiList(shikigamiBookSearch.value);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !shikigamiBookOverlay.hidden) closeShikigamiBook();
    });

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
      const state = {
        version: APP_VERSION,
        time: new Date().toISOString(),
        player1: {
          name: getPlayerInfo('1').name,
          hp: getPlayerInfo('1').hp,
          avatar: _getAvatarSrc('1'),
          fire: playerFire['1'],
          effects: getEffectsState('1'),
          deck: getPlayerCardState('1').deck,
          hand: getPlayerCardState('1').hand,
          slots: [],
        },
        player2: {
          name: getPlayerInfo('2').name,
          hp: getPlayerInfo('2').hp,
          avatar: _getAvatarSrc('2'),
          fire: playerFire['2'],
          effects: getEffectsState('2'),
          deck: getPlayerCardState('2').deck,
          hand: getPlayerCardState('2').hand,
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

    function _restoreGameState(state) {
      slotSyncSuppress = true; // 批量恢复时抑制逐张同步
      ['1', '2'].forEach(pid => {
        const p = state['player' + pid];
        if (!p) return;
        const zone = document.querySelector(`.player-zone[data-player="${pid}"]`);
        if (p.name) { const ni = zone.querySelector('.player-name-input'); if (ni) ni.value = p.name; }
        if (p.hp) { const hi = zone.querySelector('.player-hp-input'); if (hi) hi.value = p.hp; }
        if (p.avatar) setAvatarImage(pid, p.avatar);
        if (p.fire !== undefined) { playerFire[pid] = p.fire; applyRemoteFireState(pid, p.fire); }
        if (p.effects) applyRemoteEffectsState(pid, p.effects);
        if (p.deck) getPlayerCardState(pid).deck = p.deck;
        if (p.hand) getPlayerCardState(pid).hand = p.hand;
        if (p.slots) {
          p.slots.forEach((s, i) => {
            const slot = getSlotByIndex(pid, i);
            if (slot) setSlotState(slot, s);
          });
        }
        updateDeckButtons(pid);
      });
      slotSyncSuppress = false;

      // 联机状态下，将恢复的全部状态同步给对方和观众
      if (peerConn && peerConn.open) {
        ['1', '2'].forEach(pid => {
          // 玩家信息
          const info = getPlayerInfo(pid);
          sendToPeer({ type: 'player-info', playerId: pid, name: info.name, hp: info.hp });
          // 效果面板
          sendToPeer({ type: 'effects-update', playerId: pid, effects: getEffectsState(pid) });
          // 牌库/手牌计数
          const cards = getPlayerCardState(pid);
          sendToPeer({ type: 'deck-update', playerId: pid, deckCount: cards.deck.length, handCount: cards.hand.length });
          // 鬼火
          sendToPeer({ type: 'fire-update', playerId: pid, count: playerFire[pid] });
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
