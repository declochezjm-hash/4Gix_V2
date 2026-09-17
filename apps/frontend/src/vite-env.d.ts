/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_API_URL?: string;
	readonly VITE_WS_URL?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

interface FileSystemWritableFileStream extends WritableStream {
	write(data: Blob): Promise<void>;
	close(): Promise<void>;
}

interface FileSystemFileHandle {
	createWritable(): Promise<FileSystemWritableFileStream>;
}

interface SaveFilePickerOptions {
	suggestedName?: string;
	types?: Array<{
		description?: string;
		accept: Record<string, string[]>;
	}>;
}

interface Window {
	showSaveFilePicker?: (
		options?: SaveFilePickerOptions,
	) => Promise<FileSystemFileHandle>;
}
