Page({
  data: {
    userId: "",
    currentUserOpenid: "",
    loading: true,
    followLoading: false,
    profile: null,
    posts: [],
    postsLeft: [],
    postsRight: [],
    questions: [],
  },

  onLoad(options) {
    const userInfo = wx.getStorageSync("userInfo") || {};
    this.setData({
      userId: options.userId || "",
      currentUserOpenid: userInfo.openid || "",
    });
  },

  onShow() {
    this.loadPage();
  },

  splitMasonry(list = []) {
    const left = [];
    const right = [];
    list.forEach((item, index) => {
      if (index % 2 === 0) {
        left.push(item);
      } else {
        right.push(item);
      }
    });
    return { left, right };
  },

  getPreviewTitle(content = "") {
    const text = `${content || ""}`.trim();
    if (!text) return "分享此刻";
    return text.length > 34 ? `${text.slice(0, 34)}...` : text;
  },

  getCoverFallbackText(content = "") {
    const text = `${content || ""}`.replace(/\s+/g, " ").trim();
    if (!text) return "银龄时光";
    const lineText = text.length > 8 ? `${text.slice(0, 8)}...` : text;
    return `${lineText.slice(0, 4)}\n${lineText.slice(4)}`.trim();
  },

  normalizePosts(posts = []) {
    return posts.map((item) => ({
      ...item,
      coverImage: Array.isArray(item.images) && item.images.length > 0 ? item.images[0] : "",
      previewTitle: this.getPreviewTitle(item.content),
      coverFallbackText: this.getCoverFallbackText(item.content),
    }));
  },

  async loadPage() {
    if (!this.data.userId) {
      wx.showToast({ title: "缺少用户ID", icon: "none" });
      return;
    }

    this.setData({ loading: true });
    try {
      const profileRes = await wx.cloud.callFunction({
        name: "userFunctions",
        data: {
          type: "getUserProfile",
          userId: this.data.userId,
        },
      });

      if (!profileRes.result || profileRes.result.code !== 0) {
        wx.showToast({
          title: (profileRes.result && profileRes.result.msg) || "加载失败",
          icon: "none",
        });
        return;
      }

      const profile = profileRes.result.profile || {};
      this.setData({ profile });
      wx.setNavigationBarTitle({ title: profile.nickname || "个人主页" });

      if (profile.role === "young") {
        await this.loadUserQuestions();
      } else {
        await this.loadUserPosts();
      }
    } catch (err) {
      console.error("load user profile page error:", err);
      wx.showToast({ title: "加载失败，请重试", icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },

  async loadUserPosts() {
    const res = await wx.cloud.callFunction({
      name: "postFunctions",
      data: {
        type: "listUserPosts",
        userId: this.data.userId,
        page: 1,
        pageSize: 100,
      },
    });

    if (res.result && res.result.code === 0) {
      const posts = this.normalizePosts(res.result.posts || []);
      const layout = this.splitMasonry(posts);
      this.setData({
        posts,
        postsLeft: layout.left,
        postsRight: layout.right,
      });
      return;
    }

    throw new Error((res.result && res.result.msg) || "加载动态失败");
  },

  async loadUserQuestions() {
    const res = await wx.cloud.callFunction({
      name: "qaFunctions",
      data: {
        type: "listUserQuestions",
        userId: this.data.userId,
        page: 1,
        pageSize: 20,
      },
    });

    if (res.result && res.result.code === 0) {
      this.setData({ questions: res.result.questions || [] });
      return;
    }

    throw new Error((res.result && res.result.msg) || "加载提问失败");
  },

  async onToggleFollow() {
    const profile = this.data.profile;
    if (!profile || profile.isSelf || this.data.followLoading) return;

    this.setData({ followLoading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: "userFunctions",
        data: {
          type: "toggleFollowUser",
          userId: this.data.userId,
        },
      });

      if (res.result && res.result.code === 0) {
        this.setData({
          "profile.isFollowing": !!res.result.followed,
          "profile.followerCount": Number(res.result.followerCount || 0),
        });
      } else {
        wx.showToast({
          title: (res.result && res.result.msg) || "操作失败",
          icon: "none",
        });
      }
    } catch (err) {
      wx.showToast({ title: "操作失败，请重试", icon: "none" });
    } finally {
      this.setData({ followLoading: false });
    }
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

  previewImage(e) {
    const src = e.currentTarget.dataset.src;
    const allImages = [];
    (this.data.posts || []).forEach((item) => {
      if (Array.isArray(item.images) && item.images.length > 0) {
        allImages.push(...item.images);
      }
    });

    wx.previewImage({
      current: src,
      urls: allImages,
    });
  },
});