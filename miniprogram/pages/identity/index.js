// pages/identity/index.js
const defaultAvatarUrl = 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0';

Page({
  data: {
    selectedRole: "",
    nickname: "",
    avatarUrl: defaultAvatarUrl,
    submitting: false,
  },

  selectRole(e) {
    const role = e.currentTarget.dataset.role;
    this.setData({ selectedRole: role });
  },

  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value.trim() });
  },

  // 处理头像选择
  async onChooseAvatar(e) {
    try {
      const { avatarUrl } = e.detail;
      if (!avatarUrl) {
        wx.showToast({ title: '头像选择失败', icon: 'none' });
        return;
      }
      this.setData({ avatarUrl });
    } catch (err) {
      console.error('处理头像失败:', err);
      wx.showToast({ title: '处理头像失败', icon: 'none' });
    }
  },

  isFunctionMissingError(err) {
    if (!err) return false;
    const msg = `${err.errMsg || err.message || ""}`;
    return (
      err.errCode === -501000 ||
      /FUNCTION_NOT_FOUND|FunctionName parameter could not be found/i.test(msg)
    );
  },

  async getWechatLoginCode() {
    const res = await new Promise((resolve, reject) => {
      wx.login({
        success: resolve,
        fail: reject,
      });
    });

    if (!res || !res.code) {
      throw new Error("未获取到微信登录凭证");
    }

    return res.code;
  },

  async tryWechatLoginInCloud({ code, nickname, role, avatarUrl }) {
    const candidateNames = ["userFunctions", "userfunctions"];
    let lastError = null;

    for (let i = 0; i < candidateNames.length; i += 1) {
      const functionName = candidateNames[i];
      try {
        const res = await wx.cloud.callFunction({
          name: functionName,
          data: {
            type: "wechatLogin",
            code,
            nickname,
            role,
            avatarUrl,
          },
        });

        if (res && res.result && res.result.code === 0) {
          return res;
        }

        const errMsg =
          (res && res.result && res.result.msg) || `云函数 ${functionName} 返回异常`;
        lastError = new Error(errMsg);
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError || new Error("微信登录失败");
  },

  async uploadAvatarToCloud(avatarPath) {
    // 生成唯一的文件名
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const cloudPath = `user-avatars/${timestamp}-${randomStr}.jpg`;
    
    return new Promise((resolve, reject) => {
      wx.cloud.uploadFile({
        cloudPath,
        filePath: avatarPath,
        success: (res) => {
          resolve(res.fileID);
        },
        fail: (err) => {
          reject(err);
        },
      });
    });
  },

  async onEnter() {
    const { selectedRole, nickname, avatarUrl, submitting } = this.data;
    if (submitting) return;

    if (!selectedRole) {
      wx.showToast({ title: "请选择您的身份", icon: "none" });
      return;
    }
    if (!nickname) {
      wx.showToast({ title: "请输入您的昵称", icon: "none" });
      return;
    }
    if (nickname.length > 12) {
      wx.showToast({ title: "昵称最多12个字", icon: "none" });
      return;
    }
    if (avatarUrl === defaultAvatarUrl) {
      wx.showToast({ title: "请选择您的头像", icon: "none" });
      return;
    }

    this.setData({ submitting: true });

    try {
      wx.showLoading({ title: "上传头像中...", mask: true });

      // 上传头像到云存储
      let cloudAvatarUrl = avatarUrl;
      if (avatarUrl !== defaultAvatarUrl) {
        try {
          cloudAvatarUrl = await this.uploadAvatarToCloud(avatarUrl);
        } catch (err) {
          console.error('头像上传失败:', err);
          wx.showToast({ title: '头像上传失败', icon: 'none' });
          this.setData({ submitting: false });
          return;
        }
      }

      wx.showLoading({ title: "微信登录中", mask: true });

      const code = await this.getWechatLoginCode();
      const res = await this.tryWechatLoginInCloud({
        code,
        nickname,
        role: selectedRole,
        avatarUrl: cloudAvatarUrl,
      });

      const userInfo = {
        openid: res.result.openid,
        nickname: res.result.user.nickname,
        role: res.result.user.role,
        avatarUrl: res.result.user.avatarUrl || "",
      };

      // 本地缓存用户信息
      wx.setStorageSync("userInfo", userInfo);

      // 更新全局数据
      const app = getApp();
      app.globalData.userInfo = userInfo;

      wx.showToast({
        title: "登录成功",
        icon: "success",
        duration: 1500,
      });

      setTimeout(() => {
        wx.switchTab({ url: "/pages/index/index" });
      }, 1500);
    } catch (err) {
      console.error("微信登录失败", err);

      if (this.isFunctionMissingError(err)) {
        wx.showToast({ title: "请先部署 userFunctions 云函数", icon: "none" });
        return;
      }

      const msg = `${err.errMsg || err.message || "登录失败，请重试"}`;
      wx.showToast({
        title: msg.length > 18 ? "登录失败，请看控制台" : msg,
        icon: "none",
      });
    } finally {
      wx.hideLoading();
      this.setData({ submitting: false });
    }
  },
});
