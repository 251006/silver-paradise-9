# 离线语音播报接入说明

## 1. 生成语音文件

在项目根目录执行：

```powershell
npm run generate:audio
```

生成结果会输出到 `scripts/generated-audio/`，默认生成以下文件：

- `home.wav`
- `news.wav`
- `community.wav`
- `profile.wav`
- `publish-post.wav`
- `ask-question.wav`

如果要查看当前 Windows 可用语音：

```powershell
npm run generate:audio:list-voices
```

如果要指定音色或语速，可直接执行：

```powershell
powershell -ExecutionPolicy Bypass -File ./scripts/generate-audio.ps1 -VoiceName "Microsoft Huihui Desktop" -Rate -1
```

## 2. 上传到服务器

把 `scripts/generated-audio/` 里的 `.wav` 文件上传到你自己的静态资源目录，例如：

```text
https://your-domain.com/silver-paradise/audio/home.wav
https://your-domain.com/silver-paradise/audio/news.wav
```

## 3. 配置小程序播放地址

修改 `miniprogram/utils/audioConfig.js` 中的 `audioBaseUrl`：

```js
audioBaseUrl: "https://your-domain.com/silver-paradise/audio"
```

## 4. 当前已接入的播报场景

- 点击底部 Tab：首页、资讯、社区、我的
- 点击首页功能入口卡片
- 点击中间主操作按钮：发布动态 / 发起提问

## 5. 说明

- 当前使用 `wav`，避免额外依赖，适合先离线生成再上传。
- 小程序端通过 `wx.createInnerAudioContext` 播放远程静态音频。
- 需要把你的静态资源域名加入小程序合法 request / download / media 域名白名单。