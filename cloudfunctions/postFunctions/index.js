// 动态管理云函数
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const POST_QUEUE_COLLECTION = "post_publish_queue";
const USER_MESSAGE_COLLECTION = "user_messages";
const POST_COMMENT_COLLECTION = "post_comments";
const USER_FOLLOW_COLLECTION = "user_follows";
const OFFICIAL_BOT = {
  id: "official_bot",
  name: "银龄乐园官方机器人",
};
const LOG_PREFIX = "[postFunctions]";

async function moderateContent({ scene, content, images }) {
  try {
    console.log(
      `${LOG_PREFIX} moderate start`,
      JSON.stringify({
        scene,
        contentSummary: summarizeText(content || "", 120),
        imageCount: Array.isArray(images) ? images.length : 0,
      })
    );

    const res = await cloud.callFunction({
      name: "contentCheck",
      data: {
        type: "checkContent",
        scene,
        content: content || "",
        images: Array.isArray(images) ? images : [],
      },
    });
    const moderation = (res && res.result) || { decision: "review", msg: "内容存在风险提示，将带提示发布" };

    console.log(
      `${LOG_PREFIX} moderate done`,
      JSON.stringify({
        decision: moderation.decision,
        riskScore: moderation.riskScore,
        category: moderation.category,
        reasons: moderation.reasons,
        msg: moderation.msg,
      })
    );

    return moderation;
  } catch (err) {
    console.error(`${LOG_PREFIX} moderateContent error:`, err);
    return {
      decision: "review",
      riskScore: 55,
      category: "unknown",
      reasons: ["内容审核服务异常，已转人工审核"],
      riskWarning: "风险提示：内容审核服务异常，请谨慎辨别信息真伪。",
      msg: "内容存在风险提示，将带提示发布",
    };
  }
}

function summarizeText(text = "", maxLen = 80) {
  const normalized = `${text || ""}`.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.length > maxLen ? `${normalized.slice(0, maxLen)}...` : normalized;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function isCollectionNotExistsError(err) {
  const code = Number((err && err.errCode) || 0);
  return code === -502005;
}

function buildInlineCommentId() {
  return `inline_comment_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function isPostVisibleForPublic(auditStatus) {
  // 兼容历史数据：旧版本可能写入 approved。
  if (!auditStatus) return true;
  return ["passed", "warned", "approved"].includes(auditStatus);
}

async function buildTempUrlMap(fileIds = []) {
  const cloudFileIds = [...new Set(fileIds.filter((item) => item && item.startsWith("cloud://")))];
  if (cloudFileIds.length === 0) {
    return {};
  }

  const normalizedPaths = cloudFileIds.map((fileId) => {
    if (fileId.includes("/posts/")) {
      return fileId.replace("/posts/", "/posts/photos/");
    }
    return fileId;
  });

  const tempRes = await cloud.getTempFileURL({ fileList: normalizedPaths });
  const urlMap = {};
  tempRes.fileList.forEach((item, index) => {
    if (item.tempFileURL) {
      urlMap[cloudFileIds[index]] = item.tempFileURL;
    }
  });
  return urlMap;
}

async function getUsersProfileMap(userIds = []) {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueUserIds.length === 0) {
    return {};
  }

  const userRes = await db
    .collection("users")
    .where({ _id: _.in(uniqueUserIds) })
    .field({ nickname: true, avatarUrl: true })
    .get();

  const avatarUrlMap = await buildTempUrlMap(userRes.data.map((item) => item.avatarUrl).filter(Boolean));
  const profileMap = {};
  userRes.data.forEach((item) => {
    profileMap[item._id] = {
      nickname: item.nickname || "匿名用户",
      avatarUrl: avatarUrlMap[item.avatarUrl] || item.avatarUrl || "",
    };
  });
  return profileMap;
}

async function getAuthorFollowState(currentUserId, authorId) {
  if (!currentUserId || !authorId || currentUserId === authorId) {
    return false;
  }

  try {
    const followDocId = `${currentUserId}__${authorId}`;
    const res = await db.collection(USER_FOLLOW_COLLECTION).doc(followDocId).get();
    return !!res.data;
  } catch (err) {
    const code = Number((err && err.errCode) || 0);
    if (code === -1 || code === -502005) {
      return false;
    }
    console.error("getAuthorFollowState error:", err);
    return false;
  }
}

function buildPostCard(post, profileMap, tempUrlMap, openid) {
  const profile = profileMap[post.authorId] || { nickname: "匿名用户", avatarUrl: "" };
  return {
    ...post,
    authorName: profile.nickname,
    authorAvatarUrl: profile.avatarUrl,
    images: ensureArray(post.images).map((item) => tempUrlMap[item] || item),
    liked: ensureArray(post.likedBy).includes(openid),
  };
}

async function sendOfficialAuditMessage({ receiverId, queueId, moderation }) {
  const reasons = Array.isArray(moderation && moderation.reasons)
    ? moderation.reasons.filter(Boolean).slice(0, 3)
    : [];
  const reasonText = reasons.length > 0 ? reasons.join("；") : "内容存在违规或高风险信息";

  await db.collection(USER_MESSAGE_COLLECTION).add({
    data: {
      receiverId,
      senderId: OFFICIAL_BOT.id,
      senderName: OFFICIAL_BOT.name,
      senderType: "official_bot",
      conversationId: OFFICIAL_BOT.id,
      messageType: "audit_reject",
      title: "动态未通过审核",
      content: `您发布的动态未通过审核：${reasonText}`,
      relatedType: "post_publish",
      relatedId: queueId,
      moderation: {
        decision: moderation && moderation.decision,
        category: moderation && moderation.category,
        riskScore: Number((moderation && moderation.riskScore) || 0),
        reasons,
      },
      status: "unread",
      createdAt: db.serverDate(),
      updatedAt: db.serverDate(),
    },
  });
}

// 发布动态
async function insertPost(event, wxContext) {
  const { content, images = [] } = event;
  const openid = wxContext.OPENID;
  const debugTrace = [];

  const trace = (step, extra = {}) => {
    debugTrace.push({ step, ...extra, at: Date.now() });
  };

  if (!content || content.trim().length === 0) {
    trace("validate_failed", { reason: "empty_content" });
    return { code: -1, msg: "动态内容不能为空", debugTrace };
  }

  try {
    const normalizedContent = content.trim();
    const normalizedImages = Array.isArray(images) ? images : [];
    trace("insert_start", {
      openid,
      contentSummary: summarizeText(normalizedContent, 120),
      imageCount: normalizedImages.length,
    });
    console.log(
      `${LOG_PREFIX} insertPost request`,
      JSON.stringify({
        openid,
        contentSummary: summarizeText(normalizedContent, 120),
        imageCount: normalizedImages.length,
      })
    );
    try {
      const queueRes = await db.collection(POST_QUEUE_COLLECTION).add({
        data: {
          authorId: openid,
          content: normalizedContent,
          images: normalizedImages,
          status: "pending",
          preview: summarizeText(normalizedContent, 80),
          createdAt: db.serverDate(),
          updatedAt: db.serverDate(),
        },
      });

      // 尝试在云端直接触发异步审核，前端也会再触发一次兜底。
      trace("queue_created", { queueId: queueRes._id });
      cloud
        .callFunction({
          name: "postFunctions",
          data: {
            type: "processPendingPost",
            queueId: queueRes._id,
          },
        })
        .catch((err) => {
          console.error("trigger processPendingPost in background error:", err);
          trace("async_process_trigger_failed", { errMsg: err && err.message ? err.message : "unknown" });
        });

      return {
        code: 0,
        queueId: queueRes._id,
        status: "pending",
        msg: "发送成功，正在审核",
        debugTrace,
      };
    } catch (queueErr) {
      // 队列异常时降级：避免用户正常内容无法发送
      console.error(`${LOG_PREFIX} insert queue error, fallback to sync mode:`, queueErr);
      trace("queue_failed_fallback_sync", {
        errMsg: queueErr && queueErr.message ? queueErr.message : "unknown",
      });

      const moderation = await moderateContent({
        scene: "post",
        content: normalizedContent,
        images: normalizedImages,
      });
      trace("moderation_done", {
        decision: moderation.decision,
        riskScore: moderation.riskScore,
        category: moderation.category,
        reasons: moderation.reasons,
      });

      if (moderation.decision === "reject") {
        await sendOfficialAuditMessage({
          receiverId: openid,
          queueId: "sync_fallback",
          moderation,
        }).catch((msgErr) => {
          console.error("sendOfficialAuditMessage in sync fallback error:", msgErr);
        });

        trace("sync_reject");
        return { code: -1, msg: moderation.msg || "内容未通过审核", debugTrace };
      }

      const auditStatus = moderation.decision === "pass" ? "passed" : "warned";
      console.log(
        `${LOG_PREFIX} sync fallback result`,
        JSON.stringify({
          decision: moderation.decision,
          auditStatus,
          riskScore: moderation.riskScore,
          category: moderation.category,
          reasons: moderation.reasons,
        })
      );
      const postRes = await db.collection("posts").add({
        data: {
          authorId: openid,
          content: normalizedContent,
          images: normalizedImages,
          likes: 0,
          commentCount: 0,
          likedBy: [],
          inMemoir: false,
          auditStatus,
          riskScore: Number(moderation.riskScore || 0),
          riskCategory: moderation.category || "normal",
          riskWarning: moderation.riskWarning || "",
          blockedReason: moderation.msg || "",
          createdAt: db.serverDate(),
        },
      });

      return {
        code: 0,
        postId: postRes._id,
        status: auditStatus,
        fallbackMode: "sync",
        msg: auditStatus === "warned" ? "发送成功，已附风险提示" : "发送成功",
        debugTrace,
      };
    }
  } catch (err) {
    console.error("insertPost error:", err);
    trace("insert_exception", { errMsg: err && err.message ? err.message : "unknown" });
    return { code: -1, msg: err && err.message ? `发布失败：${err.message}` : "发布失败", debugTrace };
  }
}

async function processPendingPost(event, wxContext) {
  const { queueId } = event;
  const openid = wxContext.OPENID;

  if (!queueId) {
    return { code: -1, msg: "queueId不能为空" };
  }

  try {
    const queueRes = await db.collection(POST_QUEUE_COLLECTION).doc(queueId).get();
    const queueDoc = queueRes.data;

    if (!queueDoc) {
      return { code: -1, msg: "待审核记录不存在" };
    }

    if (openid && queueDoc.authorId && queueDoc.authorId !== openid) {
      return { code: -1, msg: "无权处理该审核任务" };
    }

    if (["approved", "rejected"].includes(queueDoc.status)) {
      return {
        code: 0,
        queueId,
        status: queueDoc.status,
        postId: queueDoc.postId || "",
        msg: "审核任务已处理",
      };
    }

    await db.collection(POST_QUEUE_COLLECTION).doc(queueId).update({
      data: {
        status: "processing",
        updatedAt: db.serverDate(),
      },
    });

    const moderation = await moderateContent({
      scene: "post",
      content: queueDoc.content || "",
      images: queueDoc.images || [],
    });

    if (moderation.decision === "pass") {
      const postRes = await db.collection("posts").add({
        data: {
          authorId: queueDoc.authorId,
          content: queueDoc.content || "",
          images: queueDoc.images || [],
          likes: 0,
          commentCount: 0,
          likedBy: [],
          inMemoir: false,
          auditStatus: "passed",
          riskScore: Number(moderation.riskScore || 0),
          riskCategory: moderation.category || "normal",
          riskWarning: "",
          blockedReason: "",
          createdAt: db.serverDate(),
        },
      });

      await db.collection(POST_QUEUE_COLLECTION).doc(queueId).update({
        data: {
          status: "approved",
          postId: postRes._id,
          moderation,
          reviewedAt: db.serverDate(),
          updatedAt: db.serverDate(),
        },
      });

      return { code: 0, queueId, status: "approved", postId: postRes._id, msg: "审核通过" };
    }

    await db.collection(POST_QUEUE_COLLECTION).doc(queueId).update({
      data: {
        status: "rejected",
        moderation,
        reviewedAt: db.serverDate(),
        updatedAt: db.serverDate(),
      },
    });

    await sendOfficialAuditMessage({
      receiverId: queueDoc.authorId,
      queueId,
      moderation,
    });

    return { code: 0, queueId, status: "rejected", msg: moderation.msg || "内容未通过审核" };
  } catch (err) {
    console.error("processPendingPost error:", err);
    try {
      await db.collection(POST_QUEUE_COLLECTION).doc(queueId).update({
        data: {
          status: "failed",
          failReason: err && err.message ? err.message : "unknown",
          updatedAt: db.serverDate(),
        },
      });
    } catch (updateErr) {
      console.error("update queue failed status error:", updateErr);
    }
    return { code: -1, msg: "审核处理失败" };
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

// 查询所有动态（公共Feed）
async function listAllPosts(event, wxContext) {
  const { page = 1, pageSize = 20 } = event;
  const openid = wxContext.OPENID;

  try {
    const res = await db
      .collection("posts")
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

    const posts = (res.data || []).map((p) => {
      const rawAvatar = avatarMap[p.authorId] || "";
      // 转换图片URL
      const processedImages = (p.images || []).map(img => tempUrlMap[img] || img);
      return {
        ...p,
        images: processedImages,
        authorName: nameMap[p.authorId] || "匿名用户",
        authorAvatarUrl: tempUrlMap[rawAvatar] || rawAvatar,
        liked: ensureArray(p.likedBy).includes(openid),
      };
    });

    console.log(
      `${LOG_PREFIX} listAllPosts`,
      JSON.stringify({
        page,
        pageSize,
        dbCount: (res.data || []).length,
        resultCount: posts.length,
      })
    );

    return { code: 0, posts };
  } catch (err) {
    console.error("listAllPosts error:", err);
    return { code: -1, msg: "查询失败" };
  }
}

async function listUserPosts(event, wxContext) {
  const openid = wxContext.OPENID;
  const userId = `${event.userId || ""}`.trim();
  const page = Math.max(1, Number(event.page || 1));
  const pageSize = Math.max(1, Math.min(50, Number(event.pageSize || 20)));

  if (!userId) {
    return { code: -1, msg: "userId不能为空" };
  }

  try {
    const res = await db
      .collection("posts")
      .where({ authorId: userId })
      .orderBy("createdAt", "desc")
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    const visiblePosts = (res.data || []).filter((item) => {
      const auditStatus = item.auditStatus || "passed";
      if (userId === openid) {
        return true;
      }
      return isPostVisibleForPublic(auditStatus);
    });

    const profileMap = await getUsersProfileMap([userId]);
    const tempUrlMap = await buildTempUrlMap(
      visiblePosts.flatMap((item) => ensureArray(item.images))
    );

    return {
      code: 0,
      posts: visiblePosts.map((item) => buildPostCard(item, profileMap, tempUrlMap, openid)),
      hasMore: visiblePosts.length === pageSize,
    };
  } catch (err) {
    console.error("listUserPosts error:", err);
    return { code: -1, msg: "查询失败" };
  }
}

async function listMyMessages(event, wxContext) {
  const openid = wxContext.OPENID;
  const { page = 1, pageSize = 20 } = event;

  try {
    const res = await db
      .collection(USER_MESSAGE_COLLECTION)
      .where({
        receiverId: openid,
        senderType: "official_bot",
      })
      .orderBy("createdAt", "desc")
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    return { code: 0, messages: res.data || [] };
  } catch (err) {
    console.error("listMyMessages error:", err);
    const code = Number((err && err.errCode) || 0);
    if (code === -502005) {
      console.warn("listMyMessages skipped: user_messages collection not exists");
      return { code: 0, messages: [] };
    }
    return { code: 0, messages: [] };
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

async function getPost(event, wxContext) {
  const { postId } = event;
  const openid = wxContext.OPENID;

  if (!postId) {
    return { code: -1, msg: "postId不能为空" };
  }

  try {
    const [postRes, commentRes] = await Promise.all([
      db.collection("posts").doc(postId).get(),
      db.collection(POST_COMMENT_COLLECTION).where({ postId }).orderBy("createdAt", "desc").limit(100).get().catch((err) => {
        const code = Number((err && err.errCode) || 0);
        if (code === -502005) {
          return { data: [] };
        }
        throw err;
      }),
    ]);

    const post = postRes.data;
    if (!post) {
      return { code: -1, msg: "动态不存在" };
    }

    const commentsFromCollection = (commentRes.data || []).filter((item) => ["passed", "warned", undefined].includes(item.auditStatus));
    const comments = commentsFromCollection.length > 0
      ? commentsFromCollection
      : ensureArray(post.comments).filter((item) => ["passed", "warned", undefined].includes(item.auditStatus));
    const profileMap = await getUsersProfileMap([post.authorId, ...comments.map((item) => item.authorId)]);
    const tempUrlMap = await buildTempUrlMap([...ensureArray(post.images), ...comments.flatMap((item) => ensureArray(item.images))]);

    const postProfile = profileMap[post.authorId] || { nickname: "匿名用户", avatarUrl: "" };
    const isFollowingAuthor = await getAuthorFollowState(openid, post.authorId);
    const resultPost = {
      ...post,
      authorName: postProfile.nickname,
      authorAvatarUrl: postProfile.avatarUrl,
      images: ensureArray(post.images).map((item) => tempUrlMap[item] || item),
      liked: ensureArray(post.likedBy).includes(openid),
      commentCount: Number(post.commentCount || comments.length || 0),
      isAuthorSelf: post.authorId === openid,
      isFollowingAuthor,
    };

    const resultComments = comments.map((item) => {
      const profile = profileMap[item.authorId] || { nickname: "匿名用户", avatarUrl: "" };
      return {
        ...item,
        authorName: profile.nickname,
        authorAvatarUrl: profile.avatarUrl,
        images: ensureArray(item.images).map((img) => tempUrlMap[img] || img),
      };
    });

    return {
      code: 0,
      post: resultPost,
      comments: resultComments,
      currentUserOpenid: openid,
    };
  } catch (err) {
    console.error("getPost error:", err);
    return { code: -1, msg: "加载详情失败" };
  }
}

async function insertComment(event, wxContext) {
  const { postId, content } = event;
  const openid = wxContext.OPENID;
  const normalizedContent = `${content || ""}`.trim();

  if (!postId) {
    return { code: -1, msg: "postId不能为空" };
  }
  if (!normalizedContent) {
    return { code: -1, msg: "评论内容不能为空" };
  }

  try {
    const postRes = await db.collection("posts").doc(postId).get();
    if (!postRes.data) {
      return { code: -1, msg: "动态不存在" };
    }

    const moderation = await moderateContent({
      scene: "post_comment",
      content: normalizedContent,
      images: [],
    });

    if (moderation.decision === "reject") {
      return { code: -1, msg: moderation.msg || "评论未通过审核" };
    }

    const auditStatus = moderation.decision === "pass" ? "passed" : "warned";
    const commentData = {
      postId,
      authorId: openid,
      content: normalizedContent,
      auditStatus,
      riskScore: Number(moderation.riskScore || 0),
      riskCategory: moderation.category || "normal",
      riskWarning: moderation.riskWarning || "",
      createdAt: db.serverDate(),
    };

    let commentId = "";
    try {
      const commentRes = await db.collection(POST_COMMENT_COLLECTION).add({
        data: commentData,
      });
      commentId = commentRes._id;

      await db.collection("posts").doc(postId).update({
        data: {
          commentCount: _.inc(1),
        },
      });
    } catch (commentErr) {
      if (!isCollectionNotExistsError(commentErr)) {
        throw commentErr;
      }

      console.warn("insertComment fallback to inline comments: post_comments collection not exists");
      commentId = buildInlineCommentId();
      await db.collection("posts").doc(postId).update({
        data: {
          commentCount: _.inc(1),
          comments: _.push({
            each: [
              {
                ...commentData,
                _id: commentId,
              },
            ],
          }),
        },
      });
    }

    return {
      code: 0,
      commentId,
      auditStatus,
      msg: auditStatus === "warned" ? "评论已发布并附风险提示" : "评论成功",
    };
  } catch (err) {
    console.error("insertComment error:", err);
    return { code: -1, msg: "评论失败" };
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
    await db.collection(POST_COMMENT_COLLECTION).where({ postId }).remove().catch((err) => {
      const code = Number((err && err.errCode) || 0);
      if (code !== -502005) {
        throw err;
      }
    });
    return { code: 0, msg: "删除成功" };
  } catch (err) {
    console.error("deletePost error:", err);
    return { code: -1, msg: "删除失败" };
  }
}

// 搜索动态（按内容及作者昵称关键词过滤）
async function searchPosts(event, wxContext) {
  const openid = wxContext.OPENID;
  const keyword = `${event.keyword || ""}`.trim().slice(0, 30);
  if (!keyword) return { code: 0, posts: [] };

  try {
    // 拉取最近 100 条用于客户端过滤
    const res = await db
      .collection("posts")
      .orderBy("createdAt", "desc")
      .limit(100)
      .get();

    // 批量获取作者信息
    const authorIds = [...new Set(res.data.map((p) => p.authorId))];
    const userRes = await db
      .collection("users")
      .where({ _id: _.in(authorIds) })
      .field({ nickname: true, avatarUrl: true })
      .get();

    const nameMap = {};
    const avatarMap = {};
    userRes.data.forEach((u) => {
      nameMap[u._id] = u.nickname || "";
      avatarMap[u._id] = u.avatarUrl || "";
    });

    // 关键词过滤
    const normalized = keyword.toLowerCase();
    const filtered = res.data.filter((p) => {
      const content = `${p.content || ""}`.toLowerCase();
      const name = `${nameMap[p.authorId] || ""}`.toLowerCase();
      return content.includes(normalized) || name.includes(normalized);
    });

    // 只对过滤后的结果获取临时 URL
    const usedAvatarPaths = [...new Set(
      filtered.map((p) => avatarMap[p.authorId]).filter((u) => u && u.startsWith("cloud://"))
    )];
    const usedImagePaths = [...new Set(
      filtered.flatMap((p) => (p.images || []).filter((img) => img.startsWith("cloud://")))
    )];
    const allOriginalPaths = [...new Set([...usedAvatarPaths, ...usedImagePaths])];
    const allNewPaths = allOriginalPaths.map((f) => f.replace("/posts/", "/posts/photos/"));

    const tempUrlMap = {};
    if (allNewPaths.length > 0) {
      const tempRes = await cloud.getTempFileURL({ fileList: allNewPaths });
      tempRes.fileList.forEach((item, index) => {
        if (item.tempFileURL) {
          tempUrlMap[allOriginalPaths[index]] = item.tempFileURL;
        }
      });
    }

    const posts = filtered.map((p) => {
      const rawAvatar = avatarMap[p.authorId] || "";
      return {
        ...p,
        images: (p.images || []).map((img) => tempUrlMap[img] || img),
        authorName: nameMap[p.authorId] || "匿名用户",
        authorAvatarUrl: tempUrlMap[rawAvatar] || rawAvatar,
        liked: ensureArray(p.likedBy).includes(openid),
      };
    });

    return { code: 0, posts };
  } catch (err) {
    console.error("searchPosts error:", err);
    return { code: -1, msg: "搜索失败" };
  }
}

// 主入口路由
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();

  switch (event.type) {
    case "insertPost":
      return insertPost(event, wxContext);
    case "processPendingPost":
      return processPendingPost(event, wxContext);
    case "listMyPosts":
      return listMyPosts(event, wxContext);
    case "listAllPosts":
      return listAllPosts(event, wxContext);
    case "listUserPosts":
      return listUserPosts(event, wxContext);
    case "listMyMessages":
      return listMyMessages(event, wxContext);
    case "likePost":
      return likePost(event, wxContext);
    case "getPost":
      return getPost(event, wxContext);
    case "insertComment":
      return insertComment(event, wxContext);
    case "deletePost":
      return deletePost(event, wxContext);
    case "searchPosts":
      return searchPosts(event, wxContext);
    default:
      return { code: -1, msg: "未知操作类型" };
  }
};
