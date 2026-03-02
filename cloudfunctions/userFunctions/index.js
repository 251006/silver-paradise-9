// 用户管理云函数
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

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
    return { code: 0, user: res.data };
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
    default:
      return { code: -1, msg: "未知操作类型" };
  }
};
