// pages/community/index.js - 社区页（动态+问答双tab）
const app = getApp();

const POSTS_CACHE_KEY = 'community_posts_cache';
const QUESTIONS_CACHE_KEY = 'community_questions_cache';
const COMMUNITY_CACHE_TTL = 5 * 60 * 1000; // 5分钟

Page({
  data: {
    activeTab: 0, // 0=动态, 1=问答
    role: "",
    currentUserOpenid: "", // 当前用户ID

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

  // ========== 缓存辅助 ==========

  _getCache(key) {
    try {
      const cached = wx.getStorageSync(key);
      if (cached && Date.now() - cached.timestamp < COMMUNITY_CACHE_TTL) {
        return cached;
      }
    } catch (e) {}
    return null;
  },

  _setCache(key, list) {
    try {
      wx.setStorageSync(key, { list, timestamp: Date.now() });
    } catch (e) {}
  },

  _clearCache(key) {
    try {
      wx.removeStorageSync(key);
    } catch (e) {}
  },

  // ========== 生命周期 ==========

  onShow() {
    const userInfo = wx.getStorageSync("userInfo");
    if (userInfo) {
      this.setData({ 
        role: userInfo.role,
        currentUserOpenid: userInfo.openid || ""
      });
    }

    // 设置底部Tab选中状态
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }

    // 已有内存数据时跳过重新请求
    if (this.data.activeTab === 0 && this.data.posts.length > 0) return;
    if (this.data.activeTab === 1 && this.data.questions.length > 0) return;

    // 优先读取缓存，没有再请求
    this._loadTabWithCache(this.data.activeTab);
  },

  // 读取指定 tab 的缓存，缓存失效时才发网络请求
  _loadTabWithCache(tabIndex) {
    const cacheKey = tabIndex === 0 ? POSTS_CACHE_KEY : QUESTIONS_CACHE_KEY;
    const cached = this._getCache(cacheKey);
    if (cached) {
      if (tabIndex === 0) {
        this.setData({
          posts: cached.list,
          postsPage: 1,
          postsHasMore: cached.list.length >= 20,
          postsLoading: false,
        });
      } else {
        this.setData({
          questions: cached.list,
          questionsPage: 1,
          questionsHasMore: cached.list.length >= 20,
          questionsLoading: false,
        });
      }
      return;
    }
    // 无有效缓存，发起请求
    this.loadCurrentTabData(tabIndex);
  },

  // 强制刷新当前Tab（不走缓存）
  loadCurrentTabData(tabIndex) {
    const idx = tabIndex !== undefined ? tabIndex : this.data.activeTab;
    if (idx === 0) {
      this.setData(
        { postsPage: 1, posts: [], postsHasMore: true },
        () => { this.loadPosts(); }
      );
    } else {
      this.setData(
        { questionsPage: 1, questions: [], questionsHasMore: true },
        () => { this.loadQuestions(); }
      );
    }
  },

  // Tab切换
  onTabChange(e) {
    const index = parseInt(e.currentTarget.dataset.index, 10);
    if (index === this.data.activeTab) return;

    this.setData({ activeTab: index }, () => {
      // 已有内存数据时直接切换，不重新请求
      if (index === 0 && this.data.posts.length > 0) return;
      if (index === 1 && this.data.questions.length > 0) return;
      this._loadTabWithCache(index);
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
        const isFirstPage = this.data.postsPage === 1;

        // 标记可删除的动态
        const processedPosts = newPosts.map(post => ({
          ...post,
          canDelete: post.authorId === this.data.currentUserOpenid
        }));

        const updateData = {
          postsLoading: false,
          postsHasMore: newPosts.length === 20,
        };

        if (isFirstPage) {
          updateData.posts = processedPosts;
          // 首页结果写入缓存
          this._setCache(POSTS_CACHE_KEY, processedPosts);
        } else {
          updateData.posts = [...this.data.posts, ...processedPosts];
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
    if (!this.data.questionsHasMore || this.data.questionsLoading) return;

    try {
      this.setData({ questionsLoading: true });

      const res = await wx.cloud.callFunction({
        name: "qaFunctions",
        data: {
          type: "listQuestions",
          page: this.data.questionsPage,
          pageSize: 20,
        },
      });

      if (res.result && res.result.code === 0) {
        const newQuestions = res.result.questions || [];
        const isFirstPage = this.data.questionsPage === 1;

        const updateData = {
          questionsLoading: false,
          questionsHasMore: newQuestions.length === 20,
        };

        if (isFirstPage) {
          updateData.questions = newQuestions;
          // 首页结果写入缓存
          this._setCache(QUESTIONS_CACHE_KEY, newQuestions);
        } else {
          updateData.questions = [...this.data.questions, ...newQuestions];
        }

        this.setData(updateData);
      } else {
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
    if (this.data.role !== "elder") {
      wx.showToast({ title: "仅长辈可发布动态", icon: "none" });
      return;
    }

    wx.navigateTo({
      url: "/pages/post/publish",
      fail: (err) => {
        console.error("跳转发布页失败", err);
        wx.showToast({ title: "打开发布页失败", icon: "none" });
      },
    });
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

  // 下拉刷新：清缓存，强制重新请求
  onPullDownRefresh() {
    this._clearCache(POSTS_CACHE_KEY);
    this._clearCache(QUESTIONS_CACHE_KEY);
    this.loadCurrentTabData();
    setTimeout(() => {
      wx.stopPullDownRefresh();
    }, 1000);
  },

  // 预览动态图片
  previewPostImage(e) {
    const src = e.currentTarget.dataset.src;
    const allImages = [];
    // 收集所有动态图片
    this.data.posts.forEach(post => {
      if (post.images && post.images.length > 0) {
        allImages.push(...post.images);
      }
    });

    wx.previewImage({
      current: src,
      urls: allImages,
    });
  },

  // 预览问题图片
  previewQuestionImage(e) {
    const src = e.currentTarget.dataset.src;
    const allImages = [];
    // 收集所有问题图片
    this.data.questions.forEach(question => {
      if (question.images && question.images.length > 0) {
        allImages.push(...question.images);
      }
    });

    wx.previewImage({
      current: src,
      urls: allImages,
    });
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

  // 显示动态菜单
  showPostMenu(e) {
    const { id, index } = e.currentTarget.dataset;
    wx.showActionSheet({
      itemList: ['删除动态'],
      itemColor: '#FF3B30',
      success: (res) => {
        if (res.tapIndex === 0) {
          this.deletePost(id, index);
        }
      }
    });
  },

  // 删除动态
  async deletePost(postId, index) {
    const res = await wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定要删除这条动态吗？',
      confirmText: '确认删除',
      confirmColor: '#FF3B30',
      cancelText: '取消'
    });

    if (!res.confirm) return;

    wx.showLoading({ title: '删除中...', mask: true });
    
    try {
      const result = await wx.cloud.callFunction({
        name: 'postFunctions',
        data: {
          type: 'deletePost',
          postId: postId
        }
      });

      wx.hideLoading();

      if (result.result.code === 0) {
        wx.showToast({ title: '删除成功', icon: 'success' });
        // 从列表中移除
        const posts = [...this.data.posts];
        posts.splice(index, 1);
        this.setData({ posts });
        // 清空缓存
        this._clearCache(POSTS_CACHE_KEY);
      } else {
        wx.showToast({ 
          title: result.result.msg || '删除失败', 
          icon: 'none' 
        });
      }
    } catch (err) {
      console.error('删除动态失败', err);
      wx.hideLoading();
      wx.showToast({ title: '删除失败，请重试', icon: 'none' });
    }
  },
});
