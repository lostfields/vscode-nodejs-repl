import {
    Disposable,
    env,
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
import { format } from 'util';
import i18n from './i18n';

const i18nTexts = i18n(env.language);

const serverArguments = [`${__dirname}/repl-server.js`];

const stdioOptions = ['ignore', 'ignore', 'ignore', 'ipc'];

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
    }

    private registerEventHandlers() {
        this.changeActiveDisposable = window.onDidChangeActiveTextEditor(async (editor) => {
            if (this.editor && editor && this.editor.document === editor.document) {
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
        this.outputChannel.appendLine(i18nTexts.info.initializing);
        this.outputChannel.appendLine(i18nTexts.warn.CRUD);

        if (this.isDisposed) this.registerEventHandlers();

        this.editor = editor;

        if (workspace && Array.isArray(workspace.workspaceFolders)) {

            this.basePath = (doc.isUntitled)
                ? workspace.workspaceFolders[0].uri.fsPath
                : workspace.getWorkspaceFolder(Uri.file(doc.fileName)).uri.fsPath;

            this.filePath = doc.isUntitled ? '' : doc.fileName;

            this.outputChannel.appendLine(format(i18nTexts.info.cwd, new Date().toLocaleTimeString(), this.basePath));
        }
    }

    async interpret() {
        try {
            if (!this.isClosed) this.close();

            this.decorator.init(this.editor);

            this.repl = spawn('node', serverArguments, { cwd: this.basePath, stdio: stdioOptions })
                .on('message', async result => await this.decorator.update(result))
                .on('error', err => this.outputChannel.appendLine(`[${new Date().toLocaleTimeString()}][REPL Server] ${err.message}`));

            let code = this.editor.document.getText();

            this.outputChannel.appendLine(format(i18nTexts.info.starting, new Date().toLocaleTimeString(), code.length));

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
            this.outputChannel.appendLine(i18nTexts.info.disposing);

        this.repl.send({ operation: 'exit' });
        this.repl = null;
    }
    get isClosed() {
        return this.repl == null;
    }

    dispose() {
        if (!this.isClosed) this.close();

        this.changeActiveDisposable.dispose();
        this.closeTextDocumentDisposable.dispose();
        this.changeEventDisposable.dispose();
        this.editor = null;
    }
    get isDisposed() {
        return this.editor == null;
    }
}