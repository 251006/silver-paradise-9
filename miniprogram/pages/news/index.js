// pages/news/index.js - 资讯科普列表
Page({
  data: {
    categories: ["推荐", "国内", "国际", "娱乐", "体育", "军事", "科技", "财经", "游戏", "汽车", "健康"],
    currentCategory: "推荐",
    newsList: [],
    loading: true,
    page: 1,
    hasMore: true,
  },

  onShow() {
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    this.loadNews();
  },

  onLoad() {
    this.loadNews();
  },

  switchCategory(e) {
    const category = e.currentTarget.dataset.category;
    this.setData({
      currentCategory: category,
      page: 1,
      newsList: [],
      hasMore: true,
    });
    this.loadNews();
  },

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
        this.setData({
          newsList:
            this.data.page === 1
              ? newData
              : [...this.data.newsList, ...newData],
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

  goDetail(e) {
    const index = e.currentTarget.dataset.index;
    const newsItem = this.data.newsList[index];
    
    wx.navigateTo({ 
      url: `/pages/news/detail?id=${newsItem._id}&uniquekey=${newsItem.uniquekey}` 
    });
  },
});
