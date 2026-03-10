// pages/post/publish.js - 发布动态页
Page({
  data: {
    content: "",
    canSubmit: false,
    submitting: false,
    images: [],
    maxImages: 9,
  },

  onContentInput(e) {
    const content = e.detail.value || "";
    this.setData({
      content,
      canSubmit: content.trim().length > 0 || this.data.images.length > 0,
    });
  },

  // 选择图片
  chooseImage() {
    const { images, maxImages } = this.data;
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
        this.setData({
          images: [...images, ...tempFiles],
          canSubmit: this.data.content.trim().length > 0 || [...images, ...tempFiles].length > 0,
        });
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
    const { images } = this.data;

    wx.showModal({
      title: "提示",
      content: "确定要删除这张图片吗？",
      success: (res) => {
        if (res.confirm) {
          images.splice(index, 1);
          this.setData({
            images,
            canSubmit: this.data.content.trim().length > 0 || images.length > 0,
          });
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
      const cloudPath = `posts/photos/${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

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

  async submitPost() {
    const { content, submitting, canSubmit, images } = this.data;
    if (submitting) return;

    if (!canSubmit) {
      wx.showToast({ title: "请输入动态内容或选择图片", icon: "none" });
      return;
    }

    this.setData({ submitting: true });

    try {
      // 1. 内容安全检测
      if (content.trim().length > 0) {
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
      }

      // 2. 上传图片
      wx.showLoading({ title: "上传图片中...", mask: true });
      const imageFileIds = await this.uploadImages();
      wx.hideLoading();

      // 3. 发布动态
      const res = await wx.cloud.callFunction({
        name: "postFunctions",
        data: {
          type: "insertPost",
          content: content.trim(),
          images: imageFileIds,
        },
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
      wx.hideLoading();
      wx.showToast({ title: err.message || "发布失败，请重试", icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
