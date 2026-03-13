// 资讯管理云函数 - 聚合数据API集成
const cloud = require("wx-server-sdk");
const http = require("http");
const config = require("./config");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 聚合数据API密钥池（支持多密钥轮询）
const allApiKeys = (function () {
  // 环境变量支持多key，逗号分隔
  const envKeys = (process.env.JUHE_API_KEYS || "")
    .split(",")
    .map(function (k) { return k.trim(); })
    .filter(Boolean);
  const configKeys = Array.isArray(config.JUHE_API_KEYS) ? config.JUHE_API_KEYS : [];
  const primaryKey = process.env.JUHE_API_KEY || config.JUHE_API_KEY || "";
  // 主key在最前，env多key其次，config数组最后，整体去重
  const merged = [primaryKey].concat(envKeys).concat(configKeys).filter(Boolean);
  const seen = {};
  return merged.filter(function (k) {
    if (seen[k]) return false;
    seen[k] = true;
    return true;
  });
}());

// 当前轮询下标（云函数实例内持久，重启后归零）
let currentKeyIndex = 0;

// 聚合数据额度耗尽错误码
const JUHE_QUOTA_EXHAUSTED_CODES = { 10011: true, 10012: true };

// 带密钥轮询的请求函数 - params 中不需要包含 key 字段
function fetchFromJuheWithRotation(url, params) {
  if (allApiKeys.length === 0) {
    return Promise.reject(new Error("API密钥未配置，请在 config.js 的 JUHE_API_KEY 中填入密钥"));
  }

  function tryKey(attempt) {
    if (attempt >= allApiKeys.length) {
      console.error("[密钥轮询] 所有 " + allApiKeys.length + " 个 API Key 额度均已耗尽，重置到第一个Key等待明天刷新");
      currentKeyIndex = 0;
      return Promise.resolve({
        error_code: 10012,
        reason: "所有API Key（共" + allApiKeys.length + "个）额度均已耗尽，请明天再试或在 config.js 中添加更多Key",
      });
    }
    const keyIndex = (currentKeyIndex + attempt) % allApiKeys.length;
    const key = allApiKeys[keyIndex];
    return fetchFromJuhe(url, Object.assign({}, params, { key: key })).then(function (result) {
      if (result.error_code === 0 || result.error_code === undefined || result.error_code === null) {
        currentKeyIndex = keyIndex;
        return result;
      }
      if (JUHE_QUOTA_EXHAUSTED_CODES[result.error_code]) {
        console.warn("[密钥轮询] Key #" + (keyIndex + 1) + " (尾号..." + key.slice(-4) + ") 额度耗尽 (error_code: " + result.error_code + ")，切换到下一个Key");
        return tryKey(attempt + 1);
      }
      // 其他业务错误（非额度问题），直接返回
      currentKeyIndex = keyIndex;
      return result;
    });
  }

  return tryKey(0);
}

const API_URL = config.API_URL;
const API_DETAIL_URL = config.API_DETAIL_URL;
const NEWS_CACHE_COLLECTION = "news_cache";
const SERVER_CACHE_TTL_MS = 60 * 60 * 1000; // 缓存有效期：1小时（3600秒），到期后下次请求自动回源刷新
const DEFAULT_FETCH_SIZE = 50;

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

function normalizeNewsItem(item, category, extra = {}) {
  return {
    _id: `news_${item.uniquekey || Date.now()}`,
    uniquekey: item.uniquekey || "",
    title: item.title || "未知标题",
    summary: item.summary || item.title || "无摘要",
    content: "",
    category,
    imageUrl: item.thumbnail_pic_s || item.thumbnail_pic_s02 || item.thumbnail_pic_s03 || "",
    sourceUrl: item.url || "",
    source: item.author_name || "聚合数据",
    publishedAt: new Date(item.date || new Date()),
    fetchedAt: new Date(),
    ...extra,
  };
}

function paginateNews(newsList, page, pageSize) {
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  return newsList.slice(start, end);
}

async function getCategoryCache(category) {
  try {
    const cacheId = `category_${category}`;
    const res = await db.collection(NEWS_CACHE_COLLECTION).doc(cacheId).get();
    return res.data || null;
  } catch (err) {
    // 文档不存在时直接视为无缓存
    if (err && (err.errCode === -1 || (err.message && err.message.includes("document.get:fail")))) {
      return null;
    }
    console.error("读取新闻缓存失败:", err);
    return null;
  }
}

function isCacheFresh(cacheDoc) {
  if (!cacheDoc || !cacheDoc.expiresAtMs) return false;
  return cacheDoc.expiresAtMs > Date.now();
}

async function saveCategoryCache(category, newsList, source = "api") {
  const cacheId = `category_${category}`;
  const nowMs = Date.now();
  const expiresAtMs = nowMs + SERVER_CACHE_TTL_MS;

  await db.collection(NEWS_CACHE_COLLECTION).doc(cacheId).set({
    data: {
      category,
      newsList,
      source,
      updatedAtMs: nowMs,
      expiresAtMs,
      updatedAt: db.serverDate(),
    },
  });
}

async function fetchNormalCategoryNews(category, page = 1, pageSize = 20) {
  const type = categoryMap[category] || "";
  const params = {
    type,
    page,
    page_size: Math.min(pageSize, 50),
  };

  const result = await fetchFromJuheWithRotation(API_URL, params);
  if (result.error_code && result.error_code !== 0) {
    throw new Error(result.reason || "获取资讯失败");
  }

  const resultData = result.result && result.result.data ? result.result.data : [];
  return resultData.map((item) =>
    normalizeNewsItem(item, category === "全部" ? "headlines" : category.toLowerCase())
  );
}

async function fetchElderlyNewsAll(fetchSize = 50) {
  const targetTypes = ["jiankang", "guonei", "top"];
  let allNews = [];

  for (const type of targetTypes) {
    const params = {
      type,
      page: 1,
      page_size: Math.min(fetchSize, 50),
    };

    const result = await fetchFromJuheWithRotation(API_URL, params);
    if (result.error_code === 0 && result.result && result.result.data) {
      allNews = allNews.concat(result.result.data);
    }
  }

  const uniqueNews = [];
  const seenKeys = new Set();
  for (const item of allNews) {
    if (item.uniquekey && !seenKeys.has(item.uniquekey)) {
      seenKeys.add(item.uniquekey);
      uniqueNews.push(item);
    }
  }

  const elderlyNews = uniqueNews.filter(isElderlyRelated);
  return elderlyNews.map((item) =>
    normalizeNewsItem(item, "长辈专属", { subCategory: getSubCategoryTag(item) })
  );
}

async function refreshSingleCategoryCache(category, fetchSize = DEFAULT_FETCH_SIZE) {
  let newsList = [];

  if (category === "长辈专属") {
    newsList = await fetchElderlyNewsAll(fetchSize);
  } else {
    newsList = await fetchNormalCategoryNews(category, 1, fetchSize);
  }

  await saveCategoryCache(category, newsList, "api");
  return newsList;
}

async function refreshNewsCache(event) {
  const categories = Array.isArray(event.categories) && event.categories.length
    ? event.categories
    : Object.keys(categoryMap);
  const fetchSize = Math.min(Math.max(Number(event.fetchSize) || DEFAULT_FETCH_SIZE, 10), 50);

  if (allApiKeys.length === 0) {
    return {
      code: -1,
      msg: "API密钥未配置，请在 config.js 的 JUHE_API_KEY 中填入密钥",
    };
  }

  const results = [];
  for (const category of categories) {
    try {
      const newsList = await refreshSingleCategoryCache(category, fetchSize);
      results.push({ category, count: newsList.length, success: true });
    } catch (err) {
      console.error(`刷新分类 ${category} 失败:`, err);
      results.push({ category, count: 0, success: false, msg: err.message });
    }
  }

  const successCount = results.filter((item) => item.success).length;
  return {
    code: successCount > 0 ? 0 : -1,
    msg: successCount > 0 ? "刷新完成" : "全部分类刷新失败",
    results,
    refreshedAt: new Date(),
  };
}

// 获取资讯列表 - 调用聚合数据API
async function listNews(event) {
  const { category = "全部", page = 1, pageSize = 20 } = event;

  try {
    const finalPage = Math.max(Number(page) || 1, 1);
    const finalPageSize = Math.min(Math.max(Number(pageSize) || 20, 1), 50);

    // 先读取服务器缓存
    const cacheDoc = await getCategoryCache(category);
    if (cacheDoc && Array.isArray(cacheDoc.newsList) && isCacheFresh(cacheDoc)) {
      const updatedAt = cacheDoc.updatedAtMs ? new Date(cacheDoc.updatedAtMs).toISOString() : "未知";
      const expiresAt = cacheDoc.expiresAtMs ? new Date(cacheDoc.expiresAtMs).toISOString() : "未知";
      const remainingMin = cacheDoc.expiresAtMs ? Math.round((cacheDoc.expiresAtMs - Date.now()) / 60000) : 0;
      console.log(`[新闻缓存] ✅ 命中数据库缓存 | 分类: ${category} | 条数: ${cacheDoc.newsList.length} | 缓存时间: ${updatedAt} | 过期时间: ${expiresAt} | 剩余有效期: ${remainingMin} 分钟`);
      const paginated = paginateNews(cacheDoc.newsList, finalPage, finalPageSize);
      return {
        code: 0,
        news: paginated,
        total: Math.ceil(cacheDoc.newsList.length / finalPageSize),
        fromCache: true,
        cacheUpdatedAtMs: cacheDoc.updatedAtMs,
      };
    }

    if (allApiKeys.length === 0) {
      return {
        code: -1,
        msg: "新闻缓存已过期且API密钥未配置，无法回源刷新",
      };
    }

    // 缓存失效时，回源刷新该分类后再返回分页数据
    console.log(`[新闻缓存] 🔄 缓存不存在或已过期，回源拉取 | 分类: ${category} | 有效期: ${SERVER_CACHE_TTL_MS / 60000} 分钟`);
    const refreshedList = await refreshSingleCategoryCache(category, DEFAULT_FETCH_SIZE);
    console.log(`[新闻缓存] ✅ 回源完成，写入数据库 | 分类: ${category} | 条数: ${refreshedList.length}`);
    const paginated = paginateNews(refreshedList, finalPage, finalPageSize);

    return {
      code: 0,
      news: paginated,
      total: Math.ceil(refreshedList.length / finalPageSize),
      fromCache: false,
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
    const finalPage = Math.max(Number(page) || 1, 1);
    const finalPageSize = Math.min(Math.max(Number(pageSize) || 20, 1), 50);
    const newsList = await fetchElderlyNewsAll(DEFAULT_FETCH_SIZE);

    // 分页处理
    const paginatedNews = paginateNews(newsList, finalPage, finalPageSize);

    return {
      code: 0,
      news: paginatedNews,
      total: Math.ceil(newsList.length / finalPageSize),
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

    if (allApiKeys.length === 0) {
      return {
        code: -1,
        msg: "API密钥未配置",
      };
    }

    const params = {
      uniquekey: uniquekey,
    };

    const result = await fetchFromJuheWithRotation(API_DETAIL_URL, params);

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
    case "refreshNewsCache":
      return refreshNewsCache(event);
    case "getNews":
      return getNews(event);
    default:
      return { code: -1, msg: "未知操作类型" };
  }
};
