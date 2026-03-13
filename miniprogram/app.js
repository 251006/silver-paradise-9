// app.js
const { preloadAudioAssets } = require("./utils/tts");

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

    // 全局音频参数，提升 iOS 真机播报稳定性
    wx.setInnerAudioOption({
      mixWithOther: true,
      obeyMuteSwitch: false,
      speakerOn: true,
      success: () => {
        console.log("音频参数设置成功");
      },
      fail: (err) => {
        console.warn("音频参数设置失败", err);
      },
    });

    // 预加载语音资源，避免首次点击时才下载导致真机不播报
    preloadAudioAssets()
      .then((result) => {
        console.log("语音资源预加载结果", result);
      })
      .catch((err) => {
        console.warn("语音资源预加载失败", err);
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
