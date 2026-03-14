// services/data-service.js - 数据服务

// 模拟直播间数据
const LIVE_ROOMS = [
  {
    id: 1,
    title: '养生茶艺分享',
    host: '张大爷',
    category: '健康养生',
    status: '直播中',
    description: '今天教大家泡一壶好茶，聊聊养生之道',
    viewers: 128,
    likes: 56
  },
  {
    id: 2,
    title: '传统剪纸艺术',
    host: '李奶奶',
    category: '手工技艺',
    status: '直播中',
    description: '手把手教你剪窗花，传承非遗文化',
    viewers: 89,
    likes: 42
  },
  {
    id: 3,
    title: '太极拳晨练',
    host: '王师傅',
    category: '健康养生',
    status: '即将开始',
    description: '明早六点，一起练习太极拳',
    viewers: 0,
    likes: 23
  },
  {
    id: 4,
    title: '家常菜烹饪技巧',
    host: '赵阿姨',
    category: '美食烹饪',
    status: '回放',
    description: '红烧肉的秘诀，看完就会做',
    viewers: 356,
    likes: 128
  },
  {
    id: 5,
    title: '书法入门教学',
    host: '陈老先生',
    category: '文化艺术',
    status: '回放',
    description: '从握笔开始，零基础学书法',
    viewers: 234,
    likes: 89
  }
];

/**
 * 加载直播间列表
 * @returns {Array} 直播间列表
 */
function loadLiveRooms() {
  return LIVE_ROOMS;
}

module.exports = {
  loadLiveRooms
};
