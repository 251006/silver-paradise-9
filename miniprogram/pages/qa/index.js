// pages/qa/index.js - 社区问答列表
const app = getApp();

Page({
  data: {
    questions: [],
    loading: true,
    role: "",
    page: 1,
    hasMore: true,
  },

  onShow() {
    const userInfo = wx.getStorageSync("userInfo");
    if (userInfo) {
      this.setData({ role: userInfo.role });
    }

    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }

    this.setData({ page: 1, questions: [], hasMore: true });
    this.loadQuestions();
  },

  async loadQuestions() {
    if (!this.data.hasMore) return;
    this.setData({ loading: true });

    try {
      const res = await wx.cloud.callFunction({
        name: "qaFunctions",
        data: {
          type: "listQuestions",
          page: this.data.page,
          pageSize: 20,
        },
      });

      if (res.result.code === 0) {
        const newData = res.result.questions;
        this.setData({
          questions:
            this.data.page === 1
              ? newData
              : [...this.data.questions, ...newData],
          hasMore: newData.length === 20,
        });
      }
    } catch (err) {
      console.error("加载问题失败", err);
    } finally {
      this.setData({ loading: false });
    }
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.setData({ page: this.data.page + 1 });
      this.loadQuestions();
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
