// ================================================================
//  js/constants.js — 全局常量与工具函数
//  定义应用版本号、标题、HTML 转义、调试模式等基础工具
// ================================================================

    // ================================================================
    //  全局常量
    // ================================================================
    const APP_VERSION = 'v0.27';
    const APP_TITLE = '百闻牌模拟器';

    /** 调试模式：0=关闭 1=开启（显示隐藏的编辑器按钮） */
    const DEBUG_MODE = 0;

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
