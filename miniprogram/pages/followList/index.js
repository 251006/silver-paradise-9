Page({
  data: {
    mode: "following",
    title: "我的关注",
    list: [],
    page: 1,
    hasMore: true,
    loading: false,
    currentOpenid: "",
  },

  onLoad(options) {
    const mode = options.mode === "followers" ? "followers" : "following";
    const userInfo = wx.getStorageSync("userInfo") || {};
    const title = mode === "followers" ? "我的粉丝" : "我的关注";
    this.setData({
      mode,
      title,
      currentOpenid: userInfo.openid || "",
    });
    wx.setNavigationBarTitle({ title });
  },

  onShow() {
    this.reload();
  },

  async reload() {
    this.setData({ page: 1, hasMore: true, list: [] });
    await this.loadList();
  },

  async loadList() {
    if (this.data.loading || !this.data.hasMore) return;

    this.setData({ loading: true });
    try {
      const type = this.data.mode === "followers" ? "listFollowers" : "listFollowing";
      const res = await wx.cloud.callFunction({
        name: "userFunctions",
        data: {
          type,
          page: this.data.page,
          pageSize: 30,
        },
      });

      if (!res.result || res.result.code !== 0) {
        wx.showToast({
          title: (res.result && res.result.msg) || "加载失败",
          icon: "none",
        });
        return;
      }

      const incoming = res.result.list || [];
      this.setData({
        list: this.data.page === 1 ? incoming : [...this.data.list, ...incoming],
        hasMore: !!res.result.hasMore,
        page: this.data.page + 1,
      });
    } catch (err) {
      wx.showToast({ title: "加载失败，请重试", icon: "none" });
    } finally {
      this.setData({ loading: false });
      wx.stopPullDownRefresh();
    }
  },

  onPullDownRefresh() {
    this.reload();
  },

  onReachBottom() {
    this.loadList();
  },

  goUserProfile(e) {
    const userId = e.currentTarget.dataset.id;
    if (!userId) return;

    if (userId === this.data.currentOpenid) {
      wx.switchTab({ url: "/pages/profile/index" });
      return;
    }

    wx.navigateTo({ url: `/pages/userProfile/index?userId=${userId}` });
  },

  async onFollowBack(e) {
    const userId = e.currentTarget.dataset.id;
    if (!userId) return;

    const current = this.data.list.find((item) => item.userId === userId);
    if (current && current.isFollowing) {
      return;
    }

    try {
      const res = await wx.cloud.callFunction({
        name: "userFunctions",
        data: {
          type: "toggleFollowUser",
          userId,
        },
      });

      if (res.result && res.result.code === 0) {
        this.setData({
          list: this.data.list.map((item) => {
            if (item.userId !== userId) return item;
            return {
              ...item,
              isFollowing: !!res.result.followed,
            };
          }),
        });
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
});