// ================================================================
//  百闻牌模拟器 — 卡牌数据库
//  直接编辑此文件来增删卡牌，保存后刷新页面即可生效
//  type: shikigami=式神, summon=召唤物, spell=法术牌,
//        battle=战斗牌, form=形态牌, realm=幻境牌, curse=灵咒,
//        xiezhan=协战牌
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
    "name":"禁锢之刃","type":"xiezhan","owner":"妖刀姬","level":2,"awakened":false,
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
  }
];
