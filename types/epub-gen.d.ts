declare module "epub-gen" {
  interface EpubChapter {
    title: string;
    data: string;
  }
  interface EpubOptions {
    title: string;
    author: string;
    content: EpubChapter[];
    appendChapterTitles?: boolean;
    lang?: string;
    css?: string;
  }
  export default class Epub {
    constructor(options: EpubOptions, outputPath: string);
    promise: Promise<void>;
  }
}
