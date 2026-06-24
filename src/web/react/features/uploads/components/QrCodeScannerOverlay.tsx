import React, { useEffect, useRef, useState } from 'react';

import { tSystem } from '../../../../systemStrings';
import type { LangCode } from '../../../../types';
import { buttonStyles, withDisabled } from '../../../components/form/ui';
import { FullPageOverlay } from '../../../components/form/overlays/FullPageOverlay';
import {
  createNativeQrDetector,
  decodeQrFromImageFile,
  decodeQrFromVideoFrame,
  isLiveCameraSupported,
  isQrScannerSupported
} from '../../../../qrScanner/decoder';

type ScannerStatus = 'idle' | 'starting' | 'scanning' | 'unsupported' | 'error';

export { isQrScannerSupported } from '../../../../qrScanner/decoder';

export const QrCodeScannerOverlay: React.FC<{
  open: boolean;
  language: LangCode;
  title?: string;
  unsupportedMessage?: string;
  onDetected: (value: string) => void;
  onClose: () => void;
}> = ({ open, language, title, unsupportedMessage, onDetected, onClose }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<ScannerStatus>('idle');
  const [message, setMessage] = useState('');

  const handlePhotoInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0] || null;
    event.currentTarget.value = '';
    if (!file) return;

    setMessage(tSystem('files.linkCapture.readingPhoto', language, 'Reading QR code from photo...'));
    try {
      const value = await decodeQrFromImageFile(file, document.createElement('canvas'), createNativeQrDetector());
      if (value) {
        onDetected(value);
        return;
      }
      setMessage(tSystem('files.linkCapture.noQrInPhoto', language, 'No QR code found in that photo. Try again or paste the link.'));
    } catch {
      setMessage(tSystem('files.linkCapture.photoFailed', language, 'Could not read that photo. Try again or paste the link.'));
    }
  };

  useEffect(() => {
    if (!open) {
      setStatus('idle');
      setMessage('');
      return;
    }

    let cancelled = false;
    let stream: MediaStream | null = null;
    let frameId = 0;

    const stop = () => {
      cancelled = true;
      if (frameId) {
        cancelAnimationFrame(frameId);
        frameId = 0;
      }
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };

    const start = async () => {
      if (!isQrScannerSupported()) {
        setStatus('unsupported');
        setMessage(
          unsupportedMessage ||
            tSystem('files.linkCapture.unsupported', language, 'QR scanning is not available in this browser. Paste the Drive link instead.')
        );
        return;
      }
      if (!isLiveCameraSupported()) {
        setStatus('unsupported');
        setMessage(
          tSystem(
            'files.linkCapture.liveCameraUnavailable',
            language,
            'Live camera scanning is not available. Take a QR photo or paste the Drive link instead.'
          )
        );
        return;
      }

      setStatus('starting');
      setMessage(tSystem('files.linkCapture.starting', language, 'Starting camera...'));

      try {
        const detector = createNativeQrDetector();
        const fallbackCanvas = document.createElement('canvas');
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' }
          },
          audio: false
        });

        if (cancelled) {
          stop();
          return;
        }

        const video = videoRef.current;
        if (!video) {
          setStatus('error');
          setMessage(
            tSystem(
              'files.linkCapture.cameraFailed',
              language,
              'Could not start the camera. Take a QR photo or paste the Drive link instead.'
            )
          );
          return;
        }

        video.srcObject = stream;
        await video.play();
        setStatus('scanning');
        setMessage(tSystem('files.linkCapture.scanning', language, 'Point the camera at the QR code.'));

        const scan = async () => {
          if (cancelled) return;
          try {
            const rawValue = await decodeQrFromVideoFrame(video, fallbackCanvas, detector);
            if (rawValue) {
              stop();
              onDetected(rawValue);
              return;
            }
          } catch {
            // Keep scanning; transient detector failures happen while frames settle.
          }
          frameId = requestAnimationFrame(scan);
        };

        frameId = requestAnimationFrame(scan);
      } catch {
        setStatus('error');
        setMessage(
          tSystem(
            'files.linkCapture.cameraFailed',
            language,
            'Could not start the camera. Take a QR photo or paste the Drive link instead.'
          )
        );
      }
    };

    void start();
    return stop;
  }, [language, onDetected, open, unsupportedMessage]);

  return (
    <FullPageOverlay
      open={open}
      zIndex={10050}
      title={title || tSystem('files.linkCapture.scanTitle', language, 'Scan QR code')}
      subtitle={message}
      rightAction={
        <button type="button" onClick={onClose} style={buttonStyles.secondary}>
          {tSystem('common.close', language, 'Close')}
        </button>
      }
    >
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, flex: 1 }}>
        <div
          style={{
            background: 'var(--border)',
            borderRadius: 8,
            overflow: 'hidden',
            minHeight: 280,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {status === 'unsupported' || status === 'error' ? (
            <div className="muted" style={{ padding: 16, textAlign: 'center' }}>
              {message}
            </div>
          ) : (
            <video
              ref={videoRef}
              muted
              playsInline
              style={{ width: '100%', height: '100%', minHeight: 280, objectFit: 'cover', display: 'block' }}
            />
          )}
        </div>
        <button type="button" onClick={onClose} style={withDisabled(buttonStyles.secondary, false)}>
          {tSystem('files.linkCapture.pasteInstead', language, 'Paste link instead')}
        </button>
        <button type="button" onClick={() => photoInputRef.current?.click()} style={withDisabled(buttonStyles.secondary, false)}>
          {tSystem('files.linkCapture.scanFromPhoto', language, 'Take or choose QR photo')}
        </button>
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={handlePhotoInputChange}
        />
      </div>
    </FullPageOverlay>
  );
};
