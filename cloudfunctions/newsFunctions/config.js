// 聚合数据API配置
module.exports = {
  // 聚合数据API密钥 - 用于获取新闻
  JUHE_API_KEY: "5f8ce13c47b18a6e9ef7e417a0ebfe29",
  
  // DashScope API密钥 - 用于AI智能筛选长辈相关新闻
  // 请在这里填入您的阿里云DashScope API Key
  DASHSCOPE_API_KEY: "sk-36eea6fc93c04680b5e9e44d2f271d05",
  
  API_URL: "http://v.juhe.cn/toutiao/index",
  API_DETAIL_URL: "http://v.juhe.cn/toutiao/content",
  
  // DashScope API配置
  DASHSCOPE_API_URL: "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation",
  
  // 分类映射 - 聚合数据API标准分类
  categoryMap: {
    "长辈专属": "elderly", // 特殊分类，会聚合多个分类并过滤
    "推荐": "top",
    "国内": "guonei",
    "国际": "guoji",
    "娱乐": "yule",
    "体育": "tiyu",
    "军事": "junshi",
    "科技": "keji",
    "财经": "caijing",
    "游戏": "youxi",
    "汽车": "qiche",
    "健康": "jiankang",
  },
  
  // 长辈专属关键词 - 用于筛选养老、健康、反诈等相关新闻
  // 当DASHSCOPE_API_KEY未配置时，使用关键词匹配
  elderlyKeywords: [
    // 养老政策相关
    "养老", "养老金", "社保", "医保", "退休", "敬老院", "福利院", "社区养老",
    "居家养老", "养老机构", "养老服务", "养老保障", "养老保险", "高龄",
    "老龄化", "银发", "老年", "老人", "长辈", " elderly", "senior",
    // 健康知识相关
    "健康", "养生", "保健", "慢病", "高血压", "糖尿病", "心脏病", "中医",
    "体检", "营养", "膳食", "运动", "康复", "护理", "医疗", "医院",
    "名医", "专家", "义诊", "健康科普",
    // 反诈提醒相关
    "诈骗", "反诈", "防骗", "电信诈骗", "网络诈骗", "保健品诈骗",
    "养老诈骗", "投资诈骗", "金融诈骗", "警惕", "提醒", "安全",
    "骗局", "骗子", "防范", "预警",
    // 老年活动相关
    "老年大学", "老年活动", "老年社团", "老年旅游", "老年大学",
    "老年文化", "老年体育", "老年娱乐", "老年教育", "老年生活",
    "老年权益", "老年福利", "老年服务", "老年关怀", "老年关爱",
    // 其他相关
    "适老化", "无障碍", "助老", "敬老", "孝老", "爱老", "护老",
    "家庭", "亲情", "子女", "陪伴", "关爱", "幸福晚年"
  ]
};
