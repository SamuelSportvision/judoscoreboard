// ===========================
// GLOBAL STATE
// ===========================
const state = {
    // Current age group
    ageGroup: 'u8',
    
    // Match timer
    matchDuration: 120, // seconds
    matchTimeRemaining: 120,
    matchTimerInterval: null,
    matchRunning: false,
    matchEnded: false,
    
    // Scores
    scores: {
        blue: { yuko: 0, wazari: 0, ippon: 0, shido: 0 },
        white: { yuko: 0, wazari: 0, ippon: 0, shido: 0 }
    },
    
    // Osaekomi
    osaekomiActive: false,
    osaekomiPlayer: null,
    osaekomiTime: 0,
    osaekomiInterval: null,
    osaekomiMaxTime: 20,
    osaekomiThresholds: {
        yuko: 5,
        wazari: 10,
        ippon: 20
    },
    osaekomiAwardsGiven: {
        yuko: false,
        wazari: false,
        ippon: false
    },

    // Penalty disqualification threshold
    hansokuMakeCount: 3,

    // Golden Score runtime state (enabled flag lives in ageGroupConfigs per group)
    goldenScoreActive: false,
    goldenScoreTime: 0,
    goldenScoreInterval: null,
    goldenScoreWinner: null,  // { player, type } — set when GS ends via a score, cleared on undo

    // Undo win tracking
    matchEndedDuringGoldenScore: false
};

// Age group configurations
const ageGroupConfigs = {
    u8: {
        duration: 120, // 2 minutes
        hasYuko: false,
        hasShido: false,
        maxYuko: 0,
        maxWazari: 6,
        maxIppon: 3,
        wazariToIppon: true,
        wazariConversionCount: 2,
        ipponEndsMatch: false,
        goldenScore: false
    },
    u10: {
        duration: 120, // 2 minutes
        hasYuko: true,
        hasShido: false,
        maxYuko: 10,
        maxWazari: 999,
        maxIppon: 3,
        wazariToIppon: true,
        wazariConversionCount: 2,
        ipponEndsMatch: false,
        goldenScore: false
    },
    u12: {
        duration: 120, // 2 minutes
        hasYuko: true,
        hasShido: true,
        maxYuko: 10,
        maxWazari: 999,
        maxIppon: 2,
        wazariToIppon: true,
        wazariConversionCount: 2,
        ipponEndsMatch: false,
        goldenScore: false
    },
    u14: {
        duration: 180, // 3 minutes
        hasYuko: true,
        hasShido: true,
        maxYuko: 999,
        maxWazari: 999,
        maxIppon: 999,
        wazariToIppon: true,
        wazariConversionCount: 2,
        ipponEndsMatch: true,
        goldenScore: false
    }
};

// Deep-copy of initial configs used for "Reset to Defaults"
const defaultAgeGroupConfigs = JSON.parse(JSON.stringify(ageGroupConfigs));
const defaultOsaekomiThresholds = { yuko: 5, wazari: 10, ippon: 20 };
const defaultOsaekomiMaxTime = 20;
const defaultHansokuMakeCount = 3;

// ===========================
// INITIALIZATION
// ===========================
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    applyPreset('u8');
    setupEventListeners();
    setupTimerEditListeners();
    initializeCapacitor();
}

function setupEventListeners() {
    // Preset buttons
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const preset = e.target.dataset.preset;
            applyPreset(preset);
        });
    });
    
    // Match timer click
    document.getElementById('matchTimer').addEventListener('click', toggleMatchTimer);
    
    // Timer edit button
    document.getElementById('timerEditBtn').addEventListener('click', enableTimerEdit);
    
    // Swap sides button
    document.getElementById('swapBtn').addEventListener('click', swapSides);
    
    // Reset button
    document.getElementById('resetBtn').addEventListener('click', resetMatch);
    
    // Fullscreen button
    document.getElementById('fullscreenBtn').addEventListener('click', toggleFullscreen);

    // Undo win button
    document.getElementById('undoWinBtn').addEventListener('click', undoMatchEnd);

    // Settings button
    document.getElementById('settingsBtn').addEventListener('click', openSettings);
    document.getElementById('settingsCloseBtn').addEventListener('click', closeSettings);
    document.getElementById('settingsSaveBtn').addEventListener('click', saveSettings);
    document.getElementById('settingsResetBtn').addEventListener('click', resetActiveTabToDefaults);

    // Settings tab switching
    document.getElementById('settingsTabsBar').addEventListener('click', (e) => {
        const tab = e.target.closest('.settings-tab');
        if (!tab) return;
        document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));
        const panel = document.getElementById(`settings-panel-${tab.dataset.tab}`);
        if (panel) panel.classList.add('active');
    });

    // Close modal when clicking backdrop
    document.getElementById('settingsOverlay').addEventListener('click', (e) => {
        if (e.target === document.getElementById('settingsOverlay')) closeSettings();
    });

    // Score buttons
    document.querySelectorAll('.score-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const player = e.target.dataset.player;
            const type = e.target.dataset.type;
            const isIncrement = e.target.classList.contains('increment');

            if (state.matchEnded) {
                // Allow decrement only to undo an accidental golden score point
                if (!isIncrement && state.goldenScoreWinner) {
                    decrementScore(player, type);
                }
                return;
            }

            if (isIncrement) {
                incrementScore(player, type);
            } else {
                decrementScore(player, type);
            }
        });
    });
    
    // Osaekomi buttons
    document.querySelectorAll('.osaekomi-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const player = e.target.dataset.player;
            startOsaekomi(player);
        });
    });
    
    // Osaekomi stop buttons
    document.getElementById('blueOsaekomiStop').addEventListener('click', stopOsaekomi);
    document.getElementById('whiteOsaekomiStop').addEventListener('click', stopOsaekomi);
}

// ===========================
// CAPACITOR INTEGRATION
// ===========================
async function initializeCapacitor() {
    // Check if Capacitor is available (running as native app)
    if (typeof Capacitor !== 'undefined') {
        try {
            // Import KeepAwake plugin
            const { KeepAwake } = Capacitor.Plugins;
            
            // Keep screen awake
            if (KeepAwake) {
                await KeepAwake.keepAwake();
                console.log('Screen will stay awake');
            }
        } catch (error) {
            console.log('Capacitor plugins not available:', error);
        }
    }
}

// ===========================
// PRESET APPLICATION
// ===========================
function applyPreset(group) {
    state.ageGroup = group;
    const config = ageGroupConfigs[group];
    
    // Update match duration
    state.matchDuration = config.duration;
    state.matchTimeRemaining = config.duration;
    
    // Update UI
    updateTimerDisplay();
    
    // Update active preset button
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.preset === group) {
            btn.classList.add('active');
        }
    });
    
    // Show/hide Yuko based on age group
    const yukoContainers = document.querySelectorAll('.yuko-item');
    yukoContainers.forEach(container => {
        if (config.hasYuko) {
            container.classList.remove('hidden');
        } else {
            container.classList.add('hidden');
        }
    });
    
    // Show/hide Shido based on age group
    const shidoContainers = document.querySelectorAll('.shido-item');
    shidoContainers.forEach(container => {
        if (config.hasShido) {
            container.classList.remove('hidden');
        } else {
            container.classList.add('hidden');
        }
    });
    
    console.log(`Preset applied: ${group.toUpperCase()}`);
}

// ===========================
// MATCH TIMER
// ===========================
function toggleMatchTimer() {
    if (state.matchEnded) {
        return;
    }

    // Handle golden score pause/resume
    if (state.goldenScoreActive || state.goldenScoreInterval) {
        if (state.goldenScoreInterval) {
            // Pause golden score
            clearInterval(state.goldenScoreInterval);
            state.goldenScoreInterval = null;
            document.getElementById('matchTimer').classList.remove('running');
            document.getElementById('timerStatus').textContent = 'PAUSED';
        } else {
            // Resume golden score
            document.getElementById('matchTimer').classList.add('running');
            document.getElementById('timerStatus').textContent = 'GOLDEN SCORE';
            state.goldenScoreInterval = setInterval(() => {
                state.goldenScoreTime++;
                updateTimerDisplay();
            }, 1000);
        }
        return;
    }

    if (state.matchRunning) {
        stopMatchTimer();
    } else {
        startMatchTimer();
    }
}

function startMatchTimer() {
    if (state.matchEnded) return;
    
    state.matchRunning = true;
    
    const timerElement = document.getElementById('matchTimer');
    const statusElement = document.getElementById('timerStatus');
    
    timerElement.classList.add('running');
    timerElement.classList.remove('finished');
    statusElement.textContent = 'RUNNING';
    
    state.matchTimerInterval = setInterval(() => {
        state.matchTimeRemaining--;
        updateTimerDisplay();
        
        if (state.matchTimeRemaining <= 0) {
            playHornSound();
            endMatch('TIME UP');
        }
    }, 1000);
}

function stopMatchTimer() {
    state.matchRunning = false;
    
    if (state.matchTimerInterval) {
        clearInterval(state.matchTimerInterval);
        state.matchTimerInterval = null;
    }
    
    const timerElement = document.getElementById('matchTimer');
    const statusElement = document.getElementById('timerStatus');
    
    timerElement.classList.remove('running');
    statusElement.textContent = 'PAUSED';
}

function updateTimerDisplay() {
    let timeValue;
    if (state.goldenScoreActive) {
        timeValue = state.goldenScoreTime;
    } else {
        timeValue = state.matchTimeRemaining;
    }
    const minutes = Math.floor(timeValue / 60);
    const seconds = timeValue % 60;
    document.getElementById('matchTimer').textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// ===========================
// MANUAL TIMER EDIT (tap-based — no keyboard, iOS fullscreen safe)
// ===========================
let timerEditMins = 2;
let timerEditSecs = 0;

function enableTimerEdit() {
    if (state.matchRunning || state.goldenScoreActive) return;

    timerEditMins = Math.floor(state.matchTimeRemaining / 60);
    timerEditSecs = state.matchTimeRemaining % 60;
    refreshTimerEditDisplay();
    document.getElementById('timerEditOverlay').classList.add('active');
}

function refreshTimerEditDisplay() {
    document.getElementById('timerEditMin').textContent = timerEditMins;
    document.getElementById('timerEditSec').textContent = String(timerEditSecs).padStart(2, '0');
}

function closeTimerEdit() {
    document.getElementById('timerEditOverlay').classList.remove('active');
}

function applyTimerEdit() {
    const total = (timerEditMins * 60) + timerEditSecs;
    if (total > 0) {
        state.matchTimeRemaining = total;
        state.matchDuration = total;
        updateTimerDisplay();
    }
    closeTimerEdit();
}

function setupTimerEditListeners() {
    document.getElementById('timerMinUp').addEventListener('click', () => {
        timerEditMins = Math.min(59, timerEditMins + 1);
        refreshTimerEditDisplay();
    });
    document.getElementById('timerMinDown').addEventListener('click', () => {
        timerEditMins = Math.max(0, timerEditMins - 1);
        refreshTimerEditDisplay();
    });
    document.getElementById('timerSecUp').addEventListener('click', () => {
        timerEditSecs = timerEditSecs >= 55 ? 0 : timerEditSecs + 5;
        refreshTimerEditDisplay();
    });
    document.getElementById('timerSecDown').addEventListener('click', () => {
        timerEditSecs = timerEditSecs <= 0 ? 55 : timerEditSecs - 5;
        refreshTimerEditDisplay();
    });
    document.getElementById('timerEditSet').addEventListener('click', applyTimerEdit);
    document.getElementById('timerEditCancel').addEventListener('click', closeTimerEdit);
    document.getElementById('timerEditOverlay').addEventListener('click', (e) => {
        if (e.target === document.getElementById('timerEditOverlay')) closeTimerEdit();
    });
}

function endMatch(reason) {
    state.matchEnded = true;
    state.matchRunning = false;
    state.matchEndedDuringGoldenScore = state.goldenScoreActive;

    if (state.matchTimerInterval) {
        clearInterval(state.matchTimerInterval);
        state.matchTimerInterval = null;
    }
    
    const timerElement = document.getElementById('matchTimer');
    const statusElement = document.getElementById('timerStatus');
    
    timerElement.classList.remove('running');
    timerElement.classList.add('finished');
    
    // Stop golden score if active
    if (state.goldenScoreActive) {
        stopGoldenScore();
    }

    // Stop any active osaekomi
    if (state.osaekomiActive) {
        stopOsaekomi();
    }
    
    // Determine winner message and show it in the status bar
    let message = 'MATCH ENDED';
    if (reason && reason.startsWith('GOLDEN SCORE')) {
        const winner = reason.includes('BLUE') ? 'BLUE' : 'WHITE';
        message = `🥇 ${winner} WINS! (GS)`;
    } else if (reason && reason.includes('BLUE')) {
        message = '🏆 BLUE WINS!';
    } else if (reason && reason.includes('WHITE')) {
        message = '🏆 WHITE WINS!';
    } else if (reason === 'TIME UP') {
        const blueTotal = calculateTotalScore('blue');
        const whiteTotal = calculateTotalScore('white');
        if (blueTotal > whiteTotal) {
            message = '🏆 BLUE WINS!';
        } else if (whiteTotal > blueTotal) {
            message = '🏆 WHITE WINS!';
        } else if (ageGroupConfigs[state.ageGroup].goldenScore) {
            // Tied + golden score enabled for this age group: undo matchEnded and launch golden score
            state.matchEnded = false;
            timerElement.classList.remove('finished');
            startGoldenScore();
            return;
        } else {
            message = 'TIE!';
        }
    }
    
    statusElement.textContent = message;
    statusElement.classList.add('winner');

    document.getElementById('undoWinBtn').classList.add('visible');
    
    console.log(`Match ended: ${reason}`);
}

// ===========================
// UNDO WIN
// ===========================
function undoMatchEnd() {
    state.matchEnded = false;
    state.goldenScoreWinner = null;

    const timerElement = document.getElementById('matchTimer');
    const statusElement = document.getElementById('timerStatus');

    timerElement.classList.remove('finished');
    statusElement.classList.remove('winner');

    if (state.matchEndedDuringGoldenScore) {
        state.goldenScoreActive = true;
        state.matchEndedDuringGoldenScore = false;
        timerElement.classList.add('golden-score');
        statusElement.textContent = 'GOLDEN SCORE — TAP TO START';
    } else {
        statusElement.textContent = 'PAUSED';
    }

    document.getElementById('undoWinBtn').classList.remove('visible');
    console.log('Match result undone — match resumed from paused state');
}

// ===========================
// GOLDEN SCORE
// ===========================
function startGoldenScore() {
    state.goldenScoreActive = true;
    state.goldenScoreTime = 0;

    const timerElement = document.getElementById('matchTimer');
    const statusElement = document.getElementById('timerStatus');

    // Apply gold styling but do NOT start the interval — wait for scorekeeper to tap
    timerElement.classList.add('golden-score');
    timerElement.classList.remove('finished', 'running');
    statusElement.textContent = 'GOLDEN SCORE — TAP TO START';

    updateTimerDisplay();

    console.log('Golden Score ready — waiting for scorekeeper to start');
}

function stopGoldenScore() {
    if (!state.goldenScoreActive) return;

    state.goldenScoreActive = false;

    if (state.goldenScoreInterval) {
        clearInterval(state.goldenScoreInterval);
        state.goldenScoreInterval = null;
    }

    const timerElement = document.getElementById('matchTimer');
    timerElement.classList.remove('golden-score', 'running');

    console.log(`Golden Score stopped at ${state.goldenScoreTime} seconds`);
}

function calculateTotalScore(player) {
    const scores = state.scores[player];
    // Ippon = 10, Wazari = 7, Yuko = 5, Shido = -10
    return (scores.ippon * 10) + (scores.wazari * 7) + (scores.yuko * 5) - (scores.shido * 10);
}

// ===========================
// SCORE MANAGEMENT
// ===========================
function incrementScore(player, type, fromConversion = false) {
    const config = ageGroupConfigs[state.ageGroup];
    const currentScore = state.scores[player][type];
    
    // Check max limits
    if (type === 'yuko' && currentScore >= config.maxYuko) return;
    if (type === 'wazari' && currentScore >= config.maxWazari) return;
    if (type === 'ippon' && currentScore >= config.maxIppon) return;
    
    // Increment
    state.scores[player][type]++;
    updateScoreDisplay(player, type);

    // During golden score, first scoring point immediately wins (except shido)
    if (state.goldenScoreActive && type !== 'shido') {
        state.goldenScoreWinner = { player, type };
        endMatch(`GOLDEN SCORE - ${player.toUpperCase()} WINS`);
        return;
    }

    // Check for special conditions
    if (type === 'wazari') {
        checkWazariConversion(player);
    }
    
    // Wazari conversion awards ippon silently (no match end) — only direct ippons end the match
    if (type === 'ippon' && !fromConversion) {
        const newIpponCount = state.scores[player].ippon;
        
        if (config.ipponEndsMatch) {
            endMatch(`IPPON - ${player.toUpperCase()} WINS`);
        } else if (newIpponCount >= config.maxIppon) {
            endMatch(`IPPON LIMIT REACHED - ${player.toUpperCase()} WINS`);
        }
    }
    
    if (type === 'shido') {
        checkHansokuMake(player);
    }
}

function decrementScore(player, type) {
    if (state.scores[player][type] > 0) {
        state.scores[player][type]--;
        updateScoreDisplay(player, type);

        // If this removed the accidental golden score point, resume golden score
        const gs = state.goldenScoreWinner;
        if (gs && gs.player === player && gs.type === type) {
            state.goldenScoreWinner = null;
            resumeAfterUndoGoldenScore();
        }
    }
}

function resumeAfterUndoGoldenScore() {
    state.matchEnded = false;
    state.goldenScoreActive = true;

    const timerElement = document.getElementById('matchTimer');
    const statusElement = document.getElementById('timerStatus');

    timerElement.classList.remove('finished', 'running');
    timerElement.classList.add('golden-score');
    statusElement.classList.remove('winner');
    statusElement.textContent = 'GOLDEN SCORE — TAP TO START';

    updateTimerDisplay();
    console.log('Golden Score resumed after undo');
}

function updateScoreDisplay(player, type) {
    const elementId = `${player}${type.charAt(0).toUpperCase() + type.slice(1)}`;
    const element = document.getElementById(elementId);
    
    if (element) {
        element.textContent = state.scores[player][type];
        element.classList.add('changed');
        setTimeout(() => element.classList.remove('changed'), 300);
    }
}

function checkWazariConversion(player) {
    const config = ageGroupConfigs[state.ageGroup];
    
    if (!config.wazariToIppon) return;
    
    const wazariCount = state.scores[player].wazari;
    const ipponCount = state.scores[player].ippon;
    
    // Convert 2 wazari → 1 ippon if eligible
    if (wazariCount >= config.wazariConversionCount && ipponCount < config.maxIppon) {
        state.scores[player].wazari -= config.wazariConversionCount;
        state.scores[player].ippon++;
        
        updateScoreDisplay(player, 'wazari');
        updateScoreDisplay(player, 'ippon');
        
        const newIpponCount = state.scores[player].ippon;
        
        // Check if the converted ippon triggers a match win
        if (config.ipponEndsMatch || newIpponCount >= config.maxIppon) {
            console.log(`${player}: 2 Wazari converted to winning Ippon`);
            endMatch(`IPPON - ${player.toUpperCase()} WINS`);
            return; // endMatch already handles stopOsaekomi
        }
        
        console.log(`${player}: 2 Wazari converted to Ippon — match continues`);
        
        // If this happened during osaekomi, stop the hold — but the match timer keeps running
        if (state.osaekomiActive) {
            stopOsaekomi();
        }
    }
}

function checkHansokuMake(player) {
    const shidoCount = state.scores[player].shido;
    
    if (shidoCount >= state.hansokuMakeCount) {
        const opponent = player === 'blue' ? 'white' : 'blue';
        endMatch(`HANSOKU-MAKE - ${opponent.toUpperCase()} WINS`);
    }
}

// ===========================
// OSAEKOMI SYSTEM
// ===========================
function startOsaekomi(player) {
    if (state.osaekomiActive || state.matchEnded) return;
    
    state.osaekomiActive = true;
    state.osaekomiPlayer = player;
    state.osaekomiTime = 0;
    state.osaekomiAwardsGiven = {
        yuko: false,
        wazari: false,
        ippon: false
    };
    
    // Show osaekomi timer in player's box
    const displayId = `${player}OsaekomiDisplay`;
    const timeId = `${player}OsaekomiTime`;
    const fighterSection = document.querySelector(`.${player}-section`);
    document.getElementById(displayId).classList.add('active');
    document.getElementById(timeId).textContent = '0';
    
    // Add class to fighter section for CSS styling (to make scores smaller)
    if (fighterSection) {
        fighterSection.classList.add('osaekomi-active');
    }
    
    // Start osaekomi timer
    state.osaekomiInterval = setInterval(handleOsaekomiTick, 1000);
    
    console.log(`Osaekomi started for ${player}`);
}

function handleOsaekomiTick() {
    state.osaekomiTime++;
    
    // Update the timer display for the active player
    const timeId = `${state.osaekomiPlayer}OsaekomiTime`;
    document.getElementById(timeId).textContent = state.osaekomiTime;
    
    const config = ageGroupConfigs[state.ageGroup];
    const player = state.osaekomiPlayer;
    
    // Award Yuko at 5 seconds
    if (state.osaekomiTime >= state.osaekomiThresholds.yuko && 
        !state.osaekomiAwardsGiven.yuko && 
        config.hasYuko) {
        state.osaekomiAwardsGiven.yuko = true;
        incrementScore(player, 'yuko');
        console.log(`Osaekomi: Yuko awarded to ${player}`);
    }
    
    // Award Wazari at 10 seconds
    if (state.osaekomiTime >= state.osaekomiThresholds.wazari && 
        !state.osaekomiAwardsGiven.wazari) {
        state.osaekomiAwardsGiven.wazari = true;
        
        // Upgrade Yuko to Wazari: Remove Yuko if it was awarded
        if (state.osaekomiAwardsGiven.yuko) {
            decrementScore(player, 'yuko');
            console.log(`Osaekomi: Yuko removed (upgraded to Wazari)`);
        }
        
        incrementScore(player, 'wazari');
        console.log(`Osaekomi: Wazari awarded to ${player}`);
    }
    
    // Award Ippon at 20 seconds (if under max) and end match
    if (state.osaekomiTime >= state.osaekomiThresholds.ippon && 
        !state.osaekomiAwardsGiven.ippon) {
        state.osaekomiAwardsGiven.ippon = true;
        
        // Upgrade Wazari to Ippon: Remove Wazari if it was awarded
        if (state.osaekomiAwardsGiven.wazari) {
            decrementScore(player, 'wazari');
            console.log(`Osaekomi: Wazari removed (upgraded to Ippon)`);
        }
        
        // Play horn sound at 20 seconds
        playHornSound();
        
        // Stop osaekomi first so stopOsaekomi inside checkWazariConversion won't double-fire
        stopOsaekomi();
        
        // Award ippon directly — incrementScore handles match-end logic for U14 / max limit
        if (state.scores[player].ippon < config.maxIppon) {
            incrementScore(player, 'ippon');
            console.log(`Osaekomi: Ippon awarded to ${player}`);
        } else {
            console.log(`Osaekomi: Ippon NOT awarded (max limit reached)`);
        }
    }
    
    // Stop at max time
    if (state.osaekomiTime >= state.osaekomiMaxTime) {
        stopOsaekomi();
    }
}

function stopOsaekomi() {
    if (!state.osaekomiActive) return;
    
    const player = state.osaekomiPlayer;
    state.osaekomiActive = false;
    
    if (state.osaekomiInterval) {
        clearInterval(state.osaekomiInterval);
        state.osaekomiInterval = null;
    }
    
    // Hide osaekomi timer from player's box
    const displayId = `${player}OsaekomiDisplay`;
    const fighterSection = document.querySelector(`.${player}-section`);
    document.getElementById(displayId).classList.remove('active');
    
    // Remove class from fighter section
    if (fighterSection) {
        fighterSection.classList.remove('osaekomi-active');
    }
    
    console.log(`Osaekomi stopped at ${state.osaekomiTime} seconds`);
    
    // Reset osaekomi state
    state.osaekomiPlayer = null;
    state.osaekomiTime = 0;
}

// ===========================
// RESET MATCH
// ===========================
function resetMatch() {
    // Stop timers
    stopMatchTimer();
    stopOsaekomi();
    stopGoldenScore();
    state.goldenScoreTime = 0;
    state.goldenScoreWinner = null;
    
    // Reset state
    state.matchEnded = false;
    state.matchTimeRemaining = state.matchDuration;
    state.scores = {
        blue: { yuko: 0, wazari: 0, ippon: 0, shido: 0 },
        white: { yuko: 0, wazari: 0, ippon: 0, shido: 0 }
    };
    
    // Update UI
    updateTimerDisplay();
    
    const timerElement = document.getElementById('matchTimer');
    const statusElement = document.getElementById('timerStatus');
    
    timerElement.classList.remove('running', 'finished');
    statusElement.textContent = 'TAP TO START';
    statusElement.classList.remove('winner');
    document.getElementById('undoWinBtn').classList.remove('visible');
    state.matchEndedDuringGoldenScore = false;
    
    // Reset all score displays
    ['blue', 'white'].forEach(player => {
        ['yuko', 'wazari', 'ippon', 'shido'].forEach(type => {
            updateScoreDisplay(player, type);
        });
    });
    
    console.log('Match reset');
}

// ===========================
// SWAP SIDES
// ===========================
function swapSides() {
    // Get the score area container and sections
    const scoreArea = document.querySelector('.score-area');
    const blueSection = document.querySelector('.blue-section');
    const whiteSection = document.querySelector('.white-section');
    
    if (!scoreArea || !blueSection || !whiteSection) {
        console.log('Could not find sections to swap');
        return;
    }
    
    // Swap the scores in state
    const tempScores = { ...state.scores.blue };
    state.scores.blue = { ...state.scores.white };
    state.scores.white = tempScores;
    
    // Update all score displays
    ['yuko', 'wazari', 'ippon', 'shido'].forEach(type => {
        updateScoreDisplay('blue', type);
        updateScoreDisplay('white', type);
    });
    
    // Swap the visual positions by reordering DOM elements
    // Check current order by comparing positions
    const blueIndex = Array.from(scoreArea.children).indexOf(blueSection);
    const whiteIndex = Array.from(scoreArea.children).indexOf(whiteSection);
    
    // If blue is before white, swap them (put white first)
    // If white is before blue, swap them back (put blue first)
    if (blueIndex < whiteIndex) {
        // Blue is on left, move white to left
        scoreArea.insertBefore(whiteSection, blueSection);
    } else {
        // White is on left, move blue to left
        scoreArea.insertBefore(blueSection, whiteSection);
    }
    
    // If osaekomi is active, swap the player
    if (state.osaekomiActive) {
        state.osaekomiPlayer = state.osaekomiPlayer === 'blue' ? 'white' : 'blue';
        
        // Hide both osaekomi displays first
        document.getElementById('blueOsaekomiDisplay')?.classList.remove('active');
        document.getElementById('whiteOsaekomiDisplay')?.classList.remove('active');
        
        // Show osaekomi on the correct side (which now has the swapped player)
        const newDisplay = document.getElementById(`${state.osaekomiPlayer}OsaekomiDisplay`);
        if (newDisplay) newDisplay.classList.add('active');
    }
    
    console.log('Sides swapped - Blue and White positions exchanged');
}

// ===========================
// FULLSCREEN MODE
// ===========================
function toggleFullscreen() {
    const elem = document.documentElement;
    
    if (!document.fullscreenElement && !document.webkitFullscreenElement && !document.mozFullScreenElement) {
        // Enter fullscreen - handle different browser APIs
        if (elem.requestFullscreen) {
            elem.requestFullscreen().catch(err => {
                console.log('Error attempting to enable fullscreen:', err);
            });
        } else if (elem.webkitRequestFullscreen) { // Safari
            elem.webkitRequestFullscreen();
        } else if (elem.mozRequestFullScreen) { // Firefox
            elem.mozRequestFullScreen();
        } else if (elem.msRequestFullscreen) { // IE/Edge
            elem.msRequestFullscreen();
        }
    } else {
        // Exit fullscreen - handle different browser APIs
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) { // Safari
            document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) { // Firefox
            document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) { // IE/Edge
            document.msExitFullscreen();
        }
    }
}

// Listen for fullscreen changes (e.g., user presses ESC) - handle all browsers
function updateFullscreenButton() {
    const btn = document.getElementById('fullscreenBtn');
    if (document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement) {
        btn.textContent = '⛶ EXIT FULLSCREEN';
    } else {
        btn.textContent = '⛶ FULLSCREEN';
    }
}

document.addEventListener('fullscreenchange', updateFullscreenButton);
document.addEventListener('webkitfullscreenchange', updateFullscreenButton);
document.addEventListener('mozfullscreenchange', updateFullscreenButton);
document.addEventListener('MSFullscreenChange', updateFullscreenButton);

// ===========================
// SOUND EFFECTS
// ===========================
function playHornSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        // Random duration between 0.8 and 1.2 seconds
        const duration = 0.8 + Math.random() * 0.4; // 0.8 to 1.2 seconds
        const now = audioContext.currentTime;
        
        // Create buzzer oscillator - harsh, sustained tone
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        // Connect
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // Buzzer characteristics: square wave for harsh "BUZZ" sound
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(400, now); // Constant frequency for steady buzz
        
        // Volume envelope: quick attack, sustained, quick release
        const attackTime = 0.02; // Very quick attack
        const sustainLevel = 0.5;
        const releaseTime = 0.05; // Quick release
        
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(sustainLevel, now + attackTime);
        gainNode.gain.setValueAtTime(sustainLevel, now + duration - releaseTime);
        gainNode.gain.linearRampToValueAtTime(0, now + duration);
        
        // Start and stop
        oscillator.start(now);
        oscillator.stop(now + duration);
        
        console.log(`Buzzer sound played for ${duration.toFixed(2)} seconds`);
    } catch (error) {
        console.log('Could not play buzzer sound:', error);
        // Fallback: simpler buzzer
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            const duration = 0.8 + Math.random() * 0.4;
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.type = 'square';
            oscillator.frequency.value = 400;
            
            gainNode.gain.setValueAtTime(0, audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.5, audioContext.currentTime + 0.02);
            gainNode.gain.setValueAtTime(0.5, audioContext.currentTime + duration - 0.05);
            gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + duration);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + duration);
        } catch (e) {
            console.log('Audio not available');
        }
    }
}

// ===========================
// UTILITY FUNCTIONS
// ===========================
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ===========================
// SETTINGS PANEL
// ===========================

function openSettings() {
    buildSettingsModal();
    document.getElementById('settingsOverlay').classList.add('active');
}

function closeSettings() {
    document.getElementById('settingsOverlay').classList.remove('active');
}

function buildSettingsModal() {
    const body = document.getElementById('settingsBody');
    body.innerHTML = '';

    const groups = ['u8', 'u10', 'u12', 'u14'];
    groups.forEach((group, idx) => {
        const panel = buildAgeGroupPanel(group);
        panel.classList.toggle('active', idx === 0);
        body.appendChild(panel);
    });

    const globalPanel = buildGlobalPanel();
    body.appendChild(globalPanel);

    // Sync active tab highlight to first tab
    document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
    document.querySelector('.settings-tab[data-tab="u8"]').classList.add('active');
}

function buildAgeGroupPanel(group) {
    const cfg = ageGroupConfigs[group];
    const mins = Math.floor(cfg.duration / 60);
    const secs = cfg.duration % 60;

    const panel = document.createElement('div');
    panel.className = 'settings-panel';
    panel.id = `settings-panel-${group}`;

    panel.innerHTML = `
        <div class="settings-section">
            <h3>Match Rules</h3>
            <div class="settings-row">
                <label>Match Duration</label>
                <div class="row-right">
                    <input type="number" class="settings-number-sm" id="${group}-dur-min" value="${mins}" min="0" max="60">
                    <span>min</span>
                    <input type="number" class="settings-number-sm" id="${group}-dur-sec" value="${secs}" min="0" max="59">
                    <span>sec</span>
                </div>
            </div>
            <div class="settings-row">
                <label>Show Yuko Score</label>
                <div class="row-right">
                    <input type="checkbox" class="settings-toggle" id="${group}-hasYuko" ${cfg.hasYuko ? 'checked' : ''}>
                </div>
            </div>
            <div class="settings-row">
                <label>Show Shido (Penalties)</label>
                <div class="row-right">
                    <input type="checkbox" class="settings-toggle" id="${group}-hasShido" ${cfg.hasShido ? 'checked' : ''}>
                </div>
            </div>
            <div class="settings-row">
                <label>2 Wazari → 1 Ippon</label>
                <div class="row-right">
                    <input type="checkbox" class="settings-toggle" id="${group}-wazariToIppon" ${cfg.wazariToIppon ? 'checked' : ''}>
                </div>
            </div>
            <div class="settings-row">
                <label>Ippon Ends Match Immediately</label>
                <div class="row-right">
                    <input type="checkbox" class="settings-toggle" id="${group}-ipponEndsMatch" ${cfg.ipponEndsMatch ? 'checked' : ''}>
                </div>
            </div>
            <div class="settings-row">
                <label>Enable Golden Score</label>
                <div class="row-right">
                    <input type="checkbox" class="settings-toggle" id="${group}-goldenScore" ${cfg.goldenScore ? 'checked' : ''}>
                </div>
            </div>
        </div>
        <div class="settings-section">
            <h3>Score Limits</h3>
            <p class="settings-hint">Leave blank for unlimited</p>
            <div class="settings-row">
                <label>Max Yuko</label>
                <div class="row-right">
                    <input type="number" class="settings-number" id="${group}-maxYuko"
                        value="${cfg.maxYuko >= 999 ? '' : cfg.maxYuko}" placeholder="∞" min="0">
                </div>
            </div>
            <div class="settings-row">
                <label>Max Wazari</label>
                <div class="row-right">
                    <input type="number" class="settings-number" id="${group}-maxWazari"
                        value="${cfg.maxWazari >= 999 ? '' : cfg.maxWazari}" placeholder="∞" min="0">
                </div>
            </div>
            <div class="settings-row">
                <label>Max Ippon</label>
                <div class="row-right">
                    <input type="number" class="settings-number" id="${group}-maxIppon"
                        value="${cfg.maxIppon >= 999 ? '' : cfg.maxIppon}" placeholder="∞" min="0">
                </div>
            </div>
        </div>
    `;
    return panel;
}

function buildGlobalPanel() {
    const panel = document.createElement('div');
    panel.className = 'settings-panel';
    panel.id = 'settings-panel-global';

    panel.innerHTML = `
        <div class="settings-section">
            <h3>Osaekomi Thresholds</h3>
            <p class="settings-hint">Seconds of hold needed to award each score</p>
            <div class="settings-row">
                <label>Yuko awarded at</label>
                <div class="row-right">
                    <input type="number" class="settings-number" id="global-osaYuko"
                        value="${state.osaekomiThresholds.yuko}" min="1" max="60">
                    <span>sec</span>
                </div>
            </div>
            <div class="settings-row">
                <label>Wazari awarded at</label>
                <div class="row-right">
                    <input type="number" class="settings-number" id="global-osaWazari"
                        value="${state.osaekomiThresholds.wazari}" min="1" max="60">
                    <span>sec</span>
                </div>
            </div>
            <div class="settings-row">
                <label>Ippon awarded at</label>
                <div class="row-right">
                    <input type="number" class="settings-number" id="global-osaIppon"
                        value="${state.osaekomiThresholds.ippon}" min="1" max="60">
                    <span>sec</span>
                </div>
            </div>
            <div class="settings-row">
                <label>Max hold time</label>
                <div class="row-right">
                    <input type="number" class="settings-number" id="global-osaMax"
                        value="${state.osaekomiMaxTime}" min="1" max="120">
                    <span>sec</span>
                </div>
            </div>
        </div>
        <div class="settings-section">
            <h3>Penalties</h3>
            <p class="settings-hint">Hansoku-Make disqualifies the penalized athlete</p>
            <div class="settings-row">
                <label>Shido count for Hansoku-Make</label>
                <div class="row-right">
                    <input type="number" class="settings-number" id="global-hansoku"
                        value="${state.hansokuMakeCount}" min="1" max="10">
                </div>
            </div>
        </div>
    `;
    return panel;
}

function saveSettings() {
    // Save all age group panels
    ['u8', 'u10', 'u12', 'u14'].forEach(group => {
        const cfg = ageGroupConfigs[group];

        const durMin = parseInt(document.getElementById(`${group}-dur-min`)?.value) || 0;
        const durSec = parseInt(document.getElementById(`${group}-dur-sec`)?.value) || 0;
        cfg.duration = (durMin * 60) + Math.min(durSec, 59);

        cfg.hasYuko = document.getElementById(`${group}-hasYuko`)?.checked ?? cfg.hasYuko;
        cfg.hasShido = document.getElementById(`${group}-hasShido`)?.checked ?? cfg.hasShido;
        cfg.wazariToIppon = document.getElementById(`${group}-wazariToIppon`)?.checked ?? cfg.wazariToIppon;
        cfg.ipponEndsMatch = document.getElementById(`${group}-ipponEndsMatch`)?.checked ?? cfg.ipponEndsMatch;
        cfg.goldenScore = document.getElementById(`${group}-goldenScore`)?.checked ?? cfg.goldenScore;

        const maxYukoVal = document.getElementById(`${group}-maxYuko`)?.value;
        cfg.maxYuko = (maxYukoVal === '' || maxYukoVal === null) ? 999 : Math.max(0, parseInt(maxYukoVal) || 999);

        const maxWazariVal = document.getElementById(`${group}-maxWazari`)?.value;
        cfg.maxWazari = (maxWazariVal === '' || maxWazariVal === null) ? 999 : Math.max(0, parseInt(maxWazariVal) || 999);

        const maxIpponVal = document.getElementById(`${group}-maxIppon`)?.value;
        cfg.maxIppon = (maxIpponVal === '' || maxIpponVal === null) ? 999 : Math.max(0, parseInt(maxIpponVal) || 999);
    });

    // Save global panel
    const osaYuko = parseInt(document.getElementById('global-osaYuko')?.value);
    if (!isNaN(osaYuko)) state.osaekomiThresholds.yuko = osaYuko;

    const osaWazari = parseInt(document.getElementById('global-osaWazari')?.value);
    if (!isNaN(osaWazari)) state.osaekomiThresholds.wazari = osaWazari;

    const osaIppon = parseInt(document.getElementById('global-osaIppon')?.value);
    if (!isNaN(osaIppon)) state.osaekomiThresholds.ippon = osaIppon;

    const osaMax = parseInt(document.getElementById('global-osaMax')?.value);
    if (!isNaN(osaMax)) state.osaekomiMaxTime = osaMax;

    const hansoku = parseInt(document.getElementById('global-hansoku')?.value);
    if (!isNaN(hansoku)) state.hansokuMakeCount = hansoku;

    // Re-apply current preset to refresh UI (timer, visible scores, etc.)
    applyPreset(state.ageGroup);

    closeSettings();
    console.log('Settings saved and applied');
}

function resetActiveTabToDefaults() {
    const activeTab = document.querySelector('.settings-tab.active')?.dataset.tab;
    if (!activeTab) return;

    if (activeTab === 'global') {
        // Reset osaekomi thresholds fields
        document.getElementById('global-osaYuko').value = defaultOsaekomiThresholds.yuko;
        document.getElementById('global-osaWazari').value = defaultOsaekomiThresholds.wazari;
        document.getElementById('global-osaIppon').value = defaultOsaekomiThresholds.ippon;
        document.getElementById('global-osaMax').value = defaultOsaekomiMaxTime;
        document.getElementById('global-hansoku').value = defaultHansokuMakeCount;
    } else {
        const def = defaultAgeGroupConfigs[activeTab];
        const mins = Math.floor(def.duration / 60);
        const secs = def.duration % 60;

        document.getElementById(`${activeTab}-dur-min`).value = mins;
        document.getElementById(`${activeTab}-dur-sec`).value = secs;
        document.getElementById(`${activeTab}-hasYuko`).checked = def.hasYuko;
        document.getElementById(`${activeTab}-hasShido`).checked = def.hasShido;
        document.getElementById(`${activeTab}-wazariToIppon`).checked = def.wazariToIppon;
        document.getElementById(`${activeTab}-ipponEndsMatch`).checked = def.ipponEndsMatch;
        document.getElementById(`${activeTab}-goldenScore`).checked = def.goldenScore;
        document.getElementById(`${activeTab}-maxYuko`).value = def.maxYuko >= 999 ? '' : def.maxYuko;
        document.getElementById(`${activeTab}-maxWazari`).value = def.maxWazari >= 999 ? '' : def.maxWazari;
        document.getElementById(`${activeTab}-maxIppon`).value = def.maxIppon >= 999 ? '' : def.maxIppon;
    }
}

// ===========================
// EXPOSE FUNCTIONS FOR DEBUGGING
// ===========================
window.judoScoreboard = {
    state,
    applyPreset,
    incrementScore,
    decrementScore,
    startOsaekomi,
    stopOsaekomi,
    startGoldenScore,
    stopGoldenScore,
    resetMatch,
    endMatch
};

console.log('Judo Scoreboard initialized');
console.log('Access debug functions via window.judoScoreboard');
