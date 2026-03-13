const { playNavigationAudio, playCenterActionAudio } = require("../utils/tts");

const NAV_AUDIO_LEAD_MS = 420;

Component({
  data: {
    selected: 0,
    role: "elder",
    list: [
      {
        pagePath: "/pages/index/index",
        text: "首页",
        iconPath: "/images/icons/home.png",
        selectedIconPath: "/images/icons/home-active.png",
      },
      {
        pagePath: "/pages/news/index",
        text: "资讯",
        iconPath: "/images/icons/examples.png",
        selectedIconPath: "/images/icons/examples-active.png",
      },
      {
        pagePath: "/pages/community/index",
        text: "社区",
        iconPath: "/images/icons/business.png",
        selectedIconPath: "/images/icons/business-active.png",
      },
      {
        pagePath: "/pages/profile/index",
        text: "我的",
        iconPath: "/images/icons/usercenter.png",
        selectedIconPath: "/images/icons/usercenter-active.png",
      },
    ],
  },

  attached() {
    this.updateRole();
  },

  pageLifetimes: {
    show() {
      this.updateRole();
    },
  },

  methods: {
    updateRole() {
      try {
        const userInfo = wx.getStorageSync("userInfo");
        if (userInfo && userInfo.role) {
          this.setData({ role: userInfo.role });
        }
      } catch (e) {
        console.error("TabBar: 读取角色失败", e);
      }
    },

    switchTab(e) {
      const data = e.currentTarget.dataset;
      const url = data.path;
      playNavigationAudio(url);
      setTimeout(() => {
        wx.switchTab({ url });
      }, NAV_AUDIO_LEAD_MS);
    },

    onCenterAction() {
      if (this.data.role === "elder") {
        playCenterActionAudio("elder");
        setTimeout(() => {
          wx.navigateTo({ url: "/pages/post/publish" });
        }, NAV_AUDIO_LEAD_MS);
        return;
      }

      if (this.data.role === "young") {
        playCenterActionAudio("young");
        setTimeout(() => {
          wx.navigateTo({ url: "/pages/qa/ask" });
        }, NAV_AUDIO_LEAD_MS);
        return;
      }

      wx.showToast({ title: "请先完成身份选择", icon: "none" });
    },
  },
});
