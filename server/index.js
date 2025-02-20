import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';
import dotenv from 'dotenv';
import multer from 'multer';
import fs from 'fs';
import pdfParse from 'pdf-parse';
import csvParser from 'csv-parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOADS_DIR = join(__dirname, 'uploads/');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, '../dist')));

const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'text/csv', 'text/plain'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type! Only PDF, CSV, and TXT are allowed.'));
    }
  },
});

let submissions = [
  { id: '1', firstName: 'John', lastName: 'Doe', employeeId: 'ABC-12345', salary: 50000 },
  { id: '2', firstName: 'Jane', lastName: 'Smith', employeeId: 'ABC-12344', salary: 60000 },
];

app.post('/api/submit', (req, res) => {
  const formData = { id: Date.now().toString(), ...req.body };
  submissions.push(formData);
  res.json({ data: formData });
});

app.get('/api/submissions', (req, res) => {
  res.json(submissions);
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const filePath = join(UPLOADS_DIR, req.file.filename);
  const ext = extname(req.file.originalname).toLowerCase();
  console.log(`Processing file: ${filePath}`);

  try {
    let extractedData;

    if (ext === '.pdf') {
      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await pdfParse(dataBuffer);
      extractedData = pdfData.text;
    } else if (ext === '.csv') {
      extractedData = await new Promise((resolve, reject) => {
        const results = [];
        fs.createReadStream(filePath)
          .pipe(csvParser())
          .on('data', (row) => results.push(row))
          .on('end', () => resolve(results))
          .on('error', (err) => reject(err));
      });
    } else if (ext === '.txt') {
      extractedData = fs.readFileSync(filePath, 'utf8');
    } else {
      throw new Error('Unsupported file type');
    }

    res.json({ message: 'File processed successfully', data: extractedData });
  } catch (err) {
    console.error('Error processing file:', err);
    res.status(500).json({ error: 'Error processing file', details: err.message });
  } finally {
    fs.unlink(filePath, (unlinkErr) => {
      if (unlinkErr) console.error(`Failed to delete file: ${filePath}`, unlinkErr);
      else console.log(`Deleted file: ${filePath}`);
    });
  }
});
// Helper function to parse search queries
const parseSearchQuery = (query) => {
  const filters = {};
  const regex = /(\w+):"([^"]+)"|(\w+):([\w@\.-]+)|(\w+):(\d+)\.\.(\d+)/g;
  let match;

  while ((match = regex.exec(query)) !== null) {
    if (match[1] && match[2]) {
      filters[match[1]] = match[2]; // Exact phrase match
    } else if (match[3] && match[4]) {
      filters[match[3]] = match[4]; // Field-specific match
    } else if (match[5] && match[6] && match[7]) {
      filters[match[5]] = { min: parseInt(match[6]), max: parseInt(match[7]) }; // Numeric range
    }
  }
  return filters;
};

// New Advanced Search API
app.get('/api/search', (req, res) => {
  const { search } = req.query; //? expexted query parameter
  if (!search) { //? chekinf if its null
    return res.status(400).json({ error: 'Query parameter "search" is required' });
  }

  const filters = parseSearchQuery(search);
  console.log('Parsed filters:', filters);

  const results = submissions.filter((item) => {
    for (const key in filters) {
      if (typeof filters[key] === 'object' && filters[key].min !== undefined) {
        // Numeric range filtering
        if (item[key] < filters[key].min || item[key] > filters[key].max) {
          return false;
        }
      } else if (typeof item[key] === 'string') {
        // Field-specific or exact match
        if (item[key].toLowerCase() !== filters[key].toLowerCase()) {
          return false;
        }
      }
    }
    return true;
  });

  res.json({ results });
});

app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '../dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});