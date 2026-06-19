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
      let hoveredEl = null;
      const DELAY = 300;

      function init() {
        el = document.getElementById('card-tooltip');
        if (!el) { console.error('[Tooltip] ❌ 未找到 #card-tooltip DOM元素！'); return; }

        // 事件委托
        document.addEventListener('mouseover', _onMouseOver, true);
        document.addEventListener('mouseout', _onMouseOut, true);
        console.log('[Tooltip] ✅ 已初始化，监听卡牌名悬浮');
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
        if (target.classList.contains('card-list-item__name')) return target.textContent;
        if (target.classList.contains('breakdown-card-row__name')) {
          const t = target.textContent.trim();
          if (t === '未知' || !t) return null; // 未揭示不弹窗
          return t;
        }
        if (target.classList.contains('deck-group__name')) {
          // 对手牌库中的已揭示卡牌，去掉"（已占卜）"后缀
          return target.textContent.replace(/（已占卜）$/, '');
        }
        if (target.classList.contains('chat-card-name')) return target.textContent;
        if (target.classList.contains('effect-name')) return target.value;
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
        // label 包裹的 input
        if (target.classList.contains('card-badge--name')) {
          const input = target.querySelector('.card-name');
          if (input) return input.value;
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

        if (!name) { hide(); return; }
        // 食材牌/佳肴：用内嵌的食物数据
        let card;
        if (typeof name === 'object' && name._foodData) {
          card = _buildFoodCardInfo(name._foodData);
        } else {
          card = CardDB.lookup(name);
        }
        if (!card) { hide(); return; }
        currentCard = card;
        hoveredEl = target;
        // 记录卡牌槽引用（战场，悬停灵咒徽章本身时跳过）
        const isCurseEl = target.closest('.curse-badge, .card-list-curse-tag');
        currentSlot = isCurseEl ? null : (target.closest('.card-slot') || null);
        // 记录手牌/牌库卡牌数据
        const info = target.closest('.card-list-item__info');
        currentCardCurses = (!isCurseEl && info && info.dataset.cardCurses) ? JSON.parse(info.dataset.cardCurses) : null;
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
        hoveredEl = null;
        if (el) el.hidden = true;
      }

      function _position(mx, my) {
        const rect = el.getBoundingClientRect();
        let x = mx + 14;
        let y = my - rect.height / 2;
        if (x + rect.width > window.innerWidth - 10) x = mx - rect.width - 14;
        if (y < 10) y = 10;
        if (y + rect.height > window.innerHeight - 10) y = window.innerHeight - rect.height - 10;
        el.style.left = x + 'px';
        el.style.top = y + 'px';
      }

      function _render(card) {
        const typeNames = { shikigami: '式神', summon: '召唤物', spell: '法术', battle: '战斗', form: '形态', realm: '幻境', curse: '灵咒', bond: '协战' };
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
          const cursesEl = el.querySelector('.card-tooltip__curses');
          if (cursesEl) cursesEl.innerHTML = '';
          return;
        }

        const typeCN = typeNames[card.type] || card.type;

        // 类型徽章
        const badge = el.querySelector('.card-tooltip__badge');
        badge.textContent = typeCN;
        badge.className = 'card-tooltip__badge card-tooltip__badge--' + card.type;

        // 卡牌名称
        el.querySelector('.card-tooltip__name').textContent = card.name;

        // 标签：觉醒 / 衍生物
        const tagEl = el.querySelector('.card-tooltip__tag');
        let tags = [];
        if (card.awakened) tags.push('<span class="card-tooltip__tag card-tooltip__tag--awakened">觉醒</span>');
        if (card.derivative) tags.push('<span class="card-tooltip__tag card-tooltip__tag--derivative">衍生物</span>');
        tagEl.innerHTML = tags.join(' ');

        // 属性区
        const statsEl = el.querySelector('.card-tooltip__stats');
        let statsHTML = '';
        // 所属式神（非式神卡牌）
        if (card.owner) statsHTML += `<span class="stat stat--owner">👤 ${card.owner}</span>`;
        switch (card.type) {
          case 'shikigami':
          case 'summon':
            if (card.faction) statsHTML += `<span class="stat stat--faction"><img src="images/派系/${card.faction}.png" style="width:20px;height:20px;vertical-align:middle;image-rendering:auto;" alt="${card.faction}"> ${card.faction}</span>`;
            statsHTML += `<span class="stat stat--atk"><img src="images/属性/攻击.png" class="tip-stat-icon" alt="攻"> ${card.attack}</span>`;
            statsHTML += `<span class="stat stat--hp"><img src="images/属性/生命.png" class="tip-stat-icon" alt="命"> ${card.hp}</span>`;
            break;
          case 'spell':
            statsHTML += `<span class="stat">⭐ Lv.${card.level}</span>`;
            if (card.atkBonus > 0) statsHTML += `<span class="stat stat--atk"><img src="images/属性/攻击.png" class="tip-stat-icon" alt="攻"> +${card.atkBonus}</span>`;
            if (card.hpBonus > 0) statsHTML += `<span class="stat stat--hp"><img src="images/属性/生命.png" class="tip-stat-icon" alt="命"> +${card.hpBonus}</span>`;
            break;
          case 'battle':
            statsHTML += `<span class="stat">⭐ Lv.${card.level}</span>`;
            if (card.atkBonus > 0) statsHTML += `<span class="stat stat--atk"><img src="images/属性/攻击.png" class="tip-stat-icon" alt="攻"> +${card.atkBonus}</span>`;
            if (card.atkPenalty > 0) statsHTML += `<span class="stat stat--penalty"><img src="images/属性/攻击.png" class="tip-stat-icon" alt="攻"> -${card.atkPenalty}</span>`;
            if (card.shieldBonus > 0) statsHTML += `<span class="stat stat--shield">🛡 +${card.shieldBonus}护盾</span>`;
            if (card.shieldPenalty > 0) statsHTML += `<span class="stat stat--penalty">🛡 -${card.shieldPenalty}护盾</span>`;
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
            if (card.atkBonus > 0) statsHTML += `<span class="stat stat--atk"><img src="images/属性/攻击.png" class="tip-stat-icon" alt="攻"> +${card.atkBonus}</span>`;
            if (card.atkPenalty > 0) statsHTML += `<span class="stat stat--penalty"><img src="images/属性/攻击.png" class="tip-stat-icon" alt="攻"> -${card.atkPenalty}</span>`;
            if (card.shieldBonus > 0) statsHTML += `<span class="stat stat--shield">🛡 +${card.shieldBonus}护盾</span>`;
            if (card.shieldPenalty > 0) statsHTML += `<span class="stat stat--penalty">🛡 -${card.shieldPenalty}护盾</span>`;
            break;
        }
        statsEl.innerHTML = statsHTML;

        // 效果/能力描述
        const effectEl = el.querySelector('.card-tooltip__effect');
        let effectText = '';
        // 觉醒替换能力优先
        if (currentSlot && currentSlot._permAbility) {
          effectText = currentSlot._permAbility;
        } else {
          effectText = card.effect || card.ability || '';
        }
        const safeText = escapeHTML(effectText).replace(/\n/g, '<br>');
        effectEl.innerHTML = safeText;
        effectEl.style.display = effectText ? '' : 'none';

        // 形态、永久属性、临时属性、效果记录
        let extraHTML = '';
        if (currentSlot) {
          const parts = [];
          // 1. 形态
          if (currentSlot._formName) {
            parts.push(`<div class="card-tooltip__perm-head">🎴 形态：${escapeHTML(currentSlot._formName)} <span><img src="images/属性/攻击.png" class="tip-stat-icon" alt="攻"> ${currentSlot._formAtk || 0}</span> <span><img src="images/属性/生命.png" class="tip-stat-icon" alt="命"> ${currentSlot._formHp || 0}</span></div>`);
            if (currentSlot._formAbility) parts.push(`<div class="card-tooltip__perm-item">${escapeHTML(currentSlot._formAbility)}</div>`);
          }
          // 2. 永久属性
          const permAtk = typeof calcPermAtk === 'function' ? calcPermAtk(currentSlot) : 0;
          const permHp = typeof calcPermHp === 'function' ? calcPermHp(currentSlot) : 0;
          const mods = currentSlot._permAtkMods || [];
          const hpMods = currentSlot._permHpMods || [];
          const allPermSources = new Set();
          mods.forEach(m => { if (m.source) allPermSources.add(m.source); });
          hpMods.forEach(m => { if (m.source) allPermSources.add(m.source); });
          if (allPermSources.size > 0) {
            let s = `<div class="card-tooltip__perm-head">⚔️ 永久属性</div>`;
            allPermSources.forEach(src => {
              const am = mods.find(m => m.source === src);
              const hm = hpMods.find(m => m.source === src);
              const layers = (am && am.layers) || (hm && hm.layers) || 1;
              const layersText = layers > 1 ? ` ×${layers}` : '';
              s += `<div class="card-tooltip__perm-item"><span>${escapeHTML(src)}${layersText}：</span>`;
              if (am) s += `<span style="color:#48c0e0;">攻击${(am.value || 0) >= 0 ? '+' : ''}${am.value || 0}</span>`;
              if (am && hm) s += '、';
              if (hm) s += `<span style="color:#e04848;">生命${(hm.value || 0) >= 0 ? '+' : ''}${hm.value || 0}</span>`;
              s += '</div>';
            });
            parts.push(s);
          }
          // 3. 临时属性
          const tempMods = currentSlot._tempAtkMods || [];
          const tempHpMods = currentSlot._tempHpMods || [];
          const allTempSources = new Set();
          tempMods.forEach(m => { if (m.source) allTempSources.add(m.source); });
          tempHpMods.forEach(m => { if (m.source) allTempSources.add(m.source); });
          if (allTempSources.size > 0) {
            let s = '<div class="card-tooltip__perm-head">⏳ 临时属性</div>';
            allTempSources.forEach(src => {
              const am = tempMods.find(m => m.source === src);
              const hm = tempHpMods.find(m => m.source === src);
              const layers = (am && am.layers) || (hm && hm.layers) || 1;
              const layersText = layers > 1 ? ` ×${layers}` : '';
              s += `<div class="card-tooltip__perm-item"><span>${escapeHTML(src)}${layersText}：</span>`;
              if (am) s += `<span style="color:#48c0e0;">攻击${(am.value || 0) >= 0 ? '+' : ''}${am.value || 0}</span>`;
              if (am && hm) s += '、';
              if (hm) s += `<span style="color:#e04848;">生命${(hm.value || 0) >= 0 ? '+' : ''}${hm.value || 0}</span>`;
              s += '</div>';
            });
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

        // 结附灵咒（从战场卡牌槽或手牌/牌库数据读取）
        let cursesHTML = '';
        let curses = null;
        if (currentSlot && (card.type === 'shikigami' || card.type === 'summon')) {
          curses = getSlotCurses(currentSlot);
        }
        if (!curses || !curses.length) {
          curses = currentCardCurses;
        }
        if (curses && curses.length) {
          cursesHTML = '<div class="card-tooltip__curses">';
          curses.forEach(c => {
            const dbCurse = CardDB.lookup(c.name);
            const eff = dbCurse ? (dbCurse.effect || '') : '';
            cursesHTML += '<div class="card-tooltip__curse-item">';
            cursesHTML += '<div class="card-tooltip__curse-head">⛓️ <span class="curse-name">' + escapeHTML(c.name) + '</span> <span class="curse-layers">×' + c.layers + '</span></div>';
            if (eff) cursesHTML += '<div class="card-tooltip__curse-eff">' + escapeHTML(eff) + '</div>';
            cursesHTML += '</div>';
          });
          cursesHTML += '</div>';
        }
        // 插入或更新灵咒区
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
            <div class="card-tooltip__summary-body">当前属性：<span><img src="images/属性/攻击.png" class="tip-stat-icon" alt="攻"> ${fullAtk}</span> <span><img src="images/属性/生命.png" class="tip-stat-icon" alt="命"> ${fullHp}</span></div>
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
      }

      return { init, hide };
    })();

    // ================================================================
