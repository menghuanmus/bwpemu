// ================================================================
//  js/my-lib.js — 大厅「DIY 我的卡库」面板
//  服务器端个人卡库：式神（可含召唤物）/ 卡牌 / 其他（关键词、灵咒）
//  规则：合计 ≤ 1000 个单位；每个描述 ≤ 300 字；脏话只由服务器拦截；
//        与官方同名拦截；玩家库只能在大厅修改，对局/导入不写入
// ================================================================

var MyLib = (function () {
  var cache = { shikigami: [], cards: [], others: [] };
  var MAX_UNITS = 1000;
  var MAX_TEXT = 300;

  // ── 工具 ──
  function $(id) { return document.getElementById(id); }

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
  }

  function showError(msg, isOk) {
    var el = $('diy-error');
    if (!el) return;
    el.textContent = msg || '';
    el.style.display = msg ? 'block' : 'none';
    el.style.color = isOk ? '#7ed9a0' : '#ff9a9a';
  }

  function socket() {
    return (window._gameSocket && window._gameSocket.connected) ? window._gameSocket : null;
  }

  // ── 校验 ──
  function validateName(kind, name) {
    if (!name || !String(name).trim()) return kind + '缺少名称';
    var s = String(name).trim();
    if (s.length > 40) return '名称过长（最多 40 字）';
    if (typeof CardDB !== 'undefined' && CardDB.isOfficialName && CardDB.isOfficialName(s)) {
      return '「' + s + '」与官方卡牌同名，请换个名字';
    }
    return null;
  }

  function validateText(kind, name, text) {
    if (!text) return null;
    var s = String(text);
    if (s.length > MAX_TEXT) return kind + '「' + name + '」的描述超过 ' + MAX_TEXT + ' 字';
    return null;
  }

  /** 根据描述自动检测关键词（官方 + 玩家自定义：含当前DIY页签添加的关键词） */
  function detectKeywords(desc) {
    if (!desc) return [];
    var found = [];
    var list = [];
    // 官方关键词（对局中还会带上双方玩家关键词）
    if (typeof CardDB !== 'undefined' && CardDB.getAllKeywords) {
      list = list.concat(CardDB.getAllKeywords());
    }
    // 大厅DIY页签未开局，玩家自己的关键词在 cache.others 里，一并检测
    cache.others.forEach(function (o) {
      if (o && o.type !== 'curse' && o.name && desc.indexOf(o.name) !== -1) {
        if (found.indexOf(o.name) === -1) found.push(o.name);
      }
    });
    list.forEach(function (kw) {
      if (kw && kw.name && desc.indexOf(kw.name) !== -1 && found.indexOf(kw.name) === -1) {
        found.push(kw.name);
      }
    });
    return found;
  }

  /** 标签输入 → 数组（以顿号「、」分隔；逗号/空格也兼容，自动去重） */
  function parseTags(text) {
    if (!text) return [];
    var out = [];
    String(text).split(/[,，、\s]+/).forEach(function (t) {
      t = t.trim();
      if (t && out.indexOf(t) === -1) out.push(t);
    });
    return out;
  }

  /** 标签（数组 / 旧版整串字符串）→ 数组 */
  function normalizeTags(v) {
    if (Array.isArray(v)) return parseTags(v.join('、'));
    return parseTags(v);
  }

  // ── 弹窗基座 ──
  function openModal(titleHTML, bodyHTML) {
    var ov = document.createElement('div');
    ov.className = 'diy-modal-overlay';
    ov.innerHTML = '<div class="diy-modal">' +
      '<h3>' + titleHTML + '</h3>' +
      bodyHTML +
      '<div class="diy-modal-err" id="diy-modal-err"></div>' +
      '<div class="diy-modal-actions">' +
      '<button type="button" class="diy-btn diy-btn-ok" id="diy-modal-ok">保存</button>' +
      '<button type="button" class="diy-btn diy-btn-cancel" id="diy-modal-cancel">取消</button>' +
      '</div></div>';
    document.body.appendChild(ov);
    // 只能点「取消」关闭（点弹窗外面不关闭）
    $('diy-modal-cancel').addEventListener('click', function () { ov.remove(); });
    return {
      ov: ov,
      err: $('diy-modal-err'),
      onOk: function (fn) { $('diy-modal-ok').addEventListener('click', fn); },
    };
  }

  function fieldHTML(label, id, inner, required) {
    return '<label class="diy-field"><span>' + label + (required ? ' <i style="color:#FB7185">*</i>' : '') + '</span>' + inner + '</label>';
  }
  /** 绑定描述字数统计：标题旁动态显示 (n/上限) */
  function bindCharCount(ta, counter, max) {
    if (!ta || !counter) return;
    var upd = function() { counter.textContent = '(' + String(ta.value || '').length + '/' + max + ')'; };
    ta.addEventListener('input', upd);
    upd();
  }
  function inputHTML(id, ph, type, extra) {
    return '<input type="' + (type || 'text') + '" id="' + id + '" placeholder="' + esc(ph || '') + '" ' + (extra || '') + '>';
  }

  // ═══════════════ 式神（含召唤物） ═══════════════
  function openShikigamiEdit(idx) {
    var unit = cache.shikigami[idx];
    var isSummon = !!(unit && unit.type === 'summon');
    var isTransform = !!(unit && unit.type === 'transform');
    var m = openModal('式神' + (idx >= 0 ? '编辑' : '新增'), [
      fieldHTML('名称', 'diy-f-name', inputHTML('diy-f-name', '必填，不能与官方卡牌同名', 'text', 'maxlength="40"'), true),
      '<div class="diy-row">' +
      fieldHTML('派系', 'diy-f-faction', '<select id="diy-f-faction">' + ['苍叶', '红莲', '青岚', '紫岩', '无相'].map(function (f) { return '<option>' + f + '</option>'; }).join('') + '</select>') +
      fieldHTML('攻击', 'diy-f-atk', inputHTML('diy-f-atk', '', 'number', 'min="0" max="99"'), true) +
      fieldHTML('生命', 'diy-f-hp', inputHTML('diy-f-hp', '', 'number', 'min="0" max="99"'), true) +
      '</div>',
      '<label class="diy-field diy-check"><input type="checkbox" id="diy-f-summon"><span style="display:inline;margin:0 6px 0 0;">是否为召唤物</span></label>',
      '<label class="diy-field diy-check"><input type="checkbox" id="diy-f-transform"><span style="display:inline;margin:0 6px 0 0;">是否为变身</span></label>',
      '<div id="diy-f-owner-wrap" style="display:none">' + fieldHTML('所属式神', 'diy-f-owner', inputHTML('diy-f-owner', '选填，召唤物所属的式神', 'text', 'maxlength="40"')) + '</div>',
      '<label class="diy-field"><span class="diy-field__head">能力描述（≤300字）<span class="diy-char-count" id="diy-f-count">(0/300)</span></span><textarea id="diy-f-text" maxlength="300" rows="3" placeholder="能力/效果描述"></textarea></label>',
    ].join(''));
    $('diy-f-name').value = unit ? (unit.name || '') : '';
    $('diy-f-faction').value = (unit && unit.faction) || '苍叶';
    $('diy-f-atk').value = (unit && unit.attack != null) ? unit.attack : '';
    $('diy-f-hp').value = (unit && unit.hp != null) ? unit.hp : '';
    $('diy-f-text').value = (unit && unit.ability) || '';
    $('diy-f-summon').checked = isSummon;
    $('diy-f-transform').checked = isTransform;
    function syncOwner(e) {
      // 召唤物与变身互斥
      var sum = $('diy-f-summon'), tr = $('diy-f-transform');
      if (e && e.target === sum && sum.checked) tr.checked = false;
      if (e && e.target === tr && tr.checked) sum.checked = false;
      var wrap = $('diy-f-owner-wrap');
      // 召唤物与变身都要填「所属式神」
      if (wrap) wrap.style.display = (sum.checked || tr.checked) ? '' : 'none';
      var ownEl = $('diy-f-owner');
      if (ownEl) ownEl.placeholder = tr.checked ? '该变身所属的式神' : '选填，召唤物所属的式神';
    }
    syncOwner();
    // 回填已有「所属式神」（召唤物 / 变身）；只在打开时回填，切换勾选不会清空已输入内容
    if (unit && unit.owner && (isSummon || isTransform) && $('diy-f-owner')) $('diy-f-owner').value = unit.owner;
    $('diy-f-summon').addEventListener('change', syncOwner);
    $('diy-f-transform').addEventListener('change', syncOwner);
    bindCharCount($('diy-f-text'), $('diy-f-count'), MAX_TEXT);

    m.onOk(function () {
      var name = $('diy-f-name').value.trim();
      var err = validateName('式神', name);
      if (!err) err = validateText('式神', name, $('diy-f-text').value);
      if (!err && $('diy-f-atk').value === '') err = '请填写攻击力';
      if (!err && !$('diy-f-hp').value) err = '请填写生命值';
      if (err) { m.err.textContent = err; return; }
      var saved = {
        name: name,
        faction: $('diy-f-faction').value || '苍叶',
        attack: parseInt($('diy-f-atk').value, 10) || 0,
        hp: isNaN(parseInt($('diy-f-hp').value, 10)) ? 1 : parseInt($('diy-f-hp').value, 10),
        ability: $('diy-f-text').value.trim()
      };
      var ownerVal = $('diy-f-owner').value.trim();
      if ($('diy-f-transform').checked) {
        saved.type = 'transform';
        if (ownerVal) saved.owner = ownerVal; // 变身所属式神（选填：留空则归入「无归属」）
      } else if ($('diy-f-summon').checked) {
        saved.type = 'summon';
        if (ownerVal) saved.owner = ownerVal; // 选填：留空则归入「无归属」
      }
      if (idx >= 0) cache.shikigami[idx] = keepAuthor('shikigami', idx, saved); else cache.shikigami.push(saved);
      m.ov.remove();
      render();
      saveToServer();
    });
  }

  // ═══════════════ 卡牌 ═══════════════
  var CARD_TYPES = [['spell', '法术'], ['battle', '战斗'], ['form', '形态'], ['realm', '幻境'], ['bond', '协战']];

  function openCardEdit(idx) {
    var unit = cache.cards[idx];
    var m = openModal('卡牌' + (idx >= 0 ? '编辑' : '新增'), [
      fieldHTML('名称', 'diy-f-name', inputHTML('diy-f-name', '必填，不能与官方卡牌同名', 'text', 'maxlength="40"'), true),
      '<div id="diy-f-owner-wrap">' + fieldHTML('所属式神', 'diy-f-owner', inputHTML('diy-f-owner', '选填', 'text', 'maxlength="40"')) + '</div>',
      '<div class="diy-row">' +
      fieldHTML('等级', 'diy-f-level', '<select id="diy-f-level"><option>1</option><option>2</option><option>3</option></select>', true) +
      fieldHTML('类型', 'diy-f-type', '<select id="diy-f-type">' + CARD_TYPES.map(function (t) { return '<option value="' + t[0] + '">' + t[1] + '</option>'; }).join('') + '</select>', true) +
      fieldHTML('稀有度', 'diy-f-rarity', '<select id="diy-f-rarity"><option value="R">R</option><option value="SR">SR</option><option value="SSR">SSR</option><option value="">无</option></select>', true) +
      '</div>',
      '<div class="diy-row">' +
      '<span id="diy-f-awakened-wrap" style="display:inline-block;"><label class="diy-field diy-check"><input type="checkbox" id="diy-f-awakened"><span style="display:inline;margin:0;">觉醒</span></label></span>' +
      '<span id="diy-f-derivative-wrap" style="display:inline-block;"><label class="diy-field diy-check"><input type="checkbox" id="diy-f-derivative"><span style="display:inline;margin:0;">衍生</span></label></span>' +
      '<span id="diy-f-stack-wrap" style="display:inline-block;"><label class="diy-field diy-check"><input type="checkbox" id="diy-f-stack"><span style="display:inline;margin:0;">堆叠</span></label></span>' +
      '</div>',
      '<div id="diy-f-dynamic"></div>',
      '<label class="diy-field"><span class="diy-field__head">描述（≤300字）<span class="diy-char-count" id="diy-f-count">(0/300)</span></span><textarea id="diy-f-text" maxlength="300" rows="3" placeholder="卡牌效果描述，保存时自动检测关键词"></textarea></label>',
      fieldHTML('标签', 'diy-f-tags', inputHTML('diy-f-tags', '多个标签用顿号「、」隔开，例如：符咒、其他', 'text', 'maxlength="100"')),
    ].join(''));

    // 协战牌：描述按官方排版自动填（第一行「选择一项使用：」，之后每张分化牌一行）；玩家改过就不再覆盖
    var autoDesc = '';
    function bondVal(id) { var el = $(id); return el ? el.value.trim() : ''; }
    function bondParts() {
      var parts = [];
      var boA = bondVal('diy-f-bond-a'), bv1 = bondVal('diy-f-bond-v1');
      var boB = bondVal('diy-f-bond-b'), bv2 = bondVal('diy-f-bond-v2');
      if (boA && bv1) parts.push(boA + '-' + bv1);
      if (boB && bv2) parts.push(boB + '-' + bv2);
      return parts;
    }
    /** 当前应该自动生成的描述（官方排版） */
    function bondAutoText(parts) { return parts.length ? ('选择一项使用：\n' + parts.join('\n')) : ''; }
    function syncBondDesc() {
      var ta = $('diy-f-text'); if (!ta) return;
      var type = $('diy-f-type').value;
      var next = '';
      if (type === 'bond') next = bondAutoText(bondParts());
      // 协战牌的描述是「标题 + 每张牌一行」，给描述框多留一行，避免出现小滚动条
      ta.rows = (type === 'bond') ? 4 : 3;
      var cur = ta.value.trim();
      // 只有「空着」或「还是上次自动填的内容」时才动它
      if (cur === '' || cur === autoDesc) {
        if (cur !== next) {
          ta.value = next;
          var cnt = $('diy-f-count');
          if (cnt) cnt.textContent = '(' + ta.value.length + '/' + MAX_TEXT + ')';
        }
        autoDesc = next;
      }
    }

    function renderDynamic() {
      var type = $('diy-f-type').value;
      var awakened = $('diy-f-awakened').checked;
      var html = '';
      if (type === 'spell') {
        if (awakened) {
          var ab = (unit && unit.atkBonus != null) ? unit.atkBonus : 0;
          var hb = (unit && unit.hpBonus != null) ? unit.hpBonus : 0;
          html = '<div class="diy-row">' +
            fieldHTML('+力量（觉醒加成）', 'diy-f-atkbonus', inputHTML('diy-f-atkbonus', '0', 'number', 'value="' + ab + '"'), true) +
            fieldHTML('+生命（觉醒加成）', 'diy-f-hpbonus', inputHTML('diy-f-hpbonus', '0', 'number', 'value="' + hb + '"'), true) +
            '</div>';
        }
      } else if (type === 'battle') {
        var ab2 = (unit && unit.atkBonus != null) ? unit.atkBonus : 0;
        var sb = (unit && unit.shieldBonus != null) ? unit.shieldBonus : 0;
        html = '<div class="diy-row">' +
          fieldHTML('+力量/乏力', 'diy-f-atkbonus', inputHTML('diy-f-atkbonus', '0', 'number', 'value="' + ab2 + '"'), true) +
          fieldHTML('+护盾/破甲', 'diy-f-shieldbonus', inputHTML('diy-f-shieldbonus', '0', 'number', 'value="' + sb + '"'), true) +
          '</div>';
      } else if (type === 'form') {
        var atk = (unit && unit.attack != null) ? unit.attack : 3;
        var hp = (unit && unit.hp != null) ? unit.hp : 6;
        html = '<div class="diy-row">' +
          fieldHTML('力量', 'diy-f-atk', inputHTML('diy-f-atk', '3', 'number', 'min="0" max="99" value="' + atk + '"'), true) +
          fieldHTML('生命', 'diy-f-hp', inputHTML('diy-f-hp', '6', 'number', 'min="0" max="99" value="' + hp + '"'), true) +
          '</div>';
      } else if (type === 'realm') {
        var dur = (unit && unit.durability != null) ? unit.durability : 1;
        html = fieldHTML('耐久', 'diy-f-durability', inputHTML('diy-f-durability', '1', 'number', 'min="1" max="99" value="' + dur + '"'), true);
      } else if (type === 'bond') {
        var boA = (unit && Array.isArray(unit.bondOwners) && unit.bondOwners[0]) || '';
        var boB = (unit && Array.isArray(unit.bondOwners) && unit.bondOwners[1]) || '';
        var v1 = (unit && Array.isArray(unit.bondVersions) && unit.bondVersions[0]) || {};
        var v2 = (unit && Array.isArray(unit.bondVersions) && unit.bondVersions[1]) || {};
        html =
          // 一排：式神① + 分化牌①；下一排：式神② + 分化牌②
          '<div class="diy-row">' +
            fieldHTML('所属式神 ①', 'diy-f-bond-a', inputHTML('diy-f-bond-a', '必填', 'text', 'maxlength="40" value="' + esc(boA) + '"'), true) +
            fieldHTML('分化牌 ①', 'diy-f-bond-v1', inputHTML('diy-f-bond-v1', '必填，只填名称', 'text', 'maxlength="40" value="' + esc(v1.name || '') + '"'), true) +
          '</div>' +
          '<div class="diy-row">' +
            fieldHTML('所属式神 ②', 'diy-f-bond-b', inputHTML('diy-f-bond-b', '必填', 'text', 'maxlength="40" value="' + esc(boB) + '"'), true) +
            fieldHTML('分化牌 ②', 'diy-f-bond-v2', inputHTML('diy-f-bond-v2', '必填，只填名称', 'text', 'maxlength="40" value="' + esc(v2.name || '') + '"'), true) +
          '</div>' +
          '<div style="margin:2px 0 4px;font-size:1rem;line-height:1.5;color:#a99f86;">分化牌指协战牌使用时选择的两张牌，使用时会按照名字在数据库内查找（不会自动创建对应的卡牌，若有需求，可以自己新建）。</div>';
      }
      // 协战牌不提供堆叠：隐藏勾选行并取消勾选（因此下面也不会出现上限输入框）
      var _sw = $('diy-f-stack-wrap'); if (_sw) _sw.style.display = (type === 'bond') ? 'none' : 'inline-block';
      if (type === 'bond') { var _sc = $('diy-f-stack'); if (_sc) _sc.checked = false; }

      // 堆叠上限（勾了「堆叠」才出现，不限卡牌类型；默认 3；重绘时保留已填的值）
      // ⚠? 必须拼进 html 后再一次性赋值：之前用 innerHTML += 会把上面刚给协战牌输入框
      //     绑的 input 监听一起冲掉（自动描述就不再更新了）
      var msCur = $('diy-f-maxstack') ? String($('diy-f-maxstack').value).trim() : '';
      if ($('diy-f-stack') && $('diy-f-stack').checked) {
        var ms = msCur !== '' ? msCur : ((unit && unit.maxStack != null && unit.maxStack > 0) ? unit.maxStack : 3);
        html += '<div class="diy-row">' +
          fieldHTML('堆叠上限', 'diy-f-maxstack', inputHTML('diy-f-maxstack', '1~999，默认 3', 'number', 'min="1" max="999" value="' + ms + '"'), true) +
          '</div>';
      }
      $('diy-f-dynamic').innerHTML = html;
      if (type === 'bond') {
        ['diy-f-bond-a', 'diy-f-bond-b', 'diy-f-bond-v1', 'diy-f-bond-v2'].forEach(function (id) {
          var el = $(id); if (el) el.addEventListener('input', syncBondDesc);
        });
      }
      // 协战牌：不展示单值所属式神 /「衍生」/「觉醒」（协战牌不是觉醒牌）
      var _ow = $('diy-f-owner-wrap'); if (_ow) _ow.style.display = (type === 'bond') ? 'none' : '';
      var _dw = $('diy-f-derivative-wrap'); if (_dw) _dw.style.display = (type === 'bond') ? 'none' : '';
      var _aw = $('diy-f-awakened-wrap'); if (_aw) _aw.style.display = (type === 'bond') ? 'none' : '';
      if (type === 'bond') { var _ac = $('diy-f-awakened'); if (_ac) _ac.checked = false; }
      syncBondDesc();
    }

    $('diy-f-name').value = unit ? (unit.name || '') : '';
    $('diy-f-owner').value = (unit && unit.owner) || '';
    $('diy-f-level').value = (unit && unit.level) || '1';
    $('diy-f-type').value = (unit && unit.type && ['spell', 'battle', 'form', 'realm', 'bond'].indexOf(unit.type) !== -1) ? unit.type : 'spell';
    $('diy-f-rarity').value = (unit && ['R', 'SR', 'SSR', ''].indexOf(unit.rarity) !== -1) ? unit.rarity : 'R';
    $('diy-f-awakened').checked = !!(unit && unit.awakened);
    $('diy-f-derivative').checked = !!(unit && unit.derivative);
    $('diy-f-stack').checked = !!(unit && unit.maxStack != null && unit.maxStack > 0);
    $('diy-f-text').value = (unit && unit.effect) || '';
    $('diy-f-tags').value = (unit && unit.tags) ? normalizeTags(unit.tags).join('、') : '';
    // 老数据若描述正是自动文案（含旧的单行格式），记为「自动填的」，改字段时会跟着更新
    if (unit && unit.type === 'bond') {
      var _o = Array.isArray(unit.bondOwners) ? unit.bondOwners : [];
      var _v = Array.isArray(unit.bondVersions) ? unit.bondVersions : [];
      var _p = [];
      if (_o[0] && _v[0] && _v[0].name) _p.push(_o[0] + '-' + _v[0].name);
      if (_o[1] && _v[1] && _v[1].name) _p.push(_o[1] + '-' + _v[1].name);
      var _newAuto = _p.length ? ('选择一项使用：\n' + _p.join('\n')) : '';
      var _oldAuto = _p.length ? ('选择使用一项：' + _p.join(' ')) : '';
      var _eff = (unit.effect || '').trim();
      if (_eff && _eff === _newAuto) autoDesc = _newAuto;
      else if (_eff && _eff === _oldAuto) autoDesc = _oldAuto;   // 旧自动文案：改字段时重生成新排版
    }
    renderDynamic();
    $('diy-f-type').addEventListener('change', renderDynamic);
    $('diy-f-awakened').addEventListener('change', renderDynamic);
    $('diy-f-stack').addEventListener('change', renderDynamic);
    bindCharCount($('diy-f-text'), $('diy-f-count'), MAX_TEXT);

    m.onOk(function () {
      var name = $('diy-f-name').value.trim();
      var type = $('diy-f-type').value;
      var level = parseInt($('diy-f-level').value, 10) || 1;
      var err = validateName('卡牌', name);
      if (!err) err = validateText('卡牌', name, $('diy-f-text').value);
      if (err) { m.err.textContent = err; return; }
      var saved = {
        name: name,
        type: type,
        owner: $('diy-f-owner').value.trim(),
        level: level,
        rarity: $('diy-f-rarity').value,
        awakened: $('diy-f-awakened').checked,
        derivative: $('diy-f-derivative').checked,
        effect: $('diy-f-text').value.trim(),
        keywords: detectKeywords($('diy-f-text').value),
        tags: parseTags($('diy-f-tags').value)
      };
      // 堆叠：勾了就必须填上限（1~999），并自动把「堆叠」加进关键词；不勾则不写 maxStack
      if ($('diy-f-stack').checked) {
        var msEl = $('diy-f-maxstack');
        var msRaw = msEl ? String(msEl.value).trim() : '';
        var msVal = parseInt(msRaw, 10);
        if (msRaw === '') err = '请填写堆叠上限';
        else if (Number.isNaN(msVal) || msVal < 1 || msVal > 999) err = '堆叠上限需在 1~999 之间';
        else {
          saved.maxStack = msVal;
          if (saved.keywords.indexOf('堆叠') === -1) saved.keywords.push('堆叠');
        }
      } else {
        delete saved.maxStack;
      }
      if (err) { m.err.textContent = err; return; }
      if (type === 'spell') {
        if (saved.awakened) {
          if ($('diy-f-atkbonus').value.trim() === '') err = '请填写觉醒加成的力量';
          else if ($('diy-f-hpbonus').value.trim() === '') err = '请填写觉醒加成的生命';
          else {
            saved.atkBonus = parseInt($('diy-f-atkbonus').value, 10) || 0;
            saved.hpBonus = parseInt($('diy-f-hpbonus').value, 10) || 0;
          }
        }
      } else if (type === 'battle') {
        if ($('diy-f-atkbonus').value.trim() === '') err = '请填写战斗加成的力量';
        else if ($('diy-f-shieldbonus').value.trim() === '') err = '请填写战斗加成的护盾';
        else {
          saved.atkBonus = parseInt($('diy-f-atkbonus').value, 10) || 0;
          saved.shieldBonus = parseInt($('diy-f-shieldbonus').value, 10) || 0;
        }
      } else if (type === 'form') {
        if ($('diy-f-atk').value.trim() === '') err = '请填写形态力量';
        else if ($('diy-f-hp').value.trim() === '') err = '请填写形态生命';
        else {
          saved.attack = parseInt($('diy-f-atk').value, 10) || 0;
          saved.hp = parseInt($('diy-f-hp').value, 10) || 0;
        }
      } else if (type === 'realm') {
        if ($('diy-f-durability').value.trim() === '') err = '请填写幻境耐久';
        else saved.durability = parseInt($('diy-f-durability').value, 10) || 1;
      } else if (type === 'bond') {
        // 四项全必填（分化牌只填名称，类型由卡库里的那张牌决定）
        var boA = $('diy-f-bond-a').value.trim();
        var bv1 = $('diy-f-bond-v1').value.trim();
        var boB = $('diy-f-bond-b').value.trim();
        var bv2 = $('diy-f-bond-v2').value.trim();
        if (!boA) err = '请填写所属式神 ①';
        else if (!bv1) err = '请填写分化牌 ①';
        else if (!boB) err = '请填写所属式神 ②';
        else if (!bv2) err = '请填写分化牌 ②';
        else if (boB === boA) err = '两名所属式神不能相同';
        else if (bv2 === bv1) err = '两张分化牌不能同名';
        else {
          var e1 = validateName('分化牌', bv1); if (e1) err = e1;
          if (!err) { var e2 = validateName('分化牌', bv2); if (e2) err = e2; }
        }
        if (!err) {
          saved.type = 'bond';
          saved.bondOwners = [boA, boB];
          saved.bondVersions = [{ owner: boA, name: bv1 }, { owner: boB, name: bv2 }];
          delete saved.owner;      // 协战牌不存单值 owner
          saved.derivative = false;
          saved.awakened = false;  // 协战牌不是觉醒牌
          delete saved.maxStack;   // 协战牌不提供堆叠
          // 分化牌只写名字：库里有就用，没有也不自动创建（玩家自己建）
        }
      }
      if (err) { m.err.textContent = err; return; }
      if (idx >= 0) cache.cards[idx] = keepAuthor('card', idx, saved); else cache.cards.push(saved);
      m.ov.remove();
      render();
      saveToServer();
    });
  }

  // ═══════════════ 其他（关键词 / 灵咒） ═══════════════
  function openOtherEdit(idx) {
    var unit = cache.others[idx];
    var m = openModal('其他' + (idx >= 0 ? '编辑' : '新增'), [
      fieldHTML('类型', 'diy-f-otype', '<select id="diy-f-otype"><option value="keyword">关键词</option><option value="curse">灵咒</option></select>', true),
      fieldHTML('名称', 'diy-f-name', inputHTML('diy-f-name', '必填', 'text', 'maxlength="40"'), true),
      '<label class="diy-field"><span class="diy-field__head">效果（≤300字）<span class="diy-char-count" id="diy-f-count">(0/300)</span></span><textarea id="diy-f-text" maxlength="300" rows="3" placeholder="关键词/灵咒的效果说明"></textarea></label>',
      fieldHTML('所属式神', 'diy-f-owner', inputHTML('diy-f-owner', '选填', 'text', 'maxlength="40"')),
    ].join(''));
    $('diy-f-otype').value = (unit && unit.type === 'curse') ? 'curse' : 'keyword';
    $('diy-f-name').value = unit ? (unit.name || '') : '';
    $('diy-f-text').value = (unit && unit.effect) || '';
    $('diy-f-owner').value = (unit && unit.owner) || '';
    bindCharCount($('diy-f-text'), $('diy-f-count'), MAX_TEXT);

    m.onOk(function () {
      var type = $('diy-f-otype').value;
      var kind = type === 'keyword' ? '关键词' : '灵咒';
      var name = $('diy-f-name').value.trim();
      var err = validateName(kind, name);
      if (!err) err = validateText(kind, name, $('diy-f-text').value);
      if (!err && type === 'keyword' && typeof CardDB !== 'undefined' && CardDB.lookupKeyword && CardDB.lookupKeyword(name)) {
        err = '关键词「' + name + '」与官方关键词同名，请换个名字';
      }
      if (err) { m.err.textContent = err; return; }
      var saved = {
        type: type,
        name: name,
        effect: $('diy-f-text').value.trim(),
        owner: $('diy-f-owner').value.trim()
      };
      if (idx >= 0) cache.others[idx] = keepAuthor('other', idx, saved); else cache.others.push(saved);
      m.ov.remove();
      render();
      saveToServer();
    });
  }

  // ═══════════════ 渲染（页签 + 搜索 + 全部分组） ═══════════════
  var _tab = 'all';
  var _search = '';

  function matchesSearch(unit) {
    if (!_search) return true;
    var q = _search.toLowerCase();
    var name = String(unit.name || '').toLowerCase();
    var owner = String(unit.owner || '').toLowerCase();
    return name.indexOf(q) !== -1 || owner.indexOf(q) !== -1;
  }

  function itemHTMLFor(kind, unit, idx, indent, opts) {
    opts = opts || {};
    var tags = '';
    if (kind === 'shikigami') {
      if (unit.type === 'summon') tags += '<span class="diy-tag diy-tag--summon">召唤物</span>';
      if (unit.type === 'transform') tags += '<span class="diy-tag diy-tag--transform">变身</span>';
      if (unit.faction) tags += '<span class="diy-tag">' + esc(unit.faction) + '</span>';
      if (unit.attack != null && unit.hp != null) tags += '<span class="diy-tag">' + esc(unit.attack) + '/' + esc(unit.hp) + '</span>';
    } else if (kind === 'card') {
      var typeNames = { spell: '法术', battle: '战斗', form: '形态', realm: '幻境', bond: '协战' };
      var typeLabel = (typeNames[unit.type] || unit.type) + (unit.level ? '·Lv' + unit.level : '');
      // 稀有度「无」：不显示稀有度标签
      if (unit.rarity && ['R', 'SR', 'SSR'].indexOf(unit.rarity) !== -1) {
        tags += '<span class="diy-tag diy-tag--rar-' + esc(unit.rarity.toLowerCase()) + '">' + esc(unit.rarity) + '</span>';
      }
      tags += '<span class="diy-tag diy-tag--' + esc(unit.type) + '">' + esc(typeLabel) + '</span>';
      if (unit.owner) tags += '<span class="diy-tag">' + esc(unit.owner) + '</span>';
      if (unit.awakened) tags += '<span class="diy-tag diy-tag--awakened">觉醒</span>';
      if (unit.derivative) tags += '<span class="diy-tag diy-tag--derivative">衍生</span>';
      if (unit.maxStack > 0) tags += '<span class="diy-tag diy-tag--stack">堆叠' + esc(unit.maxStack) + '</span>';
    } else {
      tags = '<span class="diy-tag">' + (unit.type === 'curse' ? '灵咒' : '关键词') + '</span>';
      if (unit.owner) tags += '<span class="diy-tag">' + esc(unit.owner) + '</span>';
    }
    // 导入别人的 DIY：标注作者
    if (unit.author) tags += '<span class="diy-tag diy-tag--author">作者：' + esc(unit.author) + '</span>';
    var checkHTML = _selMode
      ? '<input type="checkbox" class="diy-item-check" data-key="' + esc(selKey(kind, unit.name)) + '"' + (selOn(kind, unit.name) ? ' checked' : '') + '>'
      : '';
    var toggleHTML = opts.toggle
      ? '<span class="diy-toggle" data-toggle="' + esc(unit.name) + '" title="展开 / 收起">' + (opts.collapsed ? '▸' : '▾') + '</span>'
      : '';
    return '<div class="diy-item' + (indent ? ' diy-item--indent' : '') + '" data-kind="' + kind + '" data-idx="' + idx + '">' +
      '<div class="diy-item-top">' +
      checkHTML +
      toggleHTML +
      '<div class="diy-item-name">' + esc(unit.name) + '</div>' +
      '<div class="diy-item-actions">' +
      '<button type="button" class="diy-btn diy-btn-edit" data-kind="' + kind + '" data-idx="' + idx + '">✏️</button>' +
      '<button type="button" class="diy-btn diy-btn-del" data-kind="' + kind + '" data-idx="' + idx + '">🗑</button>' +
      '</div></div>' +
      '<div class="diy-item-tags">' + tags + '</div></div>';
  }

  function renderAllTab() {
    var shiNames = {};
    cache.shikigami.forEach(function (s) { shiNames[s.name] = true; });
    var html = '';
    // 每个式神分组内条目排序：卡牌(等级小→大) → 召唤物 → 变身 → 关键词 → 灵咒
    function cardsByLevel() {
      return cache.cards.map(function (c, i) { return { u: c, i: i }; }).sort(function (a, b) {
        var la = parseInt(a.u.level, 10) || 99, lb = parseInt(b.u.level, 10) || 99;
        if (la !== lb) return la - lb;
        return String(a.u.name).localeCompare(String(b.u.name), 'zh');
      });
    }
    cache.shikigami.forEach(function (s, si) {
      if (s.type === 'summon' || s.type === 'transform') return; // 召唤物 / 变身归到其所属式神下面展示
      var children = [];
      // 1) 卡牌（等级从小到大）；协战牌按两名所属式神同时挂到两个式神下（同一条记录，不复制）
      cardsByLevel().forEach(function (e) {
        var u = e.u;
        var owned = (u.type === 'bond' && Array.isArray(u.bondOwners))
          ? u.bondOwners.indexOf(s.name) !== -1
          : (u.owner === s.name);
        if (owned && matchesSearch(u)) children.push(itemHTMLFor('card', u, e.i, 1));
      });
      // 2) 召唤物
      cache.shikigami.forEach(function (sm, smi) {
        if (sm.type === 'summon' && sm.owner === s.name && matchesSearch(sm)) children.push(itemHTMLFor('shikigami', sm, smi, 1));
      });
      // 2.5) 变身（同样归到所属式神下面）
      cache.shikigami.forEach(function (sm, smi) {
        if (sm.type === 'transform' && sm.owner === s.name && matchesSearch(sm)) children.push(itemHTMLFor('shikigami', sm, smi, 1));
      });
      // 3) 关键词  4) 灵咒
      cache.others.forEach(function (o, oi) {
        if (o.owner === s.name && o.type !== 'curse' && matchesSearch(o)) children.push(itemHTMLFor('other', o, oi, 1));
      });
      cache.others.forEach(function (o, oi) {
        if (o.owner === s.name && o.type === 'curse' && matchesSearch(o)) children.push(itemHTMLFor('other', o, oi, 1));
      });
      var shiMatches = matchesSearch(s);
      var collapsed = !_search && !!_collapsed[s.name];
      if (shiMatches || children.length) {
        if (shiMatches) html += itemHTMLFor('shikigami', s, si, 0, { toggle: children.length > 0, collapsed: collapsed });
        if (!collapsed) html += children.join('');
      }
    });
    // 无归属（或所属式神不在库中）的卡牌 / 其他 / 召唤物
    var loose = [];
    // 无归属区同样排序：卡牌(等级小→大) → 召唤物/变身 → 关键词 → 灵咒
    cardsByLevel().forEach(function (e) {
      var u = e.u;
      var isLoose;
      if (u.type === 'bond' && Array.isArray(u.bondOwners) && u.bondOwners.length) {
        // 协战牌：两名所属式神都不在库才归「无归属」
        isLoose = !u.bondOwners.some(function (o) { return !!shiNames[o]; });
      } else {
        isLoose = (!u.owner || !shiNames[u.owner]);
      }
      if (isLoose && matchesSearch(u)) loose.push(itemHTMLFor('card', u, e.i, 0));
    });
    cache.shikigami.forEach(function (sm, smi) {
      var isSub = (sm.type === 'summon' || sm.type === 'transform');
      if (isSub && (!sm.owner || !shiNames[sm.owner]) && matchesSearch(sm)) loose.push(itemHTMLFor('shikigami', sm, smi, 0));
    });
    cache.others.forEach(function (o, oi) {
      if ((!o.owner || !shiNames[o.owner]) && o.type !== 'curse' && matchesSearch(o)) loose.push(itemHTMLFor('other', o, oi, 0));
    });
    cache.others.forEach(function (o, oi) {
      if ((!o.owner || !shiNames[o.owner]) && o.type === 'curse' && matchesSearch(o)) loose.push(itemHTMLFor('other', o, oi, 0));
    });
    if (loose.length) html += '<div class="diy-group-sep">── 无归属 ──</div>' + loose.join('');
    return html;
  }

  function renderSimpleTab(kind) {
    var arr = kind === 'shikigami' ? cache.shikigami : (kind === 'card' ? cache.cards : cache.others);
    var html = '';
    arr.forEach(function (u, i) {
      if (matchesSearch(u)) html += itemHTMLFor(kind, u, i, 0);
    });
    return html;
  }

  function render() {
    var total = cache.shikigami.length + cache.cards.length + cache.others.length;
    var bar = $('diy-capacity-bar');
    if (bar) {
      bar.textContent = '容量：' + total + ' / ' + MAX_UNITS + ' 个单位';
      bar.style.color = total >= MAX_UNITS ? '#ff9a9a' : '';
    }
    var list = $('diy-list-container');
    if (!list) return;
    var keepScroll = list.scrollTop;
    var html;
    if (_tab === 'all') html = renderAllTab();
    else if (_tab === 'shikigami') html = renderSimpleTab('shikigami');
    else if (_tab === 'card') html = renderSimpleTab('card');
    else html = renderSimpleTab('other');
    if (!html) {
      var emptyTexts = {
        all: '还没有内容，点上方按钮创建',
        shikigami: '还没有式神，点「➕ 式神」创建',
        card: '还没有卡牌，点「➕ 卡牌」创建',
        other: '还没有其他内容，点「➕ 其他」创建'
      };
      html = '<div class="diy-empty">' + (emptyTexts[_tab] || '暂无内容') + '</div>';
    }
    list.innerHTML = html;
    list.scrollTop = keepScroll;
    updateSelInfo();
    refreshPreviewPane();   // 编辑/删除等改变数据后，右侧详情立即同步
  }

  // ═══════════════ 详情预览 ═══════════════
  var _previewSel = null;   // 当前预览中的条目 { kind, idx }（编辑保存后据此刷新右侧详情）
  function isMobile() { return window.matchMedia('(max-width: 768px)').matches; }

  function getUnit(kind, idx) {
    if (kind === 'shikigami') return cache.shikigami[idx];
    if (kind === 'card') return cache.cards[idx];
    return cache.others[idx];
  }

  function findUnit(kind, name) {
    var i = localIndex(kind, name);
    return i >= 0 ? getUnit(kind, i) : null;
  }

  /** 全部页签：点一下展开/收起一个式神的全部内容 */
  function toggleGroup(shiName) {
    if (!shiName) return;
    if (_collapsed[shiName]) delete _collapsed[shiName]; else _collapsed[shiName] = 1;
    render();
  }

  /** 编辑已导入的条目时保留原作者标注（新建条目没有 author） */
  function keepAuthor(kind, idx, saved) {
    var old = idx >= 0 ? getUnit(kind, idx) : null;
    if (old && old.author) saved.author = old.author;
    return saved;
  }

  function previewHTML(kind, unit) {
    if (!unit) return '';
    var typeNames = { shikigami: '式神', summon: '召唤物', spell: '法术', battle: '战斗', form: '形态', realm: '幻境', curse: '灵咒', keyword: '关键词', bond: '协战' };
    function pill(text, mod) {
      return '<span class="diy-tag' + (mod ? ' ' + mod : '') + '">' + esc(text) + '</span>';
    }
    // 加成数字带符号：正/0 显示 +x，负值显示 -x（不再出现“+-1”）
    function signed(v) { return (v >= 0 ? '+' : '') + v; }
    var meta = [];
    var effect = '';
    if (kind === 'shikigami') {
      if (unit.type === 'summon') meta.push(pill('召唤物', 'diy-tag--summon'));
      else if (unit.type === 'transform') meta.push(pill('变身', 'diy-tag--transform'));
      else meta.push(pill('式神'));
      if (unit.faction) meta.push(pill(unit.faction));
      if (unit.attack != null && unit.hp != null) meta.push(pill(unit.attack + '/' + unit.hp));
      if ((unit.type === 'summon' || unit.type === 'transform') && unit.owner) meta.push(pill('所属：' + unit.owner));
      effect = unit.ability || '';
    } else if (kind === 'card') {
      // 稀有度「无」：不显示稀有度标签
      if (unit.rarity && ['R', 'SR', 'SSR'].indexOf(unit.rarity) !== -1) meta.push(pill(unit.rarity, 'diy-tag--rar-' + unit.rarity.toLowerCase()));
      var typeLabel = (typeNames[unit.type] || unit.type) + (unit.level ? '·Lv' + unit.level : '');
      meta.push(pill(typeLabel, 'diy-tag--' + unit.type));
      if (unit.type === 'bond') {
        var _bo = Array.isArray(unit.bondOwners) ? unit.bondOwners.filter(Boolean) : [];
        if (_bo.length) meta.push(pill('协战 ' + _bo.join('×')));
      } else if (unit.owner) meta.push(pill('所属：' + unit.owner));
      // 觉醒（有加成合并为一个标签；法术觉醒两个数字都显示；都为 0 只显示“觉醒”）
      if (unit.awakened) {
        var ab = (unit.type === 'spell' && unit.atkBonus != null) ? unit.atkBonus : 0;
        var hb = (unit.type === 'spell' && unit.hpBonus != null) ? unit.hpBonus : 0;
        if (unit.type === 'spell' && (ab !== 0 || hb !== 0)) meta.push(pill('觉醒 ' + signed(ab) + '/' + signed(hb), 'diy-tag--awakened'));
        else meta.push(pill('觉醒', 'diy-tag--awakened'));
      }
      if (unit.derivative) meta.push(pill('衍生', 'diy-tag--derivative'));
      // 力量/生命/护盾：加成类统一 +x/+x（含 0），固定类显示 x/x
      if (unit.type === 'battle') meta.push(pill(signed(unit.atkBonus != null ? unit.atkBonus : 0) + '/' + signed(unit.shieldBonus != null ? unit.shieldBonus : 0)));
      if (unit.type === 'form') meta.push(pill((unit.attack != null ? unit.attack : 0) + '/' + (unit.hp != null ? unit.hp : 0)));
      if (unit.type === 'realm') meta.push(pill('耐久 ' + (unit.durability != null ? unit.durability : 1)));
      effect = unit.effect || '';
    } else {
      meta.push(pill(unit.type === 'curse' ? '灵咒' : '关键词'));
      if (unit.owner) meta.push(pill('所属：' + unit.owner));
      effect = unit.effect || '';
    }
    var html = '<div class="diy-preview__name">' + esc(unit.name) + '</div>' +
      '<div class="diy-preview__meta">' + meta.join('') + '</div>';
    if (unit.author) html += '<div class="diy-preview__kws">作者：' + esc(unit.author) + '</div>';
    if (effect) html += '<div class="diy-preview__effect">' + esc(effect) + '</div>';
    if (kind !== 'shikigami' && unit.type === 'bond' && Array.isArray(unit.bondVersions) && unit.bondVersions.length) {
      html += '<div class="diy-preview__kws">协战分化：' + esc(unit.bondVersions.map(function (v) { return v.name; }).join(' / ')) + '</div>';
    }
    if (kind !== 'shikigami' && Array.isArray(unit.keywords) && unit.keywords.length) {
      html += '<div class="diy-preview__kws">关键词：' + esc(unit.keywords.join('、')) + '</div>';
    }
    var _tagList = normalizeTags(unit && unit.tags);
    if (kind !== 'shikigami' && _tagList.length) {
      html += '<div class="diy-preview__kws">标签：' + esc(_tagList.join('、')) + '</div>';
    }
    return html;
  }

  function closeMobileTip() {
    document.querySelectorAll('.diy-mobile-tip').forEach(function (t) { t.remove(); });
  }

  function showPreview(kind, idx, itemEl) {
    var unit = getUnit(kind, idx);
    if (!unit) return;
    _previewSel = { kind: kind, idx: idx };   // 记录当前预览的条目
    var list = $('diy-list-container');
    if (list) {
      list.querySelectorAll('.diy-item--active').forEach(function (el) { el.classList.remove('diy-item--active'); });
    }
    if (itemEl) itemEl.classList.add('diy-item--active');
    var html = previewHTML(kind, unit);
    if (isMobile()) {
      // 手机端：悬浮窗（遮罩拦截点击，点悬浮窗或遮罩关闭）
      closeMobileTip();
      var tip = document.createElement('div');
      tip.className = 'diy-mobile-tip';
      tip.innerHTML = '<div class="diy-mobile-tip__card">' + html + '<div class="diy-mobile-tip__hint">点击关闭</div></div>';
      tip.addEventListener('click', function (ev) { ev.stopPropagation(); tip.remove(); });
      document.body.appendChild(tip);
    } else {
      var pane = $('diy-preview-pane');
      if (pane) pane.innerHTML = html;
    }
  }

  /** 刷新右侧详情：编辑保存 / 删除条目后调用（列表重建时保持预览与高亮同步） */
  function refreshPreviewPane() {
    if (!_previewSel) return;
    var pane = $('diy-preview-pane');
    if (!pane) return;
    var unit = getUnit(_previewSel.kind, _previewSel.idx);
    if (!unit) {
      // 条目已被删除：清空右侧
      pane.innerHTML = '<div class="diy-preview__placeholder">← 点击左侧条目查看详情</div>';
      _previewSel = null;
      return;
    }
    pane.innerHTML = previewHTML(_previewSel.kind, unit);
    // 列表重建后恢复选中高亮
    var list = $('diy-list-container');
    if (list) {
      var sel = list.querySelector('.diy-item[data-kind="' + _previewSel.kind + '"][data-idx="' + _previewSel.idx + '"]');
      if (sel) sel.classList.add('diy-item--active');
    }
  }

  // ═══════════════ 保存 / 删除 ═══════════════
  function saveToServer() {
    var s = socket();
    if (!s) { showError('未连接服务器，无法保存'); return; }
    var total = cache.shikigami.length + cache.cards.length + cache.others.length;
    if (total > MAX_UNITS) { showError('超过容量上限：合计最多 ' + MAX_UNITS + ' 个单位'); return; }
    s.emit('save-my-cardlib', cache, function (res) {
      if (res && res.error) {
        showError(res.error);
        // 保存被拒绝：重新拉取服务器上的真实数据，界面与服务器保持一致
        s.emit('get-my-cardlib', {}, function (g) {
          if (g && g.ok) { cache = g.cardLib || { shikigami: [], cards: [], others: [] }; render(); }
        });
      }
      else if (res && res.ok) { showError('已保存', true); }
      else { showError('保存失败：服务端无响应'); }
    });
  }

  function delUnit(kind, idx) {
    var arr = kind === 'shikigami' ? cache.shikigami : (kind === 'card' ? cache.cards : cache.others);
    var unit = arr[idx];
    if (!unit) return;
    var msg;
    if (kind === 'shikigami') {
      var related = cache.cards.filter(function (c) { return c.owner === unit.name; }).length;
      // 协战牌不属于「名片」，删式神不连删，只提示（另一名所属式神可能还在用）
      var bondLinks = cache.cards.filter(function (c) {
        return c.type === 'bond' && Array.isArray(c.bondOwners) && c.bondOwners.indexOf(unit.name) !== -1;
      }).length;
      msg = '确定删除' + (unit.type === 'summon' ? '召唤物' : '式神') + '「' + unit.name + '」？' +
        (related > 0 ? '其名下 ' + related + ' 张卡牌会一并删除。' : '') +
        (bondLinks > 0 ? '另有 ' + bondLinks + ' 张协战牌与它相关（协战牌不会自动删除，请自行处理）。' : '');
    } else if (kind === 'card' && unit.type === 'bond') {
      var derivs = cache.cards.filter(function (c) { return c.bondOf === unit.name; });
      msg = '确定删除协战牌「' + unit.name + '」？' + (derivs.length > 0 ? '它的 ' + derivs.length + ' 张协战分化牌会一并删除。' : '');
    } else {
      msg = '确定删除「' + unit.name + '」？';
    }
    if (!window.confirm(msg)) return;
    if (kind === 'shikigami') {
      cache.cards = cache.cards.filter(function (c) { return c.owner !== unit.name; });
      cache.shikigami.splice(idx, 1);
    } else if (kind === 'card' && unit.type === 'bond') {
      // 连带删除它的分化牌（只删 bondOf 指向它的，其它协战牌的分化牌不动）
      cache.cards = cache.cards.filter(function (c) { return c !== unit && c.bondOf !== unit.name; });
    } else {
      arr.splice(idx, 1);
    }
    render();
    saveToServer();
  }

  // ═══════════════ 导出 / 导入（玩家间分享 DIY） ═══════════════
  //  导出：多选 → 生成带作者的 JSON 文件
  //  导入：先预览 → 重名冲突按「保留本地 / 覆盖 / 两份都留」处理 → 只改本地，点「保存」才写服务器
  var EXPORT_FORMAT = 'bwpemu-diy';
  var EXPORT_VERSION = 1;
  var _selMode = false;
  var _sel = {};            // { '种类|名字': 1 } —— 用名字做键，条目增删/改名都不会错位
  var _autoGroup = true;    // 勾选时连带「一整套」（式神 + 它的卡牌/召唤物/关键词）
  var _collapsed = {};      // 「全部」页签里被收起的式神

  function authorName() { return window._gameNickname || '匿名玩家'; }
  function selKey(kind, name) { return kind + '|' + String(name == null ? '' : name); }
  function selOn(kind, name) { return !!_sel[selKey(kind, name)]; }
  function selCount() { var n = 0; for (var k in _sel) { if (_sel[k]) n++; } return n; }
  function updateSelInfo() {
    var el = $('diy-selbar-info');
    if (el) el.textContent = '已选 ' + selCount() + ' 项';
  }
  function enterSelMode() {
    _selMode = true; _sel = {};
    var bar = $('diy-selbar'); if (bar) bar.hidden = false;
    render();
    showError('☑️ 勾选要分享的条目，再点「导出选中」', true);
  }
  function exitSelMode() {
    _selMode = false; _sel = {};
    var bar = $('diy-selbar'); if (bar) bar.hidden = true;
    render();
    showError('');
  }
  function toggleSelKey(k) {
    if (!k) return;
    var parts = String(k).split('|');
    var kind = parts[0];
    var name = parts.slice(1).join('|');
    var keys = groupKeysOf(kind, name);
    var allOn = true;
    for (var i = 0; i < keys.length; i++) { if (!_sel[keys[i]]) { allOn = false; break; } }
    keys.forEach(function (x) { if (allOn) delete _sel[x]; else _sel[x] = 1; });
    updateSelInfo();
    syncChecks();
  }
  function selAll(mode) {
    var list = $('diy-list-container');
    if (!list) return;
    list.querySelectorAll('.diy-item-check').forEach(function (cb) {
      var k = cb.dataset.key;
      if (!k) return;
      if (mode === 'all') _sel[k] = 1;
      else if (mode === 'invert') { if (_sel[k]) delete _sel[k]; else _sel[k] = 1; }
      cb.checked = !!_sel[k];
    });
    updateSelInfo();
  }

  /** 某式神名下的一整套（含自己）；无归属的条目就只管自己 */
  function groupKeysOf(kind, name) {
    var keys = [selKey(kind, name)];
    if (!_autoGroup) return keys;
    var shiName = null;
    if (kind === 'shikigami') {
      var s = findUnit('shikigami', name);
      shiName = (s && s.type === 'summon' && s.owner) ? s.owner : name;
    } else if (kind === 'card') {
      var c = findUnit('card', name);
      if (c) {
        if (c.type === 'bond' && Array.isArray(c.bondOwners) && c.bondOwners.length) {
          shiName = c.bondOwners.filter(function (n) { return !!findUnit('shikigami', n); })[0] || null;
        } else { shiName = c.owner || null; }
      }
    } else {
      var o = findUnit('other', name);
      shiName = o ? (o.owner || null) : null;
    }
    if (!shiName || !findUnit('shikigami', shiName)) return keys;
    keys.push(selKey('shikigami', shiName));
    cache.shikigami.forEach(function (s2) {
      if (s2.type === 'summon' && s2.owner === shiName) keys.push(selKey('shikigami', s2.name));
    });
    cache.cards.forEach(function (c2) {
      var owns = (c2.type === 'bond' && Array.isArray(c2.bondOwners)) ? c2.bondOwners : [c2.owner];
      if (owns.indexOf(shiName) !== -1) keys.push(selKey('card', c2.name));
    });
    cache.others.forEach(function (o2) { if (o2.owner === shiName) keys.push(selKey('other', o2.name)); });
    return keys;
  }

  function syncChecks() {
    var list = $('diy-list-container');
    if (!list) return;
    list.querySelectorAll('.diy-item-check').forEach(function (cb) { cb.checked = !!_sel[cb.dataset.key]; });
  }

  /** 导出：只拿勾选中的那些条目（不再自己推导连带） */
  function buildExportUnits() {
    var out = { shikigami: [], cards: [], others: [] };
    cache.shikigami.forEach(function (s) { if (selOn('shikigami', s.name)) out.shikigami.push(s); });
    cache.cards.forEach(function (c) { if (selOn('card', c.name)) out.cards.push(c); });
    cache.others.forEach(function (o) { if (selOn('other', o.name)) out.others.push(o); });
    return out;
  }

  function stampDate() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return String(d.getFullYear()) + p(d.getMonth() + 1) + p(d.getDate());
  }

  function downloadText(filename, text) {
    var blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }

  function doExport() {
    var units = buildExportUnits();
    var total = units.shikigami.length + units.cards.length + units.others.length;
    if (!total) { showError('还没选内容：先勾选要分享的条目'); return; }
    var payload = {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      author: authorName(),
      exportedAt: new Date().toISOString(),
      count: total,
      units: units
    };
    var fname = 'bwpemu-DIY-' + String(authorName()).replace(/[\\\/:*?"<>|\s]+/g, '_') + '-' + stampDate() + '.json';
    try {
      downloadText(fname, JSON.stringify(payload, null, 2));
    } catch (e) {
      showError('导出失败：' + (e && e.message ? e.message : e));
      return;
    }
    showError('已导出 ' + total + ' 项：' + fname, true);
  }

  // ── 导入 ──
  var _impItems = [];   // [{ kind, unit, conflictIdx, official }]
  var _impAuthor = '';

  function localIndex(kind, name) {
    var arr = kind === 'shikigami' ? cache.shikigami : (kind === 'card' ? cache.cards : cache.others);
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] && String(arr[i].name) === String(name)) return i;
    }
    return -1;
  }
  function uniqueName(kind, base) {
    var name = base, n = 2;
    while (localIndex(kind, name) >= 0 && n < 999) { name = base + '(' + n + ')'; n++; }
    return name;
  }
  function isOfficialConflict(kind, unit) {
    try {
      if (typeof CardDB === 'undefined') return false;
      if (kind === 'other') {
        return (unit.type === 'keyword' && CardDB.lookupKeyword) ? !!CardDB.lookupKeyword(unit.name) : false;
      }
      return CardDB.isOfficialName ? !!CardDB.isOfficialName(unit.name) : false;
    } catch (e) { return false; }
  }

  function startImport() {
    var f = $('diy-import-file');
    if (!f) return;
    f.value = '';
    f.click();
  }

  function onImportFile(input) {
    var file = input && input.files && input.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var data = null;
      try { data = JSON.parse(String(reader.result)); }
      catch (e) { showError('这个文件不是有效的 DIY 文件（JSON 解析失败）'); return; }
      var parsed = parseImport(data);
      if (parsed.error) { showError(parsed.error); return; }
      openImportModal(parsed);
    };
    reader.onerror = function () { showError('读取文件失败，请重试'); };
    reader.readAsText(file, 'utf-8');
  }

  function parseImport(data) {
    if (!data || typeof data !== 'object') return { error: '文件内容为空' };
    if (data.format !== EXPORT_FORMAT) return { error: '这不是本模拟器导出的 DIY 文件' };
    var u = data.units || {};
    function clean(arr) {
      var out = [];
      (Array.isArray(arr) ? arr : []).forEach(function (x) {
        if (x && typeof x === 'object' && String(x.name == null ? '' : x.name).trim()) out.push(x);
      });
      return out;
    }
    var units = { shikigami: clean(u.shikigami), cards: clean(u.cards), others: clean(u.others) };
    var total = units.shikigami.length + units.cards.length + units.others.length;
    if (!total) return { error: '文件里没有可导入的内容' };
    if (total > MAX_UNITS) return { error: '文件内容过多（' + total + ' 项，单个卡库上限 ' + MAX_UNITS + ' 项）' };
    return { author: String(data.author == null ? '' : data.author).trim(), units: units };
  }

  function impRuleOf(it) {
    var sel = document.querySelector('.diy-imp-rule[data-id="' + it._id + '"]');
    return sel ? sel.value : 'keep';
  }

  function openImportModal(parsed) {
    _impItems = [];
    _impAuthor = parsed.author;
    var kindLabel = { shikigami: '式神', card: '卡牌', other: '关键词/灵咒' };
    ['shikigami', 'card', 'other'].forEach(function (kind) {
      var arr = kind === 'shikigami' ? parsed.units.shikigami : (kind === 'card' ? parsed.units.cards : parsed.units.others);
      arr.forEach(function (unit) {
        _impItems.push({ kind: kind, unit: unit, conflictIdx: localIndex(kind, unit.name), official: isOfficialConflict(kind, unit), _id: _impItems.length });
      });
    });
    var importedShiNames = {};
    parsed.units.shikigami.forEach(function (s) { importedShiNames[s.name] = 1; });

    var rowsHTML = _impItems.map(function (it) {
      var state = '';
      if (it.official) {
        state = '<span class="diy-imp-state diy-imp-state--bad">与官方同名，不能导入</span>';
      } else if (it.conflictIdx >= 0) {
        state = '<span class="diy-imp-state diy-imp-state--warn">你库里已有同名</span>' +
          '<select class="diy-imp-rule" data-id="' + it._id + '">' +
          '<option value="keep">保留本地</option>' +
          '<option value="over">用导入的覆盖</option>' +
          '<option value="dup">两份都留（改名）</option>' +
          '</select>';
      } else {
        state = '<span class="diy-imp-state diy-imp-state--ok">新增</span>';
      }
      var warn = '';
      var owner = it.unit.owner;
      if (owner && String(owner) !== '' && localIndex('shikigami', owner) < 0 && !importedShiNames[owner]) {
        warn = '<div class="diy-imp-warn">所属式神「' + esc(owner) + '」不在你的卡库 → 会先放在「无归属」区</div>';
      }
      return '<label class="diy-imp-row' + (it.official ? ' diy-imp-row--off' : '') + '">' +
        '<input type="checkbox" class="diy-imp-check" data-id="' + it._id + '"' + (it.official ? ' disabled' : ' checked') + '>' +
        '<span class="diy-tag">' + kindLabel[it.kind] + '</span>' +
        '<span class="diy-imp-name">' + esc(it.unit.name) + '</span>' +
        state + warn +
        '</label>';
    }).join('');

    var cur = cache.shikigami.length + cache.cards.length + cache.others.length;
    var body = '<div class="diy-imp-head">来自 <b>' + esc(_impAuthor || '未知玩家') + '</b> 的分享：' +
      parsed.units.shikigami.length + ' 个式神/召唤物、' + parsed.units.cards.length + ' 张卡牌、' + parsed.units.others.length + ' 个关键词/灵咒<br>' +
      '你当前卡库：' + cur + ' / ' + MAX_UNITS + ' 项</div>' +
      '<div class="diy-imp-global">遇到重名时：' +
      '<select id="diy-imp-global"><option value="keep">保留本地（跳过）</option><option value="over">用导入的覆盖</option><option value="dup">两份都留（自动改名）</option></select>' +
      '<button type="button" class="diy-btn" id="diy-imp-all">全选</button>' +
      '<button type="button" class="diy-btn" id="diy-imp-none">全不选</button></div>' +
      '<div class="diy-imp-list">' + rowsHTML + '</div>' +
      '<div class="diy-imp-note">导入只改这个页面，点「保存」才写入服务器（不保存 = 不生效）。</div>';

    var m = openModal('📥 导入 DIY（预览）', body);
    var box = m.ov.querySelector('.diy-modal');
    if (box) box.classList.add('diy-modal-wide');
    var okBtn = m.ov.querySelector('#diy-modal-ok');
    if (okBtn) okBtn.textContent = '确认导入';

    var globalSel = m.ov.querySelector('#diy-imp-global');
    if (globalSel) {
      globalSel.addEventListener('change', function () {
        m.ov.querySelectorAll('.diy-imp-rule').forEach(function (s) { s.value = globalSel.value; });
      });
    }
    var allBtn = m.ov.querySelector('#diy-imp-all');
    if (allBtn) allBtn.addEventListener('click', function () {
      m.ov.querySelectorAll('.diy-imp-check').forEach(function (cb) { if (!cb.disabled) cb.checked = true; });
    });
    var noneBtn = m.ov.querySelector('#diy-imp-none');
    if (noneBtn) noneBtn.addEventListener('click', function () {
      m.ov.querySelectorAll('.diy-imp-check').forEach(function (cb) { cb.checked = false; });
    });

    m.onOk(function () {
      var picked = [];
      m.ov.querySelectorAll('.diy-imp-check').forEach(function (cb) {
        if (cb.checked && !cb.disabled) picked.push(_impItems[parseInt(cb.dataset.id, 10)]);
      });
      if (!picked.length) { m.err.textContent = '没有勾选任何条目'; return; }
      var grow = 0;
      picked.forEach(function (it) {
        var r = it.conflictIdx < 0 ? 'new' : impRuleOf(it);
        if (r === 'new' || r === 'dup') grow++;
      });
      var cur = cache.shikigami.length + cache.cards.length + cache.others.length;
      if (cur + grow > MAX_UNITS) {
        m.err.textContent = '超出容量：还能再放 ' + (MAX_UNITS - cur) + ' 项，请少勾选一些';
        return;
      }
      var res = applyImport(picked, _impAuthor);
      m.ov.remove();
      render();
      showError('导入完成：新增 ' + res.added + '、覆盖 ' + res.over + '、跳过 ' + res.skip + ' 项。点「保存」后生效', true);
    });
  }

  /** 合并进本地 cache；「两份都留」会改名，并同步修正归属关系 */
  function applyImport(picked, author) {
    var renameMap = {};   // 旧式神名 → 新名
    var added = 0, over = 0, skip = 0;
    function arrOf(kind) { return kind === 'shikigami' ? cache.shikigami : (kind === 'card' ? cache.cards : cache.others); }
    function stamp(unit) {
      var o = {};
      for (var k in unit) { if (Object.prototype.hasOwnProperty.call(unit, k)) o[k] = unit[k]; }
      if (author) o.author = author;
      return o;
    }
    function fixRefs(unit) {
      var o = unit;
      if (o.owner && renameMap[o.owner]) { o = stamp(o); o.owner = renameMap[o.owner]; }
      if (Array.isArray(o.bondOwners)) {
        var changed = false;
        var bo = o.bondOwners.map(function (n) { if (renameMap[n]) { changed = true; return renameMap[n]; } return n; });
        if (changed) { o = stamp(o); o.bondOwners = bo; }
      }
      return o;
    }
    function process(kind, unit) {
      var idx = localIndex(kind, unit.name);
      var copy = stamp(fixRefs(unit));
      if (idx < 0) { arrOf(kind).push(copy); added++; return; }
      var rule = 'keep';
      for (var i = 0; i < picked.length; i++) {
        if (picked[i].unit === unit) { rule = impRuleOf(picked[i]); break; }
      }
      if (rule === 'keep') { skip++; return; }
      if (rule === 'over') { arrOf(kind)[idx] = copy; over++; return; }
      var nn = uniqueName(kind, unit.name);
      copy.name = nn;
      if (kind === 'shikigami') renameMap[unit.name] = nn;
      arrOf(kind).push(copy);
      added++;
    }
    picked.filter(function (it) { return it.kind === 'shikigami'; }).forEach(function (it) { process('shikigami', it.unit); });
    picked.filter(function (it) { return it.kind === 'card'; }).forEach(function (it) { process('card', it.unit); });
    picked.filter(function (it) { return it.kind === 'other'; }).forEach(function (it) { process('other', it.unit); });
    return { added: added, over: over, skip: skip };
  }

  // ═══════════════ 事件绑定 ═══════════════
  function bindEvents() {
    var addShi = $('diy-add-shikigami-btn');
    var addCard = $('diy-add-card-btn');
    var addOther = $('diy-add-other-btn');
    if (addShi) addShi.addEventListener('click', function () { openShikigamiEdit(-1); });
    if (addCard) addCard.addEventListener('click', function () { openCardEdit(-1); });
    if (addOther) addOther.addEventListener('click', function () { openOtherEdit(-1); });

    // ── 导出 / 导入 ──
    var exportBtn = $('diy-export-btn');
    if (exportBtn) exportBtn.addEventListener('click', function () {
      if (_selMode) exitSelMode(); else enterSelMode();   // 再点一次 = 关闭导出（多选）窗口
    });
    var importBtn = $('diy-import-btn');
    if (importBtn) importBtn.addEventListener('click', startImport);
    var importFile = $('diy-import-file');
    if (importFile) importFile.addEventListener('change', function () { onImportFile(importFile); });
    var selAllBtn = $('diy-sel-all');
    if (selAllBtn) selAllBtn.addEventListener('click', function () { selAll('all'); });
    var selInvertBtn = $('diy-sel-invert');
    if (selInvertBtn) selInvertBtn.addEventListener('click', function () { selAll('invert'); });
    var selDoBtn = $('diy-sel-do');
    if (selDoBtn) selDoBtn.addEventListener('click', doExport);
    var selCancelBtn = $('diy-sel-cancel');
    if (selCancelBtn) selCancelBtn.addEventListener('click', exitSelMode);
    var withChildren = $('diy-sel-withchildren');
    if (withChildren) withChildren.addEventListener('change', function () { _autoGroup = !!withChildren.checked; });

    var tabs = $('diy-tabs');
    if (tabs) {
      tabs.addEventListener('click', function (e) {
        var btn = e.target.closest('.diy-tab');
        if (!btn) return;
        _tab = btn.dataset.tab;
        tabs.querySelectorAll('.diy-tab').forEach(function (b) { b.classList.toggle('diy-tab--active', b === btn); });
        render();
      });
    }

    var search = $('diy-search-input');
    if (search) {
      search.addEventListener('input', function () {
        _search = search.value.trim();
        render();
      });
    }

    var list = $('diy-list-container');
    if (list) {
      list.addEventListener('click', function (e) {
        var cb = e.target.closest ? e.target.closest('.diy-item-check') : null;
        if (cb) { toggleSelKey(cb.dataset.key); return; }
        var tg = e.target.closest ? e.target.closest('.diy-toggle') : null;
        if (tg) { toggleGroup(tg.dataset.toggle); return; }
        var btn = e.target.closest('.diy-btn');
        if (btn) {
          var kind = btn.dataset.kind;
          var idx = parseInt(btn.dataset.idx, 10);
          if (btn.classList.contains('diy-btn-del')) delUnit(kind, idx);
          else if (btn.classList.contains('diy-btn-edit')) {
            if (kind === 'shikigami') openShikigamiEdit(idx);
            else if (kind === 'card') openCardEdit(idx);
            else openOtherEdit(idx);
          }
          return;
        }
        var item = e.target.closest('.diy-item');
        if (item) {
          showPreview(item.dataset.kind, parseInt(item.dataset.idx, 10), item);
        }
      });
    }
  }

  // ═══════════════ 页签打开 ═══════════════
  function onTabOpen() {
    var s = socket();
    if (!s) { showError('未连接服务器，请先登录'); renderEmpty(); return; }
    showError('');
    s.emit('get-my-cardlib', {}, function (res) {
      if (!res || res.error) { showError((res && res.error) || '读取失败'); renderEmpty(); return; }
      cache = res.cardLib || { shikigami: [], cards: [], others: [] };
      if (!Array.isArray(cache.others)) cache.others = [];
      closeMobileTip();
      _previewSel = null;   // 重新打开页签：清空右侧预览记录
      var pane = $('diy-preview-pane');
      if (pane) pane.innerHTML = '<div class="diy-preview__placeholder">← 点击左侧条目查看详情</div>';
      render();
    });
  }

  function renderEmpty() {
    cache = { shikigami: [], cards: [], others: [] };
    render();
  }

  bindEvents();
  return { onTabOpen: onTabOpen };
})();
