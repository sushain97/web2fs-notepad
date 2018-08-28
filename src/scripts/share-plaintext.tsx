import '../styles/share.scss';

import { Classes } from '@blueprintjs/core';
import classNames from 'classnames';

const { content, mode } = (window as any).CONTEXT;

const app = document.getElementById('app')!;
app.innerText = content;
app.setAttribute('style', 'white-space: pre-wrap');
document.body.setAttribute('class', classNames({ [Classes.DARK]: mode === 'dark' }));
