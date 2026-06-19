// ================================================================
//  js/shikigami-book.js — 式神录 (Shikigami Book) v2.0
//  浏览所有式神及其卡牌数据库，支持派系筛选、官方/DIY页签、等级过滤
//  依赖: CardDB
// ================================================================

    // ================================================================
    //  式神录 (Shikigami Book) v2.0
    // ================================================================
    const shikigamiBookOverlay = document.getElementById('shikigami-book-overlay');
    const shikigamiBookSearch = document.getElementById('shikigami-book-search');
    const shikigamiBookList = document.getElementById('shikigami-book-list');
    const shikigamiBookDetail = document.getElementById('shikigami-book-detail');
    const bookFactionFilters = document.getElementById('book-faction-filters');
    const bookTabs = document.getElementById('book-tabs');

    const FACTION_ORDER = ['红莲', '紫岩', '青岚', '苍叶', '无相'];
    function _atkIconHTML() {
      return '<img src="images/属性/攻击.png" alt="攻" style="width:15px;height:15px;vertical-align:middle;margin:0 2px;image-rendering:auto;">';
    }
    function _hpIconHTML() {
      return '<img src="images/属性/生命.png" alt="命" style="width:15px;height:15px;vertical-align:middle;margin:0 2px;image-rendering:auto;">';
    }
    function _factionIconHTML(faction) {
      if (faction === '无相') return '🌐';
      return `<img src="images/派系/${faction}.png" alt="${faction}" style="width:20px;height:20px;vertical-align:middle;margin-right:2px;image-rendering:auto;">`;
    }

    let _bookActiveFactions = new Set(FACTION_ORDER); // 默认全选
    let _bookActiveTab = 'official'; // 'official' | 'diy'
    let _bookSelectedKey = null; // 当前选中的式神名 或 '__neutral__' 或 '__shop__'
    let _bookLevelFilter = 0; // 0=全部, 1/2/3

    function openShikigamiBook() {
      shikigamiBookOverlay.hidden = false;
      shikigamiBookSearch.value = '';
      _bookSelectedKey = null;
      _bookLevelFilter = 0;
      shikigamiBookDetail.innerHTML = '<div class="shikigami-book__placeholder">← 点击左侧式神查看详情</div>';
      renderFactionFilters();
      renderShikigamiList();
      shikigamiBookSearch.focus();
    }

    function closeShikigamiBook() {
      shikigamiBookOverlay.hidden = true;
      shikigamiBookSearch.value = '';
      shikigamiBookList.innerHTML = '';
      shikigamiBookDetail.innerHTML = '';
    }

    // ================================================================
    //  数据聚合
    // ================================================================

    /** 聚合数据：{ 式神名 → { shikigami, cards, curses, isDiy } } + 中立/商店 */
    function getShikigamiBookData() {
      const allCards = CardDB.getAll();
      const map = new Map();

      // 先收集式神（跳过运行时动态生成的卡）
      for (const card of allCards) {
        if (card._custom) continue;
        if (card.type === 'shikigami') {
          const author = card.author || '官方';
          map.set(card.name, { shikigami: card, cards: [], curses: [], isDiy: author !== '官方' });
        }
      }

      // 归类其他牌（跳过运行时动态生成的卡）
      for (const card of allCards) {
        if (card._custom) continue;
        if (card.type === 'shikigami') continue;
        if (card.type === 'curse') {
          if (card.owner && map.has(card.owner)) {
            map.get(card.owner).curses.push(card);
          }
        } else {
          if (card.owner && map.has(card.owner)) {
            map.get(card.owner).cards.push(card);
          }
        }
      }

      return map;
    }

    /** 获取中立卡牌（排除动态生成的 _custom 卡） */
    function getNeutralCards() {
      const allCards = CardDB.getAll();
      return allCards.filter(c =>
        !c._custom && c.owner === '中立' && !c._shop && c.type !== 'shikigami' && c.type !== 'summon'
      ).sort((a, b) => a.name.localeCompare(b.name, 'zh'));
    }

    /** 获取商店卡牌（排除动态生成的 _custom 卡） */
    function getShopCards() {
      const allCards = CardDB.getAll();
      return allCards.filter(c => !c._custom && c._shop).sort((a, b) => {
        if (a.level !== b.level) return (a.level || 0) - (b.level || 0);
        return a.name.localeCompare(b.name, 'zh');
      });
    }

    // ================================================================
    //  派系筛选按钮
    // ================================================================

    function renderFactionFilters() {
      if (!bookFactionFilters) return;
      bookFactionFilters.innerHTML = '';
      for (const faction of FACTION_ORDER) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'book-faction-btn' + (_bookActiveFactions.has(faction) ? ' book-faction-btn--active' : '');
        btn.dataset.faction = faction;
        btn.innerHTML = _factionIconHTML(faction) + faction;
        btn.addEventListener('click', () => {
          if (_bookActiveFactions.has(faction)) {
            _bookActiveFactions.delete(faction);
          } else {
            _bookActiveFactions.add(faction);
          }
          renderFactionFilters();
          renderShikigamiList();
        });
        bookFactionFilters.appendChild(btn);
      }
    }

    // ================================================================
    //  官方/DIY 页签
    // ================================================================

    function setupTabs() {
      if (!bookTabs) return;
      bookTabs.querySelectorAll('.book-tab').forEach(btn => {
        btn.addEventListener('click', () => {
          _bookActiveTab = btn.dataset.tab;
          _bookSelectedKey = null;
          _bookLevelFilter = 0;
          bookTabs.querySelectorAll('.book-tab').forEach(b => b.classList.remove('book-tab--active'));
          btn.classList.add('book-tab--active');
          shikigamiBookDetail.innerHTML = '<div class="shikigami-book__placeholder">← 点击左侧式神查看详情</div>';
          renderShikigamiList();
        });
      });
    }

    // ================================================================
    //  左侧列表渲染
    // ================================================================

    function renderShikigamiList() {
      const data = getShikigamiBookData();
      const filterLower = shikigamiBookSearch.value.trim().toLowerCase();

      shikigamiBookList.innerHTML = '';

      // 收集当前页签的式神
      const entries = [];
      for (const [key, entry] of data.entries()) {
        // 过滤页签
        if (_bookActiveTab === 'official' && entry.isDiy) continue;
        if (_bookActiveTab === 'diy' && !entry.isDiy) continue;
        // 过滤派系
        const faction = entry.shikigami.faction || '无相';
        if (!_bookActiveFactions.has(faction)) continue;
        // 搜索过滤
        if (filterLower && !key.toLowerCase().includes(filterLower)) continue;
        entries.push({ key, entry });
      }

      // 按名字排序
      entries.sort((a, b) => a.key.localeCompare(b.key, 'zh'));

      let hasResults = false;
      for (const { key, entry } of entries) {
        hasResults = true;
        const total = entry.cards.length + entry.curses.length;
        const item = document.createElement('div');
        item.className = 'shikigami-book__item';
        if (key === _bookSelectedKey) item.classList.add('shikigami-book__item--active');
        if (entry.isDiy) {
          item.innerHTML = key + ` <span class="shikigami-book__item-count">(${total})</span> 🔧`;
          item.title = '作者：' + (entry.shikigami.author || '未知');
        } else {
          item.innerHTML = key + ` <span class="shikigami-book__item-count">(${total})</span>`;
        }
        item.addEventListener('click', () => {
          _bookSelectedKey = key;
          _bookLevelFilter = 0;
          shikigamiBookList.querySelectorAll('.shikigami-book__item--active').forEach(el => el.classList.remove('shikigami-book__item--active'));
          item.classList.add('shikigami-book__item--active');
          renderShikigamiDetail(key, entry);
        });
        shikigamiBookList.appendChild(item);
      }

      // 中立卡牌分类（仅官方页签显示）
      if (_bookActiveTab === 'official' && !filterLower) {
        const neutrals = getNeutralCards();
        const shops = getShopCards();

        if (neutrals.length > 0) {
          const sep = document.createElement('div');
          sep.className = 'shikigami-book__section-header';
          sep.textContent = '── 中立卡牌 ──';
          shikigamiBookList.appendChild(sep);

          for (const card of neutrals) {
            const item = document.createElement('div');
            item.className = 'shikigami-book__item';
            if ('__neutral__' === _bookSelectedKey) item.classList.add('shikigami-book__item--active');
            item.textContent = card.name;
            item.addEventListener('click', () => {
              _bookSelectedKey = '__neutral__';
              shikigamiBookList.querySelectorAll('.shikigami-book__item--active').forEach(el => el.classList.remove('shikigami-book__item--active'));
              item.classList.add('shikigami-book__item--active');
              renderNeutralDetail();
            });
            shikigamiBookList.appendChild(item);
          }
        }

        if (shops.length > 0) {
          const sep = document.createElement('div');
          sep.className = 'shikigami-book__section-header';
          sep.textContent = '── 商店卡牌 ──';
          shikigamiBookList.appendChild(sep);

          for (const card of shops) {
            const item = document.createElement('div');
            item.className = 'shikigami-book__item';
            if ('__shop__' === _bookSelectedKey) item.classList.add('shikigami-book__item--active');
            item.textContent = card.name;
            item.addEventListener('click', () => {
              _bookSelectedKey = '__shop__';
              shikigamiBookList.querySelectorAll('.shikigami-book__item--active').forEach(el => el.classList.remove('shikigami-book__item--active'));
              item.classList.add('shikigami-book__item--active');
              renderShopDetail();
            });
            shikigamiBookList.appendChild(item);
          }
        }
      }

      if (!hasResults) {
        // 检查是否有中立/商店（当前view没有式神但有中立也算有结果）
        const neutrals = getNeutralCards();
        const shops = getShopCards();
        if (neutrals.length === 0 && shops.length === 0) {
          const empty = document.createElement('div');
          empty.className = 'card-list-empty';
          empty.textContent = '无匹配式神';
          empty.style.padding = '12px 8px';
          empty.style.fontSize = '12px';
          shikigamiBookList.appendChild(empty);
        }
      }
    }

    // ================================================================
    //  右侧详情渲染
    // ================================================================

    function renderShikigamiDetail(key, entry) {
      shikigamiBookDetail.innerHTML = '';
      const shikigami = entry.shikigami;

      // 式神名片
      if (shikigami) {
        const profile = document.createElement('div');
        profile.className = 'shikigami-book__profile';

        // 卡图
        const imgPath = `images/${shikigami.name}/${shikigami.name}.png`;
        const img = document.createElement('img');
        img.className = 'shikigami-book__profile-img';
        img.src = imgPath;
        img.alt = shikigami.name;
        img.onerror = function () {
          // 卡图加载失败 → 尝试「无图」图片
          if (!img.src.includes('无图.png')) {
            img.src = 'images/无图.png';
          } else {
            // 连「无图」也加载失败 → 文字占位
            const placeholder = document.createElement('div');
            placeholder.className = 'shikigami-book__profile-img--placeholder';
            placeholder.textContent = '无图';
            img.replaceWith(placeholder);
          }
        };
        profile.appendChild(img);

        const info = document.createElement('div');
        info.className = 'shikigami-book__profile-info';

        // 名字
        const nameEl = document.createElement('div');
        nameEl.className = 'shikigami-book__profile-name';
        nameEl.textContent = shikigami.name;
        info.appendChild(nameEl);

        // 元数据
        const meta = document.createElement('div');
        meta.className = 'shikigami-book__profile-meta';
        const faction = shikigami.faction || '无相';
        meta.innerHTML = `<span>${_factionIconHTML(faction)} ${faction}</span><span>${_atkIconHTML()}${shikigami.attack}</span><span>${_hpIconHTML()}${shikigami.hp}</span>`;
        // DIY 显示作者
        if (entry.isDiy && shikigami.author && shikigami.author !== '官方') {
          meta.innerHTML += `<span class="shikigami-book__profile-author">作者：${_escapeHTML(shikigami.author)}</span>`;
        }
        info.appendChild(meta);

        // 能力
        if (shikigami.ability) {
          const ability = document.createElement('div');
          ability.className = 'shikigami-book__profile-ability';
          ability.textContent = shikigami.ability;
          info.appendChild(ability);
        }

        profile.appendChild(info);
        shikigamiBookDetail.appendChild(profile);
      }

      // 卡牌排序：等级 → 稀有度（SSR>SR>R>无） → 主牌先于衍生牌
      const rarityOrder = { 'SSR': 0, 'SR': 1, 'R': 2 };
      const sortedCards = [...entry.cards].sort((a, b) => {
        // 衍生牌排后面
        if (a.derivative && !b.derivative) return 1;
        if (!a.derivative && b.derivative) return -1;
        // 等级
        if ((a.level || 0) !== (b.level || 0)) return (a.level || 0) - (b.level || 0);
        // 稀有度
        const ra = rarityOrder[a.rarity] ?? 3;
        const rb = rarityOrder[b.rarity] ?? 3;
        if (ra !== rb) return ra - rb;
        // 名字
        return a.name.localeCompare(b.name, 'zh');
      });

      const normalCards = sortedCards.filter(c => !c.derivative);
      const derivativeCards = sortedCards.filter(c => c.derivative);
      const sortedCurses = [...entry.curses].sort((a, b) => a.name.localeCompare(b.name, 'zh'));

      // 等级筛选标签
      if (normalCards.length > 0) {
        const counts = { 0: normalCards.length };
        for (const c of normalCards) {
          const lv = c.level || 0;
          counts[lv] = (counts[lv] || 0) + 1;
        }
        const levelFilters = document.createElement('div');
        levelFilters.className = 'shikigami-book__level-filters';
        [0, 1, 2, 3].forEach(lv => {
          const cnt = lv === 0 ? counts[0] : (counts[lv] || 0);
          const label = lv === 0 ? `全部(${cnt})` : `${lv}级(${cnt})`;
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'book-level-btn' + (_bookLevelFilter === lv ? ' book-level-btn--active' : '');
          btn.textContent = label;
          btn.addEventListener('click', () => {
            _bookLevelFilter = lv;
            renderShikigamiDetail(key, entry);
          });
          levelFilters.appendChild(btn);
        });
        shikigamiBookDetail.appendChild(levelFilters);
      }

      // 渲染卡牌
      for (const card of normalCards) {
        if (_bookLevelFilter > 0 && (card.level || 0) !== _bookLevelFilter) continue;
        shikigamiBookDetail.appendChild(createBookCardEntry(card));
      }

      // 衍生牌分隔
      if (derivativeCards.length > 0) {
        const sep = document.createElement('div');
        sep.className = 'shikigami-book__derivative-sep';
        sep.textContent = '衍生物';
        shikigamiBookDetail.appendChild(sep);
        for (const card of derivativeCards) {
          shikigamiBookDetail.appendChild(createBookCardEntry(card));
        }
      }

      // 灵咒
      for (const card of sortedCurses) {
        shikigamiBookDetail.appendChild(createBookCardEntry(card));
      }

      if (normalCards.length === 0 && derivativeCards.length === 0 && sortedCurses.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'card-list-empty';
        empty.textContent = '暂无卡牌数据';
        empty.style.padding = '20px';
        empty.style.textAlign = 'center';
        shikigamiBookDetail.appendChild(empty);
      }
    }

    /** 中立卡牌详情：直接列卡牌 */
    function renderNeutralDetail() {
      shikigamiBookDetail.innerHTML = '';
      const cards = getNeutralCards();
      if (cards.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'card-list-empty';
        empty.textContent = '暂无中立卡牌';
        empty.style.padding = '20px';
        empty.style.textAlign = 'center';
        shikigamiBookDetail.appendChild(empty);
        return;
      }
      const title = document.createElement('div');
      title.className = 'shikigami-book__profile-name';
      title.textContent = '中立卡牌';
      title.style.paddingBottom = '6px';
      title.style.borderBottom = '1px solid rgba(150,180,220,0.2)';
      shikigamiBookDetail.appendChild(title);
      for (const card of cards) {
        shikigamiBookDetail.appendChild(createBookCardEntry(card));
      }
    }

    /** 商店卡牌详情 */
    function renderShopDetail() {
      shikigamiBookDetail.innerHTML = '';
      const cards = getShopCards();
      if (cards.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'card-list-empty';
        empty.textContent = '暂无商店卡牌';
        empty.style.padding = '20px';
        empty.style.textAlign = 'center';
        shikigamiBookDetail.appendChild(empty);
        return;
      }
      const title = document.createElement('div');
      title.className = 'shikigami-book__profile-name';
      title.textContent = '商店卡牌';
      title.style.paddingBottom = '6px';
      title.style.borderBottom = '1px solid rgba(150,180,220,0.2)';
      shikigamiBookDetail.appendChild(title);
      for (const card of cards) {
        shikigamiBookDetail.appendChild(createBookCardEntry(card));
      }
    }

    // ================================================================
    //  单卡条目
    // ================================================================

    function createBookCardEntry(card) {
      const typeNames = { shikigami: '式神', summon: '召唤物', spell: '法术', battle: '战斗', bond: '协战', form: '形态', realm: '幻境', curse: '灵咒' };
      const typeCN = typeNames[card.type] || card.type;

      const entry = document.createElement('div');
      entry.className = 'shikigami-book__card-entry';

      // 头部
      const head = document.createElement('div');
      head.className = 'shikigami-book__card-head';

      // 等级
      if (card.level) {
        const lv = document.createElement('span');
        lv.style.cssText = 'font-size:15px;color:#8090a8;flex-shrink:0;';
        lv.textContent = '⭐' + card.level;
        head.appendChild(lv);
      }

      // 稀有度
      if (card.rarity) {
        const rar = document.createElement('span');
        rar.className = 'shikigami-book__rarity sbr--' + card.rarity;
        rar.textContent = card.rarity;
        head.appendChild(rar);
      }

      // 类型
      const typeEl = document.createElement('span');
      typeEl.className = 'shikigami-book__card-type sbt--' + card.type;
      typeEl.textContent = typeCN;
      head.appendChild(typeEl);

      // 名字
      const nameEl = document.createElement('span');
      nameEl.className = 'shikigami-book__card-name';
      if (card.awakened) nameEl.classList.add('shikigami-book__card-name--awakened');
      nameEl.textContent = card.name;
      head.appendChild(nameEl);

      // 标签
      if (card.awakened || card.derivative) {
        const tags = document.createElement('span');
        tags.className = 'shikigami-book__card-tags';
        if (card.awakened) {
          const t = document.createElement('span');
          t.className = 'shikigami-book__tag sbtag--awakened';
          t.textContent = '觉醒';
          tags.appendChild(t);
        }
        if (card.derivative) {
          const t = document.createElement('span');
          t.className = 'shikigami-book__tag sbtag--derivative';
          t.textContent = '衍生物';
          tags.appendChild(t);
        }
        head.appendChild(tags);
      }

      entry.appendChild(head);

      // 属性
      const stats = document.createElement('div');
      stats.className = 'shikigami-book__card-stats';
      let statsHTML = '';
      switch (card.type) {
        case 'shikigami':
        case 'summon':
          if (card.faction) statsHTML += `<span>${_factionIconHTML(card.faction)} ${card.faction}</span>`;
          statsHTML += `<span>${_atkIconHTML()}${card.attack}</span>`;
          statsHTML += `<span>${_hpIconHTML()}${card.hp}</span>`;
          break;
        case 'spell':
          if (card.atkBonus > 0) statsHTML += `<span>${_atkIconHTML()}+${card.atkBonus}</span>`;
          if (card.hpBonus > 0) statsHTML += `<span>${_hpIconHTML()}+${card.hpBonus}</span>`;
          break;
        case 'battle':
        case 'bond':
          if (card.atkBonus > 0) statsHTML += `<span>${_atkIconHTML()}+${card.atkBonus}</span>`;
          if (card.shieldBonus > 0) statsHTML += `<span>🛡 +${card.shieldBonus}</span>`;
          break;
        case 'form':
          statsHTML += `<span>${_atkIconHTML()}${card.attack}</span>`;
          statsHTML += `<span>${_hpIconHTML()}${card.hp}</span>`;
          break;
        case 'realm':
          statsHTML += `<span>🔮 耐久:${card.durability}</span>`;
          break;
      }
      stats.innerHTML = statsHTML;
      entry.appendChild(stats);

      // 效果/能力
      const effectText = card.effect || card.ability || '';
      if (effectText) {
        const effect = document.createElement('div');
        effect.className = 'shikigami-book__card-effect';
        effect.textContent = effectText;
        entry.appendChild(effect);
      }

      return entry;
    }

    function _escapeHTML(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    // ================================================================
    //  事件绑定
    // ================================================================

    setupTabs();

    document.getElementById('shikigami-book-close').addEventListener('click', closeShikigamiBook);

    shikigamiBookSearch.addEventListener('input', () => {
      _bookSelectedKey = null;
      _bookLevelFilter = 0;
      shikigamiBookDetail.innerHTML = '<div class="shikigami-book__placeholder">← 点击左侧式神查看详情</div>';
      renderShikigamiList();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !shikigamiBookOverlay.hidden) closeShikigamiBook();
    });


