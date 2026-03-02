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
    console.log("loadCurrentTabData 当前 activeTab:", this.data.activeTab);
    
    if (this.data.activeTab === 0) {
      console.log("加载动态数据");
      this.setData(
        { postsPage: 1, posts: [], postsHasMore: true },
        () => {
          this.loadPosts();
        }
      );
    } else {
      console.log("加载问答数据");
      this.setData(
        { questionsPage: 1, questions: [], questionsHasMore: true },
        () => {
          this.loadQuestions();
        }
      );
    }
  },

  // Tab切换
  onTabChange(e) {
    const index = parseInt(e.currentTarget.dataset.index, 10); // 转换为数字
    console.log("Tab切换:", { 从: this.data.activeTab, 到: index, index类型: typeof index });
    
    if (index === this.data.activeTab) return;

    // 使用 setData 的回调确保 activeTab 更新完成后再加载数据
    this.setData({ activeTab: index }, () => {
      console.log("activeTab 已更新为:", this.data.activeTab);
      this.loadCurrentTabData();
    });
  },

  // ========== 动态相关 ==========

  async loadPosts() {
    if (!this.data.postsHasMore || this.data.postsLoading) return;

    try {
      this.setData({ postsLoading: true });

      const res = await wx.cloud.callFunction({
        name: "postFunctions",
        data: {
          type: "listAllPosts",
          page: this.data.postsPage,
          pageSize: 20,
        },
      });

      if (res.result && res.result.code === 0) {
        const newPosts = res.result.posts || [];
        
        // 合并数据，一次性设置所有字段
        const updateData = {
          postsLoading: false,
          postsHasMore: newPosts.length === 20,
        };
        
        if (this.data.postsPage === 1) {
          updateData.posts = newPosts;
        } else {
          updateData.posts = [...this.data.posts, ...newPosts];
        }
        
        this.setData(updateData);
      } else {
        this.setData({ postsLoading: false });
        wx.showToast({ title: "加载失败", icon: "none" });
      }
    } catch (err) {
      console.error("加载动态失败", err);
      this.setData({ postsLoading: false });
      wx.showToast({ title: "加载失败", icon: "none" });
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
    if (!this.data.questionsHasMore || this.data.questionsLoading) {
      console.log("loadQuestions 被阻止:", { 
        questionsHasMore: this.data.questionsHasMore,
        questionsLoading: this.data.questionsLoading 
      });
      return;
    }

    try {
      this.setData({ questionsLoading: true });
      console.log("开始加载问题...", { page: this.data.questionsPage, pageSize: 20 });
      
      const res = await wx.cloud.callFunction({
        name: "qaFunctions",
        data: {
          type: "listQuestions",
          page: this.data.questionsPage,
          pageSize: 20,
        },
      });

      console.log("问题加载结果:", res);

      if (res.result && res.result.code === 0) {
        const newQuestions = res.result.questions || [];
        console.log("获得问题列表，数量:", newQuestions.length);
        console.log("newQuestions 类型:", typeof newQuestions, "是否数组:", Array.isArray(newQuestions));
        
        // 合并数据，一次性设置所有字段，避免竞态条件
        const updateData = {
          questionsLoading: false,
          questionsHasMore: newQuestions.length === 20,
        };
        
        if (this.data.questionsPage === 1) {
          updateData.questions = newQuestions;
        } else {
          updateData.questions = [...this.data.questions, ...newQuestions];
        }
        
        console.log("准备 setData:", { 
          questionsCount: updateData.questions.length,
          questionsHasMore: updateData.questionsHasMore,
          questionsLoading: updateData.questionsLoading 
        });
        
        this.setData(updateData, () => {
          console.log("setData 完成");
        });
      } else {
        console.error("云函数返回错误:", res.result);
        this.setData({ questionsLoading: false });
        wx.showToast({ title: res.result?.msg || "加载失败", icon: "none" });
      }
    } catch (err) {
      console.error("加载问题异常:", err);
      this.setData({ questionsLoading: false });
      wx.showToast({ title: "加载失败: " + (err.message || "未知错误"), icon: "none" });
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

  // 格式化时间 - 处理 {$date: "..."} 和 ISO 字符串格式
  formatTime(time) {
    if (!time) return "";
    
    let date;
    // 处理微信云数据库的 {$date: "..."} 格式
    if (time && typeof time === 'object' && time.$date) {
      date = new Date(time.$date);
    } 
    // 处理 ISO 字符串
    else if (typeof time === 'string') {
      date = new Date(time);
    }
    // 处理 Date 对象
    else if (time instanceof Date) {
      date = time;
    }
    // 处理其他数字时间戳
    else if (typeof time === 'number') {
      date = new Date(time);
    } else {
      return "";
    }
    
    // 验证日期有效性
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      console.warn("Invalid date:", time);
      return "";
    }

    const now = new Date();
    const diff = now - date;
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (diff < minute) return "刚刚";
    if (diff < hour) return Math.floor(diff / minute) + "分钟前";
    if (diff < day) return Math.floor(diff / hour) + "小时前";
    if (diff < 7 * day) return Math.floor(diff / day) + "天前";

    return `${date.getMonth() + 1}月${date.getDate()}日`;
  },
});
