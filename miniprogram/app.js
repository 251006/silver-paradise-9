// app.js
App({
  globalData: {
    env: "cloud1-3gg62631189fd1f5",
    userInfo: null, // { openid, nickname, role }
  },
  
  onLaunch: function () {
    if (!wx.cloud) {
      console.error("请使用 2.2.3 或以上的基础库以使用云能力");
      return;
    }

    wx.cloud.init({
      env: this.globalData.env,
      traceUser: true,
    });

    // 检查本地缓存，判断是否已完成身份选择
    this.checkIdentity();
  },

  checkIdentity: function () {
    try {
      const userInfo = wx.getStorageSync("userInfo");
      if (userInfo && userInfo.role && userInfo.nickname) {
        this.globalData.userInfo = userInfo;
      }
    } catch (e) {
      console.error("读取用户信息失败", e);
    }
  },

  // 获取用户身份，供页面调用
  getUserRole: function () {
    if (this.globalData.userInfo) {
      return this.globalData.userInfo.role;
    }
    return null;
  },

  // 判断是否为老人用户
  isElder: function () {
    return this.getUserRole() === "elder";
  },

  // 判断是否为年轻用户
  isYoung: function () {
    return this.getUserRole() === "young";
  },
});
