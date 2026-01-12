// backend/server.js - COMPLETE FILE
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Database configuration for Railway
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'gold_ecommerce',
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3306,
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false
  } : undefined,
  connectTimeout: 60000, // 60 seconds
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

let db;

// Gold Price Calculator
class GoldPriceCalculator {
  static CARAT_FACTORS = {
    '24K': 1.000,
    '22K': 0.9167,
    '21K': 0.875,
    '18K': 0.750,
    '14K': 0.585,
    '10K': 0.417
  };

  static calculatePrice(product, goldPricePerGram) {
    const caratFactor = this.CARAT_FACTORS[product.carat] || 1;
    const goldValue = product.weight * goldPricePerGram * caratFactor;
    const makingCharges = goldValue * (product.making_charges / 100);
    const baseCost = goldValue + makingCharges;
    const sellingPrice = baseCost * (1 + (product.profit_margin / 100));
    
    return {
      goldValue: Math.round(goldValue * 100) / 100,
      makingCharges: Math.round(makingCharges * 100) / 100,
      baseCost: Math.round(baseCost * 100) / 100,
      sellingPrice: Math.round(sellingPrice * 100) / 100
    };
  }
}

// Database Connection with Retry Logic
async function connectDB() {
  console.log('🔗 Attempting database connection...');
  console.log(`📊 Host: ${dbConfig.host}, Database: ${dbConfig.database}`);
  
  const maxRetries = 5;
  let retryCount = 0;
  
  while (retryCount < maxRetries) {
    try {
      console.log(`Attempt ${retryCount + 1}/${maxRetries}...`);
      
      db = await mysql.createConnection(dbConfig);
      
      // Test connection
      await db.execute('SELECT 1');
      console.log('✅ Database connected successfully!');
      
      // Create tables if they don't exist
      await createTables();
      
      // Initialize with default data if needed
      await initializeDefaultData();
      
      return; // Success, exit retry loop
      
    } catch (error) {
      retryCount++;
      console.error(`❌ Connection attempt ${retryCount} failed:`, error.message);
      
      if (retryCount === maxRetries) {
        console.error('💥 Maximum retry attempts reached. Please check:');
        console.error('   1. Railway MySQL service is running');
        console.error('   2. Database credentials are correct');
        console.error('   3. IP whitelisting (Railway allows all by default)');
        throw error;
      }
      
      // Wait before retrying (exponential backoff)
      const delay = Math.pow(2, retryCount) * 1000;
      console.log(`⏳ Retrying in ${delay/1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Create necessary tables
async function createTables() {
  console.log('📋 Checking/Creating tables...');
  
  const tables = [
    `CREATE TABLE IF NOT EXISTS gold_prices (
      id INT AUTO_INCREMENT PRIMARY KEY,
      price_per_gram DECIMAL(10,2) NOT NULL,
      carat VARCHAR(10) DEFAULT '24K',
      currency VARCHAR(3) DEFAULT 'EGP',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    
    `CREATE TABLE IF NOT EXISTS products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      weight DECIMAL(8,3) NOT NULL,
      carat VARCHAR(10) DEFAULT '24K',
      making_charges DECIMAL(5,2) DEFAULT 5.00,
      profit_margin DECIMAL(5,2) DEFAULT 10.00,
      selling_price DECIMAL(10,2) NOT NULL,
      category VARCHAR(100),
      stock_quantity INT DEFAULT 0,
      images TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_category (category),
      INDEX idx_carat (carat)
    )`,
    
    `CREATE TABLE IF NOT EXISTS price_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      product_id INT,
      old_price DECIMAL(10,2),
      new_price DECIMAL(10,2),
      gold_price_per_gram DECIMAL(10,2),
      changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    )`
  ];
  
  for (const query of tables) {
    try {
      await db.execute(query);
      console.log('✅ Table check/creation successful');
    } catch (error) {
      console.error('❌ Error creating table:', error.message);
    }
  }
}

// Initialize with default data
async function initializeDefaultData() {
  try {
    // Check if gold_prices has data
    const [priceRows] = await db.execute('SELECT COUNT(*) as count FROM gold_prices');
    if (priceRows[0].count === 0) {
      await db.execute(
        'INSERT INTO gold_prices (price_per_gram) VALUES (?)',
        [3000.00]
      );
      console.log('💰 Default gold price inserted: 3000 EGP/g');
    }
    
    // Check if products has data
    const [productRows] = await db.execute('SELECT COUNT(*) as count FROM products');
    if (productRows[0].count === 0) {
      console.log('📦 No products found. Adding sample products...');
      
      const sampleProducts = [
        ['24K Gold Necklace', 'Premium 24K gold necklace', 10.5, '24K', 7.5, 15.0, 'Necklace'],
        ['22K Gold Bracelet', 'Elegant 22K gold bracelet', 8.2, '22K', 5.0, 12.0, 'Bracelet'],
        ['18K Gold Ring', 'Beautiful 18K gold ring', 3.5, '18K', 10.0, 20.0, 'Ring'],
        ['21K Gold Earrings', 'Stylish 21K gold earrings', 5.0, '21K', 8.0, 18.0, 'Earrings']
      ];
      
      // Get current gold price
      const [currentPrice] = await db.execute(
        'SELECT price_per_gram FROM gold_prices ORDER BY updated_at DESC LIMIT 1'
      );
      const goldPrice = currentPrice[0]?.price_per_gram || 3000;
      
      for (const product of sampleProducts) {
        const priceInfo = GoldPriceCalculator.calculatePrice(
          {
            weight: product[2],
            carat: product[3],
            making_charges: product[4],
            profit_margin: product[5]
          },
          goldPrice
        );
        
        await db.execute(
          `INSERT INTO products 
           (name, description, weight, carat, making_charges, profit_margin, selling_price, category)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [...product.slice(0, -1), priceInfo.sellingPrice, product[6]]
        );
      }
      
      console.log('✅ Sample products added');
    }
    
  } catch (error) {
    console.error('❌ Error initializing default data:', error.message);
  }
}

// API Endpoints

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: '✅ Online',
    service: 'Gold E-Commerce API',
    database: db ? 'Connected' : 'Disconnected',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Get current gold price
app.get('/api/gold-price', async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM gold_prices ORDER BY updated_at DESC LIMIT 1'
    );
    res.json(rows[0] || { price_per_gram: 0, carat: '24K', currency: 'EGP' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update gold price (ADMIN ONLY)
app.post('/api/gold-price', async (req, res) => {
  try {
    const { price_per_gram, carat = '24K' } = req.body;
    
    if (!price_per_gram || isNaN(price_per_gram)) {
      return res.status(400).json({ error: 'Valid price is required' });
    }
    
    // Insert new price
    await db.execute(
      'INSERT INTO gold_prices (price_per_gram, carat) VALUES (?, ?)',
      [parseFloat(price_per_gram), carat]
    );
    
    // Get all active products
    const [products] = await db.execute(
      'SELECT * FROM products WHERE is_active = TRUE'
    );
    
    const updateResults = [];
    
    for (const product of products) {
      const priceInfo = GoldPriceCalculator.calculatePrice(
        product,
        parseFloat(price_per_gram)
      );
      
      // Save to price history
      await db.execute(
        'INSERT INTO price_history (product_id, old_price, new_price, gold_price_per_gram) VALUES (?, ?, ?, ?)',
        [product.id, product.selling_price, priceInfo.sellingPrice, price_per_gram]
      );
      
      // Update product price
      await db.execute(
        'UPDATE products SET selling_price = ?, updated_at = NOW() WHERE id = ?',
        [priceInfo.sellingPrice, product.id]
      );
      
      updateResults.push({
        id: product.id,
        name: product.name,
        old_price: product.selling_price,
        new_price: priceInfo.sellingPrice,
        change: ((priceInfo.sellingPrice - product.selling_price) / product.selling_price * 100).toFixed(2) + '%'
      });
    }
    
    res.json({
      success: true,
      message: `Gold price updated to ${price_per_gram} EGP/g`,
      updated_products: updateResults.length,
      details: updateResults
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all products
app.get('/api/products', async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM products WHERE is_active = TRUE ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single product
app.get('/api/products/:id', async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM products WHERE id = ? AND is_active = TRUE',
      [req.params.id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add new product (ADMIN)
app.post('/api/products', async (req, res) => {
  try {
    const { name, weight, carat, making_charges, profit_margin, category, description, stock_quantity } = req.body;
    
    // Validate required fields
    if (!name || !weight || !carat) {
      return res.status(400).json({ 
        error: 'Name, weight, and carat are required' 
      });
    }
    
    // Get current gold price
    const [priceRows] = await db.execute(
      'SELECT price_per_gram FROM gold_prices ORDER BY updated_at DESC LIMIT 1'
    );
    const goldPrice = priceRows[0]?.price_per_gram || 3000;
    
    // Calculate selling price
    const priceInfo = GoldPriceCalculator.calculatePrice(
      { weight, carat, making_charges: making_charges || 5, profit_margin: profit_margin || 10 },
      goldPrice
    );
    
    // Insert product
    const [result] = await db.execute(
      `INSERT INTO products 
       (name, description, weight, carat, making_charges, profit_margin, selling_price, category, stock_quantity)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        description || '',
        weight,
        carat,
        making_charges || 5.00,
        profit_margin || 10.00,
        priceInfo.sellingPrice,
        category || 'Uncategorized',
        stock_quantity || 0
      ]
    );
    
    res.json({
      success: true,
      message: 'Product added successfully',
      id: result.insertId,
      selling_price: priceInfo.sellingPrice,
      price_breakdown: priceInfo
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update product (ADMIN)
app.put('/api/products/:id', async (req, res) => {
  try {
    const { name, weight, carat, making_charges, profit_margin, category, description, stock_quantity, is_active } = req.body;
    
    // Get current product
    const [productRows] = await db.execute(
      'SELECT * FROM products WHERE id = ?',
      [req.params.id]
    );
    
    if (productRows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    const product = productRows[0];
    
    // If weight, carat, making_charges, or profit_margin changed, recalculate price
    let sellingPrice = product.selling_price;
    
    if (weight || carat || making_charges || profit_margin) {
      const [priceRows] = await db.execute(
        'SELECT price_per_gram FROM gold_prices ORDER BY updated_at DESC LIMIT 1'
      );
      const goldPrice = priceRows[0]?.price_per_gram || 3000;
      
      const priceInfo = GoldPriceCalculator.calculatePrice(
        {
          weight: weight || product.weight,
          carat: carat || product.carat,
          making_charges: making_charges || product.making_charges,
          profit_margin: profit_margin || product.profit_margin
        },
        goldPrice
      );
      
      sellingPrice = priceInfo.sellingPrice;
      
      // Save to price history
      await db.execute(
        'INSERT INTO price_history (product_id, old_price, new_price, gold_price_per_gram) VALUES (?, ?, ?, ?)',
        [product.id, product.selling_price, sellingPrice, goldPrice]
      );
    }
    
    // Update product
    await db.execute(
      `UPDATE products SET
       name = COALESCE(?, name),
       description = COALESCE(?, description),
       weight = COALESCE(?, weight),
       carat = COALESCE(?, carat),
       making_charges = COALESCE(?, making_charges),
       profit_margin = COALESCE(?, profit_margin),
       selling_price = ?,
       category = COALESCE(?, category),
       stock_quantity = COALESCE(?, stock_quantity),
       is_active = COALESCE(?, is_active),
       updated_at = NOW()
       WHERE id = ?`,
      [
        name, description, weight, carat, making_charges, profit_margin,
        sellingPrice, category, stock_quantity, is_active, req.params.id
      ]
    );
    
    res.json({
      success: true,
      message: 'Product updated successfully',
      new_price: sellingPrice
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get price history for a product
app.get('/api/products/:id/price-history', async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT ph.*, p.name as product_name 
       FROM price_history ph
       JOIN products p ON ph.product_id = p.id
       WHERE ph.product_id = ?
       ORDER BY ph.changed_at DESC
       LIMIT 50`,
      [req.params.id]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search products
app.get('/api/search/products', async (req, res) => {
  try {
    const { q, category, min_price, max_price, carat } = req.query;
    
    let query = 'SELECT * FROM products WHERE is_active = TRUE';
    const params = [];
    
    if (q) {
      query += ' AND (name LIKE ? OR description LIKE ?)';
      params.push(`%${q}%`, `%${q}%`);
    }
    
    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }
    
    if (carat) {
      query += ' AND carat = ?';
      params.push(carat);
    }
    
    if (min_price) {
      query += ' AND selling_price >= ?';
      params.push(parseFloat(min_price));
    }
    
    if (max_price) {
      query += ' AND selling_price <= ?';
      params.push(parseFloat(max_price));
    }
    
    query += ' ORDER BY created_at DESC';
    
    const [rows] = await db.execute(query, params);
    res.json(rows);
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get categories
app.get('/api/categories', async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND is_active = TRUE ORDER BY category'
    );
    res.json(rows.map(row => row.category));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Database status endpoint
app.get('/api/db-status', async (req, res) => {
  try {
    const [tables] = await db.execute(
      `SELECT table_name, table_rows 
       FROM information_schema.tables 
       WHERE table_schema = ?`,
      [dbConfig.database]
    );
    
    const [goldPrice] = await db.execute('SELECT * FROM gold_prices ORDER BY updated_at DESC LIMIT 1');
    const [productCount] = await db.execute('SELECT COUNT(*) as count FROM products');
    const [activeProductCount] = await db.execute('SELECT COUNT(*) as count FROM products WHERE is_active = TRUE');
    
    res.json({
      database: dbConfig.database,
      connection: 'Connected',
      tables: tables,
      current_gold_price: goldPrice[0],
      total_products: productCount[0].count,
      active_products: activeProductCount[0].count
    });
    
  } catch (error) {
    res.status(500).json({ 
      database: dbConfig.database,
      connection: 'Error',
      error: error.message 
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err.stack);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
async function startServer() {
  try {
    await connectDB();
    
    app.listen(PORT, () => {
      console.log(`
      🚀 Gold E-Commerce API Server Started
      =====================================
      📍 Port: ${PORT}
      🌐 Environment: ${process.env.NODE_ENV || 'development'}
      🗄️  Database: ${dbConfig.database}@${dbConfig.host}
      📊 API: http://localhost:${PORT}
      🏥 Health: http://localhost:${PORT}/health
      🔍 DB Status: http://localhost:${PORT}/api/db-status
      💰 Gold Price: http://localhost:${PORT}/api/gold-price
      🛍️  Products: http://localhost:${PORT}/api/products
      =====================================
      `);
    });
    
  } catch (error) {
    console.error('💥 Failed to start server:', error.message);
    process.exit(1);
  }
}

startServer();
