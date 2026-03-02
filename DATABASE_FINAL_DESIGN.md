# 银龄乐园数据库表结构设计文档（最终版）

## 📊 总体架构

**共 5 个核心集合：**
- `users` - 用户表
- `posts` - 动态表  
- `questions` - 问题表（内嵌回答数组）
- `memoirs` - 回忆录表
- `news` - 资讯表

---

## 📌 表关系图

```
users (用户，中心)
├─ _id (openid)
├─ posts.authorId → users._id (1对多)
├─ questions.authorId → users._id (1对多)
└─ memoirs.authorId → users._id (1对多)

posts (动态)
├─ 独立发布
└─ memoirs.sourceRefs 可引用 (多对多)

questions (问题 + 内嵌回答)
├─ answers[].authorId → users._id (1对多)
└─ memoirs.sourceRefs 可引用 (多对多)

memoirs (回忆录)
├─ sourceRefs[] 可引用 posts._id 或 questions._id
└─ 用户私有

news (资讯)
└─ 独立表，无关联
```

---

## 📋 表详细设计

### 1️⃣ users - 用户表

**作用：** 存储用户身份信息和认证数据

#### 字段设计

| 字段名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| `_id` | String | ✅ | 微信openid，唯一主键 | `oTEq5xxxxxxx` |
| `nickname` | String | ✅ | 用户昵称，长度≤12字 | `王奶奶` |
| `role` | String (enum) | ✅ | 用户角色：`elder` / `young` | `elder` |
| `avatarUrl` | String | ❌ | 头像URL | `https://thirdwx.qpic.cn/...` |
| `loginCount` | Number | ✅ | 累计登录次数 | `5` |
| `lastLoginAt` | Date | ✅ | 最后登录时间（服务器时间） | `2026-03-02T10:30:00Z` |
| `createdAt` | Date | ✅ | 创建时间（服务器时间） | `2026-02-15T08:20:00Z` |
| `updatedAt` | Date | ✅ | 最后更新时间（服务器时间） | `2026-03-02T10:30:00Z` |

#### 索引

```
- _id (自动，主键)
- role (用于查询老人/年轻人)
- createdAt (用于统计)
```

#### 示例文档

```json
{
  "_id": "oTEq5xxxxxxx",
  "nickname": "王奶奶",
  "role": "elder",
  "avatarUrl": "https://thirdwx.qpic.cn/......",
  "loginCount": 5,
  "lastLoginAt": {
    "$date": "2026-03-02T10:30:00Z"
  },
  "createdAt": {
    "$date": "2026-02-15T08:20:00Z"
  },
  "updatedAt": {
    "$date": "2026-03-02T10:30:00Z"
  }
}
```

#### 云函数操作

```javascript
// 注册/更新用户
async function upsertUser(event, wxContext) {
  const { nickname, role, avatarUrl } = event;
  const openid = wxContext.OPENID;
  
  const userData = {
    nickname: nickname.trim().slice(0, 12),
    role,
    avatarUrl: avatarUrl || "",
    loginCount: _.inc(1),
    lastLoginAt: db.serverDate(),
    updatedAt: db.serverDate()
  };
  
  await db.collection("users").doc(openid).set({
    data: userData,
    merge: true  // 仅更新指定字段
  });
  
  return { code: 0, user: userData };
}
```

---

### 2️⃣ posts - 动态表

**作用：** 存储老人发布的动态分享

#### 字段设计

| 字段名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| `_id` | String | ✅ | 动态ID，系统自动生成 | `post_xxxxx...` |
| `authorId` | String | ✅ | 发布者openid（外键→users._id） | `oTEq5xxxxxxx` |
| `content` | String | ✅ | 动态内容文本，长度>0 | `今天天气真好！` |
| `likes` | Number | ✅ | 点赞总数 | `12` |
| `likedBy` | Array[String] | ✅ | 点赞者openid列表 | `["uid1", "uid2"]` |
| `inMemoir` | Boolean | ✅ | 是否已加入回忆录 | `false` |
| `createdAt` | Date | ✅ | 发布时间（服务器时间） | `2026-03-02T09:15:00Z` |

#### 约束条件

- `content` 必须非空，需通过内容安全检测
- `likes` 和 `likedBy` 数组长度应保持同步
- `likedBy` 数组不应包含发布者自己
- `inMemoir` 在动态被加入回忆录时设为 `true`

#### 索引

```
- authorId (查询我的动态)
- createdAt (倒序排列，高频)
- authorId + createdAt (复合索引，加速列表查询)
```

#### 示例文档

```json
{
  "_id": "post_12345xxxxx",
  "authorId": "oTEq5xxxxxxx",
  "content": "今天去公园散步，樱花开得真漂亮！和朋友聊了很多天的话...",
  "likes": 12,
  "likedBy": [
    "young_user_1",
    "young_user_2",
    "young_user_3",
    "oTEq5yyyyyyy"
  ],
  "inMemoir": false,
  "createdAt": {
    "$date": "2026-03-02T09:15:00Z"
  }
}
```

#### 云函数操作

```javascript
// 发布动态
async function insertPost(event, wxContext) {
  const { content } = event;
  const openid = wxContext.OPENID;
  
  if (!content || content.trim().length === 0) {
    return { code: -1, msg: "动态内容不能为空" };
  }
  
  const res = await db.collection("posts").add({
    data: {
      authorId: openid,
      content: content.trim(),
      likes: 0,
      likedBy: [],
      inMemoir: false,
      createdAt: db.serverDate()
    }
  });
  
  return { code: 0, postId: res._id };
}

// 查询所有老人的动态（公开Feed）
async function listAllPosts(event) {
  const { page = 1, pageSize = 20 } = event;
  
  // 先获取所有老人ID
  const elderRes = await db.collection("users")
    .where({ role: "elder" })
    .field({ _id: true })
    .get();
  
  const elderIds = elderRes.data.map(u => u._id);
  
  const res = await db.collection("posts")
    .where({ authorId: _.in(elderIds) })
    .orderBy("createdAt", "desc")
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get();
  
  return { code: 0, posts: res.data };
}

// 点赞/取消点赞
async function likePost(event, wxContext) {
  const { postId } = event;
  const openid = wxContext.OPENID;
  
  const post = await db.collection("posts").doc(postId).get();
  const likedBy = post.data.likedBy || [];
  
  if (likedBy.includes(openid)) {
    // 已点赞，取消点赞
    await db.collection("posts").doc(postId).update({
      data: {
        likes: _.inc(-1),
        likedBy: _.pull(openid)
      }
    });
    return { code: 0, liked: false, likes: post.data.likes - 1 };
  } else {
    // 未点赞，点赞
    await db.collection("posts").doc(postId).update({
      data: {
        likes: _.inc(1),
        likedBy: _.push(openid)
      }
    });
    return { code: 0, liked: true, likes: post.data.likes + 1 };
  }
}
```

---

### 3️⃣ questions - 问题表（内嵌回答）

**作用：** 存储年轻人的提问和老人的回答（一条record包含所有回答）

#### 主表字段设计

| 字段名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| `_id` | String | ✅ | 问题ID，系统自动生成 | `question_xxxxx...` |
| `authorId` | String | ✅ | 提问者openid（外键→users._id） | `young_user_123` |
| `title` | String | ✅ | 问题标题，长度>0 | `如何预防高血压？` |
| `content` | String | ❌ | 问题详情描述（可选） | `最近体检发现血压高...` |
| `answers` | Array[Object] | ✅ | 回答数组（内嵌） | `[{...}, {...}]` |
| `answerCount` | Number | ✅ | 回答总数（冗余字段） | `3` |
| `createdAt` | Date | ✅ | 提问时间（服务器时间） | `2026-03-01T14:20:00Z` |

#### 内嵌回答对象结构

**answers 数组中每个元素的字段：**

| 字段名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| `_id` | String | ✅ | 回答ID，唯一标识（用于点赞） | `ans_1234xxxxx` |
| `authorId` | String | ✅ | 回答者openid（外键→users._id） | `oTEq5xxxxxxx` |
| `content` | String | ✅ | 回答内容，长度>0 | `我的经验是坚持运动...` |
| `likes` | Number | ✅ | 点赞/感谢总数 | `5` |
| `likedBy` | Array[String] | ✅ | 点赞者openid列表 | `["uid1", "uid2"]` |
| `createdAt` | Date | ✅ | 回答时间（服务器时间） | `2026-03-01T15:30:00Z` |

#### 约束条件

- 每个问题的 `answerCount` 应 = `answers` 数组长度
- 回答内容需通过内容安全检测
- 回答者必须是老人用户（role='elder'）
- 同一用户不能重复对同一问题回答多次（业务规则）

#### 索引

```
- authorId (查询我的提问)
- createdAt (倒序排列，高频)
- authorId + createdAt (复合索引)
- answerCount (可选，用于"热门问题"排序)
```

#### 示例文档

```json
{
  "_id": "question_abc123xxxxx",
  "authorId": "young_user_123",
  "title": "如何预防高血压？",
  "content": "最近体检发现血压有点高，有什么有效的预防方法吗？",
  
  "answers": [
    {
      "_id": "ans_001",
      "authorId": "oTEq5xxxxxxx",
      "content": "我今年70岁，血压一直控制得不错。我的经验是：1.坚持运动 2.少盐少油 3.定期检查",
      "likes": 5,
      "likedBy": ["young_user_1", "young_user_2", "young_user_3"],
      "createdAt": {
        "$date": "2026-03-01T15:30:00Z"
      }
    },
    {
      "_id": "ans_002",
      "authorId": "oTEq5yyyyyyy",
      "content": "中医认为要调节脾胃，可以喝点山楂水，很有帮助...",
      "likes": 2,
      "likedBy": ["young_user_1"],
      "createdAt": {
        "$date": "2026-03-01T16:00:00Z"
      }
    }
  ],
  
  "answerCount": 2,
  "createdAt": {
    "$date": "2026-03-01T14:20:00Z"
  }
}
```

#### 云函数操作

```javascript
// 发布问题
async function insertQuestion(event, wxContext) {
  const { title, content } = event;
  const openid = wxContext.OPENID;
  
  if (!title || title.trim().length === 0) {
    return { code: -1, msg: "问题标题不能为空" };
  }
  
  const res = await db.collection("questions").add({
    data: {
      authorId: openid,
      title: title.trim(),
      content: (content || "").trim(),
      answers: [],
      answerCount: 0,
      createdAt: db.serverDate()
    }
  });
  
  return { code: 0, questionId: res._id };
}

// 获取问题详情（含所有回答）
async function getQuestion(event) {
  const { questionId } = event;
  
  const res = await db.collection("questions").doc(questionId).get();
  
  if (!res.data) {
    return { code: -1, msg: "问题不存在" };
  }
  
  const question = res.data;
  
  // 批量获取提问者和回答者的昵称
  const userIds = [question.authorId, 
    ...question.answers.map(a => a.authorId)
  ];
  
  const users = await db.collection("users")
    .where({ _id: _.in(userIds) })
    .field({ nickname: true })
    .get();
  
  const userMap = {};
  users.data.forEach(u => {
    userMap[u._id] = u.nickname;
  });
  
  question.authorName = userMap[question.authorId] || "匿名";
  question.answers = question.answers.map(a => ({
    ...a,
    authorName: userMap[a.authorId] || "匿名"
  }));
  
  return { code: 0, question };
}

// 发布回答（添加到 answers 数组）
async function insertAnswer(event, wxContext) {
  const { questionId, content } = event;
  const openid = wxContext.OPENID;
  
  if (!content || content.trim().length === 0) {
    return { code: -1, msg: "回答内容不能为空" };
  }
  
  const answerId = `ans_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  
  try {
    await db.collection("questions").doc(questionId).update({
      data: {
        answers: _.push({
          _id: answerId,
          authorId: openid,
          content: content.trim(),
          likes: 0,
          likedBy: [],
          createdAt: db.serverDate()
        }),
        answerCount: _.inc(1)
      }
    });
    
    return { code: 0, answerId };
  } catch (err) {
    console.error("insertAnswer error:", err);
    return { code: -1, msg: "回答发布失败" };
  }
}

// 获取问题列表（分页）
async function listQuestions(event) {
  const { page = 1, pageSize = 20 } = event;
  
  const res = await db.collection("questions")
    .orderBy("createdAt", "desc")
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get();
  
  return { code: 0, questions: res.data };
}

// 对回答点赞
async function likeAnswer(event, wxContext) {
  const { questionId, answerId } = event;
  const openid = wxContext.OPENID;
  
  try {
    const question = await db.collection("questions")
      .doc(questionId)
      .get();
    
    const answer = question.data.answers.find(a => a._id === answerId);
    
    if (!answer) {
      return { code: -1, msg: "回答不存在" };
    }
    
    if (answer.likedBy.includes(openid)) {
      // 已点赞，取消
      answer.likedBy = answer.likedBy.filter(id => id !== openid);
      answer.likes--;
    } else {
      // 未点赞，点赞
      answer.likedBy.push(openid);
      answer.likes++;
    }
    
    // 更新整个 answers 数组
    const newAnswers = question.data.answers.map(a => 
      a._id === answerId ? answer : a
    );
    
    await db.collection("questions").doc(questionId).update({
      data: { answers: newAnswers }
    });
    
    return { code: 0, liked: !answer.likedBy.includes(openid), likes: answer.likes };
  } catch (err) {
    console.error("likeAnswer error:", err);
    return { code: -1, msg: "点赞失败" };
  }
}
```

---

### 4️⃣ memoirs - 回忆录表

**作用：** 存储老人整理的人生故事，可引用posts和questions中的内容

#### 字段设计

| 字段名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| `_id` | String | ✅ | 回忆录ID，系统自动生成 | `memoir_xxxxx...` |
| `authorId` | String | ✅ | 创建者openid（外键→users._id） | `oTEq5xxxxxxx` |
| `title` | String | ❌ | 回忆录标题（可选） | `我的青春岁月` |
| `content` | String | ✅ | 正文内容，建议150-1000字 | `那是1980年的夏天...` |
| `sourceRefs` | Array[String] | ✅ | 来源ID列表（可为空） | `["post_1", "ans_2"]` |
| `isAIGenerated` | Boolean | ✅ | 是否由AI生成 | `true` |
| `createdAt` | Date | ✅ | 创建时间（服务器时间） | `2026-03-02T08:00:00Z` |

#### 约束条件

- 只有老人用户(role='elder')才能创建回忆录
- `content` 字段必须非空
- `sourceRefs` 可为空数组（手动创建的情况）
- `sourceRefs` 中的ID可以是 `post_*` 或来自 `questions.*answers[].` （但纯用ID标识）
- 用户只能删除/编辑自己的回忆录

#### 索引

```
- authorId (查询我的回忆录)
- createdAt (倒序排列)
```

#### 示例文档

```json
{
  "_id": "memoir_ghi789xxxxx",
  "authorId": "oTEq5xxxxxxx",
  "title": "我的青春岁月",
  "content": "那是1980年的夏天，我刚从大学毕业。那时候的北京，骑自行车是最朴素的出行方式...",
  "sourceRefs": [
    "post_12345xxxxx",
    "ans_001"
  ],
  "isAIGenerated": true,
  "createdAt": {
    "$date": "2026-03-02T08:00:00Z"
  }
}
```

#### 云函数操作

```javascript
// 保存回忆录
async function saveMemoir(event, wxContext) {
  const { title, content, sourceRefs } = event;
  const openid = wxContext.OPENID;
  
  if (!content || content.trim().length === 0) {
    return { code: -1, msg: "回忆录内容不能为空" };
  }
  
  const res = await db.collection("memoirs").add({
    data: {
      authorId: openid,
      title: (title || "").trim() || "无标题回忆",
      content: content.trim(),
      sourceRefs: sourceRefs || [],
      isAIGenerated: false,
      createdAt: db.serverDate()
    }
  });
  
  // 标记相关动态已加入回忆录
  if (sourceRefs && sourceRefs.length > 0) {
    for (const refId of sourceRefs) {
      if (refId.startsWith("post_")) {
        try {
          await db.collection("posts").doc(refId)
            .update({ data: { inMemoir: true } });
        } catch (e) {
          // 忽略错误
        }
      }
    }
  }
  
  return { code: 0, memoirId: res._id };
}

// 查询我的回忆录列表
async function listMemoirs(event, wxContext) {
  const openid = wxContext.OPENID;
  
  const res = await db.collection("memoirs")
    .where({ authorId: openid })
    .orderBy("createdAt", "desc")
    .get();
  
  return { code: 0, memoirs: res.data };
}

// 获取回忆录详情
async function getMemoir(event, wxContext) {
  const { memoirId } = event;
  
  const res = await db.collection("memoirs").doc(memoirId).get();
  
  if (!res.data) {
    return { code: -1, msg: "回忆录不存在" };
  }
  
  return { code: 0, memoir: res.data };
}

// 删除回忆录
async function deleteMemoir(event, wxContext) {
  const { memoirId } = event;
  const openid = wxContext.OPENID;
  
  const memoir = await db.collection("memoirs").doc(memoirId).get();
  
  if (memoir.data.authorId !== openid) {
    return { code: -1, msg: "无权删除他人回忆录" };
  }
  
  await db.collection("memoirs").doc(memoirId).remove();
  
  return { code: 0, msg: "删除成功" };
}
```

---

### 5️⃣ news - 资讯表

**作用：** 存储从人民日报爬取的新闻，供老年用户阅读

#### 字段设计

| 字段名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| `_id` | String | ✅ | 资讯ID，系统自动生成 | `news_xxxxx...` |
| `title` | String | ✅ | 标题 | `春季养生重点关注脾胃` |
| `summary` | String | ✅ | 摘要（前100字） | `春天是养生的好季节...` |
| `content` | String | ✅ | 完整正文 | `春天是养生的好季节。中医认为...` |
| `category` | String | ✅ | 分类标签 | `health` / `news` / `society` |
| `imageUrl` | String | ❌ | 封面图URL | `https://mmbiz.qpic.cn/...` |
| `sourceUrl` | String | ✅ | 原文链接 | `http://www.people.com.cn/...` |
| `source` | String | ✅ | 来源（固定值） | `人民日报` |
| `publishedAt` | Date | ✅ | 原文发布时间 | `2026-03-02T06:30:00Z` |
| `fetchedAt` | Date | ✅ | 爬取时间（服务器时间） | `2026-03-02T08:00:00Z` |

#### 分类枚举值

```
- "headlines"    ← 要闻
- "health"       ← 健康养生
- "society"      ← 社会生活  
- "politics"     ← 时政
```

#### 约束条件

- 资讯由后端定时爬取任务生成，用户不能直接写入
- `sourceUrl` 应该是唯一的（避免重复存储）
- `publishedAt` 是原文发布时间，`fetchedAt` 是抓取时间
- 每日爬取一次，自动去重

#### 索引

```
- category (分类筛选，高频)
- publishedAt (倒序排列，查看最新)
- fetchedAt (查询最新爬取的资讯)
- sourceUrl (防重复，建议添加唯一索引)
```

#### 示例文档

```json
{
  "_id": "news_jkl012xxxxx",
  "title": "春季养生重点关注脾胃",
  "summary": "春天是养生的好季节，中医认为春季要重点关注脾胃健康，通过调理脾胃来增强体质...",
  "content": "春天是养生的好季节。中医认为春季养生要重点关注脾胃健康...",
  "category": "health",
  "imageUrl": "https://mmbiz.qpic.cn/mmbiz_jpg/...",
  "sourceUrl": "http://www.people.com.cn/n1/2026/0302/...",
  "source": "人民日报",
  "publishedAt": {
    "$date": "2026-03-02T06:30:00Z"
  },
  "fetchedAt": {
    "$date": "2026-03-02T08:00:00Z"
  }
}
```

#### 云函数操作

```javascript
// 查询资讯列表（分类筛选）
async function listNews(event) {
  const { category = "", page = 1, pageSize = 20 } = event;
  
  let query = db.collection("news");
  
  if (category && category !== "all") {
    query = query.where({ category });
  }
  
  const res = await query
    .orderBy("publishedAt", "desc")
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get();
  
  return { code: 0, news: res.data };
}

// 获取资讯详情
async function getNews(event) {
  const { newsId } = event;
  
  const res = await db.collection("news").doc(newsId).get();
  
  if (!res.data) {
    return { code: -1, msg: "资讯不存在" };
  }
  
  return { code: 0, news: res.data };
}

// 后端爬取（需要单独的爬虫云函数或定时任务）
async function fetchNewsFromPRS(event) {
  // 这个由后端爬虫任务负责
  // 定时抓取人民日报最新文章
  // 去重后插入 news 集合
  
  const newsData = {
    title: "...",
    summary: "...",
    content: "...",
    category: "health",
    imageUrl: "...",
    sourceUrl: "...",
    source: "人民日报",
    publishedAt: new Date(),
    fetchedAt: db.serverDate()
  };
  
  await db.collection("news").add({ data: newsData });
}
```

---

## 📊 5 个表对比总结

| 表名 | 字段数 | 用途 | 核心关系 | 权限 |
|------|--------|------|---------|------|
| users | 8 | 用户认证 | 中心表 | 用户只读写自己 |
| posts | 7 | 老人动态分享 | 一对多→users | 公开读，发布者可删 |
| questions | 动态 | 问题+回答 | 一对多→users | 公开读，提问者可删 |
| memoirs | 7 | 人生故事 | 一对(0多)→posts/questions | 用户只读写自己 |
| news | 10 | 资讯浏览 | 独立表 | 公开只读 |

---

## 🔄 常见业务流程

### 流程1：发布动态并添加到回忆录

```
1. 老人在 posts 表发布动态 (insertPost)
   → 返回 postId
   
2. 老人在 memoirs 表创建回忆录
   → sourceRefs 包含该 postId
   
3. 后端更新 posts 表
   → 设置 inMemoir = true
```

### 流程2：提问和回答

```
1. 年轻人提出问题 (insertQuestion)
   → questions 表，answers 数组为空，answerCount = 0
   
2. 老人回答问题 (insertAnswer)
   → 在 questions 表的 answers 数组中 push 新回答
   → answerCount 递增
   
3. 其他用户点赞回答 (likeAnswer)
   → 修改该回答的 likes 和 likedBy 字段
```

### 流程3：使用AI生成回忆录

```
1. 老人选择动态/回答作为素材 (sourceRefs)
   
2. 后端调用 LLM 接口
   → 基于 sourceRefs 生成文本草稿
   
3. 老人编辑后保存 (saveMemoir)
   → isAIGenerated = true
   → 包含所有 sourceRefs
```

---

## ✅ 数据库初始化检查清单

```
第一阶段：创建集合
□ users        (手动创建)
□ posts        (首次insertPost时自动，或手动创建)
□ questions    (首次insertQuestion时自动，或手动创建)
□ memoirs      (首次saveMemoir时自动，或手动创建)
□ news         (首次insertNews时自动，或手动创建)

第二阶段：创建索引
□ users:       role, createdAt
□ posts:       authorId, createdAt, (authorId+createdAt)
□ questions:   authorId, createdAt, (authorId+createdAt)
□ memoirs:     authorId, createdAt
□ news:        category, publishedAt, fetchedAt, (sourceUrl)

第三阶段：权限配置
□ users:       用户只读写自己
□ posts:       公开读，authorId匹配的可更新/删除
□ questions:   公开读，authorId匹配的可删除
□ memoirs:     用户只读写自己
□ news:        所有人只读

第四阶段：测试验证
□ 测试insertPost
□ 测试listAllPosts
□ 测试insertQuestion
□ 测试insertAnswer
□ 测试likeAnswer
□ 测试本地化数据库连接
```

---

**最后更新：** 2026-03-02
