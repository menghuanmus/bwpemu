// ================================================================
//  js/animations.js — GSAP 动画特效模块
//  负责卡牌打出时的视觉特效：羽刃风暴（龙卷风/大风暴）
//  依赖: GSAP 3.x (CDN)
// ================================================================

const StormAnimation = (() => {

  /** 是否正在播放动画（防止重叠） */
  let _isPlaying = false;

  /**
   * 播放"羽刃风暴"动画
   * @param {HTMLElement} targetZone - 目标玩家区域 (.player-zone 元素)
   * @param {number} duration - 动画总时长（秒），默认 3.5
   */
  function playFeatherStorm(targetZone, duration = 3.5) {
    if (!targetZone || _isPlaying) return;
    if (typeof gsap === 'undefined') {
      console.warn('[StormAnimation] GSAP 未加载，无法播放动画');
      return;
    }

    _isPlaying = true;

    // 确保父元素有 relative 定位
    const zoneCenter = targetZone.querySelector('.zone-center');
    const container = zoneCenter || targetZone;
    const origPosition = container.style.position;
    if (!origPosition || origPosition === 'static') {
      container.style.position = 'relative';
    }

    // ---- 创建特效元素 ----

    // 1. 闪光覆盖层
    const flash = document.createElement('div');
    flash.className = 'flash-overlay';
    container.appendChild(flash);

    // 2. 风暴覆盖层
    const stormOverlay = document.createElement('div');
    stormOverlay.className = 'storm-overlay';
    container.appendChild(stormOverlay);

    // 3. 中心大漩涡
    const vortex = document.createElement('div');
    vortex.className = 'storm-vortex';
    stormOverlay.appendChild(vortex);

    // 4. 三股龙卷风
    const tornadoes = [];
    for (let i = 0; i < 3; i++) {
      const t = document.createElement('div');
      t.className = 'tornado';
      t.style.left = (15 + i * 28) + '%';
      stormOverlay.appendChild(t);
      tornadoes.push(t);
    }

    // 5. 六股小龙卷
    const miniTornadoes = [];
    for (let i = 0; i < 6; i++) {
      const mt = document.createElement('div');
      mt.className = 'mini-tornado';
      mt.style.left = (5 + i * 16) + '%';
      stormOverlay.appendChild(mt);
      miniTornadoes.push(mt);
    }

    // 6. 风刃
    const windSlashes = [];
    for (let i = 0; i < 8; i++) {
      const ws = document.createElement('div');
      ws.className = 'wind-slash';
      ws.style.top = (10 + i * 10) + '%';
      ws.style.left = (Math.random() * 60) + '%';
      ws.style.width = (60 + Math.random() * 100) + 'px';
      stormOverlay.appendChild(ws);
      windSlashes.push(ws);
    }

    // 7. 碎屑粒子
    const particles = [];
    for (let i = 0; i < 20; i++) {
      const p = document.createElement('div');
      p.className = 'storm-particle';
      p.style.left = (Math.random() * 90) + '%';
      p.style.top = (Math.random() * 80) + '%';
      p.style.width = (3 + Math.random() * 8) + 'px';
      p.style.height = (3 + Math.random() * 8) + 'px';
      stormOverlay.appendChild(p);
      particles.push(p);
    }

    // ---- GSAP 时间线 ----
    const tl = gsap.timeline({
      onComplete: () => {
        // 清理所有特效元素
        flash.remove();
        stormOverlay.remove();
        container.style.position = origPosition;
        _isPlaying = false;
        console.log('[StormAnimation] ✅ 羽刃风暴动画结束');
      }
    });

    // 阶段1：闪现（0~0.15s）
    tl.to(flash, {
      opacity: 0.8,
      duration: 0.08,
      ease: 'power2.in',
    }, 0)
    .to(flash, {
      opacity: 0,
      duration: 0.15,
      ease: 'power2.out',
    }, 0.08);

    // 阶段2：大漩涡渐显 + 旋转（0.1~3.5s）
    tl.fromTo(vortex, {
      opacity: 0,
      scale: 0.3,
      rotation: 0,
    }, {
      opacity: 0.7,
      scale: 1.8,
      rotation: 360,
      duration: 1.2,
      ease: 'power3.out',
    }, 0.05)
    .to(vortex, {
      opacity: 0.6,
      scale: 2.2,
      rotation: 720,
      duration: 1.5,
      ease: 'none',
    }, 1.25)
    .to(vortex, {
      opacity: 0,
      scale: 0.5,
      rotation: 900,
      duration: 0.8,
      ease: 'power2.in',
    }, 2.7);

    // 阶段3：龙卷风依次升起（0.15~3.2s）
    tornadoes.forEach((t, i) => {
      tl.fromTo(t, {
        opacity: 0,
        scaleY: 0.2,
        scaleX: 0.3,
        rotation: 0,
      }, {
        opacity: 0.8,
        scaleY: 1,
        scaleX: 1,
        rotation: 15 * (i + 1),
        duration: 0.5,
        ease: 'back.out(1.5)',
      }, 0.15 + i * 0.12)
      // 持续摇摆
      .to(t, {
        rotation: -20 * (i + 1),
        scaleX: 0.85,
        duration: 0.4,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: 3,
      }, 0.5 + i * 0.12)
      // 收尾消散
      .to(t, {
        opacity: 0,
        scaleY: 0.1,
        duration: 0.5,
        ease: 'power2.in',
      }, 2.7 + i * 0.1);
    });

    // 阶段4：小龙卷随机升起（0.2~3.0s）
    miniTornadoes.forEach((mt, i) => {
      tl.fromTo(mt, {
        opacity: 0,
        scaleY: 0.1,
        scaleX: 0.2,
      }, {
        opacity: 0.6,
        scaleY: 1,
        scaleX: 1,
        duration: 0.4,
        ease: 'elastic.out(1, 0.5)',
      }, 0.2 + i * 0.08)
      .to(mt, {
        x: (Math.random() - 0.5) * 40,
        rotation: (Math.random() - 0.5) * 60,
        duration: 0.3,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: 5,
      }, 0.5 + i * 0.08)
      .to(mt, {
        opacity: 0,
        scaleY: 0.05,
        duration: 0.3,
        ease: 'power2.in',
      }, 2.6 + i * 0.05);
    });

    // 阶段5：风刃横扫（0.1~3.2s）
    windSlashes.forEach((ws, i) => {
      const startX = (Math.random() - 0.5) * 300;
      tl.fromTo(ws, {
        opacity: 0,
        x: startX,
        scaleX: 0.3,
      }, {
        opacity: 0.9,
        x: (Math.random() - 0.5) * 200,
        scaleX: 1.2,
        duration: 0.3,
        ease: 'power2.out',
      }, 0.1 + i * 0.06)
      .to(ws, {
        opacity: 0,
        x: (Math.random() - 0.5) * 400,
        duration: 0.25,
        ease: 'power2.in',
      }, 0.4 + i * 0.06)
      // 第二波
      .fromTo(ws, {
        opacity: 0,
        x: (Math.random() - 0.5) * 250,
        scaleX: 0.3,
      }, {
        opacity: 0.7,
        x: (Math.random() - 0.5) * 200,
        scaleX: 1,
        duration: 0.25,
        ease: 'power2.out',
      }, 1.5 + i * 0.05)
      .to(ws, {
        opacity: 0,
        x: (Math.random() - 0.5) * 350,
        duration: 0.2,
        ease: 'power2.in',
      }, 1.75 + i * 0.05);
    });

    // 阶段6：粒子飞舞（0.1~3.5s）
    particles.forEach((p, i) => {
      tl.fromTo(p, {
        opacity: 0,
        scale: 0,
        rotation: 0,
      }, {
        opacity: 0.8,
        scale: 1,
        rotation: (Math.random() - 0.5) * 180,
        duration: 0.2,
        ease: 'back.out(2)',
      }, 0.1 + i * 0.04)
      .to(p, {
        x: (Math.random() - 0.5) * 200,
        y: (Math.random() - 0.5) * 150 - 50, // 偏上飘
        rotation: (Math.random() - 0.5) * 360,
        opacity: 0,
        scale: 0.2,
        duration: 1 + Math.random() * 1.5,
        ease: 'power2.out',
      }, 0.2 + i * 0.04);
    });

    // 阶段7：屏幕震动（通过给 game-board 添加类）
    const board = document.querySelector('.game-board');
    if (board) {
      board.classList.add('shake-container', 'active');
      tl.call(() => {
        board.classList.remove('active');
        // 延迟再震一次
        setTimeout(() => {
          board.classList.add('active');
          setTimeout(() => board.classList.remove('active'), 500);
        }, 1200);
      }, null, 0.1);
    }

    console.log('[StormAnimation] 🌪️ 羽刃风暴动画开始！时长:', duration + 's');
  }

  /**
   * 获取对手的玩家区域
   * @param {string} myPlayerId - 己方玩家ID ("1" 或 "2")
   * @returns {HTMLElement|null} 对手的 .player-zone 元素
   */
  function getOpponentZone(myPlayerId) {
    const opponentId = myPlayerId === '1' ? '2' : '1';
    return document.querySelector(`.player-zone[data-player="${opponentId}"]`);
  }

  /**
   * 当羽刃风暴打出时的钩子函数
   * 由 card-deck.js 中的 onCardPlayed 调用
   * @param {string} cardName - 卡牌名称
   * @param {string} playerId - 打出者 ID
   */
  function onStormCardPlayed(cardName, playerId) {
    if (cardName !== '羽刃风暴') return;
    const opponentZone = getOpponentZone(playerId);
    if (!opponentZone) {
      console.warn('[StormAnimation] 找不到对手区域');
      return;
    }
    playFeatherStorm(opponentZone, 3.5);
  }

  // ---- 公开 API ----
  return {
    playFeatherStorm,
    getOpponentZone,
    onStormCardPlayed,
  };

})();

console.log('[StormAnimation] ✅ GSAP 动画模块已加载');
