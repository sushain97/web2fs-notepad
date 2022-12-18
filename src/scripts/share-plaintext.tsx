import '../styles/share.scss';

import { Classes } from '@blueprintjs/core';
import classNames from 'classnames';

import { Mode } from './types';

declare const window: typeof global.window & {
  CONTEXT: { content: string; mode: string };
};
const { content, mode } = window.CONTEXT;

const app = document.getElementById('app')!;
app.innerText = content;
app.setAttribute('style', 'white-space: pre-wrap');
document.body.setAttribute(
  'class',
  classNames({ [Classes.DARK]: mode === Mode.Dark.toLowerCase() }),
);
