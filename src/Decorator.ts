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


// create a decorator type that we use to decorate small numbers
const resultDecorationType = window.createTextEditorDecorationType({
    rangeBehavior: DecorationRangeBehavior.ClosedClosed,
    light: {},
    dark: {},
});
const colorMap = {
    Result: 'green',
    Error: 'red',
    Console: '#457abb',
}

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

    async update(result: any) {

        result = (result.type === 'Expression')
            ? await this.formatExpressionValue(result)
            : this.formatTerminalOutput(result);

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

        decorator.renderOptions.before.color = colorMap[result.type];
        decorator.renderOptions.before.contentText = ` ${result.text}`;

        decorator.hoverMessage = new MarkdownString(result.type);
        decorator.hoverMessage.appendCodeblock(
            result.type == 'Console' ? result.value.join('\n') : result.value || result.text,
            'javascript'
        );

        this.decorateAll();
    }
    private async formatExpressionValue(data: any): Promise<{ line?: number, type: 'Result' | 'Error', text: string, value: any }> {
        let result = data.value;
        switch (typeof result) {
            case 'undefined':
                break;

            case 'object':
                if (result.constructor && result.constructor.name === 'Promise' && result.then) {
                    try {
                        return this.formatExpressionValue(Object.assign(data, { value: await Promise.resolve(result) }));
                    } catch (ex) {
                        return {
                            line: data.line,
                            type: 'Error',
                            text: `${ex.name}: ${ex.message}`,
                            value: ex,
                        }
                    }
                }

                return {
                    line: data.line,
                    type: 'Result',
                    text: (Array.isArray(result))
                        ? JSON.stringify(result)
                        : JSON.stringify(result, null, '\t').replace(/\n/g, ' '),
                    value: result,
                }

            default:
                return {
                    line: data.line,
                    type: 'Result',
                    text: result.toString().replace(/\r?\n/g, ' '),
                    value: result,
                }
        }
    }
    private formatTerminalOutput(data: any): { line?: number, type: 'Console' | 'Error', text: string, value: any } {
        let lineCount = data.line;
        let out = data.text;
        let match: RegExpExecArray;

        if ((match = /(\w+:\s.*)\n\s*at\s/gi.exec(out)) != null) {
            this.outputChannel.appendLine(`  ${match[1]}\n\tat line ${lineCount}`);
            return { line: lineCount, type: 'Error', text: match[1], value: match[1] }
        }
        else if ((match = /`\{(\d+)\}`([\s\S]*)/gi.exec(out)) != null) {
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