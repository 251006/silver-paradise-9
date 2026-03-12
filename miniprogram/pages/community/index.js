// pages/community/index.js - 社区页（动态+问答双tab）
const POSTS_CACHE_KEY = "community_posts_cache";
const QUESTIONS_CACHE_KEY = "community_questions_cache";
const COMMUNITY_CACHE_TTL = 5 * 60 * 1000;
const POSTS_PAGE_SIZE = 4;
const QUESTIONS_PAGE_SIZE = 20;

Page({
  data: {
    activeTab: 0,
    role: "",
    currentUserOpenid: "",
    currentUserAvatar: "",
    currentUserNameShort: "银",
    posts: [],
    postsLeft: [],
    postsRight: [],
    postsPage: 1,
    postsHasMore: true,
    postsLoading: false,
    questions: [],
    questionsLeft: [],
    questionsRight: [],
    questionsPage: 1,
    questionsHasMore: true,
    questionsLoading: false,
  },

  _getCache(key) {
    try {
      const cached = wx.getStorageSync(key);
      if (cached && Date.now() - cached.timestamp < COMMUNITY_CACHE_TTL) {
        return cached;
      }
    } catch (e) {}
    return null;
  },

  _setCache(key, list) {
    try {
      wx.setStorageSync(key, { list, timestamp: Date.now() });
    } catch (e) {}
  },

  _clearCache(key) {
    try {
      wx.removeStorageSync(key);
    } catch (e) {}
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
      canDelete: post.authorId === this.data.currentUserOpenid,
      coverImage: Array.isArray(post.images) && post.images.length > 0 ? post.images[0] : "",
      previewTitle: this._getPreviewTitle(post.content),
      coverFallbackText: this._getCoverFallbackText(post.content),
      authorInitial: post.authorName ? post.authorName.slice(0, 1) : "长",
    }));
  },

  _normalizeQuestions(questions = []) {
    return questions.map((item) => ({
      ...item,
      coverImage: Array.isArray(item.images) && item.images.length > 0 ? item.images[0] : "",
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

  _syncQuestionsMasonry(questions = []) {
    const layout = this._splitMasonry(questions);
    this.setData({
      questions,
      questionsLeft: layout.left,
      questionsRight: layout.right,
    });
  },

  onShow() {
    const userInfo = wx.getStorageSync("userInfo") || {};
    this.setData({
      role: userInfo.role || "",
      currentUserOpenid: userInfo.openid || "",
      currentUserAvatar: userInfo.avatarUrl || "",
      currentUserNameShort: (userInfo.nickname || userInfo.name || "银").slice(0, 1),
    });

    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }

    // 发现页优先实时数据，避免历史缓存导致“有些动态看不到”。
    if (this.data.activeTab === 0) {
      this._clearCache(POSTS_CACHE_KEY);
      this.loadCurrentTabData(0);
      return;
    }

    if (this.data.questions.length > 0) return;
    this._loadTabWithCache(1);
  },

  _loadTabWithCache(tabIndex) {
    const cacheKey = tabIndex === 0 ? POSTS_CACHE_KEY : QUESTIONS_CACHE_KEY;
    const cached = this._getCache(cacheKey);

    if (cached) {
      if (tabIndex === 0) {
        const posts = this._normalizePosts(cached.list || []);
        const layout = this._splitMasonry(posts);
        this.setData({
          posts,
          postsLeft: layout.left,
          postsRight: layout.right,
          postsPage: 1,
          postsHasMore: posts.length >= POSTS_PAGE_SIZE,
          postsLoading: false,
        });
      } else {
        const questions = this._normalizeQuestions(cached.list || []);
        const layout = this._splitMasonry(questions);
        this.setData({
          questions,
          questionsLeft: layout.left,
          questionsRight: layout.right,
          questionsPage: 1,
          questionsHasMore: questions.length >= QUESTIONS_PAGE_SIZE,
          questionsLoading: false,
        });
      }
      return;
    }

    this.loadCurrentTabData(tabIndex);
  },

  loadCurrentTabData(tabIndex) {
    const idx = tabIndex !== undefined ? tabIndex : this.data.activeTab;
    if (idx === 0) {
      this.setData({ postsPage: 1, posts: [], postsLeft: [], postsRight: [], postsHasMore: true }, () => {
        this.loadPosts();
      });
      return;
    }

    this.setData({ questionsPage: 1, questions: [], questionsLeft: [], questionsRight: [], questionsHasMore: true }, () => {
      this.loadQuestions();
    });
  },

  onTabChange(e) {
    const index = parseInt(e.currentTarget.dataset.index, 10);
    if (index === this.data.activeTab) return;

    this.setData({ activeTab: index }, () => {
      if (index === 0 && this.data.posts.length > 0) return;
      if (index === 1 && this.data.questions.length > 0) return;
      this._loadTabWithCache(index);
    });
  },

  async loadPosts() {
    if (!this.data.postsHasMore || this.data.postsLoading) return;

    try {
      this.setData({ postsLoading: true });

      const res = await wx.cloud.callFunction({
        name: "postFunctions",
        data: {
          type: "listAllPosts",
          page: this.data.postsPage,
          pageSize: POSTS_PAGE_SIZE,
        },
      });

      if (res.result && res.result.code === 0) {
        const incoming = this._normalizePosts(res.result.posts || []);
        const isFirstPage = this.data.postsPage === 1;
        const posts = isFirstPage ? incoming : [...this.data.posts, ...incoming];
        this._syncPostsMasonry(posts);

        if (isFirstPage) {
          this._setCache(POSTS_CACHE_KEY, posts);
        }

        this.setData({
          postsHasMore: incoming.length === POSTS_PAGE_SIZE,
          postsLoading: false,
        });
      } else {
        this.setData({ postsLoading: false });
        wx.showToast({ title: "加载失败", icon: "none" });
      }
    } catch (err) {
      console.error("加载动态失败", err);
      this.setData({ postsLoading: false });
      wx.showToast({ title: "加载失败", icon: "none" });
    }
  },

  async onLikePost(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) return;

    try {
      const res = await wx.cloud.callFunction({
        name: "postFunctions",
        data: { type: "likePost", postId: id },
      });

      if (res.result && res.result.code === 0) {
        const posts = this.data.posts.map((item) => {
          if (item._id !== id) return item;
          return {
            ...item,
            likes: res.result.likes,
            liked: res.result.liked,
          };
        });
        this._syncPostsMasonry(posts);
      }
    } catch (err) {
      console.error("点赞失败", err);
    }
  },

  async loadQuestions() {
    if (!this.data.questionsHasMore || this.data.questionsLoading) return;

    try {
      this.setData({ questionsLoading: true });

      const res = await wx.cloud.callFunction({
        name: "qaFunctions",
        data: {
          type: "listQuestions",
          page: this.data.questionsPage,
          pageSize: QUESTIONS_PAGE_SIZE,
        },
      });

      if (res.result && res.result.code === 0) {
        const incoming = this._normalizeQuestions(res.result.questions || []);
        const isFirstPage = this.data.questionsPage === 1;
        const questions = isFirstPage ? incoming : [...this.data.questions, ...incoming];
        this._syncQuestionsMasonry(questions);

        if (isFirstPage) {
          this._setCache(QUESTIONS_CACHE_KEY, questions);
        }

        this.setData({
          questionsHasMore: incoming.length === QUESTIONS_PAGE_SIZE,
          questionsLoading: false,
        });
      } else {
        this.setData({ questionsLoading: false });
        wx.showToast({ title: (res.result && res.result.msg) || "加载失败", icon: "none" });
      }
    } catch (err) {
      console.error("加载问题异常:", err);
      this.setData({ questionsLoading: false });
      wx.showToast({ title: `加载失败: ${err.message || "未知错误"}`, icon: "none" });
    }
  },

  onSearchTap() {
    wx.navigateTo({ url: "/pages/search/index" });
  },

  goAsk() {
    wx.navigateTo({ url: "/pages/qa/ask" });
  },

  goQuestionDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/qa/detail?id=${id}` });
  },

  goPostDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/post/detail?id=${id}` });
  },

  goPublishPost() {
    if (this.data.role !== "elder") {
      wx.showToast({ title: "仅长辈可发布动态", icon: "none" });
      return;
    }

    wx.navigateTo({
      url: "/pages/post/publish",
      fail: (err) => {
        console.error("跳转发布页失败", err);
        wx.showToast({ title: "打开发布页失败", icon: "none" });
      },
    });
  },

  onReachBottom() {
    if (this.data.activeTab === 0) {
      if (this.data.postsHasMore && !this.data.postsLoading) {
        this.setData({ postsPage: this.data.postsPage + 1 });
        this.loadPosts();
      }
      return;
    }

    if (this.data.questionsHasMore && !this.data.questionsLoading) {
      this.setData({ questionsPage: this.data.questionsPage + 1 });
      this.loadQuestions();
    }
  },

  onPullDownRefresh() {
    this._clearCache(POSTS_CACHE_KEY);
    this._clearCache(QUESTIONS_CACHE_KEY);
    this.loadCurrentTabData();
    setTimeout(() => {
      wx.stopPullDownRefresh();
    }, 1000);
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

  previewQuestionImage(e) {
    const src = e.currentTarget.dataset.src;
    const allImages = [];
    this.data.questions.forEach((question) => {
      if (Array.isArray(question.images) && question.images.length > 0) {
        allImages.push(...question.images);
      }
    });

    wx.previewImage({
      current: src,
      urls: allImages,
    });
  },

  showPostMenu(e) {
    const { id } = e.currentTarget.dataset;
    wx.showActionSheet({
      itemList: ["删除动态"],
      itemColor: "#FF3B30",
      success: (res) => {
        if (res.tapIndex === 0) {
          this.deletePost(id);
        }
      },
    });
  },

  async deletePost(postId) {
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
        const posts = this.data.posts.filter((item) => item._id !== postId);
        this._syncPostsMasonry(posts);
        this._clearCache(POSTS_CACHE_KEY);
      } else {
        wx.showToast({ title: (result.result && result.result.msg) || "删除失败", icon: "none" });
      }
    } catch (err) {
      console.error("删除动态失败", err);
      wx.hideLoading();
      wx.showToast({ title: "删除失败，请重试", icon: "none" });
    }
  },
});
