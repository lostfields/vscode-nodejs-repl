# Changelog
All changes done to Node.JS REPL will be kept here, according to [changelog format](http://keepachangelog.com/)

## [0.4.8] - 2018-02-12
### Changed
- Dispose the REPL extension by closing the active document

## [0.4.7] - 2018-01-29
### Changed
- Runs REPL for first document named Untitled-* when opening new project

## [0.4.6] - 2018-01-29
### Changed
- Fixed a bug with import/require from NodeJs API

## [0.4.5] - 2018-01-28
### Added
- Possibility to run REPL for any active javascript editor

## [0.4.4] - 2018-01-14
### Changed
- Interpret code right after deleting multiple lines

## [0.4.3] - 2018-01-13
### Changed
- First try with import of workspace modules

## [0.4.2] - 2018-01-12
### Changed
- Text editor optimizations for drawing results/console

## [0.4.1] - 2018-01-12
### Changed
- Import for global modules only works in debug for extension, not as an extension. Have to look more into this
- Fixing annoying bug where decoration didn't get removed when there was zero results.

## [0.4.0] - 2018-01-11
### Added
- Import for global modules
- Hoover message for result/console

## [0.3.5] - 2018-01-11
### Changes
- Fix for positioning of results when statements returned undefined

## [0.3.4] - 2018-01-11
### Changes
- Fix for promise results and exceptions
- Fix for exceptions in functions

## [0.3.3] - 2018-01-11
### Changes
- Fix for nested method calls in newlines
- Interpretation of code right after first character after a backspace, fast fix

## [0.3.2] - 2018-01-10
### Added
- Console output for Promises
### Changes
- Editor may be placed in split window at right
- Better routines for result/console/error outputs but some more work has to be done here.

## [0.3.1] - 2018-01-10
### Changes
- Fast fix for disposed editor

## [0.3.0] - 2018-01-10
### Added
- Support for result, console logs and errors
### Removed
- Split window since this will take away focus from code

## [0.2.3] - 2018-01-08
### Changes
- Fixing single window mode

## [0.2.2] - 2018-01-07
### Added
- New command for opening only a single window
### Changed
- Experimental code results in source window is only active when in single window mode

## [0.2.1] - 2018-01-07
### Added
- Experimenting with single window by adding result in source window

## [0.2.0] - 2018-01-07
### Added
- Rewriting of 'import' to 'require', to support Node.js v6 and higher
- Parsing when semicolon or new line is typed
- Autoparsing after 2 seconds after inactivity

## [0.1.0] - 2018-01-06
### Added
- Split window with code-results at second window
