// pages/qa/ask.js - 提问页（年轻用户）
Page({
  data: {
    title: "",
    content: "",
    submitting: false,
  },

  onTitleInput(e) {
    this.setData({ title: e.detail.value });
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value });
  },

  async submitQuestion() {
    const { title, content, submitting } = this.data;
    if (submitting) return;

    if (!title.trim()) {
      wx.showToast({ title: "请输入问题标题", icon: "none" });
      return;
    }

    this.setData({ submitting: true });

    try {
      // 内容审核
      const checkContent = title.trim() + " " + (content || "").trim();
      const checkRes = await wx.cloud.callFunction({
        name: "contentCheck",
        data: { type: "checkText", content: checkContent },
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
          type: "insertQuestion",
          title: title.trim(),
          content: (content || "").trim(),
        },
      });

      if (res.result.code === 0) {
        wx.showToast({ title: "提问成功！", icon: "success", duration: 1500 });
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        wx.showToast({ title: res.result.msg || "提问失败", icon: "none" });
      }
    } catch (err) {
      wx.showToast({ title: "提问失败，请重试", icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
