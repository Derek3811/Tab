// Elements
const fileInput = document.getElementById('file-input');
const folderInput = document.getElementById('folder-input');
const tabTypeSelect = document.getElementById('tab-type');
const paperSizeSelect = document.getElementById('paper-size');
const printModeSelect = document.getElementById('print-mode');
const startPosInput = document.getElementById('start-pos');
const numericModeControls = document.getElementById('numeric-mode-controls');
const numStartInput = document.getElementById('num-start');
const numEndInput = document.getElementById('num-end');

const offsetXInput = document.getElementById('offset-x');
const offsetYInput = document.getElementById('offset-y');
const pageRangeInput = document.getElementById('page-range');
const sortAzToggle = document.getElementById('sort-az');
const rotatePageToggle = document.getElementById('rotate-page');
const rotateTextToggle = document.getElementById('rotate-text');
const debugOverlayToggle = document.getElementById('debug-overlay');
const manualReorderList = document.getElementById('manual-reorder-list');
const resizer = document.getElementById('resizer');
const controlsPanel = document.querySelector('.controls-panel');

const previewContainer = document.getElementById('preview-container');
const previewStatus = document.getElementById('preview-status');
const printSummary = document.getElementById('print-summary');
const summaryDetails = document.getElementById('summary-details');
const printBtn = document.getElementById('print-btn');
const pdfBtn = document.getElementById('pdf-btn');
const printTarget = document.getElementById('print-target');

const optionsHeader = document.getElementById('options-header');
const optionsContent = document.getElementById('options-content');

// State
let isDragging = false;

// Global state
let activeTabs = [];
let tabFontSizes = []; // Store font sizes per tab
let isPrinting = false;
let sortableInstance = null;

// Initialize
function init() {
  optionsHeader.addEventListener('click', () => {
    optionsContent.classList.toggle('open');
    optionsHeader.querySelector('span:last-child').textContent = optionsContent.classList.contains('open') ? '▲' : '▼';
  });

  tabTypeSelect.addEventListener('change', handleConfigChange);
  printModeSelect.addEventListener('change', updatePreview);
  startPosInput.addEventListener('change', updatePreview);
  offsetXInput.addEventListener('change', updatePreview);
  offsetYInput.addEventListener('change', updatePreview);
  numStartInput.addEventListener('change', handleNumericChange);
  numEndInput.addEventListener('change', handleNumericChange);
  document.getElementById('font-size').addEventListener('change', (e) => {
    const newSize = e.target.value || 12;
    tabFontSizes = tabFontSizes.map(() => newSize);
    updatePreview();
  });
  sortAzToggle.addEventListener('change', processTabs);
  rotatePageToggle.addEventListener('change', updatePreview);
  rotateTextToggle.addEventListener('change', updatePreview);
  debugOverlayToggle.addEventListener('change', updatePreview);

  printBtn.addEventListener('click', () => doPrint(false));
  pdfBtn.addEventListener('click', doPdf);
  document.getElementById('test-print-btn').addEventListener('click', () => doPrint(true));


  fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
  folderInput.addEventListener('change', (e) => handleFiles(e.target.files));

  // Resizer Logic
  let isResizing = false;
  resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    resizer.classList.add('resizing');
    document.body.style.cursor = 'col-resize';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const containerOffset = controlsPanel.parentElement.getBoundingClientRect().left;
    const newWidth = e.clientX - containerOffset - 20; // 20px padding
    if (newWidth >= 200 && newWidth <= 600) {
      controlsPanel.style.flex = `0 0 ${newWidth}px`;
    }
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      resizer.classList.remove('resizing');
      document.body.style.cursor = '';
    }
  });

  [previewContainer].forEach(el => {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      el.addEventListener(eventName, preventDefaults, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
      el.addEventListener(eventName, () => el.classList.add('drag-over'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      el.addEventListener(eventName, () => el.classList.remove('drag-over'), false);
    });
  });

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  // Handle clicking the empty state for manual selection
  previewContainer.addEventListener('click', (e) => {
    if (activeTabs.length === 0) {
      const choice = confirm("Click OK to select a FOLDER, or Cancel to select FILES/TXT.");
      if (choice) {
        folderInput.click();
      } else {
        fileInput.click();
      }
    }
  });

  previewContainer.addEventListener('drop', handleDrop, false);
}

function handleConfigChange() {
  const isNumeric = tabTypeSelect.value === '25';
  numericModeControls.style.display = isNumeric ? 'block' : 'none';
  if (isNumeric) {
    handleNumericChange();
  } else {
    processTabs();
  }
}

function applyBatchFontSizes() {
  tabFontSizes = new Array(activeTabs.length);
  const is25Cut = tabTypeSelect.value === '25';
  
  let hasLongText = false;
  const lineEstimates = activeTabs.map(text => {
    let lines = 1;
    if (text.includes('\n')) {
      lines = text.split('\n').length;
    } else {
      if (text.length > 45) lines = 3;
      else if (text.length > 22) lines = 2;
    }
    if (lines >= 3) hasLongText = true;
    return lines;
  });

  for (let i = 0; i < activeTabs.length; i++) {
    const lines = lineEstimates[i];
    if (is25Cut) {
      tabFontSizes[i] = 7;
    } else if (hasLongText) {
      // Long text batch rules
      tabFontSizes[i] = (lines >= 3) ? 7.5 : 10;
    } else {
      // Short text batch rules
      tabFontSizes[i] = (lines >= 2) ? 10 : 12;
    }
  }
}

function handleNumericChange() {
  if (tabTypeSelect.value !== '25') return;
  const start = parseInt(numStartInput.value) || 1;
  const end = parseInt(numEndInput.value) || 25;

  let newTabs = [];
  for (let i = start; i <= end; i++) {
    newTabs.push(i.toString());
  }
  activeTabs = newTabs;
  applyBatchFontSizes();
  sortAzToggle.checked = false;
  sortAzToggle.disabled = true;
  processTabs();
}

async function handleDrop(e) {
  if (tabTypeSelect.value === '25') {
    alert("Numeric mode is active. Drag & drop is ignored. Switch tab density to load files.");
    return;
  }
  const files = e.dataTransfer.files;
  handleFiles(files);
}

async function handleFiles(files) {
  if (files.length === 0) return;

  // If it's a single .txt file, read it
  if (files.length === 1 && files[0].name.endsWith('.txt')) {
    const text = await files[0].text();
    activeTabs = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  } else {
    // If multiple files or a folder (via webkitdirectory)
    // Process names: remove extensions, trim
    const names = Array.from(files).map(f => {
      let name = f.name;
      if (f.webkitRelativePath) {
        // If it's a folder drop, we might want subfolders, but browser gives all files.
        // Usually users drop a folder of folders. 
        // We'll try to get the top-level items in the drop.
        const parts = f.webkitRelativePath.split('/');
        if (parts.length > 1) return parts[1]; // Subfolder name
      }
      return name.replace(/\.[^/.]+$/, "").trim();
    });

    // Unique names
    activeTabs = [...new Set(names)].filter(n => n.length > 0);
  }

  if (activeTabs.length > 0) {
    applyBatchFontSizes();
    startPosInput.value = 1;
    sortAzToggle.disabled = false;
    processTabs();
  } else {
    alert("No valid items found.");
  }
}

function processTabs() {
  if (activeTabs.length === 0) {
    updatePreview();
    return;
  }

  if (sortAzToggle.checked && tabTypeSelect.value !== '25') {
    // Sort logic needs to update font size array as well
    const combined = activeTabs.map((text, i) => ({ text, size: tabFontSizes[i] }));
    combined.sort((a, b) => a.text.localeCompare(b.text, undefined, { numeric: true, sensitivity: 'base' }));
    activeTabs = combined.map(c => c.text);
    tabFontSizes = combined.map(c => c.size);
  }

  manualReorderList.innerHTML = '';
  activeTabs.forEach((text, index) => {
    const item = document.createElement('div');
    item.className = 'sortable-item';
    item.dataset.index = index;
    item.textContent = text;
    manualReorderList.appendChild(item);
  });

  if (sortableInstance) sortableInstance.destroy();
  sortableInstance = new Sortable(manualReorderList, {
    animation: 150,
    onEnd: () => {
      sortAzToggle.checked = false;
      const newOrder = [];
      const newSizes = [];
      manualReorderList.querySelectorAll('.sortable-item').forEach(el => {
        const oldIndex = parseInt(el.dataset.index);
        newOrder.push(el.textContent);
        newSizes.push(tabFontSizes[oldIndex]);
      });
      activeTabs = newOrder;
      tabFontSizes = newSizes;
      updatePreview();
    }
  });

  updatePreview();
}

function updatePreview() {
  if (activeTabs.length === 0) {
    previewContainer.innerHTML = '<div class="empty-state">Drop files here, click to upload, or switch to Numeric Mode to start</div>';
    previewStatus.textContent = '0 items';
    printSummary.style.display = 'none';
    printBtn.disabled = true;
    pdfBtn.disabled = true;
    return;
  }

  const tabCount = parseInt(tabTypeSelect.value);
  const startPos = parseInt(startPosInput.value) || 1;
  const mode = printModeSelect.value;

  previewStatus.textContent = `${activeTabs.length} items`;

  // Calculate total pages for the summary
  let totalPages = 0;
  if (mode === 'single') {
    totalPages = activeTabs.length;
  } else {
    let currentPos = startPos - 1;
    let pages = 0;
    for (let i = 0; i < activeTabs.length; i++) {
      currentPos++;
      if (currentPos % tabCount === 0 || i === activeTabs.length - 1) {
        pages++;
        if (currentPos % tabCount === 0) currentPos = 0;
      }
    }
    totalPages = pages;
  }

  printSummary.style.display = 'block';
  summaryDetails.innerHTML = `
    <strong>First Item:</strong> ${activeTabs[0].replace(/\n/g, ' ')}<br>
    <strong>Start Position:</strong> ${startPos}<br>
    <strong>Mode:</strong> ${mode === 'single' ? 'Single Tab (1 tab per page)' : 'Full Page (Fill all)'}<br>
    <strong>Total:</strong> ${activeTabs.length} tab(s) &rarr; ${totalPages} page(s)
  `;

  const modeText = mode === 'single' ? 'Single Tab' : 'Full Page';
  printBtn.textContent = `Print ${activeTabs.length} tabs → ${totalPages} pages (${modeText})`;
  printBtn.disabled = false;
  pdfBtn.disabled = false;

  previewContainer.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = `preview-grid density-${tabCount}`;

  // Continuous Grid Preview
  // 1. Fill empty cells before startPos
  for (let i = 1; i < startPos; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.className = 'preview-cell empty';
    grid.appendChild(emptyCell);
  }

  // 2. Render all active tabs in one continuous grid
  const tabWidthInches = 11 / tabCount;
  const globalFontSize = document.getElementById('font-size').value || 12;
  
  activeTabs.forEach((text, i) => {
    const cell = document.createElement('div');
    cell.className = 'preview-cell';
    
    // Initialize font size if not set
    if (!tabFontSizes[i]) tabFontSizes[i] = globalFontSize;
    
    // Per-tab font control container
    const fontControl = document.createElement('div');
    fontControl.className = 'tab-font-control';

    // Up button (left)
    const btnUp = document.createElement('button');
    btnUp.className = 'font-btn';
    btnUp.title = 'Increase font size';
    btnUp.textContent = '+';

    const fontInput = document.createElement('input');
    fontInput.type = 'number';
    fontInput.step = '0.5';
    fontInput.className = 'tab-font-input';
    fontInput.title = 'Font size for this specific tab';
    fontInput.value = tabFontSizes[i];

    // Down button (right)
    const btnDown = document.createElement('button');
    btnDown.className = 'font-btn';
    btnDown.title = 'Decrease font size';
    btnDown.textContent = '-';

    fontControl.appendChild(btnUp);
    fontControl.appendChild(fontInput);
    fontControl.appendChild(btnDown);

    const textSpan = createEditableText(text, i, tabFontSizes[i]);

    function updateFontSize(val) {
      tabFontSizes[i] = val;
      textSpan.style.fontSize = `${val}pt`;
    }

    btnUp.addEventListener('click', () => {
      let val = parseFloat(fontInput.value) || 12;
      val += 0.5;
      fontInput.value = val;
      updateFontSize(val);
    });

    btnDown.addEventListener('click', () => {
      let val = parseFloat(fontInput.value) || 12;
      val = Math.max(1, val - 0.5);
      fontInput.value = val;
      updateFontSize(val);
    });

    fontInput.addEventListener('change', (e) => {
      updateFontSize(parseFloat(e.target.value) || 12);
    });

    cell.appendChild(fontControl);
    cell.appendChild(textSpan);
    grid.appendChild(cell);
  });

  previewContainer.appendChild(grid);
}

function createEditableText(text, index, fontSize) {
  const textSpan = document.createElement('div');
  textSpan.className = 'preview-cell-text';
  textSpan.contentEditable = true;
  
  textSpan.style.fontSize = `${fontSize}pt`;
  textSpan.textContent = text;
  
  textSpan.addEventListener('input', (e) => {
    activeTabs[index] = e.target.innerText;
  });
  
  return textSpan;
}

function doPrint(isTest) {
  const tabsToPrint = isTest ? ['Test Print Tab'] : activeTabs;
  if (tabsToPrint.length === 0) return;

  const data = {
    tabs: tabsToPrint,
    type: tabTypeSelect.value,
    mode: isTest ? 'single' : printModeSelect.value,
    startPos: parseInt(startPosInput.value) || 1,
    offsetX: parseFloat(offsetXInput.value) || 0,
    offsetY: parseFloat(offsetYInput.value) || 0,
    paperSize: paperSizeSelect.value,
    debug: debugOverlayToggle.checked,
    rotatePage: rotatePageToggle.checked,
    rotateText: rotateTextToggle.checked
  };

  renderPrintJob(data);

  // Larger delay (500ms) to ensure DOM is fully ready
  setTimeout(() => {
    window.print();
  }, 500);
}

function doPdf() {
  const tabsToPrint = activeTabs;
  if (tabsToPrint.length === 0) return;

  const type = tabTypeSelect.value;
  const mode = printModeSelect.value;
  const startPos = parseInt(startPosInput.value) || 1;
  const offsetX = parseFloat(offsetXInput.value) || 0;
  const offsetY = parseFloat(offsetYInput.value) || 0;
  const paperSize = paperSizeSelect.value;
  const rotateText = rotateTextToggle.checked;

  const tabCount = parseInt(type);
  const pageWidthInches = paperSize === '9x11' ? 9 : 8.5;
  const pageHeightInches = 11;
  const tabHeightInches = pageHeightInches / tabCount;

  // Build pages logic (same as print)
  let pages = [];
  if (mode === 'single') {
    let currentPos = parseInt(startPos) - 1;
    for (let i = 0; i < tabsToPrint.length; i++) {
      let posIndex = currentPos % tabCount;
      pages.push([{ text: tabsToPrint[i], posIndex, globalIndex: i }]);
      currentPos++;
    }
  } else {
    let currentPos = parseInt(startPos) - 1;
    let currentPage = [];
    for (let i = 0; i < tabsToPrint.length; i++) {
      let posIndex = currentPos % tabCount;
      currentPage.push({ text: tabsToPrint[i], posIndex, globalIndex: i });
      currentPos++;
      if (currentPos % tabCount === 0 || i === tabsToPrint.length - 1) {
        pages.push(currentPage);
        currentPage = [];
        if (currentPos % tabCount === 0) currentPos = 0;
      }
    }
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'in',
    format: [pageWidthInches, pageHeightInches]
  });

  const xOffsetIn = offsetX / 25.4;
  const yOffsetIn = offsetY / 25.4;

  pages.forEach((pageTabs, pageIndex) => {
    if (pageIndex > 0) doc.addPage();
    
    pageTabs.forEach(t => {
      // Calculate center of the tab
      // The tab is typically 0.5in wide, situated at the far right.
      // So its center is pageWidth - 0.25in
      const tabXCenter = pageWidthInches - 0.25 + xOffsetIn;
      const tabYCenter = (t.posIndex * tabHeightInches) + (tabHeightInches / 2) + yOffsetIn;

      const fontSizePt = parseFloat(tabFontSizes[t.globalIndex]) || 12;
      doc.setFontSize(fontSizePt);
      doc.setFont("helvetica", "normal");

      // CSS padding limits the height available for text. 
      // Top padding 4mm, bottom padding 2mm = 6mm total padding ~ 0.236 inches.
      const maxLineWidth = tabHeightInches - (6 / 25.4);
      
      // Auto-wrap the text exactly like CSS
      const textLines = doc.splitTextToSize(t.text, maxLineWidth);
      
      // Rotate 90 degrees counter-clockwise normally. If rotateText is checked, rotate clockwise (angle -90 + 180 = 90)
      // Note: jsPDF angle rotates counter-clockwise.
      const angle = rotateText ? 90 : -90; 

      doc.text(textLines, tabXCenter, tabYCenter, {
        align: 'center',
        baseline: 'middle',
        angle: angle
      });
    });
  });

  doc.save('Custom_Tabs.pdf');
}

function renderPrintJob(data) {
  const { tabs, type, mode, startPos, offsetX, offsetY, debug, rotatePage, rotateText, paperSize } = data;
  const tabCount = parseInt(type);

  printTarget.innerHTML = '';
  if (debug) printTarget.classList.add('debug-mode');
  else printTarget.classList.remove('debug-mode');

  // Inject dynamic page size to force browser/PDF printers to use selected dimensions
  const pageWidthInches = paperSize === '9x11' ? 9 : 8.5;
  let dynamicStyle = document.getElementById('dynamic-print-style');
  if (!dynamicStyle) {
    dynamicStyle = document.createElement('style');
    dynamicStyle.id = 'dynamic-print-style';
    document.head.appendChild(dynamicStyle);
  }
  dynamicStyle.innerHTML = `@page { size: ${pageWidthInches}in 11in; margin: 0; }`;

  const pageHeightInches = 11;
  const tabHeightInches = pageHeightInches / tabCount;

  let pages = [];
  if (mode === 'single') {
    let currentPos = parseInt(startPos) - 1;
    for (let i = 0; i < tabs.length; i++) {
      let posIndex = currentPos % tabCount;
      pages.push([{ text: tabs[i], posIndex, globalIndex: i }]);
      currentPos++;
    }
  } else {
    let currentPos = parseInt(startPos) - 1;
    let currentPage = [];
    for (let i = 0; i < tabs.length; i++) {
      let posIndex = currentPos % tabCount;
      currentPage.push({ text: tabs[i], posIndex, globalIndex: i });
      currentPos++;
      if (currentPos % tabCount === 0 || i === tabs.length - 1) {
        pages.push(currentPage);
        currentPage = [];
        if (currentPos % tabCount === 0) currentPos = 0;
      }
    }
  }

  pages.forEach(pageTabs => {
    const pageDiv = document.createElement('div');
    pageDiv.className = 'print-page';
    pageDiv.style.cssText = `width: ${pageWidthInches}in; height: 11in; position: relative; page-break-after: always; box-sizing: border-box; overflow: hidden; background: #fff;`;

    const pageContainer = document.createElement('div');
    pageContainer.className = 'page-container';
    pageContainer.style.cssText = `width: 100%; height: 100%; position: relative; ${rotatePage ? 'transform: rotate(180deg); transform-origin: center center;' : ''}`;

    pageTabs.forEach(t => {
      const tabDiv = document.createElement('div');
      tabDiv.className = 'tab';
      const borderStyle = debug ? 'border: 1px solid #ccc;' : '';
      tabDiv.style.cssText = `position: absolute; right: 0; width: 0.5in; display: flex; align-items: center; justify-content: center; text-align: center; font-weight: bold; box-sizing: border-box; height: ${tabHeightInches}in; top: ${t.posIndex * tabHeightInches}in; margin-right: ${offsetX}mm; margin-top: ${offsetY}mm; ${borderStyle}`;

      const textDiv = document.createElement('div');
      textDiv.className = 'tab-text';
      // Use physical padding to push text away from the right edge (top when horizontal)
      textDiv.style.cssText = `writing-mode: vertical-rl; white-space: pre-wrap; text-align: center; line-height: 1.0; max-width: 0.42in; padding-top: 4mm; padding-right: 3mm; padding-bottom: 2mm; color: #000; ${rotateText ? 'transform: rotate(180deg);' : ''}`;

      const userFontSize = tabFontSizes[t.globalIndex] || document.getElementById('font-size').value || 12;
      textDiv.style.fontSize = `${userFontSize}pt`;
      textDiv.textContent = t.text;

      tabDiv.appendChild(textDiv);
      pageContainer.appendChild(tabDiv);

    });

    pageDiv.appendChild(pageContainer);
    printTarget.appendChild(pageDiv);
  });
}

// Remove the direct init() call here
document.addEventListener('DOMContentLoaded', init);
