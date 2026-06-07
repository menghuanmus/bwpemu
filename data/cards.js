// ================================================================
//  百闻牌模拟器 — 卡牌数据库
//  直接编辑此文件来增删卡牌，保存后刷新页面即可生效
//  type: shikigami=式神, summon=召唤物, spell=法术牌,
//        battle=战斗牌, form=形态牌, realm=幻境牌
// ================================================================
var CARD_DB_DATA = [
  { "name":"桃花妖","type":"shikigami","faction":"紫岩","attack":2,"hp":5,"ability":"进场时，为己方所有式神恢复2点生命。","derivative":false },
  { "name":"兵俑","type":"shikigami","faction":"紫岩","attack":1,"hp":7,"ability":"你的回合结束时，若本回合未进行过攻击，则获得2点护盾。","derivative":false },
  { "name":"萤草","type":"shikigami","faction":"青岚","attack":1,"hp":4,"ability":"进场时抽1张牌。","derivative":false },
  { "name":"凤凰火","type":"shikigami","faction":"红莲","attack":3,"hp":3,"ability":"对一名敌方式神造成等同于自身攻击的伤害。","derivative":false },
  { "name":"鸩","type":"shikigami","faction":"苍叶","attack":3,"hp":3,"ability":"进场时，对敌方牌手造成1点伤害。","derivative":false },
  { "name":"召唤·桃花","type":"summon","faction":"紫岩","attack":1,"hp":2,"ability":"回合结束时消失。","derivative":true },
  { "name":"桃花灼灼","type":"spell","level":1,"awakened":false,"atkBonus":0,"hpBonus":0,"effect":"复活一个己方式神，并为其恢复所有生命。","derivative":false },
  { "name":"觉醒·桃花妖","type":"spell","level":2,"awakened":true,"atkBonus":1,"hpBonus":1,"effect":"觉醒：桃花妖获得+1攻击/+1生命。你的回合开始时，为己方所有式神恢复1点生命。","derivative":false },
  { "name":"凤火","type":"spell","level":1,"awakened":false,"atkBonus":0,"hpBonus":0,"effect":"对一名敌方式神造成3点伤害。","derivative":false },
  { "name":"尘刀","type":"battle","level":1,"awakened":false,"atkBonus":2,"atkPenalty":0,"shieldBonus":0,"shieldPenalty":0,"effect":"本次战斗中，兵俑获得+2攻击。","derivative":false },
  { "name":"古尘之壁","type":"battle","level":2,"awakened":false,"atkBonus":0,"atkPenalty":0,"shieldBonus":3,"shieldPenalty":0,"effect":"本次战斗中，兵俑获得3点护盾。","derivative":false },
  { "name":"桃花仙","type":"form","level":2,"awakened":false,"attack":3,"hp":6,"effect":"你的回合开始时，为己方所有式神恢复1点生命。桃花妖受到伤害时，该伤害-1。","derivative":false },
  { "name":"萤草·治愈之光","type":"form","level":1,"awakened":false,"attack":1,"hp":5,"effect":"进场时，为己方所有式神恢复2点生命。","derivative":false },
  { "name":"蓬莱之境","type":"realm","level":2,"awakened":false,"durability":4,"effect":"你的回合开始时，抽1张牌。","derivative":false },
  { "name":"龙首之玉","type":"realm","level":3,"awakened":false,"durability":5,"effect":"你的回合结束时，对敌方所有式神造成1点伤害。","derivative":false }
];
