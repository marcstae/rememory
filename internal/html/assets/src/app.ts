// ReMemory Recovery Tool - Wizard-based recovery using native JavaScript crypto
//
// Built with esbuild --define:__TLOCK__=true|false to produce two variants:
//   app.js       (__TLOCK__=false) — offline recovery, no tlock/drand code
//   app-tlock.js (__TLOCK__=true)  — recovery with tlock (HTTP to drand)

import type {
  RecoveryState,
  PersonalizationData,
  FriendInfo,
  ToastAction,
  TranslationFunction,
} from './types';

// Native crypto imports
import {
  parseShare,
  parseCompactShare,
  encodeCompact,
  combine,
  recoverPassphrase,
  base64ToBytes,
  bytesToBase64,
  decrypt,
  extractArchive,
  isTlockContainer,
  openTlockContainer,
  extractBundle,
  extractPersonalizationFromHTML,
  decodeShareWords,
  type ParsedShare,
} from './crypto';

// Compile-time flag: esbuild replaces this with true or false.
// When false, tlock code is eliminated entirely from the bundle (app.js).
// When true, tlock recovery code is included (app-tlock.js).
declare const __TLOCK__: boolean;

// Translation function (defined in HTML)
declare const t: TranslationFunction;

// Extended share type with UI-specific fields
type UIShare = ParsedShare & { isHolder?: boolean };

(function() {
  'use strict';

  // Import shared utilities
  const { escapeHtml, formatSize, toast, showInlineError, clearInlineError } = window.rememoryUtils;

  // Tlock recovery functions — conditionally required so esbuild eliminates
  // tlock-js + drand-client HTTP code from the offline variant (app.js).
  // With --define:__TLOCK__=false --minify-syntax, the ternary evaluates to null
  // and esbuild never follows the require.
  const tlockRecover: {
    decrypt(ciphertext: Uint8Array): Promise<Uint8Array>;
    waitAndDecrypt(
      meta: import('./types').TlockContainerMeta,
      ciphertext: Uint8Array,
      onTick: (unlockDate: Date) => void,
      onDecrypted: (archive: Uint8Array) => void,
      onError: (err: unknown) => void,
    ): void;
    stopWaiting(): void;
    formatUnlockDate(date: Date, t: TranslationFunction): { text: string; relative: boolean };
  } | null = __TLOCK__ ? require('./tlock-recover') : null;

  // ============================================
  // Utilities
  // ============================================

  const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  function linkifyEmail(escaped: string): string {
    return escaped.replace(EMAIL_RE, (match) => {
      const clean = match.replace(/\.+$/, '');
      return `<a href="mailto:${clean}">${clean}</a>`;
    });
  }

  // ============================================
  // Recovery State
  // ============================================

  const state: RecoveryState = {
    shares: [],
    manifest: null,
    threshold: 0,
    total: 0,
    recovering: false,
    recoveryComplete: false
  };

  // Tlock container bytes (saved after age-decrypt for failsafe download if tlock fails)
  let tlockContainerData: Uint8Array | null = null;

  // ============================================
  // Wizard State
  // ============================================

  type WizardScreen = 'welcome' | 'contacts' | 'add-piece' | 'words' | 'recovery';
  let wizardScreen: WizardScreen = 'welcome';
  let wizardFriendName: string | null = null;

  // ============================================
  // DOM Elements
  // ============================================

  interface WizElements {
    // Welcome
    welcomeScreen: HTMLElement | null;
    welcomeInfo: HTMLElement | null;
    beginBtn: HTMLButtonElement | null;
    // Contacts
    contactsScreen: HTMLElement | null;
    progressFill: HTMLElement | null;
    progressText: HTMLElement | null;
    contactList: HTMLElement | null;
    addPieceBtn: HTMLButtonElement | null;
    // Add Piece
    addPieceScreen: HTMLElement | null;
    backContactsBtn: HTMLButtonElement | null;
    addTitle: HTMLElement | null;
    methods: HTMLElement | null;
    methodFileBtn: HTMLButtonElement | null;
    methodWordsBtn: HTMLButtonElement | null;
    methodPasteBtn: HTMLButtonElement | null;
    fileArea: HTMLElement | null;
    fileDrop: HTMLElement | null;
    fileInput: HTMLInputElement | null;
    pasteArea: HTMLElement | null;
    pasteInput: HTMLTextAreaElement | null;
    pasteSubmitBtn: HTMLButtonElement | null;
    // Words
    wordsScreen: HTMLElement | null;
    backMethodsBtn: HTMLButtonElement | null;
    wordGrid: HTMLElement | null;
    wordsError: HTMLElement | null;
    wordsSubmitBtn: HTMLButtonElement | null;
    // Recovery
    recoveryScreen: HTMLElement | null;
    recoveryTitle: HTMLElement | null;
    manifestArea: HTMLElement | null;
    manifestDrop: HTMLElement | null;
    manifestInput: HTMLInputElement | null;
    manifestStatus: HTMLElement | null;
    progressBar: HTMLElement | null;
    statusMessage: HTMLElement | null;
    filesList: HTMLElement | null;
    downloadActions: HTMLElement | null;
    downloadAllBtn: HTMLButtonElement | null;
    tlockWaiting: HTMLElement | null;
    tlockWaitingDate: HTMLElement | null;
  }

  const el: WizElements = {
    welcomeScreen: document.getElementById('wiz-welcome'),
    welcomeInfo: document.getElementById('wiz-welcome-info'),
    beginBtn: document.getElementById('wiz-begin-btn') as HTMLButtonElement | null,
    contactsScreen: document.getElementById('wiz-contacts'),
    progressFill: document.getElementById('wiz-progress-fill'),
    progressText: document.getElementById('wiz-progress-text'),
    contactList: document.getElementById('wiz-contact-list'),
    addPieceBtn: document.getElementById('wiz-add-piece-btn') as HTMLButtonElement | null,
    addPieceScreen: document.getElementById('wiz-add-piece'),
    backContactsBtn: document.getElementById('wiz-back-contacts-btn') as HTMLButtonElement | null,
    addTitle: document.getElementById('wiz-add-title'),
    methods: document.getElementById('wiz-methods'),
    methodFileBtn: document.getElementById('wiz-method-file-btn') as HTMLButtonElement | null,
    methodWordsBtn: document.getElementById('wiz-method-words-btn') as HTMLButtonElement | null,
    methodPasteBtn: document.getElementById('wiz-method-paste-btn') as HTMLButtonElement | null,
    fileArea: document.getElementById('wiz-file-area'),
    fileDrop: document.getElementById('wiz-file-drop'),
    fileInput: document.getElementById('wiz-file-input') as HTMLInputElement | null,
    pasteArea: document.getElementById('wiz-paste-area'),
    pasteInput: document.getElementById('wiz-paste-input') as HTMLTextAreaElement | null,
    pasteSubmitBtn: document.getElementById('wiz-paste-submit-btn') as HTMLButtonElement | null,
    wordsScreen: document.getElementById('wiz-words'),
    backMethodsBtn: document.getElementById('wiz-back-methods-btn') as HTMLButtonElement | null,
    wordGrid: document.getElementById('wiz-word-grid'),
    wordsError: document.getElementById('wiz-words-error'),
    wordsSubmitBtn: document.getElementById('wiz-words-submit-btn') as HTMLButtonElement | null,
    recoveryScreen: document.getElementById('wiz-recovery'),
    recoveryTitle: document.getElementById('wiz-recovery-title'),
    manifestArea: document.getElementById('wiz-manifest-area'),
    manifestDrop: document.getElementById('wiz-manifest-drop'),
    manifestInput: document.getElementById('wiz-manifest-input') as HTMLInputElement | null,
    manifestStatus: document.getElementById('wiz-manifest-status'),
    progressBar: document.getElementById('progress-bar'),
    statusMessage: document.getElementById('status-message'),
    filesList: document.getElementById('files-list'),
    downloadActions: document.getElementById('download-actions'),
    downloadAllBtn: document.getElementById('download-all-btn') as HTMLButtonElement | null,
    tlockWaiting: document.getElementById('tlock-waiting'),
    tlockWaitingDate: document.getElementById('tlock-waiting-date'),
  };

  // ============================================
  // Personalization & Regex
  // ============================================

  const personalization: PersonalizationData | null =
    (typeof window.PERSONALIZATION !== 'undefined') ? window.PERSONALIZATION : null;

  const shareRegex = /-----BEGIN REMEMORY SHARE-----([\s\S]*?)-----END REMEMORY SHARE-----/;
  const compactShareRegex = /^RM\d+:\d+:\d+:\d+:[A-Za-z0-9_-]+:[0-9a-f]{4}$/;

  // ============================================
  // Error Handlers
  // ============================================

  function showError(msg: string, options: {
    title?: string;
    guidance?: string;
    actions?: ToastAction[];
    inline?: boolean;
    targetElement?: HTMLElement;
  } = {}): void {
    const { title, guidance, actions, inline, targetElement } = options;

    if (inline && targetElement) {
      showInlineError(targetElement, msg, guidance);
      return;
    }

    toast.error(title || t('error_title'), msg, guidance, actions);
  }

  function activeDropZone(): HTMLElement | null {
    if (wizardScreen === 'add-piece') return el.fileDrop;
    if (wizardScreen === 'recovery') return el.manifestDrop;
    return null;
  }

  const errorHandlers = {
    invalidShare(filename: string, _detail?: string): void {
      const zone = activeDropZone();
      if (zone) {
        showError(
          t('error_invalid_share_message', filename),
          {
            title: t('error_invalid_share_title'),
            guidance: t('error_invalid_share_guidance'),
            inline: true,
            targetElement: zone
          }
        );
      } else {
        toast.error(t('error_invalid_share_title'), t('error_invalid_share_message', filename), t('error_invalid_share_guidance'));
      }
    },

    noShareFound(filename: string): void {
      const zone = activeDropZone();
      if (zone) {
        showError(
          t('error_no_share_message', filename),
          {
            title: t('error_no_share_title'),
            guidance: t('error_no_share_guidance'),
            inline: true,
            targetElement: zone
          }
        );
      } else {
        toast.error(t('error_no_share_title'), t('error_no_share_message', filename), t('error_no_share_guidance'));
      }
    },

    duplicateShare(index: number): void {
      toast.warning(
        t('error_duplicate_title'),
        t('error_duplicate_message', index),
        t('error_duplicate_guidance')
      );
    },

    mismatchedShare(_detail: string): void {
      toast.error(
        t('error_mismatch_title'),
        t('error_mismatch_message'),
        t('error_mismatch_guidance')
      );
    },

    fileReadFailed(filename: string): void {
      showError(
        t('error_file_read_message', filename),
        {
          title: t('error_file_read_title'),
          guidance: t('error_file_read_guidance')
        }
      );
    },

    decryptionFailed(_err: unknown): void {
      toast.error(
        t('error_decrypt_title'),
        t('error_decrypt_message'),
        t('error_decrypt_guidance'),
        [
          {
            id: 'retry',
            label: t('action_try_different_shares'),
            primary: true,
            onClick: () => {
              const holderName = personalization?.holder?.toLowerCase() || '';
              const holderShare = state.shares.find((share) => {
                const shareHolder = share.holder?.toLowerCase();
                return (share as UIShare).isHolder === true || (holderName !== '' && shareHolder === holderName);
              });

              state.shares = holderShare ? [holderShare] : [];
              state.recoveryComplete = false;
              navigateTo('contacts');
            }
          }
        ]
      );
    },

    extractionFailed(_err: unknown): void {
      toast.error(
        t('error_extract_title'),
        t('error_extract_message'),
        t('error_extract_guidance')
      );
    }
  };

  // ============================================
  // Wizard Navigation
  // ============================================

  function navigateTo(screen: WizardScreen): void {
    // Hide all screens
    const screens = document.querySelectorAll('.wizard-screen');
    screens.forEach(s => s.classList.add('hidden'));

    wizardScreen = screen;

    // Show target and run screen-specific setup
    switch (screen) {
      case 'welcome':
        el.welcomeScreen?.classList.remove('hidden');
        setupWelcome();
        break;
      case 'contacts':
        el.contactsScreen?.classList.remove('hidden');
        renderContacts();
        updateProgress();
        break;
      case 'add-piece':
        el.addPieceScreen?.classList.remove('hidden');
        setupAddPiece();
        break;
      case 'words':
        el.wordsScreen?.classList.remove('hidden');
        buildWordGrid();
        break;
      case 'recovery':
        el.recoveryScreen?.classList.remove('hidden');
        setupRecoveryScreen();
        break;
    }
  }

  // ============================================
  // Wizard: Welcome Screen
  // ============================================

  function setupWelcome(): void {
    if (!el.welcomeInfo) return;

    const hasHolder = state.shares.some(s => (s as UIShare).isHolder);
    const hasPers = !!personalization;

    if (hasPers && hasHolder) {
      const needed = state.threshold - state.shares.length;
      let info = `<p class="wiz-checkmark">&#10003; ${t('wiz_your_piece_ready')}</p>`;
      if (needed > 0) {
        info += `<p>${needed === 1 ? t('wiz_need_from_friends_one') : t('wiz_need_from_friends', needed)}</p>`;
      }
      el.welcomeInfo.innerHTML = info;
      el.welcomeInfo.classList.remove('hidden');
    } else if (hasPers) {
      el.welcomeInfo.classList.add('hidden');
    } else {
      el.welcomeInfo.classList.add('hidden');
    }
  }

  // ============================================
  // Wizard: Contacts Screen
  // ============================================

  function renderContacts(): void {
    if (!el.contactList) return;
    el.contactList.innerHTML = '';

    const hasHolder = state.shares.some(s => (s as UIShare).isHolder);

    // Show holder's piece first (if personalized)
    if (personalization && hasHolder) {
      const item = document.createElement('div');
      item.className = 'wiz-contact-item collected';
      item.innerHTML = `
        <div class="wiz-checkbox">&#10003;</div>
        <div class="wiz-contact-details">
          <div class="wiz-contact-name">${escapeHtml(personalization.holder)}</div>
          <div class="wiz-contact-info">${t('your_share')}</div>
        </div>
      `;
      el.contactList.appendChild(item);
    }

    // Show other friends (personalized mode)
    if (personalization?.otherFriends) {
      personalization.otherFriends.forEach((friend: FriendInfo) => {
        const collected = state.shares.some(s =>
          (friend.shareIndex && s.index === friend.shareIndex) ||
          (s.holder && s.holder.toLowerCase() === friend.name.toLowerCase())
        );

        const item = document.createElement('div');
        item.className = 'wiz-contact-item' + (collected ? ' collected' : '');

        const contactInfo = friend.contact ? linkifyEmail(escapeHtml(friend.contact)) : '';

        item.innerHTML = `
          <div class="wiz-checkbox">${collected ? '&#10003;' : ''}</div>
          <div class="wiz-contact-details">
            <div class="wiz-contact-name">${escapeHtml(friend.name)}</div>
            <div class="wiz-contact-info">${contactInfo || '—'}</div>
          </div>
          ${collected ? '' : `<button class="wiz-add-btn btn btn-secondary" type="button" data-friend-name="${escapeHtml(friend.name)}">${t('wiz_add_piece')}</button>`}
        `;

        if (!collected) {
          const btn = item.querySelector('.wiz-add-btn') as HTMLButtonElement;
          btn?.addEventListener('click', () => {
            wizardFriendName = friend.name;
            navigateTo('add-piece');
          });
        }

        el.contactList.appendChild(item);
      });
    }

    // Show non-personalized collected pieces
    if (!personalization) {
      state.shares.forEach((share, i) => {
        const item = document.createElement('div');
        item.className = 'wiz-contact-item collected';
        const name = share.holder || t('wiz_adding_piece', i + 1);
        item.innerHTML = `
          <div class="wiz-checkbox">&#10003;</div>
          <div class="wiz-contact-details">
            <div class="wiz-contact-name">${escapeHtml(name)}</div>
          </div>
        `;
        el.contactList.appendChild(item);
      });
    }
  }

  function updateProgress(): void {
    const count = state.shares.length;
    const threshold = state.threshold || 2;

    if (el.progressFill) {
      const pct = Math.min(100, Math.round((count / threshold) * 100));
      el.progressFill.style.width = pct + '%';
    }

    if (el.progressText) {
      if (count >= threshold) {
        el.progressText.textContent = t('ready') + ' — ' + t('shares_of', count, threshold);
        el.progressText.className = 'step-progress-text ready';
      } else {
        const needed = threshold - count;
        const needLabel = needed === 1 ? t('need_more_one') : t('need_more', needed);
        el.progressText.textContent = needLabel + ' (' + t('shares_of', count, threshold) + ')';
        el.progressText.className = 'step-progress-text';
      }
    }
  }

  // ============================================
  // Wizard: Add Piece Screen
  // ============================================

  function setupAddPiece(): void {
    // Set title
    if (el.addTitle) {
      el.addTitle.textContent = wizardFriendName
        ? t('wiz_adding_for', wizardFriendName)
        : t('wiz_add_piece');
    }

    // Reset: show methods, hide sub-areas
    el.methods?.classList.remove('hidden');
    el.fileArea?.classList.add('hidden');
    el.pasteArea?.classList.add('hidden');

    // Clear paste input
    if (el.pasteInput) el.pasteInput.value = '';

    // Clear inline errors
    if (el.fileDrop) clearInlineError(el.fileDrop);
  }

  function showMethod(method: 'file' | 'paste'): void {
    el.methods?.classList.add('hidden');
    if (method === 'file') {
      el.fileArea?.classList.remove('hidden');
    } else {
      el.pasteArea?.classList.remove('hidden');
      el.pasteInput?.focus();
    }
  }

  // ============================================
  // Wizard: Word Grid
  // ============================================

  function buildWordGrid(): void {
    if (!el.wordGrid) return;
    el.wordGrid.innerHTML = '';

    for (let i = 0; i < 25; i++) {
      const cell = document.createElement('div');
      cell.className = 'wiz-word-cell';

      const label = document.createElement('label');
      label.textContent = String(i + 1) + '.';
      label.htmlFor = 'word-' + i;

      const input = document.createElement('input');
      input.type = 'text';
      input.id = 'word-' + i;
      input.className = 'wiz-word-input';
      input.autocomplete = 'off';
      input.autocapitalize = 'off';
      input.spellcheck = false;
      input.setAttribute('inputmode', 'text');

      input.addEventListener('input', () => handleWordInput(i));
      input.addEventListener('keydown', (e) => handleWordKeydown(i, e));

      cell.appendChild(label);
      cell.appendChild(input);
      el.wordGrid.appendChild(cell);
    }

    // Focus first field
    const first = document.getElementById('word-0') as HTMLInputElement;
    first?.focus();

    // Reset state
    el.wordsError?.classList.add('hidden');
    if (el.wordsSubmitBtn) el.wordsSubmitBtn.disabled = true;
  }

  function handleWordInput(index: number): void {
    const input = document.getElementById('word-' + index) as HTMLInputElement;
    if (!input) return;

    const value = input.value;

    // Auto-advance on space
    if (value.includes(' ')) {
      const trimmed = value.replace(/\s+/g, '').toLowerCase();
      input.value = trimmed;

      if (index < 24 && trimmed.length > 0) {
        const next = document.getElementById('word-' + (index + 1)) as HTMLInputElement;
        next?.focus();
      }
    }

    updateWordsSubmitState();
  }

  function handleWordKeydown(index: number, event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      const input = document.getElementById('word-' + index) as HTMLInputElement;
      if (input) input.value = input.value.trim().toLowerCase();

      if (index < 24) {
        const next = document.getElementById('word-' + (index + 1)) as HTMLInputElement;
        next?.focus();
      } else {
        submitWords();
      }
    }

    // Backspace on empty field → go to previous
    if (event.key === 'Backspace') {
      const input = document.getElementById('word-' + index) as HTMLInputElement;
      if (input && input.value === '' && index > 0) {
        event.preventDefault();
        const prev = document.getElementById('word-' + (index - 1)) as HTMLInputElement;
        prev?.focus();
      }
    }
  }

  function updateWordsSubmitState(): void {
    const words = getWordGridValues();
    const filled = words.filter(w => w.length > 0).length;
    if (el.wordsSubmitBtn) {
      el.wordsSubmitBtn.disabled = filled < 25;
    }
  }

  function getWordGridValues(): string[] {
    const words: string[] = [];
    for (let i = 0; i < 25; i++) {
      const input = document.getElementById('word-' + i) as HTMLInputElement;
      words.push(input ? input.value.trim().toLowerCase() : '');
    }
    return words;
  }

  async function submitWords(): Promise<void> {
    const words = getWordGridValues();
    const empty = words.findIndex(w => w.length === 0);
    if (empty >= 0) {
      const input = document.getElementById('word-' + empty) as HTMLInputElement;
      input?.focus();
      return;
    }

    el.wordsError?.classList.add('hidden');

    try {
      const result = await decodeShareWords(words);
      const share = await buildShareFromWords(result);
      const added = await tryAddShare(share.compact!, { quiet: false });
      if (added) {
        afterShareAdded(added);
      }
    } catch (err) {
      // Show error
      if (el.wordsError) {
        el.wordsError.textContent = err instanceof Error ? err.message : String(err);
        el.wordsError.classList.remove('hidden');
      }
      toast.error(
        t('error_invalid_words_title'),
        err instanceof Error ? err.message : String(err),
        t('error_invalid_words_guidance')
      );
    }
  }

  // ============================================
  // Initialization
  // ============================================

  async function init(): Promise<void> {
    setupWizardButtons();
    setupDropZones();
    setupGlobalDrop();

    // Native crypto is always ready
    window.rememoryAppReady = true;

    // Load personalization data
    if (personalization) {
      await loadPersonalizationData();
    }

    // Check URL fragment for compact share
    await loadShareFromFragment();

    // Setup welcome screen (after personalization loaded)
    setupWelcome();

    // If everything is already ready (e.g., fragment share + personalized bundle), auto-recover
    checkRecoverReady();
  }

  // ============================================
  // Wizard Button Setup
  // ============================================

  function setupWizardButtons(): void {
    // Welcome → Contacts
    el.beginBtn?.addEventListener('click', () => navigateTo('contacts'));

    // Contacts → Add Piece (generic)
    el.addPieceBtn?.addEventListener('click', () => {
      wizardFriendName = null;
      navigateTo('add-piece');
    });

    // Add Piece → back to Contacts
    el.backContactsBtn?.addEventListener('click', () => navigateTo('contacts'));

    // Method selection
    el.methodFileBtn?.addEventListener('click', () => showMethod('file'));
    el.methodWordsBtn?.addEventListener('click', () => navigateTo('words'));
    el.methodPasteBtn?.addEventListener('click', () => showMethod('paste'));

    // Words → back to Add Piece
    el.backMethodsBtn?.addEventListener('click', () => navigateTo('add-piece'));

    // Word submit
    el.wordsSubmitBtn?.addEventListener('click', () => submitWords());

    // Paste submit
    el.pasteSubmitBtn?.addEventListener('click', () => {
      const val = el.pasteInput?.value?.trim();
      if (val) parseAndAddShareFromPaste(val);
    });

    // Paste: support Ctrl+Enter
    el.pasteInput?.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const val = el.pasteInput?.value?.trim();
        if (val) parseAndAddShareFromPaste(val);
      }
    });

    // Download
    el.downloadAllBtn?.addEventListener('click', downloadAll);
  }

  // ============================================
  // Drop Zones
  // ============================================

  function setupDropZones(): void {
    // Share file drop zone (in add-piece screen)
    setupSingleDropZone(el.fileDrop, el.fileInput, handleShareFiles);

    // Manifest drop zone (in recovery screen)
    setupSingleDropZone(el.manifestDrop, el.manifestInput, handleManifestFiles);
  }

  function setupSingleDropZone(
    dropZone: HTMLElement | null,
    fileInput: HTMLInputElement | null,
    handler: (files: FileList) => void
  ): void {
    if (!dropZone) return;

    dropZone.addEventListener('click', () => fileInput?.click());
    dropZone.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fileInput?.click();
      }
    });

    dropZone.addEventListener('dragover', (e: DragEvent) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e: DragEvent) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      if (e.dataTransfer?.files?.length) {
        handler(e.dataTransfer.files);
      }
    });

    fileInput?.addEventListener('change', () => {
      if (fileInput.files?.length) {
        handler(fileInput.files);
        fileInput.value = '';
      }
    });
  }

  function handleShareFiles(files: FileList): void {
    handleFilesUnified(files);
  }

  function handleManifestFiles(files: FileList): void {
    for (let i = 0; i < files.length; i++) {
      handleAnyFile(files[i]);
    }
  }

  function setupGlobalDrop(): void {
    let dragCounter = 0;

    document.addEventListener('dragenter', (e: DragEvent) => {
      e.preventDefault();
      dragCounter++;
      if (dragCounter === 1) {
        document.body.classList.add('drag-active');
      }
    });

    document.addEventListener('dragleave', () => {
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        document.body.classList.remove('drag-active');
      }
    });

    document.addEventListener('dragover', (e: DragEvent) => {
      e.preventDefault();
    });

    document.addEventListener('drop', (e: DragEvent) => {
      e.preventDefault();
      dragCounter = 0;
      document.body.classList.remove('drag-active');

      // Only handle drops that didn't land on a drop zone
      const target = e.target as HTMLElement;
      if (target.closest('.drop-zone')) return;

      if (e.dataTransfer?.files?.length) {
        handleFilesUnified(e.dataTransfer.files);
      }
    });
  }

  // ============================================
  // Personalization
  // ============================================

  async function loadPersonalizationData(): Promise<void> {
    if (!personalization) return;

    // Load the holder's share automatically
    if (personalization.holderShare) {
      try {
        const share = await parseShare(personalization.holderShare) as UIShare;
        share.isHolder = true;
        share.compact = await encodeCompact(share);
        state.threshold = share.threshold;
        state.total = share.total;
        state.shares.push(share);
      } catch {
        // Silently ignore invalid holder share
      }
    }

    // Load embedded manifest if available
    if (personalization.manifestB64) {
      const binary = atob(personalization.manifestB64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      state.manifest = bytes;
    }
  }

  // ============================================
  // URL Fragment Share Loading
  // ============================================

  async function loadShareFromFragment(): Promise<void> {
    const hash = window.location.hash;
    if (!hash || !hash.startsWith('#share=')) return;

    const compact = decodeURIComponent(hash.slice('#share='.length));
    if (!compactShareRegex.test(compact)) return;

    try {
      const share = await parseCompactShare(compact);

      if (state.shares.some(s => s.index === share.index)) return;

      if (state.shares.length === 0 || (state.threshold === 0 && share.threshold > 0)) {
        state.threshold = share.threshold;
        state.total = share.total;
      }

      state.shares.push(share);

      // Clear the fragment from the URL bar to avoid re-importing on reload
      if (window.history?.replaceState) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    } catch {
      // Silently ignore invalid fragment shares
    }
  }

  // ============================================
  // File Handling
  // ============================================

  function handleFilesUnified(files: FileList): void {
    for (let i = 0; i < files.length; i++) {
      handleAnyFile(files[i]);
    }
  }

  async function handleAnyFile(file: File): Promise<void> {
    const name = file.name.toLowerCase();

    try {
      if (name.endsWith('.zip')) {
        const data = await readFileAsArrayBuffer(file);
        await handleBundleZipUnified(data, file.name);
        return;
      }

      if (name.endsWith('.html') || name.endsWith('.htm')) {
        const text = await readFileAsText(file);
        await handleHTMLUnified(text, file.name);
        return;
      }

      if (name.endsWith('.age')) {
        const data = await readFileAsArrayBuffer(file);
        state.manifest = new Uint8Array(data);
        showManifestLoaded(file.name, state.manifest.length, 'file');
        checkRecoverReady();
        return;
      }

      // PDF or TXT — try to extract share
      if (name.endsWith('.pdf') || name.endsWith('.txt') || name === 'readme') {
        const text = await readFileAsText(file);
        await parseAndAddShareUnified(text, file.name);
        return;
      }

      // Unknown file type — try as text
      const text = await readFileAsText(file);
      await parseAndAddShareUnified(text, file.name);

    } catch (err) {
      errorHandlers.fileReadFailed(file.name);
    }
  }

  async function handleBundleZipUnified(zipData: ArrayBuffer, fileName: string): Promise<void> {
    try {
      const bundle = await extractBundle(new Uint8Array(zipData));

      let addedShare = false;
      let addedManifest = false;

      // Extract share from README
      if (bundle.readme) {
        const share = await tryAddShare(bundle.readme, { quiet: true });
        if (share) {
          addedShare = true;
          afterShareAdded(share);
        }
      }

      // Extract manifest
      if (bundle.manifest && !state.manifest) {
        state.manifest = bundle.manifest;
        addedManifest = true;
      }

      // Extract from HTML (fallback if README didn't have a share)
      if (bundle.html && !addedShare) {
        const personalizationData = extractPersonalizationFromHTML(bundle.html);
        if (personalizationData) {
          const hasManifest = !!personalizationData.manifestB64;

          if (personalizationData.manifestB64 && !state.manifest) {
            const binary = atob(personalizationData.manifestB64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            state.manifest = bytes;
            addedManifest = true;
          }

          if (personalizationData.holderShare) {
            try {
              const htmlShare = await tryAddShare(personalizationData.holderShare, { quiet: hasManifest });
              if (htmlShare) {
                addedShare = true;
                afterShareAdded(htmlShare);
              }
            } catch { /* ignore */ }
          }
        }
      }

      // Show feedback
      if (addedManifest) {
        showManifestLoaded(fileName, state.manifest!.length, 'bundle');
      }
      if (!addedShare && !addedManifest) {
        toast.error(
          t('error_bundle_extract_title'),
          t('error_bundle_extract_message', fileName),
          t('error_bundle_extract_guidance')
        );
      }

      checkRecoverReady();

    } catch {
      toast.error(
        t('error_bundle_extract_title'),
        t('error_bundle_extract_message', fileName),
        t('error_bundle_extract_guidance')
      );
    }
  }

  async function handleHTMLUnified(text: string, fileName: string): Promise<void> {
    const personalizationData = extractPersonalizationFromHTML(text);
    if (!personalizationData) {
      // Try as plain text (maybe .html file with just text content)
      await parseAndAddShareUnified(text, fileName);
      return;
    }

    let addedShare = false;

    if (personalizationData.manifestB64 && !state.manifest) {
      const binary = atob(personalizationData.manifestB64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      state.manifest = bytes;
      showManifestLoaded(fileName, state.manifest.length, 'html');
    }

    if (personalizationData.holderShare) {
      const share = await tryAddShare(personalizationData.holderShare, { quiet: !!personalizationData.manifestB64 });
      if (share) addedShare = true;
    }

    if (!addedShare && !personalizationData.manifestB64) {
      toast.warning(
        t('error_no_share_title'),
        t('error_no_share_message', fileName),
        t('error_html_no_share_guidance')
      );
    }

    checkRecoverReady();
  }

  async function parseAndAddShareUnified(text: string, filename: string): Promise<void> {
    // Try PEM format first
    if (shareRegex.test(text)) {
      const share = await tryAddShare(text, { quiet: false });
      if (share) {
        afterShareAdded(share);
        return;
      }
    }

    // Try compact format
    const compactMatch = text.match(/RM\d+:\d+:\d+:\d+:[A-Za-z0-9_-]+:[0-9a-f]{4}/);
    if (compactMatch) {
      try {
        const share = await parseCompactShare(compactMatch[0]);
        if (!state.shares.some(s => s.index === share.index)) {
          if (state.shares.length === 0 || (state.threshold === 0 && share.threshold > 0)) {
            state.threshold = share.threshold;
            state.total = share.total;
          }
          state.shares.push(share);
          afterShareAdded(share);
          checkRecoverReady();
          return;
        }
      } catch { /* fall through */ }
    }

    // Try word extraction
    const words = extractWordsFromText(text);
    if (words.length >= 25) {
      try {
        const result = await decodeShareWords(words.slice(0, 25));
        const share = await buildShareFromWords(result);
        const added = await tryAddShare(share.compact!, { quiet: false });
        if (added) {
          afterShareAdded(added);
          return;
        }
      } catch { /* fall through */ }
    }

    errorHandlers.noShareFound(filename);
  }

  // ============================================
  // Share Management
  // ============================================

  async function tryAddShare(content: string, opts: { quiet?: boolean } = {}): Promise<UIShare | null> {
    const { quiet } = opts;

    let share: UIShare;
    try {
      // Try compact format first
      if (compactShareRegex.test(content.trim())) {
        share = await parseCompactShare(content.trim());
      } else {
        share = await parseShare(content);
      }
      share.compact = share.compact || await encodeCompact(share);
    } catch (err) {
      if (!quiet) {
        toast.error(
          t('error_invalid_share_title'),
          err instanceof Error ? err.message : String(err),
          t('error_invalid_share_guidance')
        );
      }
      return null;
    }

    // Check for duplicates
    if (state.shares.some(s => s.index === share.index)) {
      if (!quiet) errorHandlers.duplicateShare(share.index);
      return null;
    }

    // Check metadata consistency
    if (state.shares.length > 0) {
      const existing = state.shares[0];
      if (share.version !== existing.version) {
        errorHandlers.mismatchedShare('version');
        return null;
      }
      if (share.threshold !== existing.threshold || share.total !== existing.total) {
        errorHandlers.mismatchedShare('metadata');
        return null;
      }
      // Check created timestamp (allow 1-second tolerance)
      if (share.created && existing.created) {
        const diff = Math.abs(new Date(share.created).getTime() - new Date(existing.created).getTime());
        if (diff > 1000) {
          errorHandlers.mismatchedShare('created');
          return null;
        }
      }
    }

    // Set threshold/total from first share
    if (state.threshold === 0 && share.threshold > 0) {
      state.threshold = share.threshold;
      state.total = share.total;
    }

    state.shares.push(share);
    return share;
  }

  function afterShareAdded(share: ParsedShare): void {
    updateProgress();
    renderContacts();

    // Show success feedback
    const name = share.holder || wizardFriendName;
    if (name) {
      toast.success('', t('wiz_piece_added', name));
    } else {
      toast.success('', t('wiz_piece_added_anon'));
    }

    // Navigate: recovery if ready, otherwise contacts
    checkRecoverReady();

    // If we didn't navigate to recovery, go to contacts after a brief pause
    if (wizardScreen === 'add-piece' || wizardScreen === 'words') {
      setTimeout(() => {
        if (wizardScreen !== 'recovery') {
          navigateTo('contacts');
        }
      }, 600);
    }
  }

  async function parseAndAddShareFromPaste(content: string): Promise<void> {
    // Try compact format
    const trimmed = content.trim();
    if (compactShareRegex.test(trimmed)) {
      try {
        const share = await tryAddShare(trimmed, { quiet: false });
        if (share) {
          afterShareAdded(share);
          return;
        }
      } catch { /* fall through */ }
    }

    // Try PEM format
    if (shareRegex.test(content)) {
      const share = await tryAddShare(content, { quiet: false });
      if (share) {
        afterShareAdded(share);
        return;
      }
      return; // tryAddShare already showed error
    }

    // Try BIP39 words
    const words = extractWordsFromText(content);
    if (words.length >= 25) {
      try {
        const result = await decodeShareWords(words.slice(0, 25));
        const share = await buildShareFromWords(result);
        const added = await tryAddShare(share.compact!, { quiet: false });
        if (added) {
          afterShareAdded(added);
          return;
        }
      } catch (err) {
        toast.error(
          t('error_invalid_words_title'),
          err instanceof Error ? err.message : String(err),
          t('error_invalid_words_guidance')
        );
        return;
      }
    }

    // Nothing worked
    toast.error(
      t('error_paste_no_share_title'),
      t('error_paste_no_share_message'),
      t('error_paste_no_share_guidance')
    );
  }

  async function buildShareFromWords(result: { data: Uint8Array; index: number }): Promise<UIShare> {
    const dataB64 = bytesToBase64(result.data);
    const index = result.index || 0;

    const version = state.shares.length > 0 ? state.shares[0].version : 2;
    const threshold = state.threshold || 0;
    const total = state.total || 0;

    const share: UIShare = {
      version,
      index,
      total,
      threshold,
      dataB64,
      data: result.data,
      holder: resolveShareName(index),
    };
    share.compact = await encodeCompact(share);
    return share;
  }

  function resolveShareName(index: number): string | undefined {
    if (!personalization?.otherFriends) return undefined;
    const friend = personalization.otherFriends.find(f => f.shareIndex === index);
    return friend?.name;
  }

  // ============================================
  // Manifest UI
  // ============================================

  function showManifestLoaded(filename: string, size: number, source: 'file' | 'bundle' | 'embedded' | 'html' | 'server' = 'file'): void {
    // If on recovery screen, hide the drop zone and show status
    el.manifestDrop?.classList.add('hidden');

    if (el.manifestStatus) {
      const sourceLabels: Record<string, string> = {
        file: t('loaded'),
        bundle: t('manifest_loaded_bundle'),
        embedded: t('manifest_loaded_embedded'),
        html: t('manifest_loaded_html'),
        server: t('loaded'),
      };
      const sourceLabel = sourceLabels[source] || t('loaded');
      el.manifestStatus.innerHTML = `
        <span class="icon">&#9989;</span>
        <div style="flex: 1;">
          <strong>${escapeHtml(filename)}</strong> ${sourceLabel}
          <div style="font-size: 0.875rem; color: #6c757d;">${formatSize(size)}</div>
        </div>
        <button class="clear-manifest" title="${t('remove')}">&times;</button>
      `;
      el.manifestStatus.classList.remove('hidden');
      el.manifestStatus.classList.add('loaded');

      const clearBtn = el.manifestStatus.querySelector('.clear-manifest');
      clearBtn?.addEventListener('click', clearManifest);
    }
  }

  function clearManifest(): void {
    state.manifest = null;
    hideTlockWaiting();
    el.manifestStatus?.classList.add('hidden');
    el.manifestStatus?.classList.remove('loaded');
    el.manifestDrop?.classList.remove('hidden');
  }

  // ============================================
  // Recovery Screen Setup
  // ============================================

  function setupRecoveryScreen(): void {
    // Check if manifest is needed
    if (!state.manifest) {
      el.manifestArea?.classList.remove('hidden');
    } else {
      el.manifestArea?.classList.add('hidden');
      // Auto-start if conditions met
      if (!state.recovering && !state.recoveryComplete) {
        startRecovery();
      }
    }
  }

  function checkRecoverReady(): void {
    const ready = state.manifest !== null && (
      (state.threshold > 0 && state.shares.length >= state.threshold) ||
      (state.threshold === 0 && state.shares.length >= 2)
    );

    if (ready && !state.recovering && !state.recoveryComplete) {
      navigateTo('recovery');
    }
  }

  // ============================================
  // Tlock UI
  // ============================================

  function showTlockWaiting(unlockDate: Date): void {
    if (!__TLOCK__ || !el.tlockWaiting || !tlockRecover) return;

    if (el.tlockWaitingDate) {
      const fmt = tlockRecover.formatUnlockDate(unlockDate, t);
      const boldDate = `<strong>${fmt.text}</strong>`;
      el.tlockWaitingDate.innerHTML = fmt.relative
        ? t('tlock_waiting_message_relative', boldDate)
        : t('tlock_waiting_message', boldDate);
    }
    el.tlockWaiting.classList.remove('hidden');
    el.progressBar?.classList.add('hidden');
    if (el.statusMessage) el.statusMessage.textContent = '';
  }

  function hideTlockWaiting(): void {
    if (__TLOCK__) tlockRecover?.stopWaiting();
    el.tlockWaiting?.classList.add('hidden');
  }

  // ============================================
  // Recovery Process
  // ============================================

  async function startRecovery(): Promise<void> {
    if (state.recovering) return;
    state.recovering = true;

    el.progressBar?.classList.remove('hidden');
    if (el.statusMessage) el.statusMessage.className = 'status-message';
    if (el.filesList) el.filesList.innerHTML = '';
    el.downloadActions?.classList.add('hidden');

    try {
      setProgress(10);
      setStatus(t('combining'));

      // Convert shares to raw bytes and combine
      const shareBytes = state.shares.map(s => base64ToBytes(s.dataB64));
      const recovered = await combine(shareBytes);
      const version = state.shares[0].version;
      const passphrase = recoverPassphrase(recovered, version);

      setProgress(30);

      // age-decrypt
      setStatus(t('decrypting'));
      let archive = await decrypt(state.manifest!, passphrase);

      setProgress(50);

      // Check for tlock container (post-decryption)
      if (isTlockContainer(archive)) {
        if (!__TLOCK__ || !tlockRecover) {
          toast.error(t('error_title'), t('tlock_no_support'));
          throw new Error('Time-lock decryption not available');
        }

        // Save container for failsafe download if tlock decrypt fails
        tlockContainerData = archive;

        const { meta, ciphertext } = openTlockContainer(archive);
        const unlockDate = new Date(meta.unlock);

        if (unlockDate > new Date()) {
          showTlockWaiting(unlockDate);
          tlockRecover.waitAndDecrypt(
            meta,
            ciphertext,
            (date) => showTlockWaiting(date),
            async (decryptedArchive) => {
              hideTlockWaiting();
              tlockContainerData = null;
              state.recovering = true;
              el.progressBar?.classList.remove('hidden');
              try {
                setProgress(60);
                await finishRecovery(decryptedArchive);
              } catch (err) {
                handleRecoveryError(err);
              } finally {
                state.recovering = false;
              }
            },
            (err) => {
              hideTlockWaiting();
              handleTlockError(err);
            },
          );
          state.recovering = false;
          return;
        }

        // Time lock passed — decrypt now
        setStatus(t('tlock_decrypting'));
        try {
          archive = await tlockRecover.decrypt(ciphertext);
          tlockContainerData = null;
        } catch (tlockErr) {
          handleTlockError(tlockErr);
          return;
        }
      }

      setProgress(60);
      await finishRecovery(archive);

    } catch (err) {
      handleRecoveryError(err);
    } finally {
      state.recovering = false;
    }
  }

  async function finishRecovery(archive: Uint8Array): Promise<void> {
    state.decryptedArchive = archive;

    setStatus(t('reading'));
    const files = await extractArchive(archive);

    setProgress(90);

    files.forEach(file => {
      const item = document.createElement('div');
      item.className = 'file-item';
      item.innerHTML = `
        <span class="icon">&#128196;</span>
        <span class="name">${escapeHtml(file.name)}</span>
        <span class="size">${formatSize(file.data.length)}</span>
      `;
      el.filesList?.appendChild(item);
    });

    setProgress(100);
    setStatus(t('complete'), 'success', t('complete_subtitle'));
    el.downloadActions?.classList.remove('hidden');
    state.recoveryComplete = true;

    // Update recovery title
    if (el.recoveryTitle) {
      const titleSpan = el.recoveryTitle.querySelector('[data-i18n="step3_title"]');
      if (titleSpan) titleSpan.textContent = t('step3_complete_title');
    }
  }

  function handleRecoveryError(err: unknown): void {
    const errorMsg = (err instanceof Error) ? err.message : String(err);

    if (errorMsg.includes('decrypt') || errorMsg.includes('passphrase') || errorMsg.includes('incorrect')) {
      errorHandlers.decryptionFailed(err);
      setStatus(t('error_decrypt_status'), 'error');
    } else if (errorMsg.includes('extract') || errorMsg.includes('tar') || errorMsg.includes('gzip')) {
      errorHandlers.extractionFailed(err);
      setStatus(t('error_extract_status'), 'error');
    } else {
      toast.error(
        t('error_recovery_title'),
        errorMsg,
        t('error_recovery_guidance'),
        [
          { id: 'retry', label: t('action_try_again'), primary: true, onClick: () => startRecovery() }
        ]
      );
      setStatus(t('error', errorMsg), 'error');
    }
  }

  function handleTlockError(_err: unknown): void {
    const actions: ToastAction[] = [];

    if (tlockContainerData) {
      actions.push({
        id: 'download-tlock',
        label: t('tlock_download_archive'),
        primary: true,
        onClick: () => downloadTlockContainer(),
      });
    }
    actions.push({
      id: 'retry',
      label: t('action_try_again'),
      primary: !tlockContainerData,
      onClick: () => startRecovery(),
    });

    toast.error(
      t('tlock_error_title'),
      t('tlock_error_message'),
      t('tlock_error_guidance'),
      actions,
    );
    setStatus(t('tlock_error_status'), 'error');

    state.recovering = false;
  }

  function downloadTlockContainer(): void {
    if (!tlockContainerData) return;
    const blob = new Blob([tlockContainerData as BlobPart], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'MANIFEST.tlock.zip';
    a.click();
    URL.revokeObjectURL(url);
  }

  // ============================================
  // Progress & Status
  // ============================================

  function setProgress(percent: number): void {
    const fill = el.progressBar?.querySelector('.fill') as HTMLElement | null;
    if (fill) {
      fill.style.width = percent + '%';
    }
  }

  function setStatus(msg: string, type?: string, subtitle?: string): void {
    if (el.statusMessage) {
      el.statusMessage.textContent = msg;
      el.statusMessage.className = 'status-message' + (type ? ' ' + type : '');
      if (subtitle) {
        const sub = document.createElement('span');
        sub.className = 'status-subtitle';
        sub.textContent = subtitle;
        el.statusMessage.appendChild(sub);
      }
    }
  }

  // ============================================
  // Download
  // ============================================

  function downloadAll(): void {
    if (!state.decryptedArchive) return;

    const archive = state.decryptedArchive;
    const isZip = archive.length >= 2 && archive[0] === 0x50 && archive[1] === 0x4B;
    const mimeType = isZip ? 'application/zip' : 'application/gzip';
    const fileName = isZip ? 'archive.zip' : 'archive.tar.gz';

    const blob = new Blob([archive as BlobPart], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);

    clearSensitiveState();
  }

  function clearSensitiveState(): void {
    state.decryptedArchive = undefined;
    state.manifest = null;
  }

  // ============================================
  // Word Extraction
  // ============================================

  // extractWordsFromText extracts BIP39 words from text, handling:
  //   - Numbered two-column grids: " 1. merit   14. beef" (sorted by number)
  //   - Plain word lists: "merit often shuffle wedding"
  // Supports Unicode letters (accented/umlauted characters like ábaco, günther).
  function extractWordsFromText(text: string): string[] {
    // Try to parse numbered format first (e.g. "1. word", "13. ábaco")
    const numbered: { idx: number; word: string }[] = [];
    const re = /(\d+)\.\s+([\p{L}]+)/gu;
    let m;
    while ((m = re.exec(text)) !== null) {
      numbered.push({ idx: parseInt(m[1], 10), word: m[2].toLowerCase() });
    }

    if (numbered.length >= 25) {
      // Sort by number to handle two-column grids correctly
      numbered.sort((a, b) => a.idx - b.idx);
      return numbered.map(e => e.word);
    }

    // Fallback: plain word list (no numbers)
    return text
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 0 && /^[\p{L}]+$/u.test(w));
  }

  // ============================================
  // Utility Functions
  // ============================================

  function readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  // Expose public manifest loading API for programmatic use (used by auto-fetch below)
  window.rememoryLoadManifest = function(data: Uint8Array, name?: string): void {
    state.manifest = data;
    showManifestLoaded(name || 'MANIFEST.age', data.length, 'server');
    checkRecoverReady();
  };

  // ============================================
  // Global Exports & Startup
  // ============================================

  window.rememoryUpdateUI = function(): void {
    // Re-render current wizard screen on language change
    if (wizardScreen === 'welcome') setupWelcome();
    if (wizardScreen === 'contacts') { renderContacts(); updateProgress(); }
    if (wizardScreen === 'add-piece') setupAddPiece();
  };

  document.addEventListener('DOMContentLoaded', async () => {
    await init();

    // Auto-fetch manifest if a URL is configured (server or static pages)
    const manifestConfig = window.SELFHOSTED_CONFIG;
    if (manifestConfig?.manifestURL) {
      try {
        const resp = await fetch(manifestConfig.manifestURL);
        if (resp.ok) {
          const data = new Uint8Array(await resp.arrayBuffer());
          if (data.length > 0 && !state.manifest) {
            window.rememoryLoadManifest!(data, 'MANIFEST.age');
          }
        }
      } catch {
        // Not reachable — user can still load manifest manually
      }
    }
  });
})();
