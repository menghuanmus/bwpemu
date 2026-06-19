// ================================================================
//  百闻牌模拟器 — 卡牌数据库
//  直接编辑此文件来增删卡牌，保存后刷新页面即可生效
//
//  【卡牌类型 type】
//    shikigami = 式神    summon = 召唤物    spell = 法术牌
//    battle    = 战斗牌  form   = 形态牌    realm = 幻境牌
//    curse     = 灵咒    bond = 协战牌
//
//  【排列顺序】
//    官方式神 → DIY式神 → 中立（各区内部按录入先后）
//    官方：author 为空或为"官方"；DIY：author 不为空且不为"官方"
//
//
//  【各类型可用字段一览】
//
//  式神 shikigami:
//    name（名称）, type（类型）, faction（派系）, attack（攻击）, hp（生命）,
//    ability（能力描述）, derivative（衍生物）, effects（模块化效果,可选）,
//    author（作者,可选）, _shop（商店牌,可选）
//
//  召唤物 summon:
//    name（名称）, type（类型）, owner（所属式神）, faction（派系）,
//    attack（攻击）, hp（生命）, ability（能力描述）,
//    derivative（衍生物）, effects（模块化效果,可选）,
//    author（作者,可选）, _shop（商店牌,可选）
//
//  法术牌 spell:
//    name（名称）, type（类型）, owner（所属式神）, level（等级）,
//    awakened（觉醒牌）, atkBonus（攻击加成）, hpBonus（生命加成）,
//    maxStack（最大堆叠,0=不堆叠）, effect（效果描述）,
//    derivative（衍生物）, effects（模块化效果,可选）,
//    rarity（稀有度,可选）, author（作者,可选）,
//    cost_modifier（费用修正,可选）, _shop（商店牌,可选）,
//    _oracle（启悟牌,可选）
//
//  战斗牌 battle:
//    name（名称）, type（类型）, owner（所属式神）, level（等级）,
//    awakened（觉醒牌）, atkBonus（攻击加成）, atkPenalty（攻击减成）,
//    shieldBonus（护盾加成）, shieldPenalty（护盾减成）,
//    effect（效果描述）, derivative（衍生物）, effects（模块化效果,可选）,
//    rarity（稀有度,可选）, author（作者,可选）,
//    cost_modifier（费用修正,可选）, _shop（商店牌,可选）
//
//  形态牌 form:
//    name（名称）, type（类型）, owner（所属式神）, level（等级）,
//    awakened（觉醒牌）, attack（攻击）, hp（生命）,
//    effect（效果描述）, derivative（衍生物）, effects（模块化效果,可选）,
//    rarity（稀有度,可选）, author（作者,可选）, _shop（商店牌,可选）
//
//  幻境牌 realm:
//    name（名称）, type（类型）, owner（所属式神）, level（等级）,
//    awakened（觉醒牌）, durability（耐久）,
//    effect（效果描述）, derivative（衍生物）, effects（模块化效果,可选）,
//    rarity（稀有度,可选）, author（作者,可选）, _shop（商店牌,可选）
//
//  灵咒 curse:
//    name（名称）, type（类型）, owner（所属式神）, effect（效果描述）,
//    author（作者,可选）
//
//  协战牌 bond:
//    name（名称）, type（类型）, owner（所属式神）, level（等级）,
//    awakened（觉醒牌）, atkBonus（攻击加成）, atkPenalty（攻击减成）,
//    shieldBonus（护盾加成）, shieldPenalty（护盾减成）,
//    effect（效果描述）, derivative（衍生物）, effects（模块化效果,可选）,
//    rarity（稀有度,可选）, author（作者,可选）, _shop（商店牌,可选）
//
//  商店牌（以上任意类型 + _shop:true, owner:"商店"）:
//    由商店系统筛选，不影响正常卡牌功能
//
//  字段说明:
//    name          卡牌名称（必填）
//    type          卡牌类型（必填）
//    owner         所属式神（非式神/召唤物填写）
//    faction       派系：苍叶/红莲/青岚/紫岩/无相
//    level         等级 1~3
//    attack        攻击力
//    hp            生命值
//    ability       式神/召唤物基础能力描述文本
//    effect        卡牌效果描述文本（非式神）
//    awakened      是否为觉醒牌（true/false）
//    rarity        稀有度：R / SR / SSR（式神、召唤物、灵咒不需要）
//    author        作者："官方" 或 DIY 作者名（默认"官方"）
//    atkBonus      攻击加成
//    atkPenalty    攻击减成
//    hpBonus       生命加成
//    shieldBonus   护盾加成
//    shieldPenalty 护盾减成
//    durability    幻境耐久值
//    maxStack      最大堆叠数（0=不堆叠, 仅法术牌）
//    derivative    是否为衍生物（true/false）
//    effects       模块化效果JSON（可选，见 effect-modules.js）
//    cost_modifier 费用修正（可选，如{"fire_cost":0}表示不消耗鬼火）
//    _shop         是否为商店牌（true/不填）
//    _oracle       是否为启悟牌（true/不填）
//    _custom       是否为自定义卡牌（系统自动标记）
//    _stack        当前堆叠层数（运行时，由pushCardToHand自动维护）
//    _maxStack     最大堆叠数（运行时，由pushCardToHand自动维护）
//
//  【模块化效果系统】
//  每张卡可添加 effects 字段（JSON结构化），引擎自动解析执行。
//  若无 effects，保留原有 effect/ability 文本字段向后兼容。
//  效果定义格式见 data/effect-modules.js 中的模块注册表。
// ================================================================
var CARD_DB_DATA = [
  // ── 妖刀姬 ──
  {
    "name":"妖刀姬","type":"shikigami","faction":"苍叶","attack":3,"hp":4,
    "ability":"每回合一次，妖刀姬对敌方牌手造成伤害时，抽一张牌。","derivative":false,
    "effects": {
      "combinator": "parallel",
      "pipelines": [
        {
          "trigger": { "on": "on_deal_damage" },
          "condition": { "source_is": { "reference": "self" } },
          "target_selector": "enemy_player",
          "action": { "type": "draw_card", "params": { "count": 1 } }
        }
      ]
    }
  },
  {
    "name":"不祥之刃","type":"battle","owner":"妖刀姬","level":1,"awakened":false,
    "atkBonus":1,"atkPenalty":0,"shieldBonus":0,"shieldPenalty":0,
    "effect":"本次战斗若消灭敌方式神，抽一张牌。","derivative":false,
    "effects": {
      "combinator": "parallel",
      "pipelines": [
        {
          "trigger": { "on": "on_kill" },
          "condition": {
            "source_is": { "reference": "self" },
            "duration": { "scope": "this_combat" }
          },
          "action": { "type": "draw_card", "params": { "count": 1 } }
        }
      ]
    }
  },
  {
    "name":"见切","type":"battle","owner":"妖刀姬","level":1,"awakened":false,
    "atkBonus":1,"atkPenalty":0,"shieldBonus":0,"shieldPenalty":0,
    "effect":"免疫战斗伤害。响应：妖刀姬被攻击时，自动使用此牌。","derivative":false,
    "effects": {
      "trigger": { "on": "on_response", "responds_to": "on_attacked" },
      "action": {
        "combinator": "sequence",
        "steps": [
          { "action": { "type": "grant_keyword", "params": { "keyword": "immune_combat", "duration": "this_combat" } } }
        ]
      }
    }
  },
  {
    "name":"战意","type":"battle","owner":"妖刀姬","level":2,"awakened":false,
    "atkBonus":2,"atkPenalty":0,"shieldBonus":2,"shieldPenalty":0,
    "effect":"","derivative":false
  },
  {
    "name":"一闪","type":"battle","owner":"妖刀姬","level":2,"awakened":false,
    "atkBonus":1,"atkPenalty":0,"shieldBonus":0,"shieldPenalty":0,
    "effect":"不消耗鬼火。","derivative":false,
    "cost_modifier": { "fire_cost": 0 }
  },
  {
    "name":"妖刀万华","type":"form","owner":"妖刀姬","level":3,"awakened":false,
    "attack":3,"hp":8,"effect":"连击","derivative":false,
    "effects": {
      "trigger": { "on": "aura" },
      "target_selector": "self",
      "action": { "type": "grant_keyword", "params": { "keyword": "double_strike", "duration": "permanent" } }
    }
  },
  {
    "name":"杀念","type":"spell","owner":"妖刀姬","level":3,"awakened":false,
    "atkBonus":0,"hpBonus":0,
    "effect":"将随机三张妖刀姬的战斗牌置入手牌。","derivative":false,
    "effects": {
      "trigger": { "on": "on_play" },
      "target_selector": "ally_player",
      "action": {
        "type": "generate_random_cards",
        "params": { "filter_owner": "妖刀姬", "filter_type": "battle", "count": 3 }
      }
    }
  },
  {
    "name":"觉醒·妖刀姬","type":"spell","owner":"妖刀姬","level":3,"awakened":true,
    "atkBonus":1,"hpBonus":1,
    "effect":"觉醒：迅捷，妖刀姬对敌方牌手造成伤害时，她的战斗牌本回合不消耗鬼火。","derivative":false,
    "effects": {
      "combinator": "parallel",
      "pipelines": [
        {
          "trigger": { "on": "aura" },
          "target_selector": "self",
          "action": { "type": "grant_keyword", "params": { "keyword": "swift", "duration": "permanent" } }
        },
        {
          "trigger": { "on": "on_deal_damage" },
          "condition": { "source_is": { "reference": "self" } },
          "target_selector": "enemy_player",
          "action": { "type": "grant_keyword", "params": { "keyword": "battle_no_fire", "duration": "this_turn" } }
        }
      ]
    }
  },
  {
    "name":"禁锢之刃","type":"battle","owner":"妖刀姬","level":2,"awakened":false,
    "atkBonus":0,"atkPenalty":0,"shieldBonus":2,"shieldPenalty":0,
    "effect":"增强：本局游戏妖刀姬每消灭一个式神，此牌永久获得+2攻击。","derivative":false,
    "effects": {
      "trigger": { "on": "enhance" },
      "condition": {
        "counter_check": {
          "counter": "killed_this_game",
          "operator": "gt",
          "value": 0
        }
      },
      "target_selector": "self",
      "action": {
        "type": "modify_atk",
        "params": {
          "delta": { "mul": [2, { "counter": "killed_this_game" }] },
          "duration": "permanent"
        }
      }
    }
  },

  // ── 大天狗 ──
  { "name":"大天狗", "type":"shikigami", "faction":"苍叶", "attack":3, "hp":4,
    "ability":"大天狗使用法术后，倒计时2：再次使用该法术。", "derivative":false },
  { "name":"黑羽之刃", "type":"spell", "owner":"大天狗", "level":2, "rarity":"R",
    "effect":"投射：造成4点伤害，若消灭敌方式神则抽一张牌。" },
  { "name":"天狗风乱", "type":"spell", "owner":"大天狗", "level":2, "rarity":"R",
    "effect":"造成6点伤害，随机分配给所有敌方角色。" },
  { "name":"暴风之主", "type":"form", "owner":"大天狗", "level":2, "rarity":"SR", "attack":4, "hp":6,
    "effect":"大天狗使用法术后，对受影响的敌方式神各造成1点伤害。" },
  { "name":"风神一扇", "type":"spell", "owner":"大天狗", "level":1, "rarity":"SR",
    "effect":"投射：造成2点伤害，然后将受到此伤害的式神移回准备区。" },
  { "name":"羽刃暴风", "type":"spell", "owner":"大天狗", "level":3, "rarity":"R",
    "effect":"对所有敌方角色造成3点伤害。" },
  { "name":"暴风之盾", "type":"spell", "owner":"大天狗", "level":1, "rarity":"R",
    "effect":"使一个己方式神获得2护盾并在下个回合开始时再获得2护盾。响应：当你战斗区式神被攻击时，自动对其使用。" },
  { "name":"吾即正义", "type":"spell", "owner":"大天狗", "level":1, "rarity":"SR",
    "effect":"瞬发，随机获得一张大天狗的不大于自身等级的其他法术牌。增强：本局游戏大天狗若使用过10次法术，则此牌变为消灭所有敌方式神。" },
  { "name":"觉醒·大天狗", "type":"spell", "owner":"大天狗", "level":3, "rarity":"SSR", "awakened":true, "atkBonus":2, "hpBonus":2,
    "effect":"使大天狗的倒计时-1。觉醒：大天狗使用法术后，倒计时1：再次使用该法术。" },

  // ── 桃花妖 ──
  { "name":"桃花妖", "type":"shikigami", "faction":"红莲", "attack":1, "hp":6,
    "ability":"桃花妖治疗或复活己方式神时，使该式神获得1攻击。", "derivative":false },
  { "name":"桃之馨息", "type":"spell", "owner":"桃花妖", "level":1, "rarity":"R",
    "effect":"为一个角色恢复5生命。" },
  { "name":"花信风", "type":"spell", "owner":"桃花妖", "level":1, "rarity":"SR",
    "effect":"瞬发，选择一个己方式神，将牌库中随机一张该式神的牌置入手牌。" },
  { "name":"桃之夭夭", "type":"spell", "owner":"桃花妖", "level":2, "rarity":"SR",
    "effect":"不消耗鬼火，鼓舞：获得+2攻击与+2护盾。",
    "cost_modifier": { "fire_cost": 0 } },
  { "name":"丰实", "type":"form", "owner":"桃花妖", "level":2, "rarity":"R", "attack":3, "hp":7,
    "effect":"进场和己方回合开始时，随机为一个己方受伤式神恢复3生命。" },
  { "name":"桃华灼灼", "type":"spell", "owner":"桃花妖", "level":3, "rarity":"SSR",
    "effect":"若桃花妖未气绝，此牌得瞬发。复活己方式神。（桃花妖气绝时可用）" },
  { "name":"盛开", "type":"form", "owner":"桃花妖", "level":3, "rarity":"R", "attack":4, "hp":9,
    "effect":"进场和己方回合开始时，随机为一个己方受伤式神恢复2生命，将此过程再重复2次。" },
  { "name":"桃语春风", "type":"spell", "owner":"桃花妖", "level":2, "rarity":"R",
    "effect":"复活一个己方式神并使其获得迅捷。" },
  { "name":"觉醒·桃花妖", "type":"spell", "owner":"桃花妖", "level":3, "rarity":"SR", "awakened":true, "atkBonus":2, "hpBonus":1,
    "effect":"觉醒：桃花妖治疗或复活己方式神时，使该式神永久获得2攻击及2生命。" },
  { "name":"繁花似锦", "type":"bond", "owner":"桃花妖", "level":2, "rarity":"SR",
    "effect":"选择使用一项：桃花妖-桃红簇簇 樱花妖-落英缤纷" },

  // ── 雪女 ──
  { "name":"雪女", "type":"shikigami", "faction":"青岚", "attack":2, "hp":5,
    "ability":"每回合一次，当你眩晕敌方式神时，将一张「雪球」置入手牌。", "derivative":false },
  { "name":"冰墙", "type":"spell", "owner":"雪女", "level":1, "rarity":"SR",
    "effect":"在战斗区召唤一个冰墙。" },
  { "name":"吹雪", "type":"spell", "owner":"雪女", "level":1, "rarity":"R",
    "effect":"造成3点伤害，将一张「雪球」置入手牌。" },
  { "name":"崩雪", "type":"spell", "owner":"雪女", "level":2, "rarity":"R",
    "effect":"消灭一个眩晕的式神或眩晕一个未眩晕的式神。" },
  { "name":"冰风暴", "type":"form", "owner":"雪女", "level":2, "rarity":"SR", "attack":3, "hp":5,
    "effect":"每当敌方式神攻击后，对其造成1点伤害，然后眩晕受到此伤害的式神。" },
  { "name":"觉醒·雪女", "type":"spell", "owner":"雪女", "level":3, "rarity":"SSR", "awakened":true, "atkBonus":2, "hpBonus":1,
    "effect":"觉醒：眩晕受到雪女伤害的式神。每回合一次，当你眩晕敌方式神时，将一张「雪球」置入手牌。" },
  { "name":"流霰", "type":"spell", "owner":"雪女", "level":3, "rarity":"SR",
    "effect":"对一个敌方角色使用一张「雪球」，本局游戏你每从手牌使用过一张「雪球」额外重复一次。" },
  { "name":"寒冰之盾", "type":"spell", "owner":"雪女", "level":1, "rarity":"R",
    "effect":"使一个己方式神获得2护盾且本回合获得「眩晕受到其战斗伤害的式神。」响应：当你战斗区式神被攻击时，自动对其使用。" },
  { "name":"寒冬之心", "type":"spell", "owner":"雪女", "level":2, "rarity":"R",
    "effect":"将两张「雪球」置入手牌。本局游戏你所有「雪球」的伤害+1。" },
  { "name":"冰霜永冻", "type":"bond", "owner":"雪女", "level":1, "rarity":"SSR",
    "effect":"选择使用一项：雪女-冰封 雪童子-雪刃" },
  { "name":"冰墙", "type":"summon", "owner":"雪女", "faction":"青岚", "attack":2, "hp":4,
    "ability":"不能发动攻击；眩晕对其造成战斗伤害的式神。", "derivative":true },
  { "name":"雪球", "type":"spell", "owner":"雪女", "level":1,
    "effect":"瞬发，对一个敌方式神造成1点伤害。", "derivative":true },

  // ── 青行灯 ──
  { "name":"青行灯", "type":"shikigami", "faction":"青岚", "attack":2, "hp":5,
    "ability":"敌方回合开始时若你有剩余鬼火，获得一张「明灯」。", "derivative":false },
  { "name":"明灯", "type":"spell", "owner":"青行灯", "level":1, "rarity":"R",
    "effect":"瞬发，你获得1点鬼火。" },
  { "name":"青灯夜谈", "type":"spell", "owner":"青行灯", "level":1, "rarity":"R",
    "effect":"检视牌库顶三张牌然后选择一张置入手牌。你每有1点鬼火便重复一次。清空你的鬼火。" },
  { "name":"幽光之火", "type":"form", "owner":"青行灯", "level":1, "rarity":"R", "attack":4, "hp":5,
    "effect":"当青行灯对敌方牌手造成战斗伤害时，获得一张「明灯」。" },
  { "name":"百闻一得", "type":"spell", "owner":"青行灯", "level":2, "rarity":"SR",
    "effect":"弃掉一张「明灯」，使一个己方最低等级的式神等级+1。若其等级已为3则改为抽一张牌。" },
  { "name":"百物语之火", "type":"form", "owner":"青行灯", "level":2, "rarity":"SR", "attack":4, "hp":5,
    "effect":"己方回合结束时，你获得1点鬼火。" },
  { "name":"涅槃明灯", "type":"bond", "owner":"青行灯", "level":2, "rarity":"SSR",
    "effect":"选择使用一项：凤凰火-涅槃业火 青行灯-烛火重燃" },
  { "name":"吸魂灯", "type":"spell", "owner":"青行灯", "level":3, "rarity":"SSR",
    "effect":"投射：造成5点伤害。你每有1点鬼火便重复一次。清空你的鬼火。" },
  { "name":"不灭之火", "type":"form", "owner":"青行灯", "level":3, "rarity":"R", "attack":4, "hp":5,
    "effect":"当此牌被消灭时，消耗1点鬼火，返回场上。" },
  { "name":"觉醒·青行灯", "type":"spell", "owner":"青行灯", "level":3, "rarity":"SR", "awakened":true, "atkBonus":1, "hpBonus":1,
    "effect":"觉醒：敌方回合开始时若你有剩余鬼火，获得一张「明灯」。你的鬼火不会自动清除，最大可存4点。" },

  // ── 妖琴师 ──
  { "name":"妖琴师", "type":"shikigami", "faction":"苍叶", "attack":3, "hp":4,
    "ability":"倒计时3：为己方所有角色恢复3生命。", "derivative":false },
  { "name":"惊弦", "type":"spell", "owner":"妖琴师", "level":1, "rarity":"R",
    "effect":"使一个式神的倒计时-2。" },
  { "name":"觉醒·入阵歌", "type":"spell", "owner":"妖琴师", "level":1, "rarity":"SR", "awakened":true, "atkBonus":0, "hpBonus":1,
    "effect":"使妖琴师的倒计时-3。觉醒：「倒计时3：造成4点伤害，随机分配给所有敌方角色。」" },
  { "name":"大合奏", "type":"spell", "owner":"妖琴师", "level":1, "rarity":"SSR",
    "effect":"瞬发。增强：本局游戏妖琴师的基础能力每生效过一种，此牌便具有对应效果。" },
  { "name":"疯魔琴心", "type":"spell", "owner":"妖琴师", "level":2, "rarity":"SR",
    "effect":"使一个敌方式神的倒计时+2，使妖琴师的倒计时-2。" },
  { "name":"魔音扰心", "type":"spell", "owner":"妖琴师", "level":2, "rarity":"SR",
    "effect":"敌方牌手本回合使用的下一张牌不会生效。响应：当敌方牌手使用牌时，自动使用。" },
  { "name":"觉醒·神乐歌", "type":"spell", "owner":"妖琴师", "level":2, "rarity":"SR", "awakened":true, "atkBonus":1, "hpBonus":1,
    "effect":"使妖琴师的倒计时-3。觉醒：「倒计时3：己方其他式神倒计时-1并获得1攻击与1生命。」" },
  { "name":"风之乐章", "type":"bond", "owner":"妖琴师", "level":2, "rarity":"SSR",
    "effect":"选择使用一项：一目连-风韵雅乐 妖琴师-幻音绝弦" },
  { "name":"余音", "type":"spell", "owner":"妖琴师", "level":3, "rarity":"SR",
    "effect":"使妖琴师的倒计时-3，使己方其他未气绝式神的倒计时-1。" },
  { "name":"觉醒·镇魂歌", "type":"spell", "owner":"妖琴师", "level":3, "rarity":"SR", "awakened":true, "atkBonus":1, "hpBonus":1,
    "effect":"使妖琴师的倒计时-3。觉醒：「倒计时3：抽一张牌，获得1点鬼火。」" },

  // ── 青坊主 ──
  { "name":"青坊主", "type":"shikigami", "faction":"紫岩", "attack":1, "hp":6,
    "ability":"每当你恢复生命时，随机对两个敌方角色造成1点伤害。", "derivative":false },
  { "name":"佛印", "type":"spell", "owner":"青坊主", "level":1, "rarity":"R",
    "effect":"瞬发，为双方牌手恢复4生命。" },
  { "name":"禅心", "type":"form", "owner":"青坊主", "level":1, "rarity":"SR", "attack":1, "hp":6,
    "effect":"每回合一次，当你恢复生命时，抽一张牌。" },
  { "name":"慈悲", "type":"spell", "owner":"青坊主", "level":1, "rarity":"R",
    "effect":"使一个己方式神获得不屈。" },
  { "name":"佛光", "type":"spell", "owner":"青坊主", "level":2, "rarity":"R",
    "effect":"为一个角色恢复3生命，然后为其操控者的所有角色恢复3生命。" },
  { "name":"舍生", "type":"spell", "owner":"青坊主", "level":2, "rarity":"SSR",
    "effect":"瞬发。消灭青坊主，本回合你免疫所有伤害。响应：当你将受到致命伤害时，自动使用。" },
  { "name":"法界唯心", "type":"form", "owner":"青坊主", "level":3, "rarity":"R", "attack":5, "hp":6,
    "effect":"你对敌方的恢复生命效果改为伤害效果。" },
  { "name":"觉醒·青坊主", "type":"spell", "owner":"青坊主", "level":3, "rarity":"SR", "awakened":true, "atkBonus":2, "hpBonus":0,
    "effect":"恢复8生命。觉醒：当你恢复生命时，对所有敌人造成1点伤害。" },
  { "name":"轮回", "type":"spell", "owner":"青坊主", "level":3, "rarity":"SR",
    "effect":"你的生命变为10。增强：本局游戏你每被对手攻击过一次，此牌效果+1。" },

  // ── 凤凰火 ──
  { "name":"凤凰火", "type":"shikigami", "faction":"红莲", "attack":2, "hp":4,
    "ability":"当凤凰火使用法术牌时，投射：造成1点伤害。", "derivative":false },
  { "name":"凤鸣", "type":"spell", "owner":"凤凰火", "level":1, "rarity":"R",
    "effect":"瞬发，对敌方牌手造成2点伤害。" },
  { "name":"瑞翔", "type":"spell", "owner":"凤凰火", "level":1, "rarity":"R",
    "effect":"对所有敌方式神造成1点伤害。" },
  { "name":"引燃", "type":"spell", "owner":"凤凰火", "level":1, "rarity":"SR",
    "effect":"对一个式神造成2点伤害，若消灭则再对它的牌手造成2点伤害。" },
  { "name":"焚羽", "type":"form", "owner":"凤凰火", "level":2, "rarity":"SR", "attack":4, "hp":6,
    "effect":"凤凰火造成的所有非战斗伤害+1。" },
  { "name":"凤火", "type":"spell", "owner":"凤凰火", "level":2, "rarity":"R",
    "effect":"对一个式神造成5点伤害。" },
  { "name":"觉醒·凤凰火", "type":"spell", "owner":"凤凰火", "level":2, "rarity":"SR", "awakened":true, "atkBonus":1, "hpBonus":1,
    "effect":"觉醒：当己方式神使用法术牌时，投射：造成1点伤害。" },
  { "name":"炎舞", "type":"spell", "owner":"凤凰火", "level":3, "rarity":"SSR",
    "effect":"贯通，投射：造成5点伤害。增强：本局游戏凤凰火每对敌方牌手造成一次伤害，此牌伤害+1。" },
  { "name":"出云", "type":"form", "owner":"凤凰火", "level":3, "rarity":"SR", "attack":5, "hp":5,
    "effect":"当凤凰火使用法术牌时，将一张「凤火」置入手牌。" },

  // ── 书翁 ──
  { "name":"书翁", "type":"shikigami", "faction":"青岚", "attack":1, "hp":5,
    "ability":"起始手牌数量+1。", "derivative":false },
  { "name":"纪行", "type":"form", "owner":"书翁", "level":1, "rarity":"R", "attack":2, "hp":5,
    "effect":"迅捷，当书翁对敌方牌手造成伤害时，抽一张牌。" },
  { "name":"云游", "type":"spell", "owner":"书翁", "level":1, "rarity":"R",
    "effect":"瞬发，调度你的手牌。（3次调度次数）" },
  { "name":"开卷", "type":"spell", "owner":"书翁", "level":2, "rarity":"R",
    "effect":"抽两张牌。" },
  { "name":"墨染", "type":"spell", "owner":"书翁", "level":2, "rarity":"SR",
    "effect":"抽一张牌，对一个式神造成等同于你手牌数量一半的伤害。" },
  { "name":"明心", "type":"form", "owner":"书翁", "level":2, "rarity":"R", "attack":4, "hp":5,
    "effect":"回合开始的抽牌改为检视牌库顶三张牌然后选择一张置入手牌。" },
  { "name":"闻世", "type":"form", "owner":"书翁", "level":3, "rarity":"SR", "attack":1, "hp":1,
    "effect":"每有一张其它手牌此牌便获得1攻击与1生命。" },
  { "name":"万象之书", "type":"spell", "owner":"书翁", "level":3, "rarity":"SR",
    "effect":"瞬发，随机将其他己方式神的各一张牌置入手牌。" },
  { "name":"觉醒·书翁", "type":"spell", "owner":"书翁", "level":3, "rarity":"SSR", "awakened":true, "atkBonus":2, "hpBonus":2,
    "effect":"觉醒：在本局游戏剩余时间内，每当你抽牌时若牌库里没有牌，则改对敌方牌手造成10点伤害，你不会因此输掉游戏。" },

  // ── 鸦天狗 ──
  { "name":"鸦天狗", "type":"shikigami", "faction":"苍叶", "attack":1, "hp":6,
    "ability":"当鸦天狗移动时，投射：造成1点伤害。", "derivative":false },
  { "name":"追风", "type":"spell", "owner":"鸦天狗", "level":1, "rarity":"R",
    "effect":"瞬发，移动鸦天狗，抽一张牌。" },
  { "name":"正义必胜", "type":"battle", "owner":"鸦天狗", "level":1, "rarity":"R",
    "atkBonus":0, "atkPenalty":0, "shieldBonus":0, "shieldPenalty":0,
    "effect":"增强：本回合鸦天狗每移动过一次，此牌获得+2攻击。" },
  { "name":"正义之刺", "type":"battle", "owner":"鸦天狗", "level":2, "rarity":"SR",
    "atkBonus":1, "atkPenalty":0, "shieldBonus":2, "shieldPenalty":0,
    "effect":"若己方战斗区有其他式神，使其先攻击一次。" },
  { "name":"羽迹", "type":"spell", "owner":"鸦天狗", "level":2, "rarity":"SR",
    "effect":"将一个敌方式神移入战斗区并使其眩晕，然后移动鸦天狗。" },
  { "name":"鸦羽疾走", "type":"spell", "owner":"鸦天狗", "level":2, "rarity":"R",
    "effect":"移动，然后再次移动。响应：当鸦天狗被攻击时，自动使用并取消本次攻击。" },
  { "name":"群鸦乱舞", "type":"form", "owner":"鸦天狗", "level":3, "rarity":"R", "attack":2, "hp":8,
    "effect":"己方回合结束时若鸦天狗在战斗区，对敌方所有式神造成1点伤害，鸦天狗恢复等量生命。" },
  { "name":"英雄无畏", "type":"spell", "owner":"鸦天狗", "level":3, "rarity":"SSR",
    "effect":"使一个敌方式神保持眩晕，直到鸦天狗使用牌、攻击或气绝。" },
  { "name":"觉醒·鸦天狗", "type":"spell", "owner":"鸦天狗", "level":3, "rarity":"SR", "awakened":true, "atkBonus":2, "hpBonus":2,
    "effect":"觉醒：当鸦天狗移动时，发动一次攻击，本次攻击具有远程。" },

  // ── 鬼切 ──
  { "name":"鬼切", "type":"shikigami", "faction":"苍叶", "attack":2, "hp":4,
    "ability":"己方回合开始时，选择一个未结附的鬼斩结附于鬼切上。敌方回合结束时，移除所有鬼斩。", "derivative":false },
  { "name":"鬼刃·两断", "type":"battle", "owner":"鬼切", "level":1, "rarity":"R",
    "atkBonus":2, "atkPenalty":0, "shieldBonus":1, "shieldPenalty":0,
    "effect":"响应：当鬼切触发髭切时，自动使用并使鬼切本次战斗获得必杀。" },
  { "name":"鬼影闪", "type":"spell", "owner":"鬼切", "level":1, "rarity":"SR",
    "effect":"瞬发，将鬼切移入战斗区，选择一个未结附的鬼斩结附于鬼切上。抽一张牌。" },
  { "name":"复仇之刃", "type":"form", "owner":"鬼切", "level":1, "rarity":"SR", "attack":2, "hp":6,
    "effect":"鬼切在准备区时视同战斗区一样触发鬼斩。" },
  { "name":"散华之刃", "type":"form", "owner":"鬼切", "level":2, "rarity":"R", "attack":2, "hp":6,
    "effect":"敌方回合鬼切获得3攻击。" },
  { "name":"鬼刃·罗城门", "type":"battle", "owner":"鬼切", "level":2, "rarity":"R",
    "atkBonus":2, "atkPenalty":0, "shieldBonus":1, "shieldPenalty":0,
    "effect":"响应：当鬼切触发友切时，自动使用且本次攻击若消灭式神，反制他使用的法术牌。" },
  { "name":"刀鸣之刃", "type":"form", "owner":"鬼切", "level":3, "rarity":"SR", "attack":3, "hp":8,
    "effect":"当触发鬼斩时，额外复制一次鬼斩的效果。" },
  { "name":"鬼刃·影杀", "type":"battle", "owner":"鬼切", "level":3, "rarity":"R",
    "atkBonus":2, "atkPenalty":0, "shieldBonus":1, "shieldPenalty":0,
    "effect":"直击。响应：当鬼切触发狮子之子时，自动使用并复制两次。" },
  { "name":"觉醒·鬼切", "type":"spell", "owner":"鬼切", "level":3, "rarity":"SSR", "awakened":true, "atkBonus":1, "hpBonus":1,
    "effect":"选择一张鬼切的战斗牌置入手牌。觉醒：己方回合开始时，选择一个未结附的鬼斩结附于鬼切上。鬼切的战斗牌获得瞬发。" },
  { "name":"髭切", "type":"curse", "owner":"鬼切",
    "effect":"敌方回合当敌方式神进入战斗区时若鬼切在战斗区，额外先攻击一次该式神且本次战斗免疫所有伤害。", "derivative":true },
  { "name":"友切", "type":"curse", "owner":"鬼切",
    "effect":"敌方回合当敌方式神使用法术牌时若鬼切在战斗区，额外先攻击一次该式神且本次战斗免疫所有伤害。", "derivative":true },
  { "name":"狮子之子", "type":"curse", "owner":"鬼切",
    "effect":"当敌方回合结束时若鬼切在战斗区且敌方战斗区没有式神，额外先攻击以此敌方牌手，本次战斗获得2攻击。", "derivative":true },
  { "name":"鬼斩", "type":"curse", "owner":"鬼切",
    "effect":"鬼切的专属灵咒，髭切、友切或者狮子之子。", "derivative":true },

  // ── 薰 ──
  { "name":"薰", "type":"shikigami", "faction":"苍叶", "attack":2, "hp":4,
    "ability":"己方回合结束时，使你本回合最后一个攻击的式神结附「鸮之守护」。", "derivative":false },
  { "name":"温柔的守护", "type":"spell", "owner":"薰", "level":1, "rarity":"R",
    "effect":"瞬发，使一个己方式神结附「鸮之守护」。抽一张牌。" },
  { "name":"决意", "type":"form", "owner":"薰", "level":1, "rarity":"R", "attack":2, "hp":4,
    "effect":"己方回合开始时，使你结附「鸮之守护」的式神获得1生命。" },
  { "name":"干扰投掷", "type":"spell", "owner":"薰", "level":1, "rarity":"R",
    "effect":"对一个式神造成1点伤害并使其本回合不能对结附「鸮之守护」的式神造成伤害。响应：当敌方式神攻击你结附「鸮之守护」的式神时，自动对其使用。" },
  { "name":"鸮羽共鸣", "type":"bond", "owner":"薰", "level":1, "rarity":"R",
    "effect":"选择使用一项：山风-庇羽 薰-鸮鸣" },
  { "name":"鸮之利爪", "type":"form", "owner":"薰", "level":2, "rarity":"SR", "attack":3, "hp":6,
    "effect":"结附「鸮之守护」的己方式神获得2攻击。" },
  { "name":"鸮之警惕", "type":"form", "owner":"薰", "level":2, "rarity":"R", "attack":4, "hp":5,
    "effect":"结附「鸮之守护」的己方式神获得帷幕。" },
  { "name":"觉醒·薰", "type":"spell", "owner":"薰", "level":2, "rarity":"SR", "awakened":true, "atkBonus":1, "hpBonus":1,
    "effect":"觉醒：当你的式神攻击时，使其结附「鸮之守护」。" },
  { "name":"祈愿之翼", "type":"spell", "owner":"薰", "level":3, "rarity":"SSR",
    "effect":"「鸮之守护」失去唯一但效果不能叠加。本局游戏中当己方式神结附「鸮之守护」时，改为使己方全体式神结附。" },
  { "name":"鸮之庇佑", "type":"form", "owner":"薰", "level":3, "rarity":"SR", "attack":5, "hp":8,
    "effect":"使一个己方式神结附「鸮之守护」。结附「鸮之守护」的己方式神获得不屈。" },

  // ── 神无月 ──
  { "name":"神无月", "type":"shikigami", "faction":"青岚", "attack":2, "hp":5, "author":"黄衣",
    "ability":`你使用己方幻境后，它自毁。
神无月会被视为你的上个离场幻境，且她的生命被视为耐久。` },
  { "name":"泡影", "type":"realm", "owner":"神无月", "level":1, "durability":1, "rarity":"R", "author":"黄衣",
    "effect":"离场时，占卜2并获得一点鬼火。" },
  { "name":"于无月之地", "type":"realm", "owner":"神无月", "level":1, "durability":1, "rarity":"SR", "author":"黄衣",
    "effect":"己方回合开始时，探寻一张你本局游戏离场过的其他己方非觉醒幻境牌。" },
  { "name":"月隐梦归", "type":"realm", "owner":"神无月", "level":2, "durability":1, "rarity":"SR", "awakened":true, "author":"黄衣",
    "effect":`神无月具有帷幕。
觉醒：你使用己方幻境后，召唤一个复制并自毁。神无月会被视为你上个离场幻境，且她的生命被视为耐久。` },
  { "name":"入星河", "type":"realm", "owner":"神无月", "level":2, "durability":1, "rarity":"R", "author":"黄衣",
    "effect":`气绝时可用，复活神无月。
入场和每个回合结束时，使己方生命值最低的已受伤角色回复3点生命。` },
  { "name":"独行于梦乡", "type":"realm", "owner":"神无月", "level":2, "durability":1, "rarity":"R", "author":"黄衣",
    "effect":"入场，己方回合开始与你使用其他式神的幻境时，随机对两个敌方式神造成1点伤害。" },
  { "name":"月自长梦升", "type":"realm", "owner":"神无月", "level":3, "durability":1, "rarity":"SR", "author":"黄衣",
    "effect":`不消耗鬼火
离场和己方回合开始时，双方牌手在自身下个回合开始时额外抽一张牌。` },
  { "name":"坠梦回廊", "type":"realm", "owner":"神无月", "level":3, "durability":1, "rarity":"R", "author":"黄衣",
    "effect":`你使用牌时，循环触发以下效果：回复你1点生命，投射：造成1点伤害，鼓舞：+1+1。
每回合一次，此牌完成一次循环后，获得一点鬼火。` },
  { "name":"坠明落尘", "type":"realm", "owner":"神无月", "level":3, "durability":1, "rarity":"SSR", "author":"黄衣",
    "effect":`唯一。
此牌在坟场存在，其他己方幻境离场时，若神无月等级为3，自动入场并获得其效果。并在回合结束时失去1耐久` },

  // ══════════════════════════════════════════════════════════════
  //                               中立
  // ══════════════════════════════════════════════════════════════
  
  // 普通中立牌
  { "name":"生命精华", "type":"spell", "owner":"中立", "level":1, "maxStack":10, "effect":"瞬发、堆叠，为一个角色恢复1血" },

  // 商店牌 _shop:true 供商店系统筛选）
  // ── 一级商店牌 ──
  { "name":"离火疾行符", "type":"spell", "owner":"商店", "level":1, "_shop":true, "effect":"使一个己方式神本回合获得迅捷和突袭：+2甲" },
  { "name":"丹青律令", "type":"spell", "owner":"商店", "level":1, "_shop":true, "effect":"抽一张牌。增强：当你购买卡牌时，此牌本回合获得瞬发。" },
  { "name":"胧月三闪", "type":"spell", "owner":"商店", "level":1, "_shop":true, "effect":"瞬发，对一个敌方式神造成3点伤害" },
  { "name":"潮时纸鸢", "type":"spell", "owner":"商店", "level":1, "_shop":true, "effect":"瞬发，使一个己方神气绝倒计时或倒计时-1。" },
  { "name":"九节灵笛", "type":"spell", "owner":"商店", "level":1, "_shop":true, "effect":"瞬发，使一个己方式神获得-2，直到你的回合开始。" },

  // ── 二级商店牌 ──
  { "name":"瞬华凝露", "type":"spell", "owner":"商店", "level":2, "_shop":true, "effect":"复活己方一个式神，使其本回合获得迅捷和突袭：+1/+1甲" },
  { "name":"共鸣回廊", "type":"realm", "owner":"商店", "level":2, "durability":5, "_shop":true, "effect":"选择一个派系，进场时使所有己方式神变为该派系，己方该派系的式神攻击时，获得+1战力和+1护盾。" },
  { "name":"渊鸣鼓", "type":"spell", "owner":"商店", "level":2, "_shop":true, "effect":"眩晕一个敌方准备区式神，移除该式神的形态牌。" },
  { "name":"六环破界杖", "type":"spell", "owner":"商店", "level":2, "_shop":true, "effect":"瞬发，使一个敌方幻境-6耐久。" },
  { "name":"预制好的佳肴", "type":"spell", "owner":"商店", "level":2, "_shop":true, "effect":"瞬发，使一个己方式神获得1攻击、1生命和贯通。" },

  // ── 三级商店牌 ──
  { "name":"疾斩赤扇", "type":"spell", "owner":"商店", "level":3, "_shop":true, "effect":"使所有己方式神获得迅捷和突袭：+2攻击，贯通。" },
  { "name":"醉仙引", "type":"spell", "owner":"商店", "level":3, "_shop":true, "effect":"不消耗鬼火，对敌方牌手造成3点伤害，使用后获得下次刷新必然刷出此牌，随后刷新商店。" },
  { "name":"宿命罗盘", "type":"spell", "owner":"商店", "level":3, "_shop":true, "effect":"随机消灭一个敌方力量最大的式神，获得3赏金。" },
  { "name":"射日长弓", "type":"spell", "owner":"商店", "level":3, "_shop":true, "effect":"投射：造成5点伤害，然后再投射，造成2点伤害。" },
  { "name":"玄甲", "type":"spell", "owner":"商店", "level":3, "_shop":true, "effect":"你获得5点上限和5盾；若你生命小于等于10，恢复效果翻倍。" },

  // ── 启悟牌（中立法术） ──
  { "name":"星诫", "type":"spell", "owner":"中立", "level":1, "_oracle":true, "effect":"不消耗鬼火，对一个敌方式神造成1点伤害，对敌方牌手造成1点伤害。使用后，第二次启悟时移回启悟区。" },
  { "name":"月诫", "type":"spell", "owner":"中立", "level":1, "_oracle":true, "effect":"不消耗鬼火，占卜1，恢复你1点生命值。使用后，第二次启悟时移回启悟区。" },
  { "name":"日诫", "type":"spell", "owner":"中立", "level":1, "_oracle":true, "effect":"消灭一个敌方战斗区式神，敌方牌手抽一张牌。" }
];

// ================================================================
//  关键词数据档案（官方常见关键词及其效果描述）
//  用于工具提示、规则查询等场景
// ================================================================
var KEYWORD_DB_DATA = [
  { "name": "连击", "effect": "战斗时额外先造成一次战斗伤害。" },
  { "name": "先攻", "effect": "战斗时，对不具备先攻、连击的单位优先造成战斗伤害；若先攻伤害直接击杀敌方式神，敌方无法进行反击。" },
  { "name": "贯通", "effect": "主动对敌方式神造成伤害时，超过目标生命值的溢出伤害，全部转移给敌方牌手。" },
  { "name": "远程", "effect": "式神攻击时不会进入战斗区，且本次攻击不会受到敌方反击伤害。" },
  { "name": "直击", "effect": "攻击时直接攻击敌方牌手。" },
  { "name": "追猎", "effect": "攻击时必须选择敌方式神为目标。" },
  { "name": "必杀", "effect": "只要对式神造成任意伤害，该式神立刻气绝消灭；仅对式神生效，无法消灭牌手。" },
  { "name": "暴击", "effect": "造成的伤害翻倍。" },
  { "name": "吸血", "effect": "造成伤害时为己方牌手恢复等同于伤害的生命。" },
  { "name": "穿刺", "effect": "造成伤害前移除目标的护甲与屏障。" },
  { "name": "投射", "effect": "以敌方战斗区式神为目标，若敌方战斗区无式神，则目标改为敌方牌手。" },
  { "name": "不屈", "effect": "式神生命值＞1时，受到超过当前生命值的致命伤害，生命值强制保留为1点；该效果触发后立即消失。" },
  { "name": "迅捷", "effect": "下一次出击不消耗鬼火。" },
  { "name": "昂扬", "effect": "下一次出击不消耗出击次数。" },
  { "name": "帷幕", "effect": "式神拥有帷幕时无法被敌方卡牌选为目标。" },
  { "name": "屏障", "effect": "抵挡一次伤害。" },
  { "name": "庇佑", "effect": "抵挡一次非战斗伤害。" },
  { "name": "眩晕", "effect": "处于眩晕的式神无法出击和使用自身卡牌；若牌手被眩晕，则该牌手的所有式神无法出击。" },
  { "name": "鼓舞", "effect": "己方式神出击时获得鼓舞加成，生效后清空鼓舞。" },
  { "name": "瞬发", "effect": "每回合打出的第一张瞬发卡牌，不消耗鬼火。" },
  { "name": "响应", "effect": "敌方回合内，满足卡牌标注触发条件时，可自动消耗鬼火打出。" },
  { "name": "增强", "effect": "卡牌在手牌时，持续满足指定条件可获得额外效果。" },
  { "name": "觉醒", "effect": "替换式神基础被动能力为觉醒永久效果；本局永久生效，式神气绝、换形态不会重置觉醒，多张觉醒仅保留最后一张被动，属性加成全部叠加。" },
  { "name": "弹回", "effect": "卡牌使用生效后，将一张无「弹回」词条的同名卡牌收回手牌。" },
  { "name": "条件", "effect": "不满足词条标注前置条件时，该卡牌无法打出。" },
  { "name": "倒计时", "effect": "己方回合开始时倒计时数值-1，归0后触发后续效果并重置倒计时初始数值。" },
  { "name": "运势", "effect": "投掷一枚六面骰子，骰子点数≥指定值时，完整触发卡牌全部效果。" },
  { "name": "充能", "effect": "充能式神每回合自动获得1点能量。" },
  { "name": "爆能", "effect": "打出卡牌时可主动消耗指定能量值，触发额外爆能增益。" },
  { "name": "护甲", "effect": "受到伤害时，先扣除等额护甲；己方回合开始时，清空全部护甲。" },
  { "name": "破甲", "effect": "单位持有破甲值期间，受到伤害会额外附加等同于破甲数值的伤害，结算后清空所有破甲；0攻单位攻击不会触发、移除破甲。无特殊效果时，己方回合开始时清空破甲。" },
  { "name": "意志", "effect": "持有该词条的式神或幻境，不会被直接消灭、强制移动类效果影响。" },
  { "name": "启悟", "effect": "启悟时将手牌区切换为启悟区，使用一张启悟区的卡牌后切回手牌区。" },
  { "name": "幻境", "effect": "放置在幻境区的场地持续效果，牌手受到伤害时，处于第一位的幻境减少等量的耐久。" },
  { "name": "灵咒", "effect": "结附在式神或卡牌上的标志。" }
];
