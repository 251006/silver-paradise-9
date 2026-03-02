# 银龄乐园（微信账号登录 + 云开发数据库）

## 已实现内容

- 小程序端登录：`wx.login` 获取临时凭证 code。
- 云函数鉴权：`cloud.getWXContext()` 获取当前微信用户 `OPENID`。
- 用户数据入库：在 `users` 集合保存并更新用户基础信息、登录次数、登录时间。

## 你需要在云开发平台做的数据库配置

### 1) 创建集合

在云开发控制台 -> 数据库，新建集合：`users`

### 2) 配置集合权限规则（语句）

在 `users` 集合权限规则中使用以下 JSON：

```json
{
	"read": "auth != null",
	"write": "auth != null"
}
```

> 说明：生产环境建议改成“仅创建者可读写”或全部由云函数写入。

### 3) 建议索引（在控制台索引页添加）

- `role`（升序）
- `updatedAt`（降序）
- `lastLoginAt`（降序）

## users 集合文档结构（语句示例）

以下是用户文档示例（`_id` 由微信 `openid` 作为主键）：

```json
{
	"_id": "oXXXXXXXXXXXX",
	"openid": "oXXXXXXXXXXXX",
	"appid": "wx1234567890",
	"unionid": "",
	"nickname": "张三",
	"role": "elder",
	"avatarUrl": "",
	"loginCount": 3,
	"lastLoginAt": "serverDate",
	"createdAt": "serverDate",
	"updatedAt": "serverDate"
}
```

## 参考文档

- [微信小程序登录](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/login.html)
- [云开发文档](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/getting-started.html)

