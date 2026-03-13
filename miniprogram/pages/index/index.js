// pages/index/index.js - 银龄乐园首页
const app = getApp();
const { playNavigationAudio } = require("../../utils/tts");
const NAV_AUDIO_LEAD_MS = 420;

Page({
  data: {
    role: "",
    nickname: "",
    elderEntries: [
      {
        icon: "📰",
        title: "资讯科普",
        desc: "阅读健康养生、时事新闻",
        url: "/pages/news/index",
        color: "#FF6B35",
      },
      {
        icon: "💬",
        title: "社区",
        desc: "动态分享与社区问答",
        url: "/pages/community/index",
        color: "#4ECDC4",
      },
      {
        icon: "👤",
        title: "我的主页",
        desc: "发动态、写回忆录",
        url: "/pages/profile/index",
        color: "#FFD93D",
      },
    ],
    youngEntries: [
      {
        icon: "📰",
        title: "资讯科普",
        desc: "了解新闻资讯",
        url: "/pages/news/index",
        color: "#FF6B35",
      },
      {
        icon: "💬",
        title: "社区",
        desc: "长辈动态与社区问答",
        url: "/pages/community/index",
        color: "#4ECDC4",
      },
      {
        icon: "👤",
        title: "我的主页",
        desc: "我的提问与收藏",
        url: "/pages/profile/index",
        color: "#FFD93D",
      },
    ],
  },

  onShow() {
    const userInfo = wx.getStorageSync("userInfo");
    if (!userInfo || !userInfo.role) {
      wx.redirectTo({ url: "/pages/identity/index" });
      return;
    }

    this.setData({
      role: userInfo.role,
      nickname: userInfo.nickname,
    });

    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
  },

  onEntryTap(e) {
    const url = e.currentTarget.dataset.url;
    playNavigationAudio(url);
    const tabPages = [
      "/pages/index/index",
      "/pages/news/index",
      "/pages/community/index",
      "/pages/profile/index",
    ];
    if (tabPages.includes(url)) {
      setTimeout(() => {
        wx.switchTab({ url });
      }, NAV_AUDIO_LEAD_MS);
    } else {
      setTimeout(() => {
        wx.navigateTo({ url });
      }, NAV_AUDIO_LEAD_MS);
    }
  },
});
