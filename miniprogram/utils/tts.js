const audioConfig = require("./audioConfig");

let activeAudio = null;
const localFileCache = {};
const downloadingTasks = {};

function isConfiguredBaseUrl(baseUrl) {
	return !!baseUrl && !/static\.example\.com/.test(baseUrl);
}

function normalizeBaseUrl(baseUrl) {
	return `${baseUrl || ""}`.replace(/\/+$/, "");
}

function isCloudFileIdPath(baseUrl) {
	return /^cloud:\/\//.test(baseUrl || "");
}

function destroyActiveAudio() {
	if (!activeAudio) return;

	try {
		activeAudio.stop();
		activeAudio.destroy();
	} catch (err) {
		console.warn("语音播报资源释放失败", err);
	}

	activeAudio = null;
}

function getAudioContext() {
	if (activeAudio) return activeAudio;

	const audio = wx.createInnerAudioContext();
	audio.obeyMuteSwitch = false;
	audio.autoplay = false;
	audio.volume = 1;

	audio.onError((err) => {
		console.error("语音播报播放失败", err);
	});

	audio.onEnded(() => {
		// 单例播放器复用，不在结束时销毁
	});

	activeAudio = audio;
	return activeAudio;
}

function buildAudioSrc(fileName) {
	const baseUrl = normalizeBaseUrl(audioConfig.audioBaseUrl);
	if (!fileName || !isConfiguredBaseUrl(baseUrl)) {
		return "";
	}

	return `${baseUrl}/${fileName}`;
}

function doPlay(src) {
	if (!src) return false;
	console.log("语音播报准备播放", src);
	const audio = getAudioContext();
	audio.stop();
	audio.src = src;

	let played = false;
	const tryPlay = () => {
		if (played) return;
		played = true;
		console.log("语音播报调用 play()", src);
		audio.play();
	};

	audio.onCanplay(() => {
		setTimeout(tryPlay, 40);
	});

	// 兜底：某些机型不触发 onCanplay 时仍尝试播放
	setTimeout(tryPlay, 120);
	return true;
}

function getLocalFilePathByFileId(fileId) {
	if (localFileCache[fileId]) {
		return Promise.resolve(localFileCache[fileId]);
	}

	if (downloadingTasks[fileId]) {
		return downloadingTasks[fileId];
	}

	downloadingTasks[fileId] = new Promise((resolve, reject) => {
		wx.cloud.downloadFile({
			fileID: fileId,
			success: (res) => {
				if (!res || !res.tempFilePath) {
					reject(new Error("未下载到本地临时文件"));
					return;
				}

				localFileCache[fileId] = res.tempFilePath;
				resolve(res.tempFilePath);
			},
			fail: (err) => reject(err),
		});
	}).finally(() => {
		delete downloadingTasks[fileId];
	});

	return downloadingTasks[fileId];
}

function collectAllAudioFileNames() {
	const names = [];
	const navMap = audioConfig.navigationAudioMap || {};
	const actionMap = audioConfig.actionAudioMap || {};

	Object.keys(navMap).forEach((k) => {
		if (navMap[k]) names.push(navMap[k]);
	});

	Object.keys(actionMap).forEach((k) => {
		if (actionMap[k]) names.push(actionMap[k]);
	});

	return Array.from(new Set(names));
}

function preloadAudioAssets() {
	const baseUrl = normalizeBaseUrl(audioConfig.audioBaseUrl);
	if (!isConfiguredBaseUrl(baseUrl) || !isCloudFileIdPath(baseUrl)) {
		return Promise.resolve({ total: 0, success: 0, failed: 0 });
	}

	const fileNames = collectAllAudioFileNames();
	const fileIds = fileNames.map((name) => `${baseUrl}/${name}`);

	return Promise.allSettled(fileIds.map((fileId) => getLocalFilePathByFileId(fileId))).then((results) => {
		const success = results.filter((item) => item.status === "fulfilled").length;
		const failed = results.length - success;
		return { total: results.length, success, failed };
	});
}

function playAudioFile(fileName) {
	const srcOrFileId = buildAudioSrc(fileName);

	if (!srcOrFileId) {
		console.warn("语音播报未配置 audioBaseUrl，已跳过播放");
		return false;
	}

	if (!isCloudFileIdPath(srcOrFileId)) {
		return doPlay(srcOrFileId);
	}

	if (localFileCache[srcOrFileId]) {
		return doPlay(localFileCache[srcOrFileId]);
	}

	getLocalFilePathByFileId(srcOrFileId)
		.then((tempFilePath) => {
			doPlay(tempFilePath);
		})
		.catch((err) => {
			console.error("语音播报下载云文件失败", err);
			wx.showToast({ title: "语音资源加载失败", icon: "none" });
		});

	return true;
}

function playNavigationAudio(pagePath) {
	return playAudioFile((audioConfig.navigationAudioMap || {})[pagePath]);
}

function playCenterActionAudio(role) {
	if (role === "elder") {
		return playAudioFile((audioConfig.actionAudioMap || {}).elderCenterAction);
	}

	if (role === "young") {
		return playAudioFile((audioConfig.actionAudioMap || {}).youngCenterAction);
	}

	return false;
}

module.exports = {
	playNavigationAudio,
	playCenterActionAudio,
	preloadAudioAssets,
	destroyActiveAudio,
};
