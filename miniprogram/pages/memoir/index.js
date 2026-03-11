// pages/memoir/index.js - 回忆录列表
const MEMOIR_CACHE_TTL = 5 * 60 * 1000; // 5分钟内不重复请求

Page({
  data: {
    memoirs: [],
    loading: true,
  },

  onShow() {
    if (this.data.memoirs.length > 0 && this._cacheTime && Date.now() - this._cacheTime < MEMOIR_CACHE_TTL) return;
    this.loadMemoirs();
  },

  async loadMemoirs() {
    this.setData({ loading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: "memoirFunctions",
        data: { type: "listMemoirs" },
      });

      if (res.result.code === 0) {
        this.setData({ memoirs: res.result.memoirs });
        this._cacheTime = Date.now();
      }
    } catch (err) {
      console.error("加载回忆录失败", err);
    } finally {
      this.setData({ loading: false });
    }
  },

  goCreate() {
    this._cacheTime = 0; // 可能新增内容，返回时强制刷新
    wx.navigateTo({ url: "/pages/memoir/create" });
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/memoir/detail?id=${id}` });
  },

  async onDeleteMemoir(e) {
    const memoirId = e.currentTarget.dataset.id;

    wx.showModal({
      title: "确认删除",
      content: "确定要删除这篇回忆录吗？删除后不可恢复。",
      confirmColor: "#E8713A",
      success: async (modalRes) => {
        if (modalRes.confirm) {
          try {
            const res = await wx.cloud.callFunction({
              name: "memoirFunctions",
              data: { type: "deleteMemoir", memoirId },
            });
            if (res.result.code === 0) {
              wx.showToast({ title: "已删除", icon: "success" });
              this.loadMemoirs();
            } else {
              wx.showToast({ title: res.result.msg, icon: "none" });
            }
          } catch (err) {
            wx.showToast({ title: "删除失败", icon: "none" });
          }
        }
      },
    });
  },
});
