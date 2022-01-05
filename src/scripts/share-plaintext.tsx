import '../styles/share.scss';

import { Classes } from '@blueprintjs/core';
import classNames from 'classnames';

import { Mode } from './types';

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const { content, mode } = (window as typeof window & { CONTEXT: { content: string; mode: string } })
  .CONTEXT;

const app = document.getElementById('app')!;
app.innerText = content;
app.setAttribute('style', 'white-space: pre-wrap');
document.body.setAttribute(
  'class',
  classNames({ [Classes.DARK]: mode === Mode.Dark.toLowerCase() }),
);
