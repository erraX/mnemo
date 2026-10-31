# Spike 结果

设备 / iOS 版本：
测试地址：https://errax.github.io/mnemo/#/spike/audio 与 #/spike/tts

## Spike 1 · 有道音频离线缓存（规范 5.7）

- [ ] 联网预热后「检查缓存」命中
- [ ] 飞行模式 + 杀掉重开后「播放」出声
- 日志摘录：

结论：方案 A 可行 / 不可行 → 切方案 B（Cloudflare Worker 反代 + IndexedDB Blob）

## Spike 2 · 系统 TTS

- 英文语音列表：
- 铃声模式出声：是 / 否
- 静音拨片出声：是 / 否
- 主屏 PWA 下首次点击能出声：是 / 否

结论与 README 需要写的已知限制：

## Spike 3 · 词典灌库（Task 13 完成后在今日页读取耗时）

- 条目数：
- 耗时（iPhone）：
- 结论：一次性 bulkPut 够用 / 需要分片后台灌入
