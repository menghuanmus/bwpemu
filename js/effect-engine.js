// ================================================================
//  js/effect-engine.js — 模块化效果引擎
//  解析卡牌的效果管线定义 → 注册触发器 → 在时机到来时执行动作。
//
//  架构：
//    EventBus (事件总线) → 连接触发器与游戏事件
//    EffectEngine (效果引擎) → 管线解析 + 表达式求值 + 调度执行
//    GameContext (游戏上下文) → 统一的状态读写接口
//
//  依赖: data/effect-modules.js (EFFECT_MODULES 全局变量)
//        game-core.js (applyDamage, setSlotState 等)
//        card-deck.js (抽牌/手牌操作)
//        dice.js (骰子)
// ================================================================

    // ================================================================
    //  EventBus — 发布/订阅事件总线
    //  连接「游戏发生了什么」→「哪些效果应该触发」
    // ================================================================
    const EventBus = (() => {
      const _listeners = new Map();  // eventName → [callback]

      /** 订阅事件 */
      function on(event, callback, priority) {
        if (!_listeners.has(event)) _listeners.set(event, []);
        const entry = { callback, priority: priority || 0 };
        const list = _listeners.get(event);
        list.push(entry);
        list.sort((a, b) => b.priority - a.priority); // 高优先级先执行
      }

      /** 取消订阅 */
      function off(event, callback) {
        if (!_listeners.has(event)) return;
        const list = _listeners.get(event);
        const idx = list.findIndex(e => e.callback === callback);
        if (idx >= 0) list.splice(idx, 1);
      }

      /** 发布事件（同步执行所有监听器） */
      function emit(event, context) {
        if (!_listeners.has(event)) return;
        const list = _listeners.get(event);
        for (const entry of list) {
          try {
            entry.callback(context);
          } catch (e) {
            console.error(`[EventBus] 处理事件 "${event}" 时出错:`, e);
          }
        }
      }

      /** 清除某事件的所有监听器 */
      function clear(event) {
        if (event) _listeners.delete(event);
        else _listeners.clear();
      }

      /** 调试：列出所有监听的事件 */
      function debug() {
        const result = {};
        for (const [k, v] of _listeners) result[k] = v.length;
        return result;
      }

      return { on, off, emit, clear, debug };
    })();

    // ================================================================
    //  GameContext — 游戏全局状态管理器
    //  提供统一的读写接口，所有效果通过它访问/修改游戏状态
    // ================================================================
    const GameContext = (() => {
      // 全局计数器
      const _counters = {
        killed_this_game: 0,        // 本局消灭数（每方独立？暂统一）
        ko_this_game: 0,            // 本局气绝次数
        cards_played_this_turn: 0,  // 本回合打出的牌数
        turn_number: 0,             // 当前回合数
        last_dice_roll: 0,          // 最近骰子结果
      };

      // 每方计数器
      const _playerCounters = {};
      function _ensurePlayer(playerId) {
        if (!_playerCounters[playerId]) {
          _playerCounters[playerId] = {
            fire: 2,              // 当前鬼火
            max_fire: 2,          // 最大鬼火（通常为2，可能被修改）
            attack_chances: 1,    // 剩余出击次数
            max_attack_chances: 1,
            cards_played: 0,      // 本回合已打牌数
          };
        }
        return _playerCounters[playerId];
      }

      // ---- 全局计数器 ----
      function getCounter(name) { return _counters[name] || 0; }
      function setCounter(name, value) { _counters[name] = value; }
      function incCounter(name, delta) {
        if (delta === undefined) delta = 1;
        _counters[name] = (_counters[name] || 0) + delta;
        return _counters[name];
      }

      // ---- 玩家计数器 ----
      function getPlayerCounter(playerId, name) {
        const pc = _playerCounters[playerId];
        return pc ? (pc[name] || 0) : 0;
      }
      function setPlayerCounter(playerId, name, value) {
        _ensurePlayer(playerId)[name] = value;
      }
      function incPlayerCounter(playerId, name, delta) {
        if (delta === undefined) delta = 1;
        const pc = _ensurePlayer(playerId);
        pc[name] = (pc[name] || 0) + delta;
        return pc[name];
      }

      // ---- 卡牌属性引用 ----
      /** 获取某个式神/卡牌槽的属性（通过 slot DOM 元素或收集所有槽状态） */
      function getShikigamiAttr(playerId, slotIndex, attr) {
        const slot = getSlotByIndex(playerId, slotIndex);
        if (!slot) return 0;
        const state = getSlotState(slot);
        if (attr === 'atk' || attr === 'attack') {
          return parseInt(state.attack, 10) || 0;
        }
        if (attr === 'hp') {
          return parseInt(state.hp, 10) || 0;
        }
        if (attr === 'countdown') {
          return parseInt(state.countdown, 10) || 0;
        }
        if (attr === 'energy') {
          return parseInt(state.energy, 10) || 0;
        }
        if (attr === 'level') {
          return parseInt(state.level, 10) || 0;
        }
        return 0;
      }

      function setShikigamiAttr(playerId, slotIndex, attr, value) {
        const slot = getSlotByIndex(playerId, slotIndex);
        if (!slot) return;
        const state = getSlotState(slot);
        if (attr === 'atk' || attr === 'attack') state.attack = String(value);
        else if (attr === 'hp') state.hp = String(value);
        else if (attr === 'countdown') state.countdown = String(value);
        else if (attr === 'energy') state.energy = String(value);
        setSlotState(slot, state);
      }

      function getPlayerHp(playerId) {
        const zone = document.querySelector(`.player-zone[data-player="${playerId}"]`);
        if (!zone) return 0;
        const hpInput = zone.querySelector('.player-hp-input');
        return hpInput ? (parseInt(hpInput.value, 10) || 0) : 0;
      }

      function setPlayerHp(playerId, value) {
        const zone = document.querySelector(`.player-zone[data-player="${playerId}"]`);
        if (!zone) return;
        const hpInput = zone.querySelector('.player-hp-input');
        if (hpInput) {
          hpInput.value = Math.max(0, value) || '';
          syncPlayerInfo(playerId);
        }
      }

      // ---- 获取玩家所有式神槽位 ----
      function getShikigamiSlots(playerId) {
        const zone = document.querySelector(`.player-zone[data-player="${playerId}"]`);
        if (!zone) return [];
        return Array.from(zone.querySelectorAll('.card-slot'));
      }

      // ---- 判断式神状态 ----
      function isShikigamiKo(slot) {
        return !!slot.querySelector('.ko-overlay');
      }
      function hasShikigamiCountdown(slot) {
        return !!slot.querySelector('.card-badge--countdown');
      }
      function hasShikigamiEnergy(slot) {
        return !!slot.querySelector('.card-badge--energy');
      }
      function getShikigamiName(slot) {
        const input = slot.querySelector('.card-name');
        return input ? input.value : '';
      }
      function getShikigamiCurses(slot) {
        return getSlotCurses(slot);
      }

      // ---- 重置本回合状态 ----
      function resetTurnState(playerId) {
        const pc = _ensurePlayer(playerId);
        pc.fire = pc.max_fire;
        pc.attack_chances = pc.max_attack_chances;
        pc.cards_played = 0;
        _counters.cards_played_this_turn = 0;
      }

      return {
        // 计数器
        getCounter, setCounter, incCounter,
        getPlayerCounter, setPlayerCounter, incPlayerCounter,
        // 式神属性
        getShikigamiAttr, setShikigamiAttr,
        // 玩家
        getPlayerHp, setPlayerHp,
        // 槽位
        getShikigamiSlots,
        // 状态判断
        isShikigamiKo, hasShikigamiCountdown, hasShikigamiEnergy,
        getShikigamiName, getShikigamiCurses,
        // 回合
        resetTurnState,
        // 原始数据
        _counters, _playerCounters,
      };
    })();

    // ================================================================
    //  ValueEvaluator — 数值表达式求值器
    //  解析 { ref, counter, add, mul, ... } 等表达式为具体数值
    // ================================================================
    const ValueEvaluator = (() => {

      /** 求值入口 */
      function evaluate(expr, context) {
        if (expr === undefined || expr === null) return 0;

        // 纯数字
        if (typeof expr === 'number') return expr;

        // 纯字符串数字
        if (typeof expr === 'string') {
          const n = parseInt(expr, 10);
          return Number.isNaN(n) ? 0 : n;
        }

        // 对象表达式
        if (typeof expr === 'object') {
          // 单个键的表达式
          const keys = Object.keys(expr);
          if (keys.length === 0) return 0;
          const op = keys[0];
          const val = expr[op];

          switch (op) {
            // ---- 引用 ----
            case 'ref':
              return _resolveRef(val, context);
            case 'counter':
              return GameContext.getCounter(val);
            case 'player_counter':
              return GameContext.getPlayerCounter(context.playerId || '1', val);
            case 'dice':
              return GameContext.getCounter('last_dice_roll');

            // ---- 运算 ----
            case 'add':
              return _evalArray(val, context).reduce((a, b) => a + b, 0);
            case 'sub':
              return _evalArray(val, context).reduce((a, b) => a - b);
            case 'mul':
              return _evalArray(val, context).reduce((a, b) => a * b, 1);
            case 'div':
              return _evalArray(val, context).reduce((a, b) => Math.floor(a / (b || 1)));
            case 'min':
              return Math.min(..._evalArray(val, context));
            case 'max':
              return Math.max(..._evalArray(val, context));

            // ---- 随机 ----
            case 'random_range': {
              const [lo, hi] = _evalArray(val, context);
              const low = Math.min(lo, hi);
              const high = Math.max(lo, hi);
              return Math.floor(Math.random() * (high - low + 1)) + low;
            }

            default:
              console.warn('[ValueEvaluator] 未知表达式类型:', op);
              return 0;
          }
        }

        return 0;
      }

      function _evalArray(arr, context) {
        if (!Array.isArray(arr)) return [evaluate(arr, context)];
        return arr.map(item => evaluate(item, context));
      }

      /** 解析 ref 引用: "owner.atk" → 实际数值 */
      function _resolveRef(refStr, context) {
        if (!refStr || !context) return 0;
        const parts = refStr.split('.');
        const subject = parts[0];
        const attr = parts[1] || 'atk';

        // 根据上下文中的主体引用解析
        if (subject === 'self' || subject === 'owner') {
          if (context.ownerPlayerId && context.ownerSlotIndex !== undefined) {
            return GameContext.getShikigamiAttr(context.ownerPlayerId, context.ownerSlotIndex, attr);
          }
        }
        if (subject === 'target') {
          if (context.targetPlayerId && context.targetSlotIndex !== undefined) {
            return GameContext.getShikigamiAttr(context.targetPlayerId, context.targetSlotIndex, attr);
          }
        }
        // 直接引用玩家属性
        if (attr === 'hp' && subject === 'player') {
          return GameContext.getPlayerHp(context.playerId || '1');
        }
        return 0;
      }

      return { evaluate };
    })();

    // ================================================================
    //  TargetResolver — 目标解析器
    //  根据 target_selector 定义，在当前游戏状态下找到实际目标
    // ================================================================
    const TargetResolver = (() => {

      /**
       * 解析目标
       * @param {string} selectorName - 目标选择器名称
       * @param {object} conditionDef - 附加条件（类型过滤等）
       * @param {object} context - 效果执行上下文
       * @returns {Array<{playerId, slotIndex, slot, type:'shikigami'|'player'}>}
       */
      function resolve(selectorName, conditionDef, context) {
        const playerId = context.playerId || '1';
        const opponentId = (playerId === '1') ? '2' : '1';
        let results = [];

        switch (selectorName) {
          case 'self':
            if (context.ownerSlot) {
              results = [_slotToTarget(context.ownerPlayerId, context.ownerSlotIndex, context.ownerSlot)];
            }
            break;

          case 'owner_shikigami':
            if (context.ownerSlot) {
              results = [_slotToTarget(context.ownerPlayerId, context.ownerSlotIndex, context.ownerSlot)];
            }
            break;

          case 'enemy_player':
            results = [{ playerId: opponentId, slotIndex: -1, slot: null, type: 'player' }];
            break;

          case 'ally_player':
            results = [{ playerId, slotIndex: -1, slot: null, type: 'player' }];
            break;

          case 'all_enemies':
            results = _getAllSlotsAsTargets(opponentId);
            break;

          case 'all_allies':
            results = _getAllSlotsAsTargets(playerId);
            break;

          case 'all_shikigami':
            results = _getAllSlotsAsTargets('1').concat(_getAllSlotsAsTargets('2'));
            break;

          case 'random_enemy':
            {
              const enemies = _getAllSlotsAsTargets(opponentId).filter(t => t.slot && !GameContext.isShikigamiKo(t.slot));
              if (enemies.length > 0) {
                results = [enemies[Math.floor(Math.random() * enemies.length)]];
              }
            }
            break;

          case 'random_ally':
            {
              const allies = _getAllSlotsAsTargets(playerId).filter(t => t.slot && !GameContext.isShikigamiKo(t.slot));
              if (allies.length > 0) {
                results = [allies[Math.floor(Math.random() * allies.length)]];
              }
            }
            break;

          case 'enemy_in_battle_zone':
            results = [_getBattleZoneSlot(opponentId)].filter(Boolean).map(s => _slotToTarget(opponentId, s.dataset.slotIndex, s));
            break;

          case 'ally_in_battle_zone':
            results = [_getBattleZoneSlot(playerId)].filter(Boolean).map(s => _slotToTarget(playerId, s.dataset.slotIndex, s));
            break;

          case 'all_enemies_and_player':
            results = _getAllSlotsAsTargets(opponentId);
            results.push({ playerId: opponentId, slotIndex: -1, slot: null, type: 'player' });
            break;

          case 'all_allies_and_player':
            results = _getAllSlotsAsTargets(playerId);
            results.push({ playerId, slotIndex: -1, slot: null, type: 'player' });
            break;

          case 'dead_allies':
            results = _getAllSlotsAsTargets(playerId).filter(t => GameContext.isShikigamiKo(t.slot));
            break;

          case 'dead_enemies':
            results = _getAllSlotsAsTargets(opponentId).filter(t => GameContext.isShikigamiKo(t.slot));
            break;

          case 'chosen_by_player':
            // 交互式选择（暂返回空，后续可通过 UI 模态窗实现）
            console.log('[TargetResolver] 玩家选择目标（暂未实现交互）');
            results = [];
            break;

          default:
            console.warn('[TargetResolver] 未知目标选择器:', selectorName);
            break;
        }

        // 应用附加条件过滤
        if (conditionDef && results.length > 0) {
          results = _applyConditionFilter(results, conditionDef);
        }

        return results;
      }

      function _slotToTarget(playerId, slotIndex, slot) {
        return { playerId, slotIndex: parseInt(slotIndex, 10), slot, type: 'shikigami' };
      }

      function _getAllSlotsAsTargets(playerId) {
        const slots = GameContext.getShikigamiSlots(playerId);
        return slots
          .filter(slot => slot.classList.contains('has-image'))  // 无卡图的空槽位不算目标
          .map((slot, idx) => ({
            playerId,
            slotIndex: parseInt(slot.dataset.slotIndex, 10),
            slot,
            type: 'shikigami'
          }));
      }

      function _getBattleZoneSlot(playerId) {
        // 简化：返回第一个有图片且在战斗区的槽位
        // 实际应通过 UI 状态标记（如 .in-battle-zone）来判断
        const slots = GameContext.getShikigamiSlots(playerId);
        // 暂时返回第一个有图片的非气绝槽位
        for (const slot of slots) {
          if (slot.classList.contains('has-image') && !GameContext.isShikigamiKo(slot)) {
            return slot;
          }
        }
        return null;
      }

      /** 应用条件过滤器 */
      function _applyConditionFilter(targets, conditionDef) {
        return targets.filter(t => {
          if (t.type === 'player') {
            // 对牌手目标，仅检查阵营相关条件
            return true;
          }
          // 类型过滤
          if (conditionDef.card_type && conditionDef.card_type !== 'any') {
            // 卡牌类型目前难以从 DOM 直接推断，跳过
          }
          // 状态过滤
          if (conditionDef.has_ko !== undefined) {
            const isKo = GameContext.isShikigamiKo(t.slot);
            if (isKo !== conditionDef.has_ko) return false;
          }
          if (conditionDef.has_countdown !== undefined) {
            const hasCd = GameContext.hasShikigamiCountdown(t.slot);
            if (hasCd !== conditionDef.has_countdown) return false;
          }
          if (conditionDef.has_energy !== undefined) {
            const hasEn = GameContext.hasShikigamiEnergy(t.slot);
            if (hasEn !== conditionDef.has_energy) return false;
          }
          return true;
        });
      }

      return { resolve };
    })();

    // ================================================================
    //  ConditionEvaluator — 条件判断器
    //  判断当前上下文是否满足条件定义
    // ================================================================
    const ConditionEvaluator = (() => {

      /**
       * 检查目标是否满足条件
       * @returns {boolean}
       */
      function check(target, conditionDef, context) {
        if (!conditionDef) return true;

        // 目标过滤（side + card_type）
        if (conditionDef.target_filter) {
          const filter = conditionDef.target_filter;
          // side 检查
          if (filter.side && filter.side !== 'any') {
            const targetPlayerId = target.playerId;
            const myPlayerId = context.playerId || '1';
            if (filter.side === 'self') {
              // "self" 指效果来源自身，而非阵营
            } else if (filter.side === 'ally') {
              if (targetPlayerId !== myPlayerId) return false;
            } else if (filter.side === 'enemy') {
              if (targetPlayerId === myPlayerId) return false;
            }
          }
        }

        // 气绝状态
        if (conditionDef.has_ko !== undefined && target.slot) {
          if (GameContext.isShikigamiKo(target.slot) !== conditionDef.has_ko) return false;
        }

        // 生命比较
        if (conditionDef.hp_compare && target.slot) {
          const hp = parseInt(target.slot.querySelector('.card-hp')?.value, 10) || 0;
          const val = ValueEvaluator.evaluate(conditionDef.hp_compare.value, context);
          if (!_compare(hp, conditionDef.hp_compare.operator, val)) return false;
        }

        // 攻击比较
        if (conditionDef.atk_compare && target.slot) {
          const atk = parseInt(target.slot.querySelector('.card-attack')?.value, 10) || 0;
          const val = ValueEvaluator.evaluate(conditionDef.atk_compare.value, context);
          if (!_compare(atk, conditionDef.atk_compare.operator, val)) return false;
        }

        // 计数器检查
        if (conditionDef.counter_check) {
          const cc = conditionDef.counter_check;
          const counterVal = GameContext.getCounter(cc.counter);
          const val = ValueEvaluator.evaluate(cc.value, context);
          if (!_compare(counterVal, cc.operator, val)) return false;
        }

        // 来源检查：判断事件来源（哪个式神造成的伤害/效果）是否匹配
        if (conditionDef.source_is) {
          const expected = conditionDef.source_is.reference;
          // reference="self" → 来源必须是此管线所属的式神自身
          if (expected === 'self') {
            // 从管线注册信息中获取卡牌归属
            const cardOwner = (context.cardMeta && context.cardMeta.owner) || null;
            if (!cardOwner) return false; // 无归属的卡牌不能通过 self 检查
            // 从事件上下文中获取实际来源
            let sourceName = null;
            if (context.source && context.source.ownerSlot) {
              sourceName = context.source.ownerSlot.querySelector('.card-name')?.value || '';
            }
            // 也检查 source 中直接传递的 shikigami 名称
            if (!sourceName && context.source && context.source.shikigamiName) {
              sourceName = context.source.shikigamiName;
            }
            if (!sourceName) return false; // 无法确定来源 → 不通过
            if (sourceName !== cardOwner) return false;
          }
        }

        return true;
      }

      function _compare(a, op, b) {
        switch (op) {
          case 'gt': return a > b;
          case 'lt': return a < b;
          case 'eq': return a === b;
          case 'gte': return a >= b;
          case 'lte': return a <= b;
          default: return false;
        }
      }

      return { check };
    })();

    // ================================================================
    //  ActionExecutor — 动作执行器
    //  将动作模块映射到实际的游戏操作
    // ================================================================
    const ActionExecutor = (() => {

      /**
       * 执行一个动作
       * @param {object} actionDef - { type: 'deal_damage', params: { value: 3 } }
       * @param {object} target - { playerId, slotIndex, slot, type }
       * @param {object} context - 效果执行上下文
       */
      function execute(actionDef, target, context) {
        const type = actionDef.type;
        const params = actionDef.params || {};

        // 求值所有参数中的表达式
        const resolvedParams = {};
        for (const [key, val] of Object.entries(params)) {
          resolvedParams[key] = ValueEvaluator.evaluate(val, context);
        }

        // 获取目标名称（用于消息）
        const tgtName = _targetName(target);
        // 获取伤害来源标签
        const srcLabel = _sourceLabel(context);

        switch (type) {
          // ---- 伤害与恢复 ----
          case 'deal_damage':
            if (target.type === 'player') {
              const hpBefore = GameContext.getPlayerHp(target.playerId);
              _dealDamageToPlayer(target.playerId, resolvedParams.value || 1);
              const hpAfter = GameContext.getPlayerHp(target.playerId);
              broadcastSystemMsg(srcLabel + '对牌手造成了' + (resolvedParams.value || 1) + '点伤害 ❤️' + hpBefore + '→' + hpAfter);
            } else if (target.slot) {
              const hpInput = target.slot.querySelector('.card-hp');
              const hpBefore = hpInput ? (parseInt(hpInput.value, 10) || 0) : 0;
              _dealDamageToCard(target.slot, resolvedParams.value || 1);
              const hpAfter = hpInput ? (parseInt(hpInput.value, 10) || 0) : 0;
              broadcastSystemMsg(srcLabel + '对「' + tgtName + '」造成了' + (resolvedParams.value || 1) + '点伤害 ❤️' + hpBefore + '→' + hpAfter);
            }
            EventBus.emit('damage_dealt', {
              source: context,
              target,
              amount: resolvedParams.value || 1
            });
            break;

          case 'restore_hp':
            if (target.type === 'player') {
              const hpBefore = GameContext.getPlayerHp(target.playerId);
              _healPlayer(target.playerId, resolvedParams.value || 1);
              const hpAfter = GameContext.getPlayerHp(target.playerId);
              broadcastSystemMsg(srcLabel + '为牌手恢复了' + (resolvedParams.value || 1) + '点生命 ❤️' + hpBefore + '→' + hpAfter);
            } else if (target.slot) {
              const hpInput = target.slot.querySelector('.card-hp');
              const hpBefore = hpInput ? (parseInt(hpInput.value, 10) || 0) : 0;
              _healCard(target.slot, resolvedParams.value || 1);
              const hpAfter = hpInput ? (parseInt(hpInput.value, 10) || 0) : 0;
              broadcastSystemMsg(srcLabel + '为「' + tgtName + '」恢复了' + (resolvedParams.value || 1) + '点生命 ❤️' + hpBefore + '→' + hpAfter);
            }
            break;

          case 'deal_damage_to_player':
            {
              const hpBefore = GameContext.getPlayerHp(target.playerId);
              _dealDamageToPlayer(target.playerId, resolvedParams.value || 1);
              const hpAfter = GameContext.getPlayerHp(target.playerId);
              broadcastSystemMsg(srcLabel + '对牌手造成了' + (resolvedParams.value || 1) + '点伤害 ❤️' + hpBefore + '→' + hpAfter);
            }
            break;

          // ---- 抽牌与弃牌 ----
          case 'draw_card':
            _drawCards(target.playerId, resolvedParams.count || 1);
            broadcastSystemMsg('抽了' + (resolvedParams.count || 1) + '张牌');
            break;

          case 'discard':
            _discardCards(target.playerId, resolvedParams.count || 1, resolvedParams.from || 'hand');
            broadcastSystemMsg('弃置了' + (resolvedParams.count || 1) + '张牌');
            break;

          case 'mill':
            _millCards(target.playerId, resolvedParams.count || 1);
            broadcastSystemMsg('从牌库顶弃置了' + (resolvedParams.count || 1) + '张牌');
            break;

          // ---- 属性修改 ----
          case 'modify_atk':
            if (target.slot) {
              _modifyAttr(target, 'atk', resolvedParams.delta || 1);
              broadcastSystemMsg('「' + tgtName + '」攻击力' + (resolvedParams.delta >= 0 ? '+' : '') + (resolvedParams.delta || 1));
            }
            break;

          case 'modify_hp':
            if (target.slot) {
              _modifyAttr(target, 'hp', resolvedParams.delta || 1);
              broadcastSystemMsg('「' + tgtName + '」生命值' + (resolvedParams.delta >= 0 ? '+' : '') + (resolvedParams.delta || 1));
            }
            break;

          case 'set_atk':
            if (target.slot) {
              _setAttr(target, 'atk', resolvedParams.value || 3);
              broadcastSystemMsg('「' + tgtName + '」攻击力变为' + (resolvedParams.value || 3));
            }
            break;

          case 'set_hp':
            if (target.slot) {
              _setAttr(target, 'hp', resolvedParams.value || 4);
              broadcastSystemMsg('「' + tgtName + '」生命值变为' + (resolvedParams.value || 4));
            }
            break;

          // ---- 关键词 ----
          case 'grant_keyword':
            if (target.slot) {
              _grantKeyword(target, resolvedParams.keyword || 'swift', resolvedParams.duration || 'this_turn');
              const kwNames = { swift:'迅捷', double_strike:'连击', pierce:'贯通', veil:'帷幕', tenacity:'不屈', fatal:'必杀', immune_combat:'免疫战斗伤害', battle_no_fire:'战斗牌不消耗鬼火', can_attack_again:'可再次出击', cannot_be_targeted:'无法被指定' };
              broadcastSystemMsg('「' + tgtName + '」获得了' + (kwNames[resolvedParams.keyword] || resolvedParams.keyword));
            }
            break;

          case 'remove_keyword':
            if (target.slot) {
              _removeKeyword(target, resolvedParams.keyword || 'swift');
              broadcastSystemMsg('「' + tgtName + '」移除了关键词');
            }
            break;

          // ---- 气绝与复活 ----
          case 'apply_ko':
            if (target.slot) {
              applyKoToCard(target.slot);
              // applyKoToCard 自己有消息，这里不重复
              EventBus.emit('shikigami_ko', {
                shikigami: target,
                killer: context.source || null
              });
            }
            break;

          case 'revive':
            if (target.slot) {
              removeKoOverlay(target.slot);
              syncSlotToPeer(target.slot);
              broadcastSystemMsg('「' + tgtName + '」复活了');
              EventBus.emit('shikigami_revived', { shikigami: target });
            }
            break;

          case 'destroy':
            if (target.slot) {
              _dealDamageToCard(target.slot, 999);
              broadcastSystemMsg('「' + tgtName + '」被消灭');
            }
            break;

          // ---- 倒计时 ----
          case 'set_countdown':
            if (target.slot) {
              _setCountdown(target.slot, resolvedParams.value || 1);
              broadcastSystemMsg('「' + tgtName + '」倒计时设为' + (resolvedParams.value || 1));
            }
            break;

          case 'modify_countdown':
            if (target.slot) {
              _modifyCountdown(target.slot, resolvedParams.delta || -1);
              broadcastSystemMsg('「' + tgtName + '」倒计时' + (resolvedParams.delta >= 0 ? '+' : '') + (resolvedParams.delta || -1));
            }
            break;

          // ---- 能量 ----
          case 'set_energy':
            if (target.slot) {
              _setEnergy(target.slot, resolvedParams.value || 1);
              broadcastSystemMsg('「' + tgtName + '」能量设为' + (resolvedParams.value || 1));
            }
            break;

          case 'modify_energy':
            if (target.slot) {
              _modifyEnergy(target.slot, resolvedParams.delta || 1);
              broadcastSystemMsg('「' + tgtName + '」能量' + (resolvedParams.delta >= 0 ? '+' : '') + (resolvedParams.delta || 1));
            }
            break;

          // ---- 灵咒 ----
          case 'apply_curse':
            if (target.slot && target.slot.classList.contains('has-image')) {
              const curses = getSlotCurses(target.slot);
              const curseName = params.curse_name || resolvedParams.curse_name || '未命名灵咒';
              const layers = resolvedParams.layers || 1;
              const existing = curses.find(c => c.name === curseName);
              if (existing) { existing.layers += layers; }
              else { curses.push({ name: curseName, layers }); }
              setSlotCurses(target.slot, curses);
              syncSlotToPeer(target.slot);
              broadcastSystemMsg('「' + tgtName + '」结附了灵咒「' + curseName + '」×' + layers);
            }
            break;

          case 'remove_curse':
            if (target.slot) {
              const curses = getSlotCurses(target.slot);
              const curseName = params.curse_name || resolvedParams.curse_name || '';
              const layers = resolvedParams.layers || 1;
              const existing = curses.find(c => c.name === curseName);
              if (existing) {
                existing.layers -= layers;
                if (existing.layers <= 0) {
                  const idx = curses.indexOf(existing);
                  if (idx >= 0) curses.splice(idx, 1);
                }
              }
              setSlotCurses(target.slot, curses);
              syncSlotToPeer(target.slot);
              broadcastSystemMsg('移除了「' + tgtName + '」的灵咒「' + curseName + '」×' + layers);
            }
            break;

          case 'remove_all_curses':
            if (target.slot) {
              setSlotCurses(target.slot, []);
              syncSlotToPeer(target.slot);
              broadcastSystemMsg('移除了「' + tgtName + '」的所有灵咒');
            }
            break;

          // ---- 召唤 ----
          case 'summon':
            _summonCard(target.playerId, params.card_name || '召唤物');
            // _summonCard 自带消息
            break;

          // ---- 鬼火与出击 ----
          case 'modify_fire':
            GameContext.incPlayerCounter(target.playerId, 'fire', resolvedParams.delta || 1);
            broadcastSystemMsg('鬼火' + (resolvedParams.delta >= 0 ? '+' : '') + (resolvedParams.delta || 1));
            break;

          case 'reset_attack_chance':
            GameContext.setPlayerCounter(target.playerId, 'attack_chances',
              GameContext.getPlayerCounter(target.playerId, 'max_attack_chances'));
            broadcastSystemMsg('出击次数已恢复');
            break;

          case 'gain_extra_attack':
            GameContext.incPlayerCounter(target.playerId, 'attack_chances', 1);
            broadcastSystemMsg('获得了一次额外出击机会');
            break;

          // ---- 骰子 ----
          case 'roll_dice': {
            const minVal = resolvedParams.min || 1;
            const maxVal = resolvedParams.max || 6;
            const result = Math.floor(Math.random() * (maxVal - minVal + 1)) + minVal;
            GameContext.setCounter('last_dice_roll', result);
            broadcastSystemMsg('投骰子：' + result + '（' + minVal + '~' + maxVal + '）');
            break;
          }

          // ---- 区域移动 ----
          case 'move_to_hand':
            _moveToHand(target.playerId, 1, resolvedParams.from_zone || 'grave');
            break;

          case 'move_to_deck':
            _moveToDeck(target.playerId, resolvedParams.from_zone || 'grave');
            break;

          case 'banish':
            // 放逐：从墓地中移除
            _banishCard(target.playerId);
            break;

          case 'return_to_hand':
            // 弹回：将场上式神返回手牌（简化：放入手牌列表）
            if (target.slot) {
              const cardName = target.slot.querySelector('.card-name')?.value || '未命名';
              const state = getPlayerCardState(target.playerId);
              state.hand.push(createCard(cardName));
              updateDeckButtons(target.playerId);
              syncDeckState(target.playerId);
              // 清除卡牌槽
              clearSlotImage(target.slot);
              target.slot.querySelector('.card-name').value = '';
              target.slot.querySelector('.card-attack').value = '';
              target.slot.querySelector('.card-hp').value = '';
              syncSlotToPeer(target.slot);
            }
            break;

          // ---- 检索与查看 ----
          case 'search_deck':
            _searchDeck(target.playerId, params.filter_owner, params.filter_type, resolvedParams.count || 1);
            break;

          case 'generate_random_cards':
            _generateRandomCards(target.playerId, params.filter_owner || '', params.filter_type || '', resolvedParams.count || 1);
            break;

          case 'look_at_deck':
            // 查看牌库顶（简化：不做实际查看，只记日志）
            broadcastSystemMsg('查看了牌库顶 ' + (resolvedParams.count || 3) + ' 张牌。');
            break;

          case 'divine':
            _divineCards(target.playerId, resolvedParams.count || 1);
            break;

          // ---- 控制 ----
          case 'stun':
            if (target.slot) {
              const zone = target.slot.closest('.player-zone');
              if (zone) {
                const panel = zone.querySelector('.effects-panel');
                const item = createEffectItem();
                item.querySelector('.effect-name').value = '眩晕';
                item.querySelector('.effect-value').value = '本回合';
                panel.appendChild(item);
                syncEffectsState(zone.dataset.player);
              }
              broadcastSystemMsg((target.slot.querySelector('.card-name')?.value || '式神') + '被眩晕。');
            }
            break;

          case 'force_attack':
            if (target.slot) {
              broadcastSystemMsg((target.slot.querySelector('.card-name')?.value || '式神') + '被强制出击。');
            }
            break;

          case 'negate':
            broadcastSystemMsg('效果被无效化。');
            break;

          // ---- 幻境 ----
          case 'create_realm':
            _createRealm(target.playerId, params.card_name || '幻境', resolvedParams.durability || 1);
            break;

          case 'modify_realm_durability':
            // 修改幻境耐久（简化）
            break;

          // ---- 变形 ----
          case 'transform':
            if (target.slot) {
              const intoCard = params.into_card || '变形目标';
              target.slot.querySelector('.card-name').value = intoCard;
              const dbCard = CardDB.lookup(intoCard);
              if (dbCard) {
                if (dbCard.attack) target.slot.querySelector('.card-attack').value = dbCard.attack;
                if (dbCard.hp) target.slot.querySelector('.card-hp').value = dbCard.hp;
              }
              syncSlotToPeer(target.slot);
              broadcastSystemMsg('式神变形为「' + intoCard + '」。');
            }
            break;

          case 'copy_card':
            _copyCard(target.playerId, resolvedParams.from_zone || 'grave', resolvedParams.count || 1);
            break;

          case 'swap_atk_hp':
            if (target.slot) {
              const atkInput = target.slot.querySelector('.card-attack');
              const hpInput = target.slot.querySelector('.card-hp');
              const atkVal = atkInput.value;
              atkInput.value = hpInput.value;
              hpInput.value = atkVal;
              syncSlotToPeer(target.slot);
            }
            break;

          case 'deal_damage_equal_to_atk':
            if (target.slot) {
              const atk = parseInt(target.slot.querySelector('.card-attack')?.value, 10) || 0;
              _dealDamageToCard(target.slot, atk);
            }
            break;

          case 'change_faction':
            // 简化：仅日志
            broadcastSystemMsg('派系已变更。');
            break;

          // ---- 默认 ----
          default:
            console.warn('[ActionExecutor] 未知动作类型:', type);
            break;
        }
      }

      // -- 内部辅助函数 --

      /** 获取目标的显示名称 */
      function _targetName(target) {
        if (!target) return '?';
        if (target.type === 'player') return '牌手';
        if (target.slot) {
          const name = target.slot.querySelector('.card-name')?.value;
          return name || '未命名';
        }
        return target.playerId || '?';
      }

      /** 获取伤害/效果来源的显示名称 */
      function _sourceLabel(context) {
        if (!context) return '牌手';
        // 如果有归属式神卡槽，用式神名
        if (context.ownerSlot) {
          const name = context.ownerSlot.querySelector('.card-name')?.value;
          if (name) return '「' + name + '」';
        }
        // 无归属式神（中立卡牌等）：统一为牌手
        return '牌手';
      }

      function _dealDamageToCard(slot, amount) {
        const hpInput = slot.querySelector('.card-hp');
        if (!hpInput) return;
        const currentHp = parseInt(hpInput.value, 10) || 0;
        const newHp = Math.max(0, currentHp - amount);
        hpInput.value = newHp || '';
        // 【特效】伤害动画
        if (typeof DamageEffects !== 'undefined') {
          DamageEffects.playDamage(slot, amount, 'damage');
        }
        syncSlotToPeer(slot);
        // 【联机同步】通知对方播放伤害动画
        if (typeof sendToPeer === 'function' && peerConn && peerConn.open) {
          sendToPeer({ type: 'card-damage', playerId: slot.dataset.slotPlayer, slotIndex: parseInt(slot.dataset.slotIndex, 10), dmg: amount });
        }
        // 若生命归零且未气绝，触发气绝
        if (newHp <= 0 && !slot.querySelector('.ko-overlay')) {
          applyKoToCard(slot);
        }
      }

      function _dealDamageToPlayer(playerId, amount) {
        const currentHp = GameContext.getPlayerHp(playerId);
        GameContext.setPlayerHp(playerId, Math.max(0, currentHp - amount));
        // 【特效】对牌手的伤害动画（定位在牌手头像中心）
        if (typeof DamageEffects !== 'undefined') {
          const zone = document.querySelector(`.player-zone[data-player="${playerId}"]`);
          if (zone) {
            const avatar = zone.querySelector('.player-avatar');
            const targetEl = avatar || zone;
            DamageEffects.playDamage(targetEl, amount, 'damage');
          }
        }
        // 【联机同步】通知对方播放伤害动画
        if (typeof sendToPeer === 'function' && peerConn && peerConn.open) {
          sendToPeer({ type: 'player-damage', playerId, dmg: amount });
        }
      }

      function _healCard(slot, amount) {
        const hpInput = slot.querySelector('.card-hp');
        if (!hpInput) return;
        const currentHp = parseInt(hpInput.value, 10) || 0;
        hpInput.value = currentHp + amount;
        // 【特效】治疗动画
        if (typeof DamageEffects !== 'undefined') {
          DamageEffects.playDamage(slot, amount, 'heal');
        }
        syncSlotToPeer(slot);
        // 【联机同步】通知对方播放治疗动画
        if (typeof sendToPeer === 'function' && peerConn && peerConn.open) {
          sendToPeer({ type: 'card-heal', playerId: slot.dataset.slotPlayer, slotIndex: parseInt(slot.dataset.slotIndex, 10), amount });
        }
      }

      function _healPlayer(playerId, amount) {
        const currentHp = GameContext.getPlayerHp(playerId);
        GameContext.setPlayerHp(playerId, currentHp + amount);
        // 【特效】牌手治疗动画（定位在牌手头像中心）
        if (typeof DamageEffects !== 'undefined') {
          const zone = document.querySelector(`.player-zone[data-player="${playerId}"]`);
          if (zone) {
            const avatar = zone.querySelector('.player-avatar');
            const targetEl = avatar || zone;
            DamageEffects.playDamage(targetEl, amount, 'heal');
          }
        }
        // 【联机同步】通知对方播放治疗动画
        if (typeof sendToPeer === 'function' && peerConn && peerConn.open) {
          sendToPeer({ type: 'player-heal', playerId, amount });
        }
      }

      function _drawCards(playerId, count) {
        const { deck, hand } = getPlayerCardState(playerId);
        for (let i = 0; i < count; i++) {
          if (deck.length === 0) break;
          const card = deck.pop();
          hand.push(card);
        }
        updateDeckButtons(playerId);
        syncDeckState(playerId);
      }

      function _discardCards(playerId, count, from) {
        const { deck, hand } = getPlayerCardState(playerId);
        const source = from === 'deck' ? deck : hand;
        for (let i = 0; i < count; i++) {
          if (source.length === 0) break;
          source.pop(); // 简化：弃置最后一张
        }
        updateDeckButtons(playerId);
        syncDeckState(playerId);
      }

      function _millCards(playerId, count) {
        const { deck } = getPlayerCardState(playerId);
        for (let i = 0; i < count; i++) {
          if (deck.length === 0) break;
          deck.pop();
        }
        updateDeckButtons(playerId);
        syncDeckState(playerId);
      }

      function _modifyAttr(target, attr, delta) {
        const input = target.slot.querySelector(attr === 'atk' ? '.card-attack' : '.card-hp');
        if (!input) return;
        const current = parseInt(input.value, 10) || 0;
        input.value = Math.max(0, current + delta) || '';
        syncSlotToPeer(target.slot);
      }

      function _setAttr(target, attr, value) {
        const input = target.slot.querySelector(attr === 'atk' ? '.card-attack' : '.card-hp');
        if (!input) return;
        input.value = value || '';
        syncSlotToPeer(target.slot);
      }

      function _grantKeyword(target, keyword, duration) {
        // 关键词以效果面板条目的形式展示
        const zone = target.slot.closest('.player-zone');
        if (!zone) return;
        const panel = zone.querySelector('.effects-panel');
        const item = createEffectItem();
        const kwNames = {
          swift: '迅捷', double_strike: '连击', pierce: '贯通',
          veil: '帷幕', tenacity: '不屈', fatal: '必杀',
          immune_combat: '免疫战斗伤害', battle_no_fire: '战斗牌不消耗鬼火',
          can_attack_again: '可再次出击', cannot_be_targeted: '无法被指定'
        };
        item.querySelector('.effect-name').value = kwNames[keyword] || keyword;
        item.querySelector('.effect-value').value = duration === 'permanent' ? '永久' : '本回合';
        panel.appendChild(item);
        syncEffectsState(zone.dataset.player);
      }

      function _removeKeyword(target, keyword) {
        // 从效果面板中移除对应关键词条目
        const zone = target.slot.closest('.player-zone');
        if (!zone) return;
        const panel = zone.querySelector('.effects-panel');
        const items = panel.querySelectorAll('.effect-item');
        const kwNames = {
          swift: '迅捷', double_strike: '连击', pierce: '贯通',
          veil: '帷幕', tenacity: '不屈', fatal: '必杀',
          immune_combat: '免疫战斗伤害', battle_no_fire: '战斗牌不消耗鬼火',
          can_attack_again: '可再次出击', cannot_be_targeted: '无法被指定'
        };
        const targetName = kwNames[keyword] || keyword;
        items.forEach(item => {
          if (item.querySelector('.effect-name').value === targetName) {
            item.remove();
          }
        });
        syncEffectsState(zone.dataset.player);
      }

      function _setCountdown(slot, value) {
        updateSlotCountdownBadge(slot, String(value));
        syncSlotToPeer(slot);
      }

      function _modifyCountdown(slot, delta) {
        const cdBadge = slot.querySelector('.card-badge--countdown');
        if (!cdBadge) return;
        const input = cdBadge.querySelector('input');
        const current = parseInt(input.value, 10) || 0;
        const newVal = Math.max(0, current + delta);
        input.value = newVal || '';
        if (newVal <= 0) {
          removeCountdownBadge(slot);
          EventBus.emit('countdown_zero', { slot, playerId: slot.dataset.slotPlayer, slotIndex: slot.dataset.slotIndex });
        }
        syncSlotToPeer(slot);
      }

      function _setEnergy(slot, value) {
        updateSlotEnergyBadge(slot, String(value));
        syncSlotToPeer(slot);
      }

      function _modifyEnergy(slot, delta) {
        const enBadge = slot.querySelector('.card-badge--energy');
        if (!enBadge) return;
        const input = enBadge.querySelector('input');
        const current = parseInt(input.value, 10) || 0;
        input.value = Math.max(0, current + delta) || '';
        syncSlotToPeer(slot);
      }

      function _summonCard(playerId, cardName) {
        // 找一个空槽位
        const slots = GameContext.getShikigamiSlots(playerId);
        for (const slot of slots) {
          if (!slot.classList.contains('has-image')) {
            slot.classList.add('has-image');
            slot.querySelector('.card-name').value = cardName;
            slot.querySelector('.card-attack').value = '1';
            slot.querySelector('.card-hp').value = '1';
            syncSlotToPeer(slot);
            broadcastSystemMsg(getPlayerName(playerId) + '召唤了「' + cardName + '」');
            return;
          }
        }
        broadcastSystemMsg('场上已满，无法召唤。');
      }

      /** 从墓地移动卡牌到手牌 */
      function _moveToHand(playerId, count, fromZone) {
        const { hand, grave } = getPlayerCardState(playerId);
        if (!grave || grave.length === 0) {
          broadcastSystemMsg('墓地中没有卡牌可移回。');
          return;
        }
        const moved = Math.min(count, grave.length);
        for (let i = 0; i < moved; i++) {
          const card = grave.pop();
          if (card) hand.push(card);
        }
        updateDeckButtons(playerId);
        syncDeckState(playerId);
        broadcastSystemMsg(getPlayerName(playerId) + '从墓地移回了' + moved + '张牌到手牌。');
      }

      /** 移回牌库 */
      function _moveToDeck(playerId, fromZone) {
        const { deck, hand, grave } = getPlayerCardState(playerId);
        const source = fromZone === 'hand' ? hand : (grave || []);
        if (source.length === 0) return;
        const card = source.pop();
        deck.push(card);
        updateDeckButtons(playerId);
        syncDeckState(playerId);
      }

      /** 放逐 */
      function _banishCard(playerId) {
        const { grave } = getPlayerCardState(playerId);
        if (!grave || grave.length === 0) return;
        grave.pop(); // 从墓地放逐
        updateDeckButtons(playerId);
        syncDeckState(playerId);
      }

      /** 检索牌库 */
      function _searchDeck(playerId, filterOwner, filterType, count) {
        const { deck, hand } = getPlayerCardState(playerId);
        let found = 0;
        const toRemove = [];
        for (const card of deck) {
          if (found >= count) break;
          const dbCard = CardDB.lookup(card.name);
          if (!dbCard) continue;
          if (filterOwner && dbCard.owner !== filterOwner) continue;
          if (filterType && dbCard.type !== filterType) continue;
          toRemove.push(card);
          found++;
        }
        for (const card of toRemove) {
          const idx = deck.indexOf(card);
          if (idx >= 0) deck.splice(idx, 1);
          hand.push(card);
        }
        updateDeckButtons(playerId);
        syncDeckState(playerId);
        broadcastSystemMsg(getPlayerName(playerId) + '从牌库检索了' + found + '张牌。');
      }

      /** 占卜 */
      function _divineCards(playerId, count) {
        // 简化：查看牌库顶并可选调整
        broadcastSystemMsg(getPlayerName(playerId) + '进行了占卜' + count + '。');
      }

      /** 展开幻境 */
      function _createRealm(playerId, cardName, durability) {
        const zone = document.querySelector('.player-zone[data-player="' + playerId + '"]');
        if (!zone) return;
        const panel = zone.querySelector('.effects-panel');
        const item = createEffectItem();
        item.querySelector('.effect-name').value = cardName;
        item.querySelector('.effect-value').value = String(durability);
        panel.appendChild(item);
        syncEffectsState(playerId);
        broadcastSystemMsg(getPlayerName(playerId) + '展开了幻境「' + cardName + '」（耐久' + durability + '）');
      }

      /** 从全局卡牌数据库随机抽取符合条件的牌加入手牌 */
      function _generateRandomCards(playerId, filterOwner, filterType, count) {
        const { hand } = getPlayerCardState(playerId);
        if (!hand) return;
        // 从 CardDB 全局数据库中筛选
        let pool = [];
        if (typeof CardDB !== 'undefined' && CardDB.isReady()) {
          pool = CardDB.getAll().filter(c => {
            if (c.type === 'shikigami') return false; // 不包括式神本身
            if (filterOwner && c.owner !== filterOwner) return false;
            if (filterType && c.type !== filterType) return false;
            return true;
          });
        }
        if (pool.length === 0) {
          broadcastSystemMsg('没有符合条件的卡牌可生成。');
          return;
        }
        // 随机打乱后取前 count 张
        const shuffled = [...pool].sort(() => Math.random() - 0.5);
        const picked = shuffled.slice(0, Math.min(count, shuffled.length));
        for (const card of picked) {
          hand.push(createCard(card.name));
        }
        updateDeckButtons(playerId);
        syncDeckState(playerId);
        broadcastSystemMsg(getPlayerName(playerId) + '随机获得了' + picked.length + '张牌。');
      }

      /** 复制卡牌 */
      function _copyCard(playerId, fromZone, count) {
        const { hand, grave } = getPlayerCardState(playerId);
        const source = fromZone === 'grave' ? (grave || []) : hand;
        if (source.length === 0) return;
        const toCopy = source[source.length - 1]; // 复制最后一张
        for (let i = 0; i < count; i++) {
          hand.push(createCard(toCopy.name));
        }
        updateDeckButtons(playerId);
        syncDeckState(playerId);
        broadcastSystemMsg(getPlayerName(playerId) + '复制了' + count + '张「' + toCopy.name + '」。');
      }

      return { execute };
    })();

    // ================================================================
    //  EffectEngine — 主引擎
    //  解析效果管线定义 → 注册触发器 → 在时机到来时调度执行
    // ================================================================
    const EffectEngine = (() => {
      // 已注册的效果管线（卡牌名 → 管线配置）
      const _registeredCards = new Map();
      // 已注册的触发器（事件名 → [{pipeline, cardName}]）
      const _triggerMap = new Map();
      // 持续效果（光环、增强等）
      const _continuousEffects = [];

      /**
       * 注册一张卡牌的所有效果
       * @param {string} cardName - 卡牌名称
       * @param {object} effectsDef - 效果定义（JSON）
       * @param {object} cardMeta - 卡牌元信息（owner, type, level 等）
       */
      function registerCard(cardName, effectsDef, cardMeta) {
        if (!effectsDef) return;
        _registeredCards.set(cardName, { def: effectsDef, meta: cardMeta });

        // 遍历所有管线，根据触发器类型注册到 EventBus
        _walkPipelines(effectsDef, (pipeline) => {
          const trigger = pipeline.trigger;
          if (!trigger) return;

          const on = trigger.on;
          if (on === 'aura' || on === 'enhance') {
            // 持续效果：存入单独列表
            _continuousEffects.push({ cardName, pipeline, meta: cardMeta });
          } else if (on === 'on_response') {
            // 响应：注册到 responds_to 事件
            const respondTo = trigger.responds_to || 'on_attacked';
            _registerTrigger(respondTo, { cardName, pipeline, meta: cardMeta, isResponse: true });
          } else {
            // 标准事件触发器
            _registerTrigger(on, { cardName, pipeline, meta: cardMeta });
          }
        });

        console.log('[EffectEngine] ✅ 注册卡牌效果: ' + cardName);
      }

      /** 将事件映射到触发器 */
      function _mapTriggerToEvent(triggerOn) {
        const map = {
          'on_play':             'card_played',
          'on_attack':           'shikigami_attack',
          'on_attacked':         'shikigami_attacked',
          'on_combat_start':     'combat_start',
          'on_combat_end':       'combat_end',
          'on_deal_damage':      'damage_dealt',
          'on_take_damage':      'damage_taken',
          'on_kill':             'shikigami_killed',
          'on_ko':               'shikigami_ko',
          'on_revive':           'shikigami_revived',
          'on_turn_start':       'turn_start',
          'on_turn_end':         'turn_end',
          'on_opponent_turn_start': 'opponent_turn_start',
          'on_opponent_turn_end':   'opponent_turn_end',
          'on_draw':             'card_drawn',
          'on_discard':          'card_discarded',
          'on_opponent_play':    'opponent_card_played',
          'on_opponent_attack':  'opponent_shikigami_attack',
          'on_countdown_zero':   'countdown_zero',
          'on_countdown_tick':   'countdown_tick',
          'on_curse_applied':    'curse_applied',
          'on_curse_removed':    'curse_removed',
          'on_realm_destroyed':  'realm_destroyed',
          'on_charge':           'shikigami_charge',
          'on_form_change':      'form_changed',
        };
        return map[triggerOn] || triggerOn;
      }

      function _registerTrigger(triggerOn, entry) {
        const eventName = _mapTriggerToEvent(triggerOn);
        if (!_triggerMap.has(eventName)) {
          _triggerMap.set(eventName, []);
          // 首次注册时，订阅 EventBus
          EventBus.on(eventName, (context) => {
            _handleEvent(eventName, context);
          });
        }
        _triggerMap.get(eventName).push(entry);
      }

      /** 处理事件：查找匹配的管线并执行 */
      function _handleEvent(eventName, eventContext) {
        const entries = _triggerMap.get(eventName);
        if (!entries) return;

        for (const entry of entries) {
          try {
            // 对于 card_played 事件，只触发被实际打出的那张牌，避免吹雪/杀念等被误触发
            if (eventName === 'card_played' && eventContext.cardName && entry.cardName !== eventContext.cardName) {
              continue;
            }
            console.log('[EffectEngine] ⚡ 触发事件:', eventName,
              '→ 卡牌:', entry.cardName,
              '| 来源:', eventContext.source?.ownerSlot?.querySelector?.('.card-name')?.value || eventContext.source?.shikigamiName || '?');
            _executePipeline(entry.pipeline, {
              ...eventContext,
              cardName: entry.cardName,
              cardMeta: entry.meta,
            });
          } catch (e) {
            console.error(`[EffectEngine] 执行管线失败 (卡牌:${entry.cardName}, 事件:${eventName}):`, e);
          }
        }
      }

      /**
       * 主动触发一张卡牌的效果（如打出卡牌时）
       * @param {string} cardName - 卡牌名称
       * @param {string} triggerOn - 触发器名（如 'on_play'）
       * @param {object} context - 上下文
       */
      function triggerCard(cardName, triggerOn, context) {
        const registered = _registeredCards.get(cardName);
        if (!registered) {
          console.warn('[EffectEngine] ⚠️ 未注册的卡牌:', cardName);
          return;
        }

        // 在效果管线中查找匹配的触发器
        _walkPipelines(registered.def, (pipeline) => {
          const trigger = pipeline.trigger;
          if (trigger && trigger.on === triggerOn) {
            _executePipeline(pipeline, { ...context, cardName, cardMeta: registered.meta });
          }
        });
      }

      /**
       * 更新持续效果（光环/增强）
       * 每回合或状态变化时调用
       */
      function updateContinuousEffects(context) {
        for (const entry of _continuousEffects) {
          try {
            _executePipeline(entry.pipeline, {
              ...context,
              cardName: entry.cardName,
              cardMeta: entry.meta,
            });
          } catch (e) {
            console.error('[EffectEngine] 持续效果执行失败:', e);
          }
        }
      }

      // ============================================================
      //  管线执行核心
      // ============================================================

      /**
       * 执行一个效果管线或管线组合
       * @param {object} def - 效果定义（可能是管线或 combinators）
       * @param {object} context - 执行上下文
       */
      function _executePipeline(def, context) {
        if (!def) return;

        // 顶层是组合器？
        const combinatorType = _detectCombinator(def);
        if (combinatorType) {
          _executeCombinator(combinatorType, def, context);
          return;
        }

        // 单条管线
        _executeSinglePipeline(def, context);
      }

      /** 检测 combinators 类型 */
      function _detectCombinator(def) {
        if (def.combinator && EFFECT_MODULES.combinators[def.combinator]) {
          return def.combinator;
        }
        // 隐式检测
        if (def.steps && Array.isArray(def.steps)) return 'sequence';
        if (def.condition && (def.then || def.else)) return 'if_else';
        if (def.options && Array.isArray(def.options)) return 'choice';
        if (def.pipelines && Array.isArray(def.pipelines)) return 'any_trigger';
        return null;
      }

      /** 执行组合器 */
      function _executeCombinator(type, def, context) {
        switch (type) {
          case 'sequence':
            for (const step of (def.steps || [])) {
              _executePipeline(step, context);
            }
            break;

          case 'parallel':
            for (const step of (def.steps || [])) {
              _executePipeline(step, context);
            }
            break;

          case 'if_else': {
            const conditionMet = _evaluateCondition(def.condition, context);
            if (conditionMet && def.then) {
              _executePipeline(def.then, context);
            } else if (!conditionMet && def.else) {
              _executePipeline(def.else, context);
            }
            break;
          }

          case 'choice':
            // 玩家选择（暂取第一个）
            if (def.options && def.options.length > 0) {
              _executePipeline(def.options[0], context);
            }
            break;

          case 'repeat': {
            const count = ValueEvaluator.evaluate(def.count, context);
            for (let i = 0; i < count; i++) {
              _executePipeline(def.step, context);
            }
            break;
          }

          case 'for_each': {
            const targetSource = def.target_source;
            const targets = _resolveTargetSource(targetSource, context);
            for (const target of targets) {
              _executePipeline(def.step, { ...context, _for_each_target: target });
            }
            break;
          }

          case 'any_trigger':
            for (const pipeline of (def.pipelines || [])) {
              _executeSinglePipeline(pipeline, context);
            }
            break;
        }
      }

      /** 执行单条管线 */
      function _executeSinglePipeline(pipeline, context) {
        // 1. 解析目标
        const targetSelector = pipeline.target_selector || 'enemy_player';
        const conditionDef = pipeline.condition;
        let targets = TargetResolver.resolve(targetSelector, conditionDef, context);

        // 如果在 for_each 上下文中，使用当前迭代目标
        if (context._for_each_target) {
          targets = [context._for_each_target];
        }

        console.log('[EffectEngine] 🎯 目标解析:', targetSelector, '→', targets.length, '个目标',
          targets.length > 0 ? targets.map(t => t.slot?.querySelector?.('.card-name')?.value || t.type).join(',') : '');

        // 2. 对每个目标检查条件并执行动作
        for (const target of targets) {
          if (!ConditionEvaluator.check(target, conditionDef, context)) {
            console.log('[EffectEngine] 🚫 条件不满足，跳过目标:', target.slot?.querySelector?.('.card-name')?.value || target.playerId);
            continue;
          }

          // 3. 执行动作
          const actionDef = pipeline.action;
          if (actionDef) {
            // 检查 actionDef 是否是组合器（combinator）而非原子动作
            const actionCombType = _detectCombinator(actionDef);
            if (actionCombType) {
              // 递归执行嵌套的组合器
              _executeCombinator(actionCombType, actionDef, {
                ...context,
                targetPlayerId: target.playerId,
                targetSlotIndex: target.slotIndex,
                targetSlot: target.slot,
              });
            } else {
              const enrichedContext = {
                ...context,
                targetPlayerId: target.playerId,
                targetSlotIndex: target.slotIndex,
                targetSlot: target.slot,
              };
              // 求值动作参数中的表达式
              if (actionDef.params) {
                for (const [key, val] of Object.entries(actionDef.params)) {
                  if (typeof val === 'object' && val !== null) {
                    const resolved = ValueEvaluator.evaluate(val, enrichedContext);
                    console.log('[EffectEngine] 📐 参数求值:', key, '=', JSON.stringify(val), '→', resolved);
                  }
                }
              }
              ActionExecutor.execute(actionDef, target, enrichedContext);
            }
          }

          // 4. 如果有子管线（嵌套组合），继续递归执行
          if (pipeline.steps) {
            _executeCombinator('sequence', pipeline, context);
          }
        }
      }

      /** 求值条件 */
      function _evaluateCondition(conditionDef, context) {
        if (!conditionDef) return true;
        // 使用一个虚拟目标来做条件判断
        const dummyTarget = { playerId: context.playerId || '1', slotIndex: 0, slot: null, type: 'shikigami' };
        return ConditionEvaluator.check(dummyTarget, conditionDef, context);
      }

      /** 解析 for_each 的目标来源 */
      function _resolveTargetSource(targetSource, context) {
        if (!targetSource) return [];
        const zone = targetSource.zone || 'grave';
        const filter = targetSource.filter || {};
        const choose = targetSource.choose || 'all';

        // 从卡牌状态中收集符合条件的牌
        if (zone === 'grave') {
          // 墓地暂未独立维护，简化处理
          return [];
        }
        if (zone === 'deck') {
          const { deck } = getPlayerCardState(context.playerId || '1');
          // 返回 deck 中符合 filter 的牌
          // 简化：返回 deck 对象（每张卡作为一个"目标"）
          return deck.filter(card => {
            if (filter.owner && card.name && !card.name.includes(filter.owner)) return false;
            return true;
          }).map(card => ({
            playerId: context.playerId || '1',
            type: 'card_in_deck',
            cardData: card,
          }));
        }
        return [];
      }

      /** 遍历所有管线（递归） */
      function _walkPipelines(def, callback) {
        if (!def) return;
        const combType = _detectCombinator(def);
        if (combType) {
          switch (combType) {
            case 'sequence':
            case 'parallel':
              (def.steps || []).forEach(s => _walkPipelines(s, callback));
              break;
            case 'if_else':
              if (def.then) _walkPipelines(def.then, callback);
              if (def.else) _walkPipelines(def.else, callback);
              break;
            case 'choice':
              (def.options || []).forEach(o => _walkPipelines(o, callback));
              break;
            case 'repeat':
              if (def.step) _walkPipelines(def.step, callback);
              break;
            case 'for_each':
              if (def.step) _walkPipelines(def.step, callback);
              break;
            case 'any_trigger':
              (def.pipelines || []).forEach(p => _walkPipelines(p, callback));
              break;
          }
        } else if (def.trigger) {
          // 叶子节点：一条完整的管线
          callback(def);
        } else if (def.action) {
          // 没有触发器但有动作（裸动作，通常作为子步骤）
          callback(def);
        }
      }

      // ---- 调试接口 ----
      function getRegisteredCards() {
        return [..._registeredCards.keys()];
      }

      function getTriggerMap() {
        const result = {};
        for (const [k, v] of _triggerMap) result[k] = v.length;
        return result;
      }

      function reset() {
        _registeredCards.clear();
        _triggerMap.clear();
        _continuousEffects.length = 0;
      }

      return {
        registerCard,
        triggerCard,
        updateContinuousEffects,
        getRegisteredCards,
        getTriggerMap,
        reset,
      };
    })();

    // ================================================================
    //  初始化：加载所有卡牌的效果
    // ================================================================
    function initEffectEngine() {
      if (typeof CARD_DB_DATA === 'undefined') {
        console.warn('[EffectEngine] ⚠️ CARD_DB_DATA 未加载，跳过效果注册。');
        return;
      }

      let registeredCount = 0;

      // 注册 data/cards.js 中的静态卡牌
      for (const card of CARD_DB_DATA) {
        if (card.effects) {
          EffectEngine.registerCard(card.name, card.effects, {
            type: card.type,
            owner: card.owner || null,
            faction: card.faction || null,
            level: card.level || 1,
            awakened: card.awakened || false,
          });
          registeredCount++;
        }
      }

      // 也注册本地自定义卡牌（通过效果编辑器 DIY 的牌）
      if (typeof CardDB !== 'undefined' && CardDB.isReady()) {
        for (const card of CardDB.getAll()) {
          if (card._custom && card.effects && !_registeredCards.has(card.name)) {
            EffectEngine.registerCard(card.name, card.effects, {
              type: card.type || 'shikigami',
              owner: card.owner || null,
              faction: card.faction || null,
              level: card.level || 1,
              awakened: card.awakened || false,
            });
            registeredCount++;
          }
        }
      }

      console.log('[EffectEngine] ✅ 初始化完成，共注册 ' + registeredCount + ' 张卡牌的效果。');
    }

    // ---- 回合流程钩子（供 UI 层调用） ----
    function onTurnStart(playerId) {
      GameContext.incCounter('turn_number', 1);
      GameContext.resetTurnState(playerId);
      EventBus.emit('turn_start', { playerId, turn: GameContext.getCounter('turn_number') });
      // 更新持续效果
      EffectEngine.updateContinuousEffects({ playerId });
    }

    function onTurnEnd(playerId) {
      EventBus.emit('turn_end', { playerId, turn: GameContext.getCounter('turn_number') });
      // 倒计时减少
      _tickCountdowns(playerId);
    }

    function _tickCountdowns(playerId) {
      const slots = GameContext.getShikigamiSlots(playerId);
      slots.forEach((slot, idx) => {
        const cdBadge = slot.querySelector('.card-badge--countdown');
        if (cdBadge && slot.classList.contains('has-image')) {
          const input = cdBadge.querySelector('input');
          const current = parseInt(input.value, 10) || 0;
          if (current > 0) {
            const newVal = current - 1;
            input.value = newVal || '';
            EventBus.emit('countdown_tick', {
              playerId, slotIndex: idx, slot,
              oldValue: current, newValue: newVal
            });
            if (newVal <= 0) {
              removeCountdownBadge(slot);
              EventBus.emit('countdown_zero', {
                playerId, slotIndex: idx, slot
              });
            }
            syncSlotToPeer(slot);
          }
        }
        // 气绝倒计时 -1
        const koOverlay = slot.querySelector('.ko-overlay');
        if (koOverlay) {
          const koInput = koOverlay.querySelector('input');
          const koVal = parseInt(koInput.value, 10) || 0;
          if (koVal > 0) {
            const newKoVal = koVal - 1;
            koInput.value = newKoVal || '';
            if (newKoVal <= 0) {
              removeKoOverlay(slot);
              EventBus.emit('shikigami_revived', {
                playerId, slotIndex: idx, slot
              });
            }
            syncSlotToPeer(slot);
          }
        }
      });
    }

    // 卡牌打出时调用的钩子
    function onCardPlayed(cardName, playerId, ownerSlot) {
      const context = {
        playerId,
        ownerPlayerId: ownerSlot ? ownerSlot.dataset.slotPlayer : playerId,
        ownerSlotIndex: ownerSlot ? parseInt(ownerSlot.dataset.slotIndex, 10) : 0,
        ownerSlot,
        sourceCardName: cardName,
      };
      console.log('[EffectEngine] 🃏 打出卡牌:', cardName,
        '| 所属式神:', ownerSlot ? (ownerSlot.querySelector('.card-name')?.value || '?') : '(未找到)',
        '| playerId:', playerId,
        '| slotIdx:', context.ownerSlotIndex);
      // 用 triggerCard 精确触发 on_play（唯一路径，避免双重触发）
      EffectEngine.triggerCard(cardName, 'on_play', context);
      // 计数器
      GameContext.incPlayerCounter(playerId, 'cards_played', 1);
      GameContext.incCounter('cards_played_this_turn', 1);
    }

    // 出击时调用的钩子
    function onCharge(playerId, shikigamiSlot) {
      EventBus.emit('shikigami_charge', {
        playerId,
        slotIndex: shikigamiSlot ? parseInt(shikigamiSlot.dataset.slotIndex, 10) : 0,
        slot: shikigamiSlot,
      });
    }

    console.log('[EffectEngine] ✅ 模块化效果引擎已加载。');
