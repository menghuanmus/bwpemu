// ================================================================
//  js/bonus-panel.js — 加成弹窗
//  管理式神的永久属性加成、觉醒能力、效果记录
//  依赖: game-core.js (卡槽函数), CardDB, chat
// ================================================================

const BonusPanel = (() => {
  let overlay, dialog, ctx;

  // 快捷关键词列表（按用户指定顺序）
  const QUICK_KEYWORDS = [
    '眩晕','庇佑','屏障','昂扬','迅捷','不屈','远程',
    '连击','暴击','先攻','贯通','直击','吸血','穿刺',
    '帷幕','追猎','必杀','意志'
  ];

  function init() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'bonus-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="bonus-dialog">
        <div class="bonus-dialog__header">
          <span class="bonus-dialog__title">💠 加成弹窗</span>
          <button type="button" class="bonus-dialog__close" title="关闭">✕</button>
        </div>
        <div class="bonus-dialog__body" id="bonus-body"></div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('.bonus-dialog__close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        const picker = document.getElementById('bonus-keyword-picker');
        if (picker) picker.style.display = 'none';
      }
    });
    // 一次性事件委托：所有按钮通过 body 代理
    setupGlobalDelegation();
  }

  let _delegationReady = false;

  function setupGlobalDelegation() {
    if (_delegationReady) return;
    const body = document.getElementById('bonus-body');
    if (!body) return;
    body.addEventListener('click', handleBodyClick);
    body.addEventListener('change', handleBodyChange);
    _delegationReady = true;
  }

  function handleBodyClick(e) {
    if (!ctx) return;
    const pm = e.target.closest('.bonus-list-item__pm');
    if (pm) { handlePmClick(pm); return; }
    const del = e.target.closest('.bonus-list-item__del');
    if (del) { handleDelClick(del); return; }
    if (e.target.id === 'bonus-add-mod') { handleAddMod(); return; }
    if (e.target.id === 'bonus-add-effect') { handleAddEffect(); return; }
    if (e.target.id === 'bonus-add-temp') { handleAddTemp(); return; }
    if (e.target.id === 'bonus-equip-form') { handleEquipForm(); return; }
    if (e.target.id === 'bonus-lose-form') { handleLoseForm(); return; }
    if (e.target.id === 'bonus-close-btn') close();
    if (e.target.id === 'bonus-quick-keyword') { toggleKeywordPicker(); return; }
    if (e.target.classList.contains('bonus-keyword-btn')) { handleQuickKeyword(e.target.textContent); return; }
  }

  function handleBodyChange(e) {
    if (!ctx) return;
    if (e.target.id === 'bonus-ability') {
      ctx.permAbility = e.target.value;
      ctx.slot._permAbility = ctx.permAbility;
      if (ctx.permAbility) ctx.slot.classList.add('awakened');
      syncSlotToPeer(ctx.slot);
    }
    if (e.target.id === 'bonus-form-atk-active' || e.target.id === 'bonus-form-hp-active') {
      const newAtk = parseInt(document.getElementById('bonus-form-atk-active').value, 10) || 0;
      const newHp = parseInt(document.getElementById('bonus-form-hp-active').value, 10) || 0;
      ctx.formAtk = newAtk; ctx.formHp = newHp;
      ctx.slot._formAtk = newAtk; ctx.slot._formHp = newHp;
      if (typeof recordPermBase === 'function') recordPermBase(ctx.slot);
      const curAtk = parseInt(ctx.slot.querySelector('.card-attack').value, 10) || 0;
      const oldFullAtk = typeof calcFullAtk === 'function' ? calcFullAtk(ctx.slot) : curAtk;
      const manualAtk = curAtk - oldFullAtk;
      const newFullAtk = (typeof calcFullAtk === 'function' ? calcFullAtk(ctx.slot) : 0) + manualAtk;
      const newFullHp = typeof calcFullHp === 'function' ? calcFullHp(ctx.slot) : 0;
      ctx.slot.querySelector('.card-attack').value = newFullAtk || '';
      ctx.slot.querySelector('.card-hp').value = newFullHp || '';
      syncSlotToPeer(ctx.slot);
      broadcastBonusMsg('修改了形态属性', `${ctx.formName}（攻击${newAtk}，生命${newHp}）`);
    }
  }

  function handlePmClick(pm) {
    if (pm.dataset.modIdx !== undefined) {
      const idx = parseInt(pm.dataset.modIdx, 10);
      const cur = ctx.permAtkMods[idx].layers || 1;
      const newLayers = pm.dataset.action === 'plus' ? cur + 1 : Math.max(1, cur - 1);
      const oldAtk = typeof calcPermAtk === 'function' ? calcPermAtk(ctx.slot) : 0;
      const oldHp = typeof calcPermHp === 'function' ? calcPermHp(ctx.slot) : 0;
      ctx.permAtkMods[idx].layers = newLayers;
      ctx.permHpMods[idx].layers = newLayers;
      ctx.slot._permAtkMods = ctx.permAtkMods; ctx.slot._permHpMods = ctx.permHpMods;
      applyPermStats(ctx.slot, oldAtk, oldHp);
      syncSlotToPeer(ctx.slot);
      broadcastBonusMsg('修改了永久属性层数', `${ctx.permAtkMods[idx].source} ×${newLayers}`);
      refresh();
    } else if (pm.dataset.tempIdx !== undefined) {
      const idx = parseInt(pm.dataset.tempIdx, 10);
      const cur = ctx.tempAtkMods[idx].layers || 1;
      const newLayers = pm.dataset.action === 'plus' ? cur + 1 : Math.max(1, cur - 1);
      const oldFullAtk = typeof calcFullAtk === 'function' ? calcFullAtk(ctx.slot) : 0;
      const oldFullHp = typeof calcFullHp === 'function' ? calcFullHp(ctx.slot) : 0;
      ctx.tempAtkMods[idx].layers = newLayers;
      ctx.tempHpMods[idx].layers = newLayers;
      ctx.slot._tempAtkMods = ctx.tempAtkMods; ctx.slot._tempHpMods = ctx.tempHpMods;
      applyStatsChange(ctx.slot, oldFullAtk, oldFullHp);
      syncSlotToPeer(ctx.slot);
      broadcastBonusMsg('修改了临时属性层数', `${ctx.tempAtkMods[idx].source} ×${newLayers}`);
      refresh();
    } else if (pm.dataset.effectIdx !== undefined) {
      const idx = parseInt(pm.dataset.effectIdx, 10);
      const cur = ctx.permEffects[idx].layers || 1;
      ctx.permEffects[idx].layers = pm.dataset.action === 'plus' ? cur + 1 : Math.max(1, cur - 1);
      ctx.slot._permEffects = ctx.permEffects;
      syncSlotToPeer(ctx.slot);
      broadcastBonusMsg('修改了效果记录层数', `${ctx.permEffects[idx].source} ×${ctx.permEffects[idx].layers}`);
      refresh();
    }
  }

  function handleDelClick(del) {
    if (del.dataset.modIdx !== undefined) {
      const idx = parseInt(del.dataset.modIdx, 10);
      const delSrc = ctx.permAtkMods[idx].source;
      const oldAtk = typeof calcPermAtk === 'function' ? calcPermAtk(ctx.slot) : 0;
      const oldHp = typeof calcPermHp === 'function' ? calcPermHp(ctx.slot) : 0;
      ctx.permAtkMods.splice(idx, 1); ctx.permHpMods.splice(idx, 1);
      ctx.slot._permAtkMods = ctx.permAtkMods; ctx.slot._permHpMods = ctx.permHpMods;
      applyPermStats(ctx.slot, oldAtk, oldHp);
      syncSlotToPeer(ctx.slot);
      broadcastBonusMsg('移除了永久属性', delSrc);
    } else if (del.dataset.tempIdx !== undefined) {
      const idx = parseInt(del.dataset.tempIdx, 10);
      const delSrc = ctx.tempAtkMods[idx].source;
      const oldFullAtk = typeof calcFullAtk === 'function' ? calcFullAtk(ctx.slot) : 0;
      const oldFullHp = typeof calcFullHp === 'function' ? calcFullHp(ctx.slot) : 0;
      ctx.tempAtkMods.splice(idx, 1); ctx.tempHpMods.splice(idx, 1);
      ctx.slot._tempAtkMods = ctx.tempAtkMods; ctx.slot._tempHpMods = ctx.tempHpMods;
      applyStatsChange(ctx.slot, oldFullAtk, oldFullHp);
      syncSlotToPeer(ctx.slot);
      broadcastBonusMsg('移除了临时属性', delSrc);
    } else if (del.dataset.effectIdx !== undefined) {
      const idx = parseInt(del.dataset.effectIdx, 10);
      const delSrc = ctx.permEffects[idx].source;
      ctx.permEffects.splice(idx, 1);
      ctx.slot._permEffects = ctx.permEffects;
      syncSlotToPeer(ctx.slot);
      broadcastBonusMsg('移除了效果记录', delSrc);
    }
    refresh();
  }

  function handleAddMod() {
    const src = document.getElementById('bonus-mod-source').value.trim();
    const atk = parseInt(document.getElementById('bonus-mod-atk').value, 10) || 0;
    const hp = parseInt(document.getElementById('bonus-mod-hp').value, 10) || 0;
    if (!src || (atk === 0 && hp === 0)) return;
    const oldAtk = typeof calcPermAtk === 'function' ? calcPermAtk(ctx.slot) : 0;
    const oldHp = typeof calcPermHp === 'function' ? calcPermHp(ctx.slot) : 0;
    let idx = ctx.permAtkMods.findIndex(m => m.source === src);
    if (idx < 0) idx = ctx.permHpMods.findIndex(m => m.source === src);
    if (idx >= 0) {
      ctx.permAtkMods[idx].layers = (ctx.permAtkMods[idx].layers || 1) + 1;
      ctx.permHpMods[idx].layers = ctx.permAtkMods[idx].layers;
    } else {
      ctx.permAtkMods.push({ source: src, value: atk, layers: 1 });
      ctx.permHpMods.push({ source: src, value: hp, layers: 1 });
    }
    ctx.slot._permAtkMods = ctx.permAtkMods;
    ctx.slot._permHpMods = ctx.permHpMods;
    document.getElementById('bonus-mod-source').value = '';
    document.getElementById('bonus-mod-atk').value = '0';
    document.getElementById('bonus-mod-hp').value = '0';
    applyPermStats(ctx.slot, oldAtk, oldHp);
    syncSlotToPeer(ctx.slot);
    const atkStr = atk !== 0 ? `攻击${atk >= 0 ? '+' : ''}${atk}` : '';
    const hpStr = hp !== 0 ? `生命${hp >= 0 ? '+' : ''}${hp}` : '';
    const detail = [atkStr, hpStr].filter(Boolean).join('，');
    broadcastBonusMsg('添加了永久属性', `${src}（${detail}）`);
    refresh();
  }

  function handleAddEffect() {
    const src = document.getElementById('bonus-effect-source').value.trim();
    const desc = document.getElementById('bonus-effect-desc').value.trim();
    if (!src || !desc) return;
    addEffectRecord(src, desc);
  }

  function addEffectRecord(src, desc) {
    const exist = ctx.permEffects.find(ef => ef.source === src);
    if (exist) {
      exist.layers = (exist.layers || 1) + 1;
    } else {
      ctx.permEffects.push({ source: src, desc, layers: 1 });
    }
    ctx.slot._permEffects = ctx.permEffects;
    document.getElementById('bonus-effect-source').value = '';
    if (document.getElementById('bonus-effect-desc')) document.getElementById('bonus-effect-desc').value = '';
    syncSlotToPeer(ctx.slot);
    broadcastBonusMsg('添加了效果记录', src);
    refresh();
  }

  function toggleKeywordPicker() {
    const picker = document.getElementById('bonus-keyword-picker');
    if (!picker) return;
    if (picker.style.display === 'none') {
      // 动态生成关键词按钮
      picker.innerHTML = QUICK_KEYWORDS.map(kw => {
        const dbKw = typeof CardDB !== 'undefined' && CardDB.lookupKeyword ? CardDB.lookupKeyword(kw) : null;
        const tip = dbKw ? dbKw.effect : '';
        return `<button type="button" class="bonus-keyword-btn" title="${escapeHTML(tip)}">${escapeHTML(kw)}</button>`;
      }).join('');
      picker.style.display = 'grid';
    } else {
      picker.style.display = 'none';
    }
  }

  function handleQuickKeyword(name) {
    if (!name) return;
    const dbKw = typeof CardDB !== 'undefined' && CardDB.lookupKeyword ? CardDB.lookupKeyword(name) : null;
    const desc = dbKw ? dbKw.effect : name;
    addEffectRecord(name, desc);
    // 关闭下拉
    const picker = document.getElementById('bonus-keyword-picker');
    if (picker) picker.style.display = 'none';
  }

  function open(slot) {
    // 观众禁止打开加成弹窗（双重保险）
    if (typeof isSpectator !== 'undefined' && isSpectator) return;
    init();
    const playerId = slot.dataset.slotPlayer;
    const cardName = slot.querySelector('.card-name').value || '(未命名)';
    const playerName = typeof getPlayerName === 'function' ? getPlayerName(playerId) : '玩家' + playerId;
    const dbCard = CardDB.lookup(cardName);
    if (typeof recordPermBase === 'function') recordPermBase(slot);

    ctx = {
      slot, playerId, cardName, playerName, dbCard,
      permAtkMods: slot._permAtkMods || [], permHpMods: slot._permHpMods || [],
      permAbility: slot._permAbility || '', permEffects: slot._permEffects || [],
      tempAtkMods: slot._tempAtkMods || [], tempHpMods: slot._tempHpMods || [],
      formName: slot._formName || '', formAtk: slot._formAtk || 0, formHp: slot._formHp || 0,
      formAbility: slot._formAbility || '',
      permAtk: typeof calcPermAtk === 'function' ? calcPermAtk(slot) : 0,
      permHp: typeof calcPermHp === 'function' ? calcPermHp(slot) : 0,
    };

    render();
    overlay.hidden = false;
    overlay.style.display = 'flex';
  }

  function close() {
    overlay.hidden = true;
    overlay.style.display = 'none';
    ctx = null;
  }

  function render() {
    const body = document.getElementById('bonus-body');
    const ability = ctx.permAbility || (ctx.dbCard ? (ctx.dbCard.ability || '') : '');

    body.innerHTML = `
      <div class="bonus-info">
        <span class="bonus-info__name">「${escapeHTML(ctx.cardName)}」</span>
        <span class="bonus-info__stats"><span style="color:#ff9070;">⚔ 攻击:${ctx.permAtk}</span> <span style="color:#70d070;">❤ 生命:${ctx.permHp}</span></span>
      </div>

      <div class="bonus-columns">
        <!-- 左栏 -->
        <div class="bonus-col">
          <!-- 觉醒能力 -->
          <div class="bonus-section">
            <div class="bonus-section__label">📝 觉醒能力</div>
            <textarea id="bonus-ability" class="bonus-ability-input" placeholder="${escapeHTML(ability)}" rows="3">${escapeHTML(ctx.permAbility)}</textarea>
          </div>
          <!-- 永久属性 -->
          <div class="bonus-section">
            <div class="bonus-section__label">⚔️ 永久属性</div>
            <div class="bonus-add-row">
              <input type="text" id="bonus-mod-source" placeholder="来源" maxlength="30" style="flex:3;">
              <label class="bonus-inline-label">攻击</label>
              <input type="number" id="bonus-mod-atk" value="0" min="-99" max="99">
              <label class="bonus-inline-label">生命</label>
              <input type="number" id="bonus-mod-hp" value="0" min="-99" max="99">
              <button type="button" class="bonus-btn bonus-btn--add" id="bonus-add-mod">确定</button>
            </div>
            <div class="bonus-list" id="bonus-mod-list">${renderModList()}</div>
          </div>
          <!-- 效果记录 -->
          <div class="bonus-section">
            <div class="bonus-section__label">📋 效果记录 <button type="button" id="bonus-quick-keyword" class="bonus-btn--keyword">+快捷关键词</button></div>
            <div id="bonus-keyword-picker" class="bonus-keyword-picker" style="display:none;"></div>
            <div class="bonus-add-row">
              <input type="text" id="bonus-effect-source" placeholder="来源" maxlength="30" class="flex-06">
              <input type="text" id="bonus-effect-desc" placeholder="效果描述" maxlength="100" class="flex-14">
              <button type="button" class="bonus-btn bonus-btn--add" id="bonus-add-effect">确定</button>
            </div>
            <div class="bonus-list" id="bonus-effect-list">${renderEffectList()}</div>
          </div>
        </div>
        <!-- 右栏 -->
        <div class="bonus-col">
          <!-- 形态 -->
          <div class="bonus-section">
            <div class="bonus-section__label">🎴 形态</div>
            ${renderFormSection()}
          </div>
          <!-- 临时属性 -->
          <div class="bonus-section">
            <div class="bonus-section__label">⏳ 临时属性</div>
            <div class="bonus-add-row">
              <input type="text" id="bonus-temp-source" placeholder="来源" maxlength="30" style="flex:3;">
              <label class="bonus-inline-label">攻击</label>
              <input type="number" id="bonus-temp-atk" value="0" min="-99" max="99">
              <label class="bonus-inline-label">生命</label>
              <input type="number" id="bonus-temp-hp" value="0" min="-99" max="99">
              <button type="button" class="bonus-btn bonus-btn--add" id="bonus-add-temp">确定</button>
            </div>
            <div class="bonus-list" id="bonus-temp-list">${renderTempList()}</div>
          </div>
        </div>
      </div>

      <div class="bonus-actions">
        <button type="button" class="bonus-btn bonus-btn--close" id="bonus-close-btn">关闭</button>
      </div>
    `;
  }

  function renderFormSection() {
    if (ctx.formName) {
      return `<div class="bonus-form-active">
        <div class="bonus-form-info"><strong>${escapeHTML(ctx.formName)}</strong> <span style="color:#ff9070;">⚔ 攻击:</span><input type="number" id="bonus-form-atk-active" value="${ctx.formAtk}" min="0" max="99" class="bonus-form-stat-input"> <span style="color:#70d070;">❤ 生命:</span><input type="number" id="bonus-form-hp-active" value="${ctx.formHp}" min="0" max="99" class="bonus-form-stat-input"></div>
        <div class="bonus-form-ability">${escapeHTML(ctx.formAbility) || '无效果描述'}</div>
        <button type="button" class="bonus-btn bonus-btn--add" id="bonus-lose-form">失去形态</button>
      </div>`;
    }
    return `<div class="bonus-form-empty">
      <div class="bonus-add-row">
        <input type="text" id="bonus-form-name" placeholder="形态名称" maxlength="30" style="flex:2;">
        <label class="bonus-inline-label">攻击</label>
        <input type="number" id="bonus-form-atk" value="0" min="0" max="99">
        <label class="bonus-inline-label">生命</label>
        <input type="number" id="bonus-form-hp" value="0" min="0" max="99">
      </div>
      <textarea id="bonus-form-ability" class="bonus-ability-input" placeholder="形态效果" rows="2" style="margin:4px 0;"></textarea>
      <button type="button" class="bonus-btn bonus-btn--add" id="bonus-equip-form">结附形态</button>
    </div>`;
  }

  function renderTempList() {
    const mods = [];
    for (let i = 0; i < Math.max(ctx.tempAtkMods.length, ctx.tempHpMods.length); i++) {
      const am = ctx.tempAtkMods[i] || { source: '', value: 0, layers: 1 };
      const hm = ctx.tempHpMods[i] || { source: '', value: 0, layers: 1 };
      const src = am.source || hm.source || '';
      if (!src && am.value === 0 && hm.value === 0) continue;
      const layers = am.layers || hm.layers || 1;
      const layersText = layers > 1 ? ` ×${layers}` : '';
      mods.push(`<div class="bonus-list-item">
        <span class="bonus-list-item__source">${escapeHTML(src)}${layersText}：</span>
        <span class="bonus-list-item__val">攻击${am.value >= 0 ? '+' : ''}${am.value}</span>
        <span class="bonus-list-item__val">生命${hm.value >= 0 ? '+' : ''}${hm.value}</span>
        <span class="bonus-list-item__pm-group">
          <button type="button" class="bonus-list-item__pm bonus-list-item__pm--plus" data-temp-idx="${i}" data-action="plus">+</button>
          <button type="button" class="bonus-list-item__pm bonus-list-item__pm--minus" data-temp-idx="${i}" data-action="minus"${layers <= 1 ? ' disabled' : ''}>−</button>
        </span>
        <button type="button" class="bonus-list-item__del" data-temp-idx="${i}">✕</button>
      </div>`);
    }
    return mods.join('') || '<div class="bonus-list-empty">暂无</div>';
  }

  function renderModList() {
    const mods = [];
    for (let i = 0; i < Math.max(ctx.permAtkMods.length, ctx.permHpMods.length); i++) {
      const am = ctx.permAtkMods[i] || { source: '', value: 0, layers: 1 };
      const hm = ctx.permHpMods[i] || { source: '', value: 0, layers: 1 };
      const src = am.source || hm.source || '';
      if (!src && am.value === 0 && hm.value === 0) continue;
      const layers = am.layers || hm.layers || 1;
      const layersText = layers > 1 ? ` ×${layers}` : '';
      // 单层数值
      const atkBase = am.value || 0;
      const hpBase = hm.value || 0;
      mods.push(`<div class="bonus-list-item">
        <span class="bonus-list-item__source">${escapeHTML(src)}${layersText}：</span>
        <span class="bonus-list-item__val">攻击${atkBase >= 0 ? '+' : ''}${atkBase}</span>
        <span class="bonus-list-item__val">生命${hpBase >= 0 ? '+' : ''}${hpBase}</span>
        <span class="bonus-list-item__pm-group">
          <button type="button" class="bonus-list-item__pm bonus-list-item__pm--plus" data-mod-idx="${i}" data-action="plus">+</button>
          <button type="button" class="bonus-list-item__pm bonus-list-item__pm--minus" data-mod-idx="${i}" data-action="minus"${layers <= 1 ? ' disabled' : ''}>−</button>
        </span>
        <button type="button" class="bonus-list-item__del" data-mod-idx="${i}">✕</button>
      </div>`);
    }
    return mods.join('') || '<div class="bonus-list-empty">暂无</div>';
  }

  function renderEffectList() {
    if (!ctx.permEffects.length) return '<div class="bonus-list-empty">暂无</div>';
    return ctx.permEffects.map((ef, i) => {
      const layers = ef.layers || 1;
      const layersText = layers > 1 ? ` ×${layers}` : '';
      return `<div class="bonus-list-item bonus-list-item--effect">
        <span class="bonus-list-item__source">${escapeHTML(ef.source)}${layersText}：</span>
        <span class="bonus-list-item__desc">${escapeHTML(ef.desc)}</span>
        <span class="bonus-list-item__pm-group">
          <button type="button" class="bonus-list-item__pm bonus-list-item__pm--plus" data-effect-idx="${i}" data-action="plus">+</button>
          <button type="button" class="bonus-list-item__pm bonus-list-item__pm--minus" data-effect-idx="${i}" data-action="minus"${layers <= 1 ? ' disabled' : ''}>−</button>
        </span>
        <button type="button" class="bonus-list-item__del" data-effect-idx="${i}">✕</button>
      </div>`;
    }).join('');
  }

  function refresh() {
    ctx.permAtk = typeof calcPermAtk === 'function' ? calcPermAtk(ctx.slot) : ctx.permAtk;
    ctx.permHp = typeof calcPermHp === 'function' ? calcPermHp(ctx.slot) : ctx.permHp;
    render();
  }

  function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function broadcastBonusMsg(action, detail) {
    if (!ctx) return;
    const name = ctx.cardName || '未命名';
    broadcastSystemMsg(`【系统】${ctx.playerName}为「${name}」${action}${detail ? '：' + detail : ''}`);
  }

  function handleAddTemp() {
    const src = document.getElementById('bonus-temp-source').value.trim();
    const atk = parseInt(document.getElementById('bonus-temp-atk').value, 10) || 0;
    const hp = parseInt(document.getElementById('bonus-temp-hp').value, 10) || 0;
    if (!src || (atk === 0 && hp === 0)) return;
    const oldFullAtk = typeof calcFullAtk === 'function' ? calcFullAtk(ctx.slot) : 0;
    const oldFullHp = typeof calcFullHp === 'function' ? calcFullHp(ctx.slot) : 0;
    let idx = ctx.tempAtkMods.findIndex(m => m.source === src);
    if (idx < 0) idx = ctx.tempHpMods.findIndex(m => m.source === src);
    if (idx >= 0) {
      ctx.tempAtkMods[idx].layers = (ctx.tempAtkMods[idx].layers || 1) + 1;
      ctx.tempHpMods[idx].layers = ctx.tempAtkMods[idx].layers;
    } else {
      ctx.tempAtkMods.push({ source: src, value: atk, layers: 1 });
      ctx.tempHpMods.push({ source: src, value: hp, layers: 1 });
    }
    ctx.slot._tempAtkMods = ctx.tempAtkMods; ctx.slot._tempHpMods = ctx.tempHpMods;
    document.getElementById('bonus-temp-source').value = '';
    document.getElementById('bonus-temp-atk').value = '0';
    document.getElementById('bonus-temp-hp').value = '0';
    if (typeof applyStatsChange === 'function') applyStatsChange(ctx.slot, oldFullAtk, oldFullHp);
    syncSlotToPeer(ctx.slot);
    const atkStr = atk !== 0 ? `攻击${atk >= 0 ? '+' : ''}${atk}` : '';
    const hpStr = hp !== 0 ? `生命${hp >= 0 ? '+' : ''}${hp}` : '';
    broadcastBonusMsg('添加了临时属性', `${src}（${[atkStr, hpStr].filter(Boolean).join('，')}）`);
    refresh();
  }

  function handleEquipForm() {
    const name = document.getElementById('bonus-form-name').value.trim();
    const atk = parseInt(document.getElementById('bonus-form-atk').value, 10) || 0;
    const hp = parseInt(document.getElementById('bonus-form-hp').value, 10) || 0;
    const ability = document.getElementById('bonus-form-ability').value.trim();
    if (!name || (atk === 0 && hp === 0)) return;
    ctx.formName = name; ctx.formAtk = atk; ctx.formHp = hp; ctx.formAbility = ability;
    ctx.slot._formName = name; ctx.slot._formAtk = atk; ctx.slot._formHp = hp; ctx.slot._formAbility = ability;
    if (typeof recordPermBase === 'function') recordPermBase(ctx.slot);
    const curAtk = parseInt(ctx.slot.querySelector('.card-attack').value, 10) || 0;
    const oldFullAtk = typeof calcFullAtk === 'function' ? calcFullAtk(ctx.slot) : curAtk;
    const manualAtk = curAtk - oldFullAtk;
    const newFullAtk = (typeof calcFullAtk === 'function' ? calcFullAtk(ctx.slot) : atk) + manualAtk;
    const newFullHp = typeof calcFullHp === 'function' ? calcFullHp(ctx.slot) : hp;
    ctx.slot.querySelector('.card-attack').value = newFullAtk || '';
    ctx.slot.querySelector('.card-hp').value = newFullHp || '';
    syncSlotToPeer(ctx.slot);
    broadcastBonusMsg('结附了形态', `${name}（攻击${atk}，生命${hp}）`);
    refresh();
  }

  function handleLoseForm() {
    ctx.formName = ''; ctx.formAtk = 0; ctx.formHp = 0; ctx.formAbility = '';
    ctx.slot._formName = ''; ctx.slot._formAtk = 0; ctx.slot._formHp = 0; ctx.slot._formAbility = '';
    if (typeof recordPermBase === 'function') recordPermBase(ctx.slot);
    const curAtk = parseInt(ctx.slot.querySelector('.card-attack').value, 10) || 0;
    const oldFullAtk = typeof calcFullAtk === 'function' ? calcFullAtk(ctx.slot) : curAtk;
    const manualAtk = curAtk - oldFullAtk;
    const newFullAtk = (typeof calcFullAtk === 'function' ? calcFullAtk(ctx.slot) : 0) + manualAtk;
    const newFullHp = typeof calcFullHp === 'function' ? calcFullHp(ctx.slot) : 0;
    ctx.slot.querySelector('.card-attack').value = newFullAtk || '';
    ctx.slot.querySelector('.card-hp').value = newFullHp || '';
    syncSlotToPeer(ctx.slot);
    broadcastBonusMsg('失去了形态', '');
    refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { open, close };
})();
