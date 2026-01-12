const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Database configuration - WE'LL UPDATE THIS LATER
let dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'gold_db'
};

let db;

// Connect to database
async function connectDB() {
  try {
    db = await mysql.createConnection(dbConfig);
    console.log('✅ Connected to database');
    
    // Create tables if they don't exist
    await db.execute(`
      CREATE TABLE IF NOT EXISTS gold_prices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        price_per_gram DECIMAL(10,2) NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await db.execute(`
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        weight DECIMAL(8,3) NOT NULL,
        carat VARCHAR(10) DEFAULT '24K',
        making_charges DECIMAL(5,2) DEFAULT 5.00,
        profit_margin DECIMAL(5,2) DEFAULT 10.00,
        selling_price DECIMAL(10,2) NOT NULL,
        category VARCHAR(100),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Insert sample data
    const [rows] = await db.execute('SELECT * FROM gold_prices LIMIT 1');
    if (rows.length === 0) {
      await db.execute('INSERT INTO gold_prices (price_per_gram) VALUES (3000)');
      console.log('✅ Added default gold price');
    }
    
  } catch (error) {
    console.error('❌ Database error:', error.message);
  }
}

// Routes
app.get('/api/gold-price', async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM gold_prices ORDER BY updated_at DESC LIMIT 1'
    );
    res.json(rows[0] || { price_per_gram: 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/gold-price', async (req, res) => {
  try {
    const { price_per_gram } = req.body;
    
    if (!price_per_gram) {
      return res.status(400).json({ error: 'Price is required' });
    }
    
    // Insert new price
    await db.execute(
      'INSERT INTO gold_prices (price_per_gram) VALUES (?)',
      [price_per_gram]
    );
    
    // Update all products
    const [products] = await db.execute(
      'SELECT * FROM products WHERE is_active = 1'
    );
    
    const updatedProducts = [];
    for (const product of products) {
      // Calculate new price
      const caratFactors = {
        '24K': 1.0, '22K': 0.916, '21K': 0.875, 
        '18K': 0.75, '14K': 0.585
      };
      
      const factor = caratFactors[product.carat] || 1;
      const goldValue = product.weight * price_per_gram * factor;
      const makingCharges = goldValue * (product.making_charges / 100);
      const profit = (goldValue + makingCharges) * (product.profit_margin / 100);
      const newPrice = goldValue + makingCharges + profit;
      
      // Update product
      await db.execute(
        'UPDATE products SET selling_price = ? WHERE id = ?',
        [Math.round(newPrice), product.id]
      );
      
      updatedProducts.push({
        id: product.id,
        name: product.name,
        new_price: Math.round(newPrice)
      });
    }
    
    res.json({
      success: true,
      message: `✅ Gold price updated to ${price_per_gram} EGP`,
      updated_count: updatedProducts.length,
      products: updatedProducts
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/products', async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM products WHERE is_active = 1'
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const { name, weight, carat, making_charges, profit_margin, category } = req.body;
    
    // Get current gold price
    const [priceRows] = await db.execute(
      'SELECT price_per_gram FROM gold_prices ORDER BY updated_at DESC LIMIT 1'
    );
    const goldPrice = priceRows[0]?.price_per_gram || 0;
    
    // Calculate price
    const caratFactors = {
      '24K': 1.0, '22K': 0.916, '21K': 0.875, 
      '18K': 0.75, '14K': 0.585
    };
    
    const factor = caratFactors[carat] || 1;
    const goldValue = weight * goldPrice * factor;
    const makingChargesAmount = goldValue * (making_charges / 100);
    const profit = (goldValue + makingChargesAmount) * (profit_margin / 100);
    const sellingPrice = Math.round(goldValue + makingChargesAmount + profit);
    
    // Insert product
    const [result] = await db.execute(
      `INSERT INTO products 
       (name, weight, carat, making_charges, profit_margin, selling_price, category)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, weight, carat, making_charges, profit_margin, sellingPrice, category]
    );
    
    res.json({
      success: true,
      id: result.insertId,
      selling_price: sellingPrice,
      message: '✅ Product added successfully!'
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: '✅ Online',
    service: 'Gold E-Commerce API',
    timestamp: new Date().toISOString()
  });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  await connectDB();
});
