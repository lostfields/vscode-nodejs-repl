import * as Path from 'path';
import * as Fs from 'fs';


const importStatement = /import\s+(?:(\*\s+as\s)?([\w-_]+),?)?\s*(?:\{([^\}]+)\})?\s+from\s+["']([^"']+)["']/gi;

export function rewriteImportToRequire(code: string): string {
    return code.replace(importStatement, (str, wildcard: string, module: string, modules: string, from: string) => {
        let rewrite = '';

        if (module)
            rewrite = `default: ${module}`;

        if (modules)
            rewrite += (rewrite && ', ') + modules.replace(/\sas\s/g, ': ');

        return `const ${wildcard ? module : `{ ${rewrite} }`} = require('${from}');`;
    });
}


const requireStatement = /require\s*\(\s*(['"])([A-Z0-9_~\\\/\.]+)\s*\1\)/gi;

export function rewriteModulePathInRequire(code: string, basePath: string, filePath: string): string {
    return code.replace(requireStatement, (str, par, name) => {
        let path = Path.join(basePath, 'node_modules', name);

        if (Fs.existsSync(path) === false)
            path = (name.indexOf('/') === -1)
                ? name
                : (filePath)
                    ? Path.join(Path.dirname(filePath), name)
                    : Path.join(basePath, name);

        return `require('${path.replace(/\\/g, '\\\\')}')`;
    });
}


const lineBreak = /\r?\n/;
const consoleLogCall = /console\s*\.(log|debug|error)\(/g;

export function rewriteConsoleToAppendLineNumber(code: string): string {
    let num = 0,
        out = [];

    for (let line of code.split(lineBreak)) {
        out.push(line.replace(consoleLogCall, `global['\`console\`'].$1(${num++}, `));
    }

    return out.join('\n');
}


const lineBreakInChainCall = /([\n\s]+)\./gi;

export function rewriteChainCallInOneLine(code: string): string {
    return code.replace(lineBreakInChainCall, (str, whitespace) => `/*\`${whitespace.split(lineBreak).length - 1}\`*/.`);
}