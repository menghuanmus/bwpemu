// ================================================================
//  js/presets.js — 预设模块
//  从战场保存式神/召唤物完整快照，拖拽部署，分类筛选
//  依赖: CardDB, getSlotState, setSlotState, syncSlotToPeer
// ================================================================

const Presets = (() => {
  const STORAGE_KEY = 'bwp_presets';
  const FACTION_ORDER = ['红莲', '紫岩', '青岚', '苍叶', '无相'];

  let _presets = [];        // 完整预设列表（含默认 + DIY）
  let _filterType = 'all';  // 'all' | 'shikigami' | 'summon'
  let _searchText = '';
  let _tabActive = 'default'; // 'default' | 'git' | 'temp'
  let _activeFactions = new Set(FACTION_ORDER); // 默认全选
  let _panelVisible = false;
  let _panelEl = null;

  // ================================================================
  //  初始化
  // ================================================================

  function init() {
    _load();
    _buildPanel();
  }

  function _load() {
    // 1. 默认预设（从 cards.js）
    const defaults = _buildDefaults();
    // 2. DIY 预设（从 localStorage）
    let diy = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) diy = JSON.parse(raw);
    } catch (e) { /* ignore */ }
    _presets = [...defaults, ...diy];
  }

  function _buildDefaults() {
    if (typeof CARD_DB_DATA === 'undefined' || !Array.isArray(CARD_DB_DATA)) return [];
    return CARD_DB_DATA
      .filter(c => c.type === 'shikigami' || c.type === 'summon')
      .map(c => {
        const author = c.author || '官方';
        const isOfficial = author === '官方';
        return {
          id: (isOfficial ? 'default_' : 'diy_') + c.name,
          source: 'cards.js',
          category: isOfficial ? 'default' : 'git',
          name: c.name,
          type: c.type,
          faction: _normalizeFaction(c.faction),
          attack: c.attack || 0,
          hp: c.hp || 0,
          ability: c.ability || '',
          owner: c.owner || '',
          imageSrc: `images/${c.name}/${c.name}.png`,
          level: c.type === 'shikigami' ? '1' : '',
          countdown: '',
          energy: '',
          rarity: c.rarity || '',
          author: author,
          permAtkMods: [], permHpMods: [], permAbility: '',
          permEffects: [], formName: '', formAtk: 0, formHp: 0, formAbility: '',
          tempAtkMods: [], tempHpMods: [],
          curses: [], awakened: false, ko: ''
        };
      });
  }

  function _saveDIY() {
    const diy = _presets.filter(p => p.source === 'battlefield');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(diy));
  }

  // ================================================================
  //  从战场保存
  // ================================================================

  function saveFromSlot(slot) {
    if (typeof isSpectator !== 'undefined' && isSpectator) return;
    const state = typeof getSlotState === 'function' ? getSlotState(slot) : null;
    if (!state || !state.name) return;

    const preset = {
      id: 'preset_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      source: 'battlefield',
      category: 'temp',
      name: state.name,
      type: slot.dataset.slotType === 'summon' ? 'summon' : 'shikigami',
      faction: _normalizeFaction(slot.dataset.slotFaction || (typeof CardDB !== 'undefined' && CardDB.lookup(state.name) && CardDB.lookup(state.name).faction) || ''),
      attack: parseInt(state.attack, 10) || 0,
      hp: parseInt(state.hp, 10) || 0,
      ability: state.permAbility || (typeof CardDB !== 'undefined' ? (CardDB.lookup(state.name) || {}).ability || '' : ''),
      owner: slot.dataset.slotOwner || '',
      imageSrc: state.imageSrc || '',
      level: state.level || '',
      countdown: state.countdown || '',
      energy: state.energy || '',
      rarity: slot.dataset.slotRarity || '',
      author: (typeof CardDB !== 'undefined' && CardDB.lookup(state.name) && CardDB.lookup(state.name).author) || '官方',
      // 完整加成快照
      permAtkMods: state.permAtkMods || [],
      permHpMods: state.permHpMods || [],
      permAbility: state.permAbility || '',
      permEffects: state.permEffects || [],
      formName: state.formName || '',
      formAtk: state.formAtk || 0,
      formHp: state.formHp || 0,
      formAbility: state.formAbility || '',
      tempAtkMods: state.tempAtkMods || [],
      tempHpMods: state.tempHpMods || [],
      curses: state.curses || [],
      awakened: state.awakened || false,
      ko: ''
    };

    // 去重（同名同分类覆盖）
    const existIdx = _presets.findIndex(p => p.category === 'temp' && p.name === preset.name);
    if (existIdx >= 0) {
      _presets[existIdx] = preset;
    } else {
      _presets.push(preset);
    }
    _saveDIY();
    _render();
    if (typeof broadcastSystemMsg === 'function') {
      broadcastSystemMsg(`【系统】已将「${preset.name}」保存到预设（本地暂存）`);
    }
  }

  // ================================================================
  //  删除 DIY 预设
  // ================================================================

  function remove(id) {
    const idx = _presets.findIndex(p => p.id === id);
    if (idx < 0) return;
    if (_presets[idx].source === 'cards.js') return; // cards.js 来源不可删
    const name = _presets[idx].name;
    _presets.splice(idx, 1);
    _saveDIY();
    _render();
    if (typeof broadcastSystemMsg === 'function') {
      broadcastSystemMsg(`【系统】已删除预设「${name}」`);
    }
  }

  // ================================================================
  //  拖拽部署到卡槽
  // ================================================================

  function deployToSlot(presetId, slot) {
    const p = _presets.find(p => p.id === presetId);
    if (!p || !slot) return;
    if (typeof isSpectator !== 'undefined' && isSpectator) return;

    const oldName = slot.querySelector('.card-name')?.value || '';

    // 二次确认：卡槽已有式神/召唤物时，弹窗确认替换
    if (oldName && oldName !== p.name) {
      if (!confirm(`卡槽已有「${oldName}」，确定替换为「${p.name}」吗？`)) {
        return;
      }
    }

    if (typeof setSlotState === 'function') {
      setSlotState(slot, {
        imageSrc: p.imageSrc,
        level: p.level,
        attack: String(p.attack),
        hp: String(p.hp),
        name: p.name,
        countdown: p.countdown,
        energy: p.energy,
        ko: p.ko || '',
        curses: p.curses || [],
        awakened: p.awakened || false,
        permAtkMods: p.permAtkMods || [],
        permHpMods: p.permHpMods || [],
        permAbility: p.permAbility || '',
        permEffects: p.permEffects || [],
        formName: p.formName || '',
        formAtk: p.formAtk || 0,
        formHp: p.formHp || 0,
        formAbility: p.formAbility || '',
        tempAtkMods: p.tempAtkMods || [],
        tempHpMods: p.tempHpMods || [],
        slotType: p.type,
        slotFaction: p.faction,
      });
    }

    // 设置额外属性（setSlotState 已设置 slotType/slotFaction，此处兜底）
    if (!slot.dataset.slotType) slot.dataset.slotType = p.type;
    slot.dataset.slotFaction = p.faction;
    if (p.owner) slot.dataset.slotOwner = p.owner;
    if (p.rarity) slot.dataset.slotRarity = p.rarity;
    if (p.ability) {
      slot.setAttribute('data-ability', p.ability);
    }
    // 同步派系图标
    const factionIcon2 = slot.querySelector('.card-faction-icon');
    if (factionIcon2) {
      const fac = p.faction;
      if (fac && fac !== '无相') {
        factionIcon2.src = 'images/派系/' + fac + '.png';
        factionIcon2.style.display = '';
      } else {
        factionIcon2.style.display = 'none';
      }
    }

    if (typeof syncSlotToPeer === 'function') syncSlotToPeer(slot);

    const replaceMsg = oldName && oldName !== p.name ? `（替换了「${oldName}」）` : '';
    if (typeof broadcastSystemMsg === 'function') {
      broadcastSystemMsg(`【系统】从预设部署了「${p.name}」${replaceMsg}`);
    }
  }

  // ================================================================
  //  渲染
  // ================================================================

  function _buildPanel() {
    if (_panelEl) return;
    _panelEl = document.createElement('div');
    _panelEl.id = 'preset-panel';
    _panelEl.className = 'preset-panel';
    _panelEl.innerHTML = `
      <div class="preset-panel__header">
        <span class="preset-panel__title">📦 预设</span>
        <div class="preset-panel__header-actions">
          <button type="button" class="preset-panel__save-btn" id="preset-save-btn" title="从战场保存式神/召唤物">💾 从战场保存</button>
          <button type="button" class="preset-panel__close" id="preset-panel-close">✕</button>
        </div>
      </div>
      <div class="preset-panel__hint">💡 你可以拖动式神/召唤物至战场，或是将战场上的式神/召唤物保存至临时预设</div>
      <div class="preset-panel__tabs">
        <button type="button" class="preset-tab preset-tab--active" data-tab="default">官方式神</button>
        <button type="button" class="preset-tab" data-tab="git">DIY式神</button>
        <button type="button" class="preset-tab" data-tab="temp">临时预设</button>
      </div>
      <div class="preset-panel__save-picker" id="preset-save-picker" style="display:none;"></div>
      <div class="preset-panel__filters">
        <button type="button" class="preset-filter-btn preset-filter-btn--active" data-filter="all">全部</button>
        <button type="button" class="preset-filter-btn" data-filter="shikigami">式神</button>
        <button type="button" class="preset-filter-btn" data-filter="summon">召唤物</button>
      </div>
      <div class="preset-panel__factions" id="preset-faction-filters">
        <button type="button" class="preset-faction-btn preset-faction-btn--active" data-faction="红莲"><img src="images/派系/红莲.png" class="preset-faction-btn__icon"><br>红莲</button>
        <button type="button" class="preset-faction-btn preset-faction-btn--active" data-faction="紫岩"><img src="images/派系/紫岩.png" class="preset-faction-btn__icon"><br>紫岩</button>
        <button type="button" class="preset-faction-btn preset-faction-btn--active" data-faction="青岚"><img src="images/派系/青岚.png" class="preset-faction-btn__icon"><br>青岚</button>
        <button type="button" class="preset-faction-btn preset-faction-btn--active" data-faction="苍叶"><img src="images/派系/苍叶.png" class="preset-faction-btn__icon"><br>苍叶</button>
        <button type="button" class="preset-faction-btn preset-faction-btn--active" data-faction="无相"><span class="preset-faction-btn__icon">🌐</span><br>无相</button>
      </div>
      <div class="preset-panel__filters">
        <input type="text" class="preset-search" id="preset-search" placeholder="🔍 搜索…">
      </div>
      <div class="preset-panel__list" id="preset-list"></div>
    `;
    document.body.appendChild(_panelEl);

    // 事件
    _panelEl.querySelector('#preset-panel-close').addEventListener('click', hide);
    _panelEl.querySelectorAll('.preset-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        _panelEl.querySelectorAll('.preset-tab').forEach(t => t.classList.remove('preset-tab--active'));
        tab.classList.add('preset-tab--active');
        _tabActive = tab.dataset.tab;
        _render();
      });
    });
    _panelEl.querySelectorAll('.preset-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _panelEl.querySelectorAll('.preset-filter-btn').forEach(b => b.classList.remove('preset-filter-btn--active'));
        btn.classList.add('preset-filter-btn--active');
        _filterType = btn.dataset.filter;
        _render();
      });
    });
    _panelEl.querySelector('#preset-search').addEventListener('input', (e) => {
      _searchText = e.target.value.trim().toLowerCase();
      _render();
    });
    // 派系多选
    _panelEl.querySelectorAll('.preset-faction-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const faction = btn.dataset.faction;
        if (_activeFactions.has(faction)) {
          _activeFactions.delete(faction);
          btn.classList.remove('preset-faction-btn--active');
        } else {
          _activeFactions.add(faction);
          btn.classList.add('preset-faction-btn--active');
        }
        _render();
      });
    });
    // 拖拽事件委托
    _panelEl.querySelector('#preset-list').addEventListener('dragstart', _onDragStart);
    _panelEl.querySelector('#preset-list').addEventListener('dragend', _onDragEnd);
    // 悬浮信息窗
    _panelEl.querySelector('#preset-list').addEventListener('mouseenter', _onPresetHover, true);
    _panelEl.querySelector('#preset-list').addEventListener('mouseleave', _onPresetLeave, true);
  }

  function _render() {
    const listEl = document.getElementById('preset-list');
    if (!listEl) return;

    let items;
    if (_tabActive === 'default') {
      items = _presets.filter(p => p.category === 'default');
    } else {
      items = _presets.filter(p => p.category === _tabActive);
    }

    let html = '';

    // 提示语
    if (_tabActive === 'git' && (!items.length || _filterType === 'all')) {
      html += '<div class="preset-hint">💡 这里是玩家的DIY式神，如需要添加你的DIY式神数据，请联系作者</div>';
    }
    if (_tabActive === 'temp') {
      html += '<div class="preset-hint">⚠️ 这里是临时保存的预设，当你刷新、关闭网页后，可能将失去该预设</div>';
    }

    // 所有页签按派系分组
    html += _renderGroup(_groupByFaction(items));

    if (!items.length || !html.trim()) {
      html = '<div class="preset-empty">暂无预设</div>';
    }

    listEl.innerHTML = html;
  }

  function _groupByFaction(presets) {
    const groups = {};
    for (const p of presets) {
      const f = _normalizeFaction(p.faction);
      if (!groups[f]) groups[f] = [];
      groups[f].push(p);
    }
    // 按派系顺序
    const sorted = [];
    for (const f of FACTION_ORDER) {
      if (groups[f]) sorted.push({ faction: f, presets: groups[f] });
    }
    // 无相以外的未知派系也归入无相
    if (groups['无相']) {
      const existing = sorted.find(g => g.faction === '无相');
      if (!existing) sorted.push({ faction: '无相', presets: groups['无相'] });
    }
    return sorted;
  }

  function _renderGroup(groups) {
    let h = '';
    for (const g of groups) {
      h += `<div class="preset-faction-group">
        <div class="preset-faction-group__label">${_factionIcon(g.faction)} ${g.faction}</div>
        ${_renderItems(g.presets)}
      </div>`;
    }
    return h;
  }

  function _factionIcon(f) {
    if (f && f !== '无相') return `<img src="images/派系/${f}.png" class="preset-item__faction-icon" alt="${f}">`;
    const m = { '无相': '🌐' };
    return m[f] || '▪';
  }

  function _normalizeFaction(f) {
    const valid = ['苍叶', '红莲', '青岚', '紫岩'];
    return (f && valid.includes(f)) ? f : '无相';
  }

  function _renderItems(presets) {
    let h = '<div class="preset-items">';
    for (const p of presets) {
      if (_filterType !== 'all' && p.type !== _filterType) continue;
      if (_searchText && !p.name.toLowerCase().includes(_searchText) && !(p.author && p.author.toLowerCase().includes(_searchText))) continue;
      if (!_activeFactions.has(p.faction || '无相')) continue;

      const atkHp = `<img src="images/属性/攻击.png" class="preset-item__stat-icon" alt="攻">${p.attack}  <img src="images/属性/生命.png" class="preset-item__stat-icon" alt="命">${p.hp}`;
      const isCardsJS = p.source === 'cards.js';
      const badge = p.type === 'summon' ? '召' : '';
      const isDIY = p.author && p.author !== '官方';

      h += `<div class="preset-item" draggable="true" data-preset-id="${p.id}">
        <div class="preset-item__img" style="${p.imageSrc ? `background-image:url(${_escapeHTML(p.imageSrc)})` : ''}">
          ${p.imageSrc ? `<img src="${_escapeHTML(p.imageSrc)}" style="display:none;" onerror="this.parentElement.style.backgroundImage='url(images/无图.png)'">` : ''}
          ${!p.imageSrc ? '<span class="preset-item__placeholder">🃏</span>' : ''}
          ${badge ? `<span class="preset-item__badge">${badge}</span>` : ''}
        </div>
        <div class="preset-item__info">
          <div class="preset-item__name">${_escapeHTML(p.name)}</div>
          <div class="preset-item__meta">${_factionIcon(p.faction)} ${p.faction} · ${atkHp}</div>
          ${isDIY ? `<div class="preset-item__author">作者：${_escapeHTML(p.author)}</div>` : ''}
        </div>
        ${!isCardsJS ? `
        <div class="preset-item__actions">
          <button type="button" class="preset-item__del" data-action="del" data-id="${p.id}" title="删除">✕</button>
        </div>` : ''}
      </div>`;
    }
    h += '</div>';
    return h;
  }

  function _escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function _findSlot(playerId, slotIndex) {
    const zone = document.querySelector(`.player-zone[data-player="${playerId}"]`);
    if (!zone) return null;
    const slots = zone.querySelectorAll('.card-slot');
    return slots[slotIndex] || null;
  }

  function _toggleSavePicker() {
    const picker = document.getElementById('preset-save-picker');
    if (!picker) return;
    if (picker.style.display === 'none') {
      _showSavePicker();
    } else {
      _hideSavePicker();
    }
  }

  function _showSavePicker() {
    if (typeof isSpectator !== 'undefined' && isSpectator) return;
    const picker = document.getElementById('preset-save-picker');
    if (!picker) return;
    let html = '<div class="preset-save-picker__title">选择要保存的式神/召唤物：</div>';
    let hasAny = false;
    ['1', '2'].forEach(playerId => {
      const zone = document.querySelector(`.player-zone[data-player="${playerId}"]`);
      if (!zone) return;
      const slots = zone.querySelectorAll('.card-slot');
      slots.forEach((slot, i) => {
        const name = slot.querySelector('.card-name')?.value?.trim();
        if (!name) return;
        hasAny = true;
        const atk = slot.querySelector('.card-attack')?.value || '0';
        const hp = slot.querySelector('.card-hp')?.value || '0';
        const playerName = typeof getPlayerName === 'function' ? getPlayerName(playerId) : '玩家' + playerId;
        html += `<div class="preset-save-picker__item" data-player-id="${playerId}" data-slot-index="${i}">
          <span class="preset-save-picker__item-name">「${_escapeHTML(name)}」</span>
          <span class="preset-save-picker__item-meta">${playerName} · ${atk}/${hp}</span>
        </div>`;
      });
    });
    if (!hasAny) html += '<div class="preset-save-picker__empty">战场上没有可保存的式神</div>';
    picker.innerHTML = html;
    picker.style.display = 'block';
  }

  function _hideSavePicker() {
    const picker = document.getElementById('preset-save-picker');
    if (picker) picker.style.display = 'none';
  }

  let _dragId = null;

  function _onDragStart(e) {
    const item = e.target.closest('.preset-item');
    if (!item) return;
    if (typeof isSpectator !== 'undefined' && isSpectator) {
      e.preventDefault();
      return;
    }
    _dragId = item.dataset.presetId;
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', _dragId);
    // 设置拖拽图像
    const img = item.querySelector('.preset-item__img');
    if (img && e.dataTransfer.setDragImage) {
      e.dataTransfer.setDragImage(img, 25, 35);
    }
  }

  function _onDragEnd() {
    _dragId = null;
    // 清除卡槽高亮
    document.querySelectorAll('.card-slot.drag-over').forEach(s => s.classList.remove('drag-over'));
  }

  // 悬浮信息窗
  let _hoverTooltip = null;
  let _hoverTimer = null;

  function _onPresetHover(e) {
    const item = e.target.closest('.preset-item');
    if (!item) return;
    const id = item.dataset.presetId;
    const p = _presets.find(p => p.id === id);
    if (!p) return;
    clearTimeout(_hoverTimer);
    _hoverTimer = setTimeout(() => _showPresetTooltip(p, e), 400);
  }

  function _onPresetLeave(e) {
    const item = e.target.closest('.preset-item');
    if (!item) return;
    clearTimeout(_hoverTimer);
    _hidePresetTooltip();
  }

  function _showPresetTooltip(p, e) {
    if (!_hoverTooltip) {
      _hoverTooltip = document.createElement('div');
      _hoverTooltip.className = 'preset-tooltip';
      document.body.appendChild(_hoverTooltip);
    }
    const typeName = p.type === 'summon' ? '召唤物' : '式神';
    _hoverTooltip.innerHTML = `
      <div class="preset-tooltip__name">${_escapeHTML(p.name)}</div>
      <div class="preset-tooltip__meta">${_factionIcon(p.faction)} ${p.faction || '无相'} · ${typeName} · <img src="images/属性/攻击.png" class="preset-item__stat-icon" alt="攻">${p.attack}  <img src="images/属性/生命.png" class="preset-item__stat-icon" alt="命">${p.hp}</div>
      ${p.ability ? `<div class="preset-tooltip__ability">${_escapeHTML(p.ability)}</div>` : ''}
      ${p.author && p.author !== '官方' ? `<div class="preset-tooltip__author">作者：${_escapeHTML(p.author)}</div>` : ''}
    `;
    _hoverTooltip.style.display = 'block';
    const x = e.clientX + 14;
    const y = e.clientY - 10;
    _hoverTooltip.style.left = Math.min(x, window.innerWidth - 260) + 'px';
    _hoverTooltip.style.top = Math.min(y, window.innerHeight - 120) + 'px';
  }

  function _hidePresetTooltip() {
    if (_hoverTooltip) _hoverTooltip.style.display = 'none';
  }

  /** 卡槽接收拖放（由 game-core.js 的事件委托调用） */
  function handleSlotDrop(e, slot) {
    const id = e.dataTransfer.getData('text/plain') || _dragId;
    if (!id) return;
    deployToSlot(id, slot);
  }

  // ================================================================
  //  面板显隐
  // ================================================================

  function show() {
    if (!_panelEl) _buildPanel();
    _panelEl.classList.add('preset-panel--visible');
    _panelVisible = true;
    _render();
  }

  function hide() {
    if (_panelEl) _panelEl.classList.remove('preset-panel--visible');
    _panelVisible = false;
  }

  function toggle() {
    _panelVisible ? hide() : show();
  }

  // ================================================================
  //  事件：列表内按钮点击 + 预设面板按钮
  // ================================================================

  document.addEventListener('click', (e) => {
    // 预设保存按钮 → 弹出式神选择器
    if (e.target.id === 'preset-save-btn' || e.target.closest('#preset-save-btn')) {
      _toggleSavePicker();
      return;
    }
    // 选择器中的式神条目点击
    const pickerItem = e.target.closest('.preset-save-picker__item');
    if (pickerItem) {
      const slotIndex = pickerItem.dataset.slotIndex;
      const playerId = pickerItem.dataset.playerId;
      const slot = _findSlot(playerId, slotIndex);
      if (slot) {
        saveFromSlot(slot);
        _hideSavePicker();
      }
      return;
    }
    // 预设列表内的操作按钮
    const btn = e.target.closest('[data-action]');
    if (btn) {
      const id = btn.dataset.id;
      if (btn.dataset.action === 'del') {
        if (confirm('确定删除此预设？')) remove(id);
      }
      return;
    }
    // 预设面板切换按钮
    if (e.target.id === 'btn-preset-toggle' || e.target.closest('#btn-preset-toggle')) {
      toggle();
    }
  });

  // 卡槽拖放事件委托
  document.addEventListener('dragover', (e) => {
    const slot = e.target.closest('.card-slot');
    if (!slot) return;
    e.preventDefault();
    slot.classList.add('drag-over');
  });

  document.addEventListener('dragleave', (e) => {
    const slot = e.target.closest('.card-slot');
    if (!slot) return;
    // 仅当真正离开卡槽时移除
    if (!slot.contains(e.relatedTarget)) {
      slot.classList.remove('drag-over');
    }
  });

  document.addEventListener('drop', (e) => {
    const slot = e.target.closest('.card-slot');
    if (!slot) return;
    e.preventDefault();
    slot.classList.remove('drag-over');
    const id = e.dataTransfer.getData('text/plain') || _dragId;
    if (id) deployToSlot(id, slot);
  });

  /** 检查临时预设中是否存在同名 */
  function _hasTempPreset(name) {
    return _presets.some(p => p.category === 'temp' && p.name === name);
  }

  // ================================================================
  //  导出
  // ================================================================

  return { init, show, hide, toggle, saveFromSlot, handleSlotDrop, deployToSlot, _hasTempPreset };
})();

// 自动初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => Presets.init());
} else {
  Presets.init();
}
