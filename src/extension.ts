'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import {
    commands,
    ExtensionContext,
    TextDocument,
    TextEditor,
    window,
    workspace,
    ViewColumn,
    Disposable,
} from 'vscode';

import ReplClient from './repl-client';


let outputWindow = window.createOutputChannel("NodeJs REPL");
let registeredCommands: Disposable[];
let client = new ReplClient(outputWindow);
let editor: TextEditor;
let doc: TextDocument;

/**
 * this method is called when your extension is activated
 * your extension is activated the very first time the command is executed
 */
export function activate(context: ExtensionContext) {

    registeredCommands = [
        commands.registerCommand('extension.nodejsRepl', async () => {
            try {
                doc = await workspace.openTextDocument({ content: '', language: 'javascript' });
                editor = await window.showTextDocument(doc, ViewColumn.Active);

                client.init(editor, doc);
                await client.interpret();
            }
            catch (err) {
                outputWindow.appendLine(err);
            }
        }),
        commands.registerCommand('extension.nodejsReplCurrent', async () => {
            try {
                if (window.activeTextEditor && window.activeTextEditor.document.languageId === 'javascript') {
                    doc = window.activeTextEditor.document;
                    editor = await window.showTextDocument(doc, ViewColumn.Active);

                } else {
                    window.showErrorMessage('[Node.js REPL] Selected document is not Javascript, unable to start REPL here.');
                    return;
                }

                client.init(editor, doc);
                await client.interpret();
            } catch (err) {
                outputWindow.appendLine(err);
            }
        }),
        commands.registerCommand('extension.nodejsReplClose', async () => {
            try {
                if (!client.isClosed) {
                    client.close();
                    editor = null;
                    doc = null;
                }
            } catch (err) {
                outputWindow.appendLine(err);
            }
        }),
    ];

    for (let cmd of registeredCommands)
        context.subscriptions.push(cmd);
}

/**
 * this method is called when your extension is deactivated
 */
export function deactivate() {
    outputWindow.dispose();
    client.dispose();
    editor = null;
    doc = null;

    for (let cmd of registeredCommands)
        cmd.dispose();
}