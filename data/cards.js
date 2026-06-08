// ================================================================
//  百闻牌模拟器 — 卡牌数据库
//  直接编辑此文件来增删卡牌，保存后刷新页面即可生效
//  type: shikigami=式神, summon=召唤物, spell=法术牌,
//        battle=战斗牌, form=形态牌, realm=幻境牌, curse=灵咒,
//        xiezhan=协战牌
// ================================================================
var CARD_DB_DATA = [
  // ── 妖刀姬 ──
  { "name":"妖刀姬","type":"shikigami","faction":"苍叶","attack":3,"hp":4,"ability":"妖刀姬对敌方牌手造成伤害时，抽一张牌。","derivative":false },
  { "name":"不祥之刃","type":"battle","owner":"妖刀姬","level":1,"awakened":false,"atkBonus":1,"atkPenalty":0,"shieldBonus":0,"shieldPenalty":0,"effect":"本回合妖刀姬消灭敌方式神时，抽一张牌。","derivative":false },
  { "name":"见切","type":"battle","owner":"妖刀姬","level":1,"awakened":false,"atkBonus":1,"atkPenalty":0,"shieldBonus":0,"shieldPenalty":0,"effect":"响应：妖刀姬被攻击时，自动使用此牌。本次战斗妖刀姬免疫战斗伤害。","derivative":false },
  { "name":"战意","type":"battle","owner":"妖刀姬","level":1,"awakened":false,"atkBonus":2,"atkPenalty":0,"shieldBonus":2,"shieldPenalty":0,"effect":"","derivative":false },
  { "name":"一闪","type":"battle","owner":"妖刀姬","level":1,"awakened":false,"atkBonus":1,"atkPenalty":0,"shieldBonus":0,"shieldPenalty":0,"effect":"不消耗鬼火。","derivative":false },
  { "name":"妖刀万华","type":"form","owner":"妖刀姬","level":2,"awakened":false,"attack":3,"hp":8,"effect":"连击","derivative":false },
  { "name":"杀念","type":"spell","owner":"妖刀姬","level":2,"awakened":false,"atkBonus":0,"hpBonus":0,"effect":"随机将墓中至多三张妖刀姬的战斗牌或协战牌置入手牌。","derivative":false },
  { "name":"觉醒·妖刀姬","type":"spell","owner":"妖刀姬","level":2,"awakened":true,"atkBonus":1,"hpBonus":1,"effect":"觉醒：迅捷，妖刀姬对敌方牌手造成伤害时，她的战斗牌本回合不消耗鬼火。","derivative":false },
  { "name":"禁锢之刃","type":"xiezhan","owner":"妖刀姬","level":2,"awakened":false,"atkBonus":1,"atkPenalty":0,"shieldBonus":0,"shieldPenalty":0,"effect":"增强：本局游戏妖刀姬每消灭一个式神，此牌永久获得+2攻击。","derivative":false }
];
