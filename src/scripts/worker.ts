import { pick } from 'lodash-es';

import setupMarkdown from './setup-markdown';
import {
  AppWorker,
  WorkerMessage,
  WorkerMessageType,
  WorkerRequestMessage,
  WorkerResultForRequest,
} from './types';

declare let self: AppWorker;

const getCodeRenderer = async () => {
  if (!self.HighlightJs) {
    self.HighlightJs = (
      await import(/* webpackChunkName: "highlight-js" */ 'highlight.js')
    ).default;
  }

  return self.HighlightJs;
};

const getMarkdownRenderer = async () => {
  if (!self.MarkdownIt) {
    const md = (await import(/* webpackChunkName: "markdown-it" */ 'markdown-it')).default;
    self.MarkdownIt = setupMarkdown(md);
  }

  return self.MarkdownIt;
};

const respond = <T extends WorkerRequestMessage>(request: T, result: WorkerResultForRequest<T>) => {
  const message = {
    request,
    request_type: request.type,
    result,
    type: WorkerMessageType.RESULT,
  };
  // Avoiding this cast and ensuring type narrowing in handleWorkerMessage seem mutually exclusive.
  self.postMessage(message as WorkerMessage);
};

// eslint-disable-next-line @typescript-eslint/no-misused-promises
self.addEventListener('message', async ({ data: request }) => {
  if ('request_type' in request) {
    throw new Error(`Recieved message with request_type: ${JSON.stringify(request)}`);
  }

  try {
    switch (request.type) {
      case WorkerMessageType.INITIALIZE: {
        self.mungeImportScriptsUrl = (url: string) => {
          return `${request.path}/${url}`;
        };
        break;
      }
      case WorkerMessageType.RENDER_CODE: {
        const { language, content } = request;
        const highlightJs = await getCodeRenderer();

        // Exclude properties of the highlight result which cannot be cloned
        // and thus cause a DataCloneError if included.
        const result = pick(
          language
            ? highlightJs.highlight(content, { language, ignoreIllegals: true })
            : highlightJs.highlightAuto(content),
          ['language', 'value'],
        );

        return void respond(request, result);
      }
      case WorkerMessageType.RENDER_MARKDOWN: {
        const markdownIt = await getMarkdownRenderer();
        const result = markdownIt.render(request.content);
        return void respond(request, result);
      }
      case WorkerMessageType.LIST_CODE_LANGUAGES: {
        const highlightJs = await getCodeRenderer();
        const result = highlightJs.listLanguages().map((name) => ({
          name,
          ...pick(highlightJs.getLanguage(name), 'aliases'),
        }));
        return void respond(request, result);
      }
      default: {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _: never = request;
      }
    }
  } catch (error) {
    self.postMessage({
      error: (error as Error).toString(),
      request,
      request_type: request.type,
      type: WorkerMessageType.ERROR,
    });
  }
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default null as any;
