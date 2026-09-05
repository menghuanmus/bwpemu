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
      let _swallowNextClick = false;   // 点击悬浮窗关闭时，吞掉紧随的点击，防止穿透到下层按键
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
          const nameHit = e.target.closest ? e.target.closest('.card-list-item__name, .breakdown-card-row__name, .deck-group__name, .chat-card-name, .charge-card-name, .divine-card-item__name') : null;
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
        return !!target.closest('input, textarea, select, button, .card-form-badge, .curse-badge, .charge-indicator, .card-badge:not(.card-badge--name)');
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
        // 占卜界面中的卡牌名
        if (target.classList.contains('divine-card-item__name')) return target.textContent;
        if (target.classList.contains('chat-card-name')) {
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
        if (name && typeof name === 'object' && name._foodData) {
          card = _buildFoodCardInfo(name._foodData);
        } else {
          card = name ? (CardDB.lookupExact ? CardDB.lookupExact(name) : CardDB.lookup(name)) : null;
          // 数据库没有的式神：用卡槽当前设置（名字/基础数值/能力来自式神管理）
          if (!card && slot) {
            card = _buildSlotCardInfo(slot, typeof name === 'string' ? name : '');
          }
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
        const baseAtk = (slot._baseAtk !== undefined && slot._baseAtk !== null) ? slot._baseAtk : null;
        const baseHp = (slot._baseHp !== undefined && slot._baseHp !== null) ? slot._baseHp : null;
        return {
          type: isSummon ? 'summon' : 'shikigami',
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
              if (eff) cursesHTML += '<div class="card-tooltip__curse-eff">' + escapeHTML(eff) + '</div>';
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
          case 'summon': {
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
            if ((card.shieldBonus || 0) > 0) statsHTML += `<span class="stat stat--shield"><img src="images/属性/护甲.png" class="tip-stat-icon" alt="护盾"> +${card.shieldBonus}</span>`;
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
            if ((card.shieldBonus || 0) > 0) statsHTML += `<span class="stat stat--shield"><img src="images/属性/护甲.png" class="tip-stat-icon" alt="护盾"> +${card.shieldBonus}</span>`;
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
        const safeText = escapeHTML(effectText).replace(/\n/g, '<br>');
        effectEl.innerHTML = awakenedLabel + safeText;
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
              if (am) s += `<span style="color:#48c0e0;">攻击${(am.value || 0) >= 0 ? '+' : ''}${am.value || 0}</span>`;
              if (am && hm) s += '、';
              if (hm) s += `<span style="color:#e04848;">生命${(hm.value || 0) >= 0 ? '+' : ''}${hm.value || 0}</span>`;
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
              if (am) s += `<span style="color:#48c0e0;">攻击${(am.value || 0) >= 0 ? '+' : ''}${am.value || 0}</span>`;
              if (am && hm) s += '、';
              if (hm) s += `<span style="color:#e04848;">生命${(hm.value || 0) >= 0 ? '+' : ''}${hm.value || 0}</span>`;
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
            const dbCurse = CardDB.lookupExact ? CardDB.lookupExact(c.name) : CardDB.lookup(c.name);
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
      }

      return { init, hide };
    })();

    // ================================================================
