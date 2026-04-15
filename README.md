# 文件系统工具（my-neuro 插件）

为 my-neuro 桌面 Live2D 项目提供的社区插件：让 AI 助手在**你明确允许的目录范围内**进行读/写文件、目录浏览、按 glob 搜索等。实现思路参考 [MCP Filesystem Server](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem)。

**GitHub：** https://github.com/A-night-owl-Rabbit/my-neuro-plugin-mcp-filesystem

## 依赖（已放入本插件目录）

仓库内包含 `package.json`、`package-lock.json` 与 `node_modules`（内置 [minimatch](https://www.npmjs.com/package/minimatch) 5.x）。克隆到 `live-2d/plugins/community/mcp-filesystem/` 后一般**无需**再执行 `npm install`。若你本地删改过依赖，可在该目录执行：

```bash
npm install --omit=dev
```

## 安装方式

1. 将本仓库放到 my-neuro 的社区插件目录，例如：`live-2d/plugins/community/mcp-filesystem/`
2. 确保存在 `metadata.json`、`index.js`、`plugin_config.json`（以及本说明与 `node_modules`）。
3. 在插件管理中启用「文件系统工具」。
4. 在配置中填写 **允许访问的目录**（必填，多个路径用英文逗号分隔）。

`index.js` 使用 `require('../../../js/core/plugin-base.js')`，须保持与官方工程相同的相对目录层级（与 [my-neuro-plugin-astrbook](https://github.com/A-night-owl-Rabbit/my-neuro-plugin-astrbook) 一致）。

> 仓库中的 `plugin_config.json` 仅为配置项定义与默认值，请在客户端界面填写真实路径，勿把含隐私路径的配置提交到公开仓库。

## 配置说明

| 配置项 | 说明 |
|--------|------|
| 允许访问的目录 | 必填。仅允许操作这些目录下的文件；多个目录用英文逗号分隔。支持 `~` 表示用户主目录。 |
| 启用写操作 | 关闭时仅读类工具；开启后可写入、编辑、建目录、移动文件。 |
| 最大读取文件大小（KB） | 单次读取上限。 |
| 全局排除模式 | 目录树与搜索时默认排除，如 `node_modules,.git`。 |

## 工具列表（概要）

**读操作：** `fs_read_text_file`、`fs_read_multiple_files`、`fs_list_directory`、`fs_list_directory_with_sizes`、`fs_directory_tree`、`fs_search_files`、`fs_get_file_info`、`fs_list_allowed_directories`

**写操作（需开启写操作）：** `fs_write_file`、`fs_edit_file`、`fs_create_directory`、`fs_move_file`

## 想邀请你，做这只小牛的“云饲养员”

做这个桌宠的初衷，其实是因为自己一个人工作学习的时候，总觉得屏幕里空落落的。看到大家都在使用，我就觉得熬夜写代码、调教AI的日子都亮闪闪的。🌟

不过，肥牛现在还在长身体（其实是我想给它做更多有趣的插件），养一只数字小牛其实也挺“费草”的哈哈。🌱

如果你在这只小肥牛这里获得过哪怕一秒钟的治愈，或者觉得它算个合格的桌面搭子，要不要考虑成为它的“云饲养员”呀？

你的每一次充电，都不是在打赏我，而是在给这只肥牛注入一点点魔法值。让它能变得更聪明、更通人性、能听懂你更多的碎碎念。

不用有压力哦！你愿意打开它，就是对我最大的鼓励啦。如果刚好有余力，就请肥牛喝瓶快乐水叭，它会记住你的味道的！🥤❤️

爱发电 https://ifdian.net/a/0923A

---

## 许可证

本项目采用 **CC BY-NC-SA 4.0** 许可证。
