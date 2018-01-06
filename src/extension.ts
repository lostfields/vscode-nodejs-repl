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
    Range
} from 'vscode';

import { EventEmitter } from 'events';
import * as nodeRepl from 'repl';
import { Writable, Readable } from 'stream';

let parser: Parser;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "nodejs-repl" is now active!');

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    let disposable = commands.registerCommand('extension.sayHello', () => {

        parser = new Parser();

    });

    context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {
}

class Parser {
    private changeEventDisposable: Disposable;
    private repl: NodeRepl;

    private inputEditor: TextEditor;
    private outputEditor: TextEditor;

    constructor() {
        this.repl = new NodeRepl();
        this.repl.on('output', (output: Array<{type, text}>) => this.write(output))

        this.init();
    }

    public write(output: Array<{type, text}>) {
        this.outputEditor.edit(edit => {
            let code = output
                    .filter(r => r.type != 'output')
                    .map(r => `${r.type == 'result' ? '// ' : ''}${r.text}`)
                    .join('\n'),
                console = output
                    .filter(r => r.type == 'output')
                    .map(r => `${r.text}`)
                    .join('\n');

            edit.replace(new Range(new Position(0,0), new Position(this.outputEditor.document.lineCount, 35768)), '');
            edit.insert(new Position(0, 0), `${code}\n\n/*\n${console}\n*/`);
        })
        
        console.log(output.map(r => r.text).join('\n'));
    }

    public async init() {
        const {
            inputEditor,
            outputEditor
        } = await this.showTextDocuments();

        this.inputEditor = inputEditor;
        this.outputEditor = outputEditor;

        this.changeEventDisposable = workspace.onDidChangeTextDocument((event) => {
            if (event.document !== inputEditor.document) {
                return;
            }

            let text = event.contentChanges[0].text;

            this.outputEditor.edit(edit => {
                if(text.indexOf(';') >= 0) {
                    this.repl.interprete(inputEditor.document.getText());
                }
            });
        });
    }

    public async showTextDocuments() {
        const inputEditor = await window.showTextDocument(await workspace.openTextDocument({ content: '', language: 'javascript' }), ViewColumn.One);
        const outputEditor = await window.showTextDocument(await workspace.openTextDocument({ content: '', language: 'javascript' }), ViewColumn.Two, true);

        return {
            inputEditor,
            outputEditor
        };
    }
}

class NodeRepl extends EventEmitter {
    private replEval: (cmd: string, context: any, filename: string, cb: (err?: Error, result?: string) => void) => void;

    constructor() {
        super();
    }

    public async interprete(code: string): Promise<void> {
        let output = [],
            outputConsole = [],
            lineCount = 0,
            resultCount = 0;

        let inputStream = new Readable({
                read: () => {

                }
            }),
            outputStream = new Writable({
                write: (chunk, enc, cb) => {
                    let out = chunk.toString().trim();
                    switch(out) {
                        case 'undefined':
                        case '...':
                        case '':
                            break;

                        default:
                            outputConsole.push(out); break;
                    }
                    cb();
                }
            });

        inputStream.push("");

        let repl = nodeRepl.start({
            prompt: '',
            input: inputStream,
            output: outputStream,
            writer: (out) => {

            }
        })

        if(this.replEval == null)
            this.replEval = (<any>repl).eval; // keep a backup of original eval

        (<any>repl).eval = (cmd: string, context: any, filename: string, cb: (err?: Error, result?: any) => void) => {
            
            this.replEval(cmd, context, filename, (err, result) => {
                lineCount++;

                if(result != null) {
                    output.splice((lineCount - 1) + ++resultCount, 0, { type: 'result', text: result});
                }

                cb(err, result);
            })
        }   

        for(let line of code.split(/\r\n|\n/))
        {
            inputStream.push(`${line}\n`); 
            output.push({ type: 'code', text: `${line}`});
        }

        inputStream.on('end', () => {
            this.emit('output', output.concat( outputConsole.map(r => <any>{ type: 'output', text: r })));
        })

        inputStream.push(null);
    }
}