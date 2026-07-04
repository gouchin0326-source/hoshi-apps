// Initialize target number and attempts counter on page load
document.addEventListener('DOMContentLoaded', () => {
    window.__target = Math.floor(Math.random() * 100) + 1;
    document.getElementById('attempts').textContent = '0';
});

// Add event listener for the "判定" button
document.getElementById('guessBtn').addEventListener('click', () => {
    const guessInput = document.getElementById('guessInput');
    const guess = parseInt(guessInput.value, 10);
    const hintElement = document.getElementById('hint');
    const attemptsElement = document.getElementById('attempts');

    if (isNaN(guess) || guess < 1 || guess > 100) {
        hintElement.textContent = '1から100までの数を入力してください';
        return;
    }

    let attempts = parseInt(attemptsElement.textContent, 10);
    attempts++;
    attemptsElement.textContent = attempts.toString();

    if (guess < window.__target) {
        hintElement.textContent = 'もっと大きい';
    } else if (guess > window.__target) {
        hintElement.textContent = 'もっと小さい';
    } else {
        hintElement.textContent = '正解';
    }
});

// Add event listener for the "新しいゲーム" button
document.getElementById('newBtn').addEventListener('click', () => {
    window.__target = Math.floor(Math.random() * 100) + 1;
    document.getElementById('attempts').textContent = '0';
    document.getElementById('hint').textContent = '';
});
