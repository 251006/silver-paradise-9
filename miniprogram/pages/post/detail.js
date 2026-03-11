Page({
  data: {
    postId: "",
    post: null,
    comments: [],
    loading: true,
    submitting: false,
    commentContent: "",
    canSubmitComment: false,
    currentUserOpenid: "",
  },

  onLoad(options) {
    this.setData({ postId: options.id || "" });
  },

  onShow() {
    this.loadDetail();
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

    return `${date.getMonth() + 1}月${date.getDate()}日`;
  },

  normalizePost(post) {
    if (!post) return null;
    return {
      ...post,
      displayTime: this.formatTime(post.createdAt),
      likes: Number(post.likes || 0),
      commentCount: Number(post.commentCount || 0),
      liked: !!post.liked,
      isAuthorSelf: !!post.isAuthorSelf,
      isFollowingAuthor: !!post.isFollowingAuthor,
    };
  },

  normalizeComments(list = []) {
    return list.map((item) => ({
      ...item,
      displayTime: this.formatTime(item.createdAt),
    }));
  },

  async loadDetail() {
    if (!this.data.postId) {
      wx.showToast({ title: "缺少动态ID", icon: "none" });
      return;
    }

    this.setData({ loading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: "postFunctions",
        data: {
          type: "getPost",
          postId: this.data.postId,
        },
      });

      if (res.result && res.result.code === 0) {
        this.setData({
          post: this.normalizePost(res.result.post),
          comments: this.normalizeComments(res.result.comments || []),
          currentUserOpenid: res.result.currentUserOpenid || "",
        });
      } else {
        wx.showToast({ title: (res.result && res.result.msg) || "加载失败", icon: "none" });
      }
    } catch (err) {
      wx.showToast({ title: `加载失败：${err.message || "网络错误"}`, icon: "none" });
    } finally {
      this.setData({ loading: false });
      wx.stopPullDownRefresh();
    }
  },

  onPullDownRefresh() {
    this.loadDetail();
  },

  previewImage(e) {
    const src = e.currentTarget.dataset.src;
    const allImages = [];

    if (this.data.post && Array.isArray(this.data.post.images)) {
      allImages.push(...this.data.post.images);
    }

    this.data.comments.forEach((item) => {
      if (Array.isArray(item.images) && item.images.length > 0) {
        allImages.push(...item.images);
      }
    });

    wx.previewImage({
      current: src,
      urls: allImages,
    });
  },

  async onLikePost() {
    if (!this.data.postId) return;

    try {
      const res = await wx.cloud.callFunction({
        name: "postFunctions",
        data: {
          type: "likePost",
          postId: this.data.postId,
        },
      });

      if (res.result && res.result.code === 0) {
        this.setData({
          "post.likes": Number(res.result.likes || 0),
          "post.liked": !!res.result.liked,
        });
      }
    } catch (err) {
      wx.showToast({ title: "操作失败，请重试", icon: "none" });
    }
  },

  onAuthorTap() {
    const post = this.data.post;
    if (!post || !post.authorId) return;

    if (post.isAuthorSelf) {
      wx.switchTab({ url: "/pages/profile/index" });
      return;
    }

    wx.navigateTo({ url: `/pages/userProfile/index?userId=${post.authorId}` });
  },

  async onToggleFollowAuthor() {
    const post = this.data.post;
    if (!post || !post.authorId || post.isAuthorSelf) return;

    try {
      const res = await wx.cloud.callFunction({
        name: "userFunctions",
        data: {
          type: "toggleFollowUser",
          userId: post.authorId,
        },
      });

      if (res.result && res.result.code === 0) {
        this.setData({
          "post.isFollowingAuthor": !!res.result.followed,
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

  onCommentInput(e) {
    const commentContent = e.detail.value || "";
    this.setData({
      commentContent,
      canSubmitComment: !!commentContent.trim(),
    });
  },

  async submitComment() {
    if (this.data.submitting || !this.data.canSubmitComment) return;

    this.setData({ submitting: true });
    try {
      const res = await wx.cloud.callFunction({
        name: "postFunctions",
        data: {
          type: "insertComment",
          postId: this.data.postId,
          content: this.data.commentContent.trim(),
        },
      });

      if (res.result && res.result.code === 0) {
        wx.showToast({ title: res.result.msg || "评论成功", icon: "success" });
        this.setData({
          commentContent: "",
          canSubmitComment: false,
        });
        this.loadDetail();
      } else {
        wx.showToast({ title: (res.result && res.result.msg) || "评论失败", icon: "none" });
      }
    } catch (err) {
      wx.showToast({ title: `评论失败：${err.message || "网络错误"}`, icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
