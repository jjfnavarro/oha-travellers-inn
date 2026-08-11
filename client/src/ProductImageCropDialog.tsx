import { RotateCcw, RotateCw, ZoomIn } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import Cropper, { type Area, type Point } from 'react-easy-crop';

interface ProductImageCropDialogProps {
  file: File;
  onCancel: () => void;
  onApply: (file: File) => void;
}

const outputSize = 800;

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error('The selected image could not be opened.'));
    image.src = source;
  });
}

function rotatedSize(width: number, height: number, rotation: number) {
  const radians = (rotation * Math.PI) / 180;
  return {
    width:
      Math.abs(Math.cos(radians) * width) +
      Math.abs(Math.sin(radians) * height),
    height:
      Math.abs(Math.sin(radians) * width) +
      Math.abs(Math.cos(radians) * height),
  };
}

async function createCroppedFile(
  source: string,
  crop: Area,
  rotation: number,
  originalName: string,
): Promise<File> {
  const image = await loadImage(source);
  if (image.naturalWidth * image.naturalHeight > 50_000_000) {
    throw new Error('Choose an image smaller than 50 megapixels.');
  }

  const bounds = rotatedSize(image.naturalWidth, image.naturalHeight, rotation);
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = Math.ceil(bounds.width);
  sourceCanvas.height = Math.ceil(bounds.height);
  const sourceContext = sourceCanvas.getContext('2d');
  if (!sourceContext)
    throw new Error('Image cropping is not supported by this browser.');
  sourceContext.translate(sourceCanvas.width / 2, sourceCanvas.height / 2);
  sourceContext.rotate((rotation * Math.PI) / 180);
  sourceContext.drawImage(
    image,
    -image.naturalWidth / 2,
    -image.naturalHeight / 2,
  );

  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = outputSize;
  outputCanvas.height = outputSize;
  const outputContext = outputCanvas.getContext('2d');
  if (!outputContext)
    throw new Error('Image cropping is not supported by this browser.');
  outputContext.drawImage(
    sourceCanvas,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    outputSize,
    outputSize,
  );

  const blob = await new Promise<Blob | null>((resolve) =>
    outputCanvas.toBlob(resolve, 'image/webp', 0.86),
  );
  if (!blob) throw new Error('The cropped image could not be created.');
  const baseName = originalName
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9_-]+/gi, '-');
  return new File([blob], `${baseName || 'product'}-cropped.webp`, {
    type: 'image/webp',
  });
}

export function ProductImageCropDialog({
  file,
  onCancel,
  onApply,
}: ProductImageCropDialogProps) {
  const [source, setSource] = useState('');
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setSource(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  const reset = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
  };

  const applyCrop = useCallback(async () => {
    if (!croppedArea || !source) return;
    setProcessing(true);
    setMessage(null);
    try {
      onApply(
        await createCroppedFile(source, croppedArea, rotation, file.name),
      );
    } catch (error: unknown) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'The image could not be cropped.',
      );
      setProcessing(false);
    }
  }, [croppedArea, file.name, onApply, rotation, source]);

  return (
    <div className="dialog-backdrop crop-dialog-backdrop" role="presentation">
      <section
        className="dialog product-crop-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="crop-title"
      >
        <div className="dialog-header">
          <div>
            <p className="dialog-eyebrow">Product image</p>
            <h2 id="crop-title">Crop image</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Close cropper"
            onClick={onCancel}
          >
            ×
          </button>
        </div>

        <div className="product-crop-stage">
          {source && (
            <Cropper
              image={source}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={1}
              cropShape="rect"
              showGrid
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onRotationChange={setRotation}
              onCropComplete={(_area, pixels) => setCroppedArea(pixels)}
            />
          )}
        </div>

        <div className="crop-controls">
          <label className="crop-zoom-control">
            <ZoomIn size={18} aria-hidden="true" />
            <span>Zoom</span>
            <input
              type="range"
              min="1"
              max="3"
              step="0.01"
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
            />
          </label>
          <div className="crop-rotation-controls">
            <button
              className="icon-button"
              type="button"
              aria-label="Rotate left"
              title="Rotate left"
              onClick={() => setRotation((value) => (value + 270) % 360)}
            >
              <RotateCcw size={20} />
            </button>
            <output>{rotation}°</output>
            <button
              className="icon-button"
              type="button"
              aria-label="Rotate right"
              title="Rotate right"
              onClick={() => setRotation((value) => (value + 90) % 360)}
            >
              <RotateCw size={20} />
            </button>
          </div>
        </div>

        {message && (
          <p className="form-error" role="alert">
            {message}
          </p>
        )}
        <div className="dialog-actions crop-dialog-actions">
          <button
            className="secondary-button"
            type="button"
            disabled={processing}
            onClick={reset}
          >
            Reset
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={processing}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={processing || !croppedArea}
            onClick={() => void applyCrop()}
          >
            {processing ? 'Applying...' : 'Apply crop'}
          </button>
        </div>
      </section>
    </div>
  );
}
