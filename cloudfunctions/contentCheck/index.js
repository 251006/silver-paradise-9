// 内容安全审核云函数（三层风控：规则 + 微信安全 + LLM）
const cloud = require("wx-server-sdk");
const fetch = require("node-fetch");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const RULE_KEYWORDS = [
  { word: "转账", score: 22, category: "scam_transfer" },
  { word: "打款", score: 22, category: "scam_transfer" },
  { word: "保证金", score: 25, category: "scam_transfer" },
  { word: "验证码", score: 30, category: "identity_fraud" },
  { word: "银行卡号", score: 30, category: "identity_fraud" },
  { word: "内部消息", score: 25, category: "investment_fraud" },
  { word: "稳赚不赔", score: 35, category: "investment_fraud" },
  { word: "高额回报", score: 28, category: "investment_fraud" },
  { word: "刷单", score: 30, category: "scam_task" },
  { word: "返利", score: 18, category: "scam_task" },
  { word: "免费领", score: 18, category: "social_engineering" },
  { word: "点击链接", score: 20, category: "phishing" },
  { word: "加微信", score: 16, category: "off_platform_contact" },
  { word: "加qq", score: 16, category: "off_platform_contact" },
  { word: "公安", score: 10, category: "impersonation" },
  { word: "法院", score: 10, category: "impersonation" },
  { word: "社保", score: 10, category: "impersonation" },
  { word: "医保", score: 10, category: "impersonation" },
  { word: "保本高息", score: 35, category: "investment_fraud" },
  { word: "神药", score: 18, category: "medical_fraud" },
  { word: "包治", score: 25, category: "medical_fraud" },
];

const RULE_REGEX = [
  { regex: /1[3-9]\d{9}/g, score: 12, category: "off_platform_contact", signal: "phone_number" },
  { regex: /(wx|v|vx|微)[:：\s]?[a-zA-Z0-9_-]{5,}/gi, score: 16, category: "off_platform_contact", signal: "wechat_id" },
  { regex: /qq[:：\s]?[1-9][0-9]{4,11}/gi, score: 16, category: "off_platform_contact", signal: "qq_id" },
  { regex: /https?:\/\//gi, score: 14, category: "external_link", signal: "external_link" },
];

const DECISION_MSG = {
  pass: "内容检测通过",
  review: "内容存在风险提示，将带提示发布",
  reject: "内容疑似包含诈骗或有害信息，请修改后重试",
};

const DEFAULT_RISK_WARNING = "风险提示：该内容可能包含营销、误导或诈骗风险，请勿转账、点击陌生链接或泄露个人信息。";

const DEFAULT_LLM_BASE_URL = "https://ark.cn-beijing.volces.com/api/coding/v3";
const DEFAULT_LLM_MODEL = "doubao-seed-2.0-lite";

function normalizeText(content = "") {
  return `${content}`.trim().slice(0, 5000);
}

function normalizeImages(images = [], mediaUrl = "") {
  if (Array.isArray(images) && images.length > 0) {
    return images.filter(Boolean);
  }
  if (mediaUrl) return [mediaUrl];
  return [];
}

function mergeUnique(list = []) {
  return [...new Set(list.filter(Boolean))];
}

function summarizeText(text = "", maxLen = 400) {
  const normalized = `${text || ""}`.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.length > maxLen ? `${normalized.slice(0, maxLen)}...` : normalized;
}

function resolveLLMEndpoint(apiUrl = "") {
  const trimmed = `${apiUrl}`.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  return `${trimmed}/chat/completions`;
}

function buildResult(payload = {}) {
  const decision = payload.decision || "pass";
  return {
    code: 0,
    safe: decision === "pass",
    decision,
    riskScore: Math.max(0, Math.min(100, Number(payload.riskScore || 0))),
    category: payload.category || "normal",
    reasons: payload.reasons || [],
    hitRules: payload.hitRules || [],
    layerStatus: payload.layerStatus || {},
    riskWarning: payload.riskWarning || (decision === "review" ? DEFAULT_RISK_WARNING : ""),
    msg: payload.msg || DECISION_MSG[decision] || DECISION_MSG.pass,
  };
}

function decideByScore({ score, hardReject = false, fallbackReview = false }) {
  if (hardReject) return "reject";
  if (fallbackReview) return "review";
  if (score >= 75) return "reject";
  if (score >= 45) return "review";
  return "pass";
}

function runRuleLayer(content = "") {
  const text = content.toLowerCase();
  const hitRules = [];
  const reasons = [];
  let score = 0;
  let category = "normal";

  for (const item of RULE_KEYWORDS) {
    if (text.includes(item.word.toLowerCase())) {
      score += item.score;
      hitRules.push(`kw:${item.word}`);
      reasons.push(`命中关键词：${item.word}`);
      if (category === "normal") category = item.category;
    }
  }

  for (const rule of RULE_REGEX) {
    const matches = content.match(rule.regex);
    if (matches && matches.length > 0) {
      score += rule.score;
      hitRules.push(`regex:${rule.signal}`);
      reasons.push(`命中规则：${rule.signal}`);
      if (category === "normal") category = rule.category;
    }
  }

  return {
    score: Math.min(100, score),
    hitRules: mergeUnique(hitRules),
    reasons: mergeUnique(reasons),
    category,
    hardReject: score >= 85,
  };
}

function getContentTypeByPath(path = "") {
  const lower = path.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/png";
}

async function downloadImageBuffer(source = "") {
  if (!source) return null;

  if (source.startsWith("cloud://")) {
    const res = await cloud.downloadFile({ fileID: source });
    return Buffer.isBuffer(res.fileContent) ? res.fileContent : Buffer.from(res.fileContent);
  }

  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`download image failed: ${response.status}`);
  }
  const arrBuffer = await response.arrayBuffer();
  return Buffer.from(arrBuffer);
}

async function runWechatLayer({ content, images }) {
  const reasons = [];
  const hitRules = [];
  let score = 0;
  let hardReject = false;
  let fallbackReview = false;

  const tasks = [];

  if (content) {
    tasks.push((async () => {
      try {
        const textRes = await cloud.openapi.security.msgSecCheck({ content });
        if (textRes.errCode !== 0) {
          score = Math.max(score, 95);
          hardReject = true;
          reasons.push("微信文本安全检测未通过");
          hitRules.push("wechat:msg_sec_blocked");
        }
      } catch (err) {
        console.error("msgSecCheck error:", err);
        fallbackReview = true;
        score = Math.max(score, 55);
        reasons.push("微信文本安全检测异常，已转人工审核");
        hitRules.push("wechat:msg_sec_error");
      }
    })());
  }

  images.forEach((image) => {
    tasks.push((async () => {
      try {
        const buffer = await downloadImageBuffer(image);
        if (!buffer) return;
        const imgRes = await cloud.openapi.security.imgSecCheck({
          media: {
            contentType: getContentTypeByPath(image),
            value: buffer,
          },
        });
        if (imgRes.errCode !== 0) {
          score = Math.max(score, 95);
          hardReject = true;
          reasons.push("微信图片安全检测未通过");
          hitRules.push("wechat:img_sec_blocked");
        }
      } catch (err) {
        console.error("imgSecCheck error:", err);
        fallbackReview = true;
        score = Math.max(score, 55);
        reasons.push("微信图片安全检测异常，已转人工审核");
        hitRules.push("wechat:img_sec_error");
      }
    })());
  });

  if (tasks.length > 0) {
    await Promise.all(tasks);
  }

  return {
    score,
    category: hardReject ? "platform_violation" : "normal",
    reasons: mergeUnique(reasons),
    hitRules: mergeUnique(hitRules),
    hardReject,
    fallbackReview,
  };
}

function extractJsonObject(text = "") {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch (err) {
    return null;
  }
}

async function parseErrorResponse(response) {
  try {
    const text = await response.text();
    return text ? text.slice(0, 500) : "";
  } catch (err) {
    return "";
  }
}

async function runLLMLayer({ content, scene = "generic", userId = "" }) {
  const apiUrl = process.env.LLM_API_URL || DEFAULT_LLM_BASE_URL;
  const apiKey = process.env.LLM_API_KEY || "";
  const model = process.env.LLM_MODEL || DEFAULT_LLM_MODEL;
  const timeoutMs = Number(process.env.LLM_TIMEOUT_MS || 1800);
  const endpoint = resolveLLMEndpoint(apiUrl);

  if (!endpoint || !apiKey || !content) {
    return {
      score: 0,
      category: "normal",
      reasons: [],
      hitRules: ["llm:skipped"],
      fallbackReview: !content ? false : false,
      available: false,
      summary: endpoint && !content ? "llm skipped: empty content" : "llm skipped: missing endpoint or api key",
    };
  }

  try {
    const prompt = [
      "你是老年人社区的内容风控模型。请只返回JSON，不要返回其他文字。",
      "请判断以下内容是否涉及诈骗、诱导转账、冒充权威、医疗欺诈、导流私聊等风险。",
      "输出字段：riskScore(0-100), category, decision(pass|review|reject), reasons(字符串数组)。",
      `场景: ${scene}`,
      `用户: ${userId || "unknown"}`,
      `内容: ${content}`,
    ].join("\n");

    const requestBody = JSON.stringify({
      model,
      messages: [
        { role: "system", content: "你是内容风控助手，请输出可解析JSON" },
        { role: "user", content: prompt },
      ],
      temperature: 0,
    });

    const response = await Promise.race([
      fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: requestBody,
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("LLM request timeout")), timeoutMs)
      ),
    ]);

    if (!response.ok) {
      const errorBody = await parseErrorResponse(response);
      throw new Error(`LLM response status: ${response.status}${errorBody ? `, body: ${errorBody}` : ""}`);
    }

    const data = await response.json();
    const raw = (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "{}";
    const parsed = typeof raw === "string" ? (extractJsonObject(raw) || {}) : raw;
    const rawSummary = summarizeText(typeof raw === "string" ? raw : JSON.stringify(raw));

    const score = Math.max(0, Math.min(100, Number(parsed.riskScore || 0)));
    const decision = ["pass", "review", "reject"].includes(parsed.decision) ? parsed.decision : decideByScore({ score });
    const fallbackReview = decision === "review" && score < 45;

    return {
      score,
      category: parsed.category || "normal",
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons.slice(0, 6) : [],
      hitRules: ["llm:enabled"],
      hardReject: decision === "reject",
      fallbackReview,
      available: true,
      summary: rawSummary || "llm returned empty content",
    };
  } catch (err) {
    console.error("LLM check error:", err);
    return {
      score: 55,
      category: "unknown",
      reasons: ["AI语义检测异常，已转人工审核"],
      hitRules: ["llm:error"],
      fallbackReview: true,
      available: true,
      summary: summarizeText(err && err.message ? err.message : "llm error"),
    };
  }
}

async function writeAuditLog({ scene, textLength, imageCount, userId, result, layers }) {
  try {
    await db.collection("content_audit_logs").add({
      data: {
        scene,
        textLength,
        imageCount,
        userId,
        decision: result.decision,
        riskScore: result.riskScore,
        category: result.category,
        reasons: result.reasons,
        hitRules: result.hitRules,
        llmSummary: (layers.llmLayer && layers.llmLayer.summary) || "",
        layerStatus: result.layerStatus,
        ruleLayer: layers.ruleLayer,
        wechatLayer: layers.wechatLayer,
        llmLayer: layers.llmLayer,
        createdAt: db.serverDate(),
      },
    });

    if (result.decision === "review") {
      await db.collection("content_review_queue").add({
        data: {
          scene,
          userId,
          status: "pending",
          riskScore: result.riskScore,
          category: result.category,
          reasons: result.reasons,
          hitRules: result.hitRules,
          createdAt: db.serverDate(),
          updatedAt: db.serverDate(),
        },
      });
    }
  } catch (err) {
    console.error("write audit log error:", err);
  }
}

async function checkContent(event = {}, wxContext = {}) {
  const scene = event.scene || "generic";
  const content = normalizeText(event.content || event.text || "");
  const images = normalizeImages(event.images, event.mediaUrl);
  const userId = event.userId || wxContext.OPENID || "";

  if (!content && images.length === 0) {
    return buildResult({
      decision: "pass",
      riskScore: 0,
      category: "normal",
      reasons: [],
      hitRules: [],
      layerStatus: { rule: "skipped", wechat: "skipped", llm: "skipped" },
      msg: DECISION_MSG.pass,
    });
  }

  const ruleLayer = runRuleLayer(content);
  const [wechatLayer, llmLayer] = await Promise.all([
    runWechatLayer({ content, images }),
    runLLMLayer({ content, scene, userId }),
  ]);

  const riskScore = Math.min(
    100,
    Math.max(ruleLayer.score, wechatLayer.score, llmLayer.score, Math.round(ruleLayer.score * 0.4 + llmLayer.score * 0.6))
  );

  const hardReject = Boolean(ruleLayer.hardReject || wechatLayer.hardReject || llmLayer.hardReject);
  const fallbackReview = Boolean(wechatLayer.fallbackReview || llmLayer.fallbackReview);
  const decision = decideByScore({ score: riskScore, hardReject, fallbackReview });

  const category =
    (wechatLayer.category && wechatLayer.category !== "normal" && wechatLayer.category) ||
    (llmLayer.category && llmLayer.category !== "normal" && llmLayer.category) ||
    ruleLayer.category ||
    "normal";

  const result = buildResult({
    decision,
    riskScore,
    category,
    reasons: mergeUnique([...ruleLayer.reasons, ...wechatLayer.reasons, ...llmLayer.reasons]),
    hitRules: mergeUnique([...ruleLayer.hitRules, ...wechatLayer.hitRules, ...llmLayer.hitRules]),
    riskWarning: decision === "review"
      ? llmLayer.reasons[0] || ruleLayer.reasons[0] || DEFAULT_RISK_WARNING
      : "",
    layerStatus: {
      rule: "done",
      wechat: wechatLayer.fallbackReview ? "error->review" : "done",
      llm: llmLayer.available ? (llmLayer.fallbackReview ? "error->review" : "done") : "skipped",
    },
    msg: DECISION_MSG[decision],
  });

  await writeAuditLog({
    scene,
    textLength: content.length,
    imageCount: images.length,
    userId,
    result,
    layers: { ruleLayer, wechatLayer, llmLayer },
  });

  return result;
}

// 兼容旧接口
async function checkText(event, wxContext) {
  return checkContent({ ...event, scene: event.scene || "text" }, wxContext);
}

// 兼容旧接口
async function checkImage(event, wxContext) {
  return checkContent(
    {
      ...event,
      scene: event.scene || "image",
      images: event.images || (event.mediaUrl ? [event.mediaUrl] : []),
      content: event.content || "",
    },
    wxContext
  );
}

// 主入口路由
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  switch (event.type) {
    case "checkContent":
      return checkContent(event, wxContext);
    case "checkText":
      return checkText(event, wxContext);
    case "checkImage":
      return checkImage(event, wxContext);
    default:
      return { code: -1, msg: "未知操作类型" };
  }
};
