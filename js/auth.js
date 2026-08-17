// ================================================================
//  js/auth.js — Socket.IO 客户端：登录/注册/大厅/游戏通信
// ================================================================

(function() {
  'use strict';

  const TK_KEY = 'bwpemu_token';
  const UN_KEY = 'bwpemu_username';
  const NN_KEY = 'bwpemu_nickname';

  var socket = null;
  var roomRefreshTimer = null;

  // DOM
  var $ = function(id) { return document.getElementById(id); };
  var AUTH_VIEW = $('auth-view'), LOGIN_PANEL = $('login-panel'), REG_PANEL = $('register-panel');
  var LOBBY_VIEW = $('lobby-view'), GAME_VIEW = $('game-view'), READY_VIEW = $('ready-view');
  var LOADING_EL = $('auth-loading'), LOADING_TXT = $('auth-loading-text');

  // ═══ 工具 ═══
  function showLoading(txt) { LOADING_TXT.textContent = txt || '连接中…'; LOADING_EL.classList.add('active'); }
  function hideLoading() { LOADING_EL.classList.remove('active'); }
  function setBtn(btn, loading) { btn.disabled = loading; btn.classList.toggle('loading', loading); }

  function showView(view) {
    [AUTH_VIEW, LOBBY_VIEW, GAME_VIEW, READY_VIEW].forEach(function(v) { v.classList.remove('active'); });
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
    var av = $('auth-cursor-aura'), lv = $('lobby-cursor-aura'), rv = $('ready-cursor-aura');
    if (av && AUTH_VIEW.classList.contains('active')) { av.style.left = e.clientX + 'px'; av.style.top = e.clientY + 'px'; }
    if (lv && LOBBY_VIEW.classList.contains('active')) { lv.style.left = e.clientX + 'px'; lv.style.top = e.clientY + 'px'; }
    if (rv && READY_VIEW.classList.contains('active')) { rv.style.left = e.clientX + 'px'; rv.style.top = e.clientY + 'px'; }
  });

  // ═══ Socket.IO 连接 ═══
  function connect() {
    if (socket && socket.connected) return;
    if (socket) { socket.disconnect(); socket = null; }
    socket = io(window._SERVER_HOST, { path: window._SERVER_PATH, transports: ['websocket', 'polling'], reconnection: true, reconnectionDelay: 1000, reconnectionAttempts: Infinity });
    window._gameSocket = socket;
  }

  // ═══ 登录 ═══
  $('login-btn').addEventListener('click', function() {
    var uname = $('login-username').value.trim(), pw = $('login-password').value;
    if (!uname || !pw) { $('login-error').textContent = '请填写账号和密码'; return; }
    setBtn($('login-btn'), true); showLoading('正在登录…');
    connect();
    socket.emit('login', { username: uname, password: pw }, function(res) {
      hideLoading(); setBtn($('login-btn'), false);
      if (res.error) { $('login-error').textContent = res.error; return; }
      if ($('login-remember').checked) {
        localStorage.setItem(TK_KEY, res.token); localStorage.setItem(UN_KEY, res.username); localStorage.setItem(NN_KEY, res.nickname);
      } else {
        localStorage.removeItem(TK_KEY); localStorage.removeItem(UN_KEY); localStorage.removeItem(NN_KEY);
      }
      window._gameUsername = res.username; window._gameNickname = res.nickname;
      window._gameAvatar = res.avatar || '';
      showLobby(res.nickname);
    });
  });
  $('login-password').addEventListener('keydown', function(e) { if (e.key === 'Enter') $('login-btn').click(); });

  // ═══ 注册 ═══
  $('reg-btn').addEventListener('click', function() {
    var uname = $('reg-username').value.trim(), nn = $('reg-nickname').value.trim() || uname, pw = $('reg-password').value;
    if (!uname || !pw) { $('reg-error').textContent = '请填写账号和密码'; return; }
    if (pw.length < 4) { $('reg-error').textContent = '密码不能少于 4 位'; return; }
    setBtn($('reg-btn'), true); showLoading('正在注册…');
    connect();
    socket.emit('register', { username: uname, nickname: nn, password: pw }, function(res) {
      hideLoading(); setBtn($('reg-btn'), false);
      if (res.error) { $('reg-error').textContent = res.error; return; }
      // 注册成功，提示并返回登录界面
      showAuth(false);
      $('login-username').value = uname; $('login-password').value = '';
      $('login-error').textContent = '注册成功，请登录';
      $('login-error').style.color = '#6EE7B7';
      $('login-password').focus();
    });
  });
  $('reg-password').addEventListener('keydown', function(e) { if (e.key === 'Enter') $('reg-btn').click(); });

  $('show-register-link').addEventListener('click', function(e) { e.preventDefault(); showAuth(true); });
  $('show-login-link').addEventListener('click', function(e) { e.preventDefault(); showAuth(false); });

  // ═══ 大厅 ═══
  function showLobby(nickname) {
    showView(LOBBY_VIEW);
    // 回到大厅时彻底清空上一局的战场数据，防止新房间继承旧状态
    if (typeof resetGameState === 'function') resetGameState();
    var uname = localStorage.getItem(UN_KEY) || window._gameUsername || '';
    $('lobby-nickname').textContent = nickname;
    $('lobby-avatar').innerHTML = ''; $('lobby-avatar').textContent = nickname.charAt(0).toUpperCase();
    $('lobby-username').textContent = '@' + uname;
    $('lobby-error').textContent = ''; setBtn($('lobby-create-btn'), false); setBtn($('lobby-join-btn'), false); setBtn($('lobby-solo-btn'), false);
    $('profile-avatar').innerHTML = ''; $('profile-avatar').textContent = nickname.charAt(0).toUpperCase();
    $('profile-nickname').value = nickname;
    ['nickname','pw'].forEach(function(k) { $('profile-' + k + '-msg').textContent = ''; $('profile-' + k + '-msg').className = 'profile-msg'; });
    $('profile-old-pw').value = ''; $('profile-new-pw').value = '';
    // 从服务端加载头像
    if (window._gameAvatar) {
      $('lobby-avatar').innerHTML = '<img src="' + window._gameAvatar + '" alt="">';
      $('profile-avatar').innerHTML = '<img src="' + window._gameAvatar + '" alt="">';
    }
    switchLobbyTab('hall');
    refreshRoomList();
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
    if (!rooms || !rooms.length) { if (emptyEl) emptyEl.style.display = ''; listEl.innerHTML = ''; window._cachedRoomList = []; return; }
    if (emptyEl) emptyEl.style.display = 'none';
    window._cachedRoomList = rooms;  // 缓存供密码检查用
    var myUname = (typeof window._gameUsername !== 'undefined' && window._gameUsername) ? window._gameUsername : (localStorage.getItem(UN_KEY) || '');
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
      var roomStatus = r.status || 'playing';
      var status, statusCls;
      if (r.solo) { status = '单人'; statusCls = 'playing'; }
      else if (roomStatus === 'playing') { status = '对战中'; statusCls = 'playing'; }
      else if (myOffline) { status = '可重连'; statusCls = 'waiting'; }
      else if (roomStatus === 'ready') { status = '等待开始'; statusCls = 'waiting'; }
      else { status = '等待加入'; statusCls = 'waiting'; }
      html += '<div class="room-list-item" data-room="' + r.room + '">' +
        '<span class="room-list-code">' + (r.hasPassword ? '🔒 ' : '') + r.room + '</span>' +
        '<div class="room-list-info"><span class="room-list-status ' + statusCls + '">' + status + '</span>' +
        '<span class="room-list-players">' + (r.solo ? (online + '/1') : (online + '/2')) + ' ' + r.players.map(function(p) { return p.nickname + (p.offline ? '（断线）' : ''); }).join('、') + '</span></div>' +
        '<div class="room-list-actions">';
      if (r.solo && myOffline) html += '<button class="room-list-join-btn" data-room="' + r.room + '">重连</button>';
      else if (!r.solo) {
        if (myOffline) html += '<button class="room-list-join-btn" data-room="' + r.room + '">重连</button>';
        else if (roomStatus !== 'playing' && !full) html += '<button class="room-list-join-btn" data-room="' + r.room + '">加入</button>';
      }
      if (roomStatus === 'playing') html += '<button class="room-list-spec-btn" data-room="' + r.room + '">观战</button>';
      html += '</div></div>';
    });
    listEl.innerHTML = html;
    listEl.querySelectorAll('.room-list-join-btn').forEach(function(b) { b.onclick = function() { lobbyJoin(b.dataset.room, false); }; });
    listEl.querySelectorAll('.room-list-spec-btn').forEach(function(b) { b.onclick = function() { lobbyJoin(b.dataset.room, true); }; });
  }

  function lobbyJoin(code, asSpec) {
    setBtn($('lobby-join-btn'), true); $('lobby-error').textContent = '';
    if (asSpec) { isSpectator = true; isHost = false; localPlayerId = '0'; }
    // 如果房间有密码，弹窗输入
    var roomData = _findRoomData(code);
    if (roomData && roomData.hasPassword) {
      _promptRoomPassword(code, asSpec);
      return;
    }
    _doLobbyJoin(code, asSpec, '');
  }

  function _findRoomData(code) {
    return (window._cachedRoomList || []).find(function(r) { return r.room === code; });
  }

  function _promptRoomPassword(code, asSpec) {
    // 记录待加入的房间信息
    window._pendingJoinCode = code;
    window._pendingJoinSpec = asSpec;
    var modal = $('room-password-modal');
    var input = $('room-password-input');
    var errEl = $('room-password-error');
    if (!modal) { _doLobbyJoin(code, asSpec, ''); return; }
    if (input) input.value = '';
    if (errEl) errEl.textContent = '';
    modal.classList.add('active');
    if (input) input.focus();
  }

  window._confirmRoomPassword = function() {
    var input = $('room-password-input');
    var pw = input ? input.value.trim() : '';
    var modal = $('room-password-modal');
    if (modal) modal.classList.remove('active');
    _doLobbyJoin(window._pendingJoinCode, window._pendingJoinSpec, pw);
  };

  function _doLobbyJoin(code, asSpec, password) {
    var evt = asSpec ? 'spectate-room' : 'join-room';
    socket.emit(evt, { room: code, password: password }, function(res) {
      setBtn($('lobby-join-btn'), false);
      if (!res) { $('lobby-error').textContent = '服务端无响应'; return; }
      if (res.error) { $('lobby-error').textContent = res.error; return; }
      if (asSpec && res.spectating) {
        if (res.state && typeof applyFullState === 'function') applyFullState(res.state);
        enterGame(res); return;
      }
      if (res.solo) {
        if (res.state && typeof applyFullState === 'function') applyFullState(res.state);
        enterGame(res);
        return;
      }
      if (res.roomStatus === 'waiting' || res.roomStatus === 'ready') {
        showReadyRoom(res);
      } else if (res.joined) {
        if (res.state && typeof applyFullState === 'function') applyFullState(res.state);
        enterGame(res);
      }
    });
  }

  // ═══ 创建房间 ═══
  $('lobby-create-btn').addEventListener('click', function() {
    setBtn($('lobby-create-btn'), true); $('lobby-error').textContent = '';
    socket.emit('create-room', {}, function(res) {
      setBtn($('lobby-create-btn'), false);
      if (res.error) { $('lobby-error').textContent = res.error; return; }
      if (res.ok) showReadyRoom({ room: res.room, slot: res.slot, roomStatus: res.status || 'waiting', roomInfo: res.roomInfo });
    });
  });

  // ═══ 单人模式 ═══
  $('lobby-solo-btn').addEventListener('click', function() {
    setBtn($('lobby-solo-btn'), true);
    socket.emit('create-solo', {}, function(res) {
      if(res.error) { $('lobby-error').textContent = res.error; setBtn($('lobby-solo-btn'), false); return; }
      if(res.ok || res.solo) enterGame({ solo: res.solo || res.ok, slot: '1' });
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

  // ═══ 房间等待界面 ═══
  var readyRoomCode = null;
  var isReadyHost = false;
  var isReadyMode = false;
  window._roomPassword = '';

  // 游戏设置保存密码（由 HTML onclick 调用）
  window._saveGamePassword = function() {
    if (!isHost) return;
    var pwInput = document.getElementById('game-settings-password');
    var pw = pwInput ? pwInput.value.trim() : '';
    if (window._gameSocket && window._gameSocket.connected) {
      window._gameSocket.emit('set-room-password', { password: pw });
    }
    window._roomPassword = pw;
    var modal = document.getElementById('game-settings-modal');
    if (modal) modal.classList.remove('active');
  };

  function showReadyRoom(res) {
    isReadyMode = true;
    readyRoomCode = res.room;
    isReadyHost = (res.slot === '1');
    isSpectator = false;

    showView(READY_VIEW);
    $('ready-room-code').textContent = res.room;
    $('ready-error').textContent = '';
    $('ready-chat-log').innerHTML = '';

    // 按钮显隐
    $('ready-ready-btn').style.display = isReadyHost ? 'none' : '';
    $('ready-start-btn').style.display = isReadyHost ? '' : 'none';
    setBtn($('ready-ready-btn'), false);
    setBtn($('ready-start-btn'), false);
    $('ready-ready-btn').querySelector('.btn-text').textContent = '准 备';
    $('ready-start-btn').disabled = true;

    // 初始化玩家显示
    updateReadyPlayers(res.roomInfo);

    // 注册房间事件
    socket.off('room-update').off('game-start').off('room-closed').off('room-chat');
    socket.on('room-update', function(info) {
      updateReadyPlayers(info);
    });
    socket.on('game-start', function(data) {
      var roomCode = readyRoomCode;
      isReadyMode = false;
      readyRoomCode = null;
      localPlayerId = data.slot;
      isHost = (data.slot === '1');
      // 清理准备室监听
      socket.off('room-update').off('game-start').off('room-closed').off('room-chat');
      if (data.state && typeof applyFullState === 'function') applyFullState(data.state);
      enterGame({ joined: roomCode, slot: data.slot, state: data.state, otherOnline: true });
    });
    socket.on('room-closed', function(data) {
      isReadyMode = false; readyRoomCode = null;
      showLobby(window._gameNickname || '');
      $('lobby-error').textContent = data.reason || '房间已关闭';
    });
    socket.on('room-chat', function(msg) {
      appendReadyChat(msg);
    });

    // 加载历史聊天
    if (res.roomInfo && res.roomInfo.chatLog) {
      res.roomInfo.chatLog.forEach(function(m) { appendReadyChat(m); });
    }
  }

  function updateReadyPlayers(info) {
    if (!info || !info.players) return;
    var p1 = info.players.find(function(p) { return p.slot === '1'; });
    var p2 = info.players.find(function(p) { return p.slot === '2'; });

    // 玩家 1（房主）
    var av1 = $('ready-player-1').querySelector('.ready-player-avatar');
    if (p1) {
      $('ready-player-1').querySelector('.ready-player-name').textContent = p1.nickname;
      $('ready-badge-1').textContent = '房主';
      $('ready-badge-1').className = 'ready-player-badge';
      if (p1.ready) $('ready-badge-1').classList.add('ready');
      _setPlayerAvatar(av1, p1.avatar, p1.nickname);
    }
    // 玩家 2
    var av2 = $('ready-player-2').querySelector('.ready-player-avatar');
    if (p2) {
      $('ready-player-2').querySelector('.ready-player-name').textContent = p2.nickname;
      $('ready-badge-2').textContent = p2.ready ? '已准备' : '未准备';
      $('ready-badge-2').className = 'ready-player-badge' + (p2.ready ? ' ready' : '');
      _setPlayerAvatar(av2, p2.avatar, p2.nickname);
    } else {
      $('ready-player-2').querySelector('.ready-player-name').textContent = '等待中';
      $('ready-badge-2').textContent = '';
      $('ready-badge-2').className = 'ready-player-badge';
      av2.innerHTML = '';
      av2.textContent = '?';
    }

    // 更新状态文字
    if (info.status === 'ready') {
      $('ready-status-text').textContent = '双方已就位，等待房主开始';
      if (isReadyHost) {
        var bothReady = p1 && p2 && p2.ready;
        $('ready-start-btn').disabled = !bothReady;
      }
    } else {
      $('ready-status-text').textContent = '等待玩家加入…';
    }

    // 更新准备按钮
    if (!isReadyHost && p2) {
      var myReady = p2.ready;
      $('ready-ready-btn').querySelector('.btn-text').textContent = myReady ? '取消准备' : '准 备';
    }
  }

  function _setPlayerAvatar(el, avatarUrl, nickname) {
    el.innerHTML = '';
    if (avatarUrl) {
      el.innerHTML = '<img src="' + avatarUrl + '" alt="">';
    } else {
      el.textContent = (nickname || '?').charAt(0).toUpperCase();
    }
  }

  function appendReadyChat(msg) {
    var log = $('ready-chat-log');
    var div = document.createElement('div');
    div.className = 'chat-msg';
    if (msg.type === 'sysmsg') {
      div.textContent = msg.text || '';
      div.style.color = '#6EE7B7';
    } else {
      div.innerHTML = '<span class="chat-sender">' + (msg.senderName || '未知') + '：</span>' + (msg.text || '');
    }
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  // 准备按钮
  $('ready-ready-btn').addEventListener('click', function() {
    socket.emit('player-ready', {}, function(res) {
      if (res && res.error) { $('ready-error').textContent = res.error; return; }
    });
  });

  // 开始按钮
  $('ready-start-btn').addEventListener('click', function() {
    setBtn($('ready-start-btn'), true);
    socket.emit('start-game', {}, function(res) {
      setBtn($('ready-start-btn'), false);
      if (res && res.error) { $('ready-error').textContent = res.error; return; }
    });
  });

  // 房间设置
  window._toggleReadySettings = function() {
    var panel = document.getElementById('ready-settings-panel');
    if (!panel) return;
    if (panel.classList.contains('open')) { panel.classList.remove('open'); return; }
    var pwInput = document.getElementById('ready-password-input');
    var saveBtn = document.getElementById('ready-password-save');
    if (!isReadyHost) {
      if (pwInput) { pwInput.disabled = true; pwInput.placeholder = '仅房主可设置密码'; }
      if (saveBtn) saveBtn.style.display = 'none';
    } else {
      if (pwInput) { pwInput.disabled = false; pwInput.placeholder = '设置密码'; }
      if (saveBtn) saveBtn.style.display = '';
    }
    panel.classList.add('open');
  };

  // 保存密码
  var pwSaveBtn = document.getElementById('ready-password-save');
  if (pwSaveBtn) pwSaveBtn.addEventListener('click', function() {
    var pw = document.getElementById('ready-password-input').value.trim();
    socket.emit('set-room-password', { password: pw }, function(res) {
      if (res && res.error) {
        var errEl = document.getElementById('ready-error');
        if (errEl) errEl.textContent = res.error;
        return;
      }
      window._roomPassword = pw;
      var panel = document.getElementById('ready-settings-panel');
      if (panel) panel.classList.remove('open');
    });
  });

  // 退出房间
  $('ready-leave-btn').addEventListener('click', function() {
    socket.emit('leave-room');
    isReadyMode = false; readyRoomCode = null;
    showLobby(window._gameNickname || '');
  });

  // 聊天发送
  $('ready-chat-send').addEventListener('click', function() {
    var txt = $('ready-chat-input').value.trim();
    if (!txt) return;
    socket.emit('room-chat', { text: txt });
    $('ready-chat-input').value = '';
  });
  $('ready-chat-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') $('ready-chat-send').click();
  });

  // ═══ 页签 ═══
  function switchLobbyTab(name) {
    document.querySelectorAll('.lobby-nav-item').forEach(function(t) { t.classList.toggle('active', t.dataset.tab === name); });
    document.querySelectorAll('.lobby-panel').forEach(function(p) { p.classList.toggle('active', p.id === 'panel-' + name); });
    if (name === 'profile') { ['nickname','pw'].forEach(function(k) { $('profile-' + k + '-msg').textContent = ''; $('profile-' + k + '-msg').className = 'profile-msg'; }); $('profile-old-pw').value = ''; $('profile-new-pw').value = ''; }
    if (name === 'history') loadBattleHistory();
  }
  document.querySelectorAll('.lobby-nav-item').forEach(function(t) { t.addEventListener('click', function() { switchLobbyTab(t.dataset.tab); }); });

  // ═══ 加载战绩 ═══
  function loadBattleHistory() {
    var listEl = $('history-list'), emptyEl = $('history-empty');
    if (!listEl) return;
    socket.emit('get-profile', {}, function(res) {
      if (!res || res.error) { listEl.innerHTML = ''; if(emptyEl) emptyEl.style.display = ''; return; }
      var records = res.battleRecord || [];
      if (!records.length) { listEl.innerHTML = ''; if(emptyEl) emptyEl.style.display = ''; return; }
      if(emptyEl) emptyEl.style.display = 'none';
      // 倒序显示（最新在前）
      var html = '';
      records.slice().reverse().forEach(function(rec, i) {
        var dt = rec.endedAt ? new Date(rec.endedAt).toLocaleString('zh-CN') : '未知时间';
        var players = (rec.participants || []).join(' vs ');
        var p1Info = rec.playerInfo && rec.playerInfo['1'] ? rec.playerInfo['1'].name || '玩家1' : '玩家1';
        var p2Info = rec.playerInfo && rec.playerInfo['2'] ? rec.playerInfo['2'].name || '玩家2' : '玩家2';
        var p1Hp = rec.playerInfo && rec.playerInfo['1'] ? rec.playerInfo['1'].hp || '?' : '?';
        var p2Hp = rec.playerInfo && rec.playerInfo['2'] ? rec.playerInfo['2'].hp || '?' : '?';
        html += '<div class="history-item">' +
          '<div class="history-item-header">' +
            '<span class="history-item-code">' + (rec.roomCode || '----') + '</span>' +
            '<span class="history-item-time">' + dt + '</span>' +
          '</div>' +
          '<div class="history-item-vs">' + p1Info + ' <span class="history-hp">' + p1Hp + ' HP</span>  VS  ' + p2Info + ' <span class="history-hp">' + p2Hp + ' HP</span></div>' +
        '</div>';
      });
      listEl.innerHTML = html;
    });
  }

  // ═══ 个人中心 ═══
  $('profile-avatar').addEventListener('click', function() { $('profile-avatar-input').click(); });
  $('profile-avatar-input').addEventListener('change', function(e) {
    var f = e.target.files[0]; if (!f) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
      var img = new Image();
      img.onload = function() {
        var c = document.createElement('canvas');
        c.width = 128; c.height = 128;
        var ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, 128, 128);
        var dataUrl = c.toDataURL('image/jpeg', 0.75);
        $('lobby-avatar').innerHTML = '<img src="' + dataUrl + '" alt="">';
        $('profile-avatar').innerHTML = '<img src="' + dataUrl + '" alt="">';
        window._gameAvatar = dataUrl;
        // 保存到服务端
        socket.emit('save-avatar', { avatar: dataUrl }, function(res) {
          if (res && res.error) console.warn('[Auth] 头像保存失败:', res.error);
        });
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

  // ═══ 注销账号 ═══
  $('profile-delete-btn').addEventListener('click', function() {
    $('delete-modal').classList.add('active');
    $('delete-password').value = '';
    $('delete-error').textContent = '';
    $('delete-password').focus();
  });
  $('delete-modal-cancel').addEventListener('click', function() {
    $('delete-modal').classList.remove('active');
  });
  // 点背景关闭
  $('delete-modal').addEventListener('click', function(e) {
    if (e.target === $('delete-modal')) $('delete-modal').classList.remove('active');
  });
  // 回车确认
  $('delete-password').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') $('delete-modal-confirm').click();
  });
  $('delete-modal-confirm').addEventListener('click', function() {
    var pw = $('delete-password').value;
    if (!pw) { $('delete-error').textContent = '请输入密码确认'; return; }
    setBtn($('delete-modal-confirm'), true);
    socket.emit('delete-account', { password: pw }, function(res) {
      setBtn($('delete-modal-confirm'), false);
      if (res.error) { $('delete-error').textContent = res.error; return; }
      $('delete-modal').classList.remove('active');
      localStorage.removeItem(TK_KEY); localStorage.removeItem(UN_KEY); localStorage.removeItem(NN_KEY);
      window._gameUsername = null; window._gameNickname = null; window._gameAvatar = null;
      if (socket) { socket.disconnect(); socket = null; }
      showAuth(false);
      $('login-error').textContent = '账号已注销';
      $('login-error').style.color = '#6EE7B7';
    });
  });

  // ═══ 游戏设置弹窗（事件在 enterGame 中绑定） ═══

  // ═══ 退出 ═══
  $('lobby-logout-btn').addEventListener('click', function() {
    localStorage.removeItem(TK_KEY); localStorage.removeItem(UN_KEY); localStorage.removeItem(NN_KEY);
    window._gameUsername = null; window._gameNickname = null;
    window._roomPassword = '';
    if (socket) { socket.disconnect(); socket = null; }
    showAuth(false);
    $('login-username').value = '';
    $('login-password').value = '';
    $('login-error').textContent = '';
    $('login-error').style.color = '';
    $('login-username').focus();
  });

  // ═══ 进入游戏 ═══
  function enterGame(res) {
    try {
    if (roomRefreshTimer) { clearTimeout(roomRefreshTimer); roomRefreshTimer = null; }
    showView(GAME_VIEW);
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
      updateSysChatTitle(); resetPermissionLock();
      if (res.rejoined) { setConnStatus(true, '已重连'); setPlayerConnStatus('2', true, '单人模式'); addSystemChatMessage('【系统】已重连，单人模式'); }
      else { setConnStatus(true, '单人模式'); setPlayerConnStatus('2', true, '单人模式'); addSystemChatMessage('【系统】单人模式 —— 所有区域均可操作'); }
    } else if (res.joined) {
      isHost = false; isSpectator = false; localPlayerId = res.slot || '2'; isSoloMode = false;
      lastRoomCode = res.joined;
      ROOM_OVERLAY.hidden = true; ROOM_HOME.hidden = true; ROOM_WAITING.hidden = true; $('room-joining').hidden = true;
      updateSysChatTitle(); applyPermissionLock();
      var peerId = (res.slot === '1') ? '2' : '1';
      if (res.rejoined && !res.otherOnline) { setConnStatus(true, '已连接'); setPlayerConnStatus(peerId, false, '等待重连'); addSystemChatMessage('【系统】已重连，等待对手重连…'); }
      else { setConnStatus(true, '已连接'); setPlayerConnStatus(peerId, true, '已连接'); addSystemChatMessage('【系统】连接成功，游戏开始！'); }
    } else if (res.spectating) {
      isHost = false; isSpectator = true; localPlayerId = '0'; isSoloMode = false;
      lastRoomCode = res.spectating;
      ROOM_OVERLAY.hidden = true; ROOM_HOME.hidden = true; ROOM_WAITING.hidden = true; $('room-joining').hidden = true;
      updateSysChatTitle(); applyPermissionLock();
      // 观众视角：两位玩家的连接状态都显示"已连接"（观战身份由中间栏观众行体现）
      setPlayerConnStatus('1', true, '已连接');
      setPlayerConnStatus('2', true, '已连接');
      // 观众名默认使用登录昵称
      var si = document.getElementById('spectator-name-input');
      if (si) si.value = window._gameNickname || '观众';
      addSystemChatMessage('【系统】已进入观战模式');
    } else if (res.ok || res.room) {
      isHost = true; isSpectator = false; localPlayerId = '1'; isSoloMode = false;
      lastRoomCode = res.room;
      ROOM_ID_CODE.textContent = res.room;
      ROOM_OVERLAY.hidden = true; $('room-joining').hidden = true; ROOM_HOME.hidden = true; ROOM_WAITING.hidden = false;
      updateSysChatTitle(); setConnStatus(true, '已连接'); setPlayerConnStatus('2', false, '等待加入');
    }
    applyPermissionLock();

    socket.off('room-state').off('update').off('player-joined').off('player-left').off('error-msg').off('room-update').off('room-closed').off('room-chat');
    socket.on('room-state', function(s) { if (typeof applyFullState === 'function') applyFullState(s); });
    socket.on('update', function(a) { handlePeerData(a); });
    socket.on('player-joined', function(p) {
      if (p.rejoined) { addSystemChatMessage('【系统】对手重连'); setConnStatus(true, '已连接'); if (p.slot) setPlayerConnStatus(p.slot, true, '已连接'); }
      else if (p.slot !== '0') { addSystemChatMessage('【系统】对手已加入'); if (p.slot) setPlayerConnStatus(p.slot, true, '已连接'); if (isHost) { onPeerConnected(); setConnStatus(true, '已连接'); } }
      else addSystemChatMessage('【系统】观众进入');
    });
    socket.on('player-left', function(p) {
      var peerSlot = p.slot || ((localPlayerId === '1') ? '2' : '1');
      if (p.gone) { setPlayerConnStatus(peerSlot, false, '已退出'); addSystemChatMessage('【系统】对手已退出房间'); }
      else { setPlayerConnStatus(peerSlot, false, '离线'); addSystemChatMessage('【系统】对手已离线'); }
    });
    socket.on('error-msg', function(m) { console.warn('[Game]', m); addSystemChatMessage('【系统】⚠️ ' + m); });

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

    // 设置己方头像和昵称，同步到服务器（观众跳过）
    var myPid = localPlayerId || '1';
    if (!isSpectator) {
    var savedAvatar = window._gameAvatar || '';
    if (savedAvatar) {
      setAvatarImage(myPid, savedAvatar);
      // 同步头像到服务器
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
    }  // end if (!isSpectator)
    // 退出按钮
    var exitBtn = $('game-btn-exit');
    if (exitBtn) exitBtn.onclick = function() {
      if (window._gameSocket) { window._gameSocket.emit('leave-room'); }
      isSoloMode = false; isHost = false; isSpectator = false; localPlayerId = null;
      isReadyMode = false; readyRoomCode = null;
      showLobby(window._gameNickname || '');
    };
    // 设置按钮
    var settingsBtn = $('game-btn-settings');
    if (settingsBtn) settingsBtn.onclick = function() {
      var modal = $('game-settings-modal');
      var pwInput = $('game-settings-password');
      var curPw = $('game-settings-current-pw');
      var errEl = $('game-settings-error');
      var saveBtn = $('game-settings-save');
      if (!modal) return;
      if (errEl) errEl.textContent = '';
      // 从服务端获取真实密码
      if (curPw) curPw.textContent = '加载中...';
      if (window._gameSocket && window._gameSocket.connected) {
        window._gameSocket.emit('get-room-info', {}, function(res) {
          var realPw = (res && res.password) ? res.password : '';
          if (curPw) curPw.textContent = realPw || '无';
          if (pwInput) { pwInput.value = ''; pwInput.placeholder = realPw ? '输入新密码（留空则取消）' : '设置密码'; }
        });
      } else {
        if (curPw) curPw.textContent = '（离线）';
      }
      if (!isHost) {
        if (pwInput) { pwInput.disabled = true; pwInput.placeholder = '仅房主可修改'; }
        if (saveBtn) saveBtn.style.display = 'none';
      } else {
        if (pwInput) pwInput.disabled = false;
        if (saveBtn) saveBtn.style.display = '';
      }
      modal.classList.add('active');
      if (pwInput) pwInput.focus();
    };

    } catch(e) { console.error('[Auth] enterGame 异常:', e); }
  }

  // ═══ 自动登录 ═══
  /** 处理 token-login 结果：登录 / 恢复对局 / 恢复等待房 / 回大厅 */
  function handleTokenLogin(res, silent) {
    hideLoading();
    if (!res || res.error) {
      if (!silent) { localStorage.removeItem(TK_KEY); showAuth(false); }
      return;
    }
    window._gameUsername = res.username; window._gameNickname = res.nickname;
    window._gameAvatar = res.avatar || '';
    // 断线重连：恢复进行中的对局
    if (res.joined && res.rejoined) {
      if (res.state && typeof applyFullState === 'function') applyFullState(res.state);
      if (typeof enterGame === 'function') enterGame(res);
      return;
    }
    // 恢复等待/准备房
    if (res.roomStatus === 'ready' || res.roomStatus === 'waiting') {
      if (typeof showReadyRoom === 'function') showReadyRoom(res);
      return;
    }
    // 无对局可恢复：回大厅
    if (typeof showLobby === 'function') showLobby(res.nickname);
  }

  function autoLogin() {
    var token = localStorage.getItem(TK_KEY);
    if (!token) { showAuth(false); return; }
    showLoading('恢复登录…');
    connect();
    socket.emit('token-login', { token: token }, function(res) {
      handleTokenLogin(res, false);
    });
  }

  // ═══ 切后台回来自动重连（正在重连弹窗 → 恢复对局 → 弹窗消失） ═══
  let _reconnectBusy = false;
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState !== 'visible') return;
    if (!socket || socket.connected) return;      // 连接正常，无需处理
    const token = localStorage.getItem(TK_KEY);
    if (!token) return;                            // 未登录
    if (_reconnectBusy) return;                    // 已在重连中
    _reconnectBusy = true;
    showLoading('正在重连…');
    connect();                                     // 重建连接
    socket.once('connect', function() {
      socket.emit('token-login', { token: token }, function(res) {
        _reconnectBusy = false;
        handleTokenLogin(res, true);               // 恢复对局或回大厅，弹窗随之消失
      });
    });
    // 兜底：12 秒还没连上则取消弹窗
    setTimeout(function() {
      if (socket && !socket.connected) {
        _reconnectBusy = false;
        hideLoading();
      }
    }, 12000);
  });

  autoLogin();
})();
