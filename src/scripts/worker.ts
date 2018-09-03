import * as HighlightJs from 'highlight.js';
import { pick } from 'lodash-es';
import * as MarkdownIt from 'markdown-it';

import setupMarkdown from './setup-markdown';
import {
  AppWorker,
  BaseWorkerResultMessage,
  WorkerMessageType,
  WorkerRequestMessage,
  WorkerResultMessage,
  WorkerErrorMessage,
  WorkerResultForRequest,
  ILanguage,
  WorkerMessage,
} from './types';

const ctx: AppWorker = self as any;

const getCodeRenderer = async () => {
  if (!ctx.HighlightJs) {
    const hljs = await import(/* webpackChunkName: "highlight-js" */ 'highlight.js');
    ctx.HighlightJs = ((hljs as any).default as typeof HighlightJs | undefined) || hljs;
  }

  return ctx.HighlightJs!;
};

const getMarkdownRenderer = async () => {
  if (!ctx.MarkdownIt) {
    const md = await import(/* webpackChunkName: "markdown-it" */ 'markdown-it');
    ctx.MarkdownIt = setupMarkdown(((md as any).default as typeof MarkdownIt | undefined) || md);
  }

  return ctx.MarkdownIt!;
};

// const respond = <T extends WorkerRequestMessage, S extends WorkerResultMessage['result'], R = BaseWorkerResultMessage<T, S>>(request: T, result: S) => {
//   if ('request_type' in request || 'error' in request) {
//     throw new Error(`Recieved message with request_type: ${JSON.stringify(request)}`);
//   }

//   const msg: R = {
//     request,
//     request_type: request.type,
//     result,
//     type: WorkerMessageType.RESULT,
//   };
//   ctx.postMessage(msg);
// };

// const efef = <T>(a: T, x: keyof T, y: keyof T[typeof x]) => a[x][y];

// const respond = <T extends WorkerResultMessage, S extends (string | ILanguage[] | ReturnType<typeof HighlightJs.highlight>) = T['result']>(request: T['request'], result: S) => {
//   if ('request_type' in request || 'error' in request) {
//     throw new Error(`Recieved message with request_type: ${JSON.stringify(request)}`);
//   }

//   const msg: WorkerMessage = {
//     request,
//     request_type: request.type,
//     result,
//     type: WorkerMessageType.RESULT,
//   };

//   ctx.postMessage(msg);
// };

const respond = (request: WorkerRequestMessage) => <T extends WorkerResultForRequest<typeof request>>(result: T['result']) => {
  const msg: WorkerResultMessage = {request, request_type: request.type, result, type: WorkerMessageType.RESULT};
  ctx.postMessage(msg);
}

ctx.addEventListener('message', async ({ data: request }) => {
  if ('request_type' in request) {
    throw new Error(`Recieved message with request_type: ${JSON.stringify(request)}`);
  }

  try {
    switch (request.type) {
      case WorkerMessageType.RENDER_CODE: {
        const { language, content } = request;
        const highlightJs = await getCodeRenderer();
        const result = language
          ? highlightJs.highlight(language, content, true)
          : (highlightJs.highlightAuto(content) as HighlightJs.IHighlightResult);
        ctx.postMessage({
          request,
          request_type: request.type,
          result,
          type: WorkerMessageType.RESULT,
        });
        break;
      }
      case WorkerMessageType.RENDER_MARKDOWN: {
        const markdownIt = await getMarkdownRenderer();
        const result = markdownIt.render(request.content);
        ctx.postMessage({
          request,
          request_type: request.type,
          result,
          type: WorkerMessageType.RESULT,
        });
        break;
      }
      case WorkerMessageType.LIST_CODE_LANGUAGES: {
        const highlightJs = await getCodeRenderer();
        const result = highlightJs.listLanguages().map(name => ({
          name,
          ...pick(highlightJs.getLanguage(name), 'aliases'),
        }));
        ctx.postMessage({
          request,
          request_type: request.type,
          result,
          type: WorkerMessageType.RESULT,
        });
        break;
      }
      default:
        const _: never = request;
    }
  } catch (error) {
    ctx.postMessage({
      error: error.toString(),
      request,
      request_type: request.type,
      type: WorkerMessageType.ERROR,
    });
  }
});
