// ================================================================
//  js/bonus-panel.js — 加成弹窗
//  管理式神的永久属性加成、觉醒能力、效果记录
//  依赖: game-core.js (卡槽函数), CardDB, chat
// ================================================================

const BonusPanel = (() => {
  let overlay, dialog, ctx;

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
    // 加减按钮
    const pm = e.target.closest('.bonus-list-item__pm');
    if (pm) { handlePmClick(pm); return; }
    // 删除按钮
    const del = e.target.closest('.bonus-list-item__del');
    if (del) { handleDelClick(del); return; }
    // 添加永久属性
    if (e.target.id === 'bonus-add-mod') { handleAddMod(); return; }
    // 添加效果
    if (e.target.id === 'bonus-add-effect') { handleAddEffect(); return; }
    // 关闭
    if (e.target.id === 'bonus-close-btn') close();
  }

  function handleBodyChange(e) {
    if (!ctx) return;
    if (e.target.id === 'bonus-ability') {
      ctx.permAbility = e.target.value;
      ctx.slot._permAbility = ctx.permAbility;
      if (ctx.permAbility) ctx.slot.classList.add('awakened');
      syncSlotToPeer(ctx.slot);
    }
  }

  function handlePmClick(pm) {
    if (pm.dataset.modIdx !== undefined) {
      const idx = parseInt(pm.dataset.modIdx, 10);
      const cur = ctx.permAtkMods[idx].layers || 1;
      const newLayers = pm.dataset.action === 'plus' ? cur + 1 : Math.max(1, cur - 1);
      // 记录旧永久值
      const oldAtk = typeof calcPermAtk === 'function' ? calcPermAtk(ctx.slot) : 0;
      const oldHp = typeof calcPermHp === 'function' ? calcPermHp(ctx.slot) : 0;
      ctx.permAtkMods[idx].layers = newLayers;
      ctx.permHpMods[idx].layers = newLayers;
      ctx.slot._permAtkMods = ctx.permAtkMods;
      ctx.slot._permHpMods = ctx.permHpMods;
      applyPermStats(ctx.slot, oldAtk, oldHp);
      broadcastBonusMsg('修改了永久属性层数', `${ctx.permAtkMods[idx].source} ×${newLayers}`);
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
      ctx.permAtkMods.splice(idx, 1);
      ctx.permHpMods.splice(idx, 1);
      ctx.slot._permAtkMods = ctx.permAtkMods;
      ctx.slot._permHpMods = ctx.permHpMods;
      applyPermStats(ctx.slot, oldAtk, oldHp);
      broadcastBonusMsg('移除了永久属性', delSrc);
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
    const exist = ctx.permEffects.find(ef => ef.source === src);
    if (exist) {
      exist.layers = (exist.layers || 1) + 1;
    } else {
      ctx.permEffects.push({ source: src, desc, layers: 1 });
    }
    ctx.slot._permEffects = ctx.permEffects;
    document.getElementById('bonus-effect-source').value = '';
    document.getElementById('bonus-effect-desc').value = '';
    syncSlotToPeer(ctx.slot);
    broadcastBonusMsg('添加了效果记录', src);
    refresh();
  }

  function open(slot) {
    init();
    const playerId = slot.dataset.slotPlayer;
    const cardName = slot.querySelector('.card-name').value || '(未命名)';
    const playerName = typeof getPlayerName === 'function' ? getPlayerName(playerId) : '玩家' + playerId;
    const dbCard = CardDB.lookup(cardName);

    if (typeof recordPermBase === 'function') recordPermBase(slot);

    const permAtkMods = slot._permAtkMods || [];
    const permHpMods = slot._permHpMods || [];
    const permAbility = slot._permAbility || '';
    const permEffects = slot._permEffects || [];

    // 显示永久属性（基础+加成），不是当前临时值
    const permAtk = typeof calcPermAtk === 'function' ? calcPermAtk(slot) : (slot.querySelector('.card-attack').value || '0');
    const permHp = typeof calcPermHp === 'function' ? calcPermHp(slot) : (slot.querySelector('.card-hp').value || '0');

    ctx = { slot, playerId, cardName, playerName, permAtk, permHp, dbCard, permAtkMods, permHpMods, permAbility, permEffects };

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
        <span class="bonus-info__player">${escapeHTML(ctx.playerName)}</span>
        <span class="bonus-info__name">「${escapeHTML(ctx.cardName)}」</span>
        <span class="bonus-info__stats"><span style="color:#ff9070;">⚔ 攻击:${ctx.permAtk}</span> <span style="color:#70d070;">❤ 生命:${ctx.permHp}</span></span>
      </div>

      <!-- 能力修改 -->
      <div class="bonus-section">
        <div class="bonus-section__label">📝 觉醒能力</div>
        <textarea id="bonus-ability" class="bonus-ability-input" placeholder="${escapeHTML(ability)}" rows="3">${escapeHTML(ctx.permAbility)}</textarea>
      </div>

      <!-- 永久属性改变 -->
      <div class="bonus-section">
        <div class="bonus-section__label">⚔️ 永久属性改变</div>
        <div class="bonus-add-row">
          <input type="text" id="bonus-mod-source" placeholder="来源（如: 觉醒·妖刀姬）" maxlength="30" style="flex:3;">
          <label class="bonus-inline-label">攻击</label>
          <input type="number" id="bonus-mod-atk" value="0" min="-99" max="99">
          <label class="bonus-inline-label">生命</label>
          <input type="number" id="bonus-mod-hp" value="0" min="-99" max="99">
          <button type="button" class="bonus-btn bonus-btn--add" id="bonus-add-mod">确定</button>
        </div>
        <div class="bonus-list" id="bonus-mod-list">
          ${renderModList()}
        </div>
      </div>

      <!-- 效果记录 -->
      <div class="bonus-section">
        <div class="bonus-section__label">📋 效果记录</div>
        <div class="bonus-add-row">
          <input type="text" id="bonus-effect-source" placeholder="来源" maxlength="30" class="flex-06">
          <input type="text" id="bonus-effect-desc" placeholder="效果描述" maxlength="100" class="flex-14">
          <button type="button" class="bonus-btn bonus-btn--add" id="bonus-add-effect">确定</button>
        </div>
        <div class="bonus-list" id="bonus-effect-list">
          ${renderEffectList()}
        </div>
      </div>

      <div class="bonus-actions">
        <button type="button" class="bonus-btn bonus-btn--close" id="bonus-close-btn">关闭</button>
      </div>
    `;

    // 事件已通过一次性委托处理，不需要重复绑定
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { open, close };
})();
