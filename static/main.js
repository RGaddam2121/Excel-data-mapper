document.addEventListener('DOMContentLoaded', () => {
    // State
    let sessionData = {
        source_path: null,
        target_path: null,
        is_direct_laptop_file: false,
        source_sheets: [],
        target_sheets: [],
        source_cols: [],
        target_cols: []
    };

    // Elements
    const step1 = document.getElementById('step-1');
    const step2 = document.getElementById('step-2');
    const step3 = document.getElementById('step-3');
    const step4 = document.getElementById('step-4');

    const uploadForm = document.getElementById('upload-form');
    const uploadLoading = document.getElementById('upload-loading');
    
    // Toggle Target Mode
    const targetModeRadios = document.querySelectorAll('input[name="target_mode"]');
    const targetPathWrapper = document.getElementById('target-path-wrapper');
    const targetUploadWrapper = document.getElementById('target-upload-wrapper');
    const targetPathInput = document.getElementById('target-file-path');
    const targetFileInput = document.getElementById('target-file');

    targetModeRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            if (radio.value === 'path') {
                targetPathWrapper.style.display = 'block';
                targetUploadWrapper.style.display = 'none';
                targetFileInput.value = '';
            } else {
                targetPathWrapper.style.display = 'none';
                targetUploadWrapper.style.display = 'block';
                targetPathInput.value = '';
            }
        });
    });
    
    // UI Helpers
    function showStep(stepElement) {
        document.querySelectorAll('.step-card').forEach(card => {
            card.style.display = 'none';
            card.classList.remove('active');
        });
        stepElement.style.display = 'block';
        // Add slight delay for animation
        setTimeout(() => stepElement.classList.add('active'), 10);
    }

    function populateSelectElement(selectElement, options, isObject = false) {
        selectElement.innerHTML = '';
        options.forEach(opt => {
            const option = document.createElement('option');
            if (isObject) {
                option.value = opt.index; // Column index (1-based)
                option.textContent = `${opt.letter} - ${opt.name}`;
            } else {
                option.value = opt;
                option.textContent = opt;
            }
            selectElement.appendChild(option);
        });
    }

    function populateSelect(selectId, options, isObject = false) {
        populateSelectElement(document.getElementById(selectId), options, isObject);
    }

    // Step 1: Upload Form Submit
    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const sourceFile = document.getElementById('source-file').files[0];
        const targetMode = document.querySelector('input[name="target_mode"]:checked').value;
        const targetPathVal = targetPathInput.value.trim();
        const targetFile = targetFileInput.files[0];
        
        if (!sourceFile) {
            alert('Please select a source file.');
            return;
        }

        if (targetMode === 'path' && !targetPathVal) {
            alert('Please enter the target file path.');
            return;
        }

        if (targetMode === 'upload' && !targetFile) {
            alert('Please select a target file.');
            return;
        }

        const formData = new FormData();
        formData.append('source_file', sourceFile);
        formData.append('target_mode', targetMode);
        
        if (targetMode === 'path') {
            formData.append('target_file_path', targetPathVal);
        } else {
            formData.append('target_file', targetFile);
        }

        const submitBtn = uploadForm.querySelector('button[type="submit"]');
        submitBtn.style.display = 'none';
        uploadLoading.style.display = 'flex';

        try {
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });
            const data = await response.json();

            if (!response.ok) throw new Error(data.error || 'Upload failed');

            sessionData = { ...sessionData, ...data };
            
            populateSelect('source-sheet', sessionData.source_sheets);
            populateSelect('target-sheet', sessionData.target_sheets);
            
            showStep(step2);
        } catch (error) {
            alert('Error: ' + error.message);
        } finally {
            submitBtn.style.display = 'inline-block';
            uploadLoading.style.display = 'none';
        }
    });

    // Navigation Buttons
    document.getElementById('btn-back-1').addEventListener('click', () => showStep(step1));
    document.getElementById('btn-back-2').addEventListener('click', () => showStep(step2));
    
    document.getElementById('btn-start-over').addEventListener('click', () => {
        uploadForm.reset();
        showStep(step1);
    });

    // Dynamic Mappings Logic
    document.getElementById('add-mapping-btn').addEventListener('click', () => {
        const container = document.getElementById('value-mappings-container');
        const firstRow = container.querySelector('.value-mapping-row');
        const newRow = firstRow.cloneNode(true);
        
        // Show remove button
        newRow.querySelector('.remove-mapping-btn').style.display = 'block';
        
        // Add remove listener
        newRow.querySelector('.remove-mapping-btn').addEventListener('click', () => {
            newRow.remove();
        });
        
        container.appendChild(newRow);
    });

    // Step 2: Next (Get Columns)
    document.getElementById('btn-next-2').addEventListener('click', async () => {
        const sourceSheet = document.getElementById('source-sheet').value;
        const targetSheet = document.getElementById('target-sheet').value;
        const sourceRow = document.getElementById('source-start-row').value;
        const targetRow = document.getElementById('target-start-row').value;

        const btn = document.getElementById('btn-next-2');
        const loading = document.getElementById('columns-loading');
        
        btn.style.display = 'none';
        loading.style.display = 'flex';

        try {
            // Fetch source columns
            const sourceRes = await fetch('/columns', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    file_path: sessionData.source_path,
                    sheet_name: sourceSheet,
                    start_row: sourceRow
                })
            });
            const sourceData = await sourceRes.json();
            if (!sourceRes.ok) throw new Error(sourceData.error);

            // Fetch target columns
            const targetRes = await fetch('/columns', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    file_path: sessionData.target_path,
                    sheet_name: targetSheet,
                    start_row: targetRow
                })
            });
            const targetData = await targetRes.json();
            if (!targetRes.ok) throw new Error(targetData.error);
            
            sessionData.source_cols = sourceData.columns;
            sessionData.target_cols = targetData.columns;

            // Populate mapping dropdowns
            populateSelect('source-key-col', sourceData.columns, true);
            populateSelect('target-key-col', targetData.columns, true);
            
            // Reset value mappings container to 1 row
            const container = document.getElementById('value-mappings-container');
            const firstRow = container.querySelector('.value-mapping-row');
            container.innerHTML = '';
            container.appendChild(firstRow);
            firstRow.querySelector('.remove-mapping-btn').style.display = 'none';
            
            populateSelectElement(firstRow.querySelector('.source-val-col'), sourceData.columns, true);
            populateSelectElement(firstRow.querySelector('.target-val-col'), targetData.columns, true);
            
            showStep(step3);
        } catch (error) {
            alert('Error fetching columns: ' + error.message);
        } finally {
            btn.style.display = 'inline-block';
            loading.style.display = 'none';
        }
    });

    // Step 3: Process
    document.getElementById('btn-process').addEventListener('click', async () => {
        const column_mappings = [];
        document.querySelectorAll('.value-mapping-row').forEach(row => {
            column_mappings.push({
                source: row.querySelector('.source-val-col').value,
                target: row.querySelector('.target-val-col').value
            });
        });

        const payload = {
            source_path: sessionData.source_path,
            target_path: sessionData.target_path,
            is_direct_laptop_file: sessionData.is_direct_laptop_file,
            source_sheet: document.getElementById('source-sheet').value,
            target_sheet: document.getElementById('target-sheet').value,
            source_start_row: document.getElementById('source-start-row').value,
            target_start_row: document.getElementById('target-start-row').value,
            source_key_col: document.getElementById('source-key-col').value,
            target_key_col: document.getElementById('target-key-col').value,
            column_mappings: column_mappings
        };

        const btn = document.getElementById('btn-process');
        const loading = document.getElementById('process-loading');
        
        btn.style.display = 'none';
        loading.style.display = 'flex';

        try {
            const res = await fetch('/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            
            if (!res.ok) throw new Error(data.error);

            document.getElementById('result-message').textContent = data.message;
            const downloadLink = document.getElementById('download-link');
            if (data.download_url) {
                downloadLink.href = data.download_url;
                downloadLink.style.display = 'inline-block';
            } else {
                downloadLink.style.display = 'none';
            }
            
            showStep(step4);
        } catch (error) {
            alert('Error processing files: ' + error.message);
        } finally {
            btn.style.display = 'inline-block';
            loading.style.display = 'none';
        }
    });
});
