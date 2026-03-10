Page({
  data: {
    questionId: "",
    question: null,
    answers: [],
    loading: true,
    role: "",
    answerContent: "",
    submitting: false,
    canSubmitAnswer: false,
    answerSort: "hot",
    answerSortTabs: [
      { key: "hot", text: "最热" },
      { key: "latest", text: "最新" },
    ],
    answerCountText: "0",
    canDeleteQuestion: false,  // 是否可以删除问题
  },

  onLoad(options) {
    this.setData({ questionId: options.id });
    const userInfo = wx.getStorageSync("userInfo") || {};
    this.setData({ role: userInfo.role || "" });
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

    const month = date.getMonth() + 1;
    const dayNum = date.getDate();
    return `${month}-${dayNum}`;
  },

  formatQuestion(question) {
    if (!question) return null;
    return {
      ...question,
      displayTime: this.formatTime(question.createdAt),
      displayAnswerCount: Number(question.answerCount || 0),
      displayViewCount: Number(question.viewCount || 0),
      displayFollowerCount: Number(question.followerCount || 0),
      displayThanks: Number(question.totalThanks || 0),
    };
  },

  formatAnswers(answers = []) {
    return answers.map((item) => ({
      ...item,
      displayTime: this.formatTime(item.createdAt),
      liked: !!item.liked,
      likes: Number(item.likes || 0),
    }));
  },

  async loadDetail() {
    this.setData({ loading: true });

    try {
      const res = await wx.cloud.callFunction({
        name: "qaFunctions",
        data: {
          type: "getQuestion",
          questionId: this.data.questionId,
          answerSort: this.data.answerSort,
        },
      });

      if (res.result && res.result.code === 0) {
        const currentRole = res.result.currentUserRole || this.data.role;
        const question = this.formatQuestion(res.result.question);
        const answers = this.formatAnswers((res.result.question && res.result.question.answers) || []);

        // 检查是否为问题作者
        const userInfo = wx.getStorageSync("userInfo") || {};
        const canDeleteQuestion = question && question.authorId === userInfo.openid;

        this.setData({
          question,
          answers,
          role: currentRole,
          answerCountText: `${answers.length}`,
          canDeleteQuestion,
        });
      } else {
        const errorMsg = (res.result && res.result.msg) || "加载失败";
        wx.showToast({ title: errorMsg, icon: "none" });
      }
    } catch (err) {
      wx.showToast({ title: "加载失败：" + (err.message || "网络错误"), icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },

  onSwitchAnswerSort(e) {
    const answerSort = e.currentTarget.dataset.sort;
    if (!answerSort || answerSort === this.data.answerSort) return;
    this.setData({ answerSort });
    this.loadDetail();
  },

  onAnswerInput(e) {
    const answerContent = e.detail.value || "";
    this.setData({
      answerContent,
      canSubmitAnswer: !!answerContent.trim(),
    });
  },

  async onToggleFollow() {
    const questionId = this.data.questionId;
    if (!questionId) return;

    try {
      const res = await wx.cloud.callFunction({
        name: "qaFunctions",
        data: {
          type: "followQuestion",
          questionId,
        },
      });

      if (res.result && res.result.code === 0) {
        this.setData({
          "question.isFollowing": !!res.result.followed,
          "question.displayFollowerCount": Number(res.result.followerCount || 0),
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

  async submitAnswer() {
    const { answerContent, submitting, questionId } = this.data;
    if (submitting) return;

    if (!answerContent.trim()) {
      wx.showToast({ title: "请输入回答内容", icon: "none" });
      return;
    }

    this.setData({ submitting: true });

    try {
      const checkRes = await wx.cloud.callFunction({
        name: "contentCheck",
        data: { type: "checkText", content: answerContent.trim() },
      });

      if (checkRes.result.code === 0 && !checkRes.result.safe) {
        wx.showModal({
          title: "内容提示",
          content: checkRes.result.msg,
          showCancel: false,
        });
        this.setData({ submitting: false });
        return;
      }

      const res = await wx.cloud.callFunction({
        name: "qaFunctions",
        data: {
          type: "insertAnswer",
          questionId,
          content: answerContent.trim(),
        },
      });

      if (res.result && res.result.code === 0) {
        wx.showToast({ title: "回答成功！", icon: "success" });
        this.setData({ answerContent: "", canSubmitAnswer: false });
        this.loadDetail();
      } else {
        const errorMsg = (res.result && res.result.msg) || "回答失败";
        wx.showToast({ title: errorMsg, icon: "none" });
      }
    } catch (err) {
      wx.showToast({ title: "回答失败：" + (err.message || "网络错误"), icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
  },

  async onLikeAnswer(e) {
    const answerId = e.currentTarget.dataset.id;
    if (!answerId) return;

    try {
      const questionId = this.data.questionId;

      const res = await wx.cloud.callFunction({
        name: "qaFunctions",
        data: {
          type: "likeAnswer",
          questionId,
          answerId,
        },
      });

      if (res.result && res.result.code === 0) {
        const nextAnswers = this.data.answers.map((item) => {
          if (item._id !== answerId) return item;
          return {
            ...item,
            liked: !!res.result.liked,
            likes: Number(res.result.likes || 0),
          };
        });

        this.setData({ answers: nextAnswers });
      } else {
        const errorMsg = (res.result && res.result.msg) || "点赞失败";
        wx.showToast({ title: errorMsg, icon: "none" });
      }
    } catch (err) {
      wx.showToast({ title: "操作失败：" + (err.message || "网络错误"), icon: "none" });
    }
  },

  // 预览图片
  previewImage(e) {
    const src = e.currentTarget.dataset.src;
    const type = e.currentTarget.dataset.type;
    const allImages = [];

    // 收集所有图片
    if (this.data.question.images && this.data.question.images.length > 0) {
      allImages.push(...this.data.question.images);
    }

    this.data.answers.forEach(answer => {
      if (answer.images && answer.images.length > 0) {
        allImages.push(...answer.images);
      }
    });

    wx.previewImage({
      current: src,
      urls: allImages,
    });
  },

  // 删除问题
  async deleteQuestion() {
    const questionId = this.data.questionId;
    
    const res = await wx.showModal({
      title: '确认删除',
      content: '删除问题后，所有回答也将被删除，且无法恢复，确定要删除吗？',
      confirmText: '确认删除',
      confirmColor: '#FF3B30',
      cancelText: '取消'
    });

    if (!res.confirm) return;

    wx.showLoading({ title: '删除中...', mask: true });
    
    try {
      const result = await wx.cloud.callFunction({
        name: 'qaFunctions',
        data: {
          type: 'deleteQuestion',
          questionId: questionId
        }
      });

      wx.hideLoading();

      if (result.result.code === 0) {
        wx.showToast({ 
          title: '删除成功', 
          icon: 'success',
          duration: 1500
        });
        // 返回上一页
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        wx.showToast({ 
          title: result.result.msg || '删除失败', 
          icon: 'none' 
        });
      }
    } catch (err) {
      console.error('删除问题失败', err);
      wx.hideLoading();
      wx.showToast({ title: '删除失败，请重试', icon: 'none' });
    }
  },
});
