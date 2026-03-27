declare module "msgreader" {
  interface MsgFileData {
    subject?: string;
    senderName?: string;
    senderEmail?: string;
    body?: string;
    headers?: string;
    attachments?: unknown[];
    recipients?: unknown[];
    error?: string;
    [key: string]: unknown;
  }

  export default class MsgReader {
    constructor(buffer: ArrayBuffer);
    getFileData(): MsgFileData;
  }
}
