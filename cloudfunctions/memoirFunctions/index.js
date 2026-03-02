// 回忆录管理云函数
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// LLM 配置 - 通过云函数环境变量注入
const LLM_API_URL = process.env.LLM_API_URL || "";
const LLM_API_KEY = process.env.LLM_API_KEY || "";

// 保存回忆录
async function saveMemoir(event, wxContext) {
  const { title, content, sourceRefs, isAIGenerated } = event;
  const openid = wxContext.OPENID;

  if (!content || content.trim().length === 0) {
    return { code: -1, msg: "回忆录内容不能为空" };
  }

  try {
    const res = await db.collection("memoirs").add({
      data: {
        authorId: openid,
        title: (title || "").trim() || "无标题回忆",
        content: content.trim(),
        sourceRefs: sourceRefs || [],
        isAIGenerated: !!isAIGenerated,
        createdAt: db.serverDate(),
      },
    });

    // 标记相关动态已加入回忆录
    if (sourceRefs && sourceRefs.length > 0) {
      for (const refId of sourceRefs) {
        // 只处理posts，因为answers在questions表中
        if (refId.startsWith("post_")) {
          try {
            await db
              .collection("posts")
              .doc(refId)
              .update({ data: { inMemoir: true } });
          } catch (e) {
            // 忽略错误，该post可能已被删除
          }
        }
      }
    }

    return { code: 0, memoirId: res._id };
  } catch (err) {
    console.error("saveMemoir error:", err);
    return { code: -1, msg: "保存失败" };
  }
}

// 查询回忆录列表
async function listMemoirs(event, wxContext) {
  const openid = wxContext.OPENID;

  try {
    const res = await db
      .collection("memoirs")
      .where({ authorId: openid })
      .orderBy("createdAt", "desc")
      .get();

    return { code: 0, memoirs: res.data };
  } catch (err) {
    return { code: -1, msg: "查询失败" };
  }
}

// 获取回忆录详情
async function getMemoir(event) {
  const { memoirId } = event;

  try {
    const res = await db.collection("memoirs").doc(memoirId).get();
    return { code: 0, memoir: res.data };
  } catch (err) {
    return { code: -1, msg: "回忆录不存在" };
  }
}

// AI 辅助生成回忆录
async function generateMemoir(event, wxContext) {
  const { sourceIds, sourceType } = event; // sourceType: 'posts' 或 'answers'
  const openid = wxContext.OPENID;

  if (!sourceIds || sourceIds.length === 0) {
    return { code: -1, msg: "请至少选择一条素材" };
  }

  if (!LLM_API_URL || !LLM_API_KEY) {
    return { code: -1, msg: "AI 写作功能尚未配置，请联系管理员" };
  }

  try {
    const contents = [];
    const validSourceIds = [];

    // 收集动态内容
    if (sourceType !== "answers") {
      for (const id of sourceIds) {
        try {
          const postRes = await db.collection("posts").doc(id).get();
          if (postRes.data) {
            contents.push(postRes.data.content);
            validSourceIds.push(id);
          }
        } catch (e) {
          // sourceId可能无效，跳过
        }
      }
    }

    // 收集回答内容（从questions的answers数组中）
    if (sourceType !== "posts") {
      const questionRes = await db.collection("questions").get();
      if (questionRes.data && questionRes.data.length > 0) {
        questionRes.data.forEach((question) => {
          if (question.answers && question.answers.length > 0) {
            question.answers.forEach((answer) => {
              if (sourceIds.includes(answer._id)) {
                contents.push(answer.content);
                validSourceIds.push(answer._id);
              }
            });
          }
        });
      }
    }

    if (contents.length === 0) {
      return { code: -1, msg: "未找到有效素材内容" };
    }

    // 构造 Prompt
    const materialList = contents.map((c) => `- ${c}`).join("\n");
    const prompt = `你是一个帮助老人书写人生回忆录的助手。以下是这位老人发布的一些日常生活片段：

${materialList}

请用温暖、朴实、第一人称的语气，将以上内容整理成一段连贯的回忆录段落，约 150-300 字。不要虚构原文中没有的信息。`;

    // 调用 LLM API（OpenAI 兼容格式）
    const https = require("https");
    const url = new (require("url").URL)(LLM_API_URL);

    const requestBody = JSON.stringify({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 800,
    });

    const result = await new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: url.hostname,
          port: url.port || 443,
          path: url.pathname,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${LLM_API_KEY}`,
          },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              const parsed = JSON.parse(data);
              resolve(parsed);
            } catch (e) {
              reject(new Error("LLM 响应解析失败"));
            }
          });
        }
      );
      req.on("error", reject);
      req.write(requestBody);
      req.end();
    });

    const generatedContent =
      result.choices &&
      result.choices[0] &&
      result.choices[0].message &&
      result.choices[0].message.content;

    if (!generatedContent) {
      return { code: -1, msg: "AI 生成失败，请重试" };
    }

    return { 
      code: 0, 
      content: generatedContent,
      sourceRefs: validSourceIds 
    };
  } catch (err) {
    console.error("generateMemoir error:", err);
    return { code: -1, msg: "AI 生成失败，请重试" };
  }
}

// 删除回忆录
async function deleteMemoir(event, wxContext) {
  const { memoirId } = event;
  const openid = wxContext.OPENID;

  try {
    // 验证是否为作者本人
    const memoirRes = await db.collection("memoirs").doc(memoirId).get();
    if (memoirRes.data.authorId !== openid) {
      return { code: -1, msg: "无权删除" };
    }

    await db.collection("memoirs").doc(memoirId).remove();
    return { code: 0, msg: "删除成功" };
  } catch (err) {
    return { code: -1, msg: "删除失败" };
  }
}

// 主入口路由
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();

  switch (event.type) {
    case "saveMemoir":
      return saveMemoir(event, wxContext);
    case "listMemoirs":
      return listMemoirs(event, wxContext);
    case "getMemoir":
      return getMemoir(event);
    case "generateMemoir":
      return generateMemoir(event, wxContext);
    case "deleteMemoir":
      return deleteMemoir(event, wxContext);
    default:
      return { code: -1, msg: "未知操作类型" };
  }
};
