// ================================================================
//  js/bond.js — 协战牌（bond）机制
//  · 识别协战牌 / 分化牌
//  · 「分化选择窗」：关闭 = 不使用（牌子留在原位，无播报、不进撤销）
//  · 统一使用入口 Bond.tryUse()（供 手牌/坟场/检索/连引/蓄力 5 条路径调用）
//  · 「协战*」前缀工具（仅牌面列表显示；系统消息不带前缀）
//  依赖: CardDB, getPlayerName, broadcastSystemMsg, startMessageGroup, escapeHTML, Undo
// ================================================================
const Bond = (() => {
  const PREFIX = '协战*';
  const TYPE_CN = { battle: '战斗', spell: '法术', form: '形态', realm: '幻境', bond: '协战' };

  let dlg = null;   // 弹窗骨架（只创建一次，复用）
  let cur = null;   // 当前上下文 { playerId, card, versions, onPick, onCancel }

  function esc(s) {
    if (typeof escapeHTML === 'function') return escapeHTML(String(s == null ? '' : s));
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ── 名称与识别 ──
  function stripPrefix(name) { return String(name == null ? '' : name).replace(/^协战\*/, ''); }

  function dbOf(nameOrCard) {
    const raw = (typeof nameOrCard === 'string') ? nameOrCard : ((nameOrCard && nameOrCard.name) || '');
    const name = stripPrefix(raw).trim();
    if (!name) return null;
    return (typeof CardDB !== 'undefined' && CardDB.lookup) ? CardDB.lookup(name) : null;
  }

  function isBondCard(card) { const db = dbOf(card); return !!(db && db.type === 'bond'); }
  function isSplitCard(nameOrCard) { const db = dbOf(nameOrCard); return !!(db && db.bondOf); }

  /** 牌面列表显示名：分化牌加「协战*」前缀（消息里不要用这个） */
  function displayName(nameOrCard) {
    const raw = (typeof nameOrCard === 'string') ? nameOrCard : ((nameOrCard && nameOrCard.name) || '');
    const db = dbOf(raw);
    if (db && db.bondOf && raw.indexOf(PREFIX) !== 0) return PREFIX + stripPrefix(raw);
    return raw;
  }

  function versionsOf(card) {
    const db = dbOf(card);
    if (!db || db.type !== 'bond') return [];
    return (Array.isArray(db.bondVersions) ? db.bondVersions : []).filter(function (v) { return v && v.name; });
  }

  /** 归属文案：协战牌 = A×B；普通牌 = owner */
  function ownerLabel(db) {
    if (!db) return '';
    if (db.type === 'bond') {
      const arr = Array.isArray(db.bondOwners) ? db.bondOwners.filter(Boolean) : [];
      if (arr.length) return arr.join('×');
    }
    return db.owner || '';
  }

  // ── 弹窗（只创建一次，避免重复绑定事件） ──
  function ensureDialog() {
    if (dlg) return dlg;
    const ov = document.createElement('div');
    ov.className = 'bond-overlay';
    ov.hidden = true;
    ov.innerHTML =
      '<div class="bond-dialog" role="dialog" aria-label="协战牌分化选择">' +
        '<div class="bond-dialog__head">' +
          '<span class="bond-dialog__title" id="bond-title">协战牌</span>' +
          '<button type="button" class="bond-dialog__close" id="bond-close" title="关闭（不使用）">✕</button>' +
        '</div>' +
        '<div class="bond-dialog__effect" id="bond-effect"></div>' +
        '<div class="bond-options" id="bond-options"></div>' +
        '<div class="bond-dialog__tip">直接关闭此弹窗时视为不使用。</div>' +
      '</div>';
    document.body.appendChild(ov);
    // 仅右上角「✕」能关闭（点空白处不关，避免误关丢失选择）
    ov.querySelector('#bond-close').addEventListener('click', function () { closeDialog(true); });
    // 手机端：拦截弹窗外滑动，防止滚动穿透
    ov.addEventListener('touchmove', function (e) {
      if (e.target.closest && e.target.closest('.bond-dialog')) return;
      e.preventDefault();
    }, { passive: false });
    dlg = {
      overlay: ov,
      title: ov.querySelector('#bond-title'),
      effect: ov.querySelector('#bond-effect'),
      options: ov.querySelector('#bond-options'),
    };
    return dlg;
  }

  function openDialog(playerId, card, versions, onPick, onCancel) {
    const d = ensureDialog();
    cur = { playerId: playerId, card: card, versions: versions, onPick: onPick, onCancel: onCancel };
    const db = dbOf(card);
    const ownLabel = ownerLabel(db);
    d.title.textContent = '协战牌「' + stripPrefix(card.name) + '」' + (ownLabel ? '  ' + ownLabel : '');
    d.effect.textContent = (db && db.effect) ? db.effect : '';
    d.options.innerHTML = versions.map(function (v, i) {
      const vdb = dbOf(v.name);
      // 标签顺序：所属式神 · 类型 · 等级 · 稀有度（没有的项不显示）
      const parts = [];
      if (v.owner) parts.push(v.owner);
      if (vdb) {
        parts.push(TYPE_CN[vdb.type] || '法术');
        if (vdb.level) parts.push(vdb.level + '级');
        if (vdb.rarity) parts.push(vdb.rarity);
      } else {
        // 卡库里没有这张分化牌：仍可使用，只标注未录入
        parts.push('未录入');
      }
      const meta = parts.join(' · ');
      return '<div class="bond-opt">' +
        '<div class="bond-opt__info">' +
          '<div class="bond-opt__name card-list-item__name">' + esc(v.name) + '</div>' +
          '<div class="bond-opt__meta">' + esc(meta) + '</div>' +
        '</div>' +
        '<button type="button" class="bond-opt__use" data-bond-idx="' + i + '">使用</button>' +
      '</div>';
    }).join('');
    d.options.querySelectorAll('.bond-opt__use').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const ctx = cur;
        if (!ctx) return;
        const idx = parseInt(btn.dataset.bondIdx, 10);
        const ver = ctx.versions[idx];
        if (!ver) return;
        closeDialog(false);
        if (ctx.onPick) ctx.onPick(ver);
      });
    });
    d.overlay.hidden = false;
    d.overlay.style.display = 'flex';
  }

  function closeDialog(isCancel) {
    if (!dlg) return;
    dlg.overlay.hidden = true;
    dlg.overlay.style.display = 'none';
    const ctx = cur;
    cur = null;
    if (isCancel && ctx && ctx.onCancel) ctx.onCancel();
  }

  // ── 统一播报（一条，走消息分组以便撤销记录） ──
  // 注意：本函数只「起头」消息组，由用完牌后的 endMessageGroup 收尾（见 tryUse）
  function announce(playerId, fromName, verName) {
    const who = (typeof getPlayerName === 'function') ? getPlayerName(playerId) : ('玩家' + playerId);
    const msg = '【系统】' + who + '使用了协战牌「' + fromName + '」——「' + verName + '」';
    if (typeof startMessageGroup === 'function') { startMessageGroup(msg, null); return; }
    if (typeof broadcastSystemMsg === 'function') broadcastSystemMsg(msg);
    else if (typeof addSystemChatMessage === 'function') addSystemChatMessage(msg);
    if (window.Undo && Undo.noteMessage) Undo.noteMessage('使用了协战牌');
  }

  /**
   * 统一使用入口：是协战牌 → 弹分化窗并接管（返回 true）；普通牌 → 返回 false。
   * commit(card) = 调用方真正的"使用牌"动作；取消时不会执行，也没有任何副作用。
   */
  function tryUse(playerId, card, commit) {
    if (!isBondCard(card)) return false;
    const versions = versionsOf(card);
    if (!versions.length) {
      if (typeof broadcastSystemMsg === 'function') {
        broadcastSystemMsg('【系统】该协战牌未配置分化牌，已按普通牌使用');
      }
      commit(card);
      return true;
    }
    openDialog(playerId, card, versions, function (ver) {
      const fromName = stripPrefix(card.name);
      card.name = ver.name;                 // 换皮为分化牌
      card._bondFrom = fromName;            // 来源（辅助，显示以数据库 bondOf 为准）
      card._bondOwner = ver.owner || '';    // 由哪个式神的版本使用
      announce(playerId, fromName, ver.name);   // 先起头消息组，再真正用牌（组内的子消息会挂在它下面）
      window._bondUseInProgress = true;     // 抑制各条路径的默认播报，避免两条消息
      try {
        commit(card);
      } finally {
        window._bondUseInProgress = false;
        // 收尾：手牌路径的 endMessageGroup 已收过（此处自动空跑），其余路径由这里保证消息能渲染出来
        if (typeof endMessageGroup === 'function') endMessageGroup();
      }
    }, function () { /* 取消：什么都不做 */ });
    return true;
  }

  return {
    PREFIX: PREFIX,
    stripPrefix: stripPrefix,
    displayName: displayName,
    isBondCard: isBondCard,
    isSplitCard: isSplitCard,
    versionsOf: versionsOf,
    ownerLabel: ownerLabel,
    tryUse: tryUse,
    openDialog: openDialog,
    closeDialog: closeDialog,
    _debug: { dbOf: dbOf, TYPE_CN: TYPE_CN },
  };
})();
window.Bond = Bond;
