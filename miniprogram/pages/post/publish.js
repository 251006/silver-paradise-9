// pages/post/publish.js - 发布动态页
Page({
  data: {
    content: "",
    canSubmit: false,
    submitting: false,
    images: [],
    maxImages: 9,
  },

  // 前端快速过滤：拦截明显高风险内容，减少无效请求
  localRiskCheck(content = "") {
    const text = `${content || ""}`.toLowerCase();
    const highRiskSignals = [
      "转账",
      "打款",
      "保证金",
      "验证码",
      "银行卡",
      "内部消息",
      "稳赚不赔",
      "免费领",
      "点击链接",
      "加微信",
      "加qq",
    ];

    const matched = highRiskSignals.filter((item) => text.includes(item));
    return {
      blocked: matched.length >= 2,
      matched,
    };
  },

  async triggerAsyncModeration(queueId) {
    if (!queueId) return;
    try {
      await wx.cloud.callFunction({
        name: "postFunctions",
        data: {
          type: "processPendingPost",
          queueId,
        },
      });
    } catch (err) {
      // 异步任务失败不打断用户流程，后续可做定时补偿
      console.error("触发异步审核失败:", err);
    }
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

    const riskCheck = this.localRiskCheck(content);
    if (riskCheck.blocked) {
      wx.showToast({
        title: "内容疑似风险较高，请修改后重试",
        icon: "none",
      });
      return;
    }

    this.setData({ submitting: true });

    try {
      // 1. 上传图片
      wx.showLoading({ title: "上传图片中...", mask: true });
      const imageFileIds = await this.uploadImages();
      wx.hideLoading();

      // 2. 先入审核队列，立即返回成功态
      const res = await wx.cloud.callFunction({
        name: "postFunctions",
        data: {
          type: "insertPost",
          content: content.trim(),
          images: imageFileIds,
        },
      });

      console.log("[publish] insertPost result:", res && res.result ? res.result : res);

      if (res.result.code === 0) {
        const queueId = res.result.queueId || "";
        const isSyncFallback = res.result.fallbackMode === "sync";

        // 不阻塞用户：后台继续异步审核
        if (queueId) {
          this.triggerAsyncModeration(queueId);
        }

        wx.showToast({
          title: isSyncFallback ? (res.result.msg || "发送成功") : "发送成功，审核中",
          icon: "success",
          duration: 1500,
        });
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        wx.showToast({
          title: (res.result && res.result.msg) || "发布失败",
          icon: "none",
        });
      }
    } catch (err) {
      console.error("发布失败", err);
      wx.hideLoading();
      const detail =
        (err && err.errMsg) ||
        (err && err.message) ||
        "发布失败，请重试";
      wx.showToast({ title: detail, icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
