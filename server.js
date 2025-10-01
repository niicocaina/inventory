const express = require('express');
const { Pool } = require('pg'); // <-- Reemplazo de sqlite3
const cors = require('cors');
const path = require('path');

const app = express();
// Se recomienda usar PORT 3000+ o 80. Usaremos 80 como en tu entorno.
const PORT = process.env.PORT || 80; 

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configuración de PostgreSQL (Usa variables de entorno o valores por defecto)
const db = new Pool({
    user: process.env.PGUSER || 'postgres',
    host: process.env.PGHOST || 'localhost',
    database: process.env.PGDATABASE || 'inventory',
    password: process.env.PGPASSWORD || 'postgres',
    port: process.env.PGPORT || 5432
});

// --- INICIALIZACIÓN DE LA BASE DE DATOS ---
async function initDB() {
    // Conexión para verificar el estado
    await db.query(`SELECT 1+1`); 

    // 1. Creación de la tabla (usando SERIAL para ID y TEXT/TIMESTAMP para consistencia con PG)
    await db.query(`CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        price REAL NOT NULL,
        description TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )`);

    // 2. Inserción de datos de ejemplo
    const sampleProducts = [
        ['Laptop Pro', 'Electronics', 15, 1299.99, 'High-performance laptop'],
        ['Wireless Mouse', 'Electronics', 45, 29.99, 'Ergonomic wireless mouse'],
        ['Office Chair', 'Furniture', 8, 199.99, 'Comfortable office chair'],
        ['Coffee Beans', 'Food', 120, 12.99, 'Premium coffee beans'],
        ['Notebook Set', 'Office Supplies', 200, 8.99, 'Pack of 3 notebooks']
    ];

    for (const product of sampleProducts) {
        // Usamos ON CONFLICT DO NOTHING para evitar duplicados en cada reinicio
        await db.query(
            'INSERT INTO products (name, category, quantity, price, description) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
            product
        );
    }
}

// --- API ROUTES (Migración de callbacks a async/await) ---

// Obtener todos los productos
app.get('/api/products', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM products ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Obtener producto por ID
app.get('/api/products/:id', async (req, res) => {
    const { id } = req.params;
    try {
        // En PG, usamos $1, $2, etc., en lugar de ?
        const result = await db.query('SELECT * FROM products WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Product not found' });
            return;
        }
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Crear nuevo producto
app.post('/api/products', async (req, res) => {
    const { name, category, quantity, price, description } = req.body;
    
    if (!name || !category || quantity === undefined || price === undefined) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
    }

    try {
        // Usamos RETURNING id para obtener el ID recién creado (similar a this.lastID de SQLite)
        const result = await db.query(
            'INSERT INTO products (name, category, quantity, price, description) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [name, category, quantity, price, description]
        );
        res.json({ id: result.rows[0].id, message: 'Product created successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Actualizar producto
app.put('/api/products/:id', async (req, res) => {
    const { id } = req.params;
    const { name, category, quantity, price, description } = req.body;

    try {
        const result = await db.query(
            'UPDATE products SET name = $1, category = $2, quantity = $3, price = $4, description = $5, updated_at = CURRENT_TIMESTAMP WHERE id = $6',
            [name, category, quantity, price, description, id]
        );
        // PG usa rowCount para saber cuántas filas fueron afectadas (similar a this.changes de SQLite)
        if (result.rowCount === 0) { 
            res.status(404).json({ error: 'Product not found' });
            return;
        }
        res.json({ message: 'Product updated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Eliminar producto
app.delete('/api/products/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const result = await db.query('DELETE FROM products WHERE id = $1', [id]);
        
        if (result.rowCount === 0) {
            res.status(404).json({ error: 'Product not found' });
            return;
        }
        res.json({ message: 'Product deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Estadísticas del Dashboard
app.get('/api/stats', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT 
                COUNT(*) as total_products,
                SUM(quantity) as total_items,
                COUNT(DISTINCT category) as categories,
                SUM(quantity * price) as total_value
            FROM products
        `);
        // La consulta de estadísticas siempre devuelve una fila, por eso usamos result.rows[0]
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- FUNCIÓN DE INICIO DEL SERVIDOR (CON MANEJO DE ERRORES) ---
async function startServer() {
    try {
        console.log('Attempting to initialize database...');
        // Espera a que la base de datos se configure (o falle)
        await initDB(); 
        console.log('Database initialized successfully.');

        // Solo escucha el puerto si la DB está lista
        app.listen(PORT, () => {
            // Nota: Aquí se usa ${PORT} para mostrar el puerto real, que es 80 por defecto.
            console.log(`Server running on port ${PORT}`);
        });
    } catch (err) {
        console.error('--- ERROR: Could not start server due to DB connection failure ---');
        // El error más probable es la conexión a la base de datos
        console.error('Check your PGHOST, PGUSER, PGPASSWORD, and that PostgreSQL is running.');
        console.error('Error Details:', err.message);
        // Cierra el proceso para evitar que la aplicación se ejecute sin base de datos
        process.exit(1); 
    }
}

// Iniciar la aplicación
startServer();
