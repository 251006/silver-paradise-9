// pages/post/publish.js - 发布动态页
Page({
  data: {
    content: "",
    submitting: false,
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value });
  },

  async submitPost() {
    const { content, submitting } = this.data;
    if (submitting) return;

    if (!content.trim()) {
      wx.showToast({ title: "请输入动态内容", icon: "none" });
      return;
    }

    this.setData({ submitting: true });

    try {
      // 1. 内容安全检测
      const checkRes = await wx.cloud.callFunction({
        name: "contentCheck",
        data: { type: "checkText", content: content.trim() },
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

      // 2. 发布动态
      const res = await wx.cloud.callFunction({
        name: "postFunctions",
        data: { type: "insertPost", content: content.trim() },
      });

      if (res.result.code === 0) {
        wx.showToast({ title: "发布成功！", icon: "success", duration: 1500 });
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        wx.showToast({
          title: res.result.msg || "发布失败",
          icon: "none",
        });
      }
    } catch (err) {
      console.error("发布失败", err);
      wx.showToast({ title: "发布失败，请重试", icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
