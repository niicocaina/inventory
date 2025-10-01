const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 80;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize SQLite database
const db = new sqlite3.Database(':memory:');

// Create tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    price REAL NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Insert sample data
  const sampleProducts = [
    ['Laptop Pro', 'Electronics', 15, 1299.99, 'High-performance laptop'],
    ['Wireless Mouse', 'Electronics', 45, 29.99, 'Ergonomic wireless mouse'],
    ['Office Chair', 'Furniture', 8, 199.99, 'Comfortable office chair'],
    ['Coffee Beans', 'Food', 120, 12.99, 'Premium coffee beans'],
    ['Notebook Set', 'Office Supplies', 200, 8.99, 'Pack of 3 notebooks']
  ];

  const stmt = db.prepare('INSERT INTO products (name, category, quantity, price, description) VALUES (?, ?, ?, ?, ?)');
  sampleProducts.forEach(product => {
    stmt.run(product);
  });
  stmt.finalize();
});

// API Routes
app.get('/api/products', (req, res) => {
  db.all('SELECT * FROM products ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

app.get('/api/products/:id', (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM products WHERE id = ?', [id], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (!row) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    res.json(row);
  });
});

app.post('/api/products', (req, res) => {
  const { name, category, quantity, price, description } = req.body;
  
  if (!name || !category || quantity === undefined || price === undefined) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  db.run(
    'INSERT INTO products (name, category, quantity, price, description) VALUES (?, ?, ?, ?, ?)',
    [name, category, quantity, price, description],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ id: this.lastID, message: 'Product created successfully' });
    }
  );
});

app.put('/api/products/:id', (req, res) => {
  const { id } = req.params;
  const { name, category, quantity, price, description } = req.body;
  
  db.run(
    'UPDATE products SET name = ?, category = ?, quantity = ?, price = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [name, category, quantity, price, description, id],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      if (this.changes === 0) {
        res.status(404).json({ error: 'Product not found' });
        return;
      }
      res.json({ message: 'Product updated successfully' });
    }
  );
});

app.delete('/api/products/:id', (req, res) => {
  const { id } = req.params;
  
  db.run('DELETE FROM products WHERE id = ?', [id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (this.changes === 0) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    res.json({ message: 'Product deleted successfully' });
  });
});

// Dashboard stats
app.get('/api/stats', (req, res) => {
  db.all(`
    SELECT 
      COUNT(*) as total_products,
      SUM(quantity) as total_items,
      COUNT(DISTINCT category) as categories,
      SUM(quantity * price) as total_value
    FROM products
  `, [], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(row[0]);
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
