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

declare global {
  let __webpack_public_path__: string;
}

const getCodeRenderer = async () => {
  if (!self.HighlightJs) {
    self.HighlightJs = (await import('highlight.js')).default;
  }

  return self.HighlightJs;
};

const getMarkdownRenderer = async () => {
  if (!self.MarkdownIt) {
    const md = (await import('markdown-it')).default;
    self.MarkdownIt = setupMarkdown(md);
  }

  return self.MarkdownIt;
};

const respond = <T extends WorkerRequestMessage>(request: T, result: WorkerResultForRequest<T>) => {
  const message = {
    request,
    requestType: request.type,
    result,
    type: WorkerMessageType.RESULT,
  };
  // Avoiding this cast and ensuring type narrowing in handleWorkerMessage seem mutually exclusive.
  // I think this will help: https://github.com/microsoft/TypeScript/issues/32399.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  self.postMessage(message as WorkerMessage);
};

// eslint-disable-next-line @typescript-eslint/no-misused-promises
self.addEventListener('message', async ({ data: request }) => {
  if ('requestType' in request) {
    throw new Error(`Recieved message with requestType: ${JSON.stringify(request)}`);
  }

  try {
    switch (request.type) {
      case WorkerMessageType.INITIALIZE: {
        __webpack_public_path__ = `${request.path}/${__webpack_public_path__}`;
        break;
      }
      case WorkerMessageType.RENDER_CODE: {
        const { language, content } = request;
        const highlightJs = await getCodeRenderer();

        // Exclude properties of the highlight result which cannot be cloned
        // and thus cause a DataCloneError if included.
        const result = pick(
          language
            ? highlightJs.highlight(content, { ignoreIllegals: true, language })
            : highlightJs.highlightAuto(content),
          ['language', 'value'],
        );

        return respond(request, result);
      }
      case WorkerMessageType.RENDER_MARKDOWN: {
        const markdownIt = await getMarkdownRenderer();
        const result = markdownIt.render(request.content);
        return respond(request, result);
      }
      case WorkerMessageType.LIST_CODE_LANGUAGES: {
        const highlightJs = await getCodeRenderer();
        const result = highlightJs.listLanguages().map((name) => ({
          name,
          ...pick(highlightJs.getLanguage(name), 'aliases'),
        }));
        return respond(request, result);
      }
    }
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
      request,
      requestType: request.type,
      type: WorkerMessageType.ERROR,
    });
  }
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/consistent-type-assertions
export default null as any;
