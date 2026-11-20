import type { BlogMaterials } from './blogMaterials';

type ZipEntry = { name: string; data: Uint8Array };
const encoder = new TextEncoder();
const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Small, uncompressed ZIP: photos are already JPEG-compressed. No external library/request. */
export function createStoredZip(entries: ZipEntry[]): Uint8Array<ArrayBuffer> {
  if (!entries.length || entries.length > 65535) throw new Error('내려받을 파일 수를 확인해 주세요.');
  const names = new Set<string>();
  const records = entries.map(entry => {
    if (!entry.name || entry.name.startsWith('/') || /^[A-Za-z]:/.test(entry.name) || /[\x00-\x1f\x7f]/.test(entry.name) || entry.name.includes('\\') || entry.name.split('/').some(part => !part || part === '..' || part === '.') || names.has(entry.name)) throw new Error('올바르지 않은 내보내기 파일 이름입니다.');
    names.add(entry.name);
    const name = encoder.encode(entry.name);
    if (name.length > 65535) throw new Error('파일 이름이 너무 길어요.');
    return { ...entry, nameBytes: name, crc: crc32(entry.data) };
  });
  const localSize = records.reduce((size, entry) => size + 30 + entry.nameBytes.length + entry.data.length, 0);
  const centralSize = records.reduce((size, entry) => size + 46 + entry.nameBytes.length, 0);
  if (localSize + centralSize + 22 > 8 * 1024 * 1024) throw new Error('글쓰기 자료가 너무 커요. 하루씩 나누어 내려받아 주세요.');
  const zip = new Uint8Array(localSize + centralSize + 22), view = new DataView(zip.buffer);
  let offset = 0, centralOffset = localSize;
  for (const entry of records) {
    const { nameBytes: name, data, crc } = entry;
    view.setUint32(offset, 0x04034b50, true); view.setUint16(offset + 4, 20, true);
    view.setUint16(offset + 6, 0x0800, true); view.setUint16(offset + 12, 0x0021, true);
    view.setUint32(offset + 14, crc, true); view.setUint32(offset + 18, data.length, true); view.setUint32(offset + 22, data.length, true);
    view.setUint16(offset + 26, name.length, true); zip.set(name, offset + 30); zip.set(data, offset + 30 + name.length);
    view.setUint32(centralOffset, 0x02014b50, true); view.setUint16(centralOffset + 4, 20, true); view.setUint16(centralOffset + 6, 20, true);
    view.setUint16(centralOffset + 8, 0x0800, true); view.setUint16(centralOffset + 14, 0x0021, true);
    view.setUint32(centralOffset + 16, crc, true); view.setUint32(centralOffset + 20, data.length, true); view.setUint32(centralOffset + 24, data.length, true);
    view.setUint16(centralOffset + 28, name.length, true); view.setUint32(centralOffset + 42, offset, true);
    zip.set(name, centralOffset + 46);
    offset += 30 + name.length + data.length; centralOffset += 46 + name.length;
  }
  view.setUint32(centralOffset, 0x06054b50, true);
  view.setUint16(centralOffset + 8, records.length, true); view.setUint16(centralOffset + 10, records.length, true);
  view.setUint32(centralOffset + 12, centralSize, true); view.setUint32(centralOffset + 16, localSize, true);
  return zip;
}

export function createBlogArchive(materials: BlogMaterials) {
  if (!materials.stopCount) throw new Error('내려받을 후기나 일정을 먼저 선택해 주세요.');
  const instructions = [
    '호랑나비 블로그 글쓰기 자료',
    '', '1. ZIP 파일의 압축을 풀어 주세요.',
    '2. ChatGPT 새 대화에 chatgpt-request.txt 내용을 붙여넣어 주세요.',
    materials.photos.length ? '3. photos 폴더의 사진을 직접 첨부해 주세요. 사진이 많으면 날짜별로 나누어 요청할 수 있어요.' : '3. 이번 자료에는 사진이 없습니다. 작성 요청문으로 글 초안을 요청해 주세요.',
    '4. photo-guide.txt로 파일명과 장소 연결을 확인해 주세요.',
    '5. 완성된 글의 사실·개인정보와 사진을 확인하고 블로그에 직접 올려 주세요.',
    '', '사진은 앱에 저장된 압축본이며 원본 화질이 아닙니다.',
    '공유 여행의 참여자들이 작성한 후기/사진이 포함될 수 있습니다. 외부에 전달할 내용은 먼저 확인해 주세요.',
    '이 자료를 내려받는 것만으로 ChatGPT나 블로그에 전송되지는 않습니다.',
  ].join('\n');
  return createStoredZip([
    { name: 'README.txt', data: encoder.encode(instructions) },
    { name: 'chatgpt-request.txt', data: encoder.encode(materials.prompt) },
    { name: 'photo-guide.txt', data: encoder.encode(materials.photoGuide) },
    ...materials.photos.map(photo => ({ name: photo.filename, data: Uint8Array.from(atob(photo.dataUrl.slice(photo.dataUrl.indexOf(',') + 1)), character => character.charCodeAt(0)) })),
  ]);
}
