// ================================================================
//  js/dice.js — 骰子系统与瞄准工具 (JS-4)
//  骰子投掷、伤害/恢复/倒计时/能量/气绝/灵咒的统一瞄准与目标选择
//  依赖: network.js, game-core.js (getSlotCurses等)
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
    const btnMechanicToggle = document.getElementById('btn-mechanic-toggle');
    const dropdownMechanicMenu = document.getElementById('dropdown-mechanic-menu');
    const btnDamageSource = document.getElementById('btn-damage-source');
    const damageSourceMenu = document.getElementById('damage-source-menu');
    const curseNameInput = document.getElementById('curse-name-input');
    const damageLineSvg = document.getElementById('damage-line-svg');
    const damageLine = document.getElementById('damage-line');
    let isTargeting = false;
    let targetingMode = 'damage'; // 'damage' | 'heal' | 'countdown' | 'energy' | 'ko' | 'curse' | 'divine' | 'cook' | 'nightfall' | 'bounty' | 'oracle' | 'fate' | 'reset-stats'
    let targetingOrigin = { x: 0, y: 0 };

    // ---- 伤害/恢复来源 ----
    let damageSourceType = 'player';     // 'player' | 'shikigami'
    let damageSourceName = '';           // 式神卡牌名称（追踪名称而非槽位，换位不丢失）

    const TARGETING_BTN_MAP = {
      damage:    { btn: () => btnDamage,         activeText: '🎯 选择式神…(Esc取消)', idleText: '🎯 选择目标' },
      heal:      { btn: () => btnDamage,         activeText: '🎯 选择式神…(Esc取消)', idleText: '🎯 选择目标' },
      countdown: { btn: () => btnMechanicToggle, activeText: '⏳ 倒计时中…(Esc取消)', idleText: '🔧 机制 ▾' },
      energy:    { btn: () => btnMechanicToggle, activeText: '🏮 能量中…(Esc取消)',   idleText: '🔧 机制 ▾' },
      divine:    { btn: () => btnMechanicToggle, activeText: '🔮 选择牌手…(Esc取消)', idleText: '🔧 机制 ▾' },
      cook:      { btn: () => btnMechanicToggle, activeText: '🍳 选择式神…(Esc取消)', idleText: '🔧 机制 ▾' },
      nightfall: { btn: () => btnMechanicToggle, activeText: '🌙 选择牌手…(Esc取消)', idleText: '🔧 机制 ▾' },
      bounty:    { btn: () => btnMechanicToggle, activeText: '💰 选择牌手…(Esc取消)', idleText: '🔧 机制 ▾' },
      oracle:    { btn: () => btnMechanicToggle, activeText: '✨ 选择牌手…(Esc取消)', idleText: '🔧 机制 ▾' },
      fate:      { btn: () => btnMechanicToggle, activeText: '🔀 选择牌手…(Esc取消)', idleText: '🔧 机制 ▾' },
      'reset-stats': { btn: () => btnMechanicToggle, activeText: '🔄 选择式神…(Esc取消)', idleText: '🔧 机制 ▾' },
      ko:        { btn: () => btnKo,             activeText: '💀 选择式神…(Esc取消)', idleText: '💀 气绝/复活' },
      curse:     { btn: () => btnCurse,          activeText: '⛓️ 选择式神…(Esc取消)', idleText: '⛓️ 灵咒' },
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

    // ---- 伤害来源 ----
    /** 遍历己方所有卡牌槽，按名称查找式神 */
    function _findShikigamiSlotByName(name) {
      if (!name) return null;
      const pid = localPlayerId || '1';
      const zone = document.querySelector(`.player-zone[data-player="${pid}"]`);
      if (!zone) return null;
      const slots = zone.querySelectorAll('.card-slot');
      for (const slot of slots) {
        if (slot.querySelector('.card-name').value.trim() === name) return slot;
      }
      return null;
    }

    /** 获取伤害/恢复来源的显示文本 */
    function getDamageSourceLabel() {
      if (damageSourceType === 'shikigami' && damageSourceName) {
        const slot = _findShikigamiSlotByName(damageSourceName);
        if (slot && slot.classList.contains('has-image')) {
          return '「' + damageSourceName + '」';
        }
        // 式神已不在场上，回退为牌手
        damageSourceType = 'player';
        damageSourceName = '';
        btnDamageSource.textContent = '👤 己方牌手';
      }
      const playerName = localPlayerId ? getPlayerName(localPlayerId) : '玩家';
      return playerName;
    }

    /** 弹出伤害来源选择菜单 */
    function openDamageSourceMenu() {
      damageSourceMenu.innerHTML = '';
      const pid = localPlayerId || '1';
      const playerName = pid === '1' ? '玩家一' : (pid === '2' ? '玩家二' : '己方');

      // 选项：牌手
      const playerItem = document.createElement('button');
      playerItem.type = 'button';
      playerItem.className = 'damage-source__item';
      if (damageSourceType === 'player') playerItem.classList.add('damage-source__item--active');
      playerItem.textContent = '👤 ' + playerName + '（牌手）';
      playerItem.addEventListener('click', (e) => {
        e.stopPropagation();
        damageSourceType = 'player';
        damageSourceName = '';
        btnDamageSource.textContent = '👤 己方牌手';
        damageSourceMenu.hidden = true;
      });
      damageSourceMenu.appendChild(playerItem);

      // 选项：己方所有有卡图的式神（准备区+战斗区，不限于固定位置）
      const zone = document.querySelector(`.player-zone[data-player="${pid}"]`);
      const allSlots = zone ? zone.querySelectorAll('.card-slot.has-image') : [];
      const seenNames = new Set();
      allSlots.forEach(slot => {
        const cardName = slot.querySelector('.card-name').value.trim();
        if (!cardName || seenNames.has(cardName)) return; // 同名去重（可能准备区战斗区都有）
        seenNames.add(cardName);
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'damage-source__item';
        if (damageSourceType === 'shikigami' && damageSourceName === cardName) {
          item.classList.add('damage-source__item--active');
        }
        item.textContent = '⚔ ' + cardName;
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          damageSourceType = 'shikigami';
          damageSourceName = cardName;
          const short = cardName.length > 4 ? cardName.slice(0, 4) + '…' : cardName;
          btnDamageSource.textContent = '⚔ ' + short;
          damageSourceMenu.hidden = true;
        });
        damageSourceMenu.appendChild(item);
      });
      damageSourceMenu.hidden = false;
    }

    btnDamageSource.addEventListener('click', (e) => {
      e.stopPropagation();
      if (damageSourceMenu.hidden) {
        openDamageSourceMenu();
      } else {
        damageSourceMenu.hidden = true;
      }
    });

    damageSourceMenu.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    document.addEventListener('click', () => {
      damageSourceMenu.hidden = true;
    });

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
      dropdownMechanicMenu.hidden = true;
      if (isTargeting) { exitTargetingMode(); return; }
      enterTargetingMode('countdown');
    });

    btnEnergy.addEventListener('click', () => {
      dropdownMechanicMenu.hidden = true;
      if (isTargeting) { exitTargetingMode(); return; }
      enterTargetingMode('energy');
    });

    // ---- 入夜 ----
    const btnNightfall = document.getElementById('btn-nightfall');
    let nightfallActive = { '1': false, '2': false };
    btnNightfall.addEventListener('click', () => {
      dropdownMechanicMenu.hidden = true;
      if (isTargeting) { exitTargetingMode(); return; }
      enterTargetingMode('nightfall');
    });

    // ---- 占卜（选择牌手） ----
    const btnDivine = document.getElementById('btn-divine');
    btnDivine.addEventListener('click', () => {
      dropdownMechanicMenu.hidden = true;
      if (isTargeting) { exitTargetingMode(); return; }
      enterTargetingMode('divine');
    });

    // ---- 烹饪（选择式神，一次烹饪后自动退出） ----
    const btnCook = document.getElementById('btn-cook');
    btnCook.addEventListener('click', (e) => {
      dropdownMechanicMenu.hidden = true;
      if (isTargeting) { exitTargetingMode(); return; }
      e.stopPropagation(); // 防止冒泡到document导致立即退出
      enterTargetingMode('cook');
    });

    // ---- 赏金（切换赏金图标） ----
    const btnBounty = document.getElementById('btn-bounty');
    let bountyActive = { '1': false, '2': false };
    btnBounty.addEventListener('click', () => {
      dropdownMechanicMenu.hidden = true;
      if (isTargeting) { exitTargetingMode(); return; }
      enterTargetingMode('bounty');
    });

    // ---- 启悟（切换启悟机制） ----
    const btnoracle = document.getElementById('btn-oracle');
    btnoracle.addEventListener('click', () => {
      dropdownMechanicMenu.hidden = true;
      if (isTargeting) { exitTargetingMode(); return; }
      enterTargetingMode('oracle');
    });

    // ---- 命运抉择（选择牌手） ----
    const btnFate = document.getElementById('btn-fate');
    if (btnFate) {
      btnFate.addEventListener('click', () => {
        dropdownMechanicMenu.hidden = true;
        if (isTargeting) { exitTargetingMode(); return; }
        enterTargetingMode('fate');
      });
    }

    // ---- 重置属性 ----
    const btnResetStats = document.getElementById('btn-reset-stats');
    if (btnResetStats) {
      btnResetStats.addEventListener('click', () => {
        dropdownMechanicMenu.hidden = true;
        if (isTargeting) { exitTargetingMode(); return; }
        enterTargetingMode('reset-stats');
      });
    }

    function _toggleNightfall(playerId, show) {
      const zone = document.querySelector(`.player-zone[data-player="${playerId}"]`);
      if (!zone) return;
      const fieldLayout = zone.querySelector('.field-layout');
      if (!fieldLayout) return;

      if (show) {
        if (fieldLayout.querySelector('.nightfall-indicator')) return;
        const container = document.createElement('div');
        container.className = 'nightfall-indicator';
        const moon = document.createElement('span');
        moon.className = 'nightfall-moon';
        moon.textContent = '🌙';
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'nightfall-input';
        input.value = '0';
        input.min = '0';
        input.max = '99';
        input.addEventListener('change', () => syncNightfallToPeer(playerId));
        input.addEventListener('input', () => syncNightfallToPeer(playerId));
        moon.appendChild(input);
        container.appendChild(moon);
        // 插入到 "准备区" 标签的正下方、field-row 之前
        const fieldRow = fieldLayout.querySelector('.field-row');
        if (fieldRow) {
          fieldLayout.insertBefore(container, fieldRow);
        } else {
          fieldLayout.appendChild(container);
        }
        _playNightfallEffect(container, 'in');
      } else {
        const existing = fieldLayout.querySelector('.nightfall-indicator');
        if (existing) {
          _playNightfallEffect(existing, 'out', () => existing.remove());
        }
      }
    }

    function _playNightfallEffect(target, dir, onComplete) {
      if (typeof gsap === 'undefined') {
        if (onComplete) onComplete();
        return;
      }
      const origPos = target.style.position;
      target.style.position = 'relative';

      // 冲击环
      const ring = document.createElement('div');
      ring.className = 'nightfall-ring';
      target.appendChild(ring);

      // 星星粒子
      const stars = [];
      for (let i = 0; i < 12; i++) {
        const star = document.createElement('div');
        star.className = 'nightfall-star';
        star.style.left = (30 + Math.random() * 40) + '%';
        star.style.top = (20 + Math.random() * 60) + '%';
        target.appendChild(star);
        stars.push(star);
      }

      if (dir === 'in') {
        gsap.fromTo(ring, { opacity: 1, scale: 0.3 }, { opacity: 0, scale: 3, duration: 0.5, ease: 'power2.out', onComplete: () => ring.remove() });
        stars.forEach((s, i) => {
          gsap.fromTo(s, { opacity: 0, scale: 0 }, {
            opacity: 1, scale: 1.5,
            x: (Math.random() - 0.5) * 50,
            y: (Math.random() - 0.5) * 40,
            duration: 0.4 + Math.random() * 0.3,
            ease: 'power2.out',
            onComplete: () => gsap.to(s, { opacity: 0, scale: 0.3, duration: 0.3, onComplete: () => s.remove() })
          });
        });
        gsap.fromTo(target, { scale: 0.5, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: 'back.out(1.5)' });
      } else {
        gsap.fromTo(ring, { opacity: 1, scale: 3 }, { opacity: 0, scale: 0.3, duration: 0.4, ease: 'power2.in', onComplete: () => ring.remove() });
        stars.forEach((s, i) => {
          gsap.fromTo(s, { opacity: 1, scale: 1.5, x: (Math.random() - 0.5) * 50, y: (Math.random() - 0.5) * 40 }, {
            opacity: 0, scale: 0,
            duration: 0.35 + Math.random() * 0.25,
            ease: 'power2.in',
            onComplete: () => s.remove()
          });
        });
        gsap.to(target, { scale: 0.5, opacity: 0, duration: 0.3, ease: 'power2.in', onComplete });
      }
    }

    function syncNightfallToPeer(playerId) {
      if (!peerConn || !peerConn.open || typeof sendToPeer !== 'function') return;
      const container = document.querySelector(`.player-zone[data-player="${playerId}"] .nightfall-indicator`);
      if (!container) return;
      const input = container.querySelector('.nightfall-input');
      sendToPeer({ type: 'nightfall-value', playerId, value: input ? input.value : '0' });
    }

    function applyRemoteNightfall(playerId, active, value) {
      const zone = document.querySelector(`.player-zone[data-player="${playerId}"]`);
      if (!zone) return;
      nightfallActive[playerId] = active;
      const existing = zone.querySelector('.nightfall-indicator');
      if (active) {
        if (!existing) _toggleNightfall(playerId, true);
        if (value !== undefined) {
          const input = zone.querySelector('.nightfall-input');
          if (input) input.value = value;
        }
      } else {
        if (existing) _toggleNightfall(playerId, false);
      }
    }

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

      // 占卜模式：选择牌手头像
      if (targetingMode === 'divine') {
        const avatar = e.target.closest('.player-avatar');
        if (avatar) {
          const playerId = avatar.dataset.avatarPlayer;
          const myPid = localPlayerId || '1';
          if (typeof openDivineXPrompt === 'function') {
            openDivineXPrompt(playerId, myPid);
          }
          exitTargetingMode();
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        exitTargetingMode();
        return;
      }

      // 入夜 / 赏金 / 启悟 / 命运抉择：选择牌手头像
      if (targetingMode === 'nightfall' || targetingMode === 'bounty' || targetingMode === 'oracle' || targetingMode === 'fate') {
        const avatar = e.target.closest('.player-avatar');
        if (avatar) {
          const playerId = avatar.dataset.avatarPlayer;
          const myPid = localPlayerId || '1';
          const isHelp = playerId !== myPid;
          const myName = getPlayerName(myPid);
          const tgtName = getPlayerName(playerId);

          if (targetingMode === 'nightfall') {
            nightfallActive[playerId] = !nightfallActive[playerId];
            _toggleNightfall(playerId, nightfallActive[playerId]);
            if (peerConn && peerConn.open && typeof sendToPeer === 'function') {
              sendToPeer({ type: 'nightfall-toggle', playerId, active: nightfallActive[playerId] });
            }
            const verb = nightfallActive[playerId] ? '开启了' : '关闭了';
            const msg = isHelp ? `【系统】${myName}为${tgtName}${verb}入夜` : `【系统】${tgtName}${verb}入夜`;
            broadcastSystemMsg(msg);
          } else if (targetingMode === 'bounty') {
            bountyActive[playerId] = !bountyActive[playerId];
            _toggleBounty(playerId, bountyActive[playerId]);
            if (peerConn && peerConn.open && typeof sendToPeer === 'function') {
              sendToPeer({ type: 'bounty-toggle', playerId, active: bountyActive[playerId] });
            }
            const verb = bountyActive[playerId] ? '开启了' : '关闭了';
            const msg = isHelp ? `【系统】${myName}为${tgtName}${verb}赏金` : `【系统】${tgtName}${verb}赏金`;
            broadcastSystemMsg(msg);
          } else if (targetingMode === 'oracle') {
            if (typeof toggleOracle === 'function') toggleOracle(playerId, myPid);
          } else if (targetingMode === 'fate') {
            if (typeof openFateDialog === 'function') openFateDialog(playerId);
            // 命运抉择内部已有广播
          }
          exitTargetingMode();
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        exitTargetingMode();
        return;
      }

      // 烹饪模式：选择一个式神
      if (targetingMode === 'cook') {
        const slot = e.target.closest('.card-slot');
        if (slot && slot.classList.contains('has-image') && typeof performCooking === 'function') {
          performCooking(slot);
          exitTargetingMode();
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        exitTargetingMode();
        return;
      }

      // 倒计时 / 能量 / 气绝 / 灵咒 / 重置属性 模式
      if (targetingMode === 'countdown' || targetingMode === 'energy' || targetingMode === 'ko' || targetingMode === 'curse' || targetingMode === 'reset-stats') {
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
          } else if (targetingMode === 'reset-stats') {
            if (typeof resetToPermStats === 'function') {
              const oldAtk = slot.querySelector('.card-attack').value || '0';
              const oldHp = slot.querySelector('.card-hp').value || '0';
              resetToPermStats(slot);
              const newAtk = slot.querySelector('.card-attack').value || '0';
              const newHp = slot.querySelector('.card-hp').value || '0';
              const cardName = slot.querySelector('.card-name').value || '未命名';
              const userName = localPlayerId ? getPlayerName(localPlayerId) : '玩家';
              broadcastSystemMsg(`【系统】${userName}重置了「${cardName}」的属性（${oldAtk}/${oldHp} → ${newAtk}/${newHp}）`);
            }
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

    // ---- 倒计时 / 能量 开关逻辑（兼容：可同时存在）----
    function applyToggleBadge(slot, mode) {
      if (!slot.classList.contains('has-image')) return;
      const hasCountdown = slot.querySelector('.card-badge--countdown');
      const hasEnergy = slot.querySelector('.card-badge--energy');

      if (mode === 'countdown') {
        if (hasCountdown) {
          removeCountdownBadge(slot);
        } else {
          const badge = createCountdownBadge('1');
          // 确保倒计时在能量之前（CSS 兄弟选择器依赖此顺序）
          if (hasEnergy) {
            slot.insertBefore(badge, hasEnergy);
          } else {
            slot.appendChild(badge);
          }
        }
      } else { // energy
        if (hasEnergy) {
          removeEnergyBadge(slot);
        } else {
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
        // 先摘除气绝遮罩（避免同步残留），保留引用播动画
        const koOverlay = slot.querySelector('.ko-overlay');
        if (koOverlay) koOverlay.remove();
        if (typeof DamageEffects !== 'undefined' && DamageEffects.playReviveEffect) {
          DamageEffects.playReviveEffect(slot, koOverlay);
        }
        // 【联机同步】通知对方播放复活动画
        if (typeof sendToPeer === 'function' && peerConn && peerConn.open) {
          sendToPeer({ type: 'fx-revive', playerId: slot.dataset.slotPlayer, slotIndex: parseInt(slot.dataset.slotIndex, 10) });
        }
      } else {
        createKoOverlay(slot, '3');
        // 气绝时重置到基础属性
        const cardName = slot.querySelector('.card-name')?.value || '';
        if (cardName && typeof CardDB !== 'undefined') {
          const dbCard = CardDB.lookup(cardName);
          if (dbCard) {
            if (dbCard.attack !== undefined) {
              slot.querySelector('.card-attack').value = dbCard.attack;
            }
            if (dbCard.hp !== undefined) {
              slot.querySelector('.card-hp').value = dbCard.hp;
            }
          }
        }
        // 恢复永久加成
        if (typeof resetToPermStats === 'function') {
          resetToPermStats(slot);
        }
        // 【特效】气绝动画
        if (typeof DamageEffects !== 'undefined' && DamageEffects.playKoEffect) {
          setTimeout(() => DamageEffects.playKoEffect(slot), 50);
        }
        // 【联机同步】通知对方播放气绝动画
        if (typeof sendToPeer === 'function' && peerConn && peerConn.open) {
          sendToPeer({ type: 'fx-ko', playerId: slot.dataset.slotPlayer, slotIndex: parseInt(slot.dataset.slotIndex, 10) });
        }
      }
      syncSlotToPeer(slot);
      const cardName = slot.querySelector('.card-name').value || '未命名卡牌';
      const sourceLabel = getDamageSourceLabel();
      const verb = hadKo ? '复活了' : '使';
      const suffix = hadKo ? '。' : '进入了气绝。';
      broadcastSystemMsg(`【系统】${sourceLabel}${verb}「${cardName}」${suffix}`);
      // 通知效果引擎
      if (typeof EventBus !== 'undefined') {
        if (hadKo) {
          EventBus.emit('shikigami_revived', {
            playerId: slot.dataset.slotPlayer,
            slotIndex: parseInt(slot.dataset.slotIndex, 10),
            slot: slot
          });
        } else {
          EventBus.emit('shikigami_ko', {
            playerId: slot.dataset.slotPlayer,
            slotIndex: parseInt(slot.dataset.slotIndex, 10),
            slot: slot,
            killer: null
          });
        }
      }
    }

    function applyDamageToPlayer(playerId, dmg) {
      const zone = document.querySelector(`.player-zone[data-player="${playerId}"]`);
      if (!zone) return;
      const hpInput = zone.querySelector('.player-hp-input');
      const currentHp = parseInt(hpInput.value, 10) || 0;
      const newHp = Math.max(0, currentHp - dmg);
      hpInput.value = newHp || '';
      // 【特效】伤害动画（定位在牌手头像中心）
      if (typeof DamageEffects !== 'undefined') {
        const avatar = zone.querySelector('.player-avatar');
        const targetEl = avatar || zone;
        DamageEffects.playDamage(targetEl, dmg, 'damage');
      }
      syncPlayerInfo(playerId);
      broadcastSystemMsg(`【系统】${getDamageSourceLabel()}对${getPlayerName(playerId)}造成了${dmg}点伤害`);
      // 【联机】始终通知对方播放伤害动画
      if (peerConn && peerConn.open && typeof sendToPeer === 'function') {
        sendToPeer({ type: 'player-damage', playerId, dmg });
      }
      // 通知效果引擎
      if (typeof EventBus !== 'undefined') {
        EventBus.emit('damage_dealt', {
          source: { playerId: localPlayerId || '1' },
          target: { playerId: playerId, type: 'player' },
          amount: dmg
        });
      }
    }

    function applyHealToPlayer(playerId, amount) {
      const zone = document.querySelector(`.player-zone[data-player="${playerId}"]`);
      if (!zone) return;
      const hpInput = zone.querySelector('.player-hp-input');
      const currentHp = parseInt(hpInput.value, 10) || 0;
      const newHp = currentHp + amount;
      hpInput.value = newHp || '';
      // 【特效】牌手治疗动画（定位在牌手头像中心）
      if (typeof DamageEffects !== 'undefined') {
        const avatar = zone.querySelector('.player-avatar');
        const targetEl = avatar || zone;
        DamageEffects.playDamage(targetEl, amount, 'heal');
      }
      syncPlayerInfo(playerId);
      broadcastSystemMsg(`【系统】${getDamageSourceLabel()}为${getPlayerName(playerId)}恢复了${amount}点生命`);
      // 【联机】始终通知对方播放治疗动画
      if (peerConn && peerConn.open && typeof sendToPeer === 'function') {
        sendToPeer({ type: 'player-heal', playerId, amount });
      }
    }

    function applyDamageToCard(slot, dmg) {
      const hpInput = slot.querySelector('.card-hp');
      const currentHp = parseInt(hpInput.value, 10) || 0;
      const newHp = Math.max(0, currentHp - dmg);
      hpInput.value = newHp || '';
      // 【特效】伤害动画
      if (typeof DamageEffects !== 'undefined') {
        DamageEffects.playDamage(slot, dmg, 'damage');
      }
      const cardName = slot.querySelector('.card-name').value || '未命名卡牌';
      broadcastSystemMsg(`【系统】${getDamageSourceLabel()}对「${cardName}」造成了${dmg}点伤害`);
      // 【联机】同步状态 + 播放伤害动画
      syncSlotToPeer(slot);
      if (peerConn && peerConn.open && typeof sendToPeer === 'function') {
        sendToPeer({ type: 'card-damage', playerId: slot.dataset.slotPlayer, slotIndex: parseInt(slot.dataset.slotIndex, 10), dmg });
      }
      // 通知效果引擎
      if (typeof EventBus !== 'undefined') {
        EventBus.emit('damage_dealt', {
          source: { playerId: localPlayerId || '1' },
          target: {
            playerId: slot.dataset.slotPlayer,
            slotIndex: parseInt(slot.dataset.slotIndex, 10),
            slot: slot,
            type: 'shikigami'
          },
          amount: dmg
        });
        // 如果生命归零且未气绝，进入气绝状态（重置攻防+倒计时）
        if (newHp <= 0 && !slot.querySelector('.ko-overlay')) {
          applyKoToCard(slot);
        }
      }
    }

    function applyHealToCard(slot, amount) {
      const hpInput = slot.querySelector('.card-hp');
      const currentHp = parseInt(hpInput.value, 10) || 0;
      const newHp = currentHp + amount;
      hpInput.value = newHp || '';
      // 【特效】治疗动画
      if (typeof DamageEffects !== 'undefined') {
        DamageEffects.playDamage(slot, amount, 'heal');
      }
      const cardName = slot.querySelector('.card-name').value || '未命名卡牌';
      broadcastSystemMsg(`【系统】${getDamageSourceLabel()}为「${cardName}」恢复了${amount}点生命`);
      // 【联机】同步状态 + 播放治疗动画
      syncSlotToPeer(slot);
      if (peerConn && peerConn.open && typeof sendToPeer === 'function') {
        sendToPeer({ type: 'card-heal', playerId: slot.dataset.slotPlayer, slotIndex: parseInt(slot.dataset.slotIndex, 10), amount });
      }
      // 通知效果引擎
      if (typeof EventBus !== 'undefined') {
        EventBus.emit('heal_applied', {
          source: { playerId: localPlayerId || '1' },
          target: {
            playerId: slot.dataset.slotPlayer,
            slotIndex: parseInt(slot.dataset.slotIndex, 10),
            slot: slot,
            type: 'shikigami'
          },
          amount: amount
        });
      }
    }

    // ---- 添加机制 下拉菜单 ----
    btnMechanicToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      // 互斥：关闭另一个下拉
      const otherMenu = document.getElementById('dropdown-other-menu');
      if (otherMenu) otherMenu.hidden = true;
      dropdownMechanicMenu.hidden = !dropdownMechanicMenu.hidden;
    });

    document.addEventListener('click', () => {
      dropdownMechanicMenu.hidden = true;
    });

    dropdownMechanicMenu.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // ================================================================
