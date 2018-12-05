import * as Repl from 'repl';
import * as Util from 'util';
import { Writable, Readable } from 'stream';


type ReplServer = Repl.REPLServer & { inputStream: Readable };

let lineCount = 0;

const server = Repl.start({
    prompt: '',
    input: new Readable({ read: () => { } }),
    output: new Writable({
        write: (chunk, encoding, callback) => {
            let value = chunk.toString().trim();

            if (value !== '' && /^\.{3,}$/.test(value) === false)
                process.send({ line: lineCount, value });

            callback();
        }
    }),
    ignoreUndefined: true,

}) as ReplServer;

const originLog = server.context.console.log;
const appendLineLog = (lineNumber: number, text: any, ...args: any[]) => {
    originLog(`\`{${lineNumber}}\`${typeof text === 'string' ? text : Util.inspect(text)}`, ...args);
}
Object.defineProperty(server.context, '`console`', {
    value: {
        debug: appendLineLog,
        error: appendLineLog,
        info: appendLineLog,
        log: appendLineLog,
        warn: appendLineLog,
    }
});

const lineNumber = /\/\*`(\d+)`\*\//g;

process.on('message', data => {

    if (typeof data.code === 'string') {
        for (let codeLine of data.code.split('\n')) {
            let match: RegExpExecArray;

            while ((match = lineNumber.exec(codeLine)) != null)
                lineCount += +match[1];

            server.inputStream.push(codeLine + '\n');

            lineCount++;
        }
    }
    else if (data.operation === 'exit') {
        process.exit();
    }
});