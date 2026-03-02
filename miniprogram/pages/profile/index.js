// pages/profile/index.js - 我的页面（根据角色显示不同内容）
const app = getApp();

// 默认头像URL
const defaultAvatarUrl = 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0';

Page({
  data: {
    nickname: "",
    avatarUrl: defaultAvatarUrl,
    openid: "",
    role: "",
    
    // 统计数据
    postCount: 0,
    questionCount: 0,
    likeCount: 0,
    
    // 内容数据
    posts: [],
    questions: [],
    loading: true,
  },

  onShow() {
    const userInfo = wx.getStorageSync("userInfo");
    if (userInfo) {
      this.setData({ 
        nickname: userInfo.nickname,
        avatarUrl: userInfo.avatarUrl || defaultAvatarUrl,
        openid: userInfo.openid || '',
        role: userInfo.role || 'elder'
      });
    }

    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 });
    }

    // 根据角色加载不同内容
    if (this.data.role === 'elder') {
      this.loadMyPosts();
    } else {
      this.loadMyQuestions();
    }
  },

  onAvatarError() {
    this.setData({ avatarUrl: defaultAvatarUrl });
  },

  // ========== 老人用户数据加载 ==========
  
  async loadMyPosts() {
    this.setData({ loading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: "postFunctions",
        data: { type: "listMyPosts", page: 1, pageSize: 50 },
      });
      if (res.result.code === 0) {
        const posts = res.result.posts;
        let totalLikes = 0;
        posts.forEach(post => {
          totalLikes += (post.likes || 0);
        });
        
        this.setData({ 
          posts,
          postCount: posts.length,
          likeCount: totalLikes
        });
      }
    } catch (err) {
      console.error("加载动态失败", err);
    } finally {
      this.setData({ loading: false });
    }
  },

  async onLikePost(e) {
    const postId = e.currentTarget.dataset.id;
    try {
      const res = await wx.cloud.callFunction({
        name: "postFunctions",
        data: { type: "likePost", postId },
      });
      if (res.result.code === 0) {
        this.loadMyPosts();
      }
    } catch (err) {
      wx.showToast({ title: "操作失败", icon: "none" });
    }
  },

  async addToMemoir(e) {
    const postId = e.currentTarget.dataset.id;
    wx.showToast({ title: "已标记为回忆录素材", icon: "success" });
  },

  // ========== 年轻用户数据加载 ==========
  
  async loadMyQuestions() {
    this.setData({ loading: true });
    try {
      // 这里需要添加云函数接口获取我的提问
      // 暂时使用空数组
      this.setData({
        questions: [],
        questionCount: 0,
        loading: false
      });
      
      wx.showToast({ title: '我的提问功能开发中', icon: 'none', duration: 1500 });
    } catch (err) {
      console.error("加载提问失败", err);
      this.setData({ loading: false });
    }
  },

  // ========== 页面跳转 ==========

  goSettings() {
    wx.navigateTo({ url: "/pages/settings/index" });
  },

  goPublish() {
    wx.navigateTo({ url: "/pages/post/publish" });
  },

  goMemoir() {
    wx.navigateTo({ url: "/pages/memoir/index" });
  },

  goAsk() {
    wx.navigateTo({ url: "/pages/qa/ask" });
  },

  onLogout() {
    wx.showModal({
      title: "退出登录",
      content: "退出后将返回身份选择页，是否继续？",
      confirmText: "确认退出",
      cancelText: "取消",
      success: (res) => {
        if (!res.confirm) {
          return;
        }

        wx.removeStorageSync("userInfo");
        app.globalData.userInfo = null;

        wx.reLaunch({ url: "/pages/identity/index" });
      },
    });
  },

  formatTime(timestamp) {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  },
});
