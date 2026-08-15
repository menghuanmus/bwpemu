// ================================================================
//  js/dice.js — 骰子系统与瞄准工具 (JS-4)
//  骰子投掷、伤害/恢复/倒计时/能量/气绝/灵咒的统一瞄准与目标选择
//  依赖: network.js, game-core.js (getSlotCurses等)
// ================================================================

    //  JS-4：骰子系统
    // ================================================================
    const diceMinInput = document.getElementById('dice-min');
    const diceMaxInput = document.getElementById('dice-max');

    function _doRollDice() {
      const min = parseInt(diceMinInput.value, 10);
      const max = parseInt(diceMaxInput.value, 10);
      if (Number.isNaN(min) || Number.isNaN(max)) return;
      const low = Math.min(min, max);
      const high = Math.max(min, max);
      const result = Math.floor(Math.random() * (high - low + 1)) + low;
      const rollerName = localPlayerId ? getPlayerName(localPlayerId) : '玩家';
      const msg = `【系统】${rollerName}骰了随机数${result}（${low}~${high}）`;
      broadcastSystemMsg(msg);
      // 联机同步骰子动画
      sendToPeer({ type: 'dice', rollerName: rollerName, result: result, low: low, high: high });
      // 骰子动画
      var btn = document.getElementById('btn-dice-roll');
      if (btn && typeof playDiceAnim === 'function') playDiceAnim(result, btn);
    }

    function rollDice() {
      if (typeof isSpectator !== 'undefined' && isSpectator) return;
      // 手机端：点击打开骰子面板（面板里投掷）
      if (MOBILE_MQ.matches) { toggleMobileDicePanel(); return; }
      _doRollDice();
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
    let targetingMode = 'damage'; // 'damage' | 'heal' | 'countdown' | 'energy' | 'ko' | 'curse' | 'divine' | 'cook' | 'nightfall' | 'bounty' | 'oracle' | 'fate' | 'reset-stats' | 'charge' | 'turnstart'
    let targetingOrigin = { x: 0, y: 0 };
    const MOBILE_MQ = window.matchMedia('(max-width: 768px)');

    // ---- 伤害/恢复来源 ----
    let damageSourceType = 'player';     // 'player' | 'shikigami'
    let damageSourceName = '';           // 式神卡牌名称（追踪名称而非槽位，换位不丢失）

    const TARGETING_BTN_MAP = {
      damage:    { btn: () => btnDamage,         activeText: '🎯 选择式神…(Esc取消)', idleText: '🎯 选择目标', mobileActiveText: '选择式神<br>造成伤害' },
      heal:      { btn: () => btnDamage,         activeText: '🎯 选择式神…(Esc取消)', idleText: '🎯 选择目标', mobileActiveText: '选择式神<br>恢复治疗' },
      countdown: { btn: () => btnMechanicToggle, activeText: '⏳ 倒计时中…(Esc取消)', idleText: '🔧 机制 ▾', mobileActiveText: '选择式神<br>添加倒计时' },
      energy:    { btn: () => btnMechanicToggle, activeText: '🏮 能量中…(Esc取消)',   idleText: '🔧 机制 ▾', mobileActiveText: '选择式神<br>添加能量' },
      divine:    { btn: () => btnMechanicToggle, activeText: '🔮 选择牌手…(Esc取消)', idleText: '🔧 机制 ▾', mobileActiveText: '选择牌手<br>占卜' },
      cook:      { btn: () => btnMechanicToggle, activeText: '🍳 选择式神…(Esc取消)', idleText: '🔧 机制 ▾', mobileActiveText: '选择式神<br>烹饪' },
      nightfall: { btn: () => btnMechanicToggle, activeText: '🌙 选择牌手…(Esc取消)', idleText: '🔧 机制 ▾', mobileActiveText: '选择牌手<br>添加入夜' },
      bounty:    { btn: () => btnMechanicToggle, activeText: '💰 选择牌手…(Esc取消)', idleText: '🔧 机制 ▾', mobileActiveText: '选择牌手<br>添加赏金' },
      oracle:    { btn: () => btnMechanicToggle, activeText: '✨ 选择牌手…(Esc取消)', idleText: '🔧 机制 ▾', mobileActiveText: '选择牌手<br>启悟' },
      fate:      { btn: () => btnMechanicToggle, activeText: '🔀 选择牌手…(Esc取消)', idleText: '🔧 机制 ▾', mobileActiveText: '选择牌手<br>命运抉择' },
      'reset-stats': { btn: () => btnMechanicToggle, activeText: '🔄 选择式神…(Esc取消)', idleText: '🔧 机制 ▾', mobileActiveText: '选择式神<br>重置属性' },
      turnstart:  { btn: () => btnMechanicToggle, activeText: '🔄 选择牌手…(Esc取消)', idleText: '🔧 机制 ▾', mobileActiveText: '选择牌手<br>回合开始' },
      charge:    { btn: () => btnMechanicToggle, activeText: '⚡ 选择式神…(Esc取消)', idleText: '🔧 机制 ▾', mobileActiveText: '选择式神<br>蓄力' },
      ko:        { btn: () => btnKo,             activeText: '💀 选择式神…(Esc取消)', idleText: '💀 气绝/复活', mobileActiveText: '选择式神<br>气绝/复活' },
      curse:     { btn: () => btnCurse,          activeText: '⛓️ 选择式神…(Esc取消)', idleText: '⛓️ 灵咒', mobileActiveText: '选择式神<br>结附灵咒' },
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
      // 进入瞄准时收起机制菜单（手机端底部弹层）
      if (dropdownMechanicMenu) dropdownMechanicMenu.hidden = true;
      const btn = getActiveTargetingBtn();
      btn.classList.add('active');
      var entry = TARGETING_BTN_MAP[targetingMode];
      if (MOBILE_MQ.matches && entry.mobileActiveText) {
        btn.innerHTML = entry.mobileActiveText;
      } else {
        btn.textContent = entry.activeText;
      }
      document.body.style.cursor = 'crosshair';
    }

    function exitTargetingMode() {
      isTargeting = false;
      const btn = getActiveTargetingBtn();
      btn.classList.remove('active');
      btn.textContent = TARGETING_BTN_MAP[targetingMode].idleText;
      document.body.style.cursor = '';
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

    /** 弹出伤害来源选择菜单（可指定渲染到自定义容器，手机面板复用） */
    function openDamageSourceMenu(targetMenu) {
      const menu = targetMenu || damageSourceMenu;
      menu.innerHTML = '';
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
        menu.hidden = true;
      });
      menu.appendChild(playerItem);

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
          menu.hidden = true;
        });
        menu.appendChild(item);
      });
      menu.hidden = false;
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
      // 手机端：打开/关闭伤害面板
      if (MOBILE_MQ.matches) { toggleMobileDamagePanel(); return; }
      if (isTargeting) { exitTargetingMode(); return; }
      enterTargetingMode(targetingMode === 'heal' ? 'heal' : 'damage');
    });

    /* 伤害/恢复 模式切换（桌面按钮 + 手机面板共用） */
    function toggleDamageMode() {
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
      // 更新手机版按钮文字
      updateMobileDamageLabel();
      // 如果正在瞄准中，更新瞄准按钮文字
      if (isTargeting) {
        btnDamage.textContent = TARGETING_BTN_MAP[targetingMode].activeText;
      }
    }
    btnDamageMode.addEventListener('click', toggleDamageMode);

    /* ═══════ 手机端：伤害/治疗面板 ═══════ */
    let _mdpOpen = false;
    let _mdpHeal = false;
    function updateMobileDamageLabel() {
      if (!MOBILE_MQ.matches) return;
      if (_mdpOpen) { btnDamage.textContent = '关闭'; return; }
      if (isTargeting) return;  // 瞄准中文字由 enter/exit 管理
      // 固定两行文字
      btnDamage.innerHTML = '伤害<br>治疗';
    }
    function _mdpEl(id) { return document.getElementById(id); }
    function _mdpSync() {
      var val = parseInt(damageValueInput.value, 10);
      if (Number.isNaN(val) || val <= 0) val = 1;
      var vEl = _mdpEl('mdp-value'); if (vEl) vEl.value = val;
      var mEl = _mdpEl('mdp-mode');
      if (mEl) {
        mEl.innerHTML = _mdpHeal ? '当前：治疗<br>点击切换为伤害' : '当前：伤害<br>点击切换为治疗';
        mEl.classList.toggle('is-heal', _mdpHeal);
      }
      var sEl = _mdpEl('mdp-source-btn');
      if (sEl) sEl.textContent = (damageSourceType === 'shikigami' && damageSourceName) ? ('⚔ ' + damageSourceName) : '👤 己方牌手';
    }
    function toggleMobileDamagePanel() {
      var panel = _mdpEl('mobile-damage-panel');
      if (!panel) return;
      _mdpOpen = !_mdpOpen;
      panel.hidden = !_mdpOpen;
      if (_mdpOpen) {
        _closeMobileDicePanel();
        _mdpHeal = (targetingMode === 'heal');
        _mdpSync();
        var srcMenu = _mdpEl('mdp-source-menu'); if (srcMenu) srcMenu.hidden = true;
      }
      updateMobileDamageLabel();
    }
    // 创建面板 DOM
    (function() {
      var bar = document.querySelector('.center-dice-bar');
      if (!bar) return;
      var panel = document.createElement('div');
      panel.id = 'mobile-damage-panel';
      panel.className = 'mobile-sub-panel';
      panel.hidden = true;
      panel.innerHTML =
        '<div class="mdp-source">' +
          '<button type="button" class="mdp-source-btn" id="mdp-source-btn">👤 己方牌手</button>' +
          '<div class="mdp-source-menu damage-source__menu" id="mdp-source-menu" hidden></div>' +
        '</div>' +
        '<div class="mdp-row">' +
          '<button type="button" class="mdp-step" id="mdp-minus">−</button>' +
          '<input type="number" class="mdp-value" id="mdp-value" value="1" min="0">' +
          '<button type="button" class="mdp-step" id="mdp-plus">+</button>' +
        '</div>' +
        '<div class="mdp-row">' +
          '<button type="button" class="mdp-mode" id="mdp-mode">⚔ 伤害</button>' +
          '<button type="button" class="mdp-go" id="mdp-go">选择目标</button>' +
        '</div>';
      bar.appendChild(panel);
      // 事件
      panel.addEventListener('click', function(e) { e.stopPropagation(); });
      _mdpEl('mdp-minus').addEventListener('click', function() {
        var cur = parseInt(_mdpEl('mdp-value').value, 10) || 1;
        if (cur > 0) { _mdpEl('mdp-value').value = cur - 1; }
      });
      _mdpEl('mdp-plus').addEventListener('click', function() {
        var cur = parseInt(_mdpEl('mdp-value').value, 10) || 0;
        _mdpEl('mdp-value').value = cur + 1;
      });
      _mdpEl('mdp-mode').addEventListener('click', function() {
        _mdpHeal = !_mdpHeal;
        _mdpSync();
      });
      _mdpEl('mdp-go').addEventListener('click', function() {
        var v = parseInt(_mdpEl('mdp-value').value, 10);
        if (Number.isNaN(v) || v <= 0) v = 1;
        damageValueInput.value = v;
        targetingMode = _mdpHeal ? 'heal' : 'damage';
        _mdpOpen = false;
        _mdpEl('mobile-damage-panel').hidden = true;
        updateMobileDamageLabel();
        enterTargetingMode(targetingMode);
      });
      _mdpEl('mdp-source-btn').addEventListener('click', function() {
        // 复用桌面来源菜单渲染逻辑，渲染到面板内
        var menu = _mdpEl('mdp-source-menu');
        if (!menu) return;
        if (!menu.hidden) { menu.hidden = true; return; }
        openDamageSourceMenu(menu);
      });
      // 来源菜单选择后同步面板按钮文字（只绑定一次）
      var _mdpSrcMenu = _mdpEl('mdp-source-menu');
      if (_mdpSrcMenu) {
        _mdpSrcMenu.addEventListener('click', function() {
          setTimeout(_mdpSync, 0);
          _mdpSrcMenu.hidden = true;
        });
      }
      // 初始化文字
      updateMobileDamageLabel();
    })();

    /* ═══════ 手机端：骰子面板 ═══════ */
    let _dicePanelOpen = false;
    function _closeMobileDicePanel() {
      var p = _mdpEl('mobile-dice-panel');
      if (p) p.hidden = true;
      _dicePanelOpen = false;
      var btn = document.getElementById('btn-dice-roll');
      if (btn && btn.childNodes[0] && btn.childNodes[0].nodeType === 3) btn.childNodes[0].textContent = '骰子';
    }
    function toggleMobileDicePanel() {
      var panel = _mdpEl('mobile-dice-panel');
      if (!panel) return;
      _dicePanelOpen = !_dicePanelOpen;
      panel.hidden = !_dicePanelOpen;
      if (_dicePanelOpen) {
        var p2 = _mdpEl('mobile-damage-panel');
        if (p2 && !p2.hidden) { p2.hidden = true; _mdpOpen = false; updateMobileDamageLabel(); }
        _diceSync();
      }
      var btn = document.getElementById('btn-dice-roll');
      if (btn && btn.childNodes[0] && btn.childNodes[0].nodeType === 3) {
        btn.childNodes[0].textContent = _dicePanelOpen ? '关闭' : '骰子';
      }
    }
    function _diceSync() {
      var mn = parseInt(diceMinInput.value, 10); if (Number.isNaN(mn)) mn = 1;
      var mx = parseInt(diceMaxInput.value, 10); if (Number.isNaN(mx)) mx = 6;
      var a = _mdpEl('dice-p-min'), b = _mdpEl('dice-p-max');
      if (a) a.value = mn; if (b) b.value = mx;
    }
    (function() {
      var bar = document.querySelector('.center-dice-bar');
      if (!bar) return;
      var panel = document.createElement('div');
      panel.id = 'mobile-dice-panel';
      panel.className = 'mobile-sub-panel';
      panel.hidden = true;
      panel.innerHTML =
        '<div class="mdp-row">' +
          '<button type="button" class="mdp-step" id="dice-p-min-minus">−</button>' +
          '<input type="number" class="mdp-value" id="dice-p-min" value="1">' +
          '<button type="button" class="mdp-step" id="dice-p-min-plus">+</button>' +
          '<span class="mdp-sep">~</span>' +
          '<button type="button" class="mdp-step" id="dice-p-max-minus">−</button>' +
          '<input type="number" class="mdp-value" id="dice-p-max" value="6">' +
          '<button type="button" class="mdp-step" id="dice-p-max-plus">+</button>' +
        '</div>' +
        '<div class="mdp-row">' +
          '<button type="button" class="mdp-go" id="dice-p-go">🎲 投掷</button>' +
        '</div>';
      bar.appendChild(panel);
      panel.addEventListener('click', function(e) { e.stopPropagation(); });
      function step(id, delta) {
        var el = _mdpEl(id);
        if (!el) return;
        var cur = parseInt(el.value, 10) || 0;
        el.value = Math.max(0, cur + delta);
      }
      _mdpEl('dice-p-min-minus').addEventListener('click', function() { step('dice-p-min', -1); });
      _mdpEl('dice-p-min-plus').addEventListener('click', function() { step('dice-p-min', 1); });
      _mdpEl('dice-p-max-minus').addEventListener('click', function() { step('dice-p-max', -1); });
      _mdpEl('dice-p-max-plus').addEventListener('click', function() { step('dice-p-max', 1); });
      _mdpEl('dice-p-go').addEventListener('click', function() {
        diceMinInput.value = _mdpEl('dice-p-min').value;
        diceMaxInput.value = _mdpEl('dice-p-max').value;
        _closeMobileDicePanel();
        _doRollDice();
      });
    })();

    // 退出瞄准后恢复手机版文字
    const _origExitTargeting = exitTargetingMode;
    exitTargetingMode = function() {
      _origExitTargeting();
      updateMobileDamageLabel();
      // 手机端：退出瞄准后把被 idleText 恢复的图标文字再清掉
      if (MOBILE_MQ.matches) {
        var mechBtn = document.getElementById('btn-mechanic-toggle');
        if (mechBtn) mechBtn.textContent = '机制 ▾';
        var koBtn = document.getElementById('btn-ko');
        if (koBtn) koBtn.innerHTML = '气绝<br>复活';
        var curseBtn = document.getElementById('btn-curse-target');
        if (curseBtn) curseBtn.textContent = '灵咒';
      }
    };
    // 手机端页面加载时立即更新按钮文字
    updateMobileDamageLabel();

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

    // ---- 回合开始（选择牌手） ----
    const btnTurnStart = document.getElementById('btn-turn-start');
    if (btnTurnStart) {
      btnTurnStart.addEventListener('click', (e) => {
        dropdownMechanicMenu.hidden = true;
        if (isTargeting) { exitTargetingMode(); return; }
        e.stopPropagation();
        enterTargetingMode('turnstart');
      });
    }

    // ---- 蓄力 ----
    const btnCharge = document.getElementById('btn-charge');
    if (btnCharge) {
      btnCharge.addEventListener('click', () => {
        dropdownMechanicMenu.hidden = true;
        if (isTargeting) { exitTargetingMode(); return; }
        enterTargetingMode('charge');
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
      if (typeof isConnected !== "function" || !isConnected() || typeof sendToPeer !== 'function') return;
      const container = document.querySelector(`.player-zone[data-player="${playerId}"] .nightfall-indicator`);
      if (!container) return;
      const input = container.querySelector('.nightfall-input');
      const zone = document.querySelector(`.player-zone[data-player="${playerId}"] .nightfall-indicator`);
      sendToPeer({ type: 'nightfall-toggle', playerId, active: true, value: input ? input.value : '0' });
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

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isTargeting) {
        exitTargetingMode();
      }
    });

    document.addEventListener('click', (e) => {
      if (!isTargeting) return;
      if (typeof isSpectator !== 'undefined' && isSpectator) { exitTargetingMode(); return; }

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

      // 入夜 / 赏金 / 启悟 / 命运抉择 / 回合开始：选择牌手头像
      if (targetingMode === 'nightfall' || targetingMode === 'bounty' || targetingMode === 'oracle' || targetingMode === 'fate' || targetingMode === 'turnstart') {
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
            if (isConnected() && typeof sendToPeer === 'function') {
              sendToPeer({ type: 'nightfall-toggle', playerId, active: nightfallActive[playerId] });
            }
            const verb = nightfallActive[playerId] ? '开启了' : '关闭了';
            const msg = isHelp ? `【系统】${myName}为${tgtName}${verb}入夜` : `【系统】${tgtName}${verb}入夜`;
            broadcastSystemMsg(msg);
          } else if (targetingMode === 'bounty') {
            bountyActive[playerId] = !bountyActive[playerId];
            _toggleBounty(playerId, bountyActive[playerId]);
            if (isConnected() && typeof sendToPeer === 'function') {
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
          } else if (targetingMode === 'turnstart') {
            applyTurnStart(playerId, myPid, isHelp);
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

      // 倒计时 / 能量 / 气绝 / 灵咒 / 重置属性 / 蓄力 模式
      if (targetingMode === 'countdown' || targetingMode === 'energy' || targetingMode === 'ko' || targetingMode === 'curse' || targetingMode === 'reset-stats' || targetingMode === 'charge') {
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
          } else if (targetingMode === 'charge') {
            const playerId = localPlayerId || '1';
            const shikigamiName = slot.querySelector('.card-name').value.trim();
            if (!shikigamiName) {
              exitTargetingMode();
              e.preventDefault();
              e.stopPropagation();
              return;
            }
            // 先退出瞄准，再弹窗输入卡牌名
            exitTargetingMode();
            const savedSlot = slot;
            const savedPlayerId = playerId;
            if (typeof openCardTextDialog === 'function') {
              openCardTextDialog({
                title: '蓄力 — 输入卡牌名',
                placeholder: '输入要蓄力的卡牌名',
                multiline: false,
                hideQuantity: true,
                onConfirm: (text, qty) => {
                  const cardName = text.trim();
                  if (!cardName) return;
                  if (typeof Charge !== 'undefined' && Charge.chargeByName) {
                    Charge.chargeByName(savedSlot, savedPlayerId, cardName);
                  }
                }
              });
            }
            e.preventDefault();
            e.stopPropagation();
            return;
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
          slot._baseCountdown = 0;
        } else {
          const badge = createCountdownBadge('2');   // 默认基础倒计时 2
          // 确保倒计时在能量之前（CSS 兄弟选择器依赖此顺序）
          if (hasEnergy) {
            slot.insertBefore(badge, hasEnergy);
          } else {
            slot.appendChild(badge);
          }
          // 自动勾选面板中的倒计时，基础倒计时默认 2
          slot._baseCountdown = 2;
        }
      } else { // energy
        if (hasEnergy) {
          removeEnergyBadge(slot);
          slot._baseEnergy = 0;
        } else {
          slot.appendChild(createEnergyBadge('0'));   // 默认能量 0
          // 自动勾选面板中的能量，默认 0
          slot._baseEnergy = 0;
        }
      }
      syncSlotToPeer(slot);
      const cardName = slot.querySelector('.card-name').value || '未命名卡牌';
      const userName = localPlayerId ? getPlayerName(localPlayerId) : '玩家';
      const label = mode === 'countdown' ? '倒计时' : '能量';
      broadcastSystemMsg(`【系统】${userName}为「${cardName}」设置了${label}`);
    }

    // ---- 回合开始：气绝/倒计时递减、复活、倒计时重置、能量+1 ----
    function applyTurnStart(playerId, operatorId, isHelp) {
      const zone = document.querySelector('.player-zone[data-player="' + playerId + '"]');
      if (!zone) return;
      const myName = getPlayerName(operatorId || playerId);
      const tgtName = getPlayerName(playerId);
      const msg = isHelp ? `【系统】${myName}触发了${tgtName}的回合开始` : `【系统】${tgtName}触发了回合开始`;
      // 用消息分组收集结算明细（可展开查看）
      if (typeof startMessageGroup === 'function') {
        startMessageGroup(msg, null);
      } else {
        broadcastSystemMsg(msg);
      }

      /** 普通倒计时 -1：动画 + 到期回基础值 + 明细消息 */
      function tickCountdownOnce(slot, cardName) {
        const cdInput = slot.querySelector('.card-badge--countdown input');
        if (!cdInput) return;
        const before = parseInt(cdInput.value, 10) || 0;
        let cdV = before;
        if (cdV > 0) {
          cdV -= 1;
          // 沙漏图标旋转一圈动画
          const cdIcon = slot.querySelector('.card-badge--countdown .badge-icon');
          if (cdIcon) {
            cdIcon.classList.add('spin-once');
            setTimeout(() => cdIcon.classList.remove('spin-once'), 500);
          }
        }
        cdInput.value = cdV;
        broadcastSystemMsg(`【系统】「${cardName}」倒计时 -1（${before} → ${cdV}）`);
        if (cdV <= 0) {
          cdInput.classList.add('turn-bounce');
          setTimeout(() => {
            cdInput.classList.remove('turn-bounce');
            const base = slot._baseCountdown;
            if (base && base > 0) {
              if (typeof updateSlotCountdownBadge === 'function') updateSlotCountdownBadge(slot, String(base));
            } else {
              if (typeof updateSlotCountdownBadge === 'function') updateSlotCountdownBadge(slot, '');
            }
            syncSlotToPeer(slot);
          }, 500);
        }
        syncSlotToPeer(slot);
      }

      const slots = zone.querySelectorAll('.card-slot');
      slots.forEach(slot => {
        if (!slot.classList.contains('has-image')) return;
        const cardName = (slot.querySelector('.card-name')?.value || '').trim() || '未命名';

        // 1) 气绝倒计时 -1，到 0 后 0.5 秒复活
        const koInput = slot.querySelector('.ko-circle input');
        if (koInput) {
          const beforeKo = parseInt(koInput.value, 10) || 0;
          let koV = beforeKo;
          if (koV > 0) {
            koV -= 1;
            // 沙漏图标旋转一圈动画
            const koIcon = slot.querySelector('.ko-circle .ko-icon');
            if (koIcon) {
              koIcon.classList.add('spin-once');
              setTimeout(() => koIcon.classList.remove('spin-once'), 500);
            }
          }
          koInput.value = koV;
          broadcastSystemMsg(`【系统】「${cardName}」气绝倒计时 -1（${beforeKo} → ${koV}）`);
          if (koV <= 0) {
            setTimeout(() => {
              const overlay = slot.querySelector('.ko-overlay');
              if (!overlay) return;
              overlay.remove();
              if (typeof DamageEffects !== 'undefined' && DamageEffects.playReviveEffect) {
                DamageEffects.playReviveEffect(slot, overlay);
              }
              if (typeof sendToPeer === 'function' && isConnected()) {
                sendToPeer({ type: 'fx-revive', playerId: slot.dataset.slotPlayer, slotIndex: parseInt(slot.dataset.slotIndex, 10) });
              }
              syncSlotToPeer(slot);
              broadcastSystemMsg(`【系统】「${cardName}」气绝倒计时结束，复活了`);
              // 复活后：若拥有普通倒计时，再 -1 并作动画
              if (slot.querySelector('.card-badge--countdown')) {
                tickCountdownOnce(slot, cardName);
              }
            }, 500);
          }
          syncSlotToPeer(slot);
          return;   // 气绝中的式神不加能量
        }

        // 2) 普通倒计时 -1，到 0 后放大缩小 0.5 秒，再变回基础倒计时数值
        if (slot.querySelector('.card-badge--countdown')) {
          tickCountdownOnce(slot, cardName);
        }

        // 3) 能量检查：仅未气绝的式神，不满 10 则 +1
        const enInput = slot.querySelector('.card-badge--energy input');
        if (enInput) {
          const beforeEn = parseInt(enInput.value, 10) || 0;
          if (beforeEn < 10) {
            enInput.value = beforeEn + 1;
            // 灯笼图标发光一圈动画
            const enBadge = slot.querySelector('.card-badge--energy');
            if (enBadge) {
              enBadge.classList.add('energy-glow');
              setTimeout(() => enBadge.classList.remove('energy-glow'), 500);
            }
            broadcastSystemMsg(`【系统】「${cardName}」能量 +1（${beforeEn} → ${beforeEn + 1}）`);
            syncSlotToPeer(slot);
          }
        }
      });

      // 结束分组：统一渲染并同步给对方
      if (typeof endMessageGroup === 'function') endMessageGroup();
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
      // 召唤物：先播放气绝动画，再清除卡槽
      if (slot.dataset.slotType === 'summon') {
        const cardName = slot.querySelector('.card-name').value || '未命名召唤物';
        // 检查临时预设中是否有同名预设，没有则自动保存
        if (typeof Presets !== 'undefined' && typeof Presets._hasTempPreset === 'function') {
          if (!Presets._hasTempPreset(cardName)) {
            Presets.saveFromSlot(slot);
          }
        }
        // 播放气绝动画（延迟等动画结束再清槽，避免卡图提前消失）
        if (typeof DamageEffects !== 'undefined' && DamageEffects.playKoEffect) {
          setTimeout(() => DamageEffects.playKoEffect(slot), 50);
        }
        // 联机同步气绝动画
        if (typeof sendToPeer === 'function' && isConnected()) {
          sendToPeer({ type: 'fx-ko', playerId: slot.dataset.slotPlayer, slotIndex: parseInt(slot.dataset.slotIndex, 10) });
        }
        broadcastSystemMsg(`【系统】召唤物「${cardName}」被消灭了`);
        // 延迟清除卡槽，等气绝动画播完
        setTimeout(() => {
          slot.querySelector('.card-name').value = '';
          slot.querySelector('.card-attack').value = '';
          slot.querySelector('.card-hp').value = '';
          slot.querySelector('.card-level').value = '';
          if (typeof clearSlotImage === 'function') clearSlotImage(slot);
          slot.classList.remove('awakened', 'has-image');
          slot._permAtkMods = []; slot._permHpMods = [];
          slot._permAbility = ''; slot._permEffects = [];
          slot._formName = ''; slot._formAtk = 0; slot._formHp = 0; slot._formAbility = '';
          if (typeof renderFormBadge === 'function') renderFormBadge(slot);
          slot._tempAtkMods = []; slot._tempHpMods = [];
          if (typeof setSlotCurses === 'function') setSlotCurses(slot, []);
          if (typeof updateSlotCountdownBadge === 'function') updateSlotCountdownBadge(slot, '');
          if (typeof updateSlotEnergyBadge === 'function') updateSlotEnergyBadge(slot, '');
          if (typeof updateKoOverlay === 'function') updateKoOverlay(slot, '');
          delete slot.dataset.slotType;
          syncSlotToPeer(slot);
        }, 800);
        return;
      }

      const hadKo = !!slot.querySelector('.ko-overlay');
      if (hadKo) {
        // 先摘除气绝遮罩（避免同步残留），保留引用播动画
        const koOverlay = slot.querySelector('.ko-overlay');
        if (koOverlay) koOverlay.remove();
        if (typeof DamageEffects !== 'undefined' && DamageEffects.playReviveEffect) {
          DamageEffects.playReviveEffect(slot, koOverlay);
        }
        // 【联机同步】通知对方播放复活动画
        if (typeof sendToPeer === 'function' && isConnected()) {
          sendToPeer({ type: 'fx-revive', playerId: slot.dataset.slotPlayer, slotIndex: parseInt(slot.dataset.slotIndex, 10) });
        }
      } else {
        createKoOverlay(slot, '3');
        // 气绝时普通倒计时重置为基础值
        if (slot.querySelector('.card-badge--countdown')) {
          const baseCd = slot._baseCountdown || 2;
          if (typeof updateSlotCountdownBadge === 'function') updateSlotCountdownBadge(slot, String(baseCd));
        }
        // 气绝时清除形态，然后重置属性（清临时属性+恢复永久值）
        slot._formName = ''; slot._formAtk = 0; slot._formHp = 0; slot._formAbility = '';
        if (typeof renderFormBadge === 'function') renderFormBadge(slot);
        if (typeof resetToPermStats === 'function') resetToPermStats(slot);
        // 卡图切回基础/觉醒
        if (typeof autoUpdateSlotImage === 'function') autoUpdateSlotImage(slot);
        // 【特效】气绝动画
        if (typeof DamageEffects !== 'undefined' && DamageEffects.playKoEffect) {
          setTimeout(() => DamageEffects.playKoEffect(slot), 50);
        }
        // 【联机同步】通知对方播放气绝动画
        if (typeof sendToPeer === 'function' && isConnected()) {
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
      if (isConnected() && typeof sendToPeer === 'function') {
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
      if (isConnected() && typeof sendToPeer === 'function') {
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
      if (isConnected() && typeof sendToPeer === 'function') {
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
      if (isConnected() && typeof sendToPeer === 'function') {
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
