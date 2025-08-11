// 斗地主游戏核心逻辑
class DouDiZhuGame {
    constructor() {
        this.players = [null, null, null]; // 玩家数组
        this.cards = []; // 所有牌
        this.playerCards = [[], [], []]; // 每个玩家的手牌
        this.landlordCards = []; // 地主牌
        this.currentPlayer = 0; // 当前出牌玩家
        this.landlord = -1; // 地主玩家编号
        this.gamePhase = 'waiting'; // 游戏阶段：waiting, calling, playing, finished
        this.lastPlay = null; // 上一次出牌
        this.lastPlayer = -1; // 上一次出牌玩家
        this.passCount = 0; // 过牌次数
        this.callScores = [0, 0, 0]; // 叫分记录
        this.currentCaller = 0; // 当前叫分玩家
        
        this.initCards();
    }

    // 初始化牌组
    initCards() {
        this.cards = [];
        
        // 生成普通牌（3-A）
        const suits = ['♠', '♥', '♣', '♦'];
        const values = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
        
        for (let suit of suits) {
            for (let value of values) {
                this.cards.push({
                    suit: suit,
                    value: value,
                    weight: this.getValueWeight(value)
                });
            }
        }
        
        // 添加大小王
        this.cards.push({ suit: '', value: '小王', weight: 14 });
        this.cards.push({ suit: '', value: '大王', weight: 15 });
    }

    // 获取牌值权重
    getValueWeight(value) {
        const weightMap = {
            '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
            'J': 11, 'Q': 12, 'K': 13, 'A': 1, '2': 2
        };
        return weightMap[value] || 0;
    }

    // 洗牌
    shuffle() {
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }

    // 发牌
    dealCards() {
        this.shuffle();
        
        // 清空手牌
        this.playerCards = [[], [], []];
        
        // 发牌给三个玩家
        for (let i = 0; i < 51; i++) {
            this.playerCards[i % 3].push(this.cards[i]);
        }
        
        // 留3张地主牌
        this.landlordCards = this.cards.slice(51);
        
        // 排序手牌
        for (let i = 0; i < 3; i++) {
            this.playerCards[i].sort((a, b) => b.weight - a.weight);
        }
        
        this.gamePhase = 'calling';
        this.currentCaller = 0;
        this.callScores = [0, 0, 0];
    }

    // 叫地主
    callLandlord(playerId, score) {
        if (this.gamePhase !== 'calling') return false;
        if (playerId !== this.currentCaller) return false;
        if (score <= this.callScores[this.currentCaller]) return false;
        
        this.callScores[playerId] = score;
        
        // 移动到下一个玩家
        this.currentCaller = (this.currentCaller + 1) % 3;
        
        // 如果所有玩家都叫过了，确定地主
        if (this.currentCaller === 0) {
            this.determineLandlord();
        }
        
        return true;
    }

    // 确定地主
    determineLandlord() {
        let maxScore = -1;
        let landlordId = -1;
        
        for (let i = 0; i < 3; i++) {
            if (this.callScores[i] > maxScore) {
                maxScore = this.callScores[i];
                landlordId = i;
            }
        }
        
        if (landlordId !== -1) {
            this.landlord = landlordId;
            this.currentPlayer = landlordId;
            
            // 将地主牌加入地主手牌
            this.playerCards[landlordId].push(...this.landlordCards);
            this.playerCards[landlordId].sort((a, b) => b.weight - a.weight);
            
            this.gamePhase = 'playing';
        }
    }

    // 出牌
    playCards(playerId, cards) {
        if (this.gamePhase !== 'playing') return false;
        if (playerId !== this.currentPlayer) return false;
        
        // 验证牌型
        const cardType = this.getCardType(cards);
        if (!cardType.valid) return false;
        
        // 验证是否能压过上家
        if (this.lastPlay && !this.canBeat(cardType, this.lastPlay)) return false;
        
        // 移除手牌
        for (let card of cards) {
            const index = this.playerCards[playerId].findIndex(c => 
                c.suit === card.suit && c.value === card.value);
            if (index !== -1) {
                this.playerCards[playerId].splice(index, 1);
            }
        }
        
        // 更新游戏状态
        this.lastPlay = cardType;
        this.lastPlayer = playerId;
        this.passCount = 0;
        
        // 检查是否获胜
        if (this.playerCards[playerId].length === 0) {
            this.gamePhase = 'finished';
            return { success: true, gameOver: true, winner: playerId };
        }
        
        // 移动到下一个玩家
        this.currentPlayer = (this.currentPlayer + 1) % 3;
        
        return { success: true, gameOver: false };
    }

    // 过牌
    pass(playerId) {
        if (this.gamePhase !== 'playing') return false;
        if (playerId !== this.currentPlayer) return false;
        if (this.lastPlayer === -1) return false; // 第一手不能过
        
        this.passCount++;
        
        // 如果连续过牌，清空上一次出牌
        if (this.passCount >= 2) {
            this.lastPlay = null;
            this.lastPlayer = -1;
            this.passCount = 0;
        }
        
        // 移动到下一个玩家
        this.currentPlayer = (this.currentPlayer + 1) % 3;
        
        return { success: true };
    }

    // 获取牌型
    getCardType(cards) {
        if (cards.length === 0) return { valid: false };
        
        // 排序
        cards.sort((a, b) => b.weight - a.weight);
        
        // 单牌
        if (cards.length === 1) {
            return { valid: true, type: 'single', cards: cards, weight: cards[0].weight };
        }
        
        // 对子
        if (cards.length === 2 && cards[0].weight === cards[1].weight) {
            return { valid: true, type: 'pair', cards: cards, weight: cards[0].weight };
        }
        
        // 王炸
        if (cards.length === 2 && cards[0].value === '大王' && cards[1].value === '小王') {
            return { valid: true, type: 'rocket', cards: cards, weight: 999 };
        }
        
        // 三张
        if (cards.length === 3 && cards[0].weight === cards[1].weight && cards[1].weight === cards[2].weight) {
            return { valid: true, type: 'triple', cards: cards, weight: cards[0].weight };
        }
        
        // 炸弹
        if (cards.length === 4 && cards[0].weight === cards[1].weight && 
            cards[1].weight === cards[2].weight && cards[2].weight === cards[3].weight) {
            return { valid: true, type: 'bomb', cards: cards, weight: cards[0].weight };
        }
        
        // 顺子（至少5张）
        if (cards.length >= 5 && this.isConsecutive(cards)) {
            return { valid: true, type: 'straight', cards: cards, weight: cards[0].weight };
        }
        
        // 连对（至少3对）
        if (cards.length >= 6 && cards.length % 2 === 0 && this.isConsecutivePairs(cards)) {
            return { valid: true, type: 'consecutivePairs', cards: cards, weight: cards[0].weight };
        }
        
        // 飞机（至少2个三张）
        if (cards.length >= 6 && cards.length % 3 === 0 && this.isConsecutiveTriples(cards)) {
            return { valid: true, type: 'airplane', cards: cards, weight: cards[0].weight };
        }
        
        return { valid: false };
    }

    // 判断是否连续
    isConsecutive(cards) {
        for (let i = 1; i < cards.length; i++) {
            if (cards[i].weight !== cards[i-1].weight - 1) return false;
        }
        return true;
    }

    // 判断是否连续对子
    isConsecutivePairs(cards) {
        for (let i = 0; i < cards.length; i += 2) {
            if (cards[i].weight !== cards[i+1].weight) return false;
        }
        for (let i = 2; i < cards.length; i += 2) {
            if (cards[i].weight !== cards[i-2].weight - 1) return false;
        }
        return true;
    }

    // 判断是否连续三张
    isConsecutiveTriples(cards) {
        for (let i = 0; i < cards.length; i += 3) {
            if (cards[i].weight !== cards[i+1].weight || cards[i+1].weight !== cards[i+2].weight) return false;
        }
        for (let i = 3; i < cards.length; i += 3) {
            if (cards[i].weight !== cards[i-3].weight - 1) return false;
        }
        return true;
    }

    // 判断是否能压过上家
    canBeat(current, last) {
        // 王炸最大
        if (current.type === 'rocket') return true;
        if (last.type === 'rocket') return false;
        
        // 炸弹可以压非炸弹
        if (current.type === 'bomb' && last.type !== 'bomb') return true;
        if (last.type === 'bomb' && current.type !== 'bomb') return false;
        
        // 同类型比较
        if (current.type === last.type && current.cards.length === last.cards.length) {
            return current.weight > last.weight;
        }
        
        return false;
    }

    // 获取游戏状态
    getGameState() {
        return {
            gamePhase: this.gamePhase,
            currentPlayer: this.currentPlayer,
            landlord: this.landlord,
            lastPlay: this.lastPlay,
            lastPlayer: this.lastPlayer,
            callScores: this.callScores,
            currentCaller: this.currentCaller,
            landlordCards: this.landlordCards,
            playerCardsCount: this.playerCards.map(cards => cards.length)
        };
    }

    // 重置游戏
    reset() {
        this.players = [null, null, null];
        this.playerCards = [[], [], []];
        this.landlordCards = [];
        this.currentPlayer = 0;
        this.landlord = -1;
        this.gamePhase = 'waiting';
        this.lastPlay = null;
        this.lastPlayer = -1;
        this.passCount = 0;
        this.callScores = [0, 0, 0];
        this.currentCaller = 0;
        
        this.initCards();
    }
}

module.exports = DouDiZhuGame;
