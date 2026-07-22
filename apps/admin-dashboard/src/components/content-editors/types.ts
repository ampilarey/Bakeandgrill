export type ContentEditorProps = {
  label: string;
  description?: string;
  value: string;
  onChange: (v: string) => void;
};

export type UploadTrigger = (key: string, onDone: (url: string) => void) => void;

export type ContentEditorWithUploadProps = ContentEditorProps & {
  triggerUpload: UploadTrigger;
};

export type HeroSlideEditorProps = ContentEditorWithUploadProps & {
  uploadKey: string;
};
