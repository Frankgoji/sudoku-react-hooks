import React, {
    useState,
    useRef,
    useImperativeHandle,
    useEffect
} from 'react';
import {
    Controls,
    useEventListener,
    useInterval
} from './common.js';

const LOCATIONS = {
    UPPER_RIGHT: 'up-right',
    UPPER_LEFT: 'up-left',
    LOWER_RIGHT: 'down-right',
    LOWER_LEFT: 'down-left',
};

const SUDOKU_TYPES = {
    '12 x 12': '12x12',
    '16 x 16': '16x16',
    'Samurai': 'samurai',
    'Squiggly': 'squiggly',
    'X': 'x',
    'Default': 'default',
    'Other': 'other'
};

const VALIDATION_MSGS = {
    'valid': 'No errors detected since last validation.',
    'error': 'An error was detected on the sudoku board.'
};

const SELECT_TYPE = {
    DEFAULT: 'default',
    ADD: 'add',
    SUB: 'sub'
};

const UNDO = {
    FULL: 'full',
    DIFF: 'diff'
};

/**
 * Returns time in seconds as a string formatted as hh:mm:ss.
 */
const pad = t => `${Math.floor(t)}`.padStart(2, '0');
const displayTime = t => `${t >= 60 * 60 ? pad(t / 60 / 60) + ':' : ''}${pad((t / 60) % 60)}:${pad(t % 60)}`;

/**
 * Assuming a rectangular sudoku board with regular groups of a set width and
 * height, calculate the index of the group of the cell at [r, c].
 */
const getGroup = (r, c, gHeight, gWidth, dimensions) => {
    const [height, width] = dimensions;
    const [numCols, numRows] = [width / gWidth, height / gHeight];
    return Math.floor(c / gWidth) + numCols * Math.floor(r / gHeight);
};

const CURR_VER = 1.5;

/**
 * A configurable sudoku board.
 * Dimensions, the cell groups, the colors of the groups, the colors of the
 * cells, the style of the guesses, are all configurable.
 * Supports saving to a JSON file, and loading from a JSON file.
 * Supports validation of a default sudoku board as well as the sudoku
 * variations that are on websudoku.org/variation.
 * Can navigate around the board with arrow keys.
 * Props:
 * showVariations - bool to show a link to websudoku.com/variations, default false
 */
export const Sudoku = (props) => {
    const [config, setConfig] = useState({
        version: CURR_VER,
        dimensions: [9, 9],
        cells: [],
        groups: [],
        guesses: [
            {
                color: '#ffffff',
                isSmall: false,
                editable: false
            },
            {
                color: '#ff0000',
                isSmall: false,
                editable: true
            },
            {
                color: '#ff0000',
                isSmall: true,
                editable: true
            }
        ],
        type: SUDOKU_TYPES['Default'],
        elapsed: 0
    });
    const [currGuess, setCurrGuess] = useState(0);
    const [chooseCells, setChooseCells] = useState(undefined);
    const [selectedCells, setSelectedCells] = useState([]);
    const [validationState, setValidationState] = useState(undefined);
    const [validationHidden, setValidationHidden] = useState(false);

    const fileRef = useRef(null);
    const boardRef = useRef(null);
    const rootRef = useRef(null);

    const [timerStarted, setTimerStarted] = useState(false);
    const [inFocus, setInFocus] = useState(true);
    useEventListener('focus', window, true, () => setInFocus(true));
    useEventListener('blur', window, true, () => setInFocus(false));
    useInterval(() => {
        // If incrementElapsed (window in focus and started timer), increment
        setConfig({...config, elapsed: config.elapsed + 1});
    }, 1000, inFocus && timerStarted, false);

    useEffect(() => {
        resetGroups(config, true);
    }, []);

    const cellOrDiv = (r, c) => {
        const guessIndex = config.cells[r][c].guess;
        const readOnly = guessIndex !== -1
            && currGuess !== guessIndex
            && !config.guesses[guessIndex].editable;
        return readOnly ? 'div' : 'cell';
    };

    const setGuesses = (guesses) => {
        setConfig({...config, guesses});
    };

    const deleteGuess = (i) => {
        const newConfig = {...config};
        newConfig.guesses.splice(i, 1);
        for (const row of newConfig.cells) {
            for (const cell of row) {
                // Set cells with guess i to i - 1, and decrement guesses above i
                if (cell.guess >= i) {
                    cell.guess = Math.max(0, cell.guess - 1);
                }
            }
        }
        setConfig(newConfig);
    };

    /* If a cell has this guess, set val to '' */
    const clearGuess = (i) => {
        const newConfig = {...config};
        const prevCells = JSON.parse(JSON.stringify(config.cells));
        for (const row of newConfig.cells) {
            for (const cell of row) {
                if (cell.guess === i) {
                    cell.val = '';
                    cell.guess = -1;
                }
            }
        }
        addUndoFull(prevCells, newConfig.cells);
        setConfig(newConfig);
        validate(newConfig);
    };

    /* Calculate which letter to show for the value */
    const diff = (oldVal, newVal) => {
        if (newVal.length >= oldVal.length) {
            for (const l of newVal) {
                if (!oldVal.includes(l)) {
                    return l;
                }
            }
        }
        return newVal[newVal.length - 1];
    };

    const cellValCallback = (r, c, val) => {
        if (!timerStarted && currGuess === 1 && config.type !== SUDOKU_TYPES['Other']) {
            setTimerStarted(true);
        }
        const prevVal = config.cells[r][c].val;
        const newConfig = {...config};
        const guess = val === '' ? -1 : currGuess;
        const isSmall = guess !== -1 && newConfig.guesses[guess].isSmall;
        newConfig.cells[r][c].val = val.length > 1 && !isSmall
            ? diff(prevVal, val)
            : isSmall
                ? val.split('').sort().join('')
                : val;
        newConfig.cells[r][c].guess = guess;
        setConfig(newConfig);
        addUndoDiff([r, c], prevVal, newConfig.cells[r][c].val);
        validate(newConfig);
    };


    const dimensionsCallback = (height, width, defaultBoard) => {
        const newConfig = {...config};
        newConfig.dimensions = [height, width];
        resetGroups(newConfig, defaultBoard);
    };

    const resetGroups = (config, defaultBoard) => {
        const newConfig = {...config};
        const [height, width] = newConfig.dimensions;
        newConfig.cells = [];
        newConfig.groups = [];
        for (let i = 0; i < height; i++) {
            const row = [];
            for (let j = 0; j < width; j++) {
                row.push({
                    val: '',
                    guess: -1,
                    group: defaultBoard ? getGroup(i, j, 3, 3, newConfig.dimensions) : 0
                });
            }
            newConfig.cells.push(row);
            if (defaultBoard) {
                newConfig.groups.push({color: '#000000'});
            }
        }
        if (!defaultBoard) {
            newConfig.groups.push({color: '#000000'});
        }
        setConfig(conf => newConfig);
    };

    const groupCallback = (i, color) => {
        const newConfig = {...config};
        newConfig.groups[i].color = color;
        setConfig(newConfig);
    };

    const deleteGroup = (i) => {
        const newConfig = {...config};
        newConfig.groups.splice(i, 1);
        for (const row of newConfig.cells) {
            for (const cell of row) {
                // Set cells with group i to i - 1, and decrement groups above i
                if (cell.group >= i) {
                    cell.group = Math.max(0, cell.group - 1);
                }
            }
        }
        setConfig(newConfig);
    };

    const addGroup = () => {
        setConfig(conf => ({...conf, groups: [...conf.groups, {color: '#000000'}]}));
    };

    const chooseCell = (i) => {
        const newConfig = {...config};
        const newSelectedCells = [];
        if (i !== undefined) {
            for (const [r, row] of newConfig.cells.entries()) {
                for (const [c, cell] of row.entries()) {
                    if (cell.group === i) {
                        newSelectedCells.push([r, c]);
                    }
                }
            }
        } else if (chooseCells !== 'cells') {
            for (const cell of selectedCells) {
                const [r, c] = cell;
                newConfig.cells[r][c].group = chooseCells;
            }
            for (const [r, row] of newConfig.cells.entries()) {
                for (const [c, cell] of row.entries()) {
                    if (cell.group === chooseCells &&
                        selectedCells.findIndex(cell => cell[0] === r && cell[1] === c) === -1) {
                        cell.group = chooseCells + 1;
                        if (chooseCells + 1 === newConfig.groups.length) {
                            newConfig.groups.push({color: '#000000'});
                        }
                    }
                }
            }
        }
        setChooseCells(i);
        setSelectedCells(newSelectedCells);
        setConfig(newConfig);
    };

    const selectedCellsCB = (cell, selectChoice = SELECT_TYPE.DEFAULT, dragCells = undefined) => {
        const newSelectedCells = [...selectedCells];
        if (dragCells !== undefined) {
            if (selectChoice === SELECT_TYPE.ADD) {
                newSelectedCells.push(...dragCells);
            } else if (selectChoice === SELECT_TYPE.SUB) {
                newSelectedCells = newSelectedCells.filter(c1 => {
                    return dragCells.findIndex(c2 => c1[0] === c2[0] && c1[1] === c2[1]) === -1;
                });
            }
        } else {
            const [r, c] = cell;
            const index = newSelectedCells.findIndex(n => n[0] === r && n[1] === c);
            if (index === -1) {
                newSelectedCells.push(cell);
            } else if (index !== -1) {
                newSelectedCells.splice(index, 1);
            }
        }
        setSelectedCells(newSelectedCells);
    };

    const setCellsColor = (color) => {
        const newSelectedCells = [...selectedCells];
        const newConfig = {...config};
        if (color) {
            for (const cell of newSelectedCells) {
                const [r, c] = cell;
                newConfig.cells[r][c].color = color;
            }
        } else {
            for (const cell of newSelectedCells) {
                const [r, c] = cell;
                delete newConfig.cells[r][c].color;
            }
        }
        setConfig(newConfig);
    };

    const setGroups = (cellHeight, cellWidth) => {
        setConfig(conf => {
            const newConfig = {...conf};
            for (const [r, row] of newConfig.cells.entries()) {
                for (const [c, cell] of row.entries()) {
                    cell.group = getGroup(r, c, cellHeight, cellWidth, newConfig.dimensions);
                }
            }
            return newConfig;
        });
    };

    const setType = (type) => {
        switch (type) {
            case SUDOKU_TYPES['12 x 12']:
                dimensionsCallback(12, 12, false);
                for (let i = 0; i < 11; i++) {
                    addGroup();
                }
                setGroups(3, 4);
                break;
            case SUDOKU_TYPES['16 x 16']:
                dimensionsCallback(16, 16, false);
                for (let i = 0; i < 15; i++) {
                    addGroup();
                }
                setGroups(4, 4);
                break;
            case SUDOKU_TYPES['X']:
                dimensionsCallback(9, 9, true);
                const xCoords = [];
                for (let i = 0; i < 9; i++) {
                    xCoords.push([i, i]);
                    xCoords.push([i, 8 - i]);
                }
                setConfig(conf => {
                    const newConfig = {...conf};
                    for (const [r, c] of xCoords) {
                        newConfig.cells[r][c].color = '#212121';
                    }
                    return newConfig;
                });
                break;
            case SUDOKU_TYPES['Samurai']:
                dimensionsCallback(21, 21, false);
                setConfig(conf => {
                    const newConfig = {...conf};
                    newConfig.groups = [
                        { 'color': '#000000' },
                        { 'color': '#000000' },
                        { 'color': '#2f4f4f' }
                    ];
                    const shadedGroups = [3, 10, 21, 22, 26, 27, 38, 45];
                    for (const [r, row] of newConfig.cells.entries()) {
                        for (const [c, cell] of row.entries()) {
                            const groupNum = getGroup(r, c, 3, 3, newConfig.dimensions);
                            const isShaded = shadedGroups.indexOf(groupNum) !== -1;
                            cell.group = isShaded
                                ? 2             // the shaded third group
                                : groupNum % 2; // one of the first 2 groups
                            if (isShaded) {
                                cell.guess = 0; // make shaded not editable
                            }
                        }
                    }
                    return newConfig;
                });
                break;
            case SUDOKU_TYPES['Default']:
                dimensionsCallback(9, 9, true);
                break;
            default:
                break;
        }
        setConfig(conf => ({...conf, type}));
        resetUndo();
    };

    const save = () => {
        const a = document.createElement('a');
        const file = new Blob([JSON.stringify(config, null, 2)], {type: 'application/json'});
        a.href = URL.createObjectURL(file);
        a.download = config.fileName || 'sudoku.json';
        a.click();
    };

    const load = () => {
        const file = fileRef.current.files[0];
        file.text().then(text => {
            const newConfig = JSON.parse(text);
            newConfig.fileName = file.name;
            setConfig(upgrade(newConfig));
            resetUndo();
        });
    };

    const upgrade = (config) => {
        const version = config.version || 1.0;
        if (version < 1.1) {
            // convert to current guess style
            for (const row of config.cells) {
                for (const cell of row) {
                    cell.guess = cell.isGuess ? 1 : 0;
                    delete cell.isGuess;
                }
            }
            config.guesses = [
                {
                    color: '#ffffff',
                    isSmall: false,
                    editable: false
                },
                {
                    color: '#ff0000',
                    isSmall: false,
                    editable: true
                }
            ];
        }
        if (version < 1.2) {
            // convert all colors to hex
            const knownColors = {};
            const rgb2Hex = (rgb) => {
                const res = /rgb\(([\d]{1,3}), ([\d]{1,3}), ([\d]{1,3}).*\)/.exec(rgb);
                let hex = '#';
                if (res) {
                    for (const [i, match] of Object.entries(res)) {
                        if (Number(i) !== 0) {
                            const n = parseInt(match).toString(16);
                            hex += n.length === 1 ? '0' + n : n;
                        }
                    }
                    return hex;
                }
            };
            const getColor = (color) => {
                if (knownColors.color) {
                    return knownColors.color;
                }
                const d = document.createElement('div');
                d.style.color = color;
                document.body.appendChild(d);
                const rgbColor = window.getComputedStyle(d).color;
                document.body.removeChild(d);
                return rgb2Hex(rgbColor);
            };
            for (const group of config.groups) {
                group.color = getColor(group.color);
            }
            for (const guess of config.guesses) {
                guess.color = getColor(guess.color);
            }
        }
        if (version < 1.3) {
            // add type of sudoku, default to Default
            if (!config.type) {
                config.type = SUDOKU_TYPES['Default'];
            }
        }
        if (version < 1.4) {
            // add "editable" field to guesses
            for (const guess of config.guesses) {
                if (guess.editable === undefined) {
                    guess.editable = true;
                }
            }
        }
        if (version < 1.5) {
            // add new default guess for small guesses
            // in order to add new guess in right place, it should be index 2, and shift cell guesses appropriately
            config.guesses.splice(2, 0, {
                color: '#ff0000',
                isSmall: true,
                editable: true
            });
            for (const row of config.cells) {
                for (const cell of row) {
                    if (cell.guess >= 2) {
                        cell.guess += 1;
                    }
                }
            }

            // add elapsed field
            config.elapsed = 0;
        }
        config.version = CURR_VER;
        return config;
    };

    const validate = (c) => {
        const newConfig = c ? {...c} : {...config};
        if (newConfig.type === SUDOKU_TYPES['Other']) {
            return;
        }
        // clear errors at start of validate
        for (const row of newConfig.cells) {
            for (const cell of row) {
                cell.error = undefined;
            }
        }

        /**
         * Default validate, generic validation method.
         * @param ops.firstSquare: coords [height, width] for the first square, maps
         *     the board to validate from this square
         * @param ops.sideLength: length of a side, determines how many rows and
         *     cols to check. Assumes the board is square
         * @param ops.groups: if it's lengths (such as 3x3 or 3x4 or 4x4) then its
         *     the group dimensions to validate. If not, then for each group in
         *     this.state.config.groups validate
         */
        const ops = {firstSquare: [0, 0], sideLength: 9, groups: [3, 3]};
        const isSmallGuess = (cell) => cell.guess !== -1 && newConfig.guesses[cell.guess].isSmall;
        const allUnique = (cellList) => {
            const list = cellList.map(cell => isSmallGuess(cell) ? '' : cell.val);
            const isUnique = new Set(list.map((v, i) => v !== '' ? v : i)).size === list.length;
            if (!isUnique) {
                for (const cell of cellList) {
                    cell.error = true;
                }
            }
            return isUnique;
        };
        const defaultValidate = (ops) => {
            const {sideLength, groups} = ops;
            const [firstRow, firstCol] = ops.firstSquare
            let isValid = true;
            let isFilled = true;
            // validate all rows
            const rowSlice = newConfig.cells.slice(firstRow, firstRow + sideLength);
            for (const fullRow of rowSlice) {
                const row = fullRow.slice(firstCol, firstCol + sideLength);
                isValid = allUnique(row) && isValid;
                // Empty cells or filled with small guesses are "not filled"
                isFilled = isFilled && row.find(cell => cell.val === '' || isSmallGuess(cell)) === undefined;
            }
            // validate all cols
            for (let c = firstCol; c < firstCol + sideLength; c++) {
                const col = rowSlice.map(row => row[c]);
                isValid = allUnique(col) && isValid;
            }
            // validate all groups
            let cellGroups = [];
            if (groups !== undefined) {
                // go group by group defined by the group dimensions
                const [groupHeight, groupWidth] = groups;
                const numGroups = ((firstRow + sideLength) / groupHeight) * ((firstCol + sideLength) / groupWidth);
                for (let i = 0; i < numGroups; i++) {
                    cellGroups.push([]);
                }
                for (const [r, fullRow] of Object.entries(rowSlice)) {
                    const row = fullRow.slice(firstCol, firstCol + sideLength);
                    for (const [c, cell] of Object.entries(row)) {
                        const g = Math.floor((Math.floor(Number(r) / groupHeight) * sideLength + Number(c)) / groupWidth);
                        cellGroups[g].push(cell);
                    }
                }
            } else {
                // go by the groups defined by the cells' group value
                cellGroups = newConfig.groups.map(g => []);
                for (const row of newConfig.cells) {
                    for (const cell of row) {
                        cellGroups[cell.group].push(cell);
                    }
                }
            }
            for (const grp of cellGroups) {
                isValid = allUnique(grp) && isValid;
            }
            return [isValid, isFilled];
        };

        if (newConfig.type === SUDOKU_TYPES['12 x 12']) {
            ops.sideLength = 12;
            ops.groups = [3, 4];
        } else if (newConfig.type === SUDOKU_TYPES['16 x 16']) {
            ops.sideLength = 16;
            ops.groups = [4, 4];
        } else if (newConfig.type === SUDOKU_TYPES['Squiggly']) {
            ops.groups = undefined;
        }
        let [isValid, isFilled] = defaultValidate(ops);
        if (newConfig.type === SUDOKU_TYPES['X']) {
            const x1 = [], x2 = [];
            for (let i = 0; i < 9; i++) {
                x1.push(newConfig.cells[i][i]);
                x2.push(newConfig.cells[i][8 - i]);
            }
            const x1Valid = allUnique(x1);
            const x2Valid = allUnique(x2);
            isValid = isValid && x1Valid && x2Valid;
        }
        if (newConfig.type === SUDOKU_TYPES['Samurai']) {
            // above validate checks the first board, validate the other 4
            const initialCells = [[0, 12], [6, 6], [12, 0], [12, 12]];
            for (const initialCell of initialCells) {
                ops.firstSquare = initialCell;
                const [sectionValid, sectionFilled] = defaultValidate(ops);
                isValid = sectionValid && isValid;
                isFilled = sectionFilled && isFilled;
            }
        }
        if (isValid) {
            setValidationState(VALIDATION_MSGS.valid);
            if (isFilled) {
                setTimeout(() =>
                    alert('Congratulations! You completed the sudoku puzzle!\nTime: ' + displayTime(newConfig.elapsed)),
                    250
                );
                setTimerStarted(false);
            }
        } else {
            setValidationState(VALIDATION_MSGS.error);
        }
        setConfig(newConfig);
    };

    const hideValidate = () => {
        setValidationHidden(validationHidden => !validationHidden);
    };

    const [undoHistory, setUndoHistory] = useState([]);
    const [undoIndex, setUndoIndex] = useState(-1);

    const undo = () => {
        if (undoIndex > -1) {
            const currUndo = undoHistory[undoIndex];
            const {type} = currUndo;
            if (type === UNDO.FULL) {
                const newConfig = {...config, cells: [...currUndo.prevCells]};
                setConfig(newConfig);
                validate(newConfig);
            } else {
                const { coords, prevVal } = currUndo;
                const [r, c] = coords;
                const prevCells = [...config.cells];
                prevCells[r][c].val = prevVal;
                const newConfig = {...config, cells: prevCells};
                setConfig(newConfig);
                validate(newConfig);
                document.getElementById(`${cellOrDiv(r, c)}_${r}_${c}`).focus();
            }
            setUndoIndex(undoIndex - 1);
        }
    };

    const redo = () => {
        if (undoIndex < undoHistory.length - 1) {
            const newUndoIndex = undoIndex + 1;
            setUndoIndex(newUndoIndex);
            const currUndo = undoHistory[newUndoIndex];
            const {type} = currUndo;
            if (type === UNDO.FULL) {
                const newConfig = {...config, cells: [...currUndo.newCells]};
                setConfig(newConfig);
                validate(newConfig)
            } else {
                const { coords, newVal } = currUndo;
                const [r, c] = coords;
                const newCells = [...config.cells];
                newCells[r][c].val = newVal;
                const newConfig = {...config, cells: newCells};
                setConfig(newConfig);
                validate(newConfig)
                document.getElementById(`${cellOrDiv(r, c)}_${r}_${c}`).focus();
            }
        }
    };

    const addUndoFull = (prevCells, newCells) => {
        const newUndo = undoHistory.slice(0, undoIndex + 1).concat({
            type: UNDO.FULL,
            prevCells: [...prevCells],
            newCells: [...newCells]
        });
        setUndoHistory(newUndo);
        setUndoIndex(undoIndex + 1);
    };

    const addUndoDiff = (coords, prevVal, newVal) => {
        const newUndo = undoHistory.slice(0, undoIndex + 1).concat({
            type: UNDO.DIFF,
            coords,
            prevVal,
            newVal
        });
        setUndoHistory(newUndo);
        setUndoIndex(undoIndex + 1);
    };

    const resetUndo = () => {
        setUndoHistory([]);
        setUndoIndex(-1);
    };

    return (
        <div className="root"
             onMouseUp={boardRef.current && ((e) => boardRef.current.onMouseUp(e))}
             ref={rootRef} >
            {props.showVariations && (
                <div>
                    <a href="https://www.websudoku.com/variations">Variations</a>
                </div>
            )}
            <div>
                <Board ref={boardRef}
                       config={config}
                       cellValCallback={cellValCallback}
                       chooseCells={chooseCells}
                       selectedCells={selectedCells}
                       selectedCellsCB={selectedCellsCB}
                       validationHidden={validationHidden}
                       currGuess={currGuess}
                       setCurrGuess={setCurrGuess}
                       rootRef={rootRef}
                       undo={undo}
                       redo={redo} />
            </div>
            <div>
                <SudokuControls guesses={config.guesses}
                                currGuess={currGuess}
                                setGuesses={setGuesses}
                                setCurrGuess={setCurrGuess}
                                deleteGuess={deleteGuess}
                                clearGuess={clearGuess}
                                dimensions={config.dimensions}
                                dimensionsCallback={dimensionsCallback}
                                groups={config.groups}
                                groupCallback={groupCallback}
                                deleteGroup={deleteGroup}
                                addGroup={addGroup}
                                chooseCell={chooseCell}
                                deselectAll={() => setSelectedCells([])}
                                setCellsColor={setCellsColor}
                                type={config.type}
                                setType={setType}
                                validate={validate}
                                validationHidden={validationHidden}
                                hideValidate={hideValidate}
                                validationState={validationState}
                                fileName={config.fileName}
                                fileRef={fileRef}
                                save={save}
                                load={load} />
            </div>
        </div>
    );
};

/**
 * Defines the sudoku board. Contains cells which can have borders, shading, and
 * a number within.
 * Props:
 * config - object which contains the config for the board
 * {
 *     version: float (curr version 1.1),
 *     dimensions: [height, width],
 *     cells:       list of list of cells, with the correct dimensions
 *     [
 *         [
 *             {
 *                 val: n | '',
 *                 guess: i,
 *                 group: i
 *             },
 *             ...
 *         ],
 *         ...
 *     ],
 *     groups:      the list of groups
 *     [
 *         {
 *             color: string
 *         }
 *     ],
 *     guesses:     the list of guesses
 *     [
 *         {
 *             color: string,
 *             isSmall: false | true (default false),
 *             editable: false | true (default true)
 *         }
 *     ]
 * }
 * cellValCallback - set cell val
 * chooseCells - cell chosen
 * selectedCells - list of selected cells
 * selectedCellsCB - set selected cells
 * validationHidden - bool if validation is hidden
 * currGuess - current guess
 * setCurrGuess - set current guess
 * rootRef - reference to the root div
 */
const Board = React.forwardRef((props, ref) => {
    const [dragging, setDragging] = useState(false);
    const [initialCoord, setInitialCoord] = useState([0, 0]);
    const [secondCoord, setSecondCoord] = useState([0, 0]);
    const [dragType, setDragType] = useState(SELECT_TYPE.ADD);
    const [dragSelection, setDragSelection] = useState([]);
    const [upperLeft, setUpperLeft] = useState([0, 0]);
    const [lowerRight, setLowerRight] = useState([0, 0]);

    /* To preserve interface with Cell, use a single set state function that
     * maps to the useState setter functions. In this case most of the state
     * calls don't require merging state so this shouldn't affect downstream.
     */
    const setBoardState = (state) => {
        const setMap = {
            'dragging': setDragging,
            'initialCoord': setInitialCoord,
            'secondCoord': setSecondCoord,
            'dragType': setDragType,
            'dragSelection': setDragSelection,
            'upperLeft': setUpperLeft,
            'lowerRight': setLowerRight
        };
        for (const prop in state) {
            setMap[prop](state[prop]);
        }
    };

    const invisStyle = {
        position: 'absolute',
        display: 'block',
        top: 0,
        left: 0,
        width: 0,
        height: 0
    };
    const invisRef = useRef(null);

    const checkCells = () => {
        if (props.chooseCells === undefined) {
            return;
        }
        const [x1, y1] = initialCoord;
        const [x2, y2] = secondCoord;
        const [uX, uY] = upperLeft;
        const [lX, lY] = lowerRight;

        if (uX === 0 && uY === 0 && lX === 0 && lY === 0) {
            return;
        }

        const [cellHeight, cellWidth] = props.config.dimensions.map((dim, i) =>
            (lowerRight[i] - upperLeft[i]) / dim);
        const [firstR, firstC] = [
            Math.floor((Math.min(y1, y2) - uY) / cellHeight),
            Math.floor((Math.min(x1, x2) - uX) / cellWidth)
        ];
        const [secondR, secondC] = [
            Math.floor((Math.max(y1, y2) - uY) / cellHeight),
            Math.floor((Math.max(x1, x2) - uX) / cellWidth)
        ];
        const inDrag = [];
        for (let r = firstR; r <= secondR; r++) {
            for (let c = firstC; c <= secondC; c++) {
                const chosenIndex = props.selectedCells.findIndex(cell => cell[0] === r && cell[1] === c);
                const chosen = chosenIndex !== -1;
                if (dragType === SELECT_TYPE.SUB || !chosen) {
                    inDrag.push([r, c]);
                }
            }
        }
        setDragSelection(inDrag);
    };

    const onMouseMove = (e) => {
        const [x, y] = [e.pageX, e.pageY];
        const [x1, y1] = initialCoord;
        const [uX, uY] = upperLeft;
        const [lX, lY] = lowerRight;
        if (props.chooseCells === undefined) {
            return;
        }
        if (uX === 0 && uY === 0 && lX === 0 && lY === 0) {
            return;
        }

        const [cellHeight, cellWidth] = props.config.dimensions.map((dim, i) =>
            (lowerRight[i] - upperLeft[i]) / dim);
        const [r1, c1] = [
            Math.floor((y1 - uY) / cellHeight),
            Math.floor((x1 - uX) / cellWidth)
        ];
        const [r, c] = [
            Math.floor((y - uY) / cellHeight),
            Math.floor((x - uX) / cellWidth)
        ];
        const newDragging = dragging || !(r === r1 && c === c1);
        if ((x !== window.scrollX || y !== window.scrollY) && newDragging) {
            setDragging(true);
            setSecondCoord([x, y]);
            setDragType(e.ctrlKey ? SELECT_TYPE.SUB : SELECT_TYPE.ADD);
            checkCells();
        }
    };
    // bool to set whether the onMouseMove event listener should be added
    const [listenMouseMoveEvt, setListenMouseMoveEvt] = useState(false);
    useEventListener('mousemove', document, listenMouseMoveEvt, onMouseMove);

    const listenMouseMove = () => {
        setListenMouseMoveEvt(true);
    };

    const onMouseUp = (e) => {
        const currDragging = dragging;
        setListenMouseMoveEvt(false);
        setDragging(false);
        setInitialCoord([0, 0]);
        setSecondCoord([0, 0]);
        if (currDragging) {
            props.selectedCellsCB(undefined, dragType, dragSelection);
        }
        e.stopPropagation();
    };

    // Add handles to functions that need to be called in Sudoku
    useImperativeHandle(ref, () => ({
        onMouseMove,
        onMouseUp
    }));

    const [x1, y1] = initialCoord;
    const [x2, y2] = secondCoord;
    const rootTop = props.rootRef.current
        ? props.rootRef.current.getBoundingClientRect().top + window.scrollY
        : 0;
    const rootLeft = props.rootRef.current
        ? props.rootRef.current.getBoundingClientRect().left + window.scrollX
        : 0;
    const selectBoxStyle = {
        position: 'absolute',
        top: Math.min(y1, y2) - rootTop,
        left: Math.min(x1, x2) - rootLeft,
        width: Math.abs(x1 - x2),
        height: Math.abs(y1 - y2),
        zIndex: 1,
        border: '2px dashed #cdb3e3',
        visibility: dragging ? 'visible' : 'hidden'
    };
    return (
        <div>
            {props.config.cells.map((row, r) => {
                return (
                    <div className="sudoku_row" key={`row${r}`}>
                        {row.map((cell, c) => {
                            return (
                                <Cell config={cell}
                                      coords={[r, c]}
                                      key={`cell ${r}, ${c}`}
                                      board={props.config}
                                      dimensions={props.config.dimensions}
                                      cellValCallback={props.cellValCallback}
                                      chooseCells={props.chooseCells}
                                      selectedCells={props.selectedCells}
                                      selectedCellsCB={props.selectedCellsCB}
                                      validationHidden={props.validationHidden}
                                      invisRef={invisRef}
                                      setBoardState={setBoardState}
                                      initialCoord={initialCoord}
                                      secondCoord={secondCoord}
                                      upperLeft={upperLeft}
                                      lowerRight={lowerRight}
                                      dragging={dragging}
                                      dragType={dragType}
                                      dragSelection={dragSelection}
                                      checkCells={checkCells}
                                      currGuess={props.currGuess}
                                      setCurrGuess={props.setCurrGuess}
                                      listenMouseMove={listenMouseMove}
                                      onMouseUp={onMouseUp}
                                      undo={props.undo}
                                      redo={props.redo} />
                            );
                        })}
                    </div>
                );
            })}
            <span
                ref={invisRef}
                style={invisStyle}>
            </span>
            <div style={selectBoxStyle}>
            </div>
        </div>
    );
});

/**
 * Draws a cell that can input some text.
 * Props:
 * config - cell config
 * coords - coords of the cell
 * board - board config
 * dimensions - board dimensions
 * cellValCallback - set the value of the cell
 * chooseCells - cells to be chosen
 * selectedCells - list of selected cells
 * selectedCellsCB - set selected cells
 * validationHidden - boolean to hide validation errors
 * invisRef - ref to invisible box
 * setBoardState - set state of the board
 * initialCoord - initial coord of drag
 * secondCoord - ending coord of drag
 * upperLeft - upper left corner position
 * lowerRight - lower right corner position
 * dragging - boolean if currently dragging
 * dragType - type of drag (adding or subtracting)
 * dragSelection - selection of drag
 * checkCells - function to check current drag selection
 * currGuess - current guess
 * setCurrGuess - set current guess
 * listenMouseMove - adds mousemove event listener
 * onMouseUp - mouse up event for drag
 */
const Cell = (props) => {
    // In some cases changing value will lose focus, refocus on change
    useEffect(() => {
        if (props.config.val) {
            const [r, c] = props.coords;
            document.getElementById(`${cellOrDiv(r, c)}_${r}_${c}`).focus();
        }
    }, [props.config.val]);

    // Changing the current guess may also lose focus
    const [didHotKey, setDidHotKey] = useState(false);
    useEffect(() => {
        if (didHotKey) {
            const [r, c] = props.coords;
            document.getElementById(`${cellOrDiv(r, c)}_${r}_${c}`).focus();
            setDidHotKey(false);
        }
    }, [props.currGuess]);

    const corners = [
        LOCATIONS.UPPER_LEFT,
        LOCATIONS.UPPER_RIGHT,
        LOCATIONS.LOWER_LEFT,
        LOCATIONS.LOWER_RIGHT
    ];

    const cellClasses = () => {
        const [r, c] = props.coords;
        const group = props.config.group;
        const guessIndex = props.config.guess !== -1 ? props.config.guess : props.currGuess;
        const guess = props.board.guesses[guessIndex];
        let topBorder = r === 0 ? 'top_border_normal' : '';
        let leftBorder = c === 0 ? 'left_border_normal' : '';
        let bottomBorder = r === props.dimensions[0] - 1 ? 'bottom_border_normal' : '';
        let rightBorder = c === props.dimensions[1] - 1 ? 'right_border_normal' : '';
        const dragSelectedSub = props.dragging &&
            props.dragSelection.findIndex(cell => cell[0] === r && cell[1] === c) !== -1 &&
            props.dragType === SELECT_TYPE.SUB;
        const selected = (props.chooseCells !== undefined && !dragSelectedSub &&
            props.selectedCells.findIndex(cell => cell[0] === r && cell[1] === c) !== -1) ? 'selected' : '';
        if (!topBorder && props.board.cells[r-1][c].group !== group) {
            topBorder = 'top_border_group';
        }
        if (!bottomBorder && props.board.cells[r+1][c].group !== group) {
            bottomBorder = 'bottom_border_group';
        }
        if (!leftBorder && props.board.cells[r][c-1].group !== group) {
            leftBorder = 'left_border_group';
        }
        if (!rightBorder && props.board.cells[r][c+1].group !== group) {
            rightBorder = 'right_border_group';
        }
        const small = guess && guess.isSmall ? 'small' : '';
        const error = (props.config.error && !props.validationHidden) ? 'error' : '';
        // TODO: add symbols between cells?
        return [
            error,
            'default_cell',
            topBorder,
            leftBorder,
            bottomBorder,
            rightBorder,
            selected,
            small
        ].filter(w => w !== '').join(' ');
    };

    const divClasses = () => {
        const [r, c] = props.coords;
        const dragSelected = (props.dragging &&
            props.dragSelection.findIndex(cell => cell[0] === r && cell[1] === c) !== -1) ? 'drag_selected' : '';
        const dragType = props.dragType === SELECT_TYPE.SUB ? 'subtract' : '';
        const isSelecting = props.chooseCells !== undefined && !dragSelected ? 'is_selecting' : '';
        return [
            'cell_container',
            dragSelected,
            dragType,
            isSelecting
        ].filter(w => w !== '').join(' ');
    };

    const selectCell = () => {
        console.log('mouse click evt');
        if (props.chooseCells !== undefined) {
            props.selectedCellsCB(props.coords);
        }
    };

    const cellOrDiv = (r, c) => {
        const guessIndex = props.board.cells[r][c].guess;
        const readOnly = guessIndex !== -1
            && props.currGuess !== guessIndex
            && !props.board.guesses[guessIndex].editable;
        return readOnly ? 'div' : 'cell';
    };

    const keyDown = (origin) => {
        return (e) => {
            const [r, c] = props.coords;
            const [height, width] = props.dimensions.map(dim => Number(dim));
            const mod = (m, n) => ((m % n) + n) % n;
            let r1, c1;
            if (e.key === 'ArrowUp') {
                // go up or wrap
                [r1, c1] = [mod(r - 1, height), c];
            } else if (e.key === 'ArrowDown') {
                // go down or wrap
                [r1, c1] = [mod(r + 1, height), c];
            } else if (e.key === 'ArrowLeft') {
                // go left or wrap
                [r1, c1] = [r, mod(c - 1, width)];
            } else if (e.key === 'ArrowRight') {
                // go right or wrap
                [r1, c1] = [r, mod(c + 1, width)];
            }

            if (r1 !== undefined && c1 !== undefined) {
                document.getElementById(`${cellOrDiv(r1, c1)}_${r1}_${c1}`).focus();

                // If input, then stop propagation to stop div from doing anything
                if (origin === 'input') {
                    e.stopPropagation();
                }
            } else if (!isNaN(e.key) && e.altKey) {
                // Alt+NUM hotkey to set guess
                const newGuess = Number(e.key);
                if (newGuess < props.board.guesses.length) {
                    props.setCurrGuess(newGuess);
                }
                setDidHotKey(true);
            } else if (e.key === 'z' && e.ctrlKey && !e.shiftKey) {
                e.preventDefault();
                props.undo();
            } else if (e.key === 'Z' && e.ctrlKey && e.shiftKey) {
                e.preventDefault();
                props.redo();
            }
        };
    };

    const onMouseDown = (e) => {
        // in order to prevent overlap with onclick, we set initial coord here,
        // but only officially start dragging when mouse moves out of cell
        const [x, y] = [e.pageX, e.pageY];
        props.setBoardState({
            initialCoord: [x, y],
            secondCoord: [x, y]
        });
        props.listenMouseMove();
    };

    const [r, c] = props.coords;
    const id = `cell_${r}_${c}`;
    const divId = `div_${r}_${c}`;
    const group = props.config.group;
    const style = {};
    const guessIndex = props.config.guess !== -1 ? props.config.guess : props.currGuess;
    const guess = props.board.guesses[guessIndex];
    const editable = guess ? (guess.editable || guessIndex === props.currGuess) : true;
    if (props.board.groups[group]) {
        style.backgroundColor = props.board.groups[group].color;
    }
    if (props.config.color) {
        style.backgroundColor = props.config.color;
    }
    if (guess) {
        style.color = guess.color;
    }

    const isSmall = (props.config.guess !== -1 && props.board.guesses[props.config.guess].isSmall) ||
        (props.config.guess === -1 && props.currGuess !== -1 && props.board.guesses[props.currGuess].isSmall);
    const [height, width] = props.dimensions;
    const div = document.getElementById(divId);
    if (r === 0 && c === 0 && div) {
        const rect = div.getBoundingClientRect();
        const upperLeft = [
            rect.left + window.scrollX,
            rect.top + window.scrollY
        ];
        if (upperLeft[0] !== props.upperLeft[0] || upperLeft[1] !== props.upperLeft[1]) {
            props.setBoardState({upperLeft});
        }
    } else if (r === height - 1 && c === width - 1 && div) {
        const rect = div.getBoundingClientRect();
        const lowerRight = [
            rect.right + window.scrollX,
            rect.bottom + window.scrollY
        ];
        if (lowerRight[0] !== props.lowerRight[0] || lowerRight[1] !== props.lowerRight[1]) {
            props.setBoardState({lowerRight});
        }
    }

    return (
        <div id={divId}
            className={divClasses()}
            onClick={selectCell}
            onKeyDown={keyDown('div')}
            onMouseDown={onMouseDown}
            onMouseUp={props.onMouseUp}
            tabIndex={0}>
            {corners.map(corner => (
                <Corner
                    corner={corner}
                    coords={props.coords}
                    cells={props.board.cells}
                    dimensions={props.dimensions} />
            ))}
            {!isSmall && (
                <input type="text"
                    id={id}
                    className={cellClasses()}
                    style={style}
                    value={props.config.val}
                    onChange={(e) => {
                        props.cellValCallback(r, c, e.target.value);
                    }}
                    onKeyDown={keyDown('input')}
                    disabled={!editable} />
            )}
            {isSmall && (
                <textarea
                    id={id}
                    className={cellClasses()}
                    style={style}
                    value={props.config.val}
                    onChange={(e) => {
                        props.cellValCallback(r, c, e.target.value);
                    }}
                    onKeyDown={keyDown('input')}
                    disabled={!editable}
                    rows={3}
                    cols={3} />
            )}
        </div>
    );
}

/**
 * Fills in the corner of the border. Needed in groups with non-rectangular
 * shapes.
 * Props:
 * corner - whether a corner is in the upper-right, upper-left, etc.
 * coords - the coordinates of the cell of this corner
 * cells - the cells of the sudoku board
 * dimensions - the board dimensions
 */
const Corner = (props) => {
    const ref = useRef(null);
    const getRect = () => ref.current && ref.current.getBoundingClientRect();

    const needCorner = () => {
        const r = props.coords[0],
              c = props.coords[1];
        const group = props.cells[r][c].group;
        const topBorder = r === 0;
        const leftBorder = c === 0;
        const bottomBorder = r === props.dimensions[0] - 1;
        const rightBorder = c === props.dimensions[1] - 1;

        if (props.corner === LOCATIONS.UPPER_RIGHT) {
            if (topBorder || rightBorder) {
                return false;
            }
            if (!(group === props.cells[r][c+1].group &&
                  group === props.cells[r-1][c].group &&
                  group !== props.cells[r-1][c+1].group)) {
                return false;
            }
        } else if (props.corner === LOCATIONS.UPPER_LEFT) {
            if (topBorder || leftBorder) {
                return false;
            }
            if (!(group === props.cells[r][c-1].group &&
                  group === props.cells[r-1][c].group &&
                  group !== props.cells[r-1][c-1].group)) {
                return false;
            }
        } else if (props.corner === LOCATIONS.LOWER_RIGHT) {
            if (bottomBorder || rightBorder) {
                return false;
            }
            if (!(group === props.cells[r][c+1].group &&
                  group === props.cells[r+1][c].group &&
                  group !== props.cells[r+1][c+1].group)) {
                return false;
            }
        } else if (props.corner === LOCATIONS.LOWER_LEFT) {
            if (bottomBorder || leftBorder) {
                return false;
            }
            if (!(group === props.cells[r][c-1].group &&
                  group === props.cells[r+1][c].group &&
                  group !== props.cells[r+1][c-1].group)) {
                return false;
            }
        }
        return true;
    };

    const style = {visibility: needCorner() ? 'visible' : 'hidden'};
    return (
        <div className={'corner ' + props.corner} style={style} ref={ref}>
        </div>
    );
};

/**
 * Various controls to configure the sudoku board.
 * Props:
 * guesses - list of guesses (see above comment)
 * currGuess - current guess
 * setGuesses - set guesses callback
 * setCurrGuess - set currGuess callback
 * deleteGuess - delete a guess
 * clearGuess - clear all inputs with this guess
 * dimensions - dimensions of the sudoku board
 * dimensionsCallback - set dimensions callback
 * groups - list of groups (see above comment)
 * groupCallback - set group callback
 * deleteGroup - delete group
 * addGroup - add group
 * chooseCell - choose a cell (when defining a group)
 * deselectAll - deselect all currently selected cells for a group
 * setCellsColor - set color for selected cells
 * type - type of the sudoku board
 * setType - set sudoku board type
 * validate - validate sudoku board
 * validationHidden - bool for if validation message should be hidden
 * hideValidate - set validationHidden
 * validationState - current validation state
 * fileName - filename of the sudoku config
 * fileRef - ref to file upload widget
 * save - save config function
 * load - load config function
 */
const SudokuControls = (props) => {
    const [width, setWidth] = useState(0);
    const [height, setHeight] = useState(0);
    const [groupColors, setGroupColors] = useState({});
    const [guessColors, setGuessColors] = useState({});
    const [choosingForGroup, setChoosingForGroup] = useState(undefined);
    const [cellsColor, setCellsColor] = useState('');
    const [selectedHeader, setSelectedHeader] = useState('');

    const types = ['12 x 12', '16 x 16', 'Samurai', 'Squiggly', 'X', 'Default', 'Other'];

    const showContent = (id) => {
        if (choosingForGroup !== undefined) {
            chooseCell();
        }
        setGuessColors({});
        setGroupColors({});
        setSelectedHeader(id === selectedHeader ? '' : id);
    };

    const addGuess = () => {
        const guesses = [...props.guesses, {
            color: '#ffffff',
            isSmall: false,
            editable: true
        }];
        props.setGuesses(guesses);
    };

    const setGuessCheck = (i, field, value) => {
        const guesses = [...props.guesses];
        guesses[i][field] = value;
        props.setGuesses(guesses);
    };

    const setGuessColor = (i, color) => {
        const newGuessColors = {...guessColors};
        if (!newGuessColors[i]) {
            newGuessColors[i] = {};
        }
        newGuessColors[i].color = color;
        setGuessColors(newGuessColors);
    };

    const submitGuessColor = (i) => {
        const newGuessColors = {...guessColors};
        const guesses = [...props.guesses];
        guesses[i].color = guessColors[i].color;
        props.setGuesses(guesses);
        delete newGuessColors[i];
        setGuessColors(newGuessColors);
    };

    const setDimensions = (e) => {
        e.preventDefault();
        props.dimensionsCallback(height, width);
    };

    const clearGroups = () => {
        props.dimensionsCallback(props.dimensions[0], props.dimensions[1]);
    };

    const setGroupColor = (i, color) => {
        const newGroupColors = {...groupColors};
        newGroupColors[i] = color;
        setGroupColors(newGroupColors);
    };

    const chooseCell = (i) => {
        if (choosingForGroup === undefined) {
            setChoosingForGroup(i);
            props.chooseCell(i);
        } else {
            setChoosingForGroup(undefined);
            props.chooseCell(undefined);
        }
    };

    const submitCellsColor = (e) => {
        if (e) {
            e.preventDefault();
        }
        props.setCellsColor(cellsColor);
    };

    const unsetCellsColor = () => {
        props.setCellsColor(undefined);
    };

    const headers = () => {
        return [
            {
                name: 'Dimensions',
                id: 'dimensions',
                onClick: () => showContent('dimensions')
            },
            {
                name: `Guesses: ${props.currGuess}`,
                id: 'guesses',
                onClick: () => showContent('guesses')
            },
            {
                name: 'Colors',
                id: 'colors',
                onClick: () => {
                    showContent('colors');
                    chooseCell('cells');
                }
            },
            {
                name: 'Groups',
                id: 'groups',
                onClick: () => showContent('groups')
            },
            {
                name: 'Default',
                id: 'default',
                onClick: () => props.dimensionsCallback(9, 9, true)
            },
            {
                name: 'Validate',
                id: 'validate',
                onClick: () => showContent('validate')
            },
            {
                name: 'Save',
                id: 'save',
                onClick: () => props.save()
            },
            {
                name: 'Load',
                id: 'load',
                onClick: () => showContent('load')
            }
        ];
    };

    const contents = () => {
        return {
            'guesses': () => (
                <div className="controls_contents">
                    {props.guesses.map((guess, i) => {
                        const displayStyle = {color: props.guesses[i].color};
                        if (props.guesses[i].isSmall) {
                            displayStyle.fontSize = '18px';
                        }
                        return (
                            <div key={`guess_${i}`}>
                                <div style={{display: 'inline-block', verticalAlign: 'middle'}}>
                                    <div>
                                        <input type="radio" name="guesses" checked={i === props.currGuess} onChange={() => props.setCurrGuess(i)} />
                                        Guess {i}:
                                        Color <input type="color"
                                                     onChange={(e) => {setGuessColor(i, e.target.value)}}
                                                     value={guessColors[i] ? guessColors[i].color : props.guesses[i].color} />
                                        <button onClick={() => submitGuessColor(i)}>Set Color</button>
                                    </div>
                                    <div>
                                        Is Small: <input type="checkbox" checked={props.guesses[i].isSmall} onChange={(e) => setGuessCheck(i, 'isSmall', e.target.checked)} />
                                    </div>
                                    <div>
                                        Editable: <input type="checkbox" checked={props.guesses[i].editable} onChange={(e) => setGuessCheck(i, 'editable', e.target.checked)} />
                                    </div>
                                    <div>
                                        {(i > 2) && <button onClick={() => props.deleteGuess(i)}>Delete</button>}
                                        {<button onClick={() => props.clearGuess(i)}>Clear</button>}
                                    </div>
                                </div>
                                <div className="guess_display" style={displayStyle}>8</div>
                            </div>
                        );
                    })}
                    <button onClick={addGuess}>+</button>
                </div>
            ),
            'dimensions': () => (
                <div className="controls_contents">
                    <form onSubmit={setDimensions}>
                        Height <input name="height" type="text" className="single_number_input" onChange={(e) => setHeight(e.target.value)} />
                        x
                        Width <input name="width" type="text" className="single_number_input" onChange={(e) => setWidth(e.target.value)} />
                        <button onClick={setDimensions}>Submit</button>
                    </form>
                </div>
            ),
            'colors': () => (
                <div className="controls_contents">
                    Color
                    <input name="cell_color" type="color" value={cellsColor}
                           onChange={(e) => setCellsColor(e.target.value)} />
                    <button onClick={submitCellsColor}>Set Color</button>
                    <button onClick={unsetCellsColor}>Unset Color</button>
                </div>
            ),
            'groups': () => (
                <div className="controls_contents">
                    {props.groups.map((group, i) => {
                        return (
                            <div key={`group_${i}`}>
                                Group {i}: Color
                                <input name={`group_${i}_color`} type="color"
                                       value={groupColors[i] ? groupColors[i] : group.color}
                                       onChange={(e) => setGroupColor(i, e.target.value)} />
                                <button onClick={() => {props.groupCallback(i, groupColors[i]); delete groupColors[i];}}>Set Color</button>
                                <button onClick={() => chooseCell(i)}
                                        disabled={choosingForGroup !== undefined && choosingForGroup !== i}>
                                    {choosingForGroup === i ? 'Confirm' : 'Choose Cells'}
                                </button>
                                {choosingForGroup === i && (
                                    <button onClick={props.deselectAll}>Deselect All</button>
                                )}
                                <button onClick={() => props.deleteGroup(i)}>X</button>
                            </div>
                        );
                    })}
                    <button onClick={props.addGroup}>+</button>
                    <button onClick={clearGroups}>Clear Groups</button>
                </div>
            ),
            'validate': () => (
                <div className="controls_contents">
                    <div>
                        {props.validationState && (
                            <div className={props.validationState === VALIDATION_MSGS.error ? 'error' : ''}>
                                {props.validationState}
                            </div>
                        )}
                    </div>
                    <div>
                        <div className="error">Note: changing the validation type may reset the board!!!</div>
                        <select onChange={(e) => props.setType(e.target.value)} value={props.type}>
                            {types.map(type => {
                                let typeVal = SUDOKU_TYPES[type];
                                return <option key={typeVal} value={typeVal}>{type}</option>
                            })}
                        </select>
                        <button onClick={() => props.validate()}>Validate</button>
                        <button onClick={props.hideValidate}>{props.validationHidden ? 'Show' : 'Hide'}</button>
                    </div>
                </div>
            ),
            'load': () => (
                <div className="controls_contents">
                    {props.fileName && <div>Current file: {props.fileName}</div>}
                    <div>
                        <input id="load" type="file" accept=".json" ref={props.fileRef} />
                    </div>
                    <div>
                        <button onClick={props.load}>Parse Config</button>
                    </div>
                </div>
            )
        };
    };

    return (
        <Controls
            headers={headers()}
            contents={contents()}
            selectedHeader={selectedHeader} />
    );
};

/**
 * Example of rendering react node for Sudoku.
 */
//const sudokuNode = ReactDOM.render(<Sudoku showVariations={true} />, document.getElementById('sudoku'));
