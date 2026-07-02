document.getElementById('text-input').addEventListener('input', updateStats);
document.getElementById('max-char-limit').addEventListener('input', updateStats);

function updateStats() {
    const text = document.getElementById('text-input').value;
    const maxCharLimit = parseInt(document.getElementById('max-char-limit').value, 10) || Infinity;

    const charCount = text.length;
    const wordCount = text.split(/\s+/).filter(word => word.length > 0).length;
    const lineCount = text.split('\n').filter(line => line.length > 0).length;

    document.getElementById('char-count').textContent = charCount;
    document.getElementById('word-count').textContent = wordCount;
    document.getElementById('line-count').textContent = lineCount;

    if (charCount > maxCharLimit) {
        document.getElementById('text-input').style.borderColor = 'red';
    } else {
        document.getElementById('text-input').style.borderColor = '';
    }
}
