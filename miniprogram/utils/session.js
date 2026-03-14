// utils/session.js - 会话管理工具

const SESSION_KEY = 'user_session';

/**
 * 获取会话数据
 * @returns {Object} 会话数据
 */
function getSession() {
  try {
    const userInfo = wx.getStorageSync('userInfo') || {};
    const sessionData = wx.getStorageSync(SESSION_KEY) || {};
    return {
      ...userInfo,
      ...sessionData,
      role: userInfo.role || '',
      username: userInfo.nickname || '访客'
    };
  } catch (e) {
    console.error('获取会话失败', e);
    return { role: '', username: '访客' };
  }
}

/**
 * 设置会话数据
 * @param {Object} data - 要保存的数据
 */
function setSession(data) {
  try {
    const existing = wx.getStorageSync(SESSION_KEY) || {};
    wx.setStorageSync(SESSION_KEY, { ...existing, ...data });
  } catch (e) {
    console.error('保存会话失败', e);
  }
}

/**
 * 清除会话数据
 */
function clearSession() {
  try {
    wx.removeStorageSync(SESSION_KEY);
  } catch (e) {
    console.error('清除会话失败', e);
  }
}

module.exports = {
  getSession,
  setSession,
  clearSession
};
