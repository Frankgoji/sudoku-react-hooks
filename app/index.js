import React from 'react';
import ReactDOM from 'react-dom';
import { Sudoku } from './sudoku.js';

const sudokuNode = ReactDOM.render(<Sudoku showVariations={true} />, document.getElementById('sudoku'));
