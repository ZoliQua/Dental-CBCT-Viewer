import { useCallback, useRef, useState, type DragEvent, type ChangeEvent } from 'react';
import { useDicomLoader } from '@/hooks/useDicomLoader';
import { useViewer } from '@/context/ViewerContext';
import { useI18n } from '@/i18n/I18nContext';

export function FileDropZone() {
  const { loadFiles, isLoading, loadProgress, error } = useDicomLoader();
  const { dispatch } = useViewer();
  const { t } = useI18n();
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const collectFiles = async (entries: FileSystemEntry[]): Promise<File[]> => {
    const files: File[] = [];

    async function readEntry(entry: FileSystemEntry): Promise<void> {
      if (entry.isFile) {
        const file = await new Promise<File>((resolve, reject) => {
          (entry as FileSystemFileEntry).file(resolve, reject);
        });
        files.push(file);
      } else if (entry.isDirectory) {
        const reader = (entry as FileSystemDirectoryEntry).createReader();
        // readEntries returns results in batches — must loop until empty
        let batch: FileSystemEntry[];
        do {
          batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
            reader.readEntries(resolve, reject);
          });
          for (const sub of batch) {
            await readEntry(sub);
          }
        } while (batch.length > 0);
      }
    }

    for (const entry of entries) {
      await readEntry(entry);
    }
    return files;
  };

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      try {
        // webkitGetAsEntry (recursive folders) is Chromium-only; fall back to
        // the flat file list on Firefox/Safari.
        const entries: FileSystemEntry[] = [];
        const items = e.dataTransfer.items;
        if (items && items.length > 0 && typeof items[0].webkitGetAsEntry === 'function') {
          for (let i = 0; i < items.length; i++) {
            const entry = items[i].webkitGetAsEntry();
            if (entry) entries.push(entry);
          }
        }

        const files = entries.length > 0
          ? await collectFiles(entries)
          : Array.from(e.dataTransfer.files ?? []);
        if (files.length > 0) {
          loadFiles(files);
        }
      } catch (err) {
        dispatch({
          type: 'SET_ERROR',
          payload: t('error.loadError', { msg: err instanceof Error ? err.message : String(err) }),
        });
      }
    },
    [loadFiles, dispatch, t],
  );

  const handleFileInput = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files;
      if (fileList && fileList.length > 0) {
        loadFiles(Array.from(fileList));
      }
    },
    [loadFiles],
  );

  const progressPercent =
    loadProgress && loadProgress.total > 0
      ? Math.round((loadProgress.loaded / loadProgress.total) * 100)
      : 0;

  return (
    <div className="flex items-center justify-center w-full">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative flex flex-col items-center justify-center
          w-full h-80
          border-2 border-dashed rounded-2xl
          transition-all duration-200 cursor-pointer
          ${
            isDragOver
              ? 'border-dental-400 bg-dental-100/50 dark:bg-dental-900/30 scale-[1.02]'
              : 'border-gray-400 bg-white/60 hover:border-gray-500 hover:bg-white dark:border-gray-600 dark:bg-gray-800/50 dark:hover:border-gray-500 dark:hover:bg-gray-800/70'
          }
        `}
      >
        {/* Files: individual DICOM files */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileInput}
          className="hidden"
          accept=".dcm,.dicom,application/dicom"
        />
        {/* Folder: a whole study/series directory (Chromium: webkitdirectory) */}
        <input
          ref={folderInputRef}
          type="file"
          onChange={handleFileInput}
          className="hidden"
          multiple
          {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
        />

        {isLoading ? (
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 border-4 border-dental-400 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-lg text-gray-700 dark:text-gray-300">{t('drop.processing')}</p>
            {loadProgress && (
              <div className="mt-3 w-64">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>
                    {t('drop.files', { loaded: loadProgress.loaded, total: loadProgress.total })}
                  </span>
                  <span>{progressPercent}%</span>
                </div>
                <div className="w-full bg-gray-300 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-dental-500 h-2 rounded-full transition-all duration-150"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            <svg
              className="w-16 h-16 text-gray-500 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p className="text-lg text-gray-700 dark:text-gray-300 mb-1 text-center">{t('drop.title')}</p>
            <p className="text-sm text-gray-500 mb-4 text-center max-w-xs">
              {t('drop.hint')}
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 text-sm rounded-lg bg-dental-600 text-white hover:bg-dental-700 transition-colors"
              >
                {t('drop.chooseFiles')}
              </button>
              <button
                type="button"
                onClick={() => folderInputRef.current?.click()}
                className="px-4 py-2 text-sm rounded-lg border border-dental-500 text-dental-700 hover:bg-dental-100 dark:text-dental-300 dark:hover:bg-dental-900/30 transition-colors flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
                    d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                </svg>
                {t('drop.chooseFolder')}
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-600 mt-3 text-center max-w-xs">{t('drop.format')}</p>
          </>
        )}

        {error && (
          <div className="absolute bottom-4 left-4 right-4 bg-red-900/80 border border-red-700 rounded-lg p-3 text-sm text-red-200">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
