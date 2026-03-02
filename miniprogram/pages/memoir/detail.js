// pages/memoir/detail.js - 回忆录详情
Page({
  data: {
    memoir: null,
    loading: true,
  },

  onLoad(options) {
    if (options.id) {
      this.loadDetail(options.id);
    }
  },

  async loadDetail(id) {
    this.setData({ loading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: "memoirFunctions",
        data: { type: "getMemoir", memoirId: id },
      });
      if (res.result.code === 0) {
        this.setData({ memoir: res.result.memoir });
      } else {
        wx.showToast({ title: "回忆录不存在", icon: "none" });
      }
    } catch (err) {
      wx.showToast({ title: "加载失败", icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },

  onShareAppMessage() {
    const m = this.data.memoir;
    return {
      title: m ? m.title : "我的回忆录",
      path: `/pages/memoir/detail?id=${m._id}`,
    };
  },
});
