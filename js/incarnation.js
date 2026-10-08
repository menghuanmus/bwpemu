// ================================================================
//  js/incarnation.js — 化身系统
//  「化身」= 挂在式神卡槽上的概率计数器（一个式神可以挂多个）
//  数据：slot._incarn = [{ name, prob, turnAdd, actAdd, maxTriggers, onlyKo, triggers, note }]
//  入口：机制菜单「🪞 化身」（选式神 → 添加/打开面板）
//        机制菜单「🪞 化身行动」（谁点就加谁：给自己所有式神的所有化身 +行动概率并判定）
//  依赖：game-core（卡槽 / syncSlotToPeer / 卡槽状态）、chat（广播 / 消息分组 / toast）
// ================================================================
const Incarnation = (() => {
  'use strict';

  const MOBILE_MQ = window.matchMedia('(max-width: 768px)');
  const ROW_STEP = 14;                 // 手机端信息栏每行高度（与 mobile.css 一致）
  const PROB_MAX = 100, ADD_MAX = 100, TRIG_MAX = 99;
  const NO_MARK = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
  const MODE_ALIVE = 'alive';          // 存活触发（默认）：只在未气绝时
  const MODE_KO = 'ko';                // 气绝触发：只在气绝时
  const MODE_ANY = 'any';              // 均可触发：任何状态
  const STUN_SOURCE = '眩晕';          // 眩晕：式神管理 → 效果记录里来源为「眩晕」

  let panelOverlay = null, panelBody = null, panelTitleEl = null;
  let curSlot = null;
  let panelOpenIdx = 0;                // 当前展开的化身（-1 = 全部收缩）
  let triggerOverlay = null, triggerBody = null;
  let turnBuffer = null;               // 回合开始的结算缓冲（等复活完再统一播报）

  // ================================================================
  //  小工具
  // ================================================================
  function isSpec() { return typeof isSpectator !== 'undefined' && !!isSpectator; }
  function myPid() { return (typeof localPlayerId !== 'undefined' && localPlayerId) ? String(localPlayerId) : '1'; }
  function pname(pid) { return (typeof getPlayerName === 'function') ? getPlayerName(pid) : ('玩家' + pid); }
  function toast(t, d) { if (typeof showActionToast === 'function') showActionToast(t, d || ''); }
  function esc(s) {
    if (typeof escapeHTML === 'function') return escapeHTML(String(s == null ? '' : s));
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }
  /** 整数化：一律向上取整后 clamp（R18） */
  function toInt(v, min, max, def) {
    let n = (typeof v === 'number') ? v : parseFloat(String(v == null ? '' : v).trim());
    if (Number.isNaN(n)) n = def;
    n = Math.ceil(n);
    if (n < min) n = min;
    if (n > max) n = max;
    return n;
  }
  function clone(v) {
    try { return JSON.parse(JSON.stringify(v)); } catch (e) { return []; }
  }
  function defInc() {
    return { name: '化身', prob: 0, turnAdd: 25, actAdd: 15, maxTriggers: 1,
             mode: MODE_ALIVE, onlyKo: false, triggers: 0, paused: false, note: '' };
  }
  /** 归一化单个化身（旧数据/缺字段都走这里，不能报错） */
  function normInc(raw) {
    const d = defInc();
    if (!raw || typeof raw !== 'object') return d;
    let mode = raw.mode;
    if (mode !== MODE_ALIVE && mode !== MODE_KO && mode !== MODE_ANY) {
      mode = raw.onlyKo ? MODE_KO : MODE_ALIVE;      // 旧数据兼容：onlyKo
    }
    return {
      name: (typeof raw.name === 'string' && raw.name.trim()) ? raw.name.trim().slice(0, 12) : d.name,
      prob: toInt(raw.prob, 0, PROB_MAX, d.prob),
      turnAdd: toInt(raw.turnAdd, 0, ADD_MAX, d.turnAdd),
      actAdd: toInt(raw.actAdd, 0, ADD_MAX, d.actAdd),
      maxTriggers: toInt(raw.maxTriggers, 0, TRIG_MAX, d.maxTriggers),
      mode,
      onlyKo: mode === MODE_KO,                     // 旧字段同步，保证旧代码/存档兼容
      triggers: toInt(raw.triggers, 0, TRIG_MAX, 0),
      paused: !!raw.paused,                         // 暂停：不加概率、不判定
      note: (typeof raw.note === 'string') ? raw.note.slice(0, 200) : '',
    };
  }
  function getList(slot) {
    if (!slot || !Array.isArray(slot._incarn)) return [];
    return slot._incarn;
  }
  function setList(slot, arr) {
    if (!slot) return;
    slot._incarn = (Array.isArray(arr) ? arr : []).map(normInc);
  }
  function save(slot) {
    if (typeof syncSlotToPeer === 'function') syncSlotToPeer(slot);
  }
  function cardNameOf(slot) {
    if (!slot) return '未命名';
    const v = ((slot.querySelector('.card-name') || {}).value || '').trim();
    return v || '未命名';
  }
  function isKo(slot) { return !!(slot && slot.querySelector('.ko-overlay')); }
  /** 眩晕：式神管理 → 效果记录里有一条来源为「眩晕」 */
  function isStunned(slot) {
    if (!slot) return false;
    const list = slot._permEffects || [];
    return list.some(e => e && String(e.source == null ? '' : e.source).trim() === STUN_SOURCE);
  }
  /** 触发条件（存活/气绝/均可）是否能增长与判定；已暂停一律不参与 */
  function canGrow(inc, slot) {
    if (!inc || inc.paused) return false;             // 暂停：不加概率、不判定
    if (inc.mode === MODE_ANY) return true;
    if (inc.mode === MODE_KO) return isKo(slot);
    return !isKo(slot);
  }
  function modeLabel(mode) {
    if (mode === MODE_KO) return '气绝触发';
    if (mode === MODE_ANY) return '均可触发';
    return '存活触发';
  }
  function markOf(idx) { return NO_MARK[idx] || ('(' + (idx + 1) + ')'); }

  // ================================================================
  //  徽章 / 手机端行
  // ================================================================
  /** 选一个「代表」化身：
   *  优先「没暂停 + 本回合还能触发」里概率最高的；
   *  只要还有没暂停的就轮不到暂停的（多化身时暂停一个 → 徽章自动换成另一个）；
   *  全部都暂停了，才显示暂停的那个（徽章上大锁）*/
  function pickInc(list) {
    if (!list.length) return null;
    const active = list.filter(i => !i.paused);
    const pool = active.length ? active : list;
    const canTrig = pool.filter(i => i.triggers < i.maxTriggers);
    const pickFrom = canTrig.length ? canTrig : pool;
    let best = pickFrom[0];
    pickFrom.forEach(i => { if (i.prob > best.prob) best = i; });
    return { inc: best, capped: best.triggers >= best.maxTriggers, multi: list.length > 1 };
  }
  /** 悬停提示：列出全部化身 */
  function tipText(slot, list) {
    const ko = isKo(slot);
    const stun = isStunned(slot);
    return list.map((i, n) => {
      const cap = (i.triggers >= i.maxTriggers) ? '，已达上限' : '';
      const noGrow = !canGrow(i, slot) ? '（' + modeLabel(i.mode) + '条件不符，不结算）' : '';
      const stunTxt = (stun && canGrow(i, slot)) ? '（眩晕中，只加概率不判定）' : '';
      return `${markOf(n)} ${i.name} ${i.prob}%（本回合 ${i.triggers}/${i.maxTriggers}${cap}）${noGrow}${stunTxt}`;
    }).join('\n') + (ko ? '\n（该式神气绝中）' : '');
  }
  function ensureBadge(slot) {
    let b = slot.querySelector('.incarn-badge');
    if (!b) {
      b = document.createElement('div');
      // 带 card-badge：这样会被「长按浮窗 / 拖拽 / 点卡图上传」跳过（否则点击会被它们截走）
      b.className = 'card-badge incarn-badge';
      b.innerHTML = '<i class="incarn-badge__stack"></i>' +
        '<span class="incarn-badge__bg"><i class="incarn-badge__fill"></i>' +
        '<span class="incarn-badge__mask">🪞</span></span>' +
        '<span class="incarn-badge__val"></span>' +
        '<span class="incarn-badge__lock">🔒</span>' +
        '<span class="incarn-badge__plock">🔒</span>' +
        '<span class="incarn-badge__more"></span>';
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        openPanel(slot);
      });
      slot.appendChild(b);
    }
    return b;
  }
  function ensureRow(slot) {
    let r = slot.querySelector('.incarn-row');
    if (!r) {
      // 用 div + role=button：内部要能横向滑动（button 在手机上滑动不可靠）；
      // 已把 .incarn-row 加进 card-tooltip 的「交互控件」名单，长按浮窗不会抢走点击
      r = document.createElement('div');
      r.className = 'incarn-row';
      r.setAttribute('role', 'button');
      r.innerHTML = '<span class="incarn-row__scroll"></span>';
      let downX = null;
      r.addEventListener('pointerdown', (e) => { downX = e.clientX; });
      r.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        // 左右滑动查看其他化身时，不算点击
        if (downX !== null && Math.abs(e.clientX - downX) > 8) return;
        openPanel(slot);
      });
      slot.appendChild(r);
    }
    return r;
  }
  /** 刷新某个卡槽上的徽章 / 手机端行 */
  function refresh(slot) {
    if (!slot) return;
    const list = getList(slot);
    const badge = slot.querySelector('.incarn-badge');
    const row = slot.querySelector('.incarn-row');

    if (!list.length) {
      if (badge) badge.remove();
      if (row) row.remove();
      syncInfoHeight(slot);
      return;
    }

    const pick = pickInc(list);
    const allBlocked = list.every(i => !canGrow(i, slot));
    const tip = tipText(slot, list);

    // 桌面端徽章：数字 + 「注水」式进度（0% 空的，100% 满）
    const b = ensureBadge(slot);
    const prob = pick.inc.prob;
    b.querySelector('.incarn-badge__val').textContent = prob + '%';
    b.style.setProperty('--incarn-p', prob + '%');
    b.classList.toggle('is-capped', pick.capped);
    b.classList.toggle('is-blocked', allBlocked);
    b.classList.toggle('is-paused', !!pick.inc.paused);
    b.classList.toggle('is-multi', list.length > 1);
    b.classList.toggle('is-many', list.length > 2);
    // 多个化身：右上角显示「还有 n 个」的角标（数字比小圆点清楚）
    b.querySelector('.incarn-badge__more').textContent = '+' + Math.max(1, list.length - 1);
    // 不再用自带悬浮提示：化身信息统一显示在「式神悬浮窗」里

    // 手机端行：横着排开全部化身（多了就左右滑动看）
    const r = ensureRow(slot);
    r.querySelector('.incarn-row__scroll').innerHTML = list.map((inc, i) => {
      const capped = inc.triggers >= inc.maxTriggers;
      const mark = (list.length > 1) ? '<b class="incarn-row__mark">' + markOf(i) + '</b>' : '';
      const pause = inc.paused ? '<b class="incarn-row__lock">🔒</b>' : '';
      return '<span class="incarn-row__chip' + (capped ? ' is-capped' : '') + (inc.paused ? ' is-paused' : '') + '">' + pause + mark +
        '<span class="incarn-row__name">' + esc(inc.name) + '</span>' +
        '<span class="incarn-row__prob">' + inc.prob + '%</span></span>';
    }).join('');
    r.classList.toggle('is-capped', pick.capped);
    r.classList.toggle('is-blocked', allBlocked);

    syncInfoHeight(slot);
  }

  /** 手机端信息栏高度：有化身行时由 JS 动态计算（无化身则交回原 CSS 规则） */
  function syncInfoHeight(slot) {
    if (!slot) return;
    if (!MOBILE_MQ.matches || !slot.querySelector('.incarn-row')) {
      slot.style.removeProperty('--info-h');
      return;
    }
    let rows = 1;                                        // 名字（恒有）
    if (slot.querySelector('.card-form-badge')) rows++;
    if (slot.querySelector('.card-curses')) rows++;
    if (slot.querySelector('.charge-indicator')) rows++;
    rows++;                                              // 化身行
    slot.style.setProperty('--info-h', (rows * ROW_STEP) + 'px');
  }

  function watchSlot(slot) {
    if (!slot || slot.dataset.incarnWatched === '1') return;
    slot.dataset.incarnWatched = '1';
    if (typeof MutationObserver === 'function') {
      const mo = new MutationObserver(() => syncInfoHeight(slot));
      mo.observe(slot, { childList: true, subtree: false });
    }
    refresh(slot);
  }
  function watchAll() {
    document.querySelectorAll('.card-slot').forEach(watchSlot);
  }

  // ================================================================
  //  判定核心
  // ================================================================
  function slotsOf(playerId) {
    const zone = document.querySelector('.player-zone[data-player="' + playerId + '"]');
    if (!zone) return [];
    return Array.from(zone.querySelectorAll('.card-slot'));
  }

  /** 对一批化身做「+delta 后判定」，返回明细数组（不改消息） */
  function judgeList(slot, list, source) {
    const cardName = cardNameOf(slot);
    const stunned = isStunned(slot);
    const out = [];
    list.forEach((inc, idx) => {
      if (inc.paused) {                                 // 暂停：不加概率、不判定（默默跳过）
        out.push({ idx, inc, cardName, slot, paused: true });
        return;
      }
      if (!canGrow(inc, slot)) {
        out.push({ idx, inc, cardName, slot, skipped: true });
        return;
      }
      const delta = (source === 'turn') ? inc.turnAdd : inc.actAdd;
      const before = inc.prob;
      const mid = Math.max(0, Math.min(PROB_MAX, before + delta));
      const capped = inc.triggers >= inc.maxTriggers;
      inc.prob = mid;
      if (capped) {                                     // A1：到上限也照样加，但不再判定
        out.push({ idx, inc, cardName, slot, before, mid, capped: true });
        return;
      }
      if (stunned) {                                    // 眩晕：只加概率，不判定
        out.push({ idx, inc, cardName, slot, before, mid, stunned: true });
        return;
      }
      const roll = 1 + Math.floor(Math.random() * 100);
      if (roll <= mid) {
        inc.prob = 0;
        inc.triggers += 1;
        out.push({ idx, inc, cardName, slot, before, mid, roll, hit: true });
      } else {
        out.push({ idx, inc, cardName, slot, before, mid, roll, hit: false });
      }
    });
    return out;
  }

  /** 判定并落盘 + 刷新徽章；回合开始时会直接把「概率变化」写进当前消息组 */
  function settleSlot(slot, playerId, source) {
    const list = getList(slot);
    if (!list.length) return [];
    const out = judgeList(slot, list, source);
    save(slot);
    refresh(slot);
    if (panelOverlay && !panelOverlay.hidden && curSlot === slot) renderPanel(false);
    if (turnBuffer && turnBuffer.playerId === playerId) {
      out.forEach(o => {
        if (!o.skipped && !o.paused && typeof broadcastSystemMsg === 'function') broadcastSystemMsg(lineOf(o));
        turnBuffer.results.push(o);
      });
    }
    return out;
  }

  // ================================================================
  //  消息（公开概率变化 + 本地掷点明细）
  // ================================================================
  function lineOf(r) {
    if (r.stunned) return `「${r.cardName}」${r.inc.name}：${r.before}% → ${r.mid}%（式神处于眩晕，无法判定化身）`;
    const tag = r.capped ? '（已达上限，暂不判定）' : (r.hit ? ' → 触发！归零' : '');
    return `「${r.cardName}」${r.inc.name}：${r.before}% → ${r.mid}%${tag}`;
  }
  function report(playerId, source, results) {
    const grown = results.filter(r => !r.skipped && !r.paused);
    const hits = results.filter(r => r.hit);
    const title = (source === 'turn')
      ? `【系统】「${pname(playerId)}」的回合开始：化身结算`
      : `【系统】${pname(playerId)}触发了「化身行动」`;

    if (typeof startMessageGroup === 'function' && typeof endMessageGroup === 'function') {
      startMessageGroup(title, null);
      if (grown.length) {
        grown.forEach(r => broadcastSystemMsg(lineOf(r)));
      } else {
        broadcastSystemMsg('本次没有化身可结算（暂停、气绝或条件不符）');
      }
      endMessageGroup();
    } else if (typeof broadcastSystemMsg === 'function') {
      broadcastSystemMsg(title);
      grown.forEach(r => broadcastSystemMsg(lineOf(r)));
    }

    // 本地明细已按要求取消：不再发「化身判定明细（仅你可见）」
    // 触发 → 弹「化身效果说明」（合并成一个窗口）+ 同步给对方播动画
    if (hits.length) { broadcastTrigger(hits); showTrigger(hits); }
  }

  /** 直接判定：以当前概率正式判一次（不加概率；命中则归零并占一次本回合次数） */
  function directJudge(slot, inc) {
    const who = pname(myPid());
    const card = cardNameOf(slot);
    const head = `【系统】${who}以当前概率对「${card}」${inc.name} 直接判定：`;
    if (inc.paused) {
      broadcastSystemMsg(head + '该化身已暂停，本次不判定');
      return null;
    }
    if (!canGrow(inc, slot)) {
      broadcastSystemMsg(head + `${modeLabel(inc.mode)}条件不符，本次不判定`);
      return null;
    }
    if (inc.triggers >= inc.maxTriggers) {
      broadcastSystemMsg(head + `本回合已达上限（${inc.triggers}/${inc.maxTriggers}），本次不判定`);
      return null;
    }
    if (isStunned(slot)) {
      broadcastSystemMsg(head + '式神处于眩晕，无法判定化身');
      return null;
    }
    const before = inc.prob;
    const roll = 1 + Math.floor(Math.random() * 100);
    const hit = roll <= before;
    if (hit) { inc.prob = 0; inc.triggers += 1; }
    broadcastSystemMsg(head + `${before}% → 掷出 ${roll} → ${hit ? '触发！概率归零' : '未触发'}`);
    if (hit) { broadcastTrigger([{ cardName: card, inc, slot }]); showTrigger([{ cardName: card, inc, slot }]); }
    return { hit, roll, before };
  }

  /** 触发提示：合并显示所有触发的化身效果说明 */
  function ensureTrigger() {
    if (triggerOverlay) return;
    triggerOverlay = document.createElement('div');
    triggerOverlay.className = 'incarn-trigger-overlay';
    triggerOverlay.hidden = true;
    triggerOverlay.innerHTML = `
      <div class="incarn-trigger">
        <div class="incarn-trigger__title">🪞 化身触发！</div>
        <div class="incarn-trigger__body" id="incarn-trigger-body"></div>
        <button type="button" class="incarn-trigger__ok" id="incarn-trigger-ok">知道了</button>
      </div>`;
    document.body.appendChild(triggerOverlay);
    triggerBody = triggerOverlay.querySelector('#incarn-trigger-body');
    triggerOverlay.querySelector('#incarn-trigger-ok').addEventListener('click', () => { triggerOverlay.hidden = true; });
    triggerOverlay.addEventListener('click', (e) => {
      if (e.target === triggerOverlay) triggerOverlay.hidden = true;
    });
  }
  /** 触发动画终点的中心坐标：与「使用牌预展示」的位置保持一致（电脑/手机都走同一套） */
  function _fxEndCenter(playerId) {
    try {
      if (typeof CardFlight !== 'undefined' && CardFlight.previewMetrics) {
        const m = CardFlight.previewMetrics(playerId);
        if (m && typeof m.left === 'number' && typeof m.top === 'number') {
          return { x: m.left + 100, y: m.top + 140 };   // 预展示牌约 200×280 → 取中心
        }
      }
    } catch (e) { /* 回退到屏幕中心 */ }
    return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  }

  /** 触发表现：🪞 从式神处飞出 → 边飞边放大 + 水平翻转 → 变成方框
   *  方框上边缘中心一个更大的 🪞，框内中心是化身名（大字），下方贴边是式神名（小字） */
  function playTriggerFx(item) {
    if (typeof gsap === 'undefined' || !item || !item.slot || !item.slot.isConnected) return false;
    const r = item.slot.getBoundingClientRect();
    if (!r || !r.width) return false;
    const end = _fxEndCenter(item.slot.dataset.slotPlayer || '1');
    const endX = end.x;
    const endY = end.y;
    const wrap = document.createElement('div');
    wrap.className = 'incarn-fx';
    wrap.innerHTML = '<div class="incarn-fx__mask">🪞</div>' +
      '<div class="incarn-fx__box">' +
        '<div class="incarn-fx__badge">🪞</div>' +
        '<div class="incarn-fx__name"></div>' +
        '<div class="incarn-fx__owner"></div>' +
      '</div>';
    wrap.querySelector('.incarn-fx__name').textContent = item.inc.name || '化身';
    wrap.querySelector('.incarn-fx__owner').textContent = item.cardName || '';
    document.body.appendChild(wrap);
    const maskEl = wrap.querySelector('.incarn-fx__mask');
    const boxEl = wrap.querySelector('.incarn-fx__box');
    const tl = gsap.timeline({ onComplete: () => wrap.remove() });
    const holdTime = (typeof CardFlight !== 'undefined' && CardFlight.isMobileView && CardFlight.isMobileView()) ? 1.5 : 3.5;
    const boxShowAt = 0.9;                          // 方框出现时间点
    const fadeAt = boxShowAt + holdTime;            // 展示 holdTime 后开始淡出
    tl.set(maskEl, { left: r.left + r.width / 2, top: r.top + r.height / 2, xPercent: -50, yPercent: -50, scale: 0.4, scaleX: 1, opacity: 0 });
    tl.set(boxEl, { left: endX, top: endY, xPercent: -50, yPercent: -50, scaleX: 0, scaleY: 0.9, opacity: 0 });
    tl.to(maskEl, { opacity: 1, duration: 0.12 }, 0);
    // 飞向终点：边飞边放大（不再顺/逆时针旋转）
    tl.to(maskEl, { left: endX, top: endY, scale: 1.9, duration: 0.8, ease: 'power2.inOut' }, 0.1);
    // 水平翻转（像镜子翻面）：左→右→左，飞完正好回到正面
    tl.to(maskEl, { scaleX: -1, duration: 0.4, ease: 'power1.inOut' }, 0.1);
    tl.to(maskEl, { scaleX: 1, duration: 0.4, ease: 'power1.inOut' }, 0.5);
    tl.to(maskEl, { opacity: 0, scale: 0.5, duration: 0.2, ease: 'power1.in' }, 0.9);
    // 方框像镜子一样横向展开
    tl.fromTo(boxEl, { opacity: 0, scaleX: 0, scaleY: 0.9 }, { opacity: 1, scaleX: 1, scaleY: 1, duration: 0.45, ease: 'back.out(1.6)' }, boxShowAt);
    tl.to(wrap, { opacity: 0, duration: 0.35, ease: 'power1.in' }, fadeAt);
    return true;
  }

  /** 触发提示：依次播放动画（多个化身错开）；GSAP 不可用时退回文字弹窗 */
  function showTrigger(hits) {
    const list = (hits || []).filter(h => h && h.inc);
    if (!list.length) return;
    const first = playTriggerFx(list[0]);
    for (let i = 1; i < list.length; i++) {
      setTimeout(((h) => () => playTriggerFx(h))(list[i]), i * 950);
    }
    if (!first) {
      ensureTrigger();
      triggerBody.innerHTML = list.map(r =>
        '<div class="incarn-trigger__item"><div class="incarn-trigger__head">「' +
        esc(r.cardName) + '」' + esc(r.inc.name) + '</div></div>').join('');
      triggerOverlay.hidden = false;
    }
  }

  /** 把「触发了」这件事同步给对方：对方按同样的动画再播一遍
   *  （只在「本地发起」的调用点调，对方收到后直接播、不会再回发） */
  function broadcastTrigger(hits) {
    const list = (hits || []).filter(h => h && h.inc && h.slot && h.slot.dataset);
    if (!list.length) return;
    if (typeof isConnected !== 'function' || !isConnected() || typeof sendToPeer !== 'function') return;
    const items = list.map(h => ({
      playerId: h.slot.dataset.slotPlayer || '',
      slotIndex: parseInt(h.slot.dataset.slotIndex, 10),
      incName: (h.inc && h.inc.name) || '化身',
      cardName: h.cardName || '',
    })).filter(it => it.playerId !== '' && it.slotIndex >= 0);
    if (items.length) sendToPeer({ type: 'fx-incarn', items });
  }

  /** 收到对方的化身触发（联机）→ 按同样的动画播一遍 */
  function playRemote(items) {
    if (!Array.isArray(items) || !items.length) return;
    const hits = items.map(it => {
      const slot = (typeof getSlotByIndex === 'function') ? getSlotByIndex(it.playerId, it.slotIndex) : null;
      if (!slot) return null;
      return { slot, cardName: it.cardName || cardNameOf(slot), inc: { name: it.incName || '化身' } };
    }).filter(Boolean);
    if (hits.length) showTrigger(hits);
  }

  // ================================================================
  //  回合开始 / 行动
  // ================================================================
  /** 回合开始：先无条件重置自己的「本回合已触发次数」 */
  function beginTurn(playerId) {
    turnBuffer = { playerId, results: [] };
    slotsOf(playerId).forEach(slot => {
      const list = getList(slot);
      if (!list.length) return;
      list.forEach(inc => { inc.triggers = 0; });
      save(slot);
      refresh(slot);
    });
  }
  /** 回合收尾：只输出「仅自己可见」的掷点明细 + 触发提示（概率变化已写进回合开始的消息组）
   *  注意：缓冲区要等「收尾」再清空，否则复活后的那一次结算（异步 500ms）会来不及写进消息组 */
  function flushTurn(playerId, delay) {
    const buf = turnBuffer;
    if (!buf || buf.playerId !== playerId) { turnBuffer = null; return; }
    const d = Math.max(0, parseInt(delay, 10) || 0);
    const done = () => {
      turnBuffer = null;
      // 本地明细已按要求取消；只保留触发提示（并同步给对方播一遍）
      const hits = buf.results.filter(r => r.hit);
      if (hits.length) { broadcastTrigger(hits); showTrigger(hits); }
    };
    if (!d) done(); else setTimeout(done, d);
  }

  /** 机制菜单「🪞 化身行动」：谁点就加谁（作用对象 = 点击者自己） */
  function runAction() {
    if (isSpec()) { toast('观众不可操作', ''); return; }
    const pid = myPid();
    const slots = slotsOf(pid).filter(s => getList(s).length);
    if (!slots.length) {
      toast('你没有化身', '先用「机制 ▸ 化身」给式神添加');
      return;
    }
    const results = [];
    slots.forEach(slot => { judgeList(slot, getList(slot), 'action').forEach(r => results.push(r)); });
    slots.forEach(slot => { save(slot); refresh(slot); });
    report(pid, 'action', results);
  }

  // ================================================================
  //  添加 / 删除
  // ================================================================
  function addToSlot(slot, silent) {
    if (!slot || isSpec()) return false;
    if (!Array.isArray(slot._incarn)) slot._incarn = [];
    slot._incarn.push(defInc());
    save(slot);
    refresh(slot);
    if (!silent) toast('已添加化身', '在面板里设参数；用「机制 ▸ 化身行动」触发');
    return true;
  }
  function removeInc(slot, idx) {
    const list = getList(slot);
    if (idx < 0 || idx >= list.length) return;
    list.splice(idx, 1);
    save(slot);
    refresh(slot);
  }
  function clearSlot(slot) {
    if (!slot) return;
    setList(slot, []);
    refresh(slot);
  }

  // ================================================================
  //  面板
  // ================================================================
  function ensurePanel() {
    if (panelOverlay) return;
    panelOverlay = document.createElement('div');
    panelOverlay.className = 'incarn-overlay';
    panelOverlay.hidden = true;
    panelOverlay.innerHTML = `
      <div class="incarn-dialog">
        <div class="incarn-dialog__header">
          <span class="incarn-dialog__title" id="incarn-title">🪞 化身</span>
          <button type="button" class="incarn-dialog__close" data-act="close" title="关闭">✕</button>
        </div>
        <div class="incarn-dialog__body" id="incarn-body"></div>
        <div class="incarn-dialog__footer">
          <button type="button" class="incarn-btn incarn-btn--add" data-act="add">＋ 添加化身</button>
          <button type="button" class="incarn-btn incarn-btn--danger" data-act="del-all">删除该式神全部化身</button>
          <button type="button" class="incarn-btn" data-act="close">关闭</button>
        </div>
      </div>`;
    document.body.appendChild(panelOverlay);
    panelBody = panelOverlay.querySelector('#incarn-body');
    panelTitleEl = panelOverlay.querySelector('#incarn-title');

    panelOverlay.addEventListener('click', (e) => {
      if (e.target === panelOverlay) { closePanel(); return; }
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      const idx = parseInt(btn.dataset.idx, 10);
      if (act === 'close') { closePanel(); return; }
      if (isSpec()) return;
      if (act === 'add') {
        if (addToSlot(curSlot, true)) { panelOpenIdx = getList(curSlot).length - 1; renderPanel(true); }
      } else if (act === 'del-all') {
        if (getList(curSlot).length && confirm('确定删除该式神的全部化身吗？')) {
          clearSlot(curSlot);
          save(curSlot);
          renderPanel(true);
        }
      } else if (act === 'del-inc') {
        if (confirm('删除这个化身？（设置一起删掉）')) {
          removeInc(curSlot, idx);
          if (panelOpenIdx >= getList(curSlot).length) panelOpenIdx = Math.max(0, getList(curSlot).length - 1);
          renderPanel(true);
        }
      } else if (act === 'step') {
        const field = btn.dataset.field;
        const step = parseInt(btn.dataset.step, 10) || 0;
        const inc = getList(curSlot)[idx];
        if (!inc) return;
        const range = (field === 'prob') ? [0, PROB_MAX] : (field === 'maxTriggers' ? [0, TRIG_MAX] : [0, ADD_MAX]);
        inc[field] = toInt((inc[field] || 0) + step, range[0], range[1], 0);
        save(curSlot);
        refresh(curSlot);
        renderPanel(false);
      } else if (act === 'mode') {
        const inc = getList(curSlot)[idx];
        if (!inc) return;
        const m = btn.dataset.mode;
        if (m === 'paused') {
          // 暂停/恢复：暂停时保留原触发条件，再点一下就能恢复（黄提示已按要求去掉）
          inc.paused = !inc.paused;
        } else {
          inc.mode = m;
          inc.onlyKo = (m === MODE_KO);        // 同步旧字段
          inc.paused = false;                  // 重新选触发条件 = 恢复运行
        }
        save(curSlot);
        refresh(curSlot);
        renderPanel(true);
      } else if (act === 'toggle') {
        if (e.target.closest('input, textarea, select')) return;
        panelOpenIdx = (panelOpenIdx === idx) ? -1 : idx;
        renderPanel(true);
      } else if (act === 'reset-trig') {
        const inc = getList(curSlot)[idx];
        if (!inc) return;
        const beforeTrig = inc.triggers;
        inc.triggers = 0;
        save(curSlot);
        refresh(curSlot);          // 重置后要刷新徽章：否则「已达上限」的锁不会消失
        renderPanel(false);
        // 重置次数是状态变更 → 发系统消息（双方可见）
        if (typeof broadcastSystemMsg === 'function') {
          broadcastSystemMsg(`【系统】${pname(myPid())}重置了「${cardNameOf(curSlot)}」${inc.name} 的本回合触发次数（${beforeTrig} → 0）`);
        }
      } else if (act === 'act-one') {
        const inc = getList(curSlot)[idx];
        if (!inc) return;
        if (inc.paused) {
          if (typeof broadcastSystemMsg === 'function') {
            broadcastSystemMsg(`【系统】「${cardNameOf(curSlot)}」${inc.name} 已暂停，不加入行动概率、不判定`);
          }
          return;
        }
        const res = judgeList(curSlot, [inc], 'action');
        save(curSlot);
        refresh(curSlot);
        renderPanel(false);
        report(myPid(), 'action', res);
      } else if (act === 'judge') {
        const inc = getList(curSlot)[idx];
        if (!inc) return;
        directJudge(curSlot, inc);
        save(curSlot);
        refresh(curSlot);
        renderPanel(false);
      } else if (act === 'help') {
        // 「化身怎么用」折叠由 details 原生处理，无需 JS
      }
    });

    // 字段改动（即时生效）
    panelOverlay.addEventListener('input', (e) => {
      if (isSpec()) return;
      const el = e.target;
      if (!el.dataset || !el.dataset.field) return;
      const idx = parseInt(el.dataset.idx, 10);
      const inc = getList(curSlot)[idx];
      if (!inc) return;
      const f = el.dataset.field;
      if (f === 'name') {
        inc.name = (el.value || '').slice(0, 12) || '化身';
      } else if (f === 'note') {
        inc.note = (el.value || '').slice(0, 200);
      } else {
        const range = (f === 'prob') ? [0, PROB_MAX] : (f === 'maxTriggers' ? [0, TRIG_MAX] : [0, ADD_MAX]);
        inc[f] = toInt(el.value, range[0], range[1], inc[f]);
      }
      save(curSlot);
      refresh(curSlot);
      // 实时更新卡片上显示的概率（不重绘，避免输入框失焦）
      const card = el.closest('.incarn-card');
      if (card) {
        const badge = card.querySelector('.incarn-card__prob');
        if (badge) badge.textContent = inc.prob + '%';
      }
    });
    panelOverlay.addEventListener('change', (e) => {
      if (isSpec()) return;
      const el = e.target;
      if (!el.dataset || !el.dataset.field) return;
      const idx = parseInt(el.dataset.idx, 10);
      const inc = getList(curSlot)[idx];
      if (!inc) return;
      const f = el.dataset.field;
      if (f === 'name' || f === 'note') return;
      const range = (f === 'prob') ? [0, PROB_MAX] : (f === 'maxTriggers' ? [0, TRIG_MAX] : [0, ADD_MAX]);
      inc[f] = toInt(el.value, range[0], range[1], inc[f]);
      el.value = inc[f];                              // 小数/越界即时回显
      save(curSlot);
      refresh(curSlot);
    });
  }

  function rangeRow(label, field, inc, idx, min, max, extraHtml) {
    const ro = isSpec() ? ' disabled' : '';
    return `
      <div class="incarn-field${extraHtml ? ' incarn-field--extra' : ''}">
        <span class="incarn-field__label">${label}</span>
        <div class="incarn-num">
          <button type="button" class="incarn-num__btn" data-act="step" data-idx="${idx}" data-field="${field}" data-step="-1"${ro}>−</button>
          <input type="number" step="1" min="${min}" max="${max}" value="${inc[field]}" data-field="${field}" data-idx="${idx}"${ro}>
          <button type="button" class="incarn-num__btn" data-act="step" data-idx="${idx}" data-field="${field}" data-step="1"${ro}>＋</button>
        </div>
        ${extraHtml || ''}
      </div>`;
  }

  function renderPanel(rebuildList) {
    if (!curSlot) return;
    const list = getList(curSlot);
    panelTitleEl.textContent = '🪞 化身 — 「' + cardNameOf(curSlot) + '」（' + list.length + '）';

    if (rebuildList === undefined) rebuildList = true;
    if (!rebuildList) {
      // 只更新「本回合已触发」、概率显示与输入框数值（不重绘，避免输入框失焦）
      panelBody.querySelectorAll('.incarn-card').forEach((card, i) => {
        const inc = list[i];
        if (!inc) return;
        const trig = card.querySelector('.incarn-card__trig b');
        if (trig) trig.textContent = inc.triggers + ' / ' + inc.maxTriggers;
        const prob = card.querySelector('.incarn-card__prob');
        if (prob) prob.textContent = inc.prob + '%';
        card.querySelectorAll('input[data-field]').forEach(inp => {
          const f = inp.dataset.field;
          if (document.activeElement === inp) return;   // 正在输入的不动
          if (inc[f] != null) inp.value = inc[f];
        });
      });
      return;
    }

    const ro = isSpec();
    let html = '';

    if (!list.length) {
      html += '<div class="incarn-empty">这个式神还没有化身，点下面「＋ 添加化身」加一个。</div>';
    } else {
      html += list.map((inc, idx) => {
        const open = (idx === panelOpenIdx);
        return `
        <div class="incarn-card${open ? '' : ' is-collapsed'}" data-idx="${idx}">
          <div class="incarn-card__head" data-act="toggle" data-idx="${idx}">
            <span class="incarn-card__arrow">${open ? '▼' : '▶'}</span>
            <span class="incarn-card__no">${markOf(idx)}</span>
            <input type="text" class="incarn-card__name" maxlength="12" value="${esc(inc.name)}" data-field="name" data-idx="${idx}"${ro ? ' disabled' : ''}>
            <span class="incarn-card__prob">${inc.prob}%</span>
            <button type="button" class="incarn-btn incarn-btn--danger incarn-btn--mini" data-act="del-inc" data-idx="${idx}"${ro ? ' disabled' : ''}>删除</button>
          </div>
          <div class="incarn-card__body">
            <div class="incarn-mode${inc.paused ? ' is-paused' : ''}">
              ${['alive', 'ko', 'any'].map(m => `
                <button type="button" class="incarn-mode__btn${(inc.mode || 'alive') === m ? ' is-active' : ''}" data-act="mode" data-idx="${idx}" data-mode="${m}"${ro ? ' disabled' : ''}>${modeLabel(m)}</button>`).join('')}
              <button type="button" class="incarn-mode__btn incarn-mode__btn--pause${inc.paused ? ' is-active' : ''}" data-act="mode" data-idx="${idx}" data-mode="paused"${ro ? ' disabled' : ''}>🔒 暂停</button>
            </div>
            <div class="incarn-card__grid">
              ${rangeRow('当前概率', 'prob', inc, idx, 0, PROB_MAX)}
              ${rangeRow('回合开始增加', 'turnAdd', inc, idx, 0, ADD_MAX)}
              ${rangeRow('行动增加', 'actAdd', inc, idx, 0, ADD_MAX)}
              ${rangeRow('每回合触发上限', 'maxTriggers', inc, idx, 0, TRIG_MAX,
                '<div class="incarn-field__extra">' +
                  '<span class="incarn-card__trig">本回合已触发 <b>' + inc.triggers + ' / ' + inc.maxTriggers + '</b></span>' +
                  '<button type="button" class="incarn-btn incarn-btn--ghost incarn-btn--mini" data-act="reset-trig" data-idx="' + idx + '"' + (ro ? ' disabled' : '') + '>重置本回合次数</button>' +
                '</div>')}
            </div>
            <div class="incarn-card__actions">
              <button type="button" class="incarn-btn incarn-btn--ghost" data-act="act-one" data-idx="${idx}"${ro ? ' disabled' : ''}>+行动概率并判定（仅此化身）</button>
              <button type="button" class="incarn-btn incarn-btn--ghost" data-act="judge" data-idx="${idx}"${ro ? ' disabled' : ''}>直接判定</button>
            </div>
          </div>
        </div>`;
      }).join('');
    }
    panelBody.innerHTML = html;
  }

  function openPanel(slot) {
    if (!slot) return;
    if (isSpec()) { toast('观众不可操作', ''); return; }   // 观众不能打开化身管理
    ensurePanel();
    curSlot = slot;
    panelOpenIdx = 0;                  // 默认展开第一个化身
    renderPanel(true);
    panelOverlay.hidden = false;
  }
  function closePanel() {
    if (panelOverlay) panelOverlay.hidden = true;
    curSlot = null;
  }

  // ================================================================
  //  初始化
  // ================================================================
  function init() {
    watchAll();
    // 持续监听：卡槽里的徽章/标签增删会影响手机端信息栏高度
    if (typeof MutationObserver === 'function') {
      const zoneMo = new MutationObserver(() => {
        document.querySelectorAll('.card-slot').forEach(s => {
          if (s.dataset.incarnWatched !== '1') watchSlot(s);
          else syncInfoHeight(s);
        });
      });
      document.querySelectorAll('.player-zone').forEach(z => {
        zoneMo.observe(z, { childList: true, subtree: true });
      });
    }
    if (MOBILE_MQ.addEventListener) {
      MOBILE_MQ.addEventListener('change', () => {
        document.querySelectorAll('.card-slot').forEach(s => { syncInfoHeight(s); refresh(s); });
      });
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          if (panelOverlay && !panelOverlay.hidden) closePanel();
          if (triggerOverlay && !triggerOverlay.hidden) triggerOverlay.hidden = true;
        }
      });
    }
  }

  // ================================================================
  //  对外 API
  // ================================================================
  const api = {
    init,
    refresh,
    watchSlot,
    getList,
    setList,
    normInc,
    clone,
    toInt,
    addToSlot,
    removeInc,
    clearSlot,
    openPanel,
    closePanel,
    runAction,
    beginTurn,
    settleSlot,
    flushTurn,
    syncInfoHeight,
    playRemote,
    pickInc,
    canGrow,
    isKo,
    isStunned,
    modeLabel,
    markOf,
    MODE_ALIVE,
    MODE_KO,
    MODE_ANY,
    _defInc: defInc,
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return api;
})();
