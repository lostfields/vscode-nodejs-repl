# Node.js Interactive window (REPL)

Node.js Interactive Window (REPL) for Visual Studio Code using Node.js command line right in your favorite IDE. Simply press CTRL + SHIFT + P and launch "Node.js Interactive window (REPL)". 

This is a preview and I would really love some feedback if something is not working as it should. 

## Features

Both "return" values and console.log is supported, just as in Node.js REPL since that is used behind the scenes.

![Screenshot of Node.js Interactive window (REPL)](./preview.gif)

## Requirements

This extension requires Node.js v6+, but only tested with Node 7+

## Known Issues

Note, this is a preview so please report any bugs 
- Backspace will remove all decorators, more than necessary. Will look into it. 
- Nested method calls has to be in one line, so never start a new line with dot for now. For example don't type newline between 'Promise' and 'resolve(5)' etc, and between '[1,2,3]' and '.join(",")' and so on.

## Future developement

Some want all, but right now I think it's working good. I want to look into implementing this though;
- Fix of nested method calls in seperate lines
- Import/Require of local files and external modules
- Support for async/await

## Release Notes

### 0.3.2
- Only single window with support for console, result and error
- Console output for Promises
- Note; nested keep nested method calls in a new line (eg. never start a new line with dot).

### 0.2.3

- Experimenting with single window instead of split window

### 0.2.0

- Rewrite for import to require, to support Node.js v6+
- Parsing when semicolon or new line is typed
- Autoparsing after 2s after inactivity

### 0.1.0

- Initial release