import * as HighlightJs from 'highlight.js';
import * as MarkdownIt from 'markdown-it';

export const enum Mode {
  Light = 'Light',
  Dark = 'Dark',
}

export const enum WorkerMessageType {
  RESULT = 'RESULT',
  ERROR = 'ERROR',
  RENDER_CODE = 'RENDER_CODE',
  RENDER_MARKDOWN = 'RENDER_MARKDOWN',
  LIST_CODE_LANGUAGES = 'LIST_CODE_LANGUAGES',
}

export interface ILanguage extends Pick<HighlightJs.IMode, 'aliases'> {
  name: string;
}

interface WorkerRenderCodeRequestMessage {
  type: WorkerMessageType.RENDER_CODE;
  content: string;
  language?: string;
}

interface WorkerListLanguagesRequestMessage {
  type: WorkerMessageType.LIST_CODE_LANGUAGES;
}

interface WorkerRenderMarkdownRequestMessage {
  type: WorkerMessageType.RENDER_MARKDOWN;
  content: string;
}

export type WorkerRequestMessage =
  | WorkerRenderCodeRequestMessage
  | WorkerListLanguagesRequestMessage
  | WorkerRenderMarkdownRequestMessage;

export interface BaseWorkerResultMessage<T extends WorkerRequestMessage, S> {
  type: WorkerMessageType.RESULT;
  request_type: T['type'];
  request: T;
  result: S;
}

type WorkerRenderCodeResultMessage = BaseWorkerResultMessage<
  WorkerRenderCodeRequestMessage,
  ReturnType<typeof HighlightJs['highlight']>
>;

type WorkerRenderMarkdownResultMessage = BaseWorkerResultMessage<
  WorkerRenderMarkdownRequestMessage,
  ReturnType<ReturnType<typeof MarkdownIt>['render']>
>;

type WorkerListLanguagesResultMessage = BaseWorkerResultMessage<
  WorkerListLanguagesRequestMessage,
  Array<ILanguage>
>;

export type WorkerResultForRequest<T extends WorkerRequestMessage> =
  T extends WorkerRenderCodeRequestMessage ? WorkerRenderCodeResultMessage :
  T extends WorkerRenderMarkdownResultMessage ? WorkerRenderMarkdownRequestMessage :
  T extends WorkerListLanguagesRequestMessage ? WorkerListLanguagesResultMessage : never;

type WorkerResultMessage =
  | WorkerRenderCodeResultMessage
  | WorkerRenderMarkdownResultMessage
  | WorkerListLanguagesResultMessage;

interface WorkerErrorMessage<T extends WorkerRequestMessage> {
  type: WorkerMessageType.ERROR;
  request: T;
  request_type: T['type'];
  error: string;
}

type WorkerMessage =
  | WorkerRequestMessage
  | WorkerResultMessage
  | WorkerErrorMessage<WorkerRequestMessage>;

interface IWorkerMessageEvent extends MessageEvent {
  data: WorkerMessage;
}

type WorkerEventListenerOrEventListenerObject =
  | {
      handleEvent: (ev: IWorkerMessageEvent) => void;
    }
  | ((evt: IWorkerMessageEvent) => void);

export class AppWorker extends Worker {
  HighlightJs?: typeof HighlightJs;
  MarkdownIt?: ReturnType<typeof MarkdownIt>;

  public postMessage(message: WorkerMessage): void;
  public addEventListener(
    type: 'message',
    listener: WorkerEventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
}
