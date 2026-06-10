// ================================================================
//  js/constants.js — 全局常量与工具函数
//  定义应用版本号、标题、HTML 转义等基础工具
// ================================================================

    // ================================================================
    //  全局常量
    // ================================================================
    const APP_VERSION = 'v0.24';
    const APP_TITLE = '百闻牌模拟器';
    document.title = `${APP_TITLE} ${APP_VERSION}`;
    const roomTitleEl = document.getElementById('room-title');
    if (roomTitleEl) roomTitleEl.textContent = `🎴 ${APP_TITLE} ${APP_VERSION}`;

    // ================================================================
    //  工具函数
    // ================================================================

    /** HTML 转义 */
    function escapeHTML(str) {
      const div = document.createElement('div');
      div.appendChild(document.createTextNode(str));
      return div.innerHTML;
    }
