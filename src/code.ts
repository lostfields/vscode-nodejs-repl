import * as Path from 'path';
import * as Fs from 'fs';


const importStatement = /import\s*(?:(\*\s+as\s)?([\w-_]+),?)?\s*(?:\{([^\}]+)\})?\s+from\s+["']([^"']+)["']/gi;

export function rewriteImportToRequire(code: string): string {
    return code.replace(importStatement, (str, wildcard: string, module: string, modules: string, from: string) => {
        let rewrite = '';

        // 导入所有
        if (module)
            rewrite += `${rewrite === '' ? '' : ', '}default: ${module} `;
        // 解构导入
        if (modules)
            rewrite += `${rewrite === '' ? '' : ', '}${modules
                .split(',')
                .map(r => r.replace(/\s*([\w-_]+)(?:\s+as\s+([\w-_]))?\s*/gi, (str, moduleName: string, moduleNewName: string) => {
                    return `${moduleNewName ? `${moduleNewName.trim()}: ` : ``}${moduleName.trim()}`;
                }))
                .join(', ')}`;

        return `const ${wildcard ? module : `{ ${rewrite} }`} = require('${from}')`;
    });
}


const requireStatement = /require\s*\(\s*(['"])([A-Z0-9_~\\\/\.]+)\s*\1\)/gi;

export function rewriteModulePathInRequire(code: string, basePath: string, filePath: string): string {
    return code.replace(requireStatement, (str, par, name) => {
        let path = Path.join(basePath, 'node_modules', name);

        if (Fs.existsSync(path) === false) // 不是第三方模块
            path = (name.indexOf('/') === -1) // 是否标准模块
                ? name
                : (filePath) // 文件路径是否存在
                    ? Path.join(Path.dirname(filePath), name)
                    : Path.join(basePath, name);

        return `require('${path.replace(/\\/g, '\\\\')}')`;
    });
}


const linBreak = /\r?\n/;
const consoleLogCall = /console\s*\.(log|debug|error)\(/g;

export function rewriteConsoleToAppendLineNumber(code: string): string {
    let num = 0,
        out = [];

    for (let line of code.split(linBreak)) {
        out.push(line.replace(consoleLogCall, `global['\`console\`'].$1(${num++}, `));
    }

    return out.join('\n');
}


const lineBreakInChainCall = /([\n\s]+)\./gi;

export function rewriteChainCallInOneLine(code: string): string {
    return code.replace(lineBreakInChainCall, (str, whitespace) => `/*\`${whitespace.split(linBreak).length - 1}\`*/.`);
}