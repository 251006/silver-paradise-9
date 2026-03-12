// pages/search/index.js
Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
    capsuleRight: 100,
    keyword: "",
    activeFilter: "all", // all | posts | questions
    hasSearched: false,
    loading: false,
    postResults: [],
    questionResults: [],
    displayLeft: [],
    displayRight: [],
  },

  onLoad(options) {
    const sysInfo = wx.getSystemInfoSync();
    const statusBarHeight = sysInfo.statusBarHeight || 20;
    const menuBtn = wx.getMenuButtonBoundingClientRect();
    // navBarHeight = gap above capsule (mirrored below) + capsule height
    const navBarHeight = (menuBtn.top - statusBarHeight) * 2 + menuBtn.height;
    // capsuleRight: total width minus the left edge of capsule, plus a small gap
    const sysWidth = sysInfo.windowWidth || 375;
    const capsuleRight = sysWidth - menuBtn.left + 8;
    this.setData({ statusBarHeight, navBarHeight, capsuleRight });
    if (options.keyword) {
      this.setData({ keyword: decodeURIComponent(options.keyword) });
      this.doSearch();
    }
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  onClear() {
    this.setData({
      keyword: "",
      hasSearched: false,
      loading: false,
      postResults: [],
      questionResults: [],
      displayLeft: [],
      displayRight: [],
    });
  },

  onSearch() {
    const kw = this.data.keyword.trim();
    if (!kw) {
      wx.showToast({ title: "请输入搜索内容", icon: "none" });
      return;
    }
    this.doSearch();
  },

  async doSearch() {
    const kw = this.data.keyword.trim();
    if (!kw) return;

    this.setData({ loading: true });

    try {
      const [postsRes, questionsRes] = await Promise.all([
        wx.cloud.callFunction({
          name: "postFunctions",
          data: { type: "searchPosts", keyword: kw },
        }),
        wx.cloud.callFunction({
          name: "qaFunctions",
          data: { type: "listQuestions", keyword: kw, pageSize: 30 },
        }),
      ]);

      const rawPosts = ((postsRes.result && postsRes.result.posts) || []).map((p) => ({
        ...p,
        _type: "post",
        _displayTitle: p.content
          ? p.content.length > 45
            ? `${p.content.slice(0, 45)}...`
            : p.content
          : "分享此刻",
        _coverImage: Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : "",
        _authorInitial: p.authorName ? p.authorName.slice(0, 1) : "长",
      }));

      const rawQuestions = ((questionsRes.result && questionsRes.result.questions) || []).map((q) => ({
        ...q,
        _type: "question",
        _displayTitle: q.title || q.content || "提问",
        _coverImage: Array.isArray(q.images) && q.images.length > 0 ? q.images[0] : "",
        authorAvatarUrl: q.authorAvatar || q.authorAvatarUrl || "",
        _authorInitial: q.authorName ? q.authorName.slice(0, 1) : "用",
      }));

      this.setData(
        {
          postResults: rawPosts,
          questionResults: rawQuestions,
          hasSearched: true,
          loading: false,
        },
        () => {
          this.renderResults();
        }
      );
    } catch (err) {
      console.error("搜索失败", err);
      this.setData({ loading: false, hasSearched: true });
      wx.showToast({ title: "搜索失败，请重试", icon: "none" });
    }
  },

  renderResults() {
    const { activeFilter, postResults, questionResults } = this.data;
    let combined = [];
    if (activeFilter === "all") {
      combined = [...postResults, ...questionResults];
    } else if (activeFilter === "posts") {
      combined = [...postResults];
    } else {
      combined = [...questionResults];
    }

    const left = [];
    const right = [];
    combined.forEach((item, idx) => {
      if (idx % 2 === 0) left.push(item);
      else right.push(item);
    });
    this.setData({ displayLeft: left, displayRight: right });
  },

  onFilterChange(e) {
    const type = e.currentTarget.dataset.type;
    if (type === this.data.activeFilter) return;
    this.setData({ activeFilter: type }, () => {
      this.renderResults();
    });
  },

  goBack() {
    wx.navigateBack();
  },

  goDetail(e) {
    const { id, type } = e.currentTarget.dataset;
    if (type === "post") {
      wx.navigateTo({ url: `/pages/post/detail?id=${id}` });
    } else {
      wx.navigateTo({ url: `/pages/qa/detail?id=${id}` });
    }
  },

  previewImage(e) {
    const src = e.currentTarget.dataset.src;
    const { displayLeft, displayRight } = this.data;
    const allImages = [...displayLeft, ...displayRight]
      .filter((item) => item._coverImage)
      .map((item) => item._coverImage);
    wx.previewImage({ current: src, urls: allImages.length > 0 ? allImages : [src] });
  },
});
