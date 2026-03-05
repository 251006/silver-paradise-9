# 银龄乐园（微信账号登录 + 云开发数据库）

## 已实现内容

- 小程序端登录：`wx.login` 获取临时凭证 code。
- 云函数鉴权：`cloud.getWXContext()` 获取当前微信用户 `OPENID`。
- 用户数据入库：在 `users` 集合保存并更新用户基础信息、登录次数、登录时间。


## 参考文档

- [微信小程序登录](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/login.html)
- [云开发文档](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/getting-started.html)

