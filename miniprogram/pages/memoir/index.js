// pages/memoir/index.js - 回忆录列表
Page({
  data: {
    memoirs: [],
    loading: true,
  },

  onShow() {
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
      }
    } catch (err) {
      console.error("加载回忆录失败", err);
    } finally {
      this.setData({ loading: false });
    }
  },

  goCreate() {
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
