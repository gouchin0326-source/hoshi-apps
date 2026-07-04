document.addEventListener('DOMContentLoaded', () => {
  const inVal = document.getElementById('inVal');
  const dir = document.getElementById('dir');
  const convBtn = document.getElementById('convBtn');
  const result = document.getElementById('result');
  const error = document.getElementById('error');

  function convert() {
    const value = inVal.value.trim();
    if (value === '' || isNaN(value)) {
      error.textContent = '入力が空または非数値です。';
      result.textContent = '';
      return;
    }

    const numValue = parseFloat(value);
    let convertedValue;

    switch (dir.value) {
      case 'ab':
        convertedValue = (numValue / 2.54).toFixed(3); // Use toFixed for precision
        break;
      case 'ba':
        convertedValue = (numValue * 2.54).toFixed(3); // Use toFixed for precision
        break;
      default:
        error.textContent = '無効な変換方向です。';
        result.textContent = '';
        return;
    }

    error.textContent = '';
    result.textContent = convertedValue;
  }

  inVal.addEventListener('input', convert);
  convBtn.addEventListener('click', convert);
});
