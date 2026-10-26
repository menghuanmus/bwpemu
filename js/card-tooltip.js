// ================================================================
//  js/card-tooltip.js — 卡牌信息浮窗 (CardTooltip)
//  鼠标悬浮卡牌名称时展示卡牌详情（属性、效果、灵咒等）
//  依赖: CardDB, escapeHTML(), getSlotCurses()
// ================================================================

    // ================================================================
    //  卡牌信息浮窗 (CardTooltip) — 鼠标悬浮展示卡牌详情
    // ================================================================
    const CardTooltip = (() => {
      let el = null;
      let timer = null;
      let currentCard = null;
      let currentSlot = null;
      let currentCardCurses = null;
      let currentCardMarks = null;   // 手牌/牌库上的加护 / 蚀印标记
      let hoveredEl = null;
      let _swallowNextClick = false;   // 点击悬浮窗关闭时，吞掉紧随的点击，防止穿透到下层按键
      let termsEl = null;              // 描述中灵咒/关键词的解释小窗容器（PC：悬浮窗旁）
      let currentTerms = [];           // 当前描述里命中的灵咒/关键词解释项（按出现顺序）
      let _swallowTimer = null;
      const DELAY = 300;

      function init() {
        el = document.getElementById('card-tooltip');
        if (!el) { console.error('[Tooltip] ❌ 未找到 #card-tooltip DOM元素！'); return; }

        // 事件委托（手机端跳过 hover：tap 会合成 mouseover，导致点按钮也弹浮窗）
        document.addEventListener('mouseover', function(e) {
          if (window.matchMedia('(max-width: 768px)').matches) return;
          _onMouseOver(e);
        }, true);
        document.addEventListener('mouseout', function(e) {
          if (window.matchMedia('(max-width: 768px)').matches) return;
          _onMouseOut(e);
        }, true);
        // 点击悬浮窗本身：关闭悬浮窗
        el.addEventListener('click', function() { hide(); });
        // 点在悬浮窗上：只关闭悬浮窗，拦截本次点击，防止穿透到下面的按键
        el.addEventListener('pointerup', function(e) {
          e.stopPropagation();
          _swallowNextClick = true;
          clearTimeout(_swallowTimer);
          _swallowTimer = setTimeout(function() { _swallowNextClick = false; }, 600);
          hide();
        }, true);
        // 捕获阶段吞掉穿透点击（点击事件在 pointerup 之后派发，此时悬浮窗已隐藏，目标会落在下层元素）
        document.addEventListener('click', function(e) {
          if (_swallowNextClick) {
            _swallowNextClick = false;
            clearTimeout(_swallowTimer);
            e.stopPropagation();
            e.preventDefault();
          }
        }, true);
        console.log('[Tooltip] ✅ 已初始化，监听卡牌名悬浮');

        // ── 手机端：点击卡图空白区域显示浮窗（按钮/拖动不触发） ──
        const MQ = window.matchMedia('(max-width: 768px)');
        let pressX = 0, pressY = 0, pressMoved = false;
        document.addEventListener('pointerdown', function(e) {
          pressX = e.clientX; pressY = e.clientY; pressMoved = false;
        }, true);
        document.addEventListener('pointermove', function(e) {
          if (Math.hypot(e.clientX - pressX, e.clientY - pressY) > 10) pressMoved = true;
        }, true);
        document.addEventListener('pointerup', function(e) {
          if (!MQ.matches) return;
          if (_isControl(e.target)) return;
          if (pressMoved) return;   // 拖动不算点击
          // 瞄准模式（选目标）时不弹悬浮窗
          if (typeof isTargeting !== 'undefined' && isTargeting) return;
          // 点击预设项：显示该式神的悬浮窗
          const pItem = e.target.closest ? e.target.closest('.preset-item') : null;
          if (pItem) {
            if (_findCardName(e.target)) { _onMouseOver(e); }
            return;
          }
          // 手牌/牌库/牌表/聊天等列表中的卡牌名：点击显示悬浮窗
          const nameHit = e.target.closest ? e.target.closest('.card-list-item__name, .breakdown-card-row__name, .deck-group__name, .chat-card-name, .charge-card-name, .divine-card-item__name, .bond-opt') : null;
          if (nameHit) {
            if (_findCardName(e.target)) { _onMouseOver(e); }
            return;
          }
          const slot = e.target.closest ? e.target.closest('.card-slot') : null;
          if (slot) {
            const art = slot.querySelector('.card-art');
            if (art) {
              const r = art.getBoundingClientRect();
              if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
                // 有名字或卡槽有内容（含未命名的式神）都显示悬浮窗
                if (_findCardName(e.target) || _slotHasContent(slot)) { _onMouseOver(e); }
                return;
              }
            }
          }
          // 点击其他地方：关闭已显示的浮窗
          if (el && !el.hidden) hide();
        }, true);
        document.addEventListener('pointercancel', function() {
          pressMoved = false;
        }, true);
      }

      /** 交互控件：按钮/输入框/徽章等，点击它们绝不触发长按浮窗 */
      function _isControl(target) {
        if (!target || !target.closest) return false;
        return !!target.closest('input, textarea, select, button, .card-form-badge, .curse-badge, .curse-more, .charge-indicator, .incarn-row, .card-badge:not(.card-badge--name)');
      }

      /** 去掉牌面列表的「协战*」前缀，便于按真名查库 */
      function _stripBondPrefix(text) {
        return String(text == null ? '' : text).replace(/^协战\*/, '');
      }

      /** 是否属于「牌名」元素（决定查不到时要不要给「未录入」悬浮窗） */
      const CARD_NAME_CLASSES = ['card-list-item__name', 'deck-group__name', 'divine-card-item__name', 'breakdown-card-row__name', 'charge-card-name', 'chat-card-name', 'preset-item__name'];
      function _isCardNameEl(target) {
        if (!target || !target.classList) return false;
        for (let i = 0; i < CARD_NAME_CLASSES.length; i += 1) {
          if (target.classList.contains(CARD_NAME_CLASSES[i])) return true;
        }
        return !!(target.closest && target.closest('.bs-cand'));
      }

      function _findCardName(target) {
        if (!target) return null;
        // 食材牌/佳肴：通过 data-food 属性获取
        const foodEl = target.closest('[data-food]');
        if (foodEl) {
          try {
            const foodData = JSON.parse(foodEl.dataset.food);
            return { name: foodData.name, _foodData: foodData };
          } catch(e) { /* fall through */ }
        }
        // 直接命中
        if (target.classList.contains('card-name')) return target.value;
        if (target.classList.contains('card-list-item__name')) return _stripBondPrefix(target.textContent);
        if (target.classList.contains('breakdown-card-row__name')) {
          const t = _stripBondPrefix(target.textContent).trim();
          if (t === '未知' || !t) return null; // 未揭示不弹窗
          return t;
        }
        if (target.classList.contains('deck-group__name')) {
          // 对手牌库中的已揭示卡牌，去掉"（已占卜）"后缀
          return _stripBondPrefix(target.textContent).replace(/（已占卜）$/, '');
        }
        // 占卜界面中的卡牌名
        if (target.classList.contains('divine-card-item__name')) return _stripBondPrefix(target.textContent);
        if (target.classList.contains('chat-card-name')) {
          // 系统消息中的随机池：展示池内随机项，不要当卡牌
          if (target.dataset.rpPool) {
            try {
              const pd = JSON.parse(target.dataset.rpPool);
              if (pd && pd.name) return { name: pd.name, _poolData: pd };
            } catch (e) { /* fall through */ }
          }
          // 系统消息中骰到的随机项：显示为「随机项」+ 所属池的权重/概率
          if (target.dataset.rpItem) {
            try {
              const rd = JSON.parse(target.dataset.rpItem);
              if (rd && rd.text) return { name: rd.text, _rpItemData: rd };
            } catch (e) { /* fall through */ }
          }
          // 系统消息中的食材/佳肴：通过隐藏备注实时生成真实效果
          if (target.dataset.food) {
            try {
              const fd = JSON.parse(target.dataset.food);
              if (fd && fd.name) return { name: fd.name, _foodData: fd };
            } catch (e) { /* fall through */ }
          }
          return target.textContent;
        }
        if (target.classList.contains('effect-name')) return target.value;
        // 蓄力管理面板中的卡牌名
        if (target.classList.contains('charge-card-name')) return target.dataset.cardName || target.textContent;
        // 加护 / 蚀印候选牌
        const candEl = target.closest ? target.closest('.bs-cand') : null;
        if (candEl) {
          const nm = candEl.querySelector('.bs-cand__name');
          if (nm) return _stripBondPrefix(nm.textContent);
        }
        // 手牌/牌库灵咒标签
        if (target.classList.contains('card-list-curse-tag')) {
          return target.dataset.curseName || '';
        }
        // 灵咒徽章内的名字
        if (target.classList.contains('curse-badge__name')) return target.textContent;
        if (target.classList.contains('curse-badge')) {
          const nameEl = target.querySelector('.curse-badge__name');
          if (nameEl) return nameEl.textContent;
        }
        // 预设项（预设面板中的式神/召唤物）
        if (target.classList.contains('preset-item__name')) return target.textContent;
        if (target.classList.contains('preset-item')) {
          const pn = target.querySelector('.preset-item__name');
          if (pn) return pn.textContent;
        }
        // label 包裹的 input
        if (target.classList.contains('card-badge--name')) {
          const input = target.querySelector('.card-name');
          if (input) return input.value;
        }
        // 协战牌分化选择窗：悬浮/点击选项任意位置都能看牌（按钮上不弹，避免挡住“使用”操作）
        const bondOpt = target.closest ? target.closest('.bond-opt') : null;
        if (bondOpt && !(target.closest && target.closest('button'))) {
          const bnm = bondOpt.querySelector('.bond-opt__name');
          if (bnm) return _stripBondPrefix(bnm.textContent);
        }
        // 幻境/效果整行（观战锁定时输入框是 pointer-events:none，鼠标会命中行本身）
        const effItem = target.closest ? target.closest('.effect-item') : null;
        if (effItem) {
          const effInput = effItem.querySelector('.effect-name');
          if (effInput && effInput.value) return effInput.value;
        }
        // 卡牌槽内任意位置
        const slot = target.closest('.card-slot');
        if (slot) {
          const input = slot.querySelector('.card-name');
          if (input && input.value) return input.value;
        }
        return null;
      }

      function _onMouseOver(e) {
        const target = e.target;
        const name = _findCardName(target);
        const slot = target.closest ? target.closest('.card-slot') : null;

        // 没名字但卡槽有内容的式神（未命名自定义式神）：也允许显示
        if (!name && !_slotHasContent(slot)) { hide(); return; }
        // 食材牌/佳肴：用内嵌的食物数据
        let card;
        if (name && typeof name === 'object' && name._rpItemData) {
          card = _buildRpItemCardInfo(name._rpItemData);
        } else if (name && typeof name === 'object' && name._poolData) {
          card = _buildPoolCardInfo(name._poolData);
        } else if (name && typeof name === 'object' && name._foodData) {
          card = _buildFoodCardInfo(name._foodData);
        } else {
          card = name ? (CardDB.lookupExact ? CardDB.lookupExact(name) : CardDB.lookup(name)) : null;
          // 数据库没有的式神：用卡槽当前设置（名字/基础数值/能力来自式神管理）
          if (!card && slot) {
            card = _buildSlotCardInfo(slot, typeof name === 'string' ? name : '');
          }
        }
        // 库里查不到的牌（DIY / 未录入）：也给一个「未录入卡牌」悬浮窗
        // 只对真正的「牌名」元素生效，避免幻境名/效果名等自由文本也弹窗
        if (!card && _isCardNameEl(target)) {
          const nm = (typeof name === 'string') ? String(name).trim() : '';
          if (nm && nm !== '未知') card = { name: nm, type: '', _unknownCard: true, effect: '' };
        }
        if (!card) { hide(); return; }
        currentCard = card;
        hoveredEl = target;
        // 记录卡牌槽引用（战场，悬停灵咒徽章本身时跳过）
        const isCurseEl = target.closest('.curse-badge, .card-list-curse-tag');
        currentSlot = isCurseEl ? null : (target.closest('.card-slot') || null);
        // 记录手牌/牌库卡牌数据（加护蚀印候选牌也挂了同名 dataset）
        const info = target.closest('.card-list-item__info') || target.closest('.bs-cand');
        currentCardCurses = (!isCurseEl && info && info.dataset.cardCurses) ? JSON.parse(info.dataset.cardCurses) : null;
        currentCardMarks = (!isCurseEl && info && info.dataset.cardMarks) ? JSON.parse(info.dataset.cardMarks) : null;
        clearTimeout(timer);
        const mx = e.clientX;
        const my = e.clientY;
        timer = setTimeout(() => _show(mx, my), DELAY);
      }

      function _onMouseOut(e) {
        if (e.target === hoveredEl || _findCardName(e.target)) {
          clearTimeout(timer);
          hide();
        }
      }

      /** 卡槽是否有内容（图/名字/攻命输入值），空槽不算 */
      function _slotHasContent(slot) {
        if (!slot) return false;
        if (slot.classList.contains('has-image')) return true;
        const nameEl = slot.querySelector('.card-name');
        const atkEl = slot.querySelector('.card-attack');
        const hpEl = slot.querySelector('.card-hp');
        if ((nameEl && nameEl.value) || (atkEl && atkEl.value) || (hpEl && hpEl.value)) return true;
        return false;
      }

      /** 数据库没有的式神：用卡槽当前设置（式神管理里的名字/基础/能力）拼出信息 */
      function _buildSlotCardInfo(slot, name) {
        const isSummon = slot.dataset.slotType === 'summon';
        const isSwitchTarget = !!(slot._switch && (slot._switch.idx | 0) > 0);   // 当前显示的是变身
        const baseAtk = (slot._baseAtk !== undefined && slot._baseAtk !== null) ? slot._baseAtk : null;
        const baseHp = (slot._baseHp !== undefined && slot._baseHp !== null) ? slot._baseHp : null;
        return {
          type: isSwitchTarget ? 'transform' : (isSummon ? 'summon' : 'shikigami'),
          name: name || '暂未命名',
          faction: slot.dataset.slotFaction || '无相',
          attack: '无',
          hp: '无',
          effect: slot.classList.contains('awakened') ? (slot._permAbility || '') : ((slot._baseAbility !== undefined && slot._baseAbility !== null) ? slot._baseAbility : ''),
          _slotInfo: true,
          _baseAtk: baseAtk,
          _baseHp: baseHp,
        };
      }

      function _buildFoodCardInfo(foodData) {
        const typeClass = foodData._foodType === '佳肴' ? 'curse' : 'spell';
        const foodTypeNames = { '山珍': '🍄 山珍', '海味': '🐟 海味', '时蔬': '🥬 时蔬', '佳肴': '🍲 佳肴' };
        const info = {
          type: typeClass,
          name: foodData.name,
          _food: true,
          _foodType: foodData._foodType,
          _foodEffects: foodData._foodEffects || [],
          _foodIngredients: foodData._foodIngredients || '',
          _foodLevel: foodData._foodLevel || 0,
          effect: '',
          owner: '中立',
        };
        if (foodData._foodType === '佳肴') {
          // 佳肴：由xx合成 + 换行效果
          const ingredientText = foodData._foodIngredients ? `由${foodData._foodIngredients}合成` : '';
          info.effect = ingredientText + '\n' + foodData._foodEffects.join('\n');
        } else {
          // 食材牌：不显示"（X级食材）"，通过等级字段展示
          info.effect = foodData._foodEffects.join('、');
        }
        return info;
      }

      /** 随机池：把消息里带的池信息包成可渲染对象 */
      function _buildPoolCardInfo(poolData) {
        var items = Array.isArray(poolData.items) ? poolData.items : [];
        var clampW = function (v) {
          var n = parseInt(v, 10);
          if (!isFinite(n) || n < 0) return 0;
          return Math.min(1000, n);
        };
        var total = 0;
        items.forEach(function (it) { total += clampW(it && it.weight); });
        return {
          type: 'pool',
          name: String(poolData.name || '随机池'),
          _pool: true,
          _poolItems: items.map(function (it) {
            var w = clampW(it && it.weight);
            var pct = total > 0 ? Math.round(w / total * 1000) / 10 : 0;
            return { text: String((it && it.text) || ''), weight: w, pct: pct };
          }),
          _poolTotal: total
        };
      }

      /** 系统消息里的随机项（骰到的结果）：显示它在随机池里的权重与概率 */
      function _buildRpItemCardInfo(itemData) {
        var clampW = function (v) {
          var n = parseInt(v, 10);
          if (!isFinite(n) || n < 0) return 0;
          return Math.min(1000, n);
        };
        var items = Array.isArray(itemData.items) ? itemData.items : [];
        var total = 0;
        var list = items.map(function (it) {
          var w = clampW(it && it.weight);
          total += w;
          return { text: String((it && it.text) || ''), weight: w, pct: 0 };
        });
        list.forEach(function (it) { it.pct = total > 0 ? Math.round(it.weight / total * 1000) / 10 : 0; });
        var text = String(itemData.text || '随机项');
        var cur = null;
        for (var i = 0; i < list.length; i += 1) {
          if (list[i].text === text) { cur = list[i]; break; }
        }
        var weight = cur ? cur.weight : clampW(itemData.weight);
        var tot = total || clampW(itemData.total);
        var pct = cur ? cur.pct
          : (isFinite(itemData.pct) ? Number(itemData.pct) : (tot > 0 ? Math.round(weight / tot * 1000) / 10 : 0));
        return {
          type: 'rpitem',
          name: text,
          _rpItem: true,
          _rpPoolName: String(itemData.pool || ''),
          _rpWeight: weight,
          _rpTotal: tot,
          _rpPct: pct,
          _rpList: list
        };
      }

      /** 描述文本高亮（金黄）：关键词/灵咒 + 特殊标记「内容」（保留符号）、[[内容]] 与 [内容]（隐藏方括号），长词优先 */
      function _highlightKeywords(html) {
        if (!html) return html;
        if (typeof CardDB === 'undefined' || !CardDB.getAllKeywords) return html;
        const EXCLUDE = ['不消耗鬼火', '气绝时可用', '免疫'];   // 这些关键词不做颜色替换
        const uniq = [];
        const seen = {};
        const addKw = function (n) {
          if (n && !seen[n] && EXCLUDE.indexOf(n) === -1) { seen[n] = 1; uniq.push(n); }
        };
        CardDB.getAllKeywords().forEach(function (k) { addKw(k && k.name); });
        // 灵咒名同样高亮（官方灵咒 + 玩家 DIY 灵咒，对局中随玩家库加载后即可匹配）
        if (CardDB.getAllCurses) CardDB.getAllCurses().forEach(function (c) { addKw(c && c.name); });
        uniq.sort(function (a, b) { return b.length - a.length; });   // 长词优先，避免被短词截断
        // 匹配优先级：[[内容]]（隐藏符号） > [内容]（与 [[内容]] 等效） > 「内容」（保留符号） > 关键词/灵咒
        const parts = ['\\[\\[[^\\]]+?\\]\\]', '\\[[^\\[\\]]+?\\]', '「[^」]+?」'];
        if (uniq.length) {
          parts.push(uniq.map(function (n) {
            return escapeHTML(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          }).join('|'));
        }
        const re = new RegExp('(' + parts.join('|') + ')', 'g');
        return html.replace(re, function (m) {
          if (m.slice(0, 2) === '[[' && m.slice(-2) === ']]') {
            return '<span class="kw-hl">' + m.slice(2, -2) + '</span>';   // 高亮内容并隐藏 [[]]
          }
          if (m.charAt(0) === '[' && m.charAt(m.length - 1) === ']') {
            return '<span class="kw-hl">' + m.slice(1, -1) + '</span>';   // [内容] 与 [[内容]] 等效：高亮内容并隐藏 []
          }
          if (m.charAt(0) === '「' && m.charAt(m.length - 1) === '」') {
            return '「<span class="kw-hl">' + m.slice(1, -1) + '</span>」';   // 高亮内容、保留「」
          }
          return '<span class="kw-hl">' + m + '</span>';
        });
      }

      /** 收集描述中命中的灵咒 / 关键词（解释小窗用）：长词优先、去重叠，按描述中出现顺序返回 */
      function _collectDescTerms(descText) {
        if (!descText) return [];
        if (typeof CardDB === 'undefined' || !CardDB.getAllKeywords) return [];
        const EXCLUDE = ['不消耗鬼火', '气绝时可用', '免疫'];
        const pool = [];
        const seen = {};
        const addTerm = function (name, effect, kind) {
          if (!name || seen[name] || EXCLUDE.indexOf(name) !== -1) return;
          seen[name] = true;
          pool.push({ name: name, effect: effect || '', kind: kind });
        };
        // 只给“玩家自创”的灵咒/关键词弹解释小窗（官方词大家都知道，不弹）
        CardDB.getAllKeywords().forEach(function (k) { if (k && k._playerKw) addTerm(k.name, k.effect, 'keyword'); });
        if (CardDB.getAllCurses) CardDB.getAllCurses().forEach(function (c) { if (c && c._lib) addTerm(c.name, c.effect, 'curse'); });
        if (!pool.length) return [];
        pool.sort(function (a, b) { return b.name.length - a.name.length; });   // 长词优先
        const out = [];
        const used = [];
        pool.forEach(function (t) {
          const idx = descText.indexOf(t.name);
          if (idx === -1) return;
          for (let i = 0; i < used.length; i++) {
            if (idx < used[i].end && idx + t.name.length > used[i].start) return;   // 与已命中区域重叠（如「弱点·火」不再算「火」）
          }
          used.push({ start: idx, end: idx + t.name.length });
          out.push(t);
        });
        out.sort(function (a, b) { return descText.indexOf(a.name) - descText.indexOf(b.name); });
        return out;
      }

      /** 懒创建解释小窗容器（PC） */
      function _ensureTermsEl() {
        if (termsEl) return;
        termsEl = document.createElement('div');
        termsEl.id = 'card-tooltip-terms';
        termsEl.hidden = true;
        document.body.appendChild(termsEl);
      }

      /** 解释小窗跟随卡牌悬浮窗定位（右侧放不下 → 左侧） */
      function _positionTerms() {
        if (!termsEl || termsEl.hidden || !el || el.hidden) return;
        if (window.matchMedia('(max-width: 768px)').matches) return;
        const r = el.getBoundingClientRect();
        const tr = termsEl.getBoundingClientRect();
        const GAP = 3;   // 与悬浮窗之间的间隔
        let x = r.right + GAP;
        if (x + tr.width > window.innerWidth - 8) {
          x = r.left - tr.width - GAP;   // 右侧放不下 → 放到左侧
          if (x < 8) x = Math.max(8, window.innerWidth - tr.width - 8);
        }
        let y = r.top;
        if (y + tr.height > window.innerHeight - 8) y = Math.max(8, window.innerHeight - tr.height - 8);
        termsEl.style.left = x + 'px';
        termsEl.style.top = y + 'px';
      }

      /** 渲染描述中的灵咒/关键词解释：PC = 悬浮窗旁小窗；手机端 = 描述下方空一行继续写 */
      function _renderTerms() {
        if (window.matchMedia('(max-width: 768px)').matches) {
          if (!currentTerms || !currentTerms.length) return;
          const effEl = el.querySelector('.card-tooltip__effect');
          if (!effEl) return;
          let h = '<div class="card-tooltip__terms">';
          currentTerms.forEach(function (t) {
            h += '<div class="card-tooltip__term card-tooltip__term--' + t.kind + '"><b>' + escapeHTML(t.name) + '</b>' +
              (t.effect ? '：' + escapeHTML(t.effect).replace(/\n/g, '<br>') : '') + '</div>';
          });
          h += '</div>';
          effEl.insertAdjacentHTML('afterend', h);
          return;
        }
        // PC：独立小窗列（悬浮窗旁边，有几个增几个）
        _ensureTermsEl();
        if (!currentTerms || !currentTerms.length) { termsEl.hidden = true; return; }
        let h = '';
        currentTerms.forEach(function (t) {
          h += '<div class="card-tooltip-term card-tooltip-term--' + t.kind + '">' +
            (t.kind === 'curse' ? '<span class="card-tooltip-term__badge">灵咒</span>' : '') +
            '<div class="card-tooltip-term__name">' + escapeHTML(t.name) + '</div>' +
            (t.effect ? '<div class="card-tooltip-term__eff">' + escapeHTML(t.effect).replace(/\n/g, '<br>') + '</div>' : '') +
            '</div>';
        });
        termsEl.innerHTML = h;
        termsEl.hidden = false;
      }

      function _show(mx, my) {
        if (!currentCard || !el) return;
        _render(currentCard);
        el.hidden = false;
        requestAnimationFrame(() => {
          _position(mx, my);
        });
      }

      function hide() {
        clearTimeout(timer);
        currentCard = null;
        currentSlot = null;
        currentCardCurses = null;
        currentCardMarks = null;
        hoveredEl = null;
        if (el) el.hidden = true;
        if (termsEl) termsEl.hidden = true;
      }

      function _position(mx, my) {
        const rect = el.getBoundingClientRect();
        // 手机端：固定屏幕居中显示，避免跟随手指错位
        if (window.matchMedia('(max-width: 768px)').matches) {
          el.style.left = Math.max(8, (window.innerWidth - rect.width) / 2) + 'px';
          el.style.top = Math.max(8, (window.innerHeight - rect.height) / 2) + 'px';
          return;
        }
        let x = mx + 14;
        let y = my - rect.height / 2;
        if (x + rect.width > window.innerWidth - 10) x = mx - rect.width - 14;
        if (y < 10) y = 10;
        if (y + rect.height > window.innerHeight - 10) y = window.innerHeight - rect.height - 10;
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        _positionTerms();   // 解释小窗跟随悬浮窗
      }

      /** 永久/临时属性条目的「图标 + 数值」：0 不显示，正数带 +，负数原样 */
      function _statSegsHTML(am, hm) {
        const aV = (am && am.value) || 0;
        const hV = (hm && hm.value) || 0;
        const segs = [];
        if (aV !== 0) segs.push(`<span style="color:#48c0e0;"><img src="images/属性/攻击.png" class="tip-stat-icon" alt="力量">${aV > 0 ? '+' : ''}${aV}</span>`);
        if (hV !== 0) segs.push(`<span style="color:#e04848;"><img src="images/属性/生命.png" class="tip-stat-icon" alt="生命">${hV > 0 ? '+' : ''}${hV}</span>`);
        return segs.length ? segs.join('<span class="card-tooltip__stat-gap"></span>') : '<span style="color:#8a8a8a;">—</span>';
      }

      /** 灵咒区 + 加护/蚀印区（_render 与未录入牌分支共用） */
      function _renderCursesAndMarks(cardType) {
        let cursesHTML = '';
        let curses = null;
        if (currentSlot && (cardType === 'shikigami' || cardType === 'summon' || cardType === 'transform')) {
          curses = getSlotCurses(currentSlot);
        }
        if (!curses || !curses.length) {
          curses = currentCardCurses;
        }
        if (curses && curses.length) {
          cursesHTML = '<div class="card-tooltip__curses">';
          curses.forEach(c => {
            const dbCurse = CardDB.lookupExact ? CardDB.lookupExact(c.name) : CardDB.lookup(c.name);
            const eff = dbCurse ? (dbCurse.effect || '') : '';
            cursesHTML += '<div class="card-tooltip__curse-item">';
            cursesHTML += '<div class="card-tooltip__curse-head">⛓️ <span class="curse-name">' + escapeHTML(c.name) + '</span> <span class="curse-layers">×' + c.layers + '</span></div>';
            if (eff) cursesHTML += '<div class="card-tooltip__curse-eff">' + _highlightKeywords(escapeHTML(eff)) + '</div>';
            cursesHTML += '</div>';
          });
          cursesHTML += '</div>';
        }
        let cursesEl = el.querySelector('.card-tooltip__curses');
        if (cursesHTML) {
          if (!cursesEl) {
            cursesEl = document.createElement('div');
            el.appendChild(cursesEl);
          }
          cursesEl.outerHTML = cursesHTML;
        } else if (cursesEl) {
          cursesEl.remove();
        }

        let marksHTML = '';
        if (currentCardMarks && currentCardMarks.length) {
          const MK = { bless: { icon: '🛡️', label: '加护' }, seal: { icon: '🗡️', label: '蚀印' } };
          marksHTML = '<div class="card-tooltip__marks">';
          ['bless', 'seal'].forEach(function (kind) {
            const list = currentCardMarks.filter(function (m) { return m && m.kind === kind; });
            if (!list.length) return;
            const info = MK[kind];
            const total = list.reduce(function (s, g) { return s + (g.count || 1); }, 0);
            marksHTML += '<div class="card-tooltip__mark-group card-tooltip__mark-group--' + kind + '">';
            marksHTML += '<div class="card-tooltip__mark-head">' + info.icon + ' ' + info.label + ' <span class="card-tooltip__mark-count">×' + total + '</span></div>';
            list.forEach(function (m) {
              const withIcons = (typeof BlessSeal !== 'undefined' && BlessSeal.fxHTML) ? BlessSeal.fxHTML(m.text || '') : escapeHTML(m.text || '');
              const times = (m.count > 1) ? ' <span class="card-tooltip__mark-count">×' + m.count + '</span>' : '';
              marksHTML += '<div class="card-tooltip__mark-eff">· ' + withIcons + times + '</div>';
            });
            marksHTML += '</div>';
          });
          marksHTML += '</div>';
        }
        let marksEl = el.querySelector('.card-tooltip__marks');
        if (marksHTML) {
          if (!marksEl) {
            marksEl = document.createElement('div');
            el.appendChild(marksEl);
          }
          marksEl.outerHTML = marksHTML;
        } else if (marksEl) {
          marksEl.remove();
        }
      }

      function _render(card) {
        // 解释小窗：每次渲染先全部清理（食物/切卡/无命中等路径都不会残留）
        currentTerms = [];
        if (termsEl) termsEl.hidden = true;
        const oldTermsInline = el.querySelector('.card-tooltip__terms');
        if (oldTermsInline) oldTermsInline.remove();
        const typeNames = { shikigami: '式神', summon: '召唤物', spell: '法术', battle: '战斗', form: '形态', realm: '幻境', curse: '灵咒', keyword: '关键词', bond: '协战', transform: '变身' };
        // 食材/佳肴特殊处理
        if (card._food) {
          const foodTypeNames = { '山珍': '🍄 山珍', '海味': '🐟 海味', '时蔬': '🥬 时蔬', '佳肴': '🍲 佳肴' };
          el.querySelector('.card-tooltip__badge').textContent = card._foodType === '佳肴' ? '佳肴' : '食材';
          el.querySelector('.card-tooltip__badge').className = 'card-tooltip__badge card-tooltip__badge--' + (card._foodType === '佳肴' ? 'curse' : 'spell');
          el.querySelector('.card-tooltip__name').textContent = card.name;
          el.querySelector('.card-tooltip__tag').innerHTML = '';
          const statsEl = el.querySelector('.card-tooltip__stats');
          if (card._foodType === '佳肴') {
            statsEl.innerHTML = `<span class="stat stat--owner">👤 中立</span>`;
          } else {
            statsEl.innerHTML = `<span class="stat stat--owner">👤 中立</span><span class="stat">⭐ Lv.${card._foodLevel || 1}</span>`;
          }
          const effectEl = el.querySelector('.card-tooltip__effect');
          const effectText = (card.effect || '').replace(/\n/g, '<br>');
          effectEl.innerHTML = effectText;
          effectEl.style.display = effectText ? '' : 'none';
          // 食材/佳肴自身的灵咒：有才显示（只认这张牌自己的，不带别人的）
          let cursesHTML = '';
          const curses = currentCardCurses;
          if (curses && curses.length) {
            cursesHTML = '<div class="card-tooltip__curses">';
            curses.forEach(c => {
              const dbCurse = CardDB.lookupExact ? CardDB.lookupExact(c.name) : CardDB.lookup(c.name);
              const eff = dbCurse ? (dbCurse.effect || '') : '';
              cursesHTML += '<div class="card-tooltip__curse-item">';
              cursesHTML += '<div class="card-tooltip__curse-head">⛓️ <span class="curse-name">' + escapeHTML(c.name) + '</span> <span class="curse-layers">×' + c.layers + '</span></div>';
              if (eff) cursesHTML += '<div class="card-tooltip__curse-eff">' + _highlightKeywords(escapeHTML(eff)) + '</div>';
              cursesHTML += '</div>';
            });
            cursesHTML += '</div>';
          }
          let cursesEl = el.querySelector('.card-tooltip__curses');
          if (cursesHTML) {
            if (!cursesEl) {
              cursesEl = document.createElement('div');
              el.appendChild(cursesEl);
            }
            cursesEl.outerHTML = cursesHTML;
          } else if (cursesEl) {
            cursesEl.remove();
          }
          // 效果记录（关键词）与属性总结不属于食材/佳肴：清掉上张卡残留
          const permElF = el.querySelector('.card-tooltip__perm');
          if (permElF) permElF.remove();
          const summaryElF = el.querySelector('.card-tooltip__summary');
          if (summaryElF) summaryElF.remove();
          const marksElF = el.querySelector('.card-tooltip__marks');
          if (marksElF) marksElF.remove();
          return;
        }

        // 随机项（骰到的结果）：显示它属于哪个池、权重、概率，并列出整池（当前项高亮）
        if (card._rpItem) {
          const ib = el.querySelector('.card-tooltip__badge');
          ib.textContent = '随机项';
          ib.className = 'card-tooltip__badge card-tooltip__badge--rpitem';
          el.querySelector('.card-tooltip__name').textContent = card.name;
          el.querySelector('.card-tooltip__tag').innerHTML = '';
          el.querySelector('.card-tooltip__stats').innerHTML =
            '<span class="stat">权重 ' + card._rpWeight + ' / ' + card._rpTotal + '</span>' +
            '<span class="stat">概率 ' + card._rpPct + '%</span>';
          const ieff = el.querySelector('.card-tooltip__effect');
          let ihtml = '';
          if (card._rpPoolName) {
            ihtml += '<div class="card-tooltip__rp-from">来自随机池「<b>' + escapeHTML(card._rpPoolName) + '</b>」</div>';
          }
          ieff.innerHTML = ihtml;
          ieff.style.display = '';
          ['.card-tooltip__perm', '.card-tooltip__summary', '.card-tooltip__incarn', '.card-tooltip__curses', '.card-tooltip__marks', '.card-tooltip__terms'].forEach(function (sel) {
            const n = el.querySelector(sel);
            if (n) n.remove();
          });
          _renderTerms();
          return;
        }

        // 随机池：展示池内的随机项 + 权重 + 概率（不当卡牌）
        if (card._pool) {
          const badgeEl = el.querySelector('.card-tooltip__badge');
          badgeEl.textContent = '随机池';
          badgeEl.className = 'card-tooltip__badge card-tooltip__badge--pool';
          el.querySelector('.card-tooltip__name').textContent = card.name;
          el.querySelector('.card-tooltip__tag').innerHTML = '';
          const items = card._poolItems || [];
          el.querySelector('.card-tooltip__stats').innerHTML =
            `<span class="stat">${items.length} 条随机项</span><span class="stat">合计权重 ${card._poolTotal}</span>`;
          const effEl = el.querySelector('.card-tooltip__effect');
          effEl.innerHTML = items.map(function (it) {
            return '<div class="card-tooltip__pool-item">' +
              '<span class="card-tooltip__pool-text">' + escapeHTML(it.text) + '</span>' +
              '<span class="card-tooltip__pool-num">权重 ' + it.weight + ' · ' + it.pct + '%</span>' +
              '</div>';
          }).join('') || '<div class="card-tooltip__pool-item">（这个池子还没有随机项）</div>';
          effEl.style.display = '';
          ['.card-tooltip__perm', '.card-tooltip__summary', '.card-tooltip__incarn', '.card-tooltip__curses', '.card-tooltip__marks', '.card-tooltip__terms'].forEach(function (sel) {
            const n = el.querySelector(sel);
            if (n) n.remove();
          });
          _renderTerms();
          return;
        }

        // 未录入卡牌：只知道牌名，其它字段留空（灵咒/加护蚀印有就照常显示）
        if (card._unknownCard) {
          const ub = el.querySelector('.card-tooltip__badge');
          ub.textContent = '未录入';
          ub.className = 'card-tooltip__badge';
          el.querySelector('.card-tooltip__name').textContent = card.name;
          el.querySelector('.card-tooltip__tag').innerHTML = '';
          el.querySelector('.card-tooltip__stats').innerHTML = '';
          const unkEff = el.querySelector('.card-tooltip__effect');
          unkEff.innerHTML = '这张牌还没有录入卡库，只能显示牌名。';
          unkEff.style.display = '';
          ['.card-tooltip__perm', '.card-tooltip__summary', '.card-tooltip__incarn'].forEach(function (sel) {
            const old = el.querySelector(sel);
            if (old) old.remove();
          });
          _renderCursesAndMarks('');
          _renderTerms();
          return;
        }

        const typeCN = typeNames[card.type] || card.type;

        // 类型徽章
        const badge = el.querySelector('.card-tooltip__badge');
        badge.textContent = typeCN;
        badge.className = 'card-tooltip__badge card-tooltip__badge--' + card.type;

        // 卡牌名称
        el.querySelector('.card-tooltip__name').textContent = card.name;

        // 标签：觉醒 / 衍生
        const tagEl = el.querySelector('.card-tooltip__tag');
        let tags = [];
        if (card.awakened) tags.push('<span class="card-tooltip__tag card-tooltip__tag--awakened">觉醒</span>');
        if (card.derivative) tags.push('<span class="card-tooltip__tag card-tooltip__tag--derivative">衍生</span>');
        tagEl.innerHTML = tags.join(' ');

        // 属性区
        const statsEl = el.querySelector('.card-tooltip__stats');
        let statsHTML = '';
        // 所属式神（非式神卡牌）
        if (card.owner) statsHTML += `<span class="stat stat--owner">👤 ${card.owner}</span>`;
        switch (card.type) {
          case 'shikigami':
          case 'summon':
          case 'transform': {
            if (card.faction) {
              if (card.faction === '无相') {
                statsHTML += `<span class="stat stat--faction">🌐 无相</span>`;
              } else {
                statsHTML += `<span class="stat stat--faction"><img src="images/派系/${card.faction}.png" style="width:20px;height:20px;vertical-align:middle;image-rendering:auto;" alt="${card.faction}"> ${card.faction}</span>`;
              }
            }
            if (currentSlot) {
              // 卡槽：第二排显示“基础属性”（玩家设的基础 > 记录的基础 > 数据库原值；不含形态，形态在下方单独展示）
              let baseA = (currentSlot._baseAtk !== undefined && currentSlot._baseAtk !== null) ? currentSlot._baseAtk
                : (currentSlot._permBaseAtk !== undefined ? currentSlot._permBaseAtk : 0);
              let baseH = (currentSlot._baseHp !== undefined && currentSlot._baseHp !== null) ? currentSlot._baseHp
                : (currentSlot._permBaseHp !== undefined ? currentSlot._permBaseHp : 0);
              const missA = (currentSlot._baseAtk === undefined || currentSlot._baseAtk === null) && currentSlot._permBaseAtk === undefined;
              const missH = (currentSlot._baseHp === undefined || currentSlot._baseHp === null) && currentSlot._permBaseHp === undefined;
              if (missA && typeof card.attack === 'number') baseA = card.attack;
              if (missH && typeof card.hp === 'number') baseH = card.hp;
              const showA = (card._slotInfo && missA && typeof card.attack !== 'number') ? '无' : baseA;
              const showH = (card._slotInfo && missH && typeof card.hp !== 'number') ? '无' : baseH;
              statsHTML += `<span class="stat stat--atk"><img src="images/属性/攻击.png" class="tip-stat-icon" alt="攻"> ${showA}</span>`;
              statsHTML += `<span class="stat stat--hp"><img src="images/属性/生命.png" class="tip-stat-icon" alt="命"> ${showH}</span>`;
              // 受伤/手动差值（当前显示值 − 计算满值），只有非 0 才显示
              const aInput = currentSlot.querySelector('.card-attack');
              const hInput = currentSlot.querySelector('.card-hp');
              const curA = aInput ? (parseInt(aInput.value, 10) || 0) : 0;
              const curH = hInput ? (parseInt(hInput.value, 10) || 0) : 0;
              const fullA = (typeof calcFullAtk === 'function') ? calcFullAtk(currentSlot) : curA;
              const fullH = (typeof calcFullHp === 'function') ? calcFullHp(currentSlot) : curH;
              const dA = curA - fullA;
              const dH = curH - fullH;
              if (dA !== 0 || dH !== 0) {
                const parts = [];
                if (dA !== 0) parts.push(`<img src="images/属性/攻击.png" class="tip-stat-icon" alt="攻">${dA > 0 ? '+' : ''}${dA}`);
                if (dH !== 0) parts.push(`<img src="images/属性/生命.png" class="tip-stat-icon" alt="命">${dH > 0 ? '+' : ''}${dH}`);
                statsHTML += `<span class="stat stat--dmg" style="flex-basis:100%;">变动：${parts.join(' ')}</span>`;
              }
            } else {
              // 手牌/牌库等非卡槽场景：数据库原值
              statsHTML += `<span class="stat stat--atk"><img src="images/属性/攻击.png" class="tip-stat-icon" alt="攻"> ${card.attack}</span>`;
              statsHTML += `<span class="stat stat--hp"><img src="images/属性/生命.png" class="tip-stat-icon" alt="命"> ${card.hp}</span>`;
            }
            break;
          }
          case 'spell':
            statsHTML += `<span class="stat">⭐ Lv.${card.level}</span>`;
            if (card.atkBonus > 0) statsHTML += `<span class="stat stat--atk"><img src="images/属性/攻击.png" class="tip-stat-icon" alt="攻"> +${card.atkBonus}</span>`;
            if (card.hpBonus > 0) statsHTML += `<span class="stat stat--hp"><img src="images/属性/生命.png" class="tip-stat-icon" alt="命"> +${card.hpBonus}</span>`;
            break;
          case 'battle':
            statsHTML += `<span class="stat">⭐ Lv.${card.level}</span>`;
            if ((card.atkBonus || 0) > 0) statsHTML += `<span class="stat stat--atk"><img src="images/属性/攻击.png" class="tip-stat-icon" alt="攻"> +${card.atkBonus}</span>`;
            else if ((card.atkBonus || 0) < 0) statsHTML += `<span class="stat stat--penalty"><img src="images/属性/乏力.png" class="tip-stat-icon" alt="乏力"> ${card.atkBonus}</span>`;
            else if (card.atkPenalty > 0) statsHTML += `<span class="stat stat--penalty"><img src="images/属性/乏力.png" class="tip-stat-icon" alt="乏力"> -${card.atkPenalty}</span>`;
            if ((card.shieldBonus || 0) > 0) statsHTML += `<span class="stat stat--shield"><img src="images/属性/护甲.png" class="tip-stat-icon" alt="护甲"> +${card.shieldBonus}</span>`;
            else if ((card.shieldBonus || 0) < 0) statsHTML += `<span class="stat stat--penalty"><img src="images/属性/破甲.png" class="tip-stat-icon" alt="破甲"> ${card.shieldBonus}</span>`;
            else if (card.shieldPenalty > 0) statsHTML += `<span class="stat stat--penalty"><img src="images/属性/破甲.png" class="tip-stat-icon" alt="破甲"> -${card.shieldPenalty}</span>`;
            break;
          case 'form':
            statsHTML += `<span class="stat">⭐ Lv.${card.level}</span>`;
            statsHTML += `<span class="stat stat--atk"><img src="images/属性/攻击.png" class="tip-stat-icon" alt="攻"> ${card.attack}</span>`;
            statsHTML += `<span class="stat stat--hp"><img src="images/属性/生命.png" class="tip-stat-icon" alt="命"> ${card.hp}</span>`;
            break;
          case 'realm':
            statsHTML += `<span class="stat">⭐ Lv.${card.level}</span>`;
            statsHTML += `<span class="stat stat--durability">🔮 耐久:${card.durability}</span>`;
            break;
          case 'curse':
            statsHTML += `<span class="stat">📎 结附效果</span>`;
            break;
          case 'bond':
            statsHTML += `<span class="stat">⭐ Lv.${card.level}</span>`;
            if ((card.atkBonus || 0) > 0) statsHTML += `<span class="stat stat--atk"><img src="images/属性/攻击.png" class="tip-stat-icon" alt="攻"> +${card.atkBonus}</span>`;
            else if ((card.atkBonus || 0) < 0) statsHTML += `<span class="stat stat--penalty"><img src="images/属性/乏力.png" class="tip-stat-icon" alt="乏力"> ${card.atkBonus}</span>`;
            else if (card.atkPenalty > 0) statsHTML += `<span class="stat stat--penalty"><img src="images/属性/乏力.png" class="tip-stat-icon" alt="乏力"> -${card.atkPenalty}</span>`;
            if ((card.shieldBonus || 0) > 0) statsHTML += `<span class="stat stat--shield"><img src="images/属性/护甲.png" class="tip-stat-icon" alt="护甲"> +${card.shieldBonus}</span>`;
            else if ((card.shieldBonus || 0) < 0) statsHTML += `<span class="stat stat--penalty"><img src="images/属性/破甲.png" class="tip-stat-icon" alt="破甲"> ${card.shieldBonus}</span>`;
            else if (card.shieldPenalty > 0) statsHTML += `<span class="stat stat--penalty"><img src="images/属性/破甲.png" class="tip-stat-icon" alt="破甲"> -${card.shieldPenalty}</span>`;
            break;
        }
        statsEl.innerHTML = statsHTML;

        // 效果/能力描述
        const effectEl = el.querySelector('.card-tooltip__effect');
        let effectText = '';
        let awakenedLabel = '';
        // 觉醒状态且有觉醒能力 → 显示“觉醒：xxxx”（觉醒金色粗体）；否则显示基础能力/数据库能力
        if (currentSlot) {
          if (currentSlot.classList.contains('awakened') && currentSlot._permAbility) {
            effectText = currentSlot._permAbility;
            awakenedLabel = '<span style="color:#e8b83a;font-weight:700;">觉醒：</span>';
          } else if (currentSlot._baseAbility !== undefined && currentSlot._baseAbility !== null && currentSlot._baseAbility !== '') {
            effectText = currentSlot._baseAbility;
          } else {
            effectText = card.ability || card.effect || '';
          }
        } else {
          effectText = card.effect || card.ability || '';
        }
        // 数据库没有的式神：能力未填写则显示“无”
        if (card._slotInfo && !effectText) effectText = '无';
        const safeText = _highlightKeywords(escapeHTML(effectText).replace(/\n/g, '<br>'));
        effectEl.innerHTML = awakenedLabel + safeText;
        effectEl.style.display = effectText ? '' : 'none';
        currentTerms = _collectDescTerms(effectText);   // 描述中命中的灵咒/关键词（解释小窗数据）

        // 形态、永久属性、临时属性、效果记录
        let extraHTML = '';
        if (currentSlot) {
          const parts = [];
          // 1. 形态
          if (currentSlot._formName) {
            parts.push(`<div class="card-tooltip__perm-head">🎴 形态：${escapeHTML(currentSlot._formName)} <span><img src="images/属性/攻击.png" class="tip-stat-icon" alt="攻"> ${currentSlot._formAtk || 0}</span> <span><img src="images/属性/生命.png" class="tip-stat-icon" alt="命"> ${currentSlot._formHp || 0}</span></div>`);
            if (currentSlot._formAbility) parts.push(`<div class="card-tooltip__perm-item">${_highlightKeywords(escapeHTML(currentSlot._formAbility))}</div>`);
          }
          // 2. 永久属性（同来源不同数值的项目全部展示）
          const permAtk = typeof calcPermAtk === 'function' ? calcPermAtk(currentSlot) : 0;
          const permHp = typeof calcPermHp === 'function' ? calcPermHp(currentSlot) : 0;
          const mods = currentSlot._permAtkMods || [];
          const hpMods = currentSlot._permHpMods || [];
          const permCount = Math.max(mods.length, hpMods.length);
          if (permCount > 0) {
            let s = `<div class="card-tooltip__perm-head">⚔️ 永久属性</div>`;
            for (let i = 0; i < permCount; i++) {
              const am = mods[i] || null;
              const hm = hpMods[i] || null;
              const src = (am && am.source) || (hm && hm.source) || '';
              if (!src) continue;
              const layers = (am && am.layers) || (hm && hm.layers) || 1;
              const layersText = layers > 1 ? ` ×${layers}` : '';
              s += `<div class="card-tooltip__perm-item"><span>${escapeHTML(src)}${layersText}：</span>`;
              s += _statSegsHTML(am, hm);
              s += '</div>';
            }
            parts.push(s);
          }
          // 3. 临时属性（同来源不同数值的项目全部展示）
          const tempMods = currentSlot._tempAtkMods || [];
          const tempHpMods = currentSlot._tempHpMods || [];
          const tempCount = Math.max(tempMods.length, tempHpMods.length);
          if (tempCount > 0) {
            let s = '<div class="card-tooltip__perm-head">⏳ 临时属性</div>';
            for (let i = 0; i < tempCount; i++) {
              const am = tempMods[i] || null;
              const hm = tempHpMods[i] || null;
              const src = (am && am.source) || (hm && hm.source) || '';
              if (!src) continue;
              const layers = (am && am.layers) || (hm && hm.layers) || 1;
              const layersText = layers > 1 ? ` ×${layers}` : '';
              s += `<div class="card-tooltip__perm-item"><span>${escapeHTML(src)}${layersText}：</span>`;
              s += _statSegsHTML(am, hm);
              s += '</div>';
            }
            parts.push(s);
          }
          // 4. 效果记录
          const effects = currentSlot._permEffects || [];
          if (effects.length > 0) {
            let s = '<div class="card-tooltip__perm-head" style="margin-top:6px;">📋 效果记录</div>';
            effects.forEach(ef => {
              const layers = ef.layers || 1;
              const layersText = layers > 1 ? ` ×${layers}` : '';
              s += `<div class="card-tooltip__perm-item"><span>${escapeHTML(ef.source)}${layersText}：</span><span style="color:#b0a890;">${escapeHTML(ef.desc)}</span></div>`;
            });
            parts.push(s);
          }
          if (parts.length > 0) extraHTML = '<div class="card-tooltip__perm">' + parts.join('') + '</div>';
        }
        // 插入或更新永久信息区
        let permEl = el.querySelector('.card-tooltip__perm');
        if (extraHTML) {
          if (!permEl) {
            permEl = document.createElement('div');
            permEl.className = 'card-tooltip__perm';
            const effectElRef = el.querySelector('.card-tooltip__effect');
            if (effectElRef) {
              effectElRef.insertAdjacentElement('afterend', permEl);
            } else {
              el.appendChild(permEl);
            }
          }
          permEl.outerHTML = extraHTML;
        } else if (permEl) {
          permEl.remove();
        }

        // 结附灵咒 + 加护/蚀印标记（抽成公共函数，未录入牌也会用）
        _renderCursesAndMarks(card.type);

        // 化身（从战场卡牌槽读取；详情统一放在悬浮窗里，徽章本身不再自带提示）
        let incarnHTML = '';
        if (currentSlot && Array.isArray(currentSlot._incarn) && currentSlot._incarn.length) {
          const incList = currentSlot._incarn;
          const koNow = !!currentSlot.querySelector('.ko-overlay');
          incarnHTML = '<div class="card-tooltip__incarn"><div class="card-tooltip__incarn-head">🪞 化身</div>';
          incList.forEach((inc, i) => {
            const p = Math.max(0, Math.min(100, parseInt(inc.prob, 10) || 0));
            const tr = parseInt(inc.triggers, 10) || 0;
            const mx = (inc.maxTriggers === 0 || inc.maxTriggers) ? inc.maxTriggers : 1;
            // 悬浮窗里只保留「暂停」提示（其他状态提示按用户要求全部去掉）
            const notes = [];
            if (inc.paused) notes.push('暂停');
            const noMark = (typeof Incarnation !== 'undefined' && Incarnation.markOf)
              ? Incarnation.markOf(i) : ('(' + (i + 1) + ')');
            incarnHTML += '<div class="card-tooltip__incarn-item' + (inc.paused ? ' is-paused' : '') + '">'
              + '<span class="tip-incarn-no">' + noMark + '</span>'
              + '<span class="tip-incarn-name">' + escapeHTML(inc.name || '化身') + '</span>'
              + '<span class="tip-incarn-bar"><i style="width:' + p + '%"></i></span>'
              + '<span class="tip-incarn-prob">' + p + '%</span>'
              + '<span class="tip-incarn-trig">本回合 ' + tr + '/' + mx + '</span>'
              + (notes.length ? '<span class="tip-incarn-note">' + notes.join('・') + '</span>' : '')
              + '</div>';
          });
          incarnHTML += '</div>';
        }
        // 插入或更新化身区（放在灵咒之后、计算属性之前）
        let incarnEl = el.querySelector('.card-tooltip__incarn');
        if (incarnHTML) {
          if (incarnEl) {
            incarnEl.outerHTML = incarnHTML;
          } else {
            const tmp = document.createElement('div');
            tmp.innerHTML = incarnHTML;
            const node = tmp.firstElementChild;
            const cursesAnchor = el.querySelector('.card-tooltip__curses');
            const summaryAnchor = el.querySelector('.card-tooltip__summary');
            if (cursesAnchor) cursesAnchor.insertAdjacentElement('afterend', node);
            else if (summaryAnchor) summaryAnchor.insertAdjacentElement('beforebegin', node);
            else el.appendChild(node);
          }
        } else if (incarnEl) {
          incarnEl.remove();
        }

        // 当前属性总结（最底部，分割线后大字显示）—— 仅当有加成变动时显示
        let summaryHTML = '';
        if (currentSlot && (
            currentSlot._formName ||
            (currentSlot._permAtkMods && currentSlot._permAtkMods.length) ||
            (currentSlot._permHpMods && currentSlot._permHpMods.length) ||
            (currentSlot._tempAtkMods && currentSlot._tempAtkMods.length) ||
            (currentSlot._tempHpMods && currentSlot._tempHpMods.length)
        )) {
          const fullAtk = typeof calcFullAtk === 'function' ? calcFullAtk(currentSlot) : (currentSlot._atk || 0);
          const fullHp = typeof calcFullHp === 'function' ? calcFullHp(currentSlot) : (currentSlot._hp || 0);
          summaryHTML = `<div class="card-tooltip__summary">
            <div class="card-tooltip__summary-divider"></div>
            <div class="card-tooltip__summary-body">计算属性：<span><img src="images/属性/攻击.png" class="tip-stat-icon" alt="攻"> ${fullAtk}</span> <span><img src="images/属性/生命.png" class="tip-stat-icon" alt="命"> ${fullHp}</span></div>
          </div>`;
        }
        let summaryEl = el.querySelector('.card-tooltip__summary');
        if (summaryHTML) {
          if (!summaryEl) {
            summaryEl = document.createElement('div');
            el.appendChild(summaryEl);
          }
          summaryEl.outerHTML = summaryHTML;
        } else if (summaryEl) {
          summaryEl.remove();
        }

        _renderTerms();   // 解释区：PC 小窗 / 手机端内联（放最后，保证插在描述正下方）
      }

      /** 主动弹出某张牌的悬浮窗（手机端二次点击看牌用） */
      function showForName(name, marks) {
        if (!el) return;
        const nm = String(name == null ? '' : name).trim();
        if (!nm) return;
        let card = (CardDB.lookupExact ? CardDB.lookupExact(nm) : CardDB.lookup(nm));
        if (!card) card = { name: nm, type: '', _unknownCard: true, effect: '' };
        currentCard = card;
        currentSlot = null;
        currentCardCurses = null;
        currentCardMarks = (marks && marks.length) ? marks : null;
        hoveredEl = null;
        clearTimeout(timer);
        _render(card);
        el.hidden = false;
        requestAnimationFrame(() => {
          _position(window.innerWidth / 2, window.innerHeight / 2);
        });
      }

      return { init, hide, showForName };
    })();

    // ================================================================
