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
    DecorationOptions
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

        replExt.showInputEditor();
    }));
    
    context.subscriptions.push(commands.registerCommand('extension.nodejsReplSingle', () => {
        if(!replExt)
            replExt = new ReplExtension();

        replExt.showInputEditor();
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

    private inputEditor: TextEditor;
    private outputEditor: TextEditor;

    private interpretTimer: NodeJS.Timer = null;

    // create a decorator type that we use to decorate small numbers
	private resultDecorationType = window.createTextEditorDecorationType({
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

        this.changeEventDisposable = workspace.onDidChangeTextDocument(async (event) => {
            try 
            {
                if (!this.inputEditor || this.inputEditor.document !== event.document ) {
                    return;
                }

                // remove the decoration as soon as possible since this will annoy the most users
                this.inputEditor.setDecorations(this.resultDecorationType, [])
                
                let text = event.contentChanges[0].text;

                outputWindow.show();

                if(this.interpretTimer)
                    clearTimeout(this.interpretTimer);

                if(text.indexOf(';') >= 0 || text.indexOf('\n') >= 0) {
                    await this.interpret(this.inputEditor.document.getText());
                } 
                else {
                    this.interpretTimer = setTimeout(async () => {
                        await this.interpret(this.inputEditor.document.getText());
                    }, 2000);
                }
            }
            catch(err) {
                outputWindow.appendLine(err);
            }
        });
    }

    public async interpret(code: string) {
        try {
            // if(this.outputEditor.document.isClosed == true)
            //     await this.showOutputEditor();
            
            let results = await new NodeRepl().interpret(code); // this.repl.interpret(code);

            // if(this.outputEditor && this.outputEditor.document.isClosed == false) {
            //     let result = output
            //             .filter(r => r.type != 'output')
            //             .map(r => `${r.type == 'result' ? '// ' : ''}${r.text.replace(/\r\n|\n/g, '\\n')}`)
            //             .join('\n'),
            //         console = output
            //             .filter(r => r.type == 'output')
            //             .map(r => `${r.text}`)
            //             .join('\n');
                
            //     await this.outputEditor.edit(async (edit) => {
            //         edit.replace(new Range(new Position(0,0), new Position(this.outputEditor.document.lineCount, 35768)), '');
            //         edit.insert(new Position(0, 0), `${result}\n\n/*\n${console}\n*/`);
            //     });
            // }

            let resultDecorators: DecorationOptions[] = [],
                line = -1;
                        
            for(let result of results)
            {
                let length = this.getTextAtLine(result.line - 1).length,
                    startPos = new Position(result.line - 1, length + 1 ),
                    endPos = new Position(result.line - 1, length + 1);

                switch(result.type) {
                    case 'result':
                        resultDecorators.push({ renderOptions: { before: { margin: '0 0 0 1em', contentText: ` ${result.text}`, color: 'green' } }, range: new Range(startPos, endPos) });
                        break;
                    
                    case 'error':
                        resultDecorators.push({ renderOptions: { before: { margin: '0 0 0 1em', contentText: ` ${result.text}`, color: 'red' } }, range: new Range(startPos, endPos) });
                        break;

                    case 'console':
                        resultDecorators.push({ renderOptions: { before: { margin: '0 0 0 1em', contentText: ` ${result.text}`, color: '#457abb' } }, range: new Range(startPos, endPos) });
                        break;
                        
                }
            }

            this.inputEditor.setDecorations(this.resultDecorationType, resultDecorators);

        }
        catch(ex) {
            outputWindow.appendLine(ex);

            return false;
        }

        return true;
    }

    public async showTextDocuments(): Promise<void> {
        await Promise.all([this.showInputEditor(), this.showOutputEditor()]);
    }

    public async showOutputEditor() {
        // if(this.outputEditor && this.outputEditor.document.isClosed == false)
        //     return;

        // this.outputEditor = await window.showTextDocument(await workspace.openTextDocument({ content: '', language: 'javascript' }), ViewColumn.Two, true);
    }

    public async showInputEditor() {
        if(this.inputEditor && this.inputEditor.document.isClosed == false)
            return;
            
        this.inputEditor = await window.showTextDocument(await workspace.openTextDocument({ content: '', language: 'javascript' }), ViewColumn.One);
    }

    private getTextAtLine(line: number) { 
        let startPos = new Position(line, 0),
            endPos = new Position(line, 37768);

        return this.inputEditor.document.getText(new Range(startPos, endPos));        
    }    
}

class NodeRepl {
    private replEval: (cmd: string, context: any, filename: string, cb: (err?: Error, result?: string) => void) => void;

    constructor() {
        
    }

    public async interpret(code: string): Promise<Array<{line: number, type: string, text: string}>> {
        return new Promise<Array<{line: number, type: string, text: string}>>((resolve, reject) => {
            try {
                outputWindow.appendLine(`[${new Date().toLocaleTimeString()}] starting to interpret ${code.length} bytes of code`);

                let output: Array<{line: number, type: string, text: string}> = [],
                    outputErr = [],
                    outputConsole = new Map<number, any>(),
                    lineCount = 0,
                    resultCount = 0,
                    _write = (chunk, enc, cb) => {
                            let out = chunk.toString().trim();
                            switch(out) {
                                case 'undefined':
                                case '...':
                                case '':
                                    break;

                                default:
                                    let match: RegExpExecArray;

                                    if( (match = /(\w+:\s.*)\n\s*at\srepl:\d+:\d+/gi.exec(out)) != null) {
                                        outputErr.push({line: lineCount, type: 'error', text: match[1]});
                                        
                                        outputWindow.appendLine(`  ${match[1]}\n\tat line ${lineCount}`);
                                    }
                                    
                                    if( (match = /`\{(\d+)\}`(.*)/gi.exec(out)) != null) {
                                        let c;
                                        if( (c = outputConsole.get( Number(match[1]) )) == null)
                                            outputConsole.set(Number(match[1]), c = { line: Number(match[1]), type: 'console', text: '' });

                                        c.text += (c.text == '' ? '' : ', ') + match[2];
                                        
                                        outputWindow.appendLine(`  ${match[2]}`);
                                    }
                                    
                                    break;
                            }
                            cb();
                        };

                let inputStream = new Readable({
                    read: () => {
                    }
                });

                inputStream.push("");

                let repl = nodeRepl.start({
                    prompt: '',
                    input: inputStream,
                    output: new Writable({
                        write: _write.bind(this)
                    }),
                    writer: (out) => {
                        // if not implmented, the result will be outputted to stdout/output stream
                    }
                })

                if(this.replEval == null)
                    this.replEval = (<any>repl).eval; // keep a backup of original eval

                // nice place to read the result in sequence and inject it in the code
                (<any>repl).eval = (cmd: string, context: any, filename: string, cb: (err?: Error, result?: any) => void) => {
                    lineCount++;

                    this.replEval(cmd, context, filename, (err, result) => {
                        

                        if(result != null) {
                            output.push({ line: lineCount, type: 'result', text: `${result}`});
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

                for(let line of code.split(/\r\n|\n/))
                {
                    inputStream.push(`${line}\n`); // tell the REPL about the line of code to see if there is any result coming out of it
                }

                inputStream.on('end', () => {
                    // finally, done for now.
                    process.nextTick(() => resolve(
                        output.concat(
                            outputErr, 
                            Array.from(outputConsole.values())
                        )
                    ));
                })

                inputStream.push(null);
            }
            catch(ex)
            {
                reject(ex);
            }
        })
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

    private isRecoverableError(error) {
        if (error.name === 'SyntaxError') {
            return /^(Unexpected end of input|Unexpected token)/.test(error.message);
        }

        return false;
    }
}