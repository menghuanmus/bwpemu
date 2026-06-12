// ================================================================
//  js/chat.js — 发言系统 (JS-3)
//  聊天消息显示、发言对话框、系统消息广播、观众名称管理
//  依赖: network.js (sendToPeer, peerConn)
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

    function addChatMessage(playerId, text, senderName) {
      const trimmed = text.trim();
      if (!trimmed) return;

      const bubble = document.createElement('div');
      bubble.className = `chat-bubble chat-bubble--player${playerId}`;
      const speaker = document.createElement('span');
      speaker.className = 'chat-speaker';
      speaker.textContent = `${senderName || getPlayerName(playerId)}：`;
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

    // ================================================================
    //  消息分组机制：将卡牌使用后的多条效果消息整合为可展开/收缩的组
    // ================================================================
    let _msgGroup = null; // { mainMsg, subMsgs: [] }

    /** 开始消息分组：主消息 + 后续 broadcast 的消息成为子条目 */
    function startMessageGroup(mainMsg) {
      _msgGroup = { mainMsg, subMsgs: [] };
    }

    /** 结束消息分组：渲染为一条可展开的系统消息，并同步给对方 */
    function endMessageGroup() {
      if (!_msgGroup) return;
      const group = _msgGroup;
      _msgGroup = null;
      if (group.subMsgs.length === 0) {
        addSystemChatMessage(group.mainMsg);
        // 无子消息也需同步给对方
        if (!isSoloMode && peerConn && peerConn.open && typeof sendToPeer === 'function') {
          sendToPeer({ type: 'sysmsg', text: group.mainMsg });
        }
        return;
      }
      _renderGroupedMessage(group);
      // 联机同步：将分组消息发给对方
      if (!isSoloMode && peerConn && peerConn.open && typeof sendToPeer === 'function') {
        sendToPeer({ type: 'sysmsg-group', mainMsg: group.mainMsg, subMsgs: group.subMsgs });
      }
    }

    function _renderGroupedMessage(group) {
      if (!chatSystemLog) return;
      try {
        const wrapper = document.createElement('div');
        wrapper.className = 'chat-bubble chat-bubble--system chat-bubble--group';

        // 主行：主消息 + 展开/收缩箭头
        const mainRow = document.createElement('div');
        mainRow.className = 'chat-group-main';
        const toggle = document.createElement('span');
        toggle.className = 'chat-group-toggle';
        toggle.textContent = '▼';  // 默认展开
        toggle.title = '点击收缩效果详情';
        mainRow.appendChild(toggle);

        const mainText = document.createElement('span');
        mainText.className = 'chat-group-text';
        mainText.innerHTML = escapeHTML(group.mainMsg).replace(/「(.+?)」/g, '<span class="chat-card-name">$1</span>');
        mainRow.appendChild(mainText);
        wrapper.appendChild(mainRow);

        // 子消息列表（默认展开）
        const subList = document.createElement('div');
        subList.className = 'chat-group-subs';
        subList.hidden = false;
        for (const subMsg of group.subMsgs) {
          const subItem = document.createElement('div');
          subItem.className = 'chat-group-sub';
          subItem.textContent = subMsg;
          subList.appendChild(subItem);
        }
        wrapper.appendChild(subList);

        // 点击切换展开/收缩
        mainRow.addEventListener('click', () => {
          const collapsed = subList.hidden;
          subList.hidden = !collapsed;
          toggle.textContent = collapsed ? '▼' : '▶';
          chatSystemLog.scrollTop = chatSystemLog.scrollHeight;
        });

        chatSystemLog.appendChild(wrapper);
        chatSystemLog.scrollTop = chatSystemLog.scrollHeight;
      } catch (e) {
        console.error('[SysMsg] 渲染分组消息失败:', e);
      }
    }

    /* 系统消息：本地显示 + 同步给对方（单人模式仅本地） */
    function broadcastSystemMsg(msg) {
      console.log('[SysMsg]', msg);
      // 联机：始终同步给对方
      if (!isSoloMode && peerConn && peerConn.open) {
        sendToPeer({ type: 'sysmsg', text: msg });
      }
      // 如果处于消息分组中，收集为子消息（本地显示由分组渲染）
      if (_msgGroup) {
        _msgGroup.subMsgs.push(msg);
        return;
      }
      addSystemChatMessage(msg);
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
          senderName: getPlayerName(activeSpeakPlayer),
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
