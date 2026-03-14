import { CitationStyle, CustomCitationFormat } from '../utils';

export type SourceType = 'doi' | 'url' | 'title' | 'text';

export interface SourceMetadata {
  type: SourceType;
  author: string;
  date: string;
  title: string;
  source: string;
  doi_or_url: string;
  journal?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  publisher?: string;
  typeOfResource?: string;
}

// Validate DOI format
export const isValidDOI = (input: string): boolean => {
  const doiRegex = /^10\.\d{4,9}\/[-._;()/:A-Z0-9]+$/i;
  const doiUrlRegex = /^https?:\/\/(dx\.)?doi\.org\/10\.\d{4,9}\/[-._;()/:A-Z0-9]+$/i;
  return doiRegex.test(input.trim()) || doiUrlRegex.test(input.trim());
};

// Validate URL format
export const isValidURL = (input: string): boolean => {
  try {
    const url = new URL(input.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

// Extract DOI from various formats
export const extractDOI = (input: string): string | null => {
  const trimmed = input.trim();
  if (isValidDOI(trimmed)) return trimmed;
  const doiUrlMatch = trimmed.match(/(?:https?:\/\/(?:dx\.)?doi\.org\/)?(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/i);
  return doiUrlMatch ? doiUrlMatch[1] : null;
};

// Detect input type
export const detectSourceType = (input: string): SourceType => {
  const trimmed = input.trim();
  if (isValidDOI(trimmed) || extractDOI(trimmed)) return 'doi';
  if (isValidURL(trimmed)) return 'url';
  if (trimmed.length > 10 && !trimmed.includes('http') && !trimmed.includes('www.')) return 'title';
  return 'text';
};

// Fetch metadata from CrossRef API for DOI with timeout and retry
export const fetchCrossRefMetadata = async (doi: string, retries = 2): Promise<SourceMetadata | null> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const cleanDOI = extractDOI(doi) || doi;
      const response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(cleanDOI)}`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Wrytica/1.0 (mailto:support@wrytica.com)'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        return null;
      }

      const data = await response.json();
      const work = data.message;

      const authors = work.author
        ? work.author.map((a: any) => `${a.given || ''} ${a.family || ''}`.trim()).join(', ')
        : 'Unknown';

      let date = 'n.d.';
      if (work.published?.['date-parts']?.[0]) {
        date = work.published['date-parts'][0].join('-');
      } else if (work.created?.['date-parts']?.[0]) {
        date = work.created['date-parts'][0].join('-');
      }

      const source = work['container-title']?.[0] || work.publisher || 'Unknown';
      const doiUrl = `https://doi.org/${cleanDOI}`;

      return {
        type: 'doi',
        author: authors,
        date,
        title: work.title?.[0] || 'Unknown Title',
        source,
        doi_or_url: doiUrl,
        journal: work['container-title']?.[0],
        volume: work.volume,
        issue: work.issue,
        pages: work.page,
        publisher: work.publisher,
        typeOfResource: work.type
      };
    } catch (error) {
      if (attempt < retries && error instanceof Error && error.name !== 'AbortError') {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  clearTimeout(timeoutId);
  return null;
};

// Fetch metadata from OpenGraph/Meta tags for URL with timeout
export const fetchURLMetadata = async (url: string): Promise<SourceMetadata | null> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;

    const response = await fetch(proxyUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const data = await response.json();
    const html = data.contents || '';

    const getMetaContent = (pattern: RegExp): string => {
      const match = html.match(pattern);
      return match ? match[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim() : '';
    };

    const title = getMetaContent(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
                  getMetaContent(/<meta[^>]*name=["']title["'][^>]*content=["']([^"']+)["']/i) ||
                  getMetaContent(/<title[^>]*>([^<]+)<\/title>/i) ||
                  'Unknown Title';

    const author = getMetaContent(/<meta[^>]*name=["']author["'][^>]*content=["']([^"']+)["']/i) ||
                   getMetaContent(/<meta[^>]*property=["']article:author["'][^>]*content=["']([^"']+)["']/i) ||
                   'Unknown';

    const siteName = getMetaContent(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i) || '';

    const dateMatch = html.match(/<meta[^>]*property=["'](?:article:)?published_time["'][^>]*content=["']([^"']+)["']/i);
    const date = dateMatch ? new Date(dateMatch[1]).toISOString().split('T')[0] : 'n.d.';

    return {
      type: 'url',
      author,
      date,
      title,
      source: siteName || new URL(url).hostname,
      doi_or_url: url,
      typeOfResource: 'webpage'
    };
  } catch (error) {
    clearTimeout(timeoutId);
    return null;
  }
};

// Fetch metadata based on input type
export const fetchMetadata = async (input: string): Promise<SourceMetadata | null> => {
  const sourceType = detectSourceType(input);
  const trimmed = input.trim();

  if (sourceType === 'doi') {
    return fetchCrossRefMetadata(trimmed);
  } else if (sourceType === 'url') {
    return fetchURLMetadata(trimmed);
  }

  return null;
};

// Build citation from metadata
export const buildCitationFromMetadata = (metadata: SourceMetadata, style: CitationStyle): string => {
  const { author, date, title, source, doi_or_url, journal, volume, issue, pages, publisher } = metadata;

  const formatAuthor = (auth: string): string => {
    if (!auth || auth === 'Unknown') return 'Unknown Author';
    if (auth.includes(',') && !auth.includes(' and ')) {
      const authors = auth.split(',').map(a => a.trim());
      return authors.map(a => {
        const parts = a.split(' ').filter(p => p);
        if (parts.length >= 2) {
          const last = parts.pop();
          const first = parts.map(p => p[0] + '.').join(' ');
          return `${last}, ${first}`;
        }
        return a;
      }).join(', & ');
    }
    return auth;
  };

  const formatDate = (d: string): string => {
    if (d === 'n.d.' || !d) return 'n.d.';
    return d.split('-')[0];
  };

  const cleanTitle = title.replace(/\.$/, '');

  switch (style) {
    case 'APA 7':
      return `${formatAuthor(author)} (${formatDate(date)}). ${cleanTitle}. ${source}${doi_or_url ? `. ${doi_or_url}` : ''}`;
    case 'MLA 9':
      return `${formatAuthor(author)}. "${cleanTitle}." ${source}${date !== 'n.d.' ? `, ${formatDate(date)}` : ''}${doi_or_url ? `, ${doi_or_url}` : ''}.`;
    case 'Chicago':
      return `${formatAuthor(author)}. "${cleanTitle}." ${source}${date !== 'n.d.' ? ` (${formatDate(date)})` : ''}${doi_or_url ? `. ${doi_or_url}` : ''}.`;
    case 'Harvard':
      return `${formatAuthor(author)} (${formatDate(date)}) '${cleanTitle}', ${source}${doi_or_url ? `. Available at: ${doi_or_url}` : ''}.`;
    case 'IEEE':
      return `${formatAuthor(author)}, "${cleanTitle}," ${source}${date !== 'n.d.' ? `, ${formatDate(date)}` : ''}${doi_or_url ? `, [Online]. Available: ${doi_or_url}` : ''}.`;
    case 'Vancouver':
      return `${formatAuthor(author)}. ${cleanTitle}. ${source}. ${formatDate(date)}${doi_or_url ? `. ${doi_or_url}` : ''}.`;
    case 'Turabian':
      return `${formatAuthor(author)}. "${cleanTitle}." ${source}${date !== 'n.d.' ? ` (${formatDate(date)})` : ''}${doi_or_url ? `. ${doi_or_url}` : ''}.`;
    case 'ACS':
      return `${formatAuthor(author)} ${cleanTitle}. ${source} ${formatDate(date)}${doi_or_url ? `. ${doi_or_url}` : ''}.`;
    case 'AMA':
      return `${formatAuthor(author)}. ${cleanTitle}. ${source}. ${formatDate(date)}${doi_or_url ? `. ${doi_or_url}` : ''}.`;
    case 'ASA':
      return `${formatAuthor(author)} (${formatDate(date)}). ${cleanTitle}. ${source}${doi_or_url ? `. ${doi_or_url}` : ''}.`;
    case 'AIP':
      return `${formatAuthor(author)}, "${cleanTitle}," ${source} ${formatDate(date)}${volume ? `, ${volume}` : ''}${issue ? `(${issue})` : ''}${pages ? `, ${pages}` : ''}.`;
    case 'Nature':
      return `${formatAuthor(author)} ${cleanTitle}. ${source} ${formatDate(date)}${volume ? ` ${volume}` : ''}${pages ? `, ${pages}` : ''}.`;
    case 'Science':
      return `${formatAuthor(author)} ${cleanTitle}. ${source}. ${formatDate(date)}.${doi_or_url ? ` doi:${doi_or_url.replace('https://doi.org/', '')}` : ''}`;
    case 'IEEE Transactions':
      return `${formatAuthor(author)}, "${cleanTitle}," ${source}, vol. ${volume || 'n/a'}, no. ${issue || 'n/a'}, pp. ${pages || 'n/a'}, ${formatDate(date)}.`;
    case 'American Chemical Society':
      return `${formatAuthor(author)}. ${cleanTitle}. ${source}. ${formatDate(date)}${volume ? `, ${volume}` : ''}${issue ? `, ${issue}` : ''}${pages ? `, ${pages}` : ''}.`;
    case 'Bluebook':
      return `${formatAuthor(author)}, ${cleanTitle} (${formatDate(date)})` + 
             (source ? `, ${source}` : '') + 
             (doi_or_url ? `, ${doi_or_url}` : '') + '.';
    case 'CSE':
      return `${formatAuthor(author).replace(/, & /g, ', ')} ${cleanTitle}. ${source}. ${formatDate(date)}.`;
    case 'ISO 690':
      return `${formatAuthor(author)}. ${cleanTitle}. ${source}${date !== 'n.d.' ? ` [${formatDate(date)}]` : ''}${doi_or_url ? `. Available at: ${doi_or_url}` : ''}.`;
    case 'BibTeX':
      // BibTeX format is handled separately in generateBibtexFromMetadata
      return generateBibtexFromMetadata(metadata);
    default:
      return `${formatAuthor(author)} (${formatDate(date)}). ${cleanTitle}. ${source}.`;
  }
};

// Build custom citation from template
export const buildCustomCitation = (metadata: SourceMetadata, template: string): string => {
  const { author, date, title, source, doi_or_url } = metadata;
  
  const formatDateForCustom = (d: string): string => {
    if (d === 'n.d.' || !d) return 'n.d.';
    return d.split('-')[0];
  };

  const formatFullDate = (d: string): string => {
    if (d === 'n.d.' || !d) return 'n.d.';
    const parts = d.split('-');
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    if (parts.length >= 2) {
      const month = parseInt(parts[1], 10);
      if (month >= 1 && month <= 12) {
        return `${months[month - 1]} ${parts[0]}`;
      }
    }
    return parts[0];
  };

  const formatUrlDate = (d: string): string => {
    if (d === 'n.d.' || !d) return '';
    const parts = d.split('-');
    if (parts.length >= 3) {
      return `${parts[0]}/${parts[1]}/${parts[2]}`;
    }
    return d;
  };

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Replace placeholders with actual values
  return template
    .replace(/\{author\}/g, author || 'Unknown Author')
    .replace(/\{date\}/g, formatDateForCustom(date))
    .replace(/\{year\}/g, formatDateForCustom(date))
    .replace(/\{title\}/g, title || 'Unknown Title')
    .replace(/\{source\}/g, source || 'Unknown Source')
    .replace(/\{publisher\}/g, source || 'Unknown Publisher')
    .replace(/\{doi\}/g, doi_or_url || '')
    .replace(/\{url\}/g, doi_or_url || '')
    .replace(/\{journal\}/g, metadata.journal || source || 'Unknown Journal')
    .replace(/\{volume\}/g, metadata.volume || '')
    .replace(/\{issue\}/g, metadata.issue || '')
    .replace(/\{pages\}/g, metadata.pages || '')
    .replace(/\{city\}/g, '')
    .replace(/\{edition\}/g, '')
    .replace(/\{month\}/g, formatFullDate(date))
    .replace(/\{type\}/g, metadata.typeOfResource || '')
    .replace(/\{urlDate\}/g, formatUrlDate(date))
    .replace(/\{accessDate\}/g, today);
};

// Generate BibTeX from metadata
export const generateBibtexFromMetadata = (metadata: SourceMetadata): string => {
  const { author, title, source, doi_or_url, journal, volume, issue, pages, publisher, typeOfResource } = metadata;

  const firstAuthor = author.split(',')[0]?.split(' ')[0]?.toLowerCase() || 'unknown';
  const year = metadata.date !== 'n.d.' ? metadata.date.split('-')[0] : 'nd';
  const key = `${firstAuthor}${year}`;

  const bibtexAuthor = author.replace(/ and /g, ' and ').replace(/,/g, ' and ');

  const entryType = typeOfResource === 'journal-article' || journal ? 'article' :
                    typeOfResource === 'book' ? 'book' : 'misc';

  let bibtex = `@${entryType}{${key},\n`;
  bibtex += `  author = {${bibtexAuthor}},\n`;
  bibtex += `  title = {${title}},\n`;
  bibtex += `  journal = {${journal || source}},\n`;
  bibtex += `  year = {${year}},\n`;

  if (volume) bibtex += `  volume = {${volume}},\n`;
  if (issue) bibtex += `  number = {${issue}},\n`;
  if (pages) bibtex += `  pages = {${pages}},\n`;
  if (publisher) bibtex += `  publisher = {${publisher}},\n`;
  if (doi_or_url) bibtex += `  url = {${doi_or_url}},\n`;

  bibtex += `}`;

  return bibtex;
};