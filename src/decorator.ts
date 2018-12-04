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
// TODO: if Node's Version of VSCode >=9.9, use option `compact`
const inspectOptions = { maxArrayLength: null, depth: null };

type Data = { line: number, type: 'Expression' | 'Terminal', value: any };
type Result = { line: number, type: 'Value of Expression' | 'Console' | 'Error', text: string, value: any };

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
            this.lineToDecorator.set(result.line, decorator);
            this.decorators.push(decorator);
        }

        decorator.renderOptions.before.color = colorOfType[result.type];
        decorator.renderOptions.before.contentText = ` ${result.text}`;

        decorator.hoverMessage = new MarkdownString(result.type);
        decorator.hoverMessage.appendCodeblock(
            result.type === 'Console' ? result.value.join('\n') : result.value || result.text,
            'javascript'
        );

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
                        let value = await Promise.resolve(result);
                        return value ? this.formatExpressionValue(Object.assign(data, { value })) : null;
                    } catch (error) {
                        return {
                            line: data.line,
                            type: 'Error',
                            text: `${error.name}: ${error.message}`,
                            value: error,
                        }
                    }
                }

                let string = Util.inspect(result, inspectOptions);
                return {
                    line: data.line,
                    type: 'Value of Expression',
                    text: string,
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

        if ((match = /(\w*Error:\s.*)(?:\n\s*at\s)?/g.exec(out)) != null) {
            this.outputChannel.appendLine(`  ${match[1]}\n\tat line ${data.line}`);

            return { line: data.line, type: 'Error', text: match[1], value: match[1] };
        }
        else if ((match = /^`\{(\d+)\}`([\s\S]*)$/g.exec(out)) != null) {
            let line = +match[1];
            let msg = match[2] || '';

            let output = this.lineToOutput.get(line);
            if (output == null) {
                this.lineToOutput.set(+match[1], output = { line, type: 'Console', text: '', value: [] });
            }

            output.text += (output.text === '' ? '' : ', ') + msg.replace(/\r?\n/g, ' ');
            output.value.push(msg);

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