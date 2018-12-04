import {
    Disposable,
    OutputChannel,
    TextEditor,
    TextDocument,
    window,
    workspace,
    Uri,
} from "vscode";

import {
    rewriteImportToRequire,
    rewriteModulePathInRequire,
    rewriteConsoleToAppendLineNumber,
    rewriteChainCallInOneLine
} from "./code";

import Decorator from "./decorator";
import { spawn, ChildProcess } from "child_process";


export default class ReplClient {
    private changeEventDisposable: Disposable;
    private closeTextDocumentDisposable: Disposable;
    private changeActiveDisposable: Disposable;

    private editor: TextEditor;
    private decorator: Decorator;
    private basePath: string;
    private filePath: string;

    private repl: ChildProcess;

    private editingTimer: NodeJS.Timer = null;
    private afterEditTimer: NodeJS.Timer = null;

    constructor(private outputChannel: OutputChannel) {
        this.decorator = new Decorator(outputChannel);

        this.changeActiveDisposable = window.onDidChangeActiveTextEditor(async (editor) => {
            if (this.editor && this.editor.document === editor.document) {
                this.init(editor, editor.document);
                this.interpret();
            }
        });

        this.closeTextDocumentDisposable = workspace.onDidCloseTextDocument(async (document) => {
            if (this.editor && this.editor.document === document)
                this.close();
        });

        this.changeEventDisposable = workspace.onDidChangeTextDocument(async (event) => {
            try {
                if (!this.editor || this.editor.document !== event.document)
                    return;

                let change = event.contentChanges[0],
                    text = change.text;

                if (/\n/.test(text) === false && change.range.isSingleLine) {
                    let currentLine = this.editor.selection.active.line;
                    this.decorator.decorateExcept(currentLine);
                }

                if (this.afterEditTimer) clearTimeout(this.afterEditTimer);
                if (this.editingTimer) clearTimeout(this.editingTimer);

                if (text.lastIndexOf(';') >= 0 || text.lastIndexOf('\n') >= 0 || (text === '' && change.range.isSingleLine === false))
                    this.editingTimer = setTimeout(async () => await this.interpret(), 600);
                else
                    this.afterEditTimer = setTimeout(async () => await this.interpret(), 1500);
            }
            catch (err) {
                this.outputChannel.appendLine(err);
            }
        });
    }

    init(editor: TextEditor, doc: TextDocument) {
        this.outputChannel.appendLine(`Initializing REPL extension.`);
        this.outputChannel.appendLine(`  Warning; Be careful with CRUD operations since the code is running multiple times in REPL.`);

        this.editor = editor;

        if (workspace && Array.isArray(workspace.workspaceFolders)) {

            this.basePath = (doc.isUntitled)
                ? workspace.workspaceFolders[0].uri.fsPath
                : workspace.getWorkspaceFolder(Uri.file(doc.fileName)).uri.fsPath;

            this.filePath = doc.isUntitled ? '' : doc.fileName;

            this.outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] working at: ${this.basePath}`);
        }
    }

    async interpret() {
        try {
            this.decorator.init(this.editor);

            this.repl = spawn('node', [`${__dirname}/replServer.js`], { cwd: this.basePath, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] })
                .on('message', async result => await this.decorator.update(result))
                .on('error', err => this.outputChannel.appendLine(`[Repl Server] ${err.message}`));

            let code = this.editor.document.getText();

            this.outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] starting to interpret ${code.length} bytes of code`);

            // TODO: typescript REPL
            // code = `require("${Path.join(this.basePath, "node_modules/ts-node").replace(/\\/g, '\\\\')}").register({});\n${code}`;
            code = rewriteImportToRequire(code);
            code = rewriteModulePathInRequire(code, this.basePath, this.filePath);
            code = rewriteConsoleToAppendLineNumber(code);
            code = rewriteChainCallInOneLine(code);

            this.repl.send({ code });
        }
        catch (ex) {
            this.outputChannel.appendLine(ex);
        }
    }

    close() {
        if (this.outputChannel)
            this.outputChannel.appendLine(`Disposing REPL server.`);

        this.repl.send({ operation: 'exit' });
        this.repl = null;
    }

    get isClosed() {
        return this.repl == null;
    }

    dispose() {
        this.changeActiveDisposable.dispose();
        this.closeTextDocumentDisposable.dispose();
        this.changeEventDisposable.dispose();
        this.editor = null;

        this.repl.send({ operation: 'exit' });
        this.repl = null;
    }
}