// pages/profile/index.js - 我的页面（根据角色显示不同内容）
const app = getApp();
const PROFILE_CACHE_TTL = 2 * 60 * 1000; // 2分钟内不重复请求

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
    postsLeft: [],
    postsRight: [],
    questions: [],
    loading: true,
  },

  _splitMasonry(list = []) {
    const left = [];
    const right = [];
    list.forEach((item, idx) => {
      if (idx % 2 === 0) {
        left.push(item);
      } else {
        right.push(item);
      }
    });
    return { left, right };
  },

  _getPreviewTitle(content = "") {
    const text = `${content || ""}`.trim();
    if (!text) return "分享此刻";
    return text.length > 36 ? `${text.slice(0, 36)}...` : text;
  },

  _getCoverFallbackText(content = "") {
    const text = `${content || ""}`.replace(/\s+/g, " ").trim();
    if (!text) return "银龄时光";

    const truncated = text.length > 7 ? `${text.slice(0, 7)}...` : text;
    const line1 = truncated.slice(0, 4);
    const line2 = truncated.slice(4);
    return line2 ? `${line1}\n${line2}` : line1;
  },

  _normalizePosts(posts = []) {
    return posts.map((post) => ({
      ...post,
      coverImage: Array.isArray(post.images) && post.images.length > 0 ? post.images[0] : "",
      previewTitle: this._getPreviewTitle(post.content),
      coverFallbackText: this._getCoverFallbackText(post.content),
      authorInitial: post.authorName ? post.authorName.slice(0, 1) : "长",
    }));
  },

  _syncPostsMasonry(posts = []) {
    const layout = this._splitMasonry(posts);
    this.setData({
      posts,
      postsLeft: layout.left,
      postsRight: layout.right,
    });
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

    // 缓存未过期且已有内容时跳过网络请求
    const hasPosts = this.data.role === "elder" ? this.data.posts.length > 0 : this.data.questions.length > 0;
    if (hasPosts && this._cacheTime && Date.now() - this._cacheTime < PROFILE_CACHE_TTL) return;

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
        const posts = this._normalizePosts(res.result.posts || []);
        this._syncPostsMasonry(posts);
        this.setData({ postCount: posts.length });
        this._cacheTime = Date.now();
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
        this._cacheTime = Date.now();
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

        this._syncPostsMasonry(posts);
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
        this._cacheTime = 0; // 内容已变，应刘刷新
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

  previewPostImage(e) {
    const src = e.currentTarget.dataset.src;
    const allImages = [];
    this.data.posts.forEach((post) => {
      if (Array.isArray(post.images) && post.images.length > 0) {
        allImages.push(...post.images);
      }
    });

    wx.previewImage({
      current: src,
      urls: allImages,
    });
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
