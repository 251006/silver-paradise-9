// 资讯管理云函数 - 聚合数据API集成
const cloud = require("wx-server-sdk");
const http = require("http");
const config = require("./config");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 聚合数据API配置
const JUHE_API_KEY = config.JUHE_API_KEY;
const API_URL = config.API_URL;
const API_DETAIL_URL = config.API_DETAIL_URL;

// 分类映射
const categoryMap = config.categoryMap;

// 发送HTTP GET请求获取数据
function fetchFromJuhe(url, params) {
  return new Promise((resolve, reject) => {
    // 构建查询字符串
    const query = Object.keys(params)
      .filter((key) => params[key])
      .map((key) => `${key}=${encodeURIComponent(params[key])}`)
      .join("&");

    const fullUrl = `${url}?${query}`;

    http
      .get(fullUrl, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error("响应数据格式错误"));
          }
        });
      })
      .on("error", reject);
  });
}

// 长辈专属关键词列表
const { elderlyKeywords } = config;

// 子分类标签映射
const subCategoryMap = {
  "养老政策": ["养老", "养老金", "社保", "医保", "退休", "敬老院", "福利院", "社区养老", "居家养老", "养老机构", "养老服务", "养老保障", "养老保险", "高龄", "老龄化", "银发", "老年权益", "老年福利"],
  "健康知识": ["健康", "养生", "保健", "慢病", "高血压", "糖尿病", "心脏病", "中医", "体检", "营养", "膳食", "运动", "康复", "护理", "医疗", "医院", "名医", "专家", "义诊", "健康科普"],
  "反诈提醒": ["诈骗", "反诈", "防骗", "电信诈骗", "网络诈骗", "保健品诈骗", "养老诈骗", "投资诈骗", "金融诈骗", "警惕", "提醒", "安全", "骗局", "骗子", "防范", "预警"],
  "老年活动": ["老年大学", "老年活动", "老年社团", "老年旅游", "老年文化", "老年体育", "老年娱乐", "老年教育", "老年生活", "老年服务", "老年关怀", "老年关爱"],
  "家庭亲情": ["适老化", "无障碍", "助老", "敬老", "孝老", "爱老", "护老", "家庭", "亲情", "子女", "陪伴", "关爱", "幸福晚年"]
};

// 检查新闻是否包含长辈相关关键词
function isElderlyRelated(newsItem) {
  const text = `${newsItem.title || ''} ${newsItem.summary || ''} ${newsItem.author_name || ''}`.toLowerCase();
  return elderlyKeywords.some(keyword => text.includes(keyword.toLowerCase()));
}

// 根据关键词判断子分类标签
function getSubCategoryTag(newsItem) {
  const text = `${newsItem.title || ''} ${newsItem.summary || ''}`.toLowerCase();
  
  // 按优先级检查各个分类
  for (const [category, keywords] of Object.entries(subCategoryMap)) {
    if (keywords.some(keyword => text.includes(keyword.toLowerCase()))) {
      return category;
    }
  }
  
  // 默认返回"老年资讯"
  return "老年资讯";
}

// 获取资讯列表 - 调用聚合数据API
async function listNews(event) {
  const { category = "全部", page = 1, pageSize = 20 } = event;

  try {
    // 如果API密钥未配置，提示用户
    if (!JUHE_API_KEY) {
      console.warn("API密钥未配置");
      return {
        code: -1,
        msg: "API密钥未配置，请在 config.js 中配置 JUHE_API_KEY",
      };
    }

    // 长辈专属分类特殊处理
    if (category === "长辈专属") {
      return await listElderlyNews(page, pageSize);
    }

    // 获取聚合数据API类型
    const type = categoryMap[category] || "";

    const params = {
      key: JUHE_API_KEY,
      type: type,
      page: page,
      page_size: Math.min(pageSize, 50), // API最多返回50条
    };

    const result = await fetchFromJuhe(API_URL, params);

    // 检查API响应
    if (result.error_code && result.error_code !== 0) {
      console.error("聚合数据API错误:", result.reason);
      return {
        code: -1,
        msg: result.reason || "获取资讯失败",
      };
    }

    // 转换数据格式，适配前端期望和数据库文档
    const resultData = result.result && result.result.data ? result.result.data : [];
    const newsList = resultData.map((item) => ({
      _id: `news_${item.uniquekey || Date.now()}`,
      uniquekey: item.uniquekey || "", // 新闻唯一ID，用于获取详情
      title: item.title || "未知标题",
      summary: item.summary || item.title || "无摘要",
      content: "", // 列表视图不返回完整内容，通过getNews获取
      category: category === "全部" ? "headlines" : category.toLowerCase(),
      imageUrl: item.thumbnail_pic_s || item.thumbnail_pic_s02 || item.thumbnail_pic_s03 || "",
      sourceUrl: item.url || "",
      source: item.author_name || "聚合数据",
      publishedAt: new Date(item.date || new Date()),
      fetchedAt: new Date(),
    }));

    const totalPage = result.result && result.result.totalPage ? result.result.totalPage : 0;

    return {
      code: 0,
      news: newsList,
      total: totalPage,
    };
  } catch (err) {
    console.error("listNews error:", err);
    return {
      code: -1,
      msg: err.message || "获取资讯失败，请检查网络连接",
    };
  }
}

// 获取长辈专属新闻 - 聚合多个分类并筛选
async function listElderlyNews(page, pageSize) {
  try {
    // 优先从健康、国内、推荐分类获取新闻
    const targetTypes = ["jiankang", "guonei", "top"];
    let allNews = [];
    
    // 从多个分类获取新闻
    for (const type of targetTypes) {
      const params = {
        key: JUHE_API_KEY,
        type: type,
        page: 1,
        page_size: 50, // 获取更多以便筛选
      };

      const result = await fetchFromJuhe(API_URL, params);
      
      if (result.error_code === 0 && result.result && result.result.data) {
        allNews = allNews.concat(result.result.data);
      }
    }

    // 去重（根据uniquekey）
    const uniqueNews = [];
    const seenKeys = new Set();
    for (const item of allNews) {
      if (item.uniquekey && !seenKeys.has(item.uniquekey)) {
        seenKeys.add(item.uniquekey);
        uniqueNews.push(item);
      }
    }

    // 筛选与长辈相关的新闻
    const elderlyNews = uniqueNews.filter(isElderlyRelated);

    // 转换数据格式，并添加子分类标签
    const newsList = elderlyNews.map((item) => ({
      _id: `news_${item.uniquekey || Date.now()}`,
      uniquekey: item.uniquekey || "",
      title: item.title || "未知标题",
      summary: item.summary || item.title || "无摘要",
      content: "",
      category: "长辈专属",
      subCategory: getSubCategoryTag(item), // 子分类标签：养老政策/健康知识/反诈提醒/老年活动/家庭亲情
      imageUrl: item.thumbnail_pic_s || item.thumbnail_pic_s02 || item.thumbnail_pic_s03 || "",
      sourceUrl: item.url || "",
      source: item.author_name || "聚合数据",
      publishedAt: new Date(item.date || new Date()),
      fetchedAt: new Date(),
    }));

    // 分页处理
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const paginatedNews = newsList.slice(start, end);

    return {
      code: 0,
      news: paginatedNews,
      total: Math.ceil(newsList.length / pageSize),
    };
  } catch (err) {
    console.error("listElderlyNews error:", err);
    return {
      code: -1,
      msg: err.message || "获取长辈专属资讯失败",
    };
  }
}

// 获取资讯详情
async function getNews(event) {
  const { uniquekey } = event;

  try {
    if (!uniquekey) {
      return { code: -1, msg: "缺少新闻ID" };
    }

    if (!JUHE_API_KEY) {
      return {
        code: -1,
        msg: "API密钥未配置",
      };
    }

    const params = {
      key: JUHE_API_KEY,
      uniquekey: uniquekey,
    };

    const result = await fetchFromJuhe(API_DETAIL_URL, params);

    // 检查API响应
    if (result.error_code && result.error_code !== 0) {
      console.error("获取新闻详情失败:", result.reason);
      return {
        code: -1,
        msg: result.reason || "获取详情失败",
      };
    }

    // 转换数据格式，符合数据库文档的news表结构
    const newsDetail = result.result || {};
    const detail = newsDetail.detail || {};
    
    // 处理HTML内容，清理不必要的属性和优化显示
    let content = newsDetail.content || "暂无详细内容";
    
    // 清理图片标签中的不支持属性
    content = content.replace(/referrerpolicy=['"]no-referrer['"]/g, '');
    content = content.replace(/data-weight=['"][^'"]*['"]/g, '');
    content = content.replace(/data-width=['"][^'"]*['"]/g, '');
    content = content.replace(/data-height=['"][^'"]*['"]/g, '');
    
    // 移除图片的width属性，让CSS控制
    content = content.replace(/width=['"]100%['"]/g, '');
    
    // 为图片添加style属性确保正确显示
    content = content.replace(/<img/g, '<img style="max-width:100%;height:auto;display:block;margin:15px 0;border-radius:4px"');
    
    // 为段落添加样式
    content = content.replace(/<p>/g, '<p style="margin-bottom:15px;line-height:1.8;text-align:justify;color:#333">');
    content = content.replace(/<p /g, '<p style="margin-bottom:15px;line-height:1.8;text-align:justify;color:#333" ');
    
    const summary = (detail.summary || detail.title || "无摘要").substring(0, 100);
    
    return {
      code: 0,
      news: {
        _id: `news_${uniquekey}`,
        uniquekey: newsDetail.uniquekey,
        title: detail.title || "未知标题",
        summary: summary,
        content: content,
        category: detail.category || "news",
        imageUrl: detail.thumbnail_pic_s || detail.image || "",
        sourceUrl: detail.url || "",
        source: detail.author_name || "聚合数据",
        publishedAt: new Date(detail.date || new Date()),
        fetchedAt: new Date(),
      },
    };
  } catch (err) {
    console.error("getNews error:", err);
    return { 
      code: -1, 
      msg: err.message || "获取详情失败" 
    };
  }
}

// 主入口路由
exports.main = async (event, context) => {
  switch (event.type) {
    case "listNews":
      return listNews(event);
    case "getNews":
      return getNews(event);
    default:
      return { code: -1, msg: "未知操作类型" };
  }
};
