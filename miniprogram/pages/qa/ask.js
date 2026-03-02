const DRAFT_KEY = "qa_ask_draft";

Page({
  data: {
    title: "",
    content: "",
    submitting: false,
    canSubmit: false,
    titleCount: 0,
    contentCount: 0,
  },

  onLoad() {
    const draft = wx.getStorageSync(DRAFT_KEY);
    if (draft && (draft.title || draft.content)) {
      const title = draft.title || "";
      const content = draft.content || "";
      this.setData({
        title,
        content,
        titleCount: title.length,
        contentCount: content.length,
        canSubmit: !!title.trim(),
      });
    }
  },

  saveDraft(nextTitle, nextContent) {
    wx.setStorageSync(DRAFT_KEY, {
      title: nextTitle,
      content: nextContent,
      updatedAt: Date.now(),
    });
  },

  onTitleInput(e) {
    const title = e.detail.value || "";
    const content = this.data.content;
    this.setData({
      title,
      titleCount: title.length,
      canSubmit: !!title.trim(),
    });
    this.saveDraft(title, content);
  },

  onContentInput(e) {
    const content = e.detail.value || "";
    const title = this.data.title;
    this.setData({ content, contentCount: content.length });
    this.saveDraft(title, content);
  },

  async submitQuestion() {
    const { title, content, submitting } = this.data;
    if (submitting) return;

    if (!title.trim()) {
      wx.showToast({ title: "请输入问题标题", icon: "none" });
      return;
    }

    if (title.trim().length < 6) {
      wx.showToast({ title: "标题至少 6 个字", icon: "none" });
      return;
    }

    this.setData({ submitting: true });

    try {
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

      if (res.result && res.result.code === 0) {
        wx.removeStorageSync(DRAFT_KEY);
        wx.showToast({ title: "提问成功！", icon: "success", duration: 1500 });

        setTimeout(() => {
          wx.redirectTo({
            url: `/pages/qa/detail?id=${res.result.questionId}`,
          });
        }, 1500);
      } else {
        const errorMsg = (res.result && res.result.msg) || "提问失败";
        wx.showToast({ title: errorMsg, icon: "none" });
      }
    } catch (err) {
      wx.showToast({ title: "提问失败：" + (err.message || "网络错误"), icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
