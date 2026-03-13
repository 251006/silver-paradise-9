module.exports = {
  // 支持两种形式：
  // 1) HTTPS 静态目录: https://static.example.com/silver-paradise/audio
  // 2) 云存储目录前缀: cloud://<env>.<bucket>/generated-audio
  audioBaseUrl:
    "cloud://cloud1-3gg62631189fd1f5.636c-cloud1-3gg62631189fd1f5-1381058468/generated-audio",
  navigationAudioMap: {
    "/pages/index/index": "home.wav",
    "/pages/news/index": "news.wav",
    "/pages/community/index": "community.wav",
    "/pages/profile/index": "profile.wav",
  },
  actionAudioMap: {
    elderCenterAction: "publish-post.wav",
    youngCenterAction: "ask-question.wav",
  },
};