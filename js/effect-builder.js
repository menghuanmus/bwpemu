// ================================================================
//  js/effect-builder.js — 卡牌编辑器（含效果模块可视化拼装）
//  编辑卡牌所有属性 + 效果管线，保存后即时生效。
//
//  依赖: EFFECT_MODULES (effect-modules.js), CardDB, EffectEngine
// ================================================================

    // ================================================================
    //  CardEditor — 卡牌编辑器
    // ================================================================
    const EffectBuilder = (() => {
      // 卡牌基本属性
      let _cardName = '';
      let _cardType = 'shikigami';
      let _cardOwner = '';
      let _cardFaction = '苍叶';
      let _cardAttack = 0;
      let _cardHp = 0;
      let _cardLevel = 1;
      let _cardAwakened = false;
      let _cardAtkBonus = 0;
      let _cardShieldBonus = 0;
      let _cardDurability = 1;
      let _cardDerivative = false;
      let _cardAbility = '';  // 式神能力文字描述

      // 效果管线
      let _pipelines = [];
      let _combinator = 'parallel';
      let _selectedPipelineIdx = -1;

      // 当前正在拼装的管线
      let _currentTrigger = null;
      let _currentTargetSelector = 'enemy_player';
      let _currentConditions = [];
      let _currentAction = null;

      let _overlay = null;
      let _isOpen = false;

      function init() {
        _createOverlay();
        _bindEvents();
        console.log('[CardEditor] ✅ 卡牌编辑器已就绪');
      }

      function _createOverlay() {
        if (document.getElementById('effect-builder-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'effect-builder-overlay';
        overlay.className = 'effect-builder-overlay';
        overlay.hidden = true;
        overlay.innerHTML = `
          <div class="eb-dialog">
            <div class="eb-header">
              <h2>🃏 卡牌编辑器</h2>
              <div class="eb-header-row">
                <label>卡名：<input type="text" id="eb-card-name" placeholder="输入卡牌名称" list="eb-card-list" autocomplete="off" style="width:220px;"></label>
                <button type="button" id="eb-btn-check-name" class="eb-btn eb-btn--sm">确定</button>
                <span id="eb-name-hint" class="eb-name-hint"></span>
                <datalist id="eb-card-list"></datalist>
              </div>
              <button type="button" id="eb-btn-close" class="eb-btn eb-btn--close">✕</button>
            </div>

            <div class="eb-body">
              <!-- 左栏：卡牌属性 -->
              <div class="eb-col eb-col--attrs">
                <h3>📋 卡牌属性</h3>
                <div id="eb-card-fields"></div>
              </div>

              <!-- 中+右栏：效果定义 + 效果管线（框在一起） -->
              <div class="eb-effect-wrapper">
                <div class="eb-col eb-col--center">
                  <h3>⚙️ 效果定义</h3>

                  <label class="eb-section-label">⏱ 触发器</label>
                  <select id="eb-trigger-select" class="eb-select">
                    <option value="">-- 选择触发器 --</option>
                  </select>
                  <div id="eb-trigger-params" class="eb-params"></div>

                  <label class="eb-section-label">🎯 目标选择</label>
                  <select id="eb-target-select" class="eb-select">
                    <option value="">-- 选择目标 --</option>
                  </select>

                  <label class="eb-section-label">🔍 条件（可选）</label>
                  <select id="eb-condition-select" class="eb-select" style="margin-bottom:2px;">
                    <option value="">-- 无条件 --</option>
                  </select>
                  <div id="eb-condition-params" class="eb-cond-params"></div>
                  <div id="eb-conditions-list"></div>
                  <button type="button" id="eb-btn-add-condition" class="eb-btn eb-btn--sm">+ 添加条件</button>

                  <label class="eb-section-label">⚡ 动作</label>
                  <select id="eb-action-select" class="eb-select">
                    <option value="">-- 选择动作 --</option>
                  </select>
                  <div id="eb-action-params" class="eb-params"></div>
                </div>

                <div class="eb-col eb-col--right">
                  <h3>📋 效果管线</h3>
                  <select id="eb-combinator-select" class="eb-select" style="margin-bottom:6px;">
                    <option value="parallel">同时执行（多条管线互不等待）</option>
                    <option value="sequence">依次执行（前一条完成再下一条）</option>
                    <option value="if_else">条件分支（满足条件走A，否则走B）</option>
                    <option value="choice">玩家选择（手动选一个执行）</option>
                    <option value="any_trigger">任一触发（满足任一条件即执行）</option>
                  </select>
                  <div id="eb-pipelines-list" class="eb-list"></div>
                  <div class="eb-btn-row">
                    <button type="button" id="eb-btn-add-pipeline" class="eb-btn eb-btn--accent">+ 添加管线</button>
                    <button type="button" id="eb-btn-clear-all" class="eb-btn eb-btn--danger">清空</button>
                  </div>
                </div>
              </div>
            </div>

            <div class="eb-footer">
              <div class="eb-json-preview">
                <h4>📝 卡牌 JSON 预览</h4>
                <textarea id="eb-json-output" rows="6" readonly placeholder="编辑后将自动生成完整卡牌 JSON..."></textarea>
              </div>
              <div class="eb-footer-btns">
                <button type="button" id="eb-btn-copy-json" class="eb-btn">📋 复制 JSON</button>
                <button type="button" id="eb-btn-apply-card" class="eb-btn eb-btn--accent">✅ 保存卡牌</button>
                <button type="button" id="eb-btn-export-card" class="eb-btn">💾 导出 JSON</button>
              </div>
            </div>
          </div>
        `;
        document.body.appendChild(overlay);
        _overlay = overlay;
      }

      function _bindEvents() {
        document.getElementById('eb-btn-close').addEventListener('click', close);

        // 卡名输入 → 不再自动匹配
        document.getElementById('eb-card-name').addEventListener('input', function() {
          _cardName = this.value.trim();
          document.getElementById('eb-name-hint').textContent = '';
        });

        // 确定按钮 → 手动检查已有数据
        document.getElementById('eb-btn-check-name').addEventListener('click', function() {
          _cardName = document.getElementById('eb-card-name').value.trim();
          if (!_cardName) return;
          const card = (typeof CardDB !== 'undefined') ? CardDB.lookup(_cardName) : null;
          const hint = document.getElementById('eb-name-hint');
          if (card && card.name === _cardName) {
            hint.textContent = '✅ 已有数据';
            hint.style.color = '#8f8';
            _loadExistingCard(card);
          } else {
            hint.textContent = '🆕 新卡牌';
            hint.style.color = '#ff8';
          }
        });

        // 触发器
        document.getElementById('eb-trigger-select').addEventListener('change', function() {
          _currentTrigger = this.value ? { on: this.value } : null;
          _renderTriggerParams();
          _updateJSON();
        });

        // 目标
        document.getElementById('eb-target-select').addEventListener('change', function() {
          _currentTargetSelector = this.value || 'enemy_player';
          _updateJSON();
        });

        // 动作
        document.getElementById('eb-action-select').addEventListener('change', function() {
          const actionType = this.value;
          if (actionType) {
            const mod = EFFECT_MODULES.actions[actionType];
            _currentAction = { type: actionType, params: {} };
            if (mod && mod.params) {
              for (const [key, def] of Object.entries(mod.params)) {
                _currentAction.params[key] = def.default !== undefined ? def.default : '';
              }
            }
          } else {
            _currentAction = null;
          }
          _renderActionParams();
          _updateJSON();
        });

        document.getElementById('eb-combinator-select').addEventListener('change', function() {
          _combinator = this.value;
          _updateJSON();
        });

        document.getElementById('eb-btn-add-condition').addEventListener('click', _addCondition);

        // 条件类型切换 → 显示内联参数输入
        document.getElementById('eb-condition-select').addEventListener('change', function() {
          _renderConditionParams();
        });
        document.getElementById('eb-btn-add-pipeline').addEventListener('click', _commitPipeline);

        document.getElementById('eb-btn-clear-all').addEventListener('click', () => {
          _pipelines = [];
          _resetCurrentPipeline();
          _renderPipelines();
          _updateJSON();
        });

        document.getElementById('eb-btn-copy-json').addEventListener('click', () => {
          const json = document.getElementById('eb-json-output').value;
          navigator.clipboard.writeText(json).then(() => {
            broadcastSystemMsg('【系统】卡牌 JSON 已复制到剪贴板。');
          }).catch(() => alert('复制失败，请手动复制。'));
        });

        document.getElementById('eb-btn-apply-card').addEventListener('click', _saveCard);
        document.getElementById('eb-btn-export-card').addEventListener('click', _exportCard);
      }

      // ================================================================
      //  卡牌属性字段（按类型动态渲染）
      // ================================================================

      function _renderCardFields() {
        const container = document.getElementById('eb-card-fields');
        const t = _cardType;
        let html = '';

        // 第一条：类型
        html += `<div class="eb-field-row"><label>类型</label><select id="eb-card-type" class="eb-select eb-field-input" data-key="cardType">`;
        const typeOpts = { shikigami:'式神', spell:'法术牌', battle:'战斗牌', form:'形态牌', bond:'协战牌', realm:'幻境牌', curse:'灵咒', summon:'召唤物' };
        for (const [val, label] of Object.entries(typeOpts)) {
          html += `<option value="${val}"${_cardType === val ? ' selected' : ''}>${label}</option>`;
        }
        html += '</select></div>';

        // 通用：归属式神
        if (['spell','battle','form','bond','curse','summon'].includes(t)) {
          html += _fieldHtml('归属式神', 'owner', 'text', _cardOwner, '如 妖刀姬');
        }
        // 派系
        if (t === 'shikigami') {
          html += _fieldHtml('派系', 'faction', 'select', _cardFaction, '', ['苍叶','红莲','青岚','紫岩']);
        }
        // 攻击 / 生命
        if (['shikigami','summon','form'].includes(t)) {
          html += _fieldHtml('攻击', 'attack', 'number', _cardAttack, '');
          html += _fieldHtml('生命', 'hp', 'number', _cardHp, '');
        }
        // 等级
        if (['spell','battle','form','bond'].includes(t)) {
          html += _fieldHtml('等级', 'level', 'number', _cardLevel, '');
        }
        // 觉醒
        if (t === 'spell') {
          html += _fieldHtml('觉醒', 'awakened', 'checkbox', _cardAwakened, '');
        }
        // 攻击加成 / 护甲加成
        if (['battle','bond'].includes(t)) {
          html += _fieldHtml('攻击加成', 'atkBonus', 'number', _cardAtkBonus, '');
          html += _fieldHtml('护甲加成', 'shieldBonus', 'number', _cardShieldBonus, '');
        }
        // 耐久（幻境）
        if (t === 'realm') {
          html += _fieldHtml('耐久', 'durability', 'number', _cardDurability, '');
        }
        // 衍生
        html += _fieldHtml('衍生牌', 'derivative', 'checkbox', _cardDerivative, '');
        // 式神/召唤物能力文字描述
        if (t === 'shikigami' || t === 'summon') {
          html += `<div class="eb-field-row eb-field-row--wide"><label>能力</label><textarea id="eb-field-ability" class="eb-field-input eb-field-textarea" data-key="ability" rows="3" placeholder="描述被动能力...">${_cardAbility}</textarea></div>`;
        }
        // 法术/战斗等效果文字描述（改用textarea支持多行）
        if (['spell','battle','form','bond','realm','curse'].includes(t)) {
          html += `<div class="eb-field-row eb-field-row--wide"><label>效果文字</label><textarea id="eb-field-effectText" class="eb-field-input eb-field-textarea" data-key="effectText" rows="3" placeholder="效果的文字描述">${_cardAbility || ''}</textarea></div>`;
        }

        container.innerHTML = html || '<p style="color:#889;font-size:12px;">此类型无需额外属性</p>';

        // 绑定字段变更事件（输入时仅更新变量，变动完成才刷新JSON，避免IME卡顿）
        container.querySelectorAll('.eb-field-input').forEach(input => {
          input.addEventListener('change', function() {
            _readCardFields();
            _updateJSON();
          });
          // 文本域/输入框仅更新变量，不重建JSON（change时统一刷新）
          if (input.tagName === 'TEXTAREA' || input.type === 'text') {
            input.addEventListener('input', function() {
              // 仅读取当前字段值，不做全局扫描和JSON重建
              const key = this.dataset.key;
              const val = this.value;
              if (key === 'ability' || key === 'effectText') _cardAbility = val;
            });
          } else {
            input.addEventListener('input', function() {
              _readCardFields();
              _updateJSON();
            });
          }
        });
      }

      function _fieldHtml(label, key, type, value, placeholder, options) {
        const id = 'eb-field-' + key;
        let inputHtml = '';
        if (type === 'select' && options) {
          inputHtml = `<select id="${id}" class="eb-select eb-field-input" data-key="${key}">`;
          for (const opt of options) {
            inputHtml += `<option value="${opt}"${value === opt ? ' selected' : ''}>${opt}</option>`;
          }
          inputHtml += '</select>';
        } else if (type === 'checkbox') {
          inputHtml = `<input type="checkbox" id="${id}" class="eb-field-input" data-key="${key}"${value ? ' checked' : ''}>`;
        } else {
          inputHtml = `<input type="${type}" id="${id}" class="eb-field-input" data-key="${key}" value="${value || ''}" placeholder="${placeholder || ''}">`;
        }
        return `<div class="eb-field-row"><label>${label}</label>${inputHtml}</div>`;
      }

      function _readCardFields() {
        const container = document.getElementById('eb-card-fields');
        const inputs = container.querySelectorAll('.eb-field-input');
        inputs.forEach(input => {
          const key = input.dataset.key;
          const isCheckbox = input.type === 'checkbox';
          const val = isCheckbox ? input.checked : input.value;
          switch (key) {
            case 'cardType': _cardType = val; _renderCardFields(); break;
            case 'owner': _cardOwner = val; break;
            case 'faction': _cardFaction = val; break;
            case 'attack': _cardAttack = parseInt(val, 10) || 0; break;
            case 'hp': _cardHp = parseInt(val, 10) || 0; break;
            case 'level': _cardLevel = parseInt(val, 10) || 1; break;
            case 'awakened': _cardAwakened = !!val; break;
            case 'atkBonus': _cardAtkBonus = parseInt(val, 10) || 0; break;
            case 'shieldBonus': _cardShieldBonus = parseInt(val, 10) || 0; break;
            case 'durability': _cardDurability = parseInt(val, 10) || 1; break;
            case 'derivative': _cardDerivative = !!val; break;
            case 'ability': _cardAbility = val; break;
            case 'effectText': _cardAbility = val; break;
          }
        });
      }

      /** 载入已有卡牌的全部数据 */
      function _loadExistingCard(card) {
        if (!card) return;
        _cardType = card.type || 'shikigami';
        _cardOwner = card.owner || '';
        _cardFaction = card.faction || '苍叶';
        _cardAttack = card.attack || 0;
        _cardHp = card.hp || 0;
        _cardLevel = card.level || 1;
        _cardAwakened = card.awakened || false;
        _cardAtkBonus = card.atkBonus || 0;
        _cardShieldBonus = card.shieldBonus || 0;
        _cardDurability = card.durability || 1;
        _cardDerivative = card.derivative || false;
        _cardAbility = card.ability || card.effect || '';

        _renderCardFields();

        // 载入效果
        if (card.effects) {
          const eff = card.effects;
          if (eff.pipelines && Array.isArray(eff.pipelines)) {
            _combinator = eff.combinator || 'parallel';
            _pipelines = [...eff.pipelines];
          } else if (eff.trigger || eff.action) {
            _combinator = 'parallel';
            _pipelines = [eff];
          } else {
            _pipelines = [];
          }
          document.getElementById('eb-combinator-select').value = _combinator;
        } else {
          _pipelines = [];
          _combinator = 'parallel';
        }
        _resetCurrentPipeline();
        _renderPipelines();
        _updateJSON();
      }
      // ================================================================
      //  下拉列表填充
      // ================================================================

      function _populateSelects() {
        // 卡牌名 datalist
        const datalist = document.getElementById('eb-card-list');
        datalist.innerHTML = '';
        if (typeof CardDB !== 'undefined' && CardDB.isReady()) {
          for (const card of CardDB.getAll()) {
            const opt = document.createElement('option');
            opt.value = card.name;
            datalist.appendChild(opt);
          }
        }

        // 触发器（中文标签）
        const trigSelect = document.getElementById('eb-trigger-select');
        trigSelect.innerHTML = '<option value="">-- 选择触发器 --</option>';
        for (const [key, def] of Object.entries(EFFECT_MODULES.triggers)) {
          const opt = document.createElement('option');
          opt.value = key;
          opt.textContent = def.label;
          opt.title = def.desc;
          trigSelect.appendChild(opt);
        }

        // 目标（中文标签）
        const tgtSelect = document.getElementById('eb-target-select');
        tgtSelect.innerHTML = '<option value="">-- 选择目标 --</option>';
        for (const [key, def] of Object.entries(EFFECT_MODULES.target_selectors)) {
          const opt = document.createElement('option');
          opt.value = key;
          opt.textContent = def.label;
          opt.title = def.desc;
          tgtSelect.appendChild(opt);
        }

        // 条件（下拉选择）
        const condSelect = document.getElementById('eb-condition-select');
        condSelect.innerHTML = '<option value="">-- 无条件 --</option>';
        for (const [key, def] of Object.entries(EFFECT_MODULES.conditions)) {
          const opt = document.createElement('option');
          opt.value = key;
          opt.textContent = def.label;
          opt.title = def.desc;
          condSelect.appendChild(opt);
        }

        // 动作（分组下拉）
        const actSelect = document.getElementById('eb-action-select');
        actSelect.innerHTML = '<option value="">-- 选择动作 --</option>';
        const categories = {
          '伤害与恢复': ['deal_damage','restore_hp','deal_damage_to_player','deal_damage_equal_to_atk'],
          '抽牌与弃牌': ['draw_card','discard','mill'],
          '区域移动': ['move_to_hand','move_to_deck','banish','return_to_hand'],
          '属性修改': ['modify_atk','modify_hp','set_atk','set_hp','swap_atk_hp'],
          '关键词': ['grant_keyword','remove_keyword'],
          '气绝与复活': ['apply_ko','revive','destroy'],
          '倒计时': ['set_countdown','modify_countdown'],
          '能量': ['set_energy','modify_energy'],
          '灵咒': ['apply_curse','remove_curse','remove_all_curses'],
          '召唤与变形': ['summon','copy_card','transform'],
          '幻境': ['create_realm','modify_realm_durability'],
          '鬼火与出击': ['modify_fire','reset_attack_chance','gain_extra_attack'],
          '检索': ['search_deck','generate_random_cards','look_at_deck','divine'],
          '控制': ['stun','force_attack','negate'],
          '骰子': ['roll_dice']
        };
        for (const [cat, actions] of Object.entries(categories)) {
          const group = document.createElement('optgroup');
          group.label = cat;
          for (const key of actions) {
            if (EFFECT_MODULES.actions[key]) {
              const opt = document.createElement('option');
              opt.value = key;
              opt.textContent = EFFECT_MODULES.actions[key].label;
              group.appendChild(opt);
            }
          }
          actSelect.appendChild(group);
        }
      }

      // ================================================================
      //  触发器/动作参数渲染（保持不变）
      // ================================================================

      function _renderTriggerParams() {
        const container = document.getElementById('eb-trigger-params');
        container.innerHTML = '';
        if (!_currentTrigger) return;
        const mod = EFFECT_MODULES.triggers[_currentTrigger.on];
        if (!mod) return;
        if (_currentTrigger.on === 'on_response') {
          const label = document.createElement('label');
          label.style.display = 'block'; label.style.fontSize = '12px'; label.style.marginTop = '4px';
          label.innerHTML = '响应何事：<select id="eb-response-to" class="eb-select" style="width:auto;">';
          container.appendChild(label);
          const sel = label.querySelector('select');
          const respondLabels = { on_attacked:'被攻击时', on_play:'使用时', on_deal_damage:'造成伤害时', on_take_damage:'受到伤害时', on_kill:'消灭式神时', on_ko:'气绝时' };
          for (const [ro, label] of Object.entries(respondLabels)) {
            const opt = document.createElement('option');
            opt.value = ro; opt.textContent = label;
            if (_currentTrigger.responds_to === ro) opt.selected = true;
            sel.appendChild(opt);
          }
          sel.addEventListener('change', function() { _currentTrigger.responds_to = this.value; _updateJSON(); });
        }
      }

      function _renderActionParams() {
        const container = document.getElementById('eb-action-params');
        container.innerHTML = '';
        if (!_currentAction) return;
        const mod = EFFECT_MODULES.actions[_currentAction.type];
        if (!mod || !mod.params) return;
        for (const [key, def] of Object.entries(mod.params)) {
          const row = document.createElement('div'); row.className = 'eb-param-row';
          const label = document.createElement('label');
          label.textContent = def.desc || key;
          label.style.display = 'block'; label.style.fontSize = '12px'; label.style.marginBottom = '2px';
          let input;
          if (def.type === 'select') {
            input = document.createElement('select'); input.className = 'eb-select eb-param-input';
            for (const opt of def.options) {
              const o = document.createElement('option'); o.value = opt; o.textContent = opt;
              if (opt === _currentAction.params[key]) o.selected = true;
              input.appendChild(o);
            }
          } else if (def.type === 'boolean') {
            input = document.createElement('input'); input.type = 'checkbox';
            input.checked = !!_currentAction.params[key];
          } else {
            input = document.createElement('input');
            input.type = def.type === 'expr' ? 'text' : 'text';
            input.className = 'eb-param-input';
            input.value = _currentAction.params[key] !== undefined ? _currentAction.params[key] : (def.default || '');
            input.placeholder = def.type === 'expr' ? '数值或表达式' : def.desc;
          }
          const paramKey = key;
          if (input.type === 'checkbox') {
            input.addEventListener('change', function() { _currentAction.params[paramKey] = this.checked; _updateJSON(); });
          } else {
            input.addEventListener('change', function() {
              let val = this.value;
              const num = parseInt(val, 10);
              if (!Number.isNaN(num) && String(num) === val) val = num;
              _currentAction.params[paramKey] = val;
              _updateJSON();
            });
          }
          row.appendChild(label); row.appendChild(input); container.appendChild(row);
        }
      }

      function _renderConditions() {
        const container = document.getElementById('eb-conditions-list');
        container.innerHTML = '';
        _currentConditions.forEach((cond, idx) => {
          const div = document.createElement('div'); div.className = 'eb-condition-item';
          const label = _formatCondition(cond);
          div.innerHTML = `<span class="eb-condition-label">${label}</span><button class="eb-btn eb-btn--xs eb-btn--danger" data-idx="${idx}">✕</button>`;
          div.querySelector('button').addEventListener('click', () => { _currentConditions.splice(idx,1); _renderConditions(); _updateJSON(); });
          container.appendChild(div);
        });
      }

      function _formatCondition(cond) {
        const mod = EFFECT_MODULES.conditions[cond.type];
        if (!mod) return cond.type;
        let text = mod.label;
        const cmpMap = { gt:'大于', lt:'小于', eq:'等于', gte:'大于等于', lte:'小于等于' };
        const sideMap = { self:'自身', ally:'友方', enemy:'敌方', any:'任意' };
        const typeMap = { any:'任意', shikigami:'式神', summon:'召唤物', spell:'法术牌', battle:'战斗牌', form:'形态牌', realm:'幻境牌', curse:'灵咒', bond:'协战牌' };
        const sourceMap = { self:'自身', owner_shikigami:'所属式神', any_friendly:'任意友方' };
        const counterMap = { killed_this_game:'本局消灭数', cards_in_hand:'手牌数', cards_in_deck:'牌库数', turn_number:'回合数' };
        const durationMap = { this_turn:'本回合', this_combat:'本次战斗', this_game:'本局游戏' };
        if (cond.type === 'has_ko' && cond.value !== undefined) text += cond.value ? '（是）' : '（否）';
        else if (cond.type === 'hp_compare') text += `（${cmpMap[cond.operator]||cond.operator} ${cond.value}）`;
        else if (cond.type === 'atk_compare') text += `（${cmpMap[cond.operator]||cond.operator} ${cond.value}）`;
        else if (cond.type === 'counter_check') text += `（${counterMap[cond.counter]||cond.counter} ${cmpMap[cond.operator]||cond.operator} ${cond.value}）`;
        else if (cond.type === 'target_filter') text += `（${sideMap[cond.side]||cond.side}·${typeMap[cond.card_type]||cond.card_type}）`;
        else if (cond.type === 'faction_is') text += `（${cond.faction}）`;
        else if (cond.type === 'source_is') text += `（${sourceMap[cond.reference]||cond.reference}）`;
        else if (cond.type === 'has_curse') text += `（${cond.curse_name}）`;
        else if (cond.type === 'duration') text += `（${durationMap[cond.scope]||cond.scope}）`;
        return text;
      }

      function _renderConditionParams() {
        const container = document.getElementById('eb-condition-params');
        container.innerHTML = '';
        const sel = document.getElementById('eb-condition-select');
        const condType = sel.value;
        if (!condType) return;
        const mod = EFFECT_MODULES.conditions[condType];
        if (!mod || !mod.params) return;
        for (const [key, def] of Object.entries(mod.params)) {
          const row = document.createElement('div'); row.className = 'eb-cond-row';
          const label = document.createElement('label'); label.textContent = (def.desc || key) + '：';
          row.appendChild(label);
          let input;
          if (def.type === 'select') {
            input = document.createElement('select');
            const opts = _condOptions(condType, key, def.options);
            for (const [val, text] of Object.entries(opts)) {
              const o = document.createElement('option'); o.value = val; o.textContent = text;
              if (val === def.default) o.selected = true;
              input.appendChild(o);
            }
          } else if (def.type === 'boolean') {
            input = document.createElement('input'); input.type = 'checkbox';
            input.checked = def.default === true;
          } else {
            input = document.createElement('input'); input.type = 'text';
            input.value = def.default || ''; input.placeholder = def.desc;
          }
          input.dataset.condKey = key;
          row.appendChild(input); container.appendChild(row);
        }
      }

      function _condOptions(condType, key, options) {
        const cmp = { gt:'大于', lt:'小于', eq:'等于', gte:'大于等于', lte:'小于等于' };
        const side = { self:'自身', ally:'友方', enemy:'敌方', any:'任意' };
        const tMap = { any:'任意', shikigami:'式神', summon:'召唤物', spell:'法术牌', battle:'战斗牌', form:'形态牌', realm:'幻境牌', curse:'灵咒', bond:'协战牌' };
        const fMap = { '苍叶':'苍叶', '红莲':'红莲', '青岚':'青岚', '紫岩':'紫岩' };
        const cMap = { killed_this_game:'本局消灭数', cards_in_hand:'手牌数', cards_in_deck:'牌库数', turn_number:'回合数' };
        const dMap = { this_turn:'本回合', this_combat:'本次战斗', this_game:'本局游戏' };
        const sMap = { self:'自身', owner_shikigami:'所属式神', any_friendly:'任意友方' };
        if (key === 'operator') return cmp;
        if (key === 'side') return side;
        if (key === 'card_type') return tMap;
        if (key === 'faction') return fMap;
        if (key === 'counter') return cMap;
        if (key === 'scope') return dMap;
        if (key === 'reference') return sMap;
        const map = {};
        for (const opt of (options || [])) map[opt] = opt;
        return map;
      }

      function _addCondition() {
        const sel = document.getElementById('eb-condition-select');
        const condType = sel.value;
        if (!condType) return;
        const mod = EFFECT_MODULES.conditions[condType];
        if (!mod) return;
        const cond = { type: condType };
        const paramContainer = document.getElementById('eb-condition-params');
        const inputs = paramContainer.querySelectorAll('input, select');
        inputs.forEach(input => {
          const key = input.dataset.condKey;
          if (!key) return;
          let val = input.type === 'checkbox' ? input.checked : input.value;
          const num = parseInt(val, 10);
          if (!Number.isNaN(num) && String(num) === val) val = num;
          cond[key] = val;
        });
        _currentConditions.push(cond);
        sel.value = '';
        paramContainer.innerHTML = '';
        _renderConditions();
        _updateJSON();
      }

      function _renderPipelines() {
        const container = document.getElementById('eb-pipelines-list');
        container.innerHTML = '';
        _pipelines.forEach((pl, idx) => {
          const div = document.createElement('div');
          div.className = 'eb-pipeline-item' + (idx === _selectedPipelineIdx ? ' eb-pipeline-item--active' : '');
          const tLabel = pl.trigger ? (EFFECT_MODULES.triggers[pl.trigger.on]?.label || pl.trigger.on) : '无触发';
          const aLabel = pl.action ? (EFFECT_MODULES.actions[pl.action.type]?.label || pl.action.type) : '无动作';
          div.innerHTML = `<span class="eb-pl-trigger">${tLabel}</span><span class="eb-pl-arrow">→</span><span class="eb-pl-action">${aLabel}</span><button class="eb-btn eb-btn--xs eb-btn--danger" data-idx="${idx}">✕</button>`;
          div.addEventListener('click', function(e) { if (e.target.tagName==='BUTTON') return; _selectedPipelineIdx=idx; _renderPipelines(); });
          div.querySelector('button').addEventListener('click', function(e) { e.stopPropagation(); _pipelines.splice(idx,1); if (_selectedPipelineIdx>=_pipelines.length) _selectedPipelineIdx=_pipelines.length-1; _renderPipelines(); _updateJSON(); });
          container.appendChild(div);
        });
      }

      function _commitPipeline() {
        if (!_currentAction) { alert('请先选择一个动作。'); return; }
        const pipeline = { trigger: _currentTrigger || undefined, target_selector: _currentTargetSelector || undefined };
        if (_currentConditions.length > 0) pipeline.condition = _currentConditions.length === 1 ? _currentConditions[0] : { combinator: 'parallel', conditions: [..._currentConditions] };
        pipeline.action = { ..._currentAction };
        _pipelines.push(pipeline);
        _resetCurrentPipeline();
        _renderPipelines();
        _updateJSON();
      }

      function _resetCurrentPipeline() {
        _currentTrigger = null; _currentTargetSelector = 'enemy_player'; _currentConditions = []; _currentAction = null;
        document.getElementById('eb-trigger-select').value = '';
        document.getElementById('eb-target-select').value = 'enemy_player';
        document.getElementById('eb-condition-select').value = '';
        document.getElementById('eb-condition-params').innerHTML = '';
        document.getElementById('eb-action-select').value = '';
        document.getElementById('eb-trigger-params').innerHTML = '';
        document.getElementById('eb-action-params').innerHTML = '';
        _renderConditions();
      }

      // ================================================================
      //  JSON 生成 & 保存
      // ================================================================

      function _buildEffectsJSON() {
        if (_pipelines.length === 0) return null;
        if (_pipelines.length === 1 && !_pipelines[0].trigger) return _pipelines[0].action;
        if (_pipelines.length === 1) return _pipelines[0];
        return { combinator: _combinator, pipelines: [..._pipelines] };
      }

      function _buildFullCardJSON() {
        _readCardFields();
        const card = { name: _cardName, type: _cardType };
        if (_cardOwner) card.owner = _cardOwner;
        if (['shikigami','summon','form'].includes(_cardType)) {
          card.attack = _cardAttack;
          card.hp = _cardHp;
        }
        if (_cardType === 'shikigami') card.faction = _cardFaction;
        if (['spell','battle','form','bond'].includes(_cardType)) card.level = _cardLevel;
        if (_cardType === 'spell') card.awakened = _cardAwakened;
        if (['battle','bond'].includes(_cardType)) {
          card.atkBonus = _cardAtkBonus;
          card.atkPenalty = 0;
          card.shieldBonus = _cardShieldBonus;
          card.shieldPenalty = 0;
        }
        if (_cardType === 'realm') card.durability = _cardDurability;
        if (_cardDerivative) card.derivative = true;
        if (_cardAbility) {
          if (_cardType === 'shikigami') card.ability = _cardAbility;
          else card.effect = _cardAbility;
        }
        const effects = _buildEffectsJSON();
        if (effects) card.effects = effects;
        return card;
      }

      function _updateJSON() {
        const output = document.getElementById('eb-json-output');
        const card = _buildFullCardJSON();
        output.value = JSON.stringify(card, null, 2);
      }

      function _saveCard() {
        if (!_cardName) { alert('请输入卡牌名称。'); return; }
        const card = _buildFullCardJSON();
        card._custom = true;

        CardDB.addCustom(card);

        // 注册到效果引擎
        if (card.effects && typeof EffectEngine !== 'undefined') {
          EffectEngine.registerCard(card.name, card.effects, {
            type: card.type, owner: card.owner || null, faction: card.faction || null,
            level: card.level || 1, awakened: card.awakened || false,
          });
        }
        broadcastSystemMsg('【系统】已保存卡牌「' + _cardName + '」');
        _populateSelects();
      }

      function _exportCard() {
        if (!_cardName) { alert('请输入卡牌名称。'); return; }
        const card = _buildFullCardJSON();
        const json = JSON.stringify(card, null, 2);
        navigator.clipboard.writeText(json).then(() => {
          broadcastSystemMsg('【系统】卡牌 JSON 已复制，可粘贴到 data/cards.js 中。');
        }).catch(() => {
          document.getElementById('eb-json-output').value = json;
          alert('复制失败，JSON 已显示在预览区。');
        });
      }

      // ================================================================
      //  公开 API
      // ================================================================

      function open(cardName) {
        if (_isOpen) return;
        _isOpen = true;
        _overlay.hidden = false;
        _populateSelects();
        _renderCardFields();

        if (cardName) {
          _cardName = cardName;
          document.getElementById('eb-card-name').value = cardName;
          _loadExistingCard(CardDB.lookup(cardName));
        } else {
          _cardName = '';
          document.getElementById('eb-card-name').value = '';
          _cardType = 'shikigami';
          _cardOwner = ''; _cardFaction = '苍叶'; _cardAttack = 0; _cardHp = 0;
          _cardLevel = 1; _cardAwakened = false; _cardAtkBonus = 0; _cardShieldBonus = 0;
          _cardDurability = 1; _cardDerivative = false;
          _pipelines = []; _combinator = 'parallel';
          _resetCurrentPipeline();
          _renderCardFields();
          _renderPipelines();
          _updateJSON();
        }

        _overlay.addEventListener('click', function(e) { if (e.target === _overlay) close(); });
      }

      function close() {
        _isOpen = false;
        _overlay.hidden = true;
      }

      return { init, open, close };
    })();

    // ---- 在 UI 合适时机初始化 ----
    // 延迟初始化，等待 CardDB 加载完毕
    function initEffectBuilderWhenReady() {
      if (typeof CardDB !== 'undefined' && CardDB.isReady()) {
        EffectBuilder.init();
        console.log('[EffectBuilder] ✅ 编辑器初始化完成');
      } else {
        setTimeout(initEffectBuilderWhenReady, 500);
      }
    }

    // 自动初始化
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(initEffectBuilderWhenReady, 1000));
    } else {
      setTimeout(initEffectBuilderWhenReady, 1000);
    }
