# 文件系统工具（my-neuro 插件）

为 [my-neuro](https://github.com/search?q=my-neuro&type=repositories) 桌面 Live2D 项目提供的社区插件：让 AI 助手在**你明确允许的目录范围内**进行读/写文件、目录浏览、按 glob 搜索等操作。实现思路参考 [MCP Filesystem Server](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem)，并适配 my-neuro 的插件接口。

## 安装方式

1. 将本仓库克隆或下载到 my-neuro 的社区插件目录下，例如：  
   `live-2d/plugins/community/mcp-filesystem/`
2. 确保目录内包含：`metadata.json`、`index.js`、`plugin_config.json`（以及本说明 `README.md`）。
3. 在 my-neuro 的插件管理界面中启用「文件系统工具」。
4. 在插件配置中填写 **允许访问的目录**（必填，多个路径用英文逗号分隔）。未配置时插件不会注册任何工具，避免误操作全盘。

> 本仓库中的 `plugin_config.json` 仅包含配置项定义与默认值，**不含**个人机器上的路径。实际路径请在客户端配置界面填写，勿将含隐私路径的配置提交到公开仓库。

## 依赖说明

- 插件运行环境需能解析 `index.js` 顶部的 `require('../../../js/core/plugin-base.js')`，因此须放在 my-neuro 官方目录结构中（与参考仓库 [my-neuro-plugin-astrbook](https://github.com/A-night-owl-Rabbit/my-neuro-plugin-astrbook) 相同用法）。
- 若项目已提供 `minimatch` 依赖，glob 类排除/匹配效果更好；未安装时插件会降级处理部分模式。

## 配置项说明

| 配置项 | 说明 |
|--------|------|
| 允许访问的目录 | 必填。仅允许操作这些目录（及其实路径解析结果）下的文件；多个目录用英文逗号分隔。支持 `~` 表示用户主目录。 |
| 启用写操作 | 关闭时仅提供读类工具；开启后可写入、编辑、创建目录、移动文件，请谨慎使用。 |
| 最大读取文件大小（KB） | 单次读取上限，防止过大文件占满上下文。 |
| 全局排除模式 | 目录树与搜索时默认排除的 glob/名称片段，逗号分隔，例如 `node_modules,.git`。 |

## 提供的工具（概要）

**读操作（在已配置允许目录且不要求写开关时可用）**

- `fs_read_text_file` — 读文本文件，支持 `head` / `tail` 行数限制  
- `fs_read_multiple_files` — 批量读取  
- `fs_list_directory` / `fs_list_directory_with_sizes` — 列目录（可选含大小、排序）  
- `fs_directory_tree` — 递归目录树（JSON）  
- `fs_search_files` — 按 glob 递归搜索  
- `fs_get_file_info` — 文件/目录元数据  
- `fs_list_allowed_directories` — 列出当前允许的根目录  

**写操作（需在配置中开启「启用写操作」）**

- `fs_write_file`、`fs_edit_file`（支持 `dryRun`）、`fs_create_directory`、`fs_move_file`  

## 安全提示

- 所有路径都会校验是否落在允许的目录内，并对符号链接目标做范围检查。  
- 写操作默认关闭；仅在确有需要时开启。  
- 建议将允许范围缩到最小必要目录，并为敏感资料单独使用排除规则或不在允许列表中包含。  

## 开源与致谢

- 文件操作与安全边界设计参考 Model Context Protocol 的 Filesystem 服务思路。  
- 插件形态与发布方式参考社区插件 [my-neuro-plugin-astrbook](https://github.com/A-night-owl-Rabbit/my-neuro-plugin-astrbook)。  

## 许可证

若上游 my-neuro 或你所使用的发行版对插件有额外许可要求，请一并遵守。本仓库代码来自社区插件目录，使用时请自行评估风险与合规性。
