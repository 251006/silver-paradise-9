// pages/community/index.js - 社区页（动态+问答双tab）
const app = getApp();

Page({
  data: {
    activeTab: 0, // 0=动态, 1=问答
    role: "",

    // 动态相关
    posts: [],
    postsPage: 1,
    postsHasMore: true,
    postsLoading: false,

    // 问答相关
    questions: [],
    questionsPage: 1,
    questionsHasMore: true,
    questionsLoading: false,
  },

  onShow() {
    const userInfo = wx.getStorageSync("userInfo");
    if (userInfo) {
      this.setData({ role: userInfo.role });
    }

    // 设置底部Tab选中状态
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }

    // 初始加载数据
    this.loadCurrentTabData();
  },

  // 加载当前Tab数据
  loadCurrentTabData() {
    if (this.data.activeTab === 0) {
      this.setData({ postsPage: 1, posts: [], postsHasMore: true });
      this.loadPosts();
    } else {
      this.setData({ questionsPage: 1, questions: [], questionsHasMore: true });
      this.loadQuestions();
    }
  },

  // Tab切换
  onTabChange(e) {
    const index = e.currentTarget.dataset.index;
    if (index === this.data.activeTab) return;

    this.setData({ activeTab: index });
    this.loadCurrentTabData();
  },

  // ========== 动态相关 ==========

  async loadPosts() {
    if (!this.data.postsHasMore || this.data.postsLoading) return;
    this.setData({ postsLoading: true });

    try {
      const res = await wx.cloud.callFunction({
        name: "postFunctions",
        data: {
          type: "listAllPosts",
          page: this.data.postsPage,
          pageSize: 20,
        },
      });

      if (res.result.code === 0) {
        const newPosts = res.result.posts;
        this.setData({
          posts:
            this.data.postsPage === 1
              ? newPosts
              : [...this.data.posts, ...newPosts],
          postsHasMore: newPosts.length === 20,
        });
      }
    } catch (err) {
      console.error("加载动态失败", err);
      wx.showToast({ title: "加载失败", icon: "none" });
    } finally {
      this.setData({ postsLoading: false });
    }
  },

  async onLikePost(e) {
    const { id, index } = e.currentTarget.dataset;

    try {
      const res = await wx.cloud.callFunction({
        name: "postFunctions",
        data: { type: "likePost", postId: id },
      });

      if (res.result.code === 0) {
        const posts = [...this.data.posts];
        posts[index].likes = res.result.likes;
        posts[index].liked = res.result.liked;
        this.setData({ posts });
      }
    } catch (err) {
      console.error("点赞失败", err);
    }
  },

  // ========== 问答相关 ==========

  async loadQuestions() {
    if (!this.data.questionsHasMore || this.data.questionsLoading) return;
    this.setData({ questionsLoading: true });

    try {
      const res = await wx.cloud.callFunction({
        name: "qaFunctions",
        data: {
          type: "listQuestions",
          page: this.data.questionsPage,
          pageSize: 20,
        },
      });

      if (res.result.code === 0) {
        const newQuestions = res.result.questions;
        this.setData({
          questions:
            this.data.questionsPage === 1
              ? newQuestions
              : [...this.data.questions, ...newQuestions],
          questionsHasMore: newQuestions.length === 20,
        });
      }
    } catch (err) {
      console.error("加载问题失败", err);
      wx.showToast({ title: "加载失败", icon: "none" });
    } finally {
      this.setData({ questionsLoading: false });
    }
  },

  goAsk() {
    wx.navigateTo({ url: "/pages/qa/ask" });
  },

  goQuestionDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/qa/detail?id=${id}` });
  },

  goPublishPost() {
    wx.navigateTo({ url: "/pages/post/publish" });
  },

  // ========== 触底加载更多 ==========

  onReachBottom() {
    if (this.data.activeTab === 0) {
      // 动态tab
      if (this.data.postsHasMore && !this.data.postsLoading) {
        this.setData({ postsPage: this.data.postsPage + 1 });
        this.loadPosts();
      }
    } else {
      // 问答tab
      if (this.data.questionsHasMore && !this.data.questionsLoading) {
        this.setData({ questionsPage: this.data.questionsPage + 1 });
        this.loadQuestions();
      }
    }
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.loadCurrentTabData();
    setTimeout(() => {
      wx.stopPullDownRefresh();
    }, 1000);
  },

  // 格式化时间
  formatTime(date) {
    if (!date) return "";
    const now = new Date();
    const postDate = new Date(date);
    const diff = now - postDate;
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (diff < minute) return "刚刚";
    if (diff < hour) return Math.floor(diff / minute) + "分钟前";
    if (diff < day) return Math.floor(diff / hour) + "小时前";
    if (diff < 7 * day) return Math.floor(diff / day) + "天前";

    return `${postDate.getMonth() + 1}月${postDate.getDate()}日`;
  },
});
