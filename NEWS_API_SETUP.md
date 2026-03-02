# 聚合数据新闻API配置指南

## 概述
本项目已集成聚合数据（聚合数据）的新闻API，提供真实的新闻资讯数据。

## API信息
- **API名称**：头条新闻接口
- **官方文档**：https://www.juhe.cn/docs/api/id/235
- **API地址**：http://v.juhe.cn/toutiao/index
- **调用方式**：GET请求
- **免费额度**：有试用配额

## 获取API密钥步骤

### 1. 注册账户
访问 https://www.juhe.cn，点击注册并完成账户创建。

### 2. 申请API
- 登录后进入 **控制台** > **数据中心**
- 搜索 **头条新闻**（或访问 https://www.juhe.cn/docs/api/id/235）
- 点击 **立即申请** 或 **申请试用**
- 审核通过后获得API密钥 (key)

### 3. 获取密钥
- 进入 **我的应用** 或 **API密钥管理**
- 找到 **头条新闻接口**，查看你的 **appkey**
- 复制该密钥备用

## 配置云函数环境变量

### 方式一：微信开发者工具配置（推荐）

1. 打开微信开发者工具
2. 进入**云函数**标签
3. 右键点击 `newsFunctions` 文件夹，选择**编辑**或**查看**详情
4. 在云函数详情页面，找到**环境变量**或**配置**选项
5. 添加以下环境变量：
   ```
   JUHE_API_KEY=你的_appkey值
   ```
6. 保存并重新部署云函数

### 方式二：cloud.json配置

编辑 `cloudfunctions/newsFunctions/config.json`，添加环境变量：

```json
{
  "permissions": {
    "openapi": []
  },
  "envVars": [
    {
      "key": "JUHE_API_KEY",
      "value": "你的_appkey值",
      "type": "string"
    }
  ]
}
```

然后重新部署云函数。

## API参数说明

### 请求参数

| 参数 | 必填 | 说明 | 示例 |
|------|------|------|------|
| key | 是 | API密钥 | 你申请的appkey |
| type | 否 | 新闻类型 | top/shehui/keji/yule等 |
| page | 否 | 页码，从1开始 | 1 |
| page_size | 否 | 每页条数，1-50 | 20 |

### 新闻类型映射

当前应用支持以下分类：

| 应用分类 | API type值 | 说明 |
|---------|-----------|------|
| 全部 | 空字符串 | 返回全部新闻 |
| 要闻 | top | 头条新闻 |
| 健康养生 | keji | 科技资讯 |
| 社会生活 | shehui | 社会新闻 |

> **提示**：可根据需求修改 `newsFunctions/index.js` 中的 `categoryMap` 对象来调整分类映射关系。

## 响应数据格式

API返回的每条新闻数据包含：

```javascript
{
  _id: "juhe-timestamp-index",      // 唯一标识
  title: "新闻标题",                 // 标题
  summary: "新闻摘要",               // 摘要
  category: "分类名称",              // 分类
  image: "https://...",             // 配图URL
  source: "新闻来源",                // 来源
  url: "https://...",               // 原文链接
  createdAt: "2026-03-02T..."       // 发布时间
}
```

## 测试API

### 在云函数中测试

1. 打开 `newsFunctions/index.js`
2. 在微信开发者工具中，右键点击该文件
3. 选择**测试云函数**
4. 在请求体中输入：

```json
{
  "type": "listNews",
  "category": "全部",
  "page": 1,
  "pageSize": 10
}
```

5. 点击**调用**按钮查看结果

### 在小程序中测试

1. 运行小程序
2. 点击底部导航栏的**资讯**标签
3. 查看是否加载到真实新闻数据

## 常见问题

### Q: 返回"API密钥未配置"错误
**A**: 请确保：
1. 已在聚合数据官网成功申请了API
2. API密钥已正确配置到云函数环境变量
3. 云函数已重新部署

### Q: 返回的新闻很少或为空
**A**: 这通常是因为：
1. 试用配额已用完（聚合数据有调用次数限制）
2. API类型不支持该分类
3. 网络连接问题

建议：
- 检查聚合数据官网上剩余调用次数
- 升级到付费API获得更高调用频率
- 修改 `categoryMap` 使用不同的分类

### Q: 想添加更多分类
**A**: 编辑 `newsFunctions/index.js` 中的 `categoryMap` 对象：

```javascript
const categoryMap = {
  "全部": "",
  "要闻": "top",
  "社会生活": "shehui",
  "健康养生": "keji",
  "娱乐": "yule",        // 新增
  "体育": "tiyu",        // 新增
  // 更多分类...
};
```

同时更新 `index.js` 中的 `categories` 数组：

```javascript
categories: ["全部", "要闻", "健康养生", "社会生活", "娱乐", "体育"],
```

### Q: 如何处理API调用超出配额
**A**: 
1. 升级聚合数据账户获得更高配额
2. 实现本地缓存，减少重复调用
3. 定期缓存新闻数据到微信云数据库

## 缓存策略（可选）

为了避免频繁调用API，可以在云函数中实现缓存：

```javascript
const NEWS_CACHE_KEY = 'news_cache_';
const CACHE_EXPIRE_TIME = 3600000; // 1小时

async function listNews(event) {
  const cacheKey = `${NEWS_CACHE_KEY}${event.category}_${event.page}`;
  
  // 检查缓存
  const cached = await checkCache(cacheKey);
  if (cached && !isExpired(cached)) {
    return cached.data;
  }
  
  // 调用API获取数据...
  const result = await fetchFromJuhe(API_URL, params);
  
  // 存储缓存
  await saveCache(cacheKey, result);
  return result;
}
```

## 支持文档

- 聚合数据官网：https://www.juhe.cn
- API文档：https://www.juhe.cn/docs/api/id/235
- 微信云函数文档：https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/getting-started.html

## 联系支持

如有问题，可：
1. 查阅聚合数据官方文档
2. 在微信开发者社区提问
3. 联系项目维护者
