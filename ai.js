// 五子棋AI算法
class WuziQiAI {
    constructor(difficulty = 'medium') {
        this.difficulty = difficulty;
        this.BOARD_SIZE = 15;
        this.MAX_DEPTH = difficulty === 'easy' ? 2 : difficulty === 'medium' ? 3 : 4;

        // 评分权重
        this.SCORES = {
            FIVE: 100000,        // 五连
            FOUR: 10000,         // 活四
            BLOCKED_FOUR: 5000,  // 冲四
            THREE: 1000,         // 活三
            BLOCKED_THREE: 100,  // 眠三
            TWO: 100,            // 活二
            BLOCKED_TWO: 10,     // 眠二
            ONE: 10              // 单子
        };
    }

    // 获取AI的下一步棋
    getNextMove(board, aiPlayer) {
        const candidateMoves = this.getCandidateMoves(board);

        if (candidateMoves.length === 0) {
            // 如果没有候选位置，选择中心点
            return { row: 7, col: 7 };
        }

        let bestMove = candidateMoves[0];
        let bestScore = -Infinity;

        // 首先检查是否有必胜的棋或必须防守的棋
        for (let move of candidateMoves) {
            const tempBoard = this.copyBoard(board);
            tempBoard[move.row][move.col] = aiPlayer;

            // 检查AI是否能获胜
            if (this.checkWin(tempBoard, move.row, move.col, aiPlayer)) {
                return move;
            }
        }

        // 检查是否需要防守对手的获胜威胁
        const opponent = aiPlayer === 1 ? 2 : 1;
        for (let move of candidateMoves) {
            const tempBoard = this.copyBoard(board);
            tempBoard[move.row][move.col] = opponent;

            if (this.checkWin(tempBoard, move.row, move.col, opponent)) {
                return move; // 必须防守
            }
        }

        // 使用评估函数选择最佳位置
        for (let move of candidateMoves) {
            const score = this.evaluateMove(board, move.row, move.col, aiPlayer);
            if (score > bestScore) {
                bestScore = score;
                bestMove = move;
            }
        }

        return bestMove;
    }

    // 获取候选落子位置
    getCandidateMoves(board) {
        const moves = [];
        const visited = new Set();

        // 在已有棋子周围寻找候选位置
        for (let row = 0; row < this.BOARD_SIZE; row++) {
            for (let col = 0; col < this.BOARD_SIZE; col++) {
                if (board[row][col] !== 0) {
                    // 在这个棋子周围2格范围内寻找空位
                    for (let dr = -2; dr <= 2; dr++) {
                        for (let dc = -2; dc <= 2; dc++) {
                            const newRow = row + dr;
                            const newCol = col + dc;
                            const key = `${newRow}-${newCol}`;

                            if (newRow >= 0 && newRow < this.BOARD_SIZE &&
                                newCol >= 0 && newCol < this.BOARD_SIZE &&
                                board[newRow][newCol] === 0 &&
                                !visited.has(key)) {
                                moves.push({ row: newRow, col: newCol });
                                visited.add(key);
                            }
                        }
                    }
                }
            }
        }

        // 如果棋盘是空的，返回中心附近的位置
        if (moves.length === 0) {
            const center = Math.floor(this.BOARD_SIZE / 2);
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    moves.push({ row: center + dr, col: center + dc });
                }
            }
        }

        return moves;
    }

    // 评估某个位置的分数
    evaluateMove(board, row, col, player) {
        const tempBoard = this.copyBoard(board);
        tempBoard[row][col] = player;

        const aiScore = this.evaluatePosition(tempBoard, row, col, player);
        const opponentScore = this.evaluatePosition(tempBoard, row, col, player === 1 ? 2 : 1);

        return aiScore - opponentScore * 0.8; // 稍微偏重攻击
    }

    // 评估棋盘位置的分数
    evaluatePosition(board, row, col, player) {
        let totalScore = 0;
        const directions = [
            [0, 1],   // 水平
            [1, 0],   // 垂直
            [1, 1],   // 主对角线
            [1, -1]   // 副对角线
        ];

        for (let [dx, dy] of directions) {
            const lineScore = this.evaluateLine(board, row, col, dx, dy, player);
            totalScore += lineScore;
        }

        return totalScore;
    }

    // 评估一条线的分数
    evaluateLine(board, row, col, dx, dy, player) {
        let count = 1; // 包含当前位置
        let blocked = 0;

        // 向一个方向搜索
        let r = row + dx;
        let c = col + dy;
        while (r >= 0 && r < this.BOARD_SIZE && c >= 0 && c < this.BOARD_SIZE) {
            if (board[r][c] === player) {
                count++;
            } else if (board[r][c] !== 0) {
                blocked++;
                break;
            } else {
                break;
            }
            r += dx;
            c += dy;
        }

        // 向相反方向搜索
        r = row - dx;
        c = col - dy;
        while (r >= 0 && r < this.BOARD_SIZE && c >= 0 && c < this.BOARD_SIZE) {
            if (board[r][c] === player) {
                count++;
            } else if (board[r][c] !== 0) {
                blocked++;
                break;
            } else {
                break;
            }
            r -= dx;
            c -= dy;
        }

        return this.getScoreByCount(count, blocked);
    }

    // 根据连子数和阻挡情况获取分数
    getScoreByCount(count, blocked) {
        if (blocked === 2) {
            return 0; // 两端都被堵住
        }

        switch (count) {
            case 5:
                return this.SCORES.FIVE;
            case 4:
                return blocked === 0 ? this.SCORES.FOUR : this.SCORES.BLOCKED_FOUR;
            case 3:
                return blocked === 0 ? this.SCORES.THREE : this.SCORES.BLOCKED_THREE;
            case 2:
                return blocked === 0 ? this.SCORES.TWO : this.SCORES.BLOCKED_TWO;
            case 1:
                return this.SCORES.ONE;
            default:
                return 0;
        }
    }

    // 检查获胜条件
    checkWin(board, row, col, player) {
        const directions = [
            [0, 1],   // 水平
            [1, 0],   // 垂直
            [1, 1],   // 主对角线
            [1, -1]   // 副对角线
        ];

        for (let [dx, dy] of directions) {
            let count = 1;

            // 向一个方向检查
            count += this.countDirection(board, row, col, dx, dy, player);
            // 向相反方向检查
            count += this.countDirection(board, row, col, -dx, -dy, player);

            if (count >= 5) {
                return true;
            }
        }

        return false;
    }

    // 在指定方向上计算连续棋子数量
    countDirection(board, row, col, dx, dy, player) {
        let count = 0;
        let r = row + dx;
        let c = col + dy;

        while (r >= 0 && r < this.BOARD_SIZE &&
            c >= 0 && c < this.BOARD_SIZE &&
            board[r][c] === player) {
            count++;
            r += dx;
            c += dy;
        }

        return count;
    }

    // 复制棋盘
    copyBoard(board) {
        return board.map(row => [...row]);
    }
}

// 如果在Node.js环境中，导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WuziQiAI;
}
