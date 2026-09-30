// ================================================================
//  js/stun-fx.js — 卡面状态特效
//  统一由一个「来源 → 特效」表驱动（判定依据：效果记录里的「来源」）：
//    · 眩晕：卡槽左上角不停旋转（逆时针）的 🌀 ；牌手则挂头像左上角
//    · 不屈：整张卡持续冒金光（呼吸式金光 + 向上飘的光）
//    · 屏障：金色椭圆护罩（缓慢呼吸）
//    · 帷幕：七彩流光旋转扫过卡面 + 紫色发光
//    · 昂扬：金色的流光从左下向右上掠过（如光如风）
//    · 迅捷：蓝色的流光从右下向左上掠过（如光如风）
//    · 庇佑：卡槽底部一朵金黑色莲花托着式神
//  说明：这些都只看「效果记录」（slot._permEffects）里的来源，**不在机制菜单里加按钮**；
//        牌手（.player-zone）只支持眩晕（用「幻境/效果」面板里名为「眩晕」的一条判定）。
//  用法：任何修改效果记录的地方调 StunFx.sync(目标)（另有低频兜底轮询）
// ================================================================
const StunFx = (() => {
  'use strict';

  const SOURCE = '眩晕';                 // 与式神管理 → 效果记录里的来源、牌手效果名一致
  const POLL_MS = 1000;                  // 兜底轮询间隔（效果记录写入点较多）
  const ENTER_MS = 340;                  // 入场动画时长（与 css/stun-fx.css 保持一致）
  const EXIT_MS = 300;                   // 离场动画时长
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
  /**
   * 效果记录里的「来源」→ 卡面特效。眩晕额外支持牌手（挂头像行）；其余只作用于式神卡槽。
   * 排列顺序 = 层级从低到高（卡图 < 帷幕 < 不屈 < 屏障 < 昂扬 < 迅捷 < 庇佑 < 其它元素），
   * 与 css 里的 z-index 双保险；眩晕在最上（8）。
   */
  const FX_DEFS = [
    { source: '眩晕', cls: 'stun-fx',   title: '眩晕', glyph: '🌀', zone: true,  avatarCls: 'stun-fx--avatar', enterMs: ENTER_MS, exitMs: EXIT_MS },
    { source: '帷幕', cls: 'fx-veil',   title: '帷幕', zone: false, enterMs: 520, exitMs: 360 },
    { source: '不屈', cls: 'fx-aura',   title: '不屈', zone: false, arcs: 2, enterMs: 440, exitMs: 320 },
    { source: '屏障', cls: 'fx-shield', title: '屏障', zone: false, enterMs: 400, exitMs: 300 },
    { source: '昂扬', cls: 'fx-fervor', title: '昂扬', zone: false, streaks: 8, enterMs: 420, exitMs: 320 },
    { source: '迅捷', cls: 'fx-swift',  title: '迅捷', zone: false, streaks: 8, enterMs: 420, exitMs: 320 },
    { source: '庇佑', cls: 'fx-lotus',  title: '庇佑', zone: false, petals: 7, sides: 2, enterMs: 460, exitMs: 340 }
  ];

  /** 这个目标（式神卡槽 / 牌手）的效果记录里有没有某条来源（严格相等：来源必须就写这几个字） */
  function hasSourceOn(el, source) {
    if (el.classList.contains('player-zone')) {
      const names = el.querySelectorAll('.effects-panel .effect-name');
      return Array.from(names).some(inp => String(inp.value || '').trim() === source);
    }
    const list = el._permEffects;
    return Array.isArray(list) && list.some(e => srcOf(e) === source);
  }

  /** 造一个特效元素（glyph = 🌀 那种字；petals = 莲花花瓣；sides = 莲花两侧长瓣；streaks = 流光条；arcs = 卡内上下各几条浅金色弧形） */
  function buildFx(def, isZone) {
    const d = document.createElement('div');
    d.className = def.cls + (isZone && def.avatarCls ? ' ' + def.avatarCls : '');
    d.title = def.title;
    d.setAttribute('aria-label', def.title);
    if (def.glyph) {
      const g = document.createElement('span');
      g.className = def.cls + '__glyph';
      g.textContent = def.glyph;
      d.appendChild(g);
    }
    if (def.petals) {
      for (let i = 1; i <= def.petals; i++) {
        const pt = document.createElement('span');
        pt.className = def.cls + '__petal ' + def.cls + '__petal--' + i;
        d.appendChild(pt);
      }
      const core = document.createElement('span');
      core.className = def.cls + '__core';
      d.appendChild(core);
    }
    if (def.sides) {
      for (let i = 1; i <= def.sides; i++) {
        ['l', 'r'].forEach(side => {
          const sd = document.createElement('span');
          sd.className = def.cls + '__side ' + def.cls + '__side--' + side + i;
          d.appendChild(sd);
        });
      }
    }
    if (def.streaks) {
      /* 流光条（迅捷/昂扬）：每条都给随机的小角度抖动 + 随机自转角 + 随机相位，每次出现都不重样 */
      for (let i = 1; i <= def.streaks; i++) {
        const stk = document.createElement('i');
        stk.className = def.cls + '__streak ' + def.cls + '__streak--' + i;
        stk.style.setProperty('--jit', ((Math.random() * 10) - 5).toFixed(1) + 'deg');
        stk.style.setProperty('--spin', ((Math.random() < 0.5 ? -1 : 1) * (7 + Math.random() * 8)).toFixed(1) + 'deg');
        stk.style.animationDelay = (-Math.random() * 2.4).toFixed(2) + 's';
        d.appendChild(stk);
      }
    }
    if (def.arcs) {
      const wrap = document.createElement('span');
      wrap.className = def.cls + '__arcs';
      for (let i = 1; i <= def.arcs; i++) {
        ['t', 'b'].forEach(side => {
          const a = document.createElement('span');
          a.className = def.cls + '__arc ' + def.cls + '__arc--' + side + i;
          wrap.appendChild(a);
        });
      }
      d.appendChild(wrap);
    }
    return d;
  }

  /** 同步一种特效：没有就加（带入场动画）、没了就渐隐消失 */
  function syncOne(el, def, isZone) {
    const host = isZone ? el.querySelector('.player-avatar-name-row') : el;
    if (!host) return;
    const on = hasSourceOn(el, def.source);
    const cur = host.querySelector('.' + def.cls);
    const enterCls = def.cls + '--enter';
    const exitCls = def.cls + '--exit';
    if (on && !cur) {
      const d = buildFx(def, isZone);
      d.classList.add(enterCls);
      // 卡槽：插到【卡图之后、其它信息之前】——这样层级就是「卡图 < 特效 < 其它所有元素」
      const art = isZone ? null : host.querySelector('.card-art');
      if (art && art.parentNode === host) host.insertBefore(d, art.nextSibling);
      else host.appendChild(d);
      d._fxEnterTimer = setTimeout(() => d.classList.remove(enterCls), def.enterMs + 40);
    } else if (on && cur) {
      // 还在生效：如果正在播渐隐，就撤销并重播入场
      if (cur.classList.contains(exitCls)) {
        clearTimeout(cur._fxExitTimer);
        cur.classList.remove(exitCls);
        cur.classList.add(enterCls);
        clearTimeout(cur._fxEnterTimer);
        cur._fxEnterTimer = setTimeout(() => cur.classList.remove(enterCls), def.enterMs + 40);
      }
    } else if (!on && cur && !cur.classList.contains(exitCls)) {
      // 离场：渐隐播完再把元素拿掉（不再立即 remove）
      cur.classList.remove(enterCls);
      cur.classList.add(exitCls);
      clearTimeout(cur._fxExitTimer);
      cur._fxExitTimer = setTimeout(() => cur.remove(), def.exitMs + 40);
    }
  }

  /** 同步一个目标（式神卡槽 / 牌手 zone）的全部卡面特效 */
  function sync(el) {
    if (!el || !el.classList || (!el.classList.contains('card-slot') && !el.classList.contains('player-zone'))) return;
    const isZone = el.classList.contains('player-zone');
    if (!isZone) fillEmptyDesc(el);          // 式神：顺手把「效果说明」为空的那条补上规则说明
    else fillPlayerDesc(el);                  // 牌手：同理，给「眩晕」行补上说明
    FX_DEFS.forEach(def => { if (isZone && !def.zone) return; syncOne(el, def, isZone); });
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

  /** 消耗「一个」指定来源的效果：有层数就 −1，只剩 1 层就整条移除。返回是否真的消耗了（屏障/不屈用） */
  function consumeOne(slot, source) {
    if (!slot || !Array.isArray(slot._permEffects)) return false;
    const idx = slot._permEffects.findIndex(e => srcOf(e) === source);
    if (idx < 0) return false;
    const ef = slot._permEffects[idx];
    if ((ef.layers || 1) > 1) ef.layers -= 1;
    else slot._permEffects.splice(idx, 1);
    sync(slot);
    return true;
  }

  /** 气绝：移除全部卡面特效对应的效果记录（屏障/不屈/庇佑/帷幕/眩晕/迅捷/昂扬） */
  function clearAllFx(slot) {
    if (!slot || !Array.isArray(slot._permEffects)) return false;
    const sources = FX_DEFS.map(d => d.source);
    const before = slot._permEffects.length;
    slot._permEffects = slot._permEffects.filter(e => !sources.includes(srcOf(e)));
    if (slot._permEffects.length === before) return false;
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

  return { init, sync, syncAll, hasStun, toggleSlot, togglePlayer, clearStun, clearAllFx, consumeOne, hasSourceOn, SOURCE, DESC };
})();
