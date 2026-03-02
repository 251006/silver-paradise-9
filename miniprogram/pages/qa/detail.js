// pages/qa/detail.js - 问题详情页
Page({
  data: {
    questionId: "",
    question: null,
    answers: [],
    loading: true,
    role: "",
    answerContent: "",
    submitting: false,
  },

  onLoad(options) {
    this.setData({ questionId: options.id });
    const userInfo = wx.getStorageSync("userInfo");
    if (userInfo) {
      this.setData({ role: userInfo.role });
    }
  },

  onShow() {
    this.loadDetail();
  },

  async loadDetail() {
    this.setData({ loading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: "qaFunctions",
        data: { type: "getQuestion", questionId: this.data.questionId },
      });

      if (res.result.code === 0) {
        this.setData({
          question: res.result.question,
          answers: res.result.answers,
        });
      }
    } catch (err) {
      console.error("加载详情失败", err);
      wx.showToast({ title: "加载失败", icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },

  onAnswerInput(e) {
    this.setData({ answerContent: e.detail.value });
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
      // 内容审核
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

      if (res.result.code === 0) {
        wx.showToast({ title: "回答成功！", icon: "success" });
        this.setData({ answerContent: "" });
        this.loadDetail();
      } else {
        wx.showToast({ title: res.result.msg || "回答失败", icon: "none" });
      }
    } catch (err) {
      wx.showToast({ title: "回答失败", icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
  },

  async onLikeAnswer(e) {
    const answerId = e.currentTarget.dataset.id;
    try {
      const res = await wx.cloud.callFunction({
        name: "qaFunctions",
        data: { type: "likeAnswer", answerId },
      });

      if (res.result.code === 0) {
        this.loadDetail();
      }
    } catch (err) {
      wx.showToast({ title: "操作失败", icon: "none" });
    }
  },
});
