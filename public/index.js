(() => {
    const handleInputChange = (ev) => {
        console.log(ev, ev.currentTarget.value);
    };

    const handleInputKeydown = (ev) => {
        const {target, keyCode} = ev;
        if (keyCode === 9) {
            ev.preventDefault();
            const {selectionStart, selectionEnd, value} = target;
            target.value = `${value.substring(0, selectionStart)}\t${value.substring(selectionEnd)}`;
            target.selectionEnd = selectionStart + 1;
        }
    };

    const init = () => {
        const input = document.getElementById('content-input');
        input.addEventListener('input', handleInputChange)
        input.addEventListener('keydown', handleInputKeydown);
    };

    if(document.readyState === 'complete') {
        init();
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }
})();
