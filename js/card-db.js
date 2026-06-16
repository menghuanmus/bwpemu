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

      async function init() {
        // 加载 data/cards.js 中的全局数据（<script> 已同步加载，直接可用）
        if (typeof CARD_DB_DATA !== 'undefined' && Array.isArray(CARD_DB_DATA)) {
          for (const card of CARD_DB_DATA) {
            _cards.set(card.name, card);
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

        // 启动模块化效果引擎（需等待 CardDB 就绪后）
        if (typeof initEffectEngine === 'function') {
          initEffectEngine();
        }
      }

      function _loadCustom() {
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) {
            const cards = JSON.parse(raw);
            for (const card of cards) {
              card._custom = true;
              _cards.set(card.name, card);
            }
            console.log(`[CardDB] 本地自定义卡牌加载完成，共 ${cards.length} 张`);
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

      /** 查询卡牌：精确匹配 → 前缀匹配 → 包含匹配 */
      function lookup(name) {
        if (!name) return null;
        const key = name.trim();
        if (_cards.has(key)) return _cards.get(key);
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

      /** 添加自定义卡牌 */
      function addCustom(card) {
        if (!card || !card.name || !card.type) return false;
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

      return { init, lookup, addCustom, removeCustom, exportCustom, importCustom, isReady, size, getAll, lookupKeyword };
    })();

