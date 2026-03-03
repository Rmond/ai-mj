(function(){
    const NORMAL_TILES = [
        '1万','2万','3万','4万','5万','6万','7万','8万','9万',
        '1筒','2筒','3筒','4筒','5筒','6筒','7筒','8筒','9筒',
        '1条','2条','3条','4条','5条','6条','7条','8条','9条',
        '东','南','西','北','白','发','中'
    ];
    const FLOWER_TILES = ['春','夏','秋','冬','梅','兰','竹','菊'];
    const ZI_TILES = ['东','南','西','北','白','发','中'];

    let allTiles = [];
    NORMAL_TILES.forEach(t => { for(let i=0;i<4;i++) allTiles.push(t); });
    FLOWER_TILES.forEach(t => allTiles.push(t));

    let deck = [];
    let playersHand = [[], [], [], []];
    let playersFlower = [[], [], [], []];
    let playersMeld = [[], [], [], []];
    let publicDiscard = [];
    let discardHistory = [];
    let currentPlayer = 0;
    let gameActive = false;
    let waitingForAI = false;
    let actionRequired = false;
    let lastDiscard = null;
    let lastDiscardBy = -1;
    let currentResponder = -1;
    let awaitingEatChoice = false;
    let passedPlayers = []; // 记录当前打出牌后已经选择“过”的玩家

    const aiConfigs = {
        1: { url: '', model: '', key: '' },
        2: { url: '', model: '', key: '' },
        3: { url: '', model: '', key: '' }
    };

    const deckCountSpan = document.getElementById('deckCount');
    const turnText = document.getElementById('turnText');
    const publicDiscardDiv = document.getElementById('publicDiscards');
    const playerHandDiv = document.getElementById('playerHand');
    const playerCountSpan = document.getElementById('playerCount');
    const playerFlowerDiv = document.getElementById('playerFlower');
    const playerMeldDiv = document.getElementById('playerMeld');
    const restartBtn = document.getElementById('restartBtn');
    const aiCount = [null, document.getElementById('ai1count'), document.getElementById('ai2count'), document.getElementById('ai3count')];
    const aiFlower = [null, document.getElementById('ai1flower'), document.getElementById('ai2flower'), document.getElementById('ai3flower')];
    const aiMeld = [null, document.getElementById('ai1meld'), document.getElementById('ai2meld'), document.getElementById('ai3meld')];
    const actionBtns = {
        chi: document.getElementById('chiBtn'),
        peng: document.getElementById('pengBtn'),
        gang: document.getElementById('gangBtn'),
        hu: document.getElementById('huBtn'),
        pass: document.getElementById('passBtn')
    };
    const eatChoicePanel = document.getElementById('eatChoicePanel');
    const eatChoiceButtons = document.getElementById('eatChoiceButtons');
    const cancelEatChoice = document.getElementById('cancelEatChoice');

    const playerNames = ['你', '下家', '对家', '上家'];

    function shuffle(arr) {
        for(let i=arr.length-1;i>0;i--) {
            const j = Math.floor(Math.random()*(i+1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    function initDeck() {
        deck = shuffle([...allTiles]);
    }

    function sortHand(hand) {
        const order = [
            '1万','2万','3万','4万','5万','6万','7万','8万','9万',
            '1筒','2筒','3筒','4筒','5筒','6筒','7筒','8筒','9筒',
            '1条','2条','3条','4条','5条','6条','7条','8条','9条',
            '东','南','西','北','白','发','中','春','夏','秋','冬','梅','兰','竹','菊'
        ];
        hand.sort((a,b) => order.indexOf(a) - order.indexOf(b));
    }

    function deal() {
        for(let i=0;i<4;i++) {
            playersHand[i] = [];
            playersFlower[i] = [];
            playersMeld[i] = [];
        }
        for(let i=0;i<13;i++) {
            for(let p=0;p<4;p++) {
                if(deck.length) playersHand[p].push(deck.pop());
            }
        }
        for(let p=0;p<4;p++) {
            replaceFlowersInHand(p);
            sortHand(playersHand[p]);
        }
    }

    function replaceFlowersInHand(p) {
        let i = 0;
        while(i < playersHand[p].length) {
            const tile = playersHand[p][i];
            if(FLOWER_TILES.includes(tile)) {
                playersFlower[p].push(tile);
                playersHand[p].splice(i,1);
                if(deck.length) {
                    const newTile = deck.pop();
                    playersHand[p].push(newTile);
                } else {
                    break;
                }
            } else {
                i++;
            }
        }
    }

    function drawCardForPlayer(p) {
        if(deck.length === 0) return null;
        let tile = deck.pop();
        while(FLOWER_TILES.includes(tile)) {
            playersFlower[p].push(tile);
            if(deck.length === 0) {
                tile = null;
                break;
            }
            tile = deck.pop();
        }
        return tile;
    }

    function parseTile(t) {
        if (ZI_TILES.includes(t)) {
            return { type: 'zi', name: t };
        } else {
            const num = parseInt(t[0]);
            const suit = t[1];
            return { type: 'number', num, suit };
        }
    }

    function isQiDui(tiles) {
        if (tiles.length !== 14) return false;
        const countMap = new Map();
        for (let t of tiles) {
            countMap.set(t, (countMap.get(t) || 0) + 1);
        }
        for (let cnt of countMap.values()) {
            if (cnt !== 2) return false;
        }
        return true;
    }

    function canBeJiang(tile) {
        if (ZI_TILES.includes(tile)) return false;
        const num = parseInt(tile[0]);
        return num === 2 || num === 5 || num === 8;
    }

    function canHu(hand, newTile) {
        const tiles = [...hand, newTile];
        if (tiles.length % 3 !== 2) return false;
        if (isQiDui(tiles)) return true;

        const countMap = new Map();
        for (let t of tiles) {
            countMap.set(t, (countMap.get(t) || 0) + 1);
        }
        const uniqueTiles = Array.from(countMap.keys());
        for (let pairTile of uniqueTiles) {
            if (countMap.get(pairTile) < 2) continue;
            if (!canBeJiang(pairTile)) continue;
            const cnt = new Map(countMap);
            cnt.set(pairTile, cnt.get(pairTile) - 2);
            if (cnt.get(pairTile) === 0) cnt.delete(pairTile);
            if (canFormGroups(cnt)) return true;
        }
        return false;
    }

    function canFormGroups(cnt) {
        if (cnt.size === 0) return true;
        const tiles = Array.from(cnt.keys());
        tiles.sort((a,b) => {
            const aIsNum = !ZI_TILES.includes(a);
            const bIsNum = !ZI_TILES.includes(b);
            if (aIsNum && !bIsNum) return -1;
            if (!aIsNum && bIsNum) return 1;
            return a.localeCompare(b);
        });
        const first = tiles[0];
        const firstCnt = cnt.get(first);

        if (firstCnt >= 3) {
            const newCnt = new Map(cnt);
            newCnt.set(first, firstCnt - 3);
            if (newCnt.get(first) === 0) newCnt.delete(first);
            if (canFormGroups(newCnt)) return true;
        }

        if (!ZI_TILES.includes(first)) {
            const parsed = parseTile(first);
            const num = parsed.num;
            const suit = parsed.suit;
            const second = (num+1) + suit;
            const third = (num+2) + suit;
            if (cnt.has(second) && cnt.has(third)) {
                const newCnt = new Map(cnt);
                newCnt.set(first, firstCnt - 1);
                if (newCnt.get(first) === 0) newCnt.delete(first);
                newCnt.set(second, newCnt.get(second) - 1);
                if (newCnt.get(second) === 0) newCnt.delete(second);
                newCnt.set(third, newCnt.get(third) - 1);
                if (newCnt.get(third) === 0) newCnt.delete(third);
                if (canFormGroups(newCnt)) return true;
            }
        }
        return false;
    }

    function getAvailableActions(p, tile, discarder) {
        const actions = [];
        if (p === discarder) return actions;
        const hand = playersHand[p];
        if (canHu(hand, tile)) {
            actions.push('hu');
        }
        const count = hand.filter(t => t === tile).length;
        if (count >= 2) {
            actions.push('peng');
        }
        if (count >= 3) {
            actions.push('gang');
        }
        if (discarder === (p+3)%4 && !FLOWER_TILES.includes(tile) && NORMAL_TILES.includes(tile)) {
            const num = parseInt(tile[0]);
            const suit = tile[1];
            const prev = (num-1) + suit;
            const next = (num+1) + suit;
            const prev2 = (num-2) + suit;
            const next2 = (num+2) + suit;
            if (hand.includes(next) && hand.includes(next2)) actions.push('chi_left');
            if (hand.includes(prev) && hand.includes(next)) actions.push('chi_mid');
            if (hand.includes(prev2) && hand.includes(prev)) actions.push('chi_right');
        }
        return actions;
    }

    function renderAll() {
        playerCountSpan.innerText = playersHand[0].length;
        for(let i=1;i<=3;i++) aiCount[i].innerText = playersHand[i].length;
        playerFlowerDiv.innerHTML = playersFlower[0].map(t => `<span class="tile small">${t}</span>`).join('');
        for(let i=1;i<=3;i++) aiFlower[i].innerHTML = playersFlower[i].map(t => `<span class="tile small">${t}</span>`).join('');
        playerMeldDiv.innerHTML = playersMeld[0].map(m => 
            `<span style="display:flex;gap:2px;background:rgba(255,255,255,0.1);padding:2px;border-radius:8px;">${m.tiles.map(t => `<span class="tile small">${t}</span>`).join('')}</span>`
        ).join('');
        for(let i=1;i<=3;i++) {
            aiMeld[i].innerHTML = playersMeld[i].map(m => 
                `<span style="display:flex;gap:2px;background:rgba(255,255,255,0.1);padding:2px;border-radius:8px;">${m.tiles.map(t => `<span class="tile small">${t}</span>`).join('')}</span>`
            ).join('');
        }
        publicDiscardDiv.innerHTML = publicDiscard.slice(-15).map(t => `<span class="tile">${t}</span>`).join('');
        if(playersHand[0]) {
            playerHandDiv.innerHTML = playersHand[0].map(t => 
                `<button class="tile-btn" data-tile="${t}" ${!gameActive || currentPlayer!==0 || actionRequired || waitingForAI || awaitingEatChoice ? 'disabled' : ''}>${t}</button>`
            ).join('');
        }
        deckCountSpan.innerText = deck.length;
        turnText.innerText = !gameActive ? '⚙️ 未开始' : (waitingForAI ? '🤖 AI思考' : (currentPlayer===0 ? '🧑 你的回合' : `🤖 AI-${currentPlayer}`));

        if (actionRequired) {
            actionBtns.pass.disabled = false;
            if (gameActive && currentPlayer === 0 && !waitingForAI && !awaitingEatChoice) {
                const hand = playersHand[0];
                const counts = {};
                for (let t of hand) counts[t] = (counts[t] || 0) + 1;
                const hasQuad = Object.values(counts).some(c => c >= 4);
                const hasPengTile = playersMeld[0].some(m => m.type === 'peng' && hand.includes(m.tiles[0]));
                actionBtns.gang.disabled = !(hasQuad || hasPengTile);
            }
        } else {
            actionBtns.chi.disabled = true;
            actionBtns.peng.disabled = true;
            actionBtns.gang.disabled = true;
            actionBtns.hu.disabled = true;
            actionBtns.pass.disabled = true;
        }

        if (gameActive && currentPlayer === 0 && !actionRequired && !waitingForAI && !awaitingEatChoice) {
            const hand = playersHand[0];
            const counts = {};
            for (let t of hand) counts[t] = (counts[t] || 0) + 1;
            const hasQuad = Object.values(counts).some(c => c >= 4);
            const hasPengTile = playersMeld[0].some(m => m.type === 'peng' && hand.includes(m.tiles[0]));
            actionBtns.gang.disabled = !(hasQuad || hasPengTile);
        }
    }

    function showEatOptions(possibleEats, tile) {
        awaitingEatChoice = true;
        actionBtns.chi.disabled = true;
        actionBtns.peng.disabled = true;
        actionBtns.gang.disabled = true;
        actionBtns.hu.disabled = true;
        actionBtns.pass.disabled = true;
        renderAll();

        eatChoiceButtons.innerHTML = '';
        possibleEats.forEach((eat, index) => {
            const btn = document.createElement('button');
            btn.className = 'eat-option-btn';
            btn.innerText = eat.tiles.join('');
            btn.onclick = () => {
                for (let r of eat.remove) {
                    const idx = playersHand[0].indexOf(r);
                    if (idx !== -1) playersHand[0].splice(idx, 1);
                }
                playersMeld[0].push({type:'chi', tiles:eat.tiles});
                sortHand(playersHand[0]);
                eatChoicePanel.style.display = 'none';
                awaitingEatChoice = false;
                actionRequired = false;
                currentPlayer = 0;
                passedPlayers = []; // 重置已过玩家
                renderAll();
            };
            eatChoiceButtons.appendChild(btn);
        });

        eatChoicePanel.style.display = 'block';
    }

    cancelEatChoice.onclick = () => {
        eatChoicePanel.style.display = 'none';
        awaitingEatChoice = false;
        const actions = getAvailableActions(0, lastDiscard, lastDiscardBy);
        actionBtns.chi.disabled = !actions.some(a => a.startsWith('chi'));
        actionBtns.peng.disabled = !actions.includes('peng');
        actionBtns.gang.disabled = !actions.includes('gang');
        actionBtns.hu.disabled = !actions.includes('hu');
        actionBtns.pass.disabled = false;
        renderAll();
    };

    function startGame() {
        initDeck();
        deal();
        gameActive = true;
        currentPlayer = 0;
        waitingForAI = false;
        actionRequired = false;
        awaitingEatChoice = false;
        publicDiscard = [];
        discardHistory = [];
        currentResponder = -1;
        passedPlayers = [];
        eatChoicePanel.style.display = 'none';
        renderAll();
        if(currentPlayer === 0) playerDraw();
    }

    function playerDraw() {
        if(!gameActive || currentPlayer!==0 || actionRequired || awaitingEatChoice) return;
        const tile = drawCardForPlayer(0);
        if(!tile) { gameOver('牌堆空'); return; }
        playersHand[0].push(tile);
        
        if (canHu(playersHand[0].slice(0, -1), tile)) {
            actionRequired = true;
            actionBtns.hu.disabled = false;
            actionBtns.pass.disabled = false;
            actionBtns.chi.disabled = true;
            actionBtns.peng.disabled = true;
        }
        
        renderAll();
    }

    function playerDiscard(tile) {
        if(!gameActive || currentPlayer!==0 || actionRequired || awaitingEatChoice) return;
        const idx = playersHand[0].indexOf(tile);
        if(idx===-1) return;
        playersHand[0].splice(idx,1);
        publicDiscard.push(tile);
        discardHistory.push({player:0, tile});
        lastDiscard = tile;
        lastDiscardBy = 0;
        passedPlayers = []; // 重置已过玩家
        sortHand(playersHand[0]);
        renderAll();
        askNextPlayer((0+1)%4, 0);
    }

    function askNextPlayer(start, discarder) {
        if (!gameActive) return;
        
        // 优先检查碰、杠、胡（按逆时针顺序，跳过已过玩家）
        for (let i = 0; i < 4; i++) {
            const p = (start + i) % 4;
            if (p === discarder || passedPlayers.includes(p)) continue;
            const actions = getAvailableActions(p, lastDiscard, discarder);
            const hasPriorityAction = actions.some(a => ['peng', 'gang', 'hu'].includes(a));
            
            if (hasPriorityAction) {
                if (p === 0) {
                    actionRequired = true;
                    currentResponder = p;
                    actionBtns.chi.disabled = true;
                    actionBtns.peng.disabled = !actions.includes('peng');
                    actionBtns.gang.disabled = !actions.includes('gang');
                    actionBtns.hu.disabled = !actions.includes('hu');
                    actionBtns.pass.disabled = false;
                    renderAll();
                    return;
                } else {
                    waitingForAI = true;
                    renderAll();
                    askAIAction(p, actions, discarder).then(chosenAction => {
                        waitingForAI = false;
                        if (chosenAction && chosenAction !== 'pass') {
                            performAIAction(p, chosenAction, lastDiscard, discarder);
                        } else {
                            // AI 选择过，加入已过列表并询问下一家
                            passedPlayers.push(p);
                            askNextPlayer((p+1)%4, discarder);
                        }
                    });
                    return;
                }
            }
        }
        
        // 没有优先动作，检查下家是否可以吃（跳过已过玩家）
        const nextPlayer = (discarder + 1) % 4;
        if (!passedPlayers.includes(nextPlayer)) {
            const chiActions = getAvailableActions(nextPlayer, lastDiscard, discarder);
            const hasChi = chiActions.some(a => a.startsWith('chi'));
            if (hasChi) {
                if (nextPlayer === 0) {
                    actionRequired = true;
                    currentResponder = nextPlayer;
                    actionBtns.chi.disabled = false;
                    actionBtns.peng.disabled = true;
                    actionBtns.gang.disabled = true;
                    actionBtns.hu.disabled = !chiActions.includes('hu');
                    actionBtns.pass.disabled = false;
                    renderAll();
                } else {
                    waitingForAI = true;
                    renderAll();
                    askAIAction(nextPlayer, chiActions, discarder).then(chosenAction => {
                        waitingForAI = false;
                        if (chosenAction && chosenAction !== 'pass') {
                            performAIAction(nextPlayer, chosenAction, lastDiscard, discarder);
                        } else {
                            passedPlayers.push(nextPlayer);
                            nextTurnAfterDiscard(discarder);
                        }
                    });
                }
                return;
            }
        }
        
        // 无人响应，进入下一人摸牌
        nextTurnAfterDiscard(discarder);
    }

    async function askAIAction(p, actions, discarder) {
        if (actions.includes('hu')) return 'hu';
        const nonHu = actions.filter(a => a !== 'hu');
        if (nonHu.length === 0) return 'pass';
        const randomIndex = Math.floor(Math.random() * nonHu.length);
        return nonHu[randomIndex];
    }

    function performAIAction(p, action, tile, discarder) {
        if (!gameActive) return;
        if (action === 'hu') {
            alert(`AI-${p} 胡牌！游戏结束`);
            gameActive = false;
            renderAll();
            return;
        }
        if (action === 'peng') {
            const indices = playersHand[p].reduce((acc,t,i) => t===tile ? [...acc,i] : acc, []);
            if (indices.length >= 2) {
                playersHand[p].splice(indices[0],1);
                playersHand[p].splice(indices[1]-1,1);
                playersMeld[p].push({type:'peng', tiles:[tile, tile, tile]});
                sortHand(playersHand[p]);
                passedPlayers = []; // 重置已过玩家
                renderAll();
                currentPlayer = p;
                if (p !== 0) {
                    aiTurn();
                }
                return;
            }
        }
        if (action === 'gang') {
            const indices = playersHand[p].reduce((acc,t,i) => t===tile ? [...acc,i] : acc, []);
            if (indices.length >= 3) {
                indices.sort((a,b)=>b-a);
                for(let idx of indices) playersHand[p].splice(idx,1);
                playersMeld[p].push({type:'gang', tiles:[tile, tile, tile, tile]});
                const newTile = drawCardForPlayer(p);
                if(newTile) playersHand[p].push(newTile);
                sortHand(playersHand[p]);
                passedPlayers = []; // 重置已过玩家
                renderAll();
                currentPlayer = p;
                if (p !== 0) {
                    aiTurn();
                }
                return;
            }
        }
        if (action.startsWith('chi')) {
            const num = parseInt(tile[0]);
            const suit = tile[1];
            let remove = [];
            let chiTiles = [];
            if (action === 'chi_left') {
                remove = [(num+1)+suit, (num+2)+suit];
                chiTiles = [tile, (num+1)+suit, (num+2)+suit];
            } else if (action === 'chi_mid') {
                remove = [(num-1)+suit, (num+1)+suit];
                chiTiles = [(num-1)+suit, tile, (num+1)+suit];
            } else if (action === 'chi_right') {
                remove = [(num-2)+suit, (num-1)+suit];
                chiTiles = [(num-2)+suit, (num-1)+suit, tile];
            }
            for (let r of remove) {
                const idx = playersHand[p].indexOf(r);
                if (idx !== -1) playersHand[p].splice(idx, 1);
            }
            playersMeld[p].push({type:'chi', tiles:chiTiles});
            sortHand(playersHand[p]);
            passedPlayers = []; // 重置已过玩家
            renderAll();
            currentPlayer = p;
            if (p !== 0) {
                aiTurn();
            }
            return;
        }
    }

    function handlePlayerAction(act) {
        if (!gameActive || !actionRequired || currentResponder !== 0 || awaitingEatChoice) return;

        if (act === 'pass') {
            passedPlayers.push(0); // 记录玩家已过
            actionRequired = false;
            if (lastDiscardBy === -1 || lastDiscardBy === undefined) {
                renderAll();
            } else {
                const isChiOnly = !actionBtns.chi.disabled && actionBtns.peng.disabled && actionBtns.gang.disabled;
                if (isChiOnly) {
                    nextTurnAfterDiscard(lastDiscardBy);
                } else {
                    askNextPlayer((currentResponder+1)%4, lastDiscardBy);
                }
            }
            return;
        }

        if (act === 'hu') {
            alert('恭喜！你胡牌了！');
            gameActive = false;
            actionRequired = false;
            actionBtns.hu.disabled = true;
            actionBtns.peng.disabled = true;
            actionBtns.gang.disabled = true;
            actionBtns.chi.disabled = true;
            actionBtns.pass.disabled = true;
            renderAll();
            return;
        }

        if (act === 'peng') {
            const tile = lastDiscard;
            const indices = playersHand[0].reduce((acc,t,i) => t===tile ? [...acc,i] : acc, []);
            if (indices.length >= 2) {
                playersHand[0].splice(indices[0],1);
                playersHand[0].splice(indices[1]-1,1);
                playersMeld[0].push({type:'peng', tiles:[tile, tile, tile]});
                sortHand(playersHand[0]);
                actionRequired = false;
                currentPlayer = 0;
                passedPlayers = []; // 重置已过玩家
                renderAll();
            }
            return;
        }

        if (act === 'gang') {
            if (actionRequired) {
                const tile = lastDiscard;
                const indices = playersHand[0].reduce((acc,t,i) => t===tile ? [...acc,i] : acc, []);
                if (indices.length >= 3) {
                    indices.sort((a,b)=>b-a);
                    for(let idx of indices) playersHand[0].splice(idx,1);
                    playersMeld[0].push({type:'gang', tiles:[tile, tile, tile, tile]});
                    const newTile = drawCardForPlayer(0);
                    if(newTile) playersHand[0].push(newTile);
                    sortHand(playersHand[0]);
                    actionRequired = false;
                    currentPlayer = 0;
                    passedPlayers = []; // 重置已过玩家
                    renderAll();
                }
            } else {
                const hand = playersHand[0];
                const counts = {};
                for (let t of hand) counts[t] = (counts[t] || 0) + 1;
                
                let gangTile = null;
                for (let tile in counts) {
                    if (counts[tile] >= 4) {
                        gangTile = tile;
                        break;
                    }
                }
                
                if (gangTile) {
                    const indices = playersHand[0].reduce((acc,t,i) => t===gangTile ? [...acc,i] : acc, []);
                    indices.sort((a,b)=>b-a);
                    for(let idx of indices) playersHand[0].splice(idx,1);
                    playersMeld[0].push({type:'gang', tiles:[gangTile, gangTile, gangTile, gangTile]});
                    const newTile = drawCardForPlayer(0);
                    if(newTile) playersHand[0].push(newTile);
                    sortHand(playersHand[0]);
                    currentPlayer = 0;
                    passedPlayers = []; // 重置已过玩家
                    renderAll();
                } else {
                    for (let meld of playersMeld[0]) {
                        if (meld.type === 'peng') {
                            const tile = meld.tiles[0];
                            const count = hand.filter(t => t === tile).length;
                            if (count >= 1) {
                                const idx = hand.indexOf(tile);
                                if (idx !== -1) {
                                    hand.splice(idx, 1);
                                    meld.type = 'gang';
                                    meld.tiles = [tile, tile, tile, tile];
                                    const newTile = drawCardForPlayer(0);
                                    if(newTile) playersHand[0].push(newTile);
                                    sortHand(playersHand[0]);
                                    currentPlayer = 0;
                                    passedPlayers = []; // 重置已过玩家
                                    renderAll();
                                }
                                break;
                            }
                        }
                    }
                }
            }
            return;
        }

        if (act === 'chi') {
            const tile = lastDiscard;
            const num = parseInt(tile[0]);
            const suit = tile[1];
            const possibleEats = [];
            const next = (num+1) + suit;
            const next2 = (num+2) + suit;
            if (playersHand[0].includes(next) && playersHand[0].includes(next2)) {
                possibleEats.push({tiles:[tile, next, next2], remove:[next, next2]});
            }
            const prev = (num-1) + suit;
            if (playersHand[0].includes(prev) && playersHand[0].includes(next)) {
                possibleEats.push({tiles:[prev, tile, next], remove:[prev, next]});
            }
            const prev2 = (num-2) + suit;
            if (playersHand[0].includes(prev2) && playersHand[0].includes(prev)) {
                possibleEats.push({tiles:[prev2, prev, tile], remove:[prev2, prev]});
            }
            if (possibleEats.length === 1) {
                for (let r of possibleEats[0].remove) {
                    const idx = playersHand[0].indexOf(r);
                    if (idx !== -1) playersHand[0].splice(idx, 1);
                }
                playersMeld[0].push({type:'chi', tiles:possibleEats[0].tiles});
                sortHand(playersHand[0]);
                actionRequired = false;
                currentPlayer = 0;
                passedPlayers = []; // 重置已过玩家
                renderAll();
            } else if (possibleEats.length > 1) {
                showEatOptions(possibleEats, tile);
            }
            return;
        }
    }

    function nextTurnAfterDiscard(discarder) {
        const nextP = (discarder + 1) % 4;
        currentPlayer = nextP;
        renderAll();
        if (nextP === 0) {
            playerDraw();
        } else {
            aiTurn();
        }
    }

    async function aiTurn() {
        if (!gameActive || currentPlayer === 0) return;
        waitingForAI = true;
        renderAll();
        await new Promise(r => setTimeout(r, 800));
        const p = currentPlayer;
        const tile = drawCardForPlayer(p);
        if(!tile) { gameOver('牌堆空'); return; }
        playersHand[p].push(tile);
        sortHand(playersHand[p]);
        renderAll();
        await new Promise(r => setTimeout(r, 600));

        const aiIdx = currentPlayer;
        const hand = playersHand[aiIdx];
        let discardTile = null;
        const cfg = aiConfigs[aiIdx];
        
        prepareAIPrompt(aiIdx, hand);
        
        if(cfg.url) {
            try {
                discardTile = await callAI(aiIdx, hand, cfg);
            } catch(e) { console.warn(e); }
        }
        if(!discardTile || !hand.includes(discardTile)) {
            discardTile = hand[Math.floor(Math.random()*hand.length)];
            console.log(`随机选择：${discardTile}`);
        }

        const idx = playersHand[aiIdx].indexOf(discardTile);
        if(idx!==-1) playersHand[aiIdx].splice(idx,1);
        publicDiscard.push(discardTile);
        discardHistory.push({player:aiIdx, tile:discardTile});
        lastDiscard = discardTile;
        lastDiscardBy = aiIdx;
        passedPlayers = [];
        waitingForAI = false;
        renderAll();
        askNextPlayer((aiIdx+1)%4, aiIdx);
    }

    async function callAI(aiIdx, hand, cfg) {
        const discardByPlayer = [[], [], [], []];
        for (let d of discardHistory) {
            discardByPlayer[d.player].push(d.tile);
        }
        
        const relativeNames = ['上家', '对家', '下家'];
        let discardDesc = '';
        
        if (discardByPlayer[aiIdx].length > 0) {
            discardDesc += `自己：${discardByPlayer[aiIdx].join('、')}；`;
        }
        
        for (let p = 0; p < 4; p++) {
            if (p === aiIdx) continue;
            if (discardByPlayer[p].length > 0) {
                let relativePos;
                if (aiIdx === 1) {
                    if (p === 0) relativePos = 0;
                    else if (p === 2) relativePos = 2;
                    else relativePos = 1;
                } else if (aiIdx === 2) {
                    if (p === 1) relativePos = 0;
                    else if (p === 3) relativePos = 2;
                    else relativePos = 1;
                } else {
                    if (p === 2) relativePos = 0;
                    else if (p === 0) relativePos = 2;
                    else relativePos = 1;
                }
                const name = relativeNames[relativePos];
                discardDesc += `${name}：${discardByPlayer[p].join('、')}；`;
            }
        }
        
        if (discardDesc === '') discardDesc = '尚无弃牌';
        else discardDesc = '所有已打出的牌：' + discardDesc;

        const prompt = `你是一个麻将AI。手牌：${hand.join(',')}。${discardDesc}。请选择一张牌打出，只输出牌名(如"1万"或"东")，不要其他文字。`;
        
        console.log(`=== AI${aiIdx} 调用配置 ===`);
        console.log(`API URL: ${cfg.url}`);
        console.log(`Model: ${cfg.model || 'gpt-3.5-turbo'}`);
        console.log(`Key: ${cfg.key ? '已配置' : '未配置'}`);
        console.log(`Prompt: ${prompt}`);
        console.log('=====================');
        
        const body = {
            model: cfg.model || 'gpt-3.5-turbo',
            messages: [{role:'user', content: prompt}],
            temperature:0.7,
            max_tokens:20
        };
        const headers = {'Content-Type':'application/json'};
        if(cfg.key) headers['Authorization'] = `Bearer ${cfg.key}`;

        const resp = await fetch(cfg.url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body)
        });
        const data = await resp.json();
        const content = data.choices?.[0]?.message?.content || '';
        const match = content.match(/[^\s,，]+/);
        console.log(`AI${aiIdx} 返回结果：${match ? match[0] : '无效'}`);
        return match ? match[0] : null;
    }

    function prepareAIPrompt(aiIdx, hand) {
        const discardByPlayer = [[], [], [], []];
        for (let d of discardHistory) {
            discardByPlayer[d.player].push(d.tile);
        }
        
        const relativeNames = ['上家', '对家', '下家'];
        let discardDesc = '';
        
        if (discardByPlayer[aiIdx].length > 0) {
            discardDesc += `自己：${discardByPlayer[aiIdx].join('、')}；`;
        }
        
        for (let p = 0; p < 4; p++) {
            if (p === aiIdx) continue;
            if (discardByPlayer[p].length > 0) {
                let relativePos;
                if (aiIdx === 1) {
                    if (p === 0) relativePos = 0;
                    else if (p === 2) relativePos = 2;
                    else relativePos = 1;
                } else if (aiIdx === 2) {
                    if (p === 1) relativePos = 0;
                    else if (p === 3) relativePos = 2;
                    else relativePos = 1;
                } else {
                    if (p === 2) relativePos = 0;
                    else if (p === 0) relativePos = 2;
                    else relativePos = 1;
                }
                const name = relativeNames[relativePos];
                discardDesc += `${name}：${discardByPlayer[p].join('、')}；`;
            }
        }
        
        if (discardDesc === '') discardDesc = '尚无弃牌';
        else discardDesc = '所有已打出的牌：' + discardDesc;

        const prompt = `你是一个麻将AI。手牌：${hand.join(',')}。${discardDesc}。请选择一张牌打出，只输出牌名(如"1万"或"东")，不要其他文字。`;
        
        console.log(`=== AI${aiIdx} 收到的信息 ===`);
        console.log(`手牌：${hand.join(',')}`);
        console.log(discardDesc);
        console.log(`完整提示：${prompt}`);
        console.log('========================');
        
        return prompt;
    }

    function gameOver(reason) {
        gameActive = false;
        alert('游戏结束：' + reason);
        renderAll();
    }

    actionBtns.peng.addEventListener('click', ()=>handlePlayerAction('peng'));
    actionBtns.gang.addEventListener('click', ()=>handlePlayerAction('gang'));
    actionBtns.hu.addEventListener('click', ()=>handlePlayerAction('hu'));
    actionBtns.chi.addEventListener('click', ()=>handlePlayerAction('chi'));
    actionBtns.pass.addEventListener('click', ()=>handlePlayerAction('pass'));

    playerHandDiv.addEventListener('click', (e) => {
        if(!gameActive || currentPlayer!==0 || actionRequired || awaitingEatChoice) return;
        const btn = e.target.closest('.tile-btn');
        if(btn && !btn.disabled) {
            const tile = btn.dataset.tile;
            playerDiscard(tile);
        }
    });

    restartBtn.onclick = startGame;

    function createPopup(aiPlayer, element) {
        const popup = document.getElementById('aiConfigPopup');
        const playerName = document.getElementById('aiConfigPlayerName');
        const apiUrlInput = document.getElementById('aiApiUrl');
        const modelNameInput = document.getElementById('aiModelName');
        const systemPromptInput = document.getElementById('aiSystemPrompt');

        const playerNames = { 1: '下家', 2: '对家', 3: '上家' };
        playerName.textContent = playerNames[aiPlayer];

        apiUrlInput.value = aiConfigs[aiPlayer].url;
        modelNameInput.value = aiConfigs[aiPlayer].model;
        systemPromptInput.value = aiConfigs[aiPlayer].key;

        popup.style.display = 'flex';
    }

    document.getElementById('saveAiConfig').addEventListener('click', () => {
        const apiUrlInput = document.getElementById('aiApiUrl');
        const modelNameInput = document.getElementById('aiModelName');
        const systemPromptInput = document.getElementById('aiSystemPrompt');
        const playerName = document.getElementById('aiConfigPlayerName').textContent;

        const playerMap = { '下家': 1, '对家': 2, '上家': 3 };
        const aiPlayer = playerMap[playerName];

        aiConfigs[aiPlayer].url = apiUrlInput.value;
        aiConfigs[aiPlayer].model = modelNameInput.value;
        aiConfigs[aiPlayer].key = systemPromptInput.value;

        document.getElementById('aiConfigPopup').style.display = 'none';
    });

    document.getElementById('cancelAiConfig').addEventListener('click', () => {
        document.getElementById('aiConfigPopup').style.display = 'none';
    });

    document.getElementById('ai1header').addEventListener('click', (e) => {
        e.stopPropagation();
        createPopup(1, document.querySelector('#ai1header .avatar'));
    });

    document.getElementById('ai2header').addEventListener('click', (e) => {
        e.stopPropagation();
        createPopup(2, document.querySelector('#ai2header .avatar'));
    });

    document.getElementById('ai3header').addEventListener('click', (e) => {
        e.stopPropagation();
        createPopup(3, document.querySelector('#ai3header .avatar'));
    });

    window.startGame = startGame;
    setTimeout(startGame, 300);
})();