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
const colorOfType = {
    'Value of Expression': 'green',
    'Console': '#457abb',
    'Error': 'red',
}
type Data = { line: number, value: string };
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
        if (!data) return;

        let result = this.format(data);

        this.outputChannel.appendLine(`  ${result.value}`);

        if (result.type === 'Console') {
            result = this.mergeConsoleOutput(result);
        }
        this.updateWith(result);
        this.decorateAll();
    }
    private format({ line, value }: Data): Result {
        let match: RegExpExecArray;

        if ((match = /((\w*Error(?:\s\[[^\]]+\])?:\s.*)(?:\n\s*at\s[\s\S]+)?)$/.exec(value)) != null) {
            return { line, type: 'Error', text: match[1], value: match[2] };
        }
        else if ((match = /^`\{(\d+)\}`([\s\S]*)$/.exec(value)) != null) {
            let value = match[2] || '';
            return { line: +match[1], type: 'Console', text: value.replace(/\r?\n/g, ' '), value };
        }
        else {
            return { line, type: 'Value of Expression', text: value.replace(/\r?\n/g, ' '), value };
        }
    }
    private mergeConsoleOutput({ line, text, value }: Result) {
        let output = this.lineToOutput.get(line);
        if (output == null) {
            this.lineToOutput.set(line, output = { line, type: 'Console', text: '', value: '' });
        }

        output.text += (output.text && ', ') + text;
        output.value += (output.value && '\n') + value;

        return output;
    }
    private updateWith({ line, type, text, value }: Result) {
        let decorator: DecorationOptions;

        if ((decorator = this.lineToDecorator.get(line)) == null) {
            let pos = new Position(line, Number.MAX_SAFE_INTEGER);

            decorator = {
                renderOptions: { before: { margin: '0 0 0 1em' } },
                range: new Range(pos, pos)
            };
            this.lineToDecorator.set(line, decorator);
            this.decorators.push(decorator);
        }

        decorator.renderOptions.before.color = colorOfType[type];
        decorator.renderOptions.before.contentText = ` ${text}`;

        decorator.hoverMessage = new MarkdownString(type)
            .appendCodeblock(value, type === 'Error' ? 'text' : 'javascript');
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