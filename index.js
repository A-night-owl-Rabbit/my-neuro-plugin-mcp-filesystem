const { Plugin } = require('../../../js/core/plugin-base.js');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const os = require('os');
const { randomBytes } = require('crypto');

let minimatch;
try {
    minimatch = require('minimatch').minimatch || require('minimatch');
} catch {
    minimatch = null;
}

const DEFAULT_CONFIG = {
    allowedDirectories: '',
    enableWriteOperations: false,
    maxFileSizeKB: 512,
    excludePatterns: 'node_modules,.git,.svn,__pycache__'
};

// ===== 工具定义（OpenAI function calling 格式）=====

const READ_TOOLS = [
    {
        type: 'function',
        function: {
            name: 'fs_read_text_file',
            description: '读取指定文件的文本内容。可通过 head/tail 参数只读取文件的前 N 行或后 N 行。仅限允许的目录范围内操作。',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: '文件的完整路径' },
                    head: { type: 'number', description: '（可选）只返回文件的前 N 行' },
                    tail: { type: 'number', description: '（可选）只返回文件的后 N 行' }
                },
                required: ['path']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'fs_read_multiple_files',
            description: '同时读取多个文件的内容。比逐个读取更高效，某个文件读取失败不会影响其他文件。仅限允许的目录范围内操作。',
            parameters: {
                type: 'object',
                properties: {
                    paths: {
                        type: 'array',
                        items: { type: 'string' },
                        description: '文件路径列表'
                    }
                },
                required: ['paths']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'fs_list_directory',
            description: '列出指定目录下的所有文件和子目录，使用 [FILE] 和 [DIR] 前缀区分。仅限允许的目录范围内操作。',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: '目录路径' }
                },
                required: ['path']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'fs_list_directory_with_sizes',
            description: '列出指定目录下的所有文件和子目录，包含文件大小信息，可按名称或大小排序。仅限允许的目录范围内操作。',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: '目录路径' },
                    sortBy: {
                        type: 'string',
                        enum: ['name', 'size'],
                        description: '排序方式：name（按名称）或 size（按大小），默认 name'
                    }
                },
                required: ['path']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'fs_directory_tree',
            description: '获取目录的递归 JSON 树结构，包含文件和子目录。每个条目含 name、type（file/directory）和 children。仅限允许的目录范围内操作。',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: '起始目录路径' },
                    excludePatterns: {
                        type: 'array',
                        items: { type: 'string' },
                        description: '（可选）要排除的 glob 模式列表，如 ["node_modules", "*.log"]'
                    }
                },
                required: ['path']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'fs_search_files',
            description: '在指定目录中递归搜索匹配 glob 模式的文件/目录。返回所有匹配项的完整路径。仅限允许的目录范围内操作。',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: '搜索的起始目录' },
                    pattern: { type: 'string', description: 'Glob 匹配模式，如 *.js、**/*.ts' },
                    excludePatterns: {
                        type: 'array',
                        items: { type: 'string' },
                        description: '（可选）要排除的模式列表'
                    }
                },
                required: ['path', 'pattern']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'fs_get_file_info',
            description: '获取文件或目录的详细元数据：大小、创建时间、修改时间、权限、类型等。仅限允许的目录范围内操作。',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: '文件或目录路径' }
                },
                required: ['path']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'fs_list_allowed_directories',
            description: '列出当前插件允许访问的所有目录。在执行文件操作前可先调用此工具了解可用范围。',
            parameters: {
                type: 'object',
                properties: {},
                required: []
            }
        }
    }
];

const WRITE_TOOLS = [
    {
        type: 'function',
        function: {
            name: 'fs_write_file',
            description: '创建新文件或完全覆盖已有文件。请谨慎使用，会直接覆盖已有内容。仅限允许的目录范围内操作。',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: '文件路径' },
                    content: { type: 'string', description: '文件内容' }
                },
                required: ['path', 'content']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'fs_edit_file',
            description: '对文本文件进行精确的查找替换编辑。支持多处同时编辑，保留缩进，返回 diff 格式的变更预览。可先用 dryRun 预览再正式应用。仅限允许的目录范围内操作。',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: '要编辑的文件路径' },
                    edits: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                oldText: { type: 'string', description: '要查找的原文本，必须精确匹配' },
                                newText: { type: 'string', description: '替换后的新文本' }
                            },
                            required: ['oldText', 'newText']
                        },
                        description: '编辑操作列表'
                    },
                    dryRun: { type: 'boolean', description: '为 true 时只预览变更不实际修改，默认 false' }
                },
                required: ['path', 'edits']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'fs_create_directory',
            description: '创建目录，支持递归创建多层目录。目录已存在则静默成功。仅限允许的目录范围内操作。',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: '要创建的目录路径' }
                },
                required: ['path']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'fs_move_file',
            description: '移动或重命名文件/目录。目标路径已存在时操作会失败。源和目标都必须在允许的目录范围内。',
            parameters: {
                type: 'object',
                properties: {
                    source: { type: 'string', description: '源路径' },
                    destination: { type: 'string', description: '目标路径' }
                },
                required: ['source', 'destination']
            }
        }
    }
];

// ===== 插件主类 =====

class McpFilesystemPlugin extends Plugin {
    constructor(metadata, context) {
        super(metadata, context);
        this._config = { ...DEFAULT_CONFIG };
        this._allowedDirectories = [];
        this._globalExcludePatterns = [];
    }

    async onInit() {
        this._loadConfig();
    }

    async onStop() {}

    // ===== 配置管理 =====

    _loadConfig() {
        try {
            const cfg = this.context.getPluginConfig() || {};
            this._config = { ...DEFAULT_CONFIG, ...cfg };
        } catch (e) {
            this._config = { ...DEFAULT_CONFIG };
        }
        this._parseAllowedDirectories();
        this._parseExcludePatterns();
    }

    _parseAllowedDirectories() {
        const raw = this._config.allowedDirectories || '';
        const dirs = raw.split(',')
            .map(d => d.trim())
            .filter(Boolean);

        this._allowedDirectories = [];
        for (const dir of dirs) {
            const expanded = this._expandHome(dir);
            const absolute = path.resolve(expanded);
            const normalized = this._normalizePath(absolute);
            try {
                const stats = fsSync.statSync(normalized);
                if (stats.isDirectory()) {
                    this._allowedDirectories.push(normalized);
                    try {
                        const real = fsSync.realpathSync(normalized);
                        const normalizedReal = this._normalizePath(real);
                        if (normalizedReal !== normalized) {
                            this._allowedDirectories.push(normalizedReal);
                        }
                    } catch {}
                }
            } catch {}
        }
    }

    _parseExcludePatterns() {
        const raw = this._config.excludePatterns || '';
        this._globalExcludePatterns = raw.split(',')
            .map(p => p.trim())
            .filter(Boolean);
    }

    _saveConfig() {
        const cfgPath = path.join(this.context._pluginDir || '', 'plugin_config.json');
        if (!fsSync.existsSync(cfgPath)) return;
        try {
            const raw = JSON.parse(fsSync.readFileSync(cfgPath, 'utf-8'));
            for (const [key, val] of Object.entries(this._config)) {
                if (raw[key] && typeof raw[key] === 'object' && 'type' in raw[key]) {
                    raw[key].value = val;
                } else {
                    raw[key] = val;
                }
            }
            fsSync.writeFileSync(cfgPath, JSON.stringify(raw, null, 2), 'utf-8');
        } catch {}
    }

    // ===== 工具注册 =====

    getTools() {
        if (this._allowedDirectories.length === 0) return [];
        if (this._config.enableWriteOperations) {
            return [...READ_TOOLS, ...WRITE_TOOLS];
        }
        return [...READ_TOOLS];
    }

    // ===== 工具执行 =====

    async executeTool(name, params) {
        this._loadConfig();
        if (this._allowedDirectories.length === 0) {
            return '错误：未配置允许访问的目录，请在插件配置中设置 allowedDirectories';
        }
        try {
            switch (name) {
                case 'fs_read_text_file':
                    return await this._toolReadTextFile(params);
                case 'fs_read_multiple_files':
                    return await this._toolReadMultipleFiles(params);
                case 'fs_list_directory':
                    return await this._toolListDirectory(params);
                case 'fs_list_directory_with_sizes':
                    return await this._toolListDirectoryWithSizes(params);
                case 'fs_directory_tree':
                    return await this._toolDirectoryTree(params);
                case 'fs_search_files':
                    return await this._toolSearchFiles(params);
                case 'fs_get_file_info':
                    return await this._toolGetFileInfo(params);
                case 'fs_list_allowed_directories':
                    return await this._toolListAllowedDirectories();
                case 'fs_write_file':
                    return await this._toolWriteFile(params);
                case 'fs_edit_file':
                    return await this._toolEditFile(params);
                case 'fs_create_directory':
                    return await this._toolCreateDirectory(params);
                case 'fs_move_file':
                    return await this._toolMoveFile(params);
                default:
                    return `未知工具: ${name}`;
            }
        } catch (err) {
            return `操作失败: ${err.message}`;
        }
    }

    // ===== 工具实现 =====

    async _toolReadTextFile(params) {
        const { head, tail } = params;
        if (head && tail) {
            return '错误：不能同时指定 head 和 tail 参数';
        }
        const validPath = await this._validatePath(params.path);
        await this._checkFileSize(validPath);
        let content;
        if (tail) {
            content = await this._tailFile(validPath, tail);
        } else if (head) {
            content = await this._headFile(validPath, head);
        } else {
            content = await this._readFileContent(validPath);
        }
        return content;
    }

    async _toolReadMultipleFiles(params) {
        const paths = params.paths || [];
        if (paths.length === 0) return '错误：至少需要提供一个文件路径';
        const results = await Promise.all(
            paths.map(async (filePath) => {
                try {
                    const validPath = await this._validatePath(filePath);
                    await this._checkFileSize(validPath);
                    const content = await this._readFileContent(validPath);
                    return `${filePath}:\n${content}`;
                } catch (err) {
                    return `${filePath}: 错误 - ${err.message}`;
                }
            })
        );
        return results.join('\n---\n');
    }

    async _toolListDirectory(params) {
        const validPath = await this._validatePath(params.path);
        const entries = await fs.readdir(validPath, { withFileTypes: true });
        return entries
            .map(e => `${e.isDirectory() ? '[DIR]' : '[FILE]'} ${e.name}`)
            .join('\n') || '（空目录）';
    }

    async _toolListDirectoryWithSizes(params) {
        const validPath = await this._validatePath(params.path);
        const sortBy = params.sortBy || 'name';
        const entries = await fs.readdir(validPath, { withFileTypes: true });

        const detailed = await Promise.all(
            entries.map(async (entry) => {
                const entryPath = path.join(validPath, entry.name);
                try {
                    const stats = await fs.stat(entryPath);
                    return { name: entry.name, isDir: entry.isDirectory(), size: stats.size };
                } catch {
                    return { name: entry.name, isDir: entry.isDirectory(), size: 0 };
                }
            })
        );

        const sorted = [...detailed].sort((a, b) => {
            if (sortBy === 'size') return b.size - a.size;
            return a.name.localeCompare(b.name);
        });

        const lines = sorted.map(e =>
            `${e.isDir ? '[DIR]' : '[FILE]'} ${e.name.padEnd(30)} ${e.isDir ? '' : this._formatSize(e.size).padStart(10)}`
        );

        const totalFiles = detailed.filter(e => !e.isDir).length;
        const totalDirs = detailed.filter(e => e.isDir).length;
        const totalSize = detailed.reduce((sum, e) => sum + (e.isDir ? 0 : e.size), 0);

        lines.push('', `合计: ${totalFiles} 个文件, ${totalDirs} 个目录`, `总大小: ${this._formatSize(totalSize)}`);
        return lines.join('\n');
    }

    async _toolDirectoryTree(params) {
        const rootPath = params.path;
        const userExcludes = params.excludePatterns || [];
        const excludes = [...this._globalExcludePatterns, ...userExcludes];

        const tree = await this._buildTree(rootPath, rootPath, excludes);
        return JSON.stringify(tree, null, 2);
    }

    async _toolSearchFiles(params) {
        const validPath = await this._validatePath(params.path);
        const pattern = params.pattern;
        const userExcludes = params.excludePatterns || [];
        const excludes = [...this._globalExcludePatterns, ...userExcludes];
        const results = await this._searchFiles(validPath, pattern, excludes);
        return results.length > 0 ? results.join('\n') : '未找到匹配项';
    }

    async _toolGetFileInfo(params) {
        const validPath = await this._validatePath(params.path);
        const stats = await fs.stat(validPath);
        const info = {
            '大小': this._formatSize(stats.size),
            '创建时间': stats.birthtime.toISOString(),
            '修改时间': stats.mtime.toISOString(),
            '访问时间': stats.atime.toISOString(),
            '类型': stats.isDirectory() ? '目录' : '文件',
            '权限': stats.mode.toString(8).slice(-3)
        };
        return Object.entries(info).map(([k, v]) => `${k}: ${v}`).join('\n');
    }

    async _toolListAllowedDirectories() {
        if (this._allowedDirectories.length === 0) {
            return '未配置允许访问的目录';
        }
        const unique = [...new Set(this._allowedDirectories)];
        return `允许访问的目录:\n${unique.join('\n')}`;
    }

    async _toolWriteFile(params) {
        this._ensureWriteEnabled();
        const validPath = await this._validatePath(params.path);
        await this._writeFileContent(validPath, params.content);
        return `成功写入文件: ${params.path}`;
    }

    async _toolEditFile(params) {
        this._ensureWriteEnabled();
        const validPath = await this._validatePath(params.path);
        const edits = params.edits || [];
        const dryRun = params.dryRun || false;
        if (edits.length === 0) return '错误：至少需要提供一个编辑操作';
        const result = await this._applyFileEdits(validPath, edits, dryRun);
        return result;
    }

    async _toolCreateDirectory(params) {
        this._ensureWriteEnabled();
        const validPath = await this._validatePath(params.path);
        await fs.mkdir(validPath, { recursive: true });
        return `成功创建目录: ${params.path}`;
    }

    async _toolMoveFile(params) {
        this._ensureWriteEnabled();
        const validSource = await this._validatePath(params.source);
        const validDest = await this._validatePath(params.destination);
        await fs.rename(validSource, validDest);
        return `成功移动: ${params.source} -> ${params.destination}`;
    }

    _ensureWriteEnabled() {
        if (!this._config.enableWriteOperations) {
            throw new Error('写操作未启用，请在插件配置中开启 enableWriteOperations');
        }
    }

    // ===== 路径工具（移植自 path-utils.ts）=====

    _expandHome(filepath) {
        if (filepath.startsWith('~/') || filepath === '~') {
            return path.join(os.homedir(), filepath.slice(1));
        }
        return filepath;
    }

    _normalizePath(p) {
        p = p.trim().replace(/^["']|["']$/g, '');

        if (p.match(/^[a-zA-Z]:/)) {
            p = p.replace(/\//g, '\\');
        }

        if (process.platform === 'win32' && /^[a-zA-Z]:$/.test(p)) {
            p = p + path.sep;
        }

        let normalized = path.normalize(p);

        if (normalized.match(/^[a-zA-Z]:/)) {
            let result = normalized.replace(/\//g, '\\');
            if (/^[a-z]:/.test(result)) {
                result = result.charAt(0).toUpperCase() + result.slice(1);
            }
            return result;
        }

        if (process.platform === 'win32') {
            return normalized.replace(/\//g, '\\');
        }

        return normalized;
    }

    // ===== 路径安全验证（移植自 path-validation.ts + lib.ts）=====

    _isPathAllowed(absolutePath) {
        if (!absolutePath || this._allowedDirectories.length === 0) return false;
        if (absolutePath.includes('\x00')) return false;

        let normalizedPath;
        try {
            normalizedPath = path.resolve(path.normalize(absolutePath));
        } catch {
            return false;
        }
        if (!path.isAbsolute(normalizedPath)) return false;

        return this._allowedDirectories.some(dir => {
            if (!dir) return false;
            let normalizedDir;
            try {
                normalizedDir = path.resolve(path.normalize(dir));
            } catch {
                return false;
            }
            if (!path.isAbsolute(normalizedDir)) return false;

            if (normalizedPath === normalizedDir) return true;

            if (normalizedDir === path.sep) {
                return normalizedPath.startsWith(path.sep);
            }

            if (path.sep === '\\' && /^[A-Za-z]:\\?$/.test(normalizedDir)) {
                const dirDrive = normalizedDir.charAt(0).toLowerCase();
                const pathDrive = normalizedPath.charAt(0).toLowerCase();
                return pathDrive === dirDrive && normalizedPath.startsWith(normalizedDir.replace(/\\?$/, '\\'));
            }

            return normalizedPath.startsWith(normalizedDir + path.sep);
        });
    }

    async _validatePath(requestedPath) {
        const expanded = this._expandHome(requestedPath);
        let absolute;
        if (path.isAbsolute(expanded)) {
            absolute = path.resolve(expanded);
        } else {
            absolute = this._allowedDirectories.length > 0
                ? path.resolve(this._allowedDirectories[0], expanded)
                : path.resolve(process.cwd(), expanded);
        }

        const normalizedRequested = this._normalizePath(absolute);

        if (!this._isPathAllowed(normalizedRequested)) {
            throw new Error(`访问被拒绝 - 路径不在允许的目录范围内: ${absolute}`);
        }

        try {
            const realPath = await fs.realpath(absolute);
            const normalizedReal = this._normalizePath(realPath);
            if (!this._isPathAllowed(normalizedReal)) {
                throw new Error(`访问被拒绝 - 符号链接目标不在允许的目录范围内: ${realPath}`);
            }
            return realPath;
        } catch (err) {
            if (err.code === 'ENOENT') {
                const parentDir = path.dirname(absolute);
                try {
                    const realParent = await fs.realpath(parentDir);
                    const normalizedParent = this._normalizePath(realParent);
                    if (!this._isPathAllowed(normalizedParent)) {
                        throw new Error(`访问被拒绝 - 父目录不在允许的目录范围内: ${realParent}`);
                    }
                    return absolute;
                } catch {
                    throw new Error(`父目录不存在: ${parentDir}`);
                }
            }
            throw err;
        }
    }

    // ===== 文件操作（移植自 lib.ts）=====

    async _checkFileSize(filePath) {
        const maxBytes = (this._config.maxFileSizeKB || 512) * 1024;
        const stats = await fs.stat(filePath);
        if (stats.size > maxBytes) {
            throw new Error(`文件过大 (${this._formatSize(stats.size)})，超过限制 (${this._formatSize(maxBytes)})。可在插件配置中调整 maxFileSizeKB`);
        }
    }

    async _readFileContent(filePath) {
        return await fs.readFile(filePath, 'utf-8');
    }

    async _writeFileContent(filePath, content) {
        try {
            await fs.writeFile(filePath, content, { encoding: 'utf-8', flag: 'wx' });
        } catch (err) {
            if (err.code === 'EEXIST') {
                const tempPath = `${filePath}.${randomBytes(16).toString('hex')}.tmp`;
                try {
                    await fs.writeFile(tempPath, content, 'utf-8');
                    await fs.rename(tempPath, filePath);
                } catch (renameErr) {
                    try { await fs.unlink(tempPath); } catch {}
                    throw renameErr;
                }
            } else {
                throw err;
            }
        }
    }

    async _headFile(filePath, numLines) {
        const handle = await fs.open(filePath, 'r');
        try {
            const lines = [];
            let buffer = '';
            let bytesRead = 0;
            const chunk = Buffer.alloc(1024);
            while (lines.length < numLines) {
                const result = await handle.read(chunk, 0, chunk.length, bytesRead);
                if (result.bytesRead === 0) break;
                bytesRead += result.bytesRead;
                buffer += chunk.slice(0, result.bytesRead).toString('utf-8');
                const nlIdx = buffer.lastIndexOf('\n');
                if (nlIdx !== -1) {
                    const complete = buffer.slice(0, nlIdx).split('\n');
                    buffer = buffer.slice(nlIdx + 1);
                    for (const line of complete) {
                        lines.push(line);
                        if (lines.length >= numLines) break;
                    }
                }
            }
            if (buffer.length > 0 && lines.length < numLines) {
                lines.push(buffer);
            }
            return lines.join('\n');
        } finally {
            await handle.close();
        }
    }

    async _tailFile(filePath, numLines) {
        const CHUNK_SIZE = 1024;
        const stats = await fs.stat(filePath);
        if (stats.size === 0) return '';
        const handle = await fs.open(filePath, 'r');
        try {
            const lines = [];
            let position = stats.size;
            const chunk = Buffer.alloc(CHUNK_SIZE);
            let linesFound = 0;
            let remainingText = '';
            while (position > 0 && linesFound < numLines) {
                const size = Math.min(CHUNK_SIZE, position);
                position -= size;
                const { bytesRead } = await handle.read(chunk, 0, size, position);
                if (!bytesRead) break;
                const readData = chunk.slice(0, bytesRead).toString('utf-8');
                const chunkText = readData + remainingText;
                const chunkLines = chunkText.replace(/\r\n/g, '\n').split('\n');
                if (position > 0) {
                    remainingText = chunkLines[0];
                    chunkLines.shift();
                }
                for (let i = chunkLines.length - 1; i >= 0 && linesFound < numLines; i--) {
                    lines.unshift(chunkLines[i]);
                    linesFound++;
                }
            }
            return lines.join('\n');
        } finally {
            await handle.close();
        }
    }

    // ===== 文件编辑（移植自 lib.ts applyFileEdits）=====

    async _applyFileEdits(filePath, edits, dryRun) {
        const content = (await fs.readFile(filePath, 'utf-8')).replace(/\r\n/g, '\n');
        let modified = content;

        for (const edit of edits) {
            const normalizedOld = edit.oldText.replace(/\r\n/g, '\n');
            const normalizedNew = edit.newText.replace(/\r\n/g, '\n');

            if (modified.includes(normalizedOld)) {
                modified = modified.replace(normalizedOld, normalizedNew);
                continue;
            }

            const oldLines = normalizedOld.split('\n');
            const contentLines = modified.split('\n');
            let matchFound = false;

            for (let i = 0; i <= contentLines.length - oldLines.length; i++) {
                const potentialMatch = contentLines.slice(i, i + oldLines.length);
                const isMatch = oldLines.every((oldLine, j) =>
                    oldLine.trim() === potentialMatch[j].trim()
                );

                if (isMatch) {
                    const originalIndent = contentLines[i].match(/^\s*/)[0] || '';
                    const newLines = normalizedNew.split('\n').map((line, j) => {
                        if (j === 0) return originalIndent + line.trimStart();
                        const oldIndent = (oldLines[j] && oldLines[j].match(/^\s*/)[0]) || '';
                        const newIndent = line.match(/^\s*/)[0] || '';
                        if (oldIndent && newIndent) {
                            const rel = newIndent.length - oldIndent.length;
                            return originalIndent + ' '.repeat(Math.max(0, rel)) + line.trimStart();
                        }
                        return line;
                    });
                    contentLines.splice(i, oldLines.length, ...newLines);
                    modified = contentLines.join('\n');
                    matchFound = true;
                    break;
                }
            }

            if (!matchFound) {
                throw new Error(`未找到匹配文本:\n${edit.oldText}`);
            }
        }

        const diff = this._createSimpleDiff(content, modified, filePath);

        if (!dryRun) {
            const tempPath = `${filePath}.${randomBytes(16).toString('hex')}.tmp`;
            try {
                await fs.writeFile(tempPath, modified, 'utf-8');
                await fs.rename(tempPath, filePath);
            } catch (err) {
                try { await fs.unlink(tempPath); } catch {}
                throw err;
            }
        }

        return (dryRun ? '[预览模式] ' : '') + diff;
    }

    _createSimpleDiff(original, modified, filepath) {
        const oldLines = original.split('\n');
        const newLines = modified.split('\n');
        const output = [`--- ${filepath}`, `+++ ${filepath}`];
        const maxLen = Math.max(oldLines.length, newLines.length);

        let inHunk = false;
        let hunkStart = -1;
        let hunkLines = [];

        for (let i = 0; i < maxLen; i++) {
            const oldLine = i < oldLines.length ? oldLines[i] : undefined;
            const newLine = i < newLines.length ? newLines[i] : undefined;

            if (oldLine !== newLine) {
                if (!inHunk) {
                    inHunk = true;
                    hunkStart = Math.max(0, i - 3);
                    hunkLines = [];
                    for (let c = hunkStart; c < i; c++) {
                        if (c < oldLines.length) hunkLines.push(` ${oldLines[c]}`);
                    }
                }
                if (oldLine !== undefined && (newLine === undefined || oldLine !== newLine)) {
                    hunkLines.push(`-${oldLine}`);
                }
                if (newLine !== undefined && (oldLine === undefined || oldLine !== newLine)) {
                    hunkLines.push(`+${newLine}`);
                }
            } else if (inHunk) {
                hunkLines.push(` ${oldLine}`);
                if (hunkLines.filter(l => l.startsWith('+') || l.startsWith('-')).length > 0
                    && hunkLines.slice(-3).every(l => l.startsWith(' '))) {
                    output.push(`@@ -${hunkStart + 1} +${hunkStart + 1} @@`);
                    output.push(...hunkLines);
                    inHunk = false;
                }
            }
        }

        if (inHunk && hunkLines.length > 0) {
            output.push(`@@ -${hunkStart + 1} +${hunkStart + 1} @@`);
            output.push(...hunkLines);
        }

        if (output.length <= 2) return '无变更';
        return output.join('\n');
    }

    // ===== 搜索和目录树（移植自 lib.ts / index.ts）=====

    async _buildTree(currentPath, rootPath, excludePatterns) {
        const validPath = await this._validatePath(currentPath);
        const entries = await fs.readdir(validPath, { withFileTypes: true });
        const result = [];

        for (const entry of entries) {
            const relativePath = path.relative(rootPath, path.join(currentPath, entry.name));

            if (this._shouldExclude(relativePath, excludePatterns)) continue;

            const entryData = {
                name: entry.name,
                type: entry.isDirectory() ? 'directory' : 'file'
            };

            if (entry.isDirectory()) {
                const subPath = path.join(currentPath, entry.name);
                try {
                    entryData.children = await this._buildTree(subPath, rootPath, excludePatterns);
                } catch {
                    entryData.children = [];
                }
            }

            result.push(entryData);
        }

        return result;
    }

    async _searchFiles(rootPath, pattern, excludePatterns) {
        const results = [];

        const search = async (currentPath) => {
            let entries;
            try {
                entries = await fs.readdir(currentPath, { withFileTypes: true });
            } catch {
                return;
            }

            for (const entry of entries) {
                const fullPath = path.join(currentPath, entry.name);
                try {
                    await this._validatePath(fullPath);
                } catch {
                    continue;
                }

                const relativePath = path.relative(rootPath, fullPath);

                if (this._shouldExclude(relativePath, excludePatterns)) continue;

                if (this._matchGlob(relativePath, pattern)) {
                    results.push(fullPath);
                }

                if (entry.isDirectory()) {
                    await search(fullPath);
                }
            }
        };

        await search(rootPath);
        return results;
    }

    _shouldExclude(relativePath, patterns) {
        if (!patterns || patterns.length === 0) return false;
        return patterns.some(pattern => this._matchGlob(relativePath, pattern));
    }

    _matchGlob(filePath, pattern) {
        if (minimatch) {
            return minimatch(filePath, pattern, { dot: true })
                || minimatch(filePath, `**/${pattern}`, { dot: true })
                || minimatch(filePath, `**/${pattern}/**`, { dot: true });
        }
        const regex = this._globToRegex(pattern);
        const normalized = filePath.replace(/\\/g, '/');
        return regex.test(normalized) || regex.test(path.basename(normalized));
    }

    _globToRegex(pattern) {
        let regexStr = pattern
            .replace(/\\/g, '/')
            .replace(/[.+^${}()|[\]]/g, '\\$&')
            .replace(/\*\*/g, '§§')
            .replace(/\*/g, '[^/]*')
            .replace(/§§/g, '.*')
            .replace(/\?/g, '[^/]');
        return new RegExp(`(^|/)${regexStr}($|/)`, 'i');
    }

    // ===== 工具函数 =====

    _formatSize(bytes) {
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        if (bytes === 0) return '0 B';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        if (i <= 0) return `${bytes} ${units[0]}`;
        const idx = Math.min(i, units.length - 1);
        return `${(bytes / Math.pow(1024, idx)).toFixed(2)} ${units[idx]}`;
    }
}

module.exports = McpFilesystemPlugin;
