// ================================================================
//  js/bless-seal.js — 加护 / 蚀印（针对手牌的随机增益 / 减益标记）
//  入口：机制菜单「🛡️ 加护 / 🗡️ 蚀印」
//  依赖：CardDB、card-deck.js（playerCards / refreshOpenListDialog / updateDeckButtons）、
//        game-core.js（syncDeckStateForce）、chat.js（broadcastSystemMsg / addSystemChatMessage）
//  设计稿：.scratch/加护与蚀印/PRD.md
// ================================================================

const BlessSeal = (() => {
  'use strict';

  // ---- 常量 ----
  const ICON = { bless: '🛡️', seal: '🗡️' };
  const LABEL = { bless: '加护', seal: '蚀印' };
  const CAT_LABEL = { common: '通用', spell: '法术', battle: '战斗', form: '形态', realm: '幻境', other: '其它' };
  const CAT_OPTIONS = ['common', 'spell', 'battle', 'form', 'realm'];
  const TYPE_OPTIONS = ['spell', 'battle', 'form', 'realm'];   // 未录入牌只能选这四类
  const KEYWORDS = ['贯通', '先攻', '迅捷', '追猎', '不屈', '帷幕', '屏障', '昂扬'];
  const MAX_LAYERS = 999;

  // ---- 官方效果池 ----
  const OFFICIAL = {
    bless: [
      { id: 'bles-common-01', cat: 'common', text: '此牌得瞬发。', grantsInstant: true },
      { id: 'bles-common-02', cat: 'common', text: '使用此牌后为你恢复3点生命。' },
      { id: 'bles-common-03', cat: 'common', text: '使用此牌后对敌方牌手造成3点伤害。' },
      { id: 'bles-common-04', cat: 'common', text: '抵消此牌的蚀印效果。', cancel: true },
      { id: 'bles-spell-01', cat: 'spell', text: '此牌伤害+1。' },
      { id: 'bles-spell-02', cat: 'spell', text: '使用此牌后鼓舞：+2力量和+1护甲。' },
      { id: 'bles-spell-03', cat: 'spell', text: '使用此牌后抽一张牌。' },
      { id: 'bles-battle-01', cat: 'battle', text: '此牌+1力量和+1护甲。' },
      { id: 'bles-form-01', cat: 'form', text: '此牌+1力量和+1生命。' },
      { id: 'bles-form-02', cat: 'form', text: '此牌+2力量。' },
      { id: 'bles-form-03', cat: 'form', text: '此牌+2生命。' },
      { id: 'bles-form-04', cat: 'form', text: '此牌获得贯通和+1力量。', grants: '贯通' },
      { id: 'bles-form-05', cat: 'form', text: '此牌获得迅捷。', grants: '迅捷' },
      { id: 'bles-form-06', cat: 'form', text: '此牌获得追猎和+1力量。', grants: '追猎' },
      { id: 'bles-form-07', cat: 'form', text: '此牌获得不屈。', grants: '不屈' },
      { id: 'bles-form-08', cat: 'form', text: '此牌获得屏障。', grants: '屏障' },
      { id: 'bles-form-09', cat: 'form', text: '此牌获得昂扬和+1生命。', grants: '昂扬' },
      { id: 'bles-realm-01', cat: 'realm', text: '此牌进场时，获得4耐久度。' },
    ],
    seal: [
      { id: 'seal-common-01', cat: 'common', text: '使用此牌后对你造成3点伤害。' },
      { id: 'seal-common-02', cat: 'common', text: '使用此牌后恢复敌方牌手3点生命。' },
      { id: 'seal-common-03', cat: 'common', text: '使用此牌后对对应式神造成3点伤害。' },
      { id: 'seal-common-04', cat: 'common', text: '此牌的瞬发能力失效。', requiresInstant: true },
      { id: 'seal-common-05', cat: 'common', text: '抵消此牌的加护效果。', cancel: true },
      { id: 'seal-spell-01', cat: 'spell', text: '此牌伤害-2。（最低为0）' },
      { id: 'seal-spell-02', cat: 'spell', text: '使用此牌后压制己方玩家：-2力量和-1护甲。' },
      { id: 'seal-battle-01', cat: 'battle', text: '此牌-2力量和-1护甲。' },
      { id: 'seal-battle-02', cat: 'battle', text: '此牌-1力量和-2护甲。' },
      { id: 'seal-form-01', cat: 'form', text: '此牌-1力量和-2生命。' },
      { id: 'seal-form-02', cat: 'form', text: '此牌-3生命。' },
      { id: 'seal-form-03', cat: 'form', text: '此牌-2力量和-1生命。' },
      { id: 'seal-form-04', cat: 'form', text: '此牌失去贯通并-1力量。', requires: '贯通' },
      { id: 'seal-form-05', cat: 'form', text: '此牌失去先攻并-1力量。', requires: '先攻' },
      { id: 'seal-form-06', cat: 'form', text: '此牌失去迅捷并-1力量。', requires: '迅捷' },
      { id: 'seal-form-07', cat: 'form', text: '此牌失去追猎并-1力量。', requires: '追猎' },
      { id: 'seal-form-08', cat: 'form', text: '此牌失去不屈并-1生命。', requires: '不屈' },
      { id: 'seal-form-09', cat: 'form', text: '此牌失去帷幕并-1生命。', requires: '帷幕' },
      { id: 'seal-form-10', cat: 'form', text: '此牌失去屏障并-1生命。', requires: '屏障' },
      { id: 'seal-form-11', cat: 'form', text: '此牌失去昂扬并-1生命。', requires: '昂扬' },
      { id: 'seal-realm-01', cat: 'realm', text: '此牌进场后，耐久度减半。' },
    ],
  };

  const DEFAULT_ADV = {
    candCount: 2, pickCount: 1, repeat: 1, perCard: 1,
    dedupe: 'same',   // same=不可重复（默认） | none=可重复
    scope: 'byCat',   // byCat | common | all
    stack: false,
    coexist: false,
  };

  // ---- 运行时状态 ----
  let pools = null;          // { bless:[...], seal:[...] }（本局工作副本）
  let adv = null;            // 高级设置
  let cfgKeyCache = null;    // 当前生效的 localStorage key
  let dom = null;

  const state = {
    target: 'self',          // self | opp
    kind: null,              // bless | seal | null
    cands: [],               // [{ playerId, cardId, card, name, cat, keywords, needsSetup, effects }]
    sel: new Set(),          // 选中的 cardId
    round: 0,                // 已完成轮次
    reason: '',              // 无候选原因：empty | allMarked | ''
    usedIds: new Set(),      // 「全部候选」去重时用
  };

  // ================================================================
  //  基础工具
  // ================================================================

  function esc(s) {
    if (typeof escapeHTML === 'function') return escapeHTML(String(s == null ? '' : s));
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  function randomPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function mySeatId() {
    if (typeof isSoloMode !== 'undefined' && isSoloMode) return (typeof localPlayerId !== 'undefined' && (localPlayerId === '1' || localPlayerId === '2')) ? localPlayerId : '1';
    if (typeof localPlayerId !== 'undefined' && (localPlayerId === '1' || localPlayerId === '2')) return localPlayerId;
    return '1';
  }

  function targetPlayerId() {
    const mine = mySeatId();
    if (state.target === 'opp') return mine === '1' ? '2' : '1';
    return mine;
  }

  function seatName(pid) {
    if (typeof getPlayerName === 'function') {
      const n = getPlayerName(pid);
      if (n) return n;
    }
    return '玩家' + pid;
  }

  function handOf(pid) {
    const st = (typeof getPlayerCardState === 'function') ? getPlayerCardState(pid) : null;
    return (st && Array.isArray(st.hand)) ? st.hand.filter(function (c) { return c && typeof c === 'object'; }) : [];
  }

  function findCard(pid, cardId) {
    return handOf(pid).find(function (c) { return c.id === cardId; }) || null;
  }

  // ================================================================
  //  标记读写（卡牌数据层）
  // ================================================================

  function marksOf(card) {
    return (card && Array.isArray(card.marks)) ? card.marks : [];
  }

  function hasKind(card, kind) {
    return marksOf(card).some(function (m) { return m && m.kind === kind; });
  }

  function hasOpposite(card, kind) {
    const opp = kind === 'bless' ? 'seal' : 'bless';
    return marksOf(card).some(function (m) { return m && m.kind === opp; });
  }

  function hasSeal(card) { return hasKind(card, 'seal'); }

  function ensureMarks(card) {
    if (!card) return [];
    if (!Array.isArray(card.marks)) card.marks = [];
    return card.marks;
  }

  /** 清空某张牌的全部标记（离手时调用） */
  function clearMarks(card) {
    if (card && Array.isArray(card.marks) && card.marks.length) {
      card.marks = [];
      return true;
    }
    return false;
  }

  /**
   * 把标记按「效果」合并：同一条效果重复出现才叠成 ×N，不同效果分开列
   * @returns {Array<{kind,id,text,count}>}
   */
  function markGroups(card) {
    const out = [];
    const map = {};
    marksOf(card).forEach(function (m) {
      if (!m) return;
      const key = (m.kind || '') + '|' + (m.id || '') + '|' + (m.text || '');
      let g = map[key];
      if (!g) {
        g = { kind: m.kind, id: m.id || '', text: m.text || '', count: 0 };
        map[key] = g;
        out.push(g);
      }
      g.count += 1;
    });
    return out;
  }

  /** 使用牌时的系统消息后缀：「（🛡️加护：X、Y×2；🗡️蚀印：Z）」 */
  function markSuffix(card) {
    const groups = markGroups(card);
    if (!groups.length) return '';
    const parts = [];
    ['bless', 'seal'].forEach(function (kind) {
      const list = groups.filter(function (g) { return g.kind === kind; });
      if (!list.length) return;
      const texts = list.map(function (g) { return g.text + (g.count > 1 ? '×' + g.count : ''); }).filter(Boolean);
      if (texts.length) parts.push(ICON[kind] + LABEL[kind] + '：' + texts.join('、'));
    });
    return parts.length ? '（' + parts.join('；') + '）' : '';
  }

  /** 手牌列表上的短标签：一条效果一个标签，同效果叠成 ×N */
  function markTags(card) {
    return markGroups(card).map(function (g) {
      const label = LABEL[g.kind] || g.kind;
      return {
        kind: g.kind,
        icon: ICON[g.kind] || '',
        label: label,
        count: g.count,
        brief: g.text,
        full: (ICON[g.kind] || '') + label + '：' + g.text + (g.count > 1 ? ' ×' + g.count : ''),
      };
    });
  }

  // ================================================================
  //  卡牌类型 / 关键词判定
  // ================================================================

  function lookupCard(card, ownerId) {
    if (!card || !card.name) return null;
    if (typeof CardDB === 'undefined') return null;
    const name = String(card.name).replace(/^协战\*/, '');
    try {
      if (CardDB.lookupExact) return CardDB.lookupExact(name, ownerId);
      if (CardDB.lookup) return CardDB.lookup(name, ownerId);
    } catch (e) { /* ignore */ }
    return null;
  }

  const TYPE_TO_CAT = { spell: 'spell', battle: 'battle', form: 'form', realm: 'realm' };

  function catOf(db) {
    if (!db) return null;                       // null = 未录入
    const c = TYPE_TO_CAT[db.type];
    return c || 'other';                        // other = 只吃通用池
  }

  /** 关键词集合：keywords 非空以其为准，为空才从文本识别（排除否定语境） */
  function keywordsOf(db) {
    if (!db) return [];
    const kw = db.keywords;
    if (Array.isArray(kw) && kw.length) return kw.filter(function (k) { return KEYWORDS.indexOf(k) !== -1; });
    if (typeof kw === 'string' && kw.trim()) {
      return kw.split(/[,，、\s]+/).filter(function (k) { return KEYWORDS.indexOf(k) !== -1; });
    }
    const text = String(db.effect || '') + ' ' + String(db.ability || '');
    if (!text.trim()) return [];
    const out = [];
    KEYWORDS.forEach(function (k) {
      let idx = -1, negated = false;
      while ((idx = text.indexOf(k, idx + 1)) !== -1) {
        const before = text.slice(Math.max(0, idx - 4), idx);
        if (/(失去|不能|无法|不会|不能获得|不具备|没有)/.test(before)) { negated = true; continue; }
        negated = false;
        break;
      }
      if (!negated) out.push(k);
    });
    return out;
  }

  /** 是否拥有瞬发（已录入牌才判定得出来；未录入返回 null） */
  function instantOf(db) {
    if (!db) return null;
    const kw = db.keywords;
    if (Array.isArray(kw) && kw.length) return kw.indexOf('瞬发') !== -1;
    if (typeof kw === 'string' && kw.trim()) return kw.indexOf('瞬发') !== -1;
    const text = String(db.effect || '') + ' ' + String(db.ability || '');
    if (!text.trim()) return false;
    const i = text.indexOf('瞬发');
    if (i === -1) return false;
    const before = text.slice(Math.max(0, i - 4), i);
    return !/(失去|不能|无法|不会|不具备|没有|失效)/.test(before);
  }

  // ================================================================
  //  效果池
  // ================================================================

  function officialPool(kind) { return clone(OFFICIAL[kind] || []); }

  function defaultPools() { return { bless: officialPool('bless'), seal: officialPool('seal') }; }

  /**
   * 取可用条目
   * @param {string} kind bless|seal
   * @param {string|null} cat common|spell|battle|form|realm|other|null(未录入)
   * @param {string[]} keywords 目标牌拥有的关键词
   * @param {object} opts 高级设置（默认用当前 adv）
   * @param {boolean|null} instant 是否拥有瞬发（null=未知，如未录入牌）
   */
  function poolFor(kind, cat, keywords, opts, instant) {
    if (!pools) loadCfg();                 // 面板没开过也能直接被调用
    const o = opts || adv || DEFAULT_ADV;
    const list = (pools && pools[kind]) || [];
    const kw = new Set(keywords || []);
    const hasInstant = (instant === undefined) ? null : instant;
    return list.filter(function (e) {
      if (!e || e.cancel) return false;            // 抵消条目不进随机池
      if (!cat) {
        // 牌型未知：永远只吃通用池（不受「全部类型」影响，见 PRD 第三节）
        if (e.cat !== 'common') return false;
      } else if (o.scope === 'all') {
        // 全部类型：不按牌型过滤
      } else if (o.scope === 'common') {
        // 仅通用池
        if (e.cat !== 'common') return false;
      } else {
        if (e.cat !== 'common' && e.cat !== cat) return false;
      }
      if (e.requires && !kw.has(e.requires)) return false;
      if (e.grants && kw.has(e.grants)) return false;
      // 瞬发：已录入牌能判→没瞬发就不进池；判不出来的未录入牌先给，玩家可点「重抽」去掉
      if (e.requiresInstant && hasInstant === false) return false;
      if (e.grantsInstant && hasInstant === true) return false;
      return true;
    });
  }

  /** 抽 N 条效果（同一张牌内 可重复/不可重复；excludeIds 用于重抽时排除） */
  function rollEffectsFor(pool, o, usedGlobal, excludeIds) {
    const picked = [];
    const usedLocal = new Set();
    const skip = new Set(excludeIds || []);
    const per = Math.max(1, Math.min(9, parseInt(o.perCard, 10) || 1));
    for (let i = 0; i < per; i++) {
      let cands = pool.filter(function (e) { return !skip.has(e.id); });
      if (o.dedupe !== 'none') cands = cands.filter(function (e) { return !usedLocal.has(e.id); });
      if (o.dedupe === 'all') cands = cands.filter(function (e) { return !usedGlobal.has(e.id); });
      if (!cands.length) break;
      const e = randomPick(cands);
      picked.push(e);
      usedLocal.add(e.id);
      if (o.dedupe === 'all') usedGlobal.add(e.id);
    }
    return picked;
  }

  // ================================================================
  //  候选生成
  // ================================================================

  /**
   * 抽候选牌（纯函数，不改任何数据）
   * @returns {{cands:Array, reason:string}}
   */
  function rollCandidates(playerId, kind, opts) {
    const o = opts || adv || DEFAULT_ADV;
    const hand = handOf(playerId);
    const coexist = !!o.coexist;
    const stack = !!o.stack;

    const legal = hand.filter(function (card) {
      const same = hasKind(card, kind);
      // 默认：同类已标记 → 不进候选；开了「叠加」或「共存」就允许再选
      if (same && !stack && !coexist) return false;
      if (hasOpposite(card, kind) && !coexist) return true;  // 对立标记 → 进候选（用于抵消）
      return true;
    });

    if (!hand.length) return { cands: [], reason: 'empty' };
    if (!legal.length) return { cands: [], reason: 'allMarked' };

    const n = Math.max(1, Math.min(6, parseInt(o.candCount, 10) || 2));
    const shuffled = legal.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = t;
    }
    const picked = shuffled.slice(0, Math.min(n, shuffled.length));

    const usedIds = new Set();
    const cands = picked.map(function (card) {
      const db = lookupCard(card, playerId);
      const cat = catOf(db);
      const keywords = keywordsOf(db);
      const c = {
        playerId: playerId,
        cardId: card.id,
        name: card.name || '(未命名)',
        owner: (db && db.owner) || '',
        cat: cat,
        keywords: keywords,
        needsSetup: cat === null,
        unknown: cat === null,       // 未录入牌：允许现场选型改选
        effects: [],
        excludeIds: [],              // 「无瞬发，重抽」时排掉的条目
        cancel: false,
      };
      if (cat === null) return c;      // 未录入：等玩家选型

      // 对立标记 + 不共存 → 抵消（不发随机效果）
      if (hasOpposite(card, kind) && !coexist) {
        c.cancel = true;
        c.effects = [{
          id: kind === 'bless' ? 'bles-common-04' : 'seal-common-05',
          cat: 'common',
          cancel: true,
          text: '抵消此牌的' + LABEL[kind === 'bless' ? 'seal' : 'bless'] + '效果',
        }];
        return c;
      }

      const pool = poolFor(kind, cat, keywords, o, instantOf(db));
      c.effects = rollEffectsFor(pool, o, usedIds, c.excludeIds);
      return c;
    });

    return { cands: cands, reason: '' };
  }

  /** 未录入牌：选完牌型 / 关键词后抽效果（返回新的 candidate） */
  function rollEffects(candidate, cat, keywords, opts) {
    const o = opts || adv || DEFAULT_ADV;
    const next = Object.assign({}, candidate);
    next.cat = cat;
    next.keywords = keywords || [];
    next.needsSetup = false;
    next.cancel = false;
    next.excludeIds = (candidate.excludeIds || []).slice();
    if (hasOppositePending(next) && !o.coexist) {
      next.cancel = true;
      next.effects = [{
        id: state.kind === 'bless' ? 'bles-common-04' : 'seal-common-05',
        cat: 'common',
        cancel: true,
        text: '抵消此牌的' + LABEL[state.kind === 'bless' ? 'seal' : 'bless'] + '效果',
      }];
      return next;
    }
    // 未录入牌判不出有没有瞬发 → 传 null（先给它，玩家可点「此牌无瞬发，重抽」去掉）
    const pool = poolFor(state.kind, cat, next.keywords, o, next.instant);
    next.effects = rollEffectsFor(pool, o, state.usedIds, next.excludeIds);
    return next;
  }

  function hasOppositePending(candidate) {
    if (!candidate) return false;
    const card = findCard(candidate.playerId, candidate.cardId);
    if (!card) return false;
    return hasOpposite(card, state.kind);
  }

  // ================================================================
  //  结算
  // ================================================================

  /** 把预抽效果写进卡牌数据（抵消 / 多条效果），不负责发消息 */
  function apply(playerId, card, kind, effects, byId) {
    if (!card || !Array.isArray(effects) || !effects.length) return { added: 0, canceled: false };
    const marks = ensureMarks(card);
    const oppKind = kind === 'bless' ? 'seal' : 'bless';

    if (effects.some(function (e) { return e && e.cancel; })) {
      const before = marks.length;
      card.marks = marks.filter(function (m) { return m && m.kind !== oppKind; });
      return { added: 0, canceled: before !== card.marks.length };
    }

    let added = 0;
    effects.forEach(function (e) {
      if (!e) return;
      const sameCount = marks.filter(function (m) { return m && m.kind === kind; }).length;
      if (sameCount >= MAX_LAYERS) return;
      marks.push({
        kind: kind,
        id: e.id || '',
        cat: e.cat || 'common',
        text: e.text || '',
        requires: e.requires || null,
        grants: e.grants || null,
        by: byId || '',
        at: Date.now(),
      });
      added++;
    });
    return { added: added, canceled: false };
  }

  // ================================================================
  //  配置持久化（按 房间号 + 账号）
  // ================================================================

  function accountName() {
    if (typeof window._gameUsername !== 'undefined' && window._gameUsername) return window._gameUsername;
    if (typeof window._gameNickname !== 'undefined' && window._gameNickname) return window._gameNickname;
    return 'anon';
  }

  function currentRoomTag() {
    if (typeof lastRoomCode !== 'undefined' && lastRoomCode) return String(lastRoomCode);
    if (typeof isSoloMode !== 'undefined' && isSoloMode) return 'solo';
    return 'local';
  }

  function cfgKey() { return 'bwpemu_marks_cfg_' + currentRoomTag() + '_' + accountName(); }

  function loadCfg() {
    const key = cfgKey();
    if (cfgKeyCache === key && pools && adv) return;   // 同房间同账号：不重复加载
    cfgKeyCache = key;
    pools = defaultPools();
    adv = Object.assign({}, DEFAULT_ADV);
    state.target = 'self';
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved) {
          if (saved.target === 'opp' || saved.target === 'self') state.target = saved.target;
          if (saved.adv && typeof saved.adv === 'object') {
            Object.keys(DEFAULT_ADV).forEach(function (k) {
              if (saved.adv[k] !== undefined) adv[k] = saved.adv[k];
            });
          }
          // 旧版本的第三档「全部候选」已取消 → 归到不可重复
          if (adv.dedupe === 'all') adv.dedupe = 'same';
          if (saved.pools && typeof saved.pools === 'object') {
            ['bless', 'seal'].forEach(function (kind) {
              if (!Array.isArray(saved.pools[kind]) || !saved.pools[kind].length) return;
              // 没被改过的官方条目 → 一律跟随最新官方数据（避免旧版本存下的池子缺新字段）
              const offMap = {};
              (OFFICIAL[kind] || []).forEach(function (o) { offMap[o.id] = o; });
              const list = [];
              saved.pools[kind].forEach(function (e) {
                if (!e || !e.text) return;
                const o = offMap[e.id];
                if (o && !e.custom) { list.push(clone(o)); return; }
                list.push(e);
              });
              if (list.length) pools[kind] = list;
            });
          }
        }
      }
    } catch (e) { /* 忽略损坏的本地配置 */ }
    // 至少保证有 1 条可用
    ['bless', 'seal'].forEach(function (kind) {
      if (!pools[kind] || !pools[kind].length) pools[kind] = officialPool(kind);
    });
  }

  function saveCfg() {
    try {
      localStorage.setItem(cfgKey(), JSON.stringify({ target: state.target, adv: adv, pools: pools }));
    } catch (e) { /* localStorage 满了也不影响使用 */ }
  }

  /** 开始新对局：恢复官方规则与官方效果池 */
  function resetConfig() {
    cfgKeyCache = null;
    pools = defaultPools();
    adv = Object.assign({}, DEFAULT_ADV);
    state.target = 'self';
    state.kind = null;
    state.cands = [];
    state.sel.clear();
    try { localStorage.removeItem(cfgKey()); } catch (e) { /* ignore */ }
  }

  function advancedIsCustom() {
    if (!adv) return false;
    return Object.keys(DEFAULT_ADV).some(function (k) { return adv[k] !== DEFAULT_ADV[k]; });
  }

  function poolIsCustom() {
    if (!pools) return false;
    return ['bless', 'seal'].some(function (kind) {
      const cur = pools[kind] || [];
      const off = OFFICIAL[kind] || [];
      if (cur.length !== off.length) return true;
      return cur.some(function (e, i) {
        const o = off[i];
        if (!o) return true;
        // 文本 / 牌型 / 关键词要求 / 关键词授予 / 可重抽 / 自定义标记 —— 任何一项不同都算「已修改」
        return o.id !== e.id || o.text !== e.text || (o.cat || '') !== (e.cat || '')
          || (o.requires || '') !== (e.requires || '') || (o.grants || '') !== (e.grants || '')
          || !!o.reroll !== !!e.reroll
          || !!o.custom !== !!e.custom;
      });
    });
  }

  // ================================================================
  //  DOM：主弹窗 / 高级 / 效果池编辑
  // ================================================================

  function ensureDom() {
    if (dom || document.getElementById('bs-overlay')) {
      dom = dom || {
        overlay: document.getElementById('bs-overlay'),
        stage: document.getElementById('bs-stage'),
        modal: document.getElementById('bs-modal'),
        adv: document.getElementById('bs-adv'),
        pool: document.getElementById('bs-pool'),
        cands: document.getElementById('bs-cands'),
        hint: document.getElementById('bs-hint'),
        confirm: document.getElementById('bs-confirm'),
        advBtn: document.getElementById('bs-adv-btn'),
        advBody: document.getElementById('bs-adv-body'),
        poolBody: document.getElementById('bs-pool-body'),
        poolFilter: document.getElementById('bs-pool-filter'),
        poolBackdrop: document.getElementById('bs-pool-backdrop'),
      };
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'bs-overlay';
    overlay.id = 'bs-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="bs-stage" id="bs-stage">
        <div class="bs-modal" id="bs-modal" role="dialog" aria-label="加护 / 蚀印">
          <div class="bs-head">
            <span class="bs-title">${ICON.bless} 加护 / ${ICON.seal} 蚀印</span>
            <span class="bs-head-right">
              <button type="button" class="bs-adv-btn" id="bs-adv-btn">⚙ 高级</button>
              <button type="button" class="bs-close" id="bs-close" title="关闭">✕</button>
            </span>
          </div>
          <div class="bs-row">
            <span class="bs-row-label">为</span>
            <span class="bs-seg" id="bs-target-seg">
              <button type="button" class="bs-seg-btn" data-target="self">自己</button>
              <button type="button" class="bs-seg-btn" data-target="opp">对手</button>
            </span>
            <span class="bs-row-label">进行</span>
            <span class="bs-kind" id="bs-kind-seg">
              <button type="button" class="bs-kind-btn bs-kind-btn--bless" data-kind="bless"><span class="bs-kind-btn__ico">${ICON.bless}</span>加护</button>
              <button type="button" class="bs-kind-btn bs-kind-btn--seal" data-kind="seal"><span class="bs-kind-btn__ico">${ICON.seal}</span>蚀印</button>
            </span>
          </div>
          <div class="bs-hint" id="bs-hint"></div>
          <div class="bs-cands" id="bs-cands"></div>
          <div class="bs-foot">
            <button type="button" class="bs-btn bs-btn--ok" id="bs-confirm" disabled>✅ 确认</button>
          </div>
        </div>

        <div class="bs-side bs-adv" id="bs-adv" hidden>
          <div class="bs-head">
            <span class="bs-title">⚙ 高级设置</span>
            <button type="button" class="bs-close" id="bs-adv-close" title="关闭">✕</button>
          </div>
          <div class="bs-side-body" id="bs-adv-body"></div>
          <div class="bs-side-foot">
            <button type="button" class="bs-btn bs-btn--cancel" id="bs-adv-reset">重置为官方规则</button>
            <button type="button" class="bs-btn bs-btn--ok" id="bs-adv-done">完成</button>
          </div>
        </div>

        <div class="bs-side bs-pool" id="bs-pool" hidden>
          <div class="bs-head">
            <span class="bs-title">效果池编辑<span class="bs-badge-inline">本局有效</span></span>
            <button type="button" class="bs-close" id="bs-pool-close" title="关闭">✕</button>
          </div>
          <div class="bs-pool-filter" id="bs-pool-filter"></div>
          <div class="bs-side-body" id="bs-pool-body"></div>
          <div class="bs-side-foot">
            <button type="button" class="bs-btn bs-btn--cancel" id="bs-pool-restore">恢复官方池</button>
            <button type="button" class="bs-btn bs-btn--ok" id="bs-pool-add">＋ 新增效果</button>
          </div>
        </div>

        <div class="bs-float-backdrop" id="bs-pool-backdrop" hidden></div>
      </div>`;
    document.body.appendChild(overlay);

    dom = {
      overlay: overlay,
      stage: overlay.querySelector('#bs-stage'),
      modal: overlay.querySelector('#bs-modal'),
      adv: overlay.querySelector('#bs-adv'),
      pool: overlay.querySelector('#bs-pool'),
      cands: overlay.querySelector('#bs-cands'),
      hint: overlay.querySelector('#bs-hint'),
      confirm: overlay.querySelector('#bs-confirm'),
      advBtn: overlay.querySelector('#bs-adv-btn'),
      advBody: overlay.querySelector('#bs-adv-body'),
      poolBody: overlay.querySelector('#bs-pool-body'),
      poolFilter: overlay.querySelector('#bs-pool-filter'),
      poolBackdrop: overlay.querySelector('#bs-pool-backdrop'),
    };

    // 关闭：只认右上角 ✕（点遮罩 / Esc 不关）；关掉时取消本次未完成的加护/蚀印
    overlay.querySelector('#bs-close').addEventListener('click', function () { close(); });
    overlay.querySelector('#bs-confirm').addEventListener('click', onConfirm);
    overlay.querySelector('#bs-adv-btn').addEventListener('click', function () {
      const willOpen = dom.adv.hidden;
      dom.adv.hidden = !willOpen;
      if (willOpen) { renderAdv(); positionPanels(); }
      else positionPanels();
    });
    overlay.querySelector('#bs-adv-close').addEventListener('click', function () { dom.adv.hidden = true; positionPanels(); });
    overlay.querySelector('#bs-adv-done').addEventListener('click', function () { dom.adv.hidden = true; positionPanels(); });
    overlay.querySelector('#bs-adv-reset').addEventListener('click', onAdvReset);
    overlay.querySelector('#bs-pool-close').addEventListener('click', closePoolPanel);
    overlay.querySelector('#bs-pool-add').addEventListener('click', function () { openEntryForm(null); });
    overlay.querySelector('#bs-pool-restore').addEventListener('click', onPoolRestore);

    // 玩家切换：正在进行的加护/蚀印算取消，重置为空白
    overlay.querySelector('#bs-target-seg').addEventListener('click', function (e) {
      const btn = e.target.closest('[data-target]');
      if (!btn) return;
      const nextTarget = btn.dataset.target;
      if (nextTarget === state.target) return;
      const wasRunning = !!state.kind;
      if (wasRunning) cancelPending();
      state.target = nextTarget;
      saveCfg();
      renderTargetKind();
      if (wasRunning) render();
    });

    // 加护 / 蚀印：点击型动作按钮（再点一下 = 重新来一次）
    overlay.querySelector('#bs-kind-seg').addEventListener('click', function (e) {
      const btn = e.target.closest('[data-kind]');
      if (!btn) return;
      const kind = btn.dataset.kind;
      state.kind = kind;
      state.round = 0;
      saveCfg();
      announceStart();
      renderTargetKind();
      startRound(true);
    });

    // 候选点选
    dom.cands.addEventListener('click', onCandsClick);
  }

  /** PC：高级副窗贴主弹窗右侧（效果池已改为独立弹窗，不参与） */
  function positionPanels() {
    if (!dom) return;
    const isMobile = window.matchMedia('(max-width: 900px)').matches;
    if (dom.adv) dom.adv.classList.toggle('bs-side--mobile', isMobile);
  }

  // ---- 主弹窗渲染 ----

  function renderTargetKind() {
    if (!dom) return;
    dom.overlay.querySelectorAll('#bs-target-seg [data-target]').forEach(function (b) {
      b.classList.toggle('is-on', b.dataset.target === state.target);
    });
    dom.overlay.querySelectorAll('#bs-kind-seg [data-kind]').forEach(function (b) {
      b.classList.toggle('is-on', b.dataset.kind === state.kind);
    });
    // 高级按钮：只做高亮，不加会让人想去点的小黄点
    dom.advBtn.classList.toggle('is-custom', advancedIsCustom() || poolIsCustom());
  }

  function renderHint() {
    if (!dom) return;
    const tgt = state.target === 'opp' ? '对手' : '自己';
    if (!state.kind) {
      dom.hint.innerHTML = '<div class="bs-hint__main">请先点击「加护」或「蚀印」</div><div class="bs-hint__sub">点一下就会开始，选完牌再确认</div>';
      return;
    }
    const total = handOf(targetPlayerId()).length;
    let txt = '';
    const n = state.cands.length;
    if (state.reason === 'empty') {
      txt = `没有可选的手牌：${tgt}的手牌为空`;
    } else if (state.reason === 'allMarked') {
      txt = `没有可选的手牌：都已被${LABEL[state.kind]}${adv.stack ? '' : '（可在 ⚙ 高级 里允许叠加）'}`;
    } else {
      const base = `从 ${n} 张未${LABEL[state.kind]}的手牌中选择 ${Math.min(adv.pickCount, n)} 张`;
      txt = n < adv.candCount ? `手牌中只有 ${n} 张可选（需要 ${adv.candCount} 张）` : base;
      if (total) txt += `　<span class="bs-hint__dim">（目标：${tgt}）</span>`;
      if (adv.repeat > 1) txt += `　<span class="bs-hint__round">第 ${state.round + 1}/${adv.repeat} 次</span>`;
    }
    dom.hint.innerHTML = '<div class="bs-hint__main">' + txt + '</div>';
  }

  /** 效果文本里的力量/生命/护甲换成官方图标，并高亮关键词 */
  const ARMOR_IMG = '<img class="bs-stat-icon" src="images/属性/护甲.png" alt="护甲">';
  const HL_TERMS = ['瞬发'].concat(KEYWORDS).sort(function (a, b) { return b.length - a.length; });

  function statIcons(html) {
    return String(html == null ? '' : html)
      .replace(/力量/g, '<img class="bs-stat-icon" src="images/属性/攻击.png" alt="力量">')
      .replace(/生命/g, '<img class="bs-stat-icon" src="images/属性/生命.png" alt="生命">')
      .replace(/护甲/g, ARMOR_IMG)
      .replace(/护盾/g, ARMOR_IMG);
  }

  /** 关键词（含瞬发）金黄高亮，叠在 statIcons 之后用 */
  function highlightKeywords(html) {
    let out = String(html == null ? '' : html);
    if (!out) return out;
    const re = new RegExp('(' + HL_TERMS.join('|') + ')', 'g');
    return out.replace(re, '<span class="bs-kw-hl">$1</span>');
  }

  /** 效果文本的最终渲染：转义 → 图标 → 关键词高亮 */
  function fxHTML(text) {
    return highlightKeywords(statIcons(esc(text)));
  }

  function candHTML(c) {
    const catTxt = c.cat ? CAT_LABEL[c.cat] || c.cat : '未录入';
    // 未录入牌固定后：形态 · 具有贯通、不屈（没关键词就只写形态）
    let sub = catTxt;
    if (c.unknown && c.cat === 'form' && !c.needsSetup) {
      const kws = (c.keywords || []).filter(Boolean);
      if (kws.length) sub = catTxt + ' · 具有' + kws.join('、');
    } else if (c.owner) {
      sub = catTxt + ' · ' + c.owner;
    }
    const sel = state.sel.has(c.cardId);
    const oppTag = (c.cancel ? `<span class="bs-cand__flag">取消${LABEL[state.kind === 'bless' ? 'seal' : 'bless']}</span>` : '');
    let fx = '';
    // 未录入牌：先选类型；选了形态才出现关键词，勾完点「就这样」才固定并抽效果
    if (c.unknown && c.needsSetup) {
      const catBtns = TYPE_OPTIONS.map(function (k) {
        return `<button type="button" class="bs-cat-btn${c.cat === k ? ' is-on' : ''}" data-cat="${k}" data-card="${c.cardId}">${CAT_LABEL[k]}</button>`;
      }).join('');
      const kwChips = KEYWORDS.map(function (k) {
        const on = (c.keywords || []).indexOf(k) !== -1;
        return `<button type="button" class="bs-kw-chip${on ? ' is-on' : ''}" data-kw="${k}" data-card="${c.cardId}">${k}</button>`;
      }).join('');
      fx = `<div class="bs-cand__setup">
          <div class="bs-cand__setup-tip">${c.cat === 'form' ? '勾选这张形态牌具有的关键词，然后点「就这样」' : '这张牌未录入，请先选类型'}</div>
          <div class="bs-setup-row">
            <span class="bs-setup-label">类型：</span>
            <span class="bs-cat-row">${catBtns}</span>
          </div>
          ${c.cat === 'form' ? `<div class="bs-setup-row">
            <span class="bs-setup-label">具有：</span>
            <span class="bs-kw-row">${kwChips}<button type="button" class="bs-kw-done" data-kwdone="1" data-card="${c.cardId}">✓ 就这样</button></span>
          </div>` : ''}
        </div>`;
    }
    if (!c.needsSetup) {
      // 每条效果一个块：重抽按钮跟着「它自己那一条」走，点谁就只换谁
      const rows = (c.effects || []).map(function (e) {
        const cls = e.cancel ? ' is-cancel' : '';
        const txt = e.cancel ? `抵消此牌的${LABEL[state.kind === 'bless' ? 'seal' : 'bless']}效果（两个效果都会消失）` : e.text;
        let btn = '';
        if (e && !e.cancel) {
          let label = '';
          if (c.unknown && e.requiresInstant) label = '此牌无瞬发，重抽';
          else if (c.unknown && e.grantsInstant) label = '已有瞬发，重抽';
          else if (e.reroll) label = '重抽此效果';
          if (label) {
            btn = `<button type="button" class="bs-redraw" data-redraw="${esc(e.id)}" data-card="${c.cardId}" title="${esc('只重抽这一条：' + e.text)}">↻ ${label}</button>`;
          }
        }
        return `<div class="bs-fx-item">
            <div class="bs-fx${cls}">${ICON[state.kind]} ${e.cancel ? esc(txt) : fxHTML(txt)}</div>
            ${btn}
          </div>`;
      }).join('');
      fx += rows || '<div class="bs-fx bs-fx--empty">效果池为空</div>';
    }
    return `<div class="bs-cand${sel ? ' is-sel' : ''}" data-card="${c.cardId}">
        <div class="bs-cand__head">
          <span class="bs-cand__name" title="${esc(c.name)}">${esc(c.name)}</span>
          ${oppTag}
        </div>
        <div class="bs-cand__sub">${esc(sub)}</div>
        <div class="bs-cand__fx">${fx}</div>
        <div class="bs-cand__tick">✓</div>
      </div>`;
  }

  function renderCands() {
    if (!dom) return;
    if (!state.kind) { dom.cands.innerHTML = ''; return; }
    if (!state.cands.length) {
      dom.cands.innerHTML = '<div class="bs-empty">' + esc(state.reason === 'empty' ? '手牌为空' : '没有可选的手牌') + '</div>';
      return;
    }
    dom.cands.innerHTML = state.cands.map(candHTML).join('');
    // 已有标记挂到候选元素上（供悬浮窗读取，同时避开属性转义问题）
    state.cands.forEach(function (c) {
      const el = dom.cands.querySelector('.bs-cand[data-card="' + c.cardId + '"]');
      if (!el) return;
      const hc = findCard(c.playerId, c.cardId);
      if (hc) el.dataset.cardMarks = JSON.stringify(markGroups(hc));
    });
  }

  function renderConfirm() {
    if (!dom) return;
    const picked = state.cands.filter(function (c) { return state.sel.has(c.cardId); });
    const need = Math.min(adv.pickCount, state.cands.length || adv.pickCount);
    const ready = picked.length === need && picked.every(function (c) { return !c.needsSetup; });
    dom.confirm.disabled = !ready;
    dom.confirm.textContent = adv.pickCount > 1
      ? `✅ 确认（${picked.length}/${need}）`
      : '✅ 确认';
    let tip = '';
    if (picked.length && picked.some(function (c) { return c.needsSetup; })) {
      const anyForm = picked.some(function (c) { return c.needsSetup && c.cat === 'form'; });
      tip = anyForm ? '请先为这张牌选择关键词' : '请先为这张牌选择牌型';
    } else if (picked.length && picked.some(function (c) { return !c.needsSetup && !(c.effects || []).length; })) {
      tip = '效果池为空，无法结算';
    }
    dom.confirm.title = tip;
  }

  function render() {
    renderTargetKind();
    renderHint();
    renderCands();
    renderConfirm();
  }

  // ---- 候选交互 ----

  function startRound(fresh) {
    if (fresh) {
      state.sel.clear();
    }
    const pid = targetPlayerId();
    const r = rollCandidates(pid, state.kind, adv);
    state.cands = r.cands;
    state.reason = r.reason;
    state.usedIds = new Set();
    // 「全部候选之间也不重复」已取消，这里只保留本地去重
    render();
  }

  /** 高级/效果池改动后：清空回到未选模式（不自动重抽） */
  function resetToBlank() {
    state.kind = null;
    state.cands = [];
    state.sel.clear();
    state.round = 0;
    state.reason = '';
    render();
  }

  function onCandsClick(e) {
    const catBtn = e.target.closest('[data-cat]');
    if (catBtn) {
      e.stopPropagation();
      const cardId = parseInt(catBtn.dataset.card, 10);
      const c = state.cands.find(function (x) { return x.cardId === cardId; });
      if (!c) return;
      const cat = catBtn.dataset.cat;
      // 形态：先给关键词勾选，勾完点「就这样」才抽
      c.cat = cat;
      c.keywords = [];
      c.effects = [];
      c.cancel = false;
      c.excludeIds = [];
      c.needsSetup = cat === 'form';        // 形态先不抽
      if (cat !== 'form') {
        const next = rollEffects(c, cat, [], adv);
        Object.assign(c, next);
      }
      render();
      return;
    }
    const kwChip = e.target.closest('[data-kw]');
    if (kwChip) {
      e.stopPropagation();
      const cardId = parseInt(kwChip.dataset.card, 10);
      const c = state.cands.find(function (x) { return x.cardId === cardId; });
      if (!c) return;
      const kw = kwChip.dataset.kw;
      const idx = c.keywords.indexOf(kw);
      if (idx === -1) c.keywords.push(kw); else c.keywords.splice(idx, 1);
      // 只勾选，不抽效果；改了关键词就把已经抽到的效果作废，等玩家再点「就这样」
      c.effects = [];
      c.cancel = false;
      c.needsSetup = true;
      c.excludeIds = [];
      render();
      return;
    }
    // 形态：勾完关键词后点「就这样」才算固定（允许一个都不勾），此时才抽效果
    const kwDone = e.target.closest('[data-kwdone]');
    if (kwDone) {
      e.stopPropagation();
      const cardId = parseInt(kwDone.dataset.card, 10);
      const c = state.cands.find(function (x) { return x.cardId === cardId; });
      if (!c) return;
      const next = rollEffects(c, 'form', c.keywords || [], adv);
      next.excludeIds = [];
      Object.assign(c, next);
      render();
      return;
    }
    // 重抽：只换「点到的这一条」，其它效果保持不动
    const redraw = e.target.closest('[data-redraw]');
    if (redraw) {
      e.stopPropagation();
      const cardId = parseInt(redraw.dataset.card, 10);
      const c = state.cands.find(function (x) { return x.cardId === cardId; });
      if (!c) return;
      const dropId = redraw.dataset.redraw;
      const idx = (c.effects || []).findIndex(function (x) { return x && x.id === dropId; });
      const dropped = idx >= 0 ? c.effects[idx] : null;
      if (idx < 0) return;
      // 这一条本轮不再出现；「不可重复」时也不许和剩下的条目撞车
      const others = c.effects.filter(function (x, i) { return i !== idx && x; }).map(function (x) { return x.id; });
      const skip = (c.excludeIds || []).concat([dropId]);
      if (adv.dedupe !== 'none') skip.push.apply(skip, others);
      const pool = poolFor(state.kind, c.cat, c.keywords || [], adv, c.instant);
      const picked = rollEffectsFor(pool, Object.assign({}, adv, { perCard: 1 }), new Set(), skip);
      c.excludeIds = (c.excludeIds || []).concat([dropId]);
      if (picked.length) c.effects[idx] = picked[0];
      else c.effects.splice(idx, 1);       // 池子没别的可选 → 这条直接去掉
      render();
      announceRedraw(dropped);
      return;
    }
    const candEl = e.target.closest('.bs-cand');
    if (!candEl) return;
    const cardId = parseInt(candEl.dataset.card, 10);
    // 手机：已选中的牌再点一下 = 看牌信息（不取消选择）
    if (state.sel.has(cardId) && window.matchMedia('(max-width: 768px)').matches) {
      const cc = state.cands.find(function (x) { return x.cardId === cardId; });
      if (cc && typeof CardTooltip !== 'undefined' && CardTooltip.showForName) {
        const hc = findCard(cc.playerId, cc.cardId);
        CardTooltip.showForName(cc.name, hc ? markGroups(hc) : null);
        return;
      }
    }
    if (state.sel.has(cardId)) state.sel.delete(cardId);
    else {
      if (adv.pickCount <= 1) state.sel.clear();
      state.sel.add(cardId);
    }
    renderCands();
    renderConfirm();
  }

  // ---- 结算 ----

  function onConfirm() {
    const picked = state.cands.filter(function (c) { return state.sel.has(c.cardId); });
    if (!picked.length) return;
    const kind = state.kind;
    const pid = targetPlayerId();
    const opId = mySeatId();
    const opName = seatName(opId);
    const tgtName = seatName(pid);
    const isSelf = String(opId) === String(pid);
    const results = [];

    picked.forEach(function (c) {
      const card = findCard(c.playerId, c.cardId);
      if (!card) return;
      const r = apply(c.playerId, card, kind, c.effects, opId);
      if (r.canceled) {
        const oppLabel = LABEL[kind === 'bless' ? 'seal' : 'bless'];
        results.push(`【系统】${opName}的${LABEL[kind]}与${isSelf ? '' : tgtName + '的'}「${c.name}」的${oppLabel}抵消，两个效果均消失`);
      } else if (r.added > 0) {
        const effText = c.effects.filter(function (e) { return e && !e.cancel; }).map(function (e) {
          return '「' + e.text + '」' + (e.custom ? '［自定义效果］' : '');
        }).join('、');
        if (isSelf) {
          results.push(`【系统】${opName}为自己的一张手牌进行了${LABEL[kind]}：「${c.name}」获得${effText}`);
        } else {
          const reveal = kind === 'seal' ? '（该牌已展示）' : '';
          results.push(`【系统】${opName}对${tgtName}的手牌进行了${LABEL[kind]}：「${c.name}」获得${effText}${reveal}`);
        }
      }
    });

    // 同步 + 刷新界面
    if (typeof syncDeckStateForce === 'function') syncDeckStateForce(pid);
    else if (typeof syncDeckState === 'function') syncDeckState(pid);
    if (typeof refreshOpenListDialog === 'function') refreshOpenListDialog(pid);
    if (typeof updateDeckButtons === 'function') updateDeckButtons(pid);

    results.forEach(function (m) { broadcastSystemMsg(m); });

    // 轮次
    state.round++;
    state.sel.clear();
    if (state.round < Math.max(1, parseInt(adv.repeat, 10) || 1)) {
      startRound(true);
      dom.hint.innerHTML += `<div class="bs-hint__round">已结算 ${state.round} 次，还剩 ${Math.max(0, adv.repeat - state.round)} 次</div>`;
      return;
    }
    state.round = 0;
    state.kind = null;      // 已结算完成 → 关窗时不再报「取消」
    close();
  }

  /** 取消本次未完成的加护/蚀印（切目标 / 点 ✕ 时） */
  function cancelPending() {
    const kind = state.kind;
    if (!kind) return;
    resetToBlank();
    const msg = `【系统】${seatName(mySeatId())} 取消了本次${LABEL[kind]}`;
    if (typeof addSystemChatMessage === 'function') addSystemChatMessage(msg);
    if (typeof isConnected === 'function' && isConnected() && typeof sendToPeer === 'function') {
      sendToPeer({ type: 'sysmsg', text: msg, noUndo: true });
    }
  }

  // ================================================================
  //  高级设置面板
  // ================================================================

  function numRow(label, key, min, max) {
    return `<label class="bs-adv-row">
        <span class="bs-adv-row__label">${label}</span>
        <input type="number" class="bs-adv-num" data-adv="${key}" value="${adv[key]}" min="${min}" max="${max}">
      </label>`;
  }

  function renderAdv() {
    if (!dom) return;
    const dedupe = adv.dedupe, scope = adv.scope;
    dom.advBody.innerHTML = `
      <div class="bs-adv-sec">
        <div class="bs-adv-sec__title">选取</div>
        ${numRow('候选张数（2–6）', 'candCount', 2, 6)}
        ${numRow('选择张数', 'pickCount', 1, 6)}
        ${numRow('重复次数', 'repeat', 1, 9)}
        ${numRow('每张效果数', 'perCard', 1, 9)}
        <div class="bs-adv-row">
          <span class="bs-adv-row__label">单牌抽取效果时</span>
          <span class="bs-opt-group" data-opt="dedupe">
            <button type="button" class="bs-opt${dedupe !== 'none' ? ' is-on' : ''}" data-val="same" title="同一张牌抽到的 N 条效果互不重复">不可重复</button>
            <button type="button" class="bs-opt${dedupe === 'none' ? ' is-on' : ''}" data-val="none" title="同一张牌的 N 条效果允许重复（例如两次 +2 力量）">可重复</button>
          </span>
        </div>
      </div>
      <div class="bs-adv-sec">
        <div class="bs-adv-sec__title">效果池</div>
        <div class="bs-adv-row">
          <span class="bs-adv-row__label">取池范围</span>
          <span class="bs-opt-group" data-opt="scope">
            <button type="button" class="bs-opt${scope === 'byCat' ? ' is-on' : ''}" data-val="byCat">按牌型</button>
            <button type="button" class="bs-opt${scope === 'common' ? ' is-on' : ''}" data-val="common">仅通用</button>
            <button type="button" class="bs-opt${scope === 'all' ? ' is-on' : ''}" data-val="all">全部类型</button>
          </span>
        </div>
        <button type="button" class="bs-adv-link" id="bs-open-pool">✎ 查看 / 编辑效果池${poolIsCustom() ? '<span class="bs-badge-inline">已修改</span>' : ''}</button>
      </div>
      <div class="bs-adv-sec">
        <div class="bs-adv-sec__title">DIY 规则</div>
        <label class="bs-check">
          <input type="checkbox" data-adv="stack" ${adv.stack ? 'checked' : ''}>
          <span class="bs-check__box" aria-hidden="true"></span>
          <span class="bs-check__text">允许已有加护的手牌还可以进行加护，蚀印也如此</span>
        </label>
        <label class="bs-check">
          <input type="checkbox" data-adv="coexist" ${adv.coexist ? 'checked' : ''}>
          <span class="bs-check__box" aria-hidden="true"></span>
          <span class="bs-check__text">允许加护与蚀印共存</span>
        </label>
      </div>`;

    // 事件
    dom.advBody.querySelectorAll('.bs-adv-num').forEach(function (inp) {
      inp.addEventListener('change', function () {
        const k = inp.dataset.adv;
        let v = parseInt(inp.value, 10);
        const min = parseInt(inp.min, 10), max = parseInt(inp.max, 10);
        if (isNaN(v)) v = min;
        v = Math.max(min, Math.min(max, v));
        inp.value = v;
        adv[k] = v;
        saveCfg();
        renderTargetKind();
        resetToBlank();
      });
    });
    dom.advBody.querySelectorAll('.bs-opt-group').forEach(function (grp) {
      grp.addEventListener('click', function (e) {
        const btn = e.target.closest('.bs-opt');
        if (!btn) return;
        adv[grp.dataset.opt] = btn.dataset.val;
        saveCfg();
        renderAdv();
        resetToBlank();
      });
    });
    dom.advBody.querySelectorAll('input[type="checkbox"][data-adv]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        adv[cb.dataset.adv] = cb.checked;
        saveCfg();
        renderTargetKind();
        resetToBlank();
      });
    });
    const openPoolBtn = dom.advBody.querySelector('#bs-open-pool');
    if (openPoolBtn) openPoolBtn.addEventListener('click', openPoolPanel);
  }

  function onAdvReset() {
    adv = Object.assign({}, DEFAULT_ADV);
    saveCfg();
    renderAdv();
    renderTargetKind();
    resetToBlank();
  }

  // ================================================================
  //  效果池编辑
  // ================================================================

  let poolView = { kind: 'bless', cat: 'all' };

  function openPoolPanel() {
    poolView.kind = state.kind || 'bless';
    poolView.cat = 'all';
    // 不并排了：单独弹一个居中窗口（高级面板先收起）
    if (dom.adv) dom.adv.hidden = true;
    dom.pool.classList.add('bs-side--float');
    dom.pool.hidden = false;
    if (dom.poolBackdrop) dom.poolBackdrop.hidden = false;
    renderPool();
  }

  function closePoolPanel() {
    if (!dom) return;
    dom.pool.hidden = true;
    dom.pool.classList.remove('bs-side--float');
    if (dom.poolBackdrop) dom.poolBackdrop.hidden = true;
    resetToBlank();
  }

  function renderPool() {
    if (!dom) return;
    // 顶部：加护/蚀印 + 牌型筛选
    const kindBtns = ['bless', 'seal'].map(function (k) {
      return `<button type="button" class="bs-opt${poolView.kind === k ? ' is-on' : ''}" data-pool-kind="${k}">${ICON[k]} ${LABEL[k]}</button>`;
    }).join('');
    const catBtns = ['all'].concat(CAT_OPTIONS).map(function (c) {
      return `<button type="button" class="bs-opt${poolView.cat === c ? ' is-on' : ''}" data-pool-cat="${c}">${c === 'all' ? '全部' : CAT_LABEL[c]}</button>`;
    }).join('');
    dom.poolFilter.innerHTML = `<span class="bs-opt-group">${kindBtns}</span><span class="bs-opt-group">${catBtns}</span>`;
    dom.poolFilter.querySelectorAll('[data-pool-kind]').forEach(function (b) {
      b.addEventListener('click', function () { poolView.kind = b.dataset.poolKind; renderPool(); });
    });
    dom.poolFilter.querySelectorAll('[data-pool-cat]').forEach(function (b) {
      b.addEventListener('click', function () { poolView.cat = b.dataset.poolCat; renderPool(); });
    });

    const list = (pools[poolView.kind] || []).filter(function (e) {
      return poolView.cat === 'all' || e.cat === poolView.cat;
    });
    if (!list.length) {
      dom.poolBody.innerHTML = '<div class="bs-empty">这个牌型下没有条目</div>';
      return;
    }
    dom.poolBody.innerHTML = list.map(function (e) {
      // 标签：自定义（放在牌型前面）→ 需有：X → 已有X则不抽取该效果
      const tags = [];
      if (e.requires) tags.push(`<span class="bs-tag bs-tag--req">需有：${esc(e.requires)}</span>`);
      if (e.grants) tags.push(`<span class="bs-tag bs-tag--req">已有${esc(e.grants)}则不抽取该效果</span>`);
      if (e.requiresInstant) tags.push('<span class="bs-tag bs-tag--req">需有：瞬发</span>');
      if (e.grantsInstant) tags.push('<span class="bs-tag bs-tag--req">已有瞬发则不抽取该效果</span>');
      if (e.reroll) tags.push('<span class="bs-tag bs-tag--reroll">可重抽</span>');
      return `<div class="bs-pool-item" data-id="${esc(e.id)}">
          <div class="bs-pool-item__main">
            <span class="bs-pool-item__head">
              ${e.custom ? '<span class="bs-tag bs-tag--custom">自定义</span>' : ''}
              <span class="bs-pool-item__cat">${CAT_LABEL[e.cat] || e.cat}</span>
              <span class="bs-pool-item__text">${fxHTML(e.text)}</span>
            </span>
            ${tags.length ? `<span class="bs-pool-item__flags">${tags.join('')}</span>` : ''}
          </div>
          <span class="bs-pool-item__ops">
            <button type="button" class="bs-pool-op" data-pool-edit="${esc(e.id)}" title="修改">✎</button>
            <button type="button" class="bs-pool-op" data-pool-del="${esc(e.id)}" title="删除">🗑</button>
          </span>
        </div>`;
    }).join('');

    dom.poolBody.querySelectorAll('[data-pool-edit]').forEach(function (b) {
      b.addEventListener('click', function () {
        const e = (pools[poolView.kind] || []).find(function (x) { return x.id === b.dataset.poolEdit; });
        if (e) openEntryForm(e);
      });
    });
    dom.poolBody.querySelectorAll('[data-pool-del]').forEach(function (b) {
      b.addEventListener('click', function () { deleteEntry(b.dataset.poolDel); });
    });
  }

  function deleteEntry(id) {
    const list = pools[poolView.kind] || [];
    const tgt = list.find(function (e) { return e.id === id; });
    if (!tgt) return;
    const remainCommon = list.filter(function (e) { return e.id !== id && e.cat === 'common'; }).length;
    if (remainCommon < 1) {
      showToast('至少保留 1 条通用条目');
      return;
    }
    if (!window.confirm('删除这条效果？（本局不再抽取，可在「恢复官方池」找回）\n\n' + tgt.text)) return;
    pools[poolView.kind] = list.filter(function (e) { return e.id !== id; });
    saveCfg();
    renderPool();
    renderTargetKind();
    resetToBlank();
  }

  function onPoolRestore() {
    if (!window.confirm('把「' + LABEL[poolView.kind] + '」的整个效果池恢复成官方版本？本局的所有增删改都会丢失。')) return;
    pools[poolView.kind] = officialPool(poolView.kind);
    saveCfg();
    renderPool();
    renderTargetKind();
    resetToBlank();
  }

  /** 新增 / 修改条目（小表单） */
  function openEntryForm(entry) {
    const kind = poolView.kind;
    const isEdit = !!entry;
    const catBtns = CAT_OPTIONS.map(function (c) {
      const on = isEdit ? entry.cat === c : c === 'common';
      return `<button type="button" class="bs-opt${on ? ' is-on' : ''}" data-form-cat="${c}">${CAT_LABEL[c]}</button>`;
    }).join('');
    const kwOpts = ['', '瞬发'].concat(KEYWORDS);
    const reqOpts = kwOpts.map(function (k) {
      const cur = isEdit ? (entry.requiresInstant ? '瞬发' : (entry.requires || '')) : '';
      return `<option value="${k}"${cur === k ? ' selected' : ''}>${k || '无'}</option>`;
    }).join('');
    const grantOpts = kwOpts.map(function (k) {
      const cur = isEdit ? (entry.grantsInstant ? '瞬发' : (entry.grants || '')) : '';
      return `<option value="${k}"${cur === k ? ' selected' : ''}>${k || '无'}</option>`;
    }).join('');

    const ov = document.createElement('div');
    ov.className = 'bs-form-overlay';
    ov.innerHTML = `
      <div class="bs-form">
        <div class="bs-head"><span class="bs-title">${isEdit ? '编辑效果' : '新增效果'}</span>
          <button type="button" class="bs-close" data-form-cancel>✕</button></div>
        <div class="bs-form-body">
          <div class="bs-form-row"><span>牌型</span><span class="bs-opt-group" data-form-cats>${catBtns}</span></div>
          <label class="bs-form-row bs-form-row--col"><span>效果文本</span>
            <textarea data-form-text maxlength="120" rows="2" placeholder="例如：+1力量/+1生命。">${isEdit ? esc(entry.text) : ''}</textarea>
          </label>
          <label class="bs-form-row"><span>关键词要求</span><select data-form-req>${reqOpts}</select></label>
          <label class="bs-form-row"><span>关键词授予</span><select data-form-grant>${grantOpts}</select></label>
          <label class="bs-check">
            <input type="checkbox" data-form-reroll ${isEdit && entry.reroll ? 'checked' : ''}>
            <span class="bs-check__box" aria-hidden="true"></span>
            <span class="bs-check__text">可重抽<span class="bs-check__hint">抽到后会给一个重抽按钮，本轮可换一条</span></span>
          </label>
          <div class="bs-form-err" data-form-err></div>
        </div>
        <div class="bs-form-foot">
          <button type="button" class="bs-btn bs-btn--cancel" data-form-cancel>取消</button>
          <button type="button" class="bs-btn bs-btn--ok" data-form-save>保存</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    let cat = isEdit ? entry.cat : 'common';

    ov.querySelectorAll('[data-form-cats] .bs-opt').forEach(function (b) {
      b.addEventListener('click', function () {
        cat = b.dataset.formCat;
        ov.querySelectorAll('[data-form-cats] .bs-opt').forEach(function (x) { x.classList.toggle('is-on', x === b); });
      });
    });
    ov.querySelectorAll('[data-form-cancel]').forEach(function (b) {
      b.addEventListener('click', function () { ov.remove(); });
    });
    ov.querySelector('[data-form-save]').addEventListener('click', function () {
      const text = ov.querySelector('[data-form-text]').value.trim();
      const errEl = ov.querySelector('[data-form-err]');
      if (!text) { errEl.textContent = '请填写效果文本'; return; }
      const req = ov.querySelector('[data-form-req]').value || '';
      const grant = ov.querySelector('[data-form-grant]').value || '';
      const reroll = !!ov.querySelector('[data-form-reroll]').checked;
      const item = {
        id: isEdit ? entry.id : ('custom-' + kind + '-' + Date.now().toString(36) + Math.floor(Math.random() * 90 + 10)),
        cat: cat,
        text: text,
        custom: true,          // 新增或修改过 → 一律打「自定义」
      };
      if (req === '瞬发') item.requiresInstant = true;
      else if (req) item.requires = req;
      if (grant === '瞬发') item.grantsInstant = true;
      else if (grant) item.grants = grant;
      if (reroll) item.reroll = true;
      if (isEdit) {
        const list = pools[kind] || [];
        const i = list.findIndex(function (x) { return x.id === entry.id; });
        if (i !== -1) list[i] = item;
      } else {
        (pools[kind] = pools[kind] || []).push(item);
      }
      saveCfg();
      ov.remove();
      renderPool();
      renderTargetKind();
    });
  }

  // ================================================================
  //  提示 / 播报
  // ================================================================

  let toastTimer = null;
  function showToast(msg) {
    let el = document.getElementById('bs-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'bs-toast';
      el.className = 'bs-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('is-on'); }, 1800);
  }

  /** 点下模式时的过程提示（不进撤销历史） */
  function announceStart() {
    if (!state.kind) return;
    const opId = mySeatId();
    const msg = `【系统】${seatName(opId)} 正在进行${LABEL[state.kind]}…`;
    if (typeof addSystemChatMessage === 'function') addSystemChatMessage(msg);
    if (typeof isConnected === 'function' && isConnected() && typeof sendToPeer === 'function') {
      sendToPeer({ type: 'sysmsg', text: msg, noUndo: true });
    }
  }

  /** 重抽提示：只说谁把哪条效果重抽掉了（不进撤销历史） */
  function announceRedraw(dropped) {
    const opId = mySeatId();
    const eff = dropped ? String(dropped.text || '').replace(/。$/, '') : '效果';
    const msg = `【系统】${seatName(opId)} 重抽了抽到的「${eff}」效果`;
    if (typeof addSystemChatMessage === 'function') addSystemChatMessage(msg);
    if (typeof isConnected === 'function' && isConnected() && typeof sendToPeer === 'function') {
      sendToPeer({ type: 'sysmsg', text: msg, noUndo: true });
    }
  }

  // ================================================================
  //  打开 / 关闭
  // ================================================================

  function open() {
    if (typeof isSpectator !== 'undefined' && isSpectator) {
      if (typeof addSystemChatMessage === 'function') addSystemChatMessage('【系统】观众不能操作加护/蚀印');
      return;
    }
    loadCfg();
    ensureDom();
    state.kind = null;
    state.round = 0;
    state.reason = '';
    state.cands = [];
    state.sel.clear();
    state.usedIds = new Set();
    dom.adv.hidden = true;
    dom.pool.hidden = true;
    dom.pool.classList.remove('bs-side--float');
    if (dom.poolBackdrop) dom.poolBackdrop.hidden = true;
    dom.overlay.hidden = false;
    dom.overlay.style.display = 'flex';
    render();
    positionPanels();
  }

  function close() {
    if (!dom) return;
    // 还有没结算完的加护/蚀印 → 算取消（并通报）
    if (state.kind) cancelPending();
    dom.overlay.hidden = true;
    dom.overlay.style.display = 'none';
    dom.adv.hidden = true;
    dom.pool.hidden = true;
    dom.pool.classList.remove('bs-side--float');
    if (dom.poolBackdrop) dom.poolBackdrop.hidden = true;
    state.sel.clear();
  }

  // ================================================================
  //  入口按钮绑定
  // ================================================================

  function bindEntry() {
    const btn = document.getElementById('btn-bless-seal');
    if (!btn || btn.dataset.bsBound) return;
    btn.dataset.bsBound = '1';        // 禁止重复绑定同一元素
    btn.addEventListener('click', function () {
      const menu = document.getElementById('dropdown-mechanic-menu');
      if (menu) menu.hidden = true;
      open();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindEntry);
  else bindEntry();
  window.addEventListener('load', bindEntry);

  // ================================================================
  //  导出
  // ================================================================

  return {
    open: open,
    close: close,
    marksOf: marksOf,
    markGroups: markGroups,
    hasSeal: hasSeal,
    hasKind: hasKind,
    markSuffix: markSuffix,
    markTags: markTags,
    clearMarks: clearMarks,
    poolFor: poolFor,
    rollCandidates: rollCandidates,
    rollEffects: rollEffects,
    apply: apply,
    statIcons: statIcons,
    highlightKeywords: highlightKeywords,
    fxHTML: fxHTML,
    resetConfig: resetConfig,
  };
})();

window.BlessSeal = BlessSeal;
