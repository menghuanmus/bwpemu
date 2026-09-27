// ================================================================
//  js/stun-fx.js — 眩晕特效
//  判定依据：
//    · 式神：卡槽的「效果记录」（slot._permEffects）里有来源 =「眩晕」
//    · 牌手：该玩家的「幻境/效果」面板（.effects-panel）里有一条名为「眩晕」
//  表现：目标左上角出现一个不停旋转（逆时针）的 🌀
//    · 式神：卡槽左上角（等级 / 💠 式神管理的右下一点）
//    · 牌手：头像左上角
//  用法：任何修改效果记录的地方调 StunFx.sync(目标)（另有低频兜底轮询）
// ================================================================
const StunFx = (() => {
  'use strict';

  const SOURCE = '眩晕';                 // 与式神管理 → 效果记录里的来源、牌手效果名一致
  const POLL_MS = 1000;                  // 兜底轮询间隔（效果记录写入点较多）
  /** 眩晕的规则说明：写在式神管理的「效果记录 → 效果」里（之前是空的） */
  const DESC = '处于眩晕的式神无法出击和使用自身卡牌；若牌手被眩晕，则该牌手的所有式神无法出击';

  function srcOf(e) { return e && String(e.source == null ? '' : e.source).trim(); }
  function descOf(e) { return String(e && e.desc == null ? '' : e.desc).trim(); }

  /** 把「来源=眩晕但效果说明为空」的记录补上说明（新加的带上，老数据/对方先加的也自动补齐） */
  function fillEmptyDesc(slot) {
    const list = slot && slot._permEffects;
    if (!Array.isArray(list)) return false;
    let changed = false;
    list.forEach(e => { if (e && srcOf(e) === SOURCE && !descOf(e)) { e.desc = DESC; changed = true; } });
    return changed;
  }

  /** 式神是否有眩晕（效果记录里有来源为「眩晕」的一条） */
  function slotHasStun(slot) {
    const list = slot && slot._permEffects;
    return Array.isArray(list) && list.some(e => srcOf(e) === SOURCE);
  }
  /** 牌手是否有眩晕（幻境/效果面板里有一条名为「眩晕」） */
  function playerHasStun(zone) {
    if (!zone) return false;
    const names = zone.querySelectorAll('.effects-panel .effect-name');
    return Array.from(names).some(inp => String(inp.value || '').trim() === SOURCE);
  }
  /** 通用：目标（卡槽 或 player-zone）是否有眩晕 */
  function hasStun(el) {
    if (!el || !el.classList) return false;
    if (el.classList.contains('player-zone')) return playerHasStun(el);
    if (el.classList.contains('card-slot')) return slotHasStun(el);
    return false;
  }
  /** 🌀 挂在哪里：式神挂卡槽本身；牌手挂到头像那一行（头像有 overflow:hidden，不能挂头像里） */
  function hostOf(el) {
    if (el.classList.contains('player-zone')) return el.querySelector('.player-avatar-name-row');
    return el;
  }

  /** 同步一个目标（式神卡槽 / 牌手 zone）的眩晕特效：有就加、没有就删 */
  function sync(el) {
    if (!el || !el.classList || (!el.classList.contains('card-slot') && !el.classList.contains('player-zone'))) return;
    const isZone = el.classList.contains('player-zone');
    if (!isZone) fillEmptyDesc(el);          // 式神：顺手把「效果说明」为空的那条补上规则说明
    else fillPlayerDesc(el);                  // 牌手：同理，给「眩晕」行补上说明
    const host = hostOf(el);
    if (!host) return;
    const on = hasStun(el);
    const cur = host.querySelector('.stun-fx');
    if (on && !cur) {
      const d = document.createElement('div');
      d.className = 'stun-fx' + (isZone ? ' stun-fx--avatar' : '');
      d.textContent = '🌀';
      d.title = '眩晕';
      d.setAttribute('aria-label', '眩晕');
      host.appendChild(d);
    } else if (!on && cur) {
      cur.remove();
    }
  }

  function syncAll() {
    document.querySelectorAll('.card-slot').forEach(sync);
    document.querySelectorAll('.player-zone').forEach(sync);
  }

  /** 切换式神眩晕：true = 本次「施加」，false = 本次「解除」，null = 目标无效 */
  function toggleSlot(slot) {
    if (!slot) return null;
    if (!Array.isArray(slot._permEffects)) slot._permEffects = [];
    if (slotHasStun(slot)) {
      slot._permEffects = slot._permEffects.filter(e => srcOf(e) !== SOURCE);
      sync(slot);
      return false;
    }
    slot._permEffects.push({ source: SOURCE, desc: DESC, layers: 1 });
    sync(slot);
    return true;
  }

  /** 切换牌手眩晕（用「幻境/效果」面板的条目表示，沿用现有同步/存档/撤销机制） */
  function togglePlayer(zone) {
    const panel = zone && zone.querySelector('.effects-panel');
    if (!panel || typeof createEffectItem !== 'function') return null;
    const hit = Array.from(panel.querySelectorAll('.effect-item'))
      .find(it => String(((it.querySelector('.effect-name') || {}).value) || '').trim() === SOURCE);
    if (hit) {
      hit.remove();
      sync(zone);
      return false;
    }
    const item = createEffectItem();
    const nameInput = item.querySelector('.effect-name');
    if (nameInput) nameInput.value = SOURCE;
    // 牌手这边没有「说明」栏，把规则说明写到后面的栏位并挂上悬浮提示，避免只挂个「眩晕」没解释
    const valInput = item.querySelector('.effect-value');
    if (valInput) { valInput.value = DESC; valInput.title = DESC; }
    if (nameInput) nameInput.title = DESC;
    panel.appendChild(item);
    sync(zone);
    return true;
  }

  /** 气绝：清掉该式神的眩晕（返回是否真有改动） */
  function clearStun(slot) {
    if (!slot || !Array.isArray(slot._permEffects)) return false;
    const before = slot._permEffects.length;
    const filtered = slot._permEffects.filter(e => srcOf(e) !== SOURCE);
    if (filtered.length === before) return false;
    slot._permEffects = filtered;
    sync(slot);
    return true;
  }

  /** 牌手：给已存在的「眩晕」行补上说明（只补空值，不覆盖用户自填） */
  function fillPlayerDesc(zone) {
    if (!zone) return false;
    let changed = false;
    zone.querySelectorAll('.effects-panel .effect-item').forEach(it => {
      const nm = it.querySelector('.effect-name');
      if (!nm || String(nm.value || '').trim() !== SOURCE) return;
      const val = it.querySelector('.effect-value');
      if (val && !String(val.value || '').trim()) { val.value = DESC; changed = true; }
      if (nm && !nm.title) nm.title = DESC;
      if (val && !val.title) val.title = DESC;
    });
    return changed;
  }

  function init() {
    syncAll();
    // 兜底：效果记录写入点较多（式神管理 / 牌手效果面板 / 联机同步 / 快照 / 撤销等），
    // 低频轮询保证不漏；只有 ≤10 个卡槽 + 2 个牌手，判定极轻（后台也同步，避免切回来看到旧状态）
    setInterval(syncAll, POLL_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { init, sync, syncAll, hasStun, toggleSlot, togglePlayer, clearStun, SOURCE, DESC };
})();
