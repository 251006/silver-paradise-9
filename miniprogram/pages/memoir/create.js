// pages/memoir/create.js - 新建回忆录（AI 生成 / 手动撰写）
Page({
  data: {
    step: 1, // 1=选素材  2=生成中  3=编辑
    // 素材列表
    posts: [],
    answers: [],
    loadingMaterial: true,
    selectedPosts: {},
    selectedAnswers: {},
    selectedCount: 0,
    // 生成结果
    title: "",
    content: "",
    materialCount: 0,
    // 手动模式
    manualMode: false,
    saving: false,
  },

  onLoad() {
    this.loadMaterial();
  },

  /* ========== 第 1 步：加载素材 ========== */
  async loadMaterial() {
    this.setData({ loadingMaterial: true });
    try {
      const [postRes, answerRes] = await Promise.all([
        wx.cloud.callFunction({
          name: "postFunctions",
          data: { type: "listMyPosts", page: 1, pageSize: 100 },
        }),
        wx.cloud.callFunction({
          name: "qaFunctions",
          data: { type: "listMyAnswers", page: 1, pageSize: 100 },
        }),
      ]);

      const posts =
        postRes.result.code === 0 ? postRes.result.posts || [] : [];
      const answers =
        answerRes.result.code === 0 ? answerRes.result.answers || [] : [];

      this.setData({ posts, answers });
    } catch (err) {
      console.error("加载素材失败", err);
    } finally {
      this.setData({ loadingMaterial: false });
    }
  },

  /* 切换选中 */
  togglePost(e) {
    const idx = e.currentTarget.dataset.idx;
    const key = `selectedPosts.${idx}`;
    const cur = !!this.data.selectedPosts[idx];
    const delta = cur ? -1 : 1;
    this.setData({
      [key]: !cur,
      selectedCount: this.data.selectedCount + delta,
    });
  },

  toggleAnswer(e) {
    const idx = e.currentTarget.dataset.idx;
    const key = `selectedAnswers.${idx}`;
    const cur = !!this.data.selectedAnswers[idx];
    const delta = cur ? -1 : 1;
    this.setData({
      [key]: !cur,
      selectedCount: this.data.selectedCount + delta,
    });
  },

  /* 全选/取消全选 */
  toggleSelectAll() {
    const allSelected =
      this.data.selectedCount ===
      this.data.posts.length + this.data.answers.length;

    if (allSelected) {
      // 取消全部
      this.setData({
        selectedPosts: {},
        selectedAnswers: {},
        selectedCount: 0,
      });
    } else {
      const sp = {};
      const sa = {};
      this.data.posts.forEach((_, i) => (sp[i] = true));
      this.data.answers.forEach((_, i) => (sa[i] = true));
      this.setData({
        selectedPosts: sp,
        selectedAnswers: sa,
        selectedCount: this.data.posts.length + this.data.answers.length,
      });
    }
  },

  /* ========== 第 2 步：AI 生成 ========== */
  async onGenerate() {
    if (this.data.selectedCount === 0) {
      wx.showToast({ title: "请至少选择一条素材", icon: "none" });
      return;
    }

    // 收集选中的素材 id
    const postIds = [];
    const answerIds = [];
    Object.keys(this.data.selectedPosts).forEach((idx) => {
      if (this.data.selectedPosts[idx]) {
        postIds.push(this.data.posts[idx]._id);
      }
    });
    Object.keys(this.data.selectedAnswers).forEach((idx) => {
      if (this.data.selectedAnswers[idx]) {
        answerIds.push(this.data.answers[idx]._id);
      }
    });

    this.setData({ step: 2, materialCount: postIds.length + answerIds.length });

    try {
      const res = await wx.cloud.callFunction({
        name: "memoirFunctions",
        data: { type: "generateMemoir", postIds, answerIds },
      });

      if (res.result.code === 0) {
        this.setData({
          step: 3,
          title: res.result.title || "我的回忆录",
          content: res.result.content || "",
        });
      } else {
        wx.showToast({ title: res.result.msg || "生成失败", icon: "none" });
        this.setData({ step: 1 });
      }
    } catch (err) {
      console.error("AI 生成失败", err);
      wx.showToast({ title: "AI 服务暂不可用，请手动撰写", icon: "none" });
      this.setData({ step: 3, manualMode: true, title: "", content: "" });
    }
  },

  /* 手动撰写模式 */
  onManualMode() {
    this.setData({
      step: 3,
      manualMode: true,
      title: "",
      content: "",
      materialCount: 0,
    });
  },

  /* ========== 第 3 步：编辑与保存 ========== */
  onTitleInput(e) {
    this.setData({ title: e.detail.value });
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value });
  },

  async onSave() {
    const { title, content, materialCount } = this.data;
    if (!content.trim()) {
      wx.showToast({ title: "内容不能为空", icon: "none" });
      return;
    }

    this.setData({ saving: true });
    try {
      const res = await wx.cloud.callFunction({
        name: "memoirFunctions",
        data: {
          type: "saveMemoir",
          title: title || "无标题回忆",
          content,
          materialCount,
        },
      });

      if (res.result.code === 0) {
        wx.showToast({ title: "保存成功", icon: "success" });
        setTimeout(() => wx.navigateBack(), 1500);
      } else {
        wx.showToast({ title: "保存失败", icon: "none" });
      }
    } catch (err) {
      wx.showToast({ title: "保存失败", icon: "none" });
    } finally {
      this.setData({ saving: false });
    }
  },

  /* 返回选材步骤 */
  backToSelect() {
    this.setData({ step: 1 });
  },
});
