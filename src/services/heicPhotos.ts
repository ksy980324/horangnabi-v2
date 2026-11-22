/** Decode only on demand in a disposable worker; the original stays on this device. */
export function decodeHeicPhoto(file: File): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    let worker: Worker | undefined;
    let settled = false;
    const finish = () => {
      settled = true;
      clearTimeout(timer);
      if (worker) {
        worker.onmessage = null; worker.onerror = null; worker.onmessageerror = null;
        worker.terminate();
      }
    };
    const fail = (message: string) => { if (!settled) { finish(); reject(new Error(message)); } };
    const timer = setTimeout(() => fail('HEIC 사진 변환 시간이 초과됐어요. 다른 사진을 선택하거나 갤러리에서 JPG로 저장한 뒤 다시 첨부해 주세요.'), 60000);
    try {
      worker = new Worker(new URL('../vendor/heic.worker.js', import.meta.url), { type: 'module' });
      worker.onerror = () => fail('HEIC 사진 변환기를 실행하지 못했어요. 앱을 다시 열고 재시도해 주세요.');
      worker.onmessageerror = () => fail('HEIC 사진 변환 결과를 읽지 못했어요. 다른 사진을 선택해 주세요.');
      worker.onmessage = (event: MessageEvent<{ imageData?: ImageData; error?: string }>) => {
        if (settled) return;
        const image = event.data?.imageData;
        if (event.data?.error || !image || image.width <= 0 || image.height <= 0) {
          fail('이 HEIC/HEIF 사진을 변환하지 못했어요. 갤러리에서 JPG로 저장한 뒤 다시 첨부해 주세요.');
          return;
        }
        try {
          const canvas = document.createElement('canvas');
          canvas.width = image.width; canvas.height = image.height;
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Canvas unavailable');
          context.putImageData(image, 0, 0);
          finish(); resolve(canvas);
        } catch { fail('HEIC 사진을 처리할 공간이 부족해요. 더 작은 사진을 선택해 주세요.'); }
      };
      void file.arrayBuffer().then(buffer => {
        if (!settled) worker?.postMessage({ id: 'photo', buffer }, [buffer]);
      }).catch(() => fail('사진 파일에 접근하지 못했어요. 갤러리에서 사진을 기기에 저장한 뒤 다시 선택해 주세요.'));
    } catch { fail('HEIC 사진 변환을 지원하지 않는 브라우저예요. 최신 브라우저에서 다시 첨부해 주세요.'); }
  });
}
