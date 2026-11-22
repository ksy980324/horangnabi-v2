import { useMemo, useRef, useState } from 'react';
import { Copy, Download, ExternalLink } from 'lucide-react';
import type { Trip } from '../types';
import { datesBetween } from '../data';
import { buildBlogMaterials, type BlogOptions } from '../services/blogMaterials';
import { Modal } from './Modal';

export function BlogMaterials({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  const [scope, setScope] = useState('all'), [tone, setTone] = useState<BlogOptions['tone']>('personal');
  const [includeUnreviewed, setIncludeUnreviewed] = useState(false), [includePhotos, setIncludePhotos] = useState(true);
  const [busy, setBusy] = useState(false), [status, setStatus] = useState('');
  const preview = useRef<HTMLDetailsElement>(null), prompt = useRef<HTMLTextAreaElement>(null);
  const dates = datesBetween(trip.start, trip.end);
  const materials = useMemo(() => buildBlogMaterials(trip, { date: scope === 'all' ? undefined : scope, tone, includeUnreviewed, includePhotos }), [trip, scope, tone, includeUnreviewed, includePhotos]);
  async function copy() {
    setStatus('');
    try { await navigator.clipboard.writeText(materials.prompt); setStatus('작성 요청문을 복사했어요. ChatGPT에 붙여넣고 사진을 직접 첨부해 주세요.'); }
    catch {
      if (preview.current) preview.current.open = true;
      prompt.current?.focus(); prompt.current?.select();
      setStatus('자동 복사를 사용할 수 없어요. 아래 선택된 작성 요청문을 직접 복사해 주세요.');
    }
  }
  async function download() {
    setBusy(true); setStatus('');
    try {
      const { createBlogArchive } = await import('../services/blogArchive');
      const archive = createBlogArchive(materials);
      const url = URL.createObjectURL(new Blob([archive], { type: 'application/zip' }));
      const link = document.createElement('a');
      try {
        link.href = url; link.download = `horangnabi-blog-${scope === 'all' ? 'trip' : scope}.zip`;
        document.body.append(link); link.click();
      } finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 10000); }
      setStatus('다운로드를 요청했어요. ZIP의 압축을 풀고 요청문과 사진을 ChatGPT에 직접 전달해 주세요.');
    } catch (cause) { setStatus(cause instanceof Error ? cause.message : '자료를 내려받지 못했어요. 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  }
  return <Modal title="블로그 글쓰기 자료" busy={busy} busyMessage="글쓰기 자료를 준비하고 있어요." status={status} onClose={onClose}>
    <div className="blog-materials">
      <p className="muted">일정과 후기·사진을 ChatGPT용 자료로 정리해요. 작성 요청문을 붙여넣고 사진을 직접 첨부하면 블로그 초안을 부탁할 수 있어요.</p>
      <fieldset className="editor-fields blog-options" disabled={busy} onChange={() => setStatus('')}>
        <div className="form-row"><label>작성 범위<select value={scope} onChange={event => setScope(event.target.value)}><option value="all">여행 전체</option>{dates.map((date, index) => <option key={date} value={date}>{index + 1}일차 · {date}</option>)}</select></label>
        <label>글 분위기<select value={tone} onChange={event => setTone(event.target.value as BlogOptions['tone'])}><option value="personal">내 말투 + 요즘 블로그 느낌</option><option value="friendly">친근한 여행 후기</option><option value="practical">담백한 정보 중심</option></select></label></div>
        <label className="blog-checkbox"><input type="checkbox" checked={includePhotos} onChange={event => setIncludePhotos(event.target.checked)}/>후기 사진 포함</label>
        <label className="blog-checkbox"><input type="checkbox" checked={includeUnreviewed} onChange={event => setIncludeUnreviewed(event.target.checked)}/>후기 없는 일정도 계획 자료로 포함</label>
      </fieldset>
      {tone === 'personal' && <p className="muted">후기의 말투와 표현을 살리고 도입·문단·소제목을 읽기 좋게 다듬도록 요청해요. 후기 글이 적으면 담백하고 친근한 문체를 사용해요.</p>}
      <p className="blog-material-count" role="status">후기 {materials.reviewedCount}곳 · 계획만 있는 일정 {materials.plannedCount}곳 · 사진 {materials.photos.length}장</p>
      {!materials.stopCount && <p className="blog-empty">선택한 범위에 후기가 없어요. 일정에 후기·사진을 저장하거나, 계획 자료 포함을 선택해 주세요.</p>}
      <div className="blog-actions"><button className="primary" disabled={busy || !materials.stopCount} onClick={() => void copy()}><Copy size={16}/>작성 요청문 복사</button><button className="secondary" disabled={busy || !materials.stopCount} onClick={() => void download()}><Download size={16}/>{materials.photos.length ? '요청문·사진 ZIP' : '요청문 ZIP'}</button></div>
      <details ref={preview} className="blog-preview"><summary>전달할 작성 요청문 미리보기</summary><textarea ref={prompt} readOnly rows={12} aria-label="ChatGPT 작성 요청문" value={materials.prompt}/></details>
      {!!materials.photos.length && <details className="blog-photo-guide"><summary>사진 파일과 장소 확인 · {materials.photos.length}장</summary><ul>{materials.photos.map(photo => <li key={photo.filename}><img src={photo.dataUrl} alt={`${photo.place} 후기 사진`} loading="lazy"/><div><strong>{photo.place}</strong><small>{photo.filename}</small></div></li>)}</ul></details>}
      <ol className="blog-help"><li>작성 요청문을 복사해요.</li><li>ChatGPT 새 대화에 요청문을 붙여넣어요.</li><li>{materials.photos.length ? 'ZIP의 압축을 풀고 photos 폴더의 사진을 직접 첨부해요. 사진이 많으면 하루씩 나누어 요청해 보세요.' : '블로그 초안을 작성해 달라고 요청해요.'}</li></ol>
      <a className="secondary blog-chatgpt-link" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer"><ExternalLink size={15}/>ChatGPT 열기</a>
      <p className="muted">추가 AI API 설정 없이 사용해요. 자료는 이 기기에서 정리하고 복사·다운로드하며, ChatGPT에는 직접 전달해요. 사진은 저장된 압축본이에요.</p>
      <p className="muted">교통편 메모·예약·가계부·계정 정보는 자료에서 제외해요. 후기 글과 사진에 개인정보나 동행인의 기록이 있는지 확인한 뒤 전달해 주세요. ChatGPT가 쓴 글도 사실을 확인한 뒤 게시해 주세요.</p>
    </div>
  </Modal>;
}
