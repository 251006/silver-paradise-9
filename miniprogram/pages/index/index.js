// pages/index/index.js - 银龄乐园首页
const app = getApp();

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
        title: "社区问答",
        desc: "用您的经验帮助年轻人",
        url: "/pages/qa/index",
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
        title: "社区问答",
        desc: "向长辈请教经验智慧",
        url: "/pages/qa/index",
        color: "#4ECDC4",
      },
      {
        icon: "❤️",
        title: "长辈动态",
        desc: "浏览长辈们的生活分享",
        url: "/pages/feed/index",
        color: "#FF6B6B",
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
    const tabPages = [
      "/pages/index/index",
      "/pages/news/index",
      "/pages/qa/index",
      "/pages/profile/index",
      "/pages/feed/index",
    ];
    if (tabPages.includes(url)) {
      wx.switchTab({ url });
    } else {
      wx.navigateTo({ url });
    }
  },
});
