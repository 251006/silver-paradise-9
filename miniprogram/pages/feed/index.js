// pages/feed/index.js - 长辈动态（公共Feed）
Page({
  data: {
    posts: [],
    loading: true,
    page: 1,
    hasMore: true,
  },

  onShow() {
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      // 年轻用户的第2个tab
      const userInfo = wx.getStorageSync("userInfo");
      if (userInfo && userInfo.role === "young") {
        this.getTabBar().setData({ selected: 1 });
      }
    }
    this.setData({ page: 1, posts: [], hasMore: true });
    this.loadPosts();
  },

  async loadPosts() {
    if (!this.data.hasMore) return;
    this.setData({ loading: true });

    try {
      const res = await wx.cloud.callFunction({
        name: "postFunctions",
        data: {
          type: "listAllPosts",
          page: this.data.page,
          pageSize: 20,
        },
      });

      if (res.result.code === 0) {
        const newPosts = res.result.posts;
        this.setData({
          posts: this.data.page === 1 ? newPosts : [...this.data.posts, ...newPosts],
          hasMore: newPosts.length === 20,
        });
      }
    } catch (err) {
      console.error("加载动态失败", err);
    } finally {
      this.setData({ loading: false });
    }
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.setData({ page: this.data.page + 1 });
      this.loadPosts();
    }
  },

  onPullDownRefresh() {
    this.setData({ page: 1, posts: [], hasMore: true });
    this.loadPosts().then(() => wx.stopPullDownRefresh());
  },

  async onLikePost(e) {
    const postId = e.currentTarget.dataset.id;
    try {
      const res = await wx.cloud.callFunction({
        name: "postFunctions",
        data: { type: "likePost", postId },
      });

      if (res.result.code === 0) {
        // 更新本地数据
        const posts = this.data.posts.map((p) => {
          if (p._id === postId) {
            return { ...p, likes: res.result.likes };
          }
          return p;
        });
        this.setData({ posts });
      }
    } catch (err) {
      wx.showToast({ title: "操作失败", icon: "none" });
    }
  },
});
