// ================================================================
//  js/auth.js — Socket.IO 客户端：登录/注册/大厅/游戏通信
// ================================================================

(function() {
  'use strict';

  const SVR_URL = 'https://bwpemu.top';
  const TK_KEY = 'bwpemu_token';
  const UN_KEY = 'bwpemu_username';
  const NN_KEY = 'bwpemu_nickname';

  var socket = null;
  var roomRefreshTimer = null;

  // DOM
  var $ = function(id) { return document.getElementById(id); };
  var AUTH_VIEW = $('auth-view'), LOGIN_PANEL = $('login-panel'), REG_PANEL = $('register-panel');
  var LOBBY_VIEW = $('lobby-view'), GAME_VIEW = $('game-view');
  var LOADING_EL = $('auth-loading'), LOADING_TXT = $('auth-loading-text');

  // ═══ 工具 ═══
  function showLoading(txt) { LOADING_TXT.textContent = txt || '连接中…'; LOADING_EL.classList.add('active'); }
  function hideLoading() { LOADING_EL.classList.remove('active'); }
  function setBtn(btn, loading) { btn.disabled = loading; btn.classList.toggle('loading', loading); }

  function showView(view) {
    [AUTH_VIEW, LOBBY_VIEW, GAME_VIEW].forEach(function(v) { v.classList.remove('active'); });
    view.classList.add('active');
  }

  function showAuth(reg) {
    showView(AUTH_VIEW);
    LOGIN_PANEL.hidden = reg; REG_PANEL.hidden = !reg;
    $('login-error').textContent = ''; $('reg-error').textContent = '';
    if (!reg) $('login-username').focus(); else $('reg-username').focus();
  }

  // ═══ 鼠标光晕（登录/大厅） ═══
  document.addEventListener('mousemove', function(e) {
    var av = $('auth-cursor-aura'), lv = $('lobby-cursor-aura');
    if (av && AUTH_VIEW.classList.contains('active')) { av.style.left = e.clientX + 'px'; av.style.top = e.clientY + 'px'; }
    if (lv && LOBBY_VIEW.classList.contains('active')) { lv.style.left = e.clientX + 'px'; lv.style.top = e.clientY + 'px'; }
  });

  // ═══ Socket.IO 连接 ═══
  function connect() {
    if (socket && socket.connected) return;
    if (socket) { socket.disconnect(); socket = null; }
    socket = io(SVR_URL, { path: '/ws/socket.io', transports: ['websocket', 'polling'], reconnection: true, reconnectionDelay: 1000, reconnectionAttempts: Infinity });
    window._gameSocket = socket;
  }

  // ═══ 登录 ═══
  $('login-btn').addEventListener('click', function() {
    var uname = $('login-username').value.trim(), pw = $('login-password').value;
    if (!uname || !pw) { $('login-error').textContent = '请填写用户名和密码'; return; }
    setBtn($('login-btn'), true); showLoading('正在登录…');
    connect();
    socket.emit('login', { username: uname, password: pw }, function(res) {
      hideLoading(); setBtn($('login-btn'), false);
      if (res.error) { $('login-error').textContent = res.error; return; }
      localStorage.setItem(TK_KEY, res.token); localStorage.setItem(UN_KEY, res.username); localStorage.setItem(NN_KEY, res.nickname);
      window._gameUsername = res.username; window._gameNickname = res.nickname;
      showLobby(res.nickname);
    });
  });
  $('login-password').addEventListener('keydown', function(e) { if (e.key === 'Enter') $('login-btn').click(); });

  // ═══ 注册 ═══
  $('reg-btn').addEventListener('click', function() {
    var uname = $('reg-username').value.trim(), nn = $('reg-nickname').value.trim() || uname, pw = $('reg-password').value;
    if (!uname || !pw) { $('reg-error').textContent = '请填写用户名和密码'; return; }
    if (pw.length < 4) { $('reg-error').textContent = '密码不能少于 4 位'; return; }
    setBtn($('reg-btn'), true); showLoading('正在注册…');
    connect();
    socket.emit('register', { username: uname, nickname: nn, password: pw }, function(res) {
      hideLoading(); setBtn($('reg-btn'), false);
      if (res.error) { $('reg-error').textContent = res.error; return; }
      localStorage.setItem(TK_KEY, res.token); localStorage.setItem(UN_KEY, res.username); localStorage.setItem(NN_KEY, res.nickname);
      window._gameUsername = res.username; window._gameNickname = res.nickname;
      showLobby(res.nickname);
    });
  });
  $('reg-password').addEventListener('keydown', function(e) { if (e.key === 'Enter') $('reg-btn').click(); });

  $('show-register-link').addEventListener('click', function(e) { e.preventDefault(); showAuth(true); });
  $('show-login-link').addEventListener('click', function(e) { e.preventDefault(); showAuth(false); });

  // ═══ 大厅 ═══
  function showLobby(nickname) {
    showView(LOBBY_VIEW);
    var uname = localStorage.getItem(UN_KEY) || '';
    $('lobby-nickname').textContent = nickname;
    $('lobby-avatar').innerHTML = ''; $('lobby-avatar').textContent = nickname.charAt(0).toUpperCase();
    $('lobby-username').textContent = '@' + uname;
    $('lobby-error').textContent = ''; setBtn($('lobby-create-btn'), false); setBtn($('lobby-join-btn'), false);
    $('profile-avatar').innerHTML = ''; $('profile-avatar').textContent = nickname.charAt(0).toUpperCase();
    $('profile-nickname').value = nickname;
    ['nickname','pw'].forEach(function(k) { $('profile-' + k + '-msg').textContent = ''; $('profile-' + k + '-msg').className = 'profile-msg'; });
    $('profile-old-pw').value = ''; $('profile-new-pw').value = '';
    loadSavedAvatar();
    switchLobbyTab('hall');
    refreshRoomList();
  }

  function loadSavedAvatar() {
    var key = 'bwpemu_avatar_' + (localStorage.getItem(UN_KEY) || ''), saved = localStorage.getItem(key);
    if (saved) { $('lobby-avatar').innerHTML = '<img src="' + saved + '" alt="">'; $('profile-avatar').innerHTML = '<img src="' + saved + '" alt="">'; }
  }

  function refreshRoomList() {
    if (!socket) return;
    socket.emit('list-rooms', {}, function(res) { if (res && res.rooms) renderRoomList(res.rooms); });
    if (roomRefreshTimer) clearTimeout(roomRefreshTimer);
    roomRefreshTimer = setTimeout(refreshRoomList, 10000);
  }

  function renderRoomList(rooms) {
    var listEl = $('room-list'), emptyEl = $('room-list-empty');
    if (!listEl) return;
    if (!rooms || !rooms.length) { if (emptyEl) emptyEl.style.display = ''; listEl.innerHTML = ''; return; }
    if (emptyEl) emptyEl.style.display = 'none';
    var myUname = localStorage.getItem(UN_KEY) || '';
    // 可重连的房间置顶
    rooms.sort(function(a, b) {
      var aMine = a.players.some(function(p) { return p.offline && p.username === myUname; });
      var bMine = b.players.some(function(p) { return p.offline && p.username === myUname; });
      if (aMine && !bMine) return -1;
      if (!aMine && bMine) return 1;
      return 0;
    });
    var html = '';
    rooms.forEach(function(r) {
      var online = r.onlineCount || r.players.filter(function(p) { return !p.offline; }).length;
      var full = online >= 2;
      var myOffline = r.players.some(function(p) { return p.offline && p.username === myUname; });
      var allOffline = online === 0;
      var status = r.solo ? '单人' : (full ? '对战中' : (myOffline ? '可重连' : (allOffline ? '空闲' : '等待中')));
      var statusCls = full ? 'playing' : 'waiting';
      html += '<div class="room-list-item" data-room="' + r.room + '">' +
        '<span class="room-list-code">' + r.room + '</span>' +
        '<div class="room-list-info"><span class="room-list-status ' + statusCls + '">' + status + '</span>' +
        '<span class="room-list-players">' + online + '/2 ' + r.players.map(function(p) { return p.nickname + (p.offline ? '（断线）' : ''); }).join('、') + '</span></div>' +
        '<div class="room-list-actions">';
      if (!r.solo) {
        if (myOffline) html += '<button class="room-list-join-btn" data-room="' + r.room + '">重连</button>';
        else if (allOffline) html += '<button class="room-list-join-btn" data-room="' + r.room + '">加入</button>';
        else if (!full) html += '<button class="room-list-join-btn" data-room="' + r.room + '">加入</button>';
      }
      html += '<button class="room-list-spec-btn" data-room="' + r.room + '">观战</button></div></div>';
    });
    listEl.innerHTML = html;
    listEl.querySelectorAll('.room-list-join-btn').forEach(function(b) { b.onclick = function() { lobbyJoin(b.dataset.room, false); }; });
    listEl.querySelectorAll('.room-list-spec-btn').forEach(function(b) { b.onclick = function() { lobbyJoin(b.dataset.room, true); }; });
  }

  function lobbyJoin(code, asSpec) {
    setBtn($('lobby-join-btn'), true); $('lobby-error').textContent = '';
    if (asSpec) { isSpectator = true; isHost = false; localPlayerId = '0'; }
    var evt = asSpec ? 'spectate-room' : 'join-room';
    socket.emit(evt, { room: code }, function(res) {
      if (!res) { $('lobby-error').textContent = '服务端无响应'; setBtn($('lobby-join-btn'), false); return; }
      if (res.error) { $('lobby-error').textContent = res.error; setBtn($('lobby-join-btn'), false); return; }
      if (res.state && typeof applyFullState === 'function') applyFullState(res.state);
      if (res.joined || res.spectating) enterGame(res);
    });
  }

  // ═══ 单人模式 ═══
  $('lobby-solo-btn').addEventListener('click', function() {
    setBtn($('lobby-solo-btn'), true);
    socket.emit('create-solo', {}, function(res) {
      if(res.error) { $('lobby-error').textContent = res.error; setBtn($('lobby-solo-btn'), false); return; }
      if(res.ok || res.solo) enterGame({ solo: res.solo || res.ok, slot: '1' });
    });
  });

  // ═══ 创建房间 ═══
  $('lobby-create-btn').addEventListener('click', function() {
    setBtn($('lobby-create-btn'), true); $('lobby-error').textContent = '';
    socket.emit('create-room', {}, function(res) {
      if (res.error) { $('lobby-error').textContent = res.error; setBtn($('lobby-create-btn'), false); return; }
      if (res.ok) enterGame(res);
    });
  });

  // ═══ 加入房间 ═══
  $('lobby-join-btn').addEventListener('click', function() {
    var code = $('lobby-join-input').value.trim().toUpperCase();
    if (!code) { $('lobby-error').textContent = '请输入房间号'; return; }
    lobbyJoin(code, false);
  });
  $('lobby-join-input').addEventListener('keydown', function(e) { if (e.key === 'Enter') $('lobby-join-btn').click(); });
  $('lobby-refresh-btn').addEventListener('click', refreshRoomList);

  // ═══ 页签 ═══
  function switchLobbyTab(name) {
    document.querySelectorAll('.lobby-nav-item').forEach(function(t) { t.classList.toggle('active', t.dataset.tab === name); });
    document.querySelectorAll('.lobby-panel').forEach(function(p) { p.classList.toggle('active', p.id === 'panel-' + name); });
    if (name === 'profile') { ['nickname','pw'].forEach(function(k) { $('profile-' + k + '-msg').textContent = ''; $('profile-' + k + '-msg').className = 'profile-msg'; }); $('profile-old-pw').value = ''; $('profile-new-pw').value = ''; }
  }
  document.querySelectorAll('.lobby-nav-item').forEach(function(t) { t.addEventListener('click', function() { switchLobbyTab(t.dataset.tab); }); });

  // ═══ 个人中心 ═══
  $('profile-avatar').addEventListener('click', function() { $('profile-avatar-input').click(); });
  $('profile-avatar-input').addEventListener('change', function(e) {
    var f = e.target.files[0]; if (!f) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
      // 缩放到 64x64 减少体积
      var img = new Image();
      img.onload = function() {
        var c = document.createElement('canvas');
        c.width = 128; c.height = 128;
        var ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, 128, 128);
        var dataUrl = c.toDataURL('image/jpeg', 0.75);
        $('lobby-avatar').innerHTML = '<img src="' + dataUrl + '" alt="">';
        $('profile-avatar').innerHTML = '<img src="' + dataUrl + '" alt="">';
        localStorage.setItem('bwpemu_avatar_' + (localStorage.getItem(UN_KEY) || ''), dataUrl);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(f); e.target.value = '';
  });

  $('profile-save-nickname').addEventListener('click', function() {
    var nn = $('profile-nickname').value.trim(), m = $('profile-nickname-msg');
    if (!nn) { m.textContent = '昵称不能为空'; m.className = 'profile-msg err'; return; }
    socket.emit('change-nickname', { nickname: nn }, function(res) {
      if (res.error) { m.textContent = res.error; m.className = 'profile-msg err'; return; }
      m.textContent = '已更新'; m.className = 'profile-msg ok';
      localStorage.setItem(NN_KEY, nn); window._gameNickname = nn;
      $('lobby-nickname').textContent = nn;
      if (!$('lobby-avatar').querySelector('img')) $('lobby-avatar').textContent = nn.charAt(0).toUpperCase();
      if (!$('profile-avatar').querySelector('img')) $('profile-avatar').textContent = nn.charAt(0).toUpperCase();
    });
  });

  $('profile-save-password').addEventListener('click', function() {
    var o = $('profile-old-pw').value, n = $('profile-new-pw').value, m = $('profile-pw-msg');
    if (!o || !n) { m.textContent = '请填写密码'; m.className = 'profile-msg err'; return; }
    if (n.length < 4) { m.textContent = '新密码不能少于 4 位'; m.className = 'profile-msg err'; return; }
    socket.emit('change-password', { oldPassword: o, newPassword: n }, function(res) {
      if (res.error) { m.textContent = res.error; m.className = 'profile-msg err'; return; }
      m.textContent = '密码已修改'; m.className = 'profile-msg ok';
      $('profile-old-pw').value = ''; $('profile-new-pw').value = '';
    });
  });

  // ═══ 退出 ═══
  $('lobby-logout-btn').addEventListener('click', function() {
    localStorage.removeItem(TK_KEY); localStorage.removeItem(UN_KEY); localStorage.removeItem(NN_KEY);
    window._gameUsername = null; window._gameNickname = null;
    if (socket) { socket.disconnect(); socket = null; }
    showAuth(false);
  });

  // ═══ 进入游戏 ═══
  function enterGame(res) {
    try {
    if (roomRefreshTimer) { clearTimeout(roomRefreshTimer); roomRefreshTimer = null; }
    showView(GAME_VIEW);
    setConnStatus(true, '已连接');
    window._gameSocket = socket;

    window.sendToServer = function(data) {
      if (!socket || !socket.connected) return;
      if (data.type === 'game' && data.data) {
        var act = data.data;
        // 压缩超大卡图后再发送
        if (act.type === 'slot-update' && act.state && act.state.imageSrc && act.state.imageSrc.length > 80000) {
          act = JSON.parse(JSON.stringify(act));
          _compressThenSend(act, act.state.imageSrc);
          return;
        }
        socket.emit('act', act);
      }
    };

    function _compressThenSend(act, dataUrl) {
      var img = new Image();
      img.onload = function() {
        var w = img.width, h = img.height, maxW = 400;
        if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
        var c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        act.state.imageSrc = c.toDataURL('image/jpeg', 0.8);
        socket.emit('act', act);
      };
      img.onerror = function() { socket.emit('act', act); };
      img.src = dataUrl;
    }
    window.isConnected = function() { return !!(socket && socket.connected); };

    if (res.solo) {
      isHost = true; isSpectator = false; localPlayerId = '1'; isSoloMode = true;
      lastRoomCode = res.solo;
      ROOM_ID_CODE.textContent = res.solo;
      ROOM_OVERLAY.hidden = true; $('room-joining').hidden = true; ROOM_HOME.hidden = true; ROOM_WAITING.hidden = true;
      updateSysChatTitle(); resetPermissionLock(); setConnStatus(true, '单人模式');
      addSystemChatMessage('【系统】单人模式 —— 所有区域均可操作');
    } else if (res.joined) {
      isHost = false; isSpectator = false; localPlayerId = res.slot || '2'; isSoloMode = false;
      lastRoomCode = res.joined;
      ROOM_OVERLAY.hidden = true; ROOM_HOME.hidden = true; ROOM_WAITING.hidden = true; $('room-joining').hidden = true;
      updateSysChatTitle(); applyPermissionLock();
      if (res.rejoined && !res.otherOnline) { setConnStatus(false, '等待对手重连'); addSystemChatMessage('【系统】已重连，等待对手重连…'); }
      else { setConnStatus(true, '已连接'); addSystemChatMessage('【系统】连接成功，游戏开始！'); }
    } else if (res.spectating) {
      isHost = false; isSpectator = true; localPlayerId = '0'; isSoloMode = false;
      lastRoomCode = res.spectating;
      ROOM_OVERLAY.hidden = true; ROOM_HOME.hidden = true; ROOM_WAITING.hidden = true; $('room-joining').hidden = true;
      updateSysChatTitle(); applyPermissionLock(); setConnStatus(true, '观战中');
      addSystemChatMessage('【系统】已进入观战模式');
    } else if (res.ok || res.room) {
      isHost = true; isSpectator = false; localPlayerId = '1'; isSoloMode = false;
      lastRoomCode = res.room;
      ROOM_ID_CODE.textContent = res.room;
      ROOM_OVERLAY.hidden = true; $('room-joining').hidden = true; ROOM_HOME.hidden = true; ROOM_WAITING.hidden = false;
      updateSysChatTitle(); setConnStatus(true, '等待对手加入…');
    }
    applyPermissionLock();

    socket.off('room-state').off('update').off('player-joined').off('player-left').off('error-msg');
    socket.on('room-state', function(s) { if (typeof applyFullState === 'function') applyFullState(s); });
    socket.on('update', function(a) { handlePeerData(a); });
    socket.on('player-joined', function(p) {
      if (p.rejoined) { addSystemChatMessage('【系统】对手重连'); setConnStatus(true, '已连接'); }
      else if (p.slot !== '0') { addSystemChatMessage('【系统】对手已加入'); if (isHost) { onPeerConnected(); setConnStatus(true, '已连接'); } }
      else addSystemChatMessage('【系统】观众进入');
    });
    socket.on('player-left', function(p) {
      if (p.gone) { setConnStatus(false, '对手已退出'); addSystemChatMessage('【系统】对手已退出房间'); }
      else { setConnStatus(false, '对手离线'); addSystemChatMessage('【系统】对手已离线'); }
    });
    socket.on('error-msg', function(m) { console.warn('[Game]', m); addSystemChatMessage('【系统】⚠️ ' + m); });
    // 清空旧聊天
    ['chat-system-log','chat-player-log'].forEach(function(id) { var el = document.getElementById(id); if(el) el.innerHTML = ''; });

    // 设置双方默认值（不覆盖已从 room-state 恢复的数据）
    ['1','2'].forEach(function(pid) {
      var az = document.querySelector('.player-zone[data-player="' + pid + '"]');
      if (az) {
        var hp = az.querySelector('.player-hp-input'); if (hp && !hp.value) hp.value = '30';
        // 昵称只设默认，不覆盖已有值
        var ni = az.querySelector('.player-name-input');
        if (ni && !ni.value) ni.value = '';
      }
      // 头像如果没图片则清除
      var av = document.querySelector('.player-avatar[data-avatar-player="' + pid + '"]');
      if (av && !av.querySelector('img')) { av.innerHTML = ''; av.classList.remove('has-avatar'); }
      // 鬼火默认 2
      if (!playerFire[pid]) { playerFire[pid] = 2; applyRemoteFireState(pid, 2); }
    });

    // 设置己方头像和昵称，同步到服务器
    var myPid = localPlayerId || '1';
    var uname = localStorage.getItem('bwpemu_username') || window._gameUsername || '';
    var avatarKey = 'bwpemu_avatar_' + uname;
    var savedAvatar = localStorage.getItem(avatarKey);
    if (savedAvatar) {
      setAvatarImage(myPid, savedAvatar);
      // 同步头像到服务器（已压缩为 64x64 jpeg，约 2-4KB）
      if (window._gameSocket && window._gameSocket.connected) {
        window._gameSocket.emit('act', { type: 'avatar-update', playerId: myPid, imageSrc: savedAvatar });
      }
    }
    var nn = window._gameNickname || localStorage.getItem('bwpemu_nickname') || '';
    if (nn) {
      var zone = document.querySelector('.player-zone[data-player="' + myPid + '"]');
      if (zone) { var ni = zone.querySelector('.player-name-input'); ni.value = nn; }
      if (window._gameSocket && window._gameSocket.connected) {
        window._gameSocket.emit('act', { type: 'player-info', playerId: myPid, name: nn, hp: '30' });
      }
    }
    // 退出按钮
    var exitBtn = $('game-btn-exit');
    if (exitBtn) exitBtn.onclick = function() {
      if (window._gameSocket) { window._gameSocket.emit('leave-room'); }
      isSoloMode = false; isHost = false; isSpectator = false; localPlayerId = null;
      showLobby(window._gameNickname || '');
    };
    } catch(e) { console.error('[Auth] enterGame 异常:', e); }
  }

  // ═══ 自动登录 ═══
  function autoLogin() {
    var token = localStorage.getItem(TK_KEY);
    if (!token) { showAuth(false); return; }
    showLoading('恢复登录…');
    connect();
    socket.emit('token-login', { token: token }, function(res) {
      hideLoading();
      if (res.error) { localStorage.removeItem(TK_KEY); showAuth(false); return; }
      window._gameUsername = res.username; window._gameNickname = res.nickname;
      showLobby(res.nickname);
    });
  }

  autoLogin();
})();
