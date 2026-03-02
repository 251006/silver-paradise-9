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
