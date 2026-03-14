const { loadLiveRooms } = require('../../services/data-service');
const { getSession } = require('../../utils/session');
const { showToast } = require('../../utils/helpers');

const STATUS_LIST = ['直播中', '即将开始', '回放'];
const CATEGORY_OPTIONS = ['健康养生', '美食烹饪', '文化艺术', '手工技艺', '生活经验', '其他'];

function decorateRoom(room) {
  return {
    ...room,
    statusClass: room.status === '直播中' ? 'status-live' : room.status === '即将开始' ? 'status-soon' : 'status-replay'
  };
}

Page({
  data: {
    session: {},
    statusList: STATUS_LIST,
    selectedStatus: '直播中',
    rooms: [],
    displayRooms: [],
    categoryOptions: CATEGORY_OPTIONS,
    selectedCategoryLabel: CATEGORY_OPTIONS[0],
    liveTitle: '',
    liveDesc: '',
    liveCategoryIndex: 0
  },
  onShow() {
    const session = getSession();
    const rooms = loadLiveRooms().map(decorateRoom);
    this.setData({ session, rooms });
    this.filterRooms(this.data.selectedStatus, rooms);
  },
  filterRooms(status, rooms = this.data.rooms) {
    this.setData({
      selectedStatus: status,
      displayRooms: rooms.filter((item) => item.status === status)
    });
  },
  switchStatus(event) {
    this.filterRooms(event.currentTarget.dataset.status);
  },
  enterRoom(event) {
    const roomId = Number(event.currentTarget.dataset.id);
    wx.navigateTo({ url: `/pages/live-room/index?id=${roomId}` });
  },
  onTitleInput(event) {
    this.setData({ liveTitle: event.detail.value });
  },
  onDescInput(event) {
    this.setData({ liveDesc: event.detail.value });
  },
  onCategoryChange(event) {
    const liveCategoryIndex = Number(event.detail.value);
    this.setData({
      liveCategoryIndex,
      selectedCategoryLabel: CATEGORY_OPTIONS[liveCategoryIndex]
    });
  },
  startLive() {
    if (!(this.data.liveTitle || '').trim()) {
      showToast('请输入直播标题');
      return;
    }
    wx.showModal({
      title: '🎉 直播间创建成功',
      content: '正在启动摄像头（演示模式）。开播提示：1. 找光线充足的地方；2. 调整摄像头角度；3. 准备好分享内容；4. 开始后会有工作人员协助您。',
      showCancel: false
    });
    this.setData({
      liveTitle: '',
      liveDesc: '',
      liveCategoryIndex: 0,
      selectedCategoryLabel: CATEGORY_OPTIONS[0]
    });
  },
  onShareAppMessage() {
    return {
      title: '银龄乐园直播互动',
      path: '/pages/live/index'
    };
  }
});
