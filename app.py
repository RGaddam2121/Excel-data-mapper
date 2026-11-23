import os
from flask import Flask, render_template, request, jsonify, send_file
import openpyxl
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

def get_column_letter(col_idx):
    return openpyxl.utils.get_column_letter(col_idx)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_files():
    if 'source_file' not in request.files:
        return jsonify({'error': 'Source file is required'}), 400
    
    source_file = request.files['source_file']
    if source_file.filename == '':
        return jsonify({'error': 'No source file selected'}), 400

    source_path = os.path.join(app.config['UPLOAD_FOLDER'], secure_filename('source_' + source_file.filename))
    source_file.save(source_path)

    target_file_path = request.form.get('target_file_path', '').strip().strip('"\'')
    target_mode = request.form.get('target_mode', 'upload')

    if target_mode == 'path' or target_file_path:
        if not target_file_path:
            return jsonify({'error': 'Target file path cannot be empty'}), 400
        if not os.path.exists(target_file_path):
            return jsonify({'error': f'Target file not found at path: {target_file_path}'}), 400
        target_path = target_file_path
        is_direct_laptop_file = True
    else:
        if 'target_file' not in request.files or request.files['target_file'].filename == '':
            return jsonify({'error': 'No target file provided'}), 400
        target_file = request.files['target_file']
        target_path = os.path.join(app.config['UPLOAD_FOLDER'], secure_filename('target_' + target_file.filename))
        target_file.save(target_path)
        is_direct_laptop_file = False
    
    try:
        source_wb = openpyxl.load_workbook(source_path, data_only=True)
        target_wb = openpyxl.load_workbook(target_path, data_only=False)
        
        return jsonify({
            'source_sheets': source_wb.sheetnames,
            'target_sheets': target_wb.sheetnames,
            'source_path': source_path,
            'target_path': target_path,
            'is_direct_laptop_file': is_direct_laptop_file
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/columns', methods=['POST'])
def get_columns():
    data = request.json
    file_path = data.get('file_path')
    sheet_name = data.get('sheet_name')
    start_row = int(data.get('start_row', 1))
    
    try:
        wb = openpyxl.load_workbook(file_path, data_only=True)
        sheet = wb[sheet_name]
        
        columns = []
        for col_idx, cell in enumerate(sheet[start_row], 1):
            col_letter = get_column_letter(col_idx)
            header_val = str(cell.value) if cell.value is not None else f"Column {col_letter}"
            columns.append({'index': col_idx, 'letter': col_letter, 'name': header_val})
            
        return jsonify({'columns': columns})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/process', methods=['POST'])
def process():
    data = request.json
    
    source_path = data.get('source_path')
    target_path = data.get('target_path')
    
    source_sheet_name = data.get('source_sheet')
    target_sheet_name = data.get('target_sheet')
    
    source_start_row = int(data.get('source_start_row'))
    target_start_row = int(data.get('target_start_row'))
    
    source_key_col = int(data.get('source_key_col'))
    target_key_col = int(data.get('target_key_col'))
    
    column_mappings = data.get('column_mappings', [])
    
    try:
        source_wb = openpyxl.load_workbook(source_path, data_only=True)
        source_sheet = source_wb[source_sheet_name]
        
        target_wb = openpyxl.load_workbook(target_path)
        target_sheet = target_wb[target_sheet_name]
        
        def normalize_key(key):
            if key is None:
                return None
            key_str = str(key).strip().lower()
            if key_str.endswith('.0'):
                key_str = key_str[:-2]
            return key_str

        lookup_dict = {}
        for row in range(source_start_row, source_sheet.max_row + 1):
            key = source_sheet.cell(row=row, column=source_key_col).value
            
            norm_key = normalize_key(key)
            if norm_key is not None:
                vals = {}
                for mapping in column_mappings:
                    s_col = int(mapping['source'])
                    vals[s_col] = source_sheet.cell(row=row, column=s_col).value
                lookup_dict[norm_key] = vals
                
        updates_made = 0
        for row in range(target_start_row, target_sheet.max_row + 1):
            target_key = target_sheet.cell(row=row, column=target_key_col).value
            norm_target_key = normalize_key(target_key)
            if norm_target_key is not None and norm_target_key in lookup_dict:
                vals = lookup_dict[norm_target_key]
                for mapping in column_mappings:
                    s_col = int(mapping['source'])
                    t_col = int(mapping['target'])
                    target_sheet.cell(row=row, column=t_col).value = vals[s_col]
                updates_made += 1
                    
        is_direct_laptop_file = data.get('is_direct_laptop_file', False)
        if is_direct_laptop_file:
            # Directly overwrite the original file on the user's laptop
            target_wb.save(target_path)
            return jsonify({
                'message': f'Successfully updated {updates_made} rows directly in: {target_path}',
                'target_path': target_path,
                'overwritten_direct': True
            })
        else:
            output_filename = f"updated_{os.path.basename(target_path)}"
            output_path = os.path.join(app.config['UPLOAD_FOLDER'], output_filename)
            target_wb.save(output_path)
            
            return jsonify({
                'message': f'Successfully updated {updates_made} rows.',
                'download_url': f'/download/{output_filename}',
                'overwritten_direct': False
            })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/download/<filename>')
def download(filename):
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    return send_file(file_path, as_attachment=True)

if __name__ == '__main__':
    app.run(debug=True, port=5000)

