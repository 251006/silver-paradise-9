# 用户头像和昵称实现说明

## 概述
根据WeChat小程序官方文档([userProfile API](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/userProfile.html))，实现了用户在注册登陆时选择头像和昵称的功能。

## 修改的文件

### 1. 前端页面修改 - `/miniprogram/pages/identity/index.*`

#### 修改内容：

**index.wxml** - 新增头像选择功能
```xml
<!-- 头像选择 -->
<view class="avatar-section">
  <text class="avatar-label">您的头像</text>
  <button class="avatar-wrapper" open-type="chooseAvatar" bindchooseavatar="onChooseAvatar">
    <image class="avatar-image" src="{{avatarUrl}}"></image>
  </button>
  <text class="avatar-hint">点击选择头像</text>
</view>

<!-- 昵称输入（使用WeChat原生昵称输入组件） -->
<input type="nickname" class="nickname-input" ... />
```

**index.js** - 新增头像处理逻辑
- `onChooseAvatar()` - 处理用户头像选择事件
- `uploadAvatarToCloud()` - 将头像上传到云存储
- 修改 `onEnter()` - 在提交前验证和上传头像
- 修改 `tryWechatLoginInCloud()` - 传递avatarUrl参数到云函数

**index.wxss** - 新增头像样式
- `.avatar-section` - 头像选择区域样式
- `.avatar-wrapper` - 头像按钮样式（圆形160rpx）
- `.avatar-image` - 头像图片样式

### 2. 云函数修改 - `/cloudfunctions/userFunctions/index.js`

#### 修改内容：

**buildUserDoc()** - 新增avatarUrl参数
```javascript
function buildUserDoc(wxContext, nickname, role, avatarUrl = "") {
  return {
    // ... 其他字段
    avatarUrl: avatarUrl || "",  // ← 新增
    // ...
  };
}
```

**upsertUser()** - 支持avatarUrl更新
```javascript
async function upsertUser(wxContext, nickname, role, avatarUrl = "") {
  // ... 
  const updateData = {
    nickname,
    role,
    // ...
    updatedAt: db.serverDate(),
  };

  // 如果提供了新的头像，也一起更新
  if (avatarUrl) {
    updateData.avatarUrl = avatarUrl;  // ← 新增
  }
  // ...
}
```

**register() 和 wechatLogin()** - 新增avatarUrl参数处理
```javascript
const avatarUrl = `${event.avatarUrl || ""}`.trim();
// 在调用upsertUser时传递avatarUrl参数
const user = await upsertUser(wxContext, nickname, role, avatarUrl);
```

## 功能流程

### 用户注册/登陆流程：

1. **进入身份选择页面** → `/pages/identity/index`
2. **选择身份** - 长辈/年轻人
3. **选择头像** - 点击圆形头像按钮
   - 触发 `bindchooseavatar` 事件
   - WeChat提供安全检测（基础库2.24.4+）
4. **输入昵称** - 使用原生昵称输入框
   - `<input type="nickname" />` 
5. **点击登陆按钮** - 触发 `onEnter()`
   - 验证身份、昵称、头像
   - 上传头像到云存储
   - 获取WeChat登陆凭证
   - 调用云函数进行微信登陆
6. **数据库存储** - 用户信息（包含avatarUrl）保存到users集合
7. **本地缓存** - userInfo和avatarUrl保存到localStorage

## 数据库字段

### users集合 - 新增/更新字段

| 字段名 | 类型 | 说明 |
|-------|------|------|
| avatarUrl | String | 用户头像，保存为云存储的fileID |

现有字段保持不变：
- _id (openid)
- openid
- appid
- unionid
- nickname
- role
- loginCount
- lastLoginAt
- createdAt
- updatedAt

## 云存储路径

头像保存路径：`user-avatars/{timestamp}-{randomStr}.jpg`

示例：`user-avatars/1234567890-abc123.jpg`

## 安全特性

1. **WeChat内置安全检测**
   - 基础库2.24.4+自动进行媒体检测
   - 未通过检测的头像不会触发chooseavatar事件

2. **昵称安全检测**
   - 基础库2.24.4+在onBlur时进行检测
   - 未通过检测的昵称会被自动清空

3. **前端验证**
   - 检验用户是否选择了头像
   - 检验昵称长度不超过12个字

## 后续集成建议

1. **个人资料页面** - 显示用户头像
   ```javascript
   const userInfo = wx.getStorageSync("userInfo");
   this.setData({ avatarUrl: userInfo.avatarUrl });
   ```

2. **用户列表/卡片** - 显示其他用户的头像
   ```javascript
   // 在获取用户信息时包含avatarUrl字段
   const user = await db.collection("users").doc(openid).get();
   console.log(user.data.avatarUrl); // 云存储fileID
   ```

3. **更新头像** - 在个人资料页添加修改头像功能
   - 重复头像选择流程
   - 上传新头像
   - 调用云函数更新数据库

## 测试清单

- [ ] 在真机上测试头像选择（必要，因为模拟器可能不支持）
- [ ] 验证头像成功上传到云存储
- [ ] 验证avatarUrl正确保存到数据库
- [ ] 测试昵称安全检测
- [ ] 测试登陆后userInfo中包含avatarUrl
- [ ] 测试用户再次登陆时头像正确显示

## API文档参考

- [WeChat userProfile API](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/userProfile.html)
- [button 组件 chooseAvatar](https://developers.weixin.qq.com/miniprogram/dev/component/button.html)
- [input 组件 nickname](https://developers.weixin.qq.com/miniprogram/dev/component/input.html)
- [wx.cloud.uploadFile](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/reference-client-api/upload/Cloud.uploadFile.html)
