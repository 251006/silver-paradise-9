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
    followingCount: 0,
    followerCount: 0,
    likeCount: 0,
    postCount: 0,
    questionCount: 0,
    posts: [],
    questions: [],
    loading: true,
  },

  onShow() {
    const userInfo = wx.getStorageSync("userInfo") || {};
    this.setData({
      nickname: userInfo.nickname || "未登录用户",
      avatarUrl: userInfo.avatarUrl || defaultAvatarUrl,
      openid: userInfo.openid || "",
      role: userInfo.role || "elder",
    });

    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 });
    }

    this.loadPageData();
  },

  async loadPageData() {
    if (!this.data.openid) {
      this.setData({ loading: false });
      return;
    }

    this.setData({ loading: true });
    try {
      await Promise.all([
        this.loadProfileSummary(),
        this.data.role === "elder" ? this.loadMyPosts() : this.loadMyQuestions(),
      ]);
    } finally {
      this.setData({ loading: false });
    }
  },

  async loadProfileSummary() {
    try {
      const res = await wx.cloud.callFunction({
        name: "userFunctions",
        data: {
          type: "getUserProfile",
        },
      });

      if (res.result && res.result.code === 0) {
        const profile = res.result.profile || {};
        this.setData({
          nickname: profile.nickname || this.data.nickname,
          avatarUrl: profile.avatarUrl || this.data.avatarUrl,
          role: profile.role || this.data.role,
          followingCount: Number(profile.followingCount || 0),
          followerCount: Number(profile.followerCount || 0),
          likeCount: Number(profile.likeCount || 0),
        });

        const userInfo = wx.getStorageSync("userInfo") || {};
        userInfo.nickname = profile.nickname || userInfo.nickname;
        userInfo.role = profile.role || userInfo.role;
        wx.setStorageSync("userInfo", userInfo);
        if (app.globalData) {
          app.globalData.userInfo = userInfo;
        }
      }
    } catch (err) {
      console.error("loadProfileSummary error:", err);
    }
  },

  async loadMyPosts() {
    try {
      const res = await wx.cloud.callFunction({
        name: "postFunctions",
        data: { type: "listMyPosts", page: 1, pageSize: 50 },
      });

      if (res.result && res.result.code === 0) {
        const posts = res.result.posts || [];
        this.setData({
          posts,
          postCount: posts.length,
        });
      }
    } catch (err) {
      console.error("loadMyPosts error:", err);
      wx.showToast({ title: "加载动态失败", icon: "none" });
    }
  },

  async loadMyQuestions() {
    try {
      const res = await wx.cloud.callFunction({
        name: "qaFunctions",
        data: {
          type: "listUserQuestions",
          userId: this.data.openid,
          page: 1,
          pageSize: 30,
        },
      });

      if (res.result && res.result.code === 0) {
        const questions = res.result.questions || [];
        this.setData({
          questions,
          questionCount: questions.length,
        });
      }
    } catch (err) {
      console.error("loadMyQuestions error:", err);
      wx.showToast({ title: "加载提问失败", icon: "none" });
    }
  },

  onAvatarError() {
    this.setData({ avatarUrl: defaultAvatarUrl });
  },

  async onLikePost(e) {
    const postId = e.currentTarget.dataset.id;
    if (!postId) return;

    try {
      const res = await wx.cloud.callFunction({
        name: "postFunctions",
        data: { type: "likePost", postId },
      });

      if (res.result && res.result.code === 0) {
        const posts = this.data.posts.map((item) => {
          if (item._id !== postId) return item;
          return {
            ...item,
            likes: Number(res.result.likes || 0),
            liked: !!res.result.liked,
          };
        });

        this.setData({ posts });
        this.loadProfileSummary();
      }
    } catch (err) {
      wx.showToast({ title: "操作失败", icon: "none" });
    }
  },

  addToMemoir() {
    wx.showToast({ title: "已标记为回忆录素材", icon: "success" });
  },

  async deletePost(e) {
    const postId = e.currentTarget.dataset.id;

    const res = await wx.showModal({
      title: "确认删除",
      content: "删除后无法恢复，确定要删除这条动态吗？",
      confirmText: "确认删除",
      confirmColor: "#FF3B30",
      cancelText: "取消",
    });

    if (!res.confirm) return;

    wx.showLoading({ title: "删除中...", mask: true });

    try {
      const result = await wx.cloud.callFunction({
        name: "postFunctions",
        data: {
          type: "deletePost",
          postId,
        },
      });

      wx.hideLoading();

      if (result.result && result.result.code === 0) {
        wx.showToast({ title: "删除成功", icon: "success" });
        this.loadMyPosts();
      } else {
        wx.showToast({
          title: (result.result && result.result.msg) || "删除失败",
          icon: "none",
        });
      }
    } catch (err) {
      console.error("deletePost error:", err);
      wx.hideLoading();
      wx.showToast({ title: "删除失败，请重试", icon: "none" });
    }
  },

  goSettings() {
    wx.navigateTo({ url: "/pages/settings/index" });
  },

  goPublish() {
    wx.navigateTo({ url: "/pages/post/publish" });
  },

  goMemoir() {
    wx.navigateTo({ url: "/pages/memoir/index" });
  },

  goMessages() {
    wx.navigateTo({ url: "/pages/messages/index" });
  },

  goAsk() {
    wx.navigateTo({ url: "/pages/qa/ask" });
  },

  goFollowingList() {
    wx.navigateTo({ url: "/pages/followList/index?mode=following" });
  },

  goFollowerList() {
    wx.navigateTo({ url: "/pages/followList/index?mode=followers" });
  },

  goPostDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/post/detail?id=${id}` });
  },

  goQuestionDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/qa/detail?id=${id}` });
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
});
