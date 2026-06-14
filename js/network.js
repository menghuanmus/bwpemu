// ================================================================
//  js/network.js — PeerJS 联机系统 (JS-1)
//  房间创建/加入、P2P 连接管理、心跳保活、断线重连、状态同步
//  依赖: PeerJS (CDN), CardDB, 各模块的状态读写函数
// ================================================================

    //  JS-1：PeerJS 联机系统 —— 房间管理
    // ================================================================

    /* 连接配置 */
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
      try {
        if (peerConn && peerConn.open) {
          peerConn.send(data);
        }
        if (specConns && specConns.length) {
          specConns.forEach(c => { if (c.open) c.send(data); });
        }
      } catch(e) {
        console.error('[SendToPeer] 发送失败:', e);
      }
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
          applyRemoteDeckState(data.playerId, data.deckCount, data.handCount, data.deckData, data.handData);
          break;
        case 'revealed-cards':
          // 静默存储对方的揭示记录（用于存档完整性，不用于本机显示）
          if (data.playerId && Array.isArray(data.cardIds) && typeof playerRevealedCards !== 'undefined') {
            playerRevealedCards[data.playerId] = new Set(data.cardIds.filter(id => typeof id === 'number'));
          }
          break;
        case 'food-card-register':
          // 接收对方合成的佳肴定义，注册到本地CardDB使悬浮可见
          if (data.card && typeof CardDB !== 'undefined' && typeof CardDB.addCustom === 'function') {
            CardDB.addCustom(data.card);
          }
          break;
        case 'bounty-update':
          if (typeof applyRemoteBounty === 'function') {
            applyRemoteBounty(data.playerId, data.amount);
          }
          break;
        case 'bounty-toggle':
          if (typeof applyRemoteBountyToggle === 'function') {
            applyRemoteBountyToggle(data.playerId, data.active);
          }
          break;
        case 'oracle-update':
          if (typeof applyRemoteOracle === 'function') {
            applyRemoteOracle(data);
          }
          break;
        case 'shop-update':
          if (typeof applyRemoteShop === 'function') {
            applyRemoteShop(data);
          }
          break;
        case 'chat':
          addChatMessage(data.playerId, data.text, data.senderName);
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
        case 'sysmsg-group':
          if (data.mainMsg && Array.isArray(data.subMsgs) && typeof _renderGroupedMessage === 'function') {
            _renderGroupedMessage({ mainMsg: data.mainMsg, subMsgs: data.subMsgs });
          }
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
        case 'spec-assign':
          // 房主分配观众编号
          if (isSpectator && data.specNum) {
            spectatorNameCounter = data.specNum;
            const specInput = document.getElementById('spectator-name-input');
            if (specInput && !spectatorCustomName) {
              specInput.value = '观众' + data.specNum;
            }
          }
          break;
        case 'spec-loaded':
          // 观众收到：对局数据加载完成
          if (isSpectator) {
            setConnStatus(true, '观战中');
            addSystemChatMessage('【系统】✅ 对局数据加载完成');
            addSystemChatMessage('【系统】💡 提示：观战模式下仅可投骰子、保存对局和发言');
          }
          break;
        case 'room-full':
          // 加入者收到：房间已满，自动切换为观战模式
          if (!isSpectator) {
            isSpectator = true;
            localPlayerId = '0';
            const num = data.specNum || 1;
            spectatorNameCounter = num;
            const specInput = document.getElementById('spectator-name-input');
            if (specInput) { specInput.value = '观众' + num; spectatorCustomName = ''; }
            addSystemChatMessage('【系统】房间已满，自动切换为观战模式（观众' + num + '）');
            applyPermissionLock();
            sendToPeer({ type: 'spec-ready' });
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
        case 'cook-effect':
          // 对手/观众触发烹饪动画
          if (typeof DamageEffects !== 'undefined' && DamageEffects.playCookEffect) {
            const zone = document.querySelector(`.player-zone[data-player="${data.playerId}"]`);
            if (zone) {
              const slot = zone.querySelector(`.card-slot[data-slot-index="${data.slotIndex}"]`);
              if (slot) DamageEffects.playCookEffect(slot);
            }
          }
          break;
        case 'nightfall-toggle':
          if (typeof applyRemoteNightfall === 'function') {
            applyRemoteNightfall(data.playerId, data.active, data.value);
          }
          break;
        case 'nightfall-value':
          if (typeof applyRemoteNightfall === 'function') {
            applyRemoteNightfall(data.playerId, true, data.value);
          }
          break;
        case 'fx-ko':
          {
            const slot = getSlotByIndex(data.playerId, data.slotIndex);
            if (slot && typeof DamageEffects !== 'undefined' && DamageEffects.playKoEffect) {
              DamageEffects.playKoEffect(slot);
            }
          }
          break;
        case 'fx-revive':
          {
            const slot = getSlotByIndex(data.playerId, data.slotIndex);
            if (slot && typeof DamageEffects !== 'undefined' && DamageEffects.playReviveEffect) {
              DamageEffects.playReviveEffect(slot, null);
            }
          }
          break;
        case 'fx-anim':
          if (data.anim && typeof CardFlight !== 'undefined' && typeof CardFlight.playRemoteAnim === 'function') {
            CardFlight.playRemoteAnim(data.anim);
          }
          break;
        default:
          console.log('[Peer] 未知消息类型:', data.type);
      }
    }

    // ---- 远端动画播放器（消息由 broadcastSystemMsg/sysmsg 同步，此处只播动画） ----

    function applyRemoteCardDamage(playerId, slotIndex, dmg) {
      const slot = getSlotByIndex(playerId, slotIndex);
      if (!slot) return;
      if (typeof DamageEffects !== 'undefined') {
        DamageEffects.playDamage(slot, dmg, 'damage');
      }
    }

    function applyRemoteCardHeal(playerId, slotIndex, amount) {
      const slot = getSlotByIndex(playerId, slotIndex);
      if (!slot) return;
      if (typeof DamageEffects !== 'undefined') {
        DamageEffects.playDamage(slot, amount, 'heal');
      }
    }

    function applyRemotePlayerHeal(playerId, amount) {
      const zone = document.querySelector(`.player-zone[data-player="${playerId}"]`);
      if (!zone) return;
      if (typeof DamageEffects !== 'undefined') {
        const avatar = zone.querySelector('.player-avatar');
        const targetEl = avatar || zone;
        DamageEffects.playDamage(targetEl, amount, 'heal');
      }
    }

    function applyRemotePlayerDamage(playerId, dmg) {
      const zone = document.querySelector(`.player-zone[data-player="${playerId}"]`);
      if (!zone) return;
      if (typeof DamageEffects !== 'undefined') {
        const avatar = zone.querySelector('.player-avatar');
        const targetEl = avatar || zone;
        DamageEffects.playDamage(targetEl, dmg, 'damage');
      }
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
      // 防御：若 localPlayerId 未初始化（极端时序情况），回退为允许操作
      // CSS 的 player-zone--locked + pointer-events:none 已提供第二层保护
      if (!localPlayerId) return true;
      return String(playerId) === String(localPlayerId);
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
          zone.setAttribute('data-locked', 'all'); // 触发CSS全面锁定
          zone.querySelectorAll('input, textarea, button, select').forEach(el => {
            el.setAttribute('data-locked', 'true');
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') { el.readOnly = true; el.style.opacity = '0.6'; }
            else { el.disabled = true; el.style.opacity = '0.4'; el.style.cursor = 'not-allowed'; }
          });
        });
        // 锁定中心栏：下拉框可展开，内部仅保存对局可用
        const centerBar = document.querySelector('.center-dice-bar');
        if (centerBar) {
          centerBar.querySelectorAll('button, input').forEach(el => {
            const id = el.id || '';
            const action = el.dataset.action || '';
            // 允许：骰子投掷/输入、发言、观众名称、下拉切换按钮（机制/其他）
            const isToggle = el.classList.contains('btn-mechanic-toggle')
              || el.classList.contains('btn-dropdown-toggle');
            const allowed = /btn-dice-roll|dice-min|dice-max|btn-speak-unified|spectator-name-input/.test(id)
              || action === 'save-game'
              || isToggle;
            if (!allowed) {
              el.disabled = true;
              el.setAttribute('data-locked', 'true');
              el.style.opacity = '0.4';
              el.style.cursor = 'not-allowed';
            }
          });
        }
        // 机制/其他下拉菜单内的按钮也全体禁用（除保存）
        document.querySelectorAll('.dropdown-mechanic__item, .dropdown-other__item').forEach(el => {
          const action = el.dataset.action || '';
          if (action !== 'save-game') {
            el.disabled = true;
            el.setAttribute('data-locked', 'true');
            el.style.opacity = '0.4';
            el.style.cursor = 'not-allowed';
          }
        });
        // 隐藏对手标签，显示观众标签
        if (tagYour) tagYour.hidden = true;
        if (tagOpp) tagOpp.hidden = true;
        if (specRow) specRow.hidden = false;
        return;
      }

      const opponentId = localPlayerId === '1' ? '2' : '1';
      const opponentZone = document.querySelector(`.player-zone[data-player="${opponentId}"]`);
      if (opponentZone) {
        opponentZone.classList.add('player-zone--locked');
        // 牌库按钮不再禁用，双方均可操作对方牌库/手牌
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
      applyPermissionLock();
      if (isSpectator) {
        setConnStatus(true, '⏳ 正在加载对局数据…');
        addSystemChatMessage('【系统】👁 已进入观战模式，正在加载对局数据…');
        // 向房主请求完整对局状态
        sendToPeer({ type: 'spec-ready' });
      } else {
        setConnStatus(true, '已连接');
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
          // 第一个连接 = 对手（玩家二）
          console.log('[Peer] 对手已连接');
          peerConn = conn;
          isHost = true;
          localPlayerId = '1';
          setupPeerConnection();
        } else {
          // 后续连接 = 观众（房间已满，告知对方转为观战）
          console.log('[Peer] 观众已连接（房间已满）');
          specConns.push(conn);
          setupSpectatorConnection(conn);
          // 分配观众编号
          const specNum = specConns.length;
          broadcastSystemMsg('【系统】观众' + specNum + '进入了房间');
          // 告知对方房间已满，转为观战模式，并分配编号
          const handshake = { type: 'room-full', specNum: specNum };
          if (conn.open) {
            conn.send(handshake);
          } else {
            conn.on('open', () => conn.send(handshake));
          }
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
      // 绑定 data 处理器
      conn.on('data', (data) => {
        if (!data || typeof data !== 'object') return;
        if (data.type === 'ping') { conn.send({ type: 'pong' }); return; }
        if (data.type === 'pong') return;
        // 观众请求完整状态 → 立即响应
        if (data.type === 'spec-ready') {
          console.log('[Peer] 观众请求完整状态，开始同步…');
          // 分配观众编号
          const specNum = specConns.indexOf(conn) + 1;
          conn.send({ type: 'spec-assign', specNum: specNum });
          syncFullStateToConn(conn);
          // 通知观众加载完成
          setTimeout(() => {
            if (conn.open) conn.send({ type: 'spec-loaded' });
          }, 600);
          return;
        }
        // 观众发言：转发给对手和所有其他观众
        if (data.type === 'chat') {
          const sName = data.senderName || ('观众' + (specConns.indexOf(conn) + 1));
          addChatMessage('0', data.text, sName);
          if (peerConn && peerConn.open) peerConn.send(data);
          // 转发给所有其他观众
          specConns.forEach(c => { if (c !== conn && c.open) c.send(data); });
          return;
        }
        // 观众改名：房主也更新，并转发给对手和所有其他观众
        if (data.type === 'spec-name') {
          if (data.name) {
            spectatorCustomName = data.name;
            const specInput = document.getElementById('spectator-name-input');
            if (specInput) specInput.value = data.name;
          }
          if (peerConn && peerConn.open) peerConn.send(data);
          // 转发给所有其他观众
          specConns.forEach(c => { if (c !== conn && c.open) c.send(data); });
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
        // 卡牌槽
        document.querySelectorAll(`.player-zone[data-player="${pid}"] .card-slot`).forEach(slot => {
          const state = getSlotState(slot);
          conn.send({ type: 'slot-update', playerId: pid, slotIndex: parseInt(slot.dataset.slotIndex, 10), state });
        });
        // 牌库/手牌（发送占位数据维持计数）
        const cards = getPlayerCardState(pid);
        const dummies = (arr) => arr.map(c => ({ id: c.id, name: '未知', curses: c.curses || [] }));
        conn.send({ type: 'deck-update', playerId: pid, deckCount: cards.deck.length, handCount: cards.hand.length, deckData: dummies(cards.deck), handData: dummies(cards.hand) });
        // 效果/幻境
        conn.send({ type: 'effects-update', playerId: pid, effects: getEffectsState(pid) });
        // 玩家信息
        const info = getPlayerInfo(pid);
        conn.send({ type: 'player-info', playerId: pid, name: info.name, hp: info.hp });
        conn.send({ type: 'fire-update', playerId: pid, count: playerFire[pid] });
        // 赏金
        if (typeof playerBounty !== 'undefined') {
          conn.send({ type: 'bounty-update', playerId: pid, amount: playerBounty[pid] || 0 });
          // 若赏金图标已激活，也同步切换状态
          const bzone = document.querySelector(`.player-zone[data-player="${pid}"]`);
          if (bzone && bzone.querySelector('.bounty-indicator')) {
            conn.send({ type: 'bounty-toggle', playerId: pid, active: true });
          }
        }
        // 入夜状态
        const nightEl = document.querySelector(`.player-zone[data-player="${pid}"] .nightfall-indicator`);
        if (nightEl) {
          const nightInput = nightEl.querySelector('.nightfall-input');
          conn.send({ type: 'nightfall-toggle', playerId: pid, active: true, value: nightInput ? nightInput.value : '0' });
        }
        // 头像
        const avatarImg = document.querySelector(`.player-avatar[data-avatar-player="${pid}"] img`);
        if (avatarImg && avatarImg.src) {
          conn.send({ type: 'avatar-update', playerId: pid, imageSrc: avatarImg.src });
        }
        // 商店
        const shop = (typeof getShop === 'function') ? getShop(pid) : null;
        if (shop) {
          const stocks = {};
          if (typeof playerCardStocks !== 'undefined' && playerCardStocks[pid]) {
            for (const [name, s] of Object.entries(playerCardStocks[pid])) stocks[name] = s;
          }
          conn.send({ type: 'shop-update', playerId: pid, level: shop.level, products: (shop.products||[]).map(p=>({name:p.cardDef.name,stock:p.stock,price:p.price,bought:p.bought})), upgradeProgress: shop.upgradeProgress, upgradeNeeded: shop.upgradeNeeded, refreshCost: shop.refreshCost, slotCount: shop.slotCount, cardStocks: stocks });
        }
        // 启悟
        if (typeof oracleActive !== 'undefined') {
          conn.send({ type: 'oracle-update', playerId: pid, active: oracleActive[pid] || false, cards: (oracleHands[pid]||[]).map(c=>({id:c.id,name:'未知',curses:c.curses||[]})) });
        }
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
      ROOM_HOME.hidden = true;
      ROOM_WAITING.hidden = true;
      document.getElementById('room-joining').hidden = false;
      // 预设观众名称（等待房主分配编号后更新）
      const specInput = document.getElementById('spectator-name-input');
      if (specInput) { specInput.value = '观众'; spectatorCustomName = ''; }

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
      // 先绑定 data 处理器（必须在 onPeerConnected 之前，避免竞态丢失消息）
      peerConn.on('data', (data) => {
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
          if (localPlayerId) { attemptReconnect(); }
        } else {
          peerLeft = true;
          setConnStatus(false, '房主已退出');
          addSystemChatMessage('【系统】房主已退出房间，可返回主界面重新创建或加入');
        }
      });

      peerConn.on('error', (err) => {
        console.error('[Peer] 数据通道错误:', err);
        stopHeartbeat();
        setConnStatus(false, '通信错误');
      });

      // 若数据通道已打开，立即初始化；否则等待 open 事件
      if (peerConn.open) {
        console.log('[Peer] 数据通道已就绪（已打开）');
        addSystemChatMessage('【系统】连接已建立');
        reconnectAttempts = 0;
        startHeartbeat();
        onPeerConnected();
      } else {
        peerConn.on('open', () => {
          clearJoinTimeout();
          console.log('[Peer] 数据通道已建立');
          addSystemChatMessage('【系统】连接已建立' + (peerConn._dc && peerConn._dc._channel ? '（WebRTC 数据通道）' : ''));
          reconnectAttempts = 0;
          startHeartbeat();
          onPeerConnected();
        });
      }
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
