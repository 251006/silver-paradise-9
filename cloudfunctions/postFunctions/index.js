// 动态管理云函数
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 发布动态
async function insertPost(event, wxContext) {
  const { content, images = [] } = event;
  const openid = wxContext.OPENID;

  if (!content || content.trim().length === 0) {
    return { code: -1, msg: "动态内容不能为空" };
  }

  try {
    const res = await db.collection("posts").add({
      data: {
        authorId: openid,
        content: content.trim(),
        images: Array.isArray(images) ? images : [],
        likes: 0,
        likedBy: [],
        inMemoir: false,
        createdAt: db.serverDate(),
      },
    });
    return { code: 0, postId: res._id };
  } catch (err) {
    console.error("insertPost error:", err);
    return { code: -1, msg: "发布失败" };
  }
}

// 查询我的动态
async function listMyPosts(event, wxContext) {
  const openid = wxContext.OPENID;
  const { page = 1, pageSize = 20 } = event;

  try {
    const res = await db
      .collection("posts")
      .where({ authorId: openid })
      .orderBy("createdAt", "desc")
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    // 转换图片URL
    const posts = res.data;
    // 收集原始图片路径并替换为新路径
    const originalPaths = [...new Set(
      posts.flatMap(p => (p.images || []).filter(img => img.startsWith("cloud://")))
    )];
    const newPaths = originalPaths.map(fileId => fileId.replace('/posts/', '/posts/photos/'));

    if (newPaths.length > 0) {
      const tempRes = await cloud.getTempFileURL({ fileList: newPaths });
      const tempUrlMap = {};
      tempRes.fileList.forEach((item, index) => {
        if (item.tempFileURL) {
          // 使用原始路径作为key，新路径的临时URL作为value
          tempUrlMap[originalPaths[index]] = item.tempFileURL;
        }
      });

      posts.forEach(p => {
        p.images = (p.images || []).map(img => tempUrlMap[img] || img);
      });
    }

    return { code: 0, posts };
  } catch (err) {
    return { code: -1, msg: "查询失败" };
  }
}

// 查询所有老人用户的动态（公共Feed）
async function listAllPosts(event) {
  const { page = 1, pageSize = 20 } = event;

  try {
    // 先获取所有老人用户ID
    const elderRes = await db
      .collection("users")
      .where({ role: "elder" })
      .field({ _id: true })
      .limit(1000)
      .get();

    const elderIds = elderRes.data.map((u) => u._id);

    if (elderIds.length === 0) {
      return { code: 0, posts: [] };
    }

    const res = await db
      .collection("posts")
      .where({ authorId: _.in(elderIds) })
      .orderBy("createdAt", "desc")
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    // 批量获取昵称
    const authorIds = [...new Set(res.data.map((p) => p.authorId))];
    const userRes = await db
      .collection("users")
      .where({ _id: _.in(authorIds) })
      .field({ nickname: true, avatarUrl: true })
      .get();

    const nameMap = {};
    const avatarMap = {};
    userRes.data.forEach((u) => {
      nameMap[u._id] = u.nickname;
      avatarMap[u._id] = u.avatarUrl || "";
    });

    // 收集所有需要转换的云文件ID（头像+图片）
    // 将旧路径 posts/ 替换为新路径 posts/photos/
    const originalAvatars = Object.values(avatarMap).filter((url) => url && url.startsWith("cloud://"));
    const originalImages = res.data.flatMap(p => (p.images || []).filter(img => img.startsWith("cloud://")));
    const allOriginalPaths = [...new Set([...originalAvatars, ...originalImages])];
    const allNewPaths = allOriginalPaths.map(fileId => fileId.replace('/posts/', '/posts/photos/'));
    
    const tempUrlMap = {};
    if (allNewPaths.length > 0) {
      const tempRes = await cloud.getTempFileURL({ fileList: allNewPaths });
      tempRes.fileList.forEach((item, index) => {
        if (item.tempFileURL) {
          // 使用原始路径作为key
          tempUrlMap[allOriginalPaths[index]] = item.tempFileURL;
        }
      });
    }

    const posts = res.data.map((p) => {
      const rawAvatar = avatarMap[p.authorId] || "";
      // 转换图片URL
      const processedImages = (p.images || []).map(img => tempUrlMap[img] || img);
      return {
        ...p,
        images: processedImages,
        authorName: nameMap[p.authorId] || "匿名用户",
        authorAvatarUrl: tempUrlMap[rawAvatar] || rawAvatar,
      };
    });

    return { code: 0, posts };
  } catch (err) {
    console.error("listAllPosts error:", err);
    return { code: -1, msg: "查询失败" };
  }
}

// 点赞动态
async function likePost(event, wxContext) {
  const { postId } = event;
  const openid = wxContext.OPENID;

  try {
    // 检查是否已点赞
    const postRes = await db.collection("posts").doc(postId).get();
    const post = postRes.data;

    if (post.likedBy && post.likedBy.includes(openid)) {
      // 取消点赞
      await db
        .collection("posts")
        .doc(postId)
        .update({
          data: {
            likes: _.inc(-1),
            likedBy: _.pull(openid),
          },
        });
      return { code: 0, liked: false, likes: post.likes - 1 };
    } else {
      // 点赞
      await db
        .collection("posts")
        .doc(postId)
        .update({
          data: {
            likes: _.inc(1),
            likedBy: _.push(openid),
          },
        });
      return { code: 0, liked: true, likes: post.likes + 1 };
    }
  } catch (err) {
    console.error("likePost error:", err);
    return { code: -1, msg: "操作失败" };
  }
}

// 删除动态
async function deletePost(event, wxContext) {
  const { postId } = event;
  const openid = wxContext.OPENID;

  try {
    // 验证用户是否为发布者
    const postRes = await db.collection("posts").doc(postId).get();
    const post = postRes.data;

    if (!post) {
      return { code: -1, msg: "动态不存在" };
    }

    if (post.authorId !== openid) {
      return { code: -1, msg: "无权删除他人的动态" };
    }

    // 删除动态
    await db.collection("posts").doc(postId).remove();
    return { code: 0, msg: "删除成功" };
  } catch (err) {
    console.error("deletePost error:", err);
    return { code: -1, msg: "删除失败" };
  }
}

// 主入口路由
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();

  switch (event.type) {
    case "insertPost":
      return insertPost(event, wxContext);
    case "listMyPosts":
      return listMyPosts(event, wxContext);
    case "listAllPosts":
      return listAllPosts(event);
    case "likePost":
      return likePost(event, wxContext);
    case "deletePost":
      return deletePost(event, wxContext);
    default:
      return { code: -1, msg: "未知操作类型" };
  }
};
