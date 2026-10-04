// ================================================================
//  js/switch.js — 切换变身系统（PRD: .scratch/切换机制/PRD.md）
//  一个卡槽可挂多个「切换目标」（本体 + 变身），点 🎭 徽章切换；
//  变身可配选项：气绝/复活时切回、初始处于气绝。
//  依赖: game-core.js (getSlotState/setSlotState/syncSlotToPeer/autoUpdateSlotImage)、CardDB
// ================================================================
const SwitchMgr = (() => {
  'use strict';

  // ── 小工具 ─────────────────────────────────────────────────
  /** 深拷贝（字符串/数字直接共享；对象/数组全新建，无深度限制，防嵌套共享引用） */
  function _deepCopy(v) {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(_deepCopy);
    const o = {};
    for (const k in v) if (Object.prototype.hasOwnProperty.call(v, k)) o[k] = _deepCopy(v[k]);
    return o;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function isSpectatorNow() { return (typeof isSpectator !== 'undefined') && !!isSpectator; }
  function myPid() { return (typeof localPlayerId !== 'undefined' && localPlayerId) ? String(localPlayerId) : '1'; }
  function isMySlot(slot) { return !!slot && String(slot.dataset.slotPlayer || '') === myPid(); }
  function _defaultOpts() { return { koSwitchBack: false, permaKo: false, bodyKoSwitch: false }; }
  /** 读取选项（兼容旧字段名 startKo） */
  function _optVal(o, key) {
    if (!o) return false;
    if (key === 'permaKo' && o.permaKo === undefined) return !!o.startKo;
    return !!o[key];
  }

  // ── 数据存取 ───────────────────────────────────────────────
  function getSw(slot) { return slot ? (slot._switch || null) : null; }
  function list(slot) { const sw = getSw(slot); return (sw && Array.isArray(sw.list)) ? sw.list : []; }
  function curIdx(slot) { const sw = getSw(slot); return sw ? (sw.idx | 0) : 0; }
  function hasTargets(slot) { return list(slot).length > 1; }

  /** getSlotState 输出用：导出 _switch 的独立副本（undefined = 未使用不传输；null = 已清除需同步） */
  function exportData(slot) {
    const sw = slot ? slot._switch : undefined;
    if (sw === undefined) return undefined;
    if (sw === null || !sw || !Array.isArray(sw.list) || !sw.list.length) return null;
    return _deepCopy({ idx: sw.idx | 0, list: sw.list });
  }

  /** setSlotState 载入用：undefined=不动 / null=清除 / 对象=深拷贝载入 */
  function importData(slot, data) {
    if (data === undefined || !slot) return;
    if (data === null || !Array.isArray(data.list) || !data.list.length) {
      slot._switch = null;
    } else {
      const idx = Math.max(0, Math.min(data.idx | 0, data.list.length - 1));
      slot._switch = _deepCopy({ idx, list: data.list });
    }
    refreshBadge(slot);
  }

  /** 没有结构时初始化（list[0] = 当前槽状态，即本体） */
  function _ensureStruct(slot) {
    if (!slot._switch || !Array.isArray(slot._switch.list) || !slot._switch.list.length) {
      const snap = _captureSnapshot(slot);
      snap._opts = _defaultOpts();
      slot._switch = { idx: 0, list: [snap] };
    }
    return slot._switch;
  }

  /** 抓取当前槽状态 → 剥离 _switch（防自我嵌套） */
  function _captureSnapshot(slot) {
    const st = (typeof getSlotState === 'function') ? getSlotState(slot) : {};
    const snap = _deepCopy(st);
    delete snap._switch;
    return snap;
  }

  /** 把当前显示目标的状态存回 list[idx]（保留原 _opts 配置） */
  function _saveCurrent(slot) {
    const sw = slot._switch;
    if (!sw) return;
    const idx = sw.idx | 0;
    const old = sw.list[idx] || {};
    const snap = _captureSnapshot(slot);
    snap._opts = _deepCopy(old._opts) || _defaultOpts();
    sw.list[idx] = snap;
    return snap;
  }

  /** 基础攻/命（优先玩家设置的基础值，其次记录值；未设置 → set:false 用当前值兜底） */
  function _baseStat(slot, which) {
    const manual = which === 'atk' ? slot._baseAtk : slot._baseHp;
    if (manual !== undefined && manual !== null) return { set: true, v: manual };
    const pb = which === 'atk' ? slot._permBaseAtk : slot._permBaseHp;
    if (pb !== undefined && pb !== null && !isNaN(pb)) return { set: true, v: pb };
    return { set: false, v: 0 };
  }

  /** 生成「重置版」快照：清全部过程数据（只留 名字/卡图/等级/基础面板/选项）；勾了初始气绝 → 回气绝 */
  function _buildResetSnapshot(slot, oldSnap) {
    const opts = (oldSnap && oldSnap._opts) ? _deepCopy(oldSnap._opts) : _defaultOpts();
    const st = (typeof getSlotState === 'function') ? getSlotState(slot) : {};
    const snap = _deepCopy(st);
    delete snap._switch;
    // —— 清过程数据 ——
    snap.ko = '';
    // 倒计时/能量：有徽章的回到基础值，没有的保持没有
    snap.countdown = (st.countdown !== '' && st.countdown != null) ? String(snap.baseCountdown || '') : '';
    snap.energy = (st.energy !== '' && st.energy != null) ? String(snap.baseEnergy || 0) : '';
    snap.curses = [];
    snap.awakened = false;
    snap.awakenName = '';
    snap.permAtkMods = [];
    snap.permHpMods = [];
    snap.permAbility = '';
    snap.permEffects = [];
    snap.formName = ''; snap.formAtk = 0; snap.formHp = 0; snap.formAbility = '';
    snap.tempAtkMods = []; snap.tempHpMods = [];
    snap.armor = 0; snap.power = 0;
    snap.chargedCards = [];
    // 攻/命回基础值（未记录过基础时保留当前值兜底）
    const ba = _baseStat(slot, 'atk');
    const bh = _baseStat(slot, 'hp');
    snap.attack = ba.set ? String(ba.v) : (st.attack || '');
    snap.hp = bh.set ? String(bh.v) : (st.hp || '');
    // 选项保留；初始气绝 → 回到气绝态
    snap._opts = opts;
    if (_optVal(opts, 'permaKo')) snap.ko = String(slot._baseKoCountdown || 3);
    return snap;
  }

  /** 空白 / 快捷模板快照 */
  function _blankSnapshot(slot, name, card, opts) {
    opts = opts || _defaultOpts();
    const snap = {
      imageSrc: null, level: '', attack: '', hp: '', name: String(name || ''),
      countdown: '', energy: '',
      baseCountdown: 0, baseEnergy: 0,
      koCountdown: slot._baseKoCountdown || 3,
      ko: '', curses: [], awakened: false, awakenName: '',
      permAtkMods: [], permHpMods: [], permAbility: '', permEffects: [],
      formName: '', formAtk: 0, formHp: 0, formAbility: '',
      tempAtkMods: [], tempHpMods: [],
      baseAbility: (card && card.ability) || '',
      slotType: slot.dataset.slotType || 'shikigami',
      slotFaction: (card && card.faction) || '',
      chargedCards: [],
      // 基础攻/命：快捷创建带卡库数值；空白创建 = null（未设置，避免载入后把"未设置"当成 0）
      baseAtk: (card && card.attack != null) ? card.attack : null,
      baseHp: (card && card.hp != null) ? card.hp : null,
      armor: 0, power: 0,
      incarn: [],
      _opts: opts,
    };
    if (card) {
      snap.attack = (card.attack != null) ? String(card.attack) : '';
      snap.hp = (card.hp != null) ? String(card.hp) : '';
    }
    if (_optVal(opts, 'permaKo')) snap.ko = String(slot._baseKoCountdown || 3);
    return snap;
  }

  // ── 徽章 ───────────────────────────────────────────────────
  function ensureBadge(slot) {
    let b = slot.querySelector('.switch-badge');
    if (!b) {
      b = document.createElement('button');
      b.type = 'button';
      b.className = 'card-badge switch-badge';
      b.title = '切换变身';
      b.setAttribute('aria-label', '切换变身');
      b.textContent = '🎭';
      slot.appendChild(b);
    }
    return b;
  }

  /** 刷新徽章显隐 / 化身下移 / 只读态 */
  function refreshBadge(slot) {
    if (!slot) return;
    const has = hasTargets(slot);
    slot.classList.toggle('has-switch', has);
    const b = slot.querySelector('.switch-badge');
    if (!has) { if (b) b.remove(); return; }
    ensureBadge(slot);
    const b2 = slot.querySelector('.switch-badge');
    if (b2) b2.classList.toggle('is-readonly', !isMySlot(slot));
  }

  /** 徽章点击：1 个变身直接切；多个弹窗选择（只有自己的卡槽可点） */
  function onBadgeClick(slot) {
    if (isSpectatorNow()) return;
    if (!isMySlot(slot)) return;
    const l = list(slot);
    if (l.length <= 1) return;
    if (l.length === 2) { switchTo(slot, (curIdx(slot) === 0 ? 1 : 0)); return; }
    openManager(slot);
  }

  // ── 切换核心 ───────────────────────────────────────────────
  function _playFlip(slot) {
    slot.classList.remove('switch-flip');
    void slot.offsetWidth;   // 重启动画
    slot.classList.add('switch-flip');
    setTimeout(() => slot.classList.remove('switch-flip'), 520);
  }

  /** 同步 + 刷新徽章 */
  function _sync(slot) {
    if (typeof syncSlotToPeer === 'function') syncSlotToPeer(slot);
    refreshBadge(slot);
  }

  function _reopenBonus() {
    // 注意：BonusPanel 是全局 const（不在 window 上），必须用 typeof 判断
    if (typeof BonusPanel !== 'undefined' && typeof BonusPanel.reopen === 'function') BonusPanel.reopen();
  }

  /** 切换到指定目标（普通切换，不重置） */
  function switchTo(slot, idx) {
    const sw = getSw(slot);
    if (!sw || !sw.list[idx]) return false;
    if ((sw.idx | 0) === (idx | 0)) return false;
    const fromName = (sw.list[sw.idx] && sw.list[sw.idx].name) || '本体';
    _saveCurrent(slot);
    sw.idx = idx | 0;
    const snap = _deepCopy(sw.list[idx]);
    delete snap._switch;
    const lvEl = slot.querySelector('.card-level');
    if (lvEl) snap.level = lvEl.value;   // 共享等级：切换不改变等级
    if (typeof setSlotState === 'function') setSlotState(slot, snap);
    _applyPermaKoOnEnter(slot);          // 「永久处于气绝」：切入时自动气绝
    if (typeof autoUpdateSlotImage === 'function') autoUpdateSlotImage(slot);
    _playFlip(slot);
    _sync(slot);
    const toName = (sw.list[idx] && sw.list[idx].name) || '本体';
    if (typeof broadcastSystemMsg === 'function') {
      broadcastSystemMsg(`【系统】「${fromName}」切换为「${toName}」`);
    }
    _reopenBonus();
    return true;
  }

  /** 自动切回本体 + 把离开的变身重置（仅列表内部使用） */
  function switchBackAndReset(slot, reason) {
    const sw = getSw(slot);
    if (!sw || (sw.idx | 0) === 0) return false;
    const leaver = sw.list[sw.idx] || {};
    const leaverName = leaver.name || '(未命名)';
    sw.list[sw.idx] = _buildResetSnapshot(slot, leaver);
    sw.idx = 0;
    const homeSnap = _deepCopy(sw.list[0]);
    delete homeSnap._switch;
    const lvEl = slot.querySelector('.card-level');
    if (lvEl) homeSnap.level = lvEl.value;   // 共享等级：切换不改变等级
    if (typeof setSlotState === 'function') setSlotState(slot, homeSnap);
    _playFlip(slot);
    _sync(slot);
    const homeName = (sw.list[0] && sw.list[0].name) || '本体';
    const evt = (reason === 'revive') ? '复活' : '气绝';
    if (typeof broadcastSystemMsg === 'function') {
      broadcastSystemMsg(`【系统】「${leaverName}」${evt}触发切回：已变回「${homeName}」，${leaverName}已重置`);
    }
    _reopenBonus();
    return true;
  }

  /** 供 dice.js：气绝结算时检查「气绝/复活时改为切回」（返回 true = 已处理，不再进入气绝） */
  function checkKoSwitchBack(slot) {
    const sw = getSw(slot);
    if (!sw || (sw.idx | 0) === 0) return false;
    const cur = sw.list[sw.idx];
    if (!cur || !cur._opts || !_optVal(cur._opts, 'koSwitchBack')) return false;
    return switchBackAndReset(slot, 'ko');
  }

  /** 供 dice.js：复活结算时检查（切回优先；永久气绝 → 不复活只重置倒计时）。返回 true = 已处理 */
  function checkReviveSwitchBack(slot) {
    const sw = getSw(slot);
    if (!sw) return false;
    const cur = sw.list[sw.idx | 0];
    const opts = cur && cur._opts;
    if (!opts) return false;
    if ((sw.idx | 0) !== 0 && _optVal(opts, 'koSwitchBack')) return switchBackAndReset(slot, 'revive');
    if (_optVal(opts, 'permaKo')) {
      const ov = slot.querySelector('.ko-overlay');
      if (!ov) return false;
      const inp = ov.querySelector('input');
      const base = String(slot._baseKoCountdown || 3);
      if (inp) inp.value = base;
      const icon = ov.querySelector('.ko-icon');
      if (icon) { icon.classList.add('spin-once'); setTimeout(() => icon.classList.remove('spin-once'), 500); }
      if (typeof broadcastSystemMsg === 'function') {
        broadcastSystemMsg(`【系统】「${cur.name || '变身'}」处于永久气绝状态，气绝倒计时重置为 ${base}`);
      }
      if (typeof syncSlotToPeer === 'function') syncSlotToPeer(slot);
      return true;
    }
    return false;
  }

  /** 切入时的规则：勾了「永久处于气绝」且未气绝 → 自动进入气绝 */
  function _applyPermaKoOnEnter(slot) {
    const sw = getSw(slot);
    if (!sw) return;
    const cur = sw.list[sw.idx | 0];
    if (!cur || !cur._opts || !_optVal(cur._opts, 'permaKo')) return;
    if (slot.querySelector('.ko-overlay')) return;
    if (typeof updateKoOverlay === 'function') {
      updateKoOverlay(slot, String(slot._baseKoCountdown || 3));
      if (typeof broadcastSystemMsg === 'function') {
        broadcastSystemMsg(`【系统】「${cur.name || '变身'}」处于永久气绝状态`);
      }
    }
  }

  /** 供 dice.js：本体气绝时检查「改为切换此变身」（返回 true = 已处理，本体不进入气绝倒计时） */
  function checkBodyKoSwitch(slot) {
    const sw = getSw(slot);
    if (!sw || (sw.idx | 0) !== 0) return false;
    const idx = sw.list.findIndex(function(t, i) { return i > 0 && t && t._opts && t._opts.bodyKoSwitch; });
    if (idx < 1) return false;
    const target = sw.list[idx];
    const targetName = target.name || '(未命名)';
    const bodyName = (sw.list[0] && sw.list[0].name) || '本体';
    // 1) 对本体的气绝清除效果照常执行（特效 / 战力护甲清零 / 倒计时重置 / 形态清除 / 属性重置）——但不进入气绝倒计时
    if (typeof StunFx !== 'undefined' && StunFx.clearAllFx) StunFx.clearAllFx(slot);
    if (slot._armor || slot._power) {
      slot._armor = 0;
      slot._power = 0;
      if (typeof updateStatusBadges === 'function') updateStatusBadges(slot);
    }
    if (slot.querySelector('.card-badge--countdown')) {
      const baseCd = slot._baseCountdown || 2;
      if (typeof updateSlotCountdownBadge === 'function') updateSlotCountdownBadge(slot, String(baseCd));
    }
    slot._formName = ''; slot._formAtk = 0; slot._formHp = 0; slot._formAbility = '';
    if (typeof renderFormBadge === 'function') renderFormBadge(slot);
    if (typeof resetToPermStats === 'function') resetToPermStats(slot);
    if (typeof updateKoOverlay === 'function') updateKoOverlay(slot, '');
    // 2) 保存本体（清除后的状态）→ 切换到目标
    _saveCurrent(slot);
    sw.idx = idx;
    const snap = _deepCopy(sw.list[idx]);
    delete snap._switch;
    const lvEl = slot.querySelector('.card-level');
    if (lvEl) snap.level = lvEl.value;   // 共享等级
    if (typeof setSlotState === 'function') setSlotState(slot, snap);
    _applyPermaKoOnEnter(slot);
    if (typeof autoUpdateSlotImage === 'function') autoUpdateSlotImage(slot);
    _playFlip(slot);
    _sync(slot);
    if (typeof broadcastSystemMsg === 'function') {
      broadcastSystemMsg(`【系统】本体的气绝改为切换：「${bodyName}」→「${targetName}」`);
    }
    _reopenBonus();
    return true;
  }

  // ── 创建 / 删除 / 选项 ─────────────────────────────────────
  /** 追加一个目标（不切换）；card 存在 = 从卡库带数据 */
  function appendTarget(slot, name, card, opts) {
    name = String(name || '').trim();
    if (!name) return { error: '名字不能为空' };
    const sw = _ensureStruct(slot);
    if (sw.list.some(t => String(t.name || '').trim() === name)) return { error: '已存在同名目标' };
    sw.list.push(_blankSnapshot(slot, name, card, opts));
    refreshBadge(slot);
    return { ok: true, idx: sw.list.length - 1 };
  }

  function removeTarget(slot, idx) {
    const sw = getSw(slot);
    if (!sw || idx <= 0 || !sw.list[idx]) return false;
    // 删的是当前显示目标 → 先切回本体
    if ((sw.idx | 0) === idx) switchTo(slot, 0);
    const removed = sw.list.splice(idx, 1);
    if (sw.idx > idx) sw.idx -= 1;
    _sync(slot);
    if (typeof BonusPanel !== 'undefined' && typeof BonusPanel.reopen === 'function') BonusPanel.reopen();
    if (typeof broadcastSystemMsg === 'function' && removed[0]) {
      broadcastSystemMsg(`【系统】移除了切换目标「${removed[0].name || '(未命名)'}」`);
    }
    return true;
  }

  function setOpt(slot, idx, key, val) {
    const sw = getSw(slot);
    if (!sw || !sw.list[idx]) return;
    if (!sw.list[idx]._opts) sw.list[idx]._opts = _defaultOpts();
    sw.list[idx]._opts[key] = !!val;
    // 「永久处于气绝」：勾选时若是当前显示的目标且未气绝 → 立即进入气绝
    if (key === 'permaKo' && val && (sw.idx | 0) === idx) _applyPermaKoOnEnter(slot);
    _sync(slot);
  }

  // ── 管理弹窗 ───────────────────────────────────────────────
  let overlay = null;
  let dlgSlot = null;         // 当前弹窗对应的槽
  let expandedIdx = null;     // ⚙ 展开的选项行 idx
  let quickOpen = false;      // 快捷列表展开态

  function _initOverlay() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'switch-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="switch-dialog">
        <div class="switch-dialog__header">
          <span class="switch-dialog__title">🎭 切换变身</span>
          <button type="button" class="switch-dialog__close" title="关闭">✕</button>
        </div>
        <div class="switch-dialog__body" id="switch-body"></div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.switch-dialog__close').addEventListener('click', closeManager);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeManager(); });
    // 事件委托：行点击 / ⚙ / ✕ / 勾选 / 创建 / 快捷
    overlay.addEventListener('click', _onDialogClick);
    overlay.addEventListener('change', _onDialogChange);
    overlay.addEventListener('keydown', (e) => {
      if (e.target && e.target.classList && e.target.classList.contains('switch-name-input') && e.key === 'Enter') {
        e.preventDefault();
        _doCreate();
      }
    });
  }

  function openManager(slot) {
    _initOverlay();
    dlgSlot = slot;
    expandedIdx = null;
    quickOpen = false;
    // 【修复】确保结构存在：没有变身的槽（预设拖入/直接放式神）用当前槽状态初始化本体快照，
    // 否则本体行会显示空数据（未命名、无属性）
    if (slot) {
      _ensureStruct(slot);
      // 打开时先把当前显示目标的最新状态同步进快照——否则列表显示的是上次切换时的旧数据
      _saveCurrent(slot);
      if (typeof syncSlotToPeer === 'function') syncSlotToPeer(slot);
    }
    _renderDialog();
    overlay.hidden = false;
    overlay.style.display = 'flex';
  }

  function closeManager() {
    if (!overlay) return;
    overlay.hidden = true;
    overlay.style.display = 'none';
    dlgSlot = null;
  }

  /** 快捷候选：官方卡库 + 我的 DIY 卡库里的变身牌 */
  function _quickCards() {
    const out = [];
    const seen = {};
    function push(c) {
      if (!c || !c.name || seen[c.name]) return;
      seen[c.name] = 1;
      out.push(c);
    }
    try {
      if (typeof CardDB !== 'undefined' && CardDB.getAll) {
        CardDB.getAll().filter(c => c && c.type === 'transform').forEach(push);
      }
      if (typeof CardDB !== 'undefined' && CardDB.getPlayerShikigami) {
        CardDB.getPlayerShikigami(myPid()).filter(c => c && c.type === 'transform').forEach(push);
      }
    } catch (e) { /* 数据源缺失时静默 */ }
    return out;
  }

  function _renderDialog() {
    const slot = dlgSlot;
    if (!slot || !overlay) return;
    const sw = getSw(slot);
    const l = sw ? sw.list : [];
    const cur = curIdx(slot);

    const rows = l.map((t, i) => {
      const isCur = i === cur;
      const name = esc(t.name || '(未命名)');
      const tag = (i === 0) ? '<span class="switch-row__tag">本体</span>' : '';
      const curTag = isCur ? '<span class="switch-row__cur">当前</span>' : '';
      const btns = (i > 0)
        ? '<button type="button" class="switch-row__opt' + (expandedIdx === i ? ' is-active' : '') + '" data-idx="' + i + '" title="选项">⚙</button>' +
          '<button type="button" class="switch-row__del" data-idx="' + i + '" title="删除">✕</button>'
        : '';
      const stats = `${esc(t.attack === '' || t.attack == null ? '-' : t.attack)}/${esc(t.hp === '' || t.hp == null ? '-' : t.hp)}`;
      const optRow = (expandedIdx === i && i > 0) ? _optRowHTML(t, i) : '';
      return `<div class="switch-row${isCur ? ' is-current' : ''}" data-idx="${i}">
          <span class="switch-row__mark"></span>
          <span class="switch-row__name">${name}</span>
          ${tag}${curTag}
          <span class="switch-row__stats">${stats}</span>
          ${btns}
        </div>${optRow}`;
    }).join('');

    const quick = _quickCards();
    const quickHTML = quick.map(c => {
      const created = l.some(t => String(t.name || '').trim() === c.name);
      return `<button type="button" class="switch-quick-item${created ? ' is-created' : ''}" data-name="${esc(c.name)}" ${created ? 'disabled' : ''} title="${esc(c.name)}">
          <span class="switch-quick-item__name">${esc(c.name)}</span>
          ${created ? '<span class="switch-quick-item__flag">已创建</span>' : `<span class="switch-quick-item__meta">${c.attack != null ? esc(c.attack) : '-'}/${c.hp != null ? esc(c.hp) : '-'}</span>`}
        </button>`;
    }).join('') || '<div class="switch-quick-empty">暂无变身牌（卡库里 type: transform 的卡会出现在这里）</div>';

    const body = overlay.querySelector('#switch-body');
    body.innerHTML = `
      <div class="switch-cur-line">当前：<b>${esc((l[cur] && l[cur].name) || '(未命名)')}</b>${cur === 0 ? '（本体）' : ''}</div>
      <div class="switch-list">${rows}</div>
      <div class="switch-create">
        <div class="switch-create-row">
          <input type="text" class="switch-name-input" placeholder="输入式神名" maxlength="12">
          <button type="button" class="switch-btn switch-btn--add">＋ 创建</button>
          <button type="button" class="switch-btn switch-btn--quick">快捷创建 ${quickOpen ? '▴' : '▾'}</button>
        </div>
        <div class="switch-quick-list" ${quickOpen ? '' : 'hidden'}>${quickHTML}</div>
        <div class="switch-create-msg" hidden></div>
      </div>
    `;
  }

  function _optRowHTML(t, i) {
    const o = t._opts || _defaultOpts();
    const back = !!o.koSwitchBack;
    const perma = _optVal(o, 'permaKo');
    const body = !!o.bodyKoSwitch;
    return `<div class="switch-opt-row" data-idx="${i}">
        <label class="switch-opt-item"><input type="checkbox" class="switch-opt-back" data-idx="${i}" ${back ? 'checked' : ''}> 气绝/复活时改为切回本体
          <span class="switch-opt-hint">（自身气绝或复活时：不进入气绝/复活，而是自动切回本体并重置自己；手动切换不触发）</span></label>
        <label class="switch-opt-item"><input type="checkbox" class="switch-opt-perma" data-idx="${i}" ${perma ? 'checked' : ''}> 此变身永久处于气绝状态
          <span class="switch-opt-hint">（切入时自动处于气绝；气绝倒计时结束或复活时会重置气绝倒计时）</span></label>
        <label class="switch-opt-item"><input type="checkbox" class="switch-opt-body" data-idx="${i}" ${body ? 'checked' : ''}> 本体气绝时改为切换此变身
          <span class="switch-opt-hint">（本体气绝时不进入气绝倒计时（仍执行气绝的清除效果），自动切换到此变身；多个变身都勾选时只生效列表里第一个）</span></label>
      </div>`;
  }

  function _msg(text, isErr) {
    if (!overlay) return;
    const m = overlay.querySelector('.switch-create-msg');
    if (!m) return;
    m.textContent = text;
    m.hidden = !text;
    m.classList.toggle('is-err', !!isErr);
  }

  function _doCreate() {
    if (!dlgSlot) return;
    const input = overlay.querySelector('.switch-name-input');
    const name = input ? input.value : '';
    const res = appendTarget(dlgSlot, name, null, _defaultOpts());
    if (res.error) { _msg(res.error, true); return; }
    _msg('');
    if (input) input.value = '';
    _sync(dlgSlot);
    expandedIdx = res.idx;
    _renderDialog();
    if (typeof broadcastSystemMsg === 'function') {
      broadcastSystemMsg(`【系统】添加了切换目标「${String(name).trim()}」`);
    }
  }

  function _onDialogClick(e) {
    const t = e.target;
    if (!dlgSlot) return;

    // 关闭
    if (t.classList && t.classList.contains('switch-dialog__close')) { closeManager(); return; }
    // 快捷展开
    if (t.classList && t.classList.contains('switch-btn--quick')) { quickOpen = !quickOpen; _renderDialog(); return; }
    // 快捷项
    const qi = t.closest ? t.closest('.switch-quick-item') : null;
    if (qi && !qi.disabled) {
      const name = qi.dataset.name;
      const card = _quickCards().find(c => c.name === name);
      if (!card) return;
      const res = appendTarget(dlgSlot, name, card, _defaultOpts());
      if (res.error) { _msg(res.error, true); return; }
      _msg('');
      switchTo(dlgSlot, res.idx);          // 快捷创建 → 立即切换
      if (typeof autoUpdateSlotImage === 'function') autoUpdateSlotImage(dlgSlot);
      expandedIdx = null;
      _renderDialog();
      return;
    }
    // 创建按钮
    if (t.classList && t.classList.contains('switch-btn--add')) { _doCreate(); return; }
    // ⚙ / ✕
    if (t.classList && t.classList.contains('switch-row__opt')) {
      const i = parseInt(t.dataset.idx, 10);
      expandedIdx = (expandedIdx === i) ? null : i;
      _renderDialog();
      return;
    }
    if (t.classList && t.classList.contains('switch-row__del')) {
      const i = parseInt(t.dataset.idx, 10);
      const sw = getSw(dlgSlot);
      const name = (sw && sw.list[i] && sw.list[i].name) || '(未命名)';
      if (!confirm(`确定删除变身「${name}」吗？`)) return;
      removeTarget(dlgSlot, i);
      expandedIdx = null;
      _sync(dlgSlot);
      _renderDialog();
      return;
    }
    // 行点击 = 切换
    const row = t.closest ? t.closest('.switch-row') : null;
    if (row) {
      const i = parseInt(row.dataset.idx, 10);
      if (i === curIdx(dlgSlot)) return;
      switchTo(dlgSlot, i);
      _renderDialog();
      return;
    }
  }

  function _onDialogChange(e) {
    const t = e.target;
    if (!dlgSlot || !t || !t.type || t.type !== 'checkbox') return;
    // 选项行勾选
    if (t.classList.contains('switch-opt-back')) {
      setOpt(dlgSlot, parseInt(t.dataset.idx, 10), 'koSwitchBack', t.checked);
      return;
    }
    if (t.classList.contains('switch-opt-perma')) {
      setOpt(dlgSlot, parseInt(t.dataset.idx, 10), 'permaKo', t.checked);
      return;
    }
    if (t.classList.contains('switch-opt-body')) {
      setOpt(dlgSlot, parseInt(t.dataset.idx, 10), 'bodyKoSwitch', t.checked);
      return;
    }
  }

  // ── 初始化：页面就绪后给所有槽刷一遍徽章 ────────────────────
  function _initAll() {
    document.querySelectorAll('.card-slot').forEach(slot => refreshBadge(slot));
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _initAll);
  } else {
    _initAll();
  }

  const api = {
    exportData, importData, refreshBadge, onBadgeClick, openManager,
    switchTo, switchBackAndReset, checkKoSwitchBack, checkReviveSwitchBack, checkBodyKoSwitch,
    appendTarget, removeTarget, setOpt, hasTargets,
    _deepCopy,   // 供外部（测试/游戏核心）复用
  };
  window.SwitchMgr = api;
  return api;
})();
