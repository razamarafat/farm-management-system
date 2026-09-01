import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Upload, 
  Camera, 
  CheckCircle,
  AlertCircle,
  Loader2,
  Trash2,
  Eye
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { 
  compressImage, 
  validateFile,
  generateUniqueFileName,
  CompressedFile 
} from '@/utils/imageCompression';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface FileUploadProps {
  value: string | null;
  onChange: (url: string | null) => void;
  label?: string;
  accept?: string;
  maxSizeMB?: number;
  bucketName?: string;
  folderName?: string;
}

export function FileUpload({
  value,
  onChange,
  label = 'تصویر فاکتور یا بارنامه',
  accept = 'image/*',
  maxSizeMB = 3,
  bucketName = 'attachments',
  folderName = 'invoices',
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(value);
  const [error, setError] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    setError(null);
    
    const validation = validateFile(file);
    if (!validation.valid) {
      setError(validation.error || 'فایل نامعتبر است');
      return;
    }

    setIsCompressing(true);
    try {
      const compressed: CompressedFile = await compressImage(file, {
        maxSizeMB,
        maxWidthOrHeight: 2048,
        initialQuality: 0.85,
      });

      setPreviewUrl(compressed.dataUrl);
      
      await uploadFile(compressed.file);
    } catch (err) {
      setError('خطا در فشرده‌سازی تصویر');
    } finally {
      setIsCompressing(false);
    }
  }, [maxSizeMB, onChange]);

  const uploadFile = async (file: File) => {
    setIsUploading(true);
    setUploadProgress(0);

    try {
      const fileName = generateUniqueFileName(folderName, 'jpg');
      const filePath = `${folderName}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(filePath, file, {
          cacheControl: '31536000',
          upsert: false,
          contentType: 'image/jpeg',
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from(bucketName)
        .getPublicUrl(filePath);

      onChange(publicUrl);
      toast.success('تصویر با موفقیت آپلود شد');
    } catch (err) {
      setError('خطا در آپلود تصویر');
      toast.error('خطا در آپلود تصویر');
    } finally {
      setIsUploading(false);
      setUploadProgress(100);
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processFile(files[0]);
    }
  }, [processFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [processFile]);

  const handleCameraCapture = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
    if (cameraInputRef.current) {
      cameraInputRef.current.value = '';
    }
  }, [processFile]);

  const handleRemove = useCallback(async () => {
    if (value) {
      try {
        const path = value.split(`${bucketName}/`)[1];
        if (path) {
          await supabase.storage
            .from(bucketName)
            .remove([path]);
        }
      } catch (err) {
        // Ignore removal errors
      }
    }
    setPreviewUrl(null);
    onChange(null);
  }, [value, bucketName, onChange]);

  const handleView = useCallback(() => {
    if (previewUrl || value) {
      window.open(previewUrl || value || '', '_blank');
    }
  }, [previewUrl, value]);

  return (
    <div className="space-y-2">
      {label && (
        <label className="text-sm font-medium text-[var(--c-fg)] block">
          {label}
        </label>
      )}

      <AnimatePresence mode="wait">
        {previewUrl || value ? (
          <motion.div
            key="preview"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
          >
            <Card className="relative overflow-hidden border-2 border-[color-mix(in_srgb,var(--c-success)_30%,transparent)]">
              <div className="aspect-video relative bg-[var(--c-muted)]">
                <img
                  src={previewUrl || value || ''}
                  alt="Preview"
                  className="w-full h-full object-contain"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleView}
                    className="gap-1"
                  >
                    <Eye className="w-4 h-4" />
                    مشاهده
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleRemove}
                    className="gap-1"
                  >
                    <Trash2 className="w-4 h-4" />
                    حذف
                  </Button>
                </div>
              </div>
              <div className="p-2 bg-[color-mix(in_srgb,var(--c-success)_10%,transparent)] flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-[var(--c-success)]" />
                <span className="text-xs text-[var(--c-success)]">تصویر آپلود شده</span>
              </div>
            </Card>
          </motion.div>
        ) : (
          <motion.div
            key="upload"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div
              className={`
                relative border-2 border-dashed rounded-lg p-6 text-center transition-all cursor-pointer
                ${isDragging 
                  ? 'border-green-500 bg-[color-mix(in_srgb,var(--c-success)_10%,transparent)]' 
                  : 'border-[var(--c-border)] hover:border-[var(--c-success)]/60 hover:bg-[var(--c-muted)]'
                }
                ${error ? 'border-[var(--c-destructive)] bg-[color-mix(in_srgb,var(--c-destructive)_10%,transparent)]' : ''}
              `}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={accept}
                onChange={handleFileSelect}
                className="hidden"
              />

              {isCompressing ? (
                <div className="flex flex-col items-center py-4">
                  <Loader2 className="w-10 h-10 text-[var(--c-info)] animate-spin mb-2" />
                  <p className="text-sm text-[var(--c-muted-fg)]">در حال فشرده‌سازی تصویر...</p>
                </div>
              ) : isUploading ? (
                <div className="flex flex-col items-center py-4">
                  <div className="w-10 h-10 relative mb-2">
                    <Loader2 className="w-10 h-10 text-[var(--c-success)] animate-spin absolute" />
                    <svg className="w-10 h-10 -rotate-90">
                      <circle
                        cx="20"
                        cy="20"
                        r="16"
                        stroke="currentColor"
                        strokeWidth="3"
                        fill="none"
                        className="text-[var(--c-muted-fg)]/40"
                      />
                      <circle
                        cx="20"
                        cy="20"
                        r="16"
                        stroke="currentColor"
                        strokeWidth="3"
                        fill="none"
                        strokeDasharray={100}
                        strokeDashoffset={100 - uploadProgress}
                        className="text-[var(--c-success)] transition-all"
                      />
                    </svg>
                  </div>
                  <p className="text-sm text-[var(--c-muted-fg)]">در حال آپلود...</p>
                </div>
              ) : (
                <>
                  <div className="flex flex-col items-center">
                    <div className="w-14 h-14 rounded-full bg-[color-mix(in_srgb,var(--c-info)_16%,transparent)] flex items-center justify-center mb-3">
                      <Upload className="w-7 h-7 text-[var(--c-info)]" />
                    </div>
                    <p className="text-sm font-medium text-[var(--c-fg)] mb-1">
                      آپلود تصویر فاکتور یا بارنامه
                    </p>
                    <p className="text-xs text-[var(--c-muted-fg)] mb-3">
                      تصویر را اینجا رها کنید یا کلیک کنید
                    </p>
                    <div className="flex items-center gap-2 text-xs text-[var(--c-muted-fg)]">
                      <span>JPG</span>
                      <span>•</span>
                      <span>PNG</span>
                      <span>•</span>
                      <span>WebP</span>
                      <span>•</span>
                      <span>حداکثر {maxSizeMB}MB</span>
                    </div>
                  </div>

                  {/* Camera button for mobile */}
                  <div className="mt-4 pt-4 border-t border-[var(--c-border)]">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-[var(--c-info)]"
                      onClick={(e) => {
                        e.stopPropagation();
                        cameraInputRef.current?.click();
                      }}
                    >
                      <Camera className="w-4 h-4 ml-1" />
                      گرفتن عکس با دوربین
                    </Button>
                    <input
                      ref={cameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleCameraCapture}
                      className="hidden"
                    />
                  </div>
                </>
              )}

              {error && (
                <div className="absolute bottom-2 left-2 right-2 flex items-center gap-2 bg-[color-mix(in_srgb,var(--c-destructive)_16%,transparent)] text-[var(--c-error)] px-3 py-2 rounded-md text-xs">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <p className="text-xs text-[var(--c-muted-fg)]">
        تصویر به صورت خودکار فشرده و ذخیره می‌شود
      </p>
    </div>
  );
}
