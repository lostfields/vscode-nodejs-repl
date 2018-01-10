# Changelog
All changes done to Node.JS REPL will be kept here, according to [changelog format](http://keepachangelog.com/)

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
