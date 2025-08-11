const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const WuziQiGame = require('./game.js');
const WuziQiAI = require('./ai.js');
const DouDiZhuGame = require('./doudizhu.js');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// 游戏房间管理
const rooms = new Map();
const doudizhuRooms = new Map(); // 斗地主房间

// 在线用户统计
let onlineUsers = 0;

// 路由管理
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/wuziqi', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'wuziqi.html'));
});

app.get('/doudizhu', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'doudizhu.html'));
});

// Socket.IO连接处理
io.on('connection', (socket) => {
    console.log('新用户连接:', socket.id);
    onlineUsers++;

    // 广播用户统计更新
    broadcastStats();

    // 处理统计信息请求
    socket.on('requestStats', () => {
        socket.emit('platformStats', {
            onlineUsers: onlineUsers,
            activeRooms: rooms.size + doudizhuRooms.size,
            totalGames: 2 // 五子棋和斗地主
        });
    });

    // 创建房间
    socket.on('createRoom', (data, callback) => {
        const roomId = generateRoomId();
        const game = new WuziQiGame();
        const isAIMode = data && data.isAIMode;
        const aiDifficulty = data && data.aiDifficulty || 'medium';

        const roomData = {
            game: game,
            players: [socket.id],
            playerNames: {},
            spectators: [],
            isAIMode: isAIMode,
            ai: isAIMode ? new WuziQiAI(aiDifficulty) : null,
            aiDifficulty: aiDifficulty
        };

        if (isAIMode) {
            // 人机对战模式，AI作为第二个玩家
            roomData.players.push('AI');
        }

        rooms.set(roomId, roomData);

        socket.join(roomId);
        socket.roomId = roomId;
        socket.playerNumber = 1;

        console.log(`房间 ${roomId} 已创建，创建者: ${socket.id}，${isAIMode ? 'AI模式' : '双人模式'}`);

        callback({
            success: true,
            roomId: roomId,
            playerNumber: 1,
            isAIMode: isAIMode,
            message: isAIMode ? '人机对战房间创建成功，你执黑子先手！' : '房间创建成功，等待另一位玩家加入...'
        });

        // 发送游戏状态
        socket.emit('gameState', game.getGameState());

        if (isAIMode) {
            // 人机对战模式下立即开始游戏
            socket.emit('gameStart', {
                message: '人机对战开始！你执黑子先手',
                currentPlayer: 1,
                isAIMode: true
            });
        }
    });

    // 加入房间
    socket.on('joinRoom', (roomId, callback) => {
        const room = rooms.get(roomId);

        if (!room) {
            callback({
                success: false,
                message: '房间不存在'
            });
            return;
        }

        if (room.isAIMode) {
            // AI模式房间只能观战
            room.spectators.push(socket.id);
            socket.join(roomId);
            socket.roomId = roomId;
            socket.isSpectator = true;

            callback({
                success: true,
                roomId: roomId,
                isSpectator: true,
                isAIMode: true,
                message: '以观众身份观看人机对战'
            });
        } else if (room.players.length >= 2) {
            // 作为观众加入
            room.spectators.push(socket.id);
            socket.join(roomId);
            socket.roomId = roomId;
            socket.isSpectator = true;

            callback({
                success: true,
                roomId: roomId,
                isSpectator: true,
                message: '以观众身份加入房间'
            });
        } else {
            // 作为第二个玩家加入
            room.players.push(socket.id);
            socket.join(roomId);
            socket.roomId = roomId;
            socket.playerNumber = 2;

            console.log(`玩家 ${socket.id} 加入房间 ${roomId}`);

            callback({
                success: true,
                roomId: roomId,
                playerNumber: 2,
                message: '成功加入房间，游戏开始！'
            });

            // 通知房间内所有人游戏开始
            io.to(roomId).emit('gameStart', {
                message: '两位玩家已就位，游戏开始！',
                currentPlayer: room.game.currentPlayer
            });
        }

        // 发送游戏状态
        socket.emit('gameState', room.game.getGameState());
    });

    // 落子
    socket.on('makeMove', (data, callback) => {
        const { row, col } = data;
        const room = rooms.get(socket.roomId);

        if (!room) {
            callback({
                success: false,
                message: '房间不存在'
            });
            return;
        }

        if (socket.isSpectator) {
            callback({
                success: false,
                message: '观众不能落子'
            });
            return;
        }

        if (!room.isAIMode && room.players.length < 2) {
            callback({
                success: false,
                message: '等待另一位玩家加入'
            });
            return;
        }

        const result = room.game.makeMove(row, col, socket.playerNumber);

        if (result.success) {
            // 广播落子结果给房间内所有人
            io.to(socket.roomId).emit('moveResult', {
                row: row,
                col: col,
                player: socket.playerNumber,
                gameOver: result.gameOver,
                winner: result.winner,
                nextPlayer: result.nextPlayer,
                message: result.message
            });

            // 发送更新后的游戏状态
            io.to(socket.roomId).emit('gameState', room.game.getGameState());

            // 如果是AI模式且游戏未结束，让AI下棋
            if (room.isAIMode && !result.gameOver && result.nextPlayer === 2) {
                setTimeout(() => {
                    handleAIMove(socket.roomId);
                }, 500); // 延迟500ms让AI看起来在思考
            }
        }

        callback(result);
    });

    // 重新开始游戏
    socket.on('restartGame', () => {
        const room = rooms.get(socket.roomId);

        if (!room) return;

        room.game.reset();

        // 通知房间内所有人游戏重置
        io.to(socket.roomId).emit('gameRestart', {
            message: '游戏已重新开始！'
        });

        // 发送新的游戏状态
        io.to(socket.roomId).emit('gameState', room.game.getGameState());
    });

    // 聊天消息
    socket.on('chatMessage', (message) => {
        const room = rooms.get(socket.roomId);
        if (!room) return;

        // 广播聊天消息
        io.to(socket.roomId).emit('chatMessage', {
            playerId: socket.id,
            message: message,
            timestamp: new Date()
        });
    });

    // 斗地主游戏事件
    // 创建斗地主房间
    socket.on('createDouDiZhuRoom', (data, callback) => {
        const roomId = generateRoomId();
        const game = new DouDiZhuGame();

        const roomData = {
            game: game,
            players: [socket.id],
            playerNames: {},
            spectators: []
        };

        doudizhuRooms.set(roomId, roomData);

        socket.join(roomId);
        socket.roomId = roomId;
        socket.playerNumber = 0;
        socket.gameType = 'doudizhu';

        console.log(`斗地主房间 ${roomId} 已创建，创建者: ${socket.id}`);

        callback({
            success: true,
            roomId: roomId,
            playerNumber: 0,
            message: '斗地主房间创建成功，等待其他玩家加入...'
        });

        // 发送游戏状态
        socket.emit('gameState', game.getGameState());
    });

    // 加入斗地主房间
    socket.on('joinDouDiZhuRoom', (roomId, callback) => {
        const room = doudizhuRooms.get(roomId);

        if (!room) {
            callback({
                success: false,
                message: '房间不存在'
            });
            return;
        }

        if (room.players.length >= 3) {
            callback({
                success: false,
                message: '房间已满'
            });
            return;
        }

        const playerNumber = room.players.length;
        room.players.push(socket.id);
        room.playerNames[socket.id] = `玩家${playerNumber + 1}`;

        socket.join(roomId);
        socket.roomId = roomId;
        socket.playerNumber = playerNumber;
        socket.gameType = 'doudizhu';

        console.log(`玩家 ${socket.id} 加入斗地主房间 ${roomId}，玩家编号: ${playerNumber}`);

        callback({
            success: true,
            roomId: roomId,
            playerNumber: playerNumber,
            message: `成功加入房间，你是玩家${playerNumber + 1}`
        });

        // 通知房间内所有人
        io.to(roomId).emit('gameState', room.game.getGameState());

        // 如果房间满了，开始游戏
        if (room.players.length === 3) {
            room.game.dealCards();

            // 给每个玩家发送手牌
            room.players.forEach((playerId, index) => {
                io.to(playerId).emit('dealCards', {
                    cards: room.game.playerCards[index]
                });
            });

            // 发送游戏状态
            io.to(roomId).emit('gameState', room.game.getGameState());
        }
    });

    // 叫地主
    socket.on('callLandlord', (score, callback) => {
        const room = doudizhuRooms.get(socket.roomId);
        if (!room || socket.gameType !== 'doudizhu') {
            callback({ success: false, message: '无效请求' });
            return;
        }

        const result = room.game.callLandlord(socket.playerNumber, score);

        if (result) {
            // 广播叫分结果
            io.to(socket.roomId).emit('callResult', {
                playerId: socket.playerNumber,
                score: score,
                callScores: room.game.callScores,
                gamePhase: room.game.gamePhase
            });

            // 发送游戏状态
            io.to(socket.roomId).emit('gameState', room.game.getGameState());

            callback({ success: true });
        } else {
            callback({ success: false, message: '叫分失败' });
        }
    });

    // 出牌
    socket.on('playCards', (cardIndices, callback) => {
        const room = doudizhuRooms.get(socket.roomId);
        if (!room || socket.gameType !== 'doudizhu') {
            callback({ success: false, message: '无效请求' });
            return;
        }

        // 根据索引获取实际的牌
        const cards = cardIndices.map(index => room.game.playerCards[socket.playerNumber][index]);
        const result = room.game.playCards(socket.playerNumber, cards);

        if (result.success) {
            // 广播出牌结果
            io.to(socket.roomId).emit('playResult', {
                success: true,
                playerId: socket.playerNumber,
                cards: cards,
                gameOver: result.gameOver,
                winner: result.winner,
                nextPlayer: result.nextPlayer
            });

            // 发送游戏状态
            io.to(socket.roomId).emit('gameState', room.game.getGameState());

            callback({ success: true });
        } else {
            callback({ success: false, message: result.message || '出牌失败' });
        }
    });

    // 过牌
    socket.on('pass', (data, callback) => {
        const room = doudizhuRooms.get(socket.roomId);
        if (!room || socket.gameType !== 'doudizhu') {
            callback({ success: false, message: '无效请求' });
            return;
        }

        const result = room.game.pass(socket.playerNumber);

        if (result.success) {
            // 广播过牌结果
            io.to(socket.roomId).emit('passResult', {
                success: true,
                playerId: socket.playerNumber,
                nextPlayer: room.game.currentPlayer
            });

            // 发送游戏状态
            io.to(socket.roomId).emit('gameState', room.game.getGameState());

            callback({ success: true });
        } else {
            callback({ success: false, message: '过牌失败' });
        }
    });

    // 重新开始斗地主游戏
    socket.on('restartDouDiZhuGame', () => {
        const room = doudizhuRooms.get(socket.roomId);
        if (!room || socket.gameType !== 'doudizhu') return;

        room.game.reset();

        // 通知房间内所有人游戏重置
        io.to(socket.roomId).emit('gameRestart', {
            message: '游戏已重新开始！'
        });

        // 发送新的游戏状态
        io.to(socket.roomId).emit('gameState', room.game.getGameState());
    });

    // 断开连接
    socket.on('disconnect', () => {
        console.log('用户断开连接:', socket.id);
        onlineUsers--;

        const room = rooms.get(socket.roomId);
        if (room) {
            // 从房间中移除玩家
            const playerIndex = room.players.indexOf(socket.id);
            if (playerIndex !== -1) {
                room.players.splice(playerIndex, 1);

                // 通知其他玩家
                socket.to(socket.roomId).emit('playerDisconnected', {
                    message: '对手已断开连接'
                });

                // 如果房间空了，删除房间
                if (room.players.length === 0 && room.spectators.length === 0) {
                    rooms.delete(socket.roomId);
                    console.log(`房间 ${socket.roomId} 已删除`);
                }
            }

            // 从观众列表中移除
            const spectatorIndex = room.spectators.indexOf(socket.id);
            if (spectatorIndex !== -1) {
                room.spectators.splice(spectatorIndex, 1);
            }
        }

        // 处理斗地主房间断开连接
        const doudizhuRoom = doudizhuRooms.get(socket.roomId);
        if (doudizhuRoom) {
            const playerIndex = doudizhuRoom.players.indexOf(socket.id);
            if (playerIndex !== -1) {
                doudizhuRoom.players.splice(playerIndex, 1);

                // 通知其他玩家
                socket.to(socket.roomId).emit('playerDisconnected', {
                    message: '对手已断开连接'
                });

                // 如果房间空了，删除房间
                if (doudizhuRoom.players.length === 0) {
                    doudizhuRooms.delete(socket.roomId);
                    console.log(`斗地主房间 ${socket.roomId} 已删除`);
                }
            }
        }

        // 广播统计更新
        broadcastStats();
    });
});

// 处理AI落子
function handleAIMove(roomId) {
    const room = rooms.get(roomId);
    if (!room || !room.isAIMode || !room.ai) return;

    const aiMove = room.ai.getNextMove(room.game.board, 2); // AI是白子，玩家2
    const result = room.game.makeMove(aiMove.row, aiMove.col, 2);

    if (result.success) {
        // 广播AI落子结果
        io.to(roomId).emit('moveResult', {
            row: aiMove.row,
            col: aiMove.col,
            player: 2,
            gameOver: result.gameOver,
            winner: result.winner,
            nextPlayer: result.nextPlayer,
            message: result.gameOver ? result.message : 'AI已落子，轮到你了',
            isAIMove: true
        });

        // 发送更新后的游戏状态
        io.to(roomId).emit('gameState', room.game.getGameState());
    }
}

// 广播统计信息
function broadcastStats() {
    io.emit('platformStats', {
        onlineUsers: onlineUsers,
        activeRooms: rooms.size,
        totalGames: 1
    });
}

// 生成房间ID
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🎮 在线游戏平台服务器运行在端口 ${PORT}`);
    console.log(`🌐 请访问 http://localhost:${PORT} 开始游戏`);
    console.log(`📱 支持移动端访问，扫码即可游戏`);
});

module.exports = server;
