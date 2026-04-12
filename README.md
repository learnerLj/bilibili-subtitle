# Bilibili 字幕复制器

> # 本项目已停止维护
> 请直接使用 `bilibiliCCHelper`：
> https://github.com/indefined/UserScripts/tree/master/bilibiliCCHelper

一个简单易用的浏览器脚本，用于在哔哩哔哩(Bilibili)视频页面左侧提供一键复制字幕按钮。点击左侧按钮后，脚本会直接按当前页面的 `aid/bvid/cid` 请求 B 站字幕接口，默认优先中文轨，并复制不带时间戳的纯文本结果。

参考实现：
https://github.com/indefined/UserScripts/tree/master/bilibiliCCHelper

https://github.com/learnerLj/bilibili-subtitle

## 功能特点

- 在Bilibili视频页面左侧添加半透明粉色"复制字幕"按钮
- 点击一次左侧按钮即可直接复制字幕
- 直接按当前页面的视频标识读取字幕接口
- 参考 `bilibiliCCHelper` 的字幕获取思路
- 默认优先复制中文字幕
- 输出纯文本字幕，不带时间戳，适合喂给大模型
- 简单易用，一键操作
- 下载过程中显示状态反馈
- 贴合B站界面风格的设计

## 安装方法

1. 首先安装用户脚本管理器（如 [Tampermonkey](https://www.tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/)）
2. 安装本仓库的脚本
3. 访问任意Bilibili视频页面，脚本将自动激活

## 使用方法

1. 打开任意带有字幕的Bilibili视频
2. 在视频页面左侧中央位置找到粉色"复制字幕"按钮
3. 点击按钮后，脚本会读取当前页面的视频标识并直接请求对应字幕
4. 成功时会在按钮旁边显示复制结果提示
5. 复制完成后，可以将字幕粘贴到任意文本编辑器中保存

## 界面特点

- 按钮位于视频页面左侧中央位置
- B站粉色半透明设计，不干扰视频观看
- 点击时显示复制中状态，提供清晰的操作反馈
- 成功提示显示在按钮旁边，不遮挡视频内容

## 注意事项

- 该脚本需要视频包含字幕才能正常工作
- 该脚本依赖用户脚本管理器，以及 Bilibili 当前页面可访问的字幕接口
- 如果你在同一个标签页里来回切换视频，这版脚本仍会按当前页的 `aid/bvid/cid` 重新取字幕，不会复用上一条视频的缓存结果
- 如果视频本身没有字幕轨，本脚本会直接报错
- 默认优先选择中文轨；如果没有中文轨，会退回到其他可用字幕轨
- 复制内容固定为纯文本，不带时间轴

## 技术要求

- 支持用户脚本的现代浏览器（Chrome、Firefox、Edge等）
- 已安装Tampermonkey或类似的用户脚本管理器

## 许可证

本项目采用MIT许可证。详情请参阅脚本文件中的许可证信息。 
