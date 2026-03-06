// pages/news/index.js - 资讯科普列表
const NEWS_CACHE_PREFIX = 'news_cache_';
const NEWS_CACHE_TTL = 5 * 60 * 1000; // 5分钟

Page({
  data: {
    categories: ["推荐", "国内", "国际", "娱乐", "体育", "军事", "科技", "财经", "游戏", "汽车", "健康"],
    currentCategory: "推荐",
    newsList: [],
    loading: true,
    page: 1,
    hasMore: true,
  },

  // ========== 缓存辅助 ==========

  _getCache(category) {
    try {
      const cached = wx.getStorageSync(NEWS_CACHE_PREFIX + category);
      if (cached && Date.now() - cached.timestamp < NEWS_CACHE_TTL) {
        return cached;
      }
    } catch (e) {}
    return null;
  },

  _setCache(category, list) {
    try {
      wx.setStorageSync(NEWS_CACHE_PREFIX + category, {
        list,
        timestamp: Date.now(),
      });
    } catch (e) {}
  },

  _clearCache(category) {
    try {
      wx.removeStorageSync(NEWS_CACHE_PREFIX + category);
    } catch (e) {}
  },

  // ========== 生命周期 ==========

  onLoad() {
    // 首次加载，尝试读取缓存
    this._loadWithCache();
  },

  onShow() {
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    // 已有内存数据时不重复请求
    if (this.data.newsList.length > 0) return;
    this._loadWithCache();
  },

  // 优先读缓存，没有再请求
  _loadWithCache() {
    const cached = this._getCache(this.data.currentCategory);
    if (cached) {
      this.setData({
        newsList: cached.list,
        loading: false,
        page: 1,
        hasMore: cached.list.length >= 20,
      });
      return;
    }
    this.loadNews();
  },

  // ========== 分类切换 ==========

  switchCategory(e) {
    const category = e.currentTarget.dataset.category;
    if (category === this.data.currentCategory) return;
    this.setData({
      currentCategory: category,
      page: 1,
      newsList: [],
      hasMore: true,
    });
    // 检查新分类缓存
    const cached = this._getCache(category);
    if (cached) {
      this.setData({
        newsList: cached.list,
        loading: false,
        hasMore: cached.list.length >= 20,
      });
      return;
    }
    this.loadNews();
  },

  // ========== 数据请求 ==========

  async loadNews() {
    if (!this.data.hasMore && this.data.page > 1) return;
    this.setData({ loading: true });

    try {
      const res = await wx.cloud.callFunction({
        name: "newsFunctions",
        data: {
          type: "listNews",
          category: this.data.currentCategory,
          page: this.data.page,
          pageSize: 20,
        },
      });

      if (res.result.code === 0) {
        const newData = res.result.news;
        const isFirstPage = this.data.page === 1;
        const newList = isFirstPage ? newData : [...this.data.newsList, ...newData];

        // 首页结果写入缓存
        if (isFirstPage) {
          this._setCache(this.data.currentCategory, newData);
        }

        this.setData({
          newsList: newList,
          hasMore: newData.length === 20,
        });
      } else {
        wx.showToast({
          title: res.result.msg || "加载失败",
          icon: "none",
        });
      }
    } catch (err) {
      console.error("加载资讯失败", err);
      wx.showToast({
        title: "网络错误，请检查连接",
        icon: "none",
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.setData({ page: this.data.page + 1 });
      this.loadNews();
    }
  },

  // 下拉刷新：清除缓存，强制重新请求
  onPullDownRefresh() {
    this._clearCache(this.data.currentCategory);
    this.setData({ page: 1, newsList: [], hasMore: true }, () => {
      this.loadNews();
    });
    setTimeout(() => wx.stopPullDownRefresh(), 1500);
  },

  goDetail(e) {
    const index = e.currentTarget.dataset.index;
    const newsItem = this.data.newsList[index];

    wx.navigateTo({
      url: `/pages/news/detail?id=${newsItem._id}&uniquekey=${newsItem.uniquekey}`,
    });
  },
});
