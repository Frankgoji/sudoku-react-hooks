## Sudoku React Component

A configurable sudoku board using React Hoosk for creating various sudoku
puzzles and solving them. Board dimensions, the cell groups, the colors of the
groups, the colors of the cells, the style of the guesses, are all
configurable.

Supports saving to a JSON file, and loading from a JSON file.

Supports validation of a default sudoku board as well as the sudoku variations
that are on [Websudoku Variations](https://www.websudoku.com/variations).

Can navigate around the board with arrow keys, and supports wrapping around the
edges of the board.

### Usage

You can import the Sudoku component from sudoku.js to use in your own components.

You can also build this project with `npm run build` and link it in an HTML file
to render the Sudoku board. The example HTML file would look something like this:

```
<html>
<head>
    <title>Sudoku</title>
    <link rel="stylesheet" type="text/css" href="sudoku.css"/>
</head>
<body>
    <center>
        <div id="sudoku"></div>
    </center>
    <script src="index.js"></script>
</body>
</html>
```

You may find a live demo of this at https://frankgoji.github.io/sudoku/
