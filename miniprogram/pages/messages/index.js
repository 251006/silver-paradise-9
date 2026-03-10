Page({
  data: {
    messages: [],
    page: 1,
    pageSize: 20,
    hasMore: true,
    loading: false,
  },

  formatMessageType(type) {
    const map = {
      audit_reject: "审核结果通知",
      followed: "被关注通知",
      friend_request: "好友申请通知",
      system_notice: "系统通知",
    };
    return map[type] || "官方通知";
  },

  onShow() {
    this.setData({ page: 1, hasMore: true, messages: [] });
    this.loadMessages();
  },

  async loadMessages() {
    if (this.data.loading || !this.data.hasMore) return;

    this.setData({ loading: true });

    try {
      const res = await wx.cloud.callFunction({
        name: "postFunctions",
        data: {
          type: "listMyMessages",
          page: this.data.page,
          pageSize: this.data.pageSize,
        },
      });

      if (res.result && res.result.code === 0) {
        const newMessages = (res.result.messages || []).filter((item) => {
          return item && (item.senderType === "official_bot" || item.senderId === "official_bot");
        });
        this.setData({
          messages: this.data.page === 1 ? newMessages : [...this.data.messages, ...newMessages],
          hasMore: newMessages.length === this.data.pageSize,
        });
      } else {
        this.setData({
          messages: this.data.page === 1 ? [] : this.data.messages,
          hasMore: false,
        });
      }
    } catch (err) {
      console.error("加载消息失败:", err);
      this.setData({
        messages: this.data.page === 1 ? [] : this.data.messages,
        hasMore: false,
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  onReachBottom() {
    if (this.data.loading || !this.data.hasMore) return;
    this.setData({ page: this.data.page + 1 });
    this.loadMessages();
  },

  onPullDownRefresh() {
    this.setData({ page: 1, hasMore: true, messages: [] });
    this.loadMessages().finally(() => wx.stopPullDownRefresh());
  },
});
