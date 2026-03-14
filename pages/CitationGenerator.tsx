import React, { useState, useEffect, useCallback } from 'react';
import { Quote, BookOpen, Copy, Check, ArrowRight, FileCode, Layers, ExternalLink, ThumbsUp, ThumbsDown, Loader2, AlertCircle, Info, Link2, Hash, FileText, History, Trash2, RotateCcw, Plus, X, List, Grid, Edit3, Save, Settings, Download, ChevronDown, GalleryHorizontal, Search } from 'lucide-react';
import { AIService } from '../services/aiService';
import { CitationStyle, CITATION_STYLES_LIST, copyToClipboard, CitationResponse, generateId, buildContextEnhancement, TimelineEntry, CustomCitationFormat } from '../utils';
import { useAppContext } from '../contexts/AppContext';
import { detectSourceType, fetchMetadata, SourceMetadata, SourceType, buildCitationFromMetadata, generateBibtexFromMetadata, isValidDOI, isValidURL, extractDOI, buildCustomCitation } from '../services/citationService';

export const CitationGenerator: React.FC = () => {
  const { citationState, setCitationState, config, language, guardrails, selectedGuardrailId, recordToolHistory, recordFeedback, getFeedbackHints, saveInputText, getSavedInput, getCitationHistory } = useAppContext();
  const [showHistory, setShowHistory] = useState(false);
  const [citationHistory, setCitationHistory] = useState<TimelineEntry[]>([]);
  const [historySearch, setHistorySearch] = useState('');
  const [historyStyleFilter, setHistoryStyleFilter] = useState<string>('all');
  const guardrail = guardrails.find(g => g.id === selectedGuardrailId) || undefined;
  const [lastHistoryEntryId, setLastHistoryEntryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchingMetadata, setFetchingMetadata] = useState(false);
  const [copiedCitation, setCopiedCitation] = useState(false);
  const [copiedBibtex, setCopiedBibtex] = useState(false);
  const [sourceType, setSourceType] = useState<SourceType>('text');
  const [metadata, setMetadata] = useState<SourceMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validationWarning, setValidationWarning] = useState<string | null>(null);
  
  // Manual edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editedComponents, setEditedComponents] = useState<{
    author: string;
    date: string;
    title: string;
    source: string;
    doi_or_url: string;
  }>({
    author: '',
    date: '',
    title: '',
    source: '',
    doi_or_url: ''
  });
  const [editValidationErrors, setEditValidationErrors] = useState<Record<string, string>>({});
  
  // Batch citation state
  const [batchMode, setBatchMode] = useState(false);
  const [batchSources, setBatchSources] = useState<string[]>(['']);
  const [batchResults, setBatchResults] = useState<CitationResponse[]>([]);
  const [batchProgress, setBatchProgress] = useState(0);
  const [batchErrors, setBatchErrors] = useState<string[]>([]);
  
  // Batch metadata for edit capability
  const [batchMetadata, setBatchMetadata] = useState<(SourceMetadata | null)[]>([]);
  const [batchEditingIndex, setBatchEditingIndex] = useState<number | null>(null);
  const [batchEditedComponents, setBatchEditedComponents] = useState<{
    author: string;
    date: string;
    title: string;
    source: string;
    doi_or_url: string;
  }[]>([]);
  const [batchFetchingMetadata, setBatchFetchingMetadata] = useState(false);
  const [batchValidationErrors, setBatchValidationErrors] = useState<Record<number, Record<string, string>>>({});

  // Custom format state
  const [showCustomFormatPanel, setShowCustomFormatPanel] = useState(false);
  const [customFormats, setCustomFormats] = useState<CustomCitationFormat[]>([]);
  const [newCustomFormatName, setNewCustomFormatName] = useState('');
  const [newCustomFormatTemplate, setNewCustomFormatTemplate] = useState('');
  const [customStylePreview, setCustomStylePreview] = useState<CitationStyle | null>(null);
  const [templateValidationError, setTemplateValidationError] = useState<string | null>(null);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompletePosition, setAutocompletePosition] = useState({ top: 0, left: 0 });
  const [filteredSuggestions, setFilteredSuggestions] = useState<typeof placeholderButtons>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);

  // Available placeholders for quick insert
  const placeholderButtons = [
    { label: '{author}', desc: 'Author' },
    { label: '{date}', desc: 'Year' },
    { label: '{year}', desc: 'Year only' },
    { label: '{title}', desc: 'Title' },
    { label: '{source}', desc: 'Source' },
    { label: '{publisher}', desc: 'Publisher' },
    { label: '{journal}', desc: 'Journal' },
    { label: '{volume}', desc: 'Volume' },
    { label: '{issue}', desc: 'Issue' },
    { label: '{pages}', desc: 'Pages' },
    { label: '{doi}', desc: 'DOI' },
    { label: '{url}', desc: 'URL' },
    { label: '{city}', desc: 'City' },
    { label: '{edition}', desc: 'Edition' },
    { label: '{month}', desc: 'Month' },
    { label: '{accessDate}', desc: 'Accessed' },
  ];

  // All available placeholders for autocomplete
  const allPlaceholders = [
    { label: '{author}', desc: 'Author name(s)' },
    { label: '{date}', desc: 'Full date (Year-Month-Day)' },
    { label: '{year}', desc: 'Year only' },
    { label: '{title}', desc: 'Publication title' },
    { label: '{source}', desc: 'Source/Publisher' },
    { label: '{publisher}', desc: 'Publisher name' },
    { label: '{journal}', desc: 'Journal name' },
    { label: '{volume}', desc: 'Volume number' },
    { label: '{issue}', desc: 'Issue number' },
    { label: '{pages}', desc: 'Page range' },
    { label: '{doi}', desc: 'DOI identifier' },
    { label: '{url}', desc: 'URL link' },
    { label: '{city}', desc: 'Publication city' },
    { label: '{edition}', desc: 'Edition' },
    { label: '{month}', desc: 'Full month name' },
    { label: '{type}', desc: 'Resource type' },
    { label: '{urlDate}', desc: 'URL-friendly date' },
    { label: '{accessDate}', desc: 'Access date' },
  ];

  // Insert placeholder at cursor position in template
  const insertPlaceholder = (placeholder: string) => {
    const textarea = document.getElementById('template-textarea') as HTMLTextAreaElement;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newValue = newCustomFormatTemplate.substring(0, start) + placeholder + newCustomFormatTemplate.substring(end);
      setNewCustomFormatTemplate(newValue);
      // Reset validation error when user modifies template
      if (templateValidationError) setTemplateValidationError(null);
      // Close autocomplete
      setShowAutocomplete(false);
      // Focus back on textarea and set cursor after placeholder
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + placeholder.length, start + placeholder.length);
      }, 0);
    } else {
      setNewCustomFormatTemplate(prev => prev + placeholder);
    }
  };

  // Handle template input change with autocomplete
  const handleTemplateChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart;
    
    setNewCustomFormatTemplate(value);
    if (templateValidationError) setTemplateValidationError(null);
    
    // Check if we're typing a placeholder (starting with "{")
    const textBeforeCursor = value.substring(0, cursorPos);
    const lastOpenBrace = textBeforeCursor.lastIndexOf('{');
    const lastCloseBrace = textBeforeCursor.lastIndexOf('}');
    
    // If there's an opening brace after the last closing brace, we're in a placeholder
    if (lastOpenBrace > lastCloseBrace) {
      const partial = textBeforeCursor.substring(lastOpenBrace + 1).toLowerCase();
      
      // Filter suggestions based on what user has typed
      const filtered = allPlaceholders.filter(p => 
        p.label.toLowerCase().includes(partial) || 
        p.desc.toLowerCase().includes(partial)
      );
      
      if (filtered.length > 0) {
        setFilteredSuggestions(filtered);
        setSelectedSuggestionIndex(0);
        setShowAutocomplete(true);
        
        // Calculate position for dropdown
        // Get textarea position relative to viewport
        const textarea = e.target;
        const textareaRect = textarea.getBoundingClientRect();
        // Estimate line height and position
        const lineHeight = 20;
        const lines = textBeforeCursor.substring(0, cursorPos).split('\n').length;
        const charInLine = cursorPos - textBeforeCursor.lastIndexOf('\n') - 1;
        const top = Math.min((lines) * lineHeight + 60, textareaRect.height - 100);
        const left = Math.min(charInLine * 8, textareaRect.width - 200);
        setAutocompletePosition({ top, left });
      } else {
        setShowAutocomplete(false);
      }
    } else {
      setShowAutocomplete(false);
    }
  };

  // Handle keyboard navigation in autocomplete
  const handleTemplateKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showAutocomplete) return;
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSuggestionIndex(prev => 
        prev < filteredSuggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : prev);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (filteredSuggestions[selectedSuggestionIndex]) {
        e.preventDefault();
        insertPlaceholder(filteredSuggestions[selectedSuggestionIndex].label);
      }
    } else if (e.key === 'Escape') {
      setShowAutocomplete(false);
    } else if (e.key === '}') {
      // Close autocomplete when user closes the placeholder
      setShowAutocomplete(false);
    }
  };

  // Sample templates for gallery
  const sampleTemplates = [
    {
      name: 'APA 7 Standard',
      template: '{author} ({date}). {title}. {source}. {doi}.',
      description: 'American Psychological Association 7th edition'
    },
    {
      name: 'MLA 9 Standard',
      template: '{author}. "{title}." {source}, {date}. {doi}.',
      description: 'Modern Language Association 9th edition'
    },
    {
      name: 'Chicago Author-Date',
      template: '{author}. "{title}." {source} ({date}). {doi}.',
      description: 'Chicago Manual of Style - Author-Date'
    },
    {
      name: 'Harvard Style',
      template: "{author} ({date}) '{title}', {source}. Available at: {url}.",
      description: 'Harvard referencing style'
    },
    {
      name: 'IEEE Style',
      template: '{author}, "{title}," {source}, {date}, [Online]. Available: {url}.',
      description: 'Institute of Electrical and Electronics Engineers'
    },
    {
      name: 'Vancouver Style',
      template: '{author}. {title}. {source}. {date}. {doi}.',
      description: 'Vancouver biomedical style'
    },
    {
      name: 'Simple Author-Date',
      template: '{author} ({date}). {title}. {source}.',
      description: 'Simple author-date format'
    },
    {
      name: 'With Access Date',
      template: '{author} ({date}). {title}. {source}. Accessed {accessDate}.',
      description: 'Includes access date for web sources'
    },
  ];

  // Use a sample template
  const useSampleTemplate = (template: string, name: string) => {
    setNewCustomFormatTemplate(template);
    setNewCustomFormatName(name);
    setTemplateValidationError(null);
  };

  // Load custom formats from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('wrytica_custom_citation_formats');
      if (saved) {
        setCustomFormats(JSON.parse(saved));
      }
    } catch { /* ignore */ }
  }, []);

  // Save custom formats to localStorage
  const saveCustomFormats = (formats: CustomCitationFormat[]) => {
    setCustomFormats(formats);
    localStorage.setItem('wrytica_custom_citation_formats', JSON.stringify(formats));
  };

  // Add new custom format
  const handleAddCustomFormat = () => {
    if (!newCustomFormatName.trim()) {
      setTemplateValidationError('Format name is required');
      return;
    }
    
    const validation = validateTemplate(newCustomFormatTemplate);
    if (!validation.valid) {
      setTemplateValidationError(validation.error || 'Invalid template');
      return;
    }
    
    const newFormat: CustomCitationFormat = {
      id: generateId(),
      name: newCustomFormatName.trim(),
      template: newCustomFormatTemplate.trim(),
      example: '{author} ({date}). {title}. {source}.'
    };
    
    saveCustomFormats([...customFormats, newFormat]);
    setNewCustomFormatName('');
    setNewCustomFormatTemplate('');
    setTemplateValidationError(null);
  };

  // Delete custom format
  const handleDeleteCustomFormat = (id: string) => {
    saveCustomFormats(customFormats.filter(f => f.id !== id));
  };

  // Export custom formats to JSON file
  const handleExportFormats = () => {
    if (customFormats.length === 0) return;
    
    const json = JSON.stringify(customFormats, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wrytica-citation-formats.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Import custom formats from JSON file
  const handleImportFormats = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string);
        if (!Array.isArray(imported)) {
          setTemplateValidationError('Invalid file format: expected an array');
          return;
        }
        
        // Validate each format has required fields
        const validFormats: CustomCitationFormat[] = [];
        for (const format of imported) {
          if (format.name && format.template) {
            const validation = validateTemplate(format.template);
            if (validation.valid) {
              validFormats.push({
                id: format.id || generateId(),
                name: format.name,
                template: format.template,
                example: format.example
              });
            }
          }
        }
        
        if (validFormats.length === 0) {
          setTemplateValidationError('No valid citation formats found in file');
          return;
        }
        
        // Merge with existing (avoid duplicates by name)
        const existingNames = new Set(customFormats.map(f => f.name));
        const newFormats = validFormats.filter(f => !existingNames.has(f.name));
        
        saveCustomFormats([...customFormats, ...newFormats]);
        setTemplateValidationError(null);
      } catch {
        setTemplateValidationError('Failed to parse JSON file');
      }
    };
    reader.readAsText(file);
    // Reset input
    event.target.value = '';
  };

  // Validate custom format template
  const validateTemplate = (template: string): { valid: boolean; error?: string } => {
    if (!template.trim()) {
      return { valid: false, error: 'Template is required' };
    }
    
    const validPlaceholders = [
      '{author}', '{date}', '{year}', '{title}', '{source}', '{publisher}', 
      '{doi}', '{url}', '{journal}', '{volume}', '{issue}', '{pages}',
      '{city}', '{edition}', '{month}', '{type}', '{urlDate}', '{accessDate}'
    ];
    const hasValidPlaceholder = validPlaceholders.some(placeholder => template.includes(placeholder));
    
    if (!hasValidPlaceholder) {
      return { valid: false, error: 'Template must contain at least one valid placeholder (e.g., {author}, {title}, {date})' };
    }
    
    return { valid: true };
  };

  // Check if current style is a custom format
  const isCustomStyle = customFormats.some(f => f.name === style);

  // Get preview for custom template
  const getCustomPreview = (template: string): string => {
    // Use sample data when no metadata is available
    const sampleMetadata: SourceMetadata = metadata || {
      type: 'doi',
      author: 'Smith, J., & Doe, A.',
      date: '2023-06-15',
      title: 'Sample Research Paper Title That Is Quite Long',
      source: 'Journal of Example Studies',
      doi_or_url: 'https://doi.org/10.1234/example',
      journal: 'Journal of Example Studies',
      volume: '42',
      issue: '3',
      pages: '123-145',
      publisher: 'Academic Press',
      typeOfResource: 'journal-article'
    };
    return buildCustomCitation(sampleMetadata, template);
  };

  // Load citation history on mount and after new citations generated
  useEffect(() => {
    setCitationHistory(getCitationHistory());
  }, [citationState.result]);

  // Initialize input from saved state
  const [localSourceInput, setLocalSourceInput] = useState(() => {
    if (citationState.sourceInput) return citationState.sourceInput;
    return getSavedInput('citation');
  });
  // Destructure
  const { result, style } = citationState;

  // Sync edited components when metadata changes or input changes
  useEffect(() => {
    // Reset edit mode when source changes
    setIsEditing(false);
    if (metadata) {
      setEditedComponents({
        author: metadata.author,
        date: metadata.date,
        title: metadata.title,
        source: metadata.source,
        doi_or_url: metadata.doi_or_url
      });
    }
  }, [metadata, localSourceInput]);

  // Handle component field changes
  const handleComponentChange = (field: keyof typeof editedComponents, value: string) => {
    setEditedComponents(prev => ({ ...prev, [field]: value }));
  };

  // Save edits and close editor
  const handleSaveEdits = () => {
    // Validate required fields
    const errors: Record<string, string> = {};
    if (!editedComponents.title.trim()) {
      errors.title = 'Title is required';
    }
    if (!editedComponents.author.trim()) {
      errors.author = 'Author is required';
    }
    
    if (Object.keys(errors).length > 0) {
      setEditValidationErrors(errors);
      return;
    }
    
    setEditValidationErrors({});
    setIsEditing(false);
  };

  // Cancel edits and reset to original metadata
  const handleCancelEdits = () => {
    if (metadata) {
      setEditedComponents({
        author: metadata.author,
        date: metadata.date,
        title: metadata.title,
        source: metadata.source,
        doi_or_url: metadata.doi_or_url
      });
    }
    setEditValidationErrors({});
    setIsEditing(false);
  };

  // Batch edit functions
  const handleBatchEditStart = (index: number) => {
    setBatchEditingIndex(index);
    const meta = batchMetadata[index];
    // Initialize edited components from metadata if not already set
    if (meta && !batchEditedComponents[index]) {
      setBatchEditedComponents(prev => {
        const updated = [...prev];
        updated[index] = {
          author: meta.author,
          date: meta.date,
          title: meta.title,
          source: meta.source,
          doi_or_url: meta.doi_or_url
        };
        return updated;
      });
    }
  };

  const handleBatchEditChange = (index: number, field: keyof typeof editedComponents, value: string) => {
    setBatchEditedComponents(prev => {
      const updated = [...prev];
      if (!updated[index]) {
        updated[index] = { author: '', date: '', title: '', source: '', doi_or_url: '' };
      }
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleBatchEditSave = (index: number) => {
    const edited = batchEditedComponents[index];
    if (!edited) {
      setBatchEditingIndex(null);
      return;
    }
    
    // Validate required fields
    const errors: Record<string, string> = {};
    if (!edited.title.trim()) {
      errors.title = 'Title is required';
    }
    if (!edited.author.trim()) {
      errors.author = 'Author is required';
    }
    
    if (Object.keys(errors).length > 0) {
      // Store validation errors in a separate state for batch
      setBatchValidationErrors(prev => ({ ...prev, [index]: errors }));
      return;
    }
    
    setBatchValidationErrors(prev => {
      const updated = { ...prev };
      delete updated[index];
      return updated;
    });
    setBatchEditingIndex(null);
  };

  const handleBatchEditCancel = (index: number) => {
    setBatchEditingIndex(null);
    // Clear validation errors for this index
    setBatchValidationErrors(prev => {
      const updated = { ...prev };
      delete updated[index];
      return updated;
    });
    // Reset to original metadata values
    const meta = batchMetadata[index];
    setBatchEditedComponents(prev => {
      const updated = [...prev];
      if (meta) {
        updated[index] = {
          author: meta.author,
          date: meta.date,
          title: meta.title,
          source: meta.source,
          doi_or_url: meta.doi_or_url
        };
      } else {
        updated[index] = { author: '', date: '', title: '', source: '', doi_or_url: '' };
      }
      return updated;
    });
  };

  // Fetch metadata for all batch sources (pre-process)
  const fetchBatchMetadata = async () => {
    const validSources = batchSources.filter(s => s.trim());
    if (validSources.length === 0) return;

    setBatchFetchingMetadata(true);
    const metadataResults: (SourceMetadata | null)[] = [];

    for (const source of validSources) {
      const detected = detectSourceType(source);
      if (detected === 'doi' || detected === 'url') {
        try {
          const meta = await fetchMetadata(source);
          metadataResults.push(meta);
        } catch {
          metadataResults.push(null);
        }
      } else {
        metadataResults.push(null);
      }
    }

    setBatchMetadata(metadataResults);
    // Initialize edited components array
    setBatchEditedComponents(validSources.map(() => ({ author: '', date: '', title: '', source: '', doi_or_url: '' })));
    setBatchFetchingMetadata(false);
  };

  // Auto-detect source type when input changes
  useEffect(() => {
    if (localSourceInput.trim()) {
      const detected = detectSourceType(localSourceInput);
      setSourceType(detected);
      
      // Validate and show warnings
      if (detected === 'doi' && !isValidDOI(localSourceInput.trim()) && !extractDOI(localSourceInput)) {
        setValidationWarning('Invalid DOI format. Expected format: 10.xxxx/xxxxx');
      } else if (detected === 'url' && !isValidURL(localSourceInput.trim())) {
        setValidationWarning('Invalid URL format. Please enter a valid URL starting with http:// or https://');
      } else {
        setValidationWarning(null);
      }
    } else {
      setSourceType('text');
      setValidationWarning(null);
    }
  }, [localSourceInput]);

  const setSourceInput = (val: string) => {
    setLocalSourceInput(val);
    saveInputText('citation', val);
    setCitationState(prev => ({ ...prev, sourceInput: val }));
    setMetadata(null);
    setError(null);
  };
  const setStyle = (val: CitationStyle) => setCitationState(prev => ({ ...prev, style: val }));
  const setResult = (val: CitationResponse | null) => setCitationState(prev => ({ ...prev, result: val }));

  // Fetch metadata for DOI/URL inputs
  const fetchSourceMetadata = async () => {
    if (!localSourceInput.trim()) return null;
    
    const detected = detectSourceType(localSourceInput);
    if (detected !== 'doi' && detected !== 'url') return null;
    
    setFetchingMetadata(true);
    try {
      const meta = await fetchMetadata(localSourceInput);
      setMetadata(meta);
      return meta;
    } catch (err) {
      console.error('Metadata fetch error:', err);
      return null;
    } finally {
      setFetchingMetadata(false);
    }
  };

  const handleGenerate = async () => {
    if (!localSourceInput.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);
    
    try {
      // Try to fetch metadata first for DOI/URL
      let sourceMetadata: SourceMetadata | null = null;
      const detected = detectSourceType(localSourceInput);
      
      if (detected === 'doi' || detected === 'url') {
        sourceMetadata = await fetchSourceMetadata();
      }
      
      // Generate citation using LLM (with metadata as context if available)
      const enhancement = buildContextEnhancement(guardrail, getFeedbackHints('citation'));
      
      // If we have metadata, include it in the prompt for better results
      // Use edited components if user modified them, otherwise use fetched metadata
      let promptWithContext = localSourceInput;
      const componentsToUse = isEditing ? editedComponents : (sourceMetadata || null);
      if (componentsToUse) {
        promptWithContext = `Source: ${localSourceInput}\n\nExtracted Metadata:\n- Author: ${componentsToUse.author}\n- Title: ${componentsToUse.title}\n- Source: ${componentsToUse.source}\n- Date: ${componentsToUse.date}\n- DOI/URL: ${componentsToUse.doi_or_url}`;
      }
      
      const data = await AIService.generateCitation(config, promptWithContext, style, language, enhancement);
      
      // If LLM failed but we have metadata, use fallback
      // Use edited components if in edit mode, otherwise use fetched metadata
      const fallbackComponents = isEditing ? editedComponents : (sourceMetadata || null);
      
      // Check if this is a custom format
      const customFormat = customFormats.find(f => f.name === style);
      
      if (customFormat && fallbackComponents) {
        // Use custom template
        data.formatted_citation = buildCustomCitation(fallbackComponents as SourceMetadata, customFormat.template);
        data.bibtex = generateBibtexFromMetadata(fallbackComponents as SourceMetadata);
        data.components = {
          author: fallbackComponents.author,
          date: fallbackComponents.date,
          title: fallbackComponents.title,
          source: fallbackComponents.source,
          doi_or_url: fallbackComponents.doi_or_url
        };
      } else if (!data.formatted_citation && fallbackComponents) {
        data.formatted_citation = buildCitationFromMetadata(fallbackComponents as SourceMetadata, style);
        data.bibtex = generateBibtexFromMetadata(fallbackComponents as SourceMetadata);
        data.components = {
          author: fallbackComponents.author,
          date: fallbackComponents.date,
          title: fallbackComponents.title,
          source: fallbackComponents.source,
          doi_or_url: fallbackComponents.doi_or_url
        };
      }
      
      setResult(data);
      const entryId = generateId();
      recordToolHistory({
        id: entryId,
        tool: 'citation',
        input: localSourceInput,
        output: data.formatted_citation,
        timestamp: Date.now(),
        guardrailId: guardrail?.id,
        metadata: { style, sourceType: detected, hasMetadata: !!sourceMetadata }
      });
      setLastHistoryEntryId(entryId);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate citation';
      setError(errorMessage);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCitation = () => {
    if (!result?.formatted_citation) return;
    copyToClipboard(result.formatted_citation);
    setCopiedCitation(true);
    setTimeout(() => setCopiedCitation(false), 2000);
  };

  const handleCopyBibtex = () => {
    if (!result?.bibtex) return;
    copyToClipboard(result.bibtex);
    setCopiedBibtex(true);
    setTimeout(() => setCopiedBibtex(false), 2000);
  };

  const handleFeedback = (rating: number) => {
    if (!lastHistoryEntryId) return;
    const note = rating > 0 ? 'Citation looked accurate' : 'Citation needs review';
    recordFeedback('citation', rating, note, lastHistoryEntryId);
  };

  // Batch citation functions
  const addBatchSource = () => {
    setBatchSources([...batchSources, '']);
  };

  const removeBatchSource = (index: number) => {
    if (batchSources.length <= 1) return;
    const newSources = batchSources.filter((_, i) => i !== index);
    setBatchSources(newSources);
  };

  const updateBatchSource = (index: number, value: string) => {
    const newSources = [...batchSources];
    newSources[index] = value;
    setBatchSources(newSources);
  };

  const handleBatchGenerate = async () => {
    const validSources = batchSources.filter(s => s.trim());
    if (validSources.length === 0) return;

    setLoading(true);
    setBatchResults([]);
    setBatchErrors([]);
    setBatchProgress(0);

    const results: CitationResponse[] = [];
    const errors: string[] = [];

    // First, fetch metadata for all sources if not already done
    let currentMetadata = batchMetadata;
    if (currentMetadata.length === 0) {
      setBatchFetchingMetadata(true);
      currentMetadata = [];
      for (const source of validSources) {
        const detected = detectSourceType(source);
        if (detected === 'doi' || detected === 'url') {
          try {
            const meta = await fetchMetadata(source);
            currentMetadata.push(meta);
          } catch {
            currentMetadata.push(null);
          }
        } else {
          currentMetadata.push(null);
        }
      }
      setBatchMetadata(currentMetadata);
      setBatchFetchingMetadata(false);
    }

    for (let i = 0; i < validSources.length; i++) {
      const source = validSources[i];
      try {
        const detected = detectSourceType(source);
        
        // Use edited components if available, otherwise use fetched metadata
        const editedComponentsForSource = batchEditedComponents[i];
        // Check if edits exist (array element is defined), not just non-empty values
        const hasEdits = batchEditedComponents[i] !== undefined;
        
        const sourceMetadata = currentMetadata[i];
        const componentsToUse = hasEdits ? editedComponentsForSource : (sourceMetadata || null);

        const enhancement = buildContextEnhancement(guardrail, getFeedbackHints('citation'));
        let promptWithContext = source;
        if (componentsToUse) {
          promptWithContext = `Source: ${source}\n\nExtracted Metadata:\n- Author: ${componentsToUse.author}\n- Title: ${componentsToUse.title}\n- Source: ${componentsToUse.source}\n- Date: ${componentsToUse.date}\n- DOI/URL: ${componentsToUse.doi_or_url}`;
        }

        let data = await AIService.generateCitation(config, promptWithContext, style, language, enhancement);

        if (!data.formatted_citation && componentsToUse) {
          data.formatted_citation = buildCitationFromMetadata(componentsToUse as SourceMetadata, style);
          data.bibtex = generateBibtexFromMetadata(componentsToUse as SourceMetadata);
          data.components = {
            author: componentsToUse.author,
            date: componentsToUse.date,
            title: componentsToUse.title,
            source: componentsToUse.source,
            doi_or_url: componentsToUse.doi_or_url
          };
        }

        results.push(data);
        recordToolHistory({
          id: generateId(),
          tool: 'citation',
          input: source,
          output: data.formatted_citation,
          timestamp: Date.now(),
          guardrailId: guardrail?.id,
          metadata: { style, sourceType: detected, hasMetadata: !!sourceMetadata, hasEdits: !!hasEdits, batch: true }
        });
      } catch (err) {
        errors.push(`Source ${i + 1}: ${err instanceof Error ? err.message : 'Failed'}`);
        results.push({
          formatted_citation: '',
          bibtex: '',
          components: { author: '', date: '', title: '', source: '', doi_or_url: '' }
        });
      }

      setBatchProgress(Math.round(((i + 1) / validSources.length) * 100));
    }

    setBatchResults(results);
    setBatchErrors(errors);
    setLoading(false);
  };

  const handleCopyAllCitations = () => {
    const allCitations = batchResults
      .map(r => r.formatted_citation)
      .filter(c => c)
      .join('\n\n');
    copyToClipboard(allCitations);
    setCopiedCitation(true);
    setTimeout(() => setCopiedCitation(false), 2000);
  };

  const handleCopyAllBibtex = () => {
    const allBibtex = batchResults
      .map(r => r.bibtex)
      .filter(b => b)
      .join('\n\n');
    copyToClipboard(allBibtex);
    setCopiedBibtex(true);
    setTimeout(() => setCopiedBibtex(false), 2000);
  };

  // Helper to get source type icon and label
  const getSourceTypeInfo = () => {
    switch (sourceType) {
      case 'doi':
        return { icon: Hash, label: 'DOI', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20' };
      case 'url':
        return { icon: Link2, label: 'URL', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20' };
      case 'title':
        return { icon: FileText, label: 'Title', color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/20' };
      default:
        return { icon: FileText, label: 'Text', color: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-50 dark:bg-slate-800/50' };
    }
  };

  const sourceTypeInfo = getSourceTypeInfo();
  const SourceTypeIcon = sourceTypeInfo.icon;

  // Handle loading a citation from history
  const handleLoadFromHistory = (entry: TimelineEntry) => {
    setSourceInput(entry.input);
    // Parse the style from metadata if available
    const meta = entry.metadata as { style?: CitationStyle };
    if (meta?.style) {
      setStyle(meta.style);
    }
    setShowHistory(false);
  };

  // Format timestamp
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Get style from metadata
  const getStyleFromMeta = (entry: TimelineEntry): string => {
    const meta = entry.metadata as { style?: string };
    return meta?.style || 'APA 7';
  };

  // Filter history based on search and style filter
  const filteredHistory = citationHistory.filter(entry => {
    const matchesSearch = historySearch.trim() === '' ||
      entry.input.toLowerCase().includes(historySearch.toLowerCase()) ||
      entry.output.toLowerCase().includes(historySearch.toLowerCase());
    const matchesStyle = historyStyleFilter === 'all' || getStyleFromMeta(entry) === historyStyleFilter;
    return matchesSearch && matchesStyle;
  });

  // Get unique styles from history for filter dropdown
  const historyStyles = [...new Set(citationHistory.map(entry => getStyleFromMeta(entry)))];

  // Keyboard shortcuts handler - use empty deps to read current values at call time
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Enter or Cmd+Enter to generate citation
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        // Call handlers directly - they have their own state checks
        if (!loading) {
          if (batchMode) {
            handleBatchGenerate();
          } else if (localSourceInput.trim()) {
            handleGenerate();
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []); // Empty deps - reads current values at call time

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-10">
      <div className="text-center space-y-2">
         <div className="flex items-center justify-center gap-3">
           <h2 className="text-3xl font-bold text-slate-800 dark:text-white">Scientific Citation Generator</h2>
           <button
             onClick={() => {
               if (batchMode) {
                 setBatchResults([]);
                 setBatchSources(['']);
                 setBatchMetadata([]);
                 setBatchEditedComponents([]);
                 setBatchValidationErrors({});
               }
               setBatchMode(!batchMode);
             }}
             className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
               batchMode 
                 ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300' 
                 : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
             }`}
           >
             {batchMode ? <List size={14} /> : <Grid size={14} />}
             <span>{batchMode ? 'Single' : 'Batch'}</span>
           </button>
           {citationHistory.length > 0 && (
             <button
               onClick={() => setShowHistory(!showHistory)}
               className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                 showHistory 
                   ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300' 
                   : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
               }`}
             >
               <History size={14} />
               <span>History ({citationHistory.length})</span>
             </button>
           )}
         </div>
         <p className="text-slate-500 dark:text-slate-400">Instantly generate verifiable citations and BibTeX from URLs, DOIs, titles, or text.</p>
      </div>

      {/* Citation History Panel */}
      {showHistory && citationHistory.length > 0 && (
        <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-sm border border-slate-200 dark:border-dark-border overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-700">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <History size={16} className="text-slate-500" />
                <span className="font-medium text-slate-700 dark:text-slate-300">Citation History</span>
              </div>
              <span className="text-xs text-slate-400">{filteredHistory.length} of {citationHistory.length} saved</span>
            </div>
            {/* Search and Filter Controls */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Search citations..."
                  className="w-full pl-8 pr-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-slate-800 dark:text-slate-200"
                />
                <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                {historySearch && (
                  <button
                    onClick={() => setHistorySearch('')}
                    className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <select
                value={historyStyleFilter}
                onChange={(e) => setHistoryStyleFilter(e.target.value)}
                className="px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-slate-800 dark:text-slate-200"
              >
                <option value="all">All Styles</option>
                {historyStyles.map((style) => (
                  <option key={style} value={style}>{style}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {filteredHistory.length === 0 ? (
              <div className="p-4 text-center text-slate-400 dark:text-slate-500">
                {historySearch || historyStyleFilter !== 'all' 
                  ? 'No citations match your search or filter.' 
                  : 'No citations in history yet.'}
              </div>
            ) : (
              filteredHistory.map((entry, index) => (
                <div 
                  key={entry.id} 
                  className={`p-4 border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${index === 0 ? 'bg-primary-50/50 dark:bg-primary-900/10' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-primary-600 dark:text-primary-400 px-2 py-0.5 bg-primary-50 dark:bg-primary-900/20 rounded">
                          {getStyleFromMeta(entry)}
                        </span>
                        <span className="text-xs text-slate-400">{formatTime(entry.timestamp)}</span>
                      </div>
                      <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-2 font-mono">
                        {entry.output}
                      </p>
                      <p className="text-xs text-slate-400 mt-1 truncate">
                        Source: {entry.input.slice(0, 60)}{entry.input.length > 60 ? '...' : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleLoadFromHistory(entry)}
                        title="Reload this source"
                        className="p-1.5 rounded-md text-slate-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
                      >
                        <RotateCcw size={14} />
                      </button>
                      <button
                        onClick={() => copyToClipboard(entry.output)}
                        title="Copy citation"
                        className="p-1.5 rounded-md text-slate-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Batch Mode UI */}
      {batchMode && (
        <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-dark-border">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Grid size={18} className="text-primary-500" />
              <span className="text-sm font-bold uppercase text-slate-500">Batch Citation ({batchSources.length} sources)</span>
            </div>
            <button
              onClick={addBatchSource}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary-50 text-primary-600 dark:bg-primary-900/20 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors"
            >
              <Plus size={14} />
              Add Source
            </button>
          </div>

          <div className="space-y-3 mb-6">
            {batchSources.map((source, index) => (
              <div key={index} className="flex items-center gap-2">
                <div className="flex-1">
                  <input
                    type="text"
                    value={source}
                    onChange={(e) => updateBatchSource(index, e.target.value)}
                    aria-label={`Source ${index + 1} input`}
                    placeholder={`Source ${index + 1}: URL, DOI, or title...`}
                    className="w-full p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-sm font-mono text-slate-800 dark:text-slate-200"
                  />
                </div>
                {batchSources.length > 1 && (
                  <button
                    onClick={() => removeBatchSource(index)}
                    className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="space-y-2 w-full md:w-auto">
               <label className="text-xs font-bold text-slate-500 uppercase">Citation Style</label>
               <div className="flex flex-wrap gap-2">
                 {CITATION_STYLES_LIST.slice(0, 10).map((s) => (
                   <button
                     key={s}
                     onClick={() => setStyle(s)}
                     className={`px-4 py-2 text-sm font-medium rounded-lg border transition-all 
                       ${style === s 
                         ? 'bg-primary-50 border-primary-500 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300' 
                         : 'bg-white border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 hover:border-primary-300'
                       }`}
                   >
                     {s}
                   </button>
                 ))}
                 {customFormats.slice(0, 2).map((f) => (
                   <button
                     key={f.id}
                     onClick={() => setStyle(f.name as CitationStyle)}
                     className={`px-4 py-2 text-sm font-medium rounded-lg border transition-all 
                       ${style === f.name 
                         ? 'bg-amber-50 border-amber-500 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300' 
                         : 'bg-white border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 hover:border-amber-300'
                       }`}
                   >
                     {f.name}
                   </button>
                 ))}
                 <button
                   onClick={() => setShowCustomFormatPanel(true)}
                   className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-amber-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                 >
                   <Settings size={14} />
                   {customFormats.length > 0 ? `+${customFormats.length}` : 'Custom'}
                 </button>
               </div>
            </div>

            <button
               onClick={handleBatchGenerate}
               disabled={loading || !batchSources.some(s => s.trim())}
               className="w-full md:w-auto px-8 py-3 bg-primary-600 text-white rounded-xl font-bold hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2 shadow-lg shadow-primary-500/20"
               title="Generate all citations (Ctrl+Enter)"
            >
               {loading ? (
                 <>
                   <Loader2 size={18} className="animate-spin" />
                   <span>Processing {batchProgress}%</span>
                 </>
               ) : (
                 <>
                   <span>Generate All ({batchSources.filter(s => s.trim()).length})</span>
                   <ArrowRight size={18} />
                 </>
               )}
            </button>
          </div>              {/* Progress Bar */}
          {loading && (
            <div className="mt-4">
              <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary-500 transition-all duration-300"
                  style={{ width: `${batchProgress}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-1 text-center">{batchProgress}% complete</p>
            </div>
          )}

          {/* Pre-fetch Metadata Button */}
          {!loading && batchResults.length === 0 && batchSources.some(s => s.trim()) && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={fetchBatchMetadata}
                disabled={batchFetchingMetadata}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors disabled:opacity-50"
              >
                {batchFetchingMetadata ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Info size={14} className="text-emerald-500" />
                )}
                <span>{batchFetchingMetadata ? 'Fetching metadata...' : 'Pre-fetch Metadata for Edit'}</span>
              </button>
            </div>
          )}

          {/* Batch Results */}
          {batchResults.length > 0 && (
            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Results ({batchResults.filter(r => r.formatted_citation).length}/{batchResults.length})
                </span>
                <div className="flex gap-2">
                  {batchEditedComponents.some(e => e && (e.author || e.title || e.source || e.date || e.doi_or_url)) && (
                    <button
                      onClick={handleBatchGenerate}
                      disabled={loading}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50 transition-colors"
                    >
                      {loading ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                      {loading ? 'Regenerating...' : 'Regenerate with Edits'}
                    </button>
                  )}
                  <button
                    onClick={handleCopyAllCitations}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-primary-500 hover:text-primary-600 transition-colors"
                  >
                    {copiedCitation ? <Check size={12} /> : <Copy size={12} />}
                    {copiedCitation ? 'Copied All' : 'Copy All Citations'}
                  </button>
                  <button
                    onClick={handleCopyAllBibtex}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-primary-500 hover:text-primary-600 transition-colors"
                  >
                    {copiedBibtex ? <Check size={12} /> : <FileCode size={12} />}
                    {copiedBibtex ? 'Copied' : 'Copy All BibTeX'}
                  </button>
                </div>
              </div>

              {/* Errors */}
              {batchErrors.length > 0 && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-xs font-medium text-red-700 dark:text-red-300 mb-2">Errors:</p>
                  <ul className="text-xs text-red-600 dark:text-red-400 space-y-1">
                    {batchErrors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Results List with Edit Capability */}
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {batchResults.map((result, index) => {
                  const meta = batchMetadata[index];
                  const isEditingThis = batchEditingIndex === index;
                  const edited = batchEditedComponents[index];
                  const hasEdits = edited && (edited.author || edited.title || edited.source || edited.date || edited.doi_or_url);
                  const validationErrors = batchValidationErrors[index];
                  
                  return result.formatted_citation ? (
                    <div key={index} className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                      {isEditingThis ? (
                        // Edit mode for this result
                        <div className="space-y-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                              Edit Source {index + 1}
                            </span>
                            <div className="flex gap-1">
                              <button
                                onClick={() => handleBatchEditCancel(index)}
                                className="px-2 py-1 text-xs rounded border border-slate-300 text-slate-600 hover:bg-slate-200 dark:border-slate-600 dark:text-slate-400"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleBatchEditSave(index)}
                                className="px-2 py-1 text-xs rounded bg-amber-600 text-white hover:bg-amber-700"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <input
                                type="text"
                                value={edited?.author || ''}
                                onChange={(e) => {
                                  handleBatchEditChange(index, 'author', e.target.value);
                                  if (validationErrors?.author) {
                                    setBatchValidationErrors(prev => {
                                      const updated = { ...prev };
                                      if (updated[index]) updated[index] = { ...updated[index], author: '' };
                                      return updated;
                                    });
                                  }
                                }}
                                aria-label={`Author for source ${index + 1}`}
                                aria-invalid={!!validationErrors?.author}
                                placeholder="Author"
                                className={`p-2 text-xs bg-white dark:bg-slate-900 border rounded ${validationErrors?.author ? 'border-red-500 dark:border-red-500' : 'border-amber-300 dark:border-amber-700'}`}
                              />
                              {validationErrors?.author && <p className="text-xs text-red-500 mt-1">{validationErrors.author}</p>}
                            </div>
                            <div>
                              <input
                                type="text"
                                value={edited?.date || ''}
                                onChange={(e) => handleBatchEditChange(index, 'date', e.target.value)}
                                aria-label={`Date for source ${index + 1}`}
                                placeholder="Date"
                                className="p-2 text-xs bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded"
                              />
                            </div>
                            <div className="col-span-2">
                              <input
                                type="text"
                                value={edited?.title || ''}
                                onChange={(e) => {
                                  handleBatchEditChange(index, 'title', e.target.value);
                                  if (validationErrors?.title) {
                                    setBatchValidationErrors(prev => {
                                      const updated = { ...prev };
                                      if (updated[index]) updated[index] = { ...updated[index], title: '' };
                                      return updated;
                                    });
                                  }
                                }}
                                aria-label={`Title for source ${index + 1}`}
                                aria-invalid={!!validationErrors?.title}
                                placeholder="Title"
                                className={`p-2 text-xs bg-white dark:bg-slate-900 border rounded w-full ${validationErrors?.title ? 'border-red-500 dark:border-red-500' : 'border-amber-300 dark:border-amber-700'}`}
                              />
                              {validationErrors?.title && <p className="text-xs text-red-500 mt-1">{validationErrors.title}</p>}
                            </div>
                            <input
                              type="text"
                              value={edited?.source || ''}
                              onChange={(e) => handleBatchEditChange(index, 'source', e.target.value)}
                              aria-label={`Source for source ${index + 1}`}
                              placeholder="Source/Publisher"
                              className="p-2 text-xs bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded"
                            />
                            <input
                              type="text"
                              value={edited?.doi_or_url || ''}
                              onChange={(e) => handleBatchEditChange(index, 'doi_or_url', e.target.value)}
                              aria-label={`DOI or URL for source ${index + 1}`}
                              placeholder="DOI/URL"
                              className="p-2 text-xs bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded"
                            />
                          </div>
                        </div>
                      ) : (
                        // Display mode
                        <>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-primary-600 dark:text-primary-400">
                                {batchSources[index]?.slice(0, 40)}{batchSources[index]?.length > 40 ? '...' : ''}
                              </span>
                              {hasEdits && (
                                <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded">Edited</span>
                              )}
                            </div>
                            <div className="flex gap-1">
                              {meta && (
                                <button
                                  onClick={() => handleBatchEditStart(index)}
                                  className="p-1 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                                  title="Edit components"
                                >
                                  <Edit3 size={12} />
                                </button>
                              )}
                              <button
                                onClick={() => copyToClipboard(result.formatted_citation)}
                                className="p-1 rounded text-slate-400 hover:text-green-600 transition-colors"
                              >
                                <Copy size={12} />
                              </button>
                            </div>
                          </div>
                          <p className="text-sm text-slate-700 dark:text-slate-300 font-mono line-clamp-2">
                            {result.formatted_citation}
                          </p>
                        </>
                      )}
                    </div>
                  ) : null;
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Custom Format Panel */}
      {showCustomFormatPanel && (
        <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl shadow-sm border border-amber-200 dark:border-amber-800 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Settings size={18} className="text-amber-500" />
              <span className="text-sm font-bold uppercase text-amber-600 dark:text-amber-400">Custom Citation Formats</span>
            </div>
            <button
              onClick={() => setShowCustomFormatPanel(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <X size={18} />
            </button>
          </div>

          {/* Sample Template Gallery */}
          <div className="mb-6">
            <details className="group">
              <summary className="flex items-center justify-between cursor-pointer p-3 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-amber-400 transition-colors">
                <div className="flex items-center gap-2">
                  <GalleryHorizontal size={16} className="text-amber-500" />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Sample Template Gallery</span>
                </div>
                <ChevronDown size={16} className="text-slate-400 group-open:rotate-180 transition-transform" />
              </summary>
              <div className="mt-2 p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 max-h-64 overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {sampleTemplates.map((sample, index) => (
                    <button
                      key={index}
                      onClick={() => useSampleTemplate(sample.template, sample.name)}
                      className="text-left p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all group"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-amber-700 dark:group-hover:text-amber-400">{sample.name}</span>
                        <ArrowRight size={12} className="text-slate-400 group-hover:text-amber-500" />
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{sample.description}</p>
                      <p className="text-xs font-mono text-slate-400 dark:text-slate-500 mt-1 truncate">{sample.template}</p>
                    </button>
                  ))}
                </div>
              </div>
            </details>
          </div>

          {/* Create new format */}
          <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
            <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase mb-3">Create New Format</h4>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Format Name</label>
                <input
                  type="text"
                  value={newCustomFormatName}
                  onChange={(e) => {
                    setNewCustomFormatName(e.target.value);
                    if (templateValidationError) setTemplateValidationError(null);
                  }}
                  placeholder="e.g., My Company Style"
                  className={`w-full p-2 text-sm bg-white dark:bg-slate-900 border rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none ${templateValidationError && !newCustomFormatName.trim() ? 'border-red-500 dark:border-red-500' : 'border-slate-200 dark:border-slate-700'}`}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Template</label>
                
                {/* Quick Insert Toolbar */}
                <div className="flex flex-wrap gap-1 mb-2 p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
                  <span className="text-xs text-slate-500 dark:text-slate-400 mr-1 self-center">Insert:</span>
                  {placeholderButtons.map((btn) => (
                    <button
                      key={btn.label}
                      type="button"
                      onClick={() => insertPlaceholder(btn.label)}
                      className="px-2 py-1 text-xs font-mono rounded bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-amber-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                      title={btn.desc}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>

                <div className="relative">
                  <textarea
                    id="template-textarea"
                    value={newCustomFormatTemplate}
                    onChange={handleTemplateChange}
                    onKeyDown={handleTemplateKeyDown}
                    placeholder="{author} ({date}). {title}. {source}."
                    rows={2}
                    className={`w-full p-2 text-sm bg-white dark:bg-slate-900 border rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none font-mono ${templateValidationError ? 'border-red-500 dark:border-red-500' : 'border-slate-200 dark:border-slate-700'}`}
                  />
                  {/* Autocomplete Dropdown */}
                  {showAutocomplete && filteredSuggestions.length > 0 && (
                    <div 
                      className="absolute z-50 w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden"
                      style={{ top: `${autocompletePosition.top}px`, left: `${autocompletePosition.left}px` }}
                    >
                      {filteredSuggestions.map((suggestion, index) => (
                        <button
                          key={suggestion.label}
                          type="button"
                          onClick={() => insertPlaceholder(suggestion.label)}
                          className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors ${
                            index === selectedSuggestionIndex 
                              ? 'bg-amber-50 dark:bg-amber-900/20' 
                              : ''
                          }`}
                        >
                          <span className="font-mono text-sm text-slate-700 dark:text-slate-300">{suggestion.label}</span>
                          <span className="text-xs text-slate-400 dark:text-slate-500">{suggestion.desc}</span>
                        </button>
                      ))}
                      <div className="px-3 py-1 bg-slate-50 dark:bg-slate-900 text-xs text-slate-400 border-t border-slate-200 dark:border-slate-700">
                        ↑↓ Navigate • Enter to insert • Esc to close
                      </div>
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Or type manually: {'{author}'}, {'{date}'}, {'{year}'}, {'{title}'}, {'{source}'}, {'{publisher}'}, {'{doi}'}, {'{url}'}, {'{journal}'}, {'{volume}'}, {'{issue}'}, {'{pages}'}, {'{city}'}, {'{edition}'}, {'{month}'}, {'{type}'}, {'{urlDate}'}, {'{accessDate}'}
                </p>
                {templateValidationError && (
                  <p className="text-xs text-red-500 dark:text-red-400 mt-1 flex items-center gap-1">
                    <AlertCircle size={12} />
                    {templateValidationError}
                  </p>
                )}
              </div>
              <button
                onClick={handleAddCustomFormat}
                disabled={!newCustomFormatName.trim() || !validateTemplate(newCustomFormatTemplate).valid}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Create Format
              </button>
            </div>
          </div>

          {/* Existing custom formats */}
          {customFormats.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Saved Formats</h4>
                <div className="flex gap-2">
                  <label className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 cursor-pointer transition-colors">
                    <FileText size={12} />
                    Import
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleImportFormats}
                      className="hidden"
                      aria-label="Import citation formats"
                    />
                  </label>
                  <button
                    onClick={handleExportFormats}
                    className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                  >
                    <Download size={12} />
                    Export
                  </button>
                </div>
              </div>
              {customFormats.map((format) => (
                <div key={format.id} className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{format.name}</span>
                      {style === format.name && (
                        <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded">Active</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">{format.template}</p>
                    <p className={`text-xs mt-1 ${metadata ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      {metadata ? 'Preview: ' : 'Sample Preview: '}{getCustomPreview(format.template).slice(0, 80)}{getCustomPreview(format.template).length > 80 ? '...' : ''}
                    </p>
                  </div>
                  <div className="flex gap-1 ml-2 shrink-0">
                    <button
                      onClick={() => setStyle(format.name as CitationStyle)}
                      className="px-2 py-1 text-xs rounded bg-primary-100 text-primary-600 hover:bg-primary-200 dark:bg-primary-900/30 dark:text-primary-400"
                    >
                      Use
                    </button>
                    <button
                      onClick={() => handleDeleteCustomFormat(format.id)}
                      className="p-1 rounded text-slate-400 hover:text-red-500"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {customFormats.length === 0 && (
            <div className="text-center py-4 text-slate-400 dark:text-slate-500">
              <p className="text-sm">No custom formats yet. Create one above!</p>
            </div>
          )}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="flex items-start space-x-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl animate-in fade-in slide-in-from-top-2">
          <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-700 dark:text-red-300">Generation Failed</p>
            <p className="text-sm text-red-600 dark:text-red-400 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Single Mode Input */}
      {!batchMode && (
      <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-dark-border">
         <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
               <BookOpen size={18} className="text-primary-500" />
               <span className="text-sm font-bold uppercase text-slate-500">Source Information</span>
            </div>
            {/* Source Type Indicator */}
            {localSourceInput.trim() && (
              <div className={`flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-medium ${sourceTypeInfo.bg} ${sourceTypeInfo.color}`}>
                <SourceTypeIcon size={14} />
                <span>{sourceTypeInfo.label}</span>
                {fetchingMetadata && <Loader2 size={12} className="animate-spin ml-1" />}
              </div>
            )}
         </div>
         
         {/* Validation Warning */}
         {validationWarning && (
           <div className="flex items-center space-x-2 mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
             <AlertCircle size={16} className="text-amber-500 shrink-0" />
             <span className="text-sm text-amber-700 dark:text-amber-300">{validationWarning}</span>
           </div>
         )}

         {/* Fetched Metadata Display / Edit Mode */}
         {(metadata || isEditing) && !loading && !batchMode && (
           isEditing ? (
             <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg animate-in fade-in slide-in-from-bottom-2">
               <div className="flex items-center justify-between mb-3">
                 <div className="flex items-center space-x-2">
                   <Edit3 size={16} className="text-amber-600" />
                   <span className="text-sm font-medium text-amber-700 dark:text-amber-300">Edit Citation Components</span>
                 </div>
                 <div className="flex gap-2">
                   <button
                     onClick={handleCancelEdits}
                     className="flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-900/30 transition-colors"
                   >
                     <X size={12} />
                     Cancel
                   </button>
                   <button
                     onClick={handleSaveEdits}
                     className="flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors"
                   >
                     <Save size={12} />
                     Save Changes
                   </button>
                 </div>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                 <div>
                   <label className="block text-xs font-semibold text-amber-800 dark:text-amber-200 mb-1">Author {editValidationErrors.author && <span className="text-red-500">*</span>}</label>
                   <input
                     type="text"
                     value={editedComponents.author}
                     onChange={(e) => {
                       handleComponentChange('author', e.target.value);
                       if (editValidationErrors.author) setEditValidationErrors(prev => ({ ...prev, author: '' }));
                     }}
                     aria-label="Author name for citation"
                     aria-invalid={!!editValidationErrors.author}
                     className={`w-full p-2 text-sm bg-white dark:bg-slate-800 border rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none text-slate-800 dark:text-slate-200 ${editValidationErrors.author ? 'border-red-500 dark:border-red-500' : 'border-amber-300 dark:border-amber-700'}`}
                     placeholder="e.g., Smith, J., & Doe, A."
                   />
                   {editValidationErrors.author && <p className="text-xs text-red-500 mt-1">{editValidationErrors.author}</p>}
                 </div>
                 <div>
                   <label className="block text-xs font-semibold text-amber-800 dark:text-amber-200 mb-1">Date</label>
                   <input
                     type="text"
                     value={editedComponents.date}
                     onChange={(e) => handleComponentChange('date', e.target.value)}
                     aria-label="Publication date for citation"
                     className="w-full p-2 text-sm bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none text-slate-800 dark:text-slate-200"
                     placeholder="e.g., 2023"
                   />
                 </div>
                 <div className="md:col-span-2">
                   <label className="block text-xs font-semibold text-amber-800 dark:text-amber-200 mb-1">Title {editValidationErrors.title && <span className="text-red-500">*</span>}</label>
                   <input
                     type="text"
                     value={editedComponents.title}
                     onChange={(e) => {
                       handleComponentChange('title', e.target.value);
                       if (editValidationErrors.title) setEditValidationErrors(prev => ({ ...prev, title: '' }));
                     }}
                     aria-label="Publication title for citation"
                     aria-invalid={!!editValidationErrors.title}
                     className={`w-full p-2 text-sm bg-white dark:bg-slate-800 border rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none text-slate-800 dark:text-slate-200 ${editValidationErrors.title ? 'border-red-500 dark:border-red-500' : 'border-amber-300 dark:border-amber-700'}`}
                     placeholder="Enter publication title"
                   />
                   {editValidationErrors.title && <p className="text-xs text-red-500 mt-1">{editValidationErrors.title}</p>}
                 </div>
                 <div>
                   <label className="block text-xs font-semibold text-amber-800 dark:text-amber-200 mb-1">Source / Publisher</label>
                   <input
                     type="text"
                     value={editedComponents.source}
                     onChange={(e) => handleComponentChange('source', e.target.value)}
                     aria-label="Source or publisher name"
                     className="w-full p-2 text-sm bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none text-slate-800 dark:text-slate-200"
                     placeholder="e.g., Nature, Journal of Science"
                   />
                 </div>
                 <div>
                   <label className="block text-xs font-semibold text-amber-800 dark:text-amber-200 mb-1">DOI / URL</label>
                   <input
                     type="text"
                     value={editedComponents.doi_or_url}
                     onChange={(e) => handleComponentChange('doi_or_url', e.target.value)}
                     aria-label="DOI or URL identifier"
                     className="w-full p-2 text-sm bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none text-slate-800 dark:text-slate-200"
                     placeholder="e.g., 10.1038/s41586-020-2649-2"
                   />
                 </div>
               </div>
               {Object.values(editValidationErrors).some(e => e) && (
                 <div className="mt-3 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                   <p className="text-xs text-red-600 dark:text-red-400">Please fill in all required fields (marked with *)</p>
                 </div>
               )}
             </div>
           ) : (
             <div className="mb-4 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg animate-in fade-in slide-in-from-bottom-2">
               <div className="flex items-center justify-between mb-2">
                 <div className="flex items-center space-x-2">
                   <Info size={16} className="text-emerald-600" />
                   <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Metadata fetched automatically</span>
                 </div>
                 {metadata && (
                 <button
                   onClick={() => setIsEditing(true)}
                   className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-900/30 transition-colors"
                 >
                   <Edit3 size={12} />
                   Edit Components
                 </button>
                 )}
               </div>
               <div className="grid grid-cols-2 gap-2 text-xs text-emerald-800 dark:text-emerald-200">
                 <span><strong>Title:</strong> {metadata?.title.slice(0, 50)}{metadata?.title && metadata.title.length > 50 ? '...' : ''}</span>
                 <span><strong>Author:</strong> {metadata?.author.split(',')[0]}</span>
                 <span><strong>Source:</strong> {metadata?.source}</span>
                 <span><strong>Date:</strong> {metadata?.date}</span>
               </div>
             </div>
           )
         )}
         
         <textarea
            value={localSourceInput}
            onChange={(e) => setSourceInput(e.target.value)}
            aria-label="Citation source input"
            placeholder="Paste a URL (e.g., https://...), DOI (e.g., 10.1038/s41586-020-2649-2), or title here..."
            className="w-full h-32 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none resize-none mb-6 transition-all font-mono text-sm text-slate-800 dark:text-slate-200"
         />

         <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="space-y-2 w-full md:w-auto">
               <label className="text-xs font-bold text-slate-500 uppercase">Citation Style</label>
               <div className="flex flex-wrap gap-2">
                 {CITATION_STYLES_LIST.map((s) => (
                   <button
                     key={s}
                     onClick={() => setStyle(s)}
                     className={`px-4 py-2 text-sm font-medium rounded-lg border transition-all 
                       ${style === s 
                         ? 'bg-primary-50 border-primary-500 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300' 
                         : 'bg-white border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 hover:border-primary-300'
                       }`}
                   >
                     {s}
                   </button>
                 ))}
               </div>
            </div>

            <button
               onClick={handleGenerate}
               disabled={loading || !localSourceInput}
               className="w-full md:w-auto px-8 py-3 bg-primary-600 text-white rounded-xl font-bold hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2 shadow-lg shadow-primary-500/20"
               title="Generate citation (Ctrl+Enter)"
            >
               {loading ? <span>Generating...</span> : <><span>Generate Citation</span> <ArrowRight size={18} /></>}
            </button>
         </div>
      </div>
      )}

      {result && !batchMode && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          
          {/* Main Citation Result */}
          <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-lg border border-slate-200 dark:border-dark-border overflow-hidden">
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
               <div className="flex items-center space-x-2">
                  <Quote size={18} className="text-primary-600" />
                  <span className="font-bold text-slate-700 dark:text-slate-300">{style} Result</span>
               </div>
               <button 
                 onClick={handleCopyCitation} 
                 className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200
                   ${copiedCitation 
                     ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                     : 'bg-white border border-slate-200 text-slate-600 hover:border-primary-500 hover:text-primary-600 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-300'
                   }`}
               >
                 {copiedCitation ? <Check size={14} /> : <Copy size={14} />}
                 <span>{copiedCitation ? 'Copied' : 'Copy'}</span>
               </button>
            </div>
            <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 text-xs text-slate-500">
               <span>Rate this citation:</span>
               <button
                 onClick={() => handleFeedback(1)}
                 className="flex items-center gap-1 px-2 py-1 rounded-full border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-900"
               >
                 <ThumbsUp size={12} />
                 Helpful
               </button>
               <button
                 onClick={() => handleFeedback(-1)}
                 className="flex items-center gap-1 px-2 py-1 rounded-full border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-900"
               >
                 <ThumbsDown size={12} />
                 Needs tweaks
               </button>
            </div>
            <div className="p-8">
               <div className="p-6 bg-primary-50 dark:bg-primary-900/10 rounded-xl border border-primary-100 dark:border-primary-900/30 shadow-sm">
                 <p className="font-serif text-lg text-slate-800 dark:text-slate-100 leading-relaxed break-words select-all">
                   {result.formatted_citation}
                 </p>
               </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Visual Verification */}
            <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-sm border border-slate-200 dark:border-dark-border p-6">
               <div className="flex items-center space-x-2 mb-4 text-slate-500">
                  <Layers size={18} />
                  <span className="font-bold uppercase text-xs tracking-wider">Source Breakdown (Verify)</span>
               </div>
               <div className="space-y-3">
                  <ComponentRow label="Author" value={result.components.author} />
                  <ComponentRow label="Date" value={result.components.date} />
                  <ComponentRow label="Title" value={result.components.title} highlight />
                  <ComponentRow label="Source" value={result.components.source} />
                  <div className="flex justify-between items-start py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
                    <span className="text-xs font-semibold text-slate-400 uppercase w-24 shrink-0 mt-1">DOI / URL</span>
                    <a href={result.components.doi_or_url.startsWith('http') ? result.components.doi_or_url : '#'} target="_blank" rel="noopener noreferrer" className="flex-1 text-right text-sm font-medium text-blue-600 hover:underline flex justify-end items-center gap-1">
                       <span className="truncate max-w-[200px]">{result.components.doi_or_url || 'N/A'}</span>
                       {result.components.doi_or_url && <ExternalLink size={12} />}
                    </a>
                  </div>
               </div>
            </div>

            {/* BibTeX Output */}
            <div className="bg-slate-900 rounded-2xl shadow-sm border border-slate-800 p-6 flex flex-col text-slate-200">
               <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center space-x-2 text-slate-400">
                      <FileCode size={18} />
                      <span className="font-bold uppercase text-xs tracking-wider">BibTeX Entry</span>
                  </div>
                  <button 
                   onClick={handleCopyBibtex} 
                   className="text-xs text-slate-400 hover:text-white transition-colors flex items-center gap-1"
                  >
                   {copiedBibtex ? <Check size={12}/> : <Copy size={12}/>}
                   {copiedBibtex ? 'Copied' : 'Copy Code'}
                  </button>
               </div>
               <pre className="flex-1 font-mono text-xs leading-relaxed p-4 bg-black/30 rounded-lg overflow-x-auto border border-white/10 select-all">
                  {result.bibtex}
               </pre>
            </div>
          </div>

        </div>
      )}
    </div>
  );
};

const ComponentRow = ({ label, value, highlight = false }: { label: string, value: string, highlight?: boolean }) => (
  <div className="flex justify-between items-start py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
     <span className="text-xs font-semibold text-slate-400 uppercase w-24 shrink-0 mt-1">{label}</span>
     <span className={`flex-1 text-right text-sm font-medium ${highlight ? 'text-primary-700 dark:text-primary-400' : 'text-slate-700 dark:text-slate-300'}`}>
       {value || <span className="text-slate-400 italic">Unknown</span>}
     </span>
  </div>
);
