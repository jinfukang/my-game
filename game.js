// 五子棋游戏核心逻辑
class WuziQiGame {
    constructor() {
        this.board = this.createBoard();
        this.currentPlayer = 1; // 1为黑子，2为白子
        this.gameOver = false;
        this.winner = null;
        this.BOARD_SIZE = 15;
    }

    // 创建15x15的棋盘
    createBoard() {
        const board = [];
        for (let i = 0; i < 15; i++) {
            board[i] = [];
            for (let j = 0; j < 15; j++) {
                board[i][j] = 0; // 0表示空位
            }
        }
        return board;
    }

    // 落子
    makeMove(row, col, player) {
        if (this.gameOver) {
            return { success: false, message: '游戏已结束' };
        }

        if (row < 0 || row >= this.BOARD_SIZE || col < 0 || col >= this.BOARD_SIZE) {
            return { success: false, message: '位置超出棋盘范围' };
        }

        if (this.board[row][col] !== 0) {
            return { success: false, message: '该位置已有棋子' };
        }

        if (player !== this.currentPlayer) {
            return { success: false, message: '不是你的回合' };
        }

        this.board[row][col] = player;

        // 检查是否获胜
        if (this.checkWin(row, col, player)) {
            this.gameOver = true;
            this.winner = player;
            return {
                success: true,
                gameOver: true,
                winner: player,
                message: `玩家${player === 1 ? '黑子' : '白子'}获胜！`
            };
        }

        // 检查是否平局
        if (this.checkDraw()) {
            this.gameOver = true;
            return {
                success: true,
                gameOver: true,
                winner: null,
                message: '平局！'
            };
        }

        // 切换玩家
        this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;

        return {
            success: true,
            gameOver: false,
            nextPlayer: this.currentPlayer
        };
    }

    // 检查获胜条件
    checkWin(row, col, player) {
        const directions = [
            [0, 1],   // 水平
            [1, 0],   // 垂直
            [1, 1],   // 主对角线
            [1, -1]   // 副对角线
        ];

        for (let [dx, dy] of directions) {
            let count = 1; // 包含当前落子

            // 向一个方向检查
            count += this.countDirection(row, col, dx, dy, player);
            // 向相反方向检查
            count += this.countDirection(row, col, -dx, -dy, player);

            if (count >= 5) {
                return true;
            }
        }

        return false;
    }

    // 在指定方向上计算连续棋子数量
    countDirection(row, col, dx, dy, player) {
        let count = 0;
        let r = row + dx;
        let c = col + dy;

        while (r >= 0 && r < this.BOARD_SIZE &&
            c >= 0 && c < this.BOARD_SIZE &&
            this.board[r][c] === player) {
            count++;
            r += dx;
            c += dy;
        }

        return count;
    }

    // 检查是否平局
    checkDraw() {
        for (let i = 0; i < this.BOARD_SIZE; i++) {
            for (let j = 0; j < this.BOARD_SIZE; j++) {
                if (this.board[i][j] === 0) {
                    return false; // 还有空位
                }
            }
        }
        return true; // 棋盘满了
    }

    // 重置游戏
    reset() {
        this.board = this.createBoard();
        this.currentPlayer = 1;
        this.gameOver = false;
        this.winner = null;
    }

    // 获取游戏状态
    getGameState() {
        return {
            board: this.board,
            currentPlayer: this.currentPlayer,
            gameOver: this.gameOver,
            winner: this.winner
        };
    }
}

// 如果在Node.js环境中，导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WuziQiGame;
}
