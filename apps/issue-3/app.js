document.addEventListener('DOMContentLoaded', () => {
    const in1 = document.getElementById('in1');
    const in2 = document.getElementById('in2');
    const calcBtn = document.getElementById('calcBtn');
    const result = document.getElementById('result');
    const error = document.getElementById('error');

    function calculate() {
        const value1 = parseFloat(in1.value);
        const value2 = parseFloat(in2.value);

        if (isNaN(value1) || isNaN(value2) || value1 <= 0 || value2 <= 0) {
            result.textContent = '';
            error.textContent = '入力が不正です。';
            return;
        }

        const total = Math.round(value1 * value2 * 1.1);
        result.textContent = total;
        error.textContent = '';
    }

    in1.addEventListener('input', calculate);
    in2.addEventListener('input', calculate);
    calcBtn.addEventListener('click', calculate);
});
