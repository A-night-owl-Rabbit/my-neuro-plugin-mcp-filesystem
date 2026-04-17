# 文件系统工具插件

让 AI 助手可以读写文件、编辑文件、浏览目录、搜索文件等文件系统操作。基于 [MCP Filesystem Server](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem) 改造。

## 依赖（已放入本插件目录）

本插件目录内已包含 `package.json` 与 `node_modules`（当前内置 [minimatch](https://www.npmjs.com/package/minimatch) 5.x，供 glob 类匹配使用）。从 [GitHub 仓库](https://github.com/A-night-owl-Rabbit/my-neuro-plugin-mcp-filesystem) 克隆后一般**无需**再执行 `npm install`；若你自行删改过 `node_modules`，可在本目录执行 `npm install --omit=dev` 重新安装。

## 配置与编码

`plugin_config.json` 请保存为 **UTF-8（无 BOM）**。本插件在写入/读取配置时会自动去掉 UTF-8 BOM，避免部分环境下 `JSON.parse` 报错。若你使用 my-neuro **v643 及以上**且主程序已合并 `plugin-context` 的 BOM 修复，从 UI 保存的配置也更稳定。

## 快速开始

1. 在插件配置页面的「允许访问的目录」中填入目录路径（多个用逗号分隔）
2. 如需写操作，开启「启用写操作」
3. 启用插件即可

## 配置说明

| 配置项 | 说明 |
|--------|------|
| 允许访问的目录 | 必填，AI 只能在这些目录内操作，多个目录用英文逗号分隔 |
| 启用写操作 | 开启后 AI 可以创建/修改/移动文件，默认关闭 |
| 最大读取文件大小 | 单位 KB，超过此大小的文件拒绝读取，默认 512KB |
| 全局排除模式 | 搜索和目录树中默认排除的模式，如 node_modules,.git |

## 工具列表

### 读操作（始终可用）

| 工具名 | 说明 |
|--------|------|
| fs_read_text_file | 读取文件内容，支持 head/tail 只读前/后 N 行 |
| fs_read_multiple_files | 同时读取多个文件 |
| fs_list_directory | 列出目录内容 |
| fs_list_directory_with_sizes | 列出目录内容（含文件大小） |
| fs_directory_tree | 获取目录的递归树结构 |
| fs_search_files | 按 glob 模式搜索文件 |
| fs_get_file_info | 获取文件/目录元数据 |
| fs_list_allowed_directories | 列出允许访问的目录 |

### 写操作（需开启 enableWriteOperations）

| 工具名 | 说明 |
|--------|------|
| fs_write_file | 创建或覆盖文件 |
| fs_edit_file | 精确查找替换编辑，支持 dryRun 预览 |
| fs_create_directory | 创建目录（支持递归） |
| fs_move_file | 移动或重命名文件/目录 |

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
