Page({
  data: {
    questions: [],
    questionsLeft: [],
    questionsRight: [],
    role: "",
    loading: true,
    loadingMore: false,
    page: 1,
    hasMore: true,
    sortBy: "hot",
    keyword: "",
    searchInput: "",
    sortTabs: [
      { key: "hot", text: "热榜" },
      { key: "new", text: "最新" },
      { key: "unanswered", text: "待回答" },
    ],
  },

  onShow() {
    const userInfo = wx.getStorageSync("userInfo") || {};
    this.setData({ role: userInfo.role || "" });

    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }

    this.refreshQuestions();
  },

  formatTime(time) {
    const date = time && time.$date ? new Date(time.$date) : new Date(time);
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "刚刚";

    const diff = Date.now() - date.getTime();
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (diff < minute) return "刚刚";
    if (diff < hour) return `${Math.floor(diff / minute)}分钟前`;
    if (diff < day) return `${Math.floor(diff / hour)}小时前`;
    if (diff < day * 7) return `${Math.floor(diff / day)}天前`;

    const month = date.getMonth() + 1;
    const dayNum = date.getDate();
    return `${month}-${dayNum}`;
  },

  formatQuestions(questions = []) {
    return questions.map((item) => ({
      ...item,
      displayTime: this.formatTime(item.createdAt),
      excerpt: item.content || "",
      coverImage: Array.isArray(item.images) && item.images.length > 0 ? item.images[0] : "",
      previewAnswerCount: Number(item.answerCount || 0),
      previewViewCount: Number(item.viewCount || 0),
      previewFollowerCount: Number(item.followerCount || 0),
      previewThanks: Number(item.totalThanks || 0),
      hotText: `热度 ${Math.round(Number(item.heatScore || 0))}`,
    }));
  },

  splitMasonry(list = []) {
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

  syncMasonryQuestions(list = []) {
    const next = this.splitMasonry(list);
    this.setData({
      questions: list,
      questionsLeft: next.left,
      questionsRight: next.right,
    });
  },

  async loadQuestions({ reset = false } = {}) {
    if (this.data.loading || this.data.loadingMore) return;
    if (!reset && !this.data.hasMore) return;

    const nextPage = reset ? 1 : this.data.page;
    const loadingField = reset ? "loading" : "loadingMore";
    this.setData({ [loadingField]: true });

    try {
      const res = await wx.cloud.callFunction({
        name: "qaFunctions",
        data: {
          type: "listQuestions",
          page: nextPage,
          pageSize: 20,
          sortBy: this.data.sortBy,
          keyword: this.data.keyword,
        },
      });

      if (res.result && res.result.code === 0) {
        const incoming = this.formatQuestions(res.result.questions || []);
        const merged = reset ? incoming : [...this.data.questions, ...incoming];
        const layout = this.splitMasonry(merged);
        this.setData({
          questions: merged,
          questionsLeft: layout.left,
          questionsRight: layout.right,
          hasMore: !!res.result.hasMore,
          page: nextPage + 1,
        });
      } else {
        wx.showToast({
          title: (res.result && res.result.msg) || "加载失败",
          icon: "none",
        });
      }
    } catch (err) {
      wx.showToast({
        title: (err && err.message) || "加载失败，请重试",
        icon: "none",
      });
    } finally {
      this.setData({ loading: false, loadingMore: false });
      wx.stopPullDownRefresh();
    }
  },

  refreshQuestions() {
    this.setData({
      page: 1,
      hasMore: true,
      questions: [],
      questionsLeft: [],
      questionsRight: [],
      loading: false,
      loadingMore: false,
    });
    this.loadQuestions({ reset: true });
  },

  onPullDownRefresh() {
    this.refreshQuestions();
  },

  onReachBottom() {
    if (!this.data.loadingMore && this.data.hasMore) {
      this.loadQuestions();
    }
  },

  onSwitchSort(e) {
    const sortBy = e.currentTarget.dataset.sort;
    if (!sortBy || sortBy === this.data.sortBy) return;
    this.setData({ sortBy });
    this.refreshQuestions();
  },

  onSearchInput(e) {
    this.setData({ searchInput: e.detail.value || "" });
  },

  onSearchConfirm() {
    const keyword = (this.data.searchInput || "").trim();
    this.setData({ keyword });
    this.refreshQuestions();
  },

  onClearSearch() {
    this.setData({ searchInput: "", keyword: "" });
    this.refreshQuestions();
  },

  async onToggleFollow(e) {
    const questionId = e.currentTarget.dataset.id;
    if (!questionId) return;

    try {
      const res = await wx.cloud.callFunction({
        name: "qaFunctions",
        data: {
          type: "followQuestion",
          questionId,
        },
      });

      if (res.result && res.result.code === 0) {
        const nextList = this.data.questions.map((item) => {
          if (item._id !== questionId) return item;
          return {
            ...item,
            isFollowing: !!res.result.followed,
            previewFollowerCount: Number(res.result.followerCount || 0),
          };
        });
        this.setData({ questions: nextList });
      } else {
        wx.showToast({
          title: (res.result && res.result.msg) || "操作失败",
          icon: "none",
        });
      }
    } catch (err) {
      wx.showToast({ title: "操作失败，请重试", icon: "none" });
    }
  },

  goAsk() {
    wx.navigateTo({ url: "/pages/qa/ask" });
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/qa/detail?id=${id}` });
  },
});
