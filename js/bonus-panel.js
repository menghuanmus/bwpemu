// ================================================================
//  js/bonus-panel.js — 加成弹窗
//  管理式神的永久属性加成、觉醒能力、效果记录
//  依赖: game-core.js (卡槽函数), CardDB, chat
// ================================================================

const BonusPanel = (() => {
  let overlay, dialog, ctx;

  // 属性图标
  const IMG = (typeof IMAGE_BASE!=='undefined'?IMAGE_BASE:'') + '/images';
  const ATK_ICON = '<img src="' + IMG + '/属性/攻击.png" class="bonus-stat-icon" alt="攻">';
  const HP_ICON = '<img src="' + IMG + '/属性/生命.png" class="bonus-stat-icon" alt="命">';

  // 快捷关键词列表（按用户指定顺序）
  const QUICK_KEYWORDS = [
    '眩晕','庇佑','屏障','昂扬','迅捷','不屈','远程',
    '连击','暴击','先攻','贯通','直击','吸血','穿刺',
    '帷幕','追猎','必杀','意志','激怒','坚毅'
  ];

  function init() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'bonus-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="bonus-dialog">
        <div class="bonus-dialog__header">
          <span class="bonus-dialog__title">💠 式神管理</span>
          <button type="button" class="bonus-dialog__close" title="关闭">✕</button>
        </div>
        <div class="bonus-dialog__body" id="bonus-body"></div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('.bonus-dialog__close').addEventListener('click', close);
    // 手机端：拦截弹窗外滑动，防止滚动穿透到战场（弹窗内正常滚动）
    if (!window._bonusOverlayTouchBound) {
      window._bonusOverlayTouchBound = true;
      overlay.addEventListener('touchmove', function(e) {
        if (e.target.closest && e.target.closest('.bonus-dialog')) return;
        e.preventDefault();
      }, { passive: false });
    }
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
    // 觉醒牌名输入框：每次输入都即时查图
    body.addEventListener('input', function(e) {
      if (e.target.id !== 'bonus-awaken-name' || !ctx) return;
      handleAwakenNameInput(e.target.value);
    });
    _delegationReady = true;
  }

  /** 护甲/战力 − / + 按钮：增减数值并同步战场徽章 */
  function _stepStatus(slot, key, delta) {
    let v = (slot[key] || 0) + delta;
    if (v > 99) v = 99;
    if (v < -99) v = -99;
    slot[key] = v;
    const input = document.getElementById(key === '_armor' ? 'bonus-armor' : 'bonus-power');
    if (input) input.value = v;
    if (typeof updateStatusBadges === 'function') updateStatusBadges(slot);
    if (typeof syncSlotToPeer === 'function') syncSlotToPeer(slot);
  }

  function handleBodyClick(e) {
    if (!ctx) return;
    if (e.target.classList.contains('bonus-tab')) {
      switchBonusTab(e.target.dataset.bonusTab);
      return;
    }
    const pm = e.target.closest('.bonus-list-item__pm');
    if (pm) { handlePmClick(pm); return; }
    const del = e.target.closest('.bonus-list-item__del');
    if (del) { handleDelClick(del); return; }
    if (e.target.id === 'bonus-add-mod') { handleAddMod(); return; }
    if (e.target.id === 'bonus-add-effect') { handleAddEffect(); return; }
    if (e.target.id === 'bonus-add-temp') { handleAddTemp(); return; }
    if (e.target.id === 'bonus-power-minus') { _stepStatus(ctx.slot, '_power', -1); return; }
    if (e.target.id === 'bonus-power-plus') { _stepStatus(ctx.slot, '_power', 1); return; }
    if (e.target.id === 'bonus-armor-minus') { _stepStatus(ctx.slot, '_armor', -1); return; }
    if (e.target.id === 'bonus-armor-plus') { _stepStatus(ctx.slot, '_armor', 1); return; }
    if (e.target.id === 'bonus-equip-form') { handleEquipForm(); return; }
    if (e.target.id === 'bonus-lose-form') { handleLoseForm(); return; }
    if (e.target.id === 'bonus-close-btn') close();
    if (e.target.id === 'bonus-delete-slot') { handleDeleteSlot(); return; }
    if (e.target.id === 'bonus-change-image') { handleChangeImage(); return; }
    if (e.target.id === 'bonus-quick-keyword') { toggleKeywordPicker(); return; }
    if (e.target.classList.contains('bonus-awaken-btn')) { handleQuickAwaken(e.target.dataset.awakenName); return; }
    if (e.target.classList.contains('bonus-keyword-btn')) { handleQuickKeyword(e.target.textContent); return; }
    if (e.target.classList.contains('bonus-faction-btn')) { handleFactionClick(e.target); return; }
    if (e.target.id === 'bonus-quick-form') { toggleFormPicker(); return; }
    if (e.target.id === 'bonus-quick-awaken') { toggleAwakenPicker(); return; }
    if (e.target.classList.contains('bonus-form-btn')) { handleQuickForm(e.target.dataset.formName); return; }
  }

  function handleBodyChange(e) {
    if (!ctx) return;
    if (typeof isSpectator !== 'undefined' && isSpectator) return;
    if (e.target.id === 'bonus-is-awakened') {
      if (e.target.checked) { ctx.slot.classList.add('awakened'); }
      else { ctx.slot.classList.remove('awakened'); }
      syncSlotToPeer(ctx.slot);
      // 觉醒状态变化 → 重查卡图（觉醒图 > 默认图）
      if (typeof autoUpdateSlotImage === 'function') autoUpdateSlotImage(ctx.slot);
      render();   // 重绘，切换基础/觉醒能力输入框和等级框样式
    }
    if (e.target.id === 'bonus-base-ability') {
      ctx.slot._baseAbility = e.target.value;
      syncSlotToPeer(ctx.slot);
    }
    if (e.target.id === 'bonus-awaken-ability') {
      ctx.permAbility = e.target.value;
      ctx.slot._permAbility = ctx.permAbility;
      syncSlotToPeer(ctx.slot);
    }
    if (e.target.id === 'bonus-is-summon') {
      ctx.slot.dataset.slotType = e.target.checked ? 'summon' : 'shikigami';
      const levelBadge = ctx.slot.querySelector('.card-badge--level');
      if (levelBadge) levelBadge.style.display = e.target.checked ? 'none' : '';
      syncSlotToPeer(ctx.slot);
    }
    if (e.target.id === 'bonus-has-countdown') {
      const baseInput = document.getElementById('bonus-base-countdown');
      let baseVal = baseInput ? (parseInt(baseInput.value, 10) || 0) : 0;
      if (baseVal < 1) baseVal = ctx.slot._baseCountdown || 2;
      ctx.slot._baseCountdown = baseVal;
      if (e.target.checked) {
        if (typeof updateSlotCountdownBadge === 'function') updateSlotCountdownBadge(ctx.slot, String(baseVal));
      } else {
        if (typeof updateSlotCountdownBadge === 'function') updateSlotCountdownBadge(ctx.slot, '');
      }
      syncSlotToPeer(ctx.slot);
    }
    if (e.target.id === 'bonus-base-countdown') {
      let v = parseInt(e.target.value, 10);
      if (Number.isNaN(v) || v < 1) v = 2;
      ctx.slot._baseCountdown = v;
      // 同步修改倒计时角标中的数字
      if (ctx.slot.querySelector('.card-badge--countdown') && typeof updateSlotCountdownBadge === 'function') {
        updateSlotCountdownBadge(ctx.slot, String(v));
      }
      syncSlotToPeer(ctx.slot);
    }
    if (e.target.id === 'bonus-has-energy') {
      ctx.slot._baseEnergy = 0;
      if (e.target.checked) {
        if (typeof updateSlotEnergyBadge === 'function') updateSlotEnergyBadge(ctx.slot, '0');
      } else {
        if (typeof updateSlotEnergyBadge === 'function') updateSlotEnergyBadge(ctx.slot, '');
      }
      syncSlotToPeer(ctx.slot);
    }
    if (e.target.id === 'bonus-base-atk') {
      const raw = e.target.value.trim();
      const v = raw === '' ? null : parseInt(raw, 10);
      ctx.slot._baseAtk = (Number.isNaN(v) || v < 0) ? null : v;
      syncSlotToPeer(ctx.slot);
    }
    if (e.target.id === 'bonus-base-hp') {
      const raw = e.target.value.trim();
      const v = raw === '' ? null : parseInt(raw, 10);
      ctx.slot._baseHp = (Number.isNaN(v) || v < 0) ? null : v;
      syncSlotToPeer(ctx.slot);
    }
    if (e.target.id === 'bonus-armor') {
      let v = parseInt(e.target.value, 10);
      if (Number.isNaN(v)) v = 0;
      ctx.slot._armor = v;
      if (typeof updateStatusBadges === 'function') updateStatusBadges(ctx.slot);
      syncSlotToPeer(ctx.slot);
    }
    if (e.target.id === 'bonus-power') {
      let v = parseInt(e.target.value, 10);
      if (Number.isNaN(v)) v = 0;
      ctx.slot._power = v;
      if (typeof updateStatusBadges === 'function') updateStatusBadges(ctx.slot);
      syncSlotToPeer(ctx.slot);
    }
    if (e.target.id === 'bonus-form-atk-active' || e.target.id === 'bonus-form-hp-active') {
      const newAtk = parseInt(document.getElementById('bonus-form-atk-active').value, 10) || 0;
      const newHp = parseInt(document.getElementById('bonus-form-hp-active').value, 10) || 0;
      // 先按“修改前”的形态算出手动攻差值（避免差值把改动吃掉）
      var curAtk2 = parseInt(ctx.slot.querySelector('.card-attack').value, 10) || 0;
      var oldFullAtk2 = typeof calcFullAtk === 'function' ? calcFullAtk(ctx.slot) : curAtk2;
      var manualAtk2 = curAtk2 - oldFullAtk2;
      ctx.formAtk = newAtk; ctx.formHp = newHp;
      ctx.slot._formAtk = newAtk; ctx.slot._formHp = newHp;
      if (typeof recordPermBase === 'function') recordPermBase(ctx.slot);
      var newFullAtk2 = (typeof calcFullAtk === 'function' ? calcFullAtk(ctx.slot) : newAtk) + manualAtk2;
      var newFullHp2 = typeof calcFullHp === 'function' ? calcFullHp(ctx.slot) : newHp;
      ctx.slot.querySelector('.card-attack').value = newFullAtk2 || '';
      ctx.slot.querySelector('.card-hp').value = newFullHp2 || '';
      syncSlotToPeer(ctx.slot);
      if (typeof autoUpdateSlotImage === 'function') autoUpdateSlotImage(ctx.slot);
      if (typeof renderFormBadge === 'function') renderFormBadge(ctx.slot);
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
    if (!src) return;
    const oldAtk = typeof calcPermAtk === 'function' ? calcPermAtk(ctx.slot) : 0;
    const oldHp = typeof calcPermHp === 'function' ? calcPermHp(ctx.slot) : 0;
    let idx = ctx.permAtkMods.findIndex(m => m.source === src);
    if (idx < 0) idx = ctx.permHpMods.findIndex(m => m.source === src);
    if (idx >= 0) {
      const atkVal = (ctx.permAtkMods[idx] || {}).value || 0;
      const hpVal = (ctx.permHpMods[idx] || {}).value || 0;
      if (atkVal === atk && hpVal === hp) {
        // 来源和数值都相同 → 叠加层数
        ctx.permAtkMods[idx].layers = (ctx.permAtkMods[idx].layers || 1) + 1;
        ctx.permHpMods[idx].layers = ctx.permAtkMods[idx].layers;
      } else {
        // 来源相同但数值不同 → 新增一项
        ctx.permAtkMods.push({ source: src, value: atk, layers: 1 });
        ctx.permHpMods.push({ source: src, value: hp, layers: 1 });
      }
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
    // 来源和描述都相同才叠加；描述不同则新增一项
    const exist = ctx.permEffects.find(ef => ef.source === src && ef.desc === desc);
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
    const picker = document.getElementById('bonus-keyword-picker');
    if (picker) picker.style.display = 'none';
  }

  function handleFactionClick(btn) {
    if (!ctx || (typeof isSpectator !== 'undefined' && isSpectator)) return;
    const faction = btn.textContent.trim();
    ctx.faction = faction;
    ctx.slot.dataset.slotFaction = faction;
    const factionIcon = ctx.slot.querySelector('.card-faction-icon');
    if (factionIcon) {
      if (faction && faction !== '无相') {
        factionIcon.src = 'images/派系/' + faction + '.png';
        factionIcon.style.display = '';
      } else {
        factionIcon.style.display = 'none';
      }
    }
    syncSlotToPeer(ctx.slot);
    refresh();
  }

  // 查找该式神的所有形态
  function _findShikigamiForms(shikigamiName) {
    if (typeof CardDB === 'undefined' || !CardDB.isReady()) return [];
    var all = CardDB.getAll();
    var forms = [];
    for (var i = 0; i < all.length; i++) {
      var card = all[i];
      if (card.type === 'form' && card.owner === shikigamiName) {
        forms.push(card);
      }
    }
    return forms;
  }

  function toggleFormPicker() {
    var picker = document.getElementById('bonus-form-picker');
    if (!picker) return;
    if (picker.style.display === 'none') {
      var forms = _findShikigamiForms(ctx.cardName);
      if (forms.length === 0) {
        picker.innerHTML = '<div class="bonus-list-empty" style="grid-column:1/-1;text-align:center;padding:8px;">该式神暂无形态记录</div>';
      } else {
        picker.innerHTML = forms.map(function(f) {
          var atk = f.attack || 0;
          var hp = f.hp || 0;
          var ab = f.effect || '';
          return '<button type="button" class="bonus-form-btn" data-form-name="' + escapeHTML(f.name) + '" title="' + escapeHTML('攻' + atk + ' 命' + hp + (ab ? ' ' + ab : '')) + '">' + escapeHTML(f.name) + '</button>';
        }).join('');
      }
      picker.style.display = 'grid';
    } else {
      picker.style.display = 'none';
    }
  }

  /** 查找该式神的全部觉醒牌 */
  function _findAwakenCards(shikigamiName) {
    const all = (typeof CardDB !== 'undefined' && typeof CardDB.getAll === 'function') ? CardDB.getAll() : [];
    // 名字比较时统一・与·，避免新旧字符不一致导致匹配失败
    const norm = s => (s || '').replace(/・/g, '·');
    const target = norm(shikigamiName);
    return all.filter(c => c.awakened && norm(c.owner) === target && (c.type === 'spell' || c.type === '法术' || c.type === 'realm' || c.type === 'battle' || c.type === 'form'));
  }

  /** 快捷觉醒选择器（跟快捷形态/关键词一样先弹出选择） */
  function toggleAwakenPicker() {
    const picker = document.getElementById('bonus-awaken-picker');
    if (!picker) return;
    if (picker.style.display === 'none') {
      const cards = _findAwakenCards(ctx.cardName);
      if (!cards.length) {
        // 无觉醒牌：在面板里提示，不发系统消息
        picker.innerHTML = '<div class="bonus-list-empty" style="grid-column:1/-1;text-align:center;padding:8px;">该式神暂无觉醒记录</div>';
        picker.style.display = 'grid';
        return;
      }
      picker.innerHTML = cards.map(function(a) {
        const bonus = (a.atkBonus || a.hpBonus) ? `（攻击${a.atkBonus > 0 ? '+' : ''}${a.atkBonus || 0}，生命${a.hpBonus > 0 ? '+' : ''}${a.hpBonus || 0}）` : '';
        return '<button type="button" class="bonus-keyword-btn bonus-awaken-btn" data-awaken-name="' + escapeHTML(a.name) + '" title="' + escapeHTML(a.name + bonus) + '">' + escapeHTML(a.name) + '</button>';
      }).join('');
      picker.style.display = 'grid';
    } else {
      picker.style.display = 'none';
    }
  }

  function handleQuickAwaken(awakenName) {
    if (!ctx || !awakenName) return;
    const awaken = _findAwakenCards(ctx.cardName).find(c => c.name === awakenName);
    if (!awaken) { broadcastBonusMsg('未找到觉醒牌', ''); return; }
    // 自动勾选觉醒 + 写入觉醒能力 + 自动填入觉醒牌名（相同则不变）
    ctx.slot.classList.add('awakened');
    ctx.slot._awakenCardName = awakenName;
    const rawEffect = awaken.effect || '';
    const awIdx = rawEffect.indexOf('觉醒：');
    ctx.permAbility = awIdx >= 0 ? rawEffect.slice(awIdx + 3).trim() : rawEffect;
    ctx.slot._permAbility = ctx.permAbility;
    // 每次快捷觉醒都叠加觉醒牌给予的永久属性（同源同数值叠层 ×N；没有加攻/命则不加）
    // 注意：只有法术牌觉醒才给予永久属性加成，战斗/形态/幻境觉醒不叠加
    if ((awaken.type === 'spell' || awaken.type === '法术') && (awaken.atkBonus || awaken.hpBonus)) {
      const awakenSource = awaken.name.includes('觉醒') ? awaken.name : `${awaken.name}（觉醒）`;
      const atkVal = awaken.atkBonus || 0;
      const hpVal = awaken.hpBonus || 0;
      const oldAtk = typeof calcPermAtk === 'function' ? calcPermAtk(ctx.slot) : 0;
      const oldHp = typeof calcPermHp === 'function' ? calcPermHp(ctx.slot) : 0;
      let stackIdx = ctx.permAtkMods.findIndex(m => m.source === awakenSource && (m.value || 0) === atkVal);
      if (stackIdx >= 0) {
        const hm = ctx.permHpMods[stackIdx] || {};
        if ((hm.value || 0) !== hpVal) stackIdx = -1;
      }
      if (stackIdx >= 0) {
        // 已有相同来源相同数值的条目 → 层数 +1
        ctx.permAtkMods[stackIdx].layers = (ctx.permAtkMods[stackIdx].layers || 1) + 1;
        ctx.permHpMods[stackIdx].layers = ctx.permAtkMods[stackIdx].layers;
      } else {
        ctx.permAtkMods.push({ source: awakenSource, value: atkVal, layers: 1 });
        ctx.permHpMods.push({ source: awakenSource, value: hpVal, layers: 1 });
      }
      ctx.slot._permAtkMods = ctx.permAtkMods;
      ctx.slot._permHpMods = ctx.permHpMods;
      if (typeof applyPermStats === 'function') applyPermStats(ctx.slot, oldAtk, oldHp);
      ctx.permAtk = typeof calcPermAtk === 'function' ? calcPermAtk(ctx.slot) : 0;
      ctx.permHp = typeof calcPermHp === 'function' ? calcPermHp(ctx.slot) : 0;
    }
    syncSlotToPeer(ctx.slot);
    if (typeof autoUpdateSlotImage === 'function') autoUpdateSlotImage(ctx.slot);
    broadcastBonusMsg('快捷觉醒了', awaken.name);
    const picker = document.getElementById('bonus-awaken-picker');
    if (picker) picker.style.display = 'none';
    render();
  }

  /** 觉醒牌名输入变化：记录名字，按名字在该式神文件夹下找图（找到就换，找不到不动） */
  function handleAwakenNameInput(val) {
    const name = (val || '').trim();
    ctx.slot._awakenCardName = name;
    if (typeof syncSlotToPeer === 'function') syncSlotToPeer(ctx.slot);
    if (!name) return;
    // 文件夹：召唤物用所属式神文件夹，其余用自己的名字
    let folder = ctx.cardName;
    const dbCard = (typeof CardDB !== 'undefined' && CardDB.lookup) ? CardDB.lookup(ctx.cardName) : null;
    if (ctx.slot.dataset.slotType === 'summon' && dbCard && dbCard.owner) folder = dbCard.owner;
    const url = (window._IMAGE_BASE || '') + '/images/' + folder + '/' + name + '.png';
    const testImg = new Image();
    testImg.onload = function() {
      // 输入可能又变了，只有仍一致才换图
      if ((ctx.slot._awakenCardName || '').trim() !== name) return;
      if (typeof setSlotImage === 'function') setSlotImage(ctx.slot, url);
      if (typeof syncSlotToPeer === 'function') syncSlotToPeer(ctx.slot);
    };
    testImg.src = url;
  }

  function handleQuickForm(formName) {    if (!formName || !ctx) return;
    var forms = _findShikigamiForms(ctx.cardName);
    var found = null;
    for (var i = 0; i < forms.length; i++) {
      if (forms[i].name === formName) { found = forms[i]; break; }
    }
    if (!found) return;
    ctx.formName = found.name;
    ctx.formAtk = found.attack || 0;
    ctx.formHp = found.hp || 0;
    ctx.formAbility = found.effect || '';
    if (typeof window.equipFormOnSlot === 'function') {
      window.equipFormOnSlot(ctx.slot, ctx.formName, ctx.formAtk, ctx.formHp, ctx.formAbility);
    } else {
      ctx.slot._formName = ctx.formName;
      ctx.slot._formAtk = ctx.formAtk;
      ctx.slot._formHp = ctx.formHp;
      ctx.slot._formAbility = ctx.formAbility;
      syncSlotToPeer(ctx.slot);
      if (typeof autoUpdateSlotImage === 'function') autoUpdateSlotImage(ctx.slot);
      if (typeof renderFormBadge === 'function') renderFormBadge(ctx.slot);
    }
    broadcastBonusMsg('快捷结附了形态', ctx.formName);
    var picker = document.getElementById('bonus-form-picker');
    if (picker) picker.style.display = 'none';
    refresh();
  }

  function open(slot) {
    // 观众禁止打开加成弹窗（双重保险）
    if (typeof isSpectator !== 'undefined' && isSpectator) return;
    init();
    currentMobileTab = 'stats';   // 每次打开回到属性页
    const playerId = slot.dataset.slotPlayer;
    const cardName = slot.querySelector('.card-name').value || '(未命名)';
    const playerName = typeof getPlayerName === 'function' ? getPlayerName(playerId) : '玩家' + playerId;
    const dbCard = CardDB.lookup(cardName);
    if (typeof recordPermBase === 'function') recordPermBase(slot);
    // 基础能力：还没填过时，把数据库能力直接写进输入框（作为可编辑内容，而非占位提示）
    if (slot._baseAbility === undefined) slot._baseAbility = (dbCard && dbCard.ability) ? dbCard.ability : '';

    ctx = {
      slot, playerId, cardName, playerName, dbCard,
      faction: slot.dataset.slotFaction || (dbCard && dbCard.faction) || '无相',
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

  /** 手机端 Tab 切换 */
  let currentMobileTab = 'stats';   // 记住当前页签，重绘后不跳转
  function switchBonusTab(tabName) {
    currentMobileTab = tabName;
    document.querySelectorAll('.bonus-tab').forEach(function(t) {
      t.classList.toggle('active', t.dataset.bonusTab === tabName);
    });
    document.querySelectorAll('.bonus-tab-panel').forEach(function(p) {
      p.classList.toggle('active', p.dataset.bonusPanel === tabName);
    });
  }

  function render() {
    const body = document.getElementById('bonus-body');

    // 手机端：Tab 分页结构；桌面端：两栏结构
    if (window.matchMedia('(max-width: 768px)').matches) {
      body.innerHTML = _renderMobile();
    } else {
      body.innerHTML = _renderDesktop();
    }
  }

  /** 基础攻/命 + 护甲/战力输入区（属性页签顶部） */
  function _baseStatHTML() {
    const baseAtk = ctx.slot._baseAtk !== undefined && ctx.slot._baseAtk !== null ? ctx.slot._baseAtk : '';
    const baseHp = ctx.slot._baseHp !== undefined && ctx.slot._baseHp !== null ? ctx.slot._baseHp : '';
    const armor = ctx.slot._armor || 0;
    const power = ctx.slot._power || 0;
    return `<div class="bonus-base-stats">
      <div class="bonus-base-row">
        <span class="bonus-base-label">基础攻击：</span>
        <input type="number" id="bonus-base-atk" class="bonus-form-stat-input" value="${baseAtk}" min="0" max="99" placeholder="未设置">
        <span class="bonus-base-label">基础生命：</span>
        <input type="number" id="bonus-base-hp" class="bonus-form-stat-input" value="${baseHp}" min="0" max="99" placeholder="未设置">
      </div>
      <div class="bonus-base-row">
        <span class="bonus-base-label">战力：</span>
        <button type="button" class="bonus-stepper-btn" id="bonus-power-minus" title="战力−1">−</button>
        <input type="number" id="bonus-power" class="bonus-form-stat-input" value="${power}" min="-99" max="99" placeholder="0">
        <button type="button" class="bonus-stepper-btn" id="bonus-power-plus" title="战力+1">＋</button>
        <span class="bonus-base-note">（负数则为乏力）</span>
      </div>
      <div class="bonus-base-row">
        <span class="bonus-base-label">护甲：</span>
        <button type="button" class="bonus-stepper-btn" id="bonus-armor-minus" title="护甲−1">−</button>
        <input type="number" id="bonus-armor" class="bonus-form-stat-input" value="${armor}" min="-99" max="99" placeholder="0">
        <button type="button" class="bonus-stepper-btn" id="bonus-armor-plus" title="护甲+1">＋</button>
        <span class="bonus-base-note">（负数则为破甲）</span>
      </div>
    </div>`;
  }

  /** 手机端：Tab 分页（属性/能力/形态/效果），弹窗不整体滚动 */
  function _renderMobile() {
    const hasCountdown = !!ctx.slot.querySelector('.card-badge--countdown');
    const hasEnergy = !!ctx.slot.querySelector('.card-badge--energy');
    const baseCountdown = ctx.slot._baseCountdown || 2;
    const awakened = ctx.slot.classList.contains('awakened');
    const baseAbilitySaved = ctx.slot._baseAbility !== undefined ? ctx.slot._baseAbility : '';
    const awakenAbility = ctx.slot._permAbility || '';
    const awakenCardName = ctx.slot._awakenCardName || ('觉醒·' + ctx.cardName);

    const factionHTML = `<div class="bonus-faction-row">
      ${['苍叶','红莲','青岚','紫岩','无相'].map(function(f) {
        return '<button type="button" class="bonus-faction-btn' + (ctx.faction === f ? ' active' : '') + '">' + f + '</button>';
      }).join('')}
      <label class="bonus-summon-label"><input type="checkbox" id="bonus-is-summon" ${ctx.slot.dataset.slotType === 'summon' ? 'checked' : ''}> 召唤物</label>
    </div>`;

    const abilityHTML = `<div class="bonus-awaken-row">
        <label class="bonus-summon-label"><input type="checkbox" id="bonus-is-awakened" ${awakened ? 'checked' : ''}> 觉醒</label>
        <input type="text" id="bonus-awaken-name" class="bonus-awaken-name-input" placeholder="觉醒牌名" value="${escapeHTML(awakenCardName)}" ${awakened ? '' : 'style="display:none;"'}>
        <button type="button" id="bonus-quick-awaken" class="bonus-btn--keyword">+快捷觉醒</button>
      </div>
      <div id="bonus-awaken-picker" class="bonus-keyword-picker" style="display:none;"></div>
      <textarea id="bonus-base-ability" class="bonus-ability-input" rows="3" ${awakened ? 'style="display:none;"' : ''}>${escapeHTML(baseAbilitySaved)}</textarea>
      <textarea id="bonus-awaken-ability" class="bonus-ability-input" placeholder="觉醒能力" rows="3" ${awakened ? '' : 'style="display:none;"'}>${escapeHTML(awakenAbility)}</textarea>`;

    const cdEnergyHTML = `<div class="bonus-cd-energy-row">
      <label class="bonus-summon-label"><input type="checkbox" id="bonus-has-countdown" ${hasCountdown ? 'checked' : ''}> 倒计时</label>
      <span class="bonus-cd-energy-label">基础倒计时：</span>
      <input type="number" id="bonus-base-countdown" class="bonus-form-stat-input" value="${baseCountdown}" min="1" max="99">
    </div>
    <div class="bonus-cd-energy-row">
      <label class="bonus-summon-label"><input type="checkbox" id="bonus-has-energy" ${hasEnergy ? 'checked' : ''}> 能量</label>
    </div>`;

    const permHTML = `<div class="bonus-add-row">
      <input type="text" id="bonus-mod-source" placeholder="来源" maxlength="30" style="flex:3;">
      <label class="bonus-inline-label">攻击</label>
      <input type="number" id="bonus-mod-atk" value="0" min="-99" max="99">
      <label class="bonus-inline-label">生命</label>
      <input type="number" id="bonus-mod-hp" value="0" min="-99" max="99">
      <button type="button" class="bonus-btn bonus-btn--add" id="bonus-add-mod">添加</button>
    </div>
    <div class="bonus-list" id="bonus-mod-list">${renderModList()}</div>`;

    const tempHTML = `<div class="bonus-add-row">
      <input type="text" id="bonus-temp-source" placeholder="来源" maxlength="30" style="flex:3;">
      <label class="bonus-inline-label">攻击</label>
      <input type="number" id="bonus-temp-atk" value="0" min="-99" max="99">
      <label class="bonus-inline-label">生命</label>
      <input type="number" id="bonus-temp-hp" value="0" min="-99" max="99">
      <button type="button" class="bonus-btn bonus-btn--add" id="bonus-add-temp">添加</button>
    </div>
    <div class="bonus-list" id="bonus-temp-list">${renderTempList()}</div>`;

    const formHTML = `<button type="button" id="bonus-quick-form" class="bonus-btn--keyword">+快捷结附形态</button>
    <div id="bonus-form-picker" class="bonus-keyword-picker" style="display:none;"></div>
    ${renderFormSection()}`;

    const effectsHTML = `<button type="button" id="bonus-quick-keyword" class="bonus-btn--keyword">+快捷关键词</button>
    <div id="bonus-keyword-picker" class="bonus-keyword-picker" style="display:none;"></div>
    <div class="bonus-add-row">
      <input type="text" id="bonus-effect-source" placeholder="来源" maxlength="30" class="flex-06">
      <input type="text" id="bonus-effect-desc" placeholder="效果描述" maxlength="100" class="flex-14">
      <button type="button" class="bonus-btn bonus-btn--add" id="bonus-add-effect">添加</button>
    </div>
    <div class="bonus-list" id="bonus-effect-list">${renderEffectList()}</div>`;

    return `
      <div class="bonus-info">
        <span class="bonus-info__name">「${escapeHTML(ctx.cardName)}」</span>
        <span class="bonus-info__stats"><span>${ATK_ICON} ${ctx.permAtk}</span> <span>${HP_ICON} ${ctx.permHp}</span></span>
      </div>
      <div class="bonus-tabs">
        <div class="bonus-tab-bar">
          <button type="button" class="bonus-tab${currentMobileTab === 'stats' ? ' active' : ''}" data-bonus-tab="stats">属性</button>
          <button type="button" class="bonus-tab${currentMobileTab === 'ability' ? ' active' : ''}" data-bonus-tab="ability">能力</button>
          <button type="button" class="bonus-tab${currentMobileTab === 'form' ? ' active' : ''}" data-bonus-tab="form">形态</button>
          <button type="button" class="bonus-tab${currentMobileTab === 'effects' ? ' active' : ''}" data-bonus-tab="effects">效果</button>
        </div>
        <div class="bonus-tab-panel${currentMobileTab === 'stats' ? ' active' : ''}" data-bonus-panel="stats">
          <div class="bonus-section">
            <div class="bonus-section__label">📏 基础属性与状态</div>
            ${_baseStatHTML()}
          </div>
          <div class="bonus-section">
            <div class="bonus-section__label">⚔️ 永久属性</div>
            ${permHTML}
          </div>
          <div class="bonus-section">
            <div class="bonus-section__label">⏳ 临时属性</div>
            ${tempHTML}
          </div>
        </div>
        <div class="bonus-tab-panel${currentMobileTab === 'ability' ? ' active' : ''}" data-bonus-panel="ability">
          <div class="bonus-section">
            <div class="bonus-section__label">🎌 式神派系</div>
            ${factionHTML}
          </div>
          <div class="bonus-section">
            <div class="bonus-section__label">📝 基础能力</div>
            ${abilityHTML}
          </div>
          <div class="bonus-section">
            <div class="bonus-section__label">📊 倒计时 / 能量</div>
            ${cdEnergyHTML}
          </div>
        </div>
        <div class="bonus-tab-panel${currentMobileTab === 'form' ? ' active' : ''}" data-bonus-panel="form">
          <div class="bonus-section">
            <div class="bonus-section__label">🎴 形态</div>
            ${formHTML}
          </div>
        </div>
        <div class="bonus-tab-panel${currentMobileTab === 'effects' ? ' active' : ''}" data-bonus-panel="effects">
          <div class="bonus-section">
            <div class="bonus-section__label">📋 效果记录</div>
            ${effectsHTML}
          </div>
        </div>
      </div>
      <div class="bonus-actions">
        <button type="button" class="bonus-btn bonus-btn--delete" id="bonus-delete-slot">🗑 删除式神</button>
        <button type="button" class="bonus-btn bonus-btn--image" id="bonus-change-image">🖼 更换卡图</button>
        <button type="button" class="bonus-btn bonus-btn--close" id="bonus-close-btn">关闭</button>
      </div>
    `;
  }

  /** 桌面端：两栏布局（原版） */
  function _renderDesktop() {
    const hasCountdown = !!ctx.slot.querySelector('.card-badge--countdown');
    const hasEnergy = !!ctx.slot.querySelector('.card-badge--energy');
    const baseCountdown = ctx.slot._baseCountdown || 2;
    const awakened = ctx.slot.classList.contains('awakened');
    const baseAbilitySaved = ctx.slot._baseAbility !== undefined ? ctx.slot._baseAbility : '';
    const awakenAbility = ctx.slot._permAbility || '';
    const awakenCardName = ctx.slot._awakenCardName || ('觉醒·' + ctx.cardName);
    return `
      <div class="bonus-info">
        <span class="bonus-info__name">「${escapeHTML(ctx.cardName)}」</span>
        <span class="bonus-info__stats"><span>${ATK_ICON} ${ctx.permAtk}</span> <span>${HP_ICON} ${ctx.permHp}</span></span>
      </div>

      <div class="bonus-columns">
        <!-- 左栏 -->
        <div class="bonus-col">
          <!-- 式神派系 + 召唤物勾选 -->
          <div class="bonus-section">
            <div class="bonus-section__label">🎌 式神派系</div>
            <div class="bonus-faction-row">
              ${['苍叶','红莲','青岚','紫岩','无相'].map(function(f) {
                return '<button type="button" class="bonus-faction-btn' + (ctx.faction === f ? ' active' : '') + '">' + f + '</button>';
              }).join('')}
              <label class="bonus-summon-label"><input type="checkbox" id="bonus-is-summon" ${ctx.slot.dataset.slotType === 'summon' ? 'checked' : ''}> 召唤物</label>
            </div>
          </div>
          <!-- 基础能力 -->
          <div class="bonus-section">
            <div class="bonus-section__label">📝 基础能力</div>
            <div class="bonus-awaken-row">
              <label class="bonus-summon-label"><input type="checkbox" id="bonus-is-awakened" ${awakened ? 'checked' : ''}> 觉醒</label>
              <input type="text" id="bonus-awaken-name" class="bonus-awaken-name-input" placeholder="觉醒牌名" value="${escapeHTML(awakenCardName)}" ${awakened ? '' : 'style="display:none;"'}>
              <button type="button" id="bonus-quick-awaken" class="bonus-btn--keyword">+快捷觉醒</button>
            </div>
            <div id="bonus-awaken-picker" class="bonus-keyword-picker" style="display:none;"></div>
            <textarea id="bonus-base-ability" class="bonus-ability-input" rows="3" ${awakened ? 'style="display:none;"' : ''}>${escapeHTML(baseAbilitySaved)}</textarea>
            <textarea id="bonus-awaken-ability" class="bonus-ability-input" placeholder="觉醒能力" rows="3" ${awakened ? '' : 'style="display:none;"'}>${escapeHTML(awakenAbility)}</textarea>
          </div>
          <!-- 倒计时 / 能量 -->
          <div class="bonus-section">
            <div class="bonus-section__label">📊 倒计时 / 能量</div>
            <div class="bonus-cd-energy-row">
              <label class="bonus-summon-label"><input type="checkbox" id="bonus-has-countdown" ${hasCountdown ? 'checked' : ''}> 倒计时</label>
              <span class="bonus-cd-energy-label">基础倒计时：</span>
              <input type="number" id="bonus-base-countdown" class="bonus-form-stat-input" value="${baseCountdown}" min="1" max="99">
            </div>
            <div class="bonus-cd-energy-row">
              <label class="bonus-summon-label"><input type="checkbox" id="bonus-has-energy" ${hasEnergy ? 'checked' : ''}> 能量</label>
            </div>
          </div>
          <!-- 形态 -->
          <div class="bonus-section">
            <div class="bonus-section__label">🎴 形态 <button type="button" id="bonus-quick-form" class="bonus-btn--keyword">+快捷结附形态</button></div>
            <div id="bonus-form-picker" class="bonus-keyword-picker" style="display:none;"></div>
            ${renderFormSection()}
          </div>
        </div>
        <!-- 右栏 -->
        <div class="bonus-col">
          <!-- 基础属性与状态 -->
          <div class="bonus-section">
            <div class="bonus-section__label">📏 基础属性与状态</div>
            ${_baseStatHTML()}
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
              <button type="button" class="bonus-btn bonus-btn--add" id="bonus-add-mod">添加</button>
            </div>
            <div class="bonus-list" id="bonus-mod-list">${renderModList()}</div>
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
              <button type="button" class="bonus-btn bonus-btn--add" id="bonus-add-temp">添加</button>
            </div>
            <div class="bonus-list" id="bonus-temp-list">${renderTempList()}</div>
          </div>
          <!-- 效果记录 -->
          <div class="bonus-section">
            <div class="bonus-section__label">📋 效果记录 <button type="button" id="bonus-quick-keyword" class="bonus-btn--keyword">+快捷关键词</button></div>
            <div id="bonus-keyword-picker" class="bonus-keyword-picker" style="display:none;"></div>
            <div class="bonus-add-row">
              <input type="text" id="bonus-effect-source" placeholder="来源" maxlength="30" class="flex-06">
              <input type="text" id="bonus-effect-desc" placeholder="效果描述" maxlength="100" class="flex-14">
              <button type="button" class="bonus-btn bonus-btn--add" id="bonus-add-effect">添加</button>
            </div>
            <div class="bonus-list" id="bonus-effect-list">${renderEffectList()}</div>
          </div>
        </div>
      </div>

      <div class="bonus-actions">
        <button type="button" class="bonus-btn bonus-btn--delete" id="bonus-delete-slot">🗑 删除式神</button>
        <button type="button" class="bonus-btn bonus-btn--image" id="bonus-change-image">🖼 更换卡图</button>
        <button type="button" class="bonus-btn bonus-btn--close" id="bonus-close-btn">关闭</button>
      </div>
    `;
  }

  function renderFormSection() {
    if (ctx.formName) {
      return `<div class="bonus-form-active">
        <div class="bonus-form-info"><strong>${escapeHTML(ctx.formName)}</strong> <span>${ATK_ICON}</span><input type="number" id="bonus-form-atk-active" value="${ctx.formAtk}" min="0" max="99" class="bonus-form-stat-input"> <span>${HP_ICON}</span><input type="number" id="bonus-form-hp-active" value="${ctx.formHp}" min="0" max="99" class="bonus-form-stat-input"></div>
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
        <span class="bonus-list-item__source">${escapeHTML(src)}${layersText}</span>
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
        <span class="bonus-list-item__source">${escapeHTML(src)}${layersText}</span>
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
    if (!src) return;
    const oldFullAtk = typeof calcFullAtk === 'function' ? calcFullAtk(ctx.slot) : 0;
    const oldFullHp = typeof calcFullHp === 'function' ? calcFullHp(ctx.slot) : 0;
    let idx = ctx.tempAtkMods.findIndex(m => m.source === src);
    if (idx < 0) idx = ctx.tempHpMods.findIndex(m => m.source === src);
    if (idx >= 0) {
      const atkVal = (ctx.tempAtkMods[idx] || {}).value || 0;
      const hpVal = (ctx.tempHpMods[idx] || {}).value || 0;
      if (atkVal === atk && hpVal === hp) {
        // 来源和数值都相同 → 叠加层数
        ctx.tempAtkMods[idx].layers = (ctx.tempAtkMods[idx].layers || 1) + 1;
        ctx.tempHpMods[idx].layers = ctx.tempAtkMods[idx].layers;
      } else {
        // 来源相同但数值不同 → 新增一项
        ctx.tempAtkMods.push({ source: src, value: atk, layers: 1 });
        ctx.tempHpMods.push({ source: src, value: hp, layers: 1 });
      }
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
    if (typeof window.equipFormOnSlot === 'function') {
      window.equipFormOnSlot(ctx.slot, name, atk, hp, ability);
    } else {
      ctx.slot._formName = name; ctx.slot._formAtk = atk; ctx.slot._formHp = hp; ctx.slot._formAbility = ability;
      syncSlotToPeer(ctx.slot);
      if (typeof autoUpdateSlotImage === 'function') autoUpdateSlotImage(ctx.slot);
      if (typeof renderFormBadge === 'function') renderFormBadge(ctx.slot);
    }
    broadcastBonusMsg('结附了形态', `${name}（攻击${atk}，生命${hp}）`);
    refresh();
  }

  function handleLoseForm() {
    ctx.formName = ''; ctx.formAtk = 0; ctx.formHp = 0; ctx.formAbility = '';
    if (typeof window.loseFormOnSlot === 'function') {
      window.loseFormOnSlot(ctx.slot);
    } else {
      ctx.slot._formName = ''; ctx.slot._formAtk = 0; ctx.slot._formHp = 0; ctx.slot._formAbility = '';
      syncSlotToPeer(ctx.slot);
      if (typeof autoUpdateSlotImage === 'function') autoUpdateSlotImage(ctx.slot);
      if (typeof renderFormBadge === 'function') renderFormBadge(ctx.slot);
    }
    broadcastBonusMsg('失去了形态', '');
    refresh();
  }

  function handleChangeImage() {
    if (!ctx || !ctx.slot) return;
    if (typeof isSpectator !== 'undefined' && isSpectator) return;
    // 触发隐藏的图片上传 input（在 game-core.js 中定义）
    var input = document.getElementById('image-input');
    if (!input) return;
    // 设置当前卡槽为上传目标
    if (typeof window._setActiveSlotForImage === 'function') {
      window._setActiveSlotForImage(ctx.slot);
    } else if (typeof activeSlotForImage !== 'undefined') {
      activeSlotForImage = ctx.slot;
    }
    input.click();
  }

  function handleDeleteSlot() {
    if (!ctx || !ctx.slot) return;
    if (typeof isSpectator !== 'undefined' && isSpectator) return;
    const name = ctx.cardName || '未命名';
    if (!confirm(`确定要从战场上删除「${name}」吗？\n将清空该式神的所有数据（属性、形态、加成、灵咒等）。`)) return;
    const slot = ctx.slot;
    // 清空卡槽
    slot.querySelector('.card-name').value = '';
    slot.querySelector('.card-attack').value = '';
    slot.querySelector('.card-hp').value = '';
    slot.querySelector('.card-level').value = '';
    if (typeof clearSlotImage === 'function') clearSlotImage(slot);
    slot.classList.remove('awakened', 'has-image');
    // 清空运行时数据
    slot._permAtkMods = []; slot._permHpMods = [];
    slot._permAbility = ''; slot._permEffects = [];
    slot._formName = ''; slot._formAtk = 0; slot._formHp = 0; slot._formAbility = '';
    slot._tempAtkMods = []; slot._tempHpMods = [];
    if (typeof setSlotCurses === 'function') setSlotCurses(slot, []);
    if (typeof updateSlotCountdownBadge === 'function') updateSlotCountdownBadge(slot, '');
    if (typeof updateSlotEnergyBadge === 'function') updateSlotEnergyBadge(slot, '');
    if (typeof updateKoOverlay === 'function') updateKoOverlay(slot, '');
    if (typeof syncSlotToPeer === 'function') syncSlotToPeer(slot);
    if (typeof broadcastSystemMsg === 'function') {
      broadcastSystemMsg(`【系统】${ctx.playerName}从战场上移除了「${name}」`);
    }
    close();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { open, close };
})();
