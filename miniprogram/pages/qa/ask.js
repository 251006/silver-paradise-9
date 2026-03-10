const DRAFT_KEY = "qa_ask_draft";

Page({
  data: {
    title: "",
    content: "",
    submitting: false,
    canSubmit: false,
    titleCount: 0,
    contentCount: 0,
    images: [],
    maxImages: 9,
  },

  onLoad() {
    const draft = wx.getStorageSync(DRAFT_KEY);
    if (draft && (draft.title || draft.content || (draft.images && draft.images.length > 0))) {
      const title = draft.title || "";
      const content = draft.content || "";
      const images = draft.images || [];
      this.setData({
        title,
        content,
        images,
        titleCount: title.length,
        contentCount: content.length,
        canSubmit: !!title.trim(),
      });
    }
  },

  saveDraft(nextTitle, nextContent, nextImages = this.data.images) {
    wx.setStorageSync(DRAFT_KEY, {
      title: nextTitle,
      content: nextContent,
      images: nextImages,
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
    const images = this.data.images;
    this.setData({ content, contentCount: content.length });
    this.saveDraft(title, content, images);
  },

  // 选择图片
  chooseImage() {
    const { images, maxImages, title, content } = this.data;
    const remaining = maxImages - images.length;

    if (remaining <= 0) {
      wx.showToast({ title: `最多只能上传${maxImages}张图片`, icon: "none" });
      return;
    }

    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFiles = res.tempFiles.map(item => item.tempFilePath);
        const newImages = [...images, ...tempFiles];
        this.setData({
          images: newImages,
        });
        this.saveDraft(title, content, newImages);
      },
      fail: () => {
        wx.showToast({ title: "选择图片失败", icon: "none" });
      }
    });
  },

  // 预览图片
  previewImage(e) {
    const { index } = e.currentTarget.dataset;
    const { images } = this.data;

    wx.previewImage({
      current: images[index],
      urls: images,
    });
  },

  // 删除图片
  deleteImage(e) {
    const { index } = e.currentTarget.dataset;
    const { images, title, content } = this.data;

    wx.showModal({
      title: "提示",
      content: "确定要删除这张图片吗？",
      success: (res) => {
        if (res.confirm) {
          images.splice(index, 1);
          this.setData({
            images,
          });
          this.saveDraft(title, content, images);
        }
      }
    });
  },

  // 上传图片到云存储
  async uploadImages() {
    const { images } = this.data;
    if (images.length === 0) return [];

    const uploadPromises = images.map(async (tempFilePath, index) => {
      const ext = tempFilePath.split('.').pop();
      const cloudPath = `questions/${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

      try {
        const res = await wx.cloud.uploadFile({
          cloudPath,
          filePath: tempFilePath,
        });
        return res.fileID;
      } catch (err) {
        console.error("上传图片失败:", err);
        throw new Error(`第${index + 1}张图片上传失败`);
      }
    });

    try {
      return await Promise.all(uploadPromises);
    } catch (err) {
      throw err;
    }
  },

  async submitQuestion() {
    const { title, content, submitting, images } = this.data;
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

      // 内容安全检测
      if (checkContent.trim().length > 0) {
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
      }

      // 上传图片
      wx.showLoading({ title: "上传图片中...", mask: true });
      const imageFileIds = await this.uploadImages();
      wx.hideLoading();

      const res = await wx.cloud.callFunction({
        name: "qaFunctions",
        data: {
          type: "insertQuestion",
          title: title.trim(),
          content: (content || "").trim(),
          images: imageFileIds,
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
      wx.hideLoading();
      wx.showToast({ title: "提问失败：" + (err.message || "网络错误"), icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
