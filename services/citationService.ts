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
  if (trimmed.startsWith('@') && trimmed.includes('{')) return 'text'; // Likely BibTeX
  if (trimmed.length > 10 && !trimmed.includes('http') && !trimmed.includes('www.')) return 'title';
  return 'text';
};

// Simple local BibTeX parser for fallback
export const parseBibTeX = (bibtex: string): Partial<SourceMetadata> => {
  const meta: Partial<SourceMetadata> = {};
  
  try {
    // Extract title
    const titleMatch = bibtex.match(/title\s*=\s*[{"]\s*(.*?)\s*[}"]/i);
    if (titleMatch) meta.title = titleMatch[1];
    
    // Extract author
    const authorMatch = bibtex.match(/author\s*=\s*[{"]\s*(.*?)\s*[}"]/i);
    if (authorMatch) meta.author = authorMatch[1].replace(/\s+and\s+/g, ', ');
    
    // Extract year/date
    const yearMatch = bibtex.match(/year\s*=\s*[{"]\s*(\d+)\s*[}"]/i) || bibtex.match(/year\s*=\s*(\d+)/i);
    if (yearMatch) meta.date = yearMatch[1];
    
    // Extract source (journal/booktitle)
    const sourceMatch = bibtex.match(/(?:journal|booktitle)\s*=\s*[{"]\s*(.*?)\s*[}"]/i);
    if (sourceMatch) meta.source = sourceMatch[1];
    
    // Extract DOI/URL
    const doiMatch = bibtex.match(/doi\s*=\s*[{"]\s*(.*?)\s*[}"]/i);
    if (doiMatch) meta.doi_or_url = doiMatch[1].startsWith('http') ? doiMatch[1] : `https://doi.org/${doiMatch[1]}`;
    
    const urlMatch = bibtex.match(/url\s*=\s*[{"]\s*(.*?)\s*[}"]/i);
    if (urlMatch && !meta.doi_or_url) meta.doi_or_url = urlMatch[1];
  } catch (e) {
    console.warn('Failed to parse BibTeX locally', e);
  }
  
  return meta;
};

export const deriveMetadataFromInput = (input: string): SourceMetadata | null => {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const sourceType = detectSourceType(trimmed);

  if (trimmed.startsWith('@')) {
    const parsed = parseBibTeX(trimmed);
    if (parsed.title) {
      return {
        type: 'text',
        author: parsed.author || 'Unknown',
        date: parsed.date || 'n.d.',
        title: parsed.title,
        source: parsed.source || 'Unknown Source',
        doi_or_url: parsed.doi_or_url || '',
        journal: parsed.journal,
        volume: parsed.volume,
        issue: parsed.issue,
        pages: parsed.pages,
        publisher: parsed.publisher,
        typeOfResource: parsed.typeOfResource
      };
    }
  }

  if (sourceType === 'doi') {
    const doi = extractDOI(trimmed) || trimmed;
    return {
      type: 'doi',
      author: 'Unknown',
      date: 'n.d.',
      title: 'Unknown Title',
      source: 'Unknown Source',
      doi_or_url: doi.startsWith('http') ? doi : `https://doi.org/${doi}`
    };
  }

  if (sourceType === 'url') {
    let hostname = 'Web Source';
    try {
      hostname = new URL(trimmed).hostname;
    } catch {}
    return {
      type: 'url',
      author: 'Unknown',
      date: 'n.d.',
      title: hostname,
      source: hostname,
      doi_or_url: trimmed
    };
  }

  return {
    type: sourceType,
    author: 'Unknown',
    date: 'n.d.',
    title: trimmed,
    source: 'Unknown Source',
    doi_or_url: ''
  };
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
  const { author, date, title, source, doi_or_url, journal, volume, issue, pages } = metadata;

  const normalizeYear = (value: string): string => {
    if (!value || value === 'n.d.') return 'n.d.';
    return value.split('-')[0];
  };

  const cleanTitle = (title || 'Unknown Title').replace(/\.+$/, '');
  const cleanSource = (journal || source || 'Unknown Source').trim();
  const year = normalizeYear(date);
  const doiLike = doi_or_url?.trim() || '';
  const doiValue = doiLike.replace(/^https?:\/\/doi\.org\//i, '').trim();
  const doiUrl = doiLike ? (doiLike.startsWith('http') ? doiLike : `https://doi.org/${doiValue}`) : '';

  const splitAuthors = (input: string): string[] => {
    if (!input || input === 'Unknown') return [];
    const cleaned = input.replace(/\bet al\.?$/i, '').trim();
    if (cleaned.includes(' and ')) return cleaned.split(/\s+and\s+/i).map(a => a.trim()).filter(Boolean);
    if (cleaned.includes(';')) return cleaned.split(';').map(a => a.trim()).filter(Boolean);
    const commaParts = cleaned.split(',').map(a => a.trim()).filter(Boolean);
    if (commaParts.length >= 4 && commaParts.length % 2 === 0) {
      const rebuilt: string[] = [];
      for (let i = 0; i < commaParts.length; i += 2) rebuilt.push(`${commaParts[i + 1]} ${commaParts[i]}`.trim());
      return rebuilt;
    }
    if (commaParts.length === 2 && cleaned.split(' ').length <= 4) return [`${commaParts[1]} ${commaParts[0]}`.trim()];
    if (commaParts.length > 1) return commaParts;
    return [cleaned];
  };

  const formatName = (fullName: string, order: 'last-first' | 'first-last', initials = false): string => {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'Unknown';
    if (parts.length === 1) return parts[0];
    const last = parts[parts.length - 1];
    const givenParts = parts.slice(0, -1);
    const given = initials ? givenParts.map(p => `${p[0].toUpperCase()}.`).join(' ') : givenParts.join(' ');
    return order === 'last-first' ? `${last}, ${given}`.trim() : `${given} ${last}`.trim();
  };

  const formatAuthorsByStyle = (raw: string, citationStyle: CitationStyle): string => {
    if (raw && /\sand\s/i.test(raw) && /,/.test(raw)) {
      return raw.replace(/\s+/g, ' ').trim();
    }
    const authors = splitAuthors(raw);
    if (!authors.length) return 'Unknown Author';
    if (citationStyle === 'APA 7') {
      const formatted = authors.map(a => formatName(a, 'last-first', true));
      if (formatted.length === 1) return formatted[0];
      if (formatted.length <= 20) return `${formatted.slice(0, -1).join(', ')}, & ${formatted[formatted.length - 1]}`;
      return `${formatted.slice(0, 19).join(', ')}, ... ${formatted[formatted.length - 1]}`;
    }
    if (citationStyle === 'MLA 9') {
      const first = formatName(authors[0], 'last-first', false);
      if (authors.length === 1) return first;
      if (authors.length === 2) return `${first}, and ${formatName(authors[1], 'first-last', false)}`;
      return `${first}, et al.`;
    }
    if (citationStyle === 'Chicago' || citationStyle === 'Turabian') {
      const first = formatName(authors[0], 'last-first', false);
      if (authors.length === 1) return first;
      if (authors.length <= 10) {
        const tail = authors.slice(1).map(a => formatName(a, 'first-last', false));
        if (tail.length === 1) return `${first}, and ${tail[0]}`;
        return `${first}, ${tail.slice(0, -1).join(', ')}, and ${tail[tail.length - 1]}`;
      }
      return `${first}, et al.`;
    }
    if (citationStyle === 'IEEE' || citationStyle === 'IEEE Transactions') {
      const formatted = authors.map(a => formatName(a, 'first-last', true));
      if (formatted.length === 1) return formatted[0];
      if (formatted.length <= 6) return `${formatted.slice(0, -1).join(', ')}, and ${formatted[formatted.length - 1]}`;
      return `${formatted[0]} et al.`;
    }
    if (citationStyle === 'Vancouver' || citationStyle === 'AMA' || citationStyle === 'Nature' || citationStyle === 'Science') {
      const formatted = authors.map(a => {
        const parts = a.trim().split(/\s+/).filter(Boolean);
        if (parts.length < 2) return a;
        const last = parts[parts.length - 1];
        const initialsOnly = parts.slice(0, -1).map(p => p[0].toUpperCase()).join('');
        return `${last} ${initialsOnly}`.trim();
      });
      return formatted.join(', ');
    }
    return authors.map(a => formatName(a, 'last-first', false)).join(', ');
  };

  const authors = formatAuthorsByStyle(author, style);
  const authorBase = authors.replace(/\.+$/, '');
  const volIssue = `${volume ? `, vol. ${volume}` : ''}${issue ? `, no. ${issue}` : ''}`;
  const pagesPart = pages ? `, pp. ${pages}` : '';
  const doiPart = doiUrl ? ` ${doiUrl}` : '';

  switch (style) {
    case 'APA 7':
      return `${authors} (${year}). ${cleanTitle}. *${cleanSource}*${volume ? `, ${volume}` : ''}${issue ? `(${issue})` : ''}${pages ? `, ${pages}` : ''}.${doiUrl ? ` ${doiUrl}` : ''}`.trim();
    case 'MLA 9':
      return `${authorBase}. "${cleanTitle}." *${cleanSource}*${volIssue}${year !== 'n.d.' ? `, ${year}` : ''}${pagesPart}.${doiPart}`.replace(/\s+\./g, '.').trim();
    case 'Chicago':
      return `${authorBase}. "${cleanTitle}." *${cleanSource}*${volume ? ` ${volume}` : ''}${issue ? `, no. ${issue}` : ''}${year !== 'n.d.' ? ` (${year})` : ''}${pages ? `: ${pages}` : ''}.${doiPart}`.replace(/\s+\./g, '.').trim();
    case 'Harvard':
      return `${authorBase} (${year}) '${cleanTitle}', *${cleanSource}*${volume ? `, ${volume}` : ''}${issue ? `(${issue})` : ''}${pages ? `, pp. ${pages}` : ''}.${doiUrl ? ` Available at: ${doiUrl}.` : ''}`.trim();
    case 'IEEE':
      return `${authors}, "${cleanTitle}," *${cleanSource}*${volume ? `, vol. ${volume}` : ''}${issue ? `, no. ${issue}` : ''}${pages ? `, pp. ${pages}` : ''}${year !== 'n.d.' ? `, ${year}` : ''}.${doiUrl ? ` [Online]. Available: ${doiUrl}.` : ''}`.trim();
    case 'Vancouver':
      return `${authors}. ${cleanTitle}. ${cleanSource}.${year !== 'n.d.' ? ` ${year}` : ''}${volume ? `;${volume}` : ''}${issue ? `(${issue})` : ''}${pages ? `:${pages}` : ''}.${doiUrl ? ` ${doiUrl}.` : ''}`.trim();
    case 'Turabian':
      return `${authorBase}. "${cleanTitle}." *${cleanSource}*${volume ? ` ${volume}` : ''}${issue ? `, no. ${issue}` : ''}${year !== 'n.d.' ? ` (${year})` : ''}${pages ? `: ${pages}` : ''}.${doiPart}`.replace(/\s+\./g, '.').trim();
    case 'ACS':
    case 'American Chemical Society':
      return `${authors}. ${cleanTitle}. *${cleanSource}* ${year}${volume ? `, ${volume}` : ''}${issue ? ` (${issue})` : ''}${pages ? `, ${pages}` : ''}.${doiUrl ? ` ${doiUrl}.` : ''}`.trim();
    case 'AMA':
      return `${authors}. ${cleanTitle}. ${cleanSource}. ${year}${volume ? `;${volume}` : ''}${issue ? `(${issue})` : ''}${pages ? `:${pages}` : ''}.${doiUrl ? ` doi:${doiValue}.` : ''}`.trim();
    case 'ASA':
      return `${authors} (${year}). ${cleanTitle}. *${cleanSource}*${volume ? ` ${volume}` : ''}${issue ? `(${issue})` : ''}${pages ? `:${pages}` : ''}.${doiUrl ? ` ${doiUrl}.` : ''}`.trim();
    case 'Bluebook':
      return `${authors}, ${cleanTitle}, ${cleanSource}${volume ? ` ${volume}` : ''}${pages ? ` ${pages}` : ''} (${year}).${doiUrl ? ` ${doiUrl}.` : ''}`.trim();
    case 'CSE':
      return `${authors}. ${year}. ${cleanTitle}. ${cleanSource}.${volume ? ` ${volume}` : ''}${issue ? `(${issue})` : ''}${pages ? `:${pages}` : ''}.${doiUrl ? ` ${doiUrl}.` : ''}`.trim();
    case 'ISO 690':
      return `${authors}. ${cleanTitle}. ${cleanSource}${year !== 'n.d.' ? ` [${year}]` : ''}.${doiUrl ? ` Available from: ${doiUrl}.` : ''}`.trim();
    case 'BibTeX':
      return generateBibtexFromMetadata(metadata);
    case 'AIP':
      return `${authors}, "${cleanTitle}," ${cleanSource}${volume ? ` ${volume}` : ''}${issue ? `, ${issue}` : ''}${pages ? `, ${pages}` : ''} (${year}).${doiUrl ? ` ${doiUrl}.` : ''}`.trim();
    case 'Nature':
      return `${authors} ${cleanTitle}. ${cleanSource}${volume ? ` ${volume}` : ''}${pages ? `, ${pages}` : ''} (${year}).${doiUrl ? ` ${doiUrl}` : ''}`.trim();
    case 'Science':
      return `${authors}. ${cleanTitle}. ${cleanSource}${volume ? ` ${volume}` : ''}${pages ? `, ${pages}` : ''} (${year}).${doiUrl ? ` ${doiUrl}` : ''}`.trim();
    case 'IEEE Transactions':
      return `${authors}, "${cleanTitle}," ${cleanSource}${volume ? `, vol. ${volume}` : ''}${issue ? `, no. ${issue}` : ''}${pages ? `, pp. ${pages}` : ''}${year !== 'n.d.' ? `, ${year}` : ''}.${doiUrl ? ` doi: ${doiValue}.` : ''}`.trim();
    default:
      return `${authors}. ${cleanTitle}. ${cleanSource}. ${year}.`;
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

  const splitAuthors = (input: string): string[] => {
    if (!input || input === 'Unknown') return [];
    if (input.includes(' and ')) return input.split(/\s+and\s+/i).map(a => a.trim()).filter(Boolean);
    if (input.includes(';')) return input.split(';').map(a => a.trim()).filter(Boolean);
    const commaParts = input.split(',').map(a => a.trim()).filter(Boolean);
    if (commaParts.length >= 4 && commaParts.length % 2 === 0) {
      const rebuilt: string[] = [];
      for (let i = 0; i < commaParts.length; i += 2) rebuilt.push(`${commaParts[i + 1]} ${commaParts[i]}`.trim());
      return rebuilt;
    }
    if (commaParts.length > 1) return commaParts;
    return [input.trim()];
  };

  const authors = splitAuthors(author);
  const firstAuthor = authors[0]?.split(' ').slice(-1)[0]?.toLowerCase() || 'unknown';
  const year = metadata.date !== 'n.d.' ? metadata.date.split('-')[0] : 'nd';
  const key = `${firstAuthor}${year}`;

  const bibtexAuthor = authors.length ? authors.join(' and ') : 'Unknown';

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
