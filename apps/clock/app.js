const clockElement = document.getElementById('clock');
const toggleFormatButton = document.getElementById('toggle-format');

let is24HourFormat = true;

function updateClock() {
    const now = new Date();
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const weekday = now.toLocaleString('default', { weekday: 'long' });

    if (!is24HourFormat) {
        hours = hours % 12 || 12;
        hours = hours < 10 ? `0${hours}` : hours;
    }

    clockElement.textContent = `${hours}:${minutes}:${seconds} - ${year}-${month}-${day} (${weekday})`;
}

toggleFormatButton.addEventListener('click', () => {
    is24HourFormat = !is24HourFormat;
    toggleFormatButton.textContent = is24HourFormat ? '12-hour format' : '24-hour format';
});

setInterval(updateClock, 1000);
updateClock();
