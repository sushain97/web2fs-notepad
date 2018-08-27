import '../styles/share.scss';

import { Classes } from '@blueprintjs/core';
import classNames from 'classnames';

const { content, mode } = (window as any).CONTEXT;

document.getElementById('app')!.innerText = content;
document.body.setAttribute('class', classNames({ [Classes.DARK]: mode === 'dark' }));
