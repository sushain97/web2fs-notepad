import * as HighlightJs from 'highlight.js';
import { pick } from 'lodash-es';
import * as MarkdownIt from 'markdown-it';

import setupMarkdown from './setup-markdown';
import {
  AppWorker,
  WorkerMessageType,
  WorkerRequestMessage,
  WorkerResultForRequest,
  WorkerResultMessage,
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

const respond = <T extends WorkerRequestMessage>(request: T, result: WorkerResultForRequest<T>) => {
  // TODO: get this to type more cleanly
  const message = {
    request,
    request_type: request.type,
    result,
    type: WorkerMessageType.RESULT,
  };
  ctx.postMessage(message as WorkerResultMessage);
};

ctx.addEventListener('message', async ({ data: request }) => {
  if ('request_type' in request) {
    throw new Error(`Recieved message with request_type: ${JSON.stringify(request)}`);
  }

  try {
    switch (request.type) {
      case WorkerMessageType.INITIALIZE: {
        (self as any).mungeImportScriptsUrl = (url: string) => {
          return `${request.path}/assets/${url}`;
        };
        break;
      }
      case WorkerMessageType.RENDER_CODE: {
        const { language, content } = request;
        const highlightJs = await getCodeRenderer();
        const result = language
          ? highlightJs.highlight(language, content, true)
          : (highlightJs.highlightAuto(content) as HighlightJs.IHighlightResult);
        return respond(request, result);
      }
      case WorkerMessageType.RENDER_MARKDOWN: {
        const markdownIt = await getMarkdownRenderer();
        const result = markdownIt.render(request.content);
        return respond(request, result);
      }
      case WorkerMessageType.LIST_CODE_LANGUAGES: {
        const highlightJs = await getCodeRenderer();
        const result = highlightJs.listLanguages().map(name => ({
          name,
          ...pick(highlightJs.getLanguage(name), 'aliases'),
        }));
        return respond(request, result);
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

export default null as any;
