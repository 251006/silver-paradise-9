// 社区问答云函数
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 发布问题（年轻用户）
async function insertQuestion(event, wxContext) {
  const { title, content } = event;
  const openid = wxContext.OPENID;

  if (!title || title.trim().length === 0) {
    return { code: -1, msg: "问题标题不能为空" };
  }

  try {
    const res = await db.collection("questions").add({
      data: {
        authorId: openid,
        title: title.trim(),
        content: (content || "").trim(),
        answerCount: 0,
        createdAt: db.serverDate(),
      },
    });
    return { code: 0, questionId: res._id };
  } catch (err) {
    console.error("insertQuestion error:", err);
    return { code: -1, msg: "发布失败" };
  }
}

// 查询问题列表
async function listQuestions(event) {
  const { page = 1, pageSize = 20 } = event;

  try {
    const res = await db
      .collection("questions")
      .orderBy("createdAt", "desc")
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    // 批量获取提问者昵称
    const authorIds = [...new Set(res.data.map((q) => q.authorId))];
    let nameMap = {};
    if (authorIds.length > 0) {
      const userRes = await db
        .collection("users")
        .where({ _id: _.in(authorIds) })
        .field({ nickname: true })
        .get();
      userRes.data.forEach((u) => {
        nameMap[u._id] = u.nickname;
      });
    }

    const questions = res.data.map((q) => ({
      ...q,
      authorName: nameMap[q.authorId] || "匿名用户",
    }));

    return { code: 0, questions };
  } catch (err) {
    return { code: -1, msg: "查询失败" };
  }
}

// 获取问题详情
async function getQuestion(event) {
  const { questionId } = event;

  try {
    const qRes = await db.collection("questions").doc(questionId).get();
    const question = qRes.data;

    // 获取提问者昵称
    try {
      const userRes = await db.collection("users").doc(question.authorId).get();
      question.authorName = userRes.data.nickname;
    } catch (e) {
      question.authorName = "匿名用户";
    }

    // 获取所有回答
    const ansRes = await db
      .collection("answers")
      .where({ questionId })
      .orderBy("createdAt", "asc")
      .get();

    // 批量获取回答者昵称
    const ansAuthorIds = [...new Set(ansRes.data.map((a) => a.authorId))];
    let ansNameMap = {};
    if (ansAuthorIds.length > 0) {
      const ansUserRes = await db
        .collection("users")
        .where({ _id: _.in(ansAuthorIds) })
        .field({ nickname: true })
        .get();
      ansUserRes.data.forEach((u) => {
        ansNameMap[u._id] = u.nickname;
      });
    }

    const answers = ansRes.data.map((a) => ({
      ...a,
      authorName: ansNameMap[a.authorId] || "匿名长辈",
    }));

    return { code: 0, question, answers };
  } catch (err) {
    console.error("getQuestion error:", err);
    return { code: -1, msg: "查询失败" };
  }
}

// 发布回答（老人用户）
async function insertAnswer(event, wxContext) {
  const { questionId, content } = event;
  const openid = wxContext.OPENID;

  if (!content || content.trim().length === 0) {
    return { code: -1, msg: "回答内容不能为空" };
  }

  try {
    const res = await db.collection("answers").add({
      data: {
        questionId,
        authorId: openid,
        content: content.trim(),
        likes: 0,
        likedBy: [],
        createdAt: db.serverDate(),
      },
    });

    // 更新问题的回答数
    await db
      .collection("questions")
      .doc(questionId)
      .update({
        data: { answerCount: _.inc(1) },
      });

    return { code: 0, answerId: res._id };
  } catch (err) {
    console.error("insertAnswer error:", err);
    return { code: -1, msg: "回答失败" };
  }
}

// 点赞回答
async function likeAnswer(event, wxContext) {
  const { answerId } = event;
  const openid = wxContext.OPENID;

  try {
    const ansRes = await db.collection("answers").doc(answerId).get();
    const answer = ansRes.data;

    if (answer.likedBy && answer.likedBy.includes(openid)) {
      await db
        .collection("answers")
        .doc(answerId)
        .update({
          data: { likes: _.inc(-1), likedBy: _.pull(openid) },
        });
      return { code: 0, liked: false, likes: answer.likes - 1 };
    } else {
      await db
        .collection("answers")
        .doc(answerId)
        .update({
          data: { likes: _.inc(1), likedBy: _.push(openid) },
        });
      return { code: 0, liked: true, likes: answer.likes + 1 };
    }
  } catch (err) {
    return { code: -1, msg: "操作失败" };
  }
}

// 获取我的所有回答（用于回忆录素材选取）
async function listMyAnswers(event, wxContext) {
  const openid = wxContext.OPENID;

  try {
    const res = await db
      .collection("answers")
      .where({ authorId: openid })
      .orderBy("createdAt", "desc")
      .get();

    return { code: 0, answers: res.data };
  } catch (err) {
    return { code: -1, msg: "查询失败" };
  }
}

// 主入口路由
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();

  switch (event.type) {
    case "insertQuestion":
      return insertQuestion(event, wxContext);
    case "listQuestions":
      return listQuestions(event);
    case "getQuestion":
      return getQuestion(event);
    case "insertAnswer":
      return insertAnswer(event, wxContext);
    case "likeAnswer":
      return likeAnswer(event, wxContext);
    case "listMyAnswers":
      return listMyAnswers(event, wxContext);
    default:
      return { code: -1, msg: "未知操作类型" };
  }
};
