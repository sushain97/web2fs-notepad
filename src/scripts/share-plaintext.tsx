import '../styles/share.scss';

const { content } = (window as any).CONTEXT;
document.getElementById('app')!.innerText = content;
