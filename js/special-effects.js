// ================================================================
//  js/special-effects.js — 通用伤害特效系统 + 调试面板
//  依赖: GSAP 3.x (CDN)
//  仅两种特效：伤害(damage) / 治疗(heal)
// ================================================================

const DamageEffects = (() => {

  /** 特效配置 */
  const LEVELS = {
    damage: { label: '伤害', color: '#ff3333', size: 52, shockClass: 'hit-shockwave--damage',
              slash: true, burst: true, sparkCount: 12, flashAlpha: 0.22, shake: true, shakeIntensity: 2 },
    heal:   { label: '治疗', color: '#44ff88', size: 38, shockClass: 'hit-shockwave--heal',
              slash: false, burst: false, sparkCount: 10, flashAlpha: 0.12, shake: false, shakeIntensity: 0 },
  };

  /** 自增 ID，防止并发动画互相清理 */
  let _fxUid = 0;

  /**
   * 在指定元素上播放伤害/治疗特效
   * @param {HTMLElement} targetEl - 目标 DOM 元素
   * @param {number} value - 数值
   * @param {'damage'|'heal'} level - 特效类型
   */
  function playDamage(targetEl, value, level = 'damage') {
    if (!targetEl) return;
    if (typeof gsap === 'undefined') {
      console.warn('[DamageEffects] GSAP 未加载');
      return;
    }

    const cfg = LEVELS[level] || LEVELS.damage;
    const fxId = ++_fxUid;  // 本次调用的唯一标记

    // 确保目标有 relative 定位上下文
    const origPos = targetEl.style.position;
    if (!origPos || origPos === 'static') {
      targetEl.style.position = 'relative';
    }

    const tl = gsap.timeline({
      onComplete: () => {
        targetEl.style.position = origPos;
        setTimeout(() => cleanupElements(targetEl, fxId), 600);
      }
    });

    // ---- 1. 闪光 ----
    const flash = createFlash(targetEl, fxId);
    tl.to(flash, { opacity: cfg.flashAlpha, duration: 0.06, ease: 'power2.in' }, 0)
      .to(flash, { opacity: 0, duration: 0.25, ease: 'power2.out' }, 0.06);

    // ---- 2. 冲击波 ----
    const shockwave = createShockwave(targetEl, cfg.shockClass, fxId);
    tl.fromTo(shockwave, {
      opacity: 1, scale: 0.2, width: 10, height: 10,
      marginLeft: -5, marginTop: -5,
    }, {
      opacity: 0, scale: 4.5, width: 130, height: 130,
      marginLeft: -65, marginTop: -65,
      duration: 0.55, ease: 'power2.out',
    }, 0.03);

    // ---- 3. 刀光（仅伤害） ----
    if (cfg.slash) {
      const slash = createSlash(targetEl, fxId);
      const angle = (Math.random() - 0.5) * 35;
      tl.fromTo(slash, {
        opacity: 0, rotation: angle - 18, scaleX: 0.25,
      }, {
        opacity: 0.9, rotation: angle, scaleX: 1.3,
        duration: 0.14, ease: 'power3.out',
      }, 0.06)
      .to(slash, {
        opacity: 0, scaleX: 1.6, rotation: angle + 8,
        duration: 0.22, ease: 'power2.in',
      }, 0.20);

      // 第二道交叉刀光
      const slash2 = createSlash(targetEl, fxId);
      const angle2 = angle + 65 + (Math.random() - 0.5) * 25;
      tl.fromTo(slash2, {
        opacity: 0, rotation: angle2 - 22, scaleX: 0.2,
      }, {
        opacity: 0.75, rotation: angle2, scaleX: 1.1,
        duration: 0.11, ease: 'power3.out',
      }, 0.10)
      .to(slash2, {
        opacity: 0, scaleX: 1.4, rotation: angle2 + 12,
        duration: 0.20, ease: 'power2.in',
      }, 0.21);
    }

    // ---- 4. 十字爆裂（仅伤害） ----
    if (cfg.burst) {
      const burstX = document.createElement('div');
      burstX.className = 'hit-burst-x';
      burstX.dataset.fxId = fxId;
      const burstY = document.createElement('div');
      burstY.className = 'hit-burst-y';
      burstY.dataset.fxId = fxId;
      targetEl.appendChild(burstX);
      targetEl.appendChild(burstY);

      tl.fromTo([burstX, burstY], {
        opacity: 0, scale: 0.1,
      }, {
        opacity: 0.85, scale: 1,
        duration: 0.12, ease: 'back.out(2)',
      }, 0.06)
      .to([burstX, burstY], {
        opacity: 0, scale: 1.6,
        duration: 0.35, ease: 'power2.out',
      }, 0.18);
    }

    // ---- 5. 火花粒子 ----
    if (cfg.sparkCount > 0) {
      for (let i = 0; i < cfg.sparkCount; i++) {
        const spark = createSpark(targetEl, cfg.color, fxId);
        const angle = (i / cfg.sparkCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
        const dist = 35 + Math.random() * 55;
        const destX = Math.cos(angle) * dist;
        const destY = Math.sin(angle) * dist;

        tl.fromTo(spark, {
          opacity: 1, scale: 0, x: 0, y: 0,
        }, {
          opacity: 0, scale: 1.2, x: destX, y: destY,
          duration: 0.45 + Math.random() * 0.35,
          ease: 'power2.out',
        }, 0.08 + i * 0.012);
      }
    }

    // ---- 6. 数值飘浮（特效临近完成时弹出） ----
    tl.call(() => {
      spawnFloatNumber(targetEl, value, level, fxId);
    }, null, 0.18);

    // ---- 7. 屏幕微震（仅伤害） ----
    if (cfg.shake) {
      const board = document.querySelector('.game-board');
      if (board) {
        tl.call(() => shakeBoard(board, cfg.shakeIntensity), null, 0.04);
      }
    }

    console.log(`[DamageEffects] ${cfg.label}: ${value} →`, targetEl.className || targetEl.tagName);
  }

  // ---- 内部辅助函数 ----

  function createFlash(parent, fxId) {
    const el = document.createElement('div');
    el.className = 'hit-flash';
    el.dataset.fxId = fxId;
    el.style.opacity = '0';
    parent.appendChild(el);
    return el;
  }

  function createShockwave(parent, shockClass, fxId) {
    const el = document.createElement('div');
    el.className = 'hit-shockwave' + (shockClass ? ' ' + shockClass : '');
    el.dataset.fxId = fxId;
    parent.appendChild(el);
    return el;
  }

  function createSlash(parent, fxId) {
    const el = document.createElement('div');
    el.className = 'hit-slash';
    el.dataset.fxId = fxId;
    parent.appendChild(el);
    return el;
  }

  function createSpark(parent, color, fxId) {
    const el = document.createElement('div');
    el.className = 'hit-spark';
    el.dataset.fxId = fxId;
    el.style.background = color;
    el.style.boxShadow = `0 0 8px ${color}`;
    el.style.width = (3 + Math.random() * 6) + 'px';
    el.style.height = (3 + Math.random() * 6) + 'px';
    parent.appendChild(el);
    return el;
  }

  /**
   * 生成浮动数值（fixed 定位 + fxId 标记防止误删）
   */
  function spawnFloatNumber(parent, value, level, fxId) {
    const cfg = LEVELS[level] || LEVELS.damage;
    const el = document.createElement('div');
    el.className = `dmg-float dmg-float--${level}`;
    el.dataset.fxId = fxId;
    el.textContent = level === 'heal' ? `+${value}` : `-${value}`;

    const rect = parent.getBoundingClientRect();
    el.style.position = 'fixed';
    el.style.left = (rect.left + rect.width / 2) + 'px';
    el.style.top  = (rect.top + rect.height * 0.38) + 'px';
    document.body.appendChild(el);

    // 弹出 → 停留 → 上浮消散（+20% 时长）
    gsap.fromTo(el, {
      opacity: 0,
      scale: 0.2,
      y: 15,
    }, {
      opacity: 1,
      scale: 1.3,
      y: 0,
      duration: 0.22,
      ease: 'back.out(2.5)',
      onComplete: () => {
        gsap.to(el, {
          opacity: 1,
          scale: 1.0,
          y: -10,
          duration: 0.34,
          ease: 'power1.out',
          onComplete: () => {
            gsap.to(el, {
              opacity: 0,
              scale: 0.7,
              y: -55,
              duration: 0.78,
              ease: 'power2.in',
              onComplete: () => el.remove(),
            });
          }
        });
      }
    });
  }

  function shakeBoard(board, intensity) {
    const amp = intensity * 2;
    gsap.fromTo(board, {
      x: 0, y: 0,
    }, {
      x: amp, y: -amp * 0.5,
      duration: 0.04,
      ease: 'power2.out',
      onComplete: () => {
        gsap.to(board, {
          x: -amp * 0.7, y: amp * 0.3,
          duration: 0.05,
          ease: 'power2.inOut',
          onComplete: () => {
            gsap.to(board, {
              x: 0, y: 0,
              duration: 0.06,
              ease: 'power2.out',
            });
          }
        });
      }
    });
  }

  function cleanupElements(parent, fxId) {
    // 只清理属于本次 fxId 的局部特效元素
    parent.querySelectorAll('[data-fx-id="' + fxId + '"]').forEach(el => el.remove());
    // 只清理属于本次 fxId 的 fixed 数字（兜底，正常已自删）
    document.body.querySelectorAll('.dmg-float[data-fx-id="' + fxId + '"]').forEach(el => el.remove());
  }

  /** 对指定卡牌槽播放特效 */
  function playDamageOnSlot(playerId, slotIndex, value, level) {
    const zone = document.querySelector(`.player-zone[data-player="${playerId}"]`);
    if (!zone) return;
    const slot = zone.querySelectorAll('.card-slot')[slotIndex];
    if (!slot) return;
    playDamage(slot, value, level);
  }

  /** 对随机卡牌槽播放（调试用） */
  function playOnRandomSlot(value, level) {
    const allSlots = document.querySelectorAll('.card-slot');
    if (!allSlots.length) return;
    const slot = allSlots[Math.floor(Math.random() * allSlots.length)];
    playDamage(slot, value, level);
  }

  /**
   * 气绝特效：暗色闪光 + 黑烟扩散 + 倒计时弹出
   * @param {HTMLElement} slot - 卡牌槽元素
   */
  function playKoEffect(slot) {
    if (!slot) return;
    if (typeof gsap === 'undefined') {
      console.warn('[DamageEffects] GSAP 未加载，气绝特效跳过');
      return;
    }

    const fxId = ++_fxUid;

    // 确保定位上下文
    const origPos = slot.style.position;
    if (!origPos || origPos === 'static') {
      slot.style.position = 'relative';
    }

    const tl = gsap.timeline({
      onComplete: () => {
        slot.style.position = origPos;
        setTimeout(() => cleanupElements(slot, fxId), 800);
      }
    });

    // ---- 1. 暗紫色闪光 ----
    const koFlash = document.createElement('div');
    koFlash.className = 'ko-flash';
    koFlash.dataset.fxId = fxId;
    slot.appendChild(koFlash);
    tl.to(koFlash, { background: 'rgba(80,20,80,0.35)', duration: 0.08, ease: 'power2.in' }, 0)
      .to(koFlash, { background: 'rgba(80,20,80,0)', duration: 0.4, ease: 'power2.out' }, 0.08);

    // ---- 2. 紫色冲击环 ----
    const koRing = document.createElement('div');
    koRing.className = 'ko-shock-ring';
    koRing.dataset.fxId = fxId;
    slot.appendChild(koRing);
    tl.fromTo(koRing, {
      opacity: 1, scale: 0.2, width: 10, height: 10,
      marginLeft: -5, marginTop: -5,
    }, {
      opacity: 0, scale: 5, width: 150, height: 150,
      marginLeft: -75, marginTop: -75,
      duration: 0.65, ease: 'power2.out',
    }, 0.03);

    // ---- 3. 黑烟粒子扩散 ----
    const smokeCount = 16;
    for (let i = 0; i < smokeCount; i++) {
      const smoke = document.createElement('div');
      smoke.className = 'ko-smoke';
      smoke.dataset.fxId = fxId;

      // 随机大小
      const size = 15 + Math.random() * 30;
      smoke.style.width = size + 'px';
      smoke.style.height = size + 'px';

      // 随机初始透明度
      const startAlpha = 0.5 + Math.random() * 0.4;
      smoke.style.background = `radial-gradient(circle,
        rgba(50,30,55,${startAlpha}) 0%,
        rgba(25,10,30,${startAlpha * 0.7}) 40%,
        rgba(10,5,15,${startAlpha * 0.2}) 70%,
        transparent 100%)`;

      slot.appendChild(smoke);

      // 随机方向和距离
      const angle = (i / smokeCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.8;
      const dist = 40 + Math.random() * 70;
      const destX = Math.cos(angle) * dist;
      const destY = Math.sin(angle) * dist;

      tl.fromTo(smoke, {
        opacity: 0, scale: 0.3, x: 0, y: 0, rotation: 0,
      }, {
        opacity: startAlpha, scale: 1 + Math.random() * 1.5, x: destX, y: destY,
        rotation: (Math.random() - 0.5) * 120,
        duration: 0.5 + Math.random() * 0.4,
        ease: 'power2.out',
      }, 0.05 + i * 0.015)
      .to(smoke, {
        opacity: 0, scale: 2 + Math.random() * 2,
        x: destX * 1.6, y: destY * 1.6,
        duration: 0.5 + Math.random() * 0.3,
        ease: 'power2.in',
      }, 0.5 + i * 0.015);
    }

    // ---- 4. 倒计时数字从大缩入圈内（不可见→放大→缩入，约1.1秒） ----
    tl.call(() => {
      const input = slot.querySelector('.ko-circle input');
      if (input) {
        gsap.fromTo(input, {
          scale: 4,
          opacity: 0,
        }, {
          scale: 1,
          opacity: 1,
          duration: 1.1,
          ease: 'power3.out',
        });
      }
    }, null, 0.25);

    console.log('[DamageEffects] 💀 气绝特效 →', slot.querySelector('.card-name')?.value || slot.className);
  }

  /**
   * 复活动画：圣光扇环光柱 + 金色冲击
   */
  function playReviveEffect(slot, koOverlay) {
    if (!slot) return;
    if (typeof gsap === 'undefined') {
      if (koOverlay) koOverlay.remove();
      return;
    }

    // 气绝遮罩直接丢弃（已在调用方摘除）
    if (koOverlay) koOverlay.remove();

    const fxId = ++_fxUid;
    const origPos = slot.style.position;
    if (!origPos || origPos === 'static') {
      slot.style.position = 'relative';
    }

    const tl = gsap.timeline({
      onComplete: () => {
        slot.style.position = origPos;
        setTimeout(() => cleanupElements(slot, fxId), 800);
      }
    });

    // ---- 1. 圣光闪光（更亮） ----
    const reviveFlash = document.createElement('div');
    reviveFlash.className = 'revive-flash';
    reviveFlash.dataset.fxId = fxId;
    slot.appendChild(reviveFlash);
    tl.to(reviveFlash, { background: 'rgba(255,240,180,0.45)', duration: 0.08, ease: 'power2.in' }, 0)
      .to(reviveFlash, { background: 'rgba(255,240,180,0)', duration: 0.55, ease: 'power2.out' }, 0.08);

    // ---- 2. 金色冲击环 ----
    const reviveRing = document.createElement('div');
    reviveRing.className = 'revive-ring';
    reviveRing.dataset.fxId = fxId;
    slot.appendChild(reviveRing);
    tl.fromTo(reviveRing, {
      opacity: 1, scale: 0.15, width: 30, height: 30,
      marginLeft: -15, marginTop: -15,
    }, {
      opacity: 0, scale: 1, width: 180, height: 180,
      marginLeft: -90, marginTop: -90,
      duration: 0.7, ease: 'power3.out',
    }, 0.05);

    // ---- 3. 扇环形光柱（从上方照射下来） ----
    const beamCount = 7;
    const fanSpread = 50; // 扇环展开角度（度）
    for (let i = 0; i < beamCount; i++) {
      const beam = document.createElement('div');
      beam.className = 'revive-beam';
      beam.dataset.fxId = fxId;
      // 从左上/正上/右上放射
      const angleDeg = -fanSpread / 2 + (i / (beamCount - 1)) * fanSpread;
      beam.style.transformOrigin = 'top center';
      beam.style.transform = `rotate(${angleDeg}deg)`;
      beam.style.top = '-70px';
      beam.style.left = '50%';
      beam.style.marginLeft = '-3px';
      slot.appendChild(beam);

      tl.fromTo(beam, {
        opacity: 0, scaleY: 0.3,
      }, {
        opacity: 0.7, scaleY: 1,
        duration: 0.35, ease: 'power3.out',
      }, 0.06 + i * 0.04)
      .to(beam, {
        opacity: 0, scaleY: 0.2,
        duration: 0.5, ease: 'power2.in',
      }, 0.4 + i * 0.04);
    }

    // ---- 4. 金色粒子向上飞散 ----
    for (let i = 0; i < 18; i++) {
      const p = document.createElement('div');
      p.className = 'revive-particle';
      p.dataset.fxId = fxId;
      const size = 5 + Math.random() * 8;
      p.style.width = size + 'px';
      p.style.height = size + 'px';
      slot.appendChild(p);

      const angle = (i / 18) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
      const dist = 30 + Math.random() * 55;
      const destX = Math.cos(angle) * dist;
      const destY = Math.sin(angle) * dist - 55;

      tl.fromTo(p, {
        opacity: 1, scale: 0, x: 0, y: 0,
      }, {
        opacity: 0, scale: 1.3, x: destX, y: destY,
        duration: 0.65 + Math.random() * 0.4,
        ease: 'power2.out',
      }, 0.1 + i * 0.025);
    }

    console.log('[DamageEffects] ✨ 复活动画 →', slot.querySelector('.card-name')?.value || slot.className);
  }

  /**
   * 灵咒特效：紫色幽魂旋转入场/出场
   * @param {HTMLElement} slot - 卡牌槽
   * @param {'apply'|'remove'} action - 结附或移除
   */
  function playCurseEffect(slot, action) {
    if (!slot) return;
    if (typeof gsap === 'undefined') return;

    const fxId = ++_fxUid;
    const isApply = action === 'apply';

    const origPos = slot.style.position;
    if (!origPos || origPos === 'static') {
      slot.style.position = 'relative';
    }

    const tl = gsap.timeline({
      onComplete: () => {
        slot.style.position = origPos;
        setTimeout(() => cleanupElements(slot, fxId), 700);
      }
    });

    // ---- 紫色闪光 ----
    const curseFlash = document.createElement('div');
    curseFlash.className = 'curse-flash';
    curseFlash.dataset.fxId = fxId;
    slot.appendChild(curseFlash);
    tl.to(curseFlash, { background: 'rgba(100,40,160,0.2)', duration: 0.08, ease: 'power2.in' }, 0)
      .to(curseFlash, { background: 'rgba(100,40,160,0)', duration: 0.35, ease: 'power2.out' }, 0.08);

    // ---- 幽魂本体 ----
    const ghost = document.createElement('div');
    ghost.className = 'curse-ghost';
    ghost.dataset.fxId = fxId;
    slot.appendChild(ghost);

    // ---- 3个尾迹 ----
    const trails = [];
    for (let i = 0; i < 3; i++) {
      const trail = document.createElement('div');
      trail.className = 'curse-ghost-trail';
      trail.dataset.fxId = fxId;
      slot.appendChild(trail);
      trails.push(trail);
    }

    if (isApply) {
      // 结附：从外旋入 → 化身徽章
      tl.fromTo(ghost, {
        opacity: 0, scale: 0.1, rotation: 0, x: -60, y: -60,
      }, {
        opacity: 0.9, scale: 1, rotation: 360, x: 0, y: 0,
        duration: 0.55, ease: 'power3.out',
      }, 0.05)
      .to(ghost, {
        opacity: 0, scale: 1.5, rotation: 540,
        duration: 0.3, ease: 'power2.in',
      }, 0.6);

      // 尾迹跟随
      trails.forEach((trail, i) => {
        tl.fromTo(trail, {
          opacity: 0, x: -60, y: -60,
        }, {
          opacity: 0.35, x: -15 * (i + 1), y: -15 * (i + 1),
          duration: 0.4, ease: 'power2.out',
        }, 0.05 + i * 0.04)
        .to(trail, {
          opacity: 0, x: 20, y: 20,
          duration: 0.3, ease: 'power2.in',
        }, 0.45 + i * 0.04);
      });
    } else {
      // 移除：徽章处显现 → 旋出消失
      tl.fromTo(ghost, {
        opacity: 0.9, scale: 0.6, rotation: 0, x: 0, y: 0,
      }, {
        opacity: 0, scale: 0.1, rotation: -360, x: 60, y: -60,
        duration: 0.55, ease: 'power3.in',
      }, 0.05);

      trails.forEach((trail, i) => {
        tl.fromTo(trail, {
          opacity: 0.35, x: 10 * (i + 1), y: 10 * (i + 1),
        }, {
          opacity: 0, x: 70, y: -50,
          duration: 0.45, ease: 'power2.in',
        }, 0.08 + i * 0.04);
      });
    }

    console.log('[DamageEffects] 👻 灵咒' + (isApply ? '结附' : '移除') + ' →', slot.querySelector('.card-name')?.value || slot.className);
  }

  /** 烹饪特效：锅+蒸汽粒子 */
  function playCookEffect(slot) {
    if (!slot) return;
    if (typeof gsap === 'undefined') {
      console.warn('[DamageEffects] GSAP 未加载，烹饪特效跳过');
      return;
    }
    const fxId = ++_fxUid;

    const origPos = slot.style.position;
    if (!origPos || origPos === 'static') {
      slot.style.position = 'relative';
    }

    const tl = gsap.timeline({
      onComplete: () => {
        slot.style.position = origPos;
        setTimeout(() => cleanupElements(slot, fxId), 600);
      }
    });

    // 锅体：2倍大，居中，弹入→短暂停留→缩小消失
    const pot = document.createElement('div');
    pot.className = 'cook-pot';
    pot.dataset.fxId = fxId;
    pot.textContent = '🍳';
    pot.style.fontSize = '84px'; // 2倍大小
    slot.appendChild(pot);
    tl.fromTo(pot, { scale: 0, opacity: 0, rotation: -45, y: 20 }, {
      scale: 1.2, opacity: 1, rotation: 0, y: 0,
      duration: 0.4, ease: 'back.out(1.7)',
    }, 0)
    .to(pot, { scale: 1, duration: 0.1 }, 0.4)
    .to(pot, { scale: 1, duration: 0.5 }, 0.5)  // 停留
    .to(pot, { scale: 0.2, opacity: 0, rotation: 25, y: -30,
      duration: 0.5, ease: 'power2.in' }, 1.0);

    // 蒸汽/火花粒子
    const steamCount = 10;
    for (let i = 0; i < steamCount; i++) {
      const steam = document.createElement('div');
      steam.className = 'cook-steam';
      steam.dataset.fxId = fxId;
      const size = 8 + Math.random() * 14;
      steam.style.width = size + 'px';
      steam.style.height = size + 'px';
      const colors = ['#ffe8b0','#ffd080','#ffc860','#fff0d0','#ffb840'];
      steam.style.background = colors[Math.floor(Math.random() * colors.length)];
      slot.appendChild(steam);

      const angle = (Math.random() - 0.5) * Math.PI * 0.6 - Math.PI / 2;
      const dist = 30 + Math.random() * 55;
      const destX = Math.cos(angle) * dist;
      const destY = Math.sin(angle) * dist - 25;

      tl.fromTo(steam, { opacity: 0, scale: 0, x: 0, y: 5 }, {
        opacity: 0.8 + Math.random() * 0.2, scale: 1.2, x: destX, y: destY,
        duration: 0.55 + Math.random() * 0.3, ease: 'power2.out',
      }, 0.15 + i * 0.03)
      .to(steam, { opacity: 0, scale: 0.2, x: destX * 1.6, y: destY - 30,
        duration: 0.55 + Math.random() * 0.2, ease: 'power2.in',
      }, 0.7 + i * 0.03);
    }

    console.log('[DamageEffects] 🍳 烹饪特效 →', slot.querySelector('.card-name')?.value || slot.className);
  }

  return {
    playDamage,
    playDamageOnSlot,
    playOnRandomSlot,
    playKoEffect,
    playReviveEffect,
    playCurseEffect,
    playCookEffect,
    LEVELS,
  };

})();


// ================================================================
//  DebugPanel — 可拖拽调试面板
//  特性：不拦截背后点击、只能按关闭键关闭、可拖拽
// ================================================================
const DebugPanel = (() => {

  let _wrapper = null;
  let _panel = null;
  let _isOpen = false;
  let _selectedLevel = 'damage';
  let _damageValue = 5;

  // 拖拽状态
  let _dragging = false;
  let _dragStartX = 0;
  let _dragStartY = 0;
  let _panelStartX = 0;
  let _panelStartY = 0;

  function init() {
    if (document.getElementById('debug-panel-wrapper')) return;
    _createDOM();
    _bindEvents();
    console.log('[DebugPanel] ✅ 调试面板已就绪');
  }

  function _createDOM() {
    // 包装层：pointer-events: none 使得背后可穿透
    _wrapper = document.createElement('div');
    _wrapper.id = 'debug-panel-wrapper';
    _wrapper.className = 'debug-panel-wrapper';
    _wrapper.hidden = true;

    _panel = document.createElement('div');
    _panel.className = 'debug-panel';
    _panel.innerHTML = `
      <div class="debug-panel__header">
        <span class="debug-panel__title">🔧 特效调试面板</span>
        <button type="button" class="debug-panel__close" title="关闭面板">✕</button>
      </div>
      <div class="debug-panel__body">
        <div class="debug-panel__section">
          <span class="debug-panel__label">伤害数值</span>
          <div class="debug-panel__row">
            <input type="number" class="debug-panel__input" id="debug-damage-value"
                   value="5" min="1" max="999" aria-label="伤害数值">
          </div>
        </div>
        <div class="debug-panel__section">
          <span class="debug-panel__label">特效类型</span>
          <div class="debug-panel__effect-btns" id="debug-effect-btns">
            <button type="button" class="debug-panel__effect-btn debug-panel__effect-btn--damage debug-panel__effect-btn--active" data-level="damage">💥 伤害</button>
            <button type="button" class="debug-panel__effect-btn debug-panel__effect-btn--heal" data-level="heal">💚 治疗</button>
          </div>
        </div>
        <div class="debug-panel__section">
          <button type="button" class="debug-panel__test-btn" id="debug-test-current">
            🎯 测试当前卡牌槽
          </button>
          <button type="button" class="debug-panel__test-btn debug-panel__test-btn--random" id="debug-test-random">
            🎲 随机卡牌槽测试
          </button>
          <button type="button" class="debug-panel__test-btn debug-panel__test-btn--random" id="debug-test-all" style="border-color:rgba(200,150,100,0.4);">
            🌪️ 全部卡牌槽齐射
          </button>
          <button type="button" class="debug-panel__test-btn debug-panel__test-btn--random" id="debug-test-ko" style="border-color:rgba(160,120,200,0.5);background:linear-gradient(180deg,rgba(80,40,100,0.5),rgba(40,20,60,0.4));">
            💀 气绝特效测试
          </button>
        </div>
        <div class="debug-panel__hint">拖拽标题栏移动面板 · 点击 ✕ 关闭</div>
      </div>
    `;

    _wrapper.appendChild(_panel);
    document.body.appendChild(_wrapper);

    // 读取保存的伤害值
    const inputEl = _panel.querySelector('#debug-damage-value');
    if (inputEl) {
      inputEl.addEventListener('input', () => {
        _damageValue = parseInt(inputEl.value, 10) || 1;
      });
      inputEl.addEventListener('change', () => {
        const v = parseInt(inputEl.value, 10);
        if (!v || v < 1) inputEl.value = 1;
        if (v > 999) inputEl.value = 999;
        _damageValue = parseInt(inputEl.value, 10) || 1;
      });
    }
  }

  function _bindEvents() {
    // 关闭按钮
    _panel.querySelector('.debug-panel__close').addEventListener('click', (e) => {
      e.stopPropagation();
      close();
    });

    // 拖拽
    const header = _panel.querySelector('.debug-panel__header');
    header.addEventListener('pointerdown', _onDragStart);
    window.addEventListener('pointermove', _onDragMove);
    window.addEventListener('pointerup', _onDragEnd);
    // 防止文本选中干扰
    header.addEventListener('selectstart', (e) => e.preventDefault());

    // 效果等级按钮
    const btns = _panel.querySelectorAll('#debug-effect-btns .debug-panel__effect-btn');
    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        btns.forEach(b => b.classList.remove('debug-panel__effect-btn--active'));
        btn.classList.add('debug-panel__effect-btn--active');
        _selectedLevel = btn.dataset.level;
      });
    });

    // 测试按钮
    _panel.querySelector('#debug-test-current').addEventListener('click', () => {
      const slot = getCurrentOrFirstSlot();
      if (slot) DamageEffects.playDamage(slot, _damageValue, _selectedLevel);
    });

    _panel.querySelector('#debug-test-random').addEventListener('click', () => {
      DamageEffects.playOnRandomSlot(_damageValue, _selectedLevel);
    });

    _panel.querySelector('#debug-test-all').addEventListener('click', () => {
      const allSlots = document.querySelectorAll('.card-slot');
      allSlots.forEach((slot, i) => {
        setTimeout(() => {
          DamageEffects.playDamage(slot, _damageValue, _selectedLevel);
        }, i * 80);
      });
    });

    _panel.querySelector('#debug-test-ko').addEventListener('click', () => {
      const slot = getCurrentOrFirstSlot();
      if (slot) {
        // 先确保有图片和名字，否则 ko-overlay 无法挂载到 card-art
        if (!slot.classList.contains('has-image')) {
          slot.classList.add('has-image');
        }
        const nameInput = slot.querySelector('.card-name');
        if (nameInput && !nameInput.value) nameInput.value = '测试式神';
        DamageEffects.playKoEffect(slot);
      }
    });
  }

  function _onDragStart(e) {
    // 只响应标题栏的拖拽
    if (!e.target.closest('.debug-panel__header')) return;
    _dragging = true;
    _dragStartX = e.clientX;
    _dragStartY = e.clientY;
    _panelStartX = _panel.offsetLeft;
    _panelStartY = _panel.offsetTop;
    _panel.style.transition = 'none';
  }

  function _onDragMove(e) {
    if (!_dragging) return;
    const dx = e.clientX - _dragStartX;
    const dy = e.clientY - _dragStartY;
    let newX = _panelStartX + dx;
    let newY = _panelStartY + dy;

    // 限制在视口内
    const maxX = window.innerWidth - _panel.offsetWidth - 10;
    const maxY = window.innerHeight - _panel.offsetHeight - 10;
    newX = Math.max(10, Math.min(newX, maxX));
    newY = Math.max(10, Math.min(newY, maxY));

    _panel.style.left = newX + 'px';
    _panel.style.top = newY + 'px';
  }

  function _onDragEnd() {
    if (!_dragging) return;
    _dragging = false;
    _panel.style.transition = '';
  }

  function getCurrentOrFirstSlot() {
    // 优先找当前高亮/活跃的卡牌槽，否则第一个
    const allSlots = document.querySelectorAll('.card-slot');
    return allSlots[0] || null;
  }

  function open() {
    if (_isOpen) return;
    _wrapper.hidden = false;
    _isOpen = true;
    // 默认位置
    if (!_panel.style.left) {
      _panel.style.left = '120px';
      _panel.style.top = '120px';
    }
    console.log('[DebugPanel] 🔧 调试面板已打开');
  }

  function close() {
    if (!_isOpen) return;
    _wrapper.hidden = true;
    _isOpen = false;
    console.log('[DebugPanel] 🔧 调试面板已关闭');
  }

  function toggle() {
    if (_isOpen) close();
    else open();
  }

  return { init, open, close, toggle, get isOpen() { return _isOpen; } };

})();


// ================================================================
//  自动初始化
// ================================================================
(function _autoInit() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => DebugPanel.init());
  } else {
    DebugPanel.init();
  }
})();

console.log('[SpecialEffects] ✅ 伤害特效 + 调试面板模块已加载');
