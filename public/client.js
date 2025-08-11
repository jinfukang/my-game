// 五子棋客户端代码
class WuziQiClient {
    constructor() {
        this.socket = io();
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.boardSize = 15;
        this.cellSize = 40;
        this.offset = 20; // 边缘偏移量
        this.board = [];
        this.currentPlayer = 1;
        this.playerNumber = null;
        this.roomId = null;
        this.gameOver = false;
        this.isSpectator = false;
        this.isAIMode = false;
        this.selectedMode = null;
        this.lastMove = null; // 记录最后一次落子的位置

        this.initBoard();
        this.initResponsiveCanvas();
        this.initEventListeners();
        this.initSocketEvents();
        this.drawBoard();
    }

    initBoard() {
        for (let i = 0; i < this.boardSize; i++) {
            this.board[i] = [];
            for (let j = 0; j < this.boardSize; j++) {
                this.board[i][j] = 0;
            }
        }
        this.lastMove = null; // 初始化时重置最后一次落子标记
    }

    initResponsiveCanvas() {
        this.updateCanvasSize();
        window.addEventListener('resize', () => {
            this.updateCanvasSize();
            this.drawBoard();
        });
    }

    updateCanvasSize() {
        const container = this.canvas.parentElement;
        const maxWidth = Math.min(container.clientWidth - 20, 600);
        const maxHeight = Math.min(window.innerHeight * 0.6, 600);
        const size = Math.min(maxWidth, maxHeight);

        // 计算合适的单元格大小
        this.cellSize = Math.floor((size - 40) / (this.boardSize - 1));
        this.offset = 20;

        // 设置画布尺寸
        const canvasSize = (this.boardSize - 1) * this.cellSize + this.offset * 2;
        this.canvas.width = canvasSize;
        this.canvas.height = canvasSize;

        // 设置显示尺寸
        this.canvas.style.width = canvasSize + 'px';
        this.canvas.style.height = canvasSize + 'px';
    }

    initEventListeners() {
        // 统一的点击/触摸处理函数
        const handleTouch = (e) => {
            if (this.gameOver || this.isSpectator || !this.roomId) return;

            e.preventDefault(); // 防止默认行为

            const rect = this.canvas.getBoundingClientRect();
            const clientX = e.clientX || (e.touches && e.touches[0].clientX);
            const clientY = e.clientY || (e.touches && e.touches[0].clientY);

            const x = clientX - rect.left;
            const y = clientY - rect.top;

            // 计算最近的交叉点
            const col = Math.round((x - this.offset) / this.cellSize);
            const row = Math.round((y - this.offset) / this.cellSize);

            if (row >= 0 && row < this.boardSize && col >= 0 && col < this.boardSize) {
                this.makeMove(row, col);
            }
        };

        // 鼠标事件
        this.canvas.addEventListener('click', handleTouch);

        // 触摸事件
        this.canvas.addEventListener('touchstart', handleTouch);
        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault(); // 防止触发click事件
        });

        // 模式选择按钮
        document.getElementById('createPvPBtn').addEventListener('click', () => {
            this.selectMode('pvp');
        });

        document.getElementById('createAIBtn').addEventListener('click', () => {
            this.selectMode('ai');
        });

        // 按钮事件
        document.getElementById('createRoomBtn').addEventListener('click', () => {
            this.createRoom();
        });

        document.getElementById('joinRoomBtn').addEventListener('click', () => {
            const roomId = document.getElementById('roomIdInput').value.trim();
            if (roomId) {
                this.joinRoom(roomId);
            } else {
                this.addChatMessage('请输入房间号', 'system');
            }
        });

        document.getElementById('copyRoomBtn').addEventListener('click', () => {
            if (this.roomId) {
                navigator.clipboard.writeText(this.roomId).then(() => {
                    this.addChatMessage('房间号已复制到剪贴板', 'system');
                });
            }
        });

        document.getElementById('restartBtn').addEventListener('click', () => {
            this.socket.emit('restartGame');
        });

        // 聊天功能
        const chatInput = document.getElementById('chatInput');
        const sendBtn = document.getElementById('sendChatBtn');

        const sendMessage = () => {
            const message = chatInput.value.trim();
            if (message && this.roomId) {
                this.socket.emit('chatMessage', message);
                chatInput.value = '';
            }
        };

        sendBtn.addEventListener('click', sendMessage);
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
    }

    initSocketEvents() {
        // 游戏状态更新
        this.socket.on('gameState', (gameState) => {
            this.board = gameState.board;
            this.currentPlayer = gameState.currentPlayer;
            this.gameOver = gameState.gameOver;
            // 注意：这里不重置lastMove，因为gameState可能来自重新连接或AI模式
            this.drawBoard();
            this.updatePlayerInfo();
        });

        // 落子结果
        this.socket.on('moveResult', (data) => {
            this.board[data.row][data.col] = data.player;
            this.currentPlayer = data.nextPlayer;
            this.gameOver = data.gameOver;
            this.lastMove = { row: data.row, col: data.col }; // 更新最后一次落子

            this.drawBoard();
            this.updatePlayerInfo();

            if (data.gameOver) {
                let message = data.message;
                if (this.isAIMode) {
                    if (data.winner === 1) {
                        message = '恭喜你获胜！🎉';
                    } else if (data.winner === 2) {
                        message = 'AI获胜，再接再厉！🤖';
                    } else {
                        message = '平局！势均力敌！';
                    }
                }
                this.updateGameStatus(message, 'finished');
                document.getElementById('restartBtn').disabled = false;
            } else {
                if (this.isAIMode) {
                    if (data.isAIMove) {
                        this.updateGameStatus('AI已落子，轮到你了', 'playing');
                    } else {
                        this.updateGameStatus('AI正在思考中...', 'playing');
                    }
                } else {
                    const playerName = data.nextPlayer === 1 ? '黑子' : '白子';
                    this.updateGameStatus(`轮到 ${playerName} 落子`, 'playing');
                }
            }

            this.addChatMessage(data.message, 'system');
        });

        // 游戏开始
        this.socket.on('gameStart', (data) => {
            this.updateGameStatus('游戏开始！轮到黑子先手', 'playing');
            this.addChatMessage(data.message, 'system');
            document.getElementById('restartBtn').disabled = false;
        });

        // 游戏重启
        this.socket.on('gameRestart', (data) => {
            this.gameOver = false;
            this.lastMove = null; // 重置最后一次落子标记
            this.updateGameStatus('游戏重新开始！轮到黑子先手', 'playing');
            this.updatePlayerInfo();
            this.addChatMessage(data.message, 'system');
        });

        // 玩家断开连接
        this.socket.on('playerDisconnected', (data) => {
            this.updateGameStatus('等待玩家重新连接...', 'waiting');
            this.addChatMessage(data.message, 'system');
        });

        // 聊天消息
        this.socket.on('chatMessage', (data) => {
            const isMe = data.playerId === this.socket.id;
            this.addChatMessage(data.message, isMe ? 'me' : 'other');
        });
    }

    selectMode(mode) {
        this.selectedMode = mode;

        // 更新按钮状态
        document.getElementById('createPvPBtn').classList.remove('active');
        document.getElementById('createAIBtn').classList.remove('active');

        if (mode === 'pvp') {
            document.getElementById('createPvPBtn').classList.add('active');
            document.getElementById('aiDifficultySelect').style.display = 'none';
        } else if (mode === 'ai') {
            document.getElementById('createAIBtn').classList.add('active');
            document.getElementById('aiDifficultySelect').style.display = 'block';
        }

        // 显示创建房间按钮
        document.getElementById('createRoomBtn').style.display = 'inline-block';
    }

    createRoom() {
        if (!this.selectedMode) {
            this.addChatMessage('请先选择游戏模式', 'system');
            return;
        }

        const isAIMode = this.selectedMode === 'ai';
        const aiDifficulty = isAIMode ? document.getElementById('difficultySelect').value : 'medium';

        this.socket.emit('createRoom', {
            isAIMode: isAIMode,
            aiDifficulty: aiDifficulty
        }, (response) => {
            if (response.success) {
                this.roomId = response.roomId;
                this.playerNumber = response.playerNumber;
                this.isAIMode = response.isAIMode;
                this.updateRoomInfo();
                this.updateGameStatus(response.message, response.isAIMode ? 'playing' : 'waiting');
                this.addChatMessage(response.message, 'system');

                // 禁用按钮
                document.getElementById('createPvPBtn').disabled = true;
                document.getElementById('createAIBtn').disabled = true;
                document.getElementById('createRoomBtn').disabled = true;
                document.getElementById('joinRoomBtn').disabled = true;
                document.getElementById('copyRoomBtn').disabled = false;

                if (response.isAIMode) {
                    document.getElementById('restartBtn').disabled = false;
                }
            } else {
                this.addChatMessage(response.message, 'system');
            }
        });
    }

    joinRoom(roomId) {
        this.socket.emit('joinRoom', roomId, (response) => {
            if (response.success) {
                this.roomId = response.roomId;
                this.playerNumber = response.playerNumber;
                this.isSpectator = response.isSpectator;
                this.isAIMode = response.isAIMode;
                this.updateRoomInfo();
                this.updateGameStatus(response.message, response.isSpectator ? 'playing' : 'waiting');
                this.addChatMessage(response.message, 'system');

                // 禁用按钮
                document.getElementById('createPvPBtn').disabled = true;
                document.getElementById('createAIBtn').disabled = true;
                document.getElementById('createRoomBtn').disabled = true;
                document.getElementById('joinRoomBtn').disabled = true;
                document.getElementById('copyRoomBtn').disabled = false;

                if (this.isSpectator) {
                    document.getElementById('spectatorInfo').style.display = 'block';
                    if (this.isAIMode) {
                        document.getElementById('spectatorInfo').innerHTML = '观众模式 - 人机对战';
                    }
                }
            } else {
                this.addChatMessage(response.message, 'system');
            }
        });
    }

    makeMove(row, col) {
        if (this.gameOver || this.isSpectator) return;

        this.socket.emit('makeMove', { row, col }, (response) => {
            if (!response.success) {
                this.addChatMessage(response.message, 'system');
            }
        });
    }

    drawBoard() {
        const ctx = this.ctx;
        const cellSize = this.cellSize;

        // 清空画布
        ctx.fillStyle = '#DEB887';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // 绘制网格线
        ctx.strokeStyle = '#8B4513';
        ctx.lineWidth = 1;

        for (let i = 0; i < this.boardSize; i++) {
            // 垂直线
            ctx.beginPath();
            ctx.moveTo(this.offset + i * cellSize, this.offset);
            ctx.lineTo(this.offset + i * cellSize, this.offset + (this.boardSize - 1) * cellSize);
            ctx.stroke();

            // 水平线
            ctx.beginPath();
            ctx.moveTo(this.offset, this.offset + i * cellSize);
            ctx.lineTo(this.offset + (this.boardSize - 1) * cellSize, this.offset + i * cellSize);
            ctx.stroke();
        }

        // 绘制天元和星位
        const starPoints = [
            [3, 3], [3, 11], [7, 7], [11, 3], [11, 11]
        ];

        ctx.fillStyle = '#8B4513';
        starPoints.forEach(([row, col]) => {
            ctx.beginPath();
            ctx.arc(this.offset + col * cellSize, this.offset + row * cellSize, 3, 0, 2 * Math.PI);
            ctx.fill();
        });

        // 绘制棋子
        for (let row = 0; row < this.boardSize; row++) {
            for (let col = 0; col < this.boardSize; col++) {
                if (this.board[row][col] !== 0) {
                    const x = this.offset + col * cellSize;
                    const y = this.offset + row * cellSize;
                    const radius = cellSize * 0.35;

                    // 绘制棋子阴影
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
                    ctx.beginPath();
                    ctx.arc(x + 2, y + 2, radius, 0, 2 * Math.PI);
                    ctx.fill();

                    // 绘制棋子
                    if (this.board[row][col] === 1) {
                        // 黑子
                        ctx.fillStyle = '#333';
                    } else {
                        // 白子
                        ctx.fillStyle = '#fff';
                        ctx.strokeStyle = '#333';
                        ctx.lineWidth = 2;
                    }

                    ctx.beginPath();
                    ctx.arc(x, y, radius, 0, 2 * Math.PI);
                    ctx.fill();

                    if (this.board[row][col] === 2) {
                        ctx.stroke();
                    }
                }
            }
        }

        // 绘制方框标记
        if (this.lastMove) {
            const lastMoveRow = this.lastMove.row;
            const lastMoveCol = this.lastMove.col;
            const x = this.offset + lastMoveCol * cellSize;
            const y = this.offset + lastMoveRow * cellSize;
            const boxSize = cellSize * 0.4; // 方框大小

            // 绘制绿色虚线方框边框
            ctx.strokeStyle = '#00AA00'; // 绿色边框
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.rect(x - boxSize, y - boxSize, boxSize * 2, boxSize * 2);
            ctx.stroke();

            // 重置为实线样式
            ctx.setLineDash([]);

            // 添加半透明绿色填充，使标记更明显
            ctx.fillStyle = 'rgba(0, 170, 0, 0.1)';
            ctx.fillRect(x - boxSize, y - boxSize, boxSize * 2, boxSize * 2);
        }
    }

    updateGameStatus(message, type) {
        const statusEl = document.getElementById('gameStatus');
        statusEl.textContent = message;
        statusEl.className = `status ${type}`;
    }

    updateRoomInfo() {
        if (!this.roomId) {
            document.getElementById('roomInfo').style.display = 'none';
            return;
        }

        const currentRoomEl = document.getElementById('currentRoomId');
        const roomInfoEl = document.getElementById('roomInfo');
        const roomIdInputEl = document.getElementById('roomIdInput');

        currentRoomEl.textContent = this.roomId;
        roomInfoEl.style.display = 'block';
        roomIdInputEl.value = this.roomId.toString();
    }

    updatePlayerInfo() {
        const player1 = document.getElementById('player1Info');
        const player2 = document.getElementById('player2Info');

        if (this.roomId) {
            player1.style.display = 'block';
            player2.style.display = 'block';

            // 更新当前回合指示
            player1.classList.remove('current-turn');
            player2.classList.remove('current-turn');

            if (!this.gameOver && this.currentPlayer === 1) {
                player1.classList.add('current-turn');
            } else if (!this.gameOver && this.currentPlayer === 2) {
                player2.classList.add('current-turn');
            }

            // 根据模式设置玩家信息
            if (this.isAIMode) {
                player1.innerHTML = '<span>黑子玩家 (你)</span><span>⚫</span>';
                player2.innerHTML = '<span>白子AI 🤖</span><span>⚪</span>';
            } else {
                // 标记自己
                if (this.playerNumber === 1) {
                    player1.innerHTML = '<span>黑子玩家 (你)</span><span>⚫</span>';
                } else if (this.playerNumber === 2) {
                    player2.innerHTML = '<span>白子玩家 (你)</span><span>⚪</span>';
                }
            }
        }
    }

    addChatMessage(message, type) {
        const chatMessages = document.getElementById('chatMessages');
        const messageEl = document.createElement('div');
        messageEl.className = `message ${type === 'system' ? 'system-message' : ''}`;

        const time = new Date().toLocaleTimeString();
        if (type === 'system') {
            messageEl.textContent = `[系统] ${message}`;
        } else {
            const prefix = type === 'me' ? '[我]' : '[对手]';
            messageEl.textContent = `${prefix} ${message}`;
        }

        chatMessages.appendChild(messageEl);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // 检测移动设备
    isMobileDevice() {
        return /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }
}

// 页面加载完成后初始化游戏
document.addEventListener('DOMContentLoaded', () => {
    new WuziQiClient();
});
