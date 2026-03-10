// 内容安全审核云函数
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 本地敏感词库（诈骗关键词 + 不文明用语）
const SENSITIVE_WORDS = [
  "中奖", "领奖", "汇款", "转账", "银行卡号", "验证码",
  "刷单", "返利", "免费领", "贷款", "高额回报", "投资理财",
  "内部消息", "稳赚不赔", "日赚", "点击链接", "加QQ", "加微信",
];

// 检查文本内容安全
async function checkText(event) {
  const { content } = event;

  if (!content || content.trim().length === 0) {
    return { code: 0, safe: true };
  }

  // 1. 本地敏感词检测
  const lowerContent = content.toLowerCase();
  for (const word of SENSITIVE_WORDS) {
    if (lowerContent.includes(word.toLowerCase())) {
      return {
        code: 0,
        safe: false,
        msg: `内容包含敏感词"${word}"，请修改后重新发布`,
      };
    }
  }

  // 2. 微信官方内容安全检测 (msgSecCheck)
  try {
    const res = await cloud.openapi.security.msgSecCheck({
      content: content,
    });

    if (res.errCode === 0) {
      return { code: 0, safe: true };
    } else {
      return {
        code: 0,
        safe: false,
        msg: "内容包含不当信息，请修改后重新发布",
      };
    }
  } catch (err) {
    console.error("msgSecCheck error:", err);
    // 如果接口出错，降级为仅使用本地检测（已通过）
    return { code: 0, safe: true };
  }
}

// 检查图片内容安全
async function checkImage(event) {
  const { mediaUrl } = event;

  if (!mediaUrl) {
    return { code: 0, safe: true };
  }

  try {
    // 调用微信官方图片内容安全检测
    const res = await cloud.openapi.security.imgSecCheck({
      media: {
        contentType: 'image/png',
        value: Buffer.from(await (await fetch(mediaUrl)).arrayBuffer())
      }
    });

    if (res.errCode === 0) {
      return { code: 0, safe: true };
    } else {
      return {
        code: 0,
        safe: false,
        msg: "图片包含不当内容，请重新选择",
      };
    }
  } catch (err) {
    console.error("imgSecCheck error:", err);
    // 如果接口出错，降级为允许通过
    return { code: 0, safe: true };
  }
}

// 主入口路由
exports.main = async (event, context) => {
  switch (event.type) {
    case "checkText":
      return checkText(event);
    case "checkImage":
      return checkImage(event);
    default:
      return { code: -1, msg: "未知操作类型" };
  }
};
