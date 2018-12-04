import {
    DecorationOptions,
    DecorationRangeBehavior,
    MarkdownString,
    OutputChannel,
    Position,
    Range,
    TextEditor,
    window,
} from "vscode";

import * as Util from 'util';


// create a decorator type that we use to decorate small numbers
const resultDecorationType = window.createTextEditorDecorationType({
    rangeBehavior: DecorationRangeBehavior.ClosedClosed,
    light: {},
    dark: {},
});
const colorOfType = {
    'Value of Expression': 'green',
    'Console': '#457abb',
    'Error': 'red',
}
// TODO: if Node's Version of VSCode >=9.9, use default option
const inspectOptions: NodeJS.InspectOptions = { depth: 20 };

type Data = { line: number, type: 'Expression' | 'Terminal', value: any };
type Result = { line: number, type: 'Value of Expression' | 'Console' | 'Error', text: string, value: string };

export default class Decorator {
    private editor: TextEditor;
    private lineToOutput: Map<number, any> = new Map();
    private lineToDecorator: Map<number, DecorationOptions> = new Map();
    private decorators: DecorationOptions[] = [];

    constructor(private outputChannel: OutputChannel) { }

    init(editor: TextEditor) {
        this.editor = editor;
        this.lineToOutput.clear();
        this.lineToDecorator.clear();
        this.decorators = [];
    }

    async update(data: Data) {

        let result = (data.type === 'Expression')
            ? await this.formatExpressionValue(data)
            : this.formatTerminalOutput(data);

        if (!result) return;

        let decorator: DecorationOptions;

        if ((decorator = this.lineToDecorator.get(result.line)) == null) {
            let line = result.line,
                length = this.editor.document.getText(new Range(new Position(line, 0), new Position(line, 37768))).length + 1,
                pos = new Position(line, length);

            decorator = {
                renderOptions: { before: { margin: '0 0 0 1em' } },
                range: new Range(pos, pos)
            };
            this.lineToDecorator.set(line, decorator);
            this.decorators.push(decorator);
        }

        decorator.renderOptions.before.color = colorOfType[result.type];
        decorator.renderOptions.before.contentText = ` ${result.text}`;

        decorator.hoverMessage = new MarkdownString(result.type);
        decorator.hoverMessage.appendCodeblock(result.value, result.type === 'Error' ? 'text' : 'javascript');

        this.decorateAll();
    }
    private async formatExpressionValue(data: Data): Promise<Result> {
        let result = data.value;
        switch (typeof result) {
            case 'undefined':
                return null;

            case 'object':
                if (result.constructor && result.constructor.name === 'Promise' && result.then) {
                    try {
                        data.value = await (<Promise<any>>result);
                        return data.value ? this.formatExpressionValue(data) : null;
                    } catch (error) {
                        return {
                            line: data.line,
                            type: 'Error',
                            text: `${error.name}: ${error.message}`,
                            value: error.stack,
                        }
                    }
                }

                let string = Util.inspect(result, inspectOptions);
                return {
                    line: data.line,
                    type: 'Value of Expression',
                    text: string.replace(/\n/g, ' '),
                    value: string,
                }

            default:
                return {
                    line: data.line,
                    type: 'Value of Expression',
                    text: result.toString().replace(/\r?\n/g, ' '),
                    value: result,
                }
        }
    }
    private formatTerminalOutput(data: Data): Result {
        let out = data.value as string;
        let match: RegExpExecArray;

        if ((match = /^(\w*Error(?: \[[^\]]+\])?:\s.*)(?:\n\s*at\s)?/.exec(out)) != null) {
            this.outputChannel.appendLine(`  ${out}`);

            return { line: data.line, type: 'Error', text: match[1], value: out };
        }
        else if ((match = /^`\{(\d+)\}`([\s\S]*)$/.exec(out)) != null) {
            let line = +match[1];
            let msg = match[2] || '';

            let output = this.lineToOutput.get(line);
            if (output == null) {
                this.lineToOutput.set(line, output = { line, type: 'Console', text: '', value: '' });
            }

            output.text += (output.text && ', ') + msg.replace(/\r?\n/g, ' ');
            output.value += (output.value && '\n') + msg;

            this.outputChannel.appendLine(`  ${msg}`);
            return output;
        }
        else {
            this.outputChannel.appendLine(`  ${out}`);
        }
    }

    decorateAll() {
        this.decorate(this.decorators);
    }
    decorateExcept(line: number) {
        this.decorate(this.decorators.filter(d => line != d.range.start.line));
    }
    private decorate(decorations: DecorationOptions[]) {
        this.editor.setDecorations(resultDecorationType, decorations);
    }
}