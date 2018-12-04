import { OutputChannel } from "vscode";
import { EventEmitter } from "events";
import { Readable, Writable } from "stream";
import * as Repl from 'repl';
import * as Util from 'util';


export default class NodeRepl extends EventEmitter {
    private replEval: (cmd: string, context: any, filename: string, cb: (err?: Error, result?: string) => void) => void;

    constructor(private outputChannel: OutputChannel) {
        super();
    }

    public async interpret(code: string) {
        try {
            let inputStream = new Readable({ read: () => { } }),
                lineCount = 0;

            let repl = Repl.start({
                prompt: '',
                input: inputStream,
                writer: (out) => {
                    if (out == null) return;
                },
                output: new Writable({
                    write: (chunk, encoding, cb) => {
                        let out = chunk.toString().trim();
                        switch (out) {
                            case 'undefined':
                            case '...':
                            case '':
                                break;

                            default:
                                this.emit('output', { line: lineCount, type: 'Terminal', text: out })
                                break;
                        }
                        cb();
                    }
                }),
            }) as Repl.REPLServer & { eval: (cmd: string, context: any, filename: string, cb: (err?: Error, result?: any) => void) => void };

            if (this.replEval == null)
                this.replEval = repl.eval; // keep a backup of original eval

            // nice place to read the result in sequence and inject it in the code
            repl.eval = (cmd: string, context: any, filename: string, cb: (err?: Error, result?: any) => void) => {

                this.replEval(cmd, context, filename, (err, result: any) => {
                    let regex = /\/\*`(\d+)`\*\//gi,
                        match: RegExpExecArray

                    if (!err) {
                        while ((match = regex.exec(cmd)) != null)
                            lineCount += +match[1];

                        this.emit('output', { line: lineCount, type: 'Expression', value: result });
                    }

                    cb(err, result);
                });

                lineCount++;
            }

            const originLog = repl.context.console.log;
            const appendLineLog = (lineNumber: number, text: any, ...args: any[]) => {
                originLog(`\`{${lineNumber}}\`${typeof text === 'string' ? text : Util.inspect(text)}`, ...args);
            }
            Object.defineProperty(repl.context, '`console`', {
                value: {
                    log: appendLineLog,
                    debug: appendLineLog,
                    error: appendLineLog,
                }
            })

            for (let line of code.split(/\r?\n/)) {
                // tell the REPL about the line of code to see if there is any result coming out of it
                inputStream.push(`${line}\n`);
            }

            inputStream.push(`.exit\n`);
            inputStream.push(null);

            repl.on('exit', () => setTimeout(() => this.emit('exit'), 100));
        } catch (ex) {
            this.outputChannel.appendLine(ex);
        }
    }
}