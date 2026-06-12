// ================================================================
//  百闻牌模拟器 — 卡牌数据库
//  直接编辑此文件来增删卡牌，保存后刷新页面即可生效
//
//  【卡牌类型 type】
//    shikigami = 式神    summon = 召唤物    spell = 法术牌
//    battle    = 战斗牌  form   = 形态牌    realm = 幻境牌
//    curse     = 灵咒    bond = 协战牌
//
//  【各类型可用字段一览】
//
//  式神 shikigami:
//    name（名称）, type（类型）, faction（派系）, attack（攻击）, hp（生命）,
//    ability（能力描述）, derivative（衍生物）, effects（模块化效果,可选）
//
//  召唤物 summon:
//    name（名称）, type（类型）, owner（所属式神）, faction（派系）,
//    attack（攻击）, hp（生命）, ability（能力描述）,
//    derivative（衍生物）, effects（模块化效果,可选）
//
//  法术牌 spell:
//    name（名称）, type（类型）, owner（所属式神）, level（等级）,
//    awakened（觉醒牌）, atkBonus（攻击加成）, hpBonus（生命加成）,
//    maxStack（最大堆叠,0=不堆叠）, effect（效果描述）,
//    derivative（衍生物）, effects（模块化效果,可选）
//
//  战斗牌 battle:
//    name（名称）, type（类型）, owner（所属式神）, level（等级）,
//    awakened（觉醒牌）, atkBonus（攻击加成）, atkPenalty（攻击减成）,
//    shieldBonus（护盾加成）, shieldPenalty（护盾减成）,
//    effect（效果描述）, derivative（衍生物）, effects（模块化效果,可选）
//
//  形态牌 form:
//    name（名称）, type（类型）, owner（所属式神）, level（等级）,
//    awakened（觉醒牌）, attack（攻击）, hp（生命）,
//    effect（效果描述）, derivative（衍生物）, effects（模块化效果,可选）
//
//  幻境牌 realm:
//    name（名称）, type（类型）, owner（所属式神）, level（等级）,
//    awakened（觉醒牌）, durability（耐久）,
//    effect（效果描述）, derivative（衍生物）, effects（模块化效果,可选）
//
//  灵咒 curse:
//    name（名称）, type（类型）, owner（所属式神）, effect（效果描述）
//
//  协战牌 bond:
//    name（名称）, type（类型）, owner（所属式神）, level（等级）,
//    awakened（觉醒牌）, atkBonus（攻击加成）, atkPenalty（攻击减成）,
//    shieldBonus（护盾加成）, shieldPenalty（护盾减成）,
//    effect（效果描述）, derivative（衍生物）, effects（模块化效果,可选）
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
//    atkBonus      攻击加成
//    atkPenalty    攻击减成
//    hpBonus       生命加成
//    shieldBonus   护盾加成
//    shieldPenalty 护盾减成
//    durability    幻境耐久值
//    maxStack      最大堆叠数（0=不堆叠, 仅法术牌）
//    derivative    是否为衍生物（true/false）
//    effects       模块化效果JSON（可选，见 effect-modules.js）
//    _shop         是否为商店牌（true/不填）
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
    "name":"战意","type":"battle","owner":"妖刀姬","level":1,"awakened":false,
    "atkBonus":2,"atkPenalty":0,"shieldBonus":2,"shieldPenalty":0,
    "effect":"","derivative":false
  },
  {
    "name":"一闪","type":"battle","owner":"妖刀姬","level":1,"awakened":false,
    "atkBonus":1,"atkPenalty":0,"shieldBonus":0,"shieldPenalty":0,
    "effect":"不消耗鬼火。","derivative":false,
    "cost_modifier": { "fire_cost": 0 }
  },
  {
    "name":"妖刀万华","type":"form","owner":"妖刀姬","level":2,"awakened":false,
    "attack":3,"hp":8,"effect":"连击","derivative":false,
    "effects": {
      "trigger": { "on": "aura" },
      "target_selector": "self",
      "action": { "type": "grant_keyword", "params": { "keyword": "double_strike", "duration": "permanent" } }
    }
  },
  {
    "name":"杀念","type":"spell","owner":"妖刀姬","level":2,"awakened":false,
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
    "name":"觉醒·妖刀姬","type":"spell","owner":"妖刀姬","level":2,"awakened":true,
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
    "name":"禁锢之刃","type":"bond","owner":"妖刀姬","level":2,"awakened":false,
    "atkBonus":1,"atkPenalty":0,"shieldBonus":0,"shieldPenalty":0,
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

  // ── 桃花妖（展示回合开始+恢复+条件分支） ──
  {
    "name":"桃花妖","type":"shikigami","faction":"紫岩","attack":2,"hp":6,
    "ability":"每回合开始时，随机恢复一个友方式神2点生命。","derivative":false,
    "effects": {
      "trigger": { "on": "on_turn_start" },
      "target_selector": "random_ally",
      "condition": { "has_ko": false },
      "action": { "type": "restore_hp", "params": { "value": 2 } }
    }
  },
  {
    "name":"桃之夭夭","type":"spell","owner":"桃花妖","level":1,
    "effect":"恢复一个式神3点生命。若该式神已气绝，则改为复活。","derivative":false,
    "effects": {
      "trigger": { "on": "on_play" },
      "action": {
        "combinator": "if_else",
        "condition": { "has_ko": true },
        "then": {
          "action": { "type": "revive", "params": {} }
        },
        "else": {
          "action": { "type": "restore_hp", "params": { "value": 3 } }
        }
      }
    }
  },

  // ── 大天狗（展示倒计时+群体伤害） ──
  {
    "name":"大天狗","type":"shikigami","faction":"青岚","attack":3,"hp":5,
    "ability":"倒计时3：对所有敌人造成2点伤害，然后重置倒计时为3。","derivative":false,
    "effects": {
      "trigger": { "on": "on_countdown_zero" },
      "action": {
        "combinator": "sequence",
        "steps": [
          {
            "target_selector": "all_enemies",
            "action": { "type": "deal_damage", "params": { "value": 2 } }
          },
          {
            "target_selector": "self",
            "action": { "type": "set_countdown", "params": { "value": 3 } }
          }
        ]
      }
    }
  },
  {
    "name":"羽刃风暴","type":"spell","owner":"大天狗","level":2,
    "effect":"对所有敌人造成等同于大天狗攻击力的伤害。","derivative":false,
    "effects": {
      "trigger": { "on": "on_play" },
      "target_selector": "all_enemies",
      "action": {
        "type": "deal_damage",
        "params": { "value": { "ref": "self.atk" } }
      }
    }
  },

  // ── 酒吞童子（展示受伤触发+永久增强） ──
  {
    "name":"酒吞童子","type":"shikigami","faction":"红莲","attack":4,"hp":6,
    "ability":"酒吞童子受到伤害时，永久获得+1攻击。","derivative":false,
    "effects": {
      "trigger": { "on": "on_take_damage" },
      "target_selector": "self",
      "action": {
        "type": "modify_atk",
        "params": { "delta": 1, "duration": "permanent" }
      }
    }
  },
  {
    "name":"鬼王","type":"form","owner":"酒吞童子","level":2,"awakened":false,
    "attack":6,"hp":8,
    "effect":"不屈","derivative":false,
    "effects": {
      "trigger": { "on": "aura" },
      "target_selector": "self",
      "action": { "type": "grant_keyword", "params": { "keyword": "tenacity", "duration": "permanent" } }
    }
  },

  // ── 雪女（展示控制+灵咒） ──
  {
    "name":"雪女","type":"shikigami","faction":"青岚","attack":2,"hp":5,
    "ability":"雪女对敌方式神造成伤害时，结附一层「冰甲」灵咒。","derivative":false,
    "effects": {
      "trigger": { "on": "on_deal_damage" },
      "condition": { "source_is": { "reference": "self" } },
      "target_selector": "enemy_in_battle_zone",
      "action": { "type": "apply_curse", "params": { "curse_name": "冰甲", "layers": 1 } }
    }
  },
  {
    "name":"吹雪","type":"spell","owner":"雪女","level":1,
    "effect":"对一个敌方式神造成1点伤害。若有「冰甲」灵咒的式神，改为眩晕。","derivative":false,
    "effects": {
      "trigger": { "on": "on_play" },
      "action": {
        "combinator": "if_else",
        "condition": { "has_curse": { "curse_name": "冰甲" } },
        "then": {
          "target_selector": "chosen_by_player",
          "action": { "type": "stun", "params": {} }
        },
        "else": {
          "target_selector": "chosen_by_player",
          "action": { "type": "deal_damage", "params": { "value": 1 } }
        }
      }
    }
  },

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
