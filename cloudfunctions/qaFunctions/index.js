const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 30;

function sanitizeText(text = "", maxLen = 1000) {
  return `${text}`.trim().slice(0, maxLen);
}

function unique(arr = []) {
  return [...new Set(arr.filter(Boolean))];
}

function getDateMillis(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  if (value.$date) return new Date(value.$date).getTime();
  return new Date(value).getTime() || 0;
}

function safeNumber(num) {
  const value = Number(num);
  if (Number.isNaN(value)) return 0;
  return value;
}

function calculateQuestionHeat(question = {}) {
  const answerCount = safeNumber(question.answerCount);
  const viewCount = safeNumber(question.viewCount);
  const followerCount = safeNumber(question.followerCount);
  const totalThanks = (question.answers || []).reduce(
    (sum, answer) => sum + safeNumber(answer.likes),
    0
  );

  return answerCount * 8 + totalThanks * 3 + followerCount * 2 + viewCount * 0.2;
}

async function getUserInfo(openid) {
  try {
    const res = await db.collection("users").doc(openid).get();
    return res.data || null;
  } catch (err) {
    return null;
  }
}

async function ensureRole(openid, role) {
  const user = await getUserInfo(openid);
  if (!user) {
    return { ok: false, msg: "用户不存在，请先完成登录" };
  }
  if (user.role !== role) {
    return { ok: false, msg: role === "young" ? "仅年轻用户可以提问" : "仅长辈用户可以回答" };
  }
  return { ok: true, user };
}

async function getUserMap(openids = []) {
  const idList = unique(openids);
  if (idList.length === 0) return {};

  const userRes = await db
    .collection("users")
    .where({ _id: _.in(idList) })
    .field({ nickname: true, avatarUrl: true, role: true })
    .get();

  const userMap = {};
  userRes.data.forEach((user) => {
    userMap[user._id] = {
      nickname: user.nickname || "匿名用户",
      avatarUrl: user.avatarUrl || "",
      role: user.role || "",
    };
  });

  return userMap;
}

function enrichQuestion(question, authorMap, openid) {
  const author = authorMap[question.authorId] || {};
  const answers = question.answers || [];
  const totalThanks = answers.reduce((sum, answer) => sum + safeNumber(answer.likes), 0);
  const followers = question.followers || [];

  return {
    ...question,
    authorName: author.nickname || "匿名用户",
    authorAvatar: author.avatarUrl || "",
    authorRole: author.role || "",
    answerCount: safeNumber(question.answerCount),
    viewCount: safeNumber(question.viewCount),
    followerCount: safeNumber(question.followerCount),
    totalThanks,
    isFollowing: followers.includes(openid),
    heatScore: Number(calculateQuestionHeat(question).toFixed(2)),
  };
}

function enrichAnswer(answer, userMap, openid) {
  const author = userMap[answer.authorId] || {};
  const likedBy = answer.likedBy || [];

  return {
    ...answer,
    likes: safeNumber(answer.likes),
    authorName: author.nickname || "匿名长辈",
    authorAvatar: author.avatarUrl || "",
    authorRole: author.role || "",
    liked: likedBy.includes(openid),
  };
}

async function insertQuestion(event, wxContext) {
  const openid = wxContext.OPENID;
  const title = sanitizeText(event.title, 60);
  const content = sanitizeText(event.content, 2000);
  const images = Array.isArray(event.images) ? event.images : [];

  if (!title) return { code: -1, msg: "问题标题不能为空" };

  const roleCheck = await ensureRole(openid, "young");
  if (!roleCheck.ok) return { code: -1, msg: roleCheck.msg };

  try {
    const res = await db.collection("questions").add({
      data: {
        authorId: openid,
        title,
        content,
        images,
        answers: [],
        answerCount: 0,
        viewCount: 0,
        followerCount: 1,
        followers: [openid],
        createdAt: db.serverDate(),
        updatedAt: db.serverDate(),
        lastAnswerAt: null,
      },
    });

    return { code: 0, questionId: res._id };
  } catch (err) {
    console.error("insertQuestion error:", err);
    return { code: -1, msg: "发布失败，请稍后重试" };
  }
}

async function listQuestions(event, wxContext) {
  const openid = wxContext.OPENID;
  const page = Math.max(1, Number(event.page || 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(event.pageSize || DEFAULT_PAGE_SIZE)));
  const sortBy = ["new", "hot", "unanswered"].includes(event.sortBy) ? event.sortBy : "new";
  const keyword = sanitizeText(event.keyword, 30);

  try {
    const where = {};
    if (sortBy === "unanswered") {
      where.answerCount = 0;
    }

    let query = db.collection("questions").where(where);
    if (sortBy === "hot") {
      query = query.orderBy("answerCount", "desc").orderBy("createdAt", "desc");
    } else {
      query = query.orderBy("createdAt", "desc");
    }

    const res = await query.skip((page - 1) * pageSize).limit(pageSize).get();
    let questions = res.data || [];
    if (keyword) {
      const normalizedKeyword = keyword.toLowerCase();
      questions = questions.filter((item) => {
        const title = `${item.title || ""}`.toLowerCase();
        const content = `${item.content || ""}`.toLowerCase();
        return title.includes(normalizedKeyword) || content.includes(normalizedKeyword);
      });
    }

    const authorMap = await getUserMap(questions.map((item) => item.authorId));

    // 收集所有需要转换的云文件ID（头像+问题图片）
    const cloudFileIds = [...new Set(
      Object.values(authorMap)
        .map(u => u.avatarUrl)
        .filter(url => url && url.startsWith("cloud://"))
        .concat(...questions.map(q => (q.images || []).filter(img => img.startsWith("cloud://"))))
    )];

    // 批量转换临时URL
    const tempUrlMap = {};
    if (cloudFileIds.length > 0) {
      const tempRes = await cloud.getTempFileURL({ fileList: cloudFileIds });
      tempRes.fileList.forEach((item) => {
        if (item.tempFileURL) {
          tempUrlMap[item.fileID] = item.tempFileURL;
        }
      });
    }

    // 转换用户头像URL
    Object.values(authorMap).forEach(user => {
      if (user.avatarUrl && tempUrlMap[user.avatarUrl]) {
        user.avatarUrl = tempUrlMap[user.avatarUrl];
      }
    });

    let enriched = questions.map((item) => {
      // 转换问题图片URL
      item.images = (item.images || []).map(img => tempUrlMap[img] || img);
      return enrichQuestion(item, authorMap, openid);
    });

    if (sortBy === "hot") {
      enriched = enriched.sort((a, b) => b.heatScore - a.heatScore);
    }

    return {
      code: 0,
      questions: enriched,
      page,
      pageSize,
      hasMore: questions.length === pageSize,
    };
  } catch (err) {
    console.error("listQuestions error:", err);
    return { code: -1, msg: "查询失败，请稍后重试" };
  }
}

async function getQuestion(event, wxContext) {
  const openid = wxContext.OPENID;
  const questionId = sanitizeText(event.questionId, 64);
  const answerSort = ["hot", "latest"].includes(event.answerSort) ? event.answerSort : "hot";

  if (!questionId) return { code: -1, msg: "参数错误" };

  try {
    const qRes = await db.collection("questions").doc(questionId).get();
    const question = qRes.data;
    if (!question) return { code: -1, msg: "问题不存在" };

    await db.collection("questions").doc(questionId).update({
      data: { viewCount: _.inc(1), updatedAt: db.serverDate() },
    });

    const answerAuthorIds = (question.answers || []).map((item) => item.authorId);
    const userMap = await getUserMap([question.authorId, ...answerAuthorIds]);

    // 收集所有需要转换的云文件ID（头像+问题图片+回答图片）
    const cloudFileIds = [...new Set(
      Object.values(userMap)
        .map(u => u.avatarUrl)
        .filter(url => url && url.startsWith("cloud://"))
        .concat((question.images || []).filter(img => img.startsWith("cloud://")))
        .concat(...(question.answers || []).map(a => (a.images || []).filter(img => img.startsWith("cloud://"))))
    )];

    // 批量转换临时URL
    const tempUrlMap = {};
    if (cloudFileIds.length > 0) {
      const tempRes = await cloud.getTempFileURL({ fileList: cloudFileIds });
      tempRes.fileList.forEach((item) => {
        if (item.tempFileURL) {
          tempUrlMap[item.fileID] = item.tempFileURL;
        }
      });
    }

    // 转换用户头像URL
    Object.values(userMap).forEach(user => {
      if (user.avatarUrl && tempUrlMap[user.avatarUrl]) {
        user.avatarUrl = tempUrlMap[user.avatarUrl];
      }
    });

    // 转换问题图片URL
    question.images = (question.images || []).map(img => tempUrlMap[img] || img);

    const answers = (question.answers || []).map((item) => {
      // 转换回答图片URL
      item.images = (item.images || []).map(img => tempUrlMap[img] || img);
      return enrichAnswer(item, userMap, openid);
    });
    const sortedAnswers = answers.sort((a, b) => {
      if (answerSort === "latest") {
        return getDateMillis(b.createdAt) - getDateMillis(a.createdAt);
      }
      const likeDiff = safeNumber(b.likes) - safeNumber(a.likes);
      if (likeDiff !== 0) return likeDiff;
      return getDateMillis(b.createdAt) - getDateMillis(a.createdAt);
    });

    const questionData = enrichQuestion(
      {
        ...question,
        viewCount: safeNumber(question.viewCount) + 1,
        answerCount: sortedAnswers.length,
      },
      userMap,
      openid
    );

    questionData.answers = sortedAnswers;
    questionData.answerCount = sortedAnswers.length;

    const currentUser = await getUserInfo(openid);
    const currentRole = (currentUser && currentUser.role) || "";

    return {
      code: 0,
      question: questionData,
      currentUserRole: currentRole,
      canAnswer: currentRole === "elder",
      canAsk: currentRole === "young",
    };
  } catch (err) {
    console.error("getQuestion error:", err);
    return { code: -1, msg: "加载失败，请稍后重试" };
  }
}

async function insertAnswer(event, wxContext) {
  const openid = wxContext.OPENID;
  const questionId = sanitizeText(event.questionId, 64);
  const content = sanitizeText(event.content, 3000);
  const images = Array.isArray(event.images) ? event.images : [];

  if (!questionId || !content) return { code: -1, msg: "回答内容不能为空" };

  const roleCheck = await ensureRole(openid, "elder");
  if (!roleCheck.ok) return { code: -1, msg: roleCheck.msg };

  try {
    const qRes = await db.collection("questions").doc(questionId).get();
    const question = qRes.data;
    if (!question) return { code: -1, msg: "问题不存在" };

    const existingAnswer = (question.answers || []).find((item) => item.authorId === openid);
    if (existingAnswer) {
      return { code: -1, msg: "您已回答过该问题，可在详情页继续互动" };
    }

    const answerId = `ans_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const answerDoc = {
      _id: answerId,
      authorId: openid,
      content,
      images,
      likes: 0,
      likedBy: [],
      createdAt: db.serverDate(),
    };

    await db.collection("questions").doc(questionId).update({
      data: {
        answers: _.push(answerDoc),
        answerCount: _.inc(1),
        updatedAt: db.serverDate(),
        lastAnswerAt: db.serverDate(),
      },
    });

    return { code: 0, answerId };
  } catch (err) {
    console.error("insertAnswer error:", err);
    return { code: -1, msg: "回答失败，请稍后重试" };
  }
}

async function likeAnswer(event, wxContext) {
  const openid = wxContext.OPENID;
  const questionId = sanitizeText(event.questionId, 64);
  const answerId = sanitizeText(event.answerId, 64);
  if (!questionId || !answerId) return { code: -1, msg: "参数错误" };

  try {
    const qRes = await db.collection("questions").doc(questionId).get();
    const question = qRes.data;
    if (!question) return { code: -1, msg: "问题不存在" };

    let liked = false;
    let likes = 0;

    const newAnswers = (question.answers || []).map((answer) => {
      if (answer._id !== answerId) return answer;

      const likedBy = answer.likedBy || [];
      const alreadyLiked = likedBy.includes(openid);
      liked = !alreadyLiked;

      if (alreadyLiked) {
        likes = Math.max(0, safeNumber(answer.likes) - 1);
        return {
          ...answer,
          likes,
          likedBy: likedBy.filter((id) => id !== openid),
        };
      }

      likes = safeNumber(answer.likes) + 1;
      return {
        ...answer,
        likes,
        likedBy: [...likedBy, openid],
      };
    });

    const exists = newAnswers.some((answer) => answer._id === answerId);
    if (!exists) return { code: -1, msg: "回答不存在" };

    await db.collection("questions").doc(questionId).update({
      data: {
        answers: newAnswers,
        updatedAt: db.serverDate(),
      },
    });

    return { code: 0, liked, likes };
  } catch (err) {
    console.error("likeAnswer error:", err);
    return { code: -1, msg: "操作失败，请稍后重试" };
  }
}

async function followQuestion(event, wxContext) {
  const openid = wxContext.OPENID;
  const questionId = sanitizeText(event.questionId, 64);
  if (!questionId) return { code: -1, msg: "参数错误" };

  try {
    const qRes = await db.collection("questions").doc(questionId).get();
    const question = qRes.data;
    if (!question) return { code: -1, msg: "问题不存在" };

    const followers = question.followers || [];
    const isFollowing = followers.includes(openid);

    const nextFollowers = isFollowing
      ? followers.filter((id) => id !== openid)
      : [...followers, openid];
    const followerCount = nextFollowers.length;

    await db.collection("questions").doc(questionId).update({
      data: {
        followers: nextFollowers,
        followerCount,
        updatedAt: db.serverDate(),
      },
    });

    return {
      code: 0,
      followed: !isFollowing,
      followerCount,
    };
  } catch (err) {
    console.error("followQuestion error:", err);
    return { code: -1, msg: "操作失败，请稍后重试" };
  }
}

async function listMyAnswers(event, wxContext) {
  const openid = wxContext.OPENID;

  try {
    const res = await db.collection("questions").get();
    const myAnswers = [];

    (res.data || []).forEach((question) => {
      (question.answers || []).forEach((answer) => {
        if (answer.authorId === openid) {
          myAnswers.push({
            ...answer,
            questionId: question._id,
            questionTitle: question.title,
            questionContent: question.content || "",
          });
        }
      });
    });

    myAnswers.sort((a, b) => getDateMillis(b.createdAt) - getDateMillis(a.createdAt));

    return { code: 0, answers: myAnswers };
  } catch (err) {
    console.error("listMyAnswers error:", err);
    return { code: -1, msg: "查询失败，请稍后重试" };
  }
}

// 删除问题
async function deleteQuestion(event, wxContext) {
  const openid = wxContext.OPENID;
  const questionId = sanitizeText(event.questionId, 64);

  if (!questionId) return { code: -1, msg: "参数错误" };

  try {
    // 获取问题信息
    const qRes = await db.collection("questions").doc(questionId).get();
    const question = qRes.data;

    if (!question) {
      return { code: -1, msg: "问题不存在" };
    }

    // 验证用户是否为提问者
    if (question.authorId !== openid) {
      return { code: -1, msg: "无权删除他人的问题" };
    }

    // 删除问题
    await db.collection("questions").doc(questionId).remove();
    return { code: 0, msg: "删除成功" };
  } catch (err) {
    console.error("deleteQuestion error:", err);
    return { code: -1, msg: "删除失败，请稍后重试" };
  }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();

  switch (event.type) {
    case "insertQuestion":
      return insertQuestion(event, wxContext);
    case "listQuestions":
      return listQuestions(event, wxContext);
    case "getQuestion":
      return getQuestion(event, wxContext);
    case "insertAnswer":
      return insertAnswer(event, wxContext);
    case "likeAnswer":
      return likeAnswer(event, wxContext);
    case "followQuestion":
      return followQuestion(event, wxContext);
    case "listMyAnswers":
      return listMyAnswers(event, wxContext);
    case "deleteQuestion":
      return deleteQuestion(event, wxContext);
    default:
      return { code: -1, msg: "未知操作类型" };
  }
};
