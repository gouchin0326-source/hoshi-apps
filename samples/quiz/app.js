// Quiz data
const questions = [
    {
        "q": "日本の首都はどこですか？",
        "choices": ["東京", "大阪", "京都", "名古屋"],
        "answer": 0
    },
    {
        "q": "CPUの全称は？",
        "choices": ["Central Processing Unit", "Control Processing Unit", "Computer Processing Unit", "Central Power Unit"],
        "answer": 0
    },
    {
        "q": "光の速度は約何km/sですか？",
        "choices": ["30万", "15万", "50万", "10万"],
        "answer": 0
    },
    {
        "q": "Pythonはどのプログラミング言語ですか？",
        "choices": ["動的型付け", "静的型付け", "関数型", "論理型"],
        "answer": 0
    },
    {
        "q": "太陽系で最も大きい惑星は？",
        "choices": ["木星", "土星", "火星", "金星"],
        "answer": 0
    }
];

let currentQuestionIndex = 0;
let score = 0;

// Function to display the question and choices
function displayQuestion() {
    const questionElement = document.getElementById('question');
    const choicesElements = [document.getElementById('choice0'), document.getElementById('choice1'), document.getElementById('choice2'), document.getElementById('choice3')];

    questionElement.textContent = questions[currentQuestionIndex].q;
    for (let i = 0; i < 4; i++) {
        choicesElements[i].textContent = questions[currentQuestionIndex].choices[i];
        choicesElements[i].addEventListener('click', handleChoiceClick);
    }
}

// Function to handle choice click
function handleChoiceClick(event) {
    const selectedChoiceIndex = parseInt(event.target.id.replace('choice', ''));
    if (selectedChoiceIndex === questions[currentQuestionIndex].answer) {
        score++;
        document.getElementById('score').textContent = score;
    }

    currentQuestionIndex++;
    if (currentQuestionIndex < questions.length) {
        displayQuestion();
    } else {
        const resultElement = document.getElementById('result');
        resultElement.textContent = `正解 ${score} / 5`;
        resultElement.classList.remove('muted');
    }
}

// Initialize the quiz
document.addEventListener('DOMContentLoaded', () => {
    displayQuestion();
});
