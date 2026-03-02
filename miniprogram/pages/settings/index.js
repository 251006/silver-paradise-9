// pages/settings/index.js - 个人信息设置页面
const app = getApp();

// 默认头像URL
const defaultAvatarUrl = 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0';

Page({
  data: {
    nickname: "",
    avatarUrl: defaultAvatarUrl,
    openid: "",
    role: "",
    tempNickname: "", // 临时存储昵称
    hasChanged: false, // 是否有修改
  },

  onLoad(options) {
    // 加载用户信息
    const userInfo = wx.getStorageSync("userInfo");
    if (userInfo) {
      this.setData({
        nickname: userInfo.nickname || "",
        tempNickname: userInfo.nickname || "",
        avatarUrl: userInfo.avatarUrl || defaultAvatarUrl,
        openid: userInfo.openid || "",
        role: userInfo.role || "elder",
      });
    }
  },

  // 选择头像
  onChooseAvatar(e) {
    const { avatarUrl } = e.detail;
    this.setData({
      avatarUrl,
      hasChanged: true,
    });
  },

  // 昵称输入
  onNicknameInput(e) {
    const value = e.detail.value.trim();
    this.setData({
      tempNickname: value,
      hasChanged: true,
    });
  },

  // 昵称输入失焦
  onNicknameBlur(e) {
    const value = e.detail.value.trim();
    if (!value) {
      wx.showToast({
        title: "昵称不能为空",
        icon: "none",
      });
      this.setData({
        tempNickname: this.data.nickname,
      });
    }
  },

  // 保存信息
  async onSave() {
    if (!this.data.hasChanged) {
      wx.showToast({
        title: "没有修改",
        icon: "none",
      });
      return;
    }

    // 验证昵称
    if (!this.data.tempNickname || this.data.tempNickname.trim() === "") {
      wx.showToast({
        title: "请输入昵称",
        icon: "none",
      });
      return;
    }

    wx.showLoading({
      title: "保存中...",
      mask: true,
    });

    try {
      // 调用云函数更新用户信息
      const res = await wx.cloud.callFunction({
        name: "userFunctions",
        data: {
          type: "updateProfile",
          nickname: this.data.tempNickname,
          avatarUrl: this.data.avatarUrl,
        },
      });

      if (res.result.code === 0) {
        // 更新本地存储
        const userInfo = wx.getStorageSync("userInfo") || {};
        userInfo.nickname = this.data.tempNickname;
        userInfo.avatarUrl = this.data.avatarUrl;
        wx.setStorageSync("userInfo", userInfo);

        // 更新全局数据
        if (app.globalData) {
          app.globalData.userInfo = userInfo;
        }

        this.setData({
          nickname: this.data.tempNickname,
          hasChanged: false,
        });

        wx.showToast({
          title: "保存成功",
          icon: "success",
        });

        // 延迟返回上一页
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        throw new Error(res.result.message || "保存失败");
      }
    } catch (err) {
      console.error("保存信息失败:", err);
      wx.showToast({
        title: err.message || "保存失败",
        icon: "none",
      });
    } finally {
      wx.hideLoading();
    }
  },

  // 退出登录
  onLogout() {
    wx.showModal({
      title: "退出登录",
      content: "退出后将返回身份选择页，是否继续？",
      confirmText: "确认退出",
      confirmColor: "#E8713A",
      cancelText: "取消",
      success: (res) => {
        if (res.confirm) {
          // 清除本地存储
          wx.removeStorageSync("userInfo");
          
          // 清除全局数据
          if (app.globalData) {
            app.globalData.userInfo = null;
          }

          // 跳转到身份选择页
          wx.reLaunch({
            url: "/pages/identity/index",
          });
        }
      },
    });
  },
});
