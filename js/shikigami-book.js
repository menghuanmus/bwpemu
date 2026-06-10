// ================================================================
//  js/shikigami-book.js — 式神录 (Shikigami Book)
//  浏览所有式神及其卡牌数据库，支持搜索、分类查看
//  依赖: CardDB
// ================================================================

    //  式神录 (Shikigami Book)
    // ================================================================
    const shikigamiBookOverlay = document.getElementById('shikigami-book-overlay');
    const shikigamiBookSearch = document.getElementById('shikigami-book-search');
    const shikigamiBookList = document.getElementById('shikigami-book-list');
    const shikigamiBookDetail = document.getElementById('shikigami-book-detail');

    function openShikigamiBook() {
      shikigamiBookOverlay.hidden = false;
      shikigamiBookSearch.value = '';
      shikigamiBookDetail.innerHTML = '<div class="shikigami-book__placeholder">← 点击左侧式神查看详情</div>';
      renderShikigamiList('');
      shikigamiBookSearch.focus();
    }

    function closeShikigamiBook() {
      shikigamiBookOverlay.hidden = true;
      shikigamiBookSearch.value = '';
      shikigamiBookList.innerHTML = '';
    }

    /** 聚合数据：{ 式神名 → { shikigami: cardData, cards: [...], curses: [...] } } */
    function getShikigamiBookData() {
      const allCards = CardDB.getAll();
      // 以式神为键分组
      const map = new Map();
      // 先收集式神
      for (const card of allCards) {
        if (card.type === 'shikigami') {
          map.set(card.name, { shikigami: card, cards: [], curses: [] });
        }
      }
      // 归类其他牌
      for (const card of allCards) {
        if (card.type === 'shikigami') continue;
        if (card.type === 'curse') {
          if (card.owner && map.has(card.owner)) {
            map.get(card.owner).curses.push(card);
          } else {
            // 无归属灵咒
            if (!map.has('__orphan__')) map.set('__orphan__', { shikigami: null, cards: [], curses: [] });
            map.get('__orphan__').curses.push(card);
          }
        } else {
          if (card.owner && map.has(card.owner)) {
            map.get(card.owner).cards.push(card);
          } else {
            if (!map.has('__orphan__')) map.set('__orphan__', { shikigami: null, cards: [], curses: [] });
            map.get('__orphan__').cards.push(card);
          }
        }
      }
      return map;
    }

    /** 渲染左侧式神列表 */
    function renderShikigamiList(filter) {
      const data = getShikigamiBookData();
      shikigamiBookList.innerHTML = '';
      const filterLower = filter.trim().toLowerCase();

      // 按名称排序
      const entries = [...data.entries()].sort((a, b) => {
        const nameA = a[0] === '__orphan__' ? '无归属' : a[0];
        const nameB = b[0] === '__orphan__' ? '无归属' : b[0];
        return nameA.localeCompare(nameB, 'zh');
      });

      let hasResults = false;
      for (const [key, entry] of entries) {
        const displayName = key === '__orphan__' ? '无归属' : key;
        if (filterLower && !displayName.toLowerCase().includes(filterLower)) continue;
        hasResults = true;

        const item = document.createElement('div');
        item.className = 'shikigami-book__item';
        if (key === '__orphan__') item.classList.add('shikigami-book__item--orphan');
        const total = entry.cards.length + entry.curses.length;
        item.textContent = displayName + (total > 0 ? ` (${total})` : '');
        item.addEventListener('click', () => {
          // 高亮当前
          shikigamiBookList.querySelectorAll('.shikigami-book__item--active').forEach(el => el.classList.remove('shikigami-book__item--active'));
          item.classList.add('shikigami-book__item--active');
          renderShikigamiDetail(key, entry);
        });
        shikigamiBookList.appendChild(item);
      }

      if (!hasResults) {
        const empty = document.createElement('div');
        empty.className = 'card-list-empty';
        empty.textContent = '无匹配式神';
        empty.style.padding = '16px 8px';
        shikigamiBookList.appendChild(empty);
      }
    }

    /** 渲染右侧卡牌详情 */
    function renderShikigamiDetail(key, entry) {
      shikigamiBookDetail.innerHTML = '';
      const displayName = key === '__orphan__' ? '无归属' : key;

      // 标题
      const title = document.createElement('div');
      title.className = 'shikigami-book__shikigami-name';
      title.textContent = displayName;
      shikigamiBookDetail.appendChild(title);

      // 式神本体
      if (entry.shikigami) {
        shikigamiBookDetail.appendChild(createBookCardEntry(entry.shikigami));
      }

      // 所属卡牌（排序：按类型再按名称）
      const sortedCards = [...entry.cards].sort((a, b) => {
        const typeOrder = { spell: 0, battle: 1, xiezhan: 2, form: 3, summon: 4, realm: 5 };
        const ta = typeOrder[a.type] ?? 5;
        const tb = typeOrder[b.type] ?? 5;
        if (ta !== tb) return ta - tb;
        return a.name.localeCompare(b.name, 'zh');
      });
      for (const card of sortedCards) {
        shikigamiBookDetail.appendChild(createBookCardEntry(card));
      }

      // 灵咒
      const sortedCurses = [...entry.curses].sort((a, b) => a.name.localeCompare(b.name, 'zh'));
      for (const card of sortedCurses) {
        shikigamiBookDetail.appendChild(createBookCardEntry(card));
      }

      if (!entry.shikigami && sortedCards.length === 0 && sortedCurses.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'card-list-empty';
        empty.textContent = '暂无卡牌';
        shikigamiBookDetail.appendChild(empty);
      }
    }

    /** 创建单张卡牌的条目 */
    function createBookCardEntry(card) {
      const typeNames = { shikigami: '式神', summon: '召唤物', spell: '法术', battle: '战斗', xiezhan: '协战', form: '形态', realm: '幻境', curse: '灵咒' };
      const typeCN = typeNames[card.type] || card.type;

      const entry = document.createElement('div');
      entry.className = 'shikigami-book__card-entry';

      // 头部：名称 + 类型标签 + 附加标签
      const head = document.createElement('div');
      head.className = 'shikigami-book__card-head';

      const nameEl = document.createElement('span');
      nameEl.className = 'shikigami-book__card-name';
      nameEl.textContent = card.name;
      head.appendChild(nameEl);

      const typeEl = document.createElement('span');
      typeEl.className = 'shikigami-book__card-type sbt--' + card.type;
      typeEl.textContent = typeCN;
      head.appendChild(typeEl);

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
          if (card.faction) statsHTML += `<span>🎌 ${card.faction}</span>`;
          statsHTML += `<span>⚔ 攻击:${card.attack}</span>`;
          statsHTML += `<span>❤ 生命:${card.hp}</span>`;
          break;
        case 'spell':
          if (card.level) statsHTML += `<span>⭐ Lv.${card.level}</span>`;
          if (card.atkBonus > 0) statsHTML += `<span>⚔ +${card.atkBonus}</span>`;
          if (card.hpBonus > 0) statsHTML += `<span>❤ +${card.hpBonus}</span>`;
          break;
        case 'battle':
        case 'xiezhan':
          if (card.level) statsHTML += `<span>⭐ Lv.${card.level}</span>`;
          if (card.atkBonus > 0) statsHTML += `<span>⚔ +${card.atkBonus}</span>`;
          if (card.shieldBonus > 0) statsHTML += `<span>🛡 +${card.shieldBonus}</span>`;
          break;
        case 'form':
          if (card.level) statsHTML += `<span>⭐ Lv.${card.level}</span>`;
          statsHTML += `<span>⚔ 攻击:${card.attack}</span>`;
          statsHTML += `<span>❤ 生命:${card.hp}</span>`;
          break;
        case 'realm':
          if (card.level) statsHTML += `<span>⭐ Lv.${card.level}</span>`;
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

    // 事件绑定
    document.getElementById('shikigami-book-close').addEventListener('click', closeShikigamiBook);
    shikigamiBookOverlay.addEventListener('click', (e) => {
      if (e.target === shikigamiBookOverlay) closeShikigamiBook();
    });
    shikigamiBookSearch.addEventListener('input', () => {
      renderShikigamiList(shikigamiBookSearch.value);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !shikigamiBookOverlay.hidden) closeShikigamiBook();
    });

