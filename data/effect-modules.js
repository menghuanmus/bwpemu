// ================================================================
//  data/effect-modules.js — 效果模块注册表
//  定义所有可复用的原子动作、触发器、条件、目标选择器。
//  卡牌效果 = 触发器 × 条件 × 目标 × 动作 的组合。
// ================================================================

var EFFECT_MODULES = {

  // ==============================================================
  //  一、动作模块 (Action) —— 原子操作，不可再分
  //  每个动作有 type + params + 执行函数
  // ==============================================================
  actions: {

    // ---- 伤害与恢复 ----
    deal_damage: {
      label: '造成伤害',
      params: {
        value: { type: 'expr', default: 1, desc: '伤害数值（支持表达式）' }
      },
      desc: '对目标造成N点伤害'
    },
    restore_hp: {
      label: '恢复生命',
      params: {
        value: { type: 'expr', default: 1, desc: '恢复数值' }
      },
      desc: '恢复目标N点生命'
    },
    deal_damage_to_player: {
      label: '对牌手造成伤害',
      params: {
        value: { type: 'expr', default: 1, desc: '伤害数值' }
      },
      desc: '直接对牌手造成伤害（穿透）'
    },

    // ---- 抽牌与弃牌 ----
    draw_card: {
      label: '抽牌',
      params: {
        count: { type: 'expr', default: 1, desc: '抽牌数量' }
      },
      desc: '从牌库抽N张牌'
    },
    discard: {
      label: '弃牌',
      params: {
        count: { type: 'expr', default: 1, desc: '弃置数量' },
        from: { type: 'select', options: ['hand', 'deck'], default: 'hand', desc: '从何处弃置' }
      },
      desc: '弃置N张牌'
    },
    mill: {
      label: '撕牌',
      params: {
        count: { type: 'expr', default: 1, desc: '撕牌数量' },
        from: { type: 'select', options: ['deck_top', 'deck'], default: 'deck_top', desc: '从何处' }
      },
      desc: '从牌库顶弃置N张牌（不进入手牌）'
    },

    // ---- 区域移动 ----
    move_to_hand: {
      label: '置入手牌',
      params: {
        from_zone: { type: 'select', options: ['grave', 'deck', 'banish'], default: 'grave', desc: '来源区域' },
        count: { type: 'expr', default: 1, desc: '数量' }
      },
      desc: '从某区域将牌移入手牌'
    },
    move_to_deck: {
      label: '移回牌库',
      params: {
        from_zone: { type: 'select', options: ['hand', 'grave'], default: 'grave', desc: '来源区域' }
      },
      desc: '将牌移回牌库'
    },
    banish: {
      label: '放逐',
      params: {},
      desc: '将牌移出游戏（放逐区）'
    },
    return_to_hand: {
      label: '返回手牌',
      params: {},
      desc: '将场上的牌返回手牌（弹回）'
    },

    // ---- 属性修改 ----
    modify_atk: {
      label: '修改攻击',
      params: {
        delta: { type: 'expr', default: 1, desc: '变化量（正增负减）' },
        duration: { type: 'select', options: ['permanent', 'this_turn', 'this_combat'], default: 'this_turn', desc: '持续时间' }
      },
      desc: '修改目标的攻击力'
    },
    modify_hp: {
      label: '修改生命',
      params: {
        delta: { type: 'expr', default: 1, desc: '变化量' },
        duration: { type: 'select', options: ['permanent', 'this_turn', 'this_combat'], default: 'this_turn', desc: '持续时间' }
      },
      desc: '修改目标的生命值'
    },
    set_atk: {
      label: '设为攻击',
      params: { value: { type: 'expr', default: 3, desc: '目标攻击值' } },
      desc: '将攻击力设为固定值（形态牌）'
    },
    set_hp: {
      label: '设为生命',
      params: { value: { type: 'expr', default: 4, desc: '目标生命值' } },
      desc: '将生命值设为固定值（形态牌）'
    },

    // ---- 关键词 ----
    grant_keyword: {
      label: '赋予关键词',
      params: {
        keyword: { type: 'select', options: [
          'swift',           // 迅捷
          'double_strike',   // 连击
          'pierce',          // 贯通
          'veil',            // 帷幕
          'tenacity',        // 不屈
          'fatal',           // 必杀
          'immune_combat',   // 免疫战斗伤害
          'battle_no_fire',  // 战斗牌不消耗鬼火
          'can_attack_again',// 可再次出击
          'cannot_be_targeted' // 无法被指定
        ], default: 'swift', desc: '关键词类型' },
        duration: { type: 'select', options: ['permanent', 'this_turn', 'this_combat'], default: 'this_turn', desc: '持续时间' }
      },
      desc: '赋予目标一个关键词能力'
    },
    remove_keyword: {
      label: '移除关键词',
      params: {
        keyword: { type: 'select', options: [
          'swift','double_strike','pierce','veil','tenacity','fatal','immune_combat','battle_no_fire'
        ], default: 'swift', desc: '关键词类型' }
      },
      desc: '移除目标的一个关键词'
    },

    // ---- 气绝与复活 ----
    apply_ko: {
      label: '气绝',
      params: {
        countdown: { type: 'expr', default: 3, desc: '气绝倒计时' }
      },
      desc: '使式神进入气绝状态'
    },
    revive: {
      label: '复活',
      params: {},
      desc: '复活气绝中的式神'
    },
    destroy: {
      label: '消灭',
      params: {},
      desc: '直接消灭式神（不触发气绝）'
    },

    // ---- 倒计时 ----
    set_countdown: {
      label: '设置倒计时',
      params: { value: { type: 'expr', default: 1, desc: '倒计时值' } },
      desc: '设置目标的倒计时'
    },
    modify_countdown: {
      label: '修改倒计时',
      params: { delta: { type: 'expr', default: -1, desc: '倒计时变化量' } },
      desc: '修改目标倒计时（正增负减）'
    },

    // ---- 能量 ----
    set_energy: {
      label: '设置能量',
      params: { value: { type: 'expr', default: 1, desc: '能量值' } },
      desc: '设置目标的能量值'
    },
    modify_energy: {
      label: '修改能量',
      params: { delta: { type: 'expr', default: 1, desc: '能量变化量' } },
      desc: '修改目标能量'
    },

    // ---- 灵咒 ----
    apply_curse: {
      label: '结附灵咒',
      params: {
        curse_name: { type: 'string', default: '', desc: '灵咒名称' },
        layers: { type: 'expr', default: 1, desc: '层数' }
      },
      desc: '给目标结附灵咒'
    },
    remove_curse: {
      label: '移除灵咒',
      params: {
        curse_name: { type: 'string', default: '', desc: '灵咒名称' },
        layers: { type: 'expr', default: 1, desc: '移除层数' }
      },
      desc: '移除目标灵咒层数'
    },
    remove_all_curses: {
      label: '移除所有灵咒',
      params: {},
      desc: '移除目标的所有灵咒'
    },

    // ---- 召唤与复制 ----
    summon: {
      label: '召唤',
      params: {
        card_name: { type: 'string', default: '', desc: '召唤物卡牌名称' }
      },
      desc: '在场上召唤一个召唤物'
    },
    copy_card: {
      label: '复制卡牌',
      params: {
        from_zone: { type: 'select', options: ['hand', 'deck', 'grave', 'field'], default: 'grave', desc: '复制来源' },
        count: { type: 'expr', default: 1, desc: '复制数量' }
      },
      desc: '复制一张牌到手牌'
    },
    transform: {
      label: '变形',
      params: {
        into_card: { type: 'string', default: '', desc: '变形目标卡牌名' }
      },
      desc: '将式神变为另一形态'
    },

    // ---- 幻境 ----
    create_realm: {
      label: '展开幻境',
      params: {
        card_name: { type: 'string', default: '', desc: '幻境牌名称' },
        durability: { type: 'expr', default: 1, desc: '耐久度' }
      },
      desc: '展开一个幻境'
    },
    modify_realm_durability: {
      label: '修改幻境耐久',
      params: {
        delta: { type: 'expr', default: -1, desc: '耐久变化' }
      },
      desc: '修改幻境耐久度'
    },

    // ---- 鬼火与出击 ----
    modify_fire: {
      label: '修改鬼火',
      params: {
        delta: { type: 'expr', default: 1, desc: '鬼火变化量' }
      },
      desc: '增加或减少鬼火'
    },
    reset_attack_chance: {
      label: '恢复出击次数',
      params: {},
      desc: '恢复本回合出击次数'
    },
    gain_extra_attack: {
      label: '获得额外出击',
      params: {},
      desc: '获得一次额外的出击机会'
    },

    // ---- 检索与查看 ----
    search_deck: {
      label: '检索牌库',
      params: {
        filter_owner: { type: 'string', default: '', desc: '限定式神（空=不限）' },
        filter_type: { type: 'string', default: '', desc: '限定类型（空=不限）' },
        count: { type: 'expr', default: 1, desc: '检索数量' }
      },
      desc: '从牌库检索符合条件的牌'
    },
    generate_random_cards: {
      label: '随机获得卡牌',
      params: {
        filter_owner: { type: 'string', default: '', desc: '限定式神（空=不限）' },
        filter_type: { type: 'string', default: '', desc: '限定类型（空=不限）' },
        count: { type: 'expr', default: 1, desc: '获得数量' }
      },
      desc: '从卡牌池中随机获得符合条件的牌（不消耗牌库）'
    },
    look_at_deck: {
      label: '查看牌库顶',
      params: { count: { type: 'expr', default: 3, desc: '查看数量' } },
      desc: '查看牌库顶N张牌'
    },

    // ---- 无效化 ----
    negate: {
      label: '无效化',
      params: {},
      desc: '无效化目标的卡牌效果'
    },

    // ---- 占卜 ----
    divine: {
      label: '占卜',
      params: { count: { type: 'expr', default: 1, desc: '占卜数量' } },
      desc: '查看牌库顶N张牌并可调整顺序'
    },

    // ---- 骰子 ----
    roll_dice: {
      label: '投骰子',
      params: {
        min: { type: 'expr', default: 1, desc: '最小值' },
        max: { type: 'expr', default: 6, desc: '最大值' }
      },
      desc: '投掷一个随机数并存储结果'
    },

    // ---- 控制 ----
    stun: {
      label: '眩晕',
      params: {},
      desc: '使式神本回合无法出击'
    },
    force_attack: {
      label: '强制出击',
      params: {},
      desc: '强制式神本回合必须出击'
    },

    // ---- 派系相关 ----
    change_faction: {
      label: '改变派系',
      params: {
        faction: { type: 'select', options: ['苍叶','红莲','青岚','紫岩'], default: '苍叶', desc: '目标派系' }
      },
      desc: '改变式神的派系'
    },

    // ---- 杂项 ----
    deal_damage_equal_to_atk: {
      label: '造成等同于攻击的伤害',
      params: {},
      desc: '对目标造成等同于来源攻击力的伤害'
    },
    swap_atk_hp: {
      label: '交换攻击与生命',
      params: {},
      desc: '交换目标的攻击和生命值'
    }
  },

  // ==============================================================
  //  二、触发器模块 (Trigger) —— 效果何时触发
  // ==============================================================
  triggers: {

    // ---- 卡牌使用相关 ----
    on_play: {
      label: '使用时',
      desc: '此牌被使用时触发',
      provides_context: ['card', 'player', 'owner_shikigami']
    },
    on_hand_enter: {
      label: '进入手牌时',
      desc: '牌进入手牌时触发',
      provides_context: ['card', 'player']
    },

    // ---- 战斗相关 ----
    on_attack: {
      label: '攻击时',
      desc: '式神发起攻击时触发',
      provides_context: ['attacker', 'defender', 'is_player_attack']
    },
    on_attacked: {
      label: '被攻击时',
      desc: '式神被选为攻击目标时触发',
      provides_context: ['attacker', 'defender']
    },
    on_combat_start: {
      label: '战斗开始时',
      desc: '战斗阶段开始时触发',
      provides_context: ['player']
    },
    on_combat_end: {
      label: '战斗结束时',
      desc: '一次战斗结算完毕后触发',
      provides_context: ['attacker', 'defender', 'result']
    },

    // ---- 伤害相关 ----
    on_deal_damage: {
      label: '造成伤害时',
      desc: '式神/卡牌造成伤害后触发',
      provides_context: ['source', 'target', 'amount', 'is_combat_damage']
    },
    on_take_damage: {
      label: '受到伤害时',
      desc: '受到伤害后触发',
      provides_context: ['source', 'target', 'amount']
    },

    // ---- 消灭与气绝 ----
    on_kill: {
      label: '消灭式神时',
      desc: '消灭敌方式神时触发',
      provides_context: ['killer', 'killed']
    },
    on_ko: {
      label: '气绝时',
      desc: '式神进入气绝状态时触发',
      provides_context: ['shikigami', 'killer']
    },
    on_revive: {
      label: '复活时',
      desc: '式神从气绝中复活时触发',
      provides_context: ['shikigami']
    },

    // ---- 回合相关 ----
    on_turn_start: {
      label: '回合开始时',
      desc: '己方回合开始时触发',
      provides_context: ['player', 'turn_number']
    },
    on_turn_end: {
      label: '回合结束时',
      desc: '己方回合结束时触发',
      provides_context: ['player', 'turn_number']
    },
    on_opponent_turn_start: {
      label: '敌方回合开始时',
      desc: '敌方回合开始时触发',
      provides_context: ['player', 'turn_number']
    },
    on_opponent_turn_end: {
      label: '敌方回合结束时',
      desc: '敌方回合结束时触发',
      provides_context: ['player', 'turn_number']
    },

    // ---- 抽牌相关 ----
    on_draw: {
      label: '抽牌时',
      desc: '从牌库抽牌时触发',
      provides_context: ['player', 'card']
    },
    on_discard: {
      label: '弃牌时',
      desc: '弃置手牌时触发',
      provides_context: ['player', 'card']
    },

    // ---- 对方行动 ----
    on_opponent_play: {
      label: '对方打牌时',
      desc: '对手打出一张牌时触发',
      provides_context: ['opponent', 'card']
    },
    on_opponent_attack: {
      label: '对方攻击时',
      desc: '对方式神攻击时触发',
      provides_context: ['opponent', 'attacker', 'defender']
    },

    // ---- 响应 ----
    on_response: {
      label: '响应',
      desc: '作为响应牌自动触发。需配合 responds_to 指定响应何事。',
      provides_context: ['trigger_event', 'trigger_context'],
      special: 'response_card'  // 标记此触发器需要特殊处理
    },

    // ---- 持续/光环 ----
    aura: {
      label: '光环（持续）',
      desc: '只要此牌在场，效果持续生效',
      provides_context: ['card'],
      special: 'continuous'
    },

    // ---- 增强（静态永久效果） ----
    enhance: {
      label: '增强',
      desc: '根据游戏全局状态永久提升（每局游戏累计）',
      provides_context: ['game_state'],
      special: 'static_permanent'
    },

    // ---- 倒计时相关 ----
    on_countdown_zero: {
      label: '倒计时归零时',
      desc: '倒计时从1变为0时触发',
      provides_context: ['shikigami']
    },
    on_countdown_tick: {
      label: '倒计时减少时',
      desc: '每次倒计时减1时触发',
      provides_context: ['shikigami', 'new_value']
    },

    // ---- 灵咒相关 ----
    on_curse_applied: {
      label: '灵咒结附时',
      desc: '灵咒被结附到式神上时触发',
      provides_context: ['shikigami', 'curse_name', 'layers']
    },
    on_curse_removed: {
      label: '灵咒移除时',
      desc: '灵咒从式神上移除时触发',
      provides_context: ['shikigami', 'curse_name']
    },

    // ---- 幻境相关 ----
    on_realm_destroyed: {
      label: '幻境破坏时',
      desc: '幻境耐久归零被破坏时触发',
      provides_context: ['realm_card', 'destroyer']
    },

    // ---- 出击相关 ----
    on_charge: {
      label: '出击时',
      desc: '式神通过出击进入战斗区时触发',
      provides_context: ['shikigami', 'player']
    },

    // ---- 形态变化 ----
    on_form_change: {
      label: '形态变化时',
      desc: '式神更换形态时触发',
      provides_context: ['shikigami', 'old_form', 'new_form']
    }
  },

  // ==============================================================
  //  三、条件模块 (Condition) —— 筛选与判断
  // ==============================================================
  conditions: {

    // ---- 目标过滤 ----
    target_filter: {
      label: '目标筛选',
      params: {
        side: { type: 'select', options: ['self','ally','enemy','any'], default: 'enemy', desc: '阵营' },
        card_type: { type: 'select', options: ['any','shikigami','summon','spell','battle','form','realm','curse','xiezhan'], default: 'any', desc: '卡牌类型' }
      },
      desc: '按阵营和类型过滤目标'
    },

    // ---- 状态判断 ----
    has_ko: {
      label: '气绝中',
      params: { value: { type: 'boolean', default: true, desc: '是否气绝中' } },
      desc: '判断目标是否处于气绝状态'
    },
    has_countdown: {
      label: '有倒计时',
      params: { value: { type: 'boolean', default: true, desc: '是否有倒计时' } },
      desc: '判断目标是否有倒计时'
    },
    has_energy: {
      label: '有能量',
      params: { value: { type: 'boolean', default: true, desc: '是否有能量' } },
      desc: '判断目标是否有能量'
    },
    has_curse: {
      label: '有特定灵咒',
      params: { curse_name: { type: 'string', default: '', desc: '灵咒名称' } },
      desc: '判断目标是否结附了特定灵咒'
    },
    in_battle_zone: {
      label: '在战斗区',
      params: { value: { type: 'boolean', default: true, desc: '是否在战斗区' } },
      desc: '判断目标是否在战斗区'
    },
    is_attacking: {
      label: '正在攻击',
      params: {},
      desc: '判断目标是否为本次攻击的发起方'
    },

    // ---- 属性比较 ----
    hp_compare: {
      label: '生命比较',
      params: {
        operator: { type: 'select', options: ['gt','lt','eq','gte','lte'], default: 'gt', desc: '比较运算符' },
        value: { type: 'expr', default: 0, desc: '比较值' }
      },
      desc: '比较目标生命值'
    },
    atk_compare: {
      label: '攻击比较',
      params: {
        operator: { type: 'select', options: ['gt','lt','eq','gte','lte'], default: 'gt', desc: '比较运算符' },
        value: { type: 'expr', default: 0, desc: '比较值' }
      },
      desc: '比较目标攻击力'
    },

    // ---- 派系判断 ----
    faction_is: {
      label: '派系是',
      params: {
        faction: { type: 'select', options: ['苍叶','红莲','青岚','紫岩'], default: '苍叶', desc: '派系' }
      },
      desc: '判断目标是否属于特定派系'
    },

    // ---- 计数器判断 ----
    counter_check: {
      label: '计数器判断',
      params: {
        counter: { type: 'select', options: [
          'killed_this_game','ko_this_game','cards_played_this_turn',
          'cards_in_hand','cards_in_deck','cards_in_grave',
          'fire_count','attack_chances','turn_number'
        ], default: 'killed_this_game', desc: '计数器名称' },
        operator: { type: 'select', options: ['gt','lt','eq','gte','lte'], default: 'gt', desc: '比较运算符' },
        value: { type: 'expr', default: 0, desc: '比较值' }
      },
      desc: '比较全局/玩家计数器'
    },

    // ---- 来源判断 ----
    source_is: {
      label: '来源是',
      params: {
        reference: { type: 'select', options: ['self','owner_shikigami','any_friendly'], default: 'self', desc: '来源参照' }
      },
      desc: '判断效果来源是否为特定对象'
    },

    // ---- 数量判断 ----
    field_count: {
      label: '场上数量判断',
      params: {
        side: { type: 'select', options: ['self','ally','enemy','any'], default: 'any', desc: '阵营' },
        card_type: { type: 'select', options: ['any','shikigami','summon'], default: 'any', desc: '卡牌类型' },
        operator: { type: 'select', options: ['gt','lt','eq','gte','lte'], default: 'gt', desc: '比较运算符' },
        value: { type: 'expr', default: 0, desc: '比较值' }
      },
      desc: '判断场上特定类型卡牌数量'
    },

    // ---- 触发上下文关联 ----
    trigger_context: {
      label: '触发上下文关联',
      params: {
        linked_to: { type: 'string', default: '', desc: '关联的管线ID（上一步中受伤/被影响的目标）' }
      },
      desc: '限定条件为 之前步骤中受影响的那些目标'
    },

    // ---- 时机限定 ----
    duration: {
      label: '时效限定',
      params: {
        scope: { type: 'select', options: ['this_turn','this_combat','this_game'], default: 'this_turn', desc: '时效范围' }
      },
      desc: '限定效果仅在特定时间段内可触发'
    }
  },

  // ==============================================================
  //  四、目标选择器 (Target Selector) —— 效果作用于谁
  // ==============================================================
  target_selectors: {
    self: {
      label: '自身',
      desc: '卡牌/式神自身'
    },
    owner_shikigami: {
      label: '所属式神',
      desc: '此牌归属的式神'
    },
    enemy_player: {
      label: '敌方牌手',
      desc: '对方玩家'
    },
    ally_player: {
      label: '己方牌手',
      desc: '自己'
    },
    all_enemies: {
      label: '所有敌人',
      desc: '敌方所有式神和召唤物'
    },
    all_allies: {
      label: '所有友方',
      desc: '己方所有式神和召唤物'
    },
    all_shikigami: {
      label: '所有式神',
      desc: '双方所有式神'
    },
    random_enemy: {
      label: '随机敌人',
      desc: '随机一个敌方式神'
    },
    random_ally: {
      label: '随机友方',
      desc: '随机一个己方式神'
    },
    enemy_in_battle_zone: {
      label: '敌方战斗区式神',
      desc: '敌方战斗区内的式神'
    },
    ally_in_battle_zone: {
      label: '己方战斗区式神',
      desc: '己方战斗区内的式神'
    },
    chosen_by_player: {
      label: '玩家选择',
      desc: '由玩家手动选择目标'
    },
    all_enemies_and_player: {
      label: '所有敌人及牌手',
      desc: '敌方所有式神+敌方牌手'
    },
    all_allies_and_player: {
      label: '所有友方及牌手',
      desc: '己方所有式神+己方牌手'
    },
    dead_allies: {
      label: '气绝中的友方',
      desc: '己方气绝中的式神'
    },
    dead_enemies: {
      label: '气绝中的敌方',
      desc: '敌方气绝中的式神'
    }
  },

  // ==============================================================
  //  五、组合器 (Combinator) —— 如何串联多个动作
  // ==============================================================
  combinators: {
    sequence: {
      label: '依次执行',
      desc: '按顺序执行每个步骤。前一步完成（包括可能触发的下游效果）后执行下一步。',
      children: 'steps[]'
    },
    parallel: {
      label: '同时执行',
      desc: '所有步骤同时生效，互不等待。',
      children: 'steps[]'
    },
    if_else: {
      label: '条件分支',
      desc: '若条件满足执行 then，否则执行 else。',
      children: 'condition + then + else?'
    },
    choice: {
      label: '玩家选择',
      desc: '由玩家从多个选项中选一个执行。',
      children: 'options[]'
    },
    repeat: {
      label: '重复执行',
      desc: '重复执行某步骤 N 次。',
      children: 'count + step'
    },
    for_each: {
      label: '对每个目标',
      desc: '对目标集合中的每个元素依次执行步骤。',
      children: 'target_source + step'
    },
    any_trigger: {
      label: '任一触发',
      desc: '多条管线中，任一触发即执行其动作。适用于响应牌的多条件触发。',
      children: 'pipelines[]'
    }
  },

  // ==============================================================
  //  六、数值表达式 (Value Expression) 类型
  // ==============================================================
  expr_types: {
    constant:     { label: '常量',       example: 3 },
    ref:          { label: '属性引用',   example: { ref: 'owner.atk' }, desc: '引用某对象的属性' },
    counter:      { label: '计数器引用', example: { counter: 'killed_this_game' }, desc: '引用全局计数器' },
    dice:         { label: '骰子结果',   example: { dice: 'last_roll' }, desc: '最近一次骰子结果' },
    add:          { label: '加法',       example: { add: [3, { ref: 'owner.atk' }] } },
    sub:          { label: '减法',       example: { sub: [10, { ref: 'target.hp' }] } },
    mul:          { label: '乘法',       example: { mul: [2, { counter: 'killed_this_game' }] } },
    div:          { label: '除法',       example: { div: [{ ref: 'owner.atk' }, 2] }, desc: '向下取整' },
    min:          { label: '取最小值',   example: { min: [3, { ref: 'target.hp' }] } },
    max:          { label: '取最大值',   example: { max: [1, { ref: 'owner.atk' }] } },
    random_range: { label: '随机范围',   example: { random_range: [1, 6] }, desc: '在范围内随机取值' }
  }
};

// 打印模块总数，方便调试
if (typeof console !== 'undefined') {
  console.log('[EffectModules] ✅ 已加载效果模块注册表：' +
    Object.keys(EFFECT_MODULES.actions).length + ' 个动作, ' +
    Object.keys(EFFECT_MODULES.triggers).length + ' 个触发器, ' +
    Object.keys(EFFECT_MODULES.conditions).length + ' 个条件, ' +
    Object.keys(EFFECT_MODULES.target_selectors).length + ' 个目标选择器, ' +
    Object.keys(EFFECT_MODULES.combinators).length + ' 个组合器, ' +
    Object.keys(EFFECT_MODULES.expr_types).length + ' 种表达式类型'
  );
}
