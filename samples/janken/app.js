document.addEventListener('DOMContentLoaded', () => {
    const choices = document.querySelectorAll('.choice');
    const resultDisplay = document.getElementById('result');
    const winCount = document.getElementById('winCount');
    const loseCount = document.getElementById('loseCount');
    const drawCount = document.getElementById('drawCount');
    const resetBtn = document.getElementById('resetBtn');

    // Load statistics from localStorage
    const stats = JSON.parse(localStorage.getItem('janken_game_stats')) || { win: 0, lose: 0, draw: 0 };
    winCount.textContent = stats.win;
    loseCount.textContent = stats.lose;
    drawCount.textContent = stats.draw;

    choices.forEach(choice => {
        choice.addEventListener('click', () => {
            const playerChoice = choice.getAttribute('data-choice');
            const cpuChoice = getCPUChoice();
            const result = determineResult(playerChoice, cpuChoice);

            updateDisplay(cpuChoice, result);
            updateStats(result);
        });
    });

    resetBtn.addEventListener('click', () => {
        winCount.textContent = 0;
        loseCount.textContent = 0;
        drawCount.textContent = 0;
        resultDisplay.textContent = '';
        localStorage.removeItem('janken_game_stats');
    });

    function getCPUChoice() {
        const choices = ['gu', 'choki', 'pa'];
        return choices[Math.floor(Math.random() * choices.length)];
    }

    function determineResult(player, cpu) {
        if (player === cpu) {
            return 'draw';
        } else if (
            (player === 'gu' && cpu === 'choki') ||
            (player === 'choki' && cpu === 'pa') ||
            (player === 'pa' && cpu === 'gu')
        ) {
            return 'win';
        } else {
            return 'lose';
        }
    }

    function updateDisplay(cpuChoice, result) {
        resultDisplay.textContent = `CPU: ${cpuChoice} - ${result}`;
    }

    function updateStats(result) {
        stats[result]++;
        winCount.textContent = stats.win;
        loseCount.textContent = stats.lose;
        drawCount.textContent = stats.draw;
        localStorage.setItem('janken_game_stats', JSON.stringify(stats));
    }
});
