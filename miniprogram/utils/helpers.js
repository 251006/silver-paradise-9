// utils/helpers.js - 通用辅助函数

/**
 * 显示提示消息
 * @param {string} title - 提示内容
 * @param {string} icon - 图标类型：success, error, loading, none
 * @param {number} duration - 显示时长（毫秒）
 */
function showToast(title, icon = 'none', duration = 2000) {
  wx.showToast({
    title,
    icon,
    duration
  });
}

/**
 * 显示模态对话框
 * @param {string} title - 标题
 * @param {string} content - 内容
 * @param {boolean} showCancel - 是否显示取消按钮
 * @returns {Promise<boolean>} - 用户是否点击确定
 */
function showModal(title, content, showCancel = true) {
  return new Promise((resolve) => {
    wx.showModal({
      title,
      content,
      showCancel,
      success: (res) => {
        resolve(res.confirm);
      }
    });
  });
}

module.exports = {
  showToast,
  showModal
};
