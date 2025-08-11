// 斗地主客户端代码
class DouDiZhuClient {
    constructor() {
        this.socket = io();
        this.roomId = null;
        this.playerNumber = null;
        this.gameState = null;
        this.myCards = [];
        this.selectedCards = [];
        this.gamePhase = 'waiting';

        this.initEventListeners();
        this.initSocketEvents();
    }

    initEventListeners() {
        // 房间管理按钮
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

        // 叫分按钮
        document.querySelectorAll('.call-score').forEach(scoreBtn => {
            scoreBtn.addEventListener('click', () => {
                const score = parseInt(scoreBtn.dataset.score);
                this.callLandlord(score);
            });
        });

        // 出牌按钮
        document.getElementById('playBtn').addEventListener('click', () => {
            this.playCards();
        });

        document.getElementById('passBtn').addEventListener('click', () => {
            this.pass();
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
            this.gameState = gameState;
            this.updateGameDisplay();
        });

        // 发牌结果
        this.socket.on('dealCards', (data) => {
            this.myCards = data.cards;
            this.renderMyCards();
            this.updateGameStatus('开始叫地主', 'calling');
            this.showCallArea();
        });

        // 叫地主结果
        this.socket.on('callResult', (data) => {
            this.addChatMessage(`玩家${data.playerId + 1}叫分: ${data.score}`, 'system');
            this.updateCallScores(data.callScores);

            if (data.gamePhase === 'playing') {
                this.hideCallArea();
                this.updateGameStatus('游戏开始！', 'playing');
                this.showPlayControls();
            }
        });

        // 出牌结果
        this.socket.on('playResult', (data) => {
            if (data.success) {
                this.addChatMessage(`玩家${data.playerId + 1}出牌`, 'system');
                this.updateLastPlay(data.cards, data.playerId);

                if (data.gameOver) {
                    this.gameOver(data.winner);
                } else {
                    this.updateCurrentPlayer(data.nextPlayer);
                }
            } else {
                this.addChatMessage(data.message, 'system');
            }
        });

        // 过牌结果
        this.socket.on('passResult', (data) => {
            if (data.success) {
                this.addChatMessage(`玩家${data.playerId + 1}过牌`, 'system');
                this.updateCurrentPlayer(data.nextPlayer);
            }
        });

        // 游戏开始
        this.socket.on('gameStart', (data) => {
            this.updateGameStatus('游戏开始！', 'playing');
            this.addChatMessage(data.message, 'system');
            this.showPlayControls();
        });

        // 游戏重启
        this.socket.on('gameRestart', (data) => {
            this.gamePhase = 'waiting';
            this.myCards = [];
            this.selectedCards = [];
            this.updateGameStatus('游戏重新开始！', 'waiting');
            this.hideAllControls();
            this.clearGameBoard();
            this.addChatMessage(data.message, 'system');
        });

        // 聊天消息
        this.socket.on('chatMessage', (data) => {
            const isMe = data.playerId === this.socket.id;
            this.addChatMessage(data.message, isMe ? 'me' : 'other');
        });
    }

    createRoom() {
        this.socket.emit('createRoom', {}, (response) => {
            if (response.success) {
                this.roomId = response.roomId;
                this.playerNumber = response.playerNumber;
                this.updateRoomInfo();
                this.updateGameStatus('房间创建成功，等待其他玩家加入...', 'waiting');
                this.addChatMessage(response.message, 'system');
                this.disableRoomButtons();
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
                this.updateRoomInfo();
                this.updateGameStatus(response.message, 'waiting');
                this.addChatMessage(response.message, 'system');
                this.disableRoomButtons();
            } else {
                this.addChatMessage(response.message, 'system');
            }
        });
    }

    callLandlord(score) {
        this.socket.emit('callLandlord', score, (response) => {
            if (!response.success) {
                this.addChatMessage(response.message, 'system');
            }
        });
    }

    playCards() {
        if (this.selectedCards.length === 0) {
            this.addChatMessage('请选择要出的牌', 'system');
            return;
        }

        this.socket.emit('playCards', this.selectedCards, (response) => {
            if (!response.success) {
                this.addChatMessage(response.message, 'system');
            } else {
                // 出牌成功，清空选择
                this.selectedCards = [];
                this.renderMyCards();
            }
        });
    }

    pass() {
        this.socket.emit('pass', {}, (response) => {
            if (!response.success) {
                this.addChatMessage(response.message, 'system');
            }
        });
    }

    // 渲染我的手牌
    renderMyCards() {
        const rows = [
            document.getElementById('cardsRow1'),
            document.getElementById('cardsRow2'),
            document.getElementById('cardsRow3')
        ];

        // 清空现有手牌
        rows.forEach(row => row.innerHTML = '');

        // 按行分布手牌
        this.myCards.forEach((card, index) => {
            const rowIndex = Math.floor(index / 7);
            if (rowIndex < rows.length) {
                const cardElement = this.createCardElement(card, index);
                rows[rowIndex].appendChild(cardElement);
            }
        });
    }

    // 创建牌元素
    createCardElement(card, index) {
        const cardDiv = document.createElement('div');
        cardDiv.className = 'card-item';
        cardDiv.dataset.index = index;

        // 设置牌的颜色
        if (card.suit === '♥' || card.suit === '♦' || card.value === '小王' || card.value === '大王') {
            cardDiv.classList.add('red');
        } else {
            cardDiv.classList.add('black');
        }

        // 设置牌的内容
        if (card.value === '小王' || card.value === '大王') {
            cardDiv.textContent = card.value;
        } else {
            cardDiv.innerHTML = `<div class="card-suit">${card.suit}</div><div class="card-value">${card.value}</div>`;
        }

        // 添加点击事件
        cardDiv.addEventListener('click', () => {
            this.toggleCardSelection(index);
        });

        return cardDiv;
    }

    // 切换牌的选择状态
    toggleCardSelection(index) {
        const cardElement = document.querySelector(`[data-index="${index}"]`);
        if (this.selectedCards.includes(index)) {
            // 取消选择
            this.selectedCards = this.selectedCards.filter(i => i !== index);
            cardElement.classList.remove('selected');
        } else {
            // 选择牌
            this.selectedCards.push(index);
            cardElement.classList.add('selected');
        }
    }

    // 更新游戏显示
    updateGameDisplay() {
        if (!this.gameState) return;

        this.gamePhase = this.gameState.gamePhase;

        // 更新玩家信息
        this.updatePlayerInfo();

        // 更新游戏状态
        this.updateGameStatus(this.getStatusMessage(), this.gameState.gamePhase);

        // 更新当前玩家
        this.updateCurrentPlayer(this.gameState.currentPlayer);

        // 更新地主信息
        if (this.gameState.landlord !== -1) {
            this.updateLandlordInfo(this.gameState.landlord);
        }
    }

    // 获取状态消息
    getStatusMessage() {
        switch (this.gameState.gamePhase) {
            case 'waiting':
                return '等待玩家加入...';
            case 'calling':
                return `轮到玩家${this.gameState.currentCaller + 1}叫地主`;
            case 'playing':
                return `轮到玩家${this.gameState.currentPlayer + 1}出牌`;
            case 'finished':
                return '游戏结束';
            default:
                return '等待开始游戏...';
        }
    }

    // 更新玩家信息
    updatePlayerInfo() {
        const players = [
            document.getElementById('player1Info'),
            document.getElementById('player2Info'),
            document.getElementById('player3Info')
        ];

        players.forEach((player, index) => {
            if (this.gameState.players[index]) {
                player.style.display = 'block';
                player.classList.remove('current-turn', 'landlord-player');

                if (this.gameState.currentPlayer === index) {
                    player.classList.add('current-turn');
                }

                if (this.gameState.landlord === index) {
                    player.classList.add('landlord-player');
                }
            } else {
                player.style.display = 'none';
            }
        });
    }

    // 更新当前玩家
    updateCurrentPlayer(playerId) {
        // 移除所有当前回合标记
        document.querySelectorAll('.player-info').forEach(player => {
            player.classList.remove('current-turn');
        });

        // 添加当前回合标记
        if (playerId >= 0 && playerId < 3) {
            const currentPlayer = document.querySelector(`#player${playerId + 1}Info`);
            if (currentPlayer) {
                currentPlayer.classList.add('current-turn');
            }
        }

        // 如果是我的回合，显示相应的控制按钮
        if (playerId === this.playerNumber) {
            if (this.gamePhase === 'calling') {
                this.showCallArea();
            } else if (this.gamePhase === 'playing') {
                this.showPlayControls();
            }
        } else {
            this.hideAllControls();
        }
    }

    // 更新地主信息
    updateLandlordInfo(landlordId) {
        // 更新地主牌显示
        const landlordCards = document.getElementById('landlordCards');
        if (landlordCards) {
            landlordCards.style.display = 'flex';
        }
    }

    // 更新叫分记录
    updateCallScores(callScores) {
        // 这里可以添加叫分记录的显示逻辑
    }

    // 更新上一次出牌
    updateLastPlay(cards, playerId) {
        // 这里可以添加显示上一次出牌的逻辑
    }

    // 游戏结束
    gameOver(winner) {
        this.gamePhase = 'finished';
        const winnerName = winner === this.playerNumber ? '你' : `玩家${winner + 1}`;
        this.updateGameStatus(`游戏结束！${winnerName}获胜！`, 'finished');
        this.addChatMessage(`游戏结束！${winnerName}获胜！`, 'system');
        this.hideAllControls();
        document.getElementById('restartBtn').disabled = false;
    }

    // 显示叫分区域
    showCallArea() {
        document.getElementById('callArea').style.display = 'flex';
        document.getElementById('playControls').style.display = 'none';
    }

    // 显示出牌控制
    showPlayControls() {
        document.getElementById('callArea').style.display = 'none';
        document.getElementById('playControls').style.display = 'flex';
    }

    // 隐藏所有控制
    hideAllControls() {
        document.getElementById('callArea').style.display = 'none';
        document.getElementById('playControls').style.display = 'none';
    }

    // 隐藏叫分区域
    hideCallArea() {
        document.getElementById('callArea').style.display = 'none';
    }

    // 清空游戏棋盘
    clearGameBoard() {
        // 清空手牌
        document.querySelectorAll('.cards-row').forEach(row => row.innerHTML = '');
        this.selectedCards = [];
    }

    // 更新游戏状态
    updateGameStatus(message, type) {
        const statusEl = document.getElementById('gameStatus');
        statusEl.textContent = message;
        statusEl.className = `status ${type}`;
    }

    // 更新房间信息
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

    // 禁用房间按钮
    disableRoomButtons() {
        document.getElementById('createRoomBtn').disabled = true;
        document.getElementById('joinRoomBtn').disabled = true;
        document.getElementById('copyRoomBtn').disabled = false;
    }

    // 添加聊天消息
    addChatMessage(message, type) {
        const chatMessages = document.getElementById('chatMessages');
        const messageEl = document.createElement('div');
        messageEl.className = `message ${type === 'system' ? 'system-message' : ''}`;

        if (type === 'system') {
            messageEl.textContent = `[系统] ${message}`;
        } else {
            const prefix = type === 'me' ? '[我]' : '[对手]';
            messageEl.textContent = `${prefix} ${message}`;
        }

        chatMessages.appendChild(messageEl);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

// 页面加载完成后初始化游戏
document.addEventListener('DOMContentLoaded', () => {
    new DouDiZhuClient();
});
