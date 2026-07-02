// ================================================================
//  js/constants.js — 全局常量与工具函数
//  定义应用版本号、标题、HTML 转义、调试模式等基础工具
// ================================================================

    // ================================================================
    //  全局常量
    // ================================================================
    const APP_VERSION = 'v0.37';
    const APP_TITLE = '百闻牌模拟器';

    /** 调试模式：0=关闭 1=开启（显示隐藏的编辑器按钮） */
    const DEBUG_MODE = 0;

    /** 联机服务器配置 */
    // PEER_SERVER 已废弃，联机改用 Socket.IO
    const IMAGE_BASE = 'https://bwpemu.top';
    window._IMAGE_BASE = IMAGE_BASE;  // 供 inline onerror 使用
    /** 自动将所有相对 images/ 路径改为服务端URL */
    (function() {
      function fixImg(img) {
        var s = img.getAttribute('src') || '';
        if (s.startsWith('images/')) { img.src = IMAGE_BASE + '/' + s; return; }
        if (s.startsWith('../images/')) { img.src = IMAGE_BASE + '/' + s.replace('../',''); return; }
      }
      function fixStyle(el) {
        var bg = el.style.backgroundImage;
        if (!bg || bg.indexOf(IMAGE_BASE) !== -1) return; // 已修复则跳过，防止死循环
        el.style.backgroundImage = bg.replace(/(["']?)(\.\.\/)?images\//g, '$1' + IMAGE_BASE + '/images/');
      }
      // 监听新元素和属性变化
      new MutationObserver(function(mutations) {
        mutations.forEach(function(m) {
          m.addedNodes.forEach(function(node) {
            if (node.tagName === 'IMG') fixImg(node);
            if (node.style && node.style.backgroundImage && node.style.backgroundImage.indexOf('images/') !== -1 && node.style.backgroundImage.indexOf(IMAGE_BASE) === -1) fixStyle(node);
            if (node.querySelectorAll) {
              node.querySelectorAll('img').forEach(fixImg);
              node.querySelectorAll('[style*="images/"]').forEach(fixStyle);
            }
          });
          if (m.type === 'attributes') {
            if (m.target.tagName === 'IMG' && m.attributeName === 'src') fixImg(m.target);
            if (m.attributeName === 'style' && m.target.style && m.target.style.backgroundImage && m.target.style.backgroundImage.indexOf('images/') !== -1 && m.target.style.backgroundImage.indexOf(IMAGE_BASE) === -1) fixStyle(m.target);
          }
        });
      }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'style'] });
      // 修复已有图片
      document.addEventListener('DOMContentLoaded', function() {
        document.querySelectorAll('img').forEach(fixImg);
      });
    })();
    function imgUrl(path) { return IMAGE_BASE + '/' + path; }

    document.title = `${APP_TITLE} ${APP_VERSION}`;
    const roomTitleEl = document.getElementById('room-title');
    if (roomTitleEl) roomTitleEl.textContent = `🎴 ${APP_TITLE} ${APP_VERSION}`;
    // 登录界面左下角版本号
    const versionEl = document.getElementById('auth-version');
    if (versionEl) versionEl.textContent = APP_VERSION;

    // ================================================================
    //  工具函数
    // ================================================================

    /** HTML 转义 */
    function escapeHTML(str) {
      const div = document.createElement('div');
      div.appendChild(document.createTextNode(str));
      return div.innerHTML;
    }

    /** 调试模式初始化：显示/隐藏编辑器按钮 */
    function initDebugMode() {
      if (!DEBUG_MODE) return;
      console.log('[Debug] 🛠 调试模式已开启');
      // 显示"其他"下拉中的隐藏按钮
      const btns = document.querySelectorAll('.dropdown-other__item[hidden]');
      btns.forEach(btn => btn.removeAttribute('hidden'));
    }
    // 脚本加载时自动执行（位于 </body> 前，DOM 已就绪）
    initDebugMode();
