from pathlib import Path
from pypdf import PdfReader

path = Path('/pdfs/main.pdf')
reader = PdfReader(path)
print(f'### {path.name} PAGES {len(reader.pages)}')
print('METADATA', {k: reader.metadata.get(k) for k in ['/Title', '/Author', '/Subject']})
all_text = []
for index, page in enumerate(reader.pages):
    text = (page.extract_text() or '').strip()
    all_text.append(f'--- PAGE {index + 1} ---\n{text}')
Path('/output/quantx_draft_extract.txt').write_text('\n\n'.join(all_text), encoding='utf-8')
print('Wrote extracted text for main.pdf only.')
