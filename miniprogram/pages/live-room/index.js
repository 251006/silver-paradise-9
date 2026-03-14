const { loadLiveRooms } = require('../../services/data-service');
const { getSession, setSession } = require('../../utils/session');
const { showToast } = require('../../utils/helpers');

Page({
  data: {
    room: null,
    session: {},
    currentLikes: 0,
    danmuList: [],
    danmuInput: ''
  },
  onLoad(options) {
    const roomId = Number(options.id);
    const room = loadLiveRooms().find((item) => item.id === roomId);
    const session = getSession();
    const currentLikes = (session.liveLikes || {})[roomId] || room.likes;
    this.setData({
      room,
      session,
      currentLikes,
      danmuList: session.danmuList || [],
      danmuInput: ''
    });
  },
  onDanmuInput(event) {
    this.setData({ danmuInput: event.detail.value });
  },
  likeLive() {
    const session = getSession();
    const liveLikes = { ...(session.liveLikes || {}), [this.data.room.id]: this.data.currentLikes + 1 };
    setSession({ liveLikes });
    this.setData({ currentLikes: this.data.currentLikes + 1 });
    showToast('点赞成功', 'success');
  },
  sendGift() {
    this.appendDanmu(`🎁 ${this.data.session.username || '访客'} 送出了爱心礼物！`);
    showToast('爱心礼物已送达', 'success');
  },
  shareLive() {
    showToast('请点击右上角分享直播');
  },
  sendDanmu() {
    const content = (this.data.danmuInput || '').trim();
    if (!content) {
      showToast('请输入弹幕内容');
      return;
    }
    this.appendDanmu(`💬 ${this.data.session.username || '访客'}：${content}`);
    this.setData({ danmuInput: '' });
    showToast('发送成功', 'success');
  },
  appendDanmu(text) {
    const danmuList = (this.data.danmuList || []).concat(text).slice(-30);
    setSession({ danmuList });
    this.setData({ danmuList });
  },
  onShareAppMessage() {
    if (!this.data.room) {
      return { title: '银龄乐园直播间', path: '/pages/live/index' };
    }
    return {
      title: this.data.room.title,
      path: `/pages/live-room/index?id=${this.data.room.id}`
    };
  }
});
