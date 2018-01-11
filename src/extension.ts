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
    DecorationRangeBehavior
} from 'vscode';

import { EventEmitter } from 'events';
import * as nodeRepl from 'repl';
import { Writable, Readable } from 'stream';

let replExt: ReplExtension;
let outputWindow = window.createOutputChannel("NodeJs REPL");

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {
    context.subscriptions.push(commands.registerCommand('extension.nodejsRepl', () => {
        if(!replExt)
            replExt = new ReplExtension();

        replExt.showEditor();
    }));
    
    context.subscriptions.push(commands.registerCommand('extension.nodejsReplSingle', () => {
        if(!replExt)
            replExt = new ReplExtension();

        replExt.showEditor();
    }));

}

// this method is called when your extension is deactivated
export function deactivate() {
    replExt.dispose();
    outputWindow.dispose();
}

class ReplExtension {
    private changeEventDisposable: Disposable;
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

    constructor() {
        this.repl = new NodeRepl();

        this.init();
    }

    public dispose() {
        
    }

    public async init() {
        var lastInput = '';

        this.changeEventDisposable = workspace.onDidChangeTextDocument(async (event) => {
            try 
            {
                if (!this.editor || this.editor.document !== event.document ) {
                    return;
                }

                let text = event.contentChanges[0].text;

                if(text == '')
                    this.editor.setDecorations(this.resultDecorationType, []);

                outputWindow.show();

                if(this.interpretTimer)
                    clearTimeout(this.interpretTimer);

                if(text.indexOf(';') >= 0 || text.indexOf('\n') >= 0 || lastInput == '') {
                    await this.interpret(this.editor.document.getText());
                } 
                else {
                    this.interpretTimer = setTimeout(async () => {
                        await this.interpret(this.editor.document.getText());
                    }, 2000);
                }

                lastInput = text;
            }
            catch(err) {
                outputWindow.appendLine(err);
            }
        });
    }

    public async interpret(code: string) {
        try {
            await this.showEditor();

            let resultDecorators: Map<number, DecorationOptions> = new Map();

            new NodeRepl()
                .on('output', (result) => {
                    let decorator: DecorationOptions,
                        color: string;

                    switch(result.type) {
                        case 'result': color = 'green'; break;
                        case 'error': color = 'red'; break;
                        case 'console': color = '#457abb'; break;
                    }

                    if((decorator = resultDecorators.get(result.line)) == null)
                    { 
                        let length = this.getTextAtLine(result.line - 1).length,
                            startPos = new Position(result.line - 1, length + 1 ),
                            endPos = new Position(result.line - 1, length + 1);
                        
                        resultDecorators.set(result.line, decorator = { renderOptions: { before: { margin: '0 0 0 1em', contentText: '', color: color } }, range: new Range(startPos, endPos) });
                    }

                    decorator.renderOptions.before.color = color;
                    decorator.renderOptions.before.contentText = ` ${result.text}`

                    this.editor.setDecorations(this.resultDecorationType, Array.from<DecorationOptions>(resultDecorators.values()));
                })
                .interpret(code);
        }
        catch(ex) {
            outputWindow.appendLine(ex);

            return false;
        }
   
        return true;
    }

    public async show(): Promise<void> {
        this.showEditor();
    }

    public async openDocument() {
        if(this.document == null || this.document.isClosed == true)
            this.document = await workspace.openTextDocument({ content: '', language: 'javascript' });

        return this.document;
    }

    public async showEditor() {
        this.editor = await window.showTextDocument(await this.openDocument(), ViewColumn.Active, );
    }

    private getTextAtLine(line: number) { 
        let startPos = new Position(line, 0),
            endPos = new Position(line, 37768);

        return this.editor.document.getText(new Range(startPos, endPos));        
    }  
}

class NodeRepl extends EventEmitter {
    private replEval: (cmd: string, context: any, filename: string, cb: (err?: Error, result?: string) => void) => void;
    private output: Map<number, {line: number, type: string, text: string}> = new Map();

    constructor() {
        super();
    }

    public async interpret(code: string) {
        try {
            outputWindow.appendLine(`[${new Date().toLocaleTimeString()}] starting to interpret ${code.length} bytes of code`);

            let inputStream = new Readable({
                    read: () => { }
                }),
                lineCount = 0,
                resultCount = 0;

            this.output.clear(); // new interpretation, clear all outputs

            inputStream.push("");

            let repl = nodeRepl.start({
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
                                    this.output.set(lineCount, {line: lineCount, type: 'error', text: match[1]});               
                                    this.emit('output', {line: lineCount, type: 'error', text: match[1]});
                                    
                                    outputWindow.appendLine(`  ${match[1]}\n\tat line ${lineCount}`);
                                }
                                
                                if( (match = /`\{(\d+)\}`(.*)/gi.exec(out)) != null) {
                                    let output = this.output.get( Number(match[1]) );
                                    if( output == null)
                                        this.output.set(Number(match[1]), output = { line: Number(match[1]), type: 'console', text: '' });
                                    
                                    output.text += (output.text == '' ? '' : ', ') + match[2];

                                    this.emit('output', output);

                                    outputWindow.appendLine(`  ${match[2]}`);
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
                        match: RegExpExecArray;

                    if(err) {
                        
                    }

                    if(result != null) {
                        while((match = regex.exec(cmd)) != null)
                            lineCount += Number(match[1]);

                        switch(typeof(result))
                        {
                            case 'object':

                                if(result.constructor && result.constructor.name == 'Promise' && result.then) {
                                    // we have a promise, catch any exceptions
                                    ((promise, line) => {
                                        promise
                                            .then(result => {
                                                this.output.set(line, {line: line, type: 'result', text: `${result}`});
                                                this.emit('output', { line: line, type: 'result', text: `${result}`});                                                
                                            })
                                            .catch(err => {
                                                this.output.set(line, {line: line, type: 'error', text: `${err.name}: ${err.message}`});               
                                                this.emit('output', {line: line, type: 'error', text: `${err.name}: ${err.message}`});
                                                
                                                outputWindow.appendLine(`  ${err.name}: ${err.message}\n\tat line ${line}`);
                                            })
            
                                    })(result, lineCount);
                                    
                                    return
                                }

                                if(Array.isArray(result)) {
                                    result = `[${result.join(',')}]`;
                                    break;
                                }

                            default: 

                        }

                        this.output.set(lineCount, {line: lineCount, type: 'result', text: `${result}`});
                        this.emit('output', { line: lineCount, type: 'result', text: `${result}`});
                    }

                    cb(err, result);
                })
            }

            Object.defineProperty(repl.context, '_console', {
                
                value: function(line: number) {
                    return {
                        log: function(text) {
                            repl.context.console.log(`\`{${line}}\`${text}`);
                        }, 
                        warn: function(text) {
                            repl.context.console.log(`\`{${line}}\`${text}`);
                        },
                        error: function(text) {
                            repl.context.console.log(`\`{${line}}\`${text}`);
                        },
                        Console: function() {
                            return new repl.context.console.Consule(...arguments);
                        }
                    }
                }
            });
        
            code = this.rewriteImport(code);
            code = this.rewriteConsole(code);
            code = this.rewriteMethod(code);

            for(let line of code.split(/\r\n|\n/))
            {
                inputStream.push(`${line}\n`); // tell the REPL about the line of code to see if there is any result coming out of it
            }

            inputStream.push(`.exit\n`);
            inputStream.push(null);

            repl.on('exit', () => {
                
            })
        }
        catch(ex)
        {
            outputWindow.appendLine(ex);
        }
    }

    private rewriteImport(code: string): string {
        let regex = /import\s*(?:(\*\s+as\s)?([\w-_]+),?)?\s*(?:\{([^\}]+)\})?\s+from\s+(["'][^"']+["'])/gi,
            match;

        return code.replace(regex, (str: string, wildcard: string, module: string, modules: string, from) => {
            let rewrite = '';

            if(module)
                rewrite += `${rewrite == '' ? '' : ', '}${module}: _default`;
        
            if(modules) 
                rewrite += `${rewrite == '' ? '' : ', '}${modules
                    .split(',')
                    .map(r => r.replace(/\s*([\w-_]+)(?:\s+as\s+([\w-_]))?\s*/gi, (str, moduleName: string, moduleNewName: string) => {
                        return `${moduleNewName ? `${moduleNewName.trim()}: ` : ``}${moduleName.trim()}`;
                    }))
                    .join(', ')}`;

            return `const ${wildcard ? module : `{ ${rewrite} }`} = require(${from})`;
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