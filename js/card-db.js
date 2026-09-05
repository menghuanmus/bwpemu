// ================================================================
//  js/card-db.js — 卡牌数据库 (CardDB)
//  管理卡牌数据的加载、查询、自定义卡牌增删改查
//  依赖: data/cards.js (CARD_DB_DATA 全局变量)
// ================================================================

    // ================================================================
    //  卡牌数据库 (CardDB) — data/cards.js 全局变量 + 本地自定义卡牌
    //  数据文件 data/cards.js 通过 <script> 标签在 index.html 中加载，
    //  定义全局变量 CARD_DB_DATA。直接编辑该文件即可增删卡牌。
    // ================================================================
    const CardDB = (() => {
      const _cards = new Map();
      const _keywords = new Map();
      const STORAGE_KEY = 'bwp_custom_cards';
      // ── 玩家自定义卡库（服务器同步） ──
      const _playerLibs = { '1': null, '2': null };
      const _playerKeywords = new Map();  // 双方自定义关键词（官方重名已在服务器拦截）
      const _officialNames = new Set();

      async function init() {
        // 加载 data/cards.js 中的全局数据（<script> 已同步加载，直接可用）
        if (typeof CARD_DB_DATA !== 'undefined' && Array.isArray(CARD_DB_DATA)) {
          for (const card of CARD_DB_DATA) {
            _cards.set(card.name, card);
            if (card.name) _officialNames.add(String(card.name));
          }
          console.log(`[CardDB] ✅ data/cards.js 加载完成，共 ${CARD_DB_DATA.length} 张卡牌`);
        } else {
          console.error('[CardDB] ❌ 未找到 CARD_DB_DATA，请检查 index.html 中是否引用了 data/cards.js');
        }

        // 加载关键词档案
        if (typeof KEYWORD_DB_DATA !== 'undefined' && Array.isArray(KEYWORD_DB_DATA)) {
          for (const kw of KEYWORD_DB_DATA) {
            _keywords.set(kw.name, kw);
          }
          console.log(`[CardDB] ✅ 关键词档案加载完成，共 ${KEYWORD_DB_DATA.length} 条`);
        }

        // 加载本地自定义卡牌（最后加载，优先级最高）
        _loadCustom();

      }

      function _loadCustom() {
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) {
            const cards = JSON.parse(raw);
            const kept = [];
            let removed = 0;
            for (const card of cards) {
              const existing = _cards.get(card.name);
              // 官方牌优先：本地旧数据不得覆盖官方同名卡
              if (existing && !existing._custom) { removed++; continue; }
              card._custom = true;
              _cards.set(card.name, card);
              kept.push(card);
            }
            if (removed > 0) {
              // 自动清理与官方同名的旧自定义卡（垃圾数据，安全删除）
              localStorage.setItem(STORAGE_KEY, JSON.stringify(kept));
            }
            console.log(`[CardDB] 本地自定义卡牌加载完成，共 ${kept.length} 张${removed > 0 ? '（已自动清理与官方同名的 ' + removed + ' 张）' : ''}`);
          }
        } catch (e) {
          console.warn('[CardDB] 本地自定义卡牌读取失败:', e.message);
        }
      }

      function _saveCustom() {
        const customs = [];
        for (const card of _cards.values()) {
          if (card._custom) customs.push(card);
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(customs));
      }

      /** 查询卡牌：官方库精确 → 玩家库精确（牌主优先）→ 官方库模糊 */
      function lookup(name, preferPlayerId) {
        if (!name) return null;
        const key = name.trim();
        if (_cards.has(key)) return _cards.get(key);
        for (const pid of _libOrder(preferPlayerId)) {
          const hit = _libExact(pid, key);
          if (hit) return hit;
        }
        // 前缀匹配（「桃花妖·觉醒」→ 可匹配到「桃花妖」）
        for (const [k, card] of _cards) {
          if (key.startsWith(k) || k.startsWith(key)) return card;
        }
        // 包含匹配
        for (const [k, card] of _cards) {
          if (k.includes(key) || key.includes(k)) return card;
        }
        return null;
      }

      /** 严格全匹配查询（悬浮窗等需要精确对应卡牌的场合） */
      function lookupExact(name, preferPlayerId) {
        if (!name) return null;
        const key = name.trim();
        if (_cards.has(key)) return _cards.get(key);
        for (const pid of _libOrder(preferPlayerId)) {
          const hit = _libExact(pid, key);
          if (hit) return hit;
        }
        return null;
      }

      /** 玩家库查询优先级：牌主（或自己）在前 */
      function _libOrder(preferPlayerId) {
        const mine = (typeof localPlayerId !== 'undefined' && localPlayerId) ? String(localPlayerId) : '1';
        const other = mine === '1' ? '2' : '1';
        const order = [];
        if (preferPlayerId) {
          const p = String(preferPlayerId);
          order.push(p);
          if (p !== mine) order.push(mine);
          else order.push(other);
        } else {
          order.push(mine, other);
        }
        return order;
      }

      /** 玩家库精确查找 */
      function _libExact(playerId, name) {
        const lib = _playerLibs[playerId];
        if (!lib) return null;
        const shi = lib.shikigami.get(name);
        if (shi) return shi;
        const arr = lib.cards.get(name);
        if (arr && arr.length) return arr[0];
        const cur = lib.curses ? lib.curses.get(name) : null;
        if (cur) return cur;
        return null;
      }

      // ═══════════ 玩家自定义卡库（服务器同步） ═══════════

      /** 加载某位玩家的卡库（进房/开局/重连时由网络层调用） */
      function loadPlayerCardLib(playerId, lib) {
        if (!playerId) return;
        const shikigami = new Map();
        const cards = new Map();
        const curses = new Map();
        if (lib && typeof lib === 'object') {
          const shiArr = Array.isArray(lib.shikigami) ? lib.shikigami : [];
          const cardArr = Array.isArray(lib.cards) ? lib.cards : [];
          const otherArr = Array.isArray(lib.others) ? lib.others : [];
          shiArr.forEach(function(s) {
            if (s && s.name && typeof s.name === 'string') {
              const sc = Object.assign({}, s);
              sc.type = (sc.type === 'summon') ? 'summon' : 'shikigami';
              sc._lib = true; sc._libOwner = playerId;
              shikigami.set(sc.name, sc);
            }
          });
          cardArr.forEach(function(c) {
            if (c && c.name && typeof c.name === 'string') {
              const cc = Object.assign({}, c);
              cc._lib = true; cc._libOwner = playerId;
              if (!cards.has(cc.name)) cards.set(cc.name, []);
              cards.get(cc.name).push(cc);
            }
          });
          otherArr.forEach(function(o) {
            if (!o || !o.name || typeof o.name !== 'string') return;
            if (o.type === 'keyword') {
              if (!_playerKeywords.has(o.name)) {
                const kw = Object.assign({}, o);
                kw._playerKw = true;
                _playerKeywords.set(o.name, kw);
              }
            } else if (o.type === 'curse') {
              const cc = Object.assign({}, o);
              cc.type = 'curse'; cc._lib = true; cc._libOwner = playerId;
              curses.set(cc.name, cc);
            }
          });
        }
        _playerLibs[playerId] = { shikigami: shikigami, cards: cards, curses: curses };
        console.log('[CardDB] 玩家 ' + playerId + ' 卡库已加载：' + shikigami.size + ' 式神 / ' + cards.size + ' 卡牌 / ' + curses.size + ' 灵咒');
      }

      /** 在玩家库中查找：支持按归属式神优先（同名多张时） */
      function findInPlayerLib(playerId, name, owner) {
        const lib = _playerLibs[playerId];
        if (!lib) return null;
        const key = String(name || '').trim();
        if (!key) return null;
        const arr = lib.cards.get(key);
        if (owner && arr && arr.length) {
          const hit = arr.find(c => c.owner === owner);
          if (hit) return hit;
        }
        const shi = lib.shikigami.get(key);
        if (shi) return shi;
        if (arr && arr.length) return arr[0];
        const cur = lib.curses ? lib.curses.get(key) : null;
        if (cur) return cur;
        return null;
      }

      /** 某位玩家的式神列表（式神录「我的」页签用） */
      function getPlayerShikigami(playerId) {
        const lib = _playerLibs[playerId];
        if (!lib) return [];
        return [...lib.shikigami.values()];
      }

      /** 某位玩家的全部卡牌 */
      function getPlayerLibCards(playerId) {
        const lib = _playerLibs[playerId];
        if (!lib) return [];
        const out = [];
        for (const arr of lib.cards.values()) out.push(...arr);
        return out;
      }

      /** 是否为官方卡牌名（DIY 保存时拦截同名用） */
      function isOfficialName(name) { return _officialNames.has(String(name || '').trim()); }

      /** 玩家自定义关键词列表（双方合并，带 _playerKw 标记） */
      function getPlayerKeywords() { return [..._playerKeywords.values()]; }

      /** 全部关键词：官方 + 玩家（玩家带 _playerKw 标记，样式区分用） */
      function getAllKeywords() {
        const official = (typeof KEYWORD_DB_DATA !== 'undefined' && Array.isArray(KEYWORD_DB_DATA)) ? KEYWORD_DB_DATA : [];
        return official.concat(getPlayerKeywords());
      }

      // 便捷入口：网络层一次性加载双方卡库
      window.loadCardLibs = function(libs) {
        if (libs && typeof libs === 'object') {
          if (libs['1']) loadPlayerCardLib('1', libs['1']);
          if (libs['2']) loadPlayerCardLib('2', libs['2']);
        }
      };

      /** 添加自定义卡牌 */
      // 【注意】本地自定义卡机制仍被烹饪佳肴注册（food-card-register）使用，勿删；
      // 旧的卡牌/效果编辑器入口已废弃（2026-09-05），玩家 DIY 管理走「玩家自定义卡库」。
      function addCustom(card) {
        if (!card || !card.name || !card.type) return false;
        const existing = _cards.get(card.name);
        // 官方牌优先：不允许与官方卡重名
        if (existing && !existing._custom) return false;
        card._custom = true;
        if (card.reviewed === undefined) card.reviewed = false;
        _cards.set(card.name, card);
        _saveCustom();
        return true;
      }

      /** 删除自定义卡牌 */
      function removeCustom(name) {
        const card = _cards.get(name);
        if (card && card._custom) {
          _cards.delete(name);
          _saveCustom();
          return true;
        }
        return false;
      }

      /** 导出所有自定义卡牌为 JSON 字符串 */
      function exportCustom() {
        const customs = [];
        for (const card of _cards.values()) {
          if (card._custom) customs.push(card);
        }
        return JSON.stringify(customs, null, 2);
      }

      /** 批量导入自定义卡牌 JSON，返回成功导入数量 */
      function importCustom(jsonStr) {
        const cards = JSON.parse(jsonStr);
        if (!Array.isArray(cards)) throw new Error('格式错误：需要 JSON 数组');
        let count = 0;
        for (const card of cards) {
          if (!card.name || !card.type) continue;
          const existing = _cards.get(card.name);
          if (existing && !existing._custom) continue; // 官方牌优先
          card._custom = true;
          _cards.set(card.name, card);
          count++;
        }
        _saveCustom();
        return count;
      }

      function isReady() { return _cards.size > 0; }
      function size() { return _cards.size; }
      function getAll() { return [..._cards.values()]; }

      /** 查询关键词档案 */
      function lookupKeyword(name) {
        if (!name) return null;
        return _keywords.get(name) || null;
      }

      return { init, lookup, lookupExact, addCustom, removeCustom, exportCustom, importCustom, isReady, size, getAll, lookupKeyword, loadPlayerCardLib, findInPlayerLib, getPlayerShikigami, getPlayerLibCards, isOfficialName, getPlayerKeywords, getAllKeywords };
    })();

