import * as Repl from 'repl';
import * as Util from 'util';
import { Writable, Readable } from 'stream';


type ReplServer = Repl.REPLServer & { inputStream: Readable, eval: ReplEval };
type ReplEval = (cmd: string, context: any, filename: string, cb: (err?: Error, result?: any) => void) => void;

let lineCount = 0;

const server = Repl.start({
    prompt: '',
    input: new Readable({ read: () => { } }),
    output: new Writable({
        write: (chunk, encoding, callback) => {
            let out = chunk.toString().trim();
            switch (out) {
                case '...': break;
                case '': break;
                default:
                    process.send({ line: lineCount, type: 'Terminal', value: out });
                    break;
            }
            callback();
        }
    }),
    ignoreUndefined: true,

}) as ReplServer;


const originEval = server.eval; // keep a backup of original eval
const lineNumber = /\/\*`(\d+)`\*\//gi;

// nice place to read the result in sequence and inject it in the code
server.eval = (cmd, context, filename, callback) => {
    originEval(cmd, context, filename, (err, result) => {
        let match: RegExpExecArray;

        while ((match = lineNumber.exec(cmd)) != null)
            lineCount += +match[1];

        if (result)
            process.send({ line: lineCount, type: 'Expression', value: result });

        callback(err, result);
    });

    lineCount++;
}

const originLog = server.context.console.log;
const appendLineLog = (lineNumber: number, text: any, ...args: any[]) => {
    originLog(`\`{${lineNumber}}\`${typeof text === 'string' ? text : Util.inspect(text)}`, ...args);
}
Object.defineProperty(server.context, '`console`', {
    value: {
        log: appendLineLog,
        debug: appendLineLog,
        error: appendLineLog,
    }
});

process.on('message', data => {
    if (data.code) {
        try {
            for (let line of data.code.split('\n'))
                server.inputStream.push(line + '\n');
        } catch (error) {
            process.emit('error', error);
        }
    } else if (data.operation === 'exit') {
        process.exit();
    }
});