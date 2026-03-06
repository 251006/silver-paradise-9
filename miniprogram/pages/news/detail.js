// pages/news/detail.js - 资讯详情页
Page({
  data: {
    newsId: "",
    uniquekey: "",
    news: null,
    loading: true,
  },

  onLoad(options) {
    this.setData({ 
      newsId: options.id,
      uniquekey: options.uniquekey 
    });
    this.loadDetail();
  },

  async loadDetail() {
    this.setData({ loading: true });
    
    try {
      const res = await wx.cloud.callFunction({
        name: "newsFunctions",
        data: { 
          type: "getNews", 
          uniquekey: this.data.uniquekey 
        },
      });

      if (res.result.code === 0) {
        this.setData({ 
          news: res.result.news,
          loading: false 
        });
      } else {
        wx.showToast({ 
          title: res.result.msg || "加载失败", 
          icon: "none" 
        });
        this.setData({ loading: false });
      }
    } catch (err) {
      console.error("加载详情失败", err);
      wx.showToast({ 
        title: "网络错误", 
        icon: "none" 
      });
      this.setData({ loading: false });
    }
  },

  // 查看原文
  viewOriginal() {
    const url = this.data.news.url;
    if (!url) {
      wx.showToast({
        title: "暂无原文链接",
        icon: "none",
      });
      return;
    }
    
    wx.showModal({
      title: "查看原文",
      content: "将打开外部链接查看完整新闻报道",
      confirmText: "打开",
      cancelText: "取消",
      success: (res) => {
        if (res.confirm) {
          // 尝试复制链接让用户在浏览器中打开
          wx.setClipboardData({
            data: url,
            success: () => {
              wx.showToast({
                title: "链接已复制，请在浏览器中打开",
                icon: "none",
                duration: 2000
              });
            }
          });
        }
      }
    });
  },
});
