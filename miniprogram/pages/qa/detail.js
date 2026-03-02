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

        this.setData({
          question,
          answers,
          role: currentRole,
          answerCountText: `${answers.length}`,
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
});
