import '../styles/share.scss';

import { Classes } from '@blueprintjs/core';

const { content, mode } = (window as any).CONTEXT;

document.getElementById('app')!.innerText = content;
document.body.setAttribute('class', mode === 'dark' ? Classes.DARK : '');
