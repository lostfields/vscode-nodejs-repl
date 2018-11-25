'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import {
    commands,
    Disposable,
    ExtensionContext,
    TextDocument,
    Uri,
    ViewColumn,
    window,
    workspace,
    WorkspaceEdit,
    TextEditor,
    Position, 
    Range,
    DecorationOptions,
    DecorationRangeBehavior,
    MarkdownString
} from 'vscode';

import { EventEmitter } from 'events';
import * as Repl from 'repl';
import * as Path from 'path';
import * as Fs from 'fs';
import * as Util from 'util';
import { Writable, Readable } from 'stream';

let replExt: ReplExtension;
let outputWindow = window.createOutputChannel("NodeJs REPL");

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {
    context.subscriptions.push(commands.registerCommand('extension.nodejsRepl', async () => {
        try {
            if(!replExt || replExt.disposed)
                replExt = new ReplExtension();

            await replExt.close();
            await replExt.showEditor();
            
            return;
        }
        catch(err) {
            outputWindow.appendLine(err);
        }
    }));
    
    context.subscriptions.push(commands.registerCommand('extension.nodejsReplCurrent', async () => {
        try {
            if(!replExt || replExt.disposed)
                replExt = new ReplExtension();

            await replExt.close();
            await replExt.openDocument(true);
            await replExt.showEditor();
            await replExt.interpret();

            return;
        }
        catch(err) {
            outputWindow.appendLine(err);
        }
    }));

    context.subscriptions.push(commands.registerCommand('extension.nodejsReplClose', async () => {
        try {
            if(replExt && !replExt.disposed) {
                await replExt.close();

                replExt.dispose()
            }

        }
        catch(err) {
            outputWindow.appendLine(err);
        }
    }));
    

    (async () => {
        try {
            for(let document of workspace.textDocuments) {
                if(document.fileName.indexOf('Untitled-') >= 0 && document.languageId == 'javascript') {
                    if(!replExt || replExt.disposed)
                        replExt = new ReplExtension();

                    await replExt.showEditor(document);
                    await replExt.interpret();
                    
                    break;
                }
            }
        }
        catch(err) {
            outputWindow.appendLine(err);
        }
    })()
    

}

// this method is called when your extension is deactivated
export function deactivate() {
    replExt.dispose();
    outputWindow.dispose();
}

class ReplExtension {
    private changeEventDisposable: Disposable;
    private changeActiveDisposable: Disposable;

    private repl: NodeRepl;

    private editor: TextEditor;
    private document: TextDocument;

    private interpretTimer: NodeJS.Timer = null;

    // create a decorator type that we use to decorate small numbers
	private resultDecorationType = window.createTextEditorDecorationType({
        rangeBehavior: DecorationRangeBehavior.ClosedClosed,
		light: {
            
		},
		dark: {
            
        }
    });
    
    private resultDecorators: Map<number, DecorationOptions> = new Map();

    constructor() {
        this.init();
    }

    public get disposed() { 
        return this.repl == null;
    }

    public dispose() {
        if(outputWindow)
            outputWindow.appendLine(`Disposing REPL extension`)

        this.changeActiveDisposable.dispose();
        this.changeEventDisposable.dispose();
        
        this.repl = null;
    }

    public async init() {
        outputWindow.appendLine(`Initializing REPL extension in Node ${process.version}`)

        this.changeActiveDisposable = window.onDidChangeActiveTextEditor(async (editor) => {
            if(this.editor && this.editor.document === editor.document) {
                this.interpret();
            }
        });

        workspace.onDidCloseTextDocument(async (document) => {
            if(this.editor && this.editor.document == document)
                this.dispose();
        });
        
        this.changeEventDisposable = workspace.onDidChangeTextDocument(async (event) => {
            try 
            {
                if (!this.editor || this.editor.document !== event.document ) {
                    return;
                }

                let change = event.contentChanges[0],
                    text = change.text;

                if(/\n/.test(text) == false && change.range.isSingleLine == true)
                    this.editor.setDecorations(this.resultDecorationType, Array.from(this.resultDecorators.values()).filter(d => {
                        return this.editor.selection.active.line != d.range.start.line;
                    }));

                outputWindow.show(true);

                if(this.interpretTimer)
                    clearTimeout(this.interpretTimer);

                if(text.indexOf(';') >= 0 || text.indexOf('\n') >= 0 || (text == '' && change.range.isSingleLine == false)) {
                    await this.interpret();
                } 
                else {
                    this.interpretTimer = setTimeout(async () => {
                        await this.interpret();
                    }, 2000);
                }
            }
            catch(err) {
                outputWindow.appendLine(err);
            }
        });
    }

    public async interpret() {
        try {
            await this.showEditor();

            let code = this.editor.document.getText();

            this.resultDecorators.clear();

            new NodeRepl()
                .on('exit', () => {
                    if(this.resultDecorators.size == 0)
                        this.editor.setDecorations(this.resultDecorationType, []);
                })
                .on('output', (result) => {
                    let decorator: DecorationOptions,
                        color: string;

                    switch(result.type) {
                        case 'result': color = 'green'; break;
                        case 'error': color = 'red'; break;
                        case 'console': color = '#457abb'; break;
                    }

                    if((decorator = this.resultDecorators.get(result.line)) == null)
                    { 
                        let length = this.getTextAtLine(result.line - 1).length,
                            startPos = new Position(result.line - 1, length + 1 ),
                            endPos = new Position(result.line - 1, length + 1);
                        
                        this.resultDecorators.set(result.line, decorator = { renderOptions: { before: { margin: '0 0 0 1em', contentText: '', color: color } }, range: new Range(startPos, endPos) });
                    }

                    decorator.renderOptions.before.color = color;
                    decorator.renderOptions.before.contentText = ` ${result.text}`;
                    
                    decorator.hoverMessage = new MarkdownString(result.type.slice(0, 1).toUpperCase() + result.type.slice(1));
                    decorator.hoverMessage.appendCodeblock(
                        result.type == 'console' ? result.value.join('\n') : result.value || result.text,
                        "javascript"
                    );
                    
                    this.editor.setDecorations(this.resultDecorationType, Array.from<DecorationOptions>(this.resultDecorators.values()));
                })
                .interpret(code);
        }
        catch(ex) {
            outputWindow.appendLine(ex);

            return false;
        }
   
        return true;
    }

    public async close(): Promise<void> {
        this.document = null;
    }

    public async show(): Promise<void> {
        await this.showEditor();
    }

    public async openDocument(currentWindow: boolean = false) {
        if(this.document == null || this.document.isClosed == true) {
            if(currentWindow && window.activeTextEditor) {
                if(window.activeTextEditor.document.languageId == 'javascript') {
                    return this.document = window.activeTextEditor.document;
                }
                else {
                    window.showErrorMessage('Selected document is not Javascript, unable to start REPL here');

                    return null;
                }
            }

            this.document = await workspace.openTextDocument({  content: '', language: 'javascript' });
        }

        return this.document;
    }

    public async showEditor(document: TextDocument = undefined) {
        if(document) 
            this.document = document;

        this.editor = await window.showTextDocument(this.document || await this.openDocument(), ViewColumn.Active, );

        return this.editor;
    }

    private getTextAtLine(line: number) { 
        let startPos = new Position(line, 0),
            endPos = new Position(line, 37768);

        return this.editor.document.getText(new Range(startPos, endPos));        
    }  
}

class NodeRepl extends EventEmitter {
    private replEval: (cmd: string, context: any, filename: string, cb: (err?: Error, result?: string) => void) => void;
    private output: Map<number, {line: number, type: string, text: string, value: any}> = new Map();

    private basePath: string;

    constructor() {
        super();

        if(workspace && Array.isArray(workspace.workspaceFolders)) {
            let doc = window.activeTextEditor.document;
            this.basePath = (doc.isUntitled)
                ? workspace.workspaceFolders[0].uri.fsPath
                : workspace.getWorkspaceFolder(Uri.file(doc.fileName)).uri.fsPath;

            outputWindow.appendLine(`Working at: ${this.basePath}`);
        }
    }

    public async interpret(code: string) {
        try {
            outputWindow.appendLine(`[${new Date().toLocaleTimeString()}] starting to interpret ${code.length} bytes of code`);

            let inputStream = new Readable({
                    read: () => { }
                }),
                lineCount = 0,
                outputCount = 0,
                requireIdx = 0;

            this.output.clear(); // new interpretation, clear all outputs

            inputStream.push("");

            let repl = Repl.start({
                prompt: '',
                input: inputStream,
                output: new Writable({
                    write: (chunk, enc, cb) => {
                        let out = chunk.toString().trim();
                        switch(out) {
                            case 'undefined':
                            case '...':
                            case '':
                                break;

                            default:
                                let match: RegExpExecArray;

                                if( (match = /(\w+:\s.*)\n\s*at\s/gi.exec(out)) != null) {
                                    this.output.set(lineCount, {line: lineCount, type: 'error', text: match[1], value: match[1]});               
                                    this.emit('output', {line: lineCount, type: 'error', text: match[1], value: match[1]});
                                    
                                    outputWindow.appendLine(`  ${match[1]}\n\tat line ${lineCount}`);
                                }
                                else if( (match = /`\{(\d+)\}`([\s\S]*)/gi.exec(out)) != null) {
                                    let output = this.output.get( Number(match[1]) );
                                    if( output == null)
                                        this.output.set(Number(match[1]), output = { line: Number(match[1]), type: 'console', text: '', value: [] });
                                    
                                    output.text += (output.text == '' ? '' : ', ') + (match[2] || '').replace(/\r\n|\n/g, ' ');
                                    output.value.push(match[2]);

                                    this.emit('output', output);

                                    outputWindow.appendLine(`  ${match[2]}`);
                                }
                                else {
                                    outputWindow.appendLine(`  ${out}`);
                                }
                                
                                break;
                        }
                        cb();
                    }
                }),
                writer: (out) => {
                    if(out == null)
                        return;
                }
            })

            if(this.replEval == null)
                this.replEval = (<any>repl).eval; // keep a backup of original eval

            // nice place to read the result in sequence and inject it in the code
            (<any>repl).eval = (cmd: string, context: any, filename: string, cb: (err?: Error, result?: any) => void) => {            
                lineCount++;

                this.replEval(cmd, context, filename, (err, result: any) => {
                    let regex = /\/\*`(\d+)`\*\//gi,
                        match: RegExpExecArray
                        
                    if(!err)  {
                        while((match = regex.exec(cmd)) != null)
                            lineCount += Number(match[1]);

                        let currentLine = lineCount

                        this.formatOutput(result) // we can't await this since callback of eval needs to be called synchronious
                            .then(output => {
                                if(output) {
                                    this.output.set(currentLine, {line: currentLine, type: output.type, text: output.text, value: output.value});
                                    this.emit('output', { line: currentLine, type: output.type, text: `${output.text}`, value: output.value});    

                                    if(output.type == 'error') 
                                        outputWindow.appendLine(`  ${err.name}: ${err.message}\n\tat line ${currentLine}`);
                                }
                            })
                    }

                    cb(err, result);
                })
            }

            Object.defineProperty(repl.context, '_console', {
                
                value: function(line: number) {
                    let _log = function (text, ...args) {
                        repl.context.console.log(`\`{${line}}\`${typeof text === 'string' ? text : Util.inspect(text)}`, ...args);
                    }

                    return Object.assign({}, repl.context.console, {
                        log: _log,
                        warn: _log,
                        error: _log
                    })
                }
                
            });
        
            code = this.rewriteImport(code);
            code = this.rewriteRequire(code);
            code = this.rewriteConsole(code);
            code = this.rewriteMethod(code);

            //inputStream.push(`require("${Path.join(this.basePath, "node_modules", "ts-node").replace(/\\/g, '\\\\')}").register({});\n`)
            for(let line of code.split(/\r\n|\n/))
            {
                inputStream.push(`${line}\n`); // tell the REPL about the line of code to see if there is any result coming out of it
            }

            inputStream.push(`.exit\n`);
            inputStream.push(null);

            repl.on('exit', () => {
                setTimeout(() => this.emit('exit'), 100);
            })
        }
        catch(ex)
        {
            outputWindow.appendLine(ex);
        }
    }

    private async formatOutput(result: any): Promise<{type: 'result' | 'error', text: string, value: any }> {
        switch(typeof(result))
        {
            case 'undefined':
                break;

            case 'object':
                if(result.constructor && result.constructor.name == 'Promise' && result.then) {
                    try {
                        let ret = await Promise.resolve(result)

                        return this.formatOutput(ret)
                    }
                    catch(ex) {
                        return {
                            type: 'error',
                            text: `${ex.name}: ${ex.message}`,
                            value: ex
                        }
                    }
                }

                let text;

                if(Array.isArray(result)) {
                    text = JSON.stringify(result);
                } 
                else {
                    text = JSON.stringify(result, null, "\t").replace(/\n/g, " ");
                }

                return {
                    type: 'result',
                    text: text,
                    value: result
                }

            default:
                return {
                    type: 'result',
                    text: result.toString().replace(/(\r\n|\n)/g, ' '),
                    value: result
                }                
        }

    }

    private rewriteImport(code: string): string {
        let regex = /import\s*(?:(\*\s+as\s)?([\w-_]+),?)?\s*(?:\{([^\}]+)\})?\s+from\s+["']([^"']+)["']/gi,
            match;

        return code.replace(regex, (str: string, wildcard: string, module: string, modules: string, from) => {
            let rewrite = '',
                path;

            if(module)
                rewrite += `${rewrite == '' ? '' : ', '}default: ${module} `;
        
            if(modules) 
                rewrite += `${rewrite == '' ? '' : ', '}${modules
                    .split(',')
                    .map(r => r.replace(/\s*([\w-_]+)(?:\s+as\s+([\w-_]))?\s*/gi, (str, moduleName: string, moduleNewName: string) => {
                        return `${moduleNewName ? `${moduleNewName.trim()}: ` : ``}${moduleName.trim()}`;
                    }))
                    .join(', ')}`;
                                        
            return `const ${wildcard ? module : `{ ${rewrite} }`} = require('${from}')`;
        });
    }

    private rewriteRequire(code: string): string {
        let regex = /require\s*\(\s*(['"])([A-Z0-9_~\\\/\.]+)\s*\1\)/gi,
            match: RegExpExecArray;

        return code.replace(regex, (str, par, name) => {
            try {
                if(require(name)) {
                    return str;
                }
            } 
            catch(ex) {
                let doc = window.activeTextEditor.document;
                let path = Path.join(this.basePath, 'node_modules', name);

                if(Fs.existsSync(path) === false)
                    path = (doc.isUntitled)
                        ? Path.normalize(Path.join(this.basePath, name))
                        : Path.join(Path.dirname(doc.fileName), name);

                return `require('${path.replace(/\\/g, '\\\\')}')`;
            }
        });
    }

    private rewriteConsole(code: string): string {
        let num = 0,
            out = [];
        
        for(let line of code.split(/\r\n|\n/))
        {
            out.push(line.replace(/console/g, `_console(${++num})`));
        }

        return out.join('\n');
    }

    private rewriteMethod(code: string): string {
        let regex = /([\n\s]+)\./gi,
            match;

        return code.replace(regex, (str: string, whitespace) => {
            return `/*\`${whitespace.split(/\r\n|\n/).length - 1}\`*/.`
        });
    }

    private isRecoverableError(error) {
        if (error.name === 'SyntaxError') {
            return /^(Unexpected end of input|Unexpected token)/.test(error.message);
        }

        return false;
    }
}