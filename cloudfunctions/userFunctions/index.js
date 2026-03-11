// 用户管理云函数
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const USER_FOLLOW_COLLECTION = "user_follows";
const POSTS_COLLECTION = "posts";
const QUESTIONS_COLLECTION = "questions";

function normalizeNickname(nickname) {
  return `${nickname || ""}`.trim().slice(0, 12);
}

function buildUserDoc(wxContext, nickname, role, avatarUrl = "") {
  return {
    _id: wxContext.OPENID,
    openid: wxContext.OPENID,
    appid: wxContext.APPID || "",
    unionid: wxContext.UNIONID || "",
    nickname,
    role,
    avatarUrl: avatarUrl || "",
    loginCount: 1,
    lastLoginAt: db.serverDate(),
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
  };
}

function sanitizeOpenid(openid) {
  return `${openid || ""}`.trim().slice(0, 64);
}

function buildFollowDocId(followerId, followeeId) {
  return `${followerId}__${followeeId}`;
}

function sumLikes(items = []) {
  return items.reduce((total, item) => total + Number((item && item.likes) || 0), 0);
}

function isCollectionNotExistsError(err) {
  return Number((err && err.errCode) || 0) === -502005;
}

async function getCount(query) {
  try {
    const res = await query.count();
    if (typeof res.total === "number") {
      return res.total;
    }
  } catch (err) {
    if (isCollectionNotExistsError(err)) {
      return 0;
    }
    console.warn("count fallback:", err && err.message ? err.message : err);
  }

  try {
    const res = await query.get();
    return Array.isArray(res.data) ? res.data.length : 0;
  } catch (err) {
    if (isCollectionNotExistsError(err)) {
      return 0;
    }
    throw err;
  }
}

async function getTempAvatarUrl(avatarUrl = "") {
  if (!avatarUrl || !avatarUrl.startsWith("cloud://")) {
    return avatarUrl;
  }

  try {
    const tempRes = await cloud.getTempFileURL({ fileList: [avatarUrl] });
    const file = (tempRes.fileList || [])[0];
    return file && file.tempFileURL ? file.tempFileURL : avatarUrl;
  } catch (err) {
    console.error("getTempAvatarUrl error:", err);
    return avatarUrl;
  }
}

async function getTempAvatarUrlMap(avatarUrls = []) {
  const cloudIds = [...new Set((avatarUrls || []).filter((url) => url && url.startsWith("cloud://")))];
  if (cloudIds.length === 0) {
    return {};
  }

  try {
    const tempRes = await cloud.getTempFileURL({ fileList: cloudIds });
    const map = {};
    (tempRes.fileList || []).forEach((item) => {
      if (item && item.fileID && item.tempFileURL) {
        map[item.fileID] = item.tempFileURL;
      }
    });
    return map;
  } catch (err) {
    console.error("getTempAvatarUrlMap error:", err);
    return {};
  }
}

async function getUserBaseMap(userIds = []) {
  const idList = [...new Set((userIds || []).filter(Boolean))];
  if (idList.length === 0) {
    return {};
  }

  const res = await db
    .collection("users")
    .where({ _id: _.in(idList) })
    .field({ nickname: true, avatarUrl: true, role: true })
    .get();

  const avatarTempMap = await getTempAvatarUrlMap((res.data || []).map((item) => item.avatarUrl));
  const userMap = {};
  (res.data || []).forEach((item) => {
    userMap[item._id] = {
      userId: item._id,
      nickname: item.nickname || "匿名用户",
      role: item.role || "",
      avatarUrl: avatarTempMap[item.avatarUrl] || item.avatarUrl || "",
    };
  });

  return userMap;
}

async function listFollowing(event, wxContext) {
  const openid = wxContext.OPENID;
  const page = Math.max(1, Number(event.page || 1));
  const pageSize = Math.max(1, Math.min(50, Number(event.pageSize || 20)));

  try {
    const res = await db
      .collection(USER_FOLLOW_COLLECTION)
      .where({ followerId: openid })
      .orderBy("createdAt", "desc")
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    const followDocs = res.data || [];
    const targetIds = followDocs.map((item) => item.followeeId).filter(Boolean);
    const userMap = await getUserBaseMap(targetIds);

    const list = targetIds
      .map((userId) => {
        const profile = userMap[userId];
        if (!profile) return null;
        return {
          ...profile,
          isFollowing: true,
        };
      })
      .filter(Boolean);

    return {
      code: 0,
      list,
      hasMore: followDocs.length === pageSize,
    };
  } catch (err) {
    if (isCollectionNotExistsError(err)) {
      return { code: 0, list: [], hasMore: false };
    }
    console.error("listFollowing error:", err);
    return { code: -1, msg: "加载关注列表失败" };
  }
}

async function listFollowers(event, wxContext) {
  const openid = wxContext.OPENID;
  const page = Math.max(1, Number(event.page || 1));
  const pageSize = Math.max(1, Math.min(50, Number(event.pageSize || 20)));

  try {
    const res = await db
      .collection(USER_FOLLOW_COLLECTION)
      .where({ followeeId: openid })
      .orderBy("createdAt", "desc")
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    const followerDocs = res.data || [];
    const followerIds = followerDocs.map((item) => item.followerId).filter(Boolean);
    const userMap = await getUserBaseMap(followerIds);

    let followedByMeSet = new Set();
    if (followerIds.length > 0) {
      try {
        const followingRes = await db
          .collection(USER_FOLLOW_COLLECTION)
          .where({
            followerId: openid,
            followeeId: _.in(followerIds),
          })
          .field({ followeeId: true })
          .get();
        followedByMeSet = new Set((followingRes.data || []).map((item) => item.followeeId));
      } catch (err) {
        if (!isCollectionNotExistsError(err)) {
          throw err;
        }
      }
    }

    const list = followerIds
      .map((userId) => {
        const profile = userMap[userId];
        if (!profile) return null;
        return {
          ...profile,
          isFollowing: followedByMeSet.has(userId),
        };
      })
      .filter(Boolean);

    return {
      code: 0,
      list,
      hasMore: followerDocs.length === pageSize,
    };
  } catch (err) {
    if (isCollectionNotExistsError(err)) {
      return { code: 0, list: [], hasMore: false };
    }
    console.error("listFollowers error:", err);
    return { code: -1, msg: "加载粉丝列表失败" };
  }
}

async function sumPostLikesByAuthor(authorId) {
  const pageSize = 100;
  let total = 0;
  let skip = 0;

  while (true) {
    const res = await db
      .collection(POSTS_COLLECTION)
      .where({ authorId })
      .field({ likes: true })
      .skip(skip)
      .limit(pageSize)
      .get();

    const list = res.data || [];
    total += sumLikes(list);

    if (list.length < pageSize) {
      break;
    }
    skip += pageSize;
  }

  return total;
}

async function sumAnswerLikesByAuthor(authorId) {
  const pageSize = 100;
  let total = 0;
  let skip = 0;

  while (true) {
    const res = await db
      .collection(QUESTIONS_COLLECTION)
      .field({ answers: true })
      .skip(skip)
      .limit(pageSize)
      .get();

    const list = res.data || [];
    list.forEach((question) => {
      const answers = Array.isArray(question.answers) ? question.answers : [];
      total += sumLikes(answers.filter((answer) => answer.authorId === authorId));
    });

    if (list.length < pageSize) {
      break;
    }
    skip += pageSize;
  }

  return total;
}

async function getUserStats(userId) {
  const [followingCount, followerCount, postLikeCount, answerLikeCount] = await Promise.all([
    getCount(db.collection(USER_FOLLOW_COLLECTION).where({ followerId: userId })),
    getCount(db.collection(USER_FOLLOW_COLLECTION).where({ followeeId: userId })),
    sumPostLikesByAuthor(userId),
    sumAnswerLikesByAuthor(userId),
  ]);

  return {
    followingCount,
    followerCount,
    likeCount: postLikeCount + answerLikeCount,
  };
}

async function getFollowState(currentUserId, targetUserId) {
  if (!currentUserId || !targetUserId || currentUserId === targetUserId) {
    return false;
  }

  try {
    const res = await db
      .collection(USER_FOLLOW_COLLECTION)
      .doc(buildFollowDocId(currentUserId, targetUserId))
      .get();
    return !!res.data;
  } catch (err) {
    if ((err && err.errCode === -1) || isCollectionNotExistsError(err)) {
      return false;
    }
    throw err;
  }
}

async function upsertUser(wxContext, nickname, role, avatarUrl = "") {
  const openid = wxContext.OPENID;
  const userRef = db.collection("users").doc(openid);

  try {
    const existing = await userRef.get();
    const currentData = existing.data || {};

    const updateData = {
      nickname,
      role,
      appid: wxContext.APPID || currentData.appid || "",
      unionid: wxContext.UNIONID || currentData.unionid || "",
      loginCount: _.inc(1),
      lastLoginAt: db.serverDate(),
      updatedAt: db.serverDate(),
    };

    // \u5982\u679c\u63d0\u4f9b\u4e86\u65b0\u7684\u5934\u50cf\uff0c\u4e5f\u4e00\u8d77\u66f4\u65b0
    if (avatarUrl) {
      updateData.avatarUrl = avatarUrl;
    }

    await userRef.update({
      data: updateData,
    });

    return {
      openid,
      nickname,
      role,
      avatarUrl: avatarUrl || currentData.avatarUrl || "",
    };
  } catch (err) {
    if (err && err.errCode !== -1) {
      throw err;
    }

    await db.collection("users").add({
      data: buildUserDoc(wxContext, nickname, role, avatarUrl),
    });

    return {
      openid,
      nickname,
      role,
      avatarUrl: avatarUrl || "",
    };
  }
}

// 注册 / 更新用户
async function register(event, wxContext) {
  const role = event.role;
  const nickname = normalizeNickname(event.nickname);
  const avatarUrl = `${event.avatarUrl || ""}`.trim();

  if (!nickname || !role) {
    return { code: -1, msg: "昵称和角色不能为空" };
  }

  if (!["elder", "young"].includes(role)) {
    return { code: -1, msg: "无效的角色" };
  }

  try {
    const user = await upsertUser(wxContext, nickname, role, avatarUrl);
    return { code: 0, openid: user.openid, user };
  } catch (err) {
    console.error("register error:", err);
    return { code: -1, msg: "注册失败" };
  }
}

async function wechatLogin(event, wxContext) {
  const role = event.role;
  const nickname = normalizeNickname(event.nickname);
  const avatarUrl = `${event.avatarUrl || ""}`.trim();
  const code = `${event.code || ""}`.trim();

  if (!code) {
    return { code: -1, msg: "缺少微信登录凭证" };
  }
  if (!nickname || !role) {
    return { code: -1, msg: "昵称和角色不能为空" };
  }
  if (!["elder", "young"].includes(role)) {
    return { code: -1, msg: "无效的角色" };
  }

  try {
    const user = await upsertUser(wxContext, nickname, role, avatarUrl);
    return {
      code: 0,
      openid: user.openid,
      user,
      loginType: "wechat",
    };
  } catch (err) {
    console.error("wechatLogin error:", err);
    return { code: -1, msg: "微信登录失败" };
  }
}

// 获取用户信息
async function getUser(event, wxContext) {
  const openid = event.openid || wxContext.OPENID;
  try {
    const res = await db.collection("users").doc(openid).get();
    const user = res.data || {};
    return {
      code: 0,
      user: {
        ...user,
        avatarUrl: await getTempAvatarUrl(user.avatarUrl || ""),
      },
    };
  } catch (err) {
    return { code: -1, msg: "用户不存在" };
  }
}

// 获取用户昵称（批量）
async function getUserNames(event) {
  const { openids } = event;
  if (!openids || openids.length === 0) return { code: 0, users: {} };

  try {
    const res = await db
      .collection("users")
      .where({ _id: _.in(openids) })
      .field({ nickname: true, role: true })
      .get();

    const users = {};
    res.data.forEach((u) => {
      users[u._id] = { nickname: u.nickname, role: u.role };
    });
    return { code: 0, users };
  } catch (err) {
    return { code: -1, msg: "查询失败" };
  }
}

// 更新用户资料
async function updateProfile(event, wxContext) {
  const openid = wxContext.OPENID;
  const { nickname, avatarUrl } = event;

  if (!nickname || !nickname.trim()) {
    return { code: -1, message: "昵称不能为空" };
  }

  try {
    const updateData = {
      nickname: normalizeNickname(nickname),
      updatedAt: db.serverDate(),
    };

    if (avatarUrl) {
      updateData.avatarUrl = avatarUrl;
    }

    await db.collection("users").doc(openid).update({
      data: updateData,
    });

    return { code: 0, message: "更新成功" };
  } catch (err) {
    console.error("updateProfile error:", err);
    return { code: -1, message: "更新失败" };
  }
}

async function getUserProfile(event, wxContext) {
  const targetUserId = sanitizeOpenid(event.userId || wxContext.OPENID);

  if (!targetUserId) {
    return { code: -1, msg: "缺少用户ID" };
  }

  try {
    const userRes = await db.collection("users").doc(targetUserId).get();
    const user = userRes.data;

    if (!user) {
      return { code: -1, msg: "用户不存在" };
    }

    const [stats, avatarUrl, isFollowing] = await Promise.all([
      getUserStats(targetUserId),
      getTempAvatarUrl(user.avatarUrl || ""),
      getFollowState(wxContext.OPENID, targetUserId),
    ]);

    return {
      code: 0,
      profile: {
        ...user,
        avatarUrl,
        followingCount: stats.followingCount,
        followerCount: stats.followerCount,
        likeCount: stats.likeCount,
        isSelf: targetUserId === wxContext.OPENID,
        isFollowing,
      },
    };
  } catch (err) {
    console.error("getUserProfile error:", err);
    return { code: -1, msg: "加载用户主页失败" };
  }
}

async function toggleFollowUser(event, wxContext) {
  const followerId = wxContext.OPENID;
  const followeeId = sanitizeOpenid(event.userId);

  if (!followeeId) {
    return { code: -1, msg: "缺少目标用户" };
  }

  if (followerId === followeeId) {
    return { code: -1, msg: "不能关注自己" };
  }

  try {
    await db.collection("users").doc(followeeId).get();
  } catch (err) {
    return { code: -1, msg: "目标用户不存在" };
  }

  const followDocId = buildFollowDocId(followerId, followeeId);
  let followed = false;

  try {
    await db.collection(USER_FOLLOW_COLLECTION).doc(followDocId).get();
    await db.collection(USER_FOLLOW_COLLECTION).doc(followDocId).remove();
    followed = false;
  } catch (err) {
    if (err && err.errCode !== -1 && !isCollectionNotExistsError(err)) {
      console.error("toggleFollowUser get/remove error:", err);
      return { code: -1, msg: "操作失败，请稍后重试" };
    }

    try {
      await db.collection(USER_FOLLOW_COLLECTION).doc(followDocId).set({
        data: {
          followerId,
          followeeId,
          createdAt: db.serverDate(),
          updatedAt: db.serverDate(),
        },
      });
      followed = true;
    } catch (setErr) {
      console.error("toggleFollowUser set error:", setErr);
      return { code: -1, msg: "操作失败，请稍后重试" };
    }
  }

  try {
    const stats = await getUserStats(followeeId);
    return {
      code: 0,
      followed,
      followerCount: stats.followerCount,
      followingCount: stats.followingCount,
    };
  } catch (err) {
    console.error("toggleFollowUser stats error:", err);
    return { code: 0, followed, followerCount: 0, followingCount: 0 };
  }
}

// 主入口路由
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();

  switch (event.type) {
    case "wechatLogin":
      return wechatLogin(event, wxContext);
    case "register":
      return register(event, wxContext);
    case "getUser":
      return getUser(event, wxContext);
    case "getUserNames":
      return getUserNames(event);
    case "updateProfile":
      return updateProfile(event, wxContext);
    case "getUserProfile":
      return getUserProfile(event, wxContext);
    case "toggleFollowUser":
      return toggleFollowUser(event, wxContext);
    case "listFollowing":
      return listFollowing(event, wxContext);
    case "listFollowers":
      return listFollowers(event, wxContext);
    default:
      return { code: -1, msg: "未知操作类型" };
  }
};
