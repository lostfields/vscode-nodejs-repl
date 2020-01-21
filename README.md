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

## Future developement

Some want all, but right now I think it's working good. I want to look into implementing this though;
- Import/require of external files/modules

## Release Notes

### 0.5.14
- few bugfixes after errors is thrown different in newer NodeJs
- fixing circular references in serializer
- output fixes (thanks @plylrnsdy)
- require should probably work better (thanks @plylrnsdy)
- console.log with multiline
- ... and a few more

### 0.4.9
- Small output fixes (thanks @nchursin)
- Added console methods
- Added a stop command
- Import of workspace modules + a bugfix for importing from NodeJs API
- Text editor optimizations for drawing results/console
- Annoying bug where error/result didn't get removed when there was an empty document
- Hoover message for result/console
- Possibility to run REPL for any active javascript editor
- Runs REPL for first document named Untitled-* when opening new project with opened documents
- Dispose REPL by closing the active document

### 0.3.6
- Only single window with support for console, result and error
- Console output for Promises
- Fix for nested methods call in newlines.
- Fix for promise results and exceptions
- Fix for exceptions in functions
- Fix for positioning of results when statements returned undefined

### 0.2.3

- Experimenting with single window instead of split window

### 0.2.0

- Rewrite for import to require, to support Node.js v6+
- Parsing when semicolon or new line is typed
- Autoparsing after 2s after inactivity

### 0.1.0

- Initial release